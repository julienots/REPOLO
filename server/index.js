// Serveur de jeu : fichiers statiques (client + code partagé) + WebSocket temps réel.
// Lancement : npm start            → http://localhost:8080
//             npm run start:https  → https://<ip-locale>:8443 (micro utilisable sur téléphone en Wi-Fi)
// Variables : PORT, HOST, HTTPS_PORT, MAX_ROOMS, MAX_PLAYERS, TURN_URL, TURN_USER, TURN_PASS
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, makeRoomCode } from '../shared/room/room.js';
import { GAME, LIMITS } from '../shared/config/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.PORT) || 8080;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8443;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 200;
const MAX_PLAYERS = Math.min(Number(process.env.MAX_PLAYERS) || LIMITS.defaultMaxPlayers, LIMITS.absoluteMaxPlayers);
const log = (...a) => { if (!(args.has('--quiet') || process.env.QUIET === '1')) console.log(new Date().toISOString().slice(11, 19), ...a); };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
};

// ------------------------------------------------------------------ HTTP
function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/health') return json(res, { ok: true, game: GAME.name, version: GAME.version, rooms: rooms.size, players: [...rooms.values()].reduce((s, r) => s + r.connectedMembers().length, 0) });
  if (p === '/api/ice') return json(res, { iceServers: iceServers() });
  if (p === '/api/info') return json(res, { game: GAME.name, version: GAME.version, protocol: GAME.protocol, online: true, maxPlayers: MAX_PLAYERS });
  if (p === '/') p = '/client/index.html';
  else if (!p.startsWith('/client/') && !p.startsWith('/shared/')) p = '/client' + p;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(path.join(ROOT, 'client')) && !file.startsWith(path.join(ROOT, 'shared'))) { res.writeHead(403); return res.end('Interdit'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || p.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
  return list;
}

// ------------------------------------------------------------------ SALONS
const rooms = new Map();          // code → Room
const sockets = new Map();        // clientId → ws
let clientCounter = 1;

function sendTo(clientId, msg) {
  const ws = sockets.get(clientId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

function createRoom() {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = makeRoomCode(rooms);
  const room = new Room({
    code, send: sendTo, maxPlayers: MAX_PLAYERS,
    onEmpty: (r) => { rooms.delete(r.code); log(`salon ${r.code} fermé (${rooms.size} actifs)`); },
  });
  rooms.set(code, room);
  log(`salon ${code} créé (${rooms.size} actifs)`);
  return room;
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws, req) => {
    const clientId = 'c' + clientCounter++;
    sockets.set(clientId, ws);
    ws.isAlive = true;
    let room = null;
    let budget = 120, lastRefill = Date.now();
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      // limitation de débit simple (anti-flood)
      const now = Date.now();
      budget = Math.min(160, budget + ((now - lastRefill) / 1000) * 80); lastRefill = now;
      if (--budget < 0) return;
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (!room) {
        if (msg.t === 'create') {
          const r = createRoom();
          if (!r) return sendTo(clientId, { t: 'error', msg: 'Serveur plein, réessayez plus tard.' });
          const res = r.join(clientId, msg.hello || {});
          if (res.error) return sendTo(clientId, { t: 'error', msg: res.error });
          room = r;
        } else if (msg.t === 'join') {
          const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          const r = rooms.get(code);
          if (!r) return sendTo(clientId, { t: 'error', msg: `Aucun salon avec le code ${code || '(vide)'}.` });
          const res = r.join(clientId, msg.hello || {});
          if (res.error) return sendTo(clientId, { t: 'error', msg: res.error });
          room = r;
        } else if (msg.t === 'ping') sendTo(clientId, { t: 'pong', c: msg.c });
        return;
      }
      if (msg.t === 'leave') { room.handle(clientId, msg); room = null; return; }
      room.handle(clientId, msg);
    });
    ws.on('close', () => {
      sockets.delete(clientId);
      if (room) room.disconnect(clientId);
    });
    ws.on('error', () => {});
  });
  // battements de cœur : détection des connexions mortes (téléphone en veille, perte réseau)
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
    for (const r of rooms.values()) r.housekeeping();
  }, 10000);
  wss.on('close', () => clearInterval(hb));
  hb.unref?.();
  return wss;
}

function localIps() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

async function loadCert() {
  const dir = path.join(ROOT, '.certs');
  const keyF = path.join(dir, 'key.pem'), certF = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyF) && fs.existsSync(certF)) return { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  let selfsigned;
  try { selfsigned = (await import('selfsigned')).default; } catch {
    throw new Error('Le module « selfsigned » est requis pour --https (npm install).');
  }
  const altNames = [{ type: 2, value: 'localhost' }, ...localIps().map((ip) => ({ type: 7, ip }))];
  const pems = selfsigned.generate([{ name: 'commonName', value: 'operation-panique.local' }], { days: 365, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames }] });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyF, pems.private); fs.writeFileSync(certF, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

export async function startServer(opts = {}) {
  const port = opts.port ?? PORT;
  const httpServer = http.createServer(serveStatic);
  const wsServers = [attach(httpServer)];
  await new Promise((resolve) => httpServer.listen(port, opts.host ?? HOST, resolve));
  const actualPort = httpServer.address().port;
  log(`${GAME.name} v${GAME.version} — serveur prêt`);
  log(`  PC (ce poste) : http://localhost:${actualPort}`);
  let httpsServer = null;
  if (opts.https ?? args.has('--https')) {
    const cert = await loadCert();
    httpsServer = https.createServer(cert, serveStatic);
    wsServers.push(attach(httpsServer));
    await new Promise((resolve) => httpsServer.listen(opts.httpsPort ?? HTTPS_PORT, opts.host ?? HOST, resolve));
    for (const ip of localIps()) log(`  Téléphone (même Wi-Fi, micro OK) : https://${ip}:${httpsServer.address().port}  (accepter l'avertissement de certificat)`);
  } else {
    for (const ip of localIps()) log(`  Autre appareil (même Wi-Fi) : http://${ip}:${actualPort}  (micro bloqué sans HTTPS : utilisez npm run start:https)`);
  }
  return { httpServer, httpsServer, port: actualPort, rooms, close: () => {
    for (const w of wsServers) { for (const c of w.clients) c.terminate(); w.close(); }
    httpServer.closeAllConnections?.(); httpServer.close(); httpsServer?.close();
    for (const r of rooms.values()) r.stopLoop();
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}
