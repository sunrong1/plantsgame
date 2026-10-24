---
module: app-session-recorder
path: src/app/session-recorder.ts
deps:
  - "[[core-types]]"
  - "[[app-store]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "a08a667e"
---

# 会话录制

**职责**：录下一局的操作序列用于复现。

**核心 API**：
```
`recordStep()` · `exportSession()`
```

**设计约束**：


**已知坑点**：

