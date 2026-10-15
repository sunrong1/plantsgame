<script setup lang="ts">
/**
 * LevelView —— 战场视图（Story 1.10 / AC-11）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只承载 `<BattleField />` 并负责**战场区域的布局**。它不含任何战斗逻辑，
 * 也不持有任何战场状态。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不做 HUD**（阳光 / 心 / 进度）—— 属 Story 1.13。
 *   ⚠️ 本文件因此**刻意不写死战场区的高度**：布局是「flex 列 + 战场区 flex: 1」，
 *     1.13 的 HUD 落地时直接在这个 flex 列里加一块即可，不必回头重排战场
 *     （Dev Notes §10 对 1.13 的预留）。
 * · **不做关卡流程**（开局 / 通关 / 失败 / 推进）—— 属 1.16。
 *   本视图**无条件**渲染战场：1.10 的题单交互尚未落地，`state.phase` 的六种
 *   变体里只有开局那一种有画面。若这里按 phase 分支，就会渲染出一片空白，
 *   而 AC-16 要求「战场在浏览器里肉眼可见」。
 * · **不做词图加载** —— 属 1.11 / 1.18。
 * · **不建选关入口**（`UnitSelectView`）—— GDD 无选关自由，1.15 也不得建
 *   （`[GA]:770-782` 专门有纠错说明）。
 *
 * ── 关于「战场状态不得寄存在组件本地」（1.16 的前置要求）─────────────────
 *   本视图与 `BattleField` **都不持有战场状态** —— 一切都从 `app/store` 的
 *   `state` 读。所以 1.16 做整场重置时只需要换掉 `state` 本身，
 *   不存在「清不掉的组件本地副本」（FR51：战场每局清空，进度只增不减）。
 *   唯一活在组件本地的是 `Tower` / `Zombie` 里那个「这张图加载失败了」的 ref，
 *   它随实体一起被 `reduce` 移除而销毁，不构成跨局残留。
 */

// ⚠️ **必须显式 import**（Debug Log #4）：`script setup` 不做全局组件解析，
//   漏掉这行会渲染成一个没有内容的 `<battlefield>` 自定义元素 ——
//   而且 vue-tsc / build / test / lint **全绿**，页面只是白着。
//   `eslint.config.js` 的 `vue/no-undef-components: 'error'` 为此设了守卫。
import BattleField from '../components/battle/BattleField.vue'
</script>

<template>
  <main class="level-view">
    <!--
      📎 **给 Story 1.13 的 HUD 预留的位置**：这个 flex 列的第一个子元素之后
         直接放 HUD 即可，战场区是 `flex: 1` 会自动让出高度。
         现在刻意不放占位元素 —— 放一个空的灰色块会在 1.13 落地时变成要删的死代码，
         而它在 1.10 的浏览器核对里也只会让人以为「这里本来该有东西」。
    -->
    <BattleField />
  </main>
</template>

<style scoped>
/*
 * 竖屏平板是目标形态（架构决策 10）：战场横向铺满，腾出的高度留给 1.13 的 HUD。
 *
 * ⚠️ **不写死高度**：HUD（1.13）与关卡条（1.16）都还没落地，
 *   若这里给战场一个固定 px 高度，1.13 落地时必然要回头重排，
 *   而重排战场布局意味着 45 格重新测一遍 —— 那正是「不要在下游 story 里返工上游布局」
 *   要避免的事（Dev Notes §10）。
 *
 * 四边留安全区，避开刘海与系统手势条（真机数值校准属 Story 1.18）。
 * 底部那条由 `.battle-grid` 自己再加一次 `env(safe-area-inset-bottom)` ——
 * **不是重复**：这里留的是整页的边距，那里留的是触控目标与手势条之间的余量
 * （`--touch-min`，1.12 的建塔格子要够 48px）。
 */
.level-view {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: calc(var(--space-panel-pad) + env(safe-area-inset-top))
    calc(var(--space-panel-pad) + env(safe-area-inset-right))
    0
    calc(var(--space-panel-pad) + env(safe-area-inset-left));
}

/*
 * 战场区的尺寸由**宽度**决定，不由高度决定。
 *
 * ⚠️ **`flex` 必须是 `0 0 auto`，不能是 `1 1 auto`（实测踩过）**：
 *   父级是 `flex-direction: column`，`flex-grow: 1` 会把战场区的**高度**拉伸到
 *   整屏（900px 里扣掉安全区仍余 ~800px）。而每个 `.battle-cell` 带
 *   `aspect-ratio: 1 / 1`，grid item 的 `min-width: auto`（自动最小尺寸）会把
 *   **块尺寸换算成行内尺寸**当最小宽度 ⇒ 每条列轨的最小宽度 = 行高 ≈ 147px，
 *   9 条轨合计 1319px，**横向撑破容器**（实测：容器 453px，轨道合计 1351px）。
 *   症状是「战场右边滚出屏幕、格子巨大」，而 `repeat(9, 1fr)` 与
 *   `aspect-ratio: 9/5` 两句都还在 —— 任何只看声明的守卫都抓不到它。
 *
 *   腾出来的高度不是浪费：那是 Story 1.13 的 HUD 与手牌区的位置（见上方注释）。
 */
.level-view > :deep(.battle-grid) {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
}
</style>
