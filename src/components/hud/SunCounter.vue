<script setup lang="ts">
/**
 * SunCounter —— HUD 左端的阳光余额（Story 1.13 / AC-C1、AC-D3、AC-D4）。
 *
 * ── 这个组件只做一件事：把 `state.sun` 变成一个孩子一眼能读到的数字 ──────────
 *   可见文本**恒等于** `String(state.sun)`（AC-C1）—— 不是四舍五入、不是带符号、
 *   不是「≥999」。任何格式化都会让「余额」与「下一回合能买什么」对不上，
 *   而这正是 4~8 岁孩子唯一需要从 HUD 读到的信息。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 import `core/balance`**（ESLint `no-restricted-imports`）——
 *   阳光的起始值与每回合增量由 core 给，组件既不自己算也不写死。
 * · **不自己累计已得阳光**（裁决 4：本 story **不引入**累计字段，
 *   「累计所得只增不减」被如实降级为一条负向守卫）。
 * · **不做滚动数字动画** —— 余额每回合都在变，滚动会让 6 岁半的孩子
 *   在两个数之间来回找，反而读不到当前值。
 * · **不加 `--touch-min`**（AC-D5）：HUD 没有可点的东西，最小命中区规则不适用。
 *
 * ── 配色为什么落在暗底上（裁决 8 / AC-D3）─────────────────────────────────
 *   `--color-sun`（亮黄）只许落在**深色底面** —— `tokens.css` 的
 *   `[CR] 2026-10-16` 注释把它收窄成这个适用范围，因为亮黄落在草地绿上只有
 *   **1.79:1**、落在卡面米色上 **1.12:1**。⇒ 本组件自带 `--color-hud-panel` 暗底，
 *   实测阳光黄在其上 **10.43:1**（远高于大字门槛 3:1）。
 */

import { computed } from 'vue'

import { state } from '../../app/store'

/**
 * 余额。**照抄既有范式**（`HandDeck.vue:44-57`）：`computed` 包一层读 `state.value`。
 *
 * ⚠️ 不在模板里写 `String(state.sun)` —— 模板里的 `state` 不是响应式解包的，
 *   写成那样每次重渲染都会重新求值，而 `String()` 每次产出新字符串，
 *   会让文本节点白白重建。`computed` 让它只在 `sun` 真的变了时才重算。
 */
const sun = computed(() => String(state.value.sun))
</script>

<template>
  <div
    class="sun-counter"
    data-testid="sun-counter"
  >
    <!-- 图标是纯 CSS 画的实心圆，不引用资产：HUD 必须在任何资源 404 时依然显示余额。 -->
    <span
      class="sun-counter__icon"
      aria-hidden="true"
    />
    <!-- 可见文本恒等于 String(state.sun) —— 守卫逐字比对。 -->
    <span
      class="sun-counter__value"
      data-testid="sun-value"
    >{{ sun }}</span>
  </div>
</template>

<style scoped>
/*
 * ⚠️ **不钉死高度**（AC-C4 / 1-10:629、1-11:905 的结转项）：
 *   HUD 用 `flex: 0 0 auto` + 内容自然撑开。钉 px 高度 ⇒ 1.16 的关卡条落地时
 *   必然回头重排战场，而重排战场布局意味着 45 格要重新测一遍。
 */
.sun-counter {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 暗底是新 token，推导写在 tokens.css 里 —— 阳光黄在它上面实测 10.43:1。 */
  background-color: var(--color-hud-panel);
  border-radius: 12px;
  padding: 6px 12px;
}

/* 纯 CSS 的太阳：亮黄实心圆 + 一圈略深的边。不用 emoji、不引用资产。 */
.sun-counter__icon {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--color-sun);
}

/*
 * 字号：AC-D4 明写下限是 `--text-body: 16px`（「本项目的下限，不再往下给档」）。
 * 这里取 `--text-prompt: 30px` 那一档 —— 余额是**每回合都在变**的数字，
 * 6 岁半要在 800×1280 的竖屏上一眼读到，压到 16px 那一档就等于要「找」。
 */
.sun-counter__value {
  font-size: var(--text-prompt);
  line-height: 1;
  font-weight: 700;
  /* AC-D3 指定的现成 token。暗底上实测 10.43:1。 */
  color: var(--color-sun);
}
</style>
