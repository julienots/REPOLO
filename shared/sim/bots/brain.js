// IA des bots coéquipiers : perception → mémoire → décision utilitaire → exécution.
// Les traits de personnalité (data/bots.js) modulent chaque score, ce qui produit des
// comportements distincts (prudent, courageux, paniqué, cupide, protecteur, comique).
import { findPath } from '../../map/pathfinding.js';
import { T } from '../../map/grid.js';
import { dist, angleTo, turnToward, angleDiff } from '../../util/math.js';
import { playerSees } from '../perception.js';
import { perceived } from '../noise.js';
import { stepMovement } from '../movement.js';
import { SIM } from '../../config/game.js';

const DANGER_STATES = new Set(['chase', 'charge', 'lunge', 'windup', 'reveal', 'ring', 'investigate', 'stalk']);

export class BotBrain {
  constructor(game, p) {
    this.g = game;
    this.p = p;
    this.goal = null;          // { kind, x, y, id }
    this.path = null;
    this.repathT = 0;
    this.decideT = 0;
    this.known = new Map();    // monstres connus : id → { x, y, t, type, state, target, ex }
    this.explored = new Set();
    this.talkCd = game.time + game.rng.range(3, 8);
    this.stuckT = 0;
    this.lastPos = { x: p.x, y: p.y };
    this.panicT = 0;
    this.panicDir = 0;
    this.hideCalmT = 0;
    this.idleT = game.time + game.rng.range(18, 35);
    this.fleeFrom = null;
    this.aimAt = null;
    this.mode = 'walk';
    this.holding = false;
    this.lastSpotted = {};
    this.input = { mx: 0, my: 0, mode: 'walk' };
    this.pauseUntil = 0;
  }

  get prof() { return this.p.profile; }

  update(dt) {
    const g = this.g, p = this.p;
    this.perceive(dt);
    this.decideT -= dt;
    if (this.decideT <= 0) { this.decideT = 0.25 + g.rng.range(0, 0.1); this.decide(); }
    this.execute(dt);
  }

  // ---------- PERCEPTION ----------
  perceive() {
    const g = this.g, p = this.p;
    const room = g.roomAt(p.x, p.y);
    if (room && !this.explored.has(room.id)) {
      this.explored.add(room.id);
      if (g.time > 3 && g.rng.chance(0.6)) this.pauseUntil = g.time + g.rng.range(0.8, 2.2) * (1.4 - this.prof.bravery * 0.6);
    }
    for (const m of g.monsters) {
      let seen = playerSees(g, p, m);
      // le Faux Sauveteur et le Dernier Invité trompent les bots peu méfiants
      if (seen && m.type === 'invite' && m.ex.as && this.prof.caution < 0.7) seen = 'disguised';
      if (seen) {
        const isNew = !this.known.has(m.id) || g.time - this.known.get(m.id).t > 8;
        this.known.set(m.id, { x: m.x, y: m.y, t: g.time, type: m.type, state: m.state, target: m.target, ex: m.ex, disguised: seen === 'disguised' });
        if (isNew && seen !== 'disguised') this.onSpot(m);
      }
    }
    // ouïe : chaque créature a une signature sonore (cliquetis, cloche, pas lourds…)
    for (const m of g.monsters) {
      const d = dist(p.x, p.y, m.x, m.y);
      const range = m.type === 'demenageur' || m.type === 'berger' ? 9 : m.type === 'sauveteur' ? 0 : 5.5;
      if (d < range && (!this.known.has(m.id) || g.time - this.known.get(m.id).t > 0.5)) {
        this.known.set(m.id, { x: m.x + g.rng.range(-1, 1), y: m.y + g.rng.range(-1, 1), t: g.time, type: m.type, state: m.state, target: m.target, ex: m.ex, heard: true });
      }
    }
    for (const n of g.noises) {
      if (n.mimic && this.prof.caution > 0.8) continue;
      const m = g.monsters.find((mm) => mm.id === n.source);
      if (!m) continue;
      if (perceived(g, n, p.x, p.y, 1) > 1) this.known.set(m.id, { x: n.x, y: n.y, t: g.time, type: m.type, state: m.state, target: m.target, ex: m.ex, heard: true });
    }
    for (const [id, k] of this.known) if (g.time - k.t > 9) this.known.delete(id);
  }

  onSpot(m) {
    const g = this.g;
    if ((this.lastSpotted[m.type] || 0) > g.time - 20) return;
    this.lastSpotted[m.type] = g.time;
    if (m.type === 'sauveteur' && m.ex.disguised && this.prof.caution < 0.5) { g.chatter.say(this.p, 'follow_rescuer', {}, { force: true }); return; }
    if (m.type === 'sauveteur' && m.ex.disguised) { g.botSpeak(this.p, 'Sa lanterne est VERTE. C\'est pas un vrai sauveteur !', 'talk'); return; }
    g.chatter.say(this.p, 'spot_monster', { monster: m.def.name }, { force: true });
    // le comique / paniqué lâche parfois son objet de surprise
    if (this.p.carry && g.rng.chance(this.prof.clumsy * 0.45)) {
      g.dropCarried(this.p, { fling: 2, reason: 'scared' });
      g.chatter.say(this.p, 'drop_scared', {}, { force: true });
    }
  }

  threatInfo() {
    const p = this.p;
    let best = null;
    for (const k of this.known.values()) {
      if (k.disguised) continue;
      if (k.type === 'sauveteur' && k.ex?.disguised && this.prof.caution < 0.5) continue;
      const d = dist(p.x, p.y, k.x, k.y);
      let danger = 0;
      if (DANGER_STATES.has(k.state)) danger = 1;
      if (k.target === p.id && k.state !== 'roam') danger = 1.4;
      if (k.type === 'sourdine' && d < 5) danger = Math.max(danger, 0.8);
      if (k.type === 'demenageur' && d < 6) danger = Math.max(danger, 0.7);
      if (k.type === 'mannequine') danger = Math.max(danger, 0.4);
      if (k.type === 'inspecteur' && k.state === 'patrol') danger = p.carry ? 0.5 : 0.1;
      if (k.state === 'rest' || k.state === 'dormant') danger *= 0.3;
      const score = danger * Math.max(0, 1 - d / 14);
      if (score > 0 && (!best || score > best.score)) best = { ...k, d, score };
    }
    return best;
  }

  // ---------- DÉCISION ----------
  decide() {
    const g = this.g, p = this.p, prof = this.prof, mission = g.mission;
    this.aimAt = null;

    if (p.state === 'dead') { this.ghostWander(); return; }
    if (p.state === 'downed') { this.setGoal('crawl', this.nearestTeammateOrVan()); return; }

    // dans un casier : sortir quand c'est calme
    if (p.hidden) {
      const t = this.threatInfo();
      this.hideCalmT = t && t.d < 9 ? 0 : this.hideCalmT + 0.25;
      if (this.hideCalmT > 4 + prof.caution * 4 || mission.departing) g.interact(p);
      this.goal = null; return;
    }

    // L'Inspecteur crie « CONTRÔLE ! » : on s'arrête… sauf les impulsifs
    const insp = g.monsters.find((m) => m.type === 'inspecteur' && (m.state === 'control' || m.state === 'check') && m.target === p.id);
    if (insp) {
      if (!this.inspectorReact) {
        this.inspectorReact = (prof.panic > 0.8 && g.rng.chance(0.7)) || (p.carry && prof.greed > 0.9 && g.rng.chance(0.5)) ? 'run' : 'freeze';
        g.chatter.say(p, 'inspector_stop', {}, { force: true });
      }
      if (this.inspectorReact === 'freeze') { this.setGoal('freeze', { x: p.x, y: p.y }); this.aimAt = { x: insp.x, y: insp.y }; return; }
      this.fleeFrom = { x: insp.x, y: insp.y };
      this.setGoal('flee', this.fleePoint(insp.x, insp.y), true);
      return;
    }
    this.inspectorReact = null;

    // La Mannequine : la garder dans le faisceau
    for (const k of this.known.values()) {
      if (k.type === 'mannequine' && dist(p.x, p.y, k.x, k.y) < 10 && g.time - k.t < 2) {
        if (g.rng.chance(prof.panic * 0.15)) break; // le paniqué oublie de la regarder
        this.aimAt = { x: k.x, y: k.y };
      }
    }

    // Menace
    const threat = this.threatInfo();
    const fearRadius = 3 + prof.caution * 4 + (1 - prof.bravery) * 3;
    if (threat && threat.d < fearRadius && threat.score > 0.12 && threat.type !== 'mannequine') {
      if (!this.fleeFrom || g.time - (this.fleeStartT || 0) > 1.2) {
        this.fleeStartT = g.time;
        this.fleeFrom = { x: threat.x, y: threat.y };
        if (!this.wasFleeing) g.chatter.say(p, 'flee', {}, { chance: 0.9 });
        // se cacher ?
        const locker = this.nearLocker(4.5);
        if (locker && (prof.caution > 0.55 || threat.target === p.id) && g.rng.chance(0.6)) {
          this.setGoal('hide', { x: locker.x, y: locker.y, id: locker.id }, true);
          this.wasFleeing = true; return;
        }
        // le paniqué part parfois n'importe où
        if (g.rng.chance(prof.panic * 0.35)) { this.panicT = g.time + 1.5; this.panicDir = g.rng.range(-Math.PI, Math.PI); }
        this.setGoal('flee', this.fleePoint(threat.x, threat.y), true);
      }
      this.wasFleeing = true;
      return;
    }
    this.wasFleeing = false;
    this.fleeFrom = null;

    // Départ du fourgon : tout le monde court
    if (mission.departing) {
      if (this.goal?.kind !== 'van') g.chatter.say(p, 'departure', {}, { chance: 0.7 });
      this.setGoal('van', this.vanPoint());
      return;
    }

    // Réanimer un coéquipier
    const downed = [...g.players.values()].filter((o) => o.state === 'downed' && o !== p);
    if (downed.length) {
      const o = downed.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
      const d = dist(p.x, p.y, o.x, o.y);
      const willing = d < 12 + prof.loyalty * 20 && (!threat || threat.d > 6 || prof.loyalty > 0.9);
      if (willing) {
        if (this.goal?.kind !== 'revive') g.chatter.say(p, 'teammate_down', { name: o.name }, { chance: 0.9 });
        this.setGoal('revive', { x: o.x, y: o.y, id: o.id });
        return;
      }
    }

    // Objet porté → fourgon (ou point de contrôle pour le canard)
    if (p.carry) {
      const it = g.items.get(p.carry);
      if (it && it.type === 'duck' && g.quest) { this.setGoal('quest', { x: g.quest.x, y: g.quest.y }); return; }
      this.setGoal('deliver', this.vanPoint());
      return;
    }

    // Quota atteint : rentrer (prudent) ou continuer (cupide)
    const quotaMet = mission.deposited >= mission.quota;
    if (quotaMet) {
      if (!this.saidQuota) { this.saidQuota = true; g.chatter.say(p, 'quota', {}, { force: true }); }
      const humansReady = g.humans().every((h) => h.state !== 'alive' || g.inVan(h.x, h.y));
      const wantLeave = prof.caution > 0.55 || mission.timeLeft < 100 || prof.greed < 0.4;
      if (wantLeave) {
        if (humansReady && g.inVan(p.x, p.y)) { this.setGoal('lever', g.map.lever); return; }
        if (mission.timeLeft < 45) { this.setGoal('lever', g.map.lever); return; }
        this.setGoal('wait', this.vanPoint()); return;
      }
    }

    // Choisir un objet à ramasser
    const item = this.pickItem(threat);
    if (item) { this.setGoal('loot', { x: item.x, y: item.y, id: item.id }); return; }

    // Explorer
    const room = this.unexploredRoom();
    if (room) { const pt = { x: room.x + room.w / 2, y: room.y + room.h / 2 }; this.setGoal('explore', g.randomPointInRoom(room) || pt); return; }

    this.setGoal('wait', this.vanPoint());
  }

  setGoal(kind, pt, force = false) {
    if (!pt) return;
    if (!force && this.goal && this.goal.kind === kind && this.goal.id === pt.id && dist(this.goal.x, this.goal.y, pt.x, pt.y) < 1.5) return;
    this.goal = { kind, x: pt.x, y: pt.y, id: pt.id };
    this.path = null;
    this.goalT = this.g.time;
  }

  pickItem(threat) {
    const g = this.g, p = this.p, prof = this.prof;
    let best = null, bs = 0;
    for (const it of g.items.values()) {
      if (it.carriedBy || it.def.noLoot || it.fallT > 0) continue;
      if (g.inVan(it.x, it.y)) continue;
      if (it.claimedBy && it.claimedBy !== p.id && g.players.get(it.claimedBy)?.state === 'alive') continue;
      if (this.failed?.has(it.id)) continue;
      const d = dist(p.x, p.y, it.x, it.y);
      if (d > 45) continue;
      const room = g.roomAt(it.x, it.y);
      if (room?.secret) continue;
      // un bot ne connaît que les objets des salles qu'il a explorées (ou vus de près)
      if (room && !this.explored.has(room.id) && d > 6) continue;
      let value = it.value;
      if (it.type === 'duck' && g.quest) value = g.quest.reward;
      if (g.customer && it.type === g.customer.type) value *= 2;
      let s = (value * (0.5 + prof.greed)) / (6 + d * (1.5 - prof.bravery * 0.5));
      if (it.def.weight >= 4) s *= 0.5 + prof.bravery * 0.3;
      for (const k of this.known.values()) {
        if (dist(k.x, k.y, it.x, it.y) < 6) s *= 0.2 + prof.bravery * 0.5;
      }
      if (s > bs) { bs = s; best = it; }
    }
    if (best) best.claimedBy = p.id;
    return best;
  }

  unexploredRoom() {
    const g = this.g, p = this.p;
    let best = null, bd = Infinity;
    for (const r of g.map.rooms) {
      if (r.secret || this.explored.has(r.id)) continue;
      const d = dist(p.x, p.y, r.x + r.w / 2, r.y + r.h / 2) * (0.6 + r.danger * this.prof.caution);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  nearLocker(maxD) {
    const g = this.g, p = this.p;
    let best = null, bd = maxD;
    for (const l of g.map.lockers) {
      const occ = g.lockerOccupants(l.id).length;
      if (occ >= 2) continue;
      const d = dist(p.x, p.y, l.x, l.y);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  fleePoint(mx, my) {
    const g = this.g, p = this.p;
    let best = null, bs = -Infinity;
    const away = Math.atan2(p.y - my, p.x - mx);
    for (const r of g.map.rooms) {
      if (r.secret) continue;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const dm = dist(cx, cy, mx, my), dp = dist(cx, cy, p.x, p.y);
      if (dp < 2) continue;
      const dirOk = Math.abs(angleDiff(away, Math.atan2(cy - p.y, cx - p.x))) < 1.6;
      const s = dm - dp * 0.45 + (dirOk ? 6 : -6) + (r.start ? 3 * this.prof.caution : 0);
      if (s > bs) { bs = s; best = g.randomPointInRoom(r) || { x: cx, y: cy }; }
    }
    return best;
  }

  vanPoint() {
    const v = this.g.map.van;
    const id = parseInt(String(this.p.id).replace(/\D/g, '') || '0', 10);
    return { x: v.x + 0.8 + (id % 4) * (v.w - 1.6) / 3, y: v.y + 0.5 + ((id >> 2) % 2) * (v.h - 1) * 0.6 };
  }

  nearestTeammateOrVan() {
    const g = this.g, p = this.p;
    let best = this.vanPoint(), bd = dist(p.x, p.y, best.x, best.y);
    for (const o of g.players.values()) {
      if (o === p || o.state !== 'alive') continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < bd) { bd = d; best = { x: o.x, y: o.y }; }
    }
    return best;
  }

  ghostWander() {
    const g = this.g;
    if (!this.goal || dist(this.p.x, this.p.y, this.goal.x, this.goal.y) < 1) {
      const ps = g.alivePlayers();
      const t = ps.length ? g.rng.pick(ps) : null;
      this.goal = t ? { kind: 'ghost', x: t.x + g.rng.range(-3, 3), y: t.y + g.rng.range(-3, 3) } : { kind: 'ghost', x: g.map.spawn.x, y: g.map.spawn.y };
    }
    if (g.rng.chance(0.01)) g.boo(this.p);
  }

  // ---------- EXÉCUTION ----------
  execute(dt) {
    const g = this.g, p = this.p, prof = this.prof;
    let mx = 0, my = 0;
    let mode = 'walk';
    const goal = this.goal;

    if (p.hidden) { this.input = { mx: 0, my: 0, mode: 'walk' }; return; }
    // pause « humaine » : il regarde autour de lui (sauf en fuite / départ)
    if (this.pauseUntil > g.time && goal && !['flee', 'van', 'hide', 'revive'].includes(goal.kind)) {
      p.angle += Math.sin(g.time * 1.7 + p.x) * dt * 1.5;
      this.input = { mx: 0, my: 0, mode: 'walk' };
      return;
    }

    if (goal) {
      const d = dist(p.x, p.y, goal.x, goal.y);
      const arriveD = { revive: SIM.interactRange * 0.8, loot: 0.7, hide: SIM.interactRange * 0.8, lever: SIM.interactRange * 0.8, deliver: 0.6, quest: 0.6, wait: 0.9, freeze: 99 }[goal.kind] ?? 0.8;
      if (goal.kind === 'loot') {
        const it = g.items.get(goal.id);
        if (!it || it.carriedBy) { this.goal = null; this.decideT = 0; }
        else { goal.x = it.x; goal.y = it.y; }
      }
      if (goal.kind === 'revive') {
        const o = g.players.get(goal.id);
        if (!o || o.state !== 'downed') { this.stopHold(); this.goal = null; this.decideT = 0; }
        else { goal.x = o.x; goal.y = o.y; }
      }

      if (this.goal && d > arriveD) {
        const wp = this.nextWaypoint(goal, dt);
        if (wp) { const a = angleTo(p.x, p.y, wp.x, wp.y); mx = Math.cos(a); my = Math.sin(a); }
        if (this.holding) this.stopHold();
      } else if (this.goal) {
        this.arrive(goal);
      }
      if (goal.kind === 'flee' || goal.kind === 'van' || goal.kind === 'hide') mode = 'sprint';
      else if (goal.kind === 'crawl') mode = 'walk';
      else {
        const near = [...this.known.values()].some((k) => dist(p.x, p.y, k.x, k.y) < 10);
        if (near && prof.caution > 0.4) mode = 'sneak';
        if (goal.kind === 'revive' && d > 4) mode = 'sprint';
        if (goal.kind === 'deliver' && prof.caution < 0.3 && d > 10 && !p.carry) mode = 'sprint';
      }
    }
    if (this.panicT > g.time) { mx = Math.cos(this.panicDir); my = Math.sin(this.panicDir); mode = 'sprint'; }
    if (p.stamina < 0.15 && mode === 'sprint') mode = 'walk';

    // orientation (et donc la lampe)
    const aimA = this.aimAt ? angleTo(p.x, p.y, this.aimAt.x, this.aimAt.y) : (mx || my ? Math.atan2(my, mx) : p.angle + Math.sin(g.time * 0.7 + p.x) * 0.02);
    p.angle = turnToward(p.angle, aimA, 7 * dt);
    p.moveMode = mode;
    this.input = { mx, my, mode };

    // blocage
    const moved = dist(p.x, p.y, this.lastPos.x, this.lastPos.y);
    if ((mx || my) && moved < 0.01) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) { this.path = null; this.stuckT = 0; this.stuckCount = (this.stuckCount || 0) + 1; this.tryOpenDoor(); }
      if (this.stuckCount > 4 && goal) { (this.failed ||= new Set()).add(goal.id); this.goal = null; this.stuckCount = 0; this.decideT = 0; }
    } else { this.stuckT = 0; if (moved > 0.05) this.stuckCount = 0; }
    this.lastPos.x = p.x; this.lastPos.y = p.y;

    // idle chatter
    if (g.time > this.idleT) {
      this.idleT = g.time + g.rng.range(20, 40);
      if ((prof.panic > 0.8 || prof.clumsy > 0.8) && g.rng.chance(0.35)) g.chatter.say(p, 'wrong_info', {}, { chance: 1 });
      else g.chatter.say(p, 'idle', {}, { chance: 0.6 });
    }
  }

  nextWaypoint(goal, dt) {
    const g = this.g, p = this.p;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0) {
      const avoid = this.fleeFrom || this.known.size ? (tx, ty) => {
        let c = 0;
        for (const k of this.known.values()) { const d = Math.hypot(tx + 0.5 - k.x, ty + 0.5 - k.y); if (d < 4) c += (4 - d) * 2; }
        return c;
      } : null;
      this.path = findPath(g.map.grid, p.x, p.y, goal.x, goal.y, { doorsPassable: true, avoid, maxNodes: 2500 });
      this.repathT = 1.0;
      if (!this.path) { this.repathT = 0.5; return { x: goal.x, y: goal.y }; }
    }
    while (this.path.length && dist(p.x, p.y, this.path[0].x, this.path[0].y) < 0.35) this.path.shift();
    if (!this.path.length) return { x: goal.x, y: goal.y };
    const wp = this.path[0];
    // ouvrir une porte fermée sur le chemin
    const tx = Math.floor(wp.x), ty = Math.floor(wp.y);
    const grid = g.map.grid;
    if (grid.get(tx, ty) === T.DOOR && !grid.doorOpen[grid.idx(tx, ty)] && dist(p.x, p.y, tx + 0.5, ty + 0.5) < SIM.interactRange) {
      g.setDoor(tx, ty, true, p.id, p.moveMode === 'sprint' ? 5 : 2.5);
    }
    return wp;
  }

  tryOpenDoor() {
    const g = this.g, p = this.p, grid = g.map.grid;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tx = Math.floor(p.x) + dx, ty = Math.floor(p.y) + dy;
      if (grid.get(tx, ty) === T.DOOR && !grid.doorOpen[grid.idx(tx, ty)]) g.setDoor(tx, ty, true, p.id, 2.5);
    }
  }

  arrive(goal) {
    const g = this.g, p = this.p;
    switch (goal.kind) {
      case 'loot': {
        const it = g.items.get(goal.id);
        if (it && !it.carriedBy && dist(p.x, p.y, it.x, it.y) < SIM.interactRange) {
          g.grabItem(p, it);
          if (p.carry) g.chatter.say(p, 'pickup', { item: it.def.name, value: Math.round(it.value) }, { chance: 0.5 });
        }
        this.pauseUntil = g.time + g.rng.range(0.4, 1.8);
        this.goal = null; this.decideT = 0;
        break;
      }
      case 'deliver':
      case 'quest':
        if (p.carry) {
          const it = g.items.get(p.carry);
          g.dropCarried(p, { reason: 'deliver' });
          if (goal.kind === 'deliver' && it) g.chatter.say(p, 'deliver', {}, { chance: 0.4 });
        }
        this.pauseUntil = g.time + g.rng.range(1, 3.5);
        this.goal = null; this.decideT = 0;
        break;
      case 'revive':
        if (!this.holding) { this.holding = true; g.interact(p); g.chatter.say(p, 'reviving', { name: g.players.get(goal.id)?.name }, { chance: 0.6 }); }
        break;
      case 'hide': {
        const l = g.map.lockers.find((lk) => lk.id === goal.id);
        if (l && dist(p.x, p.y, l.x, l.y) < SIM.interactRange) { g.enterLocker(p, l); g.chatter.say(p, 'hide', {}, { chance: 0.5 }); }
        this.goal = null;
        break;
      }
      case 'lever':
        if (!this.holding && g.mission.deposited >= g.mission.quota && !g.mission.departing) { this.holding = true; g.interact(p); }
        if (g.mission.departing) this.stopHold();
        break;
      default:
        break;
    }
  }

  stopHold() { if (this.holding) { this.holding = false; this.g.release(this.p); } }
}
