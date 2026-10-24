---
module: comp-answer-feedback
path: src/components/quiz/AnswerFeedback.vue
deps:
  - "[[core-types]]"
  - "[[core-reducer]]"
status: draft
last_sync: "2026-10-23T18:40:00+08:00"
hash: "82f10a67"
source: header-comment
---

# 答题反馈

**职责**：答题后的即时反馈展示。

**核心 API**：
```
AnswerFeedback
```

**设计约束**：
≤100ms 反馈需要可见载体——这是 AC 的要求，不是优化项。

**已知坑点**：
（待补充）
