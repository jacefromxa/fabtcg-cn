import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadZhTranslations } from '../../scripts/build-card-data.mjs';
import { mergeMachineDrafts, getT3BatchName, isT1GenericCard, isT2EquipmentCard, isHeroCard } from '../../scripts/build-translation-drafts.mjs';
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

test('human-reviewed entries never land in a machine batch file', () => {
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json') || file === 'human-reviewed.json') continue;
    const entries = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'));
    for (const [key, entry] of Object.entries(entries)) {
      assert.equal(entry.status, 'machine-draft', `${key} in ${file} should be machine-draft`);
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

test('the t3-other catch-all never captures Generic, Equipment or Hero cards', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  for (const card of cards) {
    if (getT3BatchName(card) !== 't3-other') continue;
    assert.ok(!card.types.includes('Generic'), `${card.name} should be t1, not t3-other`);
    assert.ok(!card.types.includes('Equipment'), `${card.name} should be t2, not t3-other`);
    assert.ok(!card.types.includes('Hero'), `${card.name} should live in heroes.json, not t3-other`);
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
    if (batch && batch !== 't3-other') return `${batch}.json`;
    return 't4-remaining.json'; // catch-all file
  };
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json') || file === 'human-reviewed.json') continue;
    const entries = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'));
    for (const [key, entry] of Object.entries(entries)) {
      const card = byName.get(entry.name_en);
      if (!card) continue;
      assert.equal(file, homeOf(card), `${entry.name_en} (${key}) should live in ${homeOf(card)}, not ${file}`);
    }
  }
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
  // Simulate an existing translated entry that the current filter would still match.
  const existing = {
    'concoct_disorder__1': { name_zh: '制造混乱', status: 'machine-draft' },
  };
  fs.writeFileSync(batchFile, JSON.stringify(existing));

  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  const chaos = cards.filter((c) => getT3BatchName(c) === 't3-chaos');
  const { result } = mergeMachineDrafts(existing, chaos, (c) => getT3BatchName(c) === 't3-chaos');

  assert.ok(result['concoct_disorder__1'], 'existing entry preserved');
  assert.equal(result['concoct_disorder__1'].name_zh, '制造混乱', 'existing name preserved');
});
