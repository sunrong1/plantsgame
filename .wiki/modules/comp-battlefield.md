---
module: comp-battlefield
path: src/components/battle/BattleField.vue
deps:
  - "[[core-grid]]"
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "dd093f4e"
source: header-comment
---

# 战场渲染

**职责**：渲染战场网格、塔与僵尸的容器。

**核心 API**：
```
战场主容器组件
```

**设计约束**：
只读 store 的 state，不自己算战斗结果。

**已知坑点**：
（待补充）
