<script setup lang="ts">
/**
 * ProgressBar —— HUD 末端的单元进度（Story 1.13 / AC-C3、AC-D3、AC-D5）。
 *
 * ── 它显示什么 ────────────────────────────────────────────────────────────
 *   文本「第 N 单元 · x/y」+ 一条**单向**填充条。
 *   `N` = `state.unitNumber`；`x` 与 `y` 全部来自 `progressDisplay(progress, …)`。
 *
 * ── ⚠️ 分母 `y` **由父级传入**（`unitTotal` prop），组件不写死 37 / 60 ──────
 *   `core/` 不得 import `content/`（`src/content/index.ts:37` 是静态 import JSON），
 *   所以 core 的判据只能把分母当**参数**收下。组件若在这里写死
 *   「本单元有 37 个词」，那第二单元起就全是错的 —— 而错的方式是
 *   **进度条永远填不满**，看上去像「还没学完」，不像 bug。
 *
 * ── ⚠️ 为什么它**不可点**（AC-C3、FR58/FR59）─────────────────────────────
 *   `epics.md` 的口径是「跨单元线性推进、**无选关自由**」。⇒ 不加 `role="button"`、
 *   不加 `@click`、不加 `tabindex`、不加 `cursor: pointer`、不加任何伪元素按钮感。
 *   ⚠️ 这不是洁癖：AC-D5 点名「进度条**看起来**最像可点而它不可点」——
 *   一个长得像按钮、点了没反应的东西，对 4~8 岁的孩子就是**反复的失败信号**。
 *   守卫会查这三样都不许出现。
 *
 * ── 为什么**单向**、不做回退动画（FR58）────────────────────────────────────
 *   `progress` 只增不减（`advanceProgress` 的三条性质），所以进度条永远向前；
 *   若出现回退，那不是动画该掩盖的事，是判据出了问题。
 */

import { computed } from 'vue'

import { progressDisplay } from '../../core'
import { progress, state } from '../../app/store'

const props = defineProps<{
  /** 本单元的词条总数。**调用方从 `entriesOf(state.unitNumber).length` 传入。** */
  readonly unitTotal: number
}>()

/**
 * 展示口径。四项全部由 core 的判据给出，组件**一个数字都不自己算**。
 *
 * ⚠️ `progressDisplay` 返回的是 `ratio ∈ [0,1]` 的**数**；
 *   模板里要的是百分比字符串，故这里乘 100 并 `Math.round` ——
 *   （曾在此写 `toFixed(0)`，与代码不符；`[CR]` 2026-10-16 已更正为实际的 `Math.round`。）
 *   这是**单位换算**，不是判据（判据是 `ratio` 本身）。
 *   ⚠️ `total === 0` 时 `ratio` 是 0 而不是 `NaN`（AC-B4）：
 *   `NaN%` 会被 CSS **整条丢弃**，进度条退化成浏览器默认宽度 —— 不报错、不留痕。
 */
const shown = computed(() =>
  progressDisplay(progress.value, state.value.unitNumber, props.unitTotal),
)

const label = computed(() => `第 ${shown.value.unitNumber} 单元 · ${shown.value.mastered}/${shown.value.total}`)

const percent = computed(() => `${Math.round(shown.value.ratio * 100)}%`)
</script>

<template>
  <div
    class="progress-bar"
    data-testid="progress-bar"
  >
    <span
      class="progress-bar__label"
      data-testid="progress-label"
    >{{ label }}</span>
    <!--
      ⚠️ 这是**纯展示**的 `<div>`，不是 `<progress>` 更不是 `<button>`：
        给它 `role="progressbar"` 会让辅助技术播报一个孩子看不见的数字，
        给它 `role="button"` 会宣称它可点（AC-C3）。语义就留在上面的文本里。
    -->
    <div
      class="progress-bar__track"
      aria-hidden="true"
    >
      <div
        class="progress-bar__fill"
        :style="{ width: percent }"
        data-testid="progress-fill"
      />
    </div>
  </div>
</template>

<style scoped>
/* ⚠️ 不钉死高度（AC-C4），与另两块由父级对齐。 */
.progress-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 暗底是新 token（裁决 8）。进度条自身**不可点** ⇒ 无 cursor / 无 hover（AC-D5）。 */
  background-color: var(--color-hud-panel);
  border-radius: 12px;
  padding: 6px 12px;
}

/* 标签字号取 `--text-body`（16px，阶梯下限）。它不是每帧都变的大数字，
   AC-D4 的「一眼读到」只针对阳光余额。 */
.progress-bar__label {
  font-size: var(--text-body);
  line-height: 1.2;
  /* 白字在暗底上实测 14.56:1。 */
  color: var(--color-on-tower);
}

/*
 * 轨道与填充：**填充用 `--color-sun`，轨道用 `--color-neutral-dark`**。
 *
 * ⚠️ `[CR]` 2026-10-16 —— 轨道**原来写的是 `--color-path`（米色 `#d7ccc8`）**，
 *   与相邻的 `--color-sun` 填充实测只有 **1.13:1**，直接违反 `tokens.css` 里
 *   「`--color-sun` 的适用面被 [CR] 2026-10-16 收窄：它只许落在**深色底面**」
 *   的约束，也违反 WCAG 1.4.11 非文本图形 3:1。根因是裁决 8 的连带裁决
 *   亲手规定了「填充用 `--color-sun`」，而它默认了轨道也是暗底 —— 轨道不是。
 *   药方取自 `tokens.css` 收窄注释自己开的方：「浅底面上的对应需求改用深中性
 *   `#424242`」。⇒ 改轨道，**不动填充**（填充在暗轨上实测 **7.20:1** —— `[CR]` 真浏览器实算）。
 *   守卫见 `tests/content/palette.test.ts` 的「填充 vs 轨道」组。
 *
 * ⚠️ 仍**不用** `--color-correct` / `--color-wrong` 当填充色：
 *   那两个连在暗底上都不到 3:1（裁决 8 的实测表）。
 */
.progress-bar__track {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background-color: var(--color-neutral-dark);
}

.progress-bar__fill {
  height: 100%;
  border-radius: 4px;
  background-color: var(--color-sun);
  /* 单向推进：不做回退动画、不做抖动（FR58）。 */
  transition: width var(--dur-med) ease-out;
}
</style>
