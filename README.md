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
npm test            # 运行测试
```

翻译源按批次维护于 `data/translations/`，构建产物 `dist/data/` 分片与翻译批次同名，随源码一并发布。

## 许可

翻译文本按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。
本项目与 Legend Story Studios® 无关联。Flesh and Blood™ 是 Legend Story Studios 的注册商标。
