---
module: core-deck-slice
path: src/core/deck-slice.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "261a4f54"
---

# 题单切片

**职责**：题单的分层与抽取逻辑。

**核心 API**：
```
题单相关切片函数
```

**设计约束**：
题单是固定全集，切片只做选择不做改写。

**已知坑点**：

