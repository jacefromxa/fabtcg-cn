# 翻译卡名—正文一致性审计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 固化卡名—正文一致性审计，修复自引用同步盲区，并让已确认的 `Steelblade Shunt` 正文与牌名一致。

**Architecture:** 审计器作为只读 Node.js ESM 脚本扫描 `data/translations/*.json`，输出逐 pitch 候选；翻译提交应用器继续只处理经过旧值快照校验的精确替换，只扩大到自引用目标。数据修复直接改正式翻译源，再使用现有 `probe/npm run build` 生成 `dist`。

**Tech Stack:** Node.js 内置 ESM、Node test runner、现有 JSON 翻译源和 `probe` 构建脚本。

## Global Constraints

- 审计只读正式 `data/translations/*.json`，不读取或修改 `dist` 作为源。
- 不修改 `data/source/english`，不改变 spoiler 预览软隔离。
- 不批量自动修复审计候选；只有用户已确认的 Steelblade 条目直接修复。
- 保留不同 pitch 的独立正文和数值。

---

### Task 1: 锁定自引用同步与审计行为

**Files:**
- Modify: `probe/test/apply-translation-submissions.test.mjs`
- Create: `probe/test/translation-name-consistency.test.mjs`

**Interfaces:**
- `applySubmissionFile()` 必须在本卡英文正文命中英文牌名、中文正文含旧中文名时同步替换。
- 新审计模块提供 `auditTranslationNameConsistency(translationsDir)`，返回 `{ stats, candidates }`。

- [ ] **Step 1: 添加自引用回归测试**

在现有 apply fixture 中新增一条测试：让 `boulder_drop__1.text_en` 为 `If Boulder Drop defends...`，`text_zh` 为包含“巨石一击”的正文；提交新名“巨石坠击”，断言正文被同步、`propagatedCount` 为 1。

- [ ] **Step 2: 添加审计失败测试**

创建临时翻译目录，包含一个自引用候选、一个跨卡候选、一个已经对齐的正文，以及 `Pay Up` 出现在 `Pay up to 3` 的普通英文短语。断言审计返回一个自引用和一个跨卡候选，不返回普通短语。

- [ ] **Step 3: 运行失败测试**

运行：

```bash
cd probe
node --test test/apply-translation-submissions.test.mjs test/translation-name-consistency.test.mjs
```

预期：自引用测试因当前跳过条件失败；审计测试因模块尚不存在而失败。

### Task 2: 实现审计和同步修复

**Files:**
- Create: `scripts/audit-translation-name-consistency.mjs`
- Modify: `scripts/apply-translation-submissions.mjs:102-130`
- Modify: `probe/package.json`
- Modify: `README.md`
- Modify: `docs/data-update-policy.md`

**Interfaces:**
- `auditTranslationNameConsistency(translationsDir = data/translations)` 返回 `stats` 和按变体列出的 `candidates`。
- 命令 `node scripts/audit-translation-name-consistency.mjs` 输出人类可读摘要；`--json` 输出机器可读 JSON。
- `cd probe && npm run audit:translation-names` 调用上述命令。

- [ ] **Step 1: 实现最小审计器**

加载批次 JSON，按 `baseCardId` 聚合目标卡当前中文译名，使用带边界的英文牌名匹配扫描 `text_en`，仅在 `text_zh` 不包含目标卡当前译名时产生候选；对 `Pay Up` 后接 `to` 的普通短语过滤。

- [ ] **Step 2: 放开自引用精确替换**

在 `propagateNameChanges()` 中移除 `targetCardId === change.cardId` 条件，保留英文命中和旧中文名命中条件，继续记录每个传播目标。

- [ ] **Step 3: 添加命令入口和流程说明**

在 `probe/package.json` 增加 `audit:translation-names`，README 和数据更新规范说明审计是只读候选报告，且应在手动译名处理后运行。

- [ ] **Step 4: 运行针对性测试**

运行同 Task 1 的测试命令，预期全部通过。

### Task 3: 修复当前确认数据并构建产物

**Files:**
- Modify: `data/translations/t3-warrior.json:4583,4596,4609`
- Generated: `dist/data/chunks/t3-warrior.json`
- Generated: `dist/data/index.json`
- Generated: `dist/data/manifest.json`

**Interfaces:**
- `steelblade_shunt__1`, `__2`, `__3` 的 `name_zh` 和 `text_zh` 均使用“拨刀防反”。

- [ ] **Step 1: 修改三条 Steelblade 正文**

把三条正文中的“钢刃分流”替换为“拨刀防反”，不改变 pitch、cost、power、defense 或英文正文。

- [ ] **Step 2: 重新生成数据**

运行：

```bash
cd probe
npm run build
```

- [ ] **Step 3: 核对源与产物**

确认源文件和 `dist/data/chunks/t3-warrior.json` 均同时包含 `name_zh: 拨刀防反` 与正文 `拨刀防反`。

### Task 4: 全量验证和交接

**Files:**
- No additional source files.

- [ ] **Step 1: 运行审计**

运行 `cd probe && npm run audit:translation-names`，确认 Steelblade 不再出现在候选中，并记录剩余候选数量。

- [ ] **Step 2: 运行完整测试**

运行 `cd probe && npm test`。若 HTTP 测试因沙箱禁止监听而失败，使用允许本地监听的环境重跑并区分环境失败与代码失败。

- [ ] **Step 3: 检查构建和工作区**

运行 `git diff --check`、`git status --short`，确认只包含本计划文件和生成产物，且没有 pending/processed 翻译提交被误发布。
