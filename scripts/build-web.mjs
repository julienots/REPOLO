// Assemble la version « statique » du jeu dans dist/ (pour l'application Android Capacitor
// ou un hébergement de fichiers statiques) : client/ + shared/.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(path.join(ROOT, 'client'), DIST, { recursive: true });
cpSync(path.join(ROOT, 'shared'), path.join(DIST, 'shared'), { recursive: true });
console.log('Version statique prête dans', DIST);
