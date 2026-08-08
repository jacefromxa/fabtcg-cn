import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadReviewData } from '../../scripts/translation-review-data.mjs';
import {
  ReviewQueueError,
  validateSubmission,
  writeSubmission,
} from '../../scripts/translation-review-queue.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture() {
  const root = tempDir('fab-cn-review-queue-');
  const translationsDir = path.join(root, 'translations');
  fs.mkdirSync(translationsDir, { recursive: true });
  fs.writeFileSync(path.join(translationsDir, 't3-guardian.json'), JSON.stringify({
    boulder_drop__1: {
      name_en: 'Boulder Drop', name_zh: '巨石一击', text_zh: '粉碎一。',
      pitch: '1', cost: '3', power: '7', defense: '3', status: 'machine-draft',
    },
    boulder_drop__2: {
      name_en: 'Boulder Drop', name_zh: '巨石二击', text_zh: '粉碎二。',
      pitch: '2', cost: '3', power: '6', defense: '3', status: 'machine-draft',
    },
    titan_fist: {
      name_en: "Titan's Fist", name_zh: '泰坦之拳', text_zh: '攻击。',
      pitch: null, cost: null, power: '3', defense: null, status: 'machine-draft',
    },
  }));
  const englishPath = path.join(root, 'cards.en.json');
  fs.writeFileSync(englishPath, JSON.stringify({
    boulder_drop: { name_en: 'Boulder Drop', printings: [] },
    titan_fist: { name_en: "Titan's Fist", printings: [] },
  }));
  const data = loadReviewData({ translationsDir, englishPath });
  const boulder = data.rowsByBatch.get('t3-guardian').find((row) => row.card_id === 'boulder_drop');
  const validChange = {
    card_id: 'boulder_drop',
    batch: 't3-guardian',
    name_en: 'client value is ignored',
    new_name_zh: '巨石坠击',
    variants: boulder.variants.map((variant) => ({
      key: variant.key,
      current_name_zh: variant.name_zh,
    })),
  };
  return { root, translationsDir, data, validChange };
}

test('normalizes a valid multi-pitch submission from source row data', () => {
  const { data, validChange } = fixture();
  const result = validateSubmission({ changes: [validChange] }, data);

  assert.equal(result.schema_version, 1);
  assert.match(result.submission_id, /^[a-f0-9-]+$/);
  assert.match(result.submitted_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.changes[0].name_en, 'Boulder Drop');
  assert.deepEqual(result.changes[0].variants, validChange.variants);
});

test('rejects a variant key that is not present in the declared batch', () => {
  const { data, validChange } = fixture();
  const invalid = {
    ...validChange,
    variants: [{ key: 'wrong__1', current_name_zh: '旧名' }],
  };

  assert.throws(
    () => validateSubmission({ changes: [invalid] }, data),
    (error) => error instanceof ReviewQueueError && error.statusCode === 400,
  );
});

test('rejects missing variants so one submitted name cannot update only part of a card', () => {
  const { data, validChange } = fixture();
  const invalid = { ...validChange, variants: validChange.variants.slice(0, 1) };

  assert.throws(
    () => validateSubmission({ changes: [invalid] }, data),
    (error) => error instanceof ReviewQueueError && error.details[0].reason.includes('variants'),
  );
});

test('rejects empty names, duplicate cards, unknown batches, and non-array changes', () => {
  const { data, validChange } = fixture();
  const cases = [
    { payload: { changes: [{ ...validChange, new_name_zh: '   ' }] }, reason: 'name' },
    { payload: { changes: [validChange, validChange] }, reason: 'duplicate' },
    { payload: { changes: [{ ...validChange, batch: 'missing' }] }, reason: 'batch' },
    { payload: { changes: null }, reason: 'changes' },
  ];

  for (const { payload, reason } of cases) {
    assert.throws(
      () => validateSubmission(payload, data),
      (error) => error instanceof ReviewQueueError && error.details.some((detail) => detail.reason.includes(reason)),
    );
  }
});

test('writes a deterministic queue document without changing source files', () => {
  const { data, validChange, translationsDir, root } = fixture();
  const before = fs.readFileSync(path.join(translationsDir, 't3-guardian.json'), 'utf8');
  const result = writeSubmission({ changes: [validChange] }, {
    reviewData: data,
    pendingDir: path.join(root, 'pending'),
    now: () => new Date('2026-08-08T12:34:56.000Z'),
    idFactory: () => 'fixed-id',
  });
  const after = fs.readFileSync(path.join(translationsDir, 't3-guardian.json'), 'utf8');
  const document = JSON.parse(fs.readFileSync(result.path, 'utf8'));

  assert.equal(result.fileName, 'submission-2026-08-08T12-34-56-000Z-fixed-id.json');
  assert.equal(result.changeCount, 1);
  assert.equal(document.submission_id, 'fixed-id');
  assert.equal(document.submitted_at, '2026-08-08T12:34:56.000Z');
  assert.deepEqual(document.changes[0].variants, validChange.variants);
  assert.equal(after, before);
  assert.deepEqual(fs.readdirSync(path.join(root, 'pending')), [result.fileName]);
});
