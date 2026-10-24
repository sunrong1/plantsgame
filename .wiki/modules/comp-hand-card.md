---
module: comp-hand-card
path: src/components/hand/HandCard.vue
deps:
  - "[[core-types]]"
  - "[[core-build]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "42937954"
source: header-comment
---

# 手牌卡面

**职责**：渲染手牌中的一张卡。

**核心 API**：
```
HandCard
```

**设计约束**：
造价读 core 的 costOf，不本地定义（守卫 G33a/G33b）。

**已知坑点**：
（待补充）
