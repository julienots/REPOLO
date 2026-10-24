// Classe de base des créatures : déplacement par A*, ouverture des portes, perception,
// cycle chasse/repos, attaque. Le comportement spécifique est délégué à un module.
import { findPath } from '../../map/pathfinding.js';
import { moveCircle, T } from '../../map/grid.js';
import { angleTo, turnToward, dist } from '../../util/math.js';
import { monsterSees } from '../perception.js';
import { perceived, emitNoise } from '../noise.js';
import { SIM } from '../../config/game.js';

let nextMonsterId = 1;
const PUBLIC_EX = ['click', 'creak', 'stomp', 'bell', 'lantern', 'disguised', 'as', 'watched', 'frozen'];

export class Monster {
  constructor(game, def, type, x, y, lairRoom, behavior) {
    this.id = 'm' + nextMonsterId++;
    this.game = game;
    this.def = def;
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = game.rng.range(-Math.PI, Math.PI);
    this.radius = def.radius;
    this.lair = lairRoom;
    this.state = 'roam';
    this.stateT = 0;
    this.path = null;
    this.pathGoal = null;
    this.repathT = 0;
    this.attackCd = 0;
    this.stunT = 0;
    this.heard = null;        // stimulus sonore le plus fort de ce pas
    this.target = null;       // id du joueur ciblé
    this.lastSeen = null;     // {x,y,t}
    this.cycle = { phase: 'active', t: game.rng.range(...def.cycle.active) };
    this.ex = {};             // données de rendu spécifiques (déguisement, cloche...)
    this.behavior = behavior;
    this.stuckT = 0;
    this.lastPos = { x, y };
    this.moving = false;
    this.lastNoiseId = 0;
    behavior.init?.(this);
  }

  get speedMul() {
    const g = this.game;
    const mm = g.monsterMods[this.type];
    return g.diff.monsterSpeed * (g.mods.monsterSpeed ?? 1) * (mm?.speedMul ?? 1);
  }
  get hearingMul() { return this.def.hearing * (this.game.mods.monsterHearing ?? 1) * this.game.diff.perception; }
  get resting() { return this.cycle.phase === 'rest'; }
  get hunting() { return this.game.time > SIM.graceTime; }

  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; this.path = null; } }

  update(dt) {
    const g = this.game;
    this.stateT += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (g.mods.monsterFreeze) { this.moving = false; this.ex.frozen = 1; return; }
    this.ex.frozen = 0;
    if (this.stunT > 0) { this.stunT -= dt; this.moving = false; return; }
    // cycle chasse / repos (indice : les phases de repos sont annoncées par un son propre)
    this.cycle.t -= dt;
    if (this.cycle.t <= 0 && !['chase', 'charge', 'check', 'lunge'].includes(this.state)) {
      if (this.cycle.phase === 'active') { this.cycle.phase = 'rest'; this.cycle.t = g.rng.range(...this.def.cycle.rest); this.behavior.onRest?.(this); }
      else { this.cycle.phase = 'active'; this.cycle.t = g.rng.range(...this.def.cycle.active); this.behavior.onWake?.(this); }
    }
    // perception sonore : on garde le stimulus le plus fort
    this.heard = null;
    for (const n of g.noises) {
      if (n.mimic || n.id <= this.lastNoiseId || n.source === this.id) continue;
      const s = perceived(g, n, this.x, this.y, this.hearingMul * (this.resting ? 0.5 : 1));
      if (s > 0 && (!this.heard || s > this.heard.strength)) this.heard = { noise: n, strength: s };
    }
    if (g.noises.length) this.lastNoiseId = g.noises[g.noises.length - 1].id;
    this.behavior.update(this, dt);
    // détection de blocage
    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    this.moving = moved > 0.01;
    if (this.path && moved < 0.002 * dt * 30) {
      this.stuckT += dt;
      if (this.stuckT > 1.5) { this.path = null; this.stuckT = 0; this.nudge(); }
    } else this.stuckT = 0;
    this.lastPos.x = this.x; this.lastPos.y = this.y;
  }

  nudge() {
    const a = this.game.rng.range(-Math.PI, Math.PI);
    const r = moveCircle(this.game.map.grid, this.x, this.y, Math.cos(a) * 0.4, Math.sin(a) * 0.4, this.radius);
    this.x = r.x; this.y = r.y;
  }

  // Suivre un chemin A* jusqu'à (gx, gy). Retourne true une fois arrivé.
  moveTo(gx, gy, speed, dt, arriveDist = 0.5) {
    const g = this.game;
    if (dist(this.x, this.y, gx, gy) < arriveDist) { this.path = null; return true; }
    this.repathT -= dt;
    const goalMoved = !this.pathGoal || dist(this.pathGoal.x, this.pathGoal.y, gx, gy) > 1.2;
    if (!this.path || (goalMoved && this.repathT <= 0)) {
      this.path = findPath(g.map.grid, this.x, this.y, gx, gy, { doorsPassable: true, maxNodes: 3000 });
      this.pathGoal = { x: gx, y: gy };
      this.repathT = 0.6;
      if (!this.path) { this.path = null; this.nudge(); return false; }
    }
    if (!this.path.length) { this.path = null; return true; }
    const wp = this.path[0];
    this.openDoorsAhead(wp);
    this.stepToward(wp.x, wp.y, speed, dt);
    if (dist(this.x, this.y, wp.x, wp.y) < 0.35) this.path.shift();
    return false;
  }

  // Déplacement direct (sans chemin) avec collisions.
  stepToward(tx, ty, speed, dt) {
    const a = angleTo(this.x, this.y, tx, ty);
    this.angle = turnToward(this.angle, a, 8 * dt);
    const s = speed * this.speedMul;
    const d = Math.min(s * dt, dist(this.x, this.y, tx, ty));
    const r = moveCircle(this.game.map.grid, this.x, this.y, Math.cos(a) * d, Math.sin(a) * d, this.radius);
    this.x = r.x; this.y = r.y;
    return r;
  }

  openDoorsAhead(wp) {
    const g = this.game, grid = g.map.grid;
    const a = angleTo(this.x, this.y, wp.x, wp.y);
    const lx = Math.floor(this.x + Math.cos(a) * (this.radius + 0.5));
    const ly = Math.floor(this.y + Math.sin(a) * (this.radius + 0.5));
    for (const [tx, ty] of [[lx, ly], [Math.floor(wp.x), Math.floor(wp.y)]]) {
      if (grid.get(tx, ty) === T.DOOR && !grid.doorOpen[grid.idx(tx, ty)]) {
        if (this.behavior.smashDoors) g.breakDoor(tx, ty, this);
        else g.setDoor(tx, ty, true, this.id, 2.5);
      }
    }
  }

  visiblePlayers() {
    const out = [];
    for (const p of this.game.players.values()) {
      if (monsterSees(this.game, this, p)) out.push({ p, d: dist(this.x, this.y, p.x, p.y) });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  alivePlayers() {
    return [...this.game.players.values()].filter((p) => p.state === 'alive' && !p.hidden);
  }

  // Attaque si au contact. Retourne true si un coup a été porté.
  tryAttack(p, damage = this.def.damage) {
    if (!p || p.state !== 'alive' || this.attackCd > 0 || p.hidden) return false;
    if (dist(this.x, this.y, p.x, p.y) > this.radius + SIM.playerRadius + 0.3) return false;
    this.attackCd = this.def.attackCooldown;
    this.game.damagePlayer(p, damage, this);
    return true;
  }

  // Pièce aléatoire pour se balader, en évitant le quai de départ au début de la partie.
  randomRoomPoint(opts = {}) {
    const g = this.game;
    const rooms = g.map.rooms.filter((r) => !r.secret && (!r.start || (g.time > 150 && !opts.avoidStart)));
    const r = g.rng.weighted(rooms, (rm) => (opts.preferFar ? 0.3 + rm.danger : 1) * (rm === this.currentRoom() ? 0.2 : 1));
    return g.randomPointInRoom(r) || { x: this.x, y: this.y };
  }

  currentRoom() { return this.game.roomAt(this.x, this.y); }

  emit(type, loudness, extra = {}) {
    return emitNoise(this.game, { x: this.x, y: this.y, loudness, type, source: this.id, ...extra });
  }

  // Seules les données utiles au rendu / aux indices partent sur le réseau (le reste est la mémoire interne).
  snapshot() {
    const ex = {};
    for (const k of PUBLIC_EX) if (this.ex[k] !== undefined) ex[k] = this.ex[k];
    return { id: this.id, k: this.type, x: Math.round(this.x * 100) / 100, y: Math.round(this.y * 100) / 100, a: Math.round(this.angle * 100) / 100, s: this.state, mv: this.moving ? 1 : 0, r: this.resting ? 1 : 0, ex };
  }
}
