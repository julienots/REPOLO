// Missions et difficultés. Une mission = un thème + des paramètres + des objectifs secondaires.
export const DIFFICULTIES = {
  stagiaire: { name: 'Stagiaire', desc: 'Pour découvrir. Monstres lents, quota bas, peu d\'événements.', monsterBudget: 3, monsterSpeed: 0.85, perception: 0.8, quotaMul: 0.75, eventRate: 0.7, timeMul: 1.2, rewardMul: 0.8, level: 0, maxMonsters: 2 },
  employe: { name: 'Employé', desc: 'L\'expérience prévue. Ça va crier.', monsterBudget: 5, monsterSpeed: 1.0, perception: 1.0, quotaMul: 1.0, eventRate: 1.0, timeMul: 1.0, rewardMul: 1.0, level: 1, maxMonsters: 3 },
  cadre: { name: 'Cadre sup', desc: 'Monstres affûtés, événements fréquents, quota exigeant.', monsterBudget: 7, monsterSpeed: 1.1, perception: 1.15, quotaMul: 1.25, eventRate: 1.3, timeMul: 0.95, rewardMul: 1.4, level: 2, maxMonsters: 4 },
  pdg: { name: 'PDG (cauchemar)', desc: 'Tout le monde est réveillé. Bonne chance.', monsterBudget: 10, monsterSpeed: 1.2, perception: 1.3, quotaMul: 1.5, eventRate: 1.6, timeMul: 0.9, rewardMul: 2.0, level: 3, maxMonsters: 5 },
};

export const MISSIONS = {
  morvan: {
    name: 'Cambriolage à l\'Entrepôt Morvan',
    theme: 'warehouse',
    brief: 'Le propriétaire est « injoignable depuis 1987 ». Récupérez tout ce qui a de la valeur.',
    quota: 1700, time: 540, // secondes
    monsterPool: ['sourdine', 'inspecteur', 'demenageur', 'mannequine', 'echo', 'berger', 'sauveteur', 'invite'],
    required: ['sourdine'],
    unlockLevel: 1,
  },
  bellevue: {
    name: 'Check-out à l\'Hôtel Bellevue-Mortel',
    theme: 'hotel',
    brief: 'Les clients ne sont jamais partis. Leurs valises non plus. Les portes changent d\'avis.',
    quota: 1800, time: 540,
    monsterPool: ['inspecteur', 'mannequine', 'invite', 'sauveteur', 'echo', 'berger', 'sourdine', 'demenageur'],
    required: ['inspecteur'],
    unlockLevel: 2,
  },
  delta7: {
    name: 'Inventaire au Labo Δ-7',
    theme: 'lab',
    brief: 'Le labo a fermé « suite à un incident ». Les bocaux, eux, sont toujours ouverts.',
    quota: 1800, time: 540,
    monsterPool: ['echo', 'sourdine', 'berger', 'mannequine', 'demenageur', 'inspecteur', 'invite', 'sauveteur'],
    required: ['echo'],
    unlockLevel: 3,
  },
};

// Variantes tirées au hasard au lancement (modifient les règles de la mission).
export const VARIANTS = [
  { id: 'standard', name: 'Mission standard', desc: '', weight: 5 },
  { id: 'heavy', name: 'Déménagement', desc: 'Plus d\'objets lourds, plus précieux.', weight: 2, lootMul: 1.0, heavyBias: true, quotaMul: 1.1 },
  { id: 'dark', name: 'Coupure de courant', desc: 'Lampes de plafond hors service. Batteries neuves.', weight: 2, noLamps: true },
  { id: 'rush', name: 'Livraison express', desc: 'Moins de temps, quota réduit.', weight: 1, timeMul: 0.75, quotaMul: 0.85 },
  { id: 'loud', name: 'Écho maximal', desc: 'Les sons portent plus loin. Pour tout le monde.', weight: 1, noiseMul: 1.25 },
];

// Objectifs secondaires (bonus). check(ctx) est évalué à la fin de la mission.
export const SIDE_OBJECTIVES = [
  { id: 'no_death', name: 'Personne ne meurt', reward: 150 },
  { id: 'fragile3', name: 'Extraire 3 objets fragiles intacts (>90 %)', reward: 120 },
  { id: 'big_haul', name: 'Dépasser le quota de 50 %', reward: 200 },
  { id: 'quiet', name: 'Discrétion : moins de 8 alertes de monstres', reward: 120 },
  { id: 'heavy2', name: 'Extraire 2 objets très lourds', reward: 130 },
  { id: 'fast', name: 'Partir avec plus de 2 minutes restantes', reward: 100 },
];
