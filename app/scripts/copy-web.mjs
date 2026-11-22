// Copies the web app (repo root) into app/www for Capacitor, adding Capacitor's runtime.
// The web app itself stays build-free; this is the only packaging step.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..'), root = join(app, '..'), www = join(app, 'www');
const files = readdirSync(root).filter(f => /\.(html|js|css|webmanifest)$/.test(f) && statSync(join(root, f)).isFile());
const dirs = ['icons', 'vendor'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of files) cpSync(join(root, f), join(www, f));
for (const d of dirs) cpSync(join(root, d), join(www, d), { recursive: true });
cpSync(join(app, 'node_modules/@capacitor/core/dist/capacitor.js'), join(www, 'capacitor.js'));

const idx = join(www, 'index.html');
const html = readFileSync(idx, 'utf8');
if (!html.includes('<script src="config.js">')) throw new Error('index.html: config.js script tag not found');
writeFileSync(idx, html.replace('<script src="config.js">', '<script src="capacitor.js"></script>\n<script src="config.js">'));
console.log(`Copied ${files.length} files + ${dirs.join(', ')} to www/`);
