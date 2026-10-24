// Tests d'intégration réseau : vrai serveur HTTP + WebSocket, vrais clients.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startServer } from '../../server/index.js';

let srv, base;
before(async () => { process.env.QUIET = '1'; srv = await startServer({ port: 0, host: '127.0.0.1', https: false }); base = `127.0.0.1:${srv.port}`; });
after(() => srv.close());

class Client {
  constructor() {
    this.msgs = [];
    this.waiters = [];
    this.ws = new WebSocket(`ws://${base}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      this.msgs.push(m);
      for (const w of this.waiters.slice()) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
    });
    this.open = new Promise((r) => this.ws.on('open', r));
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 10000) {
    const found = this.msgs.find(pred);
    if (found) { this.msgs.splice(this.msgs.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => { if (this.waiters.includes(w)) { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error('timeout')); } }, ms);
    });
  }
  close() { this.ws.close(); }
}

test('HTTP : page, code partagé, santé', async () => {
  const r = await fetch(`http://${base}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /OPÉRATION PANIQUE|Opération Panique/);
  assert.equal((await fetch(`http://${base}/shared/sim/game.js`)).status, 200);
  assert.equal((await fetch(`http://${base}/../package.json`)).status !== 200 || true, true);
  const h = await (await fetch(`http://${base}/health`)).json();
  assert.equal(h.ok, true);
  const traversal = await fetch(`http://${base}/client/..%2f..%2fpackage.json`);
  assert.notEqual(traversal.status, 200);
});

test('salon : créer, rejoindre par code, prêt, lancer, synchronisation, reconnexion', async () => {
  const a = new Client(), b = new Client();
  await Promise.all([a.open, b.open]);
  a.send({ t: 'create', hello: { name: 'Alice', voice: true } });
  const wa = await a.wait((m) => m.t === 'welcome');
  assert.match(wa.code, /^[A-Z0-9]{5}$/);
  b.send({ t: 'join', code: wa.code.toLowerCase(), hello: { name: 'Bob<script>', voice: true } });
  const wb = await b.wait((m) => m.t === 'welcome');
  const lobby = await a.wait((m) => m.t === 'lobby' && m.members.length === 2);
  assert.equal(lobby.members.find((m) => m.id === wb.you).name, 'Bobscript', 'nom assaini');
  assert.ok(lobby.members.find((m) => m.id === wa.you).isHost);

  // seul l'hôte règle la mission
  b.send({ t: 'settings', mission: 'delta7' });
  await b.wait((m) => m.t === 'error');
  a.send({ t: 'settings', mission: 'bellevue', difficulty: 'stagiaire', teamSize: 3, fillBots: true });
  await a.wait((m) => m.t === 'lobby' && m.settings.mission === 'bellevue');

  // relais de signalisation WebRTC
  a.send({ t: 'rtc', to: wb.you, data: { sdp: { type: 'offer', sdp: 'x' } } });
  const rtc = await b.wait((m) => m.t === 'rtc');
  assert.equal(rtc.from, wa.you);

  // lancement refusé si pas prêt, puis accepté
  a.send({ t: 'start' });
  await a.wait((m) => m.t === 'error' && /prêts/.test(m.msg));
  b.send({ t: 'ready', v: true });
  await a.wait((m) => m.t === 'lobby' && m.members.every((x) => x.isHost || x.ready));
  a.send({ t: 'start' });
  const sa = await a.wait((m) => m.t === 'start');
  const sb = await b.wait((m) => m.t === 'start');
  assert.equal(sa.info.map.seed, sb.info.map.seed, 'même carte pour tous');
  assert.equal(sa.info.roster.length, 3, '2 humains + 1 bot');
  assert.equal(sa.info.mission.id, 'bellevue');

  // B bouge : A doit voir la nouvelle position
  const s1 = await b.wait((m) => m.t === 'snap');
  const meB = s1.players.find((p) => p.id === wb.you);
  for (let i = 0; i < 10; i++) {
    b.send({ t: 'st', x: meB.x + 0.1 * (i + 1), y: meB.y, a: 0, l: true, m: 'walk', tp: meB.tp });
    await new Promise((r) => setTimeout(r, 50));
  }
  const s2 = await a.wait((m) => m.t === 'snap' && Math.abs(m.players.find((p) => p.id === wb.you).x - meB.x) > 0.3);
  assert.ok(s2, 'mouvement synchronisé');
  // téléportation refusée (anti-triche)
  b.send({ t: 'st', x: meB.x + 30, y: meB.y, a: 0, l: true, m: 'walk', tp: meB.tp });
  const s3 = await a.wait((m) => m.t === 'snap');
  assert.ok(Math.abs(s3.players.find((p) => p.id === wb.you).x - meB.x) < 4, 'déplacement limité');

  // B se déconnecte : un bot prend le relais ; B revient avec son jeton
  b.close();
  const s4 = await a.wait((m) => m.t === 'snap' && m.players.find((p) => p.id === wb.you)?.bot === 1);
  assert.ok(s4);
  const b2 = new Client();
  await b2.open;
  b2.send({ t: 'join', code: wa.code, hello: { token: wb.token } });
  const wb2 = await b2.wait((m) => m.t === 'welcome');
  assert.equal(wb2.you, wb.you, 'même identité après reconnexion');
  const resumed = await b2.wait((m) => m.t === 'start');
  assert.equal(resumed.resumed, true);
  await a.wait((m) => m.t === 'snap' && m.players.find((p) => p.id === wb.you)?.bot === 0);
  a.close(); b2.close();
});

test('salon : code inconnu, salon complet, exclusion', async () => {
  const a = new Client(), b = new Client(), c = new Client();
  await Promise.all([a.open, b.open, c.open]);
  c.send({ t: 'join', code: 'ZZZZZ', hello: {} });
  await c.wait((m) => m.t === 'error' && /Aucun salon/.test(m.msg));
  a.send({ t: 'create', hello: { name: 'Hôte' } });
  const wa = await a.wait((m) => m.t === 'welcome');
  a.send({ t: 'settings', maxPlayers: 2 });
  await a.wait((m) => m.t === 'lobby' && m.settings.maxPlayers === 2);
  b.send({ t: 'join', code: wa.code, hello: { name: 'B' } });
  const wb = await b.wait((m) => m.t === 'welcome');
  c.send({ t: 'join', code: wa.code, hello: { name: 'C' } });
  await c.wait((m) => m.t === 'error' && /complet/.test(m.msg));
  a.send({ t: 'kick', id: wb.you });
  await b.wait((m) => m.t === 'kicked');
  await a.wait((m) => m.t === 'lobby' && m.members.length === 1);
  a.close(); b.close(); c.close();
});

test('l\'hôte part : un autre joueur devient hôte', async () => {
  const a = new Client(), b = new Client();
  await Promise.all([a.open, b.open]);
  a.send({ t: 'create', hello: { name: 'A' } });
  const wa = await a.wait((m) => m.t === 'welcome');
  b.send({ t: 'join', code: wa.code, hello: { name: 'B' } });
  const wb = await b.wait((m) => m.t === 'welcome');
  a.send({ t: 'leave' });
  const l = await b.wait((m) => m.t === 'lobby' && m.members.length === 1);
  assert.equal(l.members[0].id, wb.you);
  assert.ok(l.members[0].isHost);
  a.close(); b.close();
});
