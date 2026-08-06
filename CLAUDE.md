# talishar-cn

## 一句话定位

为 [Talishar](https://talishar.net/) / [FaBrary](https://fabrary.net/) 提供 Flesh and Blood
卡牌悬停中文翻译的用户脚本 + 数据构建管线。单仓库：`dist/data/` 随源码一并发布。

## 怎么跑起来

```bash
cd probe
npm install            # 仅需 Node.js ≥18，无第三方运行时依赖
npm run build:data     # 构建别名表 + dist/data 分片数据
npm run serve:data     # 本地数据服务器 http://127.0.0.1:4173/data
npm test               # 运行测试（当前 64 项）
```

用户脚本 `probe/talishar-cn.user.js` 是**直接编辑**的安装对象（无构建步骤）。
本地调试：控制台 `localStorage.setItem('fab-cn-data-base-url','http://127.0.0.1:4173/data')`；
切回生产 `localStorage.removeItem('fab-cn-data-base-url')`。

## 技术栈

- 用户脚本：纯 JS（无框架），`GM_registerMenuCommand` / `GM_getValue` / `GM_setValue`
- 构建：Node.js ESM 脚本（分片、别名表、关键词库）
- 分发：GitHub Raw CDN + 浏览器 Cache Storage，按 manifest 的 version 哈希做缓存失效
- 单仓库：`jacefromxa/talishar-cn`，数据从 `.../main/dist/data` 加载

## 目录与约定

- `data/translations/*.json` — 中文翻译源（批次文件）。`heroes.json` 手工维护；机器稿 `status: machine-draft`，人工确认后改 `human-reviewed`
- `data/glossary.zh-CN.json` — 术语表。`keyword` 类别为结构化 `{name_zh, desc_zh}`，构建发布为 `dist/data/keywords.json` 供浮窗释义；**没有 hero 类别**（英雄名靠人工，明确不做机制性强制）
- `data/source/english/card.json` — 英文源（23MB，构建数据源）
- `dist/data/` — 构建产物，分片**按翻译批次命名**（`chunks/t3-warrior.json` 对应该批次）；随源码提交推送即发布
- `probe/test/` — Node 测试（`node --test`）
- 已知：本机访问 github.com 不稳定，git push 常需 `GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=90` 或多次重试

## 当前状态和下一步

- 全卡中文翻译覆盖（3163 卡 / 4941 条目），关键词释义已接线到浮窗
- 已解决：变身叠放卡识别（跟随原生预览图）、Talishar card-square `_equip` 后缀
- 待办：`t3-other` 与 `t4-remaining` 批次命名不一致（生成器兜底名 vs 实际文件名）的历史遗留
