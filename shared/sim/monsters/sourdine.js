// LA SOURDINE — aveugle, perçoit tout par le son.
// roam → (bruit) investigate → (bruit fort/proche) chase → listen → roam
// Indice : cliquetis d'écholocalisation (ex.click), plus rapides en chasse.
import { dist } from '../../util/math.js';
import { wander, goRest, playerById } from './common.js';

export default {
  init(m) { m.ex.click = 0; },
  onRest(m) { m.setState('rest'); },
  onWake(m) { m.setState('roam'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    m.ex.clickT = (m.ex.clickT || 0) - dt;
    if (m.ex.clickT <= 0) { m.ex.click = (m.ex.click + 1) % 1000; m.ex.clickT = m.state === 'chase' ? 0.45 : 1.3; }

    // Réaction aux sons (sauf pendant le repos, où il faut un bruit fort)
    if (m.heard && m.hunting && m.state !== 'digest') {
      const s = m.heard.strength, n = m.heard.noise;
      const restingThreshold = m.resting ? 5 : 0;
      if (s > restingThreshold) {
        const src = playerById(m, n.source);
        const loudAndClose = s > 3.2 || dist(m.x, m.y, n.x, n.y) < 3.5;
        if (loudAndClose && src && src.state === 'alive') {
          m.target = src.id; m.ex.goal = { x: n.x, y: n.y }; m.setState('chase'); m.ex.lostT = 0;
        } else if (m.state !== 'chase' || s > 4) {
          m.ex.goal = { x: n.x, y: n.y };
          if (m.state !== 'chase') m.setState('investigate');
        }
      }
    }

    switch (m.state) {
      case 'rest': goRest(m, dt, sp.roam); break;
      case 'roam': wander(m, sp.roam, dt, { pauseMin: 2, pauseMax: 5, preferFar: true }); break;
      case 'investigate': {
        const arrived = m.moveTo(m.ex.goal.x, m.ex.goal.y, sp.investigate, dt, 0.6);
        if (arrived) m.setState('listen');
        if (m.stateT > 14) m.setState('roam');
        break;
      }
      case 'digest':
        // après une attaque elle s'éloigne un moment (laisse une chance de réanimer)
        goRest(m, dt, sp.roam * 1.5);
        if (m.stateT > 7) { m.ex.restPt = null; m.setState('roam'); }
        break;
      case 'listen':
        m.angle += dt * 1.5; // tourne la tête
        if (m.stateT > 2.8) m.setState(m.resting ? 'rest' : 'roam');
        break;
      case 'chase': {
        // Il fonce vers le DERNIER bruit entendu de sa cible, pas vers sa position réelle :
        // un joueur qui se tait et s'écarte peut le semer.
        const p = playerById(m, m.target);
        if (m.heard && m.heard.noise.source === m.target) m.ex.goal = { x: m.heard.noise.x, y: m.heard.noise.y };
        const arrived = m.moveTo(m.ex.goal.x, m.ex.goal.y, sp.chase, dt, 0.35);
        if (p && dist(m.x, m.y, p.x, p.y) < 1.6) m.ex.goal = { x: p.x, y: p.y };
        if (arrived) m.setState('listen');
        if (m.stateT > 12) m.setState('listen');
        break;
      }
    }
    // Contact : elle percute tout ce qu'elle touche
    for (const p of g.players.values()) {
      if (m.state !== 'digest' && p.state === 'alive' && !p.hidden && dist(m.x, m.y, p.x, p.y) < m.radius + 0.55) {
        if (m.tryAttack(p)) { m.setState('digest'); }
      }
    }
  },
};
