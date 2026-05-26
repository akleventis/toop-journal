import * as esbuild from 'esbuild';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const dist = path.resolve(root, '../dist/renderer');

fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  outfile: path.join(dist, 'main.js'),
  platform: 'browser',
  minify: true,
  logLevel: 'info',
});

execFileSync(
  path.join(root, 'node_modules/.bin/tailwindcss'),
  ['-i', path.join(root, 'src/index.css'), '-o', path.join(dist, 'index.css'), '--minify'],
  { cwd: root, stdio: 'inherit' },
);
