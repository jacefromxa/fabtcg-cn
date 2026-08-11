# Fabrec 卡牌浮窗支持设计

## 目标

让现有简体中文卡牌浮窗在 `https://fabrec.gg/` 全站页面识别 Fabrec 展示的 FAB 卡牌，并复用现有中文卡库显示卡名、类别和正文。

## 页面观察

Fabrec 首页英雄列表和英雄分析页都使用普通图片元素展示卡牌，图片 URL 形如：

```text
https://json.fabrec.gg/cardmeta/cardfaces/AGB001.jpg
https://json.fabrec.gg/cardmeta/cardfaces/WTR116-CF.jpg
```

图片同时带有英文卡名 `alt` 文本。英雄分析页的卡牌统计组件使用同样的图片结构，并将卡名、价格和统计信息放在同一个卡片容器内。印刷 ID 能够直接复用现有 `dist/data/aliases.json` 别名链路；带 `-CF`、`-RF` 等印刷后缀的 URL 也由现有印刷 ID 解析处理。

## 方案

只增加一个站点匹配和一个 Fabrec 专用卡图回溯桥接，不接入 Fabrec API、不读取 Next.js 内部状态，也不把 Fabrec 页面数据写入英文源库或翻译源。

1. 在 userscript 元数据中加入 `https://fabrec.gg/*`，版本递增一个补丁版本。
2. 当指针位于 Fabrec 卡牌图片、卡名或同卡片容器内的其他区域时，寻找该卡片容器中的 `.card_card__*` 图片；CSS Modules 的哈希会变化，因此实现只依赖图片 URL 的 `cardfaces` 路径或现有候选收集器能识别的图片 `src`。
3. 将找到的卡图交给既有 `collectCandidates()`、`resolveCardKeys()` 和卡库加载器。卡图印刷 ID 优先于英文 `alt`，从而保留不同 pitch 和不同印刷版本的区分能力。
4. 保持通用探测器的“图片必须在指针下方”安全约束，仅在 hostname 为 `fabrec.gg` 且目标属于 Fabrec 卡片容器时允许文字区域回溯，避免普通页面空白区域误命中卡牌。

## 非目标

- 不支持或翻译 Fabrec 的价格、套牌统计、英雄分类、文章正文等非卡牌内容。
- 不从 Fabrec API 或 `json.fabrec.gg` 额外抓取数据；页面已经渲染出的卡图是唯一站点输入。
- 不修改 `data/source/english`、`data/translations`、`dist/data` 或翻译版本号。
- 不重构现有站点探测器，不改变 Talishar、FaBrary、Fablazing、Felt Table、TCGplayer 和 The Fab Cube 的现有行为。

## 数据流

```text
Fabrec pointerover
  -> Fabrec 卡片容器/卡图识别
  -> collectCandidates(img)
  -> extract printing ID + aliases.json
  -> dist/data index/chunk
  -> 现有中文卡牌浮窗
```

如果卡片没有可识别的卡图 URL，探测器返回空结果并隐藏浮窗；不根据价格、统计数字或普通页面文字猜测卡牌。

## 测试策略

- 元数据测试：确认 userscript 匹配 `https://fabrec.gg/*`。
- 识别测试：模拟 Fabrec 卡片容器，在卡名/统计文字目标上调用 `findCardAnchor()`，确认返回同容器内的卡图。
- 解析测试：用 `AGB001.jpg` 和带后缀的 `WTR116-CF.jpg` 样例确认候选仍能进入现有印刷 ID/别名解析路径。
- 回归测试：运行 `probe` 完整测试套件，确认其他站点与数据构建逻辑不受影响。

## 验收标准

在 Fabrec 首页英雄卡列表和英雄分析页卡牌统计区域，鼠标悬停卡图或同卡片的卡名/统计区域能够显示对应中文浮窗；不同 pitch 的卡牌按具体印刷 ID 进入对应翻译版本；非卡牌区域不会触发浮窗。
