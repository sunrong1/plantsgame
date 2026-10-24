---
module: core-index
path: src/core/index.ts
deps:
  - "[[core-types]]"
  - "[[core-balance]]"
  - "[[core-grid]]"
  - "[[core-actions]]"
  - "[[core-combat]]"
  - "[[core-hud]]"
  - "[[core-reducer]]"
  - "[[core-turn]]"
  - "[[core-build]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "a8f27c9b"
---

# core 公共出口

**职责**：core 层对外的统一出口。

**核心 API**：
```
re-export 聚合
```

**设计约束**：
组件一律从 core/index.ts 导入，不直接深入具体文件。

**已知坑点**：
这是 repo map 里 PageRank 最高的枢纽文件——引用了 types/balance/grid/actions/combat/hud 六个模块。
