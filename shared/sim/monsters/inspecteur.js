// L'INSPECTEUR — contrôle des marchandises.
// patrol → (voit un joueur) control « CONTRÔLE ! » → approche. Si la cible bouge : chase.
// Si elle reste immobile jusqu'au contact : check → confisque l'objet porté (le ramène
// dans son bureau, où l'on peut le reprendre) ou laisse partir (« Circulez »).
import { dist } from '../../util/math.js';
import { wander, goRest, pursue, playerById, isTargetable } from './common.js';

export default {
  init(m) { m.ex.lantern = 1; m.ex.cleared = {}; },
  onRest(m) { if (!['control', 'check', 'chase', 'carry'].includes(m.state)) m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('patrol'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    if (m.state === 'roam') m.setState('patrol');
    const visible = m.hunting ? m.visiblePlayers().filter(({ p }) => p.state === 'alive' && !((m.ex.cleared[p.id] || 0) > g.time)) : [];

    switch (m.state) {
      case 'rest':
        goRest(m, dt, sp.roam);
        if (visible.length && visible[0].d < 5) startControl(m, visible[0].p);
        break;
      case 'patrol':
        wander(m, sp.roam, dt, { pauseMin: 1.5, pauseMax: 3.5 });
        if (visible.length) startControl(m, visible[0].p);
        else if (m.heard && m.heard.strength > 2.5 && m.hunting) { m.ex.goal = { x: m.heard.noise.x, y: m.heard.noise.y }; m.setState('investigate'); }
        break;
      case 'investigate': {
        if (m.moveTo(m.ex.goal.x, m.ex.goal.y, sp.approach, dt, 0.7) || m.stateT > 12) m.setState('patrol');
        if (visible.length) startControl(m, visible[0].p);
        break;
      }
      case 'control': {
        const p = playerById(m, m.target);
        if (!isTargetable(p)) { m.setState('patrol'); break; }
        if (!m.ex.speakGrace) m.ex.speakGrace = 0;
        const d = dist(m.x, m.y, p.x, p.y);
        // Délai de réaction généreux (0,9 s) puis toute vitesse > marche lente = fuite
        if (m.stateT > 0.9 && p.speed > 0.9 && d < 11) {
          g.say(m, 'FUITE DÉTECTÉE !', 'monster');
          m.setState('chase'); m.target = p.id; m.ex.lostT = 0;
          break;
        }
        if (d < m.radius + 0.95) { m.setState('check'); m.target = p.id; break; }
        m.moveTo(p.x, p.y, sp.approach, dt, 0.6);
        if (m.stateT > 14) m.setState('patrol');
        break;
      }
      case 'check': {
        const p = playerById(m, m.target);
        if (!isTargetable(p)) { m.setState('patrol'); break; }
        if (m.stateT > 0.4 && p.speed > 1.1) { g.say(m, 'REFUS D\'OBTEMPÉRER !', 'monster'); m.setState('chase'); m.ex.lostT = 0; break; }
        if (m.stateT > 1.6) {
          const item = p.carry ? g.items.get(p.carry) : null;
          if (item) {
            g.confiscate(m, p, item);
            g.say(m, `Confisqué : ${item.def.name}. Bureau 13.`, 'monster');
            m.ex.carrying = item.id;
            m.setState('carry');
          } else {
            g.say(m, 'Rien à déclarer. Circulez.', 'monster');
            m.ex.cleared[p.id] = g.time + 25;
            m.setState('patrol');
          }
          g.emitSfx('stamp', m.x, m.y);
        }
        break;
      }
      case 'carry': {
        // ramène l'objet au bureau (repaire)
        const item = g.items.get(m.ex.carrying);
        if (!item || item.carriedBy !== m.id) { m.ex.carrying = null; m.setState('patrol'); break; }
        if (!m.ex.office) m.ex.office = g.randomPointInRoom(m.lair) || { x: m.x, y: m.y };
        if (m.moveTo(m.ex.office.x, m.ex.office.y, sp.roam * 1.1, dt, 0.8)) {
          g.releaseItem(item, m.x, m.y);
          m.ex.carrying = null; m.ex.office = null;
          m.setState('patrol');
        }
        break;
      }
      case 'chase': {
        const p = playerById(m, m.target);
        if (!isTargetable(p)) { m.setState('patrol'); break; }
        const seen = visible.some((v) => v.p === p);
        if (seen) { m.lastSeen = { x: p.x, y: p.y }; m.ex.lostT = 0; } else m.ex.lostT = (m.ex.lostT || 0) + dt;
        if (seen || m.ex.lostT < 1.2) pursue(m, p, sp.chase, dt);
        else if (m.lastSeen && m.moveTo(m.lastSeen.x, m.lastSeen.y, sp.chase, dt, 0.5)) m.lastSeen = null;
        if (m.tryAttack(p)) { m.ex.cleared[p.id] = g.time + 10; m.setState('patrol'); }
        if (m.ex.lostT > 5) { g.say(m, 'Je reviendrai. Avec un formulaire.', 'monster'); m.setState('patrol'); }
        break;
      }
    }
  },
};

function startControl(m, p) {
  m.target = p.id;
  m.game.say(m, 'CONTRÔLE ! On ne bouge plus !', 'monster');
  m.emit('monster', 9);
  m.game.signal('inspectorControl', { monster: m.id, player: p.id });
  m.setState('control');
}
