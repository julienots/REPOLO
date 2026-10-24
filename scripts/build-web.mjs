// Assemble la version « statique » du jeu dans dist/ (pour l'application Android Capacitor
// ou un hébergement de fichiers statiques) : client/ + shared/ + Three.js.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(path.join(ROOT, 'client'), DIST, { recursive: true });
cpSync(path.join(ROOT, 'shared'), path.join(DIST, 'shared'), { recursive: true });
const three = path.join(ROOT, 'node_modules', 'three');
if (existsSync(three)) {
  cpSync(path.join(three, 'build', 'three.module.js'), path.join(DIST, 'vendor', 'three', 'build', 'three.module.js'));
  // seuls les modules complémentaires utilisés par le rendu 3D (post-traitement, shaders, utilitaires)
  for (const sub of ['postprocessing', 'shaders', 'utils', 'math', 'geometries']) {
    cpSync(path.join(three, 'examples', 'jsm', sub), path.join(DIST, 'vendor', 'three', 'examples', 'jsm', sub), { recursive: true });
  }
}
console.log('Version statique prête dans', DIST);
