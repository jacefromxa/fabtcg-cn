# talishar-cn — Flesh and Blood 简体中文卡牌浮窗

为 [Talishar](https://talishar.net/) 与 [FaBrary](https://fabrary.net/) 提供 Flesh and Blood
卡牌悬停中文翻译：鼠标悬停卡牌即显示中文卡名、类别与规则正文，并附异能关键词释义。

## 安装

1. 安装 [Violentmonkey](https://violentmonkey.github.io/)（或 Tampermonkey）浏览器扩展
2. 从 URL 安装用户脚本：

   ```
   https://raw.githubusercontent.com/jacefromxa/talishar-cn/main/probe/talishar-cn.user.js
   ```

3. 打开 Talishar 或 FaBrary，悬停卡牌即可看到中文浮窗

数据自动从本仓库加载，无需额外配置。脚本含自动更新入口，新版本会自动检测。

## 使用

- 悬停卡牌：浮窗显示中文卡名、类别、规则正文、关键词释义（每行以「·」标记）
- 插件菜单：切换固定/跟随模式、设置样式（颜色与字号）、调试模式

## 开发

```bash
cd probe
npm install         # 需 Node.js ≥18
npm run build       # 构建别名表 + 卡牌数据到 dist/data
npm run serve:data  # 本地数据服务器 http://127.0.0.1:4173/data
npm run review      # 启动本地译名校对台 http://127.0.0.1:4174
npm test            # 运行测试
```

翻译源按批次维护于 `data/translations/`，构建产物 `dist/data/` 分片与翻译批次同名，随源码一并发布。

### 本地译名校对台

校对台按批次分页展示英文卡名、现译名和更新译名；悬停英文卡名可预览卡图。同一张卡的 pitch 版本合并为一行，但正文和数值仍按版本独立保留。

```bash
cd probe
npm run review
# 在 http://127.0.0.1:4174 修改译名并提交
node ../scripts/apply-translation-submissions.mjs
npm run build:data
npm test
```

浏览器提交只会生成 `data/review-submissions/pending/` 下的 JSON，不会直接改动翻译源。应用命令会先校验提交时的旧译名快照，确认无冲突后才只修改对应条目的 `name_zh`，成功记录会移到 `processed/`。

## 许可

用户脚本代码按 [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) 许可；翻译文本按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。
本项目与 Legend Story Studios® 无关联。Flesh and Blood™ 是 Legend Story Studios 的注册商标。
