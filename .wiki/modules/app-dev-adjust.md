---
module: app-dev-adjust
path: src/app/dev-adjust.ts
deps:
  - "[[core-balance]]"
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "f564ff57"
---

# 开发期数值调整

**职责**：开发模式下临时改数值用。

**核心 API**：
```
`devAdjust` · `devFlags`
```

**设计约束**：
只在开发期生效，不得进入生产构建的行为分支。

**已知坑点**：

