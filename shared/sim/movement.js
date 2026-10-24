// Déplacement d'un joueur (humain prédit côté client, ou bot côté serveur) : même code partout.
import { moveCircle } from '../map/grid.js';
import { SIM } from '../config/game.js';

export function speedFor(mode, p) {
  if (p.state === 'downed') return SIM.crawlSpeed;
  if (p.state === 'dead') return SIM.ghostSpeed;
  if (mode === 'sneak') return SIM.sneakSpeed;
  if (mode === 'sprint' && p.stamina > 0.05) return SIM.sprintSpeed;
  return SIM.walkSpeed;
}

// input : { mx, my } direction souhaitée (longueur ≤ 1), mode
// env   : { speedMul, friction }
export function stepMovement(grid, p, input, env, dt) {
  const len = Math.hypot(input.mx, input.my);
  const mx = len > 1 ? input.mx / len : input.mx;
  const my = len > 1 ? input.my / len : input.my;
  const speed = speedFor(input.mode, p) * (p.state === 'dead' ? 1 : (env.speedMul ?? 1));
  const tvx = mx * speed, tvy = my * speed;
  const accel = 12 * (env.friction ?? 1);
  const k = Math.min(1, accel * dt);
  p.vx += (tvx - p.vx) * k;
  p.vy += (tvy - p.vy) * k;
  if (p.state === 'dead') {
    // les fantômes traversent tout mais restent dans la carte
    p.x = Math.max(0.5, Math.min(grid.w - 0.5, p.x + p.vx * dt));
    p.y = Math.max(0.5, Math.min(grid.h - 0.5, p.y + p.vy * dt));
    return;
  }
  const r = moveCircle(grid, p.x, p.y, p.vx * dt, p.vy * dt, SIM.playerRadius);
  if (r.hitX) p.vx *= -0.15;
  if (r.hitY) p.vy *= -0.15;
  p.x = r.x; p.y = r.y;
}
