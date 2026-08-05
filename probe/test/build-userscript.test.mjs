import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserscriptSource } from '../../scripts/build-userscript.mjs';

test('buildUserscriptSource keeps the userscript small and data-free', () => {
  const template = [
    '// ==UserScript==',
    '// @name Test',
    '// ==/UserScript==',
    'const loader = true;',
  ].join('\n');

  const result = buildUserscriptSource(template);

  assert.equal(result, template);
  assert.doesNotMatch(result, /BUILTIN_CARD_DATA|FAB_CN_DATA/);
});

test('buildUserscriptSource rejects a template without userscript metadata', () => {
  assert.throws(
    () => buildUserscriptSource('const cards = {};'),
    /metadata block/,
  );
});

test('buildUserscriptSource rejects a template with embedded card data', () => {
  assert.throws(
    () => buildUserscriptSource([
      '// ==UserScript==',
      '// ==/UserScript==',
      'const BUILTIN_CARD_DATA = {};',
    ].join('\n')),
    /embedded card data/,
  );
});
