---
module: comp-hand-deck
path: src/components/hand/HandDeck.vue
deps:
  - "[[core-types]]"
  - "[[core-deck-slice]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "de4e367d"
source: header-comment
---

# 手牌区

**职责**：手牌区的布局与交互。

**核心 API**：
```
HandDeck
```

**设计约束**：
不得绕过 handCards 自己 import costOf。

**已知坑点**：
（待补充）
