#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const usage = () => {
  console.log('Usage: node tools/print-staff-creds.mjs [path-to-enrollment-json]');
  console.log('If no path is provided the script will try tools/sample-enrollment.json');
};

const normalizeLoginToken = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildDefaultCredentials = (entry) => {
  const surnameToken = normalizeLoginToken(entry.surname).slice(0, 16) || 'staff';
  const firstToken = normalizeLoginToken(entry.firstName || '');
  const initialsToken = normalizeLoginToken(entry.initials || '');
  const firstInitial = (firstToken.charAt(0) || initialsToken.charAt(0) || 'x').toLowerCase();
  const handle = `${surnameToken}${firstInitial}`.slice(0, 24);
  return { email: `${handle}@bhanoyi.education`, password: handle };
};

const fileArg = process.argv[2] || 'tools/sample-enrollment.json';
const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  usage();
  process.exit(2);
}

let raw;
try {
  raw = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  console.error('Could not read file:', err.message || err);
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error('Invalid JSON:', err.message || err);
  process.exit(2);
}

const staffMembers = Array.isArray(parsed.staffMembers) ? parsed.staffMembers : Array.isArray(parsed) ? parsed : [];
if (!staffMembers.length) {
  console.error('No staffMembers array found in the provided JSON.');
  process.exit(1);
}

const results = staffMembers.map((entry, idx) => {
  const defaults = buildDefaultCredentials(entry || {});
  const loginEmail = String((entry && (entry.loginEmail || entry.staffEmail)) || defaults.email).trim().toLowerCase();
  const loginPassword = String((entry && entry.loginPassword) || defaults.password);
  const name = String((entry && (entry.displayName || entry.name || `${entry.firstName || ''} ${entry.surname || ''}`)) || '').trim();
  return { index: idx, name, loginEmail, loginPassword };
});

console.log(JSON.stringify(results, null, 2));
// also a short table
console.log('\nCredentials:');
results.forEach((r) => console.log(`${r.index}\t${r.name || '-'}\t${r.loginEmail}\t${r.loginPassword}`));
