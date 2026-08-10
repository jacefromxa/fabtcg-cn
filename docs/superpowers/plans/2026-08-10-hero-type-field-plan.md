# Hero Type Field Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve hero cards' English category field through the build so the existing frontend fallback can display it.

**Architecture:** Keep `heroes.json` unchanged. Extend the normalized published card shape in `scripts/build-card-data.mjs` with `type_en`; the existing userscript already renders `type_zh || type_en`. Add a focused `buildCardArtifacts` regression test, then rebuild generated data.

**Tech Stack:** Node.js ESM, Node test runner, existing `probe` build scripts.

## Global Constraints

- Do not alter translation source entries or frontend layout/rendering logic.
- Preserve existing `type_zh` behavior for non-hero cards.
- Generated `dist/data` must be rebuilt from source.

---

### Task 1: Lock the published hero category contract

**Files:**
- Modify: `probe/test/build-card-data.test.mjs`
- Modify: `scripts/build-card-data.mjs`
- Generated: `dist/data/chunks/heroes.json`, `dist/data/index.json`, `dist/data/manifest.json`

**Interfaces:**
- `buildCardArtifacts(cardData, cardBatch)` continues to return `{ manifest, index, chunks }`.
- A normalized published card includes `type_en` alongside `type_zh`.

- [x] **Step 1: Write the failing test**

Add a `buildCardArtifacts` test with a hero-shaped entry whose `type_zh` is empty and `type_en` is `Shadow Necromancer Hero - Young`; assert the published card retains that `type_en` value.

- [x] **Step 2: Run the focused test and confirm the expected failure**

Run `node --test test/build-card-data.test.mjs` from `probe/`.

Expected failure: the new assertion receives `undefined` because `normalizeCard()` currently omits `type_en`.

- [x] **Step 3: Implement the minimal fix**

In `normalizeCard()` return object, add:

```js
type_en: first.type_en || '',
```

Leave the userscript and translation files unchanged.

- [x] **Step 4: Re-run focused tests and rebuild data**

Run:

```bash
node --test test/build-card-data.test.mjs
npm run build
```

Expected: focused tests pass and the generated hero chunk contains `type_en` for existing heroes.

- [x] **Step 5: Run full verification**

Run `npm test` from `probe/` and `git diff --check` from the project root. All tests must pass and no whitespace errors may be reported.
