---
domain: content
related:
  - "[[content-index]]"
  - "[[core-deck-slice]]"
  - "[[comp-question-card]]"
created: 2026-10-23
---

# 术语表 · 内容与学习

| 术语 | 定义 | 代码位置 | 相关 |
|---|---|---|---|
| **题单（deck）** | 本局题目的固定全集，一局内数组本身永不变动 | `core/types.ts` | `[[core-deck-slice]]` |
| **已答对（masteredEntryIds）** | 表达「已学会的词不再出现」，不靠重排队列 | `core/reducer.ts` | `[[core-reducer]]` |
| **题面（Question = DeckEntry）** | 题单条目；不随局清空，清空的是 towers / grid / zombies | `core/types.ts` | `[[comp-question-card]]` |
| **单元（Unit）** | 一组词表内容，对应一个 `UNITS` 条目 | `content/index.ts` | `[[content-index]]` |
