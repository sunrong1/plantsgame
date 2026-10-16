<script setup lang="ts">
/**
 * 应用根组件 —— 按 `view` 条件渲染，**不引路由**。
 *
 * ⚠️ **视图切换走 `app/store` 的最小 `view` 态**（Story 1.10 / 裁决 1），
 *   **不提前建 `src/app/router.ts`**。
 *   1.10 必须让战场真的出现在屏幕上（`StartView.vue` 的注释逐字写着：
 *   「孩子点了按钮游戏却一动不动，看起来像坏了」），所以这里做最小桥接。
 * ⚠️📎 **原注「那是 Story 1.15 的活」已作废**（R-32 的编号残留更正，2026-10-17）：
 *   `1.15 [CS]` 裁决 5 与 `epics.md` 的 AC 正文里 1.15 **没有 router** ——
 *   1.15 的 AC 正文只有存档与断点续学。同理，原注「1.15 建 router 时由它接管
 *   store 的 `view`」也不成立：`view` 至今仍是本文件唯一的切换依据，
 *   存档恢复（`enterLevel`）走的是 store 内部，不经过 router。
 *
 * ⚠️ 两个子组件都**必须显式 import**（Debug Log #4）：`script setup` 不做全局
 *   组件解析，漏掉会渲染成没有内容的自定义元素，而 vue-tsc / build / test / lint
 *   **全绿**，页面只是白着。`eslint.config.js` 的 `vue/no-undef-components` 守着它。
 */
import { view } from './app/store'

import LevelView from './views/LevelView.vue'
import StartView from './views/StartView.vue'
</script>

<template>
  <StartView v-if="view === 'start'" />
  <LevelView v-else />
</template>
