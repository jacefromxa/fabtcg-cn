import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadZhTranslations } from '../../scripts/build-card-data.mjs';
import { mergeMachineDrafts, getT3BatchName, isT1GenericCard, isT2EquipmentCard } from '../../scripts/build-translation-drafts.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const translationsDir = path.join(projectRoot, 'data/translations');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('loadZhTranslations merges every batch file into one card map', () => {
  const files = fs.readdirSync(translationsDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 20, `expected at least 20 batch files, got ${files.length}`);

  const merged = loadZhTranslations(translationsDir);
  const fileTotal = files.reduce(
    (sum, f) => sum + Object.keys(JSON.parse(fs.readFileSync(path.join(translationsDir, f), 'utf8'))).length,
    0,
  );
  assert.equal(Object.keys(merged).length, fileTotal);
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
    (c) => !(isT1GenericCard(c) || isT2EquipmentCard(c) || getT3BatchName(c)),
  );
  assert.equal(unassigned.length, 0, 'all cards must have a batch home');
});

test('the t3-other catch-all never captures Generic or Equipment cards', () => {
  const cards = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'));
  for (const card of cards) {
    if (getT3BatchName(card) !== 't3-other') continue;
    assert.ok(!card.types.includes('Generic'), `${card.name} should be t1, not t3-other`);
    assert.ok(!card.types.includes('Equipment'), `${card.name} should be t2, not t3-other`);
  }
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
