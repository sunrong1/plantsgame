<script setup lang="ts">
/**
 * QuestionCard —— 卡面（Story 1.11 / AC-C5、AC-D1、AC-D2、AC-D3）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 题面区 + 选项区 + 重听。**不判定对错**（AC-D1）：它读的是 reducer 已经
 * 算好、存进 `state.masteredEntryIds` 的事实，不是自己实现一条规则。
 * 判据在下面 `pickedRight`，**三行、零分支逻辑**，且逐字对应 AC-D2 的公式。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 import `services/pronunciation`** —— 朗读只经 `store` 的
 *   `speakQuestion()` 门面（裁决 3、守卫 G25）。
 * · **不 throw、不写 assert**（AC-E3 / `[GA]:567-575`）。
 * · **不直接调 `app/effects-runner.ts`** —— 📎 它属 Story **1.14**（不是 1.13，
 *   旧编号残留已按 R-32 更正），本组件的音效一律由 `applyAction` 触发它；
 *   这里自己播一遍就是重复播放，且守卫 **G60** 会判红。
 * · **不写死卡面区高度** —— 1.12 的手牌区与 1.13 的 HUD 都要位置（Dev Notes §10）。
 *
 * ── 🚨 关于 `lastQuestion`（裁决 4 / AC-C5）─────────────────────────────
 *   `applyAnswer`（`reducer.ts:195`）答完**立刻**切到 `awaiting-build`，
 *   而 `Phase.awaiting-build`（`types.ts:309`）只有 `{kind, unlocked, sun}` ——
 *   **没有 `question`**。卡面若在 `awaiting-answer` 一结束就卸载，
 *   孩子点下去后屏幕上什么都没发生：反馈不是「慢了 100ms」，是**根本没有**
 *   （`epics.md:1064` 的 ≤100ms 反馈需要一个可见的载体）。
 *   ⇒ 用组件本地的 `lastQuestion` 在 `awaiting-build` 期间继续渲染。
 *
 *   **代价如实登记**（Completion Notes 的「裁决的偏离」第 2 条）：
 *   1.15 存档恢复到 `awaiting-build` 时反馈条会消失 —— 组件是空的。
 *   **这是正确的**：重启本来就不该停在「刚刚答完」的反馈上。
 *   `lastQuestion` **不进 `State`、不存档、不参与 `reduce`**；
 *   FR51 要求的「战场每局清空」由 1.16 的 `RESTART_LEVEL` 加上裁决 7 的收窄共同保证 ——
 *   重打必定落在 `awaiting-answer`，那一帧 `lastQuestion` 被**当前题**覆盖；
 *   裁决 7 之后它**只在 `awaiting-build` 兜底**，而失败/通关两帧都不渲染卡面，
 *   所以「上一局的题还留在屏幕上」这件事已经不存在了。
 */

import { computed, ref, watch } from 'vue'

import { answer } from '../../core'
import type { OptionId, Question } from '../../core'
import { applyAction, speakQuestion, state } from '../../app/store'

import AnswerFeedback from './AnswerFeedback.vue'
import OptionCard from './OptionCard.vue'

/** 上一道题（`awaiting-build` 期间继续用它渲染）。只读数据，不参与 `reduce`。 */
const lastQuestion = ref<Question | null>(null)
/** 孩子点了哪个（瞬时 UI 态）。**每次回到 `awaiting-answer` 都清**。 */
const pickedOptionId = ref<OptionId | null>(null)
/** 已经自动朗读过的 `entryId` —— 触发源是「换了一道题」这一可数事件。 */
const spokenEntryId = ref<string | null>(null)

/**
 * 渲染源：**当前 phase 有 question 就用它，否则用上一次的**（AC-C5 ① 选项 A）。
 *
 * ⚠️ **为什么用 computed 兜底而不是只靠 watch**：Vue 的 `watch` **默认不在 setup
 *   时触发**，而 `createInitialState`（`reducer.ts:69`）把初始 phase 设成
 *   `awaiting-answer` ⇒ **首次挂载就是一道待答题**。
 *   只写 `watch(() => phase, …)` 的话首次渲染 `lastQuestion.value === null`，
 *   结果是**整个 story 的交付物在浏览器里是空的**，而且 FR1 的自动朗读也永不触发
 *   —— 症状是 G24 / G26 / G28 全红，红得像是「分派写错了」。
 *   `shown` 走 phase 本身 ⇒ 首次挂载必然有题。
 *
 * 🔥 **📎 Story 1.16 裁决 7 把兜底范围收窄到 `awaiting-build`**（守卫 **G94**）。
 *   改之前是「**任何**非 `awaiting-answer` 的相位都用上一道题」，
 *   而 `Phase` 有**六个**变体 ⇒ `resolving` / `round-over` /
 *   **`level-complete` / `level-failed`** 四种也都在兜底范围里。
 *   ⇒ 失败之后卡面、四个选项、反馈条**全都还留在屏幕上**，
 *     而此时点它们没有任何事发生 —— 这正是 AC-D5 说的「假可点」。
 *   ⇒ 现在只兜 `awaiting-build`：`lastQuestion` 的存在理由逐字是
 *     「答完 → 建造期」这一段（≤100ms 反馈需要一个可见的载体），
 *     它从未覆盖过终态。
 *
 * ⚠️ **为什么 `resolving` / `round-over` 也不兜**：它们是 `END_BUILD` 之后的
 *   真实一帧，卡面在那两帧里消失是可接受的 —— 那正是「点开战之后画面变干净」
 *   的预期反馈。而**终态**不容许，因为终态上盖着浮层（AC-D2），
 *   卡面在浮层底下若仍可点，孩子会以为「我点的没反应」。
 */
const shown = computed<Question | null>(() => {
  const phase = state.value.phase
  if (phase.kind === 'awaiting-answer') return phase.question
  return phase.kind === 'awaiting-build' ? lastQuestion.value : null
})

/** 当前是否在等孩子答题 —— 决定重听与自动朗读是否可用。 */
const answering = computed(() => state.value.phase.kind === 'awaiting-answer')

/**
 * 🚨 「答对没答对」的唯一读法：**`masteredEntryIds` 里有没有 `question.entryId`**。
 *
 *   `ANSWER` 之后 reducer 在答对时把 **`question.entryId`** 追加进
 *   `masteredEntryIds`（`reducer.ts:192`），答错时原样不动。
 *
 * ⚠️⚠️ **绝对不要拿「刚点的 `option.id`」去 `includes`。**
 *   `option.id` 与 `entryId` 对关键词卡与回应卡**根本不是同一个东西**：
 *     entryId `u1-s-i-have-a-ball-for-my-dog`（keyword）的正确选项是 `u1-ball`
 *     entryId `u1-s-how-are-you`（response）的正确选项是 `u1-s-i-am-fine`
 *   拿 `option.id` 去查 ⇒ 这两型的正确率**永远显示 0%**。
 *   而单词卡碰巧能对上（正确项 id 恰好 === entryId）⇒ 30/37 的卡上
 *   **「看起来正常」** —— 正是最容易被真浏览器核对放过的形态。
 *
 *   这不是「在组件里实现了一条规则」，是**读 reducer 已经算好的事实**：
 *   前者的值一旦 reducer 改了就会静默错，后者永远跟着 reducer 走。
 *   且 `nextQuestion()`（`reducer.ts:100`）跳过已答对的条目 ⇒ 没有历史污染。
 */
const pickedRight = computed(() => {
  const question = shown.value
  if (question === null) return false
  return state.value.masteredEntryIds.includes(question.entryId)
})

/**
 * 🔥 **📎 Story 1.16 裁决 8：新的一局开始时复位 `spokenEntryId`。**
 *
 * `RESTART_LEVEL` 把 `state.turn` 拨回 1，而重打**不卸载组件**
 * （`LevelView` 一直挂着，`QuestionCard` 一直在）⇒ 这个 ref 会**跨局残留**：
 * 它留着上一局的最后一道 `entryId`，而重打**从头开始、题序与上一局完全相同**
 * ⇒ 重打后的第一道题 `entryId` **必然**与它相同
 * ⇒ 自动朗读的守卫 `phase.question.entryId === spokenEntryId` 命中
 * ⇒ **新一局的第一道题永远不朗读**（FR1 逐字：每道新词都要念一遍）。
 *
 * ⚠️⚠️ **为什么只清这一个，而另外两个不是「忘了清」**（这条是实测结论，不是推断）：
 *   `lastQuestion` / `pickedOptionId` 由下面那个 phase 的 watch 兜住了 ——
 *   `RESTART_LEVEL` **必定**落在 `awaiting-answer`（裁决 4），而那个 watch
 *   对 `awaiting-answer` 本来就写这两行。变异实测：把下面的复位体**整个删空**，
 *   `tests/components/quiz-card.test.ts` **只红 1 条**，就是这条朗读用例
 *   （`expected "vi.fn()" to be called 1 times, but got 0 times`），
 *   `lastQuestion` / `pickedOptionId` 相关的断言全绿。
 *   ⇒ 1.16 落地前那段注释把三项症状都写成真问题，那是**推断**；按实测改窄。
 *
 * 🚨🚨 **为什么 watch 的是 `turn` 这一个字段、而不是在 phase 的 watch 里判 `turn === 1`**：
 *   **`turn` 是在 `nextQuestion`（`CONTINUE`）里才 +1 的**，
 *   而「答题 → `awaiting-build`」不涨回合 ⇒ **第 1 回合的建造期里 `turn` 仍然是 1**。
 *   在 phase 的 watch 里判 `turn === 1`，会在**每一次**相位变化时都复位 ——
 *   于是答完第一题进入建造期的那一刻，`lastQuestion` 被清成 `null`，
 *   反馈载体消失，**AC-C5 的 ≤100ms 反馈在第 1 回合当场失效**
 *   （`tests/components/quiz-card.test.ts` 实测红，裁决 8 落地时抓到的）。
 *   ⇒ 判据必须是「**回合号跃迁到 1**」这一**事件**：只有 `RESTART_LEVEL`
 *     与 `createInitialState` 会让 `turn` 变成 1，而 Vue 的 watch 只在**值真的变了**
 *     时触发 ⇒ 第 1 回合里的相位变化根本不触发它。
 *
 * ⚠️ **必须注册在朗读那个 watch 之前**：两者都由同一次 dispatch 触发，
 *   Vue 按注册顺序执行 ⇒ 复位晚一步的话，`spokenEntryId` 还没清，
 *   朗读守卫已经先判过了，新一局的第一道题就此静默。
 */
watch(
  () => state.value.turn,
  (turn) => {
    if (turn !== 1) return
    spokenEntryId.value = null
  },
  { immediate: true },
)

/**
 * 记住当前题，并在**每次进入一道新题**时清 `pickedOptionId`。
 *
 * 🚨 **重置判据是「进入了一道新题」这个事件，不是「`entryId` 变了」**（AC-C5 ③）。
 *   答错 → `END_BUILD` → `resolving` → `round-over` → `CONTINUE` → `nextQuestion`
 *   （`reducer.ts:100`）**返回同一道题**（AC-4 重考）⇒ `entryId` 不变。
 *   只按 `entryId` 判断的话 watch 不触发，`pickedOptionId` 仍指着上一轮点过的选项，
 *   **孩子还没点，`is-picked` 就已经亮着**。
 */
watch(
  () => state.value.phase,
  (phase) => {
    if (phase.kind !== 'awaiting-answer') return
    lastQuestion.value = phase.question
    pickedOptionId.value = null
  },
  { immediate: true },
)

/**
 * FR1：卡面出现时自动播一次。
 *
 * ⚠️ **watch 整个 `phase` 而不是 `phase.question.entryId`**（T7.6）：
 *   `Phase` 是六变体联合，`awaiting-build` 等五个变体上**没有 `question`**，
 *   照字面写 `() => state.value.phase.question.entryId` 是 TS2339，
 *   而最顺手的解法是加一个 `as` —— 那正是 §8 教训 3 的失败形态。
 *   这里 watch 整个 `phase`、**内部先收窄再用 `p.question`**。
 *
 * ⚠️ **`immediate: true` 不可省**：首次挂载就是一道待答题，
 *   不 immediate 则**一次都不会自动朗读**（与 `shown` 的理由同源）。
 *
 * ⚠️ **这条与架构硬约束 4「副作用只在 effects-runner」有张力。** 处置见
 *   Completion Notes 的「裁决的偏离」第 1 条：触发源是「换了一道题」这一
 *   **可数事件**，守卫 G27 断言连点 3 次重听后 `applyAction` 一次都没被调用、
 *   且自动朗读不重复触发。**不假装这条张力不存在。**
 *
 * 📎 **Story 1.14 裁决 6 复核（2026-10-16）：收口前提还不具备，逻辑一个字不动。**
 *   收口进 `runEffects` 的**前提**是「进关/出关成为结构化事件」，而
 *   `store.ts` 的 `state = ref(initialState())` 在**模块求值期**就建好首题，
 *   **首题朗读不经过 `applyAction`** ⇒ 没有任何 action 可 diff。
 *   若只把后续换题收口进 `runEffects`、首题仍靠这里 `immediate: true`，
 *   就得到**两个事实来源**判「该不该念」—— 那正是本仓库反复抓的漂移形态。
 *   ⇒ 收口属 **Story 1.16（关卡流程）**；本 story 只把张力如实登记进
 *   `deferred-work.md`，**不改这里一行逻辑**（AC-F2）。
 */
watch(
  () => state.value.phase,
  (phase) => {
    if (phase.kind !== 'awaiting-answer') return
    if (phase.question.entryId === spokenEntryId.value) return
    spokenEntryId.value = phase.question.entryId
    speakQuestion()
  },
  { immediate: true },
)

/**
 * 点一个选项：记下点了哪个，然后 `applyAction` —— **组件里不判定对错**（AC-D1）。
 *
 * 🚨 **守门 `answering` 不可省，`[CR]` 2026-10-16 实测复现过一次 P0 崩溃。**
 *   AC-C5 要求卡面在 `awaiting-build` 期间**继续渲染**（`lastQuestion` 兜底），
 *   而 `Phase.awaiting-build` 上**没有 question** —— 也就是说卡面可见期间，
 *   `state.phase.kind` 可能早就不是 `awaiting-answer` 了。
 *   孩子看着「上一道题的卡面还在」，点其中一个选项 ⇒
 *   `applyAction(answer(…))` 走进 `reduce` 的 `case 'awaiting-build'` 分支 ⇒
 *   `applyBuild` 调 `rejectAction` **抛错**（`reducer.ts:147`）⇒ 整局崩在事件回调里。
 *
 *   守卫顺序也重要：**先守门、再写 `pickedOptionId`**。
 *   反过来写的话，抛错发生在 state 变更之前，而 `pickedOptionId` 已经写入 ⇒
 *   反馈条照样渲染，而 `pickedRight` 读的是上一道**已答对**的题 ⇒
 *   孩子看到一个「答对了 ✓」的假反馈，却什么都没发生（比崩溃更难排查）。
 *
 *   与 `onReplay` 同口径 —— 两个入口都只在 `awaiting-answer` 有效。
 */
function onPick(optionId: OptionId): void {
  if (!answering.value) return
  pickedOptionId.value = optionId
  applyAction(answer(optionId))
}

/** 重听：FR1「重听无任何代价或次数限制」。只在 `awaiting-answer` 提供（AC-C5 ⑥）。 */
function onReplay(): void {
  if (!answering.value) return
  speakQuestion()
}
</script>

<template>
  <!--
    ⚠️ **`shown === null` 时这里一个节点都不渲染**（AC-C5 ②）：不是白框、
    不是空 div、连反馈条也不渲染。没有题就没有可显示的东西，
    而一个空壳 div 会让 G26 的「选项区有几个节点」类断言失去参照。
  -->
  <section
    v-if="shown"
    class="question-card"
  >
    <!--
      🚨 **可点重听的容器只包题面区 + 选项区，不包 `AnswerFeedback`**（AC-D3）。
      `@click.stop` **只挡按钮自身及其子树**，挡不住同一容器里的其他元素 ——
      把结果条放进来，点它就会同时触发重听，那是一次点击变成两个事件。
      选项按钮上的 `@click.stop` 负责挡另一半。
    -->
    <div
      class="question-card__tappable"
      @click="onReplay"
    >
      <p class="question-card__prompt">
        {{ shown.card.promptText }}
      </p>
      <div class="question-card__options">
        <!--
          🚨🚨 **`:key` 必须是 `entryId + option.id`，不能只有 `option.id`**（`[CR]` 2026-10-16）。
          只按 `option.id` 的话，Vue 会在**换题时复用同一个 OptionCard 实例**，
          而 `failed`（`OptionCard.vue:69`）是实例内的 ref、**永不复位**。

          ⇒ 实测数据（`unit-01.json` 全量扫描）里 **6 个 option id 同时出现在
          图片选项与文字选项上**：`u1-hello` / `u1-goodbye` / `u1-ball` /
          `u1-book` / `u1-pen` / `u1-chair`。其中 **`u1-ball`（关键词卡正确项）、
          `u1-hello`（2 张回应卡正确项）、`u1-goodbye`（2 张回应卡正确项）**
          是那些文字卡上**唯一的正确项**。

          于是这条链成立：单词卡上 `u1-ball` 的图 404 ⇒ 该实例 `failed = true`
          ⇒ 二十几道题之后，那张以 `u1-ball` 为正确项的关键词卡复用了这个实例
          ⇒ 正确项被渲染成**置灰且 disabled 的文字按钮**，`onPick` 直接 return
          ⇒ `masteredEntryIds` 永远不增长 ⇒ `nextQuestion` 永远返回同一道
          ⇒ 心数耗尽 `level-failed`，**这一关永远通不了**。

          把 `entryId` 放进 key，换题即换实例，`failed` 随之归零。
          📎 **同题重考（AC-4，`entryId` 不变）仍然复用实例** —— 这是**对的**：
          图真的坏了，重考时它就该继续坏着。
        -->
        <OptionCard
          v-for="option in shown.card.options"
          :key="`${shown.entryId}:${option.id}`"
          :option="option"
          :kind="shown.card.kind"
          :picked="pickedOptionId === option.id"
          :right="pickedOptionId === option.id && pickedRight"
          :wrong="pickedOptionId === option.id && !pickedRight"
          @pick="onPick"
        />
      </div>
    </div>
    <AnswerFeedback
      v-if="pickedOptionId !== null"
      :right="pickedRight"
    />
  </section>
</template>

<style scoped>
/*
 * ⚠️ **卡面区刻意不写死高度**（Dev Notes §10 给 1.12 / 1.13 的预留）：
 *   1.12 的手牌区与 1.13 的 HUD 都要位置。写了固定 px 高度，
 *   那两个 story 落地时必然回头重排，而重排布局意味着战场 45 格重测一遍
 *   （1.10 的教训：`flex: 1 1 auto` 把战场拉满屏、横向撑破）。
 */
.question-card {
  display: flex;
  flex-direction: column;
  /* 战场区是 `flex: 0 0 auto`（LevelView），卡面区吃掉余下的高度。
     给它 `flex: 0 0 auto` 而不是 `1 1 auto` 的理由与战场区相同。 */
  flex: 0 0 auto;
  /*
   * 🚨 **白面板（`[CR]` 2026-10-16 修的 P0）。**
   *   改之前卡面区没有自己的底色，而题面文字写的是 `color: #ffffff`
   *   ⇒ 白字落在浏览器默认白底上，**对比度 1.00:1，完全不可见**
   *   （真浏览器实测：祖先链 html/body/#app/.level-view 全部 `rgba(0,0,0,0)`）。
   *
   *   现在整页是草地绿（`LevelView.vue`），卡面区自己是白面板：
   *   ① 题面文字改 `#212121` ⇒ 白底上 **16.1:1**（WCAG AAA）
   *      —— 与 `.option-card__text` 已有的 `#212121` 同色，两者是同一块面板
   *   ② 白面板压在绿底上 ⇒ 卡片区边界自己就看得出来
   *   ③ 白卡（`.option-card`）落在白面板上仍需一道可见边界，见 OptionCard.vue 的边框说明
   */
  background-color: #ffffff;
  border-radius: 12px;
  padding: var(--space-panel-pad);
}

.question-card__tappable {
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
}

.question-card__prompt {
  margin: 0;
  font-size: var(--text-prompt);
  line-height: 1.2;
  text-align: center;
  /* ⚠️ **深色，不是白色**（`[CR]` 2026-10-16）。白底白字的教训见上面 `.question-card`
   *   的长注释：这条在 jsdom 里测不出来，只有真浏览器能看见 —— 而 story 的
   *   AC-F1 五项核对清单里**没有「题面文字可见」这一项**，所以它此前一直漏网。 */
  color: #212121;
}

/* 四个选项并排（AC-F1 ①）。档间距 12px，比战场的 `--space-grid-gap` 宽一档，
   理由见 tokens.css 字体段（选项卡上是要逐个读的密集文字）。 */
.question-card__options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
</style>
