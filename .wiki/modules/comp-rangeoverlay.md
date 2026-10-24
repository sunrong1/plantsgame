---
module: comp-rangeoverlay
path: src/components/battle/RangeOverlay.vue
deps:
  - "[[core-build]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "3efe9ae9"
source: header-comment
---

# 射程预览

**职责**：建造期显示放置后的射程/伤害覆盖形状。

**核心 API**：
```
射程覆盖层
```

**设计约束**：
覆盖形状必须用 core/build.ts 的 coverCellsAt()，不得自行计算圆形。

**已知坑点**：
（待补充）
