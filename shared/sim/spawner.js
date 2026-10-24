// Composition et apparition des créatures. Règles de mise en scène :
// - jamais dans le champ de vision d'un joueur, jamais à moins de 14 cases ;
// - apparitions échelonnées, retardées si l'équipe est déjà en pleine panique ;
// - budget de « coût » selon la difficulté.
import { MONSTERS } from '../data/monsters.js';
import { Monster } from './monsters/base.js';
import { BEHAVIORS } from './monsters/index.js';
import { hasLineOfSight } from '../map/grid.js';
import { dist } from '../util/math.js';

export class Spawner {
  constructor(game, mission, diff, forced) {
    this.game = game;
    this.queue = forced && forced.length ? forced.slice() : this.compose(mission, diff);
    this.nextT = 12;
    this.spawned = [];
  }

  compose(mission, diff) {
    const g = this.game;
    const pool = mission.monsterPool.filter((id) => MONSTERS[id] && MONSTERS[id].minDifficulty <= diff.level);
    const chosen = [];
    let budget = diff.monsterBudget;
    for (const id of mission.required || []) if (MONSTERS[id]) { chosen.push(id); budget -= MONSTERS[id].cost; }
    const rest = g.rng.shuffle(pool.filter((id) => !chosen.includes(id)));
    for (const id of rest) {
      if (chosen.length >= diff.maxMonsters) break;
      if (MONSTERS[id].cost <= budget) { chosen.push(id); budget -= MONSTERS[id].cost; }
    }
    return chosen;
  }

  update() {
    const g = this.game;
    if (!this.queue.length || g.time < this.nextT) return;
    if (g.director.phase === 'peak') { this.nextT = g.time + 5; return; }
    const type = this.queue.shift();
    if (!this.spawn(type)) { this.queue.unshift(type); this.nextT = g.time + 3; return; }
    this.nextT = g.time + g.rng.range(30, 55);
  }

  spawn(type) {
    const g = this.game;
    const def = MONSTERS[type];
    if (!def) return null;
    const rooms = g.map.rooms.filter((r) => !r.start && !r.secret && r.danger > 0.35);
    const ordered = g.rng.shuffle(rooms.slice()).sort((a, b) => b.danger - a.danger);
    for (const room of ordered) {
      for (let tries = 0; tries < 8; tries++) {
        const pt = g.randomPointInRoom(room);
        if (!pt) continue;
        const unsafe = [...g.players.values()].some((p) => p.state !== 'dead' && (dist(p.x, p.y, pt.x, pt.y) < 14 || hasLineOfSight(g.map.grid, p.x, p.y, pt.x, pt.y)));
        if (unsafe) continue;
        const usedLairs = new Set(g.monsters.map((m) => m.lair.id));
        const lair = rooms.find((r) => !usedLairs.has(r.id) && r.danger > 0.5) || room;
        const m = new Monster(g, def, type, pt.x, pt.y, lair, BEHAVIORS[def.behavior]);
        g.monsters.push(m);
        this.spawned.push(type);
        g.onMonsterSpawned?.(m);
        return m;
      }
    }
    return null;
  }

  spawnExtra() {
    const g = this.game;
    if (g.monsters.length >= g.diff.maxMonsters + 1) return null;
    const pool = Object.keys(MONSTERS).filter((id) => !g.monsters.some((m) => m.type === id) && MONSTERS[id].minDifficulty <= g.diff.level);
    const type = pool.length ? g.rng.pick(pool) : 'sourdine';
    return this.spawn(type);
  }
}
