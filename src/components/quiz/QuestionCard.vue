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
 * ── 🚨 关于「建造期那道题从哪来」（裁决 4 / AC-C5；1.19 CR 已改）──────────
 *   `applyAnswer`（`reducer.ts:195`）答完**立刻**切到 `awaiting-build`，
 *   而卡面必须继续显示「刚刚答完的那道题」——
 *   反馈不是「慢了 100ms」，是**根本没有**（`epics.md:1064` 的 ≤100ms 反馈
 *   需要一个可见的载体）。
 *
 *   ⚠️ **1.19 CR 之前这道题住在组件本地的 `lastQuestion` ref 里**，
 *   而存档恢复时组件是**全新挂载**的 ⇒ 那份 ref 恒为 `null`
 *   ⇒ **孩子从存档回到建造期时卡面整个消失**。
 *   1.15 当年把这件事判成「这是正确的：重启本来就不该停在『刚刚答完』的反馈上」，
 *   **实测证明那个判定漏了「存档恢复」这一种形态** —— 而它才是孩子真会遇到的。
 *   ⇒ 现在 `Phase.awaiting-build` 自带 `question`（`core/types.ts`），
 *     `shown` 在两个相位上**读的是同一个数据源**，`lastQuestion` 已删除。
 *
 *   ⇒ FR51 要求的「战场每局清空」不受影响：题面是**题单条目**（`Question = DeckEntry`），
 *     它不随局清空——清空的是 `towers` / `grid` / `zombies`（FR51 逐字指的就是这三样）。
 */

import { computed, ref, watch } from 'vue'

import { answer } from '../../core'
import type { OptionId, Question } from '../../core'
import { applyAction, brokenButPickableOption, reportImageFailure, speakQuestion, state } from '../../app/store'

import AnswerFeedback from './AnswerFeedback.vue'
import OptionCard from './OptionCard.vue'

/**
 * 🔥📎 **1.19 CR（2026-10-18）：上一道题由 `State` 携带，组件本地那份已删除。**
 *
 * ⚠️ **删除的理由不是「简化」，是断点续学**：存档恢复时组件是**全新挂载**的，
 *   组件本地 ref 恒为 `null` ⇒ 孩子回到建造期时卡面整个消失，
 *   而界面上没有任何东西指向原因（那正是 1.15 当年判成「这是正确的」的那个形态）。
 *   `Phase.awaiting-build` 现在带 `question`（见 `core/types.ts`），
 *   `shown` 两个相位都直接读 `phase.question` —— **同一份数据、同一个读法**。
 *
 * ⚠️ **不再有「兜底」这个词**：旧实现是「`awaiting-answer` 用 phase 上的，
 *   `awaiting-build` 用本地那份兜底」，两个数据源 ⇒ 两个事实来源。
 *   现在只有一个来源，所以下面的判据也从「兜底窄不窄」变成了「非答题相位一律 null」。
 */
/** 孩子点了哪个（瞬时 UI 态）。**每次回到 `awaiting-answer` 都清**。 */
const pickedOptionId = ref<OptionId | null>(null)
/** 已经自动朗读过的 `entryId` —— 触发源是「换了一道题」这一可数事件。 */
const spokenEntryId = ref<string | null>(null)

/**
 * 渲染源：**只有「正在等孩子答题」与「刚答完、等建塔」这两个相位交出题面**。
 *
 * ⚠️ **为什么直接读 `phase` 而不是 watch 兜底**：Vue 的 `watch` **默认不在 setup
 *   时触发**，而 `createInitialState`（`reducer.ts:69`）把初始 phase 设成
 *   `awaiting-answer` ⇒ **首次挂载就是一道待答题**。
 *   `shown` 走 phase 本身 ⇒ 首次挂载必然有题。
 *
 * 🔥 **📎 Story 1.16 裁决 7 把范围收窄到 `awaiting-build`**（守卫 **G94**）。
 *   改之前是「**任何**非 `awaiting-answer` 的相位都用上一道题」，
 *   而 `Phase` 有**六个**变体 ⇒ `resolving` / `round-over` /
 *   **`level-complete` / `level-failed`** 四种也都在兜底范围里。
 *   ⇒ 失败之后卡面、那一张卡的几个选项、反馈条**全都还留在屏幕上**，
 *     而此时点它们没有任何事发生 —— 这正是 AC-D5 说的「假可点」。
 *
 * ⚠️ **为什么 `resolving` / `round-over` 也不给**：它们是 `END_BUILD` 之后的
 *   真实一帧，卡面在那两帧里消失是可接受的 —— 那正是「点开战之后画面变干净」
 *   的预期反馈。而**终态**不容许，因为终态上盖着浮层（AC-D2），
 *   卡面在浮层底下若仍可点，孩子会以为「我点的没反应」。
 */
const shown = computed<Question | null>(() => {
  const phase = state.value.phase
  if (phase.kind === 'awaiting-answer') return phase.question
  return phase.kind === 'awaiting-build' ? phase.question : null
})

/** 当前是否在等孩子答题 —— 决定重听与自动朗读是否可用。 */
const answering = computed(() => state.value.phase.kind === 'awaiting-answer')

/**
 * 📎 **Story 1.19 `[CR]`（2026-10-18）：卡面此刻「只读」—— 那道题已经答完了。**
 *
 * 🔥 **为什么这是本轮真机试玩撞出来的第二个洞**：
 *   `onPick` 的守门 `if (!answering.value) return` 会把建造期的点击**静默丢弃**，
 *   而 `OptionCard` 的 `:disabled` 原先只跟着 `failed`（破图）走
 *   ⇒ 建造期里那四张卡是**白卡 + 灰边框 + `cursor: pointer`、没被 disabled**，
 *     点下去**什么都没有** —— AC-D5 逐字说的「假可点」。
 *   ⇒ 1.16 裁决 7 / 守卫 G94 只保证「兜底范围外的四个相位**不渲染卡面**」，
 *     **从没有验过「渲染卡面的这个相位里，选项到底能不能点」**。
 *
 * ⚠️ **为什么正常游玩时没人发现**：反馈窗口只有 ≤100ms（AC-C5），
 *   孩子来不及点。**从存档恢复到建造期时它是永久状态** —— 1.19 CR 把题面
 *   落进 `Phase` 之后，「恢复落在建造期」与「卡面显示」才第一次同时成立。
 *
 * ⚠️ **只在这一个相位上为真**：`shown` 为 `null` 的另外四个相位整个卡面都不渲染
 *   （守卫 G94 钉着），所以「卡面在」严格蕴含「相位是 awaiting-answer 或
 *   awaiting-build」⇒ `locked` 在渲染出来的卡面上恒等于「现在是建造期」。
 */
const locked = computed(() => !answering.value)

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
 * 🔥📎 **2026-10-22（Epic 1 集成层检视 / 裁决）：破图却仍必须可点的那张卡，
 *   用**什么文字**顶上那张破掉的图。**
 *
 * ⚠️ **为什么是 `promptText`**：图片选项（`ImageOption`）**本身没有文本字段**
 *   （`core/types.ts`：`ImageOption` 只有 `id` + `imageSrc`）⇒ 词文本只能从
 *   **卡面**这一层拿。而 `content/schema.ts` 逐字写「word ⇒ 全部 ImageOption；
 *   keyword / response ⇒ 全部 TextOption」⇒ **只有单词卡会有图片选项**，
 *   而单词卡的 `promptText` 就是**那个词本身**（单元 1 的 30 张单词卡逐条核过：
 *   `promptText` 恒等于去掉单元前缀后的 `option.id`）。
 *
 * ⚠️ **为什么 `kind !== 'word'` 时返回 `null`**：那两种卡的选项是**文字选项**，
 *   压根没有图 ⇒ **永远不会破** ⇒ 这一支走不到。
 *   写出来是为了让「这条路径只对单词卡成立」在源码里一眼可查，
 *   而不是靠「反正只有单词卡会走到」这种推断。
 *
 * ⚠️ **`entryId` 与 `optionId` 两个都要对上**：`optionId` **跨题单会重复**
 *   （单词卡的每个选项就是另一个词的 id）⇒ 只对 `optionId` 会误伤别的题。
 */
function brokenPickableTextFor(optionId: OptionId): string | null {
  const broken = brokenButPickableOption.value
  if (broken === null) return null
  const question = shown.value
  if (question === null) return null
  if (question.entryId !== broken.entryId) return null
  if (optionId !== broken.optionId) return null
  if (question.card.kind !== 'word') return null
  return question.card.promptText
}

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
 * ⚠️⚠️ **为什么只清这一个，而 `pickedOptionId` 不是「忘了清」**（这条是实测结论，不是推断）：
 *   `pickedOptionId` 由下面那个 phase 的 watch 兜住了 ——
 *   `RESTART_LEVEL` **必定**落在 `awaiting-answer`（裁决 4），而那个 watch
 *   对 `awaiting-answer` 本来就清它。变异实测：把下面的复位体**整个删空**，
 *   `tests/components/quiz-card.test.ts` **只红 1 条**，就是这条朗读用例
 *   （`expected "vi.fn()" to be called 1 times, but got 0 times`），
 *   `pickedOptionId` 相关的断言全绿。
 *   ⇒ 1.16 落地前那段注释把三项症状都写成真问题，那是**推断**；按实测改窄。
 *   📎 **1.19 CR**：`lastQuestion` 已从这条注释里删掉 —— 它整个 ref 都没了，
 *     不再是需要被「兜住」的第二数据源。
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
 * 每次**进入一道新题**时清 `pickedOptionId`。
 *
 * 🚨 **重置判据是「进入了一道新题」这个事件，不是「`entryId` 变了」**（AC-C5 ③）。
 *   答错 → `END_BUILD` → `resolving` → `round-over` → `CONTINUE` → `nextQuestion`
 *   （`reducer.ts:100`）**返回同一道题**（AC-4 重考）⇒ `entryId` 不变。
 *   只按 `entryId` 判断的话 watch 不触发，`pickedOptionId` 仍指着上一轮点过的选项，
 *   **孩子还没点，`is-picked` 就已经亮着**。
 *
 * 📎 **1.19 CR：本 watch 原来还顺手写 `lastQuestion`，那一行随它一起删了** ——
 *   题面现在由 `State` 携带，没有第二个数据源要同步。剩下的职责只有「清选中态」。
 */
watch(
  () => state.value.phase,
  (phase) => {
    if (phase.kind !== 'awaiting-answer') return
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

/**
 * 📎 **Story 1.18 / AC-E4：某个选项的词图加载失败 → 交给 store 门面处置。**
 *
 * ⚠️ **本组件只「上报」，不判定** —— 这不是省事，是守卫 **G21** 逐字要求的：
 *   「组件里既不 import `isCorrect`、也不读 `option.correct`」。
 *   而「破的是不是正确项」正是跳过的**唯一**前提（干扰项破图时那道题仍然答得了）。
 *   ⇒ 判定落在 `app/store.ts` 的 {@link reportImageFailure} 门面里：
 *     它 import `isCorrect`（core 的**唯一一份**判定实现），
 *     判完再决定 dispatch 还是什么都不做。
 *
 * ⚠️ **这里刻意没有「一道题只报一次」的守卫**（1.18 `[DS]` 踩过，记在这里防复犯）：
 *   初版有 `skippedFor` 一次性 ref，理由是「第二张破图带着的是已被换掉的题」。
 *   **它是错的**：若**第一张**破的是干扰项（门面什么都没做），
 *   第二张破的是正确项，这道守卫会把它挡掉 ⇒ 题目永远跳不掉、整关不可通 ——
 *   正是 AC-E4 要治的那个病。
 *   ⇒ 组件**每次**都报；「这张 id 还属于当前题吗」由门面的成员检查判
 *     （它必须判，因为 `isCorrect` 对不存在的 id 是**抛错**的）。
 */
function onOptionImageFailed(optionId: OptionId): void {
  if (!answering.value) return
  reportImageFailure(optionId)
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
      :class="{ 'is-locked': locked }"
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
          :locked="locked"
          :broken-pickable-text="brokenPickableTextFor(option.id)"
          @pick="onPick"
          @image-failed="onOptionImageFailed"
        />
      </div>
    </div>
    <!--
      📎 **1.19 `[CR]`：`|| locked` 是这一轮修的那个洞。**
      恢复落在建造期时 `pickedOptionId` 恒为 `null`（它是组件本地的瞬时态，
      随页面一起没了）⇒ 反馈条不渲染 ⇒ 孩子看到的是**一道还没答的题**，
      点下去却被守门静默丢弃。⇒ 现在只要「已经不可再答」就显示它，
      而 `pickedRight` 读的是 `masteredEntryIds` —— **跨刷新仍然成立**
      （答对 ⇒ 该 entryId 在里面；答错 ⇒ 不在，`applyAnswer` 让答错也进建造期）。
    -->
    <AnswerFeedback
      v-if="pickedOptionId !== null || locked"
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

/*
 * 📎 **1.19 `[CR]`：建造期不再假装可点。**
 * `onReplay` 的守门 `if (!answering.value) return` 与 `onPick` 是同一条，
 * 而 AC-D5 的「假可点」对**重听入口**同样成立 —— 指针光标 + 点了没反应。
 *
 * 🔥📎 **`[CR]` 第六轮更正：只改光标在触摸设备上是无效的。**
 *   目标机型是**平板**，`cursor` 在触摸设备上根本不可见；而容器仍挂着
 *   `@click="onReplay"`，守门静默丢弃 ⇒ 孩子点题面区 / 点选项周围的空白，
 *   **什么都没有发生**，正是 AC-D5 逐字说的「假可点」。
 *   ⚠️ 该容器**同时包着题面区与选项区**（见模板注释）⇒ 点选项旁边也一样。
 *   ⇒ 补 `pointer-events: none`：**从命中测试里摘掉**，而不是只换光标。
 *   `onReplay` 本身与它的守门都留着（`pointer-events` 只挡真实指针，
 *   而 jsdom 的合成事件不参与命中测试 ⇒ 组件测试不受影响）。
 */
.question-card__tappable.is-locked {
  cursor: default;
  pointer-events: none;
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

/* 选项行 —— **列数随选项数变化**（Story 2.4 / AC-D3）。
   档间距 12px，比战场的 `--space-grid-gap` 宽一档，
   理由见 tokens.css 字体段（选项卡上是要逐个读的密集文字）。

   ⚠️🔥 **为什么从「固定四列」改成 `auto-fit`**（Story 2.4 / 裁决 4）：
   选项数由 `src/content/option-count.ts` 的档位表决定（单元 1 = 单词卡 2 个、
   关键词卡与回应卡 3 个；后面的单元最多 4 个）。列数若写死，2 个选项时右侧
   两列全空 —— 孩子看到的是两个窄按钮贴在左半边，**那是一个看得出没做完的卡面**。
   ⇒ `auto-fit` 让列数**由子项数量决定**、每列等宽、铺满整行。
   ⚠️ **下面的宽度是 2026-10-22 真浏览器实测值**（Chromium 1223，800×1280，
   选项容器实测宽 **736px** —— 800 − 左右各 32px 内边距），**不是从别处抄的**：
     2 个 → 每列 (736−12)/2 = **362px**；3 个 → (736−24)/3 = **237px**；
     4 个 → (736−36)/4 = **175px**（与旧的 `repeat(4, 1fr)` **逐字等价** ——
     同内容实测的 x 坐标与宽度完全相同，见 story 2.4 的 T4.3 实测表）。
   ⚠️ Story 1.11 记的基线是「容器 768px / 选项宽 183px / rowTops 555」——
     **今天的应用复现不出来**（容器已经是 736px）。这是**本 story 之前就有的漂移**：
     旧的 `repeat(4, 1fr)` 在今天的应用里实测同样是 175px / rowTops 630 ⇒
     **新旧 CSS 逐字等价**这条判据成立，但 1.11 的绝对数已经过期
     （详见 story 2.4 的 Dev Agent Record「实测值与过期基线」一节）。
   ⚠️ `minmax(0, 1fr)` 而不是 `1fr`：后者的最小轨宽是 `auto`（min-content），
     文字一长就会把轨道撑大、把整行推出屏幕（横向溢出）。`minmax(0, 1fr)` 让
     轨道恒等宽，超长的部分由选项卡自己处理（实测无横向溢出）。
   ⚠️ **刻意不写 `grid-auto-flow`**：横屏那套 2 列布局
     （`src/styles/responsive.css` 的 `@media (min-aspect-ratio: 1/1)`，被守卫
     **G169** 逐字钉死）依赖**默认的按行流**；一旦这里改成按列流，横屏的
     2 列会变成列优先的排布 —— 那是一条**已锁死的横屏布局规则**，不在本 story 范围。
   ⚠️ **列数是纯 CSS 的自适应** —— 没有新增任何运行时逻辑（AC-D1 的口径见
     story 2.4 的「偏离登记」：允许改列定义一处，不允许改模板与逻辑）。 */
.question-card__options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 12px;
}
</style>
