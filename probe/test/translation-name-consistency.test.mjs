import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditTranslationNameConsistency } from '../../scripts/audit-translation-name-consistency.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixture() {
  const translationsDir = tempDir('fab-cn-name-audit-');
  fs.writeFileSync(path.join(translationsDir, 't3-guardian.json'), `${JSON.stringify({
    boulder_drop__1: {
      name_en: 'Boulder Drop', name_zh: '巨石坠击',
      text_en: 'If Boulder Drop defends, gain 1.', text_zh: '若巨石一击防御，获得1点。',
    },
    tiger_tilt__1: {
      name_en: 'Tiger Tilt', name_zh: '虎倾',
      text_en: 'When you defend with Boulder Drop, gain 1.', text_zh: '当你以巨石一击防御时，获得1点。',
    },
    aligned__1: {
      name_en: 'Aligned Card', name_zh: '对齐之牌',
      text_en: 'When you defend with Boulder Drop, gain 1.', text_zh: '当你以巨石坠击防御时，获得1点。',
    },
    pay_up__1: {
      name_en: 'Pay Up', name_zh: '付款',
      text_en: 'Pay up to 3 resources.', text_zh: '支付至多3点资源。',
    },
  }, null, 2)}\n`);
  return translationsDir;
}

test('reports stale self and cross references while ignoring ordinary Pay Up phrasing', () => {
  const result = auditTranslationNameConsistency(writeFixture());

  assert.equal(result.stats.candidateCount, 2);
  assert.equal(result.stats.selfReferenceCount, 1);
  assert.equal(result.stats.crossReferenceCount, 1);
  assert.deepEqual(
    result.candidates.map((candidate) => [candidate.key, candidate.reference_type]),
    [
      ['boulder_drop__1', 'self-reference'],
      ['tiger_tilt__1', 'cross-reference'],
    ],
  );
  assert.equal(result.candidates[0].current_name_zh, '巨石坠击');
  assert.equal(result.candidates[0].text_zh, '若巨石一击防御，获得1点。');
  assert.equal(result.candidates[1].referenced_name_zh, '巨石坠击');
});
