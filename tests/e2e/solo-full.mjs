// Partie solo complète dans le navigateur (simulation accélérée ×6) jusqu'à l'écran de résultats,
// puis vérification de la sauvegarde de la progression et du retour au salon.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = process.env.OUT || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);
await page.click('[data-action="solo"]');
await page.waitForSelector('#screen-lobby.active');
const coins0 = await page.evaluate(() => window.app.profile.data.coins);
await page.evaluate(() => {
  const room = window.app.transport.room;
  room.timers.setInterval = (f, t) => setInterval(() => { for (let i = 0; i < 6; i++) f(); }, t);
});
await page.click('#btn-start');
await page.waitForSelector('#screen-game.active');
// le joueur reste près du fourgon ; on le rend résistant pour laisser les bots jouer
await page.evaluate(() => { const g = window.app.transport.room.game; g.players.get(window.app.myId).hp = 50; });
let shot = 0;
const t0 = Date.now();
while (Date.now() - t0 < 170000) {
  const screen = await page.evaluate(() => window.app.screen);
  if (screen === 'results') break;
  if ((Date.now() - t0) > shot * 15000) {
    await page.screenshot({ path: `${OUT}/solo-${String(shot).padStart(2, '0')}.png` });
    shot++;
  }
  // le joueur suit un bot de temps en temps (pour voir l'action)
  await page.evaluate(() => {
    const room = window.app.transport.room, g = room.game; if (!g) return;
    const me = g.players.get(window.app.myId);
    const bot = [...g.players.values()].find((p) => p.isBot && p.state === 'alive');
    if (bot && me.state === 'alive' && Math.random() < 0.3) { me.x = bot.x - 0.6; me.y = bot.y; me.tp++; }
  });
  await page.waitForTimeout(1000);
}
const screen = await page.evaluate(() => window.app.screen);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/solo-results.png`, fullPage: true });
const res = await page.evaluate(() => ({ title: document.getElementById('res-title').textContent, coins: window.app.profile.data.coins, missions: window.app.profile.data.stats.missions, saved: !!localStorage.getItem('op-panique.profile') }));
console.log('écran final :', screen, JSON.stringify(res), 'crédits avant :', coins0);
await page.click('#btn-back-lobby');
await page.waitForSelector('#screen-lobby.active', { timeout: 5000 }).then(() => console.log('retour au salon : OK'), () => console.log('retour au salon : ÉCHEC'));
console.log(errors.length ? 'ERREURS :\n' + errors.join('\n') : 'AUCUNE ERREUR');
await browser.close();
process.exit(screen === 'results' && res.missions === 1 && !errors.length ? 0 : 1);
