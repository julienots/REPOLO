// Profil joueur persistant (navigateur) : crédits, XP, déblocages, succès, défis.
// Sauvegarde versionnée + copie de secours : si la sauvegarde principale est corrompue,
// on récupère la précédente au lieu de tout perdre.
import { DEFAULT_COSMETICS, COSMETICS } from '../../shared/data/cosmetics.js';
import { EQUIPMENT } from '../../shared/data/equipment.js';
import { ACHIEVEMENTS, levelFromXp, challengesFor, dayKey, weekKey } from '../../shared/data/progression.js';

const KEY = 'op-panique.profile';
const BACKUP = 'op-panique.profile.bak';
const VERSION = 2;

function freshProfile() {
  return {
    v: VERSION,
    name: '',
    coins: 150,
    xp: 0,
    cosmetics: { ...DEFAULT_COSMETICS },
    owned: { suit: [], mask: [], hat: [], light: [], emote: [], title: [] },
    equipmentOwned: ['radio', 'decoy'],
    equipment: 'radio',
    achievements: {},
    bestiary: {},
    stats: { missions: 0, wins: 0, earned: 0, revives: 0, deaths: 0, extractedValue: 0 },
    challenges: { day: null, week: null, progress: {}, claimed: {} },
    createdAt: Date.now(),
  };
}

function migrate(p) {
  const base = freshProfile();
  const out = { ...base, ...p, v: VERSION };
  out.cosmetics = { ...base.cosmetics, ...(p.cosmetics || {}) };
  out.owned = { ...base.owned, ...(p.owned || {}) };
  out.stats = { ...base.stats, ...(p.stats || {}) };
  out.challenges = { ...base.challenges, ...(p.challenges || {}) };
  out.equipmentOwned = Array.from(new Set([...(base.equipmentOwned), ...(p.equipmentOwned || [])]));
  return out;
}

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, v) { try { localStorage.setItem(key, v); return true; } catch { return false; } }

export class Profile {
  constructor() {
    this.data = this.load();
    this.refreshChallenges();
  }

  load() {
    for (const key of [KEY, BACKUP]) {
      const raw = safeGet(key);
      if (!raw) continue;
      try {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object' && typeof p.xp === 'number') return migrate(p);
      } catch { /* sauvegarde corrompue : on essaie la copie de secours */ }
    }
    return freshProfile();
  }

  save() {
    const prev = safeGet(KEY);
    if (prev) safeSet(BACKUP, prev);
    this.persisted = safeSet(KEY, JSON.stringify(this.data));
    return this.persisted;
  }

  get level() { return levelFromXp(this.data.xp); }

  owns(slot, id) {
    const item = (COSMETICS[slot] || []).find((c) => c.id === id);
    if (!item) return false;
    if (item.achievement) return !!this.data.achievements[item.achievement];
    if (item.level && this.level.level < item.level) return false;
    if (item.price === 0) return true;
    return !!this.data.owned[slot]?.includes(id);
  }

  canBuy(slot, id) {
    const item = (COSMETICS[slot] || []).find((c) => c.id === id);
    if (!item || this.owns(slot, id) || item.achievement) return false;
    if (item.level && this.level.level < item.level) return false;
    return this.data.coins >= item.price;
  }

  buy(slot, id) {
    const item = (COSMETICS[slot] || []).find((c) => c.id === id);
    if (!this.canBuy(slot, id)) return false;
    this.data.coins -= item.price;
    this.data.owned[slot] = [...(this.data.owned[slot] || []), id];
    this.save();
    return true;
  }

  equip(slot, id) {
    if (!this.owns(slot, id)) return false;
    if (slot === 'emote') {
      const list = this.data.cosmetics.emotes.slice();
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else { list.push(id); if (list.length > 4) list.shift(); }
      this.data.cosmetics.emotes = list;
    } else this.data.cosmetics[slot] = id;
    this.save();
    return true;
  }

  ownsEquipment(id) {
    const e = EQUIPMENT[id];
    return !!e && this.data.equipmentOwned.includes(id);
  }
  canBuyEquipment(id) {
    const e = EQUIPMENT[id];
    return e && !this.ownsEquipment(id) && this.level.level >= e.unlockLevel && this.data.coins >= e.price;
  }
  buyEquipment(id) {
    if (!this.canBuyEquipment(id)) return false;
    this.data.coins -= EQUIPMENT[id].price;
    this.data.equipmentOwned.push(id);
    this.save();
    return true;
  }

  refreshChallenges() {
    const c = this.data.challenges;
    const d = dayKey(), w = weekKey();
    if (c.day !== d) { c.day = d; for (const k of Object.keys(c.progress)) if (k.startsWith('day:')) delete c.progress[k]; }
    if (c.week !== w) { c.week = w; for (const k of Object.keys(c.progress)) if (k.startsWith('week:')) delete c.progress[k]; }
  }

  currentChallenges() {
    this.refreshChallenges();
    return [...challengesFor(this.data.challenges.day, 3, 'day'), ...challengesFor(this.data.challenges.week, 3, 'week')].map((ch) => ({
      ...ch, progress: this.data.challenges.progress[ch.id] || 0, claimed: !!this.data.challenges.claimed[ch.id],
    }));
  }

  // Applique le résultat d'une mission au profil. Retourne un récapitulatif à afficher.
  applyResult(result, myId) {
    const me = result.players.find((p) => p.id === myId);
    if (!me) return null;
    const d = this.data;
    const before = this.level.level;
    d.coins += me.coins;
    d.xp += me.xp;
    d.stats.missions++;
    if (result.success) d.stats.wins++;
    d.stats.earned += me.coins;
    d.stats.revives += me.stats.revives;
    if (me.state === 'dead') d.stats.deaths++;
    d.stats.extractedValue += me.stats.deposited;
    for (const m of result.monstersSeen || []) d.bestiary[m] = (d.bestiary[m] || 0) + 1;

    // défis
    const runStats = {
      extractedValue: me.stats.deposited, revives: me.stats.revives, missions: 1, wins: result.success ? 1 : 0,
      fragileIntact: me.stats.fragileIntact, heavyExtracted: me.stats.heavyExtracted,
      eventsSurvived: me.survived ? (result.eventsSeen || []).length : 0, quietRun: me.stats.noise,
    };
    const completed = [];
    for (const ch of this.currentChallenges()) {
      if (ch.claimed) continue;
      let prog = ch.progress;
      if (ch.inverse) { if (runStats[ch.stat] !== undefined && runStats[ch.stat] < ch.target && me.survived) prog = ch.target; }
      else prog += runStats[ch.stat] || 0;
      d.challenges.progress[ch.id] = Math.min(ch.target, prog);
      if (prog >= ch.target) { d.challenges.claimed[ch.id] = true; d.coins += ch.reward; completed.push(ch); }
    }
    // succès
    const ctx = { ...result, me: { ...me.stats, survived: me.survived, confiscated: me.stats.confiscated, boos: me.stats.boos, lastSecond: me.stats.lastSecond }, myAwards: me.awards };
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (d.achievements[a.id]) continue;
      try { if (a.check(ctx, d)) { d.achievements[a.id] = Date.now(); unlocked.push(a); } } catch { /* ignore */ }
    }
    this.save();
    return { coins: me.coins, xp: me.xp, levelBefore: before, levelAfter: this.level.level, completed, unlocked, saved: this.persisted };
  }

  export() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.data)))); }
  import(str) {
    const p = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (!p || typeof p.xp !== 'number') throw new Error('Sauvegarde invalide');
    this.data = migrate(p);
    this.save();
  }
}
