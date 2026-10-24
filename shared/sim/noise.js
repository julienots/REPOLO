// Système de bruit : toute action bruyante crée un « événement sonore » que les créatures
// (et les bots) perçoivent selon la distance et les obstacles (murs, portes fermées).
import { soundObstruction } from '../map/grid.js';

// loudness ≈ rayon d'audibilité en cases, en champ libre.
export const NOISE_TYPES = {
  step: 'Pas', step_debris: 'Verre brisé', step_grate: 'Grille', door: 'Porte', door_smash: 'Porte défoncée',
  impact: 'Choc', break: 'Objet cassé', voice: 'Voix', scream: 'Cri', radio: 'Grésillement radio',
  siren: 'Sirène', fanfare: 'Fanfare', decoy: 'Leurre', engine: 'Moteur', kaching: 'Chargement',
  bonk: 'BONK', squeak: 'Couinement', ding: 'Ding', boo: 'Bouh', flare: 'Fusée', wall_break: 'Mur effondré',
  monster: 'Créature', chat: 'Bavardage', locker: 'Casier', elevator: 'Monte-charge',
};

let nextNoiseId = 1;

export function emitNoise(game, n) {
  const noise = {
    id: nextNoiseId++,
    x: n.x, y: n.y,
    loudness: n.loudness * (game.noiseMul || 1),
    type: n.type || 'impact',
    source: n.source ?? null,   // id du joueur / monstre / objet à l'origine
    mimic: !!n.mimic,           // faux bruit (Écho) — identifiable en interne
    detune: n.detune || 0,
    t: game.time,
    internal: !!n.internal,
  };
  game.noises.push(noise);
  if (!n.internal) game.netNoises.push(noise);
  if (!noise.internal && noise.source && game.players.has(noise.source)) {
    const p = game.players.get(noise.source);
    if (p.stats) p.stats.noise += noise.loudness;
  }
  return noise;
}

// Intensité perçue (> 0 = entendu) d'un bruit en (x, y).
export function perceived(game, noise, x, y, hearingMul = 1) {
  const d = Math.hypot(noise.x - x, noise.y - y);
  const raw = noise.loudness * hearingMul;
  if (d > raw + 1) return 0;
  const obstruction = soundObstruction(game.map.grid, noise.x, noise.y, x, y);
  return raw - d - obstruction;
}
