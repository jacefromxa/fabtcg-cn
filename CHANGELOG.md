# Changelog

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
