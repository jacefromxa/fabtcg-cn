import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadReviewData, listReviewCards, baseCardId } from '../../scripts/translation-review-data.mjs';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixture() {
  const root = tempDir('fab-cn-review-data-');
  const translationsDir = path.join(root, 'translations');
  fs.mkdirSync(translationsDir, { recursive: true });

  const translations = {
    boulder_drop__1: {
      name_en: 'Boulder Drop',
      name_zh: '巨石一击',
      text_zh: '粉碎一。',
      pitch: '1',
      cost: '3',
      power: '7',
      defense: '3',
      source: 'https://cards.fabtcg.com/card/boulder_drop/',
    },
    boulder_drop__2: {
      name_en: 'Boulder Drop',
      name_zh: '巨石二击',
      text_zh: '粉碎二。',
      pitch: '2',
      cost: '3',
      power: '6',
      defense: '3',
      source: 'https://cards.fabtcg.com/card/boulder_drop/',
    },
    titan_fist: {
      name_en: "Titan's Fist",
      name_zh: '泰坦之拳',
      text_zh: '攻击。',
      pitch: null,
      cost: null,
      power: '3',
      defense: null,
      source: 'https://cards.fabtcg.com/card/titans_fist/',
    },
    zealous_belting: {
      name_en: 'Zealous Belting',
      name_zh: '热情腰带',
      text_zh: '行动。',
      pitch: '1',
      cost: '1',
      power: '2',
      defense: '3',
      source: 'https://cards.fabtcg.com/card/zealous_belting/',
    },
  };
  fs.writeFileSync(path.join(translationsDir, 't3-guardian.json'), `${JSON.stringify(translations)}\n`);

  const english = {
    boulder_drop: {
      name_en: 'Boulder Drop',
      printings: [{ image_url: '' }, { image_url: 'https://images.example/boulder.webp' }],
    },
    titan_fist: {
      name_en: "Titan's Fist",
      printings: [],
    },
    zealous_belting: {
      name_en: 'Zealous Belting',
      printings: [{ image_url: 'https://images.example/zealous.webp' }],
    },
  };
  const englishPath = path.join(root, 'cards.en.json');
  fs.writeFileSync(englishPath, `${JSON.stringify(english)}\n`);
  return { translationsDir, englishPath };
}

test('baseCardId removes only supported pitch suffixes', () => {
  assert.equal(baseCardId('boulder_drop__1'), 'boulder_drop');
  assert.equal(baseCardId('boulder_drop__3'), 'boulder_drop');
  assert.equal(baseCardId('titan_fist'), 'titan_fist');
  assert.equal(baseCardId('card__4'), 'card__4');
});

test('groups pitch keys by base card id without merging variant fields', () => {
  const fixture = writeFixture();
  const data = loadReviewData(fixture);
  const page = listReviewCards(data, { batch: 't3-guardian', page: 1, pageSize: 50 });
  const row = page.items.find((item) => item.card_id === 'boulder_drop');

  assert.ok(row);
  assert.equal(row.variants.length, 2);
  assert.equal(row.current_name, null);
  assert.deepEqual(row.current_names, {
    boulder_drop__1: '巨石一击',
    boulder_drop__2: '巨石二击',
  });
  assert.equal(row.variants.find((variant) => variant.key.endsWith('__1')).power, '7');
  assert.equal(row.variants.find((variant) => variant.key.endsWith('__2')).power, '6');
  assert.notEqual(row.variants[0].text_zh, row.variants[1].text_zh);
});

test('selects the first usable printing image and falls back to source metadata', () => {
  const fixture = writeFixture();
  const data = loadReviewData(fixture);
  const page = listReviewCards(data, { batch: 't3-guardian', page: 1, pageSize: 50 });
  const imageRow = page.items.find((item) => item.card_id === 'boulder_drop');
  const fallbackRow = page.items.find((item) => item.card_id === 'titan_fist');

  assert.equal(imageRow.image_url, 'https://images.example/boulder.webp');
  assert.equal(fallbackRow.image_url, null);
  assert.equal(fallbackRow.source, 'https://cards.fabtcg.com/card/titans_fist/');
});

test('searches English and Chinese names and paginates within a batch', () => {
  const fixture = writeFixture();
  const data = loadReviewData(fixture);
  const searchResult = listReviewCards(data, {
    batch: 't3-guardian',
    q: '腰带',
    page: 1,
    pageSize: 50,
  });
  const firstPage = listReviewCards(data, {
    batch: 't3-guardian',
    page: 1,
    pageSize: 2,
  });
  const secondPage = listReviewCards(data, {
    batch: 't3-guardian',
    page: 2,
    pageSize: 2,
  });

  assert.deepEqual(searchResult.items.map((item) => item.card_id), ['zealous_belting']);
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.items.length, 2);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0].card_id, secondPage.items[0].card_id);
});

test('unknown batches return an empty paginated result', () => {
  const fixture = writeFixture();
  const data = loadReviewData(fixture);
  const result = listReviewCards(data, { batch: 'missing', page: 1, pageSize: 50 });

  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 0);
});
