import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve('assets/content/site-content.json');
const targetPath = resolve('public/content/site-content.json');

if (!existsSync(sourcePath)) {
  console.error(`Source content file not found: ${sourcePath}`);
  process.exit(1);
}

const source = readFileSync(sourcePath, 'utf8');
const target = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null;

const readJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const findLeagueStandingsSection = (data) => {
  const sections = data?.pages?.sports?.sections;
  if (!Array.isArray(sections)) return null;
  return sections.find((section) => section?.type === 'league-standings') || null;
};

const standingsSignature = (section) => {
  if (!section || typeof section !== 'object') return '';
  return JSON.stringify({
    title: section.title || '',
    subtitle: section.subtitle || '',
    sortNote: section.sortNote || '',
    items: Array.isArray(section.items) ? section.items : []
  });
};

const formatToday = () =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

const sourceData = readJson(source);
const targetData = target ? readJson(target) : null;

let outputText = source;

if (sourceData) {
  const sourceStandings = findLeagueStandingsSection(sourceData);
  const targetStandings = targetData ? findLeagueStandingsSection(targetData) : null;

  if (sourceStandings) {
    const sourceSig = standingsSignature(sourceStandings);
    const targetSig = standingsSignature(targetStandings);

    if (!targetStandings || sourceSig !== targetSig) {
      sourceStandings.lastUpdated = formatToday();
    } else if (typeof targetStandings.lastUpdated === 'string' && targetStandings.lastUpdated.trim()) {
      sourceStandings.lastUpdated = targetStandings.lastUpdated;
    }

    outputText = `${JSON.stringify(sourceData, null, 2)}\n`;
  }
}

if (target === outputText) {
  console.log('Content already in sync.');
  process.exit(0);
}

mkdirSync(dirname(targetPath), { recursive: true });
if (outputText === source) {
  copyFileSync(sourcePath, targetPath);
} else {
  writeFileSync(targetPath, outputText, 'utf8');
}
console.log('Synced content: assets/content/site-content.json -> public/content/site-content.json');