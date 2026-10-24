---
module: core-effects
path: src/core/effects.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "6e921256"
---

# 效果定义

**职责**：音效与视觉效果的声明式定义。

**核心 API**：
```
效果定义与元数据
```

**设计约束**：
声明式，运行时由 app/effects-runner.ts 派发。

**已知坑点**：

