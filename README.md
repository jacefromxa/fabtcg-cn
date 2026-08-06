# talishar-cn — Flesh and Blood 简体中文卡牌浮窗

为 [Talishar](https://talishar.net/) 和 [FaBrary](https://fabrary.net/) 提供 Flesh and Blood
卡牌的简体中文悬浮翻译。将鼠标悬停在卡牌上即可显示中文卡名、类别和规则正文。

## 快速开始

### 安装用户脚本

1. 安装 [Violentmonkey](https://violentmonkey.github.io/) 浏览器扩展
2. 点击 Violentmonkey 图标 → 新建脚本 → 从 URL 安装
3. 粘贴：
   ```
   https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/probe/talishar-cn.user.js
   ```
4. 打开 Talishar 或 FaBrary，悬停卡牌即可看到中文浮窗

数据自动从本仓库的 `dist/data/` 按需加载，无需额外配置。

### 本地开发

```bash
# 安装依赖（仅需 Node.js ≥18）
cd probe

# 构建全部产物（别名表 + 卡牌数据；用户脚本直接编辑、无构建步骤）
npm run build

# 启动本地数据服务器
npm run serve:data

# 运行测试
npm test
```

本地服务器启动后，用户脚本默认连接 `http://127.0.0.1:4173/data`。
如需切换回生产数据，在浏览器控制台执行：

```js
localStorage.removeItem('fab-cn-data-base-url')
```

## 项目架构

```
talishar-cn/
├── data/
│   ├── source/english/card.json    ← 英文全卡库（23MB，构建数据源）
│   ├── translations/               ← 中文翻译源文件（26个模块，按批次管理）
│   │   ├── human-reviewed.json     ← 人工审核翻译
│   │   ├── heroes.json             ← 英雄独立模块（145张，按规范 slug 归档）
│   │   ├── t1-generic.json         ← 通用卡（399张）
│   │   ├── t2-equipment.json       ← 装备（439张）
│   │   ├── t3-*.json               ← 按职业/属性分批
│   │   └── t4-remaining.json       ← 特殊格式卡
│   ├── glossary.zh-CN.json         ← 简体中文术语表（302条，含 100 个异能关键词释义）
│   └── talishar-card-aliases.json  ← 印刷ID → 卡牌Slug别名表
├── dist/data/                      ← 构建产物（随源码仓库发布）
│   ├── manifest.json
│   ├── index.json
│   ├── chunks/<批次>.json          ← 按翻译批次分片（t1-generic / t3-warrior / heroes …）
│   ├── aliases.json
│   └── keywords.json               ← 异能关键词释义库（100 条，浮窗关键词段用）
├── probe/
│   ├── talishar-cn.user.js         ← 用户脚本（直接编辑，安装对象）
│   ├── package.json
│   └── test/                       ← 64项自动化测试
├── scripts/
│   ├── build-card-aliases.mjs      ← 印刷ID别名表生成
│   ├── build-card-data.mjs         ← 卡牌数据分片构建
│   ├── build-translation-drafts.mjs ← 机器初稿批处理
│   ├── dev-data-server.mjs         ← 本地数据服务器
│   └── translate-helper.mjs        ← 翻译辅助引擎
└── HANDOFF.md                      ← 项目交接文档
```

## 翻译覆盖

翻译覆盖 **3,163 唯一卡名（100%）**，含红黄蓝 pitch 变体共 4,941 个条目。
详见 `data/translations/` 下的分批模块文件。

## 翻译维护

修改翻译后在 `probe/` 目录运行：

```bash
npm run build     # 一键构建：别名表 → 卡牌数据
npm test          # 运行全部测试（64项）
```

构建完成后提交并推送源码仓库，`dist/data/` 随发布一并生效。
用户在下次刷新页面时自动获取新翻译（manifest 版本号变化 → 缓存失效）。

## 数据发布

数据随源码仓库一并发布，无需独立数据仓库。用户脚本从本仓库 GitHub Raw 按需加载：

```text
https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/dist/data
```

构建后 `dist/data/` 即包含最新数据（manifest / index / chunks / aliases / keywords），
随源码一起提交推送即完成发布。用户下次刷新页面按 manifest 版本号变化刷新缓存。

### 日常维护流程

```bash
# 1. 修改翻译
vim data/translations/<批次>.json

# 2. 构建全部产物（别名表 + 卡牌数据）
cd probe && npm run build && cd ..

# 3. 提交并推送（翻译源 + 构建脚本 + dist/data 一并发布）
git add -A
git commit -m "fix: 修正 XX 翻译" && git push
```

产物分片**按翻译批次命名**（`chunks/t3-warrior.json` 对应该批次文件），
改哪个批次的翻译，一眼可知影响的 chunk，维护时不用再猜首字母。

### 数据流向

```
data/translations/*.json   (翻译源，按批次编辑)
  │
  ▼  npm run build
dist/data/*.json           (构建产物：manifest / index / chunks/<批次> / aliases / keywords)
  │
  ▼  git commit + push（随源码仓库）
GitHub Raw (jacefromxa/talishar-cn/main/dist/data)
  │
  ▼  HTTP GET
用户脚本 (浏览器)          (按需加载 manifest → index → 命中批次 chunk)
```

### 本地开发切换

插件默认从生产地址加载。本地开发时，启动 `npm run serve:data` 后在浏览器控制台执行：

```js
localStorage.setItem('fab-cn-data-base-url', 'http://127.0.0.1:4173/data')
```

切回生产数据：

```js
localStorage.removeItem('fab-cn-data-base-url')
```

## 许可

翻译文本按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。
本项目与 Legend Story Studios® 无关联。Flesh and Blood™ 是 Legend Story Studios 的注册商标。
