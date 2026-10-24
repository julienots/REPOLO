// Physique des objets : glisse, rebonds, chocs bruyants, casse des objets fragiles,
// collisions entre objets, objets lancés sur les créatures, murs fissurés.
import { moveCircle, T } from '../map/grid.js';
import { itemDef } from '../data/items.js';
import { emitNoise } from './noise.js';
import { dist } from '../util/math.js';

let nextItemId = 1;

export function createItem(game, type, x, y, opts = {}) {
  const def = itemDef(type);
  const base = Math.round(game.rng.range(def.value[0], def.value[1]));
  const it = {
    id: 'i' + nextItemId++, type, def, x, y, vx: 0, vy: 0,
    baseValue: base, value: base, carriedBy: null, helper: null,
    fallT: 0, lastTouch: null, lastDroppedBy: null, inVanT: 0, claimedBy: null,
    secret: !!opts.secret, squeakT: 0, decoyT: -1, flareT: -1, thrownBy: null, thrownT: 0,
  };
  game.items.set(it.id, it);
  return it;
}

export function updateItems(game, dt) {
  const grid = game.map.grid;
  const mods = game.mods;
  const list = [...game.items.values()];
  const frictionK = 3.2 * (mods.floatItems ? 0.08 : mods.friction);

  for (const it of list) {
    if (it.carriedBy) { it.vx = 0; it.vy = 0; continue; }
    // chute depuis le plafond (pluie d'objets)
    if (it.fallT > 0) {
      it.fallT -= dt;
      if (it.fallT <= 0) {
        emitNoise(game, { x: it.x, y: it.y, loudness: 4 + 2 * it.def.loud, type: 'impact', source: it.id });
        damageItem(game, it, 3.5);
      }
      continue;
    }
    if (mods.floatItems) {
      it.vx += game.rng.range(-1, 1) * 1.6 * dt;
      it.vy += game.rng.range(-1, 1) * 1.6 * dt;
    }
    const speed = Math.hypot(it.vx, it.vy);
    if (speed < 0.02) { it.vx = 0; it.vy = 0; continue; }
    const r = moveCircle(grid, it.x, it.y, it.vx * dt, it.vy * dt, it.def.radius);
    if (r.hitX || r.hitY) {
      const impact = Math.abs(r.hitX ? it.vx : 0) + Math.abs(r.hitY ? it.vy : 0);
      if (r.hitX) it.vx *= -0.4;
      if (r.hitY) it.vy *= -0.4;
      if (impact > 2.0) {
        emitNoise(game, { x: it.x, y: it.y, loudness: Math.min(14, impact * 1.3 * it.def.loud), type: 'impact', source: it.lastTouch || it.id });
        damageItem(game, it, impact);
        // un objet lourd lancé fort ouvre les murs fissurés
        if (impact > 4.5 && it.def.weight >= 3) {
          const ax = Math.sign(it.vx || 0.0001), ay = Math.sign(it.vy || 0.0001);
          for (const [tx, ty] of [[Math.floor(r.x + ax * (it.def.radius + 0.3)), Math.floor(r.y)], [Math.floor(r.x), Math.floor(r.y + ay * (it.def.radius + 0.3))]]) {
            if (grid.get(tx, ty) === T.CRACKED) game.breakWall(tx, ty, it.lastTouch);
          }
        }
      }
    }
    it.x = r.x; it.y = r.y;
    const decay = Math.exp(-frictionK * dt);
    it.vx *= decay; it.vy *= decay;
  }

  // collisions objet-objet (n petit : O(n²) acceptable)
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.carriedBy || a.fallT > 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.carriedBy || b.fallT > 0) continue;
      const min = a.def.radius + b.def.radius;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const overlap = (min - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const ma = a.def.weight, mb = b.def.weight;
        const imp = (1.6 * rel) / (ma + mb);
        a.vx -= imp * mb * nx; a.vy -= imp * mb * ny;
        b.vx += imp * ma * nx; b.vy += imp * ma * ny;
        if (rel > 3) {
          emitNoise(game, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, loudness: Math.min(10, rel * 1.1), type: 'impact', source: a.lastTouch || b.lastTouch });
          damageItem(game, a, rel * 0.8); damageItem(game, b, rel * 0.8);
        }
      }
    }
  }

  // objets lancés contre des créatures
  for (const it of list) {
    if (it.carriedBy || !it.thrownBy || game.time - it.thrownT > 1.5) continue;
    const sp = Math.hypot(it.vx, it.vy);
    if (sp < 3) continue;
    for (const m of game.monsters) {
      if (dist(m.x, m.y, it.x, it.y) < m.radius + it.def.radius + 0.05) {
        it.vx *= -0.3; it.vy *= -0.3;
        emitNoise(game, { x: it.x, y: it.y, loudness: 6, type: 'impact', source: it.thrownBy });
        if (m.type !== 'demenageur') m.stunT = Math.max(m.stunT, 0.5 + it.def.weight * 0.35);
        m.behavior.onHitByItem?.(m, it);
        game.emitSfx('thud', m.x, m.y);
        it.thrownBy = null;
        game.flag('hitMonster');
      }
    }
  }
}

export function damageItem(game, it, impact) {
  if (!it.def.fragile || impact < 2.2 || it.def.quest) return;
  const loss = it.baseValue * it.def.fragile * Math.min(0.4, (impact - 2) / 10);
  it.value = Math.max(0, it.value - loss);
  if (it.value < it.baseValue * 0.12) breakItem(game, it);
}

export function breakItem(game, it) {
  game.items.delete(it.id);
  emitNoise(game, { x: it.x, y: it.y, loudness: 7 + it.def.loud * 2, type: 'break', source: it.lastTouch || it.id });
  game.emitSfx('break', it.x, it.y);
  const culprit = game.players.get(it.lastTouch);
  if (culprit) {
    culprit.stats.catastrophes++;
    culprit.stats.broken += it.baseValue;
  }
  if (it.baseValue >= 80) {
    game.highlight('break', `${culprit ? culprit.name : 'Quelqu\'un'} a cassé ${it.def.name} (${it.baseValue} cr)`, culprit?.id, it.x, it.y, it.baseValue >= 150);
    game.signal('itemBroken', { x: it.x, y: it.y, value: it.baseValue, by: it.lastTouch });
  }
}
