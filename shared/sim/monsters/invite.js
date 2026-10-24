// LE DERNIER INVITÉ — prend l'apparence d'un coéquipier éloigné.
// roam → disguise(copie l'apparence de X) → approach / tag-along → lunge (si on lui tourne le dos)
// Démasqué si on lui lance un objet ou si on l'éclaire de près 1,2 s → reveal → flee.
// Indices : pas de faisceau de lampe, nom qui clignote avec des lettres mélangées (client).
import { dist, angleDiff } from '../../util/math.js';
import { MIMIC_LINES } from '../../data/dialogue.js';
import { inFlashlight } from '../perception.js';
import { wander, goRest, pursue, playerById, isTargetable, nearestAlive } from './common.js';

export default {
  init(m) { m.ex.as = null; m.ex.exposeT = 0; m.ex.chatT = 6; },
  onRest(m) { if (m.state === 'roam') m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('roam'); },
  onHitByItem(m) { reveal(m, 'AÏE ! …HIHIHI.'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    // choix / maintien du déguisement
    if (!m.ex.as || !g.players.has(m.ex.as)) m.ex.as = pickIdentity(m);
    const victim = g.players.get(m.ex.as);
    // si la personne copiée est toute proche, le déguisement serait évident : il s'éloigne
    const victimNear = victim && dist(victim.x, victim.y, m.x, m.y) < 7;

    if (m.ex.as && m.state !== 'flee') {
      let lit = false;
      for (const p of g.players.values()) if (p.state === 'alive' && dist(p.x, p.y, m.x, m.y) < 3.2 && inFlashlight(g, p, m.x, m.y)) lit = true;
      m.ex.exposeT = lit ? m.ex.exposeT + dt : Math.max(0, m.ex.exposeT - dt);
      if (m.ex.exposeT > 1.2) reveal(m, 'IIIIIIIIIH !');
    }

    switch (m.state) {
      case 'rest': goRest(m, dt, sp.roam); break;
      case 'roam': {
        wander(m, sp.roam, dt, { pauseMin: 0.5, pauseMax: 2 });
        const near = m.hunting ? nearestAlive(m, (p) => p.id !== m.ex.as) : null;
        if (near && near.d < 12 && m.ex.as) { m.target = near.p.id; m.setState('approach'); }
        break;
      }
      case 'approach': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || victimNear) { m.setState('roam'); m.ex.as = null; break; }
        const d = dist(m.x, m.y, p.x, p.y);
        if (d > 2.2) m.moveTo(p.x, p.y, sp.approach, dt, 2.0);
        else m.angle = Math.atan2(p.y - m.y, p.x - m.x);
        m.ex.chatT -= dt;
        if (m.ex.chatT <= 0 && d < 8) { m.ex.chatT = g.rng.range(7, 12); g.say(m, g.rng.pick(MIMIC_LINES), 'disguised'); }
        // s'il nous tourne le dos de près… ou après un moment
        const facing = Math.abs(angleDiff(p.angle, Math.atan2(m.y - p.y, m.x - p.x)));
        if ((d < 2.6 && facing > 1.9 && m.stateT > 3) || (m.stateT > 22 && d < 3)) {
          m.setState('lunge');
          m.emit('monster', 8);
        }
        if (m.stateT > 40) m.setState('roam');
        break;
      }
      case 'lunge': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || m.stateT > 3) { m.setState('roam'); break; }
        pursue(m, p, sp.chase, dt);
        if (m.tryAttack(p)) { reveal(m, 'HIHIHIHI !'); }
        break;
      }
      case 'flee': {
        if (!m.ex.fleePt) m.ex.fleePt = m.randomRoomPoint({ preferFar: true });
        m.moveTo(m.ex.fleePt.x, m.ex.fleePt.y, sp.flee, dt, 0.8);
        if (m.stateT > 6) {
          m.ex.fleePt = null; m.ex.as = null; m.ex.exposeT = 0;
          m.cycle = { phase: 'rest', t: g.rng.range(...m.def.cycle.rest) };
          m.setState('rest');
        }
        break;
      }
    }
  },
};

function reveal(m, text) {
  if (m.state === 'flee') return;
  m.ex.as = null;
  m.game.say(m, text, 'monster');
  m.emit('monster', 9);
  m.game.signal('monsterExposed', { monster: m.id });
  m.setState('flee');
}

// Copie quelqu'un qui est loin (>12 cases) de tous les autres joueurs vivants
function pickIdentity(m) {
  const g = m.game;
  const ps = [...g.players.values()].filter((p) => p.state === 'alive' || p.state === 'downed');
  if (ps.length < 2) return null;
  const candidates = ps.filter((p) => dist(p.x, p.y, m.x, m.y) > 12);
  return candidates.length ? g.rng.pick(candidates).id : null;
}
