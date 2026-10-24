// A* sur la grille (8 directions, sans couper les coins).
// Les portes fermées sont franchissables pour les monstres/bots (ils les ouvrent) avec un surcoût.

class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const a = this.items, pr = this.prio;
    a.push(item); pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }
  pop() {
    const a = this.items, pr = this.prio;
    const top = a[0];
    const lastItem = a.pop(), lastP = pr.pop();
    if (a.length > 0) {
      a[0] = lastItem; pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

// opts.doorsPassable : traite les portes fermées comme franchissables (coût +2)
// opts.avoid(tx,ty) : coût supplémentaire (ex: zones dangereuses pour les bots)
export function findPath(grid, sx, sy, gx, gy, opts = {}) {
  const w = grid.w, h = grid.h;
  const start = Math.floor(sy) * w + Math.floor(sx);
  let goal = Math.floor(gy) * w + Math.floor(gx);
  const doorsPassable = opts.doorsPassable !== false;
  const maxNodes = opts.maxNodes || 4000;

  const passable = (tx, ty) => {
    if (!grid.inBounds(tx, ty)) return false;
    const i = ty * w + tx;
    if (grid.tiles[i] === 2 /* DOOR */) return doorsPassable || grid.doorOpen[i] === 1;
    return !grid.blocksMove(tx, ty);
  };

  if (!passable(goal % w, (goal / w) | 0)) {
    const near = nearestPassable(grid, goal % w, (goal / w) | 0, passable);
    if (near < 0) return null;
    goal = near;
  }
  if (start === goal) return [{ x: (goal % w) + 0.5, y: ((goal / w) | 0) + 0.5 }];

  const gScore = new Map();
  const came = new Map();
  const open = new MinHeap();
  const gxT = goal % w, gyT = (goal / w) | 0;
  const heur = (i) => {
    const dx = Math.abs((i % w) - gxT), dy = Math.abs(((i / w) | 0) - gyT);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  gScore.set(start, 0);
  open.push(start, heur(start));
  let expanded = 0;
  const closed = new Set();
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > maxNodes) return null;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(cx + dx, cy) || !passable(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      let cost = c;
      if (grid.tiles[ni] === 2 && !grid.doorOpen[ni]) cost += 2;
      if (opts.avoid) cost += opts.avoid(nx, ny);
      const ng = gScore.get(cur) + cost;
      if (ng < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, ng);
        came.set(ni, cur);
        open.push(ni, ng + heur(ni));
      }
    }
  }
  if (!came.has(goal)) return null;
  const path = [];
  let c = goal;
  while (c !== start) {
    path.push({ x: (c % w) + 0.5, y: ((c / w) | 0) + 0.5 });
    c = came.get(c);
  }
  path.reverse();
  return smoothPath(grid, sx, sy, path);
}

function nearestPassable(grid, tx, ty, passable) {
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (passable(tx + dx, ty + dy)) return (ty + dy) * grid.w + (tx + dx);
      }
    }
  }
  return -1;
}

// Supprime les points intermédiaires inutiles quand la ligne droite est libre (corps de rayon ~0.45).
function smoothPath(grid, sx, sy, path) {
  if (path.length < 3) return path;
  const out = [];
  let ax = sx, ay = sy;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    for (; j > i; j--) {
      if (clearCorridor(grid, ax, ay, path[j].x, path[j].y)) break;
    }
    out.push(path[j]);
    ax = path[j].x; ay = path[j].y;
    i = j + 1;
  }
  return out;
}

function clearCorridor(grid, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len / 0.3);
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / (steps || 1);
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    for (const off of [-0.42, 0, 0.42]) {
      const qx = Math.floor(px + nx * off), qy = Math.floor(py + ny * off);
      if (grid.blocksMove(qx, qy) && !(grid.get(qx, qy) === 2)) return false;
    }
  }
  return true;
}

// Distances BFS depuis une case (pour la génération et la connectivité).
export function floodDistances(grid, sx, sy, passableFn) {
  const w = grid.w, h = grid.h;
  const d = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const s = sy * w + sx;
  d[s] = 0; q[qt++] = s;
  const pass = passableFn || ((x, y) => grid.get(x, y) === 2 || !grid.blocksMove(x, y));
  while (qh < qt) {
    const c = q[qh++];
    const cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (d[ni] !== -1 || !pass(nx, ny)) continue;
      d[ni] = d[c] + 1;
      q[qt++] = ni;
    }
  }
  return d;
}
