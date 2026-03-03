import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve('assets/content/site-content.json');
const targetPath = resolve('public/content/site-content.json');

if (!existsSync(sourcePath)) {
  console.error(`Source content file not found: ${sourcePath}`);
  process.exit(1);
}

const source = readFileSync(sourcePath, 'utf8');
const target = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;

if (target === source) {
  console.log('Content already in sync.');
  process.exit(0);
}

mkdirSync(dirname(targetPath), { recursive: true });
copyFileSync(sourcePath, targetPath);
console.log('Synced content: assets/content/site-content.json -> public/content/site-content.json');