// Fusion des modificateurs des événements actifs.
// Nombres : multipliés. Drapeaux (0/1) : OU logique. Chaînes : le dernier actif gagne.
export const DEFAULT_MODS = {
  ambientLight: 1,      // lampes de plafond
  flashlightRange: 1,
  flicker: 0,           // lampes torches qui clignotent
  friction: 1,          // < 1 = glisse
  floatItems: 0,
  voiceNoise: 1,        // sensibilité des créatures aux voix
  voiceFx: '',          // effet vocal côté client ('robot')
  monsterSpeed: 1,
  monsterHearing: 1,
  monsterFreeze: 0,
  radioDisabled: 0,
  sight: 1,
  valueMul: 1,
  confetti: 0,
  reveal: 0,
  fakeTeammate: 0,
  elevatorRandom: 0,
  aggro: 0,             // heure de fermeture : toutes les créatures chassent
};

const MULTIPLY = new Set(['ambientLight', 'flashlightRange', 'friction', 'voiceNoise', 'monsterSpeed', 'monsterHearing', 'sight', 'valueMul']);

export function combineMods(list) {
  const out = { ...DEFAULT_MODS };
  for (const mods of list) {
    if (!mods) continue;
    for (const [k, v] of Object.entries(mods)) {
      if (MULTIPLY.has(k)) out[k] *= v;
      else if (typeof v === 'string') out[k] = v;
      else out[k] = out[k] || v ? 1 : 0;
    }
  }
  return out;
}

export function combineMonsterMods(list) {
  const out = {};
  for (const mm of list) {
    if (!mm) continue;
    for (const [type, m] of Object.entries(mm)) {
      out[type] = out[type] || { speedMul: 1 };
      if (m.speedMul) out[type].speedMul *= m.speedMul;
    }
  }
  return out;
}
