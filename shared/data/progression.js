// Progression : niveaux, succès, défis quotidiens/hebdomadaires.
import { makeRng, hashString } from '../util/rng.js';

export const xpForLevel = (lvl) => Math.round(250 * Math.pow(lvl, 1.35));

export function levelFromXp(xp) {
  let lvl = 1;
  while (xp >= xpForLevel(lvl)) { xp -= xpForLevel(lvl); lvl++; }
  return { level: lvl, into: xp, next: xpForLevel(lvl) };
}

// Succès : condition évaluée sur le résultat d'une mission (res) et le profil cumulé (prof).
export const ACHIEVEMENTS = [
  { id: 'first_job', name: 'Premier jour', desc: 'Terminer une mission (réussie ou non).', check: (res) => true },
  { id: 'first_win', name: 'Ça paie !', desc: 'Réussir une mission.', check: (res) => res.success },
  { id: 'golden_gnome', name: 'Le nain d\'or', desc: 'Extraire le nain de jardin doré de la pièce secrète.', check: (res) => res.extractedTypes?.includes('golden_gnome'), secret: true },
  { id: 'confetti', name: 'Millionième visiteur', desc: 'Survivre à une alarme de confettis.', check: (res) => res.eventsSeen?.includes('confetti_alarm') && res.me?.survived },
  { id: 'abandon', name: 'Chacun pour soi', desc: 'Être élu « a abandonné le plus de coéquipiers ».', check: (res) => res.myAwards?.includes('deserter') },
  { id: 'revive5', name: 'Infirmier de garde', desc: 'Réanimer 5 coéquipiers au total.', check: (res, prof) => (prof.stats.revives || 0) >= 5 },
  { id: 'rich', name: 'Employé du mois', desc: 'Gagner 3 000 crédits au total.', check: (res, prof) => (prof.stats.earned || 0) >= 3000 },
  { id: 'loudest', name: 'Mégaphone', desc: 'Être le joueur le plus bruyant d\'une partie.', check: (res) => res.myAwards?.includes('loudest') },
  { id: 'ghost', name: 'Fantôme bavard', desc: 'Faire « Bouh ! » 10 fois en tant que fantôme.', check: (res) => (res.me?.boos || 0) >= 10 },
  { id: 'last_second', name: 'In extremis', desc: 'Monter dans le fourgon dans la dernière seconde.', check: (res) => res.me?.lastSecond },
  { id: 'pdg', name: 'Promotion canapé', desc: 'Réussir une mission en difficulté PDG.', check: (res) => res.success && res.difficulty === 'pdg' },
  { id: 'all_monsters', name: 'Bestiaire complet', desc: 'Croiser les 8 créatures (au total).', check: (res, prof) => Object.keys(prof.bestiary || {}).length >= 8 },
  { id: 'inspected', name: 'Contrôle positif', desc: 'Se faire confisquer un objet par l\'Inspecteur.', check: (res) => (res.me?.confiscated || 0) > 0 },
  { id: 'bonk', name: 'BONK', desc: 'Faire s\'assommer le Déménageur contre un mur.', check: (res) => res.flags?.includes('bonk') },
  { id: 'piano', name: 'Déménageurs pro', desc: 'Extraire un piano.', check: (res) => res.extractedTypes?.includes('piano') },
];

// Défis : générés de façon déterministe à partir de la date (tout le monde a les mêmes).
const CHALLENGE_POOL = [
  { id: 'extract_value', text: 'Extraire {n} crédits de butin', stat: 'extractedValue', n: [600, 1500], reward: 120 },
  { id: 'revives', text: 'Réanimer {n} coéquipier(s)', stat: 'revives', n: [1, 3], reward: 120 },
  { id: 'missions', text: 'Terminer {n} mission(s)', stat: 'missions', n: [1, 3], reward: 80 },
  { id: 'wins', text: 'Réussir {n} mission(s)', stat: 'wins', n: [1, 2], reward: 130 },
  { id: 'fragile', text: 'Extraire {n} objet(s) fragile(s) intact(s)', stat: 'fragileIntact', n: [2, 5], reward: 110 },
  { id: 'quiet', text: 'Finir une mission en faisant moins de {n} points de bruit', stat: 'quietRun', n: [250, 400], reward: 150, inverse: true },
  { id: 'heavy', text: 'Extraire {n} objet(s) lourd(s)', stat: 'heavyExtracted', n: [2, 5], reward: 110 },
  { id: 'events', text: 'Survivre à {n} événements', stat: 'eventsSurvived', n: [3, 8], reward: 90 },
];

export function challengesFor(dateKey, count, salt) {
  const rng = makeRng(hashString(dateKey + salt));
  const pool = rng.shuffle(CHALLENGE_POOL.slice());
  return pool.slice(0, count).map((c) => {
    const n = rng.int(c.n[0], c.n[1]);
    return { id: `${salt}:${dateKey}:${c.id}`, key: c.id, text: c.text.replace('{n}', n), stat: c.stat, target: n, reward: c.reward * (salt === 'week' ? 3 : 1), inverse: !!c.inverse };
  });
}

export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
}
