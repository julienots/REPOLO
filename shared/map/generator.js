// Génération de carte : une grille de « cellules » (pièces) reliées par un arbre couvrant
// + des liens supplémentaires (chemins alternatifs). Les meubles sont placés en vérifiant
// à chaque fois que tout reste accessible : la carte est toujours navigable.
import { Grid, T } from './grid.js';
import { floodDistances } from './pathfinding.js';
import { makeRng } from '../util/rng.js';
import { THEMES } from '../data/themes.js';
import { ITEMS } from '../data/items.js';

export function generateMap(themeId, seed, opts = {}) {
  const theme = THEMES[themeId] || THEMES.warehouse;
  const rng = makeRng(seed);
  const L = theme.layout;
  const cs = L.cellSize;
  const CX = L.cellsX, CY = L.cellsY;
  const W = CX * cs + 1, H = CY * cs + 1;
  const grid = new Grid(W, H);
  const cellId = (cx, cy) => cy * CX + cx;

  // Union-find pour les cellules fusionnées en grandes salles.
  const parent = Array.from({ length: CX * CY }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };

  // 1. Creuser l'intérieur de chaque cellule.
  for (let cy = 0; cy < CY; cy++) {
    for (let cx = 0; cx < CX; cx++) {
      for (let y = cy * cs + 1; y < cy * cs + cs; y++) {
        for (let x = cx * cs + 1; x < cx * cs + cs; x++) grid.set(x, y, T.FLOOR);
      }
    }
  }

  const openWall = (a, b, mode) => {
    // a, b : cellules voisines. mode : 'merge' | 'door' | 'gap' | 'wide' | 'crack'
    const ax = a % CX, ay = (a / CX) | 0, bx = b % CX, by = (b / CX) | 0;
    const horizontal = ay === by; // voisins gauche/droite → mur vertical
    const cells = [];
    if (horizontal) {
      const x = Math.max(ax, bx) * cs;
      for (let y = ay * cs + 1; y < ay * cs + cs; y++) cells.push([x, y]);
    } else {
      const y = Math.max(ay, by) * cs;
      for (let x = ax * cs + 1; x < ax * cs + cs; x++) cells.push([x, y]);
    }
    if (mode === 'merge') {
      for (const [x, y] of cells) grid.set(x, y, T.FLOOR);
      return null;
    }
    const k = mode === 'wide' ? 2 : 1;
    const start = rng.int(1, cells.length - 1 - k);
    const placed = [];
    for (let i = 0; i < k; i++) {
      const [x, y] = cells[start + i];
      grid.set(x, y, mode === 'door' ? T.DOOR : mode === 'crack' ? T.CRACKED : T.FLOOR);
      placed.push([x, y]);
    }
    if (mode === 'crack') {
      // tout le pan de mur est fissuré pour que l'indice soit visible
      for (const [x, y] of cells) if (grid.get(x, y) === T.WALL && rng.chance(0.5)) grid.set(x, y, T.CRACKED);
    }
    return placed;
  };

  // 2. Couloirs (hôtel) : fusion d'une rangée entière.
  for (const row of L.corridorRows || []) {
    if (row >= CY) continue;
    for (let cx = 0; cx < CX - 1; cx++) { openWall(cellId(cx, row), cellId(cx + 1, row), 'merge'); union(cellId(cx, row), cellId(cx + 1, row)); }
  }

  // 3. Fusions aléatoires (grandes halles), jamais plus de 3 cellules par salle.
  const groupSize = () => { const m = new Map(); for (let i = 0; i < CX * CY; i++) m.set(find(i), (m.get(find(i)) || 0) + 1); return m; };
  for (let cy = 0; cy < CY; cy++) {
    for (let cx = 0; cx < CX; cx++) {
      if ((L.corridorRows || []).includes(cy)) continue;
      const a = cellId(cx, cy);
      const options = [];
      if (cx + 1 < CX && !(L.corridorRows || []).includes(cy)) options.push(cellId(cx + 1, cy));
      if (cy + 1 < CY && !(L.corridorRows || []).includes(cy + 1)) options.push(cellId(cx, cy + 1));
      for (const b of options) {
        if (find(a) === find(b)) continue;
        const sizes = groupSize();
        if ((sizes.get(find(a)) || 1) + (sizes.get(find(b)) || 1) > 3) continue;
        if (rng.chance(L.mergeChance)) { openWall(a, b, 'merge'); union(a, b); }
      }
    }
  }

  // 4. Choix de la cellule de départ (quai de chargement, en bas) et de la pièce secrète.
  const startCell = cellId(rng.int(0, CX - 1), CY - 1);
  // isoler la cellule de départ de toute fusion n'est pas nécessaire : un quai large est bien.

  // 5. Arbre couvrant aléatoire sur les groupes.
  const neighbors = (c) => {
    const cx = c % CX, cy = (c / CX) | 0, out = [];
    if (cx > 0) out.push(c - 1); if (cx < CX - 1) out.push(c + 1);
    if (cy > 0) out.push(c - CX); if (cy < CY - 1) out.push(c + CX);
    return out;
  };
  const links = []; // [a, b]
  const visitedGroups = new Set([find(startCell)]);
  const frontier = [];
  const pushFrontier = (g) => {
    for (let c = 0; c < CX * CY; c++) if (find(c) === g) for (const n of neighbors(c)) if (find(n) !== g) frontier.push([c, n]);
  };
  pushFrontier(find(startCell));
  while (frontier.length) {
    const i = rng.int(0, frontier.length - 1);
    const [a, b] = frontier.splice(i, 1)[0];
    if (visitedGroups.has(find(b))) continue;
    visitedGroups.add(find(b));
    links.push([a, b]);
    pushFrontier(find(b));
  }

  // Degré par groupe pour trouver une feuille (candidate à la pièce secrète).
  const degree = new Map();
  for (const [a, b] of links) { degree.set(find(a), (degree.get(find(a)) || 0) + 1); degree.set(find(b), (degree.get(find(b)) || 0) + 1); }
  const sizes = groupSize();
  const startXY = [startCell % CX, (startCell / CX) | 0];
  const leaves = [...degree.entries()]
    .filter(([g, d]) => d === 1 && g !== find(startCell) && sizes.get(g) === 1)
    .map(([g]) => g)
    .sort((g1, g2) => (Math.abs(g2 % CX - startXY[0]) + Math.abs(((g2 / CX) | 0) - startXY[1])) - (Math.abs(g1 % CX - startXY[0]) + Math.abs(((g1 / CX) | 0) - startXY[1])));
  const secretGroup = opts.noSecret ? -1 : (leaves[0] ?? -1);

  // 6. Liens supplémentaires (boucles = chemins alternatifs), jamais vers la pièce secrète.
  const linkKey = (a, b) => (find(a) < find(b) ? `${find(a)}-${find(b)}` : `${find(b)}-${find(a)}`);
  const linked = new Set(links.map(([a, b]) => linkKey(a, b)));
  const extra = [];
  for (let c = 0; c < CX * CY; c++) {
    for (const n of neighbors(c)) {
      if (n < c || find(n) === find(c)) continue;
      if (find(c) === secretGroup || find(n) === secretGroup) continue;
      if (linked.has(linkKey(c, n))) continue;
      if (rng.chance(L.extraLinks)) { extra.push([c, n]); linked.add(linkKey(c, n)); }
    }
  }

  const doors = [];
  for (const [a, b] of [...links, ...extra]) {
    let mode;
    if (find(a) === secretGroup || find(b) === secretGroup) mode = 'crack';
    else if (rng.chance(L.doorChance)) mode = 'door';
    else mode = rng.chance(L.wideChance) ? 'wide' : 'gap';
    const placed = openWall(a, b, mode);
    if (mode === 'door' && placed) for (const [x, y] of placed) doors.push(grid.idx(x, y));
  }
  // Portes : la plupart ouvertes au départ, quelques-unes fermées.
  for (const i of doors) grid.doorOpen[i] = rng.chance(0.6) ? 1 : 0;

  // 7. Construction des salles (groupes) : rectangles englobants et cellules.
  const roomsByGroup = new Map();
  for (let c = 0; c < CX * CY; c++) {
    const g = find(c);
    if (!roomsByGroup.has(g)) roomsByGroup.set(g, { id: roomsByGroup.size, cells: [], group: g });
    roomsByGroup.get(g).cells.push(c);
  }
  const rooms = [...roomsByGroup.values()];
  for (const r of rooms) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of r.cells) {
      const cx = c % CX, cy = (c / CX) | 0;
      minX = Math.min(minX, cx * cs + 1); minY = Math.min(minY, cy * cs + 1);
      maxX = Math.max(maxX, cx * cs + cs - 1); maxY = Math.max(maxY, cy * cs + cs - 1);
    }
    Object.assign(r, { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2;
    r.isCorridor = r.cells.every((c) => (L.corridorRows || []).includes((c / CX) | 0));
    r.secret = r.group === secretGroup;
    r.start = r.group === find(startCell);
  }
  const startRoom = rooms.find((r) => r.start);
  const roomAt = (x, y) => rooms.find((r) => r.cells.some((c) => {
    const cx = c % CX, cy = (c / CX) | 0;
    return x >= cx * cs + 1 && x < cx * cs + cs && y >= cy * cs + 1 && y < cy * cs + cs;
  }));

  // 8. Fourgon (zone d'extraction) dans la salle de départ, contre le mur du bas.
  const sc = [startCell % CX, (startCell / CX) | 0];
  const van = { x: sc[0] * cs + 2, y: sc[1] * cs + cs - 4, w: Math.min(5, cs - 3), h: 3 };
  const lever = { x: van.x + van.w - 0.5, y: van.y + 0.5 };
  const spawn = { x: van.x + van.w / 2, y: van.y - 1.2 };
  const reserved = new Set();
  for (let y = van.y - 2; y <= van.y + van.h; y++) for (let x = van.x - 1; x <= van.x + van.w; x++) reserved.add(grid.idx(x, y));
  // garder les abords des portes libres
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = grid.get(x, y);
    if (t === T.DOOR || t === T.CRACKED || (t === T.FLOOR && isOpening(grid, x, y))) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reserved.add(grid.idx(x + dx, y + dy));
    }
  }

  // 9. Danger des salles = distance au fourgon.
  const dist = floodDistances(grid, Math.floor(spawn.x), Math.floor(spawn.y), (x, y) => { const t = grid.get(x, y); return t === T.DOOR || t === T.CRACKED || !grid.blocksMove(x, y); });
  let maxD = 1;
  for (const r of rooms) {
    const d = dist[grid.idx(Math.floor(r.cx), Math.floor(r.cy))];
    r.distance = d < 0 ? 999 : d;
    if (d > maxD && !r.secret) maxD = d;
  }
  for (const r of rooms) r.danger = r.start ? 0 : Math.min(1, r.distance / maxD);

  // 10. Meubles, avec vérification de connectivité.
  const P = theme.props;
  const reachableCount = () => {
    const d = floodDistances(grid, Math.floor(spawn.x), Math.floor(spawn.y));
    let n = 0; for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++; return n;
  };
  let baseReach = reachableCount();
  const tryPlace = (cellsToSet, tile) => {
    for (const [x, y] of cellsToSet) {
      if (grid.get(x, y) !== T.FLOOR || reserved.has(grid.idx(x, y))) return false;
    }
    for (const [x, y] of cellsToSet) grid.set(x, y, tile);
    const n = reachableCount();
    if (n !== baseReach - cellsToSet.length) {
      for (const [x, y] of cellsToSet) grid.set(x, y, T.FLOOR);
      return false;
    }
    baseReach = n;
    return true;
  };

  for (const r of rooms) {
    if (r.start) continue;
    const area = r.w * r.h;
    // Rangées d'étagères (allées) dans les grandes salles.
    if (!r.isCorridor && rng.chance(P.shelfRows) && r.w >= 6) {
      const vertical = r.h > r.w ? false : rng.chance(0.5);
      const span = vertical ? r.w : r.h;
      for (let k = 2; k < span - 2; k += 3) {
        const len = (vertical ? r.h : r.w) - 4;
        const run = [];
        const off = rng.int(1, 2);
        for (let s = off; s < off + len; s++) {
          if (rng.chance(0.12)) continue; // trous dans les rangées
          run.push(vertical ? [r.x + k, r.y + s] : [r.x + s, r.y + k]);
        }
        // placer par segments pour laisser des passages
        for (let s = 0; s < run.length; s += 3) tryPlace(run.slice(s, s + 3), T.SHELF);
      }
    }
    // Tables / meubles bas
    const nTables = Math.floor(area / 18 * P.tables);
    for (let i = 0; i < nTables; i++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2), y = rng.int(r.y + 1, r.y + r.h - 2);
      const horiz = rng.chance(0.5);
      tryPlace(horiz ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]], T.TABLE);
    }
    // Sols bruyants
    if (rng.chance(P.debris)) {
      const px = rng.int(r.x, r.x + r.w - 3), py = rng.int(r.y, r.y + r.h - 3);
      for (let y = py; y < py + rng.int(2, 4); y++) for (let x = px; x < px + rng.int(2, 4); x++) if (grid.get(x, y) === T.FLOOR && !reserved.has(grid.idx(x, y))) grid.set(x, y, T.DEBRIS);
    }
    if (rng.chance(P.grates)) {
      const px = rng.int(r.x, r.x + r.w - 2), py = rng.int(r.y, r.y + r.h - 2);
      for (let y = py; y < py + 2; y++) for (let x = px; x < px + rng.int(2, 5); x++) if (grid.get(x, y) === T.FLOOR) grid.set(x, y, T.GRATE);
    }
  }

  // Cases accessibles depuis le fourgon (après placement des meubles)
  const reach = floodDistances(grid, Math.floor(spawn.x), Math.floor(spawn.y));
  const accessible = (x, y) => reach[grid.idx(x, y)] >= 0;

  // 11. Casiers (cachettes) le long des murs.
  const lockers = [];
  for (const r of rooms) {
    if (r.start || r.secret) continue;
    const n = rng.chance(P.lockers) ? (r.cells.length > 1 ? 2 : 1) : 0;
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = rng.int(r.x, r.x + r.w - 1), y = rng.int(r.y, r.y + r.h - 1);
        if (grid.get(x, y) !== T.FLOOR || reserved.has(grid.idx(x, y)) || !accessible(x, y)) continue;
        const wallDir = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => grid.get(x + dx, y + dy) === T.WALL);
        if (!wallDir) continue;
        if (lockers.some((l) => Math.abs(l.x - x - 0.5) + Math.abs(l.y - y - 0.5) < 3)) continue;
        lockers.push({ id: lockers.length + 1, x: x + 0.5, y: y + 0.5, face: Math.atan2(-wallDir[1], -wallDir[0]), room: r.id });
        reserved.add(grid.idx(x, y));
        break;
      }
    }
  }

  // 12. Monte-charges (raccourci) : deux salles éloignées.
  const elevators = [];
  const farRooms = rooms.filter((r) => !r.start && !r.secret && !r.isCorridor).sort((a, b) => a.danger - b.danger);
  if (farRooms.length >= 4) {
    const a = farRooms[Math.floor(farRooms.length * 0.25)], b = farRooms[farRooms.length - 1];
    for (const r of [a, b]) {
      const spot = findFreeSpot(grid, r, rng, reserved, 60, accessible);
      if (spot) { elevators.push({ id: elevators.length, x: spot[0] + 0.5, y: spot[1] + 0.5, room: r.id }); reserved.add(grid.idx(spot[0], spot[1])); }
    }
    if (elevators.length === 2) { elevators[0].pair = 1; elevators[1].pair = 0; } else elevators.length = 0;
  }

  // 13. Lampes de plafond (lumières fixes, certaines clignotent).
  const lamps = [];
  for (const r of rooms) {
    if (r.secret) continue;
    if (r.start || rng.chance(P.lamps)) {
      for (const c of r.cells) {
        if (!r.start && rng.chance(0.4)) continue;
        const cx = (c % CX) * cs + cs / 2 + 0.5, cy = ((c / CX) | 0) * cs + cs / 2 + 0.5;
        lamps.push({ x: cx, y: cy, radius: r.start ? 6 : rng.range(3.5, 5.5), flicker: r.start ? 0 : (rng.chance(0.35) ? rng.range(0.3, 1) : 0), color: r.start ? '255,220,170' : '255,236,200', on: true });
      }
    }
  }

  // 14. Butin (uniquement sur des cases accessibles depuis le fourgon)
  const items = placeLoot(grid, rooms, theme, rng, reserved, opts.lootMul || 1, accessible);

  // Pièce secrète : trésor
  const secretRoom = rooms.find((r) => r.secret);
  if (secretRoom) {
    const s = findFreeSpot(grid, secretRoom, rng, reserved);
    if (s) items.push({ type: 'golden_gnome', x: s[0] + 0.5, y: s[1] + 0.5, secret: true });
    for (let i = 0; i < 2; i++) {
      const s2 = findFreeSpot(grid, secretRoom, rng, reserved);
      if (s2) items.push({ type: rng.pick(['safe', 'painting', 'trophy']), x: s2[0] + 0.5, y: s2[1] + 0.5, secret: true });
    }
  }

  return {
    theme: themeId, seed, w: W, h: H, grid, rooms, van, lever, spawn, lockers, elevators, lamps, items,
    doors, cellSize: cs, roomAt,
  };
}

function isOpening(grid, x, y) {
  // case de sol dans l'épaisseur d'un mur (passage sans porte)
  const wallsH = grid.get(x - 1, y) === T.WALL && grid.get(x + 1, y) === T.WALL;
  const wallsV = grid.get(x, y - 1) === T.WALL && grid.get(x, y + 1) === T.WALL;
  return wallsH || wallsV;
}

export function findFreeSpot(grid, room, rng, reserved, tries = 40, filter = null) {
  for (let i = 0; i < tries; i++) {
    const x = rng.int(room.x, room.x + room.w - 1), y = rng.int(room.y, room.y + room.h - 1);
    const t = grid.get(x, y);
    if ((t === T.FLOOR || t === T.DEBRIS || t === T.GRATE) && !reserved?.has(grid.idx(x, y)) && (!filter || filter(x, y))) return [x, y];
  }
  return null;
}

function placeLoot(grid, rooms, theme, rng, reserved, mul, accessible) {
  const table = Object.entries(theme.loot).filter(([t]) => ITEMS[t]);
  const out = [];
  const count = Math.round(theme.lootCount * mul);
  const candidates = rooms.filter((r) => !r.start && !r.secret);
  for (let i = 0; i < count; i++) {
    // les objets précieux préfèrent les salles dangereuses
    const [type] = rng.weighted(table, ([, w]) => w);
    const value = (ITEMS[type].value[0] + ITEMS[type].value[1]) / 2;
    // près du fourgon : seulement des objets modestes ; le précieux est loin
    const room = rng.weighted(candidates, (r) => {
      if (r.danger < 0.3 && value > 90) return 0;
      return 0.15 + r.danger * (value > 150 ? 3 : 1.2) + (r.isCorridor ? -0.1 : 0);
    }) || rng.pick(candidates);
    const spot = findFreeSpot(grid, room, rng, null, 40, accessible);
    if (!spot) continue;
    out.push({ type, x: spot[0] + rng.range(0.3, 0.7), y: spot[1] + rng.range(0.3, 0.7) });
  }
  return out;
}

// Sérialisation compacte pour l'envoi réseau (la carte est envoyée une fois par partie).
export function serializeMap(m) {
  return {
    theme: m.theme, seed: m.seed, w: m.w, h: m.h,
    tiles: Array.from(m.grid.tiles).join(''),
    doorOpen: m.doors.map((i) => m.grid.doorOpen[i]).join(''),
    doors: m.doors,
    rooms: m.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, danger: r.danger, secret: r.secret, start: r.start, corridor: r.isCorridor, cells: r.cells })),
    van: m.van, lever: m.lever, spawn: m.spawn, lockers: m.lockers, elevators: m.elevators, lamps: m.lamps, cellSize: m.cellSize,
  };
}

export function deserializeMap(s) {
  const grid = new Grid(s.w, s.h);
  for (let i = 0; i < s.tiles.length; i++) grid.tiles[i] = s.tiles.charCodeAt(i) - 48;
  s.doors.forEach((i, k) => { grid.doorOpen[i] = s.doorOpen.charCodeAt(k) - 48; });
  return { ...s, grid };
}
