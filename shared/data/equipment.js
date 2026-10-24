// Équipements utilitaires (un emplacement par joueur, choisi dans le lobby).
// Aucun n'est indispensable : la lampe torche de base suffit pour réussir une mission.
// unlockLevel : niveau requis · price : coût unique en crédits pour le débloquer définitivement.
export const EQUIPMENT = {
  radio: {
    name: 'Talkie-walkie',
    desc: 'Parlez à distance (touche « Radio »). Grésille chez ceux qui vous reçoivent : les monstres l\'entendent aussi.',
    unlockLevel: 1, price: 0, charges: null, battery: 1,
  },
  decoy: {
    name: 'Leurre sonore ×2',
    desc: 'Lancez-le (touche « Objet ») : il sonne 3 s après l\'impact et attire les créatures.',
    unlockLevel: 1, price: 0, charges: 2,
  },
  sneakers: {
    name: 'Baskets en mousse',
    desc: 'Vos pas font 40 % de bruit en moins. Vous glissez un peu plus.',
    unlockLevel: 2, price: 150, charges: null,
  },
  medkit: {
    name: 'Trousse de secours',
    desc: 'Réanimation 2× plus rapide. Une fois par mission : soigne 1 PV (touche « Objet »).',
    unlockLevel: 3, price: 250, charges: 1,
  },
  bigLight: {
    name: 'Projecteur de chantier',
    desc: 'Faisceau plus large et plus long, mais la batterie fond deux fois plus vite.',
    unlockLevel: 4, price: 300, charges: null,
  },
  flare: {
    name: 'Fusée éclairante',
    desc: 'Lancez-la (touche « Objet ») : éclaire une zone 12 s. Fige la Mannequine… et réveille la Sourdine (elle crépite).',
    unlockLevel: 5, price: 350, charges: 1,
  },
};

export const DEFAULT_EQUIPMENT = 'radio';
