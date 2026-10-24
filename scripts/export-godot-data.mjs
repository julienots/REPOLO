// Exporte les données du jeu (shared/data) en JSON pour la version Godot 3D,
// + des cartes de référence générées par le code JS (test de parité du générateur GDScript).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONSTERS } from '../shared/data/monsters.js';
import { ITEMS } from '../shared/data/items.js';
import { EVENTS, EVENT_CATEGORIES } from '../shared/data/events.js';
import { MISSIONS, DIFFICULTIES, VARIANTS, SIDE_OBJECTIVES } from '../shared/data/missions.js';
import { THEMES } from '../shared/data/themes.js';
import { BOT_PROFILES } from '../shared/data/bots.js';
import { LINES, MIMIC_LINES, RESCUER_LINES } from '../shared/data/dialogue.js';
import { COSMETICS, DEFAULT_COSMETICS } from '../shared/data/cosmetics.js';
import { EQUIPMENT } from '../shared/data/equipment.js';
import { GAME, SIM, LIMITS } from '../shared/config/game.js';
import { generateMap } from '../shared/map/generator.js';
import { makeRng, hashString } from '../shared/util/rng.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'godot');
const data = { GAME, SIM, LIMITS, MONSTERS, ITEMS, EVENTS, EVENT_CATEGORIES, MISSIONS, DIFFICULTIES, VARIANTS, SIDE_OBJECTIVES, THEMES, BOT_PROFILES, LINES, MIMIC_LINES, RESCUER_LINES, COSMETICS, DEFAULT_COSMETICS, EQUIPMENT };
writeFileSync(path.join(OUT, 'data', 'game_data.json'), JSON.stringify(data, null, 1));

// Références pour les tests de parité (RNG + cartes)
const rng = makeRng(12345);
const fixtures = {
  rng: { seed: 12345, values: Array.from({ length: 8 }, () => rng.next()), hash: hashString('Opération Panique') },
  maps: [],
};
for (const theme of Object.keys(THEMES)) {
  for (const seed of [7, 4242]) {
    const m = generateMap(theme, seed);
    fixtures.maps.push({ theme, seed, w: m.w, h: m.h, tiles: Array.from(m.grid.tiles).join(''), items: m.items.length, lockers: m.lockers.length, elevators: m.elevators.length, van: m.van });
  }
}
writeFileSync(path.join(OUT, 'tests', 'fixtures.json'), JSON.stringify(fixtures));
console.log('Données Godot exportées :', Object.keys(data).length, 'tables,', fixtures.maps.length, 'cartes de référence');
