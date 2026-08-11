import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../talishar-cn.user.js', import.meta.url));
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
  findCardPreviewImage,
  renderCardPanel,
  installProbe,
  SETTINGS_DEFAULTS,
  loadSettings,
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

test('userscript matches Fablazing pages', () => {
  assert.match(source, /^\/\/ @match\s+https:\/\/fablazing\.com\/\*$/m);
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

  var head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      this.children = this.children.filter(function (c) { return c !== node; });
      node.parentNode = null;
    },
  };

  return {
    body,
    head,
    listeners,
    createElement(tagName) {
      const elementListeners = new Map();
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
        insertBefore(newNode, refNode) {
          this.children.unshift(newNode);
          newNode.parentNode = this;
        },
        addEventListener(type, callback) {
          elementListeners.set(type, callback);
        },
        removeEventListener(type, callback) {
          if (elementListeners.get(type) === callback) elementListeners.delete(type);
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100 };
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
    '· 每回合一次行动：攻击。',
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
    '· 每回合一次行动：攻击。',
  ]);
  assert.equal(panel.children.length, 3);
  assert.equal(panel.children[0].style.color, 'var(--fab-cn-name-color)');
  assert.equal(panel.children[0].style.fontWeight, '700');
  assert.equal(panel.children[1].style.fontStyle, 'italic');
  assert.equal(panel.children[1].style.textDecoration, 'underline');
  assert.equal(panel.children[1].style.color, 'var(--fab-cn-type-color)');
});

test('renderCardPanel appends a keyword section (name：desc, numbered fallback)', () => {
  const fakeDocument = createFakeDocument();
  const panel = fakeDocument.createElement('div');

  renderCardPanel(fakeDocument, panel, {
    name_zh: '巨石坠击',
    type_zh: '守护者行动·攻击',
    text_zh: '粉碎。',
    keywords: ['Crush', 'Go again', 'Arcane Barrier 1'],
  }, {
    'crush': { name_zh: '粉碎', desc_zh: '当此牌造成 4 点或更多伤害时，[效果]。' },
    'go again': { name_zh: '再动', desc_zh: '获得 1 点行动点。' },
    'arcane barrier': { name_zh: '奥术屏障', desc_zh: '若你将受到奥术伤害，你可以支付 N 点资源以防止其中 N 点。' },
  });

  assert.equal(panel.children.length, 4);
  const kwBlock = panel.children[3];
  assert.equal(kwBlock.className, 'fab-cn-card-keywords');
  assert.equal(kwBlock.style.color, 'var(--fab-cn-keyword-color)');
  assert.equal(kwBlock.style.fontSize, 'var(--fab-cn-keyword-size)');
  assert.deepEqual(kwBlock.children.map((c) => c.textContent), [
    '关键词',
    '· 粉碎：当此牌造成 4 点或更多伤害时，[效果]。',
    '· 再动：获得 1 点行动点。',
    '· 奥术屏障：若你将受到奥术伤害，你可以支付 N 点资源以防止其中 N 点。',
  ]);
});

test('renderCardPanel prefixes every non-empty text line, keeping blank lines blank', () => {
  const fakeDocument = createFakeDocument();
  const panel = fakeDocument.createElement('div');
  renderCardPanel(fakeDocument, panel, {
    name_zh: 'X',
    text_zh: '第一行异能。\n\n第二行异能。',
  });
  assert.equal(panel.children[2].textContent, '· 第一行异能。\n\n· 第二行异能。');
});

test('renderCardPanel skips keywords that do not resolve in the library', () => {
  const fakeDocument = createFakeDocument();
  const panel = fakeDocument.createElement('div');
  renderCardPanel(fakeDocument, panel, {
    name_zh: 'X',
    keywords: ['Crush', 'Rhinar Specialization', 'Attack'],
  }, { 'crush': { name_zh: '粉碎', desc_zh: '说明' } });
  const kwBlock = panel.children[3];
  assert.equal(kwBlock.children.length, 2); // label + one resolved line
  assert.equal(kwBlock.children[1].textContent, '· 粉碎：说明');
});

test('renderCardPanel renders no keyword section when the card has none', () => {
  const fakeDocument = createFakeDocument();
  const panel = fakeDocument.createElement('div');
  renderCardPanel(fakeDocument, panel, { name_zh: 'A', keywords: [] }, { 'go again': { name_zh: '再动', desc_zh: 'x' } });
  assert.equal(panel.children.length, 3);
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

test('findCardAnchor accepts a Fablazing text card link', () => {
  const anchor = {
    tagName: 'A',
    href: 'https://fablazing.com/card/up-the-ante-blue',
    attributes: [{ name: 'href', value: '/card/up-the-ante-blue' }],
    getBoundingClientRect() {
      return { left: 100, top: 100, right: 260, bottom: 124, width: 160, height: 24 };
    },
    parentElement: null,
    parentNode: null,
  };
  assert.equal(findCardAnchor(anchor, { body: {} }, 180, 112), anchor);
});

test('findCardAnchor ignores a descendant image the pointer is not over', () => {
  // A card-grid gap / container whitespace: the element under the pointer has
  // no card signals of its own, but an ancestor contains a card <img> that is
  // elsewhere on screen. Without a pointer hit-test this resolves to that far
  // card and keeps the tooltip stuck while the mouse sits on empty space.
  const image = {
    tagName: 'IMG',
    src: 'https://content.fabrary.net/cards/SUP021.webp',
    attributes: [{ name: 'src', value: 'https://content.fabrary.net/cards/SUP021.webp' }],
    getBoundingClientRect() {
      return { left: 100, top: 100, right: 300, bottom: 400, width: 200, height: 300 };
    },
  };
  const container = {
    tagName: 'DIV',
    querySelector(selector) {
      return selector === 'img' ? image : null;
    },
    attributes: [],
    parentElement: null,
    parentNode: null,
  };
  const fakeDocument = { body: {} };

  // Pointer in the whitespace below the card → no anchor
  assert.equal(findCardAnchor(container, fakeDocument, 200, 600), null);
  // Pointer over the card image → the image is the anchor
  assert.equal(findCardAnchor(container, fakeDocument, 200, 200), image);
  // Pointer within the edge slack (a few px off the image) still counts
  assert.equal(findCardAnchor(container, fakeDocument, 100, 100), image);
});

test('findCardAnchor ignores a signal-bearing ancestor whose card image is elsewhere', () => {
  // A card-list row / wrapper carries its own card signal (a title or data-*
  // attribute), so the pointer probe settles on it directly. Its first card
  // image, though, is elsewhere on screen. Empty space inside the row must not
  // resolve to that image, or the list's first card tooltip stays stuck while
  // the mouse is not pointing at any card.
  const image = {
    tagName: 'IMG',
    src: 'https://content.fabrary.net/cards/SUP021.webp',
    attributes: [{ name: 'src', value: 'https://content.fabrary.net/cards/SUP021.webp' }],
    getBoundingClientRect() {
      return { left: 100, top: 100, right: 300, bottom: 400, width: 200, height: 300 };
    },
  };
  const row = {
    tagName: 'DIV',
    title: 'Fyendal\'s Spring Tunic',
    attributes: [{ name: 'title', value: 'Fyendal\'s Spring Tunic' }],
    querySelector(selector) {
      return selector === 'img' ? image : null;
    },
    parentElement: null,
    parentNode: null,
  };
  const fakeDocument = { body: {} };

  // Pointer in the row's empty space, below where the card image sits → no anchor
  assert.equal(findCardAnchor(row, fakeDocument, 200, 600), null);
  // Pointer over the card image itself → the image is the anchor
  assert.equal(findCardAnchor(row, fakeDocument, 200, 200), image);
});

test('findCardPreviewImage returns a large image inside a fixed container', () => {
  const previewImg = {
    tagName: 'IMG',
    getBoundingClientRect() {
      return { height: 400 };
    },
    parentElement: null,
  };
  const fixedContainer = {
    tagName: 'DIV',
    parentElement: null,
    contains() { return true; },
  };
  previewImg.parentElement = fixedContainer;

  const fakeDoc = {
    body: {
      querySelectorAll(selector) {
        assert.equal(selector, 'img');
        return [previewImg];
      },
      contains() { return true; },
    },
  };
  const fakeRoot = {
    innerHeight: 800,
    getComputedStyle(el) {
      assert.equal(el, fixedContainer);
      return { position: 'fixed' };
    },
  };

  assert.equal(findCardPreviewImage(fakeDoc, fakeRoot), previewImg);
});

test('findCardPreviewImage ignores small or unfixed images', () => {
  const smallImg = {
    tagName: 'IMG',
    getBoundingClientRect() {
      return { height: 80 };
    },
    parentElement: null,
  };
  const nonFixedParent = { tagName: 'DIV', parentElement: null };
  smallImg.parentElement = nonFixedParent;
  const bigStaticImg = {
    tagName: 'IMG',
    getBoundingClientRect() {
      return { height: 400 };
    },
    parentElement: null,
  };
  bigStaticImg.parentElement = nonFixedParent;

  const fakeDoc = {
    body: {
      querySelectorAll() {
        return [smallImg, bigStaticImg];
      },
      contains() { return true; },
    },
  };
  const fakeRoot = {
    innerHeight: 800,
    getComputedStyle() {
      return { position: 'static' };
    },
  };

  assert.equal(findCardPreviewImage(fakeDoc, fakeRoot), null);
});

test('installProbe injects a style tag with default CSS variables', () => {
  const fakeDocument = createFakeDocument();
  const instance = installProbe(fakeDocument);

  assert.equal(fakeDocument.head.children.length, 1);
  const style = fakeDocument.head.children[0];
  assert.equal(style.id, 'fab-cn-probe-styles');
  // Variables must live on :root so the settings-dialog preview box (a sibling
  // of the tooltip panel) can resolve them too.
  assert.match(style.textContent, /^:root \{/);
  assert.match(style.textContent, /--fab-cn-name-color:#ffad42/);
  assert.match(style.textContent, /--fab-cn-bg-opacity:0\.94/);
  assert.match(style.textContent, /--fab-cn-border-color:255, 255, 255/);

  instance.destroy();
  assert.equal(fakeDocument.head.children.length, 0);
});

test('SETTINGS_DEFAULTS covers every style knob', () => {
  const defaults = probe.SETTINGS_DEFAULTS;
  assert.equal(typeof defaults.bgColor, 'string');
  assert.equal(typeof defaults.bgOpacity, 'number');
  assert.equal(typeof defaults.borderColor, 'string');
  assert.equal(typeof defaults.borderOpacity, 'number');
  assert.equal(typeof defaults.textColor, 'string');
  assert.equal(typeof defaults.textSize, 'number');
  assert.equal(typeof defaults.nameColor, 'string');
  assert.equal(typeof defaults.nameSize, 'number');
  assert.equal(typeof defaults.typeColor, 'string');
  assert.equal(typeof defaults.typeSize, 'number');
  assert.equal(defaults.panelMode, 'follow');
  assert.equal(defaults.panelPosition, null);
});

test('rgbToHex converts a stored RGB tuple to a hex string', () => {
  assert.equal(probe.rgbToHex('16, 20, 28'), '#10141c');
  assert.equal(probe.rgbToHex('255, 173, 66'), '#ffad42');
  assert.equal(probe.rgbToHex('244, 247, 251'), '#f4f7fb');
  // Missing / malformed input falls back to a dark default tuple (10, 20, 28)
  assert.equal(probe.rgbToHex(''), '#0a141c');
});

test('loadSettings returns full defaults without GM storage', () => {
  const settings = probe.loadSettings();
  assert.equal(settings.panelMode, 'follow');
  assert.equal(settings.nameColor, '#ffad42');
  assert.equal(settings.bgColor, '16, 20, 28');
  assert.equal(settings.panelPosition, null);
});

test('loadSettings merges stored values over defaults', () => {
  const sandbox = {
    URL,
    GM_getValue(key, def) {
      if (key === 'fab-cn-settings') {
        return JSON.stringify({ nameColor: '#ff0000', nameSize: 18 });
      }
      return def;
    },
    GM_setValue() {},
    GM_registerMenuCommand() {},
  };
  sandbox.window = sandbox;
  runInNewContext(source, sandbox, { filename: sourcePath });

  const settings = sandbox.FabCnProbe.loadSettings();
  assert.equal(settings.nameColor, '#ff0000');
  assert.equal(settings.nameSize, 18);
  // Unset fields fall back to defaults
  assert.equal(settings.typeSize, 12);
  assert.equal(settings.textSize, 13);
  assert.equal(settings.panelMode, 'follow');
  assert.equal(settings.bgColor, '16, 20, 28');
});
