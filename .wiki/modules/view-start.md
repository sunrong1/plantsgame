---
module: view-start
path: src/views/StartView.vue
deps:
  - "[[app-store]]"
  - "[[services-save]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "de248f5b"
source: header-comment
---

# 开始视图

**职责**：开始页与存档恢复入口。

**核心 API**：
```
StartView
```

**设计约束**：
存档恢复是独立形态的 bug 现场（见 services-save）。

**已知坑点**：
（待补充）
