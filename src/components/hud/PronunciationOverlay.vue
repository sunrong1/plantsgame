<script setup lang="ts">
/**
 * PronunciationOverlay —— 朗读状态的可视反馈（Story 1.18 / AC-D1）。
 *
 * ── 它解决什么 ─────────────────────────────────────────────────────────────
 * 孩子点了卡面，**声音要过几百毫秒才出来**（设备 TTS 还要先选音色）。
 * 没有这个反馈，那段空白在 4–8 岁的感知里就是「我按了，没反应」——
 * 于是孩子会连点，连点又会打断上一段（AC-3 的重入），越急越听不到。
 * ⇒ 反馈要在**按下后立刻**出现，等价于「我按了，它听到了」。
 *
 * ── 🔥 AC-D1：「不遮挡 `.battle-grid` 的任何一格」是怎么兑现的 ────────────
 *   靠**正常流 + 排在战场之前**，而不是靠「我认为它在下面」。
 *   · 本组件在 `LevelView.vue` 的模板里排在 `<BattleField />` **之前**，
 *     是 `.level-view`（`flex-direction: column`）的一个普通子项；
 *   · 样式里**零** `position: absolute|fixed|sticky`、零负 margin
 *     —— 脱离正常流的东西在某个机型上一定会跑到战场身上，
 *     而「某台平板上盖住了僵尸行走那一行」没人能在代码评审里看出来。
 *   守卫 **G135** 把这两条钉死。
 *
 * ── 为什么外层常驻、内层才切换 ────────────────────────────────────────────
 *   若整条用 `v-if`，每次朗读都会在战场上方**撑出/收掉**一行 ——
 *   战场整体下移再弹回，孩子点卡面时脚下的地面在动。
 *   ⇒ 外层是**恒定高度**的一条细带（跟随 `--text-body`），
 *     只有里面的文字在进出。
 *   代价是闲时多占约一行高度（实测 24px），换来的是零位移。
 *
 * ── 不抢焦点、不拦点击（AC-C3）───────────────────────────────────────────
 *   · 不设 `tabindex` ⇒ Tab 序列里没有它；
 *   · 文案是**状态**（「正在读…」）而不是提示语，不承载任何需要确认的动作；
 *   · 零过渡动画 —— 它每几百毫秒进出一次，任何淡入淡出都会变成闪烁。
 *     架构硬约束 5 是「时长写在 CSS」，而这里**没有时长可写**：零动画零时长。
 */

import { onBeforeUnmount, ref } from 'vue'

import { subscribePronunciationStatus } from '../../services/pronunciation-status'
import type { PronunciationStatus } from '../../services/pronunciation-status'

/**
 * 朗读状态的**组件本地副本**。
 *
 * ⚠️ 为什么不是直接用 `pronunciationStatusRef()`：那个引用是服务层的只读 ref，
 *   直接挂进模板会把「服务层的状态」与「这个组件的渲染」绑在一起 ——
 *   而本组件要做的恰恰是**只订阅自己关心的那一段**（`playing` 布尔），
 *   并且在卸载时干净地退订。用本地 ref + 订阅回调，
 *   退订就等于「不再往这个 ref 里写」，不需要额外的心智负担。
 */
const playing = ref(false)

/**
 * 订阅状态 —— **模块级 Set，必须退订**。
 *
 * ⚠️ `subscribePronunciationStatus` 在订阅瞬间会立刻回放当前值，
 *   所以这里不需要额外初始化 `playing`。
 */
const unsubscribe = subscribePronunciationStatus((next: PronunciationStatus) => {
  playing.value = next === 'playing'
})

// ⚠️ 卸载时退订：模块级的 `Set` 会一直持有这个闭包，
//   不退订就是每次挂载多留一份（Story 1.13 起的内存泄漏防线）。
onBeforeUnmount(unsubscribe)
</script>

<template>
  <!--
    ⚠️ **根节点没有 `v-if`**（见上面「为什么外层常驻」）：
      恒定高度的细带 + 内部文字进出，战场在朗读过程中**一个像素都不动**。
    ⚠️ `role="status"` + `aria-live="polite"`（AC-C3 的非阻塞在无障碍侧的对应物）：
      朗读开始/结束会被读屏播报，而它本身**不抢焦点**、不拦任何点击。
  -->
  <p
    class="pronunciation-overlay"
    role="status"
    aria-live="polite"
    data-testid="pronunciation-overlay"
  >
    <span
      v-if="playing"
      class="pronunciation-overlay__text"
    >正在读…</span>
  </p>
</template>

<style scoped>
/*
 * 一条恒定高度的细带 —— 位置在战场**上方**、HUD 之下。
 *
 * ⚠️ **零绝对/固定定位、零负外边距**（AC-D1）：见文件头。
 * ⚠️ 零过渡：每几百毫秒进出一次的淡入淡出就是闪烁（架构硬约束 5 的边界情形 ——
 *   「时长写 CSS」管的是「有动画时时长不许写 TS」，不是「必须有动画」）。
 */
.pronunciation-overlay {
  /*
   * 高度跟随 `--text-body` 而不是写死像素：
   * tokens.css 的字号阶梯是 Story 1.11 定稿的（R-12），这里跟着它走，
   * 有人调档时这块细带自动跟着长高，不会在某档字号下被挤成一条看不见的缝。
   */
  display: flex;
  align-items: center;
  justify-content: center;

  margin: 0;
  /* 闲时也不许塌成 0 —— 塌了就等于每次朗读都让战场位移，等于没有「恒定高度」。 */
  min-height: calc(var(--text-body) * 1.5);
  padding: 0 var(--space-panel-pad);

  font-size: var(--text-body);
  line-height: 1.5;
  text-align: center;

  /*
   * 底色用 HUD 面板色：它与 UpdateNotice 同一块底，
   * 于是两个「系统级提示」在视觉上属于同一族 —— 而战场那侧仍然是草地绿。
   * 对比度已在 tokens.css 的 HUD 面板段实算过（白字 14.56:1）。
   */
  background-color: var(--color-hud-panel);
  color: var(--color-on-tower);
}

.pronunciation-overlay__text {
  /* 不许断行：这是一句极短的提示，折行会让它看起来像两句话。 */
  white-space: nowrap;
}
</style>
