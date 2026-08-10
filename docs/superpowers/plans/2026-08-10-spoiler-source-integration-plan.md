# Spoiler Source Integration Plan

> **For agent execution:** follow this plan in the current worktree; preserve unrelated user changes.

**Goal:** Make the project's translation data include the upstream spoiler branch while never rewriting existing translation entries.

**Design:** Use the upstream `usurp-the-shadow-throne` snapshot as the English source. Add a reusable `--only-missing` mode to `scripts/build-translation-drafts.mjs`; it appends drafts for missing keys only. Existing translations, including hand-fixed entries, remain byte-for-byte unchanged at the entry level. Rebuild imported/derived data and `dist` afterward.

## Tasks

1. Add `mergeMissingDrafts()` and the `--only-missing` CLI option in `scripts/build-translation-drafts.mjs`; add a regression test in `probe/test/translations-dir.test.mjs` proving both machine drafts and human-reviewed entries are not overwritten.
2. Replace `data/source/english/card.json` and `card-reference.json` with the pinned `usurp-the-shadow-throne` upstream files, then run `scripts/import-fab-cards.mjs`.
3. Run the only-missing generator for every existing non-hero translation batch and reconcile `heroes.json` with the same preservation rule. Record the source commit and added/changed counts.
4. Rebuild aliases, card data, and `dist`; update `docs/data-update-policy.md`, README/handoff notes as needed.
5. Verify source diff invariants, translation preservation, JSON validity, `git diff --check`, the full test suite, and the production build.

## Verification commands

- `npm test` from `probe/`
- `npm run build` from `probe/`
- `git diff --check`
- source comparison against the pinned upstream commit and translation-key preservation checks
