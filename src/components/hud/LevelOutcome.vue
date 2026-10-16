<script setup lang="ts">
/**
 * LevelOutcome —— 终态浮层（Story 1.16 / AC-D1、AC-E1、AC-E2）。
 *
 * ── 它是什么 ──────────────────────────────────────────────────────────────
 * 一张盖在战场之上的浮层，**只在 `level-complete` / `level-failed` 下存在**。
 * 两种终态共用这一个组件（裁决 5）—— 它们要的东西同构：一句给孩子的话、
 * 一个按钮、一个说明为什么这么少的信息。
 *
 * ── 零美术资产（裁决 5 / AC-D1）──────────────────────────────────────────
 * 纯 CSS + 一个已有的 emoji。⚠️ **不许**引入星星 / 分数 / 图鉴 / 连对 streak ——
 *   GDD Out-of-Scope 第 1 条逐字禁「元进度系统」，守卫 **G91** 逐条扫源码。
 *
 * ── 只读 `state.value.phase.kind`，别的什么都不读（AC-D1）──────────────────
 *   它**不**知道还剩几颗心、第几回合、本局答对几题 ——
 *   ① 那些是战场事实，架构硬约束 2 明令组件只读不算；
 *   ② 答对几题 / 正确率是分数的换皮，AC-E1 末条逐字禁止。
 *   ⇒ 守卫 **G90** 把「只读 `phase.kind`」钉成一条白名单。
 *
 * ⚠️ **⚠️ 这里的 `turn` / `masteredEntryIds` 一次都不许出现**：
 *   「本局打了几题」听起来像无害的鼓励，但它是分数的一种改写（AC-E1 逐字），
 *   而一旦显示它，孩子就会开始追它 —— 那是这个年龄段不该被引导的注意力方向。
 *   FR56 要的是「读到哪了」（**跨单元**的进度），那在 `<ProgressBar />` 上，
 *   浮层里显示的是「这个单元读完了」这一**事实**，不是数字。
 *
 * ── 为什么按钮调 store 门面而不是直接 dispatch（AC-D1 / AC-D3）────────────
 * 与 1.12 的三个建造门面同款纪律：组件不 import `core/actions`、
 * 不直接改 `state` / `view`。守卫 **G93** 钉住 `RESTART_LEVEL` 的唯一调用点。
 */

import { computed } from 'vue'

import { restartLevel, backToStart, state } from '../../app/store'

/**
 * 当前相位种类 —— **组件读 `state` 的唯一一处**（AC-D1）。
 *
 * ⚠️ **为什么单独提出来而不是在两个 computed 里各读一次**：
 *   「同一个字段读两遍」看起来无害，但它让守卫 G90 的白名单必须写成
 *   「去重后的集合」⇒ 那条判据就永远测不出「多读了**另一个**字段」以外的东西。
 *   把读取收敛到一处，白名单就能保持逐字严格（多读一次都红）。
 */
const phaseKind = computed(() => state.value.phase.kind)

/** 当前是不是终态 —— 组件存在的**唯一**前提。 */
const terminal = computed(() => phaseKind.value === 'level-complete' || phaseKind.value === 'level-failed')

/** 这一次是赢了还是输了。只有终态下有值。 */
const won = computed(() => phaseKind.value === 'level-complete')
</script>

<template>
  <!--
    ⚠️ **根节点只有一个 `v-if`**（AC-D1）：非终态时这里渲染的是**一个注释节点**，
    不是空 div、不是透明遮罩 —— 空壳会让「战场是否还可见」的断言失去参照，
    而 G31 那类「子元素恰好 45 个」的判据会多出一个数。
  -->
  <div
    v-if="terminal"
    class="level-outcome"
    :class="won ? 'level-outcome--won' : 'level-outcome--lost'"
    data-testid="level-outcome"
  >
    <p
      class="level-outcome__emoji"
      aria-hidden="true"
    >
      {{ won ? '🌟' : '🌱' }}
    </p>
    <h2 class="level-outcome__title">
      {{ won ? '读完啦！' : '再试一次吧' }}
    </h2>
    <p class="level-outcome__hint">
      <!--
        🔥 **AC-E2：进度必须仍然可见**（FR56 逐字「进度可见 —— 孩子随时能看到
        自己读到哪了」）。⚠️ 别把这一句当「元进度」删掉 —— 那条禁令针对的是
        星星 / 分数 / streak，**不包括**「读到哪了」。
        ⚠️ 文案里**不出现任何数字**（AC-E1 末条），所以写的是事实而不是计数。
      -->
      {{ won ? '这个单元的全部单词都读过了。' : '答错的单词，下次再见到就认识啦。' }}
    </p>
    <button
      type="button"
      class="level-outcome__button"
      @click="won ? backToStart() : restartLevel()"
    >
      {{ won ? '回开始' : '再来一次' }}
    </button>
  </div>
</template>

<style scoped>
/*
 * 🔥 **浮层是叠在战场之上的一层，不是把战场推开的一层**（AC-D2）。
 *
 * ⚠️ **绝对不许给本浮层写死 px 高度去「压住」战场** ——
 *   `LevelView.vue` 的样式注释逐字写着「1.13 与 1.16 落地时必然回头重排战场，
 *   而重排战场布局意味着 45 格重新测一遍」（1.10 那个「横向撑破到 1351px」的坑
 *   就是这么来的）。
 *   ⇒ 这里只用 `position: absolute` + `inset: 0`，尺寸由浮层自己撑。
 *
 * ⚠️ **战场在终态下仍然渲染**（AC-D2 逐字）：孩子通关时应当看得见自己守住的那片地，
 *   浮层是盖在它上面的一层半透明面板，不是把它换成另一张全屏图。
 */
.level-outcome {
  position: absolute;
  inset: 0;
  z-index: 20;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-panel-pad);

  /* 半透明白板：底下的战场仍隐约可见（AC-D2）。 */
  background-color: rgba(255, 255, 255, 0.94);
  border-radius: 16px;
  padding: var(--space-panel-pad);

  /* 触控目标不得小于 `--touch-min`（与 1.12 的建塔格子同一口径）。 */
  text-align: center;
  color: #212121;
}

/*
 * 输赢两态的区分**只靠边框色与 emoji**。
 *
 * ⚠️ **不靠颜色单独承载信息** —— 红绿色觉障碍的孩子看不出差别。
 *   两态的**文案**本来就完全不同（「读完啦」/「再试一次吧」），
 *   颜色只是第二重提示。
 */
.level-outcome--won {
  border: 4px solid var(--color-sun, #ffd54f);
}

.level-outcome--lost {
  border: 4px solid var(--color-overlay-range, rgba(255, 255, 255, 0.3));
}

/*
 * ⚠️ **零新美术资产**（裁决 5）：emoji 是文本，不引入任何图片文件。
 *   尺寸用 `em` 而不是 px，跟随下面的文字一起缩放。
 */
.level-outcome__emoji {
  margin: 0;
  font-size: 4em;
  line-height: 1;
}

.level-outcome__title {
  margin: 0;
  font-size: var(--text-prompt, 1.6rem);
  color: #212121;
}

.level-outcome__hint {
  margin: 0;
  font-size: var(--text-body, 1rem);
  color: #424242;
  /* 4–8 岁孩子的阅读行宽：长句在窄屏上折行时不要拉成一整条。 */
  max-width: 24em;
}

.level-outcome__button {
  /* ⚠️ **不写死宽高**：高度给 `min-height`（触控目标下限），宽度由文字撑。 */
  min-height: var(--touch-min, 48px);
  padding: 0 calc(var(--space-panel-pad) * 1.5);
  border: none;
  border-radius: 999px;
  background-color: #4caf50;
  color: #ffffff;
  font-size: var(--text-body, 1rem);
  cursor: pointer;
}
</style>
