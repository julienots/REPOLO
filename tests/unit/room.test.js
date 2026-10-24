// Salon local (mode solo) avec horloge simulée : même code que le serveur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/room/room.js';

function fakeTimers() {
  const intervals = new Map();
  let id = 0;
  return {
    setInterval: (f) => { intervals.set(++id, f); return id; },
    clearInterval: (h) => intervals.delete(h),
    setTimeout: () => 0, clearTimeout: () => {},
    tick: (n) => { for (let i = 0; i < n; i++) for (const f of [...intervals.values()]) f(); },
    get count() { return intervals.size; },
  };
}

test('salon solo : rejoindre, compléter avec des bots, jouer, résultats, retour au salon', () => {
  const sent = [];
  const timers = fakeTimers();
  const room = new Room({ code: 'SOLO', local: true, send: (_c, m) => sent.push(m), timers });
  room.join('local', { name: 'Solo' });
  assert.equal(sent[0].t, 'welcome');
  room.handle('local', { t: 'settings', teamSize: 4, fillBots: true, mission: 'morvan', difficulty: 'stagiaire' });
  room.handle('local', { t: 'start' });
  const start = sent.find((m) => m.t === 'start');
  assert.ok(start);
  assert.equal(start.info.roster.length, 4);
  assert.equal(start.info.roster.filter((r) => r.bot).length, 3);
  // le joueur humain reste immobile ; les bots jouent. On avance l'horloge jusqu'à la fin.
  const g = room.game;
  g.players.get(start.you).hp = 99;
  for (let i = 0; i < 30 * 700 && room.state === 'playing'; i += 30) timers.tick(30);
  const res = sent.find((m) => m.t === 'result');
  assert.ok(res, 'résultats reçus');
  assert.ok(sent.filter((m) => m.t === 'snap').length > 50, 'instantanés envoyés');
  assert.equal(room.state, 'results');
  assert.equal(timers.count, 0, 'boucle arrêtée');
  room.handle('local', { t: 'backToLobby' });
  assert.equal(room.state, 'lobby');
});

test('salon : un joueur qui se déconnecte en jeu est remplacé par un bot puis récupère son personnage', () => {
  const sent = [];
  const timers = fakeTimers();
  const room = new Room({ code: 'ABCDE', send: (c, m) => sent.push([c, m]), timers });
  room.join('c1', { name: 'A' });
  const w2 = room.join('c2', { name: 'B' });
  room.handle('c2', { t: 'ready', v: true });
  room.handle('c1', { t: 'start' });
  const id = w2.member.id;
  timers.tick(5);
  room.disconnect('c2');
  assert.equal(room.game.players.get(id).botControl, true);
  timers.tick(30);
  const r = room.join('c3', { token: w2.member.token });
  assert.ok(r.reconnected);
  assert.equal(room.game.players.get(id).botControl, false);
  assert.ok(sent.some(([c, m]) => c === 'c3' && m.t === 'start' && m.resumed));
  room.stopLoop();
});
