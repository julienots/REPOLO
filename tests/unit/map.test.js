import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, serializeMap, deserializeMap } from '../../shared/map/generator.js';
import { floodDistances, findPath } from '../../shared/map/pathfinding.js';
import { T, hasLineOfSight, soundObstruction, Grid } from '../../shared/map/grid.js';
import { THEMES } from '../../shared/data/themes.js';

const passable = (grid) => (x, y) => grid.get(x, y) === T.DOOR || !grid.blocksMove(x, y);

for (const theme of Object.keys(THEMES)) {
  test(`carte ${theme} : 40 graines, tout est navigable et cohérent`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = generateMap(theme, seed * 7919);
      const g = m.grid;
      const d = floodDistances(g, Math.floor(m.spawn.x), Math.floor(m.spawn.y), passable(g));
      for (const r of m.rooms) {
        if (r.secret) continue;
        const reachable = r.cells.length && (() => {
          for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d[g.idx(x, y)] >= 0) return true;
          return false;
        })();
        assert.ok(reachable, `${theme}#${seed} salle ${r.id} inaccessible`);
      }
      for (const it of m.items) {
        assert.ok(!g.blocksMove(Math.floor(it.x), Math.floor(it.y)), `${theme}#${seed} objet dans un mur`);
        if (!it.secret) assert.ok(d[g.idx(Math.floor(it.x), Math.floor(it.y))] >= 0, `${theme}#${seed} objet ${it.type} inaccessible`);
      }
      // fourgon accessible
      assert.ok(d[g.idx(Math.floor(m.van.x + 1), Math.floor(m.van.y + 1))] >= 0, 'fourgon accessible');
      assert.ok(d[g.idx(Math.floor(m.lever.x), Math.floor(m.lever.y))] >= 0, 'levier accessible');
      // pièce secrète : seulement derrière un mur fissuré
      const secret = m.rooms.find((r) => r.secret);
      if (secret) {
        const sx = secret.x + 1, sy = secret.y + 1;
        assert.equal(d[g.idx(sx, sy)], -1, 'pièce secrète fermée');
      }
      for (const e of m.elevators) assert.ok(d[g.idx(Math.floor(e.x), Math.floor(e.y))] >= 0, 'monte-charge accessible');
      for (const l of m.lockers) assert.ok(l.id > 0, 'id de casier > 0');
    }
  });
}

test('carte : même graine = même carte ; sérialisation aller-retour', () => {
  const a = generateMap('warehouse', 1234), b = generateMap('warehouse', 1234), c = generateMap('warehouse', 999);
  assert.deepEqual(Array.from(a.grid.tiles), Array.from(b.grid.tiles));
  assert.notDeepEqual(Array.from(a.grid.tiles), Array.from(c.grid.tiles));
  const s = deserializeMap(JSON.parse(JSON.stringify(serializeMap(a))));
  assert.deepEqual(Array.from(s.grid.tiles), Array.from(a.grid.tiles));
  assert.deepEqual(Array.from(s.grid.doorOpen), Array.from(a.grid.doorOpen));
});

test('A* : chemins valides entre points aléatoires', () => {
  const m = generateMap('lab', 77);
  const g = m.grid;
  const floors = [];
  const d = floodDistances(g, Math.floor(m.spawn.x), Math.floor(m.spawn.y), passable(g));
  for (let i = 0; i < d.length; i++) if (d[i] >= 0 && !g.blocksMove(i % g.w, (i / g.w) | 0)) floors.push(i);
  for (let k = 0; k < 60; k++) {
    const a = floors[(k * 131) % floors.length], b = floors[(k * 977 + 13) % floors.length];
    const p = findPath(g, (a % g.w) + 0.5, ((a / g.w) | 0) + 0.5, (b % g.w) + 0.5, ((b / g.w) | 0) + 0.5);
    assert.ok(p && p.length, 'chemin trouvé');
    for (const wp of p) assert.ok(!g.blocksMove(Math.floor(wp.x), Math.floor(wp.y)) || g.get(Math.floor(wp.x), Math.floor(wp.y)) === T.DOOR);
  }
});

test('vue et son : les murs bloquent la vue et étouffent le son, portes comprises', () => {
  const g = new Grid(10, 3);
  for (let x = 0; x < 10; x++) g.set(x, 1, T.FLOOR);
  assert.ok(hasLineOfSight(g, 0.5, 1.5, 9.5, 1.5));
  assert.equal(soundObstruction(g, 0.5, 1.5, 9.5, 1.5), 0);
  g.set(5, 1, T.DOOR); g.doorOpen[g.idx(5, 1)] = 0;
  assert.ok(!hasLineOfSight(g, 0.5, 1.5, 9.5, 1.5));
  const closed = soundObstruction(g, 0.5, 1.5, 9.5, 1.5);
  g.doorOpen[g.idx(5, 1)] = 1;
  assert.ok(hasLineOfSight(g, 0.5, 1.5, 9.5, 1.5));
  g.set(5, 1, T.WALL);
  const wall = soundObstruction(g, 0.5, 1.5, 9.5, 1.5);
  assert.ok(closed > 0 && wall > closed, 'mur > porte fermée > rien');
});
