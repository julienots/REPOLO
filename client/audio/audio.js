// Moteur audio : sons 100 % synthétisés (WebAudio), spatialisation stéréo,
// atténuation par la distance et étouffement à travers les murs (filtre passe-bas).
// Aucun fichier sonore externe : identité sonore originale et légère pour le mobile.
import { soundObstruction } from '../../shared/map/grid.js';

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.active = 0;
    this.lastPlay = {};
    this.listener = { x: 0, y: 0 };
    this.grid = null;
    this.speech = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    this.voices = [];
    if (this.speech) {
      const load = () => { this.voices = this.speech.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('fr')); };
      load();
      this.speech.onvoiceschanged = load;
    }
  }

  // À appeler depuis un geste utilisateur (exigence des navigateurs mobiles).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master = c.createGain();
      this.sfxBus = c.createGain();
      this.voiceBus = c.createGain();
      this.ambBus = c.createGain();
      this.sfxBus.connect(this.comp); this.ambBus.connect(this.comp);
      this.voiceBus.connect(this.master);
      this.comp.connect(this.master);
      this.master.connect(c.destination);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.master;
    this.sfxBus.gain.value = s.sfx;
    this.voiceBus.gain.value = s.voice;
    this.ambBus.gain.value = s.music * 0.6;
  }

  setListener(x, y) { this.listener.x = x; this.listener.y = y; }

  // ---------------------------------------------------------- spatialisation
  spatial(x, y, range = 14) {
    if (x === undefined || x === null) return { gain: 1, pan: 0, cutoff: 18000 };
    const dx = x - this.listener.x, dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return null;
    let gain = Math.pow(1 - d / range, 1.6);
    let cutoff = 16000;
    if (this.grid && d > 1) {
      const obs = soundObstruction(this.grid, x, y, this.listener.x, this.listener.y);
      if (obs > 0) { cutoff = Math.max(250, 6000 / (1 + obs * 1.6)); gain *= 1 / (1 + obs * 0.35); }
    }
    return { gain, pan: Math.max(-1, Math.min(1, dx / 7)), cutoff };
  }

  chain(sp, vol) {
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = vol * sp.gain;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = sp.cutoff;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    out.connect(lp);
    if (pan) { pan.pan.value = sp.pan; lp.connect(pan); pan.connect(this.sfxBus); } else lp.connect(this.sfxBus);
    return out;
  }

  osc(type, f0, f1, t0, dur, dest, vol = 1, attack = 0.005) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }

  noiseBurst(t0, dur, dest, vol, ftype = 'bandpass', freq = 1000, q = 1, attack = 0.003) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.02);
    return f;
  }

  // ---------------------------------------------------------- lecture
  // name : identifiant de son · opts : { x, y, vol, loud, detune, range, minGap }
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gapKey = name + (opts.key || '');
    if (opts.minGap && this.lastPlay[gapKey] && now - this.lastPlay[gapKey] < opts.minGap) return;
    if (this.active > 28) return;
    const loud = opts.loud ?? 5;
    const sp = this.spatial(opts.x, opts.y, opts.range ?? Math.max(8, loud * 1.6 + 4));
    if (!sp || sp.gain < 0.01) return;
    this.lastPlay[gapKey] = now;
    const dest = this.chain(sp, opts.vol ?? 1);
    const fn = SOUNDS[name] || SOUNDS.impact;
    this.active++;
    const dur = fn(this, now, dest, { loud, detune: opts.detune || 0 }) || 0.6;
    setTimeout(() => { this.active--; try { dest.disconnect(); } catch { /* ignore */ } }, (dur + 0.3) * 1000);
  }

  // ---------------------------------------------------------- ambiance
  startAmbience(theme) {
    if (!this.ctx) return;
    this.stopAmbience();
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.ambBus);
    g.gain.linearRampToValueAtTime(0.5, t + 3);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = theme === 'lab' ? 320 : 180; lp.connect(g);
    const base = theme === 'hotel' ? 55 : theme === 'lab' ? 73.4 : 49;
    const oscs = [base, base * 1.007, base * 1.5 * 0.996].map((f, i) => {
      const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = i === 2 ? 0.05 : 0.11; o.connect(og); og.connect(lp); o.start(); return o;
    });
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 60;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    const wind = c.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0.035; wind.connect(wf); wf.connect(wg); wg.connect(g); wind.start();
    this.amb = { g, nodes: [...oscs, lfo, wind] };
    this.ambTimer = setInterval(() => this.randomCreak(theme), 7000);
  }

  randomCreak(theme) {
    if (!this.ctx || Math.random() < 0.4) return;
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8;
    const pick = theme === 'hotel' ? ['creak', 'distant_bell', 'drip'] : theme === 'lab' ? ['drip', 'hum_pulse', 'creak'] : ['creak', 'drip', 'metal_groan'];
    this.play(pick[Math.floor(Math.random() * pick.length)], { x: this.listener.x + Math.cos(a) * d, y: this.listener.y + Math.sin(a) * d, vol: 0.5, range: 20 });
  }

  stopAmbience() {
    clearInterval(this.ambTimer);
    if (this.amb) {
      const t = this.ctx.currentTime;
      this.amb.g.gain.linearRampToValueAtTime(0, t + 1);
      const nodes = this.amb.nodes;
      setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* ignore */ } }), 1200);
      this.amb = null;
    }
  }

  // Battements de cœur quand une créature est proche (anticipation, même invisible).
  heartbeat(intensity) {
    if (!this.ctx || intensity <= 0.05) return;
    const now = this.ctx.currentTime;
    const period = 1.1 - intensity * 0.6;
    if (this.lastBeat && now - this.lastBeat < period) return;
    this.lastBeat = now;
    const g = this.ctx.createGain(); g.gain.value = 0.25 + intensity * 0.5; g.connect(this.sfxBus);
    this.osc('sine', 62, 40, now, 0.16, g, 0.9, 0.01);
    this.osc('sine', 58, 38, now + 0.2, 0.14, g, 0.6, 0.01);
    setTimeout(() => g.disconnect(), 800);
  }

  // Voix des bots (synthèse vocale locale du navigateur, gratuite, hors ligne si dispo).
  speak(text, opts = {}) {
    if (!this.speech || !this.settings.botVoices || opts.vol <= 0.05) return;
    if (this.speech.speaking && this.speech.pending) return;
    const clean = text.replace(/[🤖😱👋👍🤫💃💀💰🤡♪]/gu, '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'fr-FR';
    if (this.voices.length) u.voice = this.voices[(opts.voiceIndex || 0) % this.voices.length];
    u.volume = Math.min(1, (opts.vol ?? 1) * this.settings.botVoices * this.settings.master);
    u.rate = opts.rate || 1.1; u.pitch = opts.pitch || 1;
    try { this.speech.speak(u); } catch { /* ignore */ }
  }
  stopSpeech() { try { this.speech?.cancel(); } catch { /* ignore */ } }
}

// ------------------------------------------------------------ BIBLIOTHÈQUE DE SONS
// Chaque fonction programme des nœuds à partir de t et retourne la durée.
const SOUNDS = {
  step(a, t, d, o) { a.noiseBurst(t, 0.07, d, 0.25 + o.loud * 0.05, 'bandpass', 700 + Math.random() * 300, 1.2); return 0.1; },
  step_debris(a, t, d) { a.noiseBurst(t, 0.12, d, 0.5, 'highpass', 3500, 0.7); for (let i = 0; i < 3; i++) a.osc('triangle', 3000 + Math.random() * 3000, 0, t + i * 0.025, 0.03, d, 0.08); return 0.15; },
  step_grate(a, t, d) { a.osc('square', 820, 760, t, 0.12, d, 0.08); a.noiseBurst(t, 0.06, d, 0.25, 'bandpass', 1800, 3); return 0.15; },
  door(a, t, d) { const f = a.noiseBurst(t, 0.5, d, 0.25, 'bandpass', 600, 8, 0.05); f.frequency.exponentialRampToValueAtTime(300, t + 0.45); a.osc('sawtooth', 190, 120, t, 0.45, d, 0.05, 0.05); a.noiseBurst(t + 0.42, 0.1, d, 0.5, 'lowpass', 300, 1); return 0.6; },
  door_smash(a, t, d) { a.osc('sine', 90, 35, t, 0.4, d, 1); a.noiseBurst(t, 0.5, d, 0.9, 'lowpass', 1200, 0.7); return 0.6; },
  smash(a, t, d) { return SOUNDS.door_smash(a, t, d); },
  impact(a, t, d, o) { const v = Math.min(1, 0.2 + o.loud * 0.08); a.osc('sine', 140, 50, t, 0.18, d, v); a.noiseBurst(t, 0.12, d, v * 0.6, 'lowpass', 900, 0.8); return 0.25; },
  thud(a, t, d) { a.osc('sine', 110, 40, t, 0.22, d, 0.9); return 0.3; },
  break(a, t, d) { a.noiseBurst(t, 0.35, d, 0.7, 'highpass', 2500, 0.5); for (let i = 0; i < 7; i++) a.osc('sine', 2500 + Math.random() * 4500, 0, t + Math.random() * 0.3, 0.12, d, 0.12); return 0.5; },
  kaching(a, t, d) { a.osc('sine', 1318, 0, t, 0.25, d, 0.25); a.osc('sine', 1760, 0, t + 0.09, 0.4, d, 0.25); a.noiseBurst(t, 0.05, d, 0.2, 'highpass', 5000, 1); return 0.5; },
  siren(a, t, d) {
    const o = a.ctx.createOscillator(); o.type = 'sawtooth';
    const g = a.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.1); g.gain.setValueAtTime(0.22, t + 2.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    for (let i = 0; i < 6; i++) { o.frequency.setValueAtTime(600, t + i * 0.45); o.frequency.linearRampToValueAtTime(950, t + i * 0.45 + 0.4); }
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 2.7); return 2.8;
  },
  fanfare(a, t, d) { const notes = [523, 659, 784, 1046, 784, 1046]; notes.forEach((f, i) => { a.osc('square', f, 0, t + i * 0.13, 0.16, d, 0.12); a.osc('sawtooth', f * 1.01, 0, t + i * 0.13, 0.16, d, 0.06); }); a.noiseBurst(t + 0.8, 0.4, d, 0.3, 'highpass', 4000, 0.5); return 1.3; },
  decoy(a, t, d) { for (let i = 0; i < 3; i++) a.osc('square', 1400, 0, t + i * 0.18, 0.1, d, 0.18); return 0.6; },
  engine(a, t, d) { a.osc('sawtooth', 48, 52, t, 1.9, d, 0.35, 0.2); a.noiseBurst(t, 1.9, d, 0.25, 'lowpass', 220, 1, 0.2); return 2; },
  engine_start(a, t, d) { a.osc('sawtooth', 30, 70, t, 1.2, d, 0.4, 0.05); a.noiseBurst(t, 1.2, d, 0.4, 'lowpass', 400, 1, 0.05); return 1.3; },
  squeak(a, t, d) { const o = a.osc('sine', 1100, 1700, t, 0.22, d, 0.25, 0.02); return 0.3; },
  quack(a, t, d) { a.osc('sawtooth', 520, 380, t, 0.18, d, 0.2); a.osc('sawtooth', 500, 360, t + 0.22, 0.2, d, 0.2); return 0.5; },
  ding(a, t, d) { a.osc('sine', 1568, 0, t, 0.9, d, 0.3); a.osc('sine', 1245, 0, t + 0.25, 1.1, d, 0.3); return 1.4; },
  elevator(a, t, d) { a.osc('triangle', 110, 140, t, 0.8, d, 0.15, 0.1); return 0.9; },
  boo(a, t, d) { const o = a.osc('sine', 420, 260, t, 0.9, d, 0.25, 0.15); return 1; },
  flare(a, t, d) { for (let i = 0; i < 6; i++) a.noiseBurst(t + Math.random() * 0.8, 0.04, d, 0.25, 'highpass', 3000, 1); return 0.9; },
  wall_break(a, t, d) { a.osc('sine', 70, 25, t, 1.2, d, 1, 0.01); a.noiseBurst(t, 1.4, d, 0.9, 'lowpass', 700, 0.6); for (let i = 0; i < 8; i++) a.noiseBurst(t + 0.2 + Math.random(), 0.08, d, 0.3, 'bandpass', 1200, 2); return 1.6; },
  wallbreak(a, t, d) { return SOUNDS.wall_break(a, t, d); },
  bonk(a, t, d) { a.osc('sine', 520, 140, t, 0.25, d, 0.8); a.osc('triangle', 260, 520, t + 0.15, 0.5, d, 0.25); return 0.7; },
  hit(a, t, d) { a.noiseBurst(t, 0.15, d, 0.9, 'lowpass', 600, 1); a.osc('sine', 160, 60, t, 0.2, d, 0.8); return 0.3; },
  stamp(a, t, d) { a.osc('square', 180, 90, t, 0.08, d, 0.4); a.noiseBurst(t, 0.06, d, 0.5, 'lowpass', 800, 1); return 0.2; },
  giggle(a, t, d) { for (let i = 0; i < 5; i++) a.osc('sine', 900 + i * 60, 1100 + i * 60, t + i * 0.09, 0.07, d, 0.15); return 0.6; },
  heal(a, t, d) { a.osc('sine', 880, 0, t, 0.3, d, 0.2); a.osc('sine', 1320, 0, t + 0.1, 0.4, d, 0.2); return 0.5; },
  locker(a, t, d) { a.osc('square', 300, 200, t, 0.1, d, 0.15); a.noiseBurst(t, 0.15, d, 0.4, 'bandpass', 1500, 4); return 0.2; },
  radio(a, t, d) { a.noiseBurst(t, 0.25, d, 0.35, 'bandpass', 2400, 1.5); return 0.3; },
  scream(a, t, d) { return 0.01; },
  voice(a, t, d, o) {
    // babillage synthétique (utilisé pour les imitations de l'Écho : grésillant et désaccordé)
    for (let i = 0; i < 6; i++) {
      const f = (180 + Math.random() * 120) * (1 + (o.detune || 0) * 4);
      a.osc('sawtooth', f, f * (0.8 + Math.random() * 0.4), t + i * 0.11, 0.1, d, 0.08);
      a.noiseBurst(t + i * 0.11, 0.08, d, 0.06, 'bandpass', 1200 + Math.random() * 800, 4);
    }
    if (o.detune) a.noiseBurst(t, 0.7, d, 0.08, 'highpass', 5000, 0.5);
    return 0.8;
  },
  chat(a, t, d) { a.osc('triangle', 900, 0, t, 0.05, d, 0.04); return 0.1; },
  // --- signatures des créatures ---
  sourdine_click(a, t, d) { a.osc('square', 2600, 1800, t, 0.02, d, 0.3); a.osc('square', 2400, 1700, t + 0.06, 0.02, d, 0.25); return 0.12; },
  mannequine_creak(a, t, d) { const f = a.noiseBurst(t, 0.35, d, 0.5, 'bandpass', 900, 12, 0.02); f.frequency.linearRampToValueAtTime(1500, t + 0.3); return 0.4; },
  demenageur_stomp(a, t, d) { a.osc('sine', 55, 30, t, 0.3, d, 1, 0.01); a.noiseBurst(t, 0.2, d, 0.3, 'lowpass', 180, 1); return 0.35; },
  demenageur_roar(a, t, d) { a.osc('sawtooth', 90, 60, t, 0.9, d, 0.5, 0.08); a.osc('sawtooth', 93, 58, t, 0.9, d, 0.4, 0.08); a.noiseBurst(t, 0.9, d, 0.3, 'lowpass', 500, 1, 0.08); return 1; },
  berger_bell(a, t, d, o) { const v = 0.08 + Math.min(0.4, o.loud * 0.06); a.osc('sine', 1046, 0, t, 1.2, d, v); a.osc('sine', 2093 * 1.01, 0, t, 0.8, d, v * 0.4); a.osc('sine', 3140, 0, t, 0.4, d, v * 0.2); return 1.3; },
  echo_skitter(a, t, d) { for (let i = 0; i < 8; i++) a.noiseBurst(t + i * 0.035, 0.02, d, 0.2, 'highpass', 4000, 1); return 0.35; },
  inspecteur_keys(a, t, d) { for (let i = 0; i < 4; i++) a.osc('triangle', 3200 + Math.random() * 1500, 0, t + i * 0.07 + Math.random() * 0.03, 0.08, d, 0.07); return 0.4; },
  inspecteur_whistle(a, t, d) { a.osc('sine', 2800, 2800, t, 0.25, d, 0.3); a.osc('sine', 2800, 2700, t + 0.32, 0.5, d, 0.3); return 0.9; },
  sauveteur_reveal(a, t, d) { a.osc('sawtooth', 300, 900, t, 0.5, d, 0.4); a.osc('square', 310, 880, t, 0.5, d, 0.2); a.noiseBurst(t, 0.5, d, 0.3, 'highpass', 2000, 1); return 0.6; },
  invite_shriek(a, t, d) { a.osc('sawtooth', 700, 1600, t, 0.4, d, 0.35); a.osc('sawtooth', 710, 1500, t + 0.05, 0.4, d, 0.25); return 0.5; },
  stinger(a, t, d) { a.osc('sawtooth', 110, 104, t, 1.4, d, 0.25, 0.05); a.osc('sawtooth', 117, 111, t, 1.4, d, 0.2, 0.05); a.osc('square', 233, 220, t, 1.2, d, 0.08, 0.3); a.noiseBurst(t, 0.3, d, 0.5, 'highpass', 3000, 0.5); return 1.5; },
  monster(a, t, d) { a.osc('sawtooth', 80, 55, t, 0.7, d, 0.35, 0.05); a.noiseBurst(t, 0.6, d, 0.25, 'lowpass', 400, 1, 0.05); return 0.8; },
  // --- ambiance ---
  creak(a, t, d) { const f = a.noiseBurst(t, 1.1, d, 0.15, 'bandpass', 400, 14, 0.2); f.frequency.linearRampToValueAtTime(250, t + 1); return 1.2; },
  drip(a, t, d) { a.osc('sine', 1800, 900, t, 0.08, d, 0.15); return 0.15; },
  metal_groan(a, t, d) { a.osc('sawtooth', 70, 52, t, 2, d, 0.06, 0.6); const f = a.noiseBurst(t, 2, d, 0.06, 'bandpass', 300, 20, 0.6); return 2.1; },
  distant_bell(a, t, d) { a.osc('sine', 660, 0, t, 2.5, d, 0.05); return 2.6; },
  hum_pulse(a, t, d) { a.osc('sine', 120, 120, t, 1.2, d, 0.06, 0.4); return 1.3; },
  ui(a, t, d) { a.osc('triangle', 660, 880, t, 0.08, d, 0.12); return 0.1; },
  ui_bad(a, t, d) { a.osc('square', 220, 160, t, 0.15, d, 0.1); return 0.2; },
  celebrate(a, t, d) { [523, 659, 784, 1046].forEach((f, i) => a.osc('triangle', f, 0, t + i * 0.1, 0.4, d, 0.2)); a.osc('square', 1046, 0, t + 0.45, 0.5, d, 0.1); return 1; },
  fail(a, t, d) { [392, 370, 349, 262].forEach((f, i) => a.osc('triangle', f, f * 0.98, t + i * 0.28, 0.4, d, 0.2)); return 1.3; },
};

export const SOUND_NAMES = Object.keys(SOUNDS);
