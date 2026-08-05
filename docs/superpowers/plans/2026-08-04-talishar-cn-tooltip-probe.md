# Talishar Chinese Tooltip Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained Tampermonkey probe that reports the card-related DOM attributes under the mouse on Talishar without changing game interactions.

**Architecture:** A single browser userscript installs one delegated `pointerover` listener and one fixed debug panel. Pure candidate-extraction helpers remain exportable under Node so URL and attribute normalization can be tested without a live Talishar session. The probe never calls Talishar or fabtcg.cn APIs.

**Tech Stack:** Plain JavaScript UMD-style userscript, Tampermonkey metadata, Node.js built-in test runner, no runtime dependencies.

## Global Constraints

- Only match `https://talishar.net/*`.
- Do not intercept clicks, drags, keyboard input, network requests, or game actions.
- Do not infer hidden cards.
- Use event delegation rather than per-card listeners.
- Unknown or missing identifiers must be reported as candidates, never guessed into a card name.
- Keep all UI selectors prefixed with `fab-cn-probe-`.

---

## Planned File Structure

- Create: `probe/package.json` — Node test command only.
- Create: `probe/probe.user.js` — installable Tampermonkey script and reusable probe helpers.
- Create: `probe/test/probe-core.test.mjs` — tests for candidate extraction and normalization.
- Create: `probe/README.md` — installation, live Talishar test procedure, and expected output.

### Task 1: Create the probe package and pure candidate helpers

**Files:**
- Create: `probe/package.json`
- Create: `probe/probe.user.js`
- Create: `probe/test/probe-core.test.mjs`

**Interfaces:**
- Produces `collectCandidates(input)` returning `{ tagName, className, attributes, imageUrls, textHints }`.
- Produces `extractImageTokens(url)` returning a de-duplicated string array from the URL pathname, filename, and query values.
- Produces `normalizeCandidate(value)` returning a trimmed lower-case identifier-like string, or `null` for empty values.
- Produces `installProbe(doc)` which attaches the delegated pointer listener and returns `{ destroy }`.

- [ ] **Step 1: Add the Node test command and test module format**

Create `probe/package.json`:

```json
{
  "name": "talishar-cn-tooltip-probe",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

Run `cd probe && npm test`.

Expected: the command starts successfully and reports zero discovered tests.

- [ ] **Step 2: Write failing tests for URL and attribute normalization**

Create `probe/test/probe-core.test.mjs` with these cases:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import probe from '../probe.user.js';

const {
  extractImageTokens,
  normalizeCandidate,
  collectCandidates,
} = probe;

test('extractImageTokens returns filename and path tokens', () => {
  const tokens = extractImageTokens('https://cdn.example/cards/WTR001.jpg?v=2');
  assert.deepEqual(tokens, ['wtr001', '2']);
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
  assert.deepEqual(result.attributes['data-card-id'], ['wtr001']);
  assert.deepEqual(result.imageUrls, ['https://cdn.example/cards/WTR001.jpg']);
});
```

Run `cd probe && npm test`.

Expected: FAIL because `probe.user.js` does not yet export the helpers.

- [ ] **Step 3: Implement the pure helpers**

Implement the three helpers in `probe/probe.user.js` inside a UMD-style wrapper so the same file runs as a classic Tampermonkey script and can be loaded by Node's CommonJS loader:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, false);
  } else {
    root.FabCnProbe = factory(root, true);
  }
})(typeof globalThis === 'object' ? globalThis : this, function (root, autoInstall) {
  // pure helpers and installProbe live here
  return { extractImageTokens, normalizeCandidate, collectCandidates, installProbe };
});
```

When `autoInstall` is true and `root.document` exists, call `installProbe(root.document)` after defining the API. Do not use `export` or `import` in the userscript.

Implement the three helpers with these rules:

- `normalizeCandidate` returns `null` for non-string or whitespace-only input.
- `extractImageTokens` uses `new URL()` when possible, splits pathname and query values on `/`, `_`, `-`, `.`, and `=`, normalizes tokens, and removes duplicates while preserving order.
- `collectCandidates` accepts a DOM element or the fake element shape from the tests, reads `tagName`, `className`, `src`, `alt`, `title`, and only `data-*` attributes, and returns normalized values in arrays.
- Expose the helpers through `module.exports` in Node and `window.FabCnProbe` in the browser.

Run `cd probe && npm test`.

Expected: all three tests PASS.

- [ ] **Step 4: Commit the pure probe helper change when a repository is available**

Run:

```bash
git add probe/package.json probe/probe.user.js probe/test/probe-core.test.mjs
git commit -m "feat: add Talishar card candidate probe core"
```

If the workspace is not a Git repository, retain the files and report that the commit could not be created; do not initialize a repository without user direction.

### Task 2: Add the live Talishar debug panel

**Files:**
- Modify: `probe/probe.user.js`
- Create: `probe/README.md`

**Interfaces:**
- Consumes: `collectCandidates(element)` and `extractImageTokens(url)` from Task 1.
- Produces: an installable userscript that adds `#fab-cn-probe-panel` and returns a `destroy()` cleanup method from `installProbe(document)`.

- [ ] **Step 1: Add a DOM test fixture for panel lifecycle**

Extend `probe/test/probe-core.test.mjs` with a deterministic fake document containing:

- `body.appendChild` and `body.removeChild` methods;
- `createElement` returning an object with `id`, `style`, `textContent`, and `remove`;
- `addEventListener` and `removeEventListener` methods that record the callback by event name.

Call `installProbe(fakeDocument)`, assert that the `pointerover` callback is registered and the panel is appended, then call `destroy()` and assert that the callback is removed and the panel is detached.

Run `cd probe && npm test`.

Expected: FAIL until `installProbe` and the panel lifecycle exist.

- [ ] **Step 2: Implement the fixed debug panel**

Implement a panel with these properties:

```css
#fab-cn-probe-panel {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147483647;
  max-width: 360px;
  max-height: 45vh;
  overflow: auto;
  pointer-events: none;
  font: 12px/1.4 monospace;
}
```

The panel must show the current tag, class, normalized image tokens, `data-*` values, `alt`, `title`, and source URL. Render text through `textContent`, not `innerHTML`.

- [ ] **Step 3: Add delegated hover handling**

Attach one `pointerover` listener to `document`. On each event:

1. Start at `event.target`.
2. Walk at most six ancestors or stop at `document.body`.
3. Prefer the nearest element containing an `img`, `src`, `alt`, `title`, or `data-*` attribute.
4. Update the panel with `collectCandidates` output.
5. Do not call `preventDefault`, `stopPropagation`, or any network API.

Run `cd probe && npm test`.

Expected: all automated tests PASS.

- [ ] **Step 4: Document live installation and verification**

Create `probe/README.md` with:

1. Install Tampermonkey.
2. Create a new userscript and paste `probe.user.js`.
3. Open Talishar and enter a match or spectator view containing visible cards.
4. Move the mouse over a hand card, an arena card, and a combat-chain card.
5. Record the candidate identifiers shown in the panel.
6. Check that clicks and drags still behave normally.

Include a small report template:

```text
Talishar URL:
Zone:
Image URL:
alt/title:
data-*:
Candidate ID:
```

- [ ] **Step 5: Commit the live probe change when a repository is available**

Run:

```bash
git add probe/probe.user.js probe/test/probe-core.test.mjs probe/README.md
git commit -m "feat: add Talishar live DOM probe"
```

### Task 3: Live verification and handoff to the Chinese data phase

**Files:**
- Modify: `probe/README.md`
- Create: `probe/observations.md`

**Interfaces:**
- Consumes: live candidate output from Task 2.
- Produces: a recorded mapping decision for the next phase; no Chinese card data is added yet.

- [ ] **Step 1: Record observations for three visible cards**

Use the README report template for one hand card, one arena card, and one combat-chain card. Do not record usernames, game chat, or hidden-card information.

- [ ] **Step 2: Decide the Talishar key format**

Choose one of these outcomes based on observations:

- A stable card code is present in the image path or `data-*` attribute: use it as the local JSON key.
- Only a name is present: create a name-to-ID adapter and defer reprint disambiguation.
- No stable identifier is present: inspect the public Talishar-FE card rendering code before adding a data source dependency.

Write the selected outcome in `probe/observations.md` with one example and its limitation.

- [ ] **Step 3: Define the next data-import task**

Only after the key format is confirmed, compare those keys with a small sample from `fabtcg.cn`. The next phase will add `cards.zh.json` and a 3-card tooltip; it must not add runtime requests to `fabtcg.cn` unless its endpoint has been explicitly verified.

## Verification Checklist

- `cd probe && npm test` passes.
- The userscript installs without syntax errors in Tampermonkey.
- The debug panel appears only on Talishar pages.
- Hovering visible cards updates the panel.
- React page re-rendering does not require reinstallation.
- Clicking and dragging cards still work.
- No external request is made by the probe.
- No hidden-card information is displayed or inferred.
