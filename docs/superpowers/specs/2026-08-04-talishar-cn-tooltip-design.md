# Talishar 简体中文卡牌悬停浮窗 MVP 设计

日期：2026-08-04

## 目标

为 Talishar 增加一个用户侧的中文卡牌辅助层：鼠标移到对局中已经公开显示的卡牌上时，显示中文卡名和规则文本。第一阶段只验证 Talishar 是否能稳定暴露卡牌标识，不修改对局逻辑，不读取隐藏信息。

## MVP 范围

第一阶段交付一个 Tampermonkey 用户脚本：

- 仅匹配 `https://talishar.net/*`。
- 使用事件委托监听鼠标悬停。
- 从悬停目标及其祖先元素中读取 `img.src`、`alt`、`title` 和 `data-*` 属性。
- 在页面固定位置显示调试浮窗，列出可提取的候选卡牌标识。
- 对没有识别结果的元素显示“未识别”，不猜测卡牌身份。
- 不拦截点击、拖拽、键盘输入或网络请求。
- 不尝试识别牌库、盖牌或其他页面未公开的卡牌。

第二阶段在第一阶段确认 ID 规则后，增加本地 `cards.zh.json`，先支持 3 张测试牌，再扩展到 10～20 张牌。中文资料初期从 `fabtcg.cn` 人工整理或离线导入，插件运行时不依赖该站点。

## 备选路线与选择

### Tampermonkey 用户脚本（选择）

最适合验证 DOM 结构和卡牌 ID，安装和迭代成本最低。脚本验证成功后，再迁移到 Manifest V3 扩展。

### 正式浏览器扩展

适合作为第二阶段产品形态，提供开关、字体设置、简繁切换和版本化卡库，但在 ID 规则未知前提前打包会增加无效工作。

### 直接修改 Talishar-FE

适合未来向上游贡献，但需要跟随其 React 前端和部署流程，不作为本次 MVP 的入口。

## 组件设计

```text
Talishar DOM
  -> hover probe
  -> candidate attribute collector
  -> card-id normalizer
  -> local card data lookup
  -> fixed tooltip renderer
```

### Hover probe

使用 `pointerover` 事件委托在 `document` 上监听，避免为 React 动态生成的每张牌单独绑定监听器。目标元素变化时，只更新当前候选信息。

### Candidate collector

从目标元素开始向上检查有限层级的祖先元素，收集：

- 图片地址和文件名；
- `alt`、`title`；
- 以 `data-` 开头的属性；
- 元素的标签名和 class 名，供调试使用。

不依赖 React 内部 Redux 状态，不执行页面脚本注入，不访问对局接口。

### Tooltip renderer

第一阶段使用一个带固定前缀的 DOM 节点，例如 `#fab-cn-tooltip`，使用 `position: fixed` 定位到鼠标附近，并在靠近视口边缘时自动翻转位置。浮窗设置 `pointer-events: none`，避免遮挡 Talishar 的交互。

### Local card data

第二阶段采用本地 JSON，不在悬停时访问外部站点。数据主键使用 Talishar 的稳定 ID；如果中文资料网站使用另一套编号，则通过单独的映射字段连接。

```json
{
  "WTR001": {
    "name": "示例卡名",
    "rules": "示例规则文本",
    "cost": 2,
    "power": 6,
    "defense": 3,
    "pitch": 3
  }
}
```

## 数据源策略

`fabtcg.cn` 暂不作为运行时依赖。原因是当前尚未确认它是否提供稳定、公开且允许自动访问的 API。后续按以下顺序验证：

1. 页面是否直接显示卡号和中文规则；
2. 页面是否加载内嵌 JSON 或 XHR 数据；
3. 是否存在稳定公开 API、版本信息和合理的自动访问条件。

即使最终没有 API，也可以把人工整理结果转换为本地 JSON。未知牌必须优雅降级为英文或“暂无中文资料”。

## 错误与安全边界

- 无法提取 ID：显示调试信息，不显示错误卡名。
- ID 未收录：显示“暂无中文资料”，保留英文信息。
- Talishar 页面重新渲染：事件委托继续生效。
- 外部中文站点不可访问：已经打包的本地资料仍可使用。
- 只处理页面中实际可见的卡牌，不推断隐藏牌。
- 不记录账号、对局内容或玩家信息。

## 验收标准

第一阶段通过条件：

1. 在 Talishar 对局页安装脚本后能看到探针面板。
2. 鼠标移到至少一张手牌和一张场上牌时，探针能收集候选属性。
3. 同一张牌在不同区域的候选标识可归一为同一个 ID，或明确记录差异。
4. 移动牌、切换阶段、页面局部重绘后脚本仍工作。
5. 脚本不影响正常点击、拖拽和出牌。

第二阶段通过条件：

1. 3 张测试牌可以正确显示简体中文浮窗。
2. 至少覆盖手牌、场上牌和战斗链中的两个区域。
3. 未收录卡牌不会显示错误中文资料。

## 参考

- Talishar-FE：<https://github.com/Talishar/Talishar-FE>
- Talishar 后端：<https://github.com/Talishar/Talishar>
- CardImages：<https://github.com/Talishar/CardImages>
- 用户提供的中文资料来源：<https://fabtcg.cn/>
