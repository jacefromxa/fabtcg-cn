import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ReviewApplyError,
  applySubmissionFile,
} from '../../scripts/apply-translation-submissions.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture() {
  const root = tempDir('fab-cn-review-apply-');
  const translationsDir = path.join(root, 'translations');
  const pendingDir = path.join(root, 'pending');
  const processedDir = path.join(root, 'processed');
  fs.mkdirSync(translationsDir, { recursive: true });
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.mkdirSync(processedDir, { recursive: true });
  const guardian = {
    boulder_drop__1: {
      name_en: 'Boulder Drop', name_zh: '巨石一击', text_zh: '粉碎一。',
      pitch: '1', cost: '3', power: '7', defense: '3', status: 'machine-draft', extra: 'keep',
    },
    boulder_drop__2: {
      name_en: 'Boulder Drop', name_zh: '巨石二击', text_zh: '粉碎二。',
      pitch: '2', cost: '3', power: '6', defense: '3', status: 'human-reviewed', extra: 'keep',
    },
  };
  const warrior = {
    tiger_tilt__1: {
      name_en: 'Tiger Tilt', name_zh: '虎倾', text_zh: '猛击。',
      pitch: '1', cost: '0', power: '4', defense: '3', status: 'machine-draft',
    },
  };
  fs.writeFileSync(path.join(translationsDir, 't3-guardian.json'), `${JSON.stringify(guardian, null, 2)}\n`);
  fs.writeFileSync(path.join(translationsDir, 't3-warrior.json'), `${JSON.stringify(warrior, null, 2)}\n`);
  return { root, translationsDir, pendingDir, processedDir, guardian, warrior };
}

function writeSubmission(pendingDir, changes) {
  const filePath = path.join(pendingDir, 'submission-test.json');
  fs.writeFileSync(filePath, `${JSON.stringify({
    schema_version: 1,
    submission_id: 'submission-test',
    submitted_at: '2026-08-08T12:00:00.000Z',
    changes,
  }, null, 2)}\n`);
  return filePath;
}

test('applies all pitch changes while preserving every non-name field', () => {
  const env = fixture();
  const original = JSON.parse(fs.readFileSync(path.join(env.translationsDir, 't3-guardian.json')));
  const queuePath = writeSubmission(env.pendingDir, [{
    card_id: 'boulder_drop',
    batch: 't3-guardian',
    name_en: 'Boulder Drop',
    new_name_zh: '巨石坠击',
    variants: [
      { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
      { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
    ],
  }]);

  const result = applySubmissionFile(queuePath, {
    translationsDir: env.translationsDir,
    processedDir: env.processedDir,
    now: () => new Date('2026-08-08T13:00:00.000Z'),
  });
  const updated = JSON.parse(fs.readFileSync(path.join(env.translationsDir, 't3-guardian.json')));

  assert.equal(result.cardCount, 1);
  assert.equal(result.variantCount, 2);
  assert.equal(updated.boulder_drop__1.name_zh, '巨石坠击');
  assert.equal(updated.boulder_drop__2.name_zh, '巨石坠击');
  for (const key of Object.keys(original.boulder_drop__1)) {
    if (key === 'name_zh') continue;
    assert.deepEqual(updated.boulder_drop__1[key], original.boulder_drop__1[key], key);
  }
  for (const key of Object.keys(original.boulder_drop__2)) {
    if (key === 'name_zh') continue;
    assert.deepEqual(updated.boulder_drop__2[key], original.boulder_drop__2[key], key);
  }
  assert.equal(fs.existsSync(queuePath), false);
  assert.equal(fs.existsSync(result.processedPath), true);
  assert.equal(JSON.parse(fs.readFileSync(result.processedPath)).processed_at, '2026-08-08T13:00:00.000Z');
});

test('applies a submission spanning multiple batches after validating all changes', () => {
  const env = fixture();
  const queuePath = writeSubmission(env.pendingDir, [
    {
      card_id: 'boulder_drop',
      batch: 't3-guardian',
      name_en: 'Boulder Drop',
      new_name_zh: '巨石坠击',
      variants: [
        { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
        { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
      ],
    },
    {
      card_id: 'tiger_tilt',
      batch: 't3-warrior',
      name_en: 'Tiger Tilt',
      new_name_zh: '虎倾斩',
      variants: [{ key: 'tiger_tilt__1', current_name_zh: '虎倾' }],
    },
  ]);

  const result = applySubmissionFile(queuePath, {
    translationsDir: env.translationsDir,
    processedDir: env.processedDir,
  });
  const guardian = JSON.parse(fs.readFileSync(path.join(env.translationsDir, 't3-guardian.json')));
  const warrior = JSON.parse(fs.readFileSync(path.join(env.translationsDir, 't3-warrior.json')));

  assert.equal(result.cardCount, 2);
  assert.equal(guardian.boulder_drop__1.name_zh, '巨石坠击');
  assert.equal(warrior.tiger_tilt__1.name_zh, '虎倾斩');
});

test('accepts an idempotent resubmission when the requested name is already applied', () => {
  const env = fixture();
  const guardianPath = path.join(env.translationsDir, 't3-guardian.json');
  const guardian = JSON.parse(fs.readFileSync(guardianPath));
  guardian.boulder_drop__1.name_zh = '巨石坠击';
  guardian.boulder_drop__2.name_zh = '巨石坠击';
  fs.writeFileSync(guardianPath, `${JSON.stringify(guardian, null, 2)}\n`);
  const queuePath = writeSubmission(env.pendingDir, [{
    card_id: 'boulder_drop',
    batch: 't3-guardian',
    name_en: 'Boulder Drop',
    new_name_zh: '巨石坠击',
    variants: [
      { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
      { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
    ],
  }]);

  const result = applySubmissionFile(queuePath, {
    translationsDir: env.translationsDir,
    processedDir: env.processedDir,
  });

  assert.equal(result.cardCount, 1);
  assert.equal(result.propagatedCount, 0);
  assert.equal(fs.existsSync(result.processedPath), true);
});

test('aligns matching card names in rules text without changing unrelated text', () => {
  const env = fixture();
  const warriorPath = path.join(env.translationsDir, 't3-warrior.json');
  const warrior = JSON.parse(fs.readFileSync(warriorPath));
  warrior.tiger_tilt__1.text_en = 'When you defend with Boulder Drop, gain 1.';
  warrior.tiger_tilt__1.text_zh = '当你以巨石一击防御时，获得1点。';
  warrior.unrelated_english__1 = {
    name_en: 'Unrelated English', name_zh: '无关牌',
    text_en: 'When you defend with Boulder Drop, gain 1.',
    text_zh: '当你防御时，获得1点。',
    pitch: '1', cost: '0', power: '2', defense: '3',
  };
  warrior.unrelated_chinese__1 = {
    name_en: 'Unrelated Chinese', name_zh: '无关牌',
    text_en: 'When you defend with Tiger Tilt, gain 1.',
    text_zh: '当你以巨石一击防御时，获得1点。',
    pitch: '1', cost: '0', power: '2', defense: '3',
  };
  fs.writeFileSync(warriorPath, `${JSON.stringify(warrior, null, 2)}\n`);
  const queuePath = writeSubmission(env.pendingDir, [{
    card_id: 'boulder_drop',
    batch: 't3-guardian',
    name_en: 'Boulder Drop',
    new_name_zh: '巨石坠击',
    variants: [
      { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
      { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
    ],
  }]);

  const result = applySubmissionFile(queuePath, {
    translationsDir: env.translationsDir,
    processedDir: env.processedDir,
  });
  const updatedWarrior = JSON.parse(fs.readFileSync(warriorPath));

  assert.equal(result.propagatedCount, 1);
  assert.equal(updatedWarrior.tiger_tilt__1.text_zh, '当你以巨石坠击防御时，获得1点。');
  assert.equal(updatedWarrior.unrelated_english__1.text_zh, '当你防御时，获得1点。');
  assert.equal(updatedWarrior.unrelated_chinese__1.text_zh, '当你以巨石一击防御时，获得1点。');
});

test('rejects a stale snapshot without changing any batch or moving the queue file', () => {
  const env = fixture();
  const guardianPath = path.join(env.translationsDir, 't3-guardian.json');
  const warriorPath = path.join(env.translationsDir, 't3-warrior.json');
  const guardianBefore = fs.readFileSync(guardianPath, 'utf8');
  const warriorBefore = fs.readFileSync(warriorPath, 'utf8');
  const queuePath = writeSubmission(env.pendingDir, [
    {
      card_id: 'boulder_drop',
      batch: 't3-guardian',
      name_en: 'Boulder Drop',
      new_name_zh: '巨石坠击',
      variants: [
        { key: 'boulder_drop__1', current_name_zh: '巨石一击' },
        { key: 'boulder_drop__2', current_name_zh: '巨石二击' },
      ],
    },
    {
      card_id: 'tiger_tilt',
      batch: 't3-warrior',
      name_en: 'Tiger Tilt',
      new_name_zh: '虎倾斩',
      variants: [{ key: 'tiger_tilt__1', current_name_zh: '已经被改' }],
    },
  ]);
  const warrior = JSON.parse(warriorBefore);
  warrior.tiger_tilt__1.name_zh = '其他修改';
  fs.writeFileSync(warriorPath, `${JSON.stringify(warrior, null, 2)}\n`);

  assert.throws(
    () => applySubmissionFile(queuePath, {
      translationsDir: env.translationsDir,
      processedDir: env.processedDir,
    }),
    (error) => error instanceof ReviewApplyError && error.details.some((detail) => detail.card_id === 'tiger_tilt'),
  );
  assert.equal(fs.readFileSync(guardianPath, 'utf8'), guardianBefore);
  assert.notEqual(fs.readFileSync(warriorPath, 'utf8'), warriorBefore);
  assert.equal(fs.existsSync(queuePath), true);
  assert.equal(fs.readdirSync(env.processedDir).length, 0);
});
