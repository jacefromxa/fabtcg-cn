import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateCard, slugifyCardName } from './translate-helper.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'data/source/english/card.json');
const translationsDir = path.join(projectRoot, 'data/translations');

// --- Batch filters ----------------------------------------------------------
// This tool translates cards; it does not judge format legality. Batches are
// assigned purely by card type / class / talent, so every card (whatever its
// CC/Blitz/LL status) has a home and can be translated.

// Heroes are managed in their own data/translations/heroes.json and must never
// be drafted into a class / generic / equipment batch. scripts/consolidate-
// heroes.mjs keeps that archive in sync with the English source; re-running a
// batch must not resurrect hero cards into the batch files.
export function isHeroCard(card) {
  return Boolean(Array.isArray(card.types) && card.types.includes('Hero'));
}

// T1: Generic cards. Playable in any deck regardless of hero.
export function isT1GenericCard(card) {
  return !isHeroCard(card)
    && Boolean(Array.isArray(card.types) && card.types.includes('Generic'));
}

// T2: Equipment and weapons. High reuse across heroes.
export function isT2EquipmentCard(card) {
  return !isHeroCard(card)
    && Boolean(Array.isArray(card.types) && card.types.includes('Equipment'));
}

// Batch names double as the per-batch translation file name (minus .json), so
// they must match the buckets produced by scripts/split-zh-translations.mjs.
export const BATCH_FILTERS = {
  't1-generic': isT1GenericCard,
  't2-equipment': isT2EquipmentCard,
  't4-remaining': isT4RemainingCard,
};

// --- T3: class / talent cards -----------------------------------------------
// Assigned by priority order: a card with several class tags goes to the first
// matching batch. Elemental batches only receive cards not captured by a class,
// so each T3 card maps to exactly one batch.
const T3_BATCHES = [
  { name: 't3-warrior',       tags: ['Warrior'] },
  { name: 't3-guardian',      tags: ['Guardian'] },
  { name: 't3-mechanologist', tags: ['Mechanologist'] },
  { name: 't3-runeblade',     tags: ['Runeblade'] },
  { name: 't3-brute',         tags: ['Brute'] },
  { name: 't3-ninja',         tags: ['Ninja'] },
  { name: 't3-illusionist',   tags: ['Illusionist'] },
  { name: 't3-assassin',      tags: ['Assassin'] },
  { name: 't3-wizard',        tags: ['Wizard'] },
  { name: 't3-ranger',        tags: ['Ranger'] },
  { name: 't3-draconic',      tags: ['Draconic'] },
  { name: 't3-pirate',        tags: ['Pirate', 'Necromancer'] },
  { name: 't3-bard-merchant', tags: ['Bard', 'Merchant'] },
  { name: 't3-revered',       tags: ['Revered'] },
  { name: 't3-reviled',       tags: ['Reviled'] },
  { name: 't3-lightning',     tags: ['Lightning'] },
  { name: 't3-light',         tags: ['Light'] },
  { name: 't3-shadow',        tags: ['Shadow'] },
  { name: 't3-mystic',        tags: ['Mystic'] },
  { name: 't3-earth-ice-elem', tags: ['Earth', 'Ice', 'Elemental'] },
  { name: 't3-chaos',         tags: ['Chaos'] },
];

export function getT3BatchName(card) {
  if (!Array.isArray(card.types)) return 't3-other';
  // Heroes and Generic/Equipment cards are handled by their own batches.
  if (card.types.includes('Hero') || card.types.includes('Generic') || card.types.includes('Equipment')) return null;
  for (const batch of T3_BATCHES) {
    if (batch.tags.some((tag) => card.types.includes(tag))) return batch.name;
  }
  // Catch-all: every remaining card (Event, Adjudicator, Macro, token-only, …)
  // still gets a home so the whole cards.json pool is translatable.
  return 't3-other';
}

export function isT3Batch(batchName) {
  return batchName.startsWith('t3-');
}

// T4: Catch-all for every remaining card not yet covered by T1-T3. Blindly
// translates all unmatched cards regardless of legality (Young heroes, Events,
// Blitz-only, etc.). Hero cards stay out of T4 too — they live in heroes.json.
export function isT4RemainingCard(card) {
  return !isHeroCard(card)
    && !isT1GenericCard(card)
    && !isT2EquipmentCard(card)
    && !getT3BatchName(card);
}

// --- Merging ----------------------------------------------------------------

// Collapse the pitch variants of one card name into the __1/__2/__3 keys the
// zh-CN source format expects.
function buildEntryKey(card) {
  const base = slugifyCardName(card.name);
  if (!base) return null;
  const pitch = card.pitch;
  if (pitch == null || pitch === '') return base;
  return `${base}__${pitch}`;
}

export function mergeMachineDrafts(existingZh, englishCards, filter) {
  const result = { ...existingZh };
  let added = 0;
  let skippedExisting = 0;

  for (const card of englishCards) {
    if (!filter(card)) continue;
    const key = buildEntryKey(card);
    if (!key) continue;
    if (result[key] && result[key].status && result[key].status !== 'machine-draft') {
      // Keep human-reviewed or deck-reviewed translations untouched.
      skippedExisting++;
      continue;
    }
    const draft = translateCard(card);
    // Preserve already-translated fields (name_zh / text_zh) so re-running a
    // later batch for overlapping filters never wipes finished work.
    if (result[key]) {
      if (result[key].name_zh) draft.name_zh = result[key].name_zh;
      if (result[key].text_zh) draft.text_zh = result[key].text_zh;
    }
    result[key] = draft;
    added++;
  }

  return { result, added, skippedExisting };
}

// --- CLI --------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const batchName = process.argv[2] || 't1-generic';
  let filter = BATCH_FILTERS[batchName];

  if (!filter && isT3Batch(batchName)) {
    const target = batchName;
    filter = (card) => getT3BatchName(card) === target;
  }

  if (!filter) {
    console.error(`Unknown batch "${batchName}".`);
    console.error(`T1/T2: ${Object.keys(BATCH_FILTERS).join(', ')}`);
    console.error(`T3: ${T3_BATCHES.map((b) => b.name).join(', ')}`);
    process.exit(1);
  }

  const englishCards = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

  // Translation source is managed per batch: each batch writes to its own file
  // under data/translations/. Merge into the EXISTING batch file (never rebuild
  // it from scratch) so entries already in the file — even ones a future filter
  // no longer re-matches — are preserved. New drafts for filter-matching cards
  // are added on top.
  const humanReviewedFile = path.join(translationsDir, 'human-reviewed.json');
  // Human entries use bare keys (e.g. "command_and_conquer") while the machine
  // generator emits "__pitch" suffixed keys, so a machine draft only duplicates
  // a human card when the SAME pitch is already covered. Exclude by base slug
  // + pitch, never by base slug alone (a human pitch-1 card must not suppress
  // the legitimate pitch-2 / pitch-3 machine drafts).
  const humanPitches = new Set(
    fs.existsSync(humanReviewedFile)
      ? Object.entries(JSON.parse(fs.readFileSync(humanReviewedFile, 'utf8'))).map(([key, entry]) => {
          const base = key.split('__')[0];
          const pitch = entry.pitch == null || entry.pitch === '' ? '' : String(entry.pitch);
          return `${base}::${pitch}`;
        })
      : [],
  );

  fs.mkdirSync(translationsDir, { recursive: true });
  const batchFile = path.join(translationsDir, `${batchName}.json`);
  const existingBatch = fs.existsSync(batchFile)
    ? JSON.parse(fs.readFileSync(batchFile, 'utf8'))
    : {};

  const { result, added, skippedExisting } = mergeMachineDrafts(existingBatch, englishCards, filter);

  const batchEntries = {};
  for (const [key, entry] of Object.entries(result)) {
    const [base, pitchSuffix] = key.split('__');
    const pitch = pitchSuffix || '';
    if (humanPitches.has(`${base}::${pitch}`)) continue; // redundant human duplicate
    batchEntries[key] = entry;
  }

  fs.writeFileSync(batchFile, `${JSON.stringify(batchEntries, null, 2)}\n`, 'utf8');
  console.log(`Merged batch "${batchName}" machine drafts into ${batchFile}`);
  console.log(`  added: ${added}`);
  console.log(`  kept human entries: ${skippedExisting}`);
  console.log(`  total entries in batch file: ${Object.keys(batchEntries).length}`);
}
