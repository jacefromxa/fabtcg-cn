import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadZhTranslations } from '../../scripts/build-card-data.mjs';
import { mergeMachineDrafts, mergeMissingDrafts, getT3BatchName, isT1GenericCard, isT2EquipmentCard, isHeroCard } from '../../scripts/build-translation-drafts.mjs';
import { slugifyCardName, loadGlossary } from '../../scripts/translate-helper.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const translationsDir = path.join(projectRoot, 'data/translations');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('loadZhTranslations merges every batch file and tracks each card batch', () => {
  const files = fs.readdirSync(translationsDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 20, `expected at least 20 batch files, got ${files.length}`);

  const { cards, cardBatch } = loadZhTranslations(translationsDir);
  const fileTotal = files.reduce(
    (sum, f) => sum + Object.keys(JSON.parse(fs.readFileSync(path.join(translationsDir, f), 'utf8'))).length,
    0,
  );
  assert.equal(Object.keys(cards).length, fileTotal);
  // Every card maps to the batch file that owns it.
  for (const batchName of Object.values(cardBatch)) {
    assert.ok(files.includes(`${batchName}.json`), `${batchName} should be a translation file`);
  }
});

test('loadZhTranslations throws on a duplicate key across files', () => {
  const dir = tempDir('fab-cn-dup-');
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ x: { a: 1 } }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ x: { a: 2 } }));
  assert.throws(() => loadZhTranslations(dir), /Duplicate card key/);
});

test('every translation file is parseable JSON', () => {
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json')) continue;
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8')),
      `${file} should parse`,
    );
  }
});

test('batch files carry only machine-draft or human-reviewed entries', () => {
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json')) continue;
    const entries = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'));
    for (const [key, entry] of Object.entries(entries)) {
      assert.ok(
        ['machine-draft', 'human-reviewed'].includes(entry.status),
        `${key} in ${file} has unexpected status ${entry.status}`,
      );
    }
  }
});

test('a T3 batch filter only yields cards assigned to that batch', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  for (const card of cards) {
    const batch = getT3BatchName(card);
    if (!batch) continue;
    const draft = mergeMachineDrafts({}, [card], (c) => getT3BatchName(c) === batch);
    assert.equal(draft.added, 1, `${card.name} should be added to its batch ${batch}`);
  }
});

test('every card in cards.json is assignable to a batch (no legality gating)', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const unassigned = cards.filter(
    (c) => !(isT1GenericCard(c) || isT2EquipmentCard(c) || getT3BatchName(c) || isHeroCard(c)),
  );
  assert.equal(unassigned.length, 0, 'all cards must have a batch home (heroes live in heroes.json)');
});

test('the t4-remaining catch-all never captures Generic, Equipment or Hero cards', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  for (const card of cards) {
    if (getT3BatchName(card) !== 't4-remaining') continue;
    assert.ok(!card.types.includes('Generic'), `${card.name} should be t1, not t4-remaining`);
    assert.ok(!card.types.includes('Equipment'), `${card.name} should be t2, not t4-remaining`);
    assert.ok(!card.types.includes('Hero'), `${card.name} should live in heroes.json, not t4-remaining`);
  }
});

test('Generic Equipment cards stay in the Generic batch instead of duplicating Equipment', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const overlaps = cards.filter((card) => card.types.includes('Generic') && card.types.includes('Equipment'));
  for (const card of overlaps) {
    assert.equal(isT1GenericCard(card), true, `${card.name} should be assigned to t1-generic`);
    assert.equal(isT2EquipmentCard(card), false, `${card.name} must not also be assigned to t2-equipment`);
  }
});

test('every card sits in the batch file its filter assigns (no cross-batch strays)', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const byName = new Map(cards.map((c) => [c.name, c]));
  const homeOf = (card) => {
    if (isHeroCard(card)) return 'heroes.json';
    if (isT1GenericCard(card)) return 't1-generic.json';
    if (isT2EquipmentCard(card)) return 't2-equipment.json';
    const batch = getT3BatchName(card);
    if (batch) return `${batch}.json`;
    return 't4-remaining.json'; // catch-all file
  };
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json')) continue;
    const entries = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'));
    for (const [key, entry] of Object.entries(entries)) {
      const card = byName.get(entry.name_en);
      if (!card) continue;
      assert.equal(file, homeOf(card), `${entry.name_en} (${key}) should live in ${homeOf(card)}, not ${file}`);
    }
  }
});

test('every card in cards.json is exhaustively present in its home batch file', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const homeOf = (card) => {
    if (isHeroCard(card)) return 'heroes.json';
    if (isT1GenericCard(card)) return 't1-generic.json';
    if (isT2EquipmentCard(card)) return 't2-equipment.json';
    const batch = getT3BatchName(card);
    if (batch) return `${batch}.json`;
    return 't4-remaining.json'; // catch-all file
  };
  // Index each batch file by the base slugs it holds (bare or __pitch variants).
  const baseByHome = new Map();
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json')) continue;
    const bases = new Set();
    for (const key of Object.keys(JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8')))) {
      bases.add(key.split('__')[0]);
    }
    baseByHome.set(file, bases);
  }
  const missing = [];
  for (const card of cards) {
    const base = slugifyCardName(card.name);
    if (!base) continue;
    const home = homeOf(card);
    const bases = baseByHome.get(home);
    if (!bases || !bases.has(base)) missing.push(`${card.name} (${base}) -> ${home}`);
  }
  assert.equal(missing.length, 0, `cards missing from their home batch:\n  ${missing.join('\n  ')}`);
});

test('loadGlossary flattens both string and structured keyword entries', () => {
  const flat = loadGlossary();
  assert.equal(flat['go again'], '再动');
  assert.equal(flat['dominate'], '支配');
  assert.equal(flat['ward'], '结界');
  assert.equal(flat['deck'], '牌库');
  // structured keyword entries must surface their name_zh, never "[object Object]"
  assert.ok(!Object.values(flat).some((v) => String(v).includes('[object')));
});

test('every glossary keyword entry carries a name and a description', () => {
  const glossary = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/glossary.zh-CN.json'), 'utf8'));
  for (const [keyword, entry] of Object.entries(glossary.keyword)) {
    assert.ok(entry && entry.name_zh, `${keyword} is missing name_zh`);
    assert.ok(entry && entry.desc_zh, `${keyword} is missing desc_zh`);
  }
});

test('every Hero card in cards.json is archived in heroes.json under its canonical slug', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const heroes = JSON.parse(fs.readFileSync(path.join(translationsDir, 'heroes.json'), 'utf8'));
  const expected = new Map();
  for (const card of cards) {
    if (!Array.isArray(card.types) || !card.types.includes('Hero')) continue;
    expected.set(slugifyCardName(card.name), card.name);
  }
  for (const [slug, name] of expected) {
    const entry = heroes[slug];
    assert.ok(entry, `missing hero entry: ${name} (${slug})`);
    assert.equal(entry.name_en, name, `${slug} should be keyed by slugifyCardName(${name})`);
    assert.ok(entry.name_zh, `${name} (${slug}) is missing a Chinese name`);
  }
  const extra = Object.keys(heroes).filter((slug) => !expected.has(slug));
  assert.equal(extra.length, 0, `heroes.json has entries that are not Hero cards: ${extra.join(', ')}`);
});

test('batch generator preserves existing entries when re-run (merge, not rebuild)', () => {
  const dir = tempDir('fab-cn-merge-');
  const batchFile = path.join(dir, 't3-chaos.json');
  // Simulate existing translated entries: a machine draft plus a confirmed one.
  // Both live in the batch file and re-running must preserve each untouched.
  const existing = {
    'concoct_disorder__1': { name_zh: '制造混乱', status: 'machine-draft' },
    'seed_of_agony__1': { name_zh: '痛楚之种', status: 'human-reviewed' },
  };
  fs.writeFileSync(batchFile, JSON.stringify(existing));

  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const chaos = cards.filter((c) => getT3BatchName(c) === 't3-chaos');
  const { result } = mergeMachineDrafts(existing, chaos, (c) => getT3BatchName(c) === 't3-chaos');

  assert.ok(result['concoct_disorder__1'], 'existing entry preserved');
  assert.equal(result['concoct_disorder__1'].name_zh, '制造混乱', 'existing name preserved');
  assert.ok(result['seed_of_agony__1'], 'human-reviewed entry preserved');
  assert.equal(result['seed_of_agony__1'].status, 'human-reviewed', 'confirmed status untouched');
});

test('missing-only batch generator never rewrites an existing entry', () => {
  const cards = [
    { name: 'Existing Machine Draft', pitch: '1', types: ['Generic'] },
    { name: 'Existing Human Translation', pitch: '2', types: ['Generic'] },
    { name: 'New Spoiler Card', pitch: '3', types: ['Generic'] },
  ];
  const existing = {
    existing_machine_draft__1: {
      name_en: 'Existing Machine Draft',
      name_zh: '旧机器草稿',
      text_zh: '保留这段正文',
      status: 'machine-draft',
      custom_marker: 'must-survive',
    },
    existing_human_translation__2: {
      name_en: 'Existing Human Translation',
      name_zh: '人工修订译名',
      status: 'human-reviewed',
    },
  };

  const before = JSON.parse(JSON.stringify(existing));
  const { result, added, skippedExisting } = mergeMissingDrafts(existing, cards, isT1GenericCard);

  assert.equal(added, 1, 'only the new spoiler card should be added');
  assert.equal(skippedExisting, 2, 'both existing entries should be skipped');
  assert.deepEqual(result.existing_machine_draft__1, before.existing_machine_draft__1);
  assert.deepEqual(result.existing_human_translation__2, before.existing_human_translation__2);
  assert.ok(result.new_spoiler_card__3, 'new spoiler card should receive a draft');
});
