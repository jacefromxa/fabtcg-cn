# Talishar 卡牌标识观察记录

状态：本地探针已通过自动化测试，尚未完成 Talishar 实际对局页面的现场记录。

请在 Talishar 中分别悬停一张手牌、一张场上牌和一张战斗链卡牌，然后复制右下角探针面板中的信息到下面对应位置。不要记录用户名、聊天内容或隐藏信息。

## 手牌

```text
Talishar URL:
Zone: hand
Image URL:
alt/title:
data-*:
Candidate ID:
```

## 场上牌

```text
Talishar URL:
Zone: arena
Image URL:
alt/title:
data-*:
Candidate ID:
```

## 战斗链

```text
Talishar URL:
Zone: combat chain
Image URL:
alt/title:
data-*:
Candidate ID:
```

## 判定规则

- 如果多个区域都暴露同一个稳定卡牌编号，下一阶段直接以该编号作为 `cards.zh.json` 的主键。
- 如果只有英文卡名，下一阶段增加英文卡名到 Talishar 编号的映射。
- 如果同一张牌因重印版本出现多个编号，下一阶段增加重印归一化表。
