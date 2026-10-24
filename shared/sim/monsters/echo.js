// L'ÉCHO — enregistre les sons qu'il entend et les rejoue pour attirer les joueurs.
// Ses imitations sont marquées mimic:true (ignorées par les autres monstres) et légèrement
// désaccordées (detune) + grésillantes côté client : effrayantes, mais démasquables.
import { dist } from '../../util/math.js';
import { MIMIC_LINES } from '../../data/dialogue.js';
import { wander, goRest, pursue, playerById, isTargetable, nearestAlive } from './common.js';

const COPYABLE = new Set(['step', 'door', 'impact', 'kaching', 'chat', 'voice', 'squeak', 'radio', 'step_debris']);

export default {
  init(m) { m.ex.memory = []; m.ex.mimicT = 12; },
  onRest(m) { if (m.state === 'roam' || m.state === 'lurk') m.setState('rest'); },
  onWake(m) { if (m.state === 'rest') m.setState('roam'); },
  update(m, dt) {
    const g = m.game, sp = m.def.speed;
    if (m.heard && COPYABLE.has(m.heard.noise.type) && !m.heard.noise.mimic) {
      const mem = m.ex.memory;
      if (!mem.length || mem[mem.length - 1].type !== m.heard.noise.type) mem.push({ type: m.heard.noise.type, loudness: Math.min(8, m.heard.noise.loudness) });
      if (mem.length > 8) mem.shift();
    }
    m.ex.mimicT -= dt;
    const vis = m.hunting ? m.visiblePlayers().filter((v) => v.p.state === 'alive') : [];

    switch (m.state) {
      case 'rest': goRest(m, dt, sp.roam); break;
      case 'roam': {
        wander(m, sp.roam, dt, { pauseMin: 2, pauseMax: 6 });
        const near = nearestAlive(m);
        if (m.hunting && near && near.d > 5 && near.d < 18 && m.ex.mimicT <= 0) {
          mimic(m);
          m.setState('lurk');
        }
        if (vis.length && vis[0].d < 2.5) { m.target = vis[0].p.id; m.setState('chase'); }
        break;
      }
      case 'lurk': {
        // immobile, dans le noir, il attend que quelqu'un vienne voir
        const near = nearestAlive(m);
        if (near && near.d < 2.4) { m.target = near.p.id; m.setState('chase'); m.emit('monster', 7); break; }
        if (m.stateT > 4 && m.ex.mimicT <= 0 && near && near.d < 16) mimic(m);
        if (m.stateT > 16) m.setState('roam');
        break;
      }
      case 'chase': {
        const p = playerById(m, m.target);
        if (!isTargetable(p) || m.stateT > 6) { m.setState('roam'); m.ex.mimicT = 8; break; }
        pursue(m, p, sp.chase, dt);
        if (m.tryAttack(p)) { m.setState('roam'); m.ex.mimicT = 10; }
        break;
      }
    }
  },
};

function mimic(m) {
  const g = m.game;
  m.ex.mimicT = g.rng.range(9, 15);
  const mem = m.ex.memory;
  const detune = g.rng.range(0.06, 0.12);
  if (!mem.length || g.rng.chance(0.3)) {
    // réplique déformée d'une voix de collègue (bulle signée « ??? »)
    g.say(m, g.rng.pick(MIMIC_LINES), 'mimic');
    m.emit('voice', 5, { mimic: true, detune });
    return;
  }
  const s = g.rng.pick(mem);
  m.emit(s.type, Math.max(3, s.loudness), { mimic: true, detune });
  if (s.type === 'step') { m.emit('step', 3, { mimic: true, detune }); }
}
