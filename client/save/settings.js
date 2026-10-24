// Réglages (persistants, par appareil).
const KEY = 'op-panique.settings';

export const DEFAULT_KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], sneak: ['ControlLeft', 'KeyC'], interact: ['KeyE'], throw: ['KeyR'], utility: ['KeyG'],
  light: ['KeyF'], talk: ['KeyV'], radio: ['KeyB'], chat: ['Enter', 'KeyT'], emote1: ['Digit1'], emote2: ['Digit2'], emote3: ['Digit3'], emote4: ['Digit4'],
  pause: ['Escape', 'KeyP'],
};

export const KEY_LABELS = {
  up: 'Avancer', down: 'Reculer', left: 'Gauche', right: 'Droite', sprint: 'Courir (maintenir)', sneak: 'Discret (maintenir)',
  interact: 'Action (ramasser, lâcher, porte, cachette, réanimer, levier)', throw: 'Lancer l\'objet', utility: 'Utiliser l\'équipement',
  light: 'Lampe torche', talk: 'Parler (appuyer pour parler)', radio: 'Talkie-walkie', chat: 'Chat écrit',
  emote1: 'Emote 1', emote2: 'Emote 2', emote3: 'Emote 3', emote4: 'Emote 4', pause: 'Pause',
};

export const DEFAULT_SETTINGS = {
  master: 0.8, sfx: 0.9, voice: 1.0, music: 0.5, botVoices: 0.7,
  voiceMode: 'ptt',          // 'ptt' (appuyer pour parler) | 'open' (micro ouvert avec détection) | 'off'
  voiceEnabled: false,       // l'utilisateur doit l'activer explicitement (confidentialité)
  autoMuteStrangers: false,  // ne pas entendre les joueurs hors de sa liste d'amis (= tout le monde muet par défaut)
  vadThreshold: 0.06,
  graphics: 'auto',          // auto | low | medium | high
  visualSounds: false,       // cercles visuels pour les sons (accessibilité)
  screenShake: true,
  showFps: false,
  touchControls: 'auto',     // auto | on | off
  keys: DEFAULT_KEYS,
  mutedPeers: {},
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...s, keys: { ...DEFAULT_KEYS, ...(s.keys || {}) } };
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible : réglages de session */ }
}
