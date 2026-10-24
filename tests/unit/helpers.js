import { Game } from '../../shared/sim/game.js';
import { Monster } from '../../shared/sim/monsters/base.js';
import { BEHAVIORS } from '../../shared/sim/monsters/index.js';
import { MONSTERS } from '../../shared/data/monsters.js';
import { collides } from '../../shared/map/grid.js';

export function makeGame(opts = {}) {
  const players = opts.players || [{ id: 'h1', name: 'Humain' }];
  const g = new Game({ missionId: opts.mission || 'morvan', difficulty: opts.difficulty || 'employe', seed: opts.seed ?? 42, players, variant: 'standard', monsters: opts.monsters || ['__none__'] });
  g.spawner.queue = [];
  return g;
}

export function placeMonster(g, type, x, y) {
  const def = MONSTERS[type];
  const lair = g.map.rooms.filter((r) => !r.start && !r.secret).sort((a, b) => b.danger - a.danger)[0];
  const m = new Monster(g, def, type, x, y, lair, BEHAVIORS[def.behavior]);
  g.monsters.push(m);
  return m;
}

// Trouve une ligne droite dégagée de longueur len dans une salle (pour placer joueur et monstre).
export function openLine(g, len = 6) {
  for (const r of g.map.rooms) {
    if (r.secret) continue;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      for (let x = r.x + 1; x + len < r.x + r.w; x++) {
        let ok = true;
        for (let k = -1; k <= len + 1 && ok; k++) for (let dy = -1; dy <= 1 && ok; dy++) if (g.map.grid.blocksMove(x + k, y + dy)) ok = false;
        if (ok && !collides(g.map.grid, x + 0.5, y + 0.5, 0.45)) return { x: x + 0.5, y: y + 0.5, room: r };
      }
    }
  }
  throw new Error('pas de ligne dégagée');
}

export function lampsOff(g) { for (const l of g.map.lamps) l.on = false; }

export function run(g, seconds, each) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    each?.(t);
    g.step(dt);
    g.netNoises.length = 0; g.outMsgs.length = 0;
  }
}
