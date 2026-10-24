// Environnements. Chaque thème pilote le générateur de carte (disposition, meubles, butin)
// et le rendu (palette). Ajouter un thème = ajouter une entrée ici + l'utiliser dans missions.js.
export const THEMES = {
  warehouse: {
    name: 'Entrepôt Morvan',
    blurb: 'Un complexe industriel abandonné. Grandes halles, étagères interminables, sol plein de verre.',
    layout: { cellsX: 6, cellsY: 5, cellSize: 9, mergeChance: 0.38, extraLinks: 0.35, doorChance: 0.55, wideChance: 0.35, corridorRows: [] },
    props: { shelfRows: 0.75, tables: 0.3, debris: 0.45, grates: 0.25, lockers: 0.5, lamps: 0.45 },
    loot: { vase: 1, radio_old: 2, tv: 2, safe: 1, crate: 4, toolbox: 3, statue: 1, clock: 1, bottle: 1, trophy: 1, servers: 1, gnome: 2, painting: 1, junk: 2 },
    lootCount: 38,
    palette: { floor: '#3a3d38', floor2: '#373a34', wall: '#5a5048', wallTop: '#7a6c5e', shelf: '#6b5233', table: '#4b4b55', debris: '#8a8f99', grate: '#4a5a60', fog: '8,10,12', accent: '#e8a33d' },
  },
  hotel: {
    name: 'Hôtel Bellevue-Mortel',
    blurb: 'Un hôtel délabré. Couloirs moquettés, chambres en enfilade et portes qui n\'en font qu\'à leur tête.',
    layout: { cellsX: 7, cellsY: 5, cellSize: 7, mergeChance: 0.08, extraLinks: 0.2, doorChance: 0.9, wideChance: 0.05, corridorRows: [2] },
    props: { shelfRows: 0.25, tables: 0.75, debris: 0.15, grates: 0.0, lockers: 0.8, lamps: 0.6 },
    loot: { vase: 2, lamp: 3, painting: 3, clock: 2, chandelier: 1, piano: 1, suitcase: 3, bottle: 2, statue: 1, trophy: 1, gnome: 1, junk: 2 },
    lootCount: 38,
    shiftingDoors: true,
    palette: { floor: '#4a2328', floor2: '#462229', wall: '#6b5a44', wallTop: '#a48a62', shelf: '#4a2e1c', table: '#5e3b22', debris: '#b0a080', grate: '#555', fog: '12,6,8', accent: '#d4af37' },
  },
  lab: {
    name: 'Laboratoire Souterrain Δ-7',
    blurb: 'Un laboratoire enterré. Sas, grilles métalliques bruyantes, bocaux qui vous regardent.',
    layout: { cellsX: 6, cellsY: 5, cellSize: 8, mergeChance: 0.15, extraLinks: 0.4, doorChance: 0.8, wideChance: 0.1, corridorRows: [] },
    props: { shelfRows: 0.45, tables: 0.6, debris: 0.2, grates: 0.55, lockers: 0.55, lamps: 0.5 },
    loot: { jar: 4, microscope: 3, servers: 2, safe: 1, toolbox: 2, crate: 2, bottle: 1, radio_old: 1, tv: 1, junk: 3 },
    lootCount: 38,
    palette: { floor: '#2b3436', floor2: '#283134', wall: '#46545a', wallTop: '#6f8890', shelf: '#4f5d63', table: '#59666b', debris: '#9fb0b0', grate: '#556a70', fog: '4,10,10', accent: '#58e0c0' },
  },
};
