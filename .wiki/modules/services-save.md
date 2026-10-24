---
module: services-save
path: src/services/save.ts
deps:
  - "[[core-types]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "100f38a4"
---

# 存档服务

**职责**：存档的读写与版本迁移。

**核心 API**：
```
SAVE_KEY · `save()` · `load()` · `SAVE_SCHEMA_VERSION`
```

**设计约束**：
存档恢复时组件是全新挂载的——这正是 1.19 CR 之前卡面消失的根因。

**已知坑点**：
⚠️ 存档恢复是一个独立形态的 bug 现场，1.15 当年漏判过这个形态。
