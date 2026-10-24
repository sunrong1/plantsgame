---
module: core-session-replay
path: src/core/session-replay.ts
deps:
  - "[[core-types]]"
  - "[[core-reducer]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "d92db24d"
---

# 会话回放

**职责**：从 Action 序列重放一局。

**核心 API**：
```
回放相关导出
```

**设计约束**：
依赖 reducer 的纯函数性质：同一串 Action 必须重放出完全相同的一局。

**已知坑点**：

