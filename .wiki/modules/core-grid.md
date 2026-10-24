---
module: core-grid
path: src/core/grid.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "f3aca85c"
---

# 网格规格与坐标换算

**职责**：网格尺寸的唯一定义处。

**核心 API**：
```
`ROWS` · `COLS` · `ZOMBIE_ROW` · `HOUSE_COL` · `cellToRowCol()`
```

**设计约束**：
组件不得重定义 ROWS / COLS / ZOMBIE_ROW / HOUSE_COL——Story 1.10 的 CSS 网格读的是这里的常量。

**已知坑点**：
[CR] 2026-10-21 复审：上一句原来带行号锚点「架构 :642」，该行号今天指向别处。行号锚点会漂移，引用规格而不引用行号。

**相关决策**：
- [Story 1.10 归档文档](_bmad-output/archive/1-10-战场渲染与网格.md) —— 本模块的设计由来与验收标准
