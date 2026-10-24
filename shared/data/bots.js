// Personnalités des bots. Les traits (0..1) pondèrent les décisions de l'IA utilitaire
// (shared/sim/bots/brain.js). Aucun service d'IA externe n'est utilisé.
export const BOT_PROFILES = {
  prudent:    { name: 'Le Prudent', names: ['Gérard', 'Odile', 'Bernard'], caution: 0.9, bravery: 0.25, greed: 0.35, panic: 0.3, loyalty: 0.6, clumsy: 0.1, talk: 0.6, suit: '#4a7bd0' },
  courageux:  { name: 'Le Courageux', names: ['Kévin', 'Jessica', 'Max'], caution: 0.25, bravery: 0.9, greed: 0.55, panic: 0.15, loyalty: 0.7, clumsy: 0.2, talk: 0.7, suit: '#d04a4a' },
  panique:    { name: 'Le Paniqué', names: ['Thierry', 'Sabine', 'Léo'], caution: 0.6, bravery: 0.1, greed: 0.4, panic: 0.95, loyalty: 0.4, clumsy: 0.45, talk: 1.0, suit: '#e0c040' },
  cupide:     { name: 'Le Cupide', names: ['Rémi', 'Nadège', 'Hugo'], caution: 0.3, bravery: 0.55, greed: 1.0, panic: 0.35, loyalty: 0.2, clumsy: 0.25, talk: 0.7, suit: '#40b060' },
  protecteur: { name: 'Le Protecteur', names: ['Fatou', 'Yannick', 'Inès'], caution: 0.5, bravery: 0.7, greed: 0.3, panic: 0.2, loyalty: 1.0, clumsy: 0.15, talk: 0.7, suit: '#8e5bd0' },
  comique:    { name: 'Le Comique involontaire', names: ['Jean-Mi', 'Brigitte', 'Pascal'], caution: 0.45, bravery: 0.5, greed: 0.6, panic: 0.55, loyalty: 0.5, clumsy: 0.85, talk: 0.9, suit: '#e07a30' },
};

export const BOT_PROFILE_IDS = Object.keys(BOT_PROFILES);
