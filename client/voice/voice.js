// CHAT VOCAL DE PROXIMITÉ — WebRTC pair-à-pair (maillage, prévu pour ~4-6 joueurs),
// signalisation relayée par le serveur de jeu. Chaque voix distante passe par :
//   source → [branche proximité : passe-bas (murs) → gain (distance) → panoramique]
//          → [branche radio : passe-bande + distorsion + gain]          → bus voix
// Le niveau réel du micro local est envoyé au serveur : les créatures entendent vos cris.
import { soundObstruction } from '../../shared/map/grid.js';

const VOICE_RANGE = 17;   // cases

export class VoiceChat {
  constructor(audio, settings, send) {
    this.audio = audio;
    this.settings = settings;
    this.send = send;           // (msg) => void, vers le serveur
    this.peers = new Map();     // memberId → pair
    this.myId = null;
    this.localStream = null;
    this.localTrack = null;
    this.active = false;        // participe au vocal (écoute au minimum)
    this.micOn = false;
    this.ptt = false;
    this.radioKey = false;
    this.level = 0;             // niveau local 0..1
    this.transmitting = false;
    this.fx = '';
    this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    this.lastVoiceSend = 0;
    this.error = null;
    this.loadIce(location.origin);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPtt(false), this.setRadio(false); });
  }

  loadIce(base) {
    if (!base) return;
    fetch(`${base}/api/ice`).then((r) => r.ok && r.json()).then((j) => { if (j?.iceServers) this.iceServers = j.iceServers; }).catch(() => {});
  }

  get supported() { return !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection); }
  get secure() { return window.isSecureContext; }

  // mic : true = micro + écoute ; false = écoute seulement
  async start(mic = true) {
    this.audio.unlock();
    this.error = null;
    if (mic && !this.localStream) {
      if (!this.secure) { this.error = 'Le micro exige une connexion sécurisée (HTTPS ou localhost).'; mic = false; }
      else if (!navigator.mediaDevices?.getUserMedia) { this.error = 'Micro non disponible sur ce navigateur.'; mic = false; }
      else {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          this.localTrack = this.localStream.getAudioTracks()[0];
          this.localTrack.enabled = false;
          const src = this.audio.ctx.createMediaStreamSource(this.localStream);
          this.analyser = this.audio.ctx.createAnalyser();
          this.analyser.fftSize = 512;
          src.connect(this.analyser);
          this.buf = new Float32Array(this.analyser.fftSize);
        } catch (e) {
          this.error = e.name === 'NotAllowedError' ? 'Accès au micro refusé. Autorisez-le dans les réglages du navigateur.' : `Micro indisponible (${e.name}).`;
          mic = false;
        }
      }
    }
    this.micOn = mic && !!this.localTrack;
    this.active = true;
    for (const p of this.peers.values()) this.attachLocal(p);
    for (const [from, data] of (this.early || []).splice(0)) this.handleSignal(from, data);
    this.send({ t: 'voiceState', on: true });
    return this.micOn;
  }

  stop() {
    this.active = false;
    this.early = [];
    this.micOn = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    if (this.localStream) for (const t of this.localStream.getTracks()) t.stop();
    this.localStream = null; this.localTrack = null; this.analyser = null;
    this.send({ t: 'voiceState', on: false });
  }

  setPtt(v) { this.ptt = v; }
  setRadio(v) { this.radioKey = v; }

  // Liste des membres du salon ayant le vocal actif → ouverture / fermeture des connexions.
  // Pour chaque paire, un seul initiateur (ordre des identifiants) : pas de collision d'offres.
  syncMembers(members, myId) {
    this.myId = myId;
    if (!this.active) return;
    const want = new Set(members.filter((m) => m.id !== myId && m.voice && m.connected).map((m) => m.id));
    this.wanted = want;
    for (const id of want) if (!this.peers.has(id) && this.isInitiator(id)) this.makePeer(id, true);
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.closePeer(id);
  }

  isInitiator(id) { return String(this.myId) < String(id); }

  makePeer(id, initiator) {
    // confidentialité : couper par défaut les nouveaux venus si l'option est active
    if (this.settings.autoMuteStrangers && this.settings.mutedPeers[id] === undefined) this.settings.mutedPeers[id] = true;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { id, pc, initiator, level: 0, stream: null, nodes: null, state: 'connecting', createdAt: performance.now() };
    this.peers.set(id, peer);
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ t: 'rtc', to: id, data: { ice: e.candidate } }); };
    pc.onconnectionstatechange = () => {
      peer.state = pc.connectionState;
      if (pc.connectionState === 'failed' && initiator) pc.restartIce?.();
    };
    pc.ontrack = (e) => this.attachRemote(peer, e.streams[0] || new MediaStream([e.track]));
    if (initiator) {
      peer.transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.attachLocal(peer);
      pc.onnegotiationneeded = async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          this.send({ t: 'rtc', to: id, data: { sdp: pc.localDescription } });
        } catch (e) { console.warn('[voix] négociation', e); }
      };
    }
    return peer;
  }

  attachLocal(peer) {
    const sender = peer.transceiver?.sender;
    if (sender && this.localTrack && sender.track !== this.localTrack) sender.replaceTrack(this.localTrack).catch(() => {});
  }

  // Les messages de signalisation d'un même pair sont traités dans l'ordre (file d'attente) :
  // sinon un candidat ICE peut arriver avant la description distante et être perdu.
  handleSignal(from, data) {
    if (!data) return;
    // reçu pendant que le micro s'initialise : on le garde pour plus tard (sinon la connexion se bloque)
    if (!this.active) { (this.early ||= []).push([from, data]); if (this.early.length > 200) this.early.shift(); return; }
    this.queues ||= {};
    this.queues[from] = (this.queues[from] || Promise.resolve()).then(() => this.processSignal(from, data)).catch((e) => console.warn('[voix] signal', e));
    return this.queues[from];
  }

  async processSignal(from, data) {
    let peer = this.peers.get(from);
    if (data.sdp?.type === 'offer') {
      // nouvelle offre : (re)création de la connexion côté récepteur
      if (peer) this.closePeer(from, true);
      peer = this.makePeer(from, false);
      const pc = peer.pc;
      await pc.setRemoteDescription(data.sdp);
      const tr = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio') || pc.getTransceivers()[0];
      if (tr) { tr.direction = 'sendrecv'; peer.transceiver = tr; this.attachLocal(peer); }
      for (const c of (this.pendingIce?.[from] || []).splice(0)) await pc.addIceCandidate(c).catch(() => {});
      await pc.setLocalDescription(await pc.createAnswer());
      this.send({ t: 'rtc', to: from, data: { sdp: pc.localDescription } });
    } else if (data.sdp?.type === 'answer') {
      if (peer && peer.initiator && peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(data.sdp);
        for (const c of (this.pendingIce?.[from] || []).splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
      }
    } else if (data.ice) {
      if (!peer || !peer.pc.remoteDescription) { ((this.pendingIce ||= {})[from] ||= []).push(data.ice); return; }
      await peer.pc.addIceCandidate(data.ice).catch(() => {});
    }
  }

  // Chien de garde : une connexion bloquée est relancée par son initiateur.
  watchdog() {
    const now = performance.now();
    for (const peer of [...this.peers.values()]) {
      if (peer.state === 'connected') { peer.createdAt = now; continue; }
      const age = now - peer.createdAt;
      if (peer.initiator && age > 7000 && this.wanted?.has(peer.id)) { this.closePeer(peer.id, true); this.makePeer(peer.id, true); }
      else if (!peer.initiator && age > 20000) this.closePeer(peer.id, true);
    }
  }

  attachRemote(peer, stream) {
    if (peer.stream === stream) return;
    peer.stream = stream;
    const ctx = this.audio.ctx;
    // Chrome n'envoie l'audio WebRTC dans WebAudio que si le flux est aussi attaché à un élément
    const el = document.createElement('audio');
    el.srcObject = stream; el.muted = true; el.autoplay = true; el.playsInline = true;
    document.getElementById('voice-audio')?.appendChild(el);
    el.play?.().catch(() => {});
    peer.el = el;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
    src.connect(analyser);
    // effet « voix inversées » (modulation en anneau)
    const ring = ctx.createGain(); ring.gain.value = 1;
    const ringOsc = ctx.createOscillator(); ringOsc.frequency.value = 55; const ringDepth = ctx.createGain(); ringDepth.gain.value = 0;
    ringOsc.connect(ringDepth); ringDepth.connect(ring.gain); ringOsc.start();
    src.connect(ring);
    // proximité
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000;
    const gain = ctx.createGain(); gain.gain.value = 1;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    ring.connect(lp); lp.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(this.audio.voiceBus); } else gain.connect(this.audio.voiceBus);
    // radio
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1;
    const shaper = ctx.createWaveShaper(); shaper.curve = distortionCurve(28);
    const rgain = ctx.createGain(); rgain.gain.value = 0;
    ring.connect(bp); bp.connect(shaper); shaper.connect(rgain); rgain.connect(this.audio.voiceBus);
    peer.nodes = { src, analyser, ring, ringDepth, ringOsc, lp, gain, pan, rgain, buf: new Uint8Array(analyser.fftSize) };
  }

  closePeer(id, keepIce = false) {
    const p = this.peers.get(id);
    if (!p) return;
    if (!keepIce && this.pendingIce) delete this.pendingIce[id];
    try { p.pc.close(); } catch { /* ignore */ }
    if (p.nodes) { try { p.nodes.ringOsc.stop(); p.nodes.src.disconnect(); } catch { /* ignore */ } }
    p.el?.remove();
    this.peers.delete(id);
  }

  // Appelé à chaque image. view = { inGame, me, players: Map id→{x,y,st,rt,h}, grid, mods, myRadio }
  update(view) {
    const now = performance.now();
    if (this.active && now - (this.lastWatch || 0) > 1000) { this.lastWatch = now; this.watchdog(); }
    // niveau du micro local
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      this.level = Math.min(1, rms * 4.2);
    } else this.level = 0;
    const mode = this.settings.voiceMode;
    const vad = mode === 'open' && this.level > this.settings.vadThreshold;
    const wantTx = this.micOn && mode !== 'off' && (this.ptt || this.radioKey || vad || (mode === 'open' && now - (this.vadHold || 0) < 350));
    if (vad) this.vadHold = now;
    this.transmitting = wantTx;
    if (this.localTrack) this.localTrack.enabled = wantTx;
    const radioTx = wantTx && this.radioKey;
    if (view.inGame && now - this.lastVoiceSend > 100) {
      this.lastVoiceSend = now;
      this.send({ t: 'voice', lv: wantTx ? Math.round(this.level * 100) / 100 : 0, radio: radioTx });
    }

    // mixage des voix distantes
    for (const peer of this.peers.values()) {
      const n = peer.nodes;
      if (!n) continue;
      n.analyser.getByteTimeDomainData(n.buf);
      let s = 0;
      for (let i = 0; i < n.buf.length; i++) { const v = (n.buf[i] - 128) / 128; s += v * v; }
      peer.level = Math.min(1, Math.sqrt(s / n.buf.length) * 4.2);
      const muted = this.settings.mutedPeers?.[peer.id] || this.settings.voiceMode === 'off';
      let g = 1, pan = 0, cutoff = 16000, rg = 0;
      if (view.inGame && view.me) {
        const o = view.players.get(peer.id);
        const me = view.me;
        if (!o) g = 0;
        else {
          const meDead = me.st === 'dead', oDead = o.st === 'dead';
          if (oDead && !meDead) g = 0;                // les morts ne parlent qu'aux morts
          else if (oDead && meDead) g = 0.9;
          else if (me.st === 'extracted' || o.st === 'extracted') g = 0.8;
          else {
            const dx = o.x - me.x, dy = o.y - me.y, d = Math.hypot(dx, dy);
            g = d >= VOICE_RANGE ? 0 : Math.pow(1 - d / VOICE_RANGE, 1.3);
            pan = Math.max(-1, Math.min(1, dx / 6));
            const obs = d > 1 ? soundObstruction(view.grid, o.x, o.y, me.x, me.y) : 0;
            if (obs > 0) { cutoff = Math.max(300, 5000 / (1 + obs * 1.5)); g *= 1 / (1 + obs * 0.3); }
            if (o.h) cutoff = Math.min(cutoff, 900);
            // talkie-walkie : il faut que les deux en aient un, et que la radio fonctionne
            if (o.rt && view.myRadio && !view.mods?.rd) rg = 0.85;
          }
        }
        if (view.mods?.fx === 'robot') pan = -pan;
      }
      if (muted) { g = 0; rg = 0; }
      const t = this.audio.ctx.currentTime;
      n.gain.gain.setTargetAtTime(g, t, 0.05);
      n.rgain.gain.setTargetAtTime(rg, t, 0.05);
      n.lp.frequency.setTargetAtTime(cutoff, t, 0.08);
      if (n.pan) n.pan.pan.setTargetAtTime(pan, t, 0.05);
      n.ringDepth.gain.setTargetAtTime(view.mods?.fx === 'robot' ? 1 : 0, t, 0.1);
    }
  }

  peerLevel(id) { return this.peers.get(id)?.level || 0; }
  stats() { return [...this.peers.values()].map((p) => ({ id: p.id, state: p.state, hasAudio: !!p.nodes })); }
}

function distortionCurve(k) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
  return curve;
}
