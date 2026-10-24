---
module: comp-question-card
path: src/components/quiz/QuestionCard.vue
deps:
  - "[[core-types]]"
  - "[[core-reducer]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "67e33e3f"
source: header-comment
---

# 题面卡面

**职责**：题面区 + 选项区 + 重听。不判定对错。

**核心 API**：
```
QuestionCard
```

**设计约束**：
不判定对错（AC-D1）：读的是 reducer 已算好存进 state.masteredEntryIds 的事实。判据在 pickedRight，三行零分支，逐字对应 AC-D2 公式。

**已知坑点**：
1.19 CR 之前这道题住在组件本地的 lastQuestion ref 里，而存档恢复时组件是全新挂载的 ⇒ 那份 ref 恒为 null ⇒ 孩子从存档回到建造期时卡面整个消失。现在 Phase.awaiting-build 自带 question，shown 在两个相位上读同一数据源，lastQuestion 已删除。
