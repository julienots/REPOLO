// LE BERGER — attiré par les groupes, il les disperse puis chasse le plus isolé.
// Indice : sa cloche (ex.bell = taille du groupe qu'il sent) tinte de plus en plus fort.
import { dist } from '../../util/math.js';
import { hasLineOfSight } from '../../map/grid.js';
import { wander, goRest, pursue, playerById, isTargetable } from './common.js';

const GROUP_RADIUS = 4.5;
const SENSE_RANGE = 22;

export default {
  init(m) { m.ex.bell = 0; m.ex.scanT = 0; },
  onRest(m) { if (m.state === 'roam' || m.state === 'stalk') m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('roam'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    m.ex.scanT -= dt;
    if (m.ex.scanT <= 0) { m.ex.scanT = 0.5; m.group = findGroup(m); m.ex.bell = m.group ? m.group.members.length : 0; }
    const grp = m.group;

    switch (m.state) {
      case 'rest':
        goRest(m, dt, sp.roam);
        if (grp && grp.members.length >= 3 && m.hunting) m.setState('stalk');
        break;
      case 'roam': {
        wander(m, sp.roam, dt, { pauseMin: 1, pauseMax: 3 });
        if (grp && m.hunting) m.setState('stalk');
        // opportuniste : attaque un joueur seul qu'il voit de près
        const vis = m.hunting ? m.visiblePlayers() : [];
        if (vis.length && vis[0].d < 5 && isolation(m, vis[0].p) > GROUP_RADIUS) { m.target = vis[0].p.id; m.setState('chase'); }
        break;
      }
      case 'stalk': {
        if (!grp) { m.setState('roam'); break; }
        m.moveTo(grp.x, grp.y, sp.stalk, dt, 1);
        const d = dist(m.x, m.y, grp.x, grp.y);
        const sees = grp.members.some((p) => hasLineOfSight(g.map.grid, m.x, m.y, p.x, p.y));
        if (d < 5.5 && sees) {
          m.setState('ring');
          g.say(m, '♪ DING… DING… DISPERSION. ♪', 'monster');
          m.emit('monster', 10);
        }
        if (m.stateT > 30) m.setState('roam');
        break;
      }
      case 'ring':
        // indice clair : 1,2 s de cloche avant l'onde de choc
        if (m.stateT > 1.2) {
          for (const p of g.players.values()) {
            if (p.state !== 'alive' || p.hidden) continue;
            const d = dist(m.x, m.y, p.x, p.y);
            if (d < 7 && hasLineOfSight(g.map.grid, m.x, m.y, p.x, p.y)) {
              const a = Math.atan2(p.y - m.y, p.x - m.x);
              g.knockback(p, a, 8 * (1 - d / 9));
              if (p.carry) g.dropCarried(p, { fling: 4, reason: 'scatter' });
              p.flickerT = 2;
            }
          }
          m.emit('monster', 9);
          g.shake(m.x, m.y, 3);
          // cible : le plus isolé à portée
          let best = null, bi = -1;
          for (const p of g.players.values()) {
            if (!isTargetable(p) || dist(m.x, m.y, p.x, p.y) > 16) continue;
            const iso = isolation(m, p);
            if (iso > bi) { bi = iso; best = p; }
          }
          if (best) { m.target = best.id; m.setState('chase'); } else m.setState('roam');
        }
        break;
      case 'chase': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || m.stateT > 11) { m.setState('roam'); break; }
        // si la cible rejoint un groupe, il perd son intérêt (et recommence à rôder)
        if (m.stateT > 3 && isolation(m, p) < 2.5) { m.setState('stalk'); break; }
        pursue(m, p, sp.chase, dt);
        if (m.tryAttack(p)) m.setState('roam');
        break;
      }
    }
  },
};

function isolation(m, p) {
  let best = Infinity;
  for (const o of m.game.players.values()) {
    if (o === p || (o.state !== 'alive' && o.state !== 'downed')) continue;
    best = Math.min(best, dist(o.x, o.y, p.x, p.y));
  }
  return best === Infinity ? 99 : best;
}

function findGroup(m) {
  const ps = [...m.game.players.values()].filter((p) => p.state === 'alive' && !p.hidden && dist(m.x, m.y, p.x, p.y) < SENSE_RANGE);
  let best = null;
  for (const p of ps) {
    const members = ps.filter((o) => dist(o.x, o.y, p.x, p.y) < GROUP_RADIUS);
    if (members.length >= 2 && (!best || members.length > best.members.length)) {
      const x = members.reduce((s, o) => s + o.x, 0) / members.length;
      const y = members.reduce((s, o) => s + o.y, 0) / members.length;
      best = { members, x, y };
    }
  }
  return best;
}
