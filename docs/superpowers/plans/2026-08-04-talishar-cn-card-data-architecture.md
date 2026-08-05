# Talishar Full Card Data Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace embedded card data with a versioned, chunked, cached static card data service while keeping the userscript small.

**Architecture:** A Node build script converts the translation source into `dist/data/manifest.json`, `index.json`, and deterministic chunk files. The browser userscript fetches the index and only the needed chunk, caching responses with Cache Storage. The existing synchronous probe API remains usable in tests through injected card data.

**Tech Stack:** Node.js built-in modules and test runner, browser Fetch API, Cache Storage, JSON.

## Global Constraints

- The userscript must not embed the full Chinese card database.
- The static data must be independently publishable from the userscript.
- Unknown cards and ambiguous variants must not be guessed.
- No click, drag, keyboard, game action, or Talishar network request interception.

---

### Task 1: Build versioned card data artifacts

**Files:**
- Create: `scripts/build-card-data.mjs`
- Create: `probe/test/build-card-data.test.mjs`
- Generate: `dist/data/manifest.json`, `dist/data/index.json`, `dist/data/chunks/*.json`
- Modify: `probe/package.json`

- [ ] **Step 1: Add failing tests for grouping and chunk output**
- [ ] **Step 2: Implement deterministic card normalization and chunk generation**
- [ ] **Step 3: Run the build-data tests and generate current artifacts**

### Task 2: Replace embedded data with remote loader

**Files:**
- Modify: `probe/probe.user.js`
- Modify: `probe/test/probe-core.test.mjs`
- Create: `probe/test/card-loader.test.mjs`
- Modify: `scripts/build-userscript.mjs`
- Modify: `probe/test/build-userscript.test.mjs`

- [ ] **Step 1: Add failing loader tests**
- [ ] **Step 2: Implement manifest/index/chunk loading and Cache Storage use**
- [ ] **Step 3: Update hover handling to load the hovered card asynchronously**
- [ ] **Step 4: Remove embedded card data and verify generated script stays small**

### Task 3: Documentation and complete verification

**Files:**
- Modify: `probe/package.json`
- Modify: `probe/README.md`

- [ ] **Step 1: Document the static data URL and publishing flow**
- [ ] **Step 2: Run the full test suite, data build, userscript build, and syntax checks**
