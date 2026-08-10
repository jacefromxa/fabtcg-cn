# Hero Type Field Display Design

## Problem

英雄翻译源中的 `heroes.json` 按现有约定保留英文类别在 `type_en`，并将 `type_zh` 留空。`scripts/build-card-data.mjs` 生成发布卡片时没有复制 `type_en`，因此用户脚本的类别 fallback 无法生效，英雄牌类别显示为空。

## Design

在 `normalizeCard()` 的发布数据结构中加入 `type_en: first.type_en || ''`。用户脚本已经按 `type_zh || type_en` 显示类别，不改变前端渲染代码，也不修改任何翻译源条目。

## Verification

- 构建单元测试确认英雄卡的 `type_en` 从输入进入 chunk，且普通卡现有字段不受影响。
- 重建 `dist/data`，检查真实 hero chunk 包含类别。
- 运行完整测试套件和 `git diff --check`。
