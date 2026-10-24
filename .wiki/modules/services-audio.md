---
module: services-audio
path: src/services/audio.ts
deps:
  - "[[services-pronunciation]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "a84eec5b"
---

# 音频服务

**职责**：音效与 BGM 的播放、解锁、状态管理。

**核心 API**：
```
音频相关导出
```

**设计约束**：
音频上下文必须在用户手势后解锁。

**已知坑点**：

