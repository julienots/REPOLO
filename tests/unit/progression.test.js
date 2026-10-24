import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage minimal pour Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { Profile } = await import('../../client/save/profile.js');
const { levelFromXp } = await import('../../shared/data/progression.js');

beforeEach(() => store.clear());

function fakeResult(over = {}) {
  return {
    success: true, difficulty: 'employe', eventsSeen: ['confetti_alarm'], monstersSeen: ['sourdine'], extractedTypes: ['golden_gnome'], flags: [],
    players: [{ id: 'p1', coins: 200, xp: 300, survived: true, state: 'extracted', awards: ['loudest'], stats: { revives: 1, deposited: 500, fragileIntact: 1, heavyExtracted: 0, noise: 100, confiscated: 0, boos: 0, lastSecond: false } }],
    ...over,
  };
}

test('profil : la paie, l\'XP, les succès et le bestiaire sont appliqués et sauvegardés', () => {
  const p = new Profile();
  const coins0 = p.data.coins;
  const sum = p.applyResult(fakeResult(), 'p1');
  assert.ok(p.data.coins >= coins0 + 200);
  assert.equal(p.data.stats.wins, 1);
  assert.ok(p.data.achievements.first_win && p.data.achievements.golden_gnome && p.data.achievements.loudest && p.data.achievements.confetti);
  assert.ok(p.data.bestiary.sourdine);
  assert.ok(sum.unlocked.length >= 4);
  const p2 = new Profile();
  assert.equal(p2.data.coins, p.data.coins, 'rechargé depuis le stockage');
});

test('profil : une sauvegarde corrompue est récupérée depuis la copie de secours', () => {
  const p = new Profile();
  p.data.coins = 4321; p.save();
  p.data.coins = 5000; p.save(); // la copie de secours contient 4321
  store.set('op-panique.profile', '{corrompu');
  const p2 = new Profile();
  assert.equal(p2.data.coins, 4321);
});

test('boutique : pas d\'achat sans crédits, cosmétiques à niveau verrouillés', () => {
  const p = new Profile();
  p.data.coins = 0;
  assert.equal(p.buy('suit', 'purple'), false);
  p.data.coins = 1000;
  assert.equal(p.buy('suit', 'purple'), true);
  assert.ok(p.owns('suit', 'purple'));
  assert.equal(p.canBuy('hat', 'crown'), false, 'niveau 3 requis');
  assert.equal(p.owns('suit', 'gold'), false, 'débloqué par succès seulement');
});

test('export / import de sauvegarde', () => {
  const p = new Profile();
  p.data.coins = 777; p.save();
  const code = p.export();
  store.clear();
  const q = new Profile();
  q.import(code);
  assert.equal(q.data.coins, 777);
});

test('niveaux : progression croissante', () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.ok(levelFromXp(5000).level > levelFromXp(1000).level);
});
