---
module: comp-pronunciation-overlay
path: src/components/hud/PronunciationOverlay.vue
deps:
  - "[[services-pronunciation]]"
  - "[[app-store]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "d4a21b8e"
source: header-comment
---

# 朗读浮层

**职责**：显示单词发音浮层。

**核心 API**：
```
PronunciationOverlay
```

**设计约束**：
朗读只经 store 的 speakQuestion() 门面，不直接 import services/pronunciation（守卫 G25）。

**已知坑点**：
（待补充）
