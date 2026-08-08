# FaBrary Lowest Price Userscript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 在 FaBrary 卡牌列表页和牌组页的牌图右上角显示对应卡牌所有印刷版本中最低的 TCGplayer 美元价格。

**Architecture:** 独立用户脚本只运行在 FaBrary 顶层页面，扫描动态生成的牌图并从卡牌链接取得详情 URL。一个移出视口的同源 iframe 顺序加载卡牌详情页，解析详情页渲染出的 TCGplayer 美元价格，使用当前页面内缓存和共享 badge 更新结果。

**Tech Stack:** Tampermonkey/Violentmonkey userscript、原生 DOM API、`MutationObserver`、`IntersectionObserver`、Node.js built-in `node:test`、现有 `probe` 测试约定。

## Global Constraints

- 只匹配 `https://fabrary.net/cards`、`https://fabrary.net/cards/*` 和 `https://fabrary.net/decks/*`。
- 只读取详情页中的 TCGplayer 美元文本；不调用第三方价格 API，不实现 AWS GraphQL 请求签名。
- 同一页面内同一规范化卡牌 URL 只加载一次；多个牌图共享一个结果。
- 价格显示固定为两位小数；加载中为 `…`，无有效报价或失败为 `—`。
- badge 必须使用 `pointer-events: none`，不能阻拦 FaBrary 原有点击、拖动、悬停行为。
- 详情 iframe 内的 userscript 实例必须退出普通扫描逻辑，避免递归创建 iframe。
- 保留工作区中已有的未提交修改，不暂存或修改无关文件。

## 文件结构

- Create: `probe/fabrary-lowest-price.user.js` — 可直接安装的独立油猴脚本；同时通过 `window.FabPriceProbe` 暴露纯函数和安装入口，供 Node VM 测试。
- Create: `probe/test/fabrary-lowest-price.test.mjs` — 价格解析、URL 识别、详情文档解析、缓存队列和 badge 行为测试。
- Create: `docs/superpowers/plans/2026-08-08-fabrary-lowest-price-plan.md` — 本实现计划。

---

### Task 1: 建立价格解析和卡牌 URL 识别核心

**Files:**

- Create: `probe/test/fabrary-lowest-price.test.mjs`
- Create: `probe/fabrary-lowest-price.user.js`

**Interfaces:**

- Produces `parseDollarAmount(text): number | null`.
- Produces `findLowestDollarPrice(texts): number | null`.
- Produces `formatPrice(value): string`.
- Produces `normalizeCardUrl(href, baseHref): string | null`.
- Produces `slugifyCardName(name): string`.
- Produces `findCardUrlForImage(image, baseHref): string | null`.

- [ ] **Step 1: Write failing unit tests for dollar parsing.**

Add these tests to `probe/test/fabrary-lowest-price.test.mjs` after loading the userscript source in a VM:

```js
test('parseDollarAmount accepts a dollar price and rejects other currencies', () => {
  assert.equal(probe.parseDollarAmount('$1.25'), 1.25);
  assert.equal(probe.parseDollarAmount('$ 0.5'), 0.5);
  assert.equal(probe.parseDollarAmount('€1.25'), null);
  assert.equal(probe.parseDollarAmount('—'), null);
});

test('findLowestDollarPrice returns the lowest valid price', () => {
  assert.equal(probe.findLowestDollarPrice(['$4.50', '$1.25', '€0.20', '—']), 1.25);
  assert.equal(probe.findLowestDollarPrice(['€4.50', '—']), null);
});

test('formatPrice renders two decimal places and an unavailable marker', () => {
  assert.equal(probe.formatPrice(1), '$1.00');
  assert.equal(probe.formatPrice(1.256), '$1.26');
  assert.equal(probe.formatPrice(null), '—');
});
```

- [ ] **Step 2: Run the focused tests and verify the intended failure.**

Run:

```bash
cd probe && node --test test/fabrary-lowest-price.test.mjs
```

Expected: FAIL because the userscript does not yet expose the three price functions.

- [ ] **Step 3: Write failing tests for card URL normalization and fallback slugging.**

Add a minimal fake image/anchor shape and these tests:

```js
test('normalizeCardUrl accepts only FaBrary card detail paths', () => {
  assert.equal(
    probe.normalizeCardUrl('/cards/blacktek-whisperers', 'https://fabrary.net/decks/x'),
    'https://fabrary.net/cards/blacktek-whisperers',
  );
  assert.equal(
    probe.normalizeCardUrl('https://fabrary.net/cards/blacktek-whisperers?x=1#price', 'https://fabrary.net/'),
    'https://fabrary.net/cards/blacktek-whisperers',
  );
  assert.equal(probe.normalizeCardUrl('/decks/example', 'https://fabrary.net/'), null);
  assert.equal(probe.normalizeCardUrl('https://other.example/cards/x', 'https://fabrary.net/'), null);
});

test('findCardUrlForImage prefers an ancestor card link and falls back to alt text', () => {
  const linkedImage = {
    alt: 'Wrong Name',
    parentElement: {
      parentElement: null,
      tagName: 'A',
      href: '/cards/blacktek-whisperers',
      getAttribute(name) { return name === 'href' ? this.href : null; },
    },
  };
  assert.equal(
    probe.findCardUrlForImage(linkedImage, 'https://fabrary.net/decks/example'),
    'https://fabrary.net/cards/blacktek-whisperers',
  );

  const altImage = { alt: "Titan's Fist", parentElement: null };
  assert.equal(
    probe.findCardUrlForImage(altImage, 'https://fabrary.net/cards'),
    'https://fabrary.net/cards/titans-fist',
  );
});
```

- [ ] **Step 4: Run the focused tests and verify the intended failure.**

Run the same focused test command. Expected: FAIL because URL normalization and image lookup are not yet exposed.

- [ ] **Step 5: Implement the minimal pure helpers and VM export.**

Inside the userscript IIFE, implement:

```js
function parseDollarAmount(text) {
  const match = String(text || '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function findLowestDollarPrice(texts) {
  const prices = Array.from(texts || [], parseDollarAmount).filter((value) => value != null);
  return prices.length ? Math.min(...prices) : null;
}

function formatPrice(value) {
  return value == null ? '—' : '$' + Number(value).toFixed(2);
}
```

Use `URL` to validate the `fabrary.net` origin and `/cards/<slug>` pathname, strip query/hash, and return the canonical `https://fabrary.net/cards/<slug>` URL. Use the existing repository's slug convention (`NFKD`, lowercase, apostrophe removal, non-alphanumeric runs to `-`) for `alt` fallback. Walk at most eight ancestors looking for an anchor with an accepted href.

Expose the functions at the end of the IIFE:

```js
root.FabPriceProbe = {
  parseDollarAmount,
  findLowestDollarPrice,
  formatPrice,
  normalizeCardUrl,
  slugifyCardName,
  findCardUrlForImage,
};
```

- [ ] **Step 6: Run the focused tests and verify they pass.**

Run:

```bash
cd probe && node --test test/fabrary-lowest-price.test.mjs
```

Expected: all Task 1 tests PASS.

- [ ] **Step 7: Commit the core helper slice.**

```bash
git add probe/fabrary-lowest-price.user.js probe/test/fabrary-lowest-price.test.mjs
git commit -m "feat: add Fabrary price parsing helpers"
```

### Task 2: Add detail-page price extraction and sequential iframe loader

**Files:**

- Modify: `probe/test/fabrary-lowest-price.test.mjs`
- Modify: `probe/fabrary-lowest-price.user.js`

**Interfaces:**

- Produces `extractPricesFromDetailDocument(doc): number | null`.
- Produces `createPriceLoader(doc, root, options): { load(url): Promise<number | null>, destroy(): void }`.
- `load(url)` resolves cached or newly parsed minimum price and never rejects for page/network/parse failures.

- [ ] **Step 1: Write failing tests for rendered TCGplayer links.**

Add a fake detail document with `querySelectorAll()` returning anchors and test:

```js
test('extractPricesFromDetailDocument reads only TCGplayer dollar links', () => {
  const doc = {
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href*="tcgplayer.com"]');
      return [
        { textContent: '$4.50', getAttribute() { return 'https://www.tcgplayer.com/product/1'; } },
        { textContent: '€0.20', getAttribute() { return 'https://www.tcgplayer.com/product/2'; } },
        { textContent: '$1.25', getAttribute() { return 'https://www.tcgplayer.com/product/3'; } },
      ];
    },
  };
  assert.equal(probe.extractPricesFromDetailDocument(doc), 1.25);
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run the focused test command. Expected: FAIL because detail-document extraction is not implemented.

- [ ] **Step 3: Write a failing test for sequential cache reuse.**

Use a fake document whose `createElement('iframe')` returns an iframe with `contentDocument`, `addEventListener`, and a `src` setter that records navigations. Have the fake detail document expose one `$2.00` TCGplayer anchor after the iframe load callback. Assert that two `load()` calls for the same URL produce one navigation and both resolve to `2`:

```js
test('createPriceLoader reuses an in-flight and completed URL result', async () => {
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
  const root = { setTimeout(callback) { callback(); return 1; }, clearTimeout() {} };
  const loader = probe.createPriceLoader(doc, root, { timeoutMs: 100 });

  const first = loader.load('https://fabrary.net/cards/example');
  const second = loader.load('https://fabrary.net/cards/example');
  onload();
  assert.deepEqual(await Promise.all([first, second]), [2, 2]);
  assert.deepEqual(navigations, ['https://fabrary.net/cards/example']);

  assert.equal(await loader.load('https://fabrary.net/cards/example'), 2);
  assert.deepEqual(navigations, ['https://fabrary.net/cards/example']);
  loader.destroy();
});
```

- [ ] **Step 4: Run the focused test and verify it fails.**

Run the focused test command. Expected: FAIL because the iframe loader is not implemented.

- [ ] **Step 5: Implement detail extraction and one-iframe sequential queue.**

Implement `extractPricesFromDetailDocument` by selecting `a[href*="tcgplayer.com"]`, collecting `textContent`, and passing the values to `findLowestDollarPrice`.

Implement `createPriceLoader` with these rules:

- Create one offscreen iframe and append it to `doc.body` on first load.
- Keep `cache: Map<string, number | null>`, `inflight: Map<string, Promise<number | null>>`, and a FIFO queue.
- `load(url)` returns cached values immediately, returns the existing Promise for duplicate in-flight URLs, and otherwise queues one job.
- Each job sets `iframe.src = url`, waits for the `load` event, polls `iframe.contentDocument` for TCGplayer anchors for at most `timeoutMs` (default 8000), then resolves the parsed minimum or `null`.
- Catch all iframe access/navigation errors and resolve `null`; always remove the in-flight entry and drain the next queued URL.
- `destroy()` cancels timers, clears the queue, removes the iframe, and prevents new jobs from navigating it.

Do not use `fetch`, GraphQL, AWS credentials, or third-party API calls in this loader.

- [ ] **Step 6: Run the focused tests and verify they pass.**

Run:

```bash
cd probe && node --test test/fabrary-lowest-price.test.mjs
```

Expected: all Task 1 and Task 2 tests PASS.

- [ ] **Step 7: Commit the loader slice.**

```bash
git add probe/fabrary-lowest-price.user.js probe/test/fabrary-lowest-price.test.mjs
git commit -m "feat: load Fabrary card prices from detail pages"
```

### Task 3: Add badge rendering, dynamic scanning, and page lifecycle

**Files:**

- Modify: `probe/test/fabrary-lowest-price.test.mjs`
- Modify: `probe/fabrary-lowest-price.user.js`

**Interfaces:**

- Produces `createPriceBadge(doc, image): HTMLElement`.
- Produces `installPriceOverlay(doc, root, options): { scan(): void, destroy(): void }`; `options.loader` may inject a `{ load(url): Promise<number | null>, destroy(): void }` loader for deterministic tests.
- `installPriceOverlay` skips when `root.top !== root`, observes top-level dynamic content, and starts one loader request per normalized card URL.

- [ ] **Step 1: Write failing tests for badge state and duplicate scan behavior.**

Add fake DOM helpers with `style`, `dataset`, `appendChild`, `querySelector`, and event/listener storage. Test the visible behavior:

```js
test('createPriceBadge renders a non-interactive top-right badge', () => {
  const image = { parentElement: { appendChild(node) { this.child = node; } } };
  const doc = { createElement() {
    return { style: {}, dataset: {}, textContent: '', setAttribute() {} };
  } };
  const badge = probe.createPriceBadge(doc, image);
  assert.equal(badge.textContent, '…');
  assert.equal(badge.style.pointerEvents, 'none');
  assert.equal(badge.style.position, 'absolute');
  assert.equal(badge.style.top, '4px');
  assert.equal(badge.style.right, '4px');
});
```

Add this duplicate-scan test using the injectable loader. The fake document returns the same two images from each scan, so the test proves the URL-level deduplication rather than only the image-level badge reuse:

```js
test('installPriceOverlay deduplicates one card URL across repeated scans', async () => {
  const images = [
    { alt: 'Blacktek Whisperers', parentElement: null },
    { alt: 'Blacktek Whisperers', parentElement: null },
  ];
  const appended = [];
  const loaderCalls = [];
  const loader = {
    load(url) {
      loaderCalls.push(url);
      return Promise.resolve(1.25);
    },
    destroy() { this.destroyed = true; },
  };
  const doc = {
    body: { appendChild(node) { appended.push(node); } },
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
  const overlay = probe.installPriceOverlay(doc, root, { loader });

  overlay.scan();
  overlay.scan();
  await Promise.resolve();

  assert.deepEqual(loaderCalls, ['https://fabrary.net/cards/blacktek-whisperers']);
  assert.equal(images[0].parentElement.child.textContent, '$1.25');
  assert.equal(images[1].parentElement.child.textContent, '$1.25');
  overlay.destroy();
  assert.equal(loader.destroyed, true);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run the focused test command. Expected: FAIL because badge creation and overlay installation are not implemented.

- [ ] **Step 3: Implement badge rendering and overlay installation.**

Implement `createPriceBadge` as a `span` appended to the image's nearest usable wrapper. Set:

```js
{
  position: 'absolute',
  top: '4px',
  right: '4px',
  zIndex: '20',
  pointerEvents: 'none',
  padding: '2px 5px',
  borderRadius: '4px',
  background: 'rgba(0, 0, 0, 0.82)',
  color: '#fff',
  font: '700 12px/1.2 sans-serif',
  whiteSpace: 'nowrap',
}
```

Use an attribute such as `data-fab-price-badge="1"` and an image property/WeakMap to make repeated scans idempotent. If the wrapper's computed position is static, set only that wrapper's `style.position = 'relative'`; do not change width, height, display, or layout styles.

Implement `installPriceOverlay`:

1. Return a no-op controller when `root.top !== root` or `doc.body` is unavailable.
2. Create one `createPriceLoader` instance.
3. `scan()` queries `img`, finds each card URL, creates/updates its badge, and registers the image.
4. Use `IntersectionObserver` with `rootMargin: '200px'` when available; otherwise request immediately after registration.
5. Use `MutationObserver` on `doc.body` with `{ childList: true, subtree: true }` and rescan on added nodes. Ignore nodes carrying the script's own badge/iframe marker to prevent observer loops.
6. For each normalized URL, call the loader once; set badge text to `formatPrice(value)` on resolution and update every badge registered for that URL.
7. On route changes or removed nodes, leave the page cache intact but stop updating badges no longer connected to `doc`.
8. `destroy()` disconnects both observers, destroys the loader, and removes all script-created badges.

Add userscript metadata:

```js
// ==UserScript==
// @name         FaBrary 最低美元价格显示
// @namespace    https://fabrary.net/
// @version      0.1.0
// @description  在 FaBrary 卡牌和牌组页面牌图右上角显示 TCGplayer 最低美元价
// @match        https://fabrary.net/cards
// @match        https://fabrary.net/cards/*
// @match        https://fabrary.net/decks/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
```

Start the top-level instance with `installPriceOverlay(document, window)` and expose the test API after installation. Add a `window.__fabPriceOverlayInstalled` guard so SPA route transitions or duplicate injection cannot install a second observer.

- [ ] **Step 4: Run focused tests and verify they pass.**

Run:

```bash
cd probe && node --test test/fabrary-lowest-price.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run the full existing probe test suite.**

Run:

```bash
cd probe && npm test
```

Expected: exit code 0; existing translation review, card loader, alias, and probe tests remain green.

- [ ] **Step 6: Perform static userscript checks.**

Run:

```bash
cd probe && node --check fabrary-lowest-price.user.js
rg -n '^// @(match|run-at|grant)|FabPriceProbe|installPriceOverlay|tcgplayer\.com|pointerEvents' fabrary-lowest-price.user.js
```

Expected: syntax check exits 0; metadata contains exactly the three target route patterns, `@run-at document-idle`, `@grant none`; implementation contains the expected public API, TCGplayer selector, and non-interactive badge rule.

- [ ] **Step 7: Commit the integrated userscript.**

```bash
git add probe/fabrary-lowest-price.user.js probe/test/fabrary-lowest-price.test.mjs
git commit -m "feat: show lowest Fabrary card prices"
```

### Task 4: Final requirement verification and handoff

**Files:**

- Verify: `docs/superpowers/specs/2026-08-08-fabrary-lowest-price-design.md`
- Verify: `probe/fabrary-lowest-price.user.js`
- Verify: `probe/test/fabrary-lowest-price.test.mjs`

- [ ] **Step 1: Re-read the design requirements as a checklist.**

Verify that the script has all three target route matches, top-right badge placement, `…`/price/`—` states, minimum valid dollar selection, same-page cache, single iframe queue, MutationObserver, IntersectionObserver fallback, top-level guard, and no third-party price API.

- [ ] **Step 2: Run fresh verification commands.**

Run:

```bash
git diff --check HEAD~1..HEAD
cd probe && npm test
node --check fabrary-lowest-price.user.js
```

Expected: all commands exit 0. If the repository's pre-existing worktree changes cause unrelated failures, report those failures separately and do not modify them.

- [ ] **Step 3: Check final worktree scope.**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: only the design/plan documents, price userscript, and price tests are part of the new commits; the existing translation-review modifications remain untouched and uncommitted.

- [ ] **Step 4: Hand off installation instructions.**

Report the exact install file path:

```text
probe/fabrary-lowest-price.user.js
```

Tell the user to install the full file into Tampermonkey or Violentmonkey, open a FaBrary cards/deck page, and allow the first visible cards a moment to load their detail-page prices.
