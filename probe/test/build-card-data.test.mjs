import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCardArtifacts } from '../../scripts/build-card-data.mjs';

test('buildCardArtifacts groups pitch variants under one card id', () => {
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
  });

  assert.equal(result.manifest.card_count, 1);
  assert.deepEqual(result.index.cards.boulder_drop, {
    id: 'boulder_drop',
    chunk: 'chunks/b.json',
  });
  const card = result.chunks['chunks/b.json'].cards.boulder_drop;
  assert.equal(card.name_zh, '巨石坠击');
  assert.equal(card.variants['1'].power, 7);
  assert.equal(card.variants['2'].power, 6);
});

test('buildCardArtifacts creates stable metadata for a non-pitched card', () => {
  const result = buildCardArtifacts({
    titans_fist: {
      name_zh: '泰坦之拳',
      name_en: "Titan's Fist",
      pitch: null,
      power: 3,
    },
  });

  assert.equal(result.manifest.card_count, 1);
  assert.match(result.manifest.version, /^[a-f0-9]{12}$/);
  assert.deepEqual(result.chunks['chunks/t.json'].cards.titans_fist.variants.default, {
    pitch: null,
    cost: null,
    power: 3,
    defense: null,
  });
});
