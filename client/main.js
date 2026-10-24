// Point d'entrée du client : écrans, connexion (solo local ou serveur), boucle d'affichage.
import { GAME } from '../shared/config/game.js';
import { Profile } from './save/profile.js';
import { loadSettings, saveSettings } from './save/settings.js';
import { AudioEngine } from './audio/audio.js';
import { VoiceChat } from './voice/voice.js';
import { Input } from './input/input.js';
import { Renderer } from './render/renderer.js';
import { WsTransport, LocalTransport, serverAvailable, wsUrl } from './net/transport.js';
import { ClientGame } from './game/client-game.js';
import { LobbyUI } from './ui/lobby.js';
import { ResultsUI } from './ui/results.js';
import { Modals } from './ui/modals.js';
import { MenuUI } from './ui/menu.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.settings = loadSettings();
    this.profile = new Profile();
    this.audio = new AudioEngine(this.settings);
    this.input = new Input(this.settings, $('game-canvas'));
    this.renderer = new Renderer($('game-canvas'), this.settings);
    this.voice = new VoiceChat(this.audio, this.settings, (m) => this.transport?.send(m));
    this.transport = null;
    this.game = null;
    this.lobby = null;          // dernier état du salon
    this.myId = null;
    this.server = null;
    this.menu = new MenuUI(this);
    this.lobbyUI = new LobbyUI(this);
    this.resultsUI = new ResultsUI(this);
    this.modals = new Modals(this);
    this.touchMode = false;
    document.title = GAME.name;
    $('game-title').textContent = GAME.name;
    $('game-tagline').textContent = GAME.tagline;
    this.bindGlobal();
    this.input.setupTouch($('touch'));
    this.detectTouch();
    this.loop();
    this.checkServer();
    this.handleDeepLink();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  detectTouch() {
    const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const pref = this.settings.touchControls;
    this.touchMode = pref === 'on' || (pref === 'auto' && coarse);
    document.body.classList.toggle('touch-mode', this.touchMode);
    $('touch').hidden = !this.touchMode || !this.game;
    if (this.touchMode) this.input.lastDevice = 'touch';
  }

  async checkServer() {
    this.server = await serverAvailable();
    const st = $('server-status');
    if (this.server) st.textContent = `🟢 Serveur en ligne disponible (v${this.server.version}).`;
    else st.textContent = '🟠 Aucun serveur de jeu détecté : le mode solo fonctionne, le multijoueur en ligne nécessite de lancer le serveur (voir README).';
    for (const b of document.querySelectorAll('[data-action="create"], [data-action="join"]')) b.disabled = !this.server;
    $('join-code').disabled = !this.server;
  }

  handleDeepLink() {
    const code = new URLSearchParams(location.search).get('join');
    if (code) { $('join-code').value = code.toUpperCase(); history.replaceState(null, '', location.pathname); this.toast('Code d\'invitation rempli : appuyez sur « Rejoindre ».'); }
  }

  bindGlobal() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      this.audio.unlock();
      this.action(el.dataset.action, el);
    });
    document.addEventListener('pointerdown', () => this.audio.unlock(), { once: false, passive: true });
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e; $('btn-install').hidden = false; });
    window.addEventListener('resize', () => this.checkOrientation());
    document.addEventListener('visibilitychange', () => {
      // interruption (appel, verrouillage) : on coupe le micro ; le serveur garde la place
      if (document.hidden) { this.voice.setPtt(false); this.voice.setRadio(false); this.input.reset(); }
    });
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.action('join'); });
  }

  checkOrientation() {
    const portrait = this.touchMode && window.innerHeight > window.innerWidth && !!this.game;
    $('rotate-hint').hidden = !portrait;
  }

  action(name, el) {
    switch (name) {
      case 'solo': return this.startSolo();
      case 'create': return this.startOnline('create');
      case 'join': return this.startOnline('join');
      case 'locker': return this.modals.locker();
      case 'progress': return this.modals.progress();
      case 'bestiary': return this.modals.bestiary();
      case 'settings': case 'settings-ingame': return this.modals.settings();
      case 'help': case 'help-ingame': return this.modals.help();
      case 'close-modal': return this.modals.close();
      case 'install': this.installPrompt?.prompt(); return;
      case 'leave-lobby': return this.leaveRoom();
      case 'copy-code': return this.lobbyUI.copyInvite();
      case 'toggle-voice': return this.lobbyUI.toggleVoice();
      case 'ready': return this.lobbyUI.toggleReady();
      case 'start': return this.lobbyUI.start();
      case 'resume': return this.togglePause(false);
      case 'quit-game': return this.leaveRoom();
      case 'abandon': this.transport?.send({ t: 'abandon' }); this.togglePause(false); return;
      case 'back-lobby': return this.backToLobby();
      case 'menu': return this.leaveRoom();
      default: return this.lobbyUI.action?.(name, el);
    }
  }

  show(screen) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `screen-${screen}`);
    this.screen = screen;
    this.input.enabled = screen === 'game';
    $('touch').hidden = !(screen === 'game' && this.touchMode);
    this.checkOrientation();
    if (screen === 'menu') this.menu.refresh();
  }

  hello() {
    const p = this.profile.data;
    return {
      name: p.name || 'Employé', cosmetics: p.cosmetics, equipment: p.equipment, level: this.profile.level.level,
      platform: this.touchMode ? 'mobile' : 'pc', voice: this.voice.active, fingerprint: this.fingerprint(),
    };
  }

  fingerprint() {
    let f = null;
    try { f = localStorage.getItem('op-panique.fp'); if (!f) { f = Math.random().toString(36).slice(2); localStorage.setItem('op-panique.fp', f); } } catch { f = 'x'; }
    return f;
  }

  attachTransport(tr) {
    this.transport?.close();
    this.transport = tr;
    tr.onMessage((m) => this.onMessage(m));
    tr.onStatus((s) => {
      if (s === 'reconnecting') this.toast('Connexion perdue… reconnexion en cours.');
      if (s === 'open' && this.myId) this.toast('Reconnecté !');
      if (s === 'lost') { this.toast('Impossible de joindre le serveur.'); this.endGame(); this.show('menu'); }
    });
  }

  startSolo() {
    this.audio.unlock();
    this.attachTransport(new LocalTransport());
    this.transport.send({ t: 'create', hello: this.hello() });
  }

  startOnline(kind) {
    if (!this.server) return this.toast('Serveur indisponible.');
    this.audio.unlock();
    const code = $('join-code').value.trim().toUpperCase();
    if (kind === 'join' && code.length < 4) return this.toast('Entrez le code d\'invitation (5 caractères).');
    this.attachTransport(new WsTransport(wsUrl()));
    this.transport.send(kind === 'create' ? { t: 'create', hello: this.hello() } : { t: 'join', code, hello: this.hello() });
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome': this.myId = m.you; if (!m.reconnected) this.show('lobby'); break;
      case 'lobby': {
        this.lobby = m;
        this.voice.syncMembers(m.members, this.myId);
        if (m.state === 'lobby' && (this.screen === 'menu' || (this.screen === 'results' && this.wantLobby))) this.show('lobby');
        this.lobbyUI.render(m);
        break;
      }
      case 'chat': this.lobbyUI.chat(m); break;
      case 'error': this.toast(m.msg); if (!this.myId) { this.transport?.close(); this.transport = null; } break;
      case 'kicked': this.toast(m.msg); this.endGame(); this.myId = null; this.show('menu'); break;
      case 'start': this.beginGame(m); break;
      case 'snap': this.game?.onSnapshot(m); break;
      case 'result': this.onResult(m.result); break;
      case 'rtc': this.voice.handleSignal(m.from, m.data); break;
      default: break;
    }
  }

  beginGame(m) {
    this.endGame();
    this.game = new ClientGame(this, m);
    this.input.reset();
    this.show('game');
    this.renderer.resize();
    if (this.touchMode && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    }
  }

  endGame() {
    this.game?.destroy();
    this.game = null;
    this.togglePause(false);
  }

  onResult(result) {
    const summary = result && this.myId ? this.profile.applyResult(result, this.myId) : null;
    setTimeout(() => {
      this.endGame();
      this.wantLobby = false;
      this.show('results');
      this.resultsUI.render(result, summary);
    }, this.game ? 1800 : 0);
  }

  backToLobby() {
    this.wantLobby = true;
    if (this.lobby?.state === 'results') this.transport?.send({ t: 'backToLobby' });
    this.show('lobby');
    if (this.lobby) this.lobbyUI.render(this.lobby);
  }

  leaveRoom() {
    this.endGame();
    if (this.voice.active) this.voice.stop();
    this.transport?.send({ t: 'leave' });
    this.transport?.close();
    this.transport = null;
    this.myId = null;
    this.lobby = null;
    this.show('menu');
  }

  isHost() { return !!this.lobby?.members.find((m) => m.id === this.myId)?.isHost; }

  togglePause(force) {
    const el = $('pause');
    const open = force === undefined ? el.hidden : force;
    el.hidden = !open;
    if (this.game) this.game.paused = open;
    $('pause-note').textContent = this.transport?.kind === 'local' ? 'Solo : la partie continue en arrière-plan (les monstres ne font pas de pause !).' : 'Le jeu continue pour les autres (et pour les monstres).';
  }

  saveSettings() {
    saveSettings(this.settings);
    this.audio.applyVolumes();
    this.renderer.setQuality(this.settings.graphics);
    this.detectTouch();
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.hidden = true; }, 3500);
  }

  loop() {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        if (this.game && this.screen === 'game') this.game.frame(dt);
        else {
          if (this.voice.active) this.voice.update({ inGame: false });
          if (this.screen === 'menu') this.menu.frame(dt);
        }
      } catch (e) { console.error(e); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

window.app = new App();
