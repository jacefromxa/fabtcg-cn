import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugifyCardName } from './translate-helper.mjs';

// One-off consolidation (2026-08-05): every Hero-typed card in data/source/
// english/card.json must live in data/translations/heroes.json under its
// canonical slugifyCardName(name) key, grouped so same-base heroes sit
// together. Any hero card found in a t1/t2/t3/t4 batch file is moved out.
//
// The batch generator (build-translation-drafts.mjs) excludes Hero cards, so
// re-running batches never resurrects heroes into the class files.
//
// Run: node scripts/consolidate-heroes.mjs

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'data/source/english/card.json');
const translationsDir = path.join(projectRoot, 'data/translations');
const heroesFile = path.join(translationsDir, 'heroes.json');

const englishCards = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// Canonical slug -> English hero card.
const heroBySlug = new Map();
for (const card of englishCards) {
  if (Array.isArray(card.types) && card.types.includes('Hero')) {
    heroBySlug.set(slugifyCardName(card.name), card);
  }
}

const heroes = JSON.parse(fs.readFileSync(heroesFile, 'utf8'));

// Order fields like the existing hand-curated heroes.json entries.
function normalizeHeroEntry(entry, heroCard, slug) {
  return {
    name_zh: entry.name_zh || '',
    name_en: entry.name_en || heroCard.name,
    type_zh: '', // heroes.json convention: type shown via type_en only
    type_en: entry.type_en || heroCard.type_text || '',
    text_zh: entry.text_zh || '',
    text_en: entry.text_en || heroCard.functional_text_plain || '',
    pitch: entry.pitch ?? null,
    cost: entry.cost ?? null,
    power: entry.power ?? null,
    defense: entry.defense ?? null,
    source: entry.source || `https://cards.fabtcg.com/card/${slug}/`,
    status: entry.status || 'machine-draft',
  };
}

// 1. Rename non-canonical keys in heroes.json itself. Only known case:
//    "jarl_vetreii" (official fabtcg URL slug) -> "jarl_vetrei_i"
//    (slugifyCardName output used by the alias table / userscript).
let renamed = 0;
for (const [key, entry] of Object.entries(heroes)) {
  const expected = slugifyCardName(entry.name_en);
  if (expected && expected !== key) {
    if (heroes[expected]) {
      console.warn(`  collision: keep existing ${expected}, drop ${key} (${entry.name_en})`);
      delete heroes[key];
    } else {
      heroes[expected] = entry;
      delete heroes[key];
    }
    renamed++;
  }
}

// 2. Move hero entries out of every non-heroes batch file.
let moved = 0;
for (const file of fs.readdirSync(translationsDir).filter((f) => f.endsWith('.json') && f !== 'heroes.json').sort()) {
  const filePath = path.join(translationsDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;
  for (const [key, entry] of Object.entries(data)) {
    const base = key.split('__')[0];
    const heroCard = heroBySlug.get(base);
    if (!heroCard) continue;
    if (heroes[base]) {
      console.warn(`  duplicate ${base} already in heroes.json, keeping existing (from ${file})`);
      delete data[key];
    } else {
      heroes[base] = normalizeHeroEntry(entry, heroCard, base);
      delete data[key];
    }
    moved++;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    console.log(`  removed hero entries from ${file}`);
  }
}

// 3. Add any hero card still missing from heroes.json (Ruu'di, Gem Keeper).
let added = 0;
for (const [slug, card] of heroBySlug) {
  if (heroes[slug]) continue;
  heroes[slug] = normalizeHeroEntry({}, card, slug);
  added++;
}

// 4. Sort by key so same-base heroes are grouped together.
const sorted = {};
for (const key of Object.keys(heroes).sort()) sorted[key] = heroes[key];
fs.writeFileSync(heroesFile, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

// 5. Verify: every hero card has exactly one entry under its canonical slug.
const missing = [...heroBySlug.keys()].filter((slug) => !heroes[slug]);
const extraneous = Object.keys(heroes).filter((slug) => !heroBySlug.has(slug));
console.log(`heroes.json: renamed=${renamed} moved=${moved} added=${added} total=${Object.keys(sorted).length}`);
if (missing.length) console.error(`  MISSING hero slugs: ${missing.join(', ')}`);
if (extraneous.length) console.error(`  EXTRA non-hero keys: ${extraneous.join(', ')}`);
if (missing.length || extraneous.length) process.exit(1);
console.log('  ✓ every Hero card in cards.json is archived in heroes.json under its canonical slug');
