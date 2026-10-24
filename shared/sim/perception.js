// Perception : qui voit qui. Prend en compte distance, champ de vision, lumière,
// murs, cachettes et événements (brume, black-out...).
import { hasLineOfSight } from '../map/grid.js';
import { angleDiff } from '../util/math.js';
import { SIM } from '../config/game.js';
import { EQUIPMENT } from '../data/equipment.js';

export function flashlightOf(game, p) {
  const big = p.equipment === 'bigLight';
  return {
    range: SIM.flashlightRange * (big ? 1.3 : 1) * (game.mods.flashlightRange ?? 1),
    fov: SIM.flashlightFov * (big ? 1.35 : 1),
    on: p.light && p.battery > 0 && p.state !== 'dead' && !p.hidden,
  };
}

export function isLitByLamp(game, x, y) {
  if ((game.mods.ambientLight ?? 1) <= 0.05) return false;
  for (const l of game.map.lamps) {
    if (!l.on) continue;
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < l.radius * 0.85 && hasLineOfSight(game.map.grid, l.x, l.y, x, y)) return true;
  }
  for (const f of game.flares) {
    if (Math.hypot(f.x - x, f.y - y) < 5 && hasLineOfSight(game.map.grid, f.x, f.y, x, y)) return true;
  }
  return false;
}

// Un monstre voit-il ce joueur ?
export function monsterSees(game, m, p) {
  if (p.hidden || p.state === 'dead' || p.state === 'extracted' || p.state === 'left') return false;
  const def = m.def;
  if (!def.sight) return false;
  const sightMul = (game.mods.sight ?? 1) * game.diff.perception;
  let range = def.sight * sightMul;
  const light = flashlightOf(game, p);
  const lit = light.on || game.mods.reveal || isLitByLamp(game, p.x, p.y);
  if (!lit) range *= p.moveMode === 'sneak' ? 0.45 : 0.62;
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  if (d > range) return false;
  if (d > 1.6 && Math.abs(angleDiff(m.angle, Math.atan2(p.y - m.y, p.x - m.x))) > def.fov) return false;
  return hasLineOfSight(game.map.grid, m.x, m.y, p.x, p.y);
}

// Le point (x,y) est-il dans le faisceau de lampe de p ?
export function inFlashlight(game, p, x, y, rangeMul = 1) {
  const light = flashlightOf(game, p);
  if (!light.on) return false;
  const d = Math.hypot(x - p.x, y - p.y);
  if (d > light.range * rangeMul) return false;
  if (d > 0.6 && Math.abs(angleDiff(p.angle, Math.atan2(y - p.y, x - p.x))) > light.fov / 2 + 0.08) return false;
  return hasLineOfSight(game.map.grid, p.x, p.y, x, y);
}

// Une entité en (x,y) est-elle observée par au moins un joueur ? (Mannequine)
export function observedBy(game, x, y) {
  const out = [];
  for (const p of game.players.values()) {
    if (p.state !== 'alive' && p.state !== 'downed') continue;
    if (p.hidden) continue;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < SIM.ambientSight && hasLineOfSight(game.map.grid, p.x, p.y, x, y)) { out.push(p); continue; }
    if (inFlashlight(game, p, x, y)) { out.push(p); continue; }
    if (game.mods.reveal && d < 14 && hasLineOfSight(game.map.grid, p.x, p.y, x, y)) out.push(p);
  }
  // une fusée éclairante « regarde » aussi
  for (const f of game.flares) {
    if (Math.hypot(f.x - x, f.y - y) < 5 && hasLineOfSight(game.map.grid, f.x, f.y, x, y)) out.push({ x: f.x, y: f.y, flare: true });
  }
  return out;
}

// Un bot / joueur voit-il le monstre m ? (plus généreux que la vue des monstres)
export function playerSees(game, p, m) {
  if (p.state === 'dead' || p.hidden) return false;
  const d = Math.hypot(m.x - p.x, m.y - p.y);
  if (d < 2.2) return hasLineOfSight(game.map.grid, p.x, p.y, m.x, m.y);
  if (inFlashlight(game, p, m.x, m.y)) return true;
  if (d < 12 && (isLitByLamp(game, m.x, m.y) || m.def.behavior === 'inspecteur' || m.def.behavior === 'sauveteur')) {
    return hasLineOfSight(game.map.grid, p.x, p.y, m.x, m.y);
  }
  return false;
}

export function hasRadio(p) { return p.equipment === 'radio' && p.battery > 0; }
export { EQUIPMENT };
