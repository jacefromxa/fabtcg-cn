# Fablazing 卡牌链接支持设计

## 目标

让用户脚本在 Fablazing 英雄分析页的卡牌统计表中，悬停纯文本卡牌链接时也能显示现有简体中文卡牌浮窗；独立卡牌页和卡图仍沿用当前图片/印刷 ID 识别链路。

## 页面事实

- Fablazing 已在 userscript 的 `@match` 范围内。
- 独立卡牌页使用官方卡图，例如 `.../media/cards/normal/HVY103.webp`，并带有英文 `alt` 卡名；现有 `dist/data/aliases.json` 已能将印刷 ID 映射到现有卡库。
- 英雄分析页的卡牌统计表使用 `/card/<name>-red|yellow|blue` 形式的纯文本链接，没有卡图、`alt` 或 `data-*` 卡牌标识。

## 设计

在现有候选识别器中增加链接候选，不新建 Fablazing 专用数据层：

1. `collectCandidates()` 记录元素的 `href`，但仅把它作为链接信号，不改变现有图片和 `alt/title` 候选优先级。
2. `resolveCardKeys()` 从 Fablazing `/card/` 路径提取卡名 slug，并识别末尾的 `red`、`yellow`、`blue` pitch。
3. 链接 slug 映射到当前按基础卡名聚合的数据库键；pitch 作为变体选择提示，不能把不同 pitch 的卡合并成错误条目。
4. `findProbeTarget()` 允许带有有效 Fablazing 卡牌链接的 `<a>` 成为悬停锚点；浮窗跟随文本链接的矩形区域定位。
5. 图片识别、Talishar 预览识别、FaBrary 印刷 ID 识别和现有数据加载逻辑保持不变。

## 不做的事情

- 不抓取或依赖 Fablazing 私有 API、React 内部数据或构建产物中的 hash。
- 不修改英文卡库、翻译数据结构或卡牌数据库来源。
- 不改 userscript 程序版本；这是识别能力更新，后续若发布只更新数据库版本即可。
- 不在本次范围内为价格、统计数据或 Fablazing 其他分析组件增加中文化。

## 测试与验收

- 候选收集能读取 `/card/up-the-ante-blue` 形式的链接。
- 链接 slug 能正确去除 pitch 后缀，并保留 pitch 作为解析结果的一部分。
- red、yellow、blue 三种链接都能映射到同一基础卡的对应变体，不误命中其他同名卡。
- 没有 `/card/` 路径的普通链接不会触发卡牌候选。
- 现有图片、alt、Talishar 和 FaBrary 识别测试继续通过。
- 重建 `probe/talishar-cn.user.js` 后运行完整 `npm test` 和 `git diff --check`。
