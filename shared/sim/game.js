// LA PARTIE — simulation autoritaire. Tourne à l'identique sur le serveur (en ligne)
// ou dans le navigateur (solo). Aucune dépendance au DOM ni au réseau.
import { SIM } from '../config/game.js';
import { makeRng } from '../util/rng.js';
import { dist, angleTo, clamp } from '../util/math.js';
import { generateMap, serializeMap } from '../map/generator.js';
import { T, moveCircle, collides, unstick } from '../map/grid.js';
import { MISSIONS, DIFFICULTIES, VARIANTS, SIDE_OBJECTIVES } from '../data/missions.js';
import { EQUIPMENT } from '../data/equipment.js';
import { BOT_PROFILES } from '../data/bots.js';
import { MONSTERS } from '../data/monsters.js';
import { emitNoise } from './noise.js';
import { stepMovement } from './movement.js';
import { createItem, updateItems } from './items.js';
import { Director } from './events/director.js';
import { DEFAULT_MODS } from './events/mods.js';
import { Spawner } from './spawner.js';
import { BotBrain } from './bots/brain.js';
import { Chatter } from './bots/chatter.js';
import { newStats, computeAwards, deathCause, ReplayBuffer } from './stats.js';

export class Game {
  // opts : { missionId, difficulty, seed, players:[{id,name,cosmetics,equipment,isBot,botProfile}], variant, monsters (forcés) }
  constructor(opts) {
    this.seed = opts.seed ?? (Math.random() * 2 ** 31) | 0;
    this.rng = makeRng(this.seed ^ 0x5bd1e995);
    this.missionId = MISSIONS[opts.missionId] ? opts.missionId : 'morvan';
    this.missionDef = MISSIONS[this.missionId];
    this.diffId = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'employe';
    this.diff = DIFFICULTIES[this.diffId];
    this.variant = VARIANTS.find((v) => v.id === opts.variant) || (opts.variant === 'random' ? this.rng.weighted(VARIANTS, (v) => v.weight) : VARIANTS[0]);
    this.noiseMul = this.variant.noiseMul || 1;
    this.time = 0;
    this.map = generateMap(this.missionDef.theme, this.seed, { lootMul: this.variant.lootMul || 1 });
    this.roomGrid = buildRoomGrid(this.map);
    if (this.variant.noLamps) for (const l of this.map.lamps) if (!this.roomAt(l.x, l.y)?.start) l.on = false;
    this.players = new Map();
    this.items = new Map();
    this.monsters = [];
    this.noises = [];
    this.netNoises = [];
    this.outMsgs = [];
    this.mods = { ...DEFAULT_MODS };
    this.monsterMods = {};
    this.flares = [];
    this.pings = [];
    this.flags = new Set();
    this.fakeVan = null;
    this.quest = null;
    this.customer = null;
    this.lampsDirty = true;
    this.tileChanges = [];
    this.highlights = [];
    this.replays = [];
    this.extracted = [];
    this.replay = new ReplayBuffer();
    const timeLimit = Math.round(this.missionDef.time * this.diff.timeMul * (this.variant.timeMul || 1));
    this.mission = {
      quota: Math.round(this.missionDef.quota * this.diff.quotaMul * (this.variant.quotaMul || 1) * (0.7 + 0.1 * Math.min(4, (opts.players || []).length)) / 10) * 10,
      deposited: 0, bonus: 0, timeLimit, timeLeft: timeLimit, departing: false, departT: 0,
      ended: false, success: false, aggro: false, quotaReachedSignaled: false, endReason: '', wipeT: 0, alerts: 0,
    };
    let lootTotal = 0;
    for (const it of this.map.items) {
      const created = createItem(this, it.type, it.x, it.y, { secret: it.secret });
      if (this.variant.heavyBias && created.def.weight >= 3) { created.baseValue = Math.round(created.baseValue * 1.3); created.value = created.baseValue; }
      if (!it.secret) lootTotal += created.baseValue;
    }
    // le quota reste toujours atteignable : au plus 60 % du butin disponible (hors pièce secrète)
    this.mission.quota = Math.min(this.mission.quota, Math.round(lootTotal * 0.6 / 10) * 10);
    this.mission.lootTotal = lootTotal;
    this.director = new Director(this);
    this.chatter = new Chatter(this);
    this.spawner = new Spawner(this, this.missionDef, this.diff, opts.monsters);
    for (const p of opts.players || []) this.addPlayer(p);
    this.sideObjectives = this.rng.shuffle(SIDE_OBJECTIVES.slice()).slice(0, 2);
    this.director.recompute();
  }

  // ---------------------------------------------------------------- JOUEURS
  addPlayer(info) {
    const sp = this.map.spawn;
    const n = this.players.size;
    const pos = unstick(this.map.grid, sp.x + (n % 4) * 0.8 - 1.2, sp.y - Math.floor(n / 4) * 0.8, SIM.playerRadius);
    const equipment = EQUIPMENT[info.equipment] ? info.equipment : 'radio';
    const p = {
      id: info.id, name: info.name || 'Employé', isBot: !!info.isBot, botProfile: info.botProfile || null,
      profile: info.botProfile ? BOT_PROFILES[info.botProfile] : BOT_PROFILES.prudent,
      cosmetics: info.cosmetics || {}, equipment, charges: EQUIPMENT[equipment].charges ?? 0,
      x: pos.x, y: pos.y, vx: 0, vy: 0, angle: -Math.PI / 2, speed: 0, moveMode: 'walk',
      state: 'alive', hp: SIM.maxHp, downT: 0, carry: null, light: true,
      battery: this.variant.noLamps ? 1 : 1, radioBattery: 1, stamina: 1,
      hidden: null, voiceLevel: 0, voiceT: 0, radioTx: false, tp: 0, kb: [0, 0, 0],
      invulnT: 0, hurtT: 0, flickerT: 0, stepAcc: 0, holding: false, channel: null,
      lastStateT: 0, elevatorCd: 0, emote: null, booCd: 0, lastHit: null, connected: true,
      botControl: !!info.isBot, brain: null, stats: newStats(), downedNear: [], extractedT: null,
    };
    if (p.isBot) p.brain = new BotBrain(this, p);
    this.players.set(p.id, p);
    return p;
  }

  setBotControl(id, on, profile = 'prudent') {
    const p = this.players.get(id);
    if (!p) return;
    p.botControl = on;
    if (on) { if (!p.botProfile) { p.profile = BOT_PROFILES[profile]; } p.brain = new BotBrain(this, p); this.release(p); }
    else { p.brain = null; p.tp++; }
  }

  humans() { return [...this.players.values()].filter((p) => !p.isBot); }
  alivePlayers() { return [...this.players.values()].filter((p) => p.state === 'alive'); }
  inVan(x, y) { const v = this.map.van; return x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h; }
  inFakeVan(x, y) { const v = this.fakeVan; return v && x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h; }
  lockerOccupants(id) { return [...this.players.values()].filter((p) => p.hidden === id); }
  itemDefName(type) { return this.items.get(type)?.def.name || type; }

  roomAt(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return null;
    const i = this.roomGrid[ty * this.map.w + tx];
    return i >= 0 ? this.map.rooms[i] : null;
  }

  randomPointInRoom(room) {
    if (!room) return null;
    for (let i = 0; i < 30; i++) {
      const x = this.rng.int(room.x, room.x + room.w - 1), y = this.rng.int(room.y, room.y + room.h - 1);
      if (!this.map.grid.blocksMove(x, y) && !collides(this.map.grid, x + 0.5, y + 0.5, 0.42)) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }

  // Position envoyée par le client (mouvement prédit localement) : validée ici.
  applyClientState(id, s) {
    const p = this.players.get(id);
    if (!p || p.botControl || this.mission.ended) return;
    if (typeof s.a === 'number') p.angle = s.a;
    if (typeof s.l === 'boolean') p.light = s.l && p.battery > 0;
    if (s.m === 'sneak' || s.m === 'walk' || s.m === 'sprint') p.moveMode = s.m;
    if (s.tp !== p.tp) return; // le client n'a pas encore pris en compte une téléportation
    if (p.hidden || p.state === 'extracted' || p.state === 'left') return;
    const nx = Number(s.x), ny = Number(s.y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    const dt = clamp(this.time - p.lastStateT, 0.02, 0.4);
    p.lastStateT = this.time;
    const maxSpeed = (p.state === 'dead' ? SIM.ghostSpeed : p.state === 'downed' ? SIM.crawlSpeed : SIM.sprintSpeed) * 1.6;
    let dx = nx - p.x, dy = ny - p.y;
    const d = Math.hypot(dx, dy);
    const allowed = maxSpeed * dt + 0.3;
    if (d > allowed) { dx *= allowed / d; dy *= allowed / d; }
    if (p.state === 'dead') { p.x = clamp(p.x + dx, 0.5, this.map.w - 0.5); p.y = clamp(p.y + dy, 0.5, this.map.h - 0.5); return; }
    const r = moveCircle(this.map.grid, p.x, p.y, dx, dy, SIM.playerRadius);
    p.x = r.x; p.y = r.y;
    if (d > allowed + 1) p.tp++; // trop d'écart : le client se recale
  }

  playerEnv(p) {
    let speedMul = 1;
    const it = p.carry ? this.items.get(p.carry) : null;
    if (it) {
      const w = it.def.weight;
      const helped = it.helper && this.players.get(it.helper)?.state === 'alive';
      if (w >= 4) speedMul = helped ? 0.85 : (it.def.twoHanded ? 0.38 : 0.5);
      else if (w === 3) speedMul = helped ? 0.92 : 0.7;
      else if (w === 2) speedMul = 0.9;
    }
    for (const o of this.items.values()) if (o.helper === p.id) speedMul = Math.min(speedMul, 0.85);
    const friction = this.mods.friction * (p.equipment === 'sneakers' ? 0.8 : 1);
    return { speedMul, friction };
  }

  // ---------------------------------------------------------------- ACTIONS
  interact(p) {
    if (this.mission.ended) return;
    if (p.state === 'dead') { this.boo(p); return; }
    if (p.state !== 'alive') return;
    if (p.hidden !== null && p.hidden !== undefined) { this.exitLocker(p); return; }
    p.holding = true;
    // 1. réanimer
    const downed = [...this.players.values()].find((o) => o !== p && o.state === 'downed' && dist(o.x, o.y, p.x, p.y) < SIM.interactRange);
    if (downed) { p.channel = { kind: 'revive', target: downed.id, t: 0 }; return; }
    // 2. levier du fourgon
    const lv = this.map.lever;
    if (dist(lv.x, lv.y, p.x, p.y) < SIM.interactRange) {
      if (this.mission.deposited >= this.mission.quota && !this.mission.departing) { p.channel = { kind: 'lever', t: 0 }; return; }
      if (!this.mission.departing) { this.privateMsg(p, `Quota non atteint : ${Math.round(this.mission.deposited)} / ${this.mission.quota} cr`); }
    }
    // 3. monte-charge
    const el = this.map.elevators.find((e) => dist(e.x, e.y, p.x, p.y) < 0.9);
    if (el && p.elevatorCd <= 0) { this.useElevator(p, el); return; }
    // 4. lâcher l'objet porté
    if (p.carry) { this.dropCarried(p, { reason: 'drop' }); return; }
    // 5. ramasser
    let best = null, bs = Infinity;
    for (const it of this.items.values()) {
      if (it.fallT > 0) continue;
      const d = dist(it.x, it.y, p.x, p.y);
      if (d > SIM.interactRange + it.def.radius) continue;
      if (it.carriedBy && (it.def.weight < 3 || it.helper || !this.players.has(it.carriedBy))) continue;
      const facing = Math.abs(Math.atan2(it.y - p.y, it.x - p.x) - p.angle) % (Math.PI * 2);
      const s = d + (facing > 1.2 ? 0.5 : 0);
      if (s < bs) { bs = s; best = it; }
    }
    if (best) { this.grabItem(p, best); return; }
    // 6. porte
    const door = this.nearestDoor(p.x, p.y, SIM.interactRange + 0.3);
    if (door) { this.setDoor(door.x, door.y, !this.map.grid.doorOpen[door.i], p.id, p.moveMode === 'sprint' ? 6 : 2.5); return; }
    // 7. casier
    const locker = this.map.lockers.find((l) => dist(l.x, l.y, p.x, p.y) < SIM.interactRange);
    if (locker) { this.enterLocker(p, locker); return; }
  }

  release(p) { p.holding = false; p.channel = null; }

  nearestDoor(x, y, range) {
    const grid = this.map.grid;
    let best = null, bd = range;
    for (const i of this.map.doors) {
      if (grid.doorBroken[i]) continue;
      const dx = (i % grid.w) + 0.5, dy = ((i / grid.w) | 0) + 0.5;
      const d = dist(x, y, dx, dy);
      if (d < bd) { bd = d; best = { i, x: i % grid.w, y: (i / grid.w) | 0 }; }
    }
    return best;
  }

  // Porte poussée en marchant (client ou bot)
  bumpDoor(p, tx, ty) {
    const grid = this.map.grid;
    if (p.state !== 'alive') return;
    if (grid.get(tx, ty) !== T.DOOR || grid.doorOpen[grid.idx(tx, ty)]) return;
    if (dist(p.x, p.y, tx + 0.5, ty + 0.5) > 1.4) return;
    this.setDoor(tx, ty, true, p.id, p.speed > SIM.walkSpeed * 1.1 ? 6 : 2.5);
  }

  setDoor(tx, ty, open, sourceId, loudness = 2.5) {
    const grid = this.map.grid, i = grid.idx(tx, ty);
    if (grid.get(tx, ty) !== T.DOOR || grid.doorBroken[i]) return;
    if (!!grid.doorOpen[i] === !!open) return;
    if (!open) {
      // ne jamais refermer une porte sur quelqu'un / quelque chose
      const blocked = [...this.players.values()].some((p) => p.state !== 'dead' && Math.abs(p.x - tx - 0.5) < 0.9 && Math.abs(p.y - ty - 0.5) < 0.9)
        || this.monsters.some((m) => Math.abs(m.x - tx - 0.5) < 0.95 && Math.abs(m.y - ty - 0.5) < 0.95)
        || [...this.items.values()].some((it) => !it.carriedBy && Math.floor(it.x) === tx && Math.floor(it.y) === ty);
      if (blocked) return;
    }
    grid.doorOpen[i] = open ? 1 : 0;
    if (loudness > 0) emitNoise(this, { x: tx + 0.5, y: ty + 0.5, loudness, type: 'door', source: sourceId });
  }

  breakDoor(tx, ty, src) {
    const grid = this.map.grid, i = grid.idx(tx, ty);
    if (grid.get(tx, ty) !== T.DOOR || grid.doorBroken[i]) return;
    grid.doorOpen[i] = 1; grid.doorBroken[i] = 1;
    emitNoise(this, { x: tx + 0.5, y: ty + 0.5, loudness: 10, type: 'door_smash', source: src?.id });
    this.emitSfx('smash', tx + 0.5, ty + 0.5);
  }

  breakWall(tx, ty, src) {
    const grid = this.map.grid;
    if (grid.get(tx, ty) !== T.CRACKED) return;
    grid.set(tx, ty, T.FLOOR);
    this.tileChanges.push([grid.idx(tx, ty), T.FLOOR]);
    // le pan entier s'effondre
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid.get(tx + dx, ty + dy) === T.CRACKED) this.breakWall(tx + dx, ty + dy, src);
    if (!this.flags.has('secretOpened')) {
      this.flags.add('secretOpened');
      emitNoise(this, { x: tx + 0.5, y: ty + 0.5, loudness: 13, type: 'wall_break', source: typeof src === 'string' ? src : src?.id });
      this.emitSfx('wallbreak', tx + 0.5, ty + 0.5);
      this.announce('Un mur s\'est effondré… une pièce secrète !', 'secret');
      this.highlight('secret', 'Pièce secrète découverte !', typeof src === 'string' ? src : null, tx, ty, true);
    }
  }

  grabItem(p, it) {
    if (p.carry || p.state !== 'alive') return;
    if (it.carriedBy) {
      // aider à porter un objet lourd
      const carrier = this.players.get(it.carriedBy);
      if (carrier && it.def.weight >= 3 && !it.helper && carrier !== p) {
        it.helper = p.id;
        this.privateMsg(p, `Vous aidez ${carrier.name} à porter : ${it.def.name}`);
      }
      return;
    }
    it.carriedBy = p.id; it.helper = null; it.vx = 0; it.vy = 0; it.lastTouch = p.id; it.fallT = 0;
    p.carry = it.id;
    emitNoise(this, { x: it.x, y: it.y, loudness: 1.2 + it.def.weight * 0.5, type: 'impact', source: p.id });
  }

  dropCarried(p, opts = {}) {
    const it = p.carry ? this.items.get(p.carry) : null;
    p.carry = null;
    if (!it) return;
    it.carriedBy = null; it.helper = null;
    it.lastDroppedBy = p.id;
    const a = p.angle;
    const pos = unstick(this.map.grid, p.x + Math.cos(a) * 0.5, p.y + Math.sin(a) * 0.5, it.def.radius);
    it.x = pos.x; it.y = pos.y;
    const fling = opts.fling || 0;
    if (fling) {
      const fa = a + this.rng.range(-1.2, 1.2);
      it.vx = Math.cos(fa) * fling; it.vy = Math.sin(fa) * fling;
    } else {
      it.vx = p.vx * 0.5; it.vy = p.vy * 0.5;
      emitNoise(this, { x: it.x, y: it.y, loudness: 1 + it.def.weight * 0.8 * it.def.loud, type: 'impact', source: p.id });
    }
    it.lastTouch = p.id;
  }

  throwItem(p) {
    if (p.state !== 'alive' || !p.carry) return;
    const it = this.items.get(p.carry);
    this.dropCarried(p, { reason: 'throw' });
    if (!it) return;
    const speed = 9.5 / Math.sqrt(it.def.weight);
    it.vx = Math.cos(p.angle) * speed + p.vx * 0.5;
    it.vy = Math.sin(p.angle) * speed + p.vy * 0.5;
    it.thrownBy = p.id; it.thrownT = this.time;
    emitNoise(this, { x: p.x, y: p.y, loudness: 2, type: 'impact', source: p.id });
  }

  useUtility(p) {
    if (p.state !== 'alive' || p.hidden) return;
    const eq = p.equipment;
    if (eq === 'decoy' && p.charges > 0) {
      p.charges--;
      const it = createItem(this, 'decoy', p.x + Math.cos(p.angle) * 0.5, p.y + Math.sin(p.angle) * 0.5);
      it.vx = Math.cos(p.angle) * 10; it.vy = Math.sin(p.angle) * 10;
      it.decoyT = 3.2; it.lastTouch = p.id; it.thrownBy = p.id; it.thrownT = this.time;
      unstickItem(this, it);
    } else if (eq === 'flare' && p.charges > 0) {
      p.charges--;
      const it = createItem(this, 'decoy', p.x, p.y);
      it.vx = Math.cos(p.angle) * 8; it.vy = Math.sin(p.angle) * 8;
      it.flareT = 12; it.decoyT = -1; it.isFlare = true; it.lastTouch = p.id;
    } else if (eq === 'medkit' && p.charges > 0 && p.hp < SIM.maxHp) {
      p.charges--;
      p.hp = Math.min(SIM.maxHp, p.hp + 1);
      this.emitSfx('heal', p.x, p.y);
      this.privateMsg(p, 'Soigné (+1 PV)');
    }
  }

  enterLocker(p, l) {
    if (p.state !== 'alive' || p.hidden !== null) return;
    const occ = this.lockerOccupants(l.id);
    if (occ.length >= 2) { this.privateMsg(p, 'Casier plein !'); return; }
    if (p.carry) this.dropCarried(p, { reason: 'hide' });
    p.hidden = l.id; p.x = l.x; p.y = l.y; p.vx = 0; p.vy = 0; p.tp++;
    p.channel = null;
    emitNoise(this, { x: l.x, y: l.y, loudness: 2.2, type: 'locker', source: p.id });
    if (occ.length === 1) {
      this.announce(`${occ[0].name} et ${p.name} partagent un casier. C'est étroit.`, 'funny');
      this.highlight('locker', `${occ[0].name} et ${p.name} cachés dans le même casier`, p.id, l.x, l.y, false);
    }
  }

  exitLocker(p) {
    const l = this.map.lockers.find((lk) => lk.id === p.hidden);
    p.hidden = null;
    if (l) {
      const pos = unstick(this.map.grid, l.x + Math.cos(l.face) * 0.6, l.y + Math.sin(l.face) * 0.6, SIM.playerRadius);
      p.x = pos.x; p.y = pos.y;
      emitNoise(this, { x: l.x, y: l.y, loudness: 2.2, type: 'locker', source: p.id });
    }
    p.tp++;
  }

  useElevator(p, el) {
    let dest;
    if (this.mods.elevatorRandom) {
      const rooms = this.map.rooms.filter((r) => !r.secret);
      dest = this.randomPointInRoom(this.rng.pick(rooms));
      this.privateMsg(p, 'Le monte-charge vous a déposé… quelque part.');
    } else {
      const other = this.map.elevators[el.pair];
      dest = { x: other.x, y: other.y };
    }
    if (!dest) return;
    emitNoise(this, { x: el.x, y: el.y, loudness: 5, type: 'elevator', source: p.id });
    const pos = unstick(this.map.grid, dest.x, dest.y + 0.01, SIM.playerRadius);
    p.x = pos.x; p.y = pos.y; p.vx = 0; p.vy = 0; p.tp++;
    p.elevatorCd = 3;
    const it = p.carry ? this.items.get(p.carry) : null;
    if (it) { it.helper = null; }
    emitNoise(this, { x: p.x, y: p.y, loudness: 5, type: 'elevator', source: p.id });
    this.emitSfx('ding', p.x, p.y);
  }

  boo(p) {
    if (p.state !== 'dead' || p.booCd > 0) return;
    p.booCd = 5;
    p.stats.boos++;
    emitNoise(this, { x: p.x, y: p.y, loudness: 3.5, type: 'boo', source: p.id });
    this.outMsgs.push({ k: 'bubble', id: p.id, text: 'Bouh !', kind: 'ghost' });
  }

  emote(p, id, text) {
    if (typeof text !== 'string' || text.length > 4) return;
    p.emote = { id, text, until: this.time + 2.5 };
  }

  setVoice(p, level, radio) {
    p.voiceLevel = clamp(Number(level) || 0, 0, 1);
    p.voiceT = this.time;
    p.radioTx = !!radio && hasRadioP(p) && !this.mods.radioDisabled;
  }

  chat(p, text) {
    const t = String(text || '').slice(0, 140).trim();
    if (!t) return;
    this.outMsgs.push({ k: 'chat', id: p.id, name: p.name, text: t, dead: p.state === 'dead' });
    if (p.state === 'alive') emitNoise(this, { x: p.x, y: p.y, loudness: 2, type: 'chat', source: p.id });
  }

  botSpeak(p, text, loud = 'talk') {
    this.outMsgs.push({ k: 'bubble', id: p.id, text, kind: 'bot' });
    if (p.state === 'dead') return;
    emitNoise(this, { x: p.x, y: p.y, loudness: (loud === 'scream' ? 11 : 5) * this.mods.voiceNoise, type: loud === 'scream' ? 'scream' : 'voice', source: p.id });
  }

  say(m, text, kind) { this.outMsgs.push({ k: 'bubble', id: m.id, text, kind, x: m.x, y: m.y }); }
  emitSfx(name, x, y) { this.outMsgs.push({ k: 'sfx', name, x, y }); }
  announce(text, kind = 'info', extra = {}) { this.outMsgs.push({ k: 'announce', text, kind, ...extra }); }
  privateMsg(p, text) { this.outMsgs.push({ k: 'private', to: p.id, text }); }
  ping(x, y, label, dur) { this.pings.push({ x, y, label, until: this.time + dur }); }
  shake(x, y, amp) { this.outMsgs.push({ k: 'shake', x, y, amp }); }
  flag(name) { this.flags.add(name); }
  signal(name, data) {
    if (name === 'inspectorControl' || name === 'monsterExposed') this.mission.alerts++;
    this.director.signal(name, data);
  }
  spawnItem(type, x, y) { return createItem(this, type, x, y); }

  highlight(kind, text, playerId, x, y, withReplay) {
    const h = { t: Math.round(this.time), kind, text, player: playerId };
    if (withReplay && this.replays.length < 5) { h.replay = this.replays.length; this.replays.push({ text, frames: this.replay.capture(), x, y }); }
    this.highlights.push(h);
    this.outMsgs.push({ k: 'highlight', text });
  }

  knockback(p, angle, force) {
    p.kb = [p.kb[0] + 1, Math.cos(angle) * force, Math.sin(angle) * force];
    if (p.botControl) { p.vx += Math.cos(angle) * force; p.vy += Math.sin(angle) * force; }
  }

  damagePlayer(p, dmg, src, opts = {}) {
    if (p.state !== 'alive' || p.invulnT > 0 || this.mission.ended) return;
    const carried = p.carry ? this.items.get(p.carry) : null;
    p.lastHit = { monsterType: src?.type, t: this.time, carried: carried?.id, carriedValue: carried?.value };
    if (carried) p.lastHit.carriedName = carried.def.name;
    p.hp -= dmg;
    p.invulnT = 1.4; p.hurtT = 1.5;
    p.stats.hits++;
    const a = opts.dir ?? (src ? angleTo(src.x, src.y, p.x, p.y) : 0);
    this.knockback(p, a, opts.knock || 5);
    if (p.carry) this.dropCarried(p, { fling: 3, reason: 'hit' });
    this.emitSfx('hit', p.x, p.y);
    emitNoise(this, { x: p.x, y: p.y, loudness: 8, type: 'scream', source: p.id });
    if (p.isBot || p.botControl) this.chatter.say(p, 'hurt', {}, { force: true });
    if (p.hp <= 0) this.downPlayer(p, src);
  }

  downPlayer(p, src) {
    p.state = 'downed'; p.hp = 0; p.downT = SIM.bleedOutTime; p.channel = null; p.holding = false;
    if (p.hidden !== null) this.exitLocker(p);
    p.downedNear = [...this.players.values()].filter((o) => o !== p && o.state === 'alive' && dist(o.x, o.y, p.x, p.y) < 10).map((o) => o.id);
    this.announce(`${p.name} est à terre !`, 'down', { player: p.id });
    for (const o of this.players.values()) if (o !== p && o.brain && o.state === 'alive') o.brain.decideT = 0;
  }

  killPlayer(p, cause) {
    if (p.state === 'dead') return;
    const c = deathCause(this, p, cause);
    p.stats.deathCause = c.text; p.stats.absurd = c.absurd; p.stats.deaths++;
    p.state = 'dead'; p.hidden = null; p.carry = null; p.channel = null;
    p.light = false;
    // qui l'a « oublié » ?
    for (const id of p.downedNear || []) {
      const o = this.players.get(id);
      if (o && o.state === 'alive' && dist(o.x, o.y, p.x, p.y) > 14) o.stats.abandons++;
    }
    this.announce(`${p.name} est mort. ${c.text}.`, 'death', { player: p.id });
    this.highlight('death', `${p.name} : ${c.text}`, p.id, p.x, p.y, true);
  }

  revive(p, by) {
    p.state = 'alive'; p.hp = 1; p.invulnT = 2; p.downT = 0;
    by.stats.revives++;
    if (p.downTLeft !== undefined && p.downTLeft < 3) { by.stats.lastSecond = true; this.highlight('save', `${by.name} relève ${p.name} à la dernière seconde !`, by.id, p.x, p.y, true); }
    this.announce(`${by.name} a relevé ${p.name} !`, 'revive');
    if (p.brain) this.chatter.say(p, 'revived', {}, { force: true });
  }

  confiscate(m, p, item) {
    this.dropCarried(p, { reason: 'confiscated' });
    item.carriedBy = m.id; item.vx = 0; item.vy = 0;
    p.stats.confiscated++;
    this.highlight('confiscate', `L'Inspecteur a confisqué ${item.def.name} à ${p.name}`, p.id, p.x, p.y, false);
  }

  releaseItem(item, x, y) {
    item.carriedBy = null;
    const pos = unstick(this.map.grid, x, y, item.def.radius);
    item.x = pos.x; item.y = pos.y;
  }

  // ---------------------------------------------------------------- BOUCLE
  step(dt) {
    if (this.mission.ended) return;
    this.time += dt;
    // on ne garde que les bruits de ce pas et du précédent
    while (this.noises.length && this.noises[0].t < this.time - dt * 1.5) this.noises.shift();

    for (const p of this.players.values()) this.updatePlayer(p, dt);
    this.updateCarried();
    updateItems(this, dt);
    this.updateGadgets(dt);
    this.updateMission(dt);
    this.spawner.update();
    if (this.mods.aggro || this.mission.departing) this.aggroPulse(dt);
    for (const m of this.monsters) m.update(dt);
    this.director.update(dt);
    this.replay.update(this, dt);
    this.pings = this.pings.filter((pg) => pg.until > this.time);
  }

  updatePlayer(p, dt) {
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.flickerT = Math.max(0, p.flickerT - dt);
    p.elevatorCd = Math.max(0, p.elevatorCd - dt);
    p.booCd = Math.max(0, p.booCd - dt);
    if (p.emote && p.emote.until < this.time) p.emote = null;
    if (p.state === 'extracted' || p.state === 'left') return;

    if (p.botControl && p.brain) {
      p.brain.update(dt);
      if (!p.hidden && p.state !== 'extracted') {
        const env = this.playerEnv(p);
        stepMovement(this.map.grid, p, p.brain.input, env, dt);
        p.moveMode = p.brain.input.mode;
      }
    }
    // distance parcourue depuis le pas précédent (humains : positions reçues du client ; bots : IA)
    let moved = Math.hypot(p.x - (p.px ?? p.x), p.y - (p.py ?? p.y));
    if (moved > 2.5) moved = 0; // téléportation (monte-charge, casier…)
    p.px = p.x; p.py = p.y;
    p.speed = p.speed * 0.6 + (moved / dt) * 0.4;
    const inVan = this.inVan(p.x, p.y);
    if (inVan && !p.wasInVan) p.enteredVanT = this.time;
    p.wasInVan = inVan;

    if (p.state === 'downed') {
      p.downT -= dt;
      p.downTLeft = p.downT;
      if (p.downT <= 0) this.killPlayer(p, 'bleed');
      return;
    }
    if (p.state === 'dead') return;

    // endurance
    const sprinting = p.speed > SIM.walkSpeed * 1.15;
    p.stamina = clamp(p.stamina + (sprinting ? -SIM.staminaDrain : SIM.staminaRegen) * dt, 0, 1);
    // batterie
    if (p.light) {
      p.battery = Math.max(0, p.battery - SIM.batteryDrain * (p.equipment === 'bigLight' ? 2 : 1) * dt);
      if (p.battery <= 0) p.light = false;
    } else p.battery = Math.min(1, p.battery + SIM.batteryRegen * dt);

    // bruits de pas, calculés depuis la vitesse réelle (impossible de tricher)
    if (!p.hidden && moved > 0.001) {
      p.stepAcc += moved;
      const stride = sprinting ? 0.85 : 0.6;
      if (p.stepAcc >= stride) {
        p.stepAcc = 0;
        const t = this.map.grid.get(Math.floor(p.x), Math.floor(p.y));
        let loud = p.speed < SIM.sneakSpeed * 1.2 ? 0.9 : sprinting ? 5.5 : 2.6;
        if (p.equipment === 'sneakers') loud *= 0.6;
        let type = 'step';
        if (t === T.DEBRIS) { loud = Math.max(3.2, loud * 2.2); type = 'step_debris'; }
        else if (t === T.GRATE) { loud = Math.max(2.2, loud * 1.6); type = 'step_grate'; }
        const it = p.carry ? this.items.get(p.carry) : null;
        if (it && it.def.weight >= 3) loud += 1;
        emitNoise(this, { x: p.x, y: p.y, loudness: loud, type, source: p.id });
      }
    }
    // voix (niveau micro mesuré par le client ou parole de bot)
    if (this.time - p.voiceT > 0.6) { p.voiceLevel = 0; p.radioTx = false; }
    if (p.voiceLevel > 0.015 && !p.isBot) {
      p.voiceAcc = (p.voiceAcc || 0) + dt;
      if (p.voiceAcc > 0.25) {
        p.voiceAcc = 0;
        const loud = (1.5 + p.voiceLevel * 14) * this.mods.voiceNoise * (p.hidden !== null ? 0.6 : 1);
        emitNoise(this, { x: p.x, y: p.y, loudness: loud, type: p.voiceLevel > 0.6 ? 'scream' : 'voice', source: p.id });
        if (p.radioTx) {
          p.radioBattery = Math.max(0, p.radioBattery - 0.0125);
          for (const o of this.players.values()) {
            if (o !== p && o.state !== 'dead' && hasRadioP(o)) emitNoise(this, { x: o.x, y: o.y, loudness: 3.5, type: 'radio', source: o.id });
          }
        }
      }
    }
    // poursuite la plus longue
    const chased = this.monsters.some((m) => m.target === p.id && ['chase', 'charge', 'lunge', 'stalk'].includes(m.state) && dist(m.x, m.y, p.x, p.y) < 12);
    if (chased) p.stats.chaseT += dt;
    else { if (p.stats.chaseT > p.stats.longestChase && p.state === 'alive') p.stats.longestChase = p.stats.chaseT; p.stats.chaseT = 0; }

    // actions maintenues (réanimation, levier)
    if (p.channel) {
      const ch = p.channel;
      if (ch.kind === 'revive') {
        const o = this.players.get(ch.target);
        if (!o || o.state !== 'downed' || dist(o.x, o.y, p.x, p.y) > SIM.interactRange + 0.4) { p.channel = null; }
        else {
          ch.t += dt * (p.equipment === 'medkit' ? 2 : 1);
          if (ch.t >= SIM.reviveTime) { this.revive(o, p); p.channel = null; }
        }
      } else if (ch.kind === 'lever') {
        if (dist(this.map.lever.x, this.map.lever.y, p.x, p.y) > SIM.interactRange + 0.4 || this.mission.departing) p.channel = null;
        else { ch.t += dt; if (ch.t >= SIM.leverTime) { this.startDeparture(p); p.channel = null; } }
      }
    }
  }

  updateCarried() {
    for (const it of this.items.values()) {
      if (!it.carriedBy) continue;
      const p = this.players.get(it.carriedBy);
      if (p) {
        if (p.state !== 'alive' || p.carry !== it.id) { it.carriedBy = null; if (p.carry === it.id) p.carry = null; continue; }
        const off = SIM.playerRadius + it.def.radius + 0.05;
        const tx = p.x + Math.cos(p.angle) * off, ty = p.y + Math.sin(p.angle) * off;
        if (!collides(this.map.grid, tx, ty, it.def.radius * 0.8)) { it.x = tx; it.y = ty; } else { it.x = p.x; it.y = p.y; }
        if (it.helper) {
          const h = this.players.get(it.helper);
          if (!h || h.state !== 'alive' || h.carry || dist(h.x, h.y, it.x, it.y) > 1.9) it.helper = null;
        }
        if (it.def.squeak) {
          it.squeakT -= 1 / SIM.tickRate;
          if (it.squeakT <= 0 && p.speed > 0.3) { it.squeakT = 1.1; emitNoise(this, { x: it.x, y: it.y, loudness: 3.5, type: 'squeak', source: p.id }); }
        }
      } else {
        const m = this.monsters.find((mm) => mm.id === it.carriedBy);
        if (!m) { it.carriedBy = null; continue; }
        it.x = m.x + Math.cos(m.angle) * 0.5; it.y = m.y + Math.sin(m.angle) * 0.5;
      }
    }
    // poussée des objets au sol quand on marche dedans
    for (const p of this.players.values()) {
      if (p.state !== 'alive' || p.hidden) continue;
      for (const it of this.items.values()) {
        if (it.carriedBy || it.fallT > 0) continue;
        const min = SIM.playerRadius + it.def.radius;
        const dx = it.x - p.x, dy = it.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) / Math.max(1, it.def.weight * 0.7);
          it.x += dx / d * push; it.y += dy / d * push;
          const sp = Math.hypot(p.vx, p.vy) || p.speed;
          if (sp > SIM.walkSpeed * 1.2 && it.def.weight <= 2) {
            // on « shoote » dans les petits objets en courant
            it.vx += dx / d * sp * 0.9; it.vy += dy / d * sp * 0.9; it.lastTouch = p.id;
          }
          const fixed = unstickItemPos(this, it);
          it.x = fixed.x; it.y = fixed.y;
        }
      }
    }
  }

  updateGadgets(dt) {
    for (const it of [...this.items.values()]) {
      if (it.decoyT > 0 && Math.hypot(it.vx, it.vy) < 1.5) {
        it.decoyT -= dt;
        if (it.decoyT <= 0) {
          it.decoyPulses = 4;
          it.decoyPulseT = 0;
        }
      }
      if (it.decoyPulses > 0) {
        it.decoyPulseT -= dt;
        if (it.decoyPulseT <= 0) {
          it.decoyPulseT = 0.8; it.decoyPulses--;
          emitNoise(this, { x: it.x, y: it.y, loudness: 15, type: 'decoy', source: it.id });
          if (it.decoyPulses === 0) this.items.delete(it.id);
        }
      }
      if (it.isFlare) {
        it.flareT -= dt;
        it.flareNoiseT = (it.flareNoiseT || 0) - dt;
        if (it.flareNoiseT <= 0) { it.flareNoiseT = 1; emitNoise(this, { x: it.x, y: it.y, loudness: 4, type: 'flare', source: it.id }); }
        if (it.flareT <= 0) this.items.delete(it.id);
      }
    }
    this.flares = [...this.items.values()].filter((it) => it.isFlare).map((it) => ({ x: it.x, y: it.y }));
  }

  // Heure de fermeture / départ : les créatures « sentent » les joueurs (bruit interne non envoyé)
  aggroPulse(dt) {
    this.aggroT = (this.aggroT || 0) - dt;
    if (this.aggroT > 0) return;
    this.aggroT = 3;
    for (const p of this.alivePlayers()) {
      if (p.hidden) continue;
      emitNoise(this, { x: p.x, y: p.y, loudness: this.mission.departing && !this.mods.aggro ? 7 : 14, type: 'step', source: p.id, internal: true });
    }
  }

  // ---------------------------------------------------------------- MISSION
  updateMission(dt) {
    const m = this.mission;
    // chargement des objets posés dans le fourgon
    for (const it of [...this.items.values()]) {
      if (it.carriedBy || it.fallT > 0 || it.def.noLoot) continue;
      if (this.inVan(it.x, it.y) && Math.hypot(it.vx, it.vy) < 1.2) {
        it.inVanT += dt;
        if (it.inVanT > 0.6) this.depositItem(it);
      } else it.inVanT = 0;
      // canard du contrôle qualité
      if (this.quest && !this.quest.done && it.id === this.quest.item && dist(it.x, it.y, this.quest.x, this.quest.y) < this.quest.r) {
        this.quest.done = true;
        m.bonus += this.quest.reward;
        this.items.delete(it.id);
        this.announce(`CONTRÔLE QUALITÉ VALIDÉ ! +${this.quest.reward} cr`, 'success');
        this.emitSfx('quack', it.x, it.y);
      }
    }
    if (!m.quotaReachedSignaled && m.deposited >= m.quota) {
      m.quotaReachedSignaled = true;
      this.announce('QUOTA ATTEINT ! Tirez le levier du fourgon pour partir… ou continuez (prime au-delà du quota).', 'success');
      this.signal('quotaReached', {});
    }
    if (this.customer && this.customer.until < this.time) this.customer = null;

    if (!m.departing) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0 && !m.aggro) {
        m.aggro = true; m.timeLeft = 0;
        this.announce('HEURE DE FERMETURE ! Toutes les créatures chassent. Le fourgon démarre !', 'danger');
        this.director.recompute();
        this.startDeparture(null);
      }
    } else {
      m.departT -= dt;
      m.engineT = (m.engineT || 0) - dt;
      if (m.engineT <= 0) {
        m.engineT = 2;
        const v = this.map.van;
        emitNoise(this, { x: v.x + v.w / 2, y: v.y + v.h / 2, loudness: 16, type: 'engine', source: 'van' });
      }
      if (m.departT <= 0) this.finish('departure');
    }
    // défaite : plus personne debout pendant 4 s
    const standing = [...this.players.values()].some((p) => p.state === 'alive');
    m.wipeT = standing ? 0 : m.wipeT + dt;
    if (m.wipeT > 4) this.finish('wipe');
  }

  depositItem(it) {
    const m = this.mission;
    let value = it.value * this.mods.valueMul;
    if (this.customer && !this.customer.done && it.type === this.customer.type) {
      value *= 2; this.customer.done = true;
      this.announce(`Le client est ravi ! ${it.def.name} payé DOUBLE.`, 'success');
    }
    m.deposited += value;
    this.items.delete(it.id);
    const p = this.players.get(it.lastTouch);
    if (p) {
      p.stats.deposited += value; p.stats.depositedCount++;
      if (it.def.fragile >= 0.6 && it.value >= it.baseValue * 0.9) p.stats.fragileIntact++;
      if (it.def.weight >= 3) p.stats.heavyExtracted++;
    }
    this.extracted.push({ type: it.type, value: Math.round(value), fragileIntact: it.def.fragile >= 0.6 && it.value >= it.baseValue * 0.9, heavy: it.def.weight >= 4 });
    this.emitSfx('kaching', it.x, it.y);
    emitNoise(this, { x: it.x, y: it.y, loudness: 3, type: 'kaching', source: it.lastTouch });
    if (it.type === 'golden_gnome') this.highlight('gnome', 'Le NAIN DE JARDIN DORÉ est dans le fourgon !', p?.id, it.x, it.y, false);
  }

  startDeparture(by) {
    const m = this.mission;
    if (m.departing) return;
    m.departing = true; m.departT = SIM.departureTime; m.engineT = 0;
    this.announce(`${by ? by.name + ' a tiré le levier. ' : ''}LE FOURGON PART DANS ${SIM.departureTime} SECONDES !`, 'danger');
    this.emitSfx('engine_start', this.map.van.x, this.map.van.y);
  }

  finish(reason) {
    const m = this.mission;
    if (m.ended) return;
    m.ended = true;
    m.endReason = reason;
    if (reason === 'departure') {
      for (const p of this.players.values()) {
        if (p.state === 'dead') continue;
        if (this.inVan(p.x, p.y)) {
          if (p.enteredVanT !== undefined && this.time - p.enteredVanT < 1.5) {
            p.stats.lastSecond = true;
            this.highlight('last_second', `${p.name} saute dans le fourgon à la dernière seconde !`, p.id, p.x, p.y, true);
          }
          p.state = 'extracted';
        } else this.killPlayer(p, 'left');
      }
      m.success = m.deposited >= m.quota;
    } else {
      m.success = false;
    }
    // valeur abandonnée : objets lâchés hors du fourgon et jamais chargés
    for (const it of this.items.values()) {
      const p = this.players.get(it.lastDroppedBy);
      if (p && !it.def.noLoot && !it.def.quest) p.stats.abandonedValue += it.value;
    }
    this.result = this.buildResult();
    this.outMsgs.push({ k: 'end', reason, success: m.success });
  }

  buildResult() {
    const m = this.mission;
    const players = [...this.players.values()];
    const awards = computeAwards(players);
    const sideDone = this.sideObjectives.filter((o) => this.checkSide(o));
    const sideBonus = sideDone.reduce((s, o) => s + o.reward, 0);
    const total = m.deposited + m.bonus;
    const humans = players.filter((p) => !p.isBot);
    const share = (total * 0.3 * this.diff.rewardMul) / Math.max(1, Math.sqrt(humans.length));
    return {
      success: m.success, reason: m.endReason, quota: m.quota, deposited: Math.round(m.deposited), bonus: Math.round(m.bonus + sideBonus),
      mission: this.missionId, missionName: this.missionDef.name, difficulty: this.diffId, variant: this.variant.name, seed: this.seed,
      time: Math.round(this.time), timeLeft: Math.round(m.timeLeft),
      eventsSeen: this.director.history.slice(), monstersSeen: [...new Set(this.monsters.map((mm) => mm.type))],
      extractedTypes: this.extracted.map((e) => e.type), flags: [...this.flags],
      side: this.sideObjectives.map((o) => ({ id: o.id, name: o.name, reward: o.reward, done: sideDone.includes(o) })),
      awards, highlights: this.highlights, replays: this.replays,
      map: { w: this.map.w, h: this.map.h, tiles: Array.from(this.map.grid.tiles).join('') },
      players: players.map((p) => {
        const survived = p.state === 'extracted';
        const base = m.success ? share * (survived ? 1 : 0.4) : share * 0.15;
        const myAwards = awards.filter((a) => a.player === p.id).map((a) => a.id);
        const coins = Math.round(base + (m.success ? 60 + sideBonus / Math.max(1, humans.length) : 15) + myAwards.length * 25 + p.stats.revives * 30);
        const xp = Math.round(80 + p.stats.deposited * 0.25 + (survived ? 70 : 0) + (m.success ? 120 : 0) + p.stats.revives * 40);
        return {
          id: p.id, name: p.name, bot: p.isBot, botProfile: p.botProfile, cosmetics: p.cosmetics,
          survived, state: p.state, stats: { ...p.stats }, awards: myAwards, coins, xp,
        };
      }),
    };
  }

  checkSide(o) {
    const m = this.mission;
    const ps = [...this.players.values()];
    switch (o.id) {
      case 'no_death': return m.success && ps.every((p) => p.state === 'extracted');
      case 'fragile3': return this.extracted.filter((e) => e.fragileIntact).length >= 3;
      case 'big_haul': return m.deposited >= m.quota * 1.5;
      case 'quiet': return m.success && m.alerts < 8;
      case 'heavy2': return this.extracted.filter((e) => e.heavy).length >= 2;
      case 'fast': return m.success && m.timeLeft > 120;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- RÉSEAU
  startInfo() {
    return {
      map: serializeMap(this.map),
      mission: { id: this.missionId, name: this.missionDef.name, brief: this.missionDef.brief, difficulty: this.diffId, variant: this.variant.name, variantDesc: this.variant.desc, quota: this.mission.quota, time: this.mission.timeLimit },
      side: this.sideObjectives.map((o) => ({ id: o.id, name: o.name, reward: o.reward })),
      roster: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, bot: p.isBot, botProfile: p.botProfile, cosmetics: p.cosmetics, equipment: p.equipment })),
      monsterTypes: this.spawner.queue.slice(),
    };
  }

  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    const grid = this.map.grid;
    const m = this.mission;
    const snap = {
      time: r2(this.time),
      players: [...this.players.values()].map((p) => {
        const env = this.playerEnv(p);
        return {
          id: p.id, x: r2(p.x), y: r2(p.y), a: r2(p.angle), st: p.state, hp: p.hp, c: p.carry, l: p.light ? 1 : 0,
          b: r2(p.battery), rb: r2(p.radioBattery), s: r2(p.stamina), h: p.hidden, m: p.moveMode, v: r2(p.voiceLevel), rt: p.radioTx ? 1 : 0,
          tp: p.tp, kb: p.kb, sm: r2(env.speedMul), fr: r2(env.friction), ch: p.charges, eq: p.equipment,
          bot: p.botControl ? 1 : 0, dc: p.connected ? 0 : 1, dn: p.state === 'downed' ? r2(p.downT) : 0,
          chan: p.channel ? [p.channel.kind, r2(p.channel.t / (p.channel.kind === 'revive' ? SIM.reviveTime / (p.equipment === 'medkit' ? 2 : 1) : SIM.leverTime))] : null,
          em: p.emote ? p.emote.text : null, fl: p.flickerT > 0 ? 1 : 0, hu: p.hurtT > 0 ? 1 : 0, sp: r2(p.speed),
        };
      }),
      monsters: this.monsters.map((mm) => mm.snapshot()),
      items: [...this.items.values()].map((it) => ({ id: it.id, k: it.type, x: r2(it.x), y: r2(it.y), c: it.carriedBy, v: Math.round(it.value), f: it.fallT > 0 ? r2(it.fallT) : 0, h: it.helper, d: it.decoyPulses > 0 || it.decoyT > 0 ? 1 : 0, fl: it.isFlare ? 1 : 0 })),
      doors: this.map.doors.map((i) => (grid.doorBroken[i] ? 2 : grid.doorOpen[i])).join(''),
      lamps: this.map.lamps.map((l) => (l.on ? 1 : 0)).join(''),
      tiles: this.tileChanges.splice(0),
      noises: this.netNoises.splice(0).map((n) => ({ x: r2(n.x), y: r2(n.y), t: n.type, l: r2(n.loudness), s: n.source, mi: n.mimic ? 1 : 0, dt: n.detune ? r2(n.detune) : 0 })),
      msgs: this.outMsgs.splice(0),
      ev: this.director.snapshot(),
      mods: { al: r2(this.mods.ambientLight), fr: r2(this.mods.flashlightRange), fk: this.mods.flicker, fx: this.mods.voiceFx, cf: this.mods.confetti, rv: this.mods.reveal, ft: this.mods.fakeTeammate, rd: this.mods.radioDisabled, fz: this.mods.monsterFreeze, sg: r2(this.mods.sight), ag: this.mods.aggro, gv: this.mods.floatItems, er: this.mods.elevatorRandom },
      mission: { q: m.quota, d: Math.round(m.deposited), b: Math.round(m.bonus), tl: Math.round(m.timeLeft), dep: m.departing ? r2(m.departT) : -1, ag: m.aggro ? 1 : 0, end: m.ended ? 1 : 0 },
      tension: r2(this.director.tension), phase: this.director.phase,
      fakeVan: this.fakeVan, quest: this.quest ? { x: this.quest.x, y: this.quest.y, r: this.quest.r, item: this.quest.item, done: this.quest.done } : null,
      customer: this.customer ? { type: this.customer.type, name: this.customer.name, x: this.customer.x, y: this.customer.y, done: this.customer.done } : null,
      flares: this.flares.map((f) => [r2(f.x), r2(f.y)]),
      pings: this.pings.map((pg) => ({ x: r2(pg.x), y: r2(pg.y), label: pg.label })),
    };
    return snap;
  }

  onEventStarted(def) {
    for (const p of this.players.values()) if (p.brain && p.state === 'alive') this.chatter.say(p, 'event', {}, { chance: 0.25 });
  }
}

// Index case → salle (les jointures entre cellules fusionnées appartiennent à la salle).
export function buildRoomGrid(map) {
  const cs = map.cellSize, CX = (map.w - 1) / cs;
  const g = new Int16Array(map.w * map.h).fill(-1);
  map.rooms.forEach((r, ri) => {
    const set = new Set(r.cells);
    for (const c of r.cells) {
      const cx = c % CX, cy = Math.floor(c / CX);
      const x1 = cx * cs + cs - 1 + (set.has(c + 1) && cx + 1 < CX ? 1 : 0);
      const y1 = cy * cs + cs - 1 + (set.has(c + CX) ? 1 : 0);
      for (let y = cy * cs + 1; y <= y1; y++) for (let x = cx * cs + 1; x <= x1; x++) g[y * map.w + x] = ri;
    }
  });
  return g;
}

function hasRadioP(p) { return p.equipment === 'radio' && p.radioBattery > 0; }

function unstickItem(game, it) { const pos = unstick(game.map.grid, it.x, it.y, it.def.radius); it.x = pos.x; it.y = pos.y; }
function unstickItemPos(game, it) { return collides(game.map.grid, it.x, it.y, it.def.radius) ? unstick(game.map.grid, it.x, it.y, it.def.radius) : { x: it.x, y: it.y }; }

export { MONSTERS };
