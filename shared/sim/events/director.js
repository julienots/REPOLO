// LE DIRECTEUR — rythme la partie (calme → montée → pic → répit) et déclenche les événements.
// Il ne tire pas à intervalle fixe : la probabilité dépend de la phase, du risque, du bruit,
// de la progression et de la difficulté. Les règles d'équité (tags, incompatibilités,
// tension max) empêchent les combinaisons injustes.
import { EVENTS } from '../../data/events.js';
import { combineMods, combineMonsterMods } from './mods.js';
import { runActions } from './actions.js';
import { dist } from '../../util/math.js';

const MAX_TIMED = 2;      // événements à durée simultanés maximum
const MIN_GAP = 14;       // secondes minimum entre deux événements spontanés

export class Director {
  constructor(game, defs = EVENTS) {
    this.game = game;
    this.defs = new Map(defs.map((d) => [d.id, d]));
    this.active = [];       // instances { def, start, end, nextTick, memory, signal }
    this.pending = [];      // avertissements en cours { def, at, signal }
    this.cooldowns = {};    // id → temps de jeu avant lequel il est interdit
    this.lastEventT = 0;
    this.tension = 0;       // 0..1
    this.phase = 'calm';
    this.phaseT = 0;
    this.history = [];      // ids déclenchés (stats / succès)
    this.evalT = 0;
    this.noiseWindow = [];  // [t, loudness] des bruits de joueurs récents
  }

  // Indice de risque : progression du temps, du quota, et bruit récent.
  get risk() {
    const g = this.game, m = g.mission;
    const tFrac = Math.min(1, g.time / m.timeLimit);
    const qFrac = Math.min(1, m.deposited / Math.max(1, m.quota));
    return Math.min(1, 0.45 * tFrac + 0.25 * qFrac + 0.3 * Math.min(1, this.recentNoise / 400));
  }
  get recentNoise() { return this.noiseWindow.reduce((s, [, l]) => s + l, 0); }

  update(dt) {
    const g = this.game;
    this.updateTension(dt);
    // bruit de l'équipe sur 20 s
    for (const n of g.noises) if (!n.internal && n.loudness >= 5 && n.t >= g.time - dt * 1.01 && g.players.has(n.source)) this.noiseWindow.push([g.time, n.loudness]);
    while (this.noiseWindow.length && this.noiseWindow[0][0] < g.time - 20) this.noiseWindow.shift();
    if (this.recentNoise > 700) this.signal('teamTooLoud', {});

    // avertissements → début
    for (const p of this.pending.slice()) {
      if (g.time >= p.at) { this.pending.splice(this.pending.indexOf(p), 1); this.begin(p.def, p.signal); }
    }
    // actions périodiques et fins
    for (const inst of this.active.slice()) {
      if (inst.def.every && g.time >= inst.nextTick) {
        inst.nextTick = g.time + inst.def.every.period;
        runActions(g, inst.def.every.actions, inst);
      }
      if (g.time >= inst.end) this.finish(inst);
    }
    // déclenchement spontané
    this.evalT -= dt;
    if (this.evalT <= 0) {
      this.evalT = 1;
      this.trySpontaneous();
    }
    this.recompute();
  }

  updateTension(dt) {
    const g = this.game;
    let t = 0;
    for (const p of g.players.values()) {
      if (p.state !== 'alive') continue;
      for (const m of g.monsters) {
        const d = dist(p.x, p.y, m.x, m.y);
        const chasing = m.target === p.id && ['chase', 'charge', 'lunge', 'control', 'stalk'].includes(m.state);
        if (chasing) t = Math.max(t, 0.6 + 0.4 * Math.max(0, 1 - d / 12));
        else if (d < 8) t = Math.max(t, 0.45 * (1 - d / 8));
      }
      if (p.hurtT > 0) t = Math.max(t, 0.8);
    }
    if (g.mission.departing) t = Math.max(t, 0.7);
    this.tension += (t - this.tension) * Math.min(1, dt * (t > this.tension ? 2 : 0.25));
    this.phaseT += dt;
    const prev = this.phase;
    if (this.tension > 0.7) this.phase = 'peak';
    else if (this.phase === 'peak' && this.tension < 0.5) this.phase = 'relax';
    else if (this.phase === 'relax' && this.phaseT > 20) this.phase = 'calm';
    else if (this.phase === 'calm' && this.tension > 0.3) this.phase = 'build';
    else if (this.phase === 'build' && this.tension < 0.15 && this.phaseT > 15) this.phase = 'calm';
    if (prev !== this.phase) this.phaseT = 0;
    // pic prolongé : on accorde un répit (un poursuivant abandonne)
    if (this.phase === 'peak' && this.phaseT > 22) {
      const chaser = g.monsters.find((m) => ['chase', 'stalk'].includes(m.state));
      if (chaser) { chaser.cycle = { phase: 'rest', t: 15 }; chaser.behavior.onRest?.(chaser); }
      this.phaseT = 10;
    }
  }

  eligible(def, opts = {}) {
    const g = this.game, m = g.mission;
    const c = def.conditions || {};
    if (!opts.force) {
      if ((this.cooldowns[def.id] || 0) > g.time) return false;
      if (g.time < (def.minTime || 0)) return false;
      if ((def.minDifficulty || 0) > g.diff.level) return false;
    }
    if (this.active.some((a) => a.def.id === def.id) || this.pending.some((p) => p.def.id === def.id)) return false;
    const live = [...this.active.map((a) => a.def), ...this.pending.map((p) => p.def)];
    if (def.tags && live.some((l) => (l.tags || []).some((t) => def.tags.includes(t)))) return false;
    if (live.some((l) => (def.incompatible || []).includes(l.id) || (l.incompatible || []).includes(def.id))) return false;
    if (opts.force) return true;
    if (c.minRisk && this.risk < c.minRisk) return false;
    if (c.maxTension !== undefined && this.tension > c.maxTension) return false;
    if (c.minTension !== undefined && this.tension < c.minTension) return false;
    const q = m.deposited / Math.max(1, m.quota);
    if (c.minQuota !== undefined && q < c.minQuota) return false;
    if (c.maxQuota !== undefined && q > c.maxQuota) return false;
    if (c.theme && g.map.theme !== c.theme) return false;
    if (c.needsElevators && g.map.elevators.length < 2) return false;
    if (c.notDeparting && m.departing) return false;
    if (c.minTimeLeft && m.timeLeft < c.minTimeLeft) return false;
    if (c.minPlayers && g.alivePlayers().length < c.minPlayers) return false;
    if (def.duration && def.duration !== 0 && this.active.filter((a) => a.end > g.time + 0.01).length >= MAX_TIMED) return false;
    return true;
  }

  trySpontaneous() {
    const g = this.game;
    if (g.time < 25 || g.mission.ended) return;
    if (g.time - this.lastEventT < MIN_GAP) return;
    // probabilité par seconde : ~1 événement / 45 s en moyenne, modulée
    const phaseMul = { calm: 1.7, build: 1.0, peak: 0.25, relax: 0.5 }[this.phase];
    const sinceLast = g.time - this.lastEventT;
    const p = (1 / 45) * g.diff.eventRate * phaseMul * (0.6 + this.risk) * Math.min(2, sinceLast / 40);
    if (!g.rng.chance(p)) return;
    const pool = [...this.defs.values()].filter((d) => d.category !== 'triggered' && this.eligible(d));
    if (!pool.length) return;
    // en phase de pic, pas de danger supplémentaire ; en calme, on favorise la tension/danger
    const def = g.rng.weighted(pool, (d) => {
      let w = d.weight;
      if (this.phase === 'peak' && (d.category === 'danger' || d.category === 'tension')) w *= 0.1;
      if (this.phase === 'calm' && (d.category === 'danger' || d.category === 'tension')) w *= 1.5;
      if (d.category === 'humor' && this.phase === 'relax') w *= 1.6;
      if (g.map.theme === 'hotel' && d.id === 'crazy_doors') w *= 2;
      return w;
    });
    if (def) this.schedule(def);
  }

  // Signal de gameplay (objet cassé, quota atteint, trop de bruit…) → événements provoqués.
  signal(name, data) {
    const g = this.game;
    for (const def of this.defs.values()) {
      if (def.trigger !== name) continue;
      if (!this.eligible(def)) continue;
      if (!g.rng.chance(def.chance ?? 1)) { this.cooldowns[def.id] = g.time + 10; continue; }
      this.schedule(def, data);
    }
  }

  schedule(def, signal) {
    const g = this.game;
    this.lastEventT = g.time;
    this.cooldowns[def.id] = g.time + (def.cooldown || 60);
    if (def.warn && def.warn.time > 0) {
      g.announce(def.warn.text, 'warn');
      this.pending.push({ def, at: g.time + def.warn.time, signal });
    } else this.begin(def, signal);
  }

  forceStart(id) {
    const def = this.defs.get(id);
    if (!def || !this.eligible(def, { force: true })) return false;
    this.cooldowns[def.id] = this.game.time + (def.cooldown || 60);
    this.begin(def);
    return true;
  }

  begin(def, signal) {
    const g = this.game;
    const dur = Array.isArray(def.duration) ? g.rng.range(def.duration[0], def.duration[1]) : 0;
    const inst = { def, start: g.time, end: g.time + dur, duration: dur, nextTick: g.time + (def.every?.period || 0), memory: {}, signal };
    this.active.push(inst);
    this.history.push(def.id);
    g.announce(`${def.name} — ${def.desc}`, 'event', { eventId: def.id, category: def.category, duration: dur });
    this.recompute();
    runActions(g, def.start, inst);
    g.onEventStarted?.(def);
    if (!dur) this.finish(inst);
  }

  finish(inst) {
    const i = this.active.indexOf(inst);
    if (i < 0) return;
    this.active.splice(i, 1);
    runActions(this.game, inst.def.end, inst);
    if (inst.duration >= 15) this.game.announce(`Fin : ${inst.def.name}`, 'end', { eventId: inst.def.id });
    this.recompute();
  }

  recompute() {
    const g = this.game;
    const list = this.active.map((a) => a.def.mods);
    if (g.mission.aggro) list.push({ aggro: 1, monsterSpeed: 1.1 });
    g.mods = combineMods(list);
    g.monsterMods = combineMonsterMods(this.active.map((a) => a.def.monsterMods));
  }

  snapshot() {
    const t = this.game.time;
    return this.active.filter((a) => a.duration > 0).map((a) => ({ id: a.def.id, n: a.def.name, c: a.def.category, l: Math.max(0, Math.round(a.end - t)) }));
  }
}
