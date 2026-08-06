# Talishar 简体中文卡牌浮窗项目交接文档

> 交接日期：2026-08-05  
> 项目根目录：`/Users/Zhuanz/CCDeep/talishar-cn`  
> 当前交接目标：先完成本地卡库部署，使用户脚本在本机可用；随后扩充到全卡中文卡库。

## 1. 项目目标

这是一个运行在 Talishar 页面上的 Violentmonkey/Tampermonkey 用户脚本：鼠标悬停到可见卡牌时，在原生卡图旁边显示简体中文卡名、类别和正文。

长期目标是覆盖完整 Flesh and Blood 卡库，而不是只支持某一副牌或少量测试卡。

当前产品约束：

- 只处理页面上已经公开显示的卡牌。
- 不读取牌库、盖牌、手牌隐藏信息或其他不可见状态。
- 不拦截点击、拖拽、键盘输入、游戏动作或 Talishar 的游戏请求。
- 卡名、类别和正文使用安全的 DOM 文本渲染，不使用 `innerHTML`。
- 中文翻译以可阅读、可理解、术语统一为优先，不宣称是官方中文译名。

## 2. 当前真实状态

### 已完成

- Talishar 卡图识别探针已经验证过，Violentmonkey 可以执行。
- 已导入完整英文卡库，`data/cards.en.json` 当前约有 4,941 张卡牌记录。
- 已完成 Jarl Vetreiði 的 “Calling: Edinburgh 5th” 牌组中文数据：
  - Arena：12 张
  - 主牌：68 张
  - 不同卡名：37 张
- 已建立分离式数据架构：用户脚本不再嵌入完整中文卡库。
- **翻译源按模块管理**：中文翻译源不再是一个巨大的 `cards.zh-CN.json`，而是按批次拆分为 `data/translations/` 下的多个文件（见第 5.5 节）。
- `scripts/build-card-data.mjs` 会读取 `data/translations/` 全部文件并合并，生成：
  - `dist/data/manifest.json`
  - `dist/data/index.json`
  - `dist/data/chunks/*.json`
- 用户脚本会按需读取 manifest、索引和卡牌分片，并使用 Cache Storage 缓存。
- 浮窗前台样式已经改为：
  - 跟随卡图定位；
  - 优先放在卡图右侧，右侧不足时放左侧；
  - 自动限制在视口内；
  - 只显示卡名、类别、正文；
  - 卡名橙色粗体，类别细体斜体加下划线。
- 当前最近一次验证结果：64 项测试通过，用户脚本版本为 `0.7.10`。
- **已支持 FaBrary（2026-08-05）**：用户脚本新增 `@match https://fabrary.net/*`。FaBrary 卡图 `src` 用印刷 ID（如 `PEN313.webp`），新增 `data/talishar-card-aliases.json`（`scripts/build-card-aliases.mjs` 从英文源 `printings` 生成，`印刷ID → {slug, pitch}`，9,247 条）随构建发布到 `dist/data/aliases.json`；用户脚本在 FaBrary 上按"印刷 ID 别名 + alt 卡名交叉消解"，红黄蓝同名卡可精确区分 pitch。同一份数据层/缓存/浮窗两站共用，Talishar 行为不变。
- **数据发布（2026-08-06 已解决）**：`dist/data/` 已发布到独立数据仓库 `jacefromxa/talishar-cn-data`，默认数据地址为 `https://raw.githubusercontent.com/jacefromxa/talishar-cn-data/main/`。manifest / index / chunks / aliases / keywords.json 线上均可正常加载（已实测）。

## 3. P0：先完成本地化部署

后续 Agent 的第一任务不是翻译更多卡牌，而是让当前 37 张牌在本机完整跑通。

### 推荐方案

增加一个非常小的本地静态服务器，专门提供 `dist/data/`，并添加 CORS 响应头：

```text
Talishar 页面
    ↓ fetch
http://127.0.0.1:4173/data/manifest.json
    ↓
/Users/Zhuanz/CCDeep/talishar-cn/dist/data/
```

建议使用 Node.js 内置 `http` 模块，不新增第三方依赖。服务器至少需要：

- 静态提供 `dist/data/` 下的 JSON 文件；
- 设置 `Access-Control-Allow-Origin: *`；
- 只允许读取预定的 `dist/data/` 目录，禁止路径穿越；
- 处理 JSON 的 `Content-Type`；
- 端口默认为 `4173`，允许命令行覆盖；
- 终端显示实际访问地址和请求日志；
- 未找到文件返回 404，不返回项目源码。

建议新增：

```text
scripts/dev-data-server.mjs
```

并在 `probe/package.json` 增加：

```json
{
  "scripts": {
    "serve:data": "node ../scripts/dev-data-server.mjs"
  }
}
```

### 本地用户脚本地址

不要手工永久修改生产地址。建议增加可配置的数据地址，优先级如下：

```text
localStorage 中的 fab-cn-data-base-url
    ↓ 没有时
本地开发地址 http://127.0.0.1:4173/data
    ↓ 发布构建时
生产地址 https://raw.githubusercontent.com/jacefromxa/CCDeep/main/talishar-cn/dist/data
```

也可以采用两个构建命令：

```text
npm run build:local
npm run build:production
```

但无论采用哪种方式，都要让后续 Agent 能明确看到当前用户脚本连接的是本地还是生产数据源。

### 本地验收步骤

1. 启动本地数据服务器。
2. 确认浏览器可以打开：

   ```text
   http://127.0.0.1:4173/data/manifest.json
   http://127.0.0.1:4173/data/index.json
   ```

3. 用本地数据地址构建或配置用户脚本。
4. 在 Violentmonkey 中安装生成的 `probe/talishar-cn.user.js`。
5. 打开 Talishar 对战或观战页面。
6. 悬停 `Titan's Fist`、`Boulder Drop`、`Channel Lake Frigid`。
7. 确认三张牌都能显示中文卡名、类别和正文。
8. 打开浏览器 Network 面板，确认只请求 manifest、index 和实际需要的 chunk。
9. 刷新页面后再次悬停，确认读取缓存仍然有效。

## 4. P0：修复开发期间的缓存失效问题

当前加载器使用固定的 Cache Storage 名称和固定 URL。它会先读缓存，再请求网络，因此本地修改 `dist/data/` 后可能继续显示旧数据。

后续 Agent 必须实现以下任一方案：

### 推荐方案：版本化缓存键

先读取 manifest，再根据 manifest 的 `version` 建立缓存名，例如：

```text
fab-cn-card-data-v1-467bdf789090
```

新版本使用新缓存，旧缓存可以异步清理。

### 可接受方案：开发模式跳过缓存

当数据地址是 `127.0.0.1`、`localhost` 或存在开发开关时，直接跳过 Cache Storage；生产环境继续使用缓存。

必须补测试：

- 同一版本会读取缓存；
- manifest 版本变化后不会继续使用旧 chunk；
- 本地开发模式能立即看到数据文件改动。

## 5. P1：全卡中文翻译路线

### 5.1 数据规模

英文源数据：

```text
data/source/english/card.json
data/cards.en.json
```

中文源数据：

```text
data/translations/*.json   ← 按批次拆分，见 5.5 节
```

当前中文源数据按批次拆分管理，已覆盖约 2,974 个不同卡名。目标是覆盖 `data/source/english/card.json` 中的完整卡池（4,941 个卡名），并与 Talishar 网页悬停卡图所展示的卡牌一一对齐。

### 5.2 不建议一次性手工翻译 4,941 张

建议分批推进：

1. 建立术语表；
2. 建立翻译模板生成器；
3. 按系列、英雄或牌组批量翻译；
4. 每批翻译后生成数据、运行校验、抽样实机验证；
5. 再进入下一批。

推荐优先级：

```text
P1：Jarl Vetreiði 相关牌和 Isenloft / Rosetta 等当前使用环境
P1：常见通用牌和经典构筑高频牌
P2：全部英雄、武器、装备和职业牌
P2：按系列补齐所有普通牌
P3：特殊印刷、促销版、替代画面和极少使用卡
```

### 5.3 术语表

应新增并维护：

```text
data/glossary.zh-CN.json
```

至少需要统一以下类型的术语：

- 区域：资源区、牌库、手牌、弃牌区、放逐区、军械库、竞技场；
- 行为：攻击、防御、弃置、放逐、摧毁、抽牌、洗牌、置于牌库顶/底；
- 关键词：粉碎、分解、淬炼、刃碎、支配、融合、传奇、再来一次；
- 卡牌类别：行动、瞬间、攻击、防御反应、装备、武器、光环；
- 属性：大地、冰、闪电、元素、通用、守护者；
- 标记：霜噬、大地化身、秘法屏障相关衍生物。

术语表应被翻译辅助工具读取，而不是只作为文档存在。

### 5.4 翻译数据格式要求

原始中文数据仍然允许使用 `__1`、`__2`、`__3` 区分 pitch 版本。构建器会将它们聚合为：

```json
{
  "id": "boulder_drop",
  "name_zh": "巨石坠击",
  "text_zh": "……",
  "variants": {
    "1": { "pitch": 1, "power": 7, "defense": 3 },
    "2": { "pitch": 2, "power": 6, "defense": 3 },
    "3": { "pitch": 3, "power": 5, "defense": 3 }
  }
}
```

每张牌至少要保留：

- `name_en`
- `name_zh`
- `type_zh`
- `text_en`
- `text_zh`
- `source`
- `status`
- pitch / cost / power / defense 等版本数值

建议状态值：

```text
machine-draft
human-reviewed
deck-reviewed
official-crosscheck
needs-review
```

不要覆盖或删除英文原文。英文原文是校对依据，也是后续重新生成翻译模板的输入。

### 5.5 翻译源按批次模块管理（2026-08-05 起生效）

> 核心原则：**本工具只做翻译，不做赛制合法性判断。** 目标是让 `data/source/english/card.json` 中每一张卡都有可翻译的归属，并保证与 Talishar 网页悬停卡图展示的卡牌信息一致。`cc_legal / blitz_legal / banned` 等字段**不参与**批次分配。

中文翻译源不再使用单个大文件 `data/cards.zh-CN.json`，而是按批次拆分为 `data/translations/` 目录下的多个文件，**一个批次一个文件**：

```text
data/translations/
  human-reviewed.json       ← 人工审核原稿（37 张 Jarl 牌组卡），机器生成永不触碰
  heroes.json               ← 全部英雄卡（145 张），按 slugifyCardName(name) 规范 key 归档，同名英雄相邻排列
  t1-generic.json           ← 通用牌（按类型，不按合法性）
  t2-equipment.json         ← 装备/武器
  t3-warrior.json           ← 战士
  t3-guardian.json          ← 守护者
  ...                       ← 其余 t3-* 按职业/属性
  t4-remaining.json         ← 兜底批次（34 张 Event / Adjudicator / Macro / 特殊卡；生成器侧称 t3-other）
```

**批次分配规则（`scripts/build-translation-drafts.mjs` 的 `getT3BatchName` / T1 / T2 / T4 过滤器）：**

1. 纯按卡牌类型/职业/属性归类，**不做任何合法性判断**；
2. 优先级：T1 通用 → T2 装备 → T3 职业/属性（第一匹配优先）→ `t3-other` 兜底；
3. **Hero 类型卡一律不进 T1–T4 自动批次**（`isHeroCard` 过滤），只归 `heroes.json`；重新生成任何批次都不会把英雄写回批次文件；
4. 保证 `cards.json` 中 4,941 张卡**每张都有且仅有一个批次归属**；
5. 同名多 pitch 用 `__1 / __2 / __3` 后缀区分，聚合后并入同一卡牌 ID 的 `variants`；
6. `human-reviewed.json` 中的人工卡（裸 key + 卡内 pitch）与机器稿（`__pitch` 后缀）按 **slug + pitch** 去重，人工覆盖的 pitch 不再生成重复机器稿；未覆盖的 pitch 保留为合法机器稿。

**构建与维护方式：**

```bash
# 重新生成某个批次的机器骨架（合并保留，不会丢弃该批次已有翻译）
node scripts/build-translation-drafts.mjs t3-warrior
# 或生成全部批次骨架
for b in t1-generic t2-equipment t3-*; do node scripts/build-translation-drafts.mjs $b; done

# 构建分发产物（自动合并 data/translations/ 全部文件）
cd probe && npm run build:data
```

- `build-translation-drafts.mjs` 采用**合并保留**策略：往现有批次文件里合并新骨架，绝不从零重建丢弃已有翻译；只有被人工卡覆盖的同 pitch 重复稿会被清理。
- `build-card-data.mjs` 的 `loadZhTranslations()` 读取 `data/translations/` 全部 JSON 合并成内存映射用于构建；`dist/data/` 产物与用户脚本保持不变。
- 后续翻译工作流程：改对应批次的 JSON 文件（或让生成器先产出骨架），翻译完成保持 `status: machine-draft`，人工确认后改 `human-reviewed`。**不要**把翻译写回单个大 JSON，也不要重新拆分。
- `scripts/split-zh-translations.mjs` 是 2026-08-05 的一次性迁移脚本（大文件 → 分批），已执行完毕，无需重跑。
- `scripts/consolidate-heroes.mjs` 是 2026-08-05 的一次性迁移脚本：把散落在各 t3 批次的英雄卡归拢进 `heroes.json`，统一为 `slugifyCardName(name)` 规范 key（`jarl_vetreii → jarl_vetrei_i`），并把 `jarl_vetreii` 等非规范 key 改名对齐别名表。已执行完毕，幂等，可重跑自检。
- `scripts/consolidate-t4.mjs` 是 2026-08-05 的一次性迁移脚本：把 t4-remaining 中 85 条实属 T1/T2/具体 T3 批次的卡归位到各自批次文件，t4 只留真正的兜底卡（34 张）。已执行完毕，幂等。
  - **已知命名不一致（暂保留）**：生成器的兜底批次名是 `t3-other`，而实际文件是 `t4-remaining.json`；`isT4RemainingCard` 过滤器当前为空（兜底卡由 `getT3BatchName` 返回 `t3-other` 归到 t4 文件）。重跑 `t3-other` 批次会写入不存在的 `t3-other.json`，需先二选一收敛命名。

## 6. P1：完善 Talishar 卡牌 ID 映射

当前主要依赖图片文件名，例如：

```text
titans_fist.webp → titans_fist
```

这对当前测试牌有效，但完整卡库可能遇到：

- 同名不同 pitch；
- 同名不同印刷；
- Talishar 图片文件名与英文卡名不完全一致；
- 图片 URL 带颜色、版本或其他后缀；
- 非英文字符、标点和撇号导致 slug 不一致。

后续 Agent 要完成：

1. 在 Talishar 页面采集更多真实图片 URL；
2. 建立 `Talishar image stem → canonical card id` 的显式映射；
3. 为多个 pitch 版本确认 Talishar 是否提供颜色或数值标识；
4. 如果页面没有 pitch 标识，不要猜测数值；
5. 为未知图片保留诊断输出或单独的 debug 模式，不污染普通用户浮窗。

建议新增独立映射文件：

```text
data/talishar-card-aliases.json
```

**已实现（2026-08-05）**：`scripts/build-card-aliases.mjs` 从英文源生成该别名表，随构建发布到 `dist/data/aliases.json`。Talishar 卡图命名规则已摸清并统一覆盖：

| 命名模式 | 例子 | 处理 |
|----------|------|------|
| 普通 slug | `titans_fist.webp` | 图片 token 直接匹配 |
| 音标转写 | `jarl_vetreidi`（ð→d）、`twelve_petal_kasaya` | `talisharStem()` 转写 → 别名表 |
| 颜色后缀 | `ice_quake_red.webp` | `normalizeStem` 剥离 `_red/_yellow/_blue` |
| 印刷 ID | `PEN313.webp` | 别名表（FaBrary 也用它） |
| 印刷变体后缀 | `MPW010-T.webp`、`CON005-MV.webp` | `normalizeStem` 剥离尾部 `-<字母数字>`（英文源印刷 ID 不含连字符，故永远安全） |
| FaBrary alt 卡名 | `alt="Boulder Drop"` | alt 文本 → slug 兜底 |

用户脚本两遍查找：快速路径（图名 token + alt）失败才懒加载 `aliases.json` 再试。

**已知缺口（暂搁置）**：`data/source/english/card.json` 未覆盖的卡（如 `CON005-MV`，英文源只有 CON001-004）无法匹配，因为别名表依赖英文源。此类卡需先补英文源 + 翻译，再补别名，暂不处理。

不要把复杂别名逻辑无限塞进用户脚本。

## 7. P1：完善数据构建与质量检查

需要增加一个完整校验命令，例如：

```text
npm run validate:data
```

至少检查：

- 所有 JSON 可以解析；
- 所有卡牌都有稳定 ID；
- 中文名、类别和正文不缺失；
- `__1/__2/__3` 没有重复或冲突；
- pitch、cost、power、defense 与英文源数据一致；
- 中文数据中的卡牌都能在英文索引中找到；
- 构建后的 index 中没有孤儿 ID；
- 每个 index 引用的 chunk 文件都存在；
- manifest 的 card count 与实际卡牌数一致；
- 分片版本与 manifest 版本一致；
- 没有把英文卡库误打包进用户脚本。

## 8. P2：发布和版本管理

当前生产地址依赖：

```text
https://raw.githubusercontent.com/jacefromxa/CCDeep/main/talishar-cn/dist/data
```

后续需要明确：

- 谁负责将 `dist/data/` 发布到 GitHub；
- 是否使用 `main`、release 分支或 GitHub Pages；
- 是否需要固定版本目录，例如 `dist/data/v1/`；
- 用户脚本如何更新生产数据；
- 如何回滚错误翻译；
- 是否保留每一批翻译的变更记录。

推荐发布方式：

```text
data/cards.zh-CN.json       源数据
    ↓ npm run build
dist/data/                  可发布产物
    ↓ GitHub Pages / Raw
用户脚本按需加载并缓存
```

不要把 `data/source/english/card.json` 这种大型源文件放进用户脚本或发布给浏览器下载。

### 8.1 双仓库架构（2026-08-05 部署）

项目采用双仓库分离管理：

| 仓库 | 可见性 | 内容 | 地址 |
|------|--------|------|------|
| **源码仓库** | Public | 翻译源文件、构建脚本、用户脚本、测试 | `github.com/jacefromxa/talishar-cn` |
| **数据仓库** | Public | 仅 `dist/data/` 构建产物 | `github.com/jacefromxa/talishar-cn-data` |

本地开发目录 = 源码仓库。`dist/data/` 在源码仓库中保留（本地 dev 服务器使用），
但线上数据服务由数据仓库提供（用户脚本默认从 `jacefromxa/talishar-cn-data` 的 GitHub Raw URL 加载）。

**维护流程：**

1. 在本地修改 `data/translations/<批次>.json`
2. `npm run build`（别名表 + 卡牌数据 + 用户脚本）
3. 提交源码仓库：`git add -A && git commit -m "..." && git push`
4. 同步数据仓库：将 `dist/data/*` 拷贝到本地数据仓库 clone 目录，提交并推送

**本地开发数据源切换：**

用户脚本默认连接数据仓库。本地开发时，在浏览器控制台执行：

```js
localStorage.setItem('fab-cn-data-base-url', 'http://127.0.0.1:4173/data')
```

切回生产数据：

```js
localStorage.removeItem('fab-cn-data-base-url')
```

## 9. P2：实机测试和体验收尾

需要在 Talishar 真实页面验证：

- 手牌卡图；
- 场上卡图；
- 战斗链卡图；
- 武器和装备；
- 观战页面；
- 页面局部重绘后；
- 窗口左右边缘的卡图；
- 页面滚动和窗口缩放；
- 快速连续悬停多张牌；
- 中文数据加载失败时不会阻塞游戏操作。

当前 `probe/README.md` 中仍有“页面右下角应出现中文浮窗”的旧描述，后续 Agent 应改为“浮窗跟随原生卡图”。

`probe/diagnostic.user.js` 仅用于调试，完成真实映射采集后应停用或单独标明，不要与正式脚本同时长期启用。

## 10. 已知风险和决策边界

### 不要做

- 不要把 4,941 张英文卡库直接嵌入用户脚本；
- 不要在没有 pitch 标识时猜红黄蓝版本；
- 不要在普通用户浮窗中显示调试字段；
- 不要读取隐藏牌、牌库或用户隐私；
- 不要为了本地测试把远程地址永久改成本机地址；
- 不要直接删除旧缓存而不确认缓存名称和范围；
- 不要未经确认把修改推送到 GitHub。

### 可以做

- 增加本地开发服务器和本地构建变体；
- 增加可切换的数据地址配置；
- 增加术语表、翻译模板和批量校验器；
- 增加独立的 Talishar 别名映射文件；
- 增加失败重试、缓存版本和诊断模式；
- 将每批翻译拆成可审阅的小提交。

## 11. 推荐后续执行顺序

```text
1. 本地静态服务器 + CORS
2. 本地数据地址配置
3. 缓存版本失效机制
4. 本地实机验证当前 37 张牌
5. Talishar 图片 ID / pitch 映射采集
6. 术语表和翻译模板生成器
7. 按牌组和系列批量翻译
8. 数据完整性校验和翻译状态管理
9. GitHub 静态发布
10. 全卡实机抽样与正式发布
```

## 12. 交接给下一 Agent 的最小任务描述

> 请在 `/Users/Zhuanz/CCDeep/talishar-cn` 继续工作。原交接中的 P0（本地数据服务器、缓存版本失效、数据发布）**均已完成**：`dist/data/` 已发布到 `jacefromxa/talishar-cn-data`，线上脚本正常加载。全卡翻译（3163 卡）、关键词释义库接线、变身叠放卡识别均已落地。当前剩余事项：
> 1. **已知历史遗留**：`t3-other`（生成器兜底批次名）与 `t4-remaining.json`（实际文件名）命名不一致，`isT4RemainingCard` 过滤器为空；收敛批次命名时一并处理（见 HANDOFF §5.5 注记）。
> 2. 常规维护：改 `data/translations/*.json` 后 `cd probe && npm run build:data`，提交源码仓库并手动同步 `dist/data/` 到数据仓库。
> 3. 英雄名翻译在 `heroes.json` 手工维护（明确不做机制性强制）。
> 4. 本机 github.com 访问不稳定，git push 需 `GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=90` 或多次重试。不要未经确认推送 GitHub。
