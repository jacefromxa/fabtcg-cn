# Translation Review Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local vanilla-JS translation review tool that groups pitch variants by base card, previews card images on hover, and writes name-only changes to a pending JSON queue.

**Architecture:** A Node 18+ server serves `tools/translation-review/`, reads `data/translations/*.json` and `data/cards.en.json`, exposes paginated JSON APIs, and writes validated POST bodies to `data/review-submissions/pending/`. A separate apply module validates old-value snapshots before changing only `name_zh` in the source batch files.

**Tech Stack:** Node.js ESM, built-in `node:http`, `node:fs`, and `node:test`; browser-native HTML/CSS/JavaScript; no runtime dependencies.

## Global Constraints

- The source of truth is `data/translations/*.json`; never use `dist/data/` as an edit source.
- The server listens on `127.0.0.1:4174` by default and must not expose the project to remote hosts.
- The front end submits only changed card names; it never edits translation files directly.
- A base card row represents all existing `__1`, `__2`, and `__3` entries, but each entry remains independent in storage.
- Applying a rename changes only `name_zh`; preserve `text_zh`, `pitch`, `cost`, `power`, `defense`, `status`, and every unrelated field byte-for-byte at the object level.
- `status` is not displayed, filtered, changed, or used to decide whether a rename is allowed.
- The queue must reject unknown card IDs, wrong batch ownership, missing variants, empty names, malformed JSON, and path traversal.
- A stale old-value snapshot blocks the whole submission; never partially apply a conflicting submission.
- Existing uncommitted changes in `data/translations/heroes.json` and `data/translations/t3-warrior.json` belong to the user and must remain untouched.

---

### Task 1: Build the review data model

**Files:**
- Create: `scripts/translation-review-data.mjs`
- Create: `probe/test/translation-review-data.test.mjs`

**Interfaces:**
- `baseCardId(key: string): string`
- `loadReviewData(options): { batches: Array<{ name: string, row_count: number }>, rowsByBatch: Map<string, ReviewRow[]> }`
- `listReviewCards(data, options): { items: ReviewRow[], total: number, page: number, pageSize: number, totalPages: number }`

`ReviewRow` must contain `card_id`, `batch`, `name_en`, `image_url`, `source`, `current_names`, `current_name`, and `variants`. Each variant must retain its original key, pitch, `name_zh`, `text_zh`, `cost`, `power`, and `defense` for read-only inspection and pitch-safety tests.

- [ ] **Step 1: Write failing tests for base IDs and pitch grouping**

Add fixtures containing `boulder_drop`, `boulder_drop__2`, and two unrelated cards. Assert that the first two become one row, that all variant fields retain their own values, and that the unrelated card remains separate.

```js
function loadReviewDataFromFixtures() {
  return loadReviewData({
    translationsDir: fixtureTranslationsDir,
    englishPath: fixtureEnglishPath,
  });
}

test('groups pitch keys by base card id without merging variant fields', () => {
  const data = loadReviewDataFromFixtures();
  const page = listReviewCards(data, { batch: 't3-guardian', page: 1, pageSize: 50 });
  const row = page.items.find((item) => item.card_id === 'boulder_drop');
  assert.equal(row.variants.length, 2);
  assert.equal(row.variants.find((v) => v.key.endsWith('__2')).power, '6');
  assert.notEqual(row.variants[0].text_zh, row.variants[1].text_zh);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd probe && node --test test/translation-review-data.test.mjs`  
Expected: FAIL because `scripts/translation-review-data.mjs` does not exist.

- [ ] **Step 3: Implement loading, grouping, search, and pagination**

Read each JSON file in `data/translations/`, derive its batch from the filename, and map English metadata from `data/cards.en.json` by slug. Use `key.replace(/__(1|2|3)$/, '')` for grouping. Normalize `page` to at least 1 and clamp `pageSize` to 20–100. Match `q` case-insensitively against English and all current Chinese names. Return an empty result for an unknown batch.

- [ ] **Step 4: Add tests for mixed current names, image fallback, search, and pagination**

Assert that `current_name` is `null` and `current_names` contains per-pitch values when names differ; the first valid printing image is selected; search matches either English or Chinese; and page metadata is correct.

- [ ] **Step 5: Run the focused test and commit**

Run: `cd probe && node --test test/translation-review-data.test.mjs`  
Expected: PASS.  
Commit: `git add scripts/translation-review-data.mjs probe/test/translation-review-data.test.mjs && git commit -m "feat: add translation review data model"`

### Task 2: Implement validated pending-submission writes

**Files:**
- Create: `scripts/translation-review-queue.mjs`
- Create: `probe/test/translation-review-queue.test.mjs`

**Interfaces:**
- `validateSubmission(payload, reviewData): NormalizedSubmission`
- `writeSubmission(payload, options): { fileName: string, path: string, changeCount: number }`
- `ReviewQueueError` with `statusCode: number` and `details: Array<{ card_id: string, reason: string }>`

`NormalizedSubmission` must contain `schema_version: 1`, `submission_id`, `submitted_at`, and `changes`. Each change must contain `card_id`, `batch`, `name_en`, `new_name_zh`, and the exact variant snapshot received from the page.

- [ ] **Step 1: Write failing tests for valid normalization and rejection**

Cover one valid multi-pitch change, empty or whitespace-only names, unknown batches, card IDs belonging to another batch, unknown variant keys, duplicate card IDs, and non-array `changes`.

```js
test('rejects a variant key that is not present in the declared batch', () => {
  assert.throws(
    () => validateSubmission({ changes: [{ ...validChange, variants: [{ key: 'wrong__1', current_name_zh: '旧名' }] }] }, reviewData),
    (error) => error instanceof ReviewQueueError && error.statusCode === 400,
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd probe && node --test test/translation-review-queue.test.mjs`  
Expected: FAIL because the queue module is not implemented.

- [ ] **Step 3: Implement validation and atomic queue writes**

Validate against the loaded review data, reject control characters and names longer than 200 Unicode code points, and require every submitted variant to be an existing variant of the declared base card. Create `pending/` if absent. Write JSON to a same-directory temporary file and rename it to `submission-<UTC timestamp>-<random id>.json` so the server never leaves a partially written final file.

- [ ] **Step 4: Add tests for deterministic file contents and no-op changes**

Inject a clock and ID factory in tests. Assert the generated document includes schema version, timestamp, and all snapshots, and that the source fixture is unchanged. The queue may accept a valid name equal to one variant's old name because mixed-name cards can still be normalized.

- [ ] **Step 5: Run the focused test and commit**

Run: `cd probe && node --test test/translation-review-queue.test.mjs`  
Expected: PASS.  
Commit: `git add scripts/translation-review-queue.mjs probe/test/translation-review-queue.test.mjs && git commit -m "feat: write translation review submissions"`

### Task 3: Apply submissions with stale-snapshot protection

**Files:**
- Create: `scripts/apply-translation-submissions.mjs`
- Create: `probe/test/apply-translation-submissions.test.mjs`

**Interfaces:**
- `applySubmissionFile(filePath, options): { cardCount: number, variantCount: number, processedPath: string }`
- CLI: `node scripts/apply-translation-submissions.mjs [pending-file]`

- [ ] **Step 1: Write failing tests for name-only application**

Create temporary batch files with two pitch variants containing different `text_zh` and powers. Apply a queue file and assert both `name_zh` fields change while every other field, including `status`, remains equal to the original object.

- [ ] **Step 2: Add failing conflict and rollback tests**

Change one current name after creating the queue snapshot. Assert the function throws a conflict error, leaves every source file unchanged, and leaves the queue file in `pending/`. Add a multi-batch fixture and assert validation occurs for all changes before any file is replaced.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `cd probe && node --test test/apply-translation-submissions.test.mjs`  
Expected: FAIL because the apply module is not implemented.

- [ ] **Step 4: Implement all-or-nothing validation and atomic batch writes**

Load and parse the queue file, validate every batch and variant against the current source, clone affected batch objects in memory, and change only `name_zh`. Write each changed batch to a same-directory temporary file, then replace the original files. On success, write the processed copy with `processed_at` and rename the original queue file into `processed/`. On conflict, do not write or move anything.

- [ ] **Step 5: Implement the CLI and run tests**

With no argument, process sorted pending files and exit nonzero if any file conflicts. With an argument, process only that file. Print applied card and variant counts.  
Run: `cd probe && node --test test/apply-translation-submissions.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit the apply workflow**

Commit: `git add scripts/apply-translation-submissions.mjs probe/test/apply-translation-submissions.test.mjs && git commit -m "feat: apply translation review submissions safely"`

### Task 4: Add the local HTTP server

**Files:**
- Create: `scripts/translation-review-server.mjs`
- Create: `probe/test/translation-review-server.test.mjs`

**Interfaces:**
- `createReviewServer({ projectRoot, staticDir, translationsDir, englishPath, pendingDir, port }): { server, port }`
- `GET /api/health` returns `{ "ok": true }`.
- `GET /api/batches` returns batch names and row counts.
- `GET /api/cards?batch=<name>&q=<query>&page=<n>&page_size=<n>` returns the pagination object from Task 1.
- `POST /api/submissions` returns `201` with `{ fileName, changeCount }`.

- [ ] **Step 1: Write failing endpoint tests**

Start the server on port 0 with temporary fixtures. Test health, batch response, card search/pagination, successful POST, malformed JSON, unsupported methods, missing batch, and a path traversal request such as `/../data/cards.en.json`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd probe && node --test test/translation-review-server.test.mjs`  
Expected: FAIL because the server module is not implemented.

- [ ] **Step 3: Implement routing and safe static serving**

Use `node:http`. Parse the URL with `new URL`, route `/api/*` separately from static files, enforce `127.0.0.1`, limit POST bodies to 1 MiB, require JSON content type, and return status 400 for malformed or invalid input, 404 for missing routes, 405 for unsupported methods, 413 for oversized bodies, 415 for a non-JSON POST, and 500 for unexpected server errors. Resolve static paths beneath `tools/translation-review/` and return only `index.html`, `app.js`, and `styles.css`.

- [ ] **Step 4: Connect data and queue modules**

Load review data for each API request so source edits become visible without restarting the server. Pass the same loaded data to `validateSubmission` before `writeSubmission`. Do not expose filesystem paths in API responses.

- [ ] **Step 5: Run endpoint tests and commit**

Run: `cd probe && node --test test/translation-review-server.test.mjs`  
Expected: PASS.  
Commit: `git add scripts/translation-review-server.mjs probe/test/translation-review-server.test.mjs && git commit -m "feat: add local translation review server"`

### Task 5: Build the browser UI

**Files:**
- Create: `tools/translation-review/index.html`
- Create: `tools/translation-review/app.js`
- Create: `tools/translation-review/styles.css`
- Modify: `probe/package.json`

**Interfaces:**
- `app.js` consumes the three API endpoints from Task 4 and sends the exact `POST /api/submissions` payload from Task 2.
- `npm run review` starts `node ../scripts/translation-review-server.mjs`.

- [ ] **Step 1: Create the semantic page shell**

Add a title, search input, batch navigation, table with `卡名 / 现译名 / 更新译名`, pagination controls, a fixed image preview element, status message area, and fixed bottom submit bar. Keep the update input blank by default.

- [ ] **Step 2: Implement stateful data loading and rendering**

Use a single state object with `batch`, `query`, `page`, `pageSize`, `rows`, and `edits: Map<string, string>`. Fetch the selected page, preserve edits by `card_id` while switching tabs or pages, and render all card-provided values using `textContent` or DOM property assignment rather than interpolating untrusted values into HTML.

- [ ] **Step 3: Implement hover previews and mixed-name warnings**

On pointer enter of the English card name, place the fixed preview near the pointer, display the first `image_url`, and show a source link fallback when the image errors. For a row with multiple current names, render a visible warning and the per-pitch names without changing the one-row grouping.

- [ ] **Step 4: Implement edit tracking and submission**

Store trimmed input by base `card_id`; remove an edit when the input is blank or exactly matches the row's single current name. Build `changes` from the edited rows and their untouched variant snapshots. Disable the button when there are no edits, show the returned queue filename on `201`, clear only successfully submitted edits, and retain all edits on errors.

- [ ] **Step 5: Add responsive styling and accessible behavior**

Use a readable wide table, sticky header/footer, visible focus rings, keyboard-accessible tabs and inputs, `aria-live` feedback, and a preview size that stays inside the viewport. Keep the first version desktop-oriented but usable at narrow widths through horizontal scrolling.

- [ ] **Step 6: Add the package script and run a static smoke test**

Add exactly `"review": "node ../scripts/translation-review-server.mjs"` to `probe/package.json`. Start the server with `cd probe && npm run review`, then fetch `/`, `/app.js`, and `/styles.css` and confirm successful content types. Stop the server after the smoke test.

- [ ] **Step 7: Commit the UI**

Commit: `git add tools/translation-review probe/package.json && git commit -m "feat: add translation review UI"`

### Task 6: Document, integrate, and verify the complete workflow

**Files:**
- Modify: `README.md`
- Modify: `probe/README.md`
- Test: `probe/test/translation-review-data.test.mjs`
- Test: `probe/test/translation-review-queue.test.mjs`
- Test: `probe/test/apply-translation-submissions.test.mjs`
- Test: `probe/test/translation-review-server.test.mjs`

- [ ] **Step 1: Document local startup and apply commands**

Add the following workflow to the local-development documentation:

```bash
cd probe
npm run review
# edit in http://127.0.0.1:4174
node ../scripts/apply-translation-submissions.mjs
npm run build:data
npm test
```

Explain that the browser writes only to `data/review-submissions/pending/`, that the Agent applies pending files after snapshot validation, and that the existing source `status` field is intentionally untouched.

- [ ] **Step 2: Run all focused and existing tests**

Run: `cd probe && npm test`  
Expected: all existing tests plus the new review-tool tests pass.

- [ ] **Step 3: Run the build regression check**

Run: `cd probe && npm run build:data`  
Expected: the existing `dist/data/` artifacts build successfully. Do not commit generated data changes caused only by the test run unless the build actually changed source-backed artifacts.

- [ ] **Step 4: Perform a local end-to-end smoke test**

Start `npm run review`, use the browser to select a non-pitched card and a multi-pitch card, hover each English name, enter new names, submit, inspect the pending JSON, and verify its variant snapshots. Run the apply CLI against a copied fixture, then confirm only `name_zh` changes and the queue moves to `processed/`.

- [ ] **Step 5: Run final verification and inspect the worktree**

Run `git diff --check`, `git status --short`, and `cd probe && npm test`. Confirm the only pre-existing dirty files remain the user's two translation files, and report any generated or new files explicitly.

- [ ] **Step 6: Commit the documentation and integration changes**

Commit: `git add README.md probe/README.md && git commit -m "docs: document translation review workflow"`
