<script setup lang="ts">
/**
 * LevelView —— 战场视图（Story 1.10 / AC-11；Story 1.13 / AC-C4 接入 HUD）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只承载 `<BattleField />` 并负责**战场区域的布局**。它不含任何战斗逻辑，
 * 也不持有任何战场状态。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不做 HUD 的判据**（阳光怎么算 / 掉了几颗心 / 进度怎么来）——
 *   全部在 `core/hud.ts`（Story 1.13 / AC-B1..AC-B7）。本视图只负责摆放三块组件，
 *   **不持有任何 HUD 状态**，也从不算任何一个 HUD 数字。
 * · **不写死 HUD 的高度**（AC-C4 / AC-C5）—— 见下方模板注释。
 * · **不做关卡流程**（开局 / 通关 / 失败 / 推进）—— 属 1.16。
 *   本视图**无条件**渲染战场：1.10 的题单交互尚未落地，`state.phase` 的六种
 *   变体里只有开局那一种有画面。若这里按 phase 分支，就会渲染出一片空白，
 *   而 AC-16 要求「战场在浏览器里肉眼可见」。
 * · **不做词图加载** —— 属 1.11 / 1.18。**由 `<QuestionCard />` 消费**
 *   （1.11 把 30 张词图第一次接进运行时通路），本视图不碰任何 URL。
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
import { computed } from 'vue'

import BattleField from '../components/battle/BattleField.vue'
// ⚠️ **必须显式 import**（同上面那条，`vue/no-undef-components: 'error'` 为此设了守卫）：
//   漏掉这行会渲染成一个没有内容的自定义元素，而 vue-tsc / build / test / lint
//   **全绿**，页面只是白着（Story 1.10 的 Debug Log #4）。
import QuestionCard from '../components/quiz/QuestionCard.vue'
// ⚠️ **必须显式 import**（同上面那条，`vue/no-undef-components: 'error'` 为此设了守卫）：
//   手牌区在 Story 1.12 落地后是 `<QuestionCard />` 的**下一个兄弟**（AC-C1）。
import HandDeck from '../components/hand/HandDeck.vue'
// ⚠️ **必须显式 import**（同上面那条，`vue/no-undef-components: 'error'` 为此设了守卫）：
//   HUD 三块组件（Story 1.13 / AC-C4）。漏掉任何一行都会渲染成没有内容的自定义元素，
//   而 vue-tsc / build / test / lint **全绿**，页面只是少一块。
import HeartRow from '../components/hud/HeartRow.vue'
import ProgressBar from '../components/hud/ProgressBar.vue'
import SunCounter from '../components/hud/SunCounter.vue'
import { entriesOf } from '../content'
import { state } from '../app/store'

/**
 * 本单元的词条总数 —— **进度条的分母**（AC-C3）。
 *
 * ⚠️ **分母必须由调用方传给 `<ProgressBar>`，组件里不许写死 37 / 60**：
 *   `core/hud.ts` 的 `progressDisplay` 按裁决 7 的口径，`core/` 不得 import
 *   `content/` ⇒ 分母只能是参数。而这一层是**唯一**同时看得见「单元号」与
 *   「该单元词表」的地方（`entriesOf` 正是 `src/content/index.ts` 提供的查表门面）。
 *
 * ⚠️ 用 `computed` 而不是模板里直接调：模板每次重渲染都会重新求值，
 *   而 `entriesOf` 会走一次查表。它是纯的，但没必要每次都算。
 */
const unitTotal = computed(() => entriesOf(state.value.unitNumber).length)
</script>

<template>
  <main class="level-view">
    <!--
      HUD（Story 1.13 / AC-C4）：**排在这个 flex 列的最上面**，三块横排。

      ⚠️ **更正 1.10 留在这儿的注释**（AC-C5）：那段注释写的是
        「战场区是 `flex: 1` 会自动让出高度」，而**实际 CSS 从来都是**
        `flex: 0 0 auto`（见下方样式块）—— 那条注释是在给一个**不存在**的
        弹性行为指路。真实机制是另一条：`.level-view` 是 `min-height: 100dvh`
        而**不是** `height`，子项又全是 `flex: 0 0 auto`
        ⇒ HUD 加进来是把战场**整体下推**，高度从页面底部的余量里扣。
        ⇒ **HUD 太高时页面会滚动、战场可能被推出视口** ——
        这是 AC-G1 必须在真浏览器里量的项，不是可以推断的项。
    -->
    <div
      class="hud"
      data-testid="hud"
    >
      <SunCounter />
      <HeartRow />
      <!-- 分母来自内容层查表，不在组件里写死（见 script 里的注释）。 -->
      <ProgressBar :unit-total="unitTotal" />
    </div>
    <BattleField />
    <!--
      📎 **给 Story 1.12 的手牌区预留的位置**：卡面区在战场之下，
         1.12 的手牌区接在它后面即可。
         ⚠️ **不写死卡面区高度** —— 写了 1.12/1.13 落地时必然回头重排。
    -->
    <QuestionCard />
    <!--
      手牌区（Story 1.12 / AC-C1）：接在 `<QuestionCard />` **之后** ——
      卡面区在战场与题面之下，孩子答完题拿到卡，「选项在上、卡在下」读起来顺。
      ⚠️ 战场区的 `flex: 0 0 auto`（下方样式块）**一个字都没改**，
        1.10 那个「横向撑破到 1351px」的坑不许重新踩。
    -->
    <HandDeck />
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
  /*
   * 🚨 **整页铺草地绿（`[CR]` 2026-10-16 修的 P0：题面文字白字白底不可见）。**
   *
   *   改之前 `html`/`body`/`#app`/`.level-view` **全链路没有背景色**，
   *   而 `--color-bg`（注释就写着「草地底色」）只被 `BattleField` 的**格子**
   *   引用 ⇒ 格子以下是浏览器默认白底。落在那片白底上的三样东西全都看不见：
   *     ① `.question-card__prompt { color:#ffffff }` ⇒ **对比度 1.00:1**，完全不可见
   *     ② `.option-card { background:#fff; border:3px solid transparent }`
   *        ⇒ 白卡叠在白页上，**没有可见边界**，四张词图看着像浮空
   *     ③ `.is-picked { border-color: var(--color-overlay-range) }`
   *        = `rgba(255,255,255,.3)` ⇒ 白底上同样不可见
   *
   *   ⚠️ **`--color-bg` 本来就是给整页用的** —— 它的注释写着「草地底色」，
   *   而战场格子另有一句「与 `--color-bg` 同值，让网格融进草地」的注释
   *   ⇒ 格子是**复用了**整页底色，整页自己却一直没铺。
   *
   *   用户裁决（2026-10-16）：整页铺草地绿 + 卡片区给白面板（白面板见
   *   `QuestionCard.vue`）。绿底让白卡片的边界天然可见，
   *   不必再为 `.option-card` 单独设计边框色。
   */
  background-color: var(--color-bg);
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

/*
 * HUD 容器（Story 1.13 / AC-C4）。
 *
 * ⚠️ **`flex: 0 0 auto` + 内容自然撑开，**一个 px 高度都不写**
 *   —— 这是 1.10:629 与 1.11:905 两条结转项的原话。钉高度的后果：
 *   1.16 的关卡条落地时必然回头重排战场，而重排战场布局意味着 45 格重新测一遍
 *   （1.10 那个「横向撑破到 1351px」的坑就是这么来的）。
 *
 * ⚠️ **三块之间用 `flex: 1` 分摊余量，而不是固定宽度**：
 *   阳光与进度是「会变长」的（余额可能涨到 4 位数，进度文本也可能折行），
 *   给死宽度就会在某个数值下把文字挤掉。
 *
 * ⚠️ **「不许横向撑破」靠的是 `min-width: 0` + 文字折行，不是 `flex-wrap`**
 *   （`[CR]` 2026-10-16 更正）：此处原先写着「**`flex-wrap: wrap` 是有意的**：
 *   三块若真的排不下，宁可折行也不许横向撑破」——**而下面 `.hud > *` 的
 *   `flex: 1 1 0` 让那行 `flex-wrap` 永远不可能生效**。
 *   flex 换行按**假设主尺寸**判定 = `flex-basis` 被 `min-width` 夹取；
 *   此处 `flex-basis: 0` + `min-width: 0` ⇒ 三个子项的假设主尺寸**恒为 0**，
 *   加上 16px gap，任何视口 ≥ 16px 都排成一行 ⇒ `flex-wrap` 是一句死代码。
 *   ⇒ 已**删除该行**，注释改为描述真正在兜底的机制。
 *   ⇒ 真实风险是**纵向**的：窄屏时标签折 2~3 行 ⇒ `.hud` 变高 ⇒ 战场被下推。
 *     这由 AC-G1 第 2 项（`scrollHeight` vs 视口）量，1.13 实测 1280 = 1280 通过。
 *   （若日后真要三块折行，须把 `flex-basis` 换成 `auto` 并给一个 px 的
 *     `min-width` 下限让 wrap 能触发 —— 但那会引入本文件一贯拒绝的写死宽度。）
 */
.hud {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 0 0 auto;
  margin-bottom: 8px;
}

.hud > * {
  /* `flex-basis: 0` + `min-width: 0` = 允许缩到内容以下 ⇒ 文字折行而非横向撑破。 */
  flex: 1 1 0;
  min-width: 0;
}
</style>
