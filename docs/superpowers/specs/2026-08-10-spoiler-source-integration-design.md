# Spoiler Source Integration Design

## Goal

让当前翻译工作流开始包含上游 `usurp-the-shadow-throne` spoiler 分支中的卡牌，同时保证既有全量数据库、已生成译文和人工修订译文不被重写。

## Chosen approach

- 将 spoiler 分支作为本次项目使用的英文源快照，直接替换 `data/source/english/card.json` 和 `card-reference.json`。
- 不新增正式区/预览区双数据架构；当前目标只是把已公布但尚未正式发布的卡纳入现有翻译计划。
- 在翻译草稿生成器中增加 `--only-missing` 模式。该模式只为源数据中尚不存在的 key 添加 `machine-draft`，任何已有 key 都原样保留，不论其状态是 `machine-draft` 还是人工审核状态。
- 对上游已有但正文发生变化的卡，只更新英文源，不自动改写对应中文译文；后续手动翻译批次再按英文差异处理。
- 仍按现有的 hero、generic、equipment、class/talent 批次归档，因此不会引入新的翻译数据格式。

## Operational consequence

这条最简路径会让生成后的 `dist` 同时展示正式卡和 spoiler 卡。需要区分状态时，以源分支/版本记录识别 spoiler；不另加会影响现有加载链路的 preview 字段。

## Safety guarantees

- 同步前记录上游分支和 commit。
- 翻译生成只使用 `--only-missing`。
- 验证新增 key 数量、源数据无删除、既有翻译 key 的 JSON 内容未变。
- 通过现有测试和 `probe` 构建后再交付。
