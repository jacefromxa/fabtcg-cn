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
const {
  resolveCardKeys,
  slugifyCardName,
  extractPrintingId,
  normalizeStem,
  extractFablazingCardLink,
  extractTcgplayerCardEmbed,
  collectCandidates,
} = browserSandbox.FabCnProbe;

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

test('resolveCardKeys resolves Fabrec cardface printing ids and variant suffixes', () => {
  const aliases = {
    AGB001: { slug: 'gravy_bones_shipwrecked_looter', pitch: null },
    WTR116: { slug: 'braveforge_bracers', pitch: null },
  };
  const heroKeys = keysFor(
    fakeElement('https://json.fabrec.gg/cardmeta/cardfaces/AGB001.jpg', 'Gravy Bones, Shipwrecked Looter'),
    aliases,
  );
  const variantKeys = keysFor(
    fakeElement('https://json.fabrec.gg/cardmeta/cardfaces/WTR116-CF.jpg', 'Braveforge Bracers'),
    aliases,
  );

  assert.ok(heroKeys.includes('gravy_bones_shipwrecked_looter'), JSON.stringify(heroKeys));
  assert.ok(variantKeys.includes('braveforge_bracers'), JSON.stringify(variantKeys));
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

test('extractFablazingCardLink parses card slug and pitch color', () => {
  assert.deepEqual(
    { ...extractFablazingCardLink('https://fablazing.com/card/up-the-ante-blue') },
    { slug: 'up_the_ante', pitch: '3' },
  );
  assert.deepEqual(
    { ...extractFablazingCardLink('/card/hold-em-red') },
    { slug: 'hold_em', pitch: '1' },
  );
  assert.deepEqual(
    { ...extractFablazingCardLink('/card/hold-em-yellow') },
    { slug: 'hold_em', pitch: '2' },
  );
  assert.deepEqual(
    extractFablazingCardLink('https://fablazing.com/hero/olympia-prized-fighter'),
    null,
  );
});

test('resolveCardKeys resolves a Fablazing card link to its grouped slug', () => {
  const anchor = {
    tagName: 'A',
    href: 'https://fablazing.com/card/up-the-ante-blue',
    attributes: [{ name: 'href', value: '/card/up-the-ante-blue' }],
  };
  const candidate = collectCandidates(anchor);
  assert.deepEqual(Array.from(candidate.linkUrls), ['https://fablazing.com/card/up-the-ante-blue']);
  assert.ok(resolveCardKeys(candidate, null).includes('up_the_ante'));
});

test('collectCandidates ignores ordinary Fablazing links', () => {
  const anchor = {
    tagName: 'A',
    href: 'https://fablazing.com/hero/olympia-prized-fighter',
    attributes: [{ name: 'href', value: '/hero/olympia-prized-fighter' }],
  };
  assert.deepEqual(Array.from(collectCandidates(anchor).linkUrls), []);
});

test('extractTcgplayerCardEmbed parses a card-hover name and its pitch', () => {
  const embed = {
    tagName: 'SPAN',
    className: 'card-hover-link',
    attributes: [
      { name: 'data-embed', value: 'card-hover' },
      { name: 'name', value: 'Scar for a Scar (Red)' },
    ],
  };

  assert.deepEqual(
    { ...extractTcgplayerCardEmbed(embed) },
    { slug: 'scar_for_a_scar', pitch: '1' },
  );
  const candidate = collectCandidates(embed);
  assert.deepEqual(
    Array.from(candidate.embeddedCards, (card) => ({ ...card })),
    [{ slug: 'scar_for_a_scar', pitch: '1' }],
  );
  assert.ok(resolveCardKeys(candidate, null).includes('scar_for_a_scar'));
});

test('extractTcgplayerCardEmbed ignores an ordinary named span', () => {
  const ordinarySpan = {
    tagName: 'SPAN',
    className: 'card-hover-link',
    attributes: [{ name: 'name', value: 'Scar for a Scar (Red)' }],
  };

  assert.equal(extractTcgplayerCardEmbed(ordinarySpan), null);
  assert.deepEqual(Array.from(collectCandidates(ordinarySpan).embeddedCards), []);
});

test('resolveCardKeys recognizes a TCGplayer deck-list card row by its scoped card link text', () => {
  const cardLink = {
    tagName: 'A',
    textContent: 'Adaptive Alpha Mold',
    attributes: [{ name: 'data-testid', value: 'BaseTransition__base-link' }],
  };
  const deckRow = {
    tagName: 'LI',
    className: 'list__item',
    attributes: [],
    querySelector(selector) {
      return selector === 'a[data-testid="BaseTransition__base-link"]' ? cardLink : null;
    },
  };
  cardLink.closest = (selector) => (
    selector === '.martech-deck-embed .list__item' ? deckRow : null
  );

  const keys = keysFor(cardLink, null);

  assert.ok(keys.includes('adaptive_alpha_mold'), JSON.stringify(keys));
});

test('resolveCardKeys recognizes a TCGplayer showcase image and removes its pitch suffix', () => {
  const showcaseLink = {
    tagName: 'A',
    attributes: [{ name: 'data-testid', value: 'CardShowcaseCard__base-link' }],
  };
  const image = {
    tagName: 'IMG',
    className: 'is-card card-image card-corners',
    src: 'https://tcgplayer-cdn.tcgplayer.com/product/271203_in_600x600.jpg',
    alt: 'Sink Below (Red)',
    attributes: [
      { name: 'src', value: 'https://tcgplayer-cdn.tcgplayer.com/product/271203_in_600x600.jpg' },
      { name: 'alt', value: 'Sink Below (Red)' },
      { name: 'class', value: 'is-card card-image card-corners' },
    ],
    closest(selector) {
      return selector === '[data-testid="CardShowcaseCard__base-link"]' ? showcaseLink : null;
    },
  };

  const keys = keysFor(image, null);

  assert.ok(keys.includes('sink_below'), JSON.stringify(keys));
});

test('resolveCardKeys resolves a Felt Table background card image', () => {
  const card = {
    tagName: 'DIV',
    style: {
      backgroundImage: 'url("https://d1n2ba7uw8bkm1.cloudfront.net/fab/HVY/HVY092.jpg")',
    },
    attributes: [{
      name: 'style',
      value: 'background-image: url("https://d1n2ba7uw8bkm1.cloudfront.net/fab/HVY/HVY092.jpg")',
    }],
  };
  const aliases = { HVY092: { slug: 'olympia_prized_fighter', pitch: null } };
  const candidate = collectCandidates(card);
  assert.ok(resolveCardKeys(candidate, aliases).includes('olympia_prized_fighter'));
});

test('card-square URL resolves by its own image first (point at a card, see it)', () => {
  // images.talishar.net card squares append an "_equip" type marker and a
  // transformed overlay card shows its own art. The image slug wins so the
  // tooltip shows the card the pointer is actually over, not a sibling's name.
  const keys = keysFor(
    fakeElement('https://images.talishar.net/public/cardsquares/english/arcbane_grasp_blue_equip.webp', 'Adaptive Alpha Mold'),
    {},
  );
  assert.equal(keys[0], 'arcbane_grasp', 'image slug should be the first candidate: ' + JSON.stringify(keys));
  const imageRank = keys.indexOf('arcbane_grasp');
  const altRank = keys.indexOf('adaptive_alpha_mold');
  assert.ok(imageRank >= 0 && imageRank < altRank,
    'image slug must outrank the alt (image at ' + imageRank + ', alt at ' + altRank + '): ' + JSON.stringify(keys));
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
