# Talishar / FaBrary 简体中文卡牌浮窗

这是 Talishar / FaBrary 简体中文卡牌浮窗项目。用户脚本只负责识别悬停的卡牌、加载需要的数据并显示浮窗；中文卡库独立构建、分片和缓存，适合扩充到完整卡池。浮窗会跟随原生卡图，自动选择卡图左侧或右侧的可用空间。

**支持的站点：**

- **Talishar**（对战页）：按卡图文件名 slug 匹配（如 `titans_fist.webp`）。
- **FaBrary**（牌表/卡牌站）：按卡图 `src` 里的印刷 ID（如 `PEN313.webp`）经 `dist/data/aliases.json` 别名表解析到 slug，并用 `alt` 卡名交叉消解歧义；`alt` 文本本身也可直接兜底匹配。

用户脚本按 `location.host` 自动选择解析路径，同一份数据层/缓存/浮窗两站共用。

目前中文数据已覆盖约 2,974 个不同卡名（T1 通用 + T2 装备 + T3 职业/属性 + 兜底批次），英文卡库 4,941 张已全部导入并有批次归属。

牌组清单位于：

```text
/Users/Zhuanz/CCDeep/talishar-cn/data/decks/jarl-vetreidi-calling-edinburgh-5th.json
```

## 运行测试

在项目目录运行：

```bash
cd /Users/Zhuanz/CCDeep/talishar-cn/probe
npm test
```

## 生成可安装用户脚本

中文翻译源按批次存放在：

```text
/Users/Zhuanz/CCDeep/talishar-cn/data/translations/
  human-reviewed.json    ← 人工审核原稿（受保护）
  t1-generic.json        ← 通用牌
  t2-equipment.json      ← 装备/武器
  t3-*.json              ← 各职业/属性批次（含 t3-other 兜底）
```

修改对应批次的翻译文件后，在 `probe` 目录运行：

```bash
npm run build
```

该命令会同时生成轻量用户脚本和远程数据文件：

```text
/Users/Zhuanz/CCDeep/talishar-cn/probe/talishar-cn.user.js
/Users/Zhuanz/CCDeep/talishar-cn/dist/data/manifest.json
/Users/Zhuanz/CCDeep/talishar-cn/dist/data/index.json
/Users/Zhuanz/CCDeep/talishar-cn/dist/data/chunks/
```

用户脚本不会嵌入完整中文卡库。首次悬停卡牌时，它读取 manifest 和索引，再按需加载对应分片，并使用浏览器缓存保存已加载的数据。

生成文件为：

```text
/Users/Zhuanz/CCDeep/talishar-cn/probe/talishar-cn.user.js
```

这份生成文件可以直接安装到 Violentmonkey 或 Tampermonkey。当前建议使用 Violentmonkey，因为它已经在实际 Talishar 页面上验证可执行。

## 英文卡库导入

完整英文源文件位于：

```text
/Users/Zhuanz/CCDeep/talishar-cn/data/source/english/card.json
```

如需重新生成精简英文索引，运行：

```bash
node /Users/Zhuanz/CCDeep/talishar-cn/scripts/import-fab-cards.mjs
```

输出文件为 `data/cards.en.json`。它目前用于建立英文卡牌字段和 Talishar 图片标识的参考，尚未自动把英文卡面翻译成中文。

## 发布中文数据

用户脚本默认从以下地址读取静态卡库：

```text
https://raw.githubusercontent.com/jacefromxa/CCDeep/main/talishar-cn/dist/data
```

因此需要把 `dist/data/` 发布到该 GitHub 仓库的 `main` 分支。发布后，用户只需安装 `talishar-cn.user.js`，不需要把卡牌 JSON 手工复制进用户脚本。

如果以后更换静态地址，修改 `probe/probe.user.js` 顶部的 `DEFAULT_DATA_BASE_URL`，然后重新运行 `npm run build`。

## 安装和验证

1. 在 Violentmonkey 中新建用户脚本。
2. 将 `talishar-cn.user.js` 的完整内容复制进去并保存。
3. 打开 [Talishar](https://talishar.net/)，进入对战或观战页面，将鼠标移动到可见卡牌上；或打开 [FaBrary](https://fabrary.net/decks)，进入任意牌表页悬停卡图。
4. 浮窗应跟随卡图显示中文卡名、卡类别和正文。

浮窗只显示卡名、卡类别和中文正文：卡名为橙色粗体，卡类别为细体斜体并带下划线，正文保留原有换行。脚本只监听鼠标悬停，不拦截点击、拖拽、键盘输入或游戏请求。Talishar 按图片文件名 slug 匹配；FaBrary 按印刷 ID 别名 + `alt` 卡名匹配（红黄蓝同名卡通过印刷 ID 精确区分 pitch）。

## 数据文件格式

```json
{
  "titans_fist": {
    "name_zh": "泰坦之拳",
    "name_en": "Titan's Fist",
    "type_zh": "守护者武器·锤（单手）",
    "power": 3,
    "text_zh": "每回合一次行动——支付3点资源：攻击。",
    "source": "https://cards.fabtcg.com/card/titans-fist/",
    "status": "mvp-provisional"
  }
}
```

主键应使用 Talishar 图片文件名去掉扩展名后的形式，例如 `titans_fist`。同名红黄蓝版本使用 `__1`、`__2`、`__3` 区分；构建时会自动聚合到同一个卡牌 ID 下的 `variants`。每次增加中文卡牌后重新运行 `npm run build`，再发布新的 `dist/data/`。
