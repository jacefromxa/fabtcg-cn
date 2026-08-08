import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../fabrary-lowest-price.user.js', import.meta.url));
const source = existsSync(sourcePath)
  ? readFileSync(sourcePath, 'utf8')
  : '(function () { window.FabPriceProbe = {}; }());';
const browserSandbox = { URL };
browserSandbox.window = browserSandbox;
runInNewContext(source, browserSandbox, { filename: sourcePath });
const probe = browserSandbox.FabPriceProbe;

function helper(name) {
  assert.equal(typeof probe[name], 'function', `${name} should be exposed by the userscript`);
  return probe[name];
}

test('parseDollarAmount accepts a dollar price and rejects other currencies', () => {
  const parseDollarAmount = helper('parseDollarAmount');
  assert.equal(parseDollarAmount('$1.25'), 1.25);
  assert.equal(parseDollarAmount('$ 0.5'), 0.5);
  assert.equal(parseDollarAmount('€1.25'), null);
  assert.equal(parseDollarAmount('—'), null);
});

test('findLowestDollarPrice returns the lowest valid price', () => {
  const findLowestDollarPrice = helper('findLowestDollarPrice');
  assert.equal(findLowestDollarPrice(['$4.50', '$1.25', '€0.20', '—']), 1.25);
  assert.equal(findLowestDollarPrice(['€4.50', '—']), null);
});

test('formatPrice renders two decimal places and an unavailable marker', () => {
  const formatPrice = helper('formatPrice');
  assert.equal(formatPrice(1), '$1.00');
  assert.equal(formatPrice(1.256), '$1.26');
  assert.equal(formatPrice(null), '—');
});

test('normalizeCardUrl accepts only FaBrary card detail paths', () => {
  const normalizeCardUrl = helper('normalizeCardUrl');
  assert.equal(
    normalizeCardUrl('/cards/blacktek-whisperers', 'https://fabrary.net/decks/x'),
    'https://fabrary.net/cards/blacktek-whisperers',
  );
  assert.equal(
    normalizeCardUrl(
      'https://fabrary.net/cards/blacktek-whisperers?x=1#price',
      'https://fabrary.net/',
    ),
    'https://fabrary.net/cards/blacktek-whisperers',
  );
  assert.equal(normalizeCardUrl('/decks/example', 'https://fabrary.net/'), null);
  assert.equal(normalizeCardUrl('https://other.example/cards/x', 'https://fabrary.net/'), null);
});

test('findCardUrlForImage prefers an ancestor card link and falls back to alt text', () => {
  const findCardUrlForImage = helper('findCardUrlForImage');
  const linkedImage = {
    alt: 'Wrong Name',
    parentElement: {
      parentElement: null,
      tagName: 'A',
      href: '/cards/blacktek-whisperers',
      getAttribute(name) {
        return name === 'href' ? this.href : null;
      },
    },
  };
  assert.equal(
    findCardUrlForImage(linkedImage, 'https://fabrary.net/decks/example'),
    'https://fabrary.net/cards/blacktek-whisperers',
  );

  const altImage = { alt: "Titan's Fist", parentElement: null };
  assert.equal(
    findCardUrlForImage(altImage, 'https://fabrary.net/cards'),
    'https://fabrary.net/cards/titans-fist',
  );
});

test('extractPricesFromDetailDocument reads only TCGplayer dollar links', () => {
  const extractPricesFromDetailDocument = helper('extractPricesFromDetailDocument');
  const doc = {
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href*="tcgplayer.com"]');
      return [
        {
          textContent: '$4.50',
          getAttribute() { return 'https://www.tcgplayer.com/product/1'; },
        },
        {
          textContent: '€0.20',
          getAttribute() { return 'https://www.tcgplayer.com/product/2'; },
        },
        {
          textContent: '$1.25',
          getAttribute() { return 'https://www.tcgplayer.com/product/3'; },
        },
      ];
    },
  };
  assert.equal(extractPricesFromDetailDocument(doc), 1.25);
});

test('createPriceLoader reuses an in-flight and completed URL result', async () => {
  const createPriceLoader = helper('createPriceLoader');
  const navigations = [];
  let onload = null;
  const detailDocument = {
    querySelectorAll() {
      return [{ textContent: '$2.00' }];
    },
  };
  const iframe = {
    style: {},
    setAttribute() {},
    addEventListener(type, callback) {
      if (type === 'load') onload = callback;
    },
    set src(value) {
      navigations.push(value);
      this.contentDocument = detailDocument;
    },
  };
  const doc = {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, 'iframe');
      return iframe;
    },
  };
  const timers = [];
  const root = {
    setTimeout(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
  };
  const loader = createPriceLoader(doc, root, { timeoutMs: 100 });

  const first = loader.load('https://fabrary.net/cards/example');
  const second = loader.load('https://fabrary.net/cards/example');
  onload();
  assert.deepEqual(await Promise.all([first, second]), [2, 2]);
  assert.deepEqual(navigations, ['https://fabrary.net/cards/example']);

  assert.equal(await loader.load('https://fabrary.net/cards/example'), 2);
  assert.deepEqual(navigations, ['https://fabrary.net/cards/example']);
  loader.destroy();
});

test('createPriceBadge renders a non-interactive top-right badge', () => {
  const createPriceBadge = helper('createPriceBadge');
  const image = {
    parentElement: {
      appendChild(node) {
        this.child = node;
      },
    },
  };
  const doc = {
    createElement() {
      return { style: {}, dataset: {}, textContent: '', setAttribute() {} };
    },
  };
  const badge = createPriceBadge(doc, image);
  assert.equal(badge.textContent, '…');
  assert.equal(badge.style.pointerEvents, 'none');
  assert.equal(badge.style.position, 'absolute');
  assert.equal(badge.style.top, '4px');
  assert.equal(badge.style.right, '4px');
});

test('installPriceOverlay deduplicates one card URL across repeated scans', async () => {
  const installPriceOverlay = helper('installPriceOverlay');
  const firstWrapper = {
    appendChild(node) { this.child = node; },
  };
  const secondWrapper = {
    appendChild(node) { this.child = node; },
  };
  const images = [
    { alt: 'Blacktek Whisperers', parentElement: firstWrapper },
    { alt: 'Blacktek Whisperers', parentElement: secondWrapper },
  ];
  const loaderCalls = [];
  const loader = {
    load(url) {
      loaderCalls.push(url);
      return Promise.resolve(1.25);
    },
    destroy() {
      this.destroyed = true;
    },
  };
  const doc = {
    body: { appendChild() {} },
    querySelectorAll(selector) {
      assert.equal(selector, 'img');
      return images;
    },
    createElement(tag) {
      assert.equal(tag, 'span');
      return {
        style: {},
        dataset: {},
        textContent: '',
        setAttribute() {},
      };
    },
  };
  const root = { top: null };
  root.top = root;
  const overlay = installPriceOverlay(doc, root, { loader });

  overlay.scan();
  overlay.scan();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(loaderCalls, ['https://fabrary.net/cards/blacktek-whisperers']);
  assert.equal(firstWrapper.child.textContent, '$1.25');
  assert.equal(secondWrapper.child.textContent, '$1.25');
  overlay.destroy();
  assert.equal(loader.destroyed, true);
});
