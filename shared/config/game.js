// Identité et constantes globales du jeu.
// Pour renommer le jeu, modifier GAME.name / GAME.company / GAME.tagline : tout le reste en dépend.
export const GAME = {
  name: 'OPÉRATION PANIQUE',
  shortName: 'Panique',
  company: 'Récup\'Express S.A.R.L.',
  tagline: 'Récupérez. Survivez. Ne criez pas. (Ou alors criez, c\'est drôle.)',
  version: '0.1.0',
  protocol: 3,
};

// Réglages de simulation (unités : 1 = une case de la carte, temps en secondes).
export const SIM = {
  tickRate: 30,            // pas de simulation par seconde
  snapshotRate: 15,        // états envoyés aux clients par seconde
  playerRadius: 0.3,
  walkSpeed: 3.0,
  sneakSpeed: 1.45,
  sprintSpeed: 5.2,
  crawlSpeed: 0.7,
  ghostSpeed: 4.2,
  staminaDrain: 0.22,      // par seconde de sprint
  staminaRegen: 0.14,
  maxHp: 3,
  bleedOutTime: 28,        // secondes à terre avant de mourir
  reviveTime: 2.6,
  leverTime: 2.0,
  departureTime: 12,       // compte à rebours du fourgon
  interactRange: 1.15,
  flashlightRange: 9,
  flashlightFov: 1.05,     // radians (≈ 60°)
  ambientSight: 1.7,       // rayon de vision même sans lumière
  batteryDrain: 1 / 240,   // une batterie pleine = 4 min allumée
  batteryRegen: 1 / 600,   // se recharge très lentement éteinte
  noiseLife: 0.9,
  graceTime: 35,           // aucun monstre ne chasse pendant les premières secondes
};

export const LIMITS = {
  defaultMaxPlayers: 4,
  absoluteMaxPlayers: 8,
  nameMaxLength: 16,
  chatMaxLength: 140,
  reconnectGrace: 90,      // secondes pendant lesquelles un joueur déconnecté peut revenir
};
