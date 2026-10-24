// Test bout-en-bout multijoueur dans deux navigateurs réels (Chromium) reliés au vrai serveur :
// création de salon, code, vocal WebRTC (micro simulé), appuyer-pour-parler, lancement,
// synchronisation des positions, voix entendue par le serveur (bruit), mobile tactile.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = process.env.OUT || '.';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'] });
const ctxB = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, permissions: ['microphone'] });
const A = await ctxA.newPage(), B = await ctxB.newPage();
const errors = [];
for (const [n, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', (e) => errors.push(`${n}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${n}: ${m.text()}`); });
}
await A.goto(BASE); await B.goto(BASE);
await A.fill('#profile-name', 'Alice'); await A.dispatchEvent('#profile-name', 'change');
await B.fill('#profile-name', 'Bob'); await B.dispatchEvent('#profile-name', 'change');
await A.waitForFunction(() => window.app.server);
await A.click('[data-action="create"]');
await A.waitForSelector('#screen-lobby.active');
const code = (await A.textContent('#lobby-code')).trim();
check('salon créé avec un code', /^[A-Z0-9]{5}$/.test(code), code);
await B.waitForFunction(() => window.app.server);
await B.fill('#join-code', code);
await B.click('[data-action="join"]');
await B.waitForSelector('#screen-lobby.active');
await A.waitForFunction(() => window.app.lobby?.members.length === 2);
check('le second joueur rejoint par le code', true);
check('mode tactile détecté sur le téléphone', await B.evaluate(() => window.app.touchMode));

// vocal
await A.click('#btn-voice'); await B.click('#btn-voice');
const voiceOk = await A.waitForFunction(() => window.app.voice.stats().some((p) => p.state === 'connected' && p.hasAudio), null, { timeout: 15000 }).then(() => true, () => false);
check('connexion vocale WebRTC établie (A↔B)', voiceOk, JSON.stringify(await A.evaluate(() => window.app.voice.stats())));
await B.waitForFunction(() => window.app.voice.stats().some((p) => p.hasAudio), null, { timeout: 10000 }).catch(() => {});
// silence tant qu'on n'appuie pas, son quand on appuie (le micro simulé émet un bip)
const idA = await A.evaluate(() => window.app.myId);
await B.waitForTimeout(800);
const silent = await B.evaluate((id) => window.app.voice.peerLevel(id), idA);
await A.evaluate(() => window.app.voice.setPtt(true));
const heard = await B.waitForFunction((id) => window.app.voice.peerLevel(id) > 0.02, idA, { timeout: 5000 }).then(() => true, () => false);
const level = await B.evaluate((id) => window.app.voice.peerLevel(id), idA);
await A.evaluate(() => window.app.voice.setPtt(false));
check('appuyer-pour-parler : silence au repos, voix reçue en appuyant', silent < 0.02 && heard && level > silent * 1.5, `repos=${silent.toFixed(3)} parole=${level.toFixed(3)}`);

// lancement
await B.click('#btn-ready');
await A.waitForFunction(() => window.app.lobby.members.every((m) => m.isHost || m.ready));
await A.screenshot({ path: `${OUT}/mp-lobby.png` });
await A.click('#btn-start');
await A.waitForSelector('#screen-game.active', { timeout: 8000 });
await B.waitForSelector('#screen-game.active', { timeout: 8000 });
check('la mission démarre chez les deux joueurs', true);
const seeds = await Promise.all([A, B].map((p) => p.evaluate(() => window.app.game.map.seed)));
check('même carte pour les deux', seeds[0] === seeds[1], String(seeds[0]));
await A.waitForTimeout(1000);
// B se déplace avec le joystick tactile
const idB = await B.evaluate(() => window.app.myId);
const before = await A.evaluate((id) => window.app.game.last.players.find((p) => p.id === id), idB);
const box = await B.locator('#joy-zone').boundingBox();
const sx = box.x + 80, sy = box.y + box.height - 80;
await B.touchscreen.tap(sx, sy).catch(() => {});
await B.evaluate(([x, y]) => {
  const z = document.getElementById('joy-zone');
  const ev = (type, cx, cy) => z.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch' }));
  ev('pointerdown', x, y); ev('pointermove', x + 40, y - 40);
  window.__joyUp = () => ev('pointerup', x + 40, y - 40);
}, [sx, sy]);
await B.waitForTimeout(1500);
await B.evaluate(() => window.__joyUp());
await A.waitForTimeout(600);
const after = await A.evaluate((id) => window.app.game.last.players.find((p) => p.id === id), idB);
const moved = Math.hypot(after.x - before.x, after.y - before.y);
check('déplacement au joystick tactile vu par l\'autre joueur', moved > 1, `${moved.toFixed(2)} cases`);
// la voix de A est entendue par les créatures (bruit côté serveur)
await B.evaluate(() => { window.__voiceNoises = 0; const g = window.app.game; const orig = g.onSnapshot.bind(g); g.onSnapshot = (s) => { for (const n of s.noises) if ((n.t === 'voice' || n.t === 'scream') && n.s !== window.app.myId) window.__voiceNoises++; orig(s); }; });
await A.evaluate(() => window.app.voice.setPtt(true));
await A.waitForTimeout(3500);
await A.evaluate(() => window.app.voice.setPtt(false));
const vn = await B.evaluate(() => window.__voiceNoises);
check('la voix réelle de A génère du bruit dans la simulation (les monstres entendent)', vn > 0, `${vn} bruits de voix`);
// interaction : A ouvre/ferme une porte ou ramasse → l'état change chez B
await A.screenshot({ path: `${OUT}/mp-game-A.png` });
await B.screenshot({ path: `${OUT}/mp-game-B-mobile.png` });
// déconnexion / reconnexion de B
await B.evaluate(() => window.app.transport.ws.close());
const botTook = await A.waitForFunction((id) => window.app.game.last.players.find((p) => p.id === id)?.bot === 1, idB, { timeout: 8000 }).then(() => true, () => false);
check('déconnexion : un bot prend le relais', botTook);
const back = await A.waitForFunction((id) => window.app.game.last.players.find((p) => p.id === id)?.bot === 0, idB, { timeout: 15000 }).then(() => true, () => false);
check('reconnexion automatique : le joueur récupère son personnage', back);
check('aucune erreur JavaScript', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
