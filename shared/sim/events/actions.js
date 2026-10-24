// Actions utilisables par les événements (champ start / end / every.actions dans events.js).
// Ajouter une action : ajouter une fonction ici, puis l'utiliser dans les données.
import { emitNoise } from '../noise.js';
import { ITEMS } from '../../data/items.js';
import { THEMES } from '../../data/themes.js';
import { T } from '../../map/grid.js';

function resolveSpot(game, at, inst) {
  const g = game;
  if (at === 'randomRoom') {
    const rooms = g.map.rooms.filter((r) => !r.secret && !r.start);
    return g.randomPointInRoom(g.rng.pick(rooms));
  }
  if (at === 'randomPlayer') {
    const ps = g.alivePlayers();
    const p = ps.length ? g.rng.pick(ps) : null;
    return p ? { x: p.x, y: p.y, player: p.id } : null;
  }
  if (at === 'van') return { x: g.map.van.x + g.map.van.w / 2, y: g.map.van.y + g.map.van.h / 2 };
  if (at === 'signal') return inst.signal && inst.signal.x !== undefined ? { x: inst.signal.x, y: inst.signal.y } : null;
  if (at?.startsWith('remembered:')) return inst.memory[at.slice(11)] || null;
  return null;
}

export const ACTIONS = {
  noise(game, a, inst) {
    if (a.at === 'elevators') {
      for (const e of game.map.elevators) emitNoise(game, { x: e.x, y: e.y, loudness: a.loudness, type: a.type });
      return;
    }
    const spot = resolveSpot(game, a.at, inst);
    if (!spot) return;
    if (a.remember) inst.memory[a.remember] = { x: spot.x, y: spot.y };
    emitNoise(game, { x: spot.x, y: spot.y, loudness: a.loudness, type: a.type });
    if (a.type === 'siren' || a.type === 'fanfare') game.emitSfx(a.type, spot.x, spot.y);
  },

  spawnItems(game, a) {
    const g = game;
    let rooms;
    if (a.where === 'danger') rooms = g.map.rooms.filter((r) => !r.secret && !r.start && r.danger > 0.6);
    else if (a.where === 'nearPlayers') {
      const ps = g.alivePlayers();
      const p = ps.length ? g.rng.pick(ps) : null;
      const r = p ? g.roomAt(p.x, p.y) : null;
      rooms = r && !r.secret ? [r] : g.map.rooms.filter((rm) => !rm.secret);
    } else rooms = g.map.rooms.filter((r) => !r.secret);
    if (!rooms.length) rooms = g.map.rooms.filter((r) => !r.secret);
    const theme = THEMES[g.map.theme];
    const table = Object.entries(theme.loot);
    const total = (a.count || 1) + (a.junk || 0);
    for (let i = 0; i < total; i++) {
      const type = i >= (a.count || 1) ? 'junk' : (a.type || g.rng.weighted(table, ([, w]) => w)[0]);
      const pt = g.randomPointInRoom(g.rng.pick(rooms));
      if (!pt || !ITEMS[type]) continue;
      const it = g.spawnItem(type, pt.x, pt.y);
      if (a.drop) { it.fallT = 0.5 + g.rng.range(0, 0.8); }
      if (a.ping) g.ping(pt.x, pt.y, 'Colis URGENT', 20);
    }
  },

  fakeVan(game) {
    const g = game;
    const rooms = g.map.rooms.filter((r) => !r.start && !r.secret && r.danger > 0.3 && r.danger < 0.85 && r.w >= 5 && r.h >= 4);
    for (let tries = 0; tries < 30 && rooms.length; tries++) {
      const r = g.rng.pick(rooms);
      const x = g.rng.int(r.x, r.x + r.w - 4), y = g.rng.int(r.y, r.y + r.h - 3);
      let ok = true;
      for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) if (g.map.grid.blocksMove(xx, yy)) ok = false;
      if (!ok) continue;
      g.fakeVan = { x, y, w: 3, h: 2 };
      g.ping(x + 1.5, y + 1, 'Fourgon ?', 40);
      return;
    }
  },
  removeFakeVan(game) { game.fakeVan = null; },

  stealCarried(game, a) {
    const g = game;
    let n = 0;
    for (const p of g.alivePlayers()) {
      if (!p.carry || n >= (a.max || 1)) continue;
      const it = g.items.get(p.carry);
      if (!it) continue;
      g.dropCarried(p, { reason: 'stolen' });
      const rooms = g.map.rooms.filter((r) => !r.secret && !r.start);
      const pt = g.randomPointInRoom(g.rng.pick(rooms));
      if (pt) { it.x = pt.x; it.y = pt.y; it.vx = 0; it.vy = 0; }
      g.emitSfx('giggle', p.x, p.y);
      n++;
    }
  },

  quotaMul(game, a) {
    const m = game.mission;
    m.quota = Math.round(m.quota * a.value / 10) * 10;
    m.quotaReachedSignaled = m.deposited >= m.quota;
  },

  questDuck(game, a, inst) {
    const g = game;
    const rooms = g.map.rooms.filter((r) => !r.secret && !r.start && r.danger > 0.25 && r.danger < 0.8);
    const pick = rooms.length ? g.rng.pick(rooms) : g.rng.pick(g.map.rooms.filter((r) => !r.secret));
    const pt = g.randomPointInRoom(pick);
    const cpRoom = g.rng.pick(g.map.rooms.filter((r) => !r.secret && r !== pick && r.danger > 0.15));
    const cp = g.randomPointInRoom(cpRoom);
    if (!pt || !cp) return;
    const duck = g.spawnItem('duck', pt.x, pt.y);
    g.quest = { kind: 'duck', item: duck.id, x: cp.x, y: cp.y, r: 1.4, reward: a.reward || 150, done: false, until: g.time + (inst.duration || 75) };
    g.ping(pt.x, pt.y, 'Canard', 15);
    g.ping(cp.x, cp.y, 'Point de contrôle', 75);
  },
  endQuest(game) {
    const q = game.quest;
    if (q && !q.done) game.announce('Contrôle qualité raté. Le canard est déçu.', 'fail');
    game.quest = null;
  },

  customerOrder(game) {
    const g = game;
    const available = [...g.items.values()].filter((it) => !it.def.quest && !it.def.noLoot && it.type !== 'junk' && !it.secret);
    if (!available.length) return;
    const it = g.rng.pick(available);
    g.customer = { type: it.type, name: it.def.name, until: g.time + 80, done: false, x: g.map.van.x - 0.5, y: g.map.van.y - 0.5 };
    g.announce(`Le client veut : ${it.def.name}. Il paie DOUBLE.`, 'event');
  },
  endCustomer(game) {
    const c = game.customer;
    if (c && !c.done) {
      game.announce('Le client est mécontent. Il a appelé ses amis…', 'fail');
      game.director.forceStart('hunt_night');
    }
    game.customer = null;
  },

  doorChaos(game, a) {
    const g = game, grid = g.map.grid;
    const doors = g.map.doors.filter((i) => !grid.doorBroken[i]);
    for (let k = 0; k < (a.count || 3) && doors.length; k++) {
      const i = g.rng.pick(doors);
      const x = i % grid.w, y = (i / grid.w) | 0;
      g.setDoor(x, y, !grid.doorOpen[i], null, a.silent ? 0 : 4);
    }
  },

  wakeMonster(game) {
    const g = game;
    const sleeping = g.monsters.filter((m) => m.resting);
    if (sleeping.length) {
      const m = g.rng.pick(sleeping);
      m.cycle = { phase: 'active', t: 60 };
      m.behavior.onWake?.(m);
      return;
    }
    g.spawner.spawnExtra();
  },

  chain(game, a) { game.director.forceStart(a.event); },
};

export function runActions(game, list, inst) {
  for (const a of list || []) {
    const fn = ACTIONS[a.do];
    if (fn) fn(game, a, inst);
    else game.log?.(`Action d'événement inconnue : ${a.do}`);
  }
}

export { T };
