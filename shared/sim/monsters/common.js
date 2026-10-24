// Briques de comportement réutilisées par plusieurs créatures.
import { hasLineOfSight } from '../../map/grid.js';
import { dist } from '../../util/math.js';

// Poursuite : ligne droite si visible et proche, sinon chemin A*.
export function pursue(m, p, speed, dt) {
  const d = dist(m.x, m.y, p.x, p.y);
  if (d < 4 && hasLineOfSight(m.game.map.grid, m.x, m.y, p.x, p.y)) {
    m.path = null;
    m.stepToward(p.x, p.y, speed, dt);
  } else {
    m.moveTo(p.x, p.y, speed, dt, 0.3);
  }
}

// Errance de pièce en pièce, avec pauses.
export function wander(m, speed, dt, opts = {}) {
  if (!m.ex.wp || m.ex.wpWait === undefined) { m.ex.wp = m.randomRoomPoint(opts); m.ex.wpWait = 0; }
  if (m.ex.wpWait > 0) { m.ex.wpWait -= dt; return; }
  const arrived = m.moveTo(m.ex.wp.x, m.ex.wp.y, speed, dt, 0.6);
  if (arrived || m.stateT > 40) {
    m.ex.wp = m.randomRoomPoint(opts);
    m.ex.wpWait = m.game.rng.range(opts.pauseMin ?? 1, opts.pauseMax ?? 4);
    m.stateT = 0;
  }
}

// Retour au repaire pendant la phase de repos.
export function goRest(m, dt, speed) {
  const g = m.game;
  if (!m.ex.restPt) m.ex.restPt = g.randomPointInRoom(m.lair) || { x: m.x, y: m.y };
  m.moveTo(m.ex.restPt.x, m.ex.restPt.y, speed, dt, 0.7);
}

export function playerById(m, id) { return id ? m.game.players.get(id) : null; }

export function isTargetable(p) { return p && p.state === 'alive' && !p.hidden; }

// Joueur le plus proche en distance de chemin approximative (vol d'oiseau pondéré).
export function nearestAlive(m, filter) {
  let best = null, bd = Infinity;
  for (const p of m.game.players.values()) {
    if (!isTargetable(p) || (filter && !filter(p))) continue;
    const d = dist(m.x, m.y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}
