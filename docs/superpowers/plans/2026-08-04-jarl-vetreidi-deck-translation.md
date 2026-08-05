# Jarl Vetreiði Deck Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the Jarl Vetreiði “Calling: Edinburgh 5th” deck list and readable Simplified Chinese card data to the Talishar tooltip project.

**Architecture:** Keep deck composition separate from card translations. The deck file records quantities and pitch colors; the Chinese card index records one entry per card variant using `__pitch` suffixes where the same card name has different values. The existing userscript build process embeds the Chinese index into a single installable browser userscript.

**Tech Stack:** JSON data, plain JavaScript userscript, Node.js built-in test runner.

## Global Constraints

- Preserve the supplied deck quantities and red/yellow/blue pitch labels.
- Use readable Simplified Chinese; retain English names and source text for review.
- Do not invent missing card identifiers; use normalized Talishar image stems and `__pitch` for variants.
- Run the existing test suite and userscript build after data changes.

---

### Task 1: Add the deck manifest

**Files:**
- Create: `data/decks/jarl-vetreidi-calling-edinburgh-5th.json`

- [ ] **Step 1: Write the complete deck manifest**

Store the deck metadata, 12 arena cards, and the 68 deck cards supplied in the user-provided list. Each card entry has `key`, `name_en`, `quantity`, and `pitch` (`null` for arena cards).

- [ ] **Step 2: Validate the manifest**

Run a Node JSON parse and assert the arena total is 12 and deck total is 68.

### Task 2: Add Chinese card records

**Files:**
- Modify: `data/cards.zh-CN.json`

**Interfaces:**
- Consumes: English records in `data/cards.en.json`.
- Produces: Chinese records keyed by Talishar normalized image stem and `__pitch` variant.

- [ ] **Step 1: Add one record for each unique card variant**

Each record includes `name_zh`, `name_en`, `type_zh`, `power`, `defense`, `pitch`, `text_zh`, `text_en`, `source`, and `status`.

- [ ] **Step 2: Keep translations terminology-consistent**

Use `资源区` for pitch zone, `牌库` for deck, `手牌` for hand, `弃牌区` for graveyard, `放逐区` for banished zone, `武器` for weapon, `装备` for equipment, `粉碎` for Crush, `分解` for Decompose, `冻结` for frozen, and `再来一次` for Go again.

- [ ] **Step 3: Validate all deck keys have Chinese records**

Run a Node check that loads both JSON files and reports missing or extra card keys.

### Task 3: Verify and build

**Files:**
- Modify: `probe/probe.user.js` only if variant lookup requires a code change.
- Generate: `probe/talishar-cn.user.js`

- [ ] **Step 1: Run tests**

Run `cd probe && npm test`; expect zero failures.

- [ ] **Step 2: Build the installable userscript**

Run `cd probe && npm run build`; expect the generated script to contain the Jarl card records.

- [ ] **Step 3: Check generated script syntax**

Run `node --check probe/talishar-cn.user.js`.
