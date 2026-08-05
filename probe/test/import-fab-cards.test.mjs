import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnglishIndex,
  normalizeCardRecord,
  slugifyCardName,
} from '../../scripts/import-fab-cards.mjs';

test('slugifyCardName produces the Talishar-style Titan Fist key', () => {
  assert.equal(slugifyCardName("Titan's Fist"), 'titans_fist');
});

test('normalizeCardRecord keeps the fields needed by the translator', () => {
  const record = normalizeCardRecord({
    unique_id: 'source-1',
    name: "Titan's Fist",
    pitch: '',
    cost: '',
    power: '3',
    defense: '',
    types: ['Guardian', 'Weapon', 'Hammer', '1H'],
    functional_text_plain: 'Once per Turn Action - {r}{r}{r}: Attack',
    type_text: 'Guardian Weapon - Hammer (1H)',
    printings: [{ id: 'ELE202', set_id: 'ELE', image_url: 'https://example.test/ELE202.png' }],
  });

  assert.deepEqual(record, {
    source_unique_id: 'source-1',
    name_en: "Titan's Fist",
    pitch: null,
    cost: null,
    power: '3',
    defense: null,
    types: ['Guardian', 'Weapon', 'Hammer', '1H'],
    text_en: 'Once per Turn Action - {r}{r}{r}: Attack',
    type_en: 'Guardian Weapon - Hammer (1H)',
    printings: [{ id: 'ELE202', set_id: 'ELE', image_url: 'https://example.test/ELE202.png' }],
  });
});

test('buildEnglishIndex indexes cards by normalized names', () => {
  const index = buildEnglishIndex([
    { unique_id: 'source-1', name: "Titan's Fist", types: [], printings: [] },
  ]);

  assert.equal(index.titans_fist.name_en, "Titan's Fist");
  assert.equal(index.titans_fist.source_unique_id, 'source-1');
});
