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
 *
 * 📎 **Story 1.17：调试面板挂在**本文件**而不是 `views/` 里**（AC-D5、裁决 9）。
 *   ⚠️ AC-D5 那句「挂在 `LevelView.vue` 或 `App.vue` 的 DEV 分支里」与它下一句
 *     「守卫 G113：`src/views/` 下零 `components/debug` 的 import」**自相矛盾** ——
 *     挂进 `LevelView.vue` 就正好违反 G113。按「**面板不是可路由到达的页面**」
 *     这条**语义**裁决：挂 `App.vue`（根组件，非视图），
 *     `src/views/` 因此保持零调试 import，G113 可以逐字守。
 *   ⚠️ 挂在根上还有一个好处：调试开始界面时也看得见面板 ——
 *     「进关后白屏」这类问题恰恰发生在 `enterLevel()` 之前。
 *   ⚠️ **门控是 `isDebugPanelRequested()`，它自己再判一次 `import.meta.env.DEV`**
 *     （守卫 G112）—— 生产构建里整段被静态替换掉并 tree-shake，
 *     生产包**不含**面板的任何代码。
 */
import { isDebugPanelRequested, view } from './app/store'

import DebugPanel from './components/debug/DebugPanel.vue'
import UpdateNotice from './components/hud/UpdateNotice.vue'
import LevelView from './views/LevelView.vue'
import StartView from './views/StartView.vue'
</script>

<template>
  <StartView v-if="view === 'start'" />
  <LevelView v-else />
  <DebugPanel v-if="isDebugPanelRequested()" />
  <!--
    📎 **Story 1.18 / AC-C1、C3：离线准备 / 新版本提示。**

    ⚠️ **挂在根组件上而不是 `LevelView.vue`**，理由与上面那个调试面板同款：
      它是**跨视图的全局状态** —— 首次安装时孩子停在开始页，
      而「正在准备离线，下次启动生效」这条恰恰是最该在开始页就看见的。
    ⚠️ 它**无条件**挂载，是否显示由组件自己的 `v-if` 决定（两种状态之外一律不渲染）。
    ⚠️ **它没有「立即刷新」按钮**（AC-C2）：一旦给了按钮，
      就等于提供了「在孩子正在玩的那一局里强制刷新」的路径。
  -->
  <UpdateNotice />
</template>
