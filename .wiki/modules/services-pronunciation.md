---
module: services-pronunciation
path: src/services/pronunciation.ts
deps:
  - "[[services-audio]]"
  - "[[content-index]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "83d25864"
---

# 朗读服务

**职责**：单词发音的获取与播放调度。

**核心 API**：
```
朗读相关导出
```

**设计约束**：
所有发音走 store 的 speakQuestion() 门面，组件不得直接 import。

**已知坑点**：
组件直接调用会造成重复播放——守卫 G25 守这条。
