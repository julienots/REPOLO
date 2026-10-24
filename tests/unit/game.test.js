import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../shared/sim/game.js';
import { EVENTS } from '../../shared/data/events.js';
import { MISSIONS, DIFFICULTIES } from '../../shared/data/missions.js';
import { BOT_PROFILE_IDS } from '../../shared/data/bots.js';
import { makeGame, run, openLine } from './helpers.js';

test('mission : charger un objet dans le fourgon augmente le butin', () => {
  const g = makeGame();
  const p = g.players.get('h1');
  const it = [...g.items.values()].find((i) => !i.def.noLoot);
  it.x = p.x; it.y = p.y;
  g.grabItem(p, it);
  const v = g.map.van;
  p.x = v.x + v.w / 2; p.y = v.y + v.h / 2; p.angle = 0;
  g.dropCarried(p, {});
  run(g, 1.2);
  assert.ok(g.mission.deposited > 0);
  assert.ok(!g.items.has(it.id));
  assert.ok(p.stats.deposited > 0);
});

test('mission : levier → départ → les joueurs dans le fourgon sont extraits, les autres abandonnés', () => {
  const g = makeGame({ players: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
  g.director.cooldowns.last_minute = 1e9; // pas de « DERNIÈRE MINUTE » pendant ce test
  g.mission.deposited = g.mission.quota;
  const a = g.players.get('h1'), b = g.players.get('h2');
  a.x = g.map.lever.x - 0.3; a.y = g.map.lever.y;
  g.interact(a);
  assert.equal(a.channel?.kind, 'lever');
  run(g, 2.2);
  assert.ok(g.mission.departing);
  const v = g.map.van;
  a.x = v.x + 1; a.y = v.y + 1;
  const far = g.map.rooms.find((r) => r.danger > 0.8);
  const pt = g.randomPointInRoom(far); b.x = pt.x; b.y = pt.y;
  run(g, 13);
  assert.ok(g.mission.ended);
  assert.equal(g.mission.success, true);
  assert.equal(a.state, 'extracted');
  assert.equal(b.state, 'dead');
  assert.match(b.stats.deathCause, /fourgon/);
  assert.ok(g.result.players.find((x) => x.id === 'h1').coins > g.result.players.find((x) => x.id === 'h2').coins);
});

test('objets lourds : ralentissent, et porter à deux aide', () => {
  const g = makeGame({ players: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
  const a = g.players.get('h1'), b = g.players.get('h2');
  const it = g.spawnItem('safe', a.x + 0.5, a.y);
  g.grabItem(a, it);
  const alone = g.playerEnv(a).speedMul;
  b.x = it.x; b.y = it.y + 0.3;
  g.grabItem(b, it);
  assert.equal(it.helper, 'h2');
  const together = g.playerEnv(a).speedMul;
  assert.ok(alone < 0.6 && together > alone, `${alone} → ${together}`);
});

test('objets fragiles : un choc violent fait perdre de la valeur ou casse ; un objet incassable non', () => {
  const g = makeGame();
  const L = openLine(g, 4);
  const vase = g.spawnItem('vase', L.x, L.y);
  const safe = g.spawnItem('safe', L.x, L.y + 0.8);
  const v0 = vase.value, s0 = safe.value;
  for (const it of [vase, safe]) { it.vx = -14; it.vy = 0; } // lancés vers le mur
  let broke = false;
  run(g, 3, () => { if (!g.items.has(vase.id)) broke = true; });
  assert.ok(broke || vase.value < v0, 'le vase a perdu de la valeur');
  assert.equal(safe.value, s0, 'le coffre-fort est incassable');
});

test('réanimation : un coéquipier relève un joueur à terre', () => {
  const g = makeGame({ players: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
  const a = g.players.get('h1'), b = g.players.get('h2');
  g.damagePlayer(b, 3, null);
  assert.equal(b.state, 'downed');
  a.x = b.x + 0.5; a.y = b.y;
  g.interact(a);
  run(g, 3);
  assert.equal(b.state, 'alive');
  assert.equal(a.stats.revives, 1);
});

test('à terre trop longtemps → mort, fantôme', () => {
  const g = makeGame({ players: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
  const b = g.players.get('h2');
  g.damagePlayer(b, 3, null);
  run(g, 30);
  assert.equal(b.state, 'dead');
  g.boo(b);
  assert.equal(b.stats.boos, 1);
});

test('bruit : courir fait beaucoup plus de bruit que marcher accroupi', () => {
  const measure = (speed) => {
    const g = makeGame();
    const p = g.players.get('h1');
    let total = 0;
    run(g, 2, () => {
      p.x += speed / 30;
      if (g.map.grid.blocksMove(Math.floor(p.x + 0.4), Math.floor(p.y))) p.x -= speed / 30;
      for (const n of g.noises) if (n.source === 'h1' && n.t === g.time) total += n.loudness;
    });
    return p.stats.noise;
  };
  const sneak = measure(1.4), sprint = measure(5.2);
  assert.ok(sprint > sneak * 3, `${sneak} vs ${sprint}`);
});

test('voix : le niveau du micro génère du bruit perçu par les créatures', () => {
  const g = makeGame();
  const p = g.players.get('h1');
  g.setVoice(p, 0.9, false);
  let loud = 0;
  run(g, 0.5, () => { g.setVoice(p, 0.9, false); for (const n of g.noises) if (n.source === 'h1' && (n.type === 'scream' || n.type === 'voice')) loud = Math.max(loud, n.loudness); });
  assert.ok(loud > 10, `cri ${loud}`);
});

test('événements : chacun démarre et se termine sans erreur, et leurs effets s\'annulent à la fin', () => {
  for (const ev of EVENTS) {
    const g = makeGame({ players: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }] });
    g.time = 300;
    const p = g.players.get('h1');
    const it = [...g.items.values()][0]; it.x = p.x; it.y = p.y; g.grabItem(p, it);
    const ok = g.director.forceStart(ev.id);
    assert.ok(ok, `${ev.id} démarrable`);
    run(g, 120);
    assert.equal(g.director.active.filter((a) => a.def.id === ev.id).length, 0, `${ev.id} terminé`);
  }
});

test('événements : un seul événement par tag (pas de combinaisons injustes)', () => {
  const g = makeGame();
  g.time = 300;
  assert.ok(g.director.forceStart('blackout'));
  assert.equal(g.director.forceStart('flashlight_failure'), false, 'deux obscurités simultanées interdites');
  assert.equal(g.mods.ambientLight, 0);
  assert.ok(g.director.forceStart('gravity'), 'mais un événement d\'un autre type passe');
});

test('événements : déclenchement par signal (objet cassé → alarme antivol possible)', () => {
  let fired = 0;
  for (let s = 0; s < 20; s++) {
    const g = makeGame({ seed: s });
    g.time = 100;
    g.signal('itemBroken', { x: 10, y: 10, value: 200 });
    if (g.director.history.includes('theft_alarm')) fired++;
  }
  assert.ok(fired > 3 && fired < 17, `déclenché ${fired}/20 (probabiliste)`);
});

test('directeur : les événements arrivent sans intervalle fixe, et jamais pendant les 25 premières secondes', () => {
  const g = makeGame({ players: BOT_PROFILE_IDS.slice(0, 4).map((b, i) => ({ id: 'b' + i, name: 'B', isBot: true, botProfile: b })) });
  const starts = [];
  const orig = g.director.begin.bind(g.director);
  g.director.begin = (def, sig) => { starts.push(g.time); return orig(def, sig); };
  run(g, 400);
  assert.ok(starts.length >= 3, `${starts.length} événements`);
  assert.ok(starts[0] >= 25);
  const gaps = starts.slice(1).map((t, i) => Math.round(t - starts[i]));
  assert.ok(new Set(gaps).size > 1, 'intervalles variables');
});

for (const mission of Object.keys(MISSIONS)) {
  test(`partie complète de bots sans erreur : ${mission}`, () => {
    for (const diff of Object.keys(DIFFICULTIES)) {
      const players = BOT_PROFILE_IDS.slice(0, 4).map((b, i) => ({ id: 'b' + i, name: 'Bot' + i, isBot: true, botProfile: b }));
      const g = new Game({ missionId: mission, difficulty: diff, seed: 1000 + diff.length, players, variant: 'random' });
      const dt = 1 / 30;
      let snaps = 0;
      while (!g.mission.ended && g.time < 1000) {
        g.step(dt);
        if (++snaps % 2 === 0) JSON.stringify(g.snapshot());
      }
      assert.ok(g.mission.ended, `${mission}/${diff} terminée`);
      assert.ok(g.result && Array.isArray(g.result.players) && g.result.players.length === 4);
      JSON.stringify(g.result);
    }
  });
}
