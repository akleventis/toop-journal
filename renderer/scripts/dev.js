import * as esbuild from 'esbuild';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const dist = path.resolve(root, '../dist/renderer');

fs.mkdirSync(dist, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));

const ctx = await esbuild.context({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  outfile: path.join(dist, 'main.js'),
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
});

await ctx.watch();
await ctx.serve({ servedir: dist, port: 5173, host: '0.0.0.0' });
console.log('esbuild serving at http://localhost:5173');

const tw = spawn(
  path.join(root, 'node_modules/.bin/tailwindcss'),
  ['-i', path.join(root, 'src/index.css'), '-o', path.join(dist, 'index.css'), '--watch'],
  { cwd: root, stdio: 'inherit' },
);

process.on('SIGINT', () => { tw.kill(); ctx.dispose(); process.exit(0); });
process.on('SIGTERM', () => { tw.kill(); ctx.dispose(); process.exit(0); });
