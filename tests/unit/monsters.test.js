// Chaque créature a un comportement réellement différent : on vérifie ses règles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, placeMonster, openLine, lampsOff, run } from './helpers.js';
import { emitNoise } from '../../shared/sim/noise.js';
import { monsterSees } from '../../shared/sim/perception.js';

function setup(type, dist = 5, opts = {}) {
  const g = makeGame(opts);
  g.time = 60;
  lampsOff(g);
  const L = openLine(g, Math.ceil(dist) + 1);
  const p = g.players.get('h1');
  p.x = L.x; p.y = L.y; p.angle = 0; p.light = true;
  const m = placeMonster(g, type, L.x + dist, L.y);
  m.angle = Math.PI;
  m.cycle = { phase: 'active', t: 999 };
  return { g, p, m, L };
}

test('Sourdine : aveugle — un joueur silencieux et immobile n\'est pas repéré, un cri l\'attire', () => {
  const { g, p, m } = setup('sourdine', 6);
  assert.equal(monsterSees(g, m, p), false, 'ne voit rien');
  run(g, 2);
  assert.notEqual(m.state, 'chase', 'pas de poursuite sans bruit');
  emitNoise(g, { x: p.x, y: p.y, loudness: 12, type: 'scream', source: p.id });
  run(g, 0.1);
  assert.equal(m.state, 'chase');
  assert.equal(m.target, p.id);
});

test('Sourdine : les murs étouffent le son', () => {
  const { g, p, m } = setup('sourdine', 6);
  // bruit modéré derrière plusieurs murs : non perçu
  const far = g.map.rooms.find((r) => !r.start && !r.secret && Math.hypot(r.x - m.x, r.y - m.y) > 12);
  const pt = g.randomPointInRoom(far);
  emitNoise(g, { x: pt.x, y: pt.y, loudness: 5, type: 'step', source: p.id });
  run(g, 0.1);
  assert.notEqual(m.state, 'investigate');
});

test('Inspecteur : un joueur immobile avec un objet se fait confisquer l\'objet', () => {
  const { g, p, m } = setup('inspecteur', 4);
  const it = [...g.items.values()][0];
  it.x = p.x; it.y = p.y; g.grabItem(p, it);
  assert.equal(p.carry, it.id);
  let taken = false;
  run(g, 6, () => { p.speed = 0; if (it.carriedBy === m.id) taken = true; });
  assert.equal(p.carry, null, 'objet confisqué');
  assert.ok(taken, 'emporté par l\'Inspecteur vers son bureau');
  assert.equal(p.stats.confiscated, 1);
});

test('Inspecteur : un joueur qui bouge pendant le contrôle est poursuivi', () => {
  const { g, p, m } = setup('inspecteur', 5);
  run(g, 0.2);
  assert.equal(m.state, 'control');
  let chased = false;
  run(g, 1.5, () => { p.x += 0.1; if (m.state === 'chase') chased = true; });
  assert.ok(chased, 'poursuite déclenchée');
});

test('Mannequine : figée quand on la regarde, avance quand on se détourne', () => {
  const { g, p, m } = setup('mannequine', 6);
  m.setState('stalk');
  const x0 = m.x;
  run(g, 1.5, () => { p.angle = 0; });
  assert.ok(Math.abs(m.x - x0) < 0.01, 'immobile sous la lampe');
  p.angle = Math.PI; // dos tourné
  run(g, 0.5, () => { p.angle = Math.PI; });
  assert.ok(m.x < x0 - 0.5, 'elle a avancé');
});

test('Déménageur : charge en ligne droite et s\'assomme contre un mur (BONK)', () => {
  const { g, p, m } = setup('demenageur', 4);
  run(g, 0.3);
  assert.equal(m.state, 'windup', 'il prépare sa charge (indice)');
  p.x += 0; p.y += 2.5; p.tp++; // le joueur esquive sur le côté
  p.hidden = 1; // et devient invisible pour éviter une nouvelle cible
  let stunned = false;
  run(g, 4, () => { if (m.state === 'stunned' || m.stunT > 0) stunned = true; });
  assert.ok(stunned, 'assommé');
  assert.ok(g.flags.has('bonk'));
});

test('Berger : attiré par un groupe, il le disperse (onde de choc)', () => {
  const players = [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }, { id: 'h3', name: 'C' }];
  const { g, p, m } = setup('berger', 5, { players });
  const others = [g.players.get('h2'), g.players.get('h3')];
  others.forEach((o, i) => { o.x = p.x + 0.8 * (i + 1) * 0.5; o.y = p.y + 0.6 * (i ? 1 : -1); });
  const kb0 = p.kb[0];
  run(g, 3.5, () => { for (const o of g.players.values()) o.speed = 0; });
  assert.ok(m.ex.bell >= 2, 'la cloche signale le groupe');
  assert.ok(p.kb[0] > kb0 || g.players.get('h2').kb[0] > 0, 'onde de choc reçue');
});

test('Écho : ses imitations sont marquées comme fausses et ignorées par les autres créatures', () => {
  const { g, p, m } = setup('echo', 10);
  const s = placeMonster(g, 'sourdine', p.x - 3, p.y);
  s.cycle = { phase: 'active', t: 999 };
  m.ex.memory = [{ type: 'door', loudness: 6 }];
  m.ex.mimicT = 0;
  let mimic = null;
  run(g, 1, () => { for (const n of g.noises) if (n.mimic) mimic = n; });
  assert.ok(mimic, 'un faux bruit a été émis');
  assert.ok(mimic.detune > 0, 'désaccordé (indice)');
  assert.notEqual(s.state, 'investigate', 'la Sourdine ignore les imitations');
});

test('Faux Sauveteur : guide les joueurs, et se fait démasquer par la lampe', () => {
  const { g, p, m } = setup('sauveteur', 3);
  run(g, 0.5);
  assert.ok(['approach', 'lead'].includes(m.state));
  assert.equal(m.ex.disguised, 1);
  // le joueur suit le sauveteur en l'éclairant au visage
  run(g, 2.5, () => {
    p.angle = Math.atan2(m.y - p.y, m.x - p.x);
    if (Math.hypot(m.x - p.x, m.y - p.y) > 2.5) { p.x += Math.cos(p.angle) * 0.08; p.y += Math.sin(p.angle) * 0.08; }
  });
  assert.equal(m.ex.disguised, 0, 'démasqué');
  assert.equal(m.state, 'flee');
});

test('Dernier Invité : copie un coéquipier éloigné et se trahit quand on lui lance un objet', () => {
  const players = [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }];
  const { g, p, m } = setup('invite', 4, { players });
  const far = g.map.rooms.filter((r) => !r.secret).sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y))[0];
  const pt = g.randomPointInRoom(far);
  const b = g.players.get('h2'); b.x = pt.x; b.y = pt.y;
  run(g, 0.3);
  assert.equal(m.ex.as, 'h2', 'déguisé en B');
  m.behavior.onHitByItem(m, {});
  assert.equal(m.ex.as, null);
  assert.equal(m.state, 'flee');
});

test('Casier : un joueur caché n\'est pas vu', () => {
  const { g, p, m } = setup('inspecteur', 3);
  assert.ok(monsterSees(g, m, p));
  p.hidden = 1;
  assert.ok(!monsterSees(g, m, p));
});

test('Créatures : pas de chasse pendant la période de grâce du début', () => {
  const { g, p, m } = setup('sourdine', 5);
  g.time = 1;
  emitNoise(g, { x: p.x, y: p.y, loudness: 14, type: 'scream', source: p.id });
  g.step(1 / 30);
  assert.notEqual(m.state, 'chase');
});
