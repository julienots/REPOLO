// Grille de cases : collisions, ligne de vue, atténuation du son.
// Toutes les fonctions sont pures et partagées entre serveur et navigateur.

export const T = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,     // franchissable si ouverte
  CRACKED: 3,  // mur fissuré : cassable (secret, géant)
  DEBRIS: 4,   // sol bruyant (verre, gravats) : même en marchant accroupi
  SHELF: 5,    // étagère : bloque passage et vue
  TABLE: 6,    // meuble bas : bloque le passage, pas la vue ni le son
  GRATE: 7,    // grille métallique : sol bruyant mais moins que les débris
};

export class Grid {
  constructor(w, h, tiles) {
    this.w = w;
    this.h = h;
    this.tiles = tiles || new Uint8Array(w * h).fill(T.WALL);
    this.doorOpen = new Uint8Array(w * h); // 1 = porte ouverte (seulement pour les cases DOOR)
    this.doorBroken = new Uint8Array(w * h);
  }
  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y * this.w + x] : T.WALL; }
  set(x, y, v) { if (this.inBounds(x, y)) this.tiles[y * this.w + x] = v; }

  blocksMove(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = y * this.w + x;
    const t = this.tiles[i];
    if (t === T.DOOR) return !this.doorOpen[i];
    return t === T.WALL || t === T.CRACKED || t === T.SHELF || t === T.TABLE;
  }
  blocksSight(x, y) {
    if (!this.inBounds(x, y)) return true;
    const i = y * this.w + x;
    const t = this.tiles[i];
    if (t === T.DOOR) return !this.doorOpen[i];
    return t === T.WALL || t === T.CRACKED || t === T.SHELF;
  }
  // Coût sonore d'une case (en « cases équivalentes » perdues par le son).
  soundCost(x, y) {
    if (!this.inBounds(x, y)) return 99;
    const i = y * this.w + x;
    const t = this.tiles[i];
    if (t === T.WALL || t === T.CRACKED) return 2.6;
    if (t === T.DOOR) return this.doorOpen[i] ? 0 : 1.4;
    if (t === T.SHELF) return 0.8;
    return 0;
  }
  isWalkable(x, y) { return !this.blocksMove(x, y); }
}

// Parcours DDA d'un rayon dans la grille. callback(tx, ty) retourne true pour s'arrêter.
// Retourne la distance parcourue.
export function traverse(grid, x0, y0, x1, y1, callback) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  const dirX = dx / len, dirY = dy / len;
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const stepX = dirX > 0 ? 1 : -1, stepY = dirY > 0 ? 1 : -1;
  const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
  let tMaxX = dirX !== 0 ? ((dirX > 0 ? tx + 1 - x0 : x0 - tx) * tDeltaX) : Infinity;
  let tMaxY = dirY !== 0 ? ((dirY > 0 ? ty + 1 - y0 : y0 - ty) * tDeltaY) : Infinity;
  let t = 0;
  let guard = 0;
  while (t <= len && guard++ < 512) {
    if (callback(tx, ty, t)) return t;
    if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; }
    else { t = tMaxY; tMaxY += tDeltaY; ty += stepY; }
  }
  return len;
}

export function hasLineOfSight(grid, x0, y0, x1, y1) {
  const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
  let clear = true;
  traverse(grid, x0, y0, x1, y1, (tx, ty) => {
    if (tx === tx1 && ty === ty1) return true;
    if (grid.blocksSight(tx, ty)) { clear = false; return true; }
    return false;
  });
  return clear;
}

// Distance jusqu'au premier obstacle visuel le long d'un rayon (pour l'éclairage).
export function castRay(grid, x0, y0, angle, maxDist) {
  const x1 = x0 + Math.cos(angle) * maxDist, y1 = y0 + Math.sin(angle) * maxDist;
  let hit = maxDist;
  const sx = Math.floor(x0), sy = Math.floor(y0);
  traverse(grid, x0, y0, x1, y1, (tx, ty, t) => {
    if ((tx !== sx || ty !== sy) && grid.blocksSight(tx, ty)) { hit = t; return true; }
    return false;
  });
  return Math.min(hit, maxDist);
}

// Somme des pénalités sonores entre deux points (murs, portes fermées...).
export function soundObstruction(grid, x0, y0, x1, y1) {
  let cost = 0;
  const sx = Math.floor(x0), sy = Math.floor(y0), ex = Math.floor(x1), ey = Math.floor(y1);
  traverse(grid, x0, y0, x1, y1, (tx, ty) => {
    if ((tx === sx && ty === sy) || (tx === ex && ty === ey)) return false;
    cost += grid.soundCost(tx, ty);
    return cost > 40;
  });
  return cost;
}

// Déplacement d'un cercle avec collisions séparées par axe.
// Retourne { x, y, hitX, hitY }.
export function moveCircle(grid, x, y, dx, dy, r) {
  let hitX = false, hitY = false;
  // Sous-pas pour éviter de traverser les murs à grande vitesse.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / steps, sy = dy / steps;
  for (let s = 0; s < steps; s++) {
    let nx = x + sx;
    if (collides(grid, nx, y, r)) { hitX = true; nx = x; }
    x = nx;
    let ny = y + sy;
    if (collides(grid, x, ny, r)) { hitY = true; ny = y; }
    y = ny;
  }
  return { x, y, hitX, hitY };
}

export function collides(grid, x, y, r) {
  const minX = Math.floor(x - r), maxX = Math.floor(x + r);
  const minY = Math.floor(y - r), maxY = Math.floor(y + r);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (!grid.blocksMove(tx, ty)) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Repousse un cercle hors des murs s'il s'y trouve coincé (téléportation, porte refermée...).
export function unstick(grid, x, y, r) {
  if (!collides(grid, x, y, r)) return { x, y };
  for (let rad = 0.25; rad < 4; rad += 0.25) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const nx = x + Math.cos(a) * rad, ny = y + Math.sin(a) * rad;
      if (!collides(grid, nx, ny, r)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}
