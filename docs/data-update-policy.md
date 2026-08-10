# 英文卡牌数据更新规范

状态：生效
适用范围：英文源、英文索引、printing 别名、中文翻译和 dist 发布产物的人工更新。

## 1. 数据源和职责边界

本项目的英文原生卡牌数据源是：

~~~
https://github.com/the-fab-cube/flesh-and-blood-cards
~~~

上游文件：

~~~
json/english/card.json
json/english/card-reference.json
~~~

本地对应文件：

~~~
data/source/english/card.json
data/source/english/card-reference.json
~~~

本项目当前为了纳入已公开 spoiler，使用上游 `usurp-the-shadow-throne` 分支作为英文源基线。执行时必须记录实际使用的分支和 commit；以后 spoiler 正式发布或用户指定其他 release、tag、分支时，再人工切换并记录新的基线。

以下是派生文件，不得手工当作英文源修改：

~~~
data/cards.en.json
data/talishar-card-aliases.json
dist/data/
~~~

它们分别由 scripts/import-fab-cards.mjs、scripts/build-card-aliases.mjs 和 probe/npm run build 生成。

FaBrary、TCGplayer 和卡图页面只能用于交叉核对或获取预览信息，不能替代上游英文源。预览页面中尚未进入上游 JSON 的牌，不得直接写入正式英文源。

## 2. 最小人工更新闭环

每次由用户明确触发一次更新。不要设置定时任务、后台 watcher 或自动同步 GitHub 的脚本。

### 步骤一：预检

在项目根目录执行：

~~~
git status --short
git remote -v
~~~

如果 data/source/english/、data/cards.en.json、data/talishar-card-aliases.json 或 dist/data/ 有未提交改动，先停止并报告，不能覆盖。其他不相关的用户改动必须保留。

### 步骤二：获取上游快照

上游只读拉取到临时目录，不在当前项目中添加上游 remote，也不直接在当前工作树 checkout 上游分支：

~~~
upstream_dir="$(mktemp -d)"
git clone --filter=blob:none --no-checkout https://github.com/the-fab-cube/flesh-and-blood-cards.git "$upstream_dir"
git -C "$upstream_dir" checkout --force usurp-the-shadow-throne -- json/english/card.json json/english/card-reference.json
~~~

当前分支是项目明确采用的 spoiler 基线，不需要另建 preview 数据区；必须在交接记录中写明它仍是 spoiler 数据。

### 步骤三：先比较，再决定是否同步

至少比较：

- card.json 的 blob hash；
- card-reference.json 的 blob hash；
- 卡牌总数；
- 以 unique_id 为键的新增、删除和字段变化；
- 每张变化卡的 name、pitch、规则正文和 printings[].id；
- 用户关注的 set / printing 编号。

判断规则：

- 两个源文件 hash 相同：记录“无差异”，英文源无需更新；
- 有新增卡：可以同步英文源，但必须列入待翻译清单；
- 有字段或 printing 变化：可以同步英文源，并检查中文正文、卡图和别名；
- 上游删除卡：默认不删除本地记录，先报告并等待明确确认；
- 未经项目采用的 feature branch、spoiler branch 和未指定的 tag：只做差异报告，不直接合并；本项目当前采用的 `usurp-the-shadow-throne` 例外，按本规范执行；
- 预览页出现但上游没有的卡：不写入正式英文源。

### 步骤四：同步英文源

只有步骤三确认允许同步时，才替换源文件：

~~~
cp "$upstream_dir/json/english/card.json" data/source/english/card.json
cp "$upstream_dir/json/english/card-reference.json" data/source/english/card-reference.json
node scripts/import-fab-cards.mjs
~~~

data/cards.en.json 只能由导入脚本生成，不能手工补卡或修字段。

### 步骤五：处理中文翻译

英文源同步和中文翻译是两个阶段，不得因为英文源更新而覆盖现有人工译文。

对新增卡：

1. 根据 types 和项目既有批次规则确定唯一的 data/translations/<batch>.json；
2. 每个 pitch 作为独立条目保存，使用基础 slug、__1、__2、__3；
3. 保留英文源的 pitch、cost、power、defense 和正文对应关系；
4. 只允许用 `scripts/build-translation-drafts.mjs <batch> --only-missing` 补机器稿；该模式只新增不存在的 key，已有机器草稿、人工修订和任何其他已有条目都原样保留；机器稿必须经过人工确认；
5. 如果译名发生变化，搜索所有中文 text_zh 中引用旧牌名的正文并同步替换；
6. 不因为“已改过”或 status 值而禁止再次修改。

对已有卡的英文正文或 printing 变化：

- 不自动重写中文正文；
- 先列出受影响卡，再人工判断中文正文是否需要对齐；
- 红、黄、蓝 pitch 的数值必须逐版本核对，不能复制另一个 pitch 的数值或正文；
- 只新增 printing 时，优先补 printing 和别名，不重复创建同名翻译卡。

### 步骤五点一：纳入手动译名维护链

内部校对台产生的 `data/review-submissions/pending/` 是翻译源更新的输入，不属于线上发布内容。处理顺序固定为：

~~~
启动 review -> 提交 pending -> node scripts/apply-translation-submissions.mjs -> 检查处理记录 -> npm run build
~~~

应用提交前会校验旧译名快照；通过后修改对应批次的 `name_zh`，并把正文中引用该英文牌名且命中旧中文译名的表述同步为新译名。处理后的审计文件留在 `processed/`，`pending/` 和 `processed/` 均不得发布到线上。该手动更新步骤与英文源更新同属翻译流程，但不会自动运行，也不会改变 `status` 作为“是否还能修改”的判断。

### 步骤六：构建发布数据

中文源确认后，在项目根目录执行：

~~~
cd probe
npm run build
npm test
cd ..
~~~

构建顺序由 probe/npm run build 负责：先生成别名，再生成 dist/data/ 分片。发布产物不得作为下一轮编辑源。

### 步骤七：验证和交接

至少确认：

- 所有 JSON 可以解析；
- data/cards.en.json 能由当前英文源重新生成；
- 新增或变化的 printing 能生成正确 alias；
- 同名不同 pitch 没有合并数值；
- 中文翻译批次没有重复 key；
- npm test 通过；
- git diff --stat 和 git status --short 只包含本次允许的文件；
- 用户原有未提交改动仍然存在。

交接报告使用以下格式：

~~~
上游：the-fab-cube/flesh-and-blood-cards
基线：<branch> @ <commit>
英文源：<updated / no-diff>
card.json：<before hash> -> <after hash>
card-reference.json：<before hash> -> <after hash>
差异：新增 <n>，删除 <n>，变化 <n>
翻译：<新增 / 未涉及 / 待人工确认>
构建：<command>
验证：<test result>
未处理项：<明确列出，不能写“无”而隐去预览卡或 feature branch>
~~~

## 3. 当前基线核对结果

截至 2026-08-10：

- 当前上游基线：`usurp-the-shadow-throne` @ `91e597aaaf2d743e981a42ac5df1ffc3f3dd8589`；这是纳入翻译计划的 spoiler 快照；
- `data/source/english/card.json`：旧源 4,941 条 -> 新源 4,976 条；按 `unique_id` 新增 35、删除 0、字段变化 20；
- 当前 `card.json` hash：`a4c0542d7838c2ecfff3efa087c077c85f8152fe485a0f1081d76869369419f4`；
- 当前 `card-reference.json` hash：`1fae050d5e6b8e28e9b2eba53eb83ea830f67f0bd6d0058b188d05b7ca4788bc`；
- 新增 spoiler 已按既有批次补入 35 个翻译条目（含 hero），只补缺失 key；已有翻译未被重写；
- 20 张已有卡的英文正文、名称或 printing 变化仅进入英文源，未自动覆盖中文正文，待后续人工翻译批次核对；
- FaBrary 和 Armory Deck 页面仍只作交叉核对；只要上游 spoiler 分支已有数据，就通过该分支进入本项目，不直接从页面抄写。

## 4. 给 Agent 的执行指令

当用户说“更新英文卡牌数据库”时，Agent 按本规范执行一次人工核对：

~~~
只使用 the-fab-cube/flesh-and-blood-cards 的指定基线分支；当前默认是已采用的 `usurp-the-shadow-throne` spoiler 分支。
先在临时目录拉取并比较 card.json 与 card-reference.json，记录 branch、commit、hash 和差异数量。
不使用其他未经采用的 feature/spoiler branch，不使用 FaBrary 页面补写英文源，不删除本地卡。
确认有差异后才同步英文源；同步后重新生成 cards.en.json 和 alias，再处理中文翻译，最后 npm run build 和 npm test。
新增卡只运行各批次的 `--only-missing`，不得用普通模式刷新既有机器草稿；已有译名和人工正文均由翻译维护者决定是否修改。
如果有内部 review pending，先运行提交应用器并检查正文联动结果，再构建；pending/processed 不进入线上。
如果无差异，明确报告无差异并停止，不为了产生改动而触碰源文件或 dist。
交接报告必须列出未处理的预览卡、feature branch 和待人工翻译项。
~~~
