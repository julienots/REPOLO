// Captures de scènes de jeu (solo) : obscurité, créatures, événements. Utilise l'accès debug au salon local.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = process.env.OUT || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);
await page.click('[data-action="solo"]');
await page.waitForSelector('#screen-lobby.active');
await page.selectOption('#set-difficulty', 'cadre');
await page.waitForTimeout(200);
await page.click('#btn-start');
await page.waitForSelector('#screen-game.active');
await page.waitForTimeout(1000);
const kinds = ['sourdine', 'inspecteur', 'mannequine', 'demenageur', 'berger', 'echo', 'sauveteur', 'invite'];
for (let i = 0; i < kinds.length; i++) {
  await page.evaluate(([k]) => {
    const g = window.app.transport.room.game;
    g.time = Math.max(g.time, 40);
    const me = g.players.get(window.app.myId);
    const room = g.map.rooms.filter((r) => !r.start && !r.secret).sort((a, b) => b.danger - a.danger)[0];
    const pt = g.randomPointInRoom(room);
    me.x = pt.x; me.y = pt.y; me.tp++;
    g.monsters.length = 0;
    const m = g.spawner.spawn(k) || null;
    if (m) { m.x = pt.x + 2.2; m.y = pt.y + 0.3; m.angle = Math.PI; }
  }, [kinds[i]]);
  await page.mouse.move(900, 380);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/scene-${kinds[i]}.png` });
}
await page.evaluate(() => { const g = window.app.transport.room.game; g.director.forceStart('confetti_alarm'); g.director.forceStart('gravity'); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/scene-event.png` });
console.log(errors.length ? errors.join('\n') : 'AUCUNE ERREUR');
await browser.close();
