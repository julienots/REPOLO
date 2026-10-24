// Polygones de visibilité par lancer de rayons sur la grille (partagée avec la simulation).
import { castRay } from '../../shared/map/grid.js';

export function conePolygon(grid, x, y, angle, fov, range, rays) {
  const pts = [x, y];
  const a0 = angle - fov / 2;
  for (let i = 0; i <= rays; i++) {
    const a = a0 + (fov * i) / rays;
    let d = castRay(grid, x, y, a, range);
    if (d < range) d += 0.45; // éclaire aussi la face du mur touché
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return pts;
}

export function circlePolygon(grid, x, y, range, rays) {
  const pts = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    let d = castRay(grid, x, y, a, range);
    if (d < range) d += 0.45;
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return pts;
}

// Trace un polygone (coordonnées monde) dans un contexte (coordonnées écran).
export function tracePoly(ctx, pts, toX, toY) {
  ctx.beginPath();
  ctx.moveTo(toX(pts[0]), toY(pts[1]));
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(toX(pts[i]), toY(pts[i + 1]));
  ctx.closePath();
}
