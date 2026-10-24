// LA MANNEQUINE — ne bouge que lorsque personne ne la regarde.
// dormant → (vue ou bruit) active. Observée : figée. Non observée : fonce vers le plus proche.
// Après une attaque : retraite. Indice : craquement de plastique à chaque reprise de mouvement.
import { dist } from '../../util/math.js';
import { observedBy, isLitByLamp } from '../perception.js';
import { nearestAlive, goRest } from './common.js';

export default {
  init(m) { m.setState('dormant'); m.ex.creak = 0; m.ex.wasFrozen = true; },
  onRest(m) { if (m.state === 'stalk') m.setState('retreat'); },
  onWake(m) { if (m.state === 'retreat' || m.state === 'dormant') m.setState('stalk'); },
  update(m, dt) {
    const g = m.game;
    const watchers = observedBy(g, m.x, m.y);
    const frozen = watchers.length > 0;
    m.ex.watched = frozen ? 1 : 0;
    if (frozen) {
      m.ex.wasFrozen = true;
      if (m.state === 'dormant' && m.hunting) m.setState('stalk'); // être vue la réveille
      // elle « fixe » celui qui la regarde
      const w = watchers[0];
      m.angle = Math.atan2(w.y - m.y, w.x - m.x);
      return;
    }
    if (m.state === 'dormant') {
      if (m.hunting && m.heard && m.heard.strength > 3) m.setState('stalk');
      return;
    }
    if (m.ex.wasFrozen) { m.ex.wasFrozen = false; m.ex.creak++; } // le client joue le craquement
    // Les zones éclairées par des lampes fixes la ralentissent fortement
    const lit = isLitByLamp(g, m.x, m.y) ? 0.3 : 1;
    switch (m.state) {
      case 'stalk': {
        const t = nearestAlive(m);
        if (!t) { goRest(m, dt, 2); break; }
        m.target = t.p.id;
        m.moveTo(t.p.x, t.p.y, m.def.speed.chase * lit, dt, 0.2);
        if (m.tryAttack(t.p)) { m.setState('retreat'); m.ex.retreatT = 9; }
        break;
      }
      case 'retreat':
      case 'rest': {
        goRest(m, dt, m.def.speed.chase * 0.6 * lit);
        m.ex.retreatT = (m.ex.retreatT || 0) - dt;
        if (m.state === 'retreat' && m.ex.retreatT <= 0 && !m.resting) m.setState('stalk');
        break;
      }
    }
  },
};
