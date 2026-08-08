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
