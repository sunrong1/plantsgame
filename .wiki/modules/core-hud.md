---
module: core-hud
path: src/core/hud.ts
deps:
  - "[[core-types]]"
  - "[[core-balance]]"
status: draft
last_sync: "2026-10-24T08:30:00+08:00"
hash: "ae8ccfe0"
source: header-comment
---

# HUD 判据

**职责**：HUD 的四组判据（Story 1.13 / AC-B1..AC-B7），把「组件不得自行计算」变成会红的判据。

**核心 API**：
```
`heartsLostBetween()` · `sunDelta()` · `progressDisplay()` · `advanceProgress()` · `advanceUnit()`
```

**设计约束**：
组件里只允许出现本文件导出的函数名，别的数字一律不许出现（守卫 G50a..G50d）。零 DOM、零 Vue、零随机、零时间依赖。

**只 import `./balance.js` 与 `./types.js`，不得 import `../content/`** —— `content/index.ts:37` 是 `RAW_UNITS` 的静态 import JSON，拖进来会让 37 条词条进每一个 core 测试。代价是「属于本单元」只能靠 `id.startsWith('u' + unitNumber + '-')` 判。

**已知坑点**：
**🔥 Story 2.5 / Task 5.1：`advanceUnit` 的参数从 `hasNextUnit` 改名为 `shouldAdvanceUnit`。**

签名（两个参数、类型）一个字没动，但**含义变了** —— 原名逐字是「下一个单元录了没有」，而 app 层传进来的是「该推进吗」。判据换成「本单元全部词条已掌握」之后，「有没有下一个单元」只是三个条件之一 ⇒ 继续叫 `hasNextUnit` 就是**名字与含义分家**（R-02：一次判定，一个说法）。

旧的 `hasNextUnit` 判据（「本局打完 ∧ 下一个录了」）有个洞：**一局打完了不代表这个单元学完了**（1.19 起一局只有至多 10 题，单元 1 是 4 局）⇒ 旧判据会在第一局就把孩子推进单元 2，剩下 27 个词永久学不到。这正是 1.19 裁决 5 登记过、恢复条件写死为「Story 2.5 录入单元 2 之前」的那个洞。

**相关决策**：
- [Story 1.5 归档文档](_bmad-output/archive/1-5-回合状态机与题单.md) —— 题单与回合的由来
