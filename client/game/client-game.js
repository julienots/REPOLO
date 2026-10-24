// Partie côté client : prédiction du joueur local, interpolation des autres entités,
// traduction des événements serveur en sons / bulles / effets, interface en jeu.
import { deserializeMap } from '../../shared/map/generator.js';
import { T, hasLineOfSight } from '../../shared/map/grid.js';
import { stepMovement } from '../../shared/sim/movement.js';
import { SIM } from '../../shared/config/game.js';
import { ITEMS } from '../../shared/data/items.js';
import { MONSTERS } from '../../shared/data/monsters.js';
import { EQUIPMENT } from '../../shared/data/equipment.js';
import { EVENT_CATEGORIES } from '../../shared/data/events.js';
import { COSMETICS, cosmeticById } from '../../shared/data/cosmetics.js';
import { angleDiff } from '../../shared/util/math.js';
import { keyName } from '../input/input.js';

const INTERP_DELAY = 110; // ms
const $ = (id) => document.getElementById(id);

export class ClientGame {
  constructor(app, msg) {
    this.app = app;
    this.info = msg.info;
    this.myId = msg.you;
    this.map = deserializeMap(msg.info.map);
    this.grid = this.map.grid;
    this.roster = new Map(msg.info.roster.map((r) => [r.id, r]));
    this.snaps = [];
    this.last = null;
    this.me = null;
    this.time = 0;
    this.bubbles = [];
    this.rings = [];
    this.sendT = 0;
    this.doorBumpT = 0;
    this.hudT = 0;
    this.light = true;
    this.monsterMem = new Map();
    this.ended = false;
    this.paused = false;
    this.feedEls = [];
    this.chatEls = [];
    this.phase = new Map();
    this.emoteIndex = 0;
    this.lastHp = SIM.maxHp;
    this.lastState = 'alive';
    this.app.renderer.setMap(this.map);
    this.app.audio.grid = this.grid;
    this.app.audio.startAmbience(this.map.theme);
    this.initHud();
    const brief = msg.info.mission;
    if (!msg.resumed) {
      this.feed(`${brief.name} — ${brief.brief}`, 'event');
      this.feed(`Quota : ${brief.quota} cr · Variante : ${brief.variant}${brief.variantDesc ? ' (' + brief.variantDesc + ')' : ''}`, 'info');
      const side = msg.info.side.map((s) => s.name).join(' · ');
      if (side) this.feed(`Bonus : ${side}`, 'info');
      this.center('Récupérez le butin. Ramenez-le au fourgon.', 4);
      if (app.profile.data.stats.missions < 3) this.scheduleTips();
    }
  }

  // Astuces pour les premières missions (prise en main progressive)
  scheduleTips() {
    const touch = this.app.touchMode;
    const k = (a) => (touch ? '' : ` (${keyName(this.app.settings.keys[a][0])})`);
    const tips = [
      [6, `Astuce : approchez un objet et utilisez l'action${k('interact')} pour le ramasser. Déposez-le dans la zone jaune du fourgon.`],
      [18, `Astuce : courir${k('sprint')} est bruyant. Le mode discret${k('sneak')} est presque silencieux.`],
      [32, 'Astuce : les créatures arrivent bientôt. Écoutez : chacune a un son reconnaissable.'],
      [50, `Astuce : les objets lourds vont plus vite à deux. Les fragiles perdent de la valeur à chaque choc.`],
      [75, `Astuce : coincé ? Cachez-vous dans un casier${k('interact')}. Ou lancez un objet${k('throw')} sur une créature pour l'étourdir.`],
    ];
    this.tipTimers = tips.map(([t, text]) => setTimeout(() => !this.ended && this.feed(text, 'private'), t * 1000));
  }

  initHud() {
    const radio = (this.roster.get(this.myId)?.equipment === 'radio');
    $('hud-radio-row').style.display = radio ? '' : 'none';
    $('hud-feed').innerHTML = ''; $('game-chat-log').innerHTML = ''; $('hud-events').innerHTML = '';
    $('hud-center').textContent = '';
  }

  // ------------------------------------------------------------ RÉSEAU
  onSnapshot(s) {
    const now = performance.now();
    this.snaps.push({ at: now, s });
    if (this.snaps.length > 12) this.snaps.shift();
    const prev = this.last;
    this.last = s;
    this.time = s.time;
    const meS = s.players.find((p) => p.id === this.myId);
    if (meS) this.syncMe(meS);
    if (s.tiles?.length) for (const [i, v] of s.tiles) { this.grid.tiles[i] = v; this.app.renderer.updateTile(i); }
    s.doors.split('').forEach((c, k) => { const i = this.map.doors[k]; this.grid.doorOpen[i] = c === '0' ? 0 : 1; });
    this.doorString = s.doors;
    this.lampString = s.lamps;
    this.handleNoises(s.noises);
    this.handleMsgs(s.msgs);
    this.monsterCues(s.monsters, prev);
    if (s.mods.cf && Math.random() < 0.7 && this.me) this.app.renderer.spawn('confetti', this.me.x + (Math.random() - 0.5) * 8, this.me.y - 4, 6);
  }

  syncMe(ps) {
    const me = this.me;
    if (!me) {
      this.me = { ...ps, x: ps.x, y: ps.y, vx: 0, vy: 0, angle: ps.a, kbSeq: ps.kb[0], tp: ps.tp, stamina: ps.s, state: ps.st };
      this.light = !!ps.l;
      return;
    }
    // téléportation (monte-charge, casier, recalage) : on se cale sur le serveur
    if (ps.tp !== me.tp || ps.h || ps.st === 'extracted') { me.x = ps.x; me.y = ps.y; me.vx = 0; me.vy = 0; me.tp = ps.tp; }
    // recul (coup, onde de choc)
    if (ps.kb[0] !== me.kbSeq) { me.kbSeq = ps.kb[0]; me.vx += ps.kb[1]; me.vy += ps.kb[2]; }
    // écart trop grand : correction douce
    const err = Math.hypot(ps.x - me.x, ps.y - me.y);
    if (err > 2.5) { me.x = ps.x; me.y = ps.y; }
    Object.assign(me, { st: ps.st, state: ps.st, hp: ps.hp, c: ps.c, b: ps.b, rb: ps.rb, h: ps.h, sm: ps.sm, fr: ps.fr, ch: ps.ch, eq: ps.eq, dn: ps.dn, chan: ps.chan, bot: ps.bot, stamina: ps.s, fl: ps.fl });
    if (ps.b <= 0) this.light = false;
    if (ps.hp < this.lastHp && ps.st !== 'dead') { this.hurtFx(); }
    this.lastHp = ps.hp;
    if (ps.st !== this.lastState) {
      if (ps.st === 'downed') this.center('VOUS ÊTES À TERRE — appelez à l\'aide !', 3);
      if (ps.st === 'dead') { this.center('Vous êtes mort. Vous êtes un fantôme : flottez, observez, faites « Bouh ! ».', 5); }
      if (ps.st === 'alive' && this.lastState === 'downed') this.center('Relevé !', 1.5);
      if (ps.st === 'extracted') this.center('Vous êtes dans le fourgon. Ouf.', 3);
      this.lastState = ps.st;
    }
  }

  handleNoises(list) {
    const a = this.app.audio;
    for (const n of list) {
      const own = n.s === this.myId;
      if (this.app.settings.visualSounds) this.rings.push({ x: n.x, y: n.y, l: n.l, t: this.time, monster: String(n.s).startsWith('m') });
      let name = n.t;
      if (name === 'voice' || name === 'scream') {
        // les vraies voix passent par le chat vocal ; on ne joue que les imitations
        if (!n.mi) continue;
        name = 'voice';
      }
      if (name === 'chat') name = 'chat';
      if (name === 'kaching' || name === 'siren' || name === 'fanfare') continue; // joués via sfx dédiés
      a.play(name, { x: n.x, y: n.y, loud: n.l, detune: n.dt, vol: own ? 0.45 : 1, minGap: name.startsWith('step') ? 0.05 : 0, key: n.s });
      if (n.t === 'impact' && n.l > 6) this.app.renderer.spawn('dust', n.x, n.y, 4);
    }
    this.rings = this.rings.filter((r) => this.time - r.t < 1.1);
  }

  handleMsgs(list) {
    const a = this.app.audio, r = this.app.renderer;
    for (const m of list) {
      switch (m.k) {
        case 'bubble': {
          const src = this.entityPos(m.id) || (m.x !== undefined ? { x: m.x, y: m.y } : null);
          if (!src) break;
          const ro = this.roster.get(m.id);
          let speaker = ro?.name || '';
          if (m.kind === 'mimic') speaker = '???';
          if (m.kind === 'disguised') { const mon = this.last?.monsters.find((mm) => mm.id === m.id); speaker = mon?.ex?.as ? (this.roster.get(mon.ex.as)?.name || '???') : '???'; }
          if (m.kind === 'monster' || m.kind === 'rescuer') { const mon = this.last?.monsters.find((mm) => mm.id === m.id); speaker = mon ? MONSTERS[mon.k]?.name : ''; }
          const d = this.me ? Math.hypot(src.x - this.me.x, src.y - this.me.y) : 0;
          const loudKinds = m.kind === 'monster';
          if (d > (loudKinds ? 22 : 15)) break;
          this.bubbles.push({ id: m.id, x: src.x, y: src.y, text: m.text, kind: m.kind, speaker, t: this.time, life: Math.min(6, 2 + m.text.length / 14) });
          if (m.kind === 'bot' && d < 12) {
            const prof = ro?.botProfile;
            const voiceIdx = [...this.roster.keys()].indexOf(m.id);
            a.speak(m.text, { vol: Math.pow(1 - d / 12, 1.2), pitch: { panique: 1.5, comique: 1.25, courageux: 0.85, prudent: 0.95, cupide: 1.05, protecteur: 0.9 }[prof] || 1, rate: prof === 'panique' ? 1.35 : 1.1, voiceIndex: voiceIdx });
          }
          if (m.kind === 'monster' && d < 18) {
            const mon = this.last?.monsters.find((mm) => mm.id === m.id);
            if (mon?.k === 'inspecteur') a.play('inspecteur_whistle', { x: src.x, y: src.y, loud: 12 });
            if (mon?.k === 'sauveteur') a.play('sauveteur_reveal', { x: src.x, y: src.y, loud: 12 });
            if (mon?.k === 'invite') a.play('invite_shriek', { x: src.x, y: src.y, loud: 10 });
            if (mon?.k === 'demenageur') a.play('demenageur_roar', { x: src.x, y: src.y, loud: 14 });
            if (mon?.k === 'berger') a.play('berger_bell', { x: src.x, y: src.y, loud: 8 });
          }
          if (m.kind === 'ghost' && this.me?.state === 'dead') this.bubbles[this.bubbles.length - 1].life = 2;
          break;
        }
        case 'chat': this.chatLine(m.name, m.text, m.dead); if (m.dead && this.me?.state !== 'dead') break; { const src = this.entityPos(m.id); if (src && !m.dead) this.bubbles.push({ id: m.id, x: src.x, y: src.y, text: m.text, kind: 'chat', speaker: m.name, t: this.time, life: 4 }); } break;
        case 'announce': this.feed(m.text, m.kind); if (m.kind === 'event') { a.play('stinger', { vol: 0.5 }); } if (m.kind === 'danger') a.play('siren', { vol: 0.35 }); break;
        case 'private': if (m.to === this.myId) this.feed(m.text, 'private'); break;
        case 'sfx': {
          a.play(m.name, { x: m.x, y: m.y, loud: 10 });
          if (m.name === 'kaching') r.spawn('coin', m.x, m.y, 8);
          if (m.name === 'break') r.spawn('shard', m.x, m.y, 10);
          if (m.name === 'smash' || m.name === 'wallbreak') { r.spawn('dust', m.x, m.y, 14); this.shakeNear(m.x, m.y, 6); }
          if (m.name === 'fanfare') r.spawn('confetti', m.x, m.y - 2, 40);
          if (m.name === 'hit') r.spawn('spark', m.x, m.y, 8);
          break;
        }
        case 'shake': this.shakeNear(m.x, m.y, m.amp * 3); break;
        case 'highlight': break;
        case 'end': this.ended = true; a.play(m.success ? 'celebrate' : 'fail', { vol: 0.8 }); if (m.success) r.spawn('confetti', this.me?.x || 0, (this.me?.y || 0) - 3, 60); break;
      }
    }
  }

  shakeNear(x, y, amp) {
    if (!this.me) return;
    const d = Math.hypot(x - this.me.x, y - this.me.y);
    if (d < 12) this.app.renderer.shake(amp * (1 - d / 12));
  }

  // Signatures sonores des créatures (indices pour les joueurs attentifs).
  monsterCues(monsters, prev) {
    const a = this.app.audio;
    let nearest = Infinity;
    for (const m of monsters) {
      const mem = this.monsterMem.get(m.id) || { bellT: 0, keysT: 0, skitT: 0 };
      const d = this.me ? Math.hypot(m.x - this.me.x, m.y - this.me.y) : 99;
      const disguised = (m.k === 'invite' && m.ex?.as) || (m.k === 'sauveteur' && m.ex?.disguised);
      if (!disguised && m.s !== 'rest' && m.s !== 'dormant') nearest = Math.min(nearest, d);
      if (mem.click !== undefined && m.ex?.click !== mem.click) a.play('sourdine_click', { x: m.x, y: m.y, loud: 7, key: m.id });
      if (mem.creak !== undefined && m.ex?.creak !== mem.creak) a.play('mannequine_creak', { x: m.x, y: m.y, loud: 9, key: m.id });
      if (mem.stomp !== undefined && m.ex?.stomp !== mem.stomp) { a.play('demenageur_stomp', { x: m.x, y: m.y, loud: m.s === 'charge' ? 14 : 9, key: m.id }); if (d < 7) this.app.renderer.shake(m.s === 'charge' ? 3 : 1); }
      if (m.k === 'berger' && this.time > mem.bellT) { mem.bellT = this.time + 1.6; a.play('berger_bell', { x: m.x, y: m.y, loud: 3 + (m.ex?.bell || 0) * 2.5, key: m.id }); }
      if (m.k === 'inspecteur' && m.mv && this.time > mem.keysT) { mem.keysT = this.time + 2.2; a.play('inspecteur_keys', { x: m.x, y: m.y, loud: 6, key: m.id }); }
      if (m.k === 'echo' && m.mv && this.time > mem.skitT) { mem.skitT = this.time + 1.5 + Math.random() * 2; a.play('echo_skitter', { x: m.x, y: m.y, loud: 5, key: m.id }); }
      const hunting = ['chase', 'charge', 'lunge', 'reveal'].includes(m.s);
      if (hunting && mem.s !== m.s && d < 16) {
        if (m.k !== 'mannequine') a.play('stinger', { vol: 0.7 * (1 - d / 16) + 0.2 });
        if (!this.app.profile.data.bestiary[m.k]) this.app.profile.data.bestiary[m.k] = 0;
      }
      if (m.k === 'demenageur' && m.s === 'stunned' && mem.s !== 'stunned') a.play('bonk', { x: m.x, y: m.y, loud: 12 });
      Object.assign(mem, { click: m.ex?.click, creak: m.ex?.creak, stomp: m.ex?.stomp, s: m.s });
      this.monsterMem.set(m.id, mem);
    }
    this.heartbeat = nearest < 9 ? 1 - nearest / 9 : 0;
  }

  entityPos(id) {
    if (!this.last) return null;
    if (id === this.myId && this.me) return this.me;
    return this.last.players.find((p) => p.id === id) || this.last.monsters.find((m) => m.id === id) || null;
  }

  // ------------------------------------------------------------ IMAGE
  frame(dt) {
    if (!this.last || !this.me) return;
    const app = this.app, input = app.input;
    const me = this.me;
    const { pressed, released } = input.consume();
    if (!this.paused) for (const a of pressed) this.onPress(a);
    for (const a of released) this.onRelease(a);
    const mv = this.paused ? { mx: 0, my: 0, mode: 'walk' } : input.sample();

    // visée
    const r = app.renderer;
    if (input.lastDevice === 'touch') {
      if (input.touchAim.angle !== null && input.touchAim.active) me.angle = input.touchAim.angle;
      else if (Math.hypot(mv.mx, mv.my) > 0.2) me.angle = Math.atan2(mv.my, mv.mx);
    } else if (input.gp?.aim !== null && input.gp?.aim !== undefined) me.angle = input.gp.aim;
    else if (input.lastDevice === 'gamepad') { if (Math.hypot(mv.mx, mv.my) > 0.3) me.angle = Math.atan2(mv.my, mv.mx); }
    else if (input.mouse.inside && r.ox !== undefined) {
      const w = r.screenToWorld(input.mouse.x, input.mouse.y);
      me.angle = Math.atan2(w.y - me.y, w.x - me.x);
    }
    // talkie / micro maintenus à la manette
    if (input.gp) { app.voice.setPtt(input.isDown('talk')); app.voice.setRadio(input.isDown('radio')); }

    // déplacement prédit
    const canMove = (me.st === 'alive' || me.st === 'downed' || me.st === 'dead') && !me.h && !me.bot;
    if (canMove) {
      const px = me.x, py = me.y;
      stepMovement(this.grid, me, { ...mv }, { speedMul: me.sm ?? 1, friction: me.fr ?? 1 }, dt);
      // porte poussée en marchant
      this.doorBumpT -= dt;
      const len = Math.hypot(mv.mx, mv.my);
      if (len > 0.2 && me.st === 'alive' && this.doorBumpT <= 0 && Math.hypot(me.x - px, me.y - py) < 0.5 * dt * SIM.walkSpeed) {
        const tx = Math.floor(me.x + (mv.mx / len) * 0.6), ty = Math.floor(me.y + (mv.my / len) * 0.6);
        if (this.grid.get(tx, ty) === T.DOOR && !this.grid.doorOpen[this.grid.idx(tx, ty)]) {
          this.doorBumpT = 0.4;
          app.transport.send({ t: 'act', a: 'door', x: tx, y: ty });
        }
      }
      if (me.st === 'alive' && mv.mode === 'sprint' && len > 0.1) me.stamina = Math.max(0, me.stamina - SIM.staminaDrain * dt);
    } else if (me.bot) {
      const ps = this.last.players.find((p) => p.id === this.myId);
      if (ps) { me.x = ps.x; me.y = ps.y; me.angle = ps.a; }
    }
    me.mode = mv.mode;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.05;
      app.transport.send({ t: 'st', x: Math.round(me.x * 1000) / 1000, y: Math.round(me.y * 1000) / 1000, a: Math.round(me.angle * 100) / 100, l: this.light, m: mv.mode, tp: me.tp });
    }

    // interpolation des autres
    const view = this.buildView(dt);
    app.audio.setListener(me.x, me.y);
    app.audio.heartbeat(this.heartbeat * (me.st === 'alive' ? 1 : 0.4));
    r.updateParticles(dt);
    r.render(view);
    app.voice.update({ inGame: true, me: { x: me.x, y: me.y, st: me.st }, players: view.playerMap, grid: this.grid, mods: this.last.mods, myRadio: me.eq === 'radio' && me.rb > 0 });
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHud(view); }
    this.updateFeed();
  }

  buildView(dt) {
    const now = performance.now() - INTERP_DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].at <= now && this.snaps[i + 1].at >= now) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    const span = b.at - a.at;
    const k = span > 0 ? Math.max(0, Math.min(1, (now - a.at) / span)) : 1;
    const lerp = (x0, x1) => x0 + (x1 - x0) * k;
    const lerpA = (a0, a1) => a0 + angleDiff(a0, a1) * k;
    const mapA = (arr) => new Map(arr.map((e) => [e.id, e]));
    const pa = mapA(a.s.players), ma = mapA(a.s.monsters), ia = mapA(a.s.items);
    const s = b.s;
    const me = this.me;
    const players = s.players.map((p) => {
      const ro = this.roster.get(p.id) || {};
      if (!this.phase.has(p.id)) this.phase.set(p.id, Math.random() * 10);
      const base = { ...p, name: ro.name || '?', cos: ro.cosmetics || {}, phase: this.phase.get(p.id), vl: p.id === this.myId ? (this.app.voice.transmitting ? this.app.voice.level : 0) : Math.max(p.v, this.app.voice.peerLevel(p.id)) };
      if (p.id === this.myId) return { ...base, x: me.x, y: me.y, a: me.angle, l: this.light && me.b > 0 ? 1 : 0, sp: Math.hypot(me.vx, me.vy) };
      const o = pa.get(p.id);
      if (o && Math.hypot(o.x - p.x, o.y - p.y) < 3) return { ...base, x: lerp(o.x, p.x), y: lerp(o.y, p.y), a: lerpA(o.a, p.a) };
      return base;
    });
    const monsters = s.monsters.map((m) => {
      const o = ma.get(m.id);
      return o && Math.hypot(o.x - m.x, o.y - m.y) < 3 ? { ...m, x: lerp(o.x, m.x), y: lerp(o.y, m.y), a: lerpA(o.a, m.a) } : m;
    });
    const myCarry = me.c;
    const items = s.items.map((it) => {
      if (it.id === myCarry) {
        const off = SIM.playerRadius + (ITEMS[it.k]?.radius || 0.2) + 0.05;
        return { ...it, x: me.x + Math.cos(me.angle) * off, y: me.y + Math.sin(me.angle) * off };
      }
      const o = ia.get(it.id);
      return o && Math.hypot(o.x - it.x, o.y - it.y) < 3 ? { ...it, x: lerp(o.x, it.x), y: lerp(o.y, it.y) } : it;
    });
    const lockerOcc = {};
    for (const p of s.players) if (p.h) lockerOcc[p.h] = (lockerOcc[p.h] || 0) + 1;
    const playerMap = new Map(players.map((p) => [p.id, { x: p.x, y: p.y, st: p.st, rt: p.rt, h: p.h }]));
    this.bubbles = this.bubbles.filter((bb) => this.time - bb.t < bb.life);
    for (const bb of this.bubbles) { const pos = players.find((p) => p.id === bb.id) || monsters.find((m) => m.id === bb.id); if (pos) { bb.x = pos.x; bb.y = pos.y; } }
    // faux repère du DOUBLE
    let fakeMark = null;
    if (s.mods.ft) {
      const others = players.filter((p) => p.id !== this.myId && p.st === 'alive');
      if (others.length) {
        const o = others[Math.floor(s.time / 20) % others.length];
        fakeMark = { x: o.x + Math.sin(s.time * 0.1) * 14, y: o.y + Math.cos(s.time * 0.13) * 10, label: o.name, color: cosmeticById('suit', o.cos?.suit)?.color || '#fff', icon: '●' };
      }
    }
    const meDead = me.st === 'dead';
    const view = {
      dt, time: this.time + k * 0, myId: this.myId, me: { x: me.x, y: me.y, dead: meDead, a: me.angle },
      camTarget: { x: me.x + Math.cos(me.angle) * 1.2, y: me.y + Math.sin(me.angle) * 1.2 },
      players, monsters, items, roster: this.roster, playerMap,
      doorStates: s.doors, doorString: s.doors, lampString: s.lamps,
      mods: { ...s.mods, elevatorRandom: s.mods.er }, flares: s.flares, fakeVan: s.fakeVan, quest: s.quest, customer: s.customer, pings: s.pings,
      quotaMet: s.mission.d >= s.mission.q, departing: s.mission.dep >= 0, carrying: !!me.c,
      bubbles: this.bubbles, rings: this.rings, lockerOcc, fakeMark, showGhosts: meDead,
      canSee: (x, y) => this.visibleToMe(x, y, s, players),
      eyesVisible: (m) => this.eyesVisible(m),
    };
    return view;
  }

  visibleToMe(x, y, s, players) {
    const me = this.me;
    if (me.st === 'dead') return true;
    const d = Math.hypot(x - me.x, y - me.y);
    if (d > 16) return false;
    if (s.mods.rv) return hasLineOfSight(this.grid, me.x, me.y, x, y);
    if (d < SIM.ambientSight * 1.3) return hasLineOfSight(this.grid, me.x, me.y, x, y);
    const inCone = (p, light) => {
      if (!light) return false;
      const dd = Math.hypot(x - p.x, y - p.y);
      if (dd > SIM.flashlightRange * s.mods.fr) return false;
      if (Math.abs(angleDiff(p.a, Math.atan2(y - p.y, x - p.x))) > SIM.flashlightFov / 2 + 0.1) return false;
      return hasLineOfSight(this.grid, p.x, p.y, x, y);
    };
    if (inCone({ x: me.x, y: me.y, a: me.angle }, this.light && me.b > 0)) return true;
    if (!hasLineOfSight(this.grid, me.x, me.y, x, y)) return false;
    if (s.mods.al > 0.05) {
      for (let i = 0; i < this.map.lamps.length; i++) {
        const l = this.map.lamps[i];
        if (s.lamps[i] === '1' && Math.hypot(l.x - x, l.y - y) < l.radius * 0.8 && hasLineOfSight(this.grid, l.x, l.y, x, y)) return true;
      }
    }
    for (const p of players) if (p.id !== this.myId && p.l && p.st === 'alive' && inCone(p, true)) return true;
    return false;
  }

  eyesVisible(m) {
    const me = this.me;
    const d = Math.hypot(m.x - me.x, m.y - me.y);
    if (d > 10 || me.st === 'dead') return false;
    if (Math.abs(angleDiff(m.a, Math.atan2(me.y - m.y, me.x - m.x))) > 0.9) return false;
    return hasLineOfSight(this.grid, me.x, me.y, m.x, m.y);
  }

  // ------------------------------------------------------------ COMMANDES
  onPress(a) {
    const app = this.app, tr = app.transport;
    app.audio.unlock();
    switch (a) {
      case 'interact': tr.send({ t: 'act', a: this.me.st === 'dead' ? 'boo' : 'interact' }); break;
      case 'throw': tr.send({ t: 'act', a: 'throw' }); break;
      case 'utility': tr.send({ t: 'act', a: 'utility' }); break;
      case 'light': if (this.me.b > 0) { this.light = !this.light; app.audio.play('ui', { vol: 0.3 }); } break;
      case 'talk': app.voice.setPtt(true); if (!app.voice.micOn) this.feed('Micro non activé : activez-le dans le salon ou les réglages.', 'private'); break;
      case 'radio':
        if (this.me.eq !== 'radio') { this.feed('Vous n\'avez pas de talkie-walkie (équipement).', 'private'); break; }
        if (this.last?.mods.rd) { this.feed('SILENCE RADIO : aucun signal.', 'private'); break; }
        app.voice.setRadio(true); break;
      case 'chat': this.openChat(); break;
      case 'emote': { const em = this.emotes(); const e = em[this.emoteIndex++ % em.length]; if (e) tr.send({ t: 'act', a: 'emote', id: e.id, text: e.text }); break; }
      case 'emote1': case 'emote2': case 'emote3': case 'emote4': {
        const e = this.emotes()[Number(a.slice(-1)) - 1];
        if (e) tr.send({ t: 'act', a: 'emote', id: e.id, text: e.text });
        break;
      }
      case 'pause': this.app.togglePause(); break;
    }
  }

  onRelease(a) {
    if (a === 'interact') this.app.transport.send({ t: 'act', a: 'release' });
    if (a === 'talk') this.app.voice.setPtt(false);
    if (a === 'radio') this.app.voice.setRadio(false);
  }

  emotes() {
    const ids = this.roster.get(this.myId)?.cosmetics?.emotes || ['wave', 'panic', 'thumb', 'shh'];
    return ids.map((id) => COSMETICS.emote.find((e) => e.id === id)).filter(Boolean);
  }

  openChat() {
    const form = $('game-chat-form'), input = $('game-chat-input');
    form.hidden = false;
    this.app.input.chatOpen = true;
    input.value = '';
    input.focus();
    const close = () => { form.hidden = true; this.app.input.chatOpen = false; input.blur(); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) this.app.transport.send({ t: 'chat', text });
      close();
    };
    input.onkeydown = (e) => { if (e.key === 'Escape') close(); e.stopPropagation(); };
    input.onblur = () => setTimeout(close, 100);
  }

  // ------------------------------------------------------------ INTERFACE
  feed(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = `feed-item ${kind}`;
    el.textContent = text;
    $('hud-feed').prepend(el);
    this.feedEls.push({ el, until: performance.now() + (kind === 'event' ? 7000 : kind === 'end' ? 2500 : 4500) });
    while (this.feedEls.length > 4) this.feedEls.shift().el.remove();
  }

  updateFeed() {
    const now = performance.now();
    for (const f of this.feedEls) if (now > f.until) f.el.remove();
    this.feedEls = this.feedEls.filter((f) => now <= f.until);
    for (const c of this.chatEls) if (now > c.until) c.el.remove();
    this.chatEls = this.chatEls.filter((c) => now <= c.until);
    if (this.centerUntil && now > this.centerUntil) { $('hud-center').textContent = ''; this.centerUntil = 0; }
  }

  chatLine(name, text, dead) {
    const li = document.createElement('li');
    if (dead) li.className = 'dead';
    li.textContent = `${dead ? '👻 ' : ''}${name} : ${text}`;
    $('game-chat-log').append(li);
    this.chatEls.push({ el: li, until: performance.now() + 12000 });
    while (this.chatEls.length > 6) this.chatEls.shift().el.remove();
  }

  center(text, secs) { $('hud-center').textContent = text; this.centerUntil = performance.now() + secs * 1000; }

  hurtFx() {
    const v = $('vignette');
    v.classList.add('hurt');
    setTimeout(() => v.classList.remove('hurt'), 500);
    this.app.renderer.shake(8);
    if (navigator.vibrate) try { navigator.vibrate(120); } catch { /* ignore */ }
  }

  updateHud(view) {
    const s = this.last, me = this.me, m = s.mission;
    const frac = Math.min(1.5, m.d / Math.max(1, m.q));
    $('hud-quota-fill').style.width = `${Math.min(100, (frac / 1.5) * 100)}%`;
    $('hud-quota-mark').style.left = `${(1 / 1.5) * 100}%`;
    $('hud-quota-text').textContent = `${m.d} / ${m.q} cr${m.b ? ` (+${m.b} bonus)` : ''}${m.d >= m.q ? ' ✔ QUOTA' : ''}`;
    const timer = $('hud-timer');
    if (m.dep >= 0) { timer.textContent = `🚐 ${Math.ceil(m.dep)}`; timer.classList.add('low'); }
    else { const tl = Math.max(0, m.tl); timer.textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`; timer.classList.toggle('low', tl < 60); }
    // événements actifs
    $('hud-events').innerHTML = s.ev.map((e) => `<span class="ev-chip" style="border-color:${EVENT_CATEGORIES[e.c]?.color || '#888'}">${esc(e.n)} · ${e.l}s</span>`).join('');
    // équipe
    const team = view.players.map((p) => {
      const col = cosmeticById('suit', p.cos?.suit)?.color || '#888';
      const icon = { alive: '', downed: '✚ ', dead: '💀 ', extracted: '🚐 ', left: '✖ ' }[p.st] || '';
      const hearts = p.st === 'alive' ? '♥'.repeat(Math.max(0, p.hp)) : '';
      const speak = p.vl > 0.05 ? (p.rt ? '📻' : '🔊') : '';
      const cls = `tm ${p.vl > 0.05 ? 'speaking' : ''} ${p.st === 'downed' ? 'down' : ''} ${p.st === 'dead' ? 'dead' : ''}`;
      return `<div class="${cls}" style="--c:${col}"><span class="sp">${speak}</span>${icon}${esc(p.name)}${p.id === this.myId ? ' (vous)' : ''}${p.dc ? ' ⚠' : ''} <span style="color:#ff5d6e">${hearts}</span></div>`;
    }).join('');
    $('hud-team').innerHTML = team;
    // jauges
    $('hud-hp').textContent = me.st === 'alive' ? '♥'.repeat(Math.max(0, me.hp)) + '♡'.repeat(Math.max(0, SIM.maxHp - me.hp)) : me.st === 'downed' ? `À TERRE ${Math.ceil(me.dn)}s` : '—';
    $('hud-stamina').style.width = `${(me.stamina ?? 1) * 100}%`;
    $('hud-battery').style.width = `${(me.b ?? 1) * 100}%`;
    $('hud-battery').style.background = this.light ? '#e9d27a' : '#666';
    $('hud-radio').style.width = `${(me.rb ?? 1) * 100}%`;
    const carried = me.c ? s.items.find((it) => it.id === me.c) : null;
    $('hud-carry').innerHTML = carried ? `📦 ${esc(ITEMS[carried.k]?.name || '')} · <b>${carried.v} cr</b>${ITEMS[carried.k]?.weight >= 3 ? ' · <i>lourd</i>' : ''}${carried.h ? ' · porté à deux' : ''}` : '';
    const eq = EQUIPMENT[me.eq];
    $('hud-equip').textContent = eq ? `🎒 ${eq.name}${me.ch ? ` ×${me.ch}` : ''}` : '';
    // voix
    const vc = this.app.voice;
    $('hud-miclevel').style.width = `${(vc.transmitting ? vc.level : 0) * 100}%`;
    const vi = $('hud-voice');
    vi.classList.toggle('tx', vc.transmitting && !vc.radioKey);
    vi.classList.toggle('radio', vc.transmitting && vc.radioKey);
    $('hud-mic').textContent = vc.micOn ? (vc.transmitting ? '🎙' : '🎙️') : '🔇';
    $('hud-voicemode').textContent = !vc.micOn ? 'micro coupé' : this.app.settings.voiceMode === 'open' ? 'micro ouvert' : `appuyer ${this.app.input.lastDevice === 'touch' ? '🎙' : keyName(this.app.settings.keys.talk[0])}`;
    $('vignette').classList.toggle('downed', me.st === 'downed');
    this.updatePrompt(view);
    // abandon possible quand tous les humains sont hors-jeu
    const humansOut = view.players.filter((p) => !this.roster.get(p.id)?.bot).every((p) => p.st === 'dead' || p.st === 'extracted' || p.dc);
    $('btn-abandon').hidden = !(humansOut && this.app.isHost());
  }

  updatePrompt(view) {
    const el = $('hud-prompt'), me = this.me, s = this.last;
    const touch = this.app.input.lastDevice === 'touch';
    const K = (a) => (touch ? { interact: '✋', throw: '🫴', utility: '🎒' }[a] : `<kbd>${keyName(this.app.settings.keys[a]?.[0])}</kbd>`);
    let html = '';
    const near = (x, y, r = SIM.interactRange) => Math.hypot(x - me.x, y - me.y) < r;
    if (me.st === 'dead') html = `${K('interact')} Bouh ! (les fantômes peuvent effrayer… un peu)`;
    else if (me.st === 'downed') html = 'À terre : un coéquipier doit vous relever. Parlez !';
    else if (me.st !== 'alive') html = '';
    else if (me.h) html = `${K('interact')} Sortir du casier`;
    else {
      const downed = view.players.find((p) => p.id !== this.myId && p.st === 'downed' && near(p.x, p.y));
      const lv = this.map.lever;
      if (downed) html = `Maintenir ${K('interact')} Relever ${esc(downed.name)}`;
      else if (near(lv.x, lv.y) && s.mission.dep < 0) html = s.mission.d >= s.mission.q ? `Maintenir ${K('interact')} <b>Démarrer le fourgon</b> (départ ${SIM.departureTime} s)` : `Levier bloqué : quota ${s.mission.d}/${s.mission.q}`;
      else if (this.map.elevators.some((e) => near(e.x, e.y, 0.9))) html = `${K('interact')} Prendre le monte-charge`;
      else if (me.c) html = `${K('interact')} Lâcher · ${K('throw')} Lancer`;
      else {
        let best = null, bd = Infinity;
        for (const it of view.items) {
          if (it.f > 0) continue;
          const d = Math.hypot(it.x - me.x, it.y - me.y);
          if (d < SIM.interactRange + (ITEMS[it.k]?.radius || 0) && d < bd) { bd = d; best = it; }
        }
        if (best) {
          const def = ITEMS[best.k];
          if (best.c && def.weight >= 3 && !best.h) html = `${K('interact')} Aider à porter : ${esc(def.name)}`;
          else if (!best.c) html = `${K('interact')} Ramasser ${esc(def.name)} · <b>${best.v} cr</b>${def.weight >= 3 ? ' · lourd (plus rapide à deux)' : ''}${def.fragile >= 0.8 ? ' · FRAGILE' : ''}`;
        }
        if (!html) {
          const door = this.map.doors.find((i) => near((i % this.map.w) + 0.5, ((i / this.map.w) | 0) + 0.5, SIM.interactRange + 0.3) && s.doors[this.map.doors.indexOf(i)] !== '2');
          if (door !== undefined) html = `${K('interact')} ${this.grid.doorOpen[door] ? 'Fermer' : 'Ouvrir'} la porte`;
          else if (this.map.lockers.some((l) => near(l.x, l.y))) html = `${K('interact')} Se cacher dans le casier`;
        }
      }
    }
    if (me.chan) {
      const label = me.chan[0] === 'revive' ? 'Réanimation' : 'Démarrage';
      html = `${label}… <span class="prog"><i style="width:${Math.round(me.chan[1] * 100)}%"></i></span>`;
    }
    el.innerHTML = html;
    el.style.display = html ? 'block' : 'none';
  }

  destroy() {
    for (const t of this.tipTimers || []) clearTimeout(t);
    this.app.audio.stopAmbience();
    this.app.audio.stopSpeech();
    this.app.voice.setPtt(false); this.app.voice.setRadio(false);
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export { esc };
