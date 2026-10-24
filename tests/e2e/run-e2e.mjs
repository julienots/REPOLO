// Lance le serveur sur un port libre puis exécute les tests navigateur (Playwright/Chromium).
// Usage : npm run test:e2e
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../test-results');
mkdirSync(out, { recursive: true });
process.env.QUIET = '1';
const srv = await startServer({ port: 0, host: '127.0.0.1', https: false });
const env = { ...process.env, BASE: `http://localhost:${srv.port}`, OUT: out };
let failed = 0;
for (const file of ['smoke.mjs', 'multiplayer.mjs', 'solo-full.mjs']) {
  console.log(`\n=== ${file} ===`);
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(here, file)], { env, stdio: 'inherit' });
    p.on('exit', resolve);
  });
  if (code !== 0) { failed++; console.log(`✖ ${file} a échoué (code ${code})`); } else console.log(`✔ ${file}`);
}
srv.close();
console.log(`\nCaptures d'écran : ${out}`);
process.exit(failed ? 1 : 0);
