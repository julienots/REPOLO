// Statistiques de fin de partie, récompenses amusantes (jamais humiliantes), morts absurdes,
// moments forts avec mini-replays (positions des 8 dernières secondes).
export function newStats() {
  return {
    noise: 0, revives: 0, deposited: 0, depositedCount: 0, abandonedValue: 0, longestChase: 0, chaseT: 0,
    catastrophes: 0, broken: 0, abandons: 0, deaths: 0, lastSecond: false, confiscated: 0, boos: 0,
    fragileIntact: 0, heavyExtracted: 0, deathCause: null, absurd: false, hits: 0,
  };
}

export const AWARDS = [
  { id: 'loudest', name: 'Mégaphone humain', desc: 'Le plus bruyant de l\'équipe', stat: (s) => s.noise, min: 60 },
  { id: 'savior', name: 'Ange gardien', desc: 'Le plus de réanimations', stat: (s) => s.revives, min: 1 },
  { id: 'hoarder', name: 'Brocanteur distrait', desc: 'Plus grande valeur d\'objets abandonnés', stat: (s) => s.abandonedValue, min: 60 },
  { id: 'runner', name: 'Marathonien de la peur', desc: 'Plus longue poursuite survécue', stat: (s) => s.longestChase, min: 5, fmt: (v) => `${v.toFixed(1)} s` },
  { id: 'disaster', name: 'Catastrophe ambulante', desc: 'Le plus d\'objets cassés et d\'alarmes', stat: (s) => s.catastrophes, min: 2 },
  { id: 'deserter', name: 'Chacun pour soi', desc: 'A « oublié » le plus de coéquipiers à terre', stat: (s) => s.abandons, min: 1 },
  { id: 'earner', name: 'Employé du mois', desc: 'A chargé le plus de butin', stat: (s) => s.deposited, min: 100, fmt: (v) => `${Math.round(v)} cr` },
  { id: 'smuggler', name: 'Contrôle positif', desc: 'Objets confisqués par l\'Inspecteur', stat: (s) => s.confiscated, min: 1 },
  { id: 'ghost', name: 'Fantôme bavard', desc: 'Le plus de « Bouh ! » post-mortem', stat: (s) => s.boos, min: 3 },
];

export function computeAwards(players) {
  const out = [];
  for (const a of AWARDS) {
    let best = null, bv = -Infinity;
    for (const p of players) {
      const v = a.stat(p.stats);
      if (v > bv) { bv = v; best = p; }
    }
    if (best && bv >= a.min) out.push({ id: a.id, name: a.name, desc: a.desc, player: best.id, playerName: best.name, value: a.fmt ? a.fmt(bv) : String(Math.round(bv)) });
  }
  const absurd = players.filter((p) => p.stats.absurd && p.stats.deathCause);
  if (absurd.length) {
    const p = absurd[0];
    out.push({ id: 'absurd', name: 'Mort la plus absurde', desc: p.stats.deathCause, player: p.id, playerName: p.name, value: '' });
  }
  for (const p of players) if (p.stats.lastSecond) out.push({ id: 'last_second', name: 'In extremis', desc: 'Sauvetage ou fuite à la dernière seconde', player: p.id, playerName: p.name, value: '' });
  return out;
}

const MONSTER_DEATHS = {
  sourdine: ['A parlé un peu trop fort près de la Sourdine', 'Entendu à 30 mètres par une oreille géante'],
  inspecteur: ['Refus d\'obtempérer fatal', 'Contrôlé, puis plus rien'],
  mannequine: ['A quitté la Mannequine des yeux une seconde de trop', 'Victime d\'un mannequin de vitrine'],
  demenageur: ['Déménagé de force', 'Écrasé par un colosse en carton'],
  berger: ['Isolé du troupeau', 'S\'est fait disperser'],
  echo: ['Est allé voir « ce bruit, là-bas »', 'Attiré par son propre écho'],
  sauveteur: ['A fait confiance au sauveteur', 'A suivi la lanterne verte'],
  invite: ['A tourné le dos à un « collègue »', 'Trahi par un sosie'],
};

// Détermine une cause de mort, absurde si les circonstances s'y prêtent.
export function deathCause(game, p, source) {
  const ctx = p.lastHit || {};
  const carried = ctx.carried ? game.itemDefName(ctx.carried) : null;
  if (ctx.carriedValue !== undefined && ctx.carriedValue < 10 && carried) return { text: `Mort en protégeant un « ${carried} » sans valeur`, absurd: true };
  if (game.mods.confetti) return { text: 'Mort sous une pluie de confettis', absurd: true };
  if (game.mods.monsterFreeze) return { text: 'Tué pendant la pause café des monstres (?!)', absurd: true };
  if (source === 'left') return { text: 'Oublié par le fourgon', absurd: true };
  if (source === 'bleed') {
    const near = [...game.players.values()].filter((o) => o !== p && o.state === 'alive' && Math.hypot(o.x - p.x, o.y - p.y) < 8).length;
    return near ? { text: `Ignoré par ${near} collègue(s) pourtant tout proche(s)`, absurd: true } : { text: 'Seul, à terre, dans le noir', absurd: false };
  }
  if (ctx.monsterType === 'mannequine' && !p.light) return { text: 'A éteint sa lampe face à la Mannequine', absurd: true };
  if (ctx.monsterType === 'demenageur' && game.flags.has('bonk')) return { text: 'Écrasé par un Déménageur encore sonné', absurd: true };
  const pool = MONSTER_DEATHS[ctx.monsterType];
  if (pool) return { text: pool[Math.floor(game.rng.next() * pool.length)], absurd: false };
  return { text: 'Cause inconnue (dossier classé)', absurd: false };
}

// Tampon circulaire des positions pour les mini-replays des moments forts.
export class ReplayBuffer {
  constructor(seconds = 8, rate = 4) { this.max = seconds * rate; this.period = 1 / rate; this.frames = []; this.acc = 0; }
  update(game, dt) {
    this.acc += dt;
    if (this.acc < this.period) return;
    this.acc = 0;
    this.frames.push({
      t: Math.round(game.time * 10) / 10,
      p: [...game.players.values()].map((p) => [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.state[0]]),
      m: game.monsters.map((m) => [m.type, Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10]),
    });
    if (this.frames.length > this.max) this.frames.shift();
  }
  capture() { return this.frames.slice(); }
}
