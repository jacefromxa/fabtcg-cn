import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getT3BatchName, isT1GenericCard, isT2EquipmentCard, isHeroCard } from './build-translation-drafts.mjs';

// One-off migration (2026-08-05): data/translations/t4-remaining.json had
// accumulated 85 card entries that belong to a specific T1/T2/T3 batch. Move
// them into their proper batch file, so every batch file only contains cards
// that its filter actually assigns, and t4-remaining holds only the genuine
// catch-all cards (Event / Adjudicator / Macro / special formats).
//
// Idempotent: re-running moves nothing.
//
// Run: node scripts/consolidate-t4.mjs

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const translationsDir = path.join(projectRoot, 'data/translations');
const t4File = path.join(translationsDir, 't4-remaining.json');
const sourcePath = path.join(projectRoot, 'data/source/english/card.json');

const englishCards = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const byName = new Map(englishCards.map((c) => [c.name, c]));

// Proper batch file for a card, or null to stay in t4-remaining.json.
function properHome(card) {
  if (isHeroCard(card)) return 'heroes.json';
  if (isT1GenericCard(card)) return 't1-generic.json';
  if (isT2EquipmentCard(card)) return 't2-equipment.json';
  const batch = getT3BatchName(card);
  if (batch && batch !== 't3-other') return `${batch}.json`;
  return null; // genuine catch-all -> stays in t4-remaining.json
}

const t4 = JSON.parse(fs.readFileSync(t4File, 'utf8'));
const byTarget = new Map();
let moved = 0;
let stayed = 0;
let unresolved = 0;

for (const [key, entry] of Object.entries(t4)) {
  const card = byName.get(entry.name_en);
  if (!card) {
    unresolved++; // no English source record -> leave untouched
    continue;
  }
  const home = properHome(card);
  if (!home) {
    stayed++;
    continue;
  }
  if (!byTarget.has(home)) byTarget.set(home, {});
  byTarget.get(home)[key] = entry;
  delete t4[key];
  moved++;
}

for (const [home, entries] of byTarget) {
  const filePath = path.join(translationsDir, home);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let collisions = 0;
  for (const [key, entry] of Object.entries(entries)) {
    if (existing[key]) {
      collisions++;
      console.warn(`  collision: ${key} already in ${home}, keeping existing`);
      continue;
    }
    existing[key] = entry;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  console.log(`  ${home}: +${Object.keys(entries).length - collisions} moved`);
}

fs.writeFileSync(t4File, `${JSON.stringify(t4, null, 2)}\n`, 'utf8');
console.log(`t4-remaining.json: moved=${moved} stayed=${stayed} unresolved=${unresolved} remaining=${Object.keys(t4).length}`);

// Verify placement consistency across every batch file.
const files = fs.readdirSync(translationsDir).filter((f) => f.endsWith('.json') && f !== 'human-reviewed.json');
let wrong = [];
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(translationsDir, f), 'utf8'));
  for (const [key, entry] of Object.entries(data)) {
    const card = byName.get(entry.name_en);
    if (!card) continue;
    const home = properHome(card) || 't4-remaining.json';
    if (home !== f) wrong.push(`${entry.name_en} (${key}) is in ${f}, should be ${home}`);
  }
}
if (wrong.length) {
  console.error('placement inconsistencies remaining:');
  for (const w of wrong) console.error('  ', w);
  process.exit(1);
}
console.log('  ✓ every card sits in its proper batch file (t4-remaining holds only the catch-all)');
