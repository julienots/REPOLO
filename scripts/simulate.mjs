// Simulation sans affichage : une équipe de bots joue une mission complète.
// Usage : node scripts/simulate.mjs [mission] [difficulté] [graine] [nbBots]
import { Game } from '../shared/sim/game.js';
import { BOT_PROFILE_IDS } from '../shared/data/bots.js';

const [mission = 'morvan', difficulty = 'employe', seedArg, nArg] = process.argv.slice(2);
const seed = seedArg ? Number(seedArg) : 1234;
const n = nArg ? Number(nArg) : 4;
const players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, isBot: true, botProfile: BOT_PROFILE_IDS[i % BOT_PROFILE_IDS.length] }));
const g = new Game({ missionId: mission, difficulty, seed, players, variant: 'standard' });
const dt = 1 / 30;
let nextReport = 0;
const t0 = Date.now();
const announcements = [];
while (!g.mission.ended && g.time < 900) {
  g.step(dt);
  const snap = g.time > nextReport - dt ? g.snapshot() : null;
  if (snap) {
    for (const m of snap.msgs) if (m.k === 'announce' && m.kind !== 'warn') announcements.push(`[${Math.round(g.time)}s] ${m.text}`);
  } else { g.outMsgs.length = 0; g.netNoises.length = 0; }
  if (g.time >= nextReport) {
    nextReport += 30;
    const ps = [...g.players.values()].map((p) => `${p.name}:${p.state[0]}${p.hp}${p.carry ? '*' : ''}`).join(' ');
    console.log(`t=${Math.round(g.time)}s dep=${Math.round(g.mission.deposited)}/${g.mission.quota} items=${g.items.size} mon=${g.monsters.map((m) => m.type + ':' + m.state).join(',')} tension=${g.director.tension.toFixed(2)} ${g.director.phase} | ${ps}`);
  }
}
console.log(announcements.slice(-40).join('\n'));
const r = g.result;
console.log('\nRÉSULTAT', r ? { success: r.success, reason: r.reason, deposited: r.deposited, quota: r.quota, time: r.time, events: r.eventsSeen, awards: r.awards.map((a) => `${a.name}→${a.playerName}`) } : 'pas terminé');
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s réelles)`);
for (const p of g.players.values()) console.log(p.name, p.botProfile, p.state, p.stats.deathCause || '', 'dépôt', Math.round(p.stats.deposited), 'bruit', Math.round(p.stats.noise), 'réa', p.stats.revives);
