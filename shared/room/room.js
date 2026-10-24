// SALON (lobby) + boucle de partie, indépendant du transport.
// - En ligne : le serveur Node crée un Room par code d'invitation et branche les WebSockets.
// - En solo : le navigateur crée un Room local avec un seul client (même code, mêmes règles).
import { Game } from '../sim/game.js';
import { SIM, LIMITS, GAME } from '../config/game.js';
import { MISSIONS, DIFFICULTIES } from '../data/missions.js';
import { EQUIPMENT } from '../data/equipment.js';
import { BOT_PROFILES, BOT_PROFILE_IDS } from '../data/bots.js';
import { COSMETICS, DEFAULT_COSMETICS } from '../data/cosmetics.js';

let memberCounter = 1;

export function sanitizeName(name) {
  const s = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, LIMITS.nameMaxLength);
  return s || 'Employé';
}

function sanitizeCosmetics(c) {
  const out = { ...DEFAULT_COSMETICS };
  if (!c || typeof c !== 'object') return out;
  for (const slot of ['suit', 'mask', 'hat', 'light', 'title']) {
    if (typeof c[slot] === 'string' && (COSMETICS[slot] || []).some((x) => x.id === c[slot])) out[slot] = c[slot];
  }
  if (Array.isArray(c.emotes)) out.emotes = c.emotes.filter((e) => COSMETICS.emote.some((x) => x.id === e)).slice(0, 4);
  return out;
}

const randToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export class Room {
  constructor(opts) {
    this.code = opts.code;
    this.send = opts.send;                // (clientId, msg) => void
    this.onEmpty = opts.onEmpty || (() => {});
    this.local = !!opts.local;
    this.timers = opts.timers || {
      setInterval: (f, t) => setInterval(f, t), clearInterval: (h) => clearInterval(h),
      setTimeout: (f, t) => { const h = setTimeout(f, t); h?.unref?.(); return h; }, clearTimeout: (h) => clearTimeout(h),
    };
    this.members = new Map();             // memberId → membre
    this.clients = new Map();             // clientId → memberId
    this.state = 'lobby';
    this.settings = {
      mission: 'morvan', difficulty: 'employe', variant: 'random',
      teamSize: 4, fillBots: true, bots: [], maxPlayers: Math.min(opts.maxPlayers || LIMITS.defaultMaxPlayers, LIMITS.absoluteMaxPlayers),
      locked: false,
    };
    this.chatLog = [];
    this.game = null;
    this.loop = null;
    this.lastResult = null;
    this.banned = new Set();
    this.createdAt = Date.now();
  }

  get hostId() { return [...this.members.values()].find((m) => m.isHost)?.id; }
  connectedMembers() { return [...this.members.values()].filter((m) => m.connected); }

  // ------------------------------------------------------------ CONNEXIONS
  join(clientId, hello = {}) {
    // reconnexion avec jeton
    if (hello.token) {
      const m = [...this.members.values()].find((mm) => mm.token === hello.token);
      if (m) return this.reattach(clientId, m);
    }
    if (this.banned.has(hello.fingerprint)) return { error: 'Vous avez été exclu de ce salon.' };
    if (this.state !== 'lobby') return { error: 'Une partie est en cours dans ce salon. Réessayez à la fin de la mission.' };
    if (this.settings.locked) return { error: 'Le salon est verrouillé par l\'hôte.' };
    if (this.members.size >= this.settings.maxPlayers) return { error: `Salon complet (${this.settings.maxPlayers} joueurs max).` };
    const id = 'p' + memberCounter++;
    const m = {
      id, name: sanitizeName(hello.name), cosmetics: sanitizeCosmetics(hello.cosmetics),
      equipment: EQUIPMENT[hello.equipment] ? hello.equipment : 'radio',
      ready: false, connected: true, token: randToken(), isHost: this.members.size === 0,
      voice: !!hello.voice, level: Math.max(1, Math.min(99, hello.level | 0 || 1)), platform: hello.platform === 'mobile' ? 'mobile' : 'pc',
      fingerprint: hello.fingerprint || null, disconnectedAt: 0, clientId,
    };
    this.members.set(id, m);
    this.clients.set(clientId, id);
    this.send(clientId, { t: 'welcome', you: id, token: m.token, code: this.code, game: GAME.name, protocol: GAME.protocol });
    this.systemChat(`${m.name} a rejoint le salon.`);
    this.broadcastLobby();
    return { ok: true, member: m };
  }

  reattach(clientId, m) {
    if (m.clientId && this.clients.get(m.clientId) === m.id) this.clients.delete(m.clientId);
    m.clientId = clientId; m.connected = true; m.disconnectedAt = 0;
    this.clients.set(clientId, m.id);
    this.send(clientId, { t: 'welcome', you: m.id, token: m.token, code: this.code, game: GAME.name, protocol: GAME.protocol, reconnected: true });
    if (this.state === 'playing' && this.game && this.game.players.has(m.id)) {
      this.game.setBotControl(m.id, false);
      const p = this.game.players.get(m.id); p.connected = true;
      this.send(clientId, { t: 'start', info: this.game.startInfo(), you: m.id, resumed: true });
      this.game.announce(`${m.name} est de retour !`, 'info');
    } else if (this.state === 'results' && this.lastResult) {
      this.send(clientId, { t: 'result', result: this.lastResult });
    }
    this.systemChat(`${m.name} s'est reconnecté.`);
    this.broadcastLobby();
    return { ok: true, member: m, reconnected: true };
  }

  // Perte de connexion : on garde la place un moment (reconnexion possible).
  disconnect(clientId) {
    const id = this.clients.get(clientId);
    this.clients.delete(clientId);
    const m = id && this.members.get(id);
    if (!m || m.clientId !== clientId) return;
    m.connected = false; m.disconnectedAt = Date.now();
    if (this.state === 'playing' && this.game?.players.has(m.id)) {
      // un bot prend le relais pendant l'absence
      this.game.setBotControl(m.id, true, 'prudent');
      this.game.players.get(m.id).connected = false;
      this.game.announce(`${m.name} a perdu la connexion. Un bot prend le relais.`, 'warn');
    }
    if (this.state === 'lobby') this.removeMember(m.id, 'disconnect');
    else { this.ensureHost(); this.broadcastLobby(); }
    this.checkEmpty();
  }

  leave(clientId) {
    const id = this.clients.get(clientId);
    this.clients.delete(clientId);
    if (!id) return;
    const m = this.members.get(id);
    if (this.state === 'playing' && this.game?.players.has(id)) {
      this.game.setBotControl(id, true, 'prudent');
      const p = this.game.players.get(id); p.connected = false;
      this.game.announce(`${m?.name} a quitté la mission. Un bot le remplace.`, 'warn');
    }
    this.removeMember(id, 'leave');
    this.checkEmpty();
  }

  removeMember(id, reason) {
    const m = this.members.get(id);
    if (!m) return;
    this.members.delete(id);
    if (m.clientId) this.clients.delete(m.clientId);
    this.systemChat(`${m.name} ${reason === 'kick' ? 'a été exclu' : 'est parti'}.`);
    this.ensureHost();
    this.broadcastLobby();
  }

  ensureHost() {
    const members = [...this.members.values()];
    if (members.some((m) => m.isHost && m.connected)) return;
    for (const m of members) m.isHost = false;
    const next = members.find((m) => m.connected) || members[0];
    if (next) { next.isHost = true; this.systemChat(`${next.name} est maintenant l'hôte.`); }
  }

  checkEmpty() {
    if (!this.connectedMembers().length) {
      if (this.state === 'playing') {
        // personne : on laisse une courte fenêtre de reconnexion
        this.timers.setTimeout(() => { if (!this.connectedMembers().length) this.close(); }, 20000);
      } else this.close();
    }
  }

  close() {
    this.stopLoop();
    this.members.clear();
    this.onEmpty(this);
  }

  // Purge périodique des membres déconnectés depuis trop longtemps.
  housekeeping(now = Date.now()) {
    for (const m of [...this.members.values()]) {
      if (!m.connected && now - m.disconnectedAt > LIMITS.reconnectGrace * 1000) this.removeMember(m.id, 'timeout');
    }
    if (!this.members.size) this.close();
  }

  // ------------------------------------------------------------ MESSAGES
  handle(clientId, msg) {
    const id = this.clients.get(clientId);
    const m = id && this.members.get(id);
    if (!m || !msg || typeof msg.t !== 'string') return;
    const isHost = m.isHost;
    switch (msg.t) {
      case 'ping': this.send(clientId, { t: 'pong', c: msg.c }); return;
      case 'chat': {
        const text = String(msg.text || '').slice(0, LIMITS.chatMaxLength).trim();
        if (!text) return;
        if (this.state === 'playing' && this.game?.players.has(m.id)) this.game.chat(this.game.players.get(m.id), text);
        else this.lobbyChat(m, text);
        return;
      }
      case 'rtc': {
        // relais de signalisation WebRTC (offres/réponses/candidats) entre membres du salon
        const target = this.members.get(msg.to);
        if (target?.connected && target.clientId && JSON.stringify(msg.data || {}).length < 20000) this.send(target.clientId, { t: 'rtc', from: m.id, data: msg.data });
        return;
      }
      case 'voiceState': m.voice = !!msg.on; this.broadcastLobby(); return;
      case 'leave': this.leave(clientId); this.send(clientId, { t: 'left' }); return;
    }
    if (this.state === 'lobby') this.handleLobby(m, isHost, msg, clientId);
    else if (this.state === 'playing') this.handleGame(m, msg);
    else if (this.state === 'results' && msg.t === 'backToLobby') this.backToLobby();
  }

  handleLobby(m, isHost, msg, clientId) {
    switch (msg.t) {
      case 'profile':
        if (msg.name !== undefined) m.name = sanitizeName(msg.name);
        if (msg.cosmetics) m.cosmetics = sanitizeCosmetics(msg.cosmetics);
        if (msg.equipment && EQUIPMENT[msg.equipment]) m.equipment = msg.equipment;
        if (msg.level) m.level = Math.max(1, Math.min(99, msg.level | 0));
        break;
      case 'ready': m.ready = !!msg.v; break;
      case 'settings': {
        if (!isHost) return this.send(clientId, { t: 'error', msg: 'Seul l\'hôte peut modifier les réglages.' });
        const s = this.settings;
        if (msg.mission && MISSIONS[msg.mission]) s.mission = msg.mission;
        if (msg.difficulty && DIFFICULTIES[msg.difficulty]) s.difficulty = msg.difficulty;
        if (msg.variant) s.variant = msg.variant;
        if (msg.teamSize) s.teamSize = Math.max(1, Math.min(LIMITS.absoluteMaxPlayers, msg.teamSize | 0));
        if (msg.fillBots !== undefined) s.fillBots = !!msg.fillBots;
        if (msg.maxPlayers) s.maxPlayers = Math.max(Math.max(1, this.members.size), Math.min(LIMITS.absoluteMaxPlayers, msg.maxPlayers | 0));
        if (msg.locked !== undefined) s.locked = !!msg.locked;
        if (Array.isArray(msg.bots)) s.bots = msg.bots.filter((b) => BOT_PROFILES[b]).slice(0, LIMITS.absoluteMaxPlayers - 1);
        break;
      }
      case 'kick': {
        if (!isHost || msg.id === m.id) return;
        const target = this.members.get(msg.id);
        if (!target) return;
        if (target.clientId) this.send(target.clientId, { t: 'kicked', msg: 'L\'hôte vous a exclu du salon.' });
        if (target.fingerprint) this.banned.add(target.fingerprint);
        this.removeMember(target.id, 'kick');
        return;
      }
      case 'start': {
        if (!isHost) return this.send(clientId, { t: 'error', msg: 'Seul l\'hôte peut lancer la mission.' });
        const notReady = [...this.members.values()].filter((mm) => !mm.ready && !mm.isHost && mm.connected);
        if (notReady.length && !msg.force) return this.send(clientId, { t: 'error', msg: `Pas encore prêts : ${notReady.map((x) => x.name).join(', ')}` });
        this.startGame(msg.seed);
        return;
      }
      default: return;
    }
    this.broadcastLobby();
  }

  handleGame(m, msg) {
    const g = this.game;
    const p = g.players.get(m.id);
    if (!p) return;
    switch (msg.t) {
      case 'st': g.applyClientState(m.id, msg); break;
      case 'voice': g.setVoice(p, msg.lv, msg.radio); break;
      case 'act':
        switch (msg.a) {
          case 'interact': g.interact(p); break;
          case 'release': g.release(p); break;
          case 'throw': g.throwItem(p); break;
          case 'utility': g.useUtility(p); break;
          case 'door': g.bumpDoor(p, msg.x | 0, msg.y | 0); break;
          case 'emote': g.emote(p, msg.id, msg.text); break;
          case 'boo': g.boo(p); break;
        }
        break;
      case 'abandon':
        // vote d'abandon par l'hôte quand tous les humains sont morts
        if (m.isHost && g.humans().every((h) => h.state === 'dead' || h.state === 'extracted' || !h.connected)) g.finish('abandon');
        break;
    }
  }

  // ------------------------------------------------------------ PARTIE
  buildTeam() {
    const team = [];
    for (const m of this.members.values()) {
      if (!m.connected) continue;
      team.push({ id: m.id, name: m.name, cosmetics: m.cosmetics, equipment: m.equipment });
    }
    const bots = this.settings.bots.slice();
    if (this.settings.fillBots) {
      const used = new Set(bots);
      while (team.length + bots.length < this.settings.teamSize) {
        const free = BOT_PROFILE_IDS.filter((b) => !used.has(b));
        const b = free.length ? free[Math.floor(Math.random() * free.length)] : BOT_PROFILE_IDS[Math.floor(Math.random() * BOT_PROFILE_IDS.length)];
        used.add(b); bots.push(b);
      }
    }
    const usedNames = new Set(team.map((t) => t.name));
    bots.slice(0, LIMITS.absoluteMaxPlayers - team.length).forEach((b, i) => {
      const prof = BOT_PROFILES[b];
      let name = prof.names.find((n) => !usedNames.has(n)) || `${prof.names[0]} ${i + 2}`;
      usedNames.add(name);
      const suit = COSMETICS.suit.find((s) => s.color === prof.suit)?.id;
      team.push({
        id: 'bot' + (i + 1), name: `${name} 🤖`, isBot: true, botProfile: b,
        cosmetics: { ...DEFAULT_COSMETICS, suit: suit || ['blue', 'green', 'red', 'purple', 'pink', 'white'][i % 6], mask: ['visor', 'goggles', 'smile', 'gas', 'paper'][i % 5], hat: ['helmet', 'beanie', 'cap', 'none'][i % 4] },
        equipment: ['radio', 'decoy', 'medkit', 'sneakers'][i % 4],
      });
    });
    return team;
  }

  startGame(seed) {
    const team = this.buildTeam();
    this.game = new Game({
      missionId: this.settings.mission, difficulty: this.settings.difficulty,
      seed: seed ?? ((Math.random() * 2 ** 31) | 0), players: team, variant: this.settings.variant,
    });
    this.state = 'playing';
    const info = this.game.startInfo();
    for (const m of this.connectedMembers()) this.send(m.clientId, { t: 'start', info, you: m.id });
    this.broadcastLobby();
    this.startLoop();
  }

  startLoop() {
    this.stopLoop();
    const dt = 1 / SIM.tickRate;
    let tick = 0;
    const every = Math.round(SIM.tickRate / SIM.snapshotRate);
    this.loop = this.timers.setInterval(() => {
      try {
        const g = this.game;
        if (!g) return;
        g.step(dt);
        tick++;
        if (tick % every === 0 || g.mission.ended) {
          const snap = { t: 'snap', ...g.snapshot() };
          for (const m of this.connectedMembers()) this.send(m.clientId, snap);
        }
        if (g.mission.ended) this.endGame();
      } catch (e) {
        console.error('[room] erreur de simulation', e);
        this.endGame(true);
      }
    }, 1000 / SIM.tickRate);
  }

  stopLoop() { if (this.loop) { this.timers.clearInterval(this.loop); this.loop = null; } }

  endGame(crashed = false) {
    this.stopLoop();
    const res = this.game?.result || (this.game && (this.game.finish('crash'), this.game.result));
    this.lastResult = res ? { ...res, crashed } : null;
    this.state = 'results';
    for (const m of this.connectedMembers()) this.send(m.clientId, { t: 'result', result: this.lastResult });
    // les membres partis pendant la partie sont retirés
    for (const m of [...this.members.values()]) if (!m.connected) this.removeMember(m.id, 'leave');
    this.broadcastLobby();
  }

  backToLobby() {
    this.state = 'lobby';
    this.game = null;
    for (const m of this.members.values()) m.ready = false;
    this.broadcastLobby();
  }

  // ------------------------------------------------------------ DIFFUSION
  lobbyState() {
    return {
      t: 'lobby', code: this.code, state: this.state, settings: this.settings, local: this.local,
      members: [...this.members.values()].map((m) => ({ id: m.id, name: m.name, cosmetics: m.cosmetics, equipment: m.equipment, ready: m.ready, connected: m.connected, isHost: m.isHost, voice: m.voice, level: m.level, platform: m.platform })),
      chat: this.chatLog.slice(-30),
    };
  }

  broadcastLobby() {
    const st = this.lobbyState();
    for (const m of this.connectedMembers()) this.send(m.clientId, st);
  }

  lobbyChat(m, text) {
    this.chatLog.push({ from: m.id, name: m.name, text, at: Date.now() });
    if (this.chatLog.length > 60) this.chatLog.shift();
    for (const mm of this.connectedMembers()) this.send(mm.clientId, { t: 'chat', from: m.id, name: m.name, text });
  }

  systemChat(text) {
    this.chatLog.push({ from: null, name: '', text, at: Date.now() });
    if (this.chatLog.length > 60) this.chatLog.shift();
  }
}

export function makeRoomCode(existing) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1 (lisibles à l'oral)
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!existing.has(c)) return c;
  }
  throw new Error('Plus de codes disponibles');
}
