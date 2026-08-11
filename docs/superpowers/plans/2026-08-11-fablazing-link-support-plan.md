# Fablazing Card Link Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the userscript resolve Fablazing `/card/...-red|yellow|blue` text links while preserving the existing image-based Talishar and FaBrary behavior.

**Architecture:** Extend the existing userscript candidate model with validated Fablazing card-link URLs. Parse the card slug and pitch color into a small `{ slug, pitch }` helper result, use the slug as the existing grouped database key, and expose the pitch metadata for deterministic tests and future pitch-aware display. No new data source or database schema is introduced.

**Tech Stack:** Browser userscript JavaScript, Node.js built-in test runner, existing `probe/talishar-cn.user.js` build/test workflow.

## Global Constraints

- Do not modify translation data or the English source database.
- Do not add Fablazing API scraping or depend on hashed React assets.
- Keep the userscript program version at `0.7.25`.
- Preserve existing Talishar image, Talishar preview, and FaBrary printing-ID resolution order.
- Generated userscript output remains the only browser artifact; `dist/data` is unchanged by this feature.

---

### Task 1: Add failing coverage for Fablazing link candidates

**Files:**
- Modify: `probe/test/aliases.test.mjs`
- Modify: `probe/test/probe-core.test.mjs`

**Interfaces:**
- The browser API will expose `extractFablazingCardLink(value)` returning `{ slug, pitch }` or `null`.
- `collectCandidates(element)` will return a `linkUrls` array only for valid Fablazing card links.
- `resolveCardKeys(collectCandidates(anchor), aliases)` will include the grouped card slug.

- [ ] **Step 1: Write the failing helper and resolution tests**

Add to `probe/test/aliases.test.mjs`:

```js
const {
  resolveCardKeys,
  slugifyCardName,
  extractPrintingId,
  normalizeStem,
  extractFablazingCardLink,
  collectCandidates,
} = browserSandbox.FabCnProbe;

test('extractFablazingCardLink parses card slug and pitch color', () => {
  assert.deepEqual(
    extractFablazingCardLink('https://fablazing.com/card/up-the-ante-blue'),
    { slug: 'up_the_ante', pitch: '3' },
  );
  assert.deepEqual(
    extractFablazingCardLink('/card/hold-em-red'),
    { slug: 'hold_em', pitch: '1' },
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
  assert.deepEqual(candidate.linkUrls, ['https://fablazing.com/card/up-the-ante-blue']);
  assert.ok(resolveCardKeys(candidate, null).includes('up_the_ante'));
});
```

Add to `probe/test/probe-core.test.mjs`:

```js
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
```

- [ ] **Step 2: Run focused tests and confirm the expected failures**

Run from `probe/`:

```bash
node --test test/aliases.test.mjs test/probe-core.test.mjs
```

Expected result: the new tests fail because `extractFablazingCardLink` is not exported and `collectCandidates` does not yet provide `linkUrls`.

---

### Task 2: Implement validated Fablazing link resolution

**Files:**
- Modify: `probe/talishar-cn.user.js`

**Interfaces:**
- `extractFablazingCardLink(value)` parses only `/card/<slug>-red|yellow|blue` paths on Fablazing and returns `{ slug, pitch }`.
- `collectCandidates(element)` stores validated links in `linkUrls` and treats them as card signals.
- `resolveCardKeys(candidate, aliases)` considers link-derived slugs after image-derived aliases and before alt/title fallback.

- [ ] **Step 1: Add the minimal link parser and candidate field**

Implement after `slugifyCardName()`:

```js
function extractFablazingCardLink(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed;
  try {
    parsed = new URL(value, root.location?.href || 'https://fablazing.com/');
  } catch {
    return null;
  }
  if (parsed.hostname !== 'fablazing.com' || !parsed.pathname.startsWith('/card/')) return null;
  const rawSlug = parsed.pathname.slice('/card/'.length).replace(/\/$/, '');
  const match = rawSlug.match(/^(.*?)-(red|yellow|blue)$/i);
  if (!match || !match[1]) return null;
  const pitch = { red: '1', yellow: '2', blue: '3' }[match[2].toLowerCase()];
  const slug = slugifyCardName(decodeURIComponent(match[1].replace(/-/g, ' ')));
  return slug ? { slug, pitch } : null;
}
```

Add `linkUrls: []` to the candidate object. Record `element.href` or the `href` attribute only when `extractFablazingCardLink()` accepts it. Include `linkUrls.length` in `hasCandidateSignals()`.

- [ ] **Step 2: Add link-derived keys without changing existing priority**

In `resolveCardKeys()`, after the image alias loop and before the alt/title slug fallback, append each parsed link slug. Keep image aliases first so an actual card image remains authoritative when an anchor also contains an image.

- [ ] **Step 3: Export the helper and run the focused tests**

Add `extractFablazingCardLink` to the public `FabCnProbe` API, then run:

```bash
node --test test/aliases.test.mjs test/probe-core.test.mjs
```

Expected result: all focused tests pass, including red/yellow/blue pitch parsing and the text-link anchor hit test.

---

### Task 3: Verify the userscript and run full verification

**Files:**
- Modified: `probe/talishar-cn.user.js`

- [ ] **Step 1: Verify the userscript source and version**

The userscript is the repository's hand-maintained browser artifact; there is no separate userscript build command in `probe/package.json`. After the source edit, verify from the project root:

```bash
rg -n 'extractFablazingCardLink|@version' probe/talishar-cn.user.js
```

The helper must be present and `// @version` must remain `0.7.25`.

- [ ] **Step 2: Run the complete test suite**

Run from `probe/`:

```bash
npm test
```

Expected result: every existing test plus the new Fablazing tests passes with zero failures.

- [ ] **Step 3: Check the final diff and program version**

Run from the project root:

```bash
git diff --check
git diff --stat
rg -n '^// @version' probe/talishar-cn.user.js
```

Confirm only the spec/plan documents and userscript source changed; no translation data or `dist/data` files changed, and the userscript version remains `0.7.25`.
