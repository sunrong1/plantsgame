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

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

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

/*
 * ── 📎 Story 1.18 / AC-D5：焦点管理 ────────────────────────────────────────
 *
 * ⚠️ **模态浮层不接管焦点会怎样**：Tab 会跑到浮层**背后**的战场格子与手牌卡上，
 *   而那些东西孩子看不见自己「按」到了哪里 —— 焦点框落在看不见的地方。
 *   读屏则继续读浮层背后的战场与手牌，等于模态性根本不存在。
 *
 * ⚠️ **为什么 `nextTick` 不可省**：模板里的按钮由 `v-if` 渲染。
 *   `terminal` 由 `false` 变 `true` 的那一刻，watcher 跑在**DOM 更新之前**
 *   （默认 flush 是 `'pre'`）⇒ 此时 `buttonEl.value === null`，
 *   `focus()` 在 `null` 上调用是**静默失败**（不抛、也不聚焦）。
 *   症状极其有欺骗性：代码里 `focus()` 明明写了，读起来也对，
 *   而焦点一动不动 —— 与「忘了写 focus」的观感一模一样。
 */
const buttonEl = ref<HTMLButtonElement | null>(null)
/** 打开浮层前的焦点 —— 关闭后还回去，否则键盘用户要从页面开头重新 Tab。 */
let previousFocus: HTMLElement | null = null

watch(
  terminal,
  (isTerminal) => {
    if (isTerminal) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void nextTick(() => {
        buttonEl.value?.focus()
      })
      return
    }
    previousFocus?.focus()
    previousFocus = null
  },
  // ⚠️ **`flush: 'post'`**：见上面 `nextTick` 那段 —— 我们要的就是「DOM 已更新」那一刻。
  //   同 tick 内多次相位变化会被合并，这正是我们要的（终态只进一次、只出一次）。
  { flush: 'post' },
)

onBeforeUnmount(() => {
  // 组件被整体卸载时（`view` 切回开始页）把引用还回去，
  // 否则 `activeElement` 指向一个已被移除的节点，`.focus()` 静默无效。
  previousFocus?.focus()
  previousFocus = null
})
</script>

<template>
  <!--
    ⚠️ **根节点只有一个 `v-if`**（AC-D1）：非终态时这里渲染的是**一个注释节点**，
    不是空 div、不是透明遮罩 —— 空壳会让「战场是否还可见」的断言失去参照，
    而 G31 那类「子元素恰好 45 个」的判据会多出一个数。
  -->
  <!--
    📎 **Story 1.18 / AC-D5 补齐的模态语义。**

    ⚠️ **为什么 1.16 只补了文案没补这三样**：浮层是 `position: absolute`
      叠在战场上，而无障碍树里**通用 div 没有模态语义** ——
      读屏不会把它当对话，也不会挡住背后的战场与手牌。
    ⚠️ `aria-modal="true"` 依赖 **`aria-labelledby` 给出可访问名**：
      没有名字的 dialog 读屏只会念出一串无名容器，比没有 dialog 更让人迷路。
    ⚠️ **`aria-labelledby` 指向的 id 必须真实存在**（守卫 G136 会核对），
      指向一个空 id 等于没给名字 —— 这是「看起来做了无障碍」的最常见形态。
  -->
  <div
    v-if="terminal"
    class="level-outcome"
    :class="won ? 'level-outcome--won' : 'level-outcome--lost'"
    data-testid="level-outcome"
    role="dialog"
    aria-modal="true"
    aria-labelledby="level-outcome-title"
  >
    <p
      class="level-outcome__emoji"
      aria-hidden="true"
    >
      {{ won ? '🌟' : '🌱' }}
    </p>
    <h2
      id="level-outcome-title"
      class="level-outcome__title"
    >
      {{ won ? '读完啦！' : '再试一次吧' }}
    </h2>
    <p class="level-outcome__hint">
      <!--
        🔥 **AC-E2：进度必须仍然可见**（FR56 逐字「进度可见 —— 孩子随时能看到
        自己读到哪了」）。⚠️ 别把这一句当「元进度」删掉 —— 那条禁令针对的是
        星星 / 分数 / streak，**不包括**「读到哪了」。
        ⚠️ 文案里**不出现任何数字**（AC-E1 末条），所以写的是事实而不是计数。

        🔥📎 **`[CR]` 2026-10-20 更正两句里的全称量词**（用户裁决：**甲** ——
        改成不含全称量词、且**不读任何新 state** 的表述）：
        · 通关句原逐字「这个单元的**全部**单词都读过了。」——
          而 1.18 自己引入了 `skippedEntryIds`（正确项词图加载失败 ⇒ 整题被跳过），
          那种局里孩子**一个字都没读**，而屏幕上仍写着「全部单词都读过了」——
          **本项目能造出的最糟的假陈述**（同 `reducer.applySkip` 拒绝
          「题单被抽空」的理由）。
        · 失败句原逐字「**答错**的单词，下次再见到就认识啦。」——
          1.18 之后「没答对」有**两种**：答错了、以及被跳过了。
          原句默认「全部没答对的词都是答错的」，而它未必成立。
        ⇒ 现在的两句都**只描述已经做到的事**，不声称「全部」：
          「这个单元里读过的单词，你都认识啦！」/「再见到它们，就认识啦！」。
        ⚠️ **AC-E2 的判据不许因此失效**：守卫 `level-outcome.test.ts` 逐字断言
          通关画面的文字匹配 `/单元|进度|已学|掌握/` ⇒ 新文案**保留「单元」**这个说法，
          只去掉「全部」那个**假**的全称量词。
        ⚠️ **判据不许放宽**（守卫 G90 的白名单）：组件**仍然只读 `phase.kind`**，
          没有引入任何新的读法 ⇒ 不需要重新走一次裁决。
      -->
      {{ won ? '这个单元里读过的单词，你都认识啦！' : '再见到它们，就认识啦！' }}
    </p>
    <button
      ref="buttonEl"
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
  /*
   * 📎 **Story 1.18 / AC-D5：补安全区。**
   *
   * ⚠️ **1.16 的浮层是 `inset: 0`（撑满 `.level-view`），而 `.level-view` 已经在
   *   自己那份 padding 里加了 `env(safe-area-inset-*)`** —— 那留的是**整页的边距**。
   *   这里加的不是重复：浮层自己的 `padding` 决定**内容**离浮层边缘多远，
   *   而在矮视口（`responsive.css` 的 `max-height: 900px` 分支）里
   *   `.level-view` 改成了 `height: 100dvh` + 可滚动，
   *   内容可以贴着视口底边滚过去 ⇒ 浮层的内容必须自己避开手势条。
   *
   * ⚠️ **只加上下，不加左右** —— ⚠️⚠️ **`[CR]` 2026-10-20：下面这句原本的理由是错的。**
   *   原注释逐字写「左右由 `.level-view` 的 padding 统一处理，两处都加会叠加两次」。
   *   `.level-view` **确实**加了左右（`LevelView.vue` 逐字
   *   `calc(var(--space-panel-pad) + env(safe-area-inset-right))` / `…env(safe-area-inset-left)`），
   *   **但那份 padding 根本碰不到本浮层** —— 本浮层是 `position: absolute; inset: 0`，
   *   它的包含块是 `.level-view` 的 **padding box**，而 padding box **含** padding 区，
   *   ⇒ `.level-view` 的 padding **不会**把浮层往里推。
   *   实测（真实 chromium 800×900，往 `.level-view` 塞 `position:absolute; inset:0` 探针）：
   *   `probe_left = 0` 而 `level_view_padding_left = "16px"` ⇒ `on_padding_box: true`。
   *   ⇒ **「两处都加会叠加两次」这个理由不成立**，本浮层**是**应该自己加左右的；
   *   之所以现在还没加，是因为改它属 1.16 的组件、已登记为 `deferred-work.md` 的 **W7**（含更正后的事实）。
   *   ⚠️ 恢复时补在**本浮层自己的 padding** 上，别去改 `.level-view` ——
   *   那会连带改战场与 HUD 的可用宽度（属布局口径变更，需先问人）。
   */
  padding-top: calc(var(--space-panel-pad) + env(safe-area-inset-top, 0px));
  padding-bottom: calc(var(--space-panel-pad) + env(safe-area-inset-bottom, 0px));
  padding-left: var(--space-panel-pad);
  padding-right: var(--space-panel-pad);

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
