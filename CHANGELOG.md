# Changelog

## v0.7.6（2026-08-06）

### 变更

- **移除 `glossary.hero` 英雄名词条**：英雄基础名仅 83 个、量少，卡名翻译一致性靠人工核验足够，不值得为它做机制性强制（过度设计）。为避免静态词表被误读为"有统一指导作用"，从术语表删除 hero 类别。英雄卡翻译（`heroes.json`）与关键词释义（`glossary.keyword` → `keywords.json`）不受影响

## v0.7.5（2026-08-05）

### 修复

- **恢复"指哪显示哪"（图像优先，修正 v0.7.4 的方向）**：按"鼠标指到哪张牌就显示哪张"的原则，解析恢复为**图像 slug 优先**。变身卡（如「自适应阿尔法模组」）在 Talishar 上本体与变身形态是两个可悬停元素、各有各的图——指到变身形态（顶层图）显示变身卡，指到底下本体显示本体。`_equip` 剥除与调试菜单均保留

## v0.7.4（2026-08-05）

### 新增

- **可见的调试开关**：插件菜单新增「调试模式」，点一下开启（浮窗提示），再悬停卡牌按 F12 看控制台即可看到解析轨迹（图片 URL / alt / 候选 keys / 命中卡），不再需要手敲 localStorage

### 修复

- **变身卡显示本体（修正 v0.7.2 的方向）**：「自适应阿尔法模组」等卡有变身机制，会变成其他装备牌——Talishar 界面盖着的是变身后的图（如 `arcbane_grasp_blue_equip`），但卡牌本体仍是原名。解析曾改为**卡名（alt）优先**：alt 是卡牌本体身份，图像只是当前外观
  - **注（v0.7.5 修正）**：改为图像优先"指哪显示哪"，本条的"卡名优先"理解被推翻，见 v0.7.5 修复说明

## v0.7.3（2026-08-05）

### 新增

- **自动更新入口**：用户脚本头新增 `@updateURL` / `@downloadURL`（指向源码仓库 raw 地址），安装一次后 Violentmonkey/Tampermonkey 会自动检测新版本并提示更新，无需手动重新粘贴

## v0.7.2（2026-08-05）

### 修复

- **Talishar card-square 装备图识别**：`images.talishar.net` 的卡片方块图在 slug 后追加类型标记（如 `arcbane_grasp_blue_equip`），`normalizeStem` 之前未剥掉 `_equip`，导致图像自身无法解析、只能依赖 alt。现已剥掉 `_equip` 后缀，使图像可作为卡名缺失时的兜底信号
  - **注（v0.7.4 修正）**：解析改为卡名优先；本条目最初的"图像优先于 alt"理解不成立，见 v0.7.4 修复说明

## v0.7.1（2026-08-05）

### 新增

- **悬停识别调试钩子**：控制台执行 `localStorage.setItem('fab-cn-debug','1')` 后，每次悬停会在控制台打印解析轨迹（图片 URL / alt / 候选 keys / 命中卡），用于排查卡牌交叉识别

## v0.7.0（2026-08-05）

### 新增

- **锚定全卡预览**：浮窗现在跟随 Talishar 原生全卡悬浮大图（React portal 渲染的 `position:fixed` 大图），而非被悬停的小缩略图；预览延迟出现时会轮询定位
- **固定模式**：插件菜单「切换固定/跟随模式」可将浮窗钉在指定位置，拖动顶部手柄自由移动；固定模式下浮窗保持可见、内容仍随悬停更新
- **样式自定义**：插件菜单「设置样式…」打开紧凑设置窗格，内置实时效果预览框；底色/边框的颜色（色块选择器）与透明度、卡名/类别/正文三处字体的大小（上限 30px）与颜色均可调节，支持恢复默认
- **持久化**：全部设置（样式 + 固定模式 + 位置）通过 `GM_setValue` 存储，刷新后保留
- **CSS 变量化**：浮窗全部颜色/字号改为 CSS 自定义属性，注入 `<style>` 标签统一管理

### 变更

- `@grant` 从 `none` 调整为 `GM_registerMenuCommand, GM_getValue, GM_setValue`
- **合并用户脚本为单文件**：删除 `probe/probe.user.js` 模板与 `build-userscript.mjs` 构建步骤，直接编辑 `probe/talishar-cn.user.js`（原构建产物即唯一源码）
- **英雄全量归档**：`heroes.json` 归拢全部 145 张英雄卡（含此前散落各 t3 批次的 60 张），统一为 `slugifyCardName(name)` 规范 key（`jarl_vetreii → jarl_vetrei_i`），同名英雄相邻排列；`build-translation-drafts.mjs` 排除 Hero 类型卡，重新生成批次不再写回英雄
- **术语表新增 hero 类别**：83 个英雄基础名入库（`data/glossary.zh-CN.json`），统一跨版本英雄牌及牌面正文中的英雄名翻译
- **英雄名一致性修正**：`Dorinthea Ironsong`（茜娅→希雅）、`Fang, Dracai of Blades`（獠牙→方格）等 5 处基础名/分隔符统一
- **批次放置收敛**：`scripts/consolidate-t4.mjs` 把 t4-remaining 中 85 条实属 T1/T2/具体 T3 批次的卡归位到各自批次文件，t4 只留 34 张真兜底卡；新增守卫测试校验每张卡都落在过滤器所属的批次文件
- **异能关键词释义库**：`glossary.keyword` 重构为结构化 `{name_zh, desc_zh}`，收录 **100 个关键词**的中文名 + 释义，按官方综合规则（rules.fabtcg.com）撰写；`loadGlossary` 兼容对象值；数据中 170 个关键词串除「XX 专精」（由专精模式 + 英雄名组合覆盖）与类型名噪声外全部覆盖
- **关键词接线到浮窗**：`dist/data/keywords.json`（100 条释义）随构建发布；卡牌构建时按英文源 `card_keywords` join 出 `keywords` 字段（schema v2，仅保留能在词表解析的真实机制关键词，编号变体如「Arcane Barrier 1」自动回退到基础词）；浮窗正文下方新增关键词段（`name_zh：desc_zh`，无交互）；设置项新增关键词独立字体+颜色

## v0.6.0（2026-08-05）

### 新增

- **全卡翻译覆盖**：3,164 / 3,158 唯一卡名（100%），含红黄蓝 pitch 变体共 4,941 条目
- **FaBrary 支持**：新增 `@match https://fabrary.net/*`，通过印刷 ID 别名表 + `alt` 卡名双信号解析
- **Talishar 全量命名收敛**：`normalizeStem()` 统一剥离颜色后缀、裁剪后缀 (`_cropped`)、印刷变体后缀 (`-T`)；`talisharStem()` 转写非 ASCII 字符（ð→d、ā→a 等）
- **别名表**：`scripts/build-card-aliases.mjs` 生成 9,247 条 `印刷ID / Talishar 图名 → {slug, pitch}` 映射，发布到 `dist/data/aliases.json`
- **双仓库架构**：源码仓库（`talishar-cn`）+ 数据仓库（`talishar-cn-data`）分离
- **英雄独立模块**：85 张英雄从 `t4-remaining` 中分离为 `heroes.json`

### 变更

- **默认数据源**改为生产地址（`jacefromxa/talishar-cn-data` 的 GitHub Raw）
- **两遍查找**：用户脚本先走图名 token + alt 快速路径，失败再懒加载别名表重试
- **翻译模块化**：`data/translations/` 拆分为 26 个批次文件，按职业/属性/赛制管理

### 修复

- merge 脚本覆盖已翻译 `text_zh` 的 bug（`build-translation-drafts.mjs` 增加字段保护）
- Talishar "披风"→"翳装"（跟随词表更正）
- 蛮士→蛮将（词表更新后全局替换 362 处）
- `_cropped` 图片后缀导致侧栏/结算页无法匹配

## v0.5.0（2026-08-04）

### 新增

- **本地数据服务器**：`scripts/dev-data-server.mjs`，纯 Node.js 无依赖，CORS 头，端口 4173
- **可配置数据地址**：`localStorage('fab-cn-data-base-url')` → 本地 → 生产 优先级链
- **版本化缓存**：Cache Storage 键名基于 manifest version，版本变化自动失效
- **开发模式跳过缓存**：检测到 localhost/127.0.0.1 时直接网络请求
- **40 个 T1 通用卡翻译**

## v0.4.0（2026-08-04）

### 新增

- **Jarl Vetreiði 牌组中文翻译**：37 个不同卡名（Arena 12 + 主牌 68）
- **分离式数据架构**：用户脚本不嵌入卡库，按需加载 manifest → index → chunks
- **构建管线**：`build-card-data.mjs` 生成 manifest/index/chunks，`build-userscript.mjs` 安全检查
- **Cache Storage 缓存**：已加载的卡牌数据跨会话保持
- **浮窗 UI**：跟随卡图，右/左自适应定位，视口钳制
- **24 项自动化测试**

### 变更

- 初始版本
