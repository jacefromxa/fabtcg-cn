import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardAliases, talisharStem } from '../../scripts/build-card-aliases.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- Printing-id alias table ------------------------------------------------

const englishCards = JSON.parse(
  readFileSync(path.join(projectRoot, 'data/source/english/card.json'), 'utf8'),
);

test('buildCardAliases maps a printing id to its card slug and pitch', () => {
  const aliases = buildCardAliases(englishCards);
  assert.deepEqual(aliases.PEN313, { slug: 'quickdodge_flexors', pitch: null });
  assert.deepEqual(aliases.TCC039, { slug: 'boulder_drop', pitch: '2' });
  assert.deepEqual(aliases.APS008, { slug: 'boulder_drop', pitch: '1' });
});

test('ambiguous printing ids keep an array of candidates', () => {
  const aliases = buildCardAliases(englishCards);
  assert.ok(Array.isArray(aliases.AMX022), 'AMX022 should be ambiguous');
  assert.deepEqual(aliases.AMX022, [
    { slug: 'bank_breaker', pitch: null },
    { slug: 'construct_bank_breaker', pitch: '2' },
  ]);
});

test('alias entries only carry slug and pitch', () => {
  const aliases = buildCardAliases(englishCards);
  for (const value of Object.values(aliases)) {
    const list = Array.isArray(value) ? value : [value];
    for (const entry of list) {
      assert.deepEqual(Object.keys(entry).sort(), ['pitch', 'slug']);
    }
  }
});

// --- Browser-side key resolution -------------------------------------------

const sourcePath = fileURLToPath(new URL('../talishar-cn.user.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const browserSandbox = { URL };
browserSandbox.window = browserSandbox;
runInNewContext(source, browserSandbox, { filename: sourcePath });
const { resolveCardKeys, slugifyCardName, extractPrintingId, normalizeStem, collectCandidates } = browserSandbox.FabCnProbe;

function fakeElement(src, alt, title) {
  const attributes = [];
  if (src) attributes.push({ name: 'src', value: src });
  if (alt) attributes.push({ name: 'alt', value: alt });
  if (title) attributes.push({ name: 'title', value: title });
  return { tagName: 'IMG', src, alt, title, attributes };
}

function keysFor(element, aliases) {
  return resolveCardKeys(collectCandidates(element), aliases);
}

const FABRARY_ALIASES = {
  PEN313: { slug: 'quickdodge_flexors', pitch: null },
  TCC039: { slug: 'boulder_drop', pitch: '2' },
  AMX022: [
    { slug: 'bank_breaker', pitch: null },
    { slug: 'construct_bank_breaker', pitch: '2' },
  ],
};

const TALISHAR_ALIASES = {
  jarl_vetreidi: { slug: 'jarl_vetrei_i', pitch: null },
  twelve_petal_kasaya: { slug: 'twelve_petal_ka_s_a_ya', pitch: null },
  potion_of_deja_vu: { slug: 'potion_of_de_ja_vu', pitch: '3' },
};

test('talisharStem transliterates non-ASCII letters like Talishar filenames', () => {
  assert.equal(talisharStem('Jarl Vetreiði'), 'jarl_vetreidi');
  assert.equal(talisharStem('Twelve Petal Kāṣāya'), 'twelve_petal_kasaya');
  assert.equal(talisharStem('Potion of Déjà Vu'), 'potion_of_deja_vu');
  assert.equal(talisharStem('Everbloom // Life'), 'everbloom_life');
  assert.equal(talisharStem('Show Time!'), 'show_time');
  assert.equal(talisharStem('Ice Quake'), 'ice_quake');
});

test('resolveCardKeys resolves a Talishar transliterated image stem', () => {
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/jarl_vetreidi.webp', null),
    TALISHAR_ALIASES,
  );
  assert.ok(keys.includes('jarl_vetrei_i'), JSON.stringify(keys));
});

test('resolveCardKeys strips the pitch color suffix into a direct base key', () => {
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/ice_quake_red.webp', null),
    null,
  );
  assert.ok(keys.includes('ice_quake'), JSON.stringify(keys));
});

test('normalizeStem strips color, cropped, and printing-variant suffixes', () => {
  assert.equal(normalizeStem('ice_quake_red'), 'ice_quake');
  assert.equal(normalizeStem('MPW010-T'), 'MPW010');
  assert.equal(normalizeStem('FAB153-T'), 'FAB153');
  assert.equal(normalizeStem('PEN313'), 'PEN313');
  assert.equal(normalizeStem('jarl_vetreidi'), 'jarl_vetreidi');
  // Cropped variant images (side-aura bars, results page)
  assert.equal(normalizeStem('blaze_headlong_red_cropped'), 'blaze_headlong');
  assert.equal(normalizeStem('brand_with_cinderclaw_red_cropped'), 'brand_with_cinderclaw');
  assert.equal(normalizeStem('burning_blade_dance_red_cropped'), 'burning_blade_dance');
  assert.equal(normalizeStem('energy_potion_blue_cropped'), 'energy_potion');
  assert.equal(normalizeStem('rising_resentment_red_cropped'), 'rising_resentment');
  // Card-square type marker on equip-able cards (images.talishar.net)
  assert.equal(normalizeStem('arcbane_grasp_blue_equip'), 'arcbane_grasp');
  assert.equal(normalizeStem('cogwerx_base_chest_equip'), 'cogwerx_base_chest');
  assert.equal(normalizeStem('evo_beta_base_chest_equip'), 'evo_beta_base_chest');
});

test('transform cards resolve by card name, not the transformed image', () => {
  // Adaptive Alpha Mold transforms into other equipment; Talishar shows the
  // transformed art (arcbane_grasp_blue_equip) while the card identity stays
  // the original name. The name must win so the tooltip shows the card's 本体.
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/arcbane_grasp_blue_equip.webp', 'Adaptive Alpha Mold'),
    {},
  );
  assert.equal(keys[0], 'adaptive_alpha_mold', 'card name should win over the transformed image: ' + JSON.stringify(keys));
});

test('card-square URL with no name resolves by its stripped image slug', () => {
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/arcbane_grasp_blue_equip.webp', null),
    {},
  );
  assert.ok(keys.includes('arcbane_grasp'),
    'stripped image slug should resolve when no name is present: ' + JSON.stringify(keys));
});

test('resolveCardKeys resolves a printing id with a -T variant suffix', () => {
  const PRINT_ALIASES = {
    MPW010: { slug: 'grains_of_bloodspill', pitch: null },
    FAB153: { slug: 'courage', pitch: null },
    MPW007: { slug: 'golden_grail', pitch: null },
    LGS029: { slug: 'ironsong_response', pitch: '1' },
  };
  const cases = [
    ['MPW010-T.webp', 'grains_of_bloodspill'],
    ['FAB153-T.webp', 'courage'],
    ['MPW007-T.webp', 'golden_grail'],
    ['LGS029-T.webp', 'ironsong_response'],
  ];
  for (const [file, expected] of cases) {
    const keys = keysFor(
      fakeElement('https://images.talishar.net/public/cardsquares/english/' + file, null),
      PRINT_ALIASES,
    );
    assert.ok(keys.includes(expected), `${file} should resolve to ${expected}: ${JSON.stringify(keys)}`);
  }
});

test('resolveCardKeys resolves a FaBrary printing id via the alias table', () => {
  const keys = keysFor(
    fakeElement('https://content.fabrary.net/cards/PEN313.webp', 'Quickdodge Flexors'),
    FABRARY_ALIASES,
  );
  assert.ok(keys.includes('quickdodge_flexors'), JSON.stringify(keys));
});

test('resolveCardKeys disambiguates a shared printing id with the alt text', () => {
  const keys = keysFor(
    fakeElement('https://content.fabrary.net/cards/AMX022.webp', 'Construct Bank Breaker'),
    FABRARY_ALIASES,
  );
  assert.ok(keys.includes('construct_bank_breaker'), JSON.stringify(keys));
  assert.ok(!keys.includes('bank_breaker'),
    'alt-matched candidate should be the only one kept');
});

test('resolveCardKeys keeps every candidate when the alt text is ambiguous', () => {
  const keys = keysFor(
    fakeElement('https://content.fabrary.net/cards/AMX022.webp', null),
    FABRARY_ALIASES,
  );
  assert.ok(keys.includes('bank_breaker'), JSON.stringify(keys));
  assert.ok(keys.includes('construct_bank_breaker'), JSON.stringify(keys));
});

test('resolveCardKeys falls back to alt-text slug when no alias matches', () => {
  const keys = keysFor(
    fakeElement('https://content.fabrary.net/cards/UNKNOWN.webp', 'Felling of the Crown'),
    FABRARY_ALIASES,
  );
  assert.ok(keys.includes('felling_of_the_crown'), JSON.stringify(keys));
});

test('resolveCardKeys keeps the Talishar image-token path working', () => {
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/titans_fist.webp', null),
    null,
  );
  assert.ok(keys.includes('titans_fist'), JSON.stringify(keys));
});

test('slugifyCardName mirrors the Node slug used by the data layer', () => {
  assert.equal(slugifyCardName("Titan's Fist"), 'titans_fist');
  assert.equal(slugifyCardName('Quickdodge Flexors'), 'quickdodge_flexors');
});

test('extractPrintingId returns the exact filename stem', () => {
  assert.equal(extractPrintingId('https://content.fabrary.net/cards/PEN313.webp'), 'PEN313');
  assert.equal(extractPrintingId('https://content.fabrary.net/cards/TCC039.webp?v=2'), 'TCC039');
});

test('loadCardForElement falls back to aliases when the fast path misses', async () => {
  const responses = {
    'https://data.example/manifest.json': {
      schema_version: 1, version: 'abc', index_file: 'index.json',
    },
    'https://data.example/index.json': {
      schema_version: 1, version: 'abc',
      cards: { jarl_vetrei_i: { id: 'jarl_vetrei_i', chunk: 'chunks/j.json' } },
    },
    'https://data.example/chunks/j.json': {
      schema_version: 1, version: 'abc',
      cards: { jarl_vetrei_i: { id: 'jarl_vetrei_i', name_zh: '贾尔·维特雷一世' } },
    },
    'https://data.example/aliases.json': TALISHAR_ALIASES,
  };
  const fetchCalls = [];
  const root = {
    location: { hostname: 'talishar.net' },
    fetch: async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        async json() { return responses[url]; },
        clone() { return this; },
      };
    },
  };
  const loader = browserSandbox.FabCnProbe.createCardDataLoader(root, 'https://data.example');
  const result = await loader.loadCardForElement(
    fakeElement('https://images.talishar.net/public/cardsquares/english/jarl_vetreidi.webp', null),
  );
  assert.equal(result.card.name_zh, '贾尔·维特雷一世');
  assert.ok(fetchCalls.includes('https://data.example/aliases.json'),
    'alias table should be fetched on the fallback pass');
});
