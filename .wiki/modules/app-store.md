---
module: app-store
path: src/app/store.ts
deps:
  - "[[core-reducer]]"
  - "[[core-types]]"
  - "[[core-hud]]"
  - "[[core-actions]]"
  - "[[app-effects-runner]]"
  - "[[content-index]]"
  - "[[services-pronunciation]]"
  - "[[services-save]]"
  - "[[services-asset-prefetch]]"
  - "[[services-asset-degradations]]"
status: draft
last_sync: "2026-10-24T08:30:00+08:00"
hash: "bff3c184"
source: header-comment
---

# 应用状态门面

**职责**：对外暴露状态与动作的门面，跨局进度的唯一变更点。

**核心 API**：
```
`state` · `progress` · `applyAction()` · `speakQuestion()` · `unitFullyLearned()` · `levelOutcomeKind()` · `goToNextUnit()`
```

**设计约束**：
组件通过 store 门面访问 core，不直接 import core 的实现文件。

**跨局进度读 `mergedProgress`（合并后），不读 `progress.value`** —— dev 补偿手柄会把还没结算的词算成已掌握，读错会让 25 个词在界面上显示成「已掌握」而没有任何东西指向原因（R-06：静默错到下一个生命周期）。

**写盘拿 `next`，跨局进度拿 `reduced`** —— 写盘要一致，跨局进度不能被 dev 手柄污染。

**已知坑点**：
**🔥 Story 2.5 / Task 5.1：单元推进判据换成了「本单元全部词条已掌握」。**

推进判据现在三条：「本单元全部词条已掌握」+「本局结束」+「下一个单元录了没有」。旧判据只有后两条 ⇒ 打完单元 1 第一局就被推进，剩下 27 个词永久学不到（1.19 裁决 5 登记的洞，Story 2.5 按恢复条件修掉）。

**🔥 `levelOutcomeKind()` 的四值**：`next-unit`（学完且有下一单元）/ `continue`（学完但没学够，留在本单元）/ `finished`（全书读完）/ `retry`（失败）。

**⚠️ `[CR]` 2026-10-23 补的相位守卫**：「非终态 ⇒ `continue`」这句话原先**只在注释里** —— 实现是「失败 → retry；否则查学完没有；查完了再看下一个录了没有」⇒ 一个非终态相位只要恰好「本单元已学完 ∧ 下一个已录」就会算出 `next-unit`，**与自己的文档相反**。今天够不着（浮层只在终态渲染），但 `goToNextUnit()` 的相位守卫正要拿这个函数的结论 ⇒ 分家就会直接放行误调用。现在显式判：非终态一律 `continue`。

**相关决策**：
- [Story 1.10 归档文档](_bmad-output/archive/1-10-战场渲染与网格.md) —— 视图切换裁决
