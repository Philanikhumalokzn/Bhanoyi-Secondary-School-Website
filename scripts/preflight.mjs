import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadEnvFile('.env.local');

const requiredFiles = ['package.json', 'vite.config.js', 'tsconfig.json', '.env.local'];
const missingFiles = requiredFiles.filter((file) => !existsSync(file));

if (missingFiles.length > 0) {
  console.error('Missing required files:', missingFiles.join(', '));
  process.exit(1);
}

const env = process.env;
const requiredEnv = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ADMIN_EMAILS'];
const missingEnv = requiredEnv.filter((key) => !env[key]);

if (missingEnv.length > 0) {
  console.error('Missing environment values:', missingEnv.join(', '));
  console.error('Tip: set these values in .env.local');
  process.exit(1);
}

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log('Running typecheck...');
run('npm.cmd', ['run', 'typecheck']);

console.log('Running build...');
run('npm.cmd', ['run', 'build']);

console.log('Preflight passed.');
