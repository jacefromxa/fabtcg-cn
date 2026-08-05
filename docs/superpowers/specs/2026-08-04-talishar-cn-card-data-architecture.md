# Talishar 全卡中文数据架构设计

## 目标

支持持续扩充到完整 Flesh and Blood 卡库，同时让用户脚本保持轻量，不因中文卡牌数量增加而不断膨胀。

## 方案

用户脚本只包含 DOM 识别、浮窗渲染和数据加载器。中文卡牌数据由构建脚本从 `data/translations/` 目录生成静态文件：一个索引、一个版本清单和多个卡牌分片。用户悬停到卡牌时先根据图片文件名查询索引，再只下载包含该牌的分片，并通过浏览器 Cache Storage 缓存。

**翻译源按批次模块管理（2026-08-05 起生效）：** 中文翻译源拆分为 `data/translations/*.json`，一个批次一个文件（`human-reviewed.json`、`t1-generic.json`、`t2-equipment.json`、`t3-*.json`、`t3-other.json` 兜底）。`scripts/build-card-data.mjs` 的 `loadZhTranslations()` 合并全部批次文件后构建。**本工具只做翻译、不做赛制合法性判断**，批次按卡牌类型/职业/属性分配，保证 `data/source/english/card.json` 中每张卡都有归属，并与 Talishar 网页悬停卡图展示的卡牌对齐。

默认数据地址为：

```text
https://raw.githubusercontent.com/jacefromxa/CCDeep/main/talishar-cn/dist/data
```

如果静态地址不可用，浮窗显示加载失败提示，不影响 Talishar 的点击、拖拽和正常对战操作。

## 数据格式

单张卡牌按基础 ID 聚合，红黄蓝版本保存在 `variants` 中；同一张牌的规则文本只保存一份。索引只保存 `card_id` 和分片文件名，不保存完整卡面。

## 缓存策略

使用 Cache Storage 缓存 `manifest.json`、`index.json` 和各分片。数据 URL 使用版本路径或 manifest 版本号，版本改变时自动读取新资源。

## 验证

- 构建测试验证分片、索引和版本记录的内容。
- 用户脚本测试验证异步加载后仍能显示中文卡面。
- Node 语法检查验证生成用户脚本可安装。
