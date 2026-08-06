import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCardArtifacts, buildKeywordLibrary, attachCardKeywords } from '../../scripts/build-card-data.mjs';

test('buildCardArtifacts groups pitch variants under one card id, chunked by batch', () => {
  const result = buildCardArtifacts({
    boulder_drop: {
      name_zh: '巨石坠击',
      name_en: 'Boulder Drop',
      type_zh: '守护者行动·攻击',
      text_zh: '粉碎。',
      text_en: 'Crush.',
      pitch: 1,
      power: 7,
      defense: 3,
    },
    boulder_drop__2: {
      name_zh: '巨石坠击',
      name_en: 'Boulder Drop',
      type_zh: '守护者行动·攻击',
      text_zh: '粉碎。',
      text_en: 'Crush.',
      pitch: 2,
      power: 6,
      defense: 3,
    },
  }, { boulder_drop: 't1-generic' });

  assert.equal(result.manifest.card_count, 1);
  assert.deepEqual(result.index.cards.boulder_drop, {
    id: 'boulder_drop',
    chunk: 'chunks/t1-generic.json',
  });
  const card = result.chunks['chunks/t1-generic.json'].cards.boulder_drop;
  assert.equal(card.name_zh, '巨石坠击');
  assert.equal(card.variants['1'].power, 7);
  assert.equal(card.variants['2'].power, 6);
});

test('buildCardArtifacts falls back to a misc chunk when batch info is missing', () => {
  const result = buildCardArtifacts({ foo: { name_zh: 'X' } });
  assert.equal(result.index.cards.foo.chunk, 'chunks/_.json');
});

test('buildKeywordLibrary flattens glossary.keyword into a lowercased map', () => {
  const library = buildKeywordLibrary({
    keyword: {
      'Go again': { name_zh: '再动', desc_zh: '获得 1 点行动点。' },
      'Combo': { name_zh: '连击', desc_zh: '…' },
    },
  });
  assert.deepEqual(library['go again'], { name_zh: '再动', desc_zh: '获得 1 点行动点。' });
  assert.equal(Object.keys(library).length, 2);
});

test('attachCardKeywords joins English card_keywords, keeping resolvable ones only', () => {
  const library = buildKeywordLibrary({
    keyword: {
      'Crush': { name_zh: '粉碎', desc_zh: '…' },
      'Arcane Barrier': { name_zh: '秘法屏障', desc_zh: '…' },
    },
  });
  const englishCards = [
    { name: 'Boulder Drop', card_keywords: ['Crush'] },
    { name: 'Sigil of Conductivity', card_keywords: ['Arcane Shelter 1'] },
    { name: 'Rhinar, Reckless Rampage', card_keywords: ['Rhinar Specialization'] },
    { name: 'Plain Card', card_keywords: [] },
  ];
  const out = attachCardKeywords({
    boulder_drop: { name_en: 'Boulder Drop' },
    sigil_of_conductivity: { name_en: 'Sigil of Conductivity' },
    rhinar_reckless_rampage: { name_en: 'Rhinar, Reckless Rampage' },
    plain_card: { name_en: 'Plain Card' },
  }, englishCards, library);

  assert.deepEqual(out.boulder_drop.keywords, ['Crush']);
  assert.equal(out.sigil_of_conductivity.keywords, undefined, 'unresolvable keyword is not attached');
  assert.equal(out.rhinar_reckless_rampage.keywords, undefined, 'specialization is not attached');
  assert.equal(out.plain_card.keywords, undefined);
});

test('buildCardArtifacts creates stable metadata for a non-pitched card', () => {
  const result = buildCardArtifacts({
    titans_fist: {
      name_zh: '泰坦之拳',
      name_en: "Titan's Fist",
      pitch: null,
      power: 3,
    },
  }, { titans_fist: 't2-equipment' });

  assert.equal(result.manifest.card_count, 1);
  assert.match(result.manifest.version, /^[a-f0-9]{12}$/);
  assert.deepEqual(result.chunks['chunks/t2-equipment.json'].cards.titans_fist.variants.default, {
    pitch: null,
    cost: null,
    power: 3,
    defense: null,
  });
});
