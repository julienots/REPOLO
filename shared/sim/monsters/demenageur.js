// LE DÉMÉNAGEUR — colosse maladroit.
// roam (renverse les objets, défonce les portes, éteint les lampes) → (voit) windup → charge
// en ligne droite → si mur : stunned (BONK, casse les murs fissurés) → chase court → roam.
import { dist, angleTo } from '../../util/math.js';
import { moveCircle, T } from '../../map/grid.js';
import { wander, goRest, pursue, playerById, isTargetable } from './common.js';

export default {
  smashDoors: true,
  init(m) { m.ex.stomp = 0; },
  onRest(m) { if (m.state === 'roam') m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('roam'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    m.ex.stompT = (m.ex.stompT || 0) - dt;
    if (m.ex.stompT <= 0 && m.moving) { m.ex.stomp++; m.ex.stompT = m.state === 'charge' ? 0.25 : 0.7; m.emit('step', m.state === 'charge' ? 7 : 3.5); }

    const vis = m.hunting ? m.visiblePlayers().filter((v) => v.p.state === 'alive') : [];
    kickItems(m);
    breakLamps(m);

    switch (m.state) {
      case 'rest': goRest(m, dt, sp.roam); if (vis.length && vis[0].d < 3.5) windup(m, vis[0].p); break;
      case 'roam':
        wander(m, sp.roam, dt, { pauseMin: 0.5, pauseMax: 2 });
        if (vis.length) windup(m, vis[0].p);
        else if (m.heard && m.heard.strength > 2 && m.hunting) { m.ex.goal = { x: m.heard.noise.x, y: m.heard.noise.y }; m.setState('investigate'); }
        break;
      case 'investigate':
        if (m.moveTo(m.ex.goal.x, m.ex.goal.y, sp.chase * 0.8, dt, 0.8) || m.stateT > 10) m.setState('roam');
        if (vis.length) windup(m, vis[0].p);
        break;
      case 'windup': {
        // indice : il gratte le sol et rugit (0,9 s) avant de charger
        const p = playerById(m, m.target);
        if (p) m.angle = angleTo(m.x, m.y, p.x, p.y);
        if (m.stateT > 0.9) {
          m.ex.dir = m.angle;
          m.setState('charge');
          m.emit('monster', 12);
        }
        break;
      }
      case 'charge': {
        const s = sp.charge * m.speedMul * dt;
        const nx = Math.cos(m.ex.dir) * s, ny = Math.sin(m.ex.dir) * s;
        const r = moveCircle(g.map.grid, m.x, m.y, nx, ny, m.radius);
        const hitWall = r.hitX || r.hitY;
        if (hitWall) {
          // casse ce qu'il percute : murs fissurés, portes
          const fx = Math.floor(m.x + Math.cos(m.ex.dir) * (m.radius + 0.4));
          const fy = Math.floor(m.y + Math.sin(m.ex.dir) * (m.radius + 0.4));
          for (const [tx, ty] of [[fx, fy], [fx + 1, fy], [fx - 1, fy], [fx, fy + 1], [fx, fy - 1]]) {
            const t = g.map.grid.get(tx, ty);
            if (t === T.CRACKED) g.breakWall(tx, ty, m);
            if (t === T.DOOR) g.breakDoor(tx, ty, m);
          }
          m.x = r.x; m.y = r.y;
          m.stunT = 3;
          m.setState('stunned');
          m.emit('bonk', 11);
          g.flag('bonk');
          g.signal('bonk', { monster: m.id });
          g.shake(m.x, m.y, 4);
          break;
        }
        m.x = r.x; m.y = r.y;
        for (const p of g.players.values()) {
          if (p.state === 'alive' && !p.hidden && dist(m.x, m.y, p.x, p.y) < m.radius + 0.5 && m.attackCd <= 0) {
            m.attackCd = m.def.attackCooldown;
            g.damagePlayer(p, m.def.damage, m, { knock: 9, dir: m.ex.dir });
          }
        }
        if (m.stateT > 2.0) m.setState('chase');
        break;
      }
      case 'stunned':
        m.setState('chase');
        break;
      case 'chase': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || m.stateT > 5) { m.setState('roam'); break; }
        pursue(m, p, sp.chase, dt);
        m.tryAttack(p);
        if (m.stateT > 1.2 && vis.some((v) => v.p === p && v.d > 2.5 && v.d < 7)) windup(m, p);
        break;
      }
    }
  },
};

function windup(m, p) {
  m.target = p.id;
  m.setState('windup');
  m.game.say(m, 'GRRRAAAOUH !', 'monster');
  m.emit('monster', 10);
}

function kickItems(m) {
  const g = m.game;
  for (const it of g.items.values()) {
    if (it.carriedBy) continue;
    const d = dist(m.x, m.y, it.x, it.y);
    if (d < m.radius + it.def.radius + 0.1) {
      const a = Math.atan2(it.y - m.y, it.x - m.x) + g.rng.range(-0.5, 0.5);
      const force = m.state === 'charge' ? 11 : 5;
      it.vx += Math.cos(a) * force / Math.sqrt(it.def.weight);
      it.vy += Math.sin(a) * force / Math.sqrt(it.def.weight);
      it.lastTouch = m.id;
    }
  }
}

function breakLamps(m) {
  if (m.state !== 'charge') return;
  for (const l of m.game.map.lamps) {
    if (l.on && dist(m.x, m.y, l.x, l.y) < 0.9) { l.on = false; m.game.lampsDirty = true; m.emit('break', 6); }
  }
}
