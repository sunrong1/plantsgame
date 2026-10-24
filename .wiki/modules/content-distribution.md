---
module: content-distribution
path: src/content/distribution.ts
deps:
  - "[[content-schema]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "1f9b2c4b"
---

# 单元分布

**职责**：各单元卡片的分布策略。

**核心 API**：
```
`CardDistribution` · `FIRST_UNIT` · `LAST_UNIT`
```

**设计约束**：
形态是档位表，不是散落常量（同 balance.ts 的纪律）。

**已知坑点**：

