---
module: content-schema
path: src/content/schema.ts
deps:
  - "[[content-index]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "8e8deb3d"
---

# 内容数据 Schema

**职责**：单元内容 JSON 的校验 schema。

**核心 API**：
```
`EntrySchema` · `CardSchema` · `OptionSchema` · `ProblemCategory`
```

**设计约束**：
EntrySchema 是单元条目的校验入口。

**已知坑点**：

