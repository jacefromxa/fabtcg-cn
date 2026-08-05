import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../probe.user.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const browserSandbox = { URL };
browserSandbox.window = browserSandbox;
runInNewContext(source, browserSandbox, { filename: sourcePath });
const probe = browserSandbox.FabCnProbe;

const {
  extractImageTokens,
  normalizeCandidate,
  collectCandidates,
  lookupCard,
  calculatePanelPosition,
  findCardAnchor,
  renderCardPanel,
  installProbe,
} = probe;

test('userscript is browser-only and has no lint global declaration', () => {
  assert.doesNotMatch(source, /\/\*\s*global\b/);
  assert.doesNotMatch(source, /\bmodule\b/);
});

test('userscript entry prefers the browser window as its root', () => {
  assert.match(source, /const root = window/);
});

test('userscript entry does not depend on globalThis', () => {
  assert.doesNotMatch(source, /\bglobalThis\b/);
});

test('extractImageTokens returns filename and path tokens', () => {
  const tokens = extractImageTokens('https://cdn.example/cards/WTR001.jpg?v=2');
  assert.deepEqual(Array.from(tokens), ['wtr001', '2']);
});

test('extractImageTokens preserves the exact card filename stem', () => {
  const tokens = extractImageTokens('https://images.talishar.net/public/cardsquares/english/titans_fist.webp');
  assert.deepEqual(Array.from(tokens), ['titans_fist', 'titans', 'fist']);
});

test('normalizeCandidate trims and lowercases values', () => {
  assert.equal(normalizeCandidate('  WTR001  '), 'wtr001');
  assert.equal(normalizeCandidate(''), null);
});

test('collectCandidates reads image metadata and data attributes', () => {
  const fakeElement = {
    tagName: 'IMG',
    className: 'card-image',
    src: 'https://cdn.example/cards/WTR001.jpg',
    alt: 'Brutal Assault',
    title: 'Brutal Assault',
    attributes: [
      { name: 'src', value: 'https://cdn.example/cards/WTR001.jpg' },
      { name: 'data-card-id', value: 'WTR001' },
    ],
  };
  const result = collectCandidates(fakeElement);
  assert.deepEqual(Array.from(result.attributes['data-card-id']), ['wtr001']);
  assert.deepEqual(Array.from(result.imageUrls), ['https://cdn.example/cards/WTR001.jpg']);
});

function createFakeDocument() {
  const listeners = new Map();
  const body = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
      node.parentNode = null;
    },
  };

  return {
    body,
    listeners,
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        id: '',
        style: {},
        textContent: '',
        children: [],
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
        },
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
      };
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
  };
}

test('installProbe registers a listener and cleans up its panel', () => {
  const fakeDocument = createFakeDocument();
  const instance = installProbe(fakeDocument);

  assert.equal(fakeDocument.listeners.has('pointerover'), true);
  assert.equal(fakeDocument.body.children.length, 1);
  assert.equal(fakeDocument.body.children[0].id, 'fab-cn-probe-panel');

  instance.destroy();

  assert.equal(fakeDocument.listeners.has('pointerover'), false);
  assert.equal(fakeDocument.body.children.length, 0);
});

test('pointerover hides the panel when no Chinese card data is available', () => {
  const fakeDocument = createFakeDocument();
  const instance = installProbe(fakeDocument);
  const cardImage = {
    tagName: 'IMG',
    className: 'card-image',
    src: 'https://cdn.example/cards/WTR001.jpg',
    alt: 'Brutal Assault',
    title: 'Brutal Assault',
    attributes: [
      { name: 'src', value: 'https://cdn.example/cards/WTR001.jpg' },
      { name: 'data-card-id', value: 'WTR001' },
    ],
  };

  fakeDocument.listeners.get('pointerover')({ target: cardImage });

  const panel = fakeDocument.body.children[0];
  assert.equal(panel.style.display, 'none');

  instance.destroy();
});

test('pointerover displays Chinese card data when the exact image stem is known', () => {
  const fakeDocument = createFakeDocument();
  const instance = installProbe(fakeDocument, {
    titans_fist: {
      name_zh: '泰坦之拳',
      text_zh: '每回合一次行动：攻击。',
    },
  });
  const cardImage = {
    tagName: 'IMG',
    className: 'card-image',
    src: 'https://images.talishar.net/public/cardsquares/english/titans_fist.webp',
    attributes: [
      { name: 'src', value: 'https://images.talishar.net/public/cardsquares/english/titans_fist.webp' },
    ],
  };

  fakeDocument.listeners.get('pointerover')({ target: cardImage });

  const panel = fakeDocument.body.children[0];
  assert.deepEqual(panel.children.map((child) => child.textContent), [
    '泰坦之拳',
    '',
    '每回合一次行动：攻击。',
  ]);
  assert.equal(panel.children.length, 3);

  instance.destroy();
});

test('lookupCard falls back to the only available pitch variant', () => {
  const cardImage = {
    tagName: 'IMG',
    src: 'https://images.talishar.net/public/cardsquares/english/autumns_touch.webp',
    attributes: [
      { name: 'src', value: 'https://images.talishar.net/public/cardsquares/english/autumns_touch.webp' },
    ],
  };
  const result = lookupCard(cardImage, {
    autumns_touch__3: {
      name_zh: '秋之触',
      pitch: 3,
    },
  });

  assert.equal(result.key, 'autumns_touch__3');
  assert.equal(result.card.name_zh, '秋之触');
});

test('calculatePanelPosition prefers the side with enough space', () => {
  const result = calculatePanelPosition(
    { left: 400, right: 500, top: 300, bottom: 400, width: 100, height: 100 },
    { width: 190, height: 100 },
    { width: 700, height: 800 },
  );

  assert.equal(result.side, 'left');
  assert.equal(result.left, 198);
  assert.equal(result.top, 300);
});

test('calculatePanelPosition keeps the panel inside the viewport when neither side fits', () => {
  const result = calculatePanelPosition(
    { left: 10, right: 90, top: 0, bottom: 40, width: 80, height: 40 },
    { width: 500, height: 180 },
    { width: 520, height: 220 },
  );

  assert.equal(result.side, 'right');
  assert.equal(result.left, 12);
  assert.equal(result.top, 12);
});

test('renderCardPanel only renders the three requested card fields', () => {
  const fakeDocument = createFakeDocument();
  const panel = fakeDocument.createElement('div');

  renderCardPanel(fakeDocument, panel, {
    name_zh: '泰坦之拳',
    type_zh: '守护者武器·锤（单手）',
    text_zh: '每回合一次行动：攻击。',
  });

  assert.deepEqual(panel.children.map((child) => child.textContent), [
    '泰坦之拳',
    '守护者武器·锤（单手）',
    '每回合一次行动：攻击。',
  ]);
  assert.equal(panel.children.length, 3);
  assert.equal(panel.children[0].style.color, '#ffad42');
  assert.equal(panel.children[0].style.fontWeight, '700');
  assert.equal(panel.children[1].style.fontStyle, 'italic');
  assert.equal(panel.children[1].style.textDecoration, 'underline');
});

test('findCardAnchor prefers the image inside the detected card container', () => {
  const image = { tagName: 'IMG', getBoundingClientRect() { return { width: 80 }; } };
  const container = {
    tagName: 'DIV',
    querySelector(selector) {
      return selector === 'img' ? image : null;
    },
    attributes: [{ name: 'data-card-id', value: 'titans_fist' }],
  };
  const fakeDocument = { body: {} };

  assert.equal(findCardAnchor(container, fakeDocument), image);
});
