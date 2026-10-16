<script setup lang="ts">
/**
 * HeartRow —— HUD 中端的剩余心数（Story 1.13 / AC-C2、AC-D2、AC-D3）。
 *
 * ── 三个判据，全部来自 `core/hud.ts`，组件一个都不自己算 ───────────────────
 *   1. **渲染哪些位** = `heartSlots(state)`（逐位布尔，**不是**「数出 3 个」）
 *   2. **这一帧哪几位新耗尽** = `lostSlotIndexes(prev, next)`
 *   3. **掉了几颗** = 由 ② 的长度决定，组件不另算
 *
 * ⚠️ **为什么组件里不能出现心数的算术**（守卫 G50b / 变异 M88）：
 *   若组件自己写 `state.value.hearts - lastHearts` 来判断掉了几颗，
 *   那 1.14 的掉心音效就会和画面各算各的，在**一次掉 2 心**时对不上 ——
 *   而那正是游戏最难、孩子最需要反馈的时刻。⇒ 两者共用同一个判据。
 *
 * ── ⚠️ `watch` 的 `flush: 'sync'`（AC-C2，守卫 G53 专测）────────────────────
 *   默认的 `'pre'` 会把**同一个 tick 内的多次同步赋值合并成一次回调**。
 *   ⚠️ **`[CR]` 2026-10-16 更正**：此处原文写「判据会**少报**（1.12 实测：
 *     `expect(n).toBe(2)` 实得 1）。这不是风格问题，是本组件的功能正确性：
 *     一次掉 2 心只动 1 颗」——
 *     **story 自己的 Debug Log #6 已实测推翻这个因果句**：「story 原文那句
 *     『删掉会让一次掉 2 心只动 1 颗』**对 `HeartRow` 不成立**」，
 *     理由是 `lostSlotIndexes` 按**净差**算位，`heartSlots` 返回定长数组逐位比对，
 *     一次掉 2 心本来就该动 2 位。照抄这句注释会让下一个人以为它是在 DOM 上可鉴别的。
 *   ⇒ **保留 `flush: 'sync'` 的真实理由**是 1.14 的掉心音效要**同帧**起播
 *     （音效归 1.14，本 story 不接；此处不写这句是因为它对 1.14 才成立），
 *     加上默认 `'pre'` 会让掉心 class 晚一帧上屏。除此以外它不是功能正确性的必要条件。
 *
 * ── 动画为什么用 `@animationend` 收尾而不是 `setTimeout`（AC-D2）────────────
 *   一次性动画靠事件收 class（照 `RangeOverlay.vue` 的 `.is-refused` 样板）。
 *   `setTimeout` 收尾会让动画时长与 class 存续期**分成两个真相** ——
 *   改了一处忘了另一处，class 就永久留在 DOM 上。
 *
 * ── 「耗尽的心」为什么是**描边**而不是变淡（裁决 8 / AC-D3）────────────────
 *   实测把心红 `opacity` 调到 0.6，合成色 `#963427` 在暗底上只剩 **1.95:1** ——
 *   远低于非文字元素的 3:1 门槛。而「空心 vs 实心」的**形状**本身已能表达状态：
 *   色相不变、对比度不变（3.44:1）、对色觉障碍儿童也友好。
 */

import { computed, ref, watch } from 'vue'

import { heartSlots, lostSlotIndexes, type State } from '../../core'
import { state } from '../../app/store'

/**
 * 逐槽的存活与否。长度恒为 `HEARTS`，顺序左低右高（耗尽在右端）。
 *
 * ⚠️ `HEARTS` 不在组件里 import —— 它在守卫 G33b 的标识符黑名单里，
 *   绕过它的唯一办法是模板里写死 `v-for="i in 3"`，那正是 G33b 要防的形态。
 */
const slots = computed(() => heartSlots(state.value))

/** 本帧正在播「碎裂 + 退回」动画的下标集合（一次性，`animationend` 后移除）。 */
const animating = ref<readonly number[]>([])

/**
 * 掉心判定。
 *
 * ⚠️ **watch 的是 `state` 这个 ref 本身，不是 `() => state.value.hearts`**：
 *   判据 `lostSlotIndexes(prev, next)` 要的是**两个 State**，而按心数 watch 时
 *   回调只拿到两个数字（`now` / `prev`），组件就得自己拼一个
 *   `{ ...state.value, hearts: prev }` —— 那恰好是守卫 G50b 要打的字面形态。
 *   watch ref 本身时 Vue 直接把**上一帧的真实 State** 作为第二参数交给回调，
 *   组件因此完全不需要重建 prev。
 *
 *   代价是每次 dispatch 都会触发一次回调 —— 但 `lostSlotIndexes` 在没掉心时
 *   返回空数组，下面的早退让非掉心的 action **零开销**。
 */
watch(
  state,
  (next: State, prev: State) => {
    // ⚠️ 心数**回升**（`RESTART_LEVEL` / `restart()` 走 `createInitialState` 把心数带回
    //   `HEARTS`）⇒ 之前那批「正在碎」的记录全部作废。不清的话，孩子重开后的第一眼
    //   会是**一排满心在碎**（`is-alive` 与 `is-lost` 同时为真，碎裂动画照播）。
    //   `[CR]` 2026-10-16 修。此前没有任何 UI 能 dispatch `RESTART_LEVEL`（属 1.16），
    //   所以这是**交付即埋**、接线后必然踩到的那种坑。
    if (next.hearts > prev.hearts) {
      animating.value = []
      return
    }
    const lost = lostSlotIndexes(prev, next)
    if (lost.length === 0) return
    // ⚠️ `new Set` 是**纯防御，不是必需**（`[CR]` 2026-10-16 变异验证 N4 实测 0 红）：
    //   上面那条「心数回升清空」到位后，槽位 i 由活变死**只可能发生在心数跨过 i 的那一刻**，
    //   此后心数只会更低 ⇒ 不经 `RESTART_LEVEL` 它永远死一次，而那条路已被清空。
    //   ⇒ 这是**等价变异体**，去掉 `Set` 不会有可观察差异。留着是因为：
    //   若将来那条清空被删掉，这行还能兜住重复入列（`onAnimationEnd` 一次摘两条会掐断第二次碎裂）。
    animating.value = [...new Set([...animating.value, ...lost])]
  },
  // `flush: 'sync'`（AC-C2 / G53）—— 理由见文件头，**不是**「一次掉 2 心只动 1 颗」。
  { flush: 'sync' },
)

/** 动画播完：把这一位从集合里摘掉，让它落回「空心」终态。 */
function onAnimationEnd(index: number): void {
  animating.value = animating.value.filter((i) => i !== index)
}

/**
 * 还剩几颗心 —— 供读屏播报的**唯一**文本（`[CR]` 2026-10-16 新增）。
 *
 * ⚠️ **`SunCounter` / `ProgressBar` 都有可见文本，只有本组件一个字都没有**，
 *   而唯一的形状还被 `aria-hidden="true"` 显式静音 ⇒ 读屏听到的 HUD 是
 *   「阳光 50，**空白**，第 1 单元 3/37」，心数那一段彻底不存在。
 *   规格逐字要求「心与进度是给孩子读的 ⇒ **不能** `aria-hidden`」。
 * ⚠️ **不许在组件里数心** —— 这里数的是 `heartSlots` 的 true 数，即**判据的产物**，
 *   不是从 `state.hearts` 另算一遍（那会撞守卫 G50b 的精神）。
 */
const aliveLabel = computed(() => `还剩 ${slots.value.filter(Boolean).length} 颗心`)
</script>

<template>
  <div
    class="heart-row"
    data-testid="heart-row"
    role="img"
    :aria-label="aliveLabel"
  >
    <!--
      ⚠️ **`v-for` 的源是 `slots` 而不是 `n in HEARTS` / `n in 3`**。
        `[CR]` 2026-10-16 更正：此处原文接着写「走 `heartSlots` 则『掉了一颗』时
        **DOM 少一位**，判据立刻有鉴别力」——**与渲染结果矛盾**：
        `heartSlots` 返回**定长**数组，耗尽的心是 `false` 而非被移除，
        元素数量恒为 `HEARTS` ⇒ 掉没掉心，两侧 DOM 一律同构。
        ⇒ **M87 的真实鉴别力只来自 `is-spent` class**，不来自元素数量。
          照「DOM 少一位」去写断言会得到一条永远失败的断言。
    -->
    <span
      v-for="(alive, index) in slots"
      :key="index"
      class="heart-row__heart"
      :class="{
        // ⚠️ **正在碎的那一位仍算实心**（`[CR]` 2026-10-16 修）：
        //   心从 3 掉到 2 时 `slots` 在同一次渲染里已是 `[true,true,false]`，
        //   若照旧给第 3 位立刻上 `is-spent`（`background-color: transparent`），
        //   `heart-break` 就从**空心红圈**起播 —— 孩子看不到「心碎了」，只看到红圈在抖。
        //   碎完 `animationend` 摘掉 `is-lost`，才落回空心终态。两拍都看得见。
        'is-alive': alive || animating.includes(index),
        'is-spent': !alive && !animating.includes(index),
        'is-lost': animating.includes(index),
      }"
      :data-slot="index"
    >
      <span
        class="heart-row__shape"
        aria-hidden="true"
        @animationend="onAnimationEnd(index)"
      />
    </span>
  </div>
</template>

<style scoped>
/* ⚠️ 不钉死高度（AC-C4）：内容自然撑开，与 SunCounter / ProgressBar 同高由父级对齐。 */
.heart-row {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 暗底是新 token。裁决 8 实测：心红在它上面 3.44:1。 */
  background-color: var(--color-hud-panel);
  border-radius: 12px;
  padding: 6px 12px;
}

.heart-row__heart {
  display: block;
  line-height: 0;
}

/*
 * 心的形状：纯 CSS，不引用资产。
 * ⚠️ `background-color` 与 `box-shadow` 的 inset 描边**由同一个 token 驱动** ——
 *   实心与空心之间只差 `background-color: transparent`，色相与对比度完全不变。
 */
.heart-row__shape {
  display: block;
  width: 20px;
  height: 18px;
  border-radius: 10px 10px 2px 2px;
  /* 空心的默认态（既没活也没刚掉）：只留描边。 */
  background-color: transparent;
  box-shadow: inset 0 0 0 3px var(--color-heart);
}

.heart-row__heart.is-alive .heart-row__shape {
  background-color: var(--color-heart);
  /* 实心时描边与填充同色 ⇒ 视觉上就是一颗实心红心。 */
  box-shadow: inset 0 0 0 3px var(--color-heart);
}

/*
 * 掉心动画：一次性的「碎裂 + 退回」（AC-D2：状态 → class → CSS 过渡）。
 *
 * ⚠️ **时长用 `--dur-slow`（400ms）而不是 `--dur-feedback`（100ms）**，
 *   理由写在这里（AC-D1 要求「要么复用现成档位、要么写出为什么是这个值」）：
 *   `--dur-feedback` 的注释明写它「**只许用于反馈类动画**」，指的是
 *   「按下即回弹」这种瞬时反馈；而「碎裂 + 退回」是一条**有叙事的两拍动画** ——
 *   孩子要看得见「心碎了」，还要看得见「它回到空心的位置」。
 *   100ms 内播完这两拍等于只播了第一拍（实测 1.12：反馈 32ms 可见，
 *   但那是**渲染**延迟，不是感知延迟 —— AC-G2 禁止拿它当感知结论）。
 *   `--dur-slow` 是既有档位，无需新造 token。
 */
.heart-row__heart.is-lost .heart-row__shape {
  animation: heart-break var(--dur-slow) ease-out;
}

@keyframes heart-break {
  0% {
    transform: scale(1);
  }
  35% {
    /*
     * 碎：缩小并侧偏，像被弹了一下。
     * ⚠️ **`[CR]` 2026-10-16 —— 此处原先有 `opacity: 0.6`，已删。**
     *   那个值把 3px inset 描边合成成 `#963427`，实测 **1.95:1** ——
     *   正是 `tokens.css` 与本文件头逐字写「远在红线以下」的同一个色。
     *   裁决 8 早就定了「耗尽的心**不另造 token、不用 opacity**，用**描边**」，
     *   而这里在**动画中间态**上又用回了 opacity ⇒ 判据只校验了终态（3.44:1），
     *   没校验中间态。`scale + rotate` 已经足够表达「碎」，不需要靠淡出。
     */
    transform: scale(0.55) rotate(-12deg);
  }
  100% {
    /* 退回：恢复原位，落回空心终态 */
    transform: scale(1) rotate(0deg);
  }
}
</style>
