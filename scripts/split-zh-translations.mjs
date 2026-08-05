import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isT1GenericCard, isT2EquipmentCard, getT3BatchName } from './build-translation-drafts.mjs';
import { slugifyCardName } from './translate-helper.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aggregatePath = path.join(projectRoot, 'data/cards.zh-CN.json');
const outputDir = path.join(projectRoot, 'data/translations');

// Build slug -> English cards index for batch assignment. A name can have
// several pitch entries (and pitches can differ in CC legality, e.g. a banned
// pitch 1 but legal pitch 3), so match the zh key's __pitch suffix exactly.
const englishCards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
const slugToCards = new Map();
for (const card of englishCards) {
  const slug = slugifyCardName(card.name);
  if (!slugToCards.has(slug)) slugToCards.set(slug, []);
  slugToCards.get(slug).push(card);
}

// Assign a zh entry to its per-batch file. Human-reviewed entries are always
// isolated in their own file so machine generation can never touch them.
function batchForEntry(key, entry) {
  if (entry.status !== 'machine-draft') return 'human-reviewed';
  const [base, pitchSuffix] = key.split('__');
  const cards = slugToCards.get(base);
  if (!cards || cards.length === 0) return 'other';

  const pitch = pitchSuffix ? String(pitchSuffix) : null;
  const exact = pitch
    ? cards.find((card) => String(card.pitch) === pitch)
    : cards.find((card) => card.pitch == null || card.pitch === '');
  const card = exact || cards[0];
  if (!card) return 'other';

  if (isT1GenericCard(card)) return 't1-generic';
  if (isT2EquipmentCard(card)) return 't2-equipment';
  const t3 = getT3BatchName(card);
  if (t3) return t3;
  return 'other';
}

export function splitTranslations(aggregatePathValue = aggregatePath, outputDirValue = outputDir) {
  const aggregate = JSON.parse(fs.readFileSync(aggregatePathValue, 'utf8'));
  const buckets = new Map();

  for (const [key, entry] of Object.entries(aggregate)) {
    const batch = batchForEntry(key, entry);
    if (!buckets.has(batch)) buckets.set(batch, {});
    buckets.get(batch)[key] = entry;
  }

  fs.mkdirSync(outputDirValue, { recursive: true });
  let total = 0;
  const written = [];
  for (const [batch, entries] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = path.join(outputDirValue, `${batch}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    written.push(`${batch}.json (${Object.keys(entries).length})`);
    total += Object.keys(entries).length;
  }

  return { written, total, aggregateCount: Object.keys(aggregate).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = splitTranslations();
  console.log(`Split ${result.aggregateCount} entries into ${result.written.length} files:`);
  for (const line of result.written) console.log('  ' + line);
  if (result.total !== result.aggregateCount) {
    console.error(`WARNING: wrote ${result.total} but source had ${result.aggregateCount}`);
    process.exit(1);
  }
}
