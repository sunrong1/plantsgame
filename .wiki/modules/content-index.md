---
module: content-index
path: src/content/index.ts
deps:
  - "[[content-schema]]"
  - "[[content-distribution]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "9bc2bc0f"
---

# 单元内容入口

**职责**：单元内容的解析与查询。

**核心 API**：
```
`parseUnit()` · `getUnit()` · `UNITS`
```

**设计约束**：
FIRST_UNIT / LAST_UNIT 从 distribution.ts 取。

**已知坑点**：

