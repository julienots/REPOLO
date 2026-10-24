// ÉVÉNEMENTS DE CHAOS — entièrement pilotés par ces données.
// Le « directeur » (shared/sim/events/director.js) choisit quand et lequel déclencher.
//
// Champs :
//  category    : humor | tension | danger | rare | exceptional | triggered
//  warn        : { text, time } avertissement N secondes avant le début (null = aucun)
//  duration    : [min, max] secondes (0 = effet instantané)
//  weight      : probabilité relative · cooldown : délai avant de pouvoir revenir (s)
//  minTime     : secondes de mission écoulées minimum · minDifficulty : 0..3
//  conditions  : { minRisk, maxTension, minQuota, maxQuota, phases, theme, needsElevators, notDeparting, minTimeLeft }
//  trigger     : (catégorie triggered) nom du signal de jeu qui peut le déclencher
//  tags        : un seul événement actif par tag (évite les combinaisons injustes)
//  incompatible: ids d'événements qui ne peuvent pas être actifs en même temps
//  mods        : modificateurs actifs pendant la durée (voir shared/sim/events/mods.js)
//  start/end   : actions (voir shared/sim/events/actions.js) · every : { period, actions }
//  monsterMods : ajustements d'équité par monstre pendant l'événement
export const EVENTS = [
  {
    id: 'blackout', name: 'BLACK-OUT TOTAL', category: 'tension',
    desc: 'Toutes les lumières fixes s\'éteignent. Il ne reste que vos lampes.',
    warn: { text: 'Les néons grésillent…', time: 3 }, duration: [18, 26], weight: 3, cooldown: 90, minTime: 60,
    tags: ['dark'], mods: { ambientLight: 0 }, monsterMods: { mannequine: { speedMul: 0.45 } },
  },
  {
    id: 'gravity', name: 'GRAVITÉ DÉTRAQUÉE', category: 'humor',
    desc: 'Les objets se mettent à flotter. Tenez bien votre butin.',
    warn: { text: 'Vos oreilles se bouchent bizarrement…', time: 2 }, duration: [9, 13], weight: 2, cooldown: 120, minTime: 45,
    tags: ['physics'], mods: { floatItems: 1, friction: 0.35 },
  },
  {
    id: 'red_alert', name: 'ALERTE ROUGE', category: 'danger',
    desc: 'Une sirène hurle quelque part. Toutes les créatures convergent vers elle.',
    warn: { text: 'Un haut-parleur crachote…', time: 2 }, duration: [12, 16], weight: 2, cooldown: 120, minTime: 90,
    conditions: { maxTension: 0.75 }, tags: ['alarm'],
    start: [{ do: 'noise', at: 'randomRoom', loudness: 30, type: 'siren', remember: 'sirenAt' }],
    every: { period: 3, actions: [{ do: 'noise', at: 'remembered:sirenAt', loudness: 30, type: 'siren' }] },
  },
  {
    id: 'no_talking', name: 'INTERDICTION DE PARLER', category: 'tension',
    desc: 'Les créatures deviennent hypersensibles aux voix. Chuchotez. Ou pas.',
    warn: { text: 'Un panneau s\'allume : « SILENCE ».', time: 3 }, duration: [22, 30], weight: 2, cooldown: 100, minTime: 40,
    tags: ['voice'], mods: { voiceNoise: 3 },
  },
  {
    id: 'voice_swap', name: 'VOIX INVERSÉES', category: 'humor',
    desc: 'Les voix sont déformées et gauche/droite sont inversées. Qui parle ? D\'où ?',
    warn: null, duration: [18, 24], weight: 2, cooldown: 120, minTime: 30,
    tags: ['voice'], mods: { voiceFx: 'robot' },
  },
  {
    id: 'slippery', name: 'SOL GLISSANT', category: 'humor',
    desc: 'Quelqu\'un a renversé 400 litres de cire. Freinez tôt.',
    warn: { text: 'Ça sent le produit ménager…', time: 2 }, duration: [14, 20], weight: 2, cooldown: 100, minTime: 30,
    tags: ['physics'], mods: { friction: 0.12 },
  },
  {
    id: 'urgent_delivery', name: 'LIVRAISON URGENTE', category: 'tension',
    desc: 'Un colis très précieux vient d\'être livré… dans la zone la plus dangereuse.',
    warn: null, duration: 0, weight: 2, cooldown: 150, minTime: 100,
    start: [{ do: 'spawnItems', type: 'urgent_box', count: 1, where: 'danger', drop: true, ping: true }],
  },
  {
    id: 'fake_extraction', name: 'LE FAUX FOURGON', category: 'tension',
    desc: 'Un second fourgon est apparu ! Il est peut-être réel. Vérifiez la plaque.',
    warn: null, duration: [40, 50], weight: 1.5, cooldown: 200, minTime: 120,
    conditions: { minQuota: 0.25 }, tags: ['extraction'],
    start: [{ do: 'fakeVan' }], end: [{ do: 'removeFakeVan' }],
  },
  {
    id: 'invisible_thief', name: 'LE VOLEUR INVISIBLE', category: 'humor',
    desc: 'Un ricanement… Quelque chose vient de vous faire les poches.',
    warn: null, duration: 0, weight: 1.5, cooldown: 140, minTime: 90,
    start: [{ do: 'stealCarried', max: 2 }],
  },
  {
    id: 'flashlight_failure', name: 'PANNE DE LAMPE', category: 'tension',
    desc: 'Les lampes torches faiblissent et clignotent.',
    warn: { text: 'Vos lampes grésillent…', time: 2 }, duration: [12, 18], weight: 2, cooldown: 110, minTime: 60,
    tags: ['dark'], mods: { flashlightRange: 0.45, flicker: 1 }, monsterMods: { mannequine: { speedMul: 0.5 } },
  },
  {
    id: 'crazy_elevator', name: 'ASCENSEUR CAPRICIEUX', category: 'humor',
    desc: 'Le monte-charge n\'en fait qu\'à sa tête : il vous dépose n\'importe où.',
    warn: null, duration: [30, 40], weight: 1.5, cooldown: 140, minTime: 60,
    conditions: { needsElevators: true }, mods: { elevatorRandom: 1 },
    start: [{ do: 'noise', at: 'elevators', loudness: 6, type: 'ding' }],
  },
  {
    id: 'the_double', name: 'LE DOUBLE', category: 'tension',
    desc: 'Les balises de position ont un bug : un collègue apparaît à deux endroits.',
    warn: null, duration: [20, 30], weight: 1.5, cooldown: 120, minTime: 60,
    conditions: { minPlayers: 2 }, mods: { fakeTeammate: 1 },
  },
  {
    id: 'quality_control', name: 'CONTRÔLE QUALITÉ', category: 'humor',
    desc: 'La direction exige qu\'un canard géant soit livré au point de contrôle. Il couine.',
    warn: null, duration: [75, 75], weight: 1.5, cooldown: 300, minTime: 80,
    conditions: { notDeparting: true }, tags: ['objective'],
    start: [{ do: 'questDuck', reward: 180 }], end: [{ do: 'endQuest' }],
  },
  {
    id: 'hunt_night', name: 'NUIT DE LA CHASSE', category: 'danger',
    desc: 'Les créatures sont plus rapides et plus attentives.',
    warn: { text: 'Une sirène lointaine annonce la chasse dans 5 secondes !', time: 5 }, duration: [20, 28], weight: 1.5, cooldown: 150, minTime: 150,
    conditions: { maxTension: 0.7 }, tags: ['aggro'], mods: { monsterSpeed: 1.2, monsterHearing: 1.3 },
  },
  {
    id: 'item_rain', name: 'PLUIE D\'OBJETS', category: 'humor',
    desc: 'Le faux plafond cède. Il pleut des objets. Certains ont de la valeur.',
    warn: { text: 'Le plafond craque au-dessus de vous…', time: 2 }, duration: 0, weight: 2, cooldown: 120, minTime: 50,
    start: [{ do: 'spawnItems', table: 'theme', count: 5, junk: 3, where: 'nearPlayers', drop: true }],
  },
  {
    id: 'confetti_alarm', name: 'ALARME DE CONFETTIS', category: 'humor',
    desc: 'FÉLICITATIONS ! Vous êtes le millionième visiteur ! (Tout le bâtiment l\'a entendu.)',
    warn: null, duration: [5, 5], weight: 1.5, cooldown: 160, minTime: 60,
    mods: { confetti: 1 }, start: [{ do: 'noise', at: 'randomPlayer', loudness: 18, type: 'fanfare' }],
  },
  {
    id: 'customer_king', name: 'LE CLIENT EST ROI', category: 'tension',
    desc: 'Un client spectral attend au fourgon. Il veut un objet précis. Il paie double.',
    warn: null, duration: [80, 80], weight: 1.5, cooldown: 300, minTime: 100,
    conditions: { notDeparting: true }, tags: ['objective'],
    start: [{ do: 'customerOrder' }], end: [{ do: 'endCustomer' }],
  },
  {
    id: 'radio_silence', name: 'SILENCE RADIO', category: 'tension',
    desc: 'Les talkies-walkies ne captent plus rien.',
    warn: null, duration: [25, 35], weight: 1.5, cooldown: 100, minTime: 40,
    mods: { radioDisabled: 1 },
  },
  {
    id: 'crazy_doors', name: 'PORTES FOLLES', category: 'humor',
    desc: 'Les portes s\'ouvrent et claquent toutes seules. Bruyamment.',
    warn: { text: 'Un courant d\'air glacé traverse le bâtiment…', time: 2 }, duration: [12, 16], weight: 2, cooldown: 100, minTime: 40,
    every: { period: 1.2, actions: [{ do: 'doorChaos', count: 3 }] },
  },
  {
    id: 'last_minute', name: 'DERNIÈRE MINUTE', category: 'triggered', trigger: 'quotaReached',
    desc: 'La direction vient de relever le quota de 15 %. Désolé.',
    warn: null, duration: 0, weight: 1, chance: 0.35, cooldown: 9999, minTime: 0,
    conditions: { minTimeLeft: 150, notDeparting: true },
    start: [{ do: 'quotaMul', value: 1.15 }],
  },
  {
    id: 'power_surge', name: 'SURTENSION', category: 'rare',
    desc: 'Tout s\'illumine d\'un coup… vous voyez enfin ce qui vous entoure. Puis plus rien.',
    warn: null, duration: [6, 6], weight: 0.6, cooldown: 300, minTime: 120,
    tags: ['dark'], mods: { reveal: 1 }, end: [{ do: 'chain', event: 'blackout' }],
  },
  {
    id: 'toxic_fog', name: 'BRUME TOXIQUE', category: 'tension',
    desc: 'Une brume épaisse réduit la vision… des joueurs comme des créatures.',
    warn: { text: 'Une odeur de chou bouilli envahit les lieux…', time: 3 }, duration: [20, 28], weight: 1.5, cooldown: 120, minTime: 70,
    tags: ['dark'], mods: { sight: 0.5, flashlightRange: 0.6 },
  },
  {
    id: 'coffee_break', name: 'PAUSE CAFÉ DES MONSTRES', category: 'exceptional',
    desc: 'Syndicat des créatures : 10 secondes de pause réglementaire. Profitez-en.',
    warn: null, duration: [10, 10], weight: 0.4, cooldown: 400, minTime: 150,
    conditions: { minTension: 0.55 }, tags: ['aggro'], mods: { monsterFreeze: 1 },
  },
  {
    id: 'hazard_pay', name: 'PRIME DE RISQUE', category: 'exceptional',
    desc: 'Pendant 40 s, tout objet chargé vaut 50 % de plus. Les créatures, elles, ont faim.',
    warn: null, duration: [40, 40], weight: 0.5, cooldown: 400, minTime: 180,
    tags: ['aggro'], mods: { valueMul: 1.5, monsterSpeed: 1.1 },
  },
  {
    id: 'theft_alarm', name: 'ALARME ANTIVOL', category: 'triggered', trigger: 'itemBroken',
    desc: 'Vous avez cassé un objet de valeur. L\'alarme antivol se déclenche.',
    warn: null, duration: [6, 6], weight: 1, chance: 0.5, cooldown: 90, minTime: 20,
    conditions: { maxTension: 0.85 }, tags: ['alarm'],
    start: [{ do: 'noise', at: 'signal', loudness: 22, type: 'siren' }],
    every: { period: 2, actions: [{ do: 'noise', at: 'signal', loudness: 22, type: 'siren' }] },
  },
  {
    id: 'too_loud', name: 'ILS VOUS ONT ENTENDUS', category: 'triggered', trigger: 'teamTooLoud',
    desc: 'Tout ce bruit a réveillé quelque chose de plus.',
    warn: null, duration: 0, weight: 1, chance: 0.6, cooldown: 240, minTime: 60,
    start: [{ do: 'wakeMonster' }],
  },
  {
    id: 'hotel_shift', name: 'LES COULOIRS BOUGENT', category: 'tension',
    desc: 'L\'hôtel se réorganise : des portes se verrouillent, d\'autres s\'ouvrent.',
    warn: { text: 'Le bâtiment grince comme un vieux navire…', time: 3 }, duration: 0, weight: 2.5, cooldown: 80, minTime: 45,
    conditions: { theme: 'hotel' },
    start: [{ do: 'doorChaos', count: 12, silent: false }],
  },
];

export const EVENT_CATEGORIES = {
  humor: { name: 'Humoristique', color: '#f1c40f' },
  tension: { name: 'Tension', color: '#e67e22' },
  danger: { name: 'Danger', color: '#e74c3c' },
  rare: { name: 'Rare', color: '#9b59b6' },
  exceptional: { name: 'Exceptionnel', color: '#1abc9c' },
  triggered: { name: 'Provoqué', color: '#e84393' },
};
