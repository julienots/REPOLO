// Transports réseau. Les deux exposent la même interface :
//   send(msg) · onMessage(fn) · onStatus(fn) · close() · kind
// - WsTransport : serveur en ligne (WebSocket), reconnexion automatique avec jeton.
// - LocalTransport : partie solo, le salon tourne dans le navigateur (aucun réseau).
import { Room } from '../../shared/room/room.js';

export class WsTransport {
  constructor(url) {
    this.kind = 'online';
    this.url = url;
    this.handlers = [];
    this.statusHandlers = [];
    this.queue = [];
    this.closed = false;
    this.retry = 0;
    this.rtt = 0;
    this.joinMsg = null;   // message create/join à renvoyer après reconnexion
    this.token = null;
    this.code = null;
    this.connect();
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.retry = 0;
      this.emitStatus('open');
      if (this.token && this.code) this.ws.send(JSON.stringify({ t: 'join', code: this.code, hello: { ...(this.joinMsg?.hello || {}), token: this.token } }));
      for (const m of this.queue.splice(0)) this.ws.send(JSON.stringify(m));
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'pong') { this.rtt = performance.now() - msg.c; return; }
      if (msg.t === 'welcome') { this.token = msg.token; this.code = msg.code; }
      if (msg.t === 'kicked' || msg.t === 'left') this.closed = true;
      for (const h of this.handlers) h(msg);
    };
    this.ws.onclose = () => {
      if (this.closed) { this.emitStatus('closed'); return; }
      this.emitStatus('reconnecting');
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      if (this.retry > 8) { this.emitStatus('lost'); this.closed = true; return; }
      setTimeout(() => !this.closed && this.connect(), delay);
    };
    this.ws.onerror = () => {};
  }

  send(msg) {
    if (msg.t === 'create' || msg.t === 'join') this.joinMsg = msg;
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'st' && msg.t !== 'voice' && msg.t !== 'ping') this.queue.push(msg);
  }
  onMessage(fn) { this.handlers.push(fn); }
  onStatus(fn) { this.statusHandlers.push(fn); }
  emitStatus(s) { for (const h of this.statusHandlers) h(s); }
  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    try { this.ws.send(JSON.stringify({ t: 'leave' })); } catch { /* ignore */ }
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

export class LocalTransport {
  constructor() {
    this.kind = 'local';
    this.handlers = [];
    this.statusHandlers = [];
    this.rtt = 0;
    this.room = new Room({ code: 'SOLO', local: true, maxPlayers: 1, send: (_cid, msg) => this.deliver(msg) });
  }
  deliver(msg) {
    // délivrance asynchrone (comme un vrai réseau) pour éviter les réentrances
    queueMicrotask(() => { for (const h of this.handlers) h(msg); });
  }
  send(msg) {
    if (msg.t === 'create') { this.room.join('local', msg.hello || {}); return; }
    if (msg.t === 'leave') { this.room.close(); return; }
    this.room.handle('local', msg);
  }
  onMessage(fn) { this.handlers.push(fn); }
  onStatus(fn) { this.statusHandlers.push(fn); }
  close() { this.room.stopLoop(); }
}

// Adresse du serveur multijoueur : la même origine que la page (version web),
// ou une adresse saisie par le joueur (application Android, ex. « 192.168.1.20:8080 »).
export function serverBase(custom) {
  const c = String(custom || '').trim().replace(/\/+$/, '');
  if (!c) return isApp() ? null : location.origin;
  if (/^https?:\/\//i.test(c)) return c;
  return `http://${c}`;
}

export function isApp() { return !!window.Capacitor?.isNativePlatform?.(); }

export async function serverAvailable(base) {
  if (!base) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${base}/api/info`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export function wsUrl(base) {
  const u = new URL(base || location.origin);
  return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/ws`;
}
