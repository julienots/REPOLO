// LE FAUX SAUVETEUR — propose de guider les joueurs « vers la sortie »… dans un cul-de-sac.
// roam → (voit) approach → lead (attend ceux qui suivent) → reveal → chase.
// Démasqué si on l'éclaire en plein visage 1,6 s de près : exposed → flee.
// Indices : lanterne verte (ex.lantern), pas silencieux, répliques un peu trop insistantes.
import { dist } from '../../util/math.js';
import { RESCUER_LINES } from '../../data/dialogue.js';
import { inFlashlight } from '../perception.js';
import { wander, goRest, pursue, playerById, isTargetable, nearestAlive } from './common.js';

export default {
  init(m) { m.ex.lantern = 1; m.ex.disguised = 1; m.ex.exposeT = 0; m.ex.talkT = 0; },
  onRest(m) { if (m.state === 'roam') m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('roam'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    m.ex.talkT -= dt;
    // démasquage par la lampe
    if (m.ex.disguised) {
      let lit = false;
      for (const p of g.players.values()) {
        if (p.state === 'alive' && dist(p.x, p.y, m.x, m.y) < 6 && inFlashlight(g, p, m.x, m.y)) lit = true;
      }
      m.ex.exposeT = lit ? m.ex.exposeT + dt : Math.max(0, m.ex.exposeT - dt * 0.5);
      if (m.ex.exposeT > 1.6 && m.state !== 'reveal') {
        m.ex.disguised = 0; m.ex.lantern = 0;
        g.say(m, 'GRILLÉ !!!', 'monster');
        m.emit('monster', 11);
        g.signal('monsterExposed', { monster: m.id });
        m.setState('flee');
      }
    }

    switch (m.state) {
      case 'rest': goRest(m, dt, sp.roam); break;
      case 'roam': {
        wander(m, sp.roam, dt, { pauseMin: 1, pauseMax: 3 });
        const vis = m.hunting ? m.visiblePlayers().filter((v) => v.p.state === 'alive') : [];
        if (vis.length && m.ex.disguised) { m.target = vis[0].p.id; m.setState('approach'); }
        break;
      }
      case 'approach': {
        const p = playerById(m, m.target);
        if (!isTargetable(p)) { m.setState('roam'); break; }
        if (m.moveTo(p.x, p.y, sp.lead, dt, 2.6) || dist(m.x, m.y, p.x, p.y) < 2.8) {
          talk(m, true);
          m.ex.dest = pickTrap(m);
          m.setState('lead');
        }
        if (m.stateT > 15) m.setState('roam');
        break;
      }
      case 'lead': {
        const near = nearestAlive(m);
        const followerClose = near && near.d < 6.5;
        m.ex.ignoredT = followerClose ? 0 : (m.ex.ignoredT || 0) + dt;
        if (followerClose) {
          m.moveTo(m.ex.dest.x, m.ex.dest.y, sp.lead, dt, 0.8);
          if (near) m.target = near.p.id;
        } else {
          // il attend et appelle
          const p = near?.p; if (p) m.angle = Math.atan2(p.y - m.y, p.x - m.x);
          talk(m, false);
        }
        const atDest = dist(m.x, m.y, m.ex.dest.x, m.ex.dest.y) < 1.4;
        if ((atDest && near && near.d < 3.2) || (m.stateT > 35 && near && near.d < 2.5)) {
          m.setState('reveal'); m.ex.disguised = 0; m.ex.lantern = 0;
          g.say(m, 'Voilà… la sortie… HAHAHA !', 'monster');
          m.emit('monster', 12);
        }
        if (m.ex.ignoredT > 18) m.setState('roam');
        break;
      }
      case 'reveal':
        if (m.stateT > 0.7) m.setState('chase');
        break;
      case 'chase': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || m.stateT > 9) { m.setState('flee'); break; }
        pursue(m, p, sp.chase, dt);
        if (m.tryAttack(p)) m.setState('flee');
        break;
      }
      case 'flee': {
        if (!m.ex.fleePt) m.ex.fleePt = g.randomPointInRoom(m.lair) || m.randomRoomPoint();
        m.moveTo(m.ex.fleePt.x, m.ex.fleePt.y, sp.flee, dt, 0.8);
        if (m.stateT > 7) {
          // il remet son déguisement plus tard
          m.ex.fleePt = null; m.ex.disguised = 1; m.ex.lantern = 1; m.ex.exposeT = 0;
          m.cycle = { phase: 'rest', t: g.rng.range(...m.def.cycle.rest) };
          m.setState('rest');
        }
        break;
      }
    }
  },
};

function talk(m, force) {
  if (!force && m.ex.talkT > 0) return;
  m.ex.talkT = m.game.rng.range(4, 7);
  m.game.say(m, m.game.rng.pick(RESCUER_LINES), 'rescuer');
}

// Destination piège : une salle dangereuse, de préférence loin du fourgon.
function pickTrap(m) {
  const g = m.game;
  const rooms = g.map.rooms.filter((r) => !r.start && !r.secret && r.danger > 0.5);
  const r = rooms.length ? g.rng.weighted(rooms, (rm) => rm.danger) : m.lair;
  return g.randomPointInRoom(r) || { x: m.x, y: m.y };
}
