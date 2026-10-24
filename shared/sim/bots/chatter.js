// Dialogues des bots : choix contextuel, personnalité, anti-répétition, cooldowns.
import { LINES } from '../../data/dialogue.js';

const DIRS = ['à gauche', 'à droite', 'en haut', 'en bas', 'derrière toi', 'tout droit', 'vers la lumière'];

export class Chatter {
  constructor(game) {
    this.game = game;
    this.recent = [];     // dernières phrases dites (toute l'équipe)
  }

  // Retourne true si le bot a parlé.
  say(bot, trigger, ctx = {}, opts = {}) {
    const g = this.game;
    const prof = bot.profile;
    if (!prof) return false;
    if (!opts.force) {
      if ((bot.brain.talkCd || 0) > g.time) return false;
      if (!g.rng.chance(Math.min(1, (opts.chance ?? 0.8) * prof.talk))) return false;
    }
    const pool = LINES[trigger];
    if (!pool) return false;
    const own = pool[bot.botProfile] || [];
    // les répliques de personnalité sont favorisées
    const candidates = [...own, ...own, ...(pool.all || [])].filter((l) => !this.recent.includes(l));
    if (!candidates.length) return false;
    const tpl = g.rng.pick(candidates);
    const line = tpl
      .replaceAll('{item}', ctx.item || 'truc')
      .replaceAll('{monster}', ctx.monster || 'UN MONSTRE')
      .replaceAll('{name}', ctx.name || 'quelqu\'un')
      .replaceAll('{value}', String(ctx.value ?? '???'))
      .replaceAll('{dir}', ctx.dir || g.rng.pick(DIRS));
    this.recent.push(tpl);
    if (this.recent.length > 40) this.recent.shift();
    bot.brain.talkCd = g.time + g.rng.range(5, 11) / Math.max(0.4, prof.talk);
    const loud = trigger === 'spot_monster' && prof.panic > 0.7 ? 'scream' : 'talk';
    g.botSpeak(bot, line, loud);
    return true;
  }

  randomDir() { return this.game.rng.pick(DIRS); }
}
