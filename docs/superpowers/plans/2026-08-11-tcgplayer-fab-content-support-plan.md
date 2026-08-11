# TCGplayer FAB Content Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the existing Chinese card tooltip for inline card links,
deck-list card rows, and showcase card images in TCGplayer Flesh and Blood
articles.

**Architecture:** The userscript will load on TCGplayer content URLs and keep a lightweight pointer listener alive while the SPA mounts its article. At hover time it uses the FAB breadcrumb guard, then parses only TCGplayer's explicit inline card embed, deck-row card link, or showcase-card image structures into a slug and optional pitch, reusing the current card-data lookup and hover UI. The existing fetch/cache loader falls back to a narrowly granted userscript request when a site's CSP blocks GitHub.

**Tech Stack:** Tampermonkey userscript JavaScript, Node.js built-in test runner, existing JSON card artifacts.

## Global Constraints

- Preserve the uncommitted Felt Table implementation already present on this branch.
- Do not change `data/source`, `data/translations`, or `dist/data`.
- Match only `https://www.tcgplayer.com/content/*`; show cards on TCGplayer only when `/content/flesh-and-blood` exists at hover time.
- Grant `GM_xmlhttpRequest` and connect only to `raw.githubusercontent.com` for production data fallback when a site blocks page fetches.
- Accept a TCGplayer card only when it has a complete site-owned signature:
  inline `card-hover-link` + `data-embed="card-hover"` + name; a card link in
  `.martech-deck-embed .list__item`; or a showcase image in the dedicated
  `CardShowcaseCard` link component.
- Do not push, merge, or release as part of this task.

---

## File Structure

- `probe/talishar-cn.user.js` — userscript metadata, TCGplayer document gate, embed parser, candidate integration, and API export.
- `probe/test/aliases.test.mjs` — direct parsing and slug-resolution regression tests for the TCGplayer card embed.
- `probe/test/probe-core.test.mjs` — userscript metadata, document-gate, and hover-target behavior tests.
- `docs/superpowers/specs/2026-08-11-tcgplayer-fab-content-support-design.md` — agreed design and scope.

### Task 1: Lock TCGplayer behavior with failing tests

**Files:**
- Modify: `probe/test/aliases.test.mjs`
- Modify: `probe/test/probe-core.test.mjs`

**Interfaces:**
- Consumes: existing `collectCandidates(candidate)` and `resolveCardKeys(candidate, aliases)`.
- Produces: desired API contracts for `extractTcgplayerCardEmbed(element)` and `shouldInstallProbe(document)`.

- [ ] **Step 1: Write the failing parser and resolution tests**

```js
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
assert.ok(resolveCardKeys(collectCandidates(embed), null).includes('scar_for_a_scar'));
```

Add a separate assertion that an element with the same class and name but
without `data-embed="card-hover"` returns `null` and produces no TCGplayer
card candidate.

- [ ] **Step 2: Write the failing installation and metadata tests**

```js
assert.match(source, /^\/\/ @match\s+https:\/\/www\.tcgplayer\.com\/content\/\*$/m);
assert.equal(shouldInstallProbe({
  location: { hostname: 'www.tcgplayer.com' },
  querySelector: (selector) => selector.includes('/content/flesh-and-blood') ? {} : null,
}), true);
assert.equal(shouldInstallProbe({
  location: { hostname: 'www.tcgplayer.com' },
  querySelector: () => null,
}), false);
```

- [ ] **Step 3: Run focused tests and verify they fail because the APIs and metadata are absent**

Run: `node --test test/aliases.test.mjs test/probe-core.test.mjs`

Expected: failures naming `extractTcgplayerCardEmbed` and
`shouldInstallProbe`, plus the missing userscript match.

### Task 2: Implement the minimal TCGplayer adapter

**Files:**
- Modify: `probe/talishar-cn.user.js:1-24`
- Modify: `probe/talishar-cn.user.js:160-430`
- Modify: `probe/talishar-cn.user.js:1820-1875`

**Interfaces:**
- Consumes: the tests from Task 1 and existing `slugifyCardName`,
  `collectCandidates`, `resolveCardKeys`, `findProbeTarget`, and `installProbe`.
- Produces: `extractTcgplayerCardEmbed(element) -> { slug: string, pitch: '1' | '2' | '3' | null } | null` and `shouldInstallProbe(doc) -> boolean` in `FabCnProbe`.

- [ ] **Step 1: Add the userscript match and title copy**

```js
// @match          https://www.tcgplayer.com/content/*
```

Include `TCGplayer` in the displayed userscript names and descriptions, and
bump the script version once from the current in-worktree value.

- [ ] **Step 2: Add strict TCGplayer embed parsing**

```js
function extractTcgplayerCardEmbed(element) {
  // Require card-hover-link + data-embed=card-hover.
  // Read name, strip optional Red/Yellow/Blue suffix, slugify the card name.
  // Return { slug, pitch } or null.
}
```

Store a valid result in `candidate.embeddedCards`, count it in
`hasCandidateSignals`, and make `resolveCardKeys` add its slug before generic
alt/title and image fallbacks.

- [ ] **Step 3: Gate only TCGplayer installation by FAB breadcrumbs**

```js
function shouldInstallProbe(doc) {
  // Non-TCGplayer documents remain supported.
  // TCGplayer documents require a /content/flesh-and-blood link.
}
```

Call `installProbe` only when this guard returns true. Export both helpers in
the public `FabCnProbe` API for direct behavior tests.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `node --test test/aliases.test.mjs test/probe-core.test.mjs`

Expected: all tests in both files pass with no failures.

### Task 3: Validate the complete worktree

**Files:**
- Verify: all modified files above, including the pre-existing Felt Table work.

**Interfaces:**
- Consumes: complete userscript and all project test suites.
- Produces: verification evidence only; no publishing action.

- [ ] **Step 1: Run the full project test suite**

Run: `npm test` from `probe/`.

Expected: exit status 0 and every test passes.

- [ ] **Step 2: Inspect whitespace, scope, and final state**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only Felt Table, TCGplayer, and their design/
plan/test changes appear; no source translation or `dist/data` modifications.

- [ ] **Step 3: Do not publish**

Leave the verified changes in the current worktree for the user's subsequent
review or explicit release instruction.
