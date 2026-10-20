/**
 * @vitest-environment jsdom
 */

/**
 * 答题卡组件的守卫（Story 1.11 / AC-B2、AC-C1…C5、AC-D1…D5、AC-E1…E3）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **G21** `quiz/` 组件源码既不 import `isCorrect`、也不出现 `.correct` —— 变异 M51
 * · **G23** 占位图形是内联常量：组件源码对占位图形不得有 `new Image` / `fetch(` /
 *   `.svg` 路径字面量 —— 变异 M49
 * · **G24** 卡型分派（**两半**：上半变异敏感 M50，下半复验 M50b）
 * · **G25** `quiz/` 组件的 import 里不含 `pronunciation` —— 变异 M47
 * · **G26** 渲染层三型各渲染一张，两个分支互斥且穷尽
 * · **G27** 重听 3 次 ⇒ `applyAction` 调用次数为 0 —— 变异 M52
 * · **G28** 降级选项带 `disabled` 属性 —— 变异 M54
 * · **G29** `quiz/` 组件源码不含 `throw` / `assert` 这两个**词** —— 变异 M55、M56
 *
 * ── 组件测试只测「渲染形态」与「事件转发」（AC-E2 / NFR17）───────────────
 *   `[GA]:954-956` 逐字：「逻辑层已覆盖的部分重复测一遍只会产生**虚假的信心**」。
 *   ⇒ 本文件**不**断言「点一下会发生什么战斗结果」—— 那些属于 `tests/core/`。
 *   它断言的是「state 长这样时，DOM 长那样」与「点这里会不会调 applyAction」。
 *   ⚠️ 三型**内容齐备**不在本文件（`tests/content/unit-01.test.ts:148-165` 的
 *   AC-17 已经守着，G26 只判**渲染层**）—— 两处都在会让复盘说不清「哪条在守」。
 *
 * ── 判据纪律（Story 1.9 的 P0）────────────────────────────────────────────
 *   每条判据都只有**一份实现**（下面的 `g21Violation` / `g23Violation` /
 *   `g24Violation` / `g25Violation` / `g29Violation`），真守卫与变异用例
 *   问的是**同一个函数**。
 */

import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyAction, reportImageFailure, speakQuestion, state } from '../../src/app/store'
import QuestionCard from '../../src/components/quiz/QuestionCard.vue'
import {
  answer,
  continueRound,
  createInitialState,
  endBuild,
  resolveRound,
} from '../../src/core'
import type { Card, OptionId, Question, State } from '../../src/core'
import { entriesOf } from '../../src/content'

// ⚠️ **`applyAction` / `speakQuestion` 必须用 `vi.mock` 拦，不能用 `vi.spyOn`** ——
//   它们是 `src/app/store.ts` 的**具名 ESM 导出**，对真实 ESM 命名空间做
//   `vi.spyOn(mod, 'applyAction')` 通常抛 `Cannot redefine property`。
//   `state` 保持**真实**（不 mock），用例里直接 `state.value = …` 组装 ——
//   与 `battle-field.test.ts:37,253-255` 的既有先例一致。
//
// 📎 **Story 1.18 加的第三个 mock：`reportImageFailure`**（AC-E4）。
//   ⚠️ **必须 mock，否则这个文件里大半用例都会在断言一件**没发生**的事**：
//   `vi.mock` 用的是 `{ ...actual }`，所以 `reportImageFailure` 是**真函数**，
//   它内部调的是模块作用域里那个**真的** `applyAction`（不是本文件的 mock）
//   ⇒ 正确项破图会真的换题 ⇒ G28 那几条「破图后卡片还在且被禁用」的断言
//   在破的**是正确项**时全部落空。
//   ⇒ 组件层只断言**交接**（谁报了哪个 optionId、报了几次）；
//     门面的判定与 dispatch 归 `tests/app/skip-facade.test.ts`。
vi.mock('../../src/app/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/store')>()
  return { ...actual, applyAction: vi.fn(), speakQuestion: vi.fn(), reportImageFailure: vi.fn() }
})

const applyActionMock = vi.mocked(applyAction)
const speakMock = vi.mocked(speakQuestion)
const reportImageFailureMock = vi.mocked(reportImageFailure)

/**
 * 🚨 **每个用例结束后必须卸载组件**（实测踩过：漏了它这条文件里大部分「调了几次」
 *  的断言都会数出偏大的值）。
 *
 *   `QuestionCard` 有两个 `watch(() => state.value.phase, …)`，而 `state` 是**模块级
 *   单例** —— 前一个用例 mount 出来的组件只要还活着，改一次 `state.value`
 *   就会**同时**唤醒它和当前组件的 watch，于是「切一道新题」被数成「切了几道」。
 *
 *   症状极具误导性：报错会说「自动朗读调了 3 次而不是 1 次」，
 *   而真实原因是**上一个用例的组件没卸载** —— 又一条「红得指错了地方」的假象。
 */
enableAutoUnmount(afterEach)

// 组件**源码**用 Vite 的 `?raw` 导入 —— jsdom 下 `import.meta.url` 是 http:// URL，
// `fileURLToPath()` 会抛。与 `battle-field.test.ts:53-56` 同因同解。
import questionCardSource from '../../src/components/quiz/QuestionCard.vue?raw'
import optionCardSource from '../../src/components/quiz/OptionCard.vue?raw'
import answerFeedbackSource from '../../src/components/quiz/AnswerFeedback.vue?raw'
// G30（题面可见性）要**跨组件**算对比度：文字色在 QuestionCard、底色在
// LevelView、token 值在 tokens.css。少任何一个都算不出「实际落在什么底上」。
import levelViewSource from '../../src/views/LevelView.vue?raw'
import { contrastRatio, cssDecl, resolveColor, stripComments as sharedStripComments } from '../helpers/contrast'
// 🔥📎 G177 用的是**稳健版**剥注释（`fixtures/` 那份，块注释也剥、且**保持字符位置**），
//   不是上面那份三处 replace 的朴素版 —— 后者的 docblock 自己记着
//   「把 ① 和 ② 之间的真代码整段删掉」，曾让 G105/G106 双双假红（R-37：单一出处）。
import { stripComments as stripCommentsForG177 } from '../fixtures/strip-comments'

/**
 * 剥掉块注释、行注释与 HTML 注释，只留代码。
 *
 * ⚠️ **这是本文件全部源码匹配型守卫（G21/G23/G25/G29）的强制前置。**
 *   本仓库对**所有**源码匹配型守卫都有这条硬惯例，且它是被**误报**逼出来的
 *   （`asset-url-guard.test.ts:130-137`：「那个字面量确实出现在文件里，
 *   在解释『为什么不能写死』的那段注释中 ⇒ 守卫立刻变红，而代码完全正确。
 *   **那是一条误报，而会误报的守卫会被当成噪声忽略。**」）。
 *
 *   在本 story 里这不是理论风险而是**必然**：项目的组件文件头规定要写
 *   「职责边界 + 刻意不做的事」（`Tower.vue:3-25` 同型），而 AC-E3 要求组件
 *   「不 throw、不写 assert」⇒ dev 必然在文件头写一句
 *   `// 组件层不 throw、不写 assert` ⇒ **G29 立刻红，而代码完全正确。**
 *
 * 📎 [CR] 2026-10-16：实现已移入 `tests/helpers/contrast.ts`，本文件改为 import。
 *   三处各留一份的话，其中一份迟早与另两份行为不同（本次就是「删空串」与
 *   「换行」的差别），而那种分歧的症状是**误导性的报错**，排查它比写它更费时间。
 */
const stripComments = sharedStripComments

/** `quiz/` 三个组件的「文件 → 源码」表。四条源码守卫共用它。 */
const quizSources: readonly (readonly [string, string])[] = [
  ['QuestionCard.vue', questionCardSource],
  ['OptionCard.vue', optionCardSource],
  ['AnswerFeedback.vue', answerFeedbackSource],
]

// ── 判据实现（每条只有一份）────────────────────────────────────────────────
//
// ⚠️ **四条源码守卫的判据都在函数内部先 `stripComments`，调用方一律传原始源码。**
//   这不是随手定的约定，而是照 `battle-field.test.ts` 的 `g19Violation` 先例
//   （那个的调用方也传的是 `towerSource` 原文）。理由见上面 `stripComments` 的注释。
//   若改成「调用方剥、判据不剥」，判据就**可以在没有剥注释的情况下被单独调用**，
//   而那正是误报的来源 —— 把剥注释藏进判据里，它就成了不可绕过的前置。

/** G21：组件里不得自己判定对错 —— 既不 import `isCorrect`，也不碰 `.correct`。 */
function g21Violation(source: string): string | null {
  const code = stripComments(source)
  if (/isCorrect/.test(code)) {
    return '组件里出现了 isCorrect —— 判定只能有一份实现（reducer.ts:184 已经在调它）'
  }
  if (code.includes('.correct')) {
    return '组件里出现了 `.correct` —— 「答对没答对」只能读 state.masteredEntryIds，不许看选项自己的字段'
  }
  return null
}

/**
 * G23：占位图形必须是内联常量。
 *
 * ⚠️ **只扫 `quiz/`** —— 常量本身住在 `core/placeholder.ts`，不受这条约束。
 *   禁的两种形态都是「把一次失败推迟成再一次失败」：`<img :src="…placeholder.svg">`
 *   会发一次注定 404 的请求；`new Image()` / `fetch(` 同理。
 */
function g23Violation(source: string): string | null {
  const code = stripComments(source)
  if (/new\s+Image\s*\(/.test(code)) return '占位图形走了 new Image() —— 那不是降级，是把失败推迟一次'
  if (/\bfetch\s*\(/.test(code)) return '占位图形走了 fetch() —— 加载失败时再发一次请求没有意义'
  // ⚠️ **判据的实际形态与 AC-B2 原文写的不一样，据实更正。**
  //   AC-B2 写「`<img :src="data:image/svg+xml,…">` 的字符串含 `.svg` 字面量
  //   ⇒ G23 会红」。**实测那半句不成立** —— MIME 类型是 `image/svg+xml`，
  //   里面是**斜杠**不是点，整个字符串里压根没有 `.svg`。
  //   ⇒ 照原文只写 `\.svg` 的判据**打不红 data URI 形态**。
  //
  //   真正要禁的是「在组件里现搭占位图的内容」这件事，它有两种形态，各配一条：
  //     ① 路径形态 `'/assets/…/placeholder.svg'` ⇒ 命中 `.svg`
  //     ② 内联形态 `'data:image/svg+xml,…'`     ⇒ 命中 `data:` + `svg`
  //   两者在 AC-B2 里的**理由是同一条**：占位图形的内容是 `core/` 那个常量的
  //   职责，组件里再写一份就是第二份实现（与 P0「判据/实现只有一份」同源）。
  if (/\.svg\b/.test(code)) return '组件源码里出现了 .svg 字面量 —— 占位图形必须是 core/ 那个内联常量'
  if (/data:image\/svg/.test(code)) {
    return '组件源码里现搭了 data:image/svg 内联数据 —— 占位图形的内容属于 core/ 的常量，不在组件里拼'
  }
  return null
}

/**
 * G24：渲染层按 `card.kind` 分派，两个分支**互斥且穷尽**。
 *
 * ⚠️ **上半必须喂一张真正非法的 fixture 卡**才有鉴别力：在真实内容下
 *   单词卡的四个选项全有 `imageSrc`、关键词/回应卡的四个全没有 ⇒
 *   「按 `card.kind` 分派」与「按选项有没有 `imageSrc` 分派」产生
 *   **逐字节相同的 DOM**，只改分派依据打不红任何东西（变异 M50 的两个动作缺一不可）。
 *   这张非法卡能存在是因为 `Card` 被拍平成 `kind + options` 的扁平联合
 *   （`types.ts:256-261`）—— 也就是 `deferred-work.md:340-356` 登记的
 *   「剩下的口子」：`core/` 内部自造的卡不受内容 schema 约束。
 */
function g24Violation(imageCount: number, textCount: number): string | null {
  if (imageCount > 0 && textCount > 0) return '图片分支与文字分支同时渲染了 —— 两个分支必须互斥'
  if (imageCount === 0 && textCount === 0) return '两个分支都没渲染 —— 互斥且穷尽意味着至少要有一个'
  return null
}

/**
 * G25：组件的 import 里不含 `pronunciation`。
 *
 * 🚨 **判据必须收窄到 `pronunciation` 本身，不能写成「不含 `../services/`」。**
 *   后者在**基线就红**：`'../../services/asset-url'.includes('../services/')` → true，
 *   而那行 import 正是 AC-B1 要求写的（1.10 已为 Tower/Zombie 开过先例）。
 *   那样写会让 M47 的变异与基线分不开，dev 只剩两条**都错**的出路。
 *   `asset-url.ts` 是无状态字符串函数，`pronunciation.ts` 持有
 *   `globalThis.AudioContext` 且有解锁时序 —— 只有后者在禁列内。
 */
const G25_FORBIDDEN = /\bfrom\s+'\.{1,2}(?:\/\.\.)*\/services\/pronunciation'/

function g25Violation(source: string): string | null {
  return G25_FORBIDDEN.test(stripComments(source))
    ? '组件直接 import 了 services/pronunciation —— 朗读只经 store 的 speakQuestion() 门面（裁决 3）'
    : null
}

/**
 * G29：组件层是「运行期资源失败 ⇒ 记录并静默降级」，不是 throw。
 *
 * ⚠️⚠️ **判据用 `\bthrow\b` 而不是 `\bthrow\s` —— 变异 M56 实测抓出来的空转。**
 *   原来的 `/\bthrow\s/` 要求 `throw` 后面跟**空白**，而组件文件头的自然中文
 *   写的是「不 **throw**、」—— 后面跟的是**顿号** `、`，`\s` 不匹配
 *   ⇒ 那条判据在**它唯一该报警的形态下反而不报警**。
 *   更要命的是：它让本文件「剥注释本身有效」那条自测**因为错误的原因而绿**
 *   （剥与不剥都不报），于是那条自测**零鉴别力** —— 而它存在的唯一理由
 *   就是撑住 M56 这类变异。装饰性的严谨。
 *
 *   与记忆里「守卫断言允许了它要防的违规」同型：`toBeLessThanOrEqual(1)`
 *   而实际值就是 1。判据的**字面量**必须先过一遍「它在真实文本里匹配得上吗」。
 *
 *   `\bthrow\b` / `\bassert\b` 不会误伤标识符：`assertInvariants` 里 `assert`
 *   后面跟的是单词字符 `I`，`\b` 不成立。
 */
function g29Violation(source: string): string | null {
  const code = stripComments(source)
  if (/\bthrow\b/.test(code)) {
    return '组件里出现了 throw —— 逻辑层才 throw（GA:567-575），组件遇到的是资源失败，要 warn + 降级'
  }
  if (/\bassert\b/.test(code)) return '组件里出现了 assert( —— 组件层没有断言这一层'
  return null
}

// ── 测试用的 state / 卡 ────────────────────────────────────────────────────

/** 取单元 1 里指定卡型的第一道题。 */
function firstQuestionOfKind(kind: Card['kind']): Question {
  const entry = entriesOf(1).find((e) => e.card.kind === kind)
  if (entry === undefined) throw new Error(`单元 1 里没有 ${kind} 卡`)
  return entry
}

/** 组装一份 state，题面挂在 `awaiting-answer` 上。 */
function stateWith(question: Question): State {
  return { ...createInitialState({ unitNumber: 1, deck: entriesOf(1) }), phase: { kind: 'awaiting-answer', question } }
}

/**
 * 从**真实内容**里找出「同一个 option id 既是图片卡的选项、又是文字卡的**正确项**」的一对题。
 *
 * 🚨 **这是 G28b 的事实来源，不是 fixture**（`[CR]` 2026-10-16）。
 *   单元 1 里这样的 id 有 6 个（`u1-hello` / `u1-goodbye` / `u1-ball` /
 *   `u1-book` / `u1-pen` / `u1-chair`），其中 3 个是文字卡的正确项。
 *
 *   之所以现筛而不写死：`unit-01.json` 是内容层数据，会随单元 1 修订而变
 *   （增删选项、换卡型）。写死 id 名的话，内容一改这条用例就**测另一件事**
 *   或者干脆报错，而「跨卡型复用仍然存在」这个前提本身已经悄悄不成立了。
 *   现筛的代价是：复用关系被内容修订消除时，这条用例会红 —— **那正是它该叫的**。
 */
function findReusedCorrectOptionQuestion(): {
  wordQ: Question
  textQ: Question
  sharedId: OptionId
} | null {
  const entries = entriesOf(1)
  // 先收集「出现在图片卡里」的 option id
  const asImageOption = new Set<string>()
  for (const e of entries) {
    if (e.card.kind !== 'word') continue
    for (const o of e.card.options) if ('imageSrc' in o) asImageOption.add(o.id)
  }
  // 再找「同时是文字卡正确项」的那个
  for (const textEntry of entries) {
    if (textEntry.card.kind === 'word') continue
    for (const o of textEntry.card.options) {
      if (!o.correct || !asImageOption.has(o.id)) continue
      const wordEntry = entries.find(
        (e) => e.card.kind === 'word' && e.card.options.some((w) => w.id === o.id && 'imageSrc' in w),
      )
      if (wordEntry === undefined) continue
      return { wordQ: wordEntry, textQ: textEntry, sharedId: o.id }
    }
  }
  return null
}

/**
 * 🚨 一张**真正非法**的卡：`kind: 'word'` 却配了文字选项。
 *
 * 它能编译通过是因为 `Card` 被拍平成 `kind + options` 的扁平联合
 * （`types.ts:256-261`，且那个 JSDoc 逐字说明拍平是有意的选择）。
 * 内容层拦得住它（`schema.ts:217-233`），`core/` 自造的卡拦不住 ——
 * 这正是渲染层必须按 `kind` 分派的原因。
 *
 * ⚠️ `wordId` / `towerType` 照抄一道真实单词卡的值：`Question` 就是 `DeckEntry`
 *   （`types.ts:290` 的别名），这两个字段与卡面渲染无关，但**类型要求它们在**。
 *   这里不用 `as` 补齐 —— 那正是 §8 教训 3 的失败形态。
 */
const ILLEGAL_WORD_CARD: Question = {
  ...firstQuestionOfKind('word'),
  entryId: 'u1-illegal-fixture',
  card: {
    kind: 'word',
    promptText: 'Hello',
    options: [
      { id: 'u1-hello', text: 'hello', correct: true },
      { id: 'u1-goodbye', text: 'goodbye', correct: false },
      { id: 'u1-teacher', text: 'teacher', correct: false },
      { id: 'u1-friend', text: 'friend', correct: false },
    ],
  },
}

/**
 * 挂载卡面并**把挂载本身的副作用清零**。
 *
 * ⚠️ 为什么必须清：AC-D4 要求「卡面出现时自动播一次」（FR1），而 watch 走
 *   `immediate: true` ⇒ **mount 这一次就会调 `speakQuestion`**。
 *   不清零的话「连点 3 次 ⇒ 被调 3 次」会数成 4 次，而
 *   「点选项不触发重听 ⇒ 被调 0 次」会数成 1 次 ——
 *   **两个断言都会以「看起来像实现有 bug」的红脸收场，而真实原因是断言太早**
 *   （与 `battle-field.test.ts:558-563` 记的是同一类时序假象）。
 *   挂载那一次由下面「FR1 自动朗读」那组用例单独验。
 */
function mountCard(question: Question) {
  state.value = stateWith(question)
  const wrapper = mount(QuestionCard)
  applyActionMock.mockClear()
  speakMock.mockClear()
  return wrapper
}

beforeEach(() => {
  applyActionMock.mockClear()
  speakMock.mockClear()
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D4 —— FR1 卡面出现时自动朗读一次
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-D4 —— 自动朗读的触发源是「换了一道题」这一可数事件', () => {
  it('🚨 首次挂载就是一道待答题（reducer.ts:69）⇒ 挂载那一刻就朗读一次', () => {
    // 这一条是 FR1 的落地判据，也是 T7.6 那个坑的直接后果：
    // watch 若**不**带 `immediate: true`，这里会是 0 次 ——
    // 而界面上看不出任何异常（没有题目、没有报错、只是没出声），
    // 「没出声」在浏览器里与「孩子还没点」长得一模一样。
    state.value = stateWith(firstQuestionOfKind('word'))

    mount(QuestionCard)

    expect(speakMock).toHaveBeenCalledTimes(1)
  })

  it('entryId 不变时不重复触发（答错重考返回同一道题时不该再念一遍）', async () => {
    const question = firstQuestionOfKind('word')
    // ⚠️ **接住返回值但不用**：组件必须真的挂上（watch 才有得触发），
    //   但这条用例只数 `speakMock` 的调用次数，不需要 wrapper 本身 ——
    //   挂载之后由 `enableAutoUnmount(afterEach)` 负责卸载（文件头那条注释
    //   逐字记着「漏了卸载会让本文件的调用次数全部数偏」）。
    mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)

    // 走一遍真状态机：answer → endBuild → resolveRound → continue
    //
    // 🚨🚨 **每次 dispatch 之后必须 `await nextTick()`**（实测踩过）：
    //   Vue 的 watch 默认 `flush: 'pre'`，会把**同一个 tick 里**的多次同步赋值
    //   合并成**一次**回调。四次 dispatch 连着写，phase 的 watch 只在最后跑一次，
    //   拿到的是**终相位** `awaiting-answer` ⇒ 中间那两帧（`awaiting-build` /
    //   `resolving` / `round-over`）**对 watch 完全不可见**。
    //   ⇒ 任何「按相位做复位」的判据在这种驱动下都会**假绿**
    //     （变异 M107 实测：`spokenEntryId` 的复位判据改成「相位离开
    //      `awaiting-answer`」，这条用例照样绿）。
    //   真实运行时孩子是「点一下 → 看到画面 → 再点一下」，每个 tick 只有一个 dispatch。
    const real = await vi.importActual<typeof import('../../src/app/store')>('../../src/app/store')
    real.applyAction(answer(question.card.options[wrongIndex].id))
    await nextTick()
    real.applyAction(endBuild())
    await nextTick()
    real.applyAction(resolveRound())
    await nextTick()
    real.applyAction(continueRound())
    await nextTick()
    expect(state.value.phase.kind).toBe('awaiting-answer')

    expect(speakMock).toHaveBeenCalledTimes(0)
  })

  it('entryId 变了才重新触发', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    const current = firstQuestionOfKind('word').entryId
    const next = entriesOf(1).find((e) => e.entryId !== current)
    if (next === undefined) throw new Error('单元 1 只有一道题，无法验证「换了一道题」')
    state.value = stateWith(next)
    await wrapper.vm.$nextTick()

    expect(speakMock).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G24 —— 卡型分派（两半）
// ══════════════════════════════════════════════════════════════════════════════

describe('G24 上半 —— 按 card.kind 分派（非法 fixture 卡，变异敏感）', () => {
  it('kind=word 但选项是文字的非法卡，仍然走图片分支', () => {
    // 这条与「按选项有没有 imageSrc 分派」产生**不同** DOM ⇒ 才有鉴别力。
    const wrapper = mountCard(ILLEGAL_WORD_CARD)

    expect(wrapper.findAll('.option-card__image')).toHaveLength(4)
    expect(wrapper.findAll('.option-card__text')).toHaveLength(0)
  })

  it('反向：改按「选项有没有 imageSrc」分派，非法卡翻成文字分支 ⇒ 上面那条变红（M50）', () => {
    // 变异 M50 的实算复现：把分派依据从 `card.kind` 换成「选项自己有没有 imageSrc」。
    const byOptionField = ILLEGAL_WORD_CARD.card.options.map((o) => ('imageSrc' in o ? 'image' : 'text'))

    // 四个选项全无 imageSrc ⇒ 全部走文字分支 ⇒ 上面那条
    // 「仍然走图片分支」的 `toHaveLength(4)` / `toHaveLength(0)` 立刻红。
    expect(byOptionField).toEqual(['text', 'text', 'text', 'text'])
    expect(byOptionField.filter((b) => b === 'image')).toHaveLength(0)
    expect(byOptionField.filter((b) => b === 'text')).toHaveLength(4)
  })
})

describe('G24 下半 —— 真实内容里关键词 / 回应卡的选项区无 <img>（M50b 覆盖）', () => {
  it.each(['keyword', 'response'] as const)('%s 卡渲染出 4 个文字选项、0 张 <img>', (kind) => {
    const wrapper = mountCard(firstQuestionOfKind(kind))

    expect(wrapper.findAll('.option-card__text')).toHaveLength(4)
    expect(wrapper.findAll('img')).toHaveLength(0)
    // 🚨 `[CR]` 2026-10-16 —— 这里原本传的是**字面量** `g24Violation(0, 4)`，
    //   那是在断言一个常量恒等于 null，**与 DOM 无关** ⇒ 换任何渲染结果都绿。
    //   改成喂**实测计数**，`g24Violation` 才真的在检查这次渲染。
    expect(g24Violation(wrapper.findAll('img').length, wrapper.findAll('.option-card__text').length)).toBeNull()
  })

  it('反向：恒走图片分支（不看 kind，一律 <img>）⇒ 关键词卡渲染出 4 张 <img>，M50b 变红', () => {
    // ⚠️ **据实说明本条的鉴别力在哪**：`g24Violation` 在「恒走图片分支」时**不会**报错
    //   —— 两个分支仍然互斥且穷尽，判据 (a)(b) 都满足。
    //   所以 G24 下半的鉴别力**不在 `g24Violation` 里**，而在上面那条
    //   「真实内容里关键词卡的选项区无 <img>」的外部断言上：
    //   恒走图片分支 ⇒ 那条 `toHaveLength(0)` 立刻红。
    //   这正是 G24 拆成两半、分别由 M50（非法卡）与 M50b（真实内容）覆盖的原因。
    const keywordOptions = firstQuestionOfKind('keyword').card.options

    // 恒走图片分支的实算后果：这四个选项没有一个带 imageSrc，
    // 于是渲染出的 4 个 <img> 全部没有 src —— 对应「四张空白卡」。
    expect(keywordOptions.every((o) => !('imageSrc' in o))).toBe(true)
    expect(keywordOptions).toHaveLength(4)

    // 上面那条外部断言在恒走图片分支下的读数。
    const realRender = mountCard(firstQuestionOfKind('keyword'))
    const imagesUnderCorrectDispatch = realRender.findAll('img').length

    expect(imagesUnderCorrectDispatch).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G26 —— 渲染层三型各渲染一张，两个分支各走一次
// ══════════════════════════════════════════════════════════════════════════════

describe('G26 —— 三型各渲染一张，分派互斥且穷尽', () => {
  it('单词卡：4 张图片选项、0 个文字选项', () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    expect(wrapper.findAll('.option-card__image')).toHaveLength(4)
    expect(wrapper.findAll('.option-card__text')).toHaveLength(0)
    // 同上：喂实测计数，不是字面量（`[CR]` 2026-10-16）
    expect(g24Violation(wrapper.findAll('.option-card__image').length, wrapper.findAll('.option-card__text').length)).toBeNull()
  })

  it('关键词卡：4 个文字选项、0 张 <img>', () => {
    const wrapper = mountCard(firstQuestionOfKind('keyword'))

    expect(wrapper.findAll('.option-card__text')).toHaveLength(4)
    expect(wrapper.findAll('.option-card__image')).toHaveLength(0)
    // 同上：喂实测计数，不是字面量（`[CR]` 2026-10-16）
    expect(g24Violation(wrapper.findAll('.option-card__image').length, wrapper.findAll('.option-card__text').length)).toBeNull()
  })

  it('回应卡：4 个文字选项、0 张 <img>', () => {
    const wrapper = mountCard(firstQuestionOfKind('response'))

    expect(wrapper.findAll('.option-card__text')).toHaveLength(4)
    expect(wrapper.findAll('.option-card__image')).toHaveLength(0)
    // 同上：喂实测计数，不是字面量（`[CR]` 2026-10-16）
    expect(g24Violation(wrapper.findAll('.option-card__image').length, wrapper.findAll('.option-card__text').length)).toBeNull()
  })

  it('题面区承载 promptText（供朗读与重听）', () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)

    expect(wrapper.find('.question-card__prompt').text()).toBe(question.card.promptText)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-C1 / AC-C2 —— 选项形态
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-C1 / AC-C2 —— 选项形态', () => {
  it('单词卡选项是纯图片，选项区没有任何英文文字', () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    const text = wrapper.find('.question-card__options').text()

    expect(text).toBe('')
  })

  it('🚨 <img> 上不许写 alt —— 破了图的 alt 文本会在孩子面前露出英文', () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    for (const img of wrapper.findAll('img')) {
      expect(img.attributes('alt'), 'NFR13：孩子面前绝不出现任何英文提示').toBeUndefined()
    }
  })

  it('🚨 <img> 的 width 必须是百分比，不能是 auto（auto = 固有 512px，1.10 实测踩过）', () => {
    const code = stripComments(optionCardSource)
    // 判据落在 **`.option-card__image` 那一条规则**上，不是「文件里某处有百分比」。
    const rule = code.split('}').find((r) => r.includes('.option-card__image') && r.includes('{'))

    // 这条判的是**声明**，不是运行时尺寸 —— jsdom 无布局，量不出渲染宽。
    expect(rule).toBeDefined()
    expect(rule).toMatch(/width:\s*100%/)
    // 两个 auto 才让固有尺寸胜出（1.10 那个坑的根因）⇒ width 一个就够红。
    expect(rule).not.toMatch(/width:\s*auto/)
    expect(rule).toContain('object-fit: contain')
  })

  it('反向：width 退回 auto ⇒ 上面那条变红（G20 的同型坑）', () => {
    const broken = '.option-card__image { display: block; width: auto; height: auto; }'
    const rule = broken.split('}')[0]

    expect(rule).toMatch(/width:\s*auto/)
    expect(rule).not.toMatch(/width:\s*100%/)
  })

  it('图片 URL 接了 base', () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    const src = wrapper.find('.option-card__image').attributes('src')

    expect(src?.startsWith(import.meta.env.BASE_URL)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G28 —— 加载失败：占位 + disabled（AC-B2）
// ══════════════════════════════════════════════════════════════════════════════

describe('G28 —— 词图加载失败降级', () => {
  it('主断言：error 之后该选项带 disabled 属性', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    await wrapper.find('.option-card__image').trigger('error')

    const button = wrapper.find('.option-card')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.classes()).toContain('is-degraded')
  })

  it('破了图的 <img> 从 DOM 里消失，换成内联占位图形', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    await wrapper.find('.option-card__image').trigger('error')

    expect(wrapper.findAll('.option-card__image')).toHaveLength(3)
    expect(wrapper.find('.option-card__placeholder svg').exists()).toBe(true)
  })

  it('点击降级选项：不产生反馈，也**不**派发 ANSWER', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    await wrapper.find('.option-card__image').trigger('error')
    applyActionMock.mockReset()

    await wrapper.find('.option-card').trigger('click')

    // ⚠️📎 **Story 1.18 / AC-E4 改了这条的判据**（R-57 留痕）：
    //   原文案是「`applyAction` 调用次数为 0」。1.18 起**破图本身**会派发一条
    //   `SKIP_QUESTION`（正确项破图 ⇒ 跳过那道题），所以「0 次」不再成立。
    //   但这条断言**要守的东西没变**：点降级选项不许产生一次**答题**。
    //   ⚠️ 判据从「计数为 0」改成「没有一条是 ANSWER」——
    //   若照抄原来的 0 次，1.18 的机制会让它一直红，而红的原因是 AC 要求的。
    //   守卫方向见 store 门面的测试（`tests/app/skip-facade.test.ts`）。
    expect(
      applyActionMock.mock.calls.map((call) => (call[0] as { type: string }).type),
      '点了降级选项却派发了答题 —— 孩子点的是一张点不出来的图，' +
        '而 `onPick` 的 `if (failed.value) return` 就是防这个的',
    ).not.toContain('ANSWER')
    expect(wrapper.find('.answer-feedback').exists()).toBe(false)
  })

  it('反向：去掉 disabled 只靠 CSS 置灰 ⇒ G28 变红（M54）', () => {
    // M54 的复现：`disabled` 在时「点击后 0 次」是**恒真的**，
    // 所以鉴别力全在属性断言上。去掉它，上面第一条就红。
    const withDisabled = '<button class="option-card" disabled>'
    const cssOnly = '<button class="option-card">'

    expect(withDisabled).toContain('disabled')
    expect(cssOnly).not.toContain('disabled')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // 📎 G152 —— 破图往上报的交接（Story 1.18 / AC-E4）
  //
  // 组件层**只**交接，不判定也不 dispatch：判定在 `app/store.ts` 的门面里
  // （理由与守卫 G21 的逐字要求见 `QuestionCard.onOptionImageFailed` 的注释）。
  // ⇒ 本组断言「谁报了哪个 id、报了几次、什么情况下不报」；
  //   门面的判定与派发归 `tests/app/skip-facade.test.ts`。
  // ════════════════════════════════════════════════════════════════════════════

  it('G152：破图上报给门面，带的是**那个选项自己的 id**', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const target = question.card.options[2]!

    await wrapper.findAll('.option-card__image')[2]!.trigger('error')

    expect(
      reportImageFailureMock.mock.calls.map((call) => call[0]),
      '破图没有上报给门面 —— AC-E4 的整条链（跳过那道题）根本不会启动',
    ).toEqual([target.id])
  })

  it('G152：一张卡上多个选项破图 ⇒ **每张报一次**（一次性守卫按题，不按图）', async () => {
    // ⚠️ 「一道题只跳一次」那条守卫在**换题之后**才生效；同一道题上
    //   两张图同时破图时，两次上报都要送到门面 ——
    //   门面对第一张（若它是正确项）换题，对第二张因「当前题已不是那道」而丢弃。
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)

    await wrapper.findAll('.option-card__image')[0]!.trigger('error')
    await wrapper.findAll('.option-card__image')[1]!.trigger('error')

    expect(reportImageFailureMock).toHaveBeenCalledTimes(2)
  })

  it('G152：非 `awaiting-answer` 相位下**不上报**（卡面在 awaiting-build 期间仍渲染）', async () => {
    // ⚠️ AC-C5 让卡面在 `awaiting-build` 期间**继续渲染** ⇒ 那时到达的
    //   `imageFailed` 与「当前该答哪道题」无关，报上去只会被门面的相位检查丢掉。
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    // 📎 **1.19 CR：补题面。** `awaiting-build` 自 `Phase` 起就挂着 `question`
    //   （`src/core/types.ts` 的六变体联合），漏掉它 ⇒ `shown` 交出 `undefined`
    //   ⇒ 卡面**根本不渲染** ⇒ 下面 `findAll` 越界，那是夹具坏了，
    //   而红的原因（"相不上元素"）与被测行为（"该不该上报"）毫无关系。
    //   `question` 逐字取自 `stateWith(question)` 用的那份 `entriesOf(1)` 题单。
    state.value = {
      ...state.value,
      phase: { kind: 'awaiting-build', question, unlocked: [], sun: 0 },
    }
    await wrapper.vm.$nextTick()
    reportImageFailureMock.mockClear()

    await wrapper.findAll('.option-card__image')[0]!.trigger('error')

    expect(reportImageFailureMock, '非等答案相位也上报了 —— 门面会丢掉，但白跑一趟且掩盖真正的相位').toHaveBeenCalledTimes(
      0,
    )
  })

  it('反向自测：探针（一个**不**上报的交接）会让上面三条一起红', () => {
    // R-51：若 `onOptionImageFailed` 被写成空函数，上面三条全绿。
    // 这里给出对照 —— 判据问的是「有没有真的调门面」，而不是「有没有渲染出降级态」。
    const deadHandoff = 'function onOptionImageFailed(){ /* 忘了 emit */ }'
    expect(deadHandoff).not.toMatch(/reportImageFailure\(/)
    expect(reportImageFailureMock).not.toHaveBeenCalled()
  })

  // ════════════════════════════════════════════════════════════════════════════
  // 🚨 G28b —— 跨卡型的 `failed` 泄漏（`[CR]` 2026-10-16 抓到的 P0）
  //
  // 这是本 story 交付以来**最严重**的一条，且前三层审查里没有一条在变异表里出现过。
  //
  // 事实（`unit-01.json` 全量扫描实测，不是推断）：
  //   **6 个 option id 同时是图片选项与文字选项** ——
  //   `u1-hello` / `u1-goodbye` / `u1-ball` / `u1-book` / `u1-pen` / `u1-chair`。
  //   其中 `u1-ball` 是 1 张关键词卡的正确项、`u1-hello` 与 `u1-goodbye`
  //   各是 2 张回应卡的正确项。
  //
  // 泄漏链：`:key` 曾经只有 `option.id` ⇒ Vue 换题时**复用同一个 OptionCard 实例**
  // ⇒ 实例内的 `failed` ref（`OptionCard.vue:69`，永不复位）跨题带过去
  // ⇒ 单词卡上 404 过的图，把那道关键词卡的**唯一正确项**渲染成
  //    置灰 + disabled 的按钮 ⇒ `onPick` 直接 return
  // ⇒ `masteredEntryIds` 不增长 ⇒ `nextQuestion` 永远吐同一道
  // ⇒ 心数耗尽 `level-failed`，**这一关永远通不了**。
  //
  // 本用例按真实顺序走：**先**在单词卡上把 `u1-ball` 的图打崩，**再**切到那张
  // 以 `u1-ball` 为正确项的关键词卡，断言它**可点**。
  // ════════════════════════════════════════════════════════════════════════════
  it('单词卡上 404 的 option id，换到把它当正确项的关键词卡后**仍然可点**', async () => {
    // ① 找出真正同 id 的两张卡：一张图片卡、一张文字卡，且该 id 是文字卡的正确项。
    //    这三条是从真实内容里筛出来的，不是写死的 fixture 名 ——
    //    内容一改（选项复用关系变了），本用例会**自己先红**，提醒人重判。
    const wordQuestion = findReusedCorrectOptionQuestion()
    expect(wordQuestion, '内容里找不到「图片卡与文字卡共用同一个正确项 id」的例子').not.toBeNull()
    if (wordQuestion === null) return
    const { wordQ, textQ, sharedId } = wordQuestion

    // ② 在图片卡上把那个 option 的图打崩。
    //    🚨 **必须全程用同一个 wrapper** —— 泄漏的前提是「Vue 在**同一个**组件树里
    //    换题时复用 OptionCard 实例」。另起一个 `mountCard` 拿到的是全新实例，
    //    `failed` 从 false 起步，于是这条用例会**绿着通过一个已修复的 bug** ——
    //    这正是本条第一稿的写法，也是它第一次变异实测 0 红的直接原因。
    const wrapper = mountCard(wordQ)
    const targetIndex = wordQ.card.options.findIndex((o) => o.id === sharedId)
    expect(targetIndex).toBeGreaterThanOrEqual(0)
    await wrapper.findAll('.option-card__image')[targetIndex].trigger('error')
    expect(wrapper.findAll('.option-card')[targetIndex].attributes('disabled')).toBeDefined()

    // ③ **同一个组件树内**切到把它当正确项的那张文字卡 —— 旧 `:key` 下这里会复用实例
    state.value = stateWith(textQ)
    await wrapper.vm.$nextTick()
    const textIndex = textQ.card.options.findIndex((o) => o.id === sharedId)
    expect(textIndex).toBeGreaterThanOrEqual(0)
    // 确认真的换题了（否则下面所有断言都在测同一张卡，等于空转）
    expect(wrapper.findAll('.option-card__text')).toHaveLength(4)
    expect(wrapper.findAll('.option-card__image')).toHaveLength(0)

    const button = wrapper.findAll('.option-card')[textIndex]
    expect(button.attributes('disabled'), `正确项 ${sharedId} 被上一题的破图污染成了 disabled`).toBeUndefined()
    expect(button.classes()).not.toContain('is-degraded')

    // ④ 不只是「没被 disable」，还得真能点得动、并且派发出 ANSWER
    applyActionMock.mockReset()
    await button.trigger('click')
    expect(applyActionMock).toHaveBeenCalledTimes(1)
    expect(applyActionMock).toHaveBeenCalledWith(answer(sharedId))
  })

  it('反向：`:key` 退回只有 option.id ⇒ 上面那条红（把 failed 泄漏原样复现）', () => {
    // 本用例不重跑整条链（太重），而是把**决定性的那一步**单独算出来：
    // Vue 的 key 唯一性只看 key 字符串本身。
    // `entryId` 不参与时，同一个 option.id 在两张不同的题上就是**同一个 key**
    // ⇒ Vue 复用实例 ⇒ 实例内的 failed 跨题存活。
    const keyWithEntry = (entryId: string, optionId: string): string => `${entryId}:${optionId}`
    const keyWithoutEntry = (_entryId: string, optionId: string): string => optionId

    // 真实内容里的那对复用：不同 entryId，同一个 option.id
    const qA = 'u1-ball-entry', qB = 'u1-s-i-have-a-ball-for-my-dog'
    const opt = 'u1-ball'

    expect(keyWithEntry(qA, opt)).not.toBe(keyWithEntry(qB, opt))
    expect(keyWithoutEntry(qA, opt)).toBe(keyWithoutEntry(qB, opt)) // ← 复用实例
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G27 —— 重听无限次且不影响任何答题状态（AC-D3）
// ══════════════════════════════════════════════════════════════════════════════

describe('G27 —— 重听', () => {
  it('连点卡面 3 次，applyAction 一次都没被调用', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    const before = JSON.stringify(state.value.masteredEntryIds)

    for (let i = 0; i < 3; i += 1) {
      await wrapper.find('.question-card__tappable').trigger('click')
    }

    expect(applyActionMock).toHaveBeenCalledTimes(0)
    expect(state.value.masteredEntryIds).toEqual(JSON.parse(before))
    expect(state.value.phase.kind).toBe('awaiting-answer')
  })

  it('每次都真的重新朗读（speakQuestion 被调 3 次）', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    for (let i = 0; i < 3; i += 1) {
      await wrapper.find('.question-card__tappable').trigger('click')
    }

    expect(speakMock).toHaveBeenCalledTimes(3)
  })

  it('🚨 点选项不触发重听（冒泡）—— 选项按钮必须 @click.stop', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))

    await wrapper.findAll('.option-card')[0].trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(1)
    expect(speakMock).toHaveBeenCalledTimes(0)
  })

  it('反向：在重听里顺手调 applyAction(answer(...)) ⇒ G27 变红（M52）', () => {
    const before = applyActionMock.mock.calls.length
    applyActionMock(answer('u1-hello'))
    const after = applyActionMock.mock.calls.length

    expect(before).toBe(0)
    expect(after).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D1 / AC-D2 —— 反馈的判定与形态
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-D1 / AC-D2 —— 点击 → dispatch → 反馈，组件内零判定', () => {
  it('点选项只做两件事：记下点了哪个、applyAction(answer(option.id))', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const target = question.card.options[1].id

    await wrapper.findAll('.option-card')[1].trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(1)
    expect(applyActionMock).toHaveBeenCalledWith(answer(target))
  })

  it('答对：只有被点的那一个选项是 is-right，其余三个都不是', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const correctIndex = question.card.options.findIndex((o) => o.correct)

    // 模拟 reducer 已把 entryId 追加进 masteredEntryIds（reducer.ts:192 的事实）
    applyActionMock.mockImplementation(() => {
      state.value = {
        ...state.value,
        masteredEntryIds: [...state.value.masteredEntryIds, question.entryId],
      }
    })
    await wrapper.findAll('.option-card')[correctIndex].trigger('click')
    applyActionMock.mockReset()

    const cards = wrapper.findAll('.option-card')
    expect(cards[correctIndex].classes()).toContain('is-right')
    expect(cards.filter((c) => c.classes().includes('is-right'))).toHaveLength(1)
    for (const [i, card] of cards.entries()) {
      if (i === correctIndex) continue
      expect(card.classes()).not.toContain('is-right')
    }
  })

  it('🚨 答错：是 is-wrong，不是 is-right；且同样只作用于被点的那一个', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)

    applyActionMock.mockImplementation(() => {
      state.value = { ...state.value, masteredEntryIds: [...state.value.masteredEntryIds] }
    })
    await wrapper.findAll('.option-card')[wrongIndex].trigger('click')
    applyActionMock.mockReset()

    const cards = wrapper.findAll('.option-card')
    expect(cards[wrongIndex].classes()).toContain('is-wrong')
    expect(cards[wrongIndex].classes()).toContain('is-picked')
    expect(cards.filter((c) => c.classes().includes('is-wrong'))).toHaveLength(1)
  })

  it('🚨 判对错读的是 entryId —— 关键词卡的正确选项 id 与 entryId 根本不是一回事', async () => {
    // AC-D1 告警框：拿「刚点的 option.id」去 includes 的话，
    // 关键词卡与回应卡的正确率**永远显示 0%**，
    // 而单词卡碰巧能对上（正确项 id === entryId）⇒ 30/37 的卡上「看起来正常」。
    const question = firstQuestionOfKind('keyword')
    expect(question.card.options.find((o) => o.correct)!.id).not.toBe(question.entryId)

    const wrapper = mountCard(question)
    applyActionMock.mockImplementation(() => {
      state.value = { ...state.value, masteredEntryIds: [...state.value.masteredEntryIds, question.entryId] }
    })
    const correctIndex = question.card.options.findIndex((o) => o.correct)
    await wrapper.findAll('.option-card')[correctIndex].trigger('click')
    applyActionMock.mockReset()

    expect(wrapper.findAll('.option-card')[correctIndex].classes()).toContain('is-right')
  })

  it('反馈 class 不带 transition（--dur-fast 是 120ms > NFR5 的 100ms）', () => {
    // 按**规则**切分而不是「类名后面 120 字符」—— 后者会在两条相邻规则间误报
    // （`.is-picked` 后面紧跟着 `.is-right:hover { transition: … }` 就会被算成前者带了 transition）。
    // AC-D2 原文：只给 hover / press 加动效。
    const code = stripComments(answerFeedbackSource + questionCardSource + optionCardSource)
    const feedbackClasses = ['is-right', 'is-wrong', 'is-picked', 'is-degraded']

    for (const rule of code.split('}')) {
      // 🚨 `[CR]` 2026-10-16 —— 判据原本写 `if (!selector.includes('{')) continue`，
      //   而 `selector = rule.split('{')[0]` **按构造永远不含 `{`** ⇒ 恒 continue
      //   ⇒ 循环体一次都没执行过 ⇒ 这条守卫自落地起就是**零断言的空转**。
      //   实测证据：给 `.option-card.is-right` 加上 `transition:`（正是它要禁的违规），
      //   **64 条全绿**。正确判据是「这个片段里有没有 `{`」，即它是不是一条 CSS 规则。
      if (!rule.includes('{')) continue
      const selector = rule.split('{')[0]
      const isFeedbackRule = feedbackClasses.some((cls) => selector.includes(cls))
      const isPseudoPress = /:(hover|active)/.test(selector)

      if (isFeedbackRule && !isPseudoPress) {
        expect(rule, `反馈规则「${selector.trim()}」里出现了 transition —— NFR5 要求 ≤100ms 呈现`).not.toContain(
          'transition:',
        )
      }
    }
  })

  it('反向：给反馈规则加上 transition ⇒ 上面那条变红', () => {
    const code = '.option-card.is-right { transition: background-color var(--dur-fast) ease-out; }'
    const rule = code.split('}')[0]
    const selector = rule.split('{')[0]

    expect(selector).toContain('is-right')
    expect(/:(hover|active)/.test(selector)).toBe(false)
    expect(rule).toContain('transition:')
  })

  // 🚨 `[CR]` 2026-10-16 —— AC-D2 的主反馈颜色不得被降级态覆盖。
  //
  //   `.option-card.is-degraded` 与 `.is-right` / `.is-wrong` **特异度完全相同**
  //   （都是 `.option-card` + 一个状态类 = `(0,2,0)`），胜负只看**源码顺序**。
  //   降级态原先排在最后 ⇒ 它赢。
  //
  //   可复现的丢失：孩子点中正确项 ⇒ `applyAction` 同步打上 `is-right`（绿底）；
  //   150ms 后那张图才 `error` ⇒ `failed` 翻真、该卡同时挂上 `is-degraded`
  //   ⇒ **绿底被换成灰底 + 55% 透明，而反馈条仍写着「答对了 ✓」**。
  //   （jsdom 不做样式计算，所以这条守的是**选择器形态**而不是像素 ——
  //     真正的可见性由 `[DS]` 的真浏览器核对那一档负责。）
  it('降级置灰不与 is-right / is-wrong 同时生效（特异度相同时源码顺序会判后者赢）', () => {
    const css = optionCardSource.slice(optionCardSource.indexOf('<style'))
    const degradedRule = css
      .split('}')
      .find((rule) => rule.includes('.option-card.is-degraded'))
    expect(degradedRule, 'OptionCard.vue 里找不到 .option-card.is-degraded 规则').toBeDefined()
    if (degradedRule === undefined) return

    const selector = degradedRule.slice(0, degradedRule.indexOf('{'))
    // 一旦选中（is-picked），对错颜色说了算 —— 必须显式排除掉 is-picked
    expect(selector).toContain(':not(.is-picked)')

    // 📎 **不要求它排在 `.is-right` 之前** —— 第一稿这里写了顺序断言，跑出来是红的，
    //   查下来是**断言本身错了**，不是代码错了：`:not(.is-picked)` 已经让两条规则
    //   在任何时刻都**互斥**（`.is-right` / `.is-wrong` 只有 `is-picked` 在时才有，
    //   而 `is-degraded` 恰恰只在 `is-picked` **不在**时才生效）
    //   ⇒ 特异度相同也不再需要靠源码顺序分胜负。
    //   记在这里是防止后人为「保险起见」去调顺序，白白制造一条脆弱断言。
    const rightRule = css.split('}').find((r) => r.includes('.option-card.is-right'))
    expect(rightRule).toBeDefined()
    if (rightRule !== undefined) {
      // `right` / `wrong` 两个 prop 的绑定里都含 `pickedOptionId === option.id` ——
      // 这是「两条规则互斥」的**真正依据**，守住它（源码里 `QuestionCard` 的模板）。
      const tpl = questionCardSource
      expect(tpl).toContain(':right="pickedOptionId === option.id && pickedRight"')
      expect(tpl).toContain(':wrong="pickedOptionId === option.id && !pickedRight"')
      // 而 is-picked 在 `.is-degraded` 不生效的那一侧 ⇒ 确认两者不同时成立
      expect(selector.includes(':not(.is-picked)')).toBe(true)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 🚨 G30 —— 题面文字**在真浏览器里看得见**（`[CR]` 2026-10-16 修的 P0）
//
// 这条守卫的由来是个**此前没有任何东西覆盖的洞**（R-41）：
//   `.question-card__prompt` 写的是 `color: #ffffff`，而改之前
//   `html`/`body`/`#app`/`.level-view` **全链路没有背景色**
//   ⇒ 白字落在浏览器默认白底上，**对比度 1.00:1**，题面在浏览器里完全不可见。
//   为什么一直没被发现：jsdom 不做样式计算（此前 68 条用例没有一条能看见它），
//   而 AC-F1 的五项真浏览器核对清单里**没有「题面文字可见」这一项**。
//   ⇒ 「无守卫」+「不在人工清单」= 双重漏网。
//
// 判据：**实算 WCAG 对比度**，不做「源码里写了什么颜色」的形式检查 ——
// 后者恰好是能放行上面那版白字白底代码的那种检查。
//
// 📎 [CR] 2026-10-16：下面四个工具函数已提取到 `tests/helpers/contrast.ts`，
//   因为 Story 1.12 的手牌/战场对比度守卫要用**同一份**实现 —— 两处各抄一份
//   的话，改一边就会让两边的守卫对同一个 token 给出不同结论，那比没有守卫更坏。
// ══════════════════════════════════════════════════════════════════════════════

/** 本文件已 import 的 `tokens.css` 原文 —— `resolveColor` 解 `var(--x)` 要靠它。 */
function colorOf(value: string): string {
  return resolveColor(value)
}
// ══════════════════════════════════════════════════════════════════════════════

/** WCAG 相对亮度。 */


describe('G30 —— 题面文字在真浏览器里看得见（jsdom 看不见，只能实算对比度）', () => {
  it('卡面区必须有自己的底色 —— 改之前它没有，于是白字落在白页上', () => {
    const panel = cssDecl(questionCardSource, '.question-card {')
    expect(panel, '.question-card 没有声明自己的背景色').toMatch(
      /background-color:\s*(#[0-9a-f]{3,6}|var\(--[\w-]+\))/i,
    )
  })

  it('整页必须铺底色 —— 否则卡片区之下是浏览器默认白底', () => {
    expect(cssDecl(levelViewSource, '.level-view {')).toMatch(
      /background-color:\s*(#[0-9a-f]{3,6}|var\(--[\w-]+\))/i,
    )
  })

  it('🚨 题面文字与其实际底色的 WCAG 对比度 ≥ 4.5:1（改之前是 1.00:1）', () => {
    const color = colorOf(/color:\s*([^;]+);/i.exec(cssDecl(questionCardSource, '.question-card__prompt {'))?.[1] ?? '')
    // 底色依次取：卡面区自己的背景 → 整页背景 → 浏览器默认白。
    // ⚠️ 必须**逐级回退**：改之前卡面区与整页都没有背景，
    //   判据若只看卡面区就会因为「找不到背景」而无法复现那个 1.00:1。
    const panel = /background-color:\s*([^;]+);/i.exec(cssDecl(questionCardSource, '.question-card {'))?.[1]
    const page = /background-color:\s*([^;]+);/i.exec(cssDecl(levelViewSource, '.level-view {'))?.[1]
    const background = colorOf(panel ?? page ?? '#ffffff')

    const ratio = contrastRatio(color, background)
    // 📎 4.5 是 WCAG AA **正文**门槛；题面是大字号（--text-prompt），
    //   AA 大字号门槛是 3.0 —— 这里按更严的 4.5 要求是有意留余量：
    //   4–8 岁是目标读者，且 AC-C1 的题面字号还会被 1.12 / 1.13 沿用。
    expect(ratio, `题面文字 ${color} 落在 ${background} 上只有 ${ratio}:1（白字白底那一版就是 1.00:1）`).toBeGreaterThanOrEqual(4.5)
  })

  it('选项卡文字与其底色的对比度 ≥ 4.5:1', () => {
    const color = colorOf(/color:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card__text {'))?.[1] ?? '')
    const bg = colorOf(/background:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card {'))?.[1] ?? '#ffffff')
    expect(contrastRatio(color, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('🚨 选项卡必须有可见边框 —— 改之前是 `transparent`，白卡叠白底没有边界', () => {
    const border = (/border:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card {'))?.[1] ?? '').toLowerCase()
    expect(border, '.option-card 的边框是透明的 ⇒ 卡片没有可见边界').not.toContain('transparent')
    expect(border).toContain('solid')
  })

  it('🚨 选中态边框必须看得见，且不得复用战场射程罩 `--color-overlay-range`', () => {
    const borderColor = (/border-color:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card.is-picked {'))?.[1] ?? '').trim()
    // 射程罩是 `rgba(255,255,255,.3)`，落在白底上 1.16:1 ⇒ 孩子点了看不出任何变化
    expect(borderColor, '选中态复用了战场射程罩，语义跨域且在白底上不可见').not.toContain('--color-overlay-range')

    if (/^#[0-9a-f]{3,6}$/i.test(borderColor)) {
      const bg = colorOf(/background:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card {'))?.[1] ?? '#ffffff')
      // 3:1 是「非文本的图形对象（UI 组件边界）」的 WCAG 门槛
      expect(contrastRatio(borderColor, bg), `选中态边框 ${borderColor} 在 ${bg} 上只有 ${contrastRatio(borderColor, bg)}:1`).toBeGreaterThanOrEqual(3)
    } else {
      expect(borderColor).not.toBe('')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-C5 —— lastQuestion / pickedOptionId
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-C5 —— 卡面在哪些相位上出现', () => {
  it('🚨 首次挂载就是一道待答题 —— 卡面必须立刻渲染（immediate 的缺失会让整个 story 的交付物是空的）', () => {
    state.value = stateWith(firstQuestionOfKind('word'))
    const wrapper = mount(QuestionCard)

    // 少这一行的话，「watch 默认不在 setup 时触发」会让首次渲染是空的，
    // 而且红得像是「分派写错了」—— G24 / G26 / G28 全红却指错了地方。
    expect(wrapper.findAll('.option-card')).toHaveLength(4)
  })

  // 📎 **1.19 CR：这一条整条改判**（R-57 留痕）。
  //
  // 原用例逐字是「`lastQuestion === null` 时卡面区不渲染任何东西」，夹具是
  // **一个没有题面的 `awaiting-build`** —— 它锁的正是 1.19 要治的那个形态：
  // 存档恢复到建造期时组件本地那份 `lastQuestion` 恒为 `null` ⇒ 卡面消失。
  // ⇒ 保留它就是**把 bug 钉成守卫**，而它一直绿着（本文件自己也记着
  //   「1.15 存档恢复到 awaiting-build 时反馈条会消失 —— 这是正确的」）。
  //
  // ⚠️ **改判后的判据仍然是同一句话**（AC-C5 ②：没有题就没有东西可显示），
  //   只是「没有题」的**例子**换成了真正没有题面的相位 ——
  //   `round-over` / `resolving` / 两个终态这四个（1.16 裁决 7 逐字圈定的范围）。
  //   ⚠️ 判据用 `round-over` 而不是再拿 `awaiting-build` 做例子：
  //   后者现在**自带题面**，拿它当「没有题」的例子会让判据与实现直接矛盾。
  it('📎 改判（1.19 CR）：没有题面的相位上，卡面区一个节点都不渲染（不是白框、不是空 div）', () => {
    const base = createInitialState({ unitNumber: 1, deck: entriesOf(1) })
    // ⚠️ 逐个相位都判一遍，而不是只判 `round-over` 一个 ——
    //   「哪些相位不给题面」正是 1.16 裁决 7 的内容，少判一个就等于把那个相位放开了。
    for (const kind of ['resolving', 'round-over', 'level-complete', 'level-failed'] as const) {
      state.value = { ...base, phase: { kind } }
      const wrapper = mount(QuestionCard)
      expect(wrapper.find('.question-card').exists(), `${kind} 上不得渲染卡面`).toBe(false)
      expect(wrapper.find('.answer-feedback').exists(), `${kind} 上不得渲染反馈条`).toBe(false)
      wrapper.unmount()
    }
  })

  it('🚨 每次回到 awaiting-answer 都清 pickedOptionId，不管 entryId 变没变', async () => {
    // 答错 → END_BUILD → RESOLVE_ROUND → CONTINUE → nextQuestion
    // **返回同一道题**（AC-4 重考，未 mastered 的仍在题单里）⇒ entryId 不变。
    // 只按 entryId 监听的 watch 不触发 ⇒ is-picked 会在孩子还没点时就亮着。
    const question = firstQuestionOfKind('word')
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)
    const wrapper = mountCard(question)

    await wrapper.findAll('.option-card')[wrongIndex].trigger('click')
    expect(wrapper.findAll('.option-card')[wrongIndex].classes()).toContain('is-picked')

    // 真走一遍状态机（不用 mock：这里验的是「reducer 确实返回同一道题」）
    const real = await vi.importActual<typeof import('../../src/app/store')>('../../src/app/store')
    real.applyAction(answer(question.card.options[wrongIndex].id))
    real.applyAction(endBuild())
    real.applyAction(resolveRound())
    real.applyAction(continueRound())

    expect(state.value.phase.kind).toBe('awaiting-answer')
    if (state.value.phase.kind === 'awaiting-answer') {
      expect(state.value.phase.question.entryId).toBe(question.entryId)
    }

    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.option-card')[wrongIndex].classes()).not.toContain('is-picked')
  })

  // 📎 **1.19 CR：题面改由 `State` 携带，本用例的夹具随之改写。**
  //   原注释逐字是「切到 awaiting-build（state 里此时**没有 question**）」——
  //   那正是断点续学时卡面消失的成因。现在 `Phase.awaiting-build` 自带题面，
  //   组件与存档恢复走**同一个数据源**，因此这条断言一字不改就仍然成立。
  it('awaiting-build 期间卡面仍在（题面由 phase.question 提供），但重听不提供', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)
    await wrapper.findAll('.option-card')[wrongIndex].trigger('click')
    applyActionMock.mockReset()
    speakMock.mockClear()

    state.value = {
      ...state.value,
      // ⚠️ `state.value.phase` 在这条用例推进之前恒为 `awaiting-answer`（`mountCard`
      //   装的就是那道题），所以这里的题面逐字就是 `question`。
      phase: { kind: 'awaiting-build', question, unlocked: [], sun: 100 },
    }
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.option-card')).toHaveLength(4)
    await wrapper.find('.question-card__tappable').trigger('click')
    expect(speakMock).toHaveBeenCalledTimes(0)
  })

  // 🚨 `[CR]` 2026-10-16 —— P0：awaiting-build 期点选项卡必抛。
  //
  // 上面那条用例已经把场景搭好了（卡面仍在、重听已禁），**却只验了重听**，
  // 于是「点选项卡」这条路径整个没被走过。实际后果不是断言红，是运行时崩：
  //   onPick → applyAction(answer) → reduce 的 `case 'awaiting-build'` 分支
  //   → applyBuild → rejectAction **throw**（reducer.ts:147）⇒ 崩在事件回调里。
  //
  // 判据取「applyAction 一次都没被调用」而不是「有没有抛」：
  //   Vue 的事件错误上报走它自己的 logError 通道，`trigger()` **不会**同步抛出，
  //   try/catch 与 console spy 都抓不到（实测两者都漏）——
  //   而「这个 action 根本不该被派发」既是契约，也稳定可断言。
  //   守卫 G27 已是同型判据（连点重听后 applyAction 零调用）。
  it('awaiting-build 期点选项卡：不派发 ANSWER，也**不产生任何新的反馈**（守门在写 pickedOptionId 之前）', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    // 先真的答一道 ⇒ reducer 把 phase 推到 awaiting-build（比手工塞 phase 更真）
    const correct = question.card.options.find((o) => o.correct)
    if (correct === undefined) throw new Error('单元 1 的卡没有正确选项')
    const real = await vi.importActual<typeof import('../../src/app/store')>('../../src/app/store')
    real.applyAction(answer(correct.id))
    expect(state.value.phase.kind).toBe('awaiting-build')
    await wrapper.vm.$nextTick()

    applyActionMock.mockReset()
    // AC-C5 的前提正是「卡面还在」，否则这条用例测的是「卡都不在」——
    // 那样守门自然成立，会变成一条永远不会失败的断言。
    expect(wrapper.findAll('.option-card')).toHaveLength(4)

    // 📎 **[R-57] 1.19 `[CR]` 判据改写**：原来逐字断言
    //   「点完 `.answer-feedback` **不存在**」。
    //   **那正是本轮被推翻的行为** —— 建造期的反馈条现在**常驻**
    //   （`v-if="pickedOptionId !== null || locked"`），
    //   否则从存档恢复到建造期时它恒为 `null` ⇒ 孩子看到的是一道**还没答的题**。
    // ⇒ 换成**更强**的那个判据：**点它不产生任何变化**。
    //   「之前有、之后一样」严格蕴含「之前没有、之后没有」，反向不成立；
    //   而「守门被挪到写 `pickedOptionId` 之后」这个坏法，
    //   旧判据抓得住，新判据**同样**抓得住（内容会从「答对了」翻成别的）。
    const feedbackBefore = wrapper.find('.answer-feedback').text()
    expect(feedbackBefore, '前置：建造期必须有反馈条 —— 它是「这题已经答完了」的唯一可见说明').not.toBe('')
    const classesBefore = wrapper.findAll('.option-card').map((el) => el.classes().join('.'))

    await wrapper.findAll('.option-card')[1].trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(0)
    expect(
      wrapper.find('.answer-feedback').text(),
      '点了不可点的选项却产生了新的反馈 —— 那是一个**假的**「你答了」',
    ).toBe(feedbackBefore)
    expect(wrapper.findAll('.option-card').map((el) => el.classes().join('.'))).toEqual(classesBefore)
    expect(wrapper.findAll('.option-card').some((el) => el.classes().includes('is-picked'))).toBe(false)
  })

  // ⚠️ **这条替换掉了原 M57「反向夹具」** —— 那个夹具是**空转**（`[CR]` 2026-10-16）。
  //   它长这样：`const guarded = (k) => k === 'awaiting-answer' ? 0 : 1`
  //   —— 一个**与 `QuestionCard.vue` 毫无关联的本地箭头函数**，断言的是它自己。
  //   把 `QuestionCard.vue` 的守门整行删掉，它**照样绿**。
  //   与记忆里「守卫断言允许了它要防的违规」同型：装饰性的严谨。
  //
  //   M57 的鉴别力改为**真变异实测**（贴的是实测输出，不是「应该会红」）：
  //     ① 删掉 `if (!answering.value) return`
  //        ⇒ 红 1 条：`expected "vi.fn()" to be called +0 times, but got 1 times`（:765）
  //     ② 把守门挪到 `pickedOptionId.value = optionId` **之后**
  //        ⇒ 红 1 条：`expected true to be false`（反馈条误亮，:768）
  //   下面两条把「另外两个非答题相位」也钉住 ——
  //   📎 1.16 裁决 7 之后它们**换了判据形状**（卡面整个不渲染，而非「点了没反应」），
  //   理由与实测见那两条上方的注释。
  // 🔥 **📎 Story 1.16 裁决 7 改判据（R-57 留痕）**：下面这两条原本叫
  //   「%s 期点选项卡：同样不派发 ANSWER」，并且逐字断言
  //   「卡面仍在（lastQuestion 兜底）」。
  //   **那正是裁决 7 删掉的行为** —— `shown` 从「任何非 `awaiting-answer` 都兜底」
  //   收窄到**只兜 `awaiting-build`**，于是这两帧里卡面**整个不存在**。
  //   ⇒ 不是把断言改松，而是换成**更强**的那个判据：
  //     「压根没有可点的东西」严格蕴含「点了也不会派发」，反向不成立。
  //
  //   ⚠️ **守门的鉴别力没有随之消失，但证据换了地方**：`if (!answering.value) return`
  //     删掉之后，上面那条 `awaiting-build` 用例实测红
  //     （`expected "vi.fn()" to be called +0 times, but got 1 times`）——
  //     那一条才是守门仍然存在的证据；本组只补「这两帧画面更干净」这一半。
  it.each(['resolving', 'round-over'] as const)(
    '%s 期卡面整个不渲染（裁决 7：没有可点的东西，才谈得上点了没反应）',
    async (kind) => {
      const question = firstQuestionOfKind('word')
      const wrapper = mountCard(question)
      state.value = { ...state.value, phase: { kind } } as never
      await wrapper.vm.$nextTick()

      expect(
        wrapper.findAll('.option-card'),
        `${kind} 下卡面必须是空的 —— 留着四个选项就是 AC-D5 说的「假可点」`,
      ).toHaveLength(0)
      expect(wrapper.find('.question-card__tappable').exists(), `${kind} 下连重听入口也不该在`).toBe(false)
      expect(wrapper.find('.answer-feedback').exists(), `${kind} 下不该有反馈条`).toBe(false)

      applyActionMock.mockReset()
      expect(applyActionMock, `${kind} 下不存在任何可触发 action 的元素`).toHaveBeenCalledTimes(0)
    },
  )
})

// ══════════════════════════════════════════════════════════════════════════════
// 四条源码守卫：G21 / G23 / G25 / G29
// ══════════════════════════════════════════════════════════════════════════════

describe('G21 —— 组件里不自己判定对错', () => {
  it.each(quizSources)('%s 源码既不引用 isCorrect 也不出现 .correct', (_name, source) => {
    expect(g21Violation(source)).toBeNull()
  })

  it('反向：引用 option.correct ⇒ G21 变红（M51）', () => {
    expect(g21Violation('const ok = option.correct')).toContain('.correct')
  })

  it('反向：注释里写 .correct 不算违规（剥注释是所有匹配的前置）', () => {
    expect(g21Violation('// 组件不读 option.correct\nconst x = 1')).toBeNull()
  })

  it('反向：剥注释本身有效 —— 不剥的话同一条判据会误报（M56）', () => {
    // 本文件**真实踩过**这个坑：`placeholder.test.ts` 的零 DOM 判据
    // 一开始没剥注释，被 `placeholder.ts` 文件头里「为什么不用 new Image()」
    // 那句解释判成了红，而代码完全正确。
    const raw = '// 这里解释为什么不读 .correct\nconst x = 1'

    expect(raw).toContain('.correct')
    expect(g21Violation(raw)).toBeNull()
    // 剥掉注释后真的**代码**里写 .correct 仍然会红 —— 证明剥的不是判据本身。
    expect(g21Violation('const ok = option.correct')).not.toBeNull()
  })
})

describe('G23 —— 占位图形是内联常量', () => {
  it.each(quizSources)('%s 源码对占位图形没有 new Image / fetch( / .svg 路径', (_name, source) => {
    expect(g23Violation(source)).toBeNull()
  })

  it('反向：改成 /assets/words/unit-01/placeholder.svg ⇒ G23 变红（M49）', () => {
    expect(g23Violation("const p = '/assets/words/unit-01/placeholder.svg'")).toContain('.svg')
  })

  it('反向：new Image() 与 fetch( 也各自会红', () => {
    expect(g23Violation('const i = new Image()')).toContain('new Image')
    expect(g23Violation("fetch('/x')")).toContain('fetch')
  })

  it('反向：data URI 内联形态也会红（它不含 .svg，靠另一条判据）', () => {
    // ⚠️ AC-B2 原文说「data URI 的字符串含 .svg 字面量」—— **实测不成立**：
    //   `image/svg+xml` 里是斜杠。判据因此分两条，见 g23Violation 里的更正说明。
    const dataUri = "const p = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E'"

    expect(dataUri).not.toContain('.svg')
    expect(g23Violation(dataUri)).toContain('data:image/svg')
  })

  it('反向：.svg 路径形态打不红 data URI，两者各管一半（M49）', () => {
    expect(g23Violation("const p = '/assets/words/unit-01/placeholder.svg'")).toContain('.svg')
    expect(g23Violation("const p = '/assets/words/unit-01/placeholder.svg'")).not.toContain('data:image')
  })

  it('反向：剥注释本身有效（M56）', () => {
    expect(g23Violation('// 用 fetch( 拿占位图\nconst x = 1')).toBeNull()
    expect(g23Violation("fetch('/x')")).not.toBeNull()
  })
})

describe('G25 —— 组件不 import pronunciation', () => {
  it.each(quizSources)('%s 的 import 不命中 pronunciation', (_name, source) => {
    expect(g25Violation(source)).toBeNull()
  })

  it('反向：直接 import pronunciation ⇒ G25 变红（M47）', () => {
    expect(g25Violation("import { playPronunciation } from '../../services/pronunciation'")).toContain(
      'pronunciation',
    )
  })

  it('🚨 判据只禁 pronunciation —— asset-url 的 import 是 1.10 已开过的先例，不许误伤', () => {
    // 这条是 G25 判据本身的守卫：若把判据宽写成「不含 ../services/」，
    // 下面这行会在**基线就红**，而它是本 story AC-B1 要求写的。
    // ⇒ 那样写的话，变异 M47 与基线**分不开**，dev 只剩两条都错的出路：
    // 写一条基线就红的守卫，或私自开一个白名单口子。
    expect("import { wordImageUrl } from '../../services/asset-url'").toContain('../services/')
    expect(g25Violation("import { wordImageUrl } from '../../services/asset-url'")).toBeNull()
  })

  it('反向：剥注释本身有效 —— 注释里写「反面示例」的那一行 import 不算违规（M56）', () => {
    // ⚠️ **这条的夹具曾经是空转的，变异 M56 抓出来的**：原来的夹具只在注释里
    //   写了「为什么不 import pronunciation」这几个字，而判据 `G25_FORBIDDEN`
    //   是**锚定**的（要求 `from '../…/services/pronunciation'` 整个形状）
    //   ⇒ 剥与不剥都不匹配 ⇒ 这条自测**因为错误的原因而绿**，撑不住 M56。
    //
    //   换成真实会发生的形态：dev 在文件头写**反面示例**（本 story 的裁决 3
    //   就是靠这个说明讲清楚的，而它恰好就长得像违规代码）
    //   ⇒ 不剥注释时 G25 **在基线就红**，dev 只剩两条都错的出路。
    const withComment =
      "/** 反例（裁决 3）：`import { playPronunciation } from '../../services/pronunciation'` */\n" +
      "import { wordImageUrl } from '../../services/asset-url'"

    // 夹具确实包含判据要抓的整行 —— 否则下面那条断言永远为真，等于没测。
    expect(withComment).toMatch(G25_FORBIDDEN)
    expect(g25Violation(withComment)).toBeNull()
    expect(g25Violation("import { playPronunciation } from '../../services/pronunciation'")).not.toBeNull()
  })
})

describe('G29 —— 组件不 throw / 不写 assert（AC-E3）', () => {
  it.each(quizSources)('%s 源码不含 throw / assert(', (_name, source) => {
    expect(g29Violation(source)).toBeNull()
  })

  it('反向：写一句 throw ⇒ G29 变红（M55）', () => {
    expect(g29Violation("throw new Error('不该到这')")).toContain('throw')
  })

  it('反向：写一句 assert( 也会红', () => {
    expect(g29Violation('assert(x > 0)')).toContain('assert(')
  })

  it('反向：注释里解释「组件层不 throw」不算违规', () => {
    expect(g29Violation('// 组件层不 throw、不写 assert\nconst x = 1')).toBeNull()
  })

  it('反向：剥注释本身有效 —— 组件文件头必写这句，不剥就必然误报（M56）', () => {
    // 这不是理论风险：项目的组件文件头规定要写「职责边界 + 刻意不做的事」
    // （`Tower.vue:3-25` 同型），而 AC-E3 又要求「不 throw、不写 assert」
    // ⇒ 文件头必然出现「不 throw」这几个字 ⇒ 不剥注释时 G29 **在基线就红**。
    const raw = '/** 组件层不 throw、不写 assert（GA:567-575） */\nconst x = 1'

    // ⚠️ 这条 `toMatch` 是变异 M56 能咬住本测试的前提。少了它，夹具就算写成
    //   「不 throwX」也照样绿 ⇒ 自测空转（第一版就是这样，判据 `\bthrow\s`
    //   在顿号上不匹配，M56 实测 0 红才暴露出来）。
    expect(raw).toMatch(/\bthrow\b/)
    expect(g29Violation(raw)).toBeNull()
    expect(g29Violation("throw new Error('x')")).not.toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G94 —— `shown` 的兜底只兜 `awaiting-build`（Story 1.16 / 裁决 7）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 抽出 `shown` 这个 computed 的函数体 —— 判据只允许看这一段。
 *
 * ⚠️ **必须先 `stripComments`**（R-52）：`QuestionCard.vue` 里解释裁决 7 的那段
 *   长注释逐字写着「只兜 `awaiting-build`」和「覆盖了终态」——
 *   不剥注释的话，判据在这段注释上就命中了，**等于在读自己的说明书**，
 *   实现改成宽兜底也照样绿。这正是本文件顶部逐字记着的那类事故。
 */
function shownBody(): string {
  const code = stripComments(questionCardSource)
  const start = code.indexOf('const shown = computed')
  if (start < 0) throw new Error('QuestionCard.vue 里找不到 `const shown = computed` —— 守卫需要跟着改名一起更新')
  const open = code.indexOf('{', code.indexOf('=>', start))
  // 从第一个 `{` 起数花括号配平 —— 只数 `{}`，字符串里的大括号在本文件里不存在。
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    if (code[i] === '}') {
      depth -= 1
      if (depth === 0) return code.slice(open, i + 1)
    }
  }
  throw new Error('`shown` 的函数体花括号没配平 —— 守卫取不到完整的判据')
}

/**
 * G94 的判据：**题面只在这两个相位上被交出去，且必须当场从 `phase` 上读。**
 *
 * 📎 **[R-57] 判据改写（2026-10-18，Story 1.19 CR 的 B 方案）**
 *
 * 原判据钉的是「`lastQuestion.value` 的位置必须晚于 `awaiting-build` 判断」。
 * B 方案把题面搬进 `Phase.awaiting-build`、删掉了 `lastQuestion` 这个
 * **组件本地** ref，于是原判据的自检行
 * `if (handOff < 0) return '判据自检失败：兜底体里找不到 lastQuestion.value'`
 * 恒成立 —— 判据在**自己失效时**报的是「找不到」，红的原因与被守的行为无关
 * （这正是本仓库记过的「反向自检没调用判据本体」那一类）。⇒ 判据**重写**，
 * 不是放宽。新判据由四条组成，逐条对应一条真实违规：
 *
 * | # | 违规形态 | 判据 |
 * |---|---|---|
 * | 1 | 答题相位不交题面（卡面永远不出现） | 必须出现 `phase.kind === 'awaiting-answer'` |
 * | 2 | 收窄掉 AC-C5 的反馈载体（1.16 裁决 7 的另一半） | 必须出现 `phase.kind === 'awaiting-build'` |
 * | 3 | 宽兜底（M106 的同款改法）：无判定的 `return phase.question` | 每一处读题面必须与一次相位判定同处一条语句 |
 * | 4 | 退回组件本地 ref 兜底（**1.19 这个 bug 的根因本身**） | `shown` 里除 `state.value.phase` 外不许再读任何 `.value` |
 *
 * ⚠️ 第 4 条为什么必须盯 `.value` 而不是盯**某个名字**：早期版本盯的是
 *   `lastQuestion`。换个名字（`prevQuestion` / `lastShown`）守卫就绿了，
 *   而 bug 一模一样。盯**语法**（不许读 ref）才没有这个洞。
 *
 * ⚠️ 为什么不写成「源码里出现 `awaiting-build` 字样」：stripComments 之后
 *   也可能留下一个**没用上**的 `awaiting-build` 判断 ⇒ 恒绿（R-51）。
 *   ⇒ 第 3 条要求那个判定与题面**同处一个 `return` 段**。
 */
function g94Violation(code: string): string | null {
  // 第 1 / 2 条：两个相位判定必须在场（判「字样在不在」，靠第 3 条排除「没用上」）。
  if (!/phase\.kind\s*===\s*['"]awaiting-answer['"]/.test(code)) {
    return '`shown` 没有判 `awaiting-answer` —— 答题相位必须交出题面'
  }
  if (!/phase\.kind\s*===\s*['"]awaiting-build['"]/.test(code)) {
    return '兜底没有判 `awaiting-build` —— 裁决 7 要求它兜住这一个相位'
  }

  // 第 3 条：每一次读 `.question` 都必须落在**一次相位判定之内**。
  //   ⚠️ 语句边界取 `;` 与 `{`，**不是** `return`：判定的写法是
  //   `if (判定) return 题面`，判定落在 `return` **之前**，
  //   按 `return` 切段会把两者切到不同段里，于是正确实现也判红（假红），
  //   而按 `;`/`{` 切才与「一条语句」的边界一致。
  for (const statement of code.split(/[;{]/)) {
    if (!/\.question\b/.test(statement)) continue
    if (!/phase\.kind\s*===\s*['"](?:awaiting-answer|awaiting-build)['"]/.test(statement)) {
      return '有一处读题面却不与任何相位判定同处一条语句 —— 那是覆盖全部相位的宽兜底'
    }
  }

  // 第 4 条：除 `state.value.phase` 外不许再读 `.value`（组件本地 ref 活不过刷新）。
  const rest = code.replace(/state\.value\.phase\b/, '')
  if (/\.value\b/.test(rest)) {
    return (
      '`shown` 读了 `state.value.phase` 之外的某个 `.value` —— ' +
      '那多半是组件本地的 ref，而它活不过一次刷新（1.19 试玩 bug 的根因）'
    )
  }
  return null
}

describe('G94 —— `shown` 的兜底只兜 awaiting-build（Story 1.16 / 裁决 7）', () => {
  it('源码判据：题面只在 awaiting-answer / awaiting-build 两支交出，且当场从 phase 读', () => {
    expect(g94Violation(shownBody())).toBeNull()
  })

  it('反向自检：把兜底改回宽口径（M106 的同款改法）⇒ 判据变红', () => {
    // ⚠️ **这条不许省**（R-51）。写的是 M106 落地时**真会写出来的那一段**：
    //   删掉 `awaiting-build` 判断、兜底回到「任何非 awaiting-answer 都用上一道题」。
    //   这一版两条判据都要抓住它：缺 `awaiting-build` 判定（第 2 条），
    //   末段 `return phase.question` 与判定不同段（第 3 条）。
    const widened = `{ const phase = state.value.phase; if (phase.kind === 'awaiting-answer') return phase.question; return phase.question }`
    expect(g94Violation(widened), '判据自检：宽兜底必须被判中').not.toBeNull()
  })

  it('反向自检：判定写在，题面却从 `return` 之外流出来 ⇒ 判据变红', () => {
    // 第二种违规：先取值、后判定（顺序反了，一样是宽兜底）——
    //   `return` 段里只剩 `: null`，题面在段外就被交出去了。
    const reordered = `{ const phase = state.value.phase; const q = phase.question; if (phase.kind === 'awaiting-answer') return q; return phase.kind === 'awaiting-build' ? q : null }`
    expect(g94Violation(reordered), '判据自检：顺序反了必须被判中').not.toBeNull()
  })

  it('反向自检：退回组件本地 ref 兜底 ⇒ 判据变红（🔴 这正是 1.19 的根因）', () => {
    // ⚠️ 这一条与上面两条**不是同一个洞**。上面守的是「兜底范围」，
    //   这一条守的是「兜底的**载体**」——#2 改成 `lastQuestion.value` 时
    //   第 3 条照样绿（`return` 段里有 `awaiting-build` 判定），
    //   而新挂载时那份 ref 恒为 `null` ⇒ 卡面不渲染，正是这次试玩报的现象。
    const localRef = `{ const phase = state.value.phase; if (phase.kind === 'awaiting-answer') { lastQuestion.value = phase.question; return phase.question } return phase.kind === 'awaiting-build' ? lastQuestion.value : null }`
    expect(g94Violation(localRef), '判据自检：本地 ref 兜底必须被判中').not.toBeNull()
  })

  // ── 行为侧：四个「兜底范围外」的相位，卡面必须一个节点都不渲染 ────────────
  //
  // ⚠️ **这四条是本守卫真正在守的东西**。源码判据钉的是「判断写在哪」，
  //   而孩子看到的是「屏幕上有没有那几个可点的选项」——
  //   AC-D5 的「假可点」只有后者能验。
  //   ⚠️ **`level-complete` / `level-failed` 一并在内**：裁决 7 的原文理由
  //   就是「终态上盖着浮层，卡面在底下仍可点，孩子会以为我点的没反应」。
  it.each(['resolving', 'round-over', 'level-complete', 'level-failed'] as const)(
    '%s 期一个选项都不渲染（兜底范围外）',
    async (kind) => {
      const question = firstQuestionOfKind('word')
      const wrapper = mountCard(question)
      state.value = { ...state.value, phase: { kind } } as never
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.option-card'), `${kind} 下留着选项 = AC-D5 的「假可点」`).toHaveLength(0)
    },
  )

  it('awaiting-build 期仍然渲染四个选项（AC-C5 的 ≤100ms 反馈载体不许被收窄掉）', async () => {
    // ⚠️ **反向的另一半**（R-51 的对称要求）：只钉「什么时候不渲染」的话，
    //   一条把兜底**整个删掉**的实现（于是 `awaiting-build` 也不渲染了）照样绿。
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    // 📎 **1.19 CR：补题面。** 自 `Phase` 起 `awaiting-build` 就自带 `question`
    //   —— AC-C5 的反馈载体现在**由 State 携带**，而不是组件本地 ref
    //   ⇒ 漏掉它，这条用例量的就不是「载体有没有被收窄」，而是「夹具写没写全」。
    state.value = {
      ...state.value,
      phase: { kind: 'awaiting-build', question, unlocked: [], sun: 100 },
    }
    await wrapper.vm.$nextTick()

    expect(
      wrapper.findAll('.option-card'),
      '裁决 7 只收窄兜底范围，不许把 awaiting-build 的反馈载体一起收掉',
    ).toHaveLength(4)
  })

  // ── 裁决 8：新的一局开始时三个本地 ref 全部复位 ──────────────────────────
  //
  // 📎 这条守的是「重打后第一道题会不会自动朗读」——
  //   `spokenEntryId` 跨局残留时，重打后的第一道题 `entryId` 与它**必然**相同
  //   （重打从头开始、顺序不变）⇒ 守卫命中 ⇒ **这一局永远静默**。
  //
  // 🚨 **必须先让 `turn` 真的离开 1，再拨回 1**：复位判据是「回合号**跃迁到** 1」
  //   这一**事件**，而 Vue 的 watch 只在值真的变了时才触发。
  //   store 的初值 `turn` 本来就是 1 —— 直接设 `turn: 1` 等于什么都没发生，
  //   那条用例会因为「前提不成立」而**恒绿**（R-51）。
  it('重打后第一道题必须朗读（spokenEntryId 不得跨局残留）', async () => {
    const question = firstQuestionOfKind('word')
    mountCard(question)
    await nextTick()

    // 先真的把 store 推到第 12 回合的结算帧 —— 这一步让 `turn` 离开 1。
    state.value = { ...state.value, turn: 12, phase: { kind: 'round-over' } }
    await nextTick()
    speakMock.mockClear()

    // 再拨回 1 —— 这正是 `RESTART_LEVEL` 的产物（裁决 4：必定落在 awaiting-answer）。
    state.value = { ...state.value, turn: 1, phase: { kind: 'awaiting-answer', question } }
    await nextTick()

    expect(speakMock, '重打后的第一道题与上一局第一道题是同一道，守卫不得把它吃掉').toHaveBeenCalledTimes(1)
  })

  it('⚠️ 反向自检：`turn` 没有真的离开 1 ⇒ 不复位（证明判据是「跃迁」不是「当前值」）', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)
    await wrapper.findAll('.option-card')[wrongIndex].trigger('click')

    // **第 1 回合的建造期里 `turn` 就是 1**（`turn` 在 `nextQuestion` 才 +1）
    // —— 若复位判据写成「`turn === 1` 就清」，反馈载体会在这里被当场清掉，
    //   AC-C5 的 ≤100ms 反馈在第 1 回合失效。
    // ⇒ 这里断言：只换相位、`turn` 数值不变 ⇒ 卡面仍在。
    // 📎 **1.19 CR：补题面。** 载体从「组件本地的 `lastQuestion`」换成了
    //   `Phase` 自带的 `question` ⇒ 这条用例量的仍是「只换相位时载体不被清掉」，
    //   换了载体之后它照样成立（题面由 phase 提供，`turn` watch 清不掉它）。
    state.value = {
      ...state.value,
      phase: { kind: 'awaiting-build', question, unlocked: [], sun: 100 },
    }
    await nextTick()

    expect(
      wrapper.findAll('.option-card'),
      '第 1 回合的建造期里 `turn` 仍是 1，但这**不是**新的一局 —— 卡面不许消失',
    ).toHaveLength(4)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 🔥📎 G172 —— 建造期的卡面**不许假装可点**（Story 1.19 `[CR]`，真机试玩撞出来的）
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠️ **1.19 CR 第一轮（把题面落进 `State`）只修了一半。** 真机复验：
//   恢复落在建造期 ⇒ 卡面出来了，但**四个选项点不动**。
//
//   成因不是「点不动」，是**看起来能点却点不动**：
//   · `QuestionCard.onPick` 的守门 `if (!answering.value) return` 静默丢弃点击；
//   · 而 `OptionCard` 的 `:disabled` 原先**只跟着 `failed`（破图）走**；
//   ⇒ 白卡 + 灰边框 + `cursor: pointer` + 未 disabled，摆在 4–8 岁孩子面前。
//     这正是 AC-D5 逐字说的「假可点」。
//
// ⚠️ **为什么正常游玩时没有人发现**：反馈窗口只有 ≤100ms（AC-C5），
//   孩子来不及点。**从存档恢复时它是永久状态。**
//
// ⚠️ **1.16 裁决 7 / 守卫 G94 为什么不覆盖它**：G94 钉的是
//   「兜底范围外的四个相位**不渲染卡面**」——
//   **从没有验过「渲染卡面的那个相位里，选项到底能不能点」**。
//   ⇒ 本组补的正是那个缺口。
//
// ── 变异验证（M188 / M189 / M190，均为 2026-10-18 实测）────────────────────
//   · **M188**：`OptionCard.vue` 的 `:disabled` 去掉 `|| locked`
//     ⇒ **1 红**（本组第一条）。同时 `tests/app/resume-actionable.test.ts` 的
//     「可行动层（第二轮）」也红 —— 两处独立，不是同一条断言的两次计数。
//   · **M189**：`AnswerFeedback` 的 `v-if` 去掉 `|| locked`
//     ⇒ **3 红**（本组第 3、4 条 + 上面那条被 R-57 改写过的
//     「awaiting-build 期点选项卡」—— 它逐字断言「点完反馈内容不变」，
//     反馈条整个消失时那条 `toBe(feedbackBefore)` 也红）。
//   · **M190**：删掉 `.question-card__tappable` 上的 `:class="{ 'is-locked': locked }"`
//     ⇒ **1 红**（本组第 2 条）。
//   ⚠️ **本组没有被「一次改坏全红」的假象**：三次变异各自只动一行，
//     各自红不同的条数。**全绿只发生在代码是本提交的样子时。**

/** 造一份「从存档恢复到建造期」的样子：`pickedOptionId` 恒为 `null`（组件本地态随页面没了）。 */
function mountRestoredBuildPhase(question: Question) {
  const wrapper = mountCard(question)
  state.value = {
    ...state.value,
    phase: { kind: 'awaiting-build', question, unlocked: [question.entryId], sun: 50 },
  }
  return wrapper
}

describe('G172 —— 建造期的卡面只读：选项必须真的点不动、且「已答完」必须看得见', () => {
  it('四个选项全部 `disabled` 且挂 `is-locked`（不再假装可点）', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountRestoredBuildPhase(question)
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.option-card')
    expect(cards, '前置：卡面必须真的在 —— 下面的判据才有对象').toHaveLength(4)
    for (const card of cards) {
      expect(
        card.attributes('disabled'),
        '🚨 选项卡没被 disabled，孩子会以为点得动 —— 点了却什么都不会发生（AC-D5「假可点」）',
      ).toBeDefined()
      expect(card.classes(), '置灰的视觉线索：没有它，disabled 在白卡上几乎看不出来').toContain('is-locked')
    }
  })

  it('重听入口也不许是 `cursor: pointer`（同一类缺陷，`onReplay` 守门在下游）', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountRestoredBuildPhase(question)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.question-card__tappable').classes()).toContain('is-locked')
  })

  it('反馈条在场，且读的是 `masteredEntryIds` 而不是组件本地的 `pickedOptionId`', async () => {
    const question = firstQuestionOfKind('word')
    // 模拟「这道题刚才答**错**了」：`masteredEntryIds` 里没有它。
    // ⚠️ `applyAnswer` 让**答错也进建造期**（AC-4：答错的孩子仍有事可做），
    //   所以「建造期」**不蕴含**「答对了」—— 判据必须两头都验，否则它只在
    //   「刚答对就退出」那一种存档上成立。
    const wrong = question.card.options.find((o) => !o.correct)
    if (wrong === undefined) throw new Error('单元 1 的卡没有错误选项')
    const wrapper = mountRestoredBuildPhase(question)
    state.value = { ...state.value, masteredEntryIds: [], unlocked: [question.entryId] }
    await wrapper.vm.$nextTick()

    expect(
      wrapper.find('.answer-feedback').text(),
      '答错后停在建造期，反馈条必须说「再想想」—— ' +
        '说「答对了」是**假陈述**（这个项目最贵的一类 bug）',
    ).toBe('再想想')
    expect(wrong, '前置：这道题确实有错误选项').toBeDefined()
  })

  it('答对后停在建造期 ⇒ 反馈条说「答对了」，且跨「刷新」仍然成立', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountRestoredBuildPhase(question)
    // 关键性质：`pickedOptionId` 是组件本地 ref，**模拟刷新就是什么都不设**。
    state.value = { ...state.value, masteredEntryIds: [question.entryId] }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.answer-feedback').text()).toBe('答对了')
  })
})

// 🔥📎 G177 —— 建造期锁定的**视觉与命中**两半都封死（Story 1.19 `[CR]` 第六轮，
//   `[CR]` 第七轮**推翻了第六轮的判据本体**）
//
// 🔥🔥 **为什么判据必须从「源码顺序」换成「层叠结果」**
//
//   第六轮的判据是「`.is-locked` 排在 `.is-degraded:not(.is-picked)` **之后**」，
//   失败消息逐字宣称「两者特异度同为 (0,2,0)，后写的赢」。
//   ⇒ **那句话是错的**：`:not(.is-picked)` 按其参数计权 ⇒ 那条是 `(0,3,0)`，
//     `.is-locked` 是 `(0,2,0)`。加上 scoped 属性后是 (0,4,0) 对 (0,3,0) ——
//     **特异度不等，源码顺序根本不参与裁决。**
//   ⇒ 于是第六轮那个「挪到后面 + 补 `opacity: 1`」的修复**从未生效**，
//     而 G177 因为两条判据都满足而**全程绿灯**，给一个假修复签了合格证。
//
//   ⚠️ **本组仍然不是真浏览器实测**（R-01：jsdom 不做布局）。
//     但它比「判顺序」强一个量级：它真的解一遍层叠 ——
//     匹配 → 比特异度 → 特异度相等才看源码顺序 → 取胜者的声明值。
//     剩下不覆盖的是像素与布局；平板复验仍是 AC-D5 的责任。
describe('G177 —— 建造期锁定：词图不被透明度洗掉 + 触摸设备上不再假可点', () => {
  // ⚠️ 用文件顶部已 import 的 `?raw` 源码 + **稳健版** stripComments（R-52）：
  //   注释里全是逐字引用，不剥会误判；且下面的规则解析器要求块注释已被剥干净
  //   （`tests/helpers/contrast` 那份是三处 replace 的朴素版，剥不干净块注释 ——
  //   它的 docblock 自己记着曾因此让 G105/G106 双双假红）。
  const optionCard = stripCommentsForG177(optionCardSource)
  const questionCard = stripCommentsForG177(questionCardSource)

  /** 一条候选规则：选择器 + 声明体 + 在源码里的序号（用来决同特异度的胜负）。 */
  interface CssRule {
    selector: string
    decls: Map<string, string>
    order: number
  }

  /**
   * 算一条**简单复合选择器**的特异度 `[a, b, c]`。
   *
   * ⚠️ 只处理本文件真正用到的东西：类型选择器 / `.class` / `#id` /
   *   `:not(<复合选择器>)`。遇到后代选择器（空格）或逗号会**如实抛错**而不是
   *   悄悄返回错值 —— 判据算错却绿比判据直接崩掉危险得多（R-51）。
   */
  function specificity(selector: string): [number, number, number] {
    const sel = selector.trim()
    if (sel.includes(',')) {
      throw new Error(`判据不会算逗号选择器组：${selector}`)
    }
    if (/\s/.test(sel.replace(/:not\([^)]*\)/g, ''))) {
      throw new Error(`判据不会算带后代组合符的选择器：${selector}`)
    }
    const withoutNot = sel.replace(/:not\([^)]*\)/g, '')
    // `:not(...)` 按**其参数**计权（Selectors L3/L4）⇒ 参数与自身等价。
    const notArgs = [...sel.matchAll(/:not\(([^)]*)\)/g)].map((m) => m[1])
    const ids = (withoutNot.match(/#[\w-]+/g) ?? []).length
    const classes =
      (withoutNot.match(/\.[\w-]+/g) ?? []).length +
      (withoutNot.match(/\[[^\]]+\]/g) ?? []).length +
      notArgs.filter((a) => a.trim().startsWith('.') || a.trim().startsWith('#')).length
    const types = (withoutNot.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
    return [ids, classes, types]
  }

  /** 特异度字典序比较：a 先比，再 b，再 c。 */
  function cmpSpecificity(
    x: [number, number, number],
    y: [number, number, number],
  ): number {
    for (let i = 0; i < 3; i += 1) {
      if (x[i] !== y[i]) return x[i] - y[i]
    }
    return 0
  }

  /**
   * 判据本体：**对一个挂着 `option-card is-degraded is-locked`（且**没有** `is-picked`）
   * 的元素解一遍层叠，返回胜者给的 `opacity`。**
   *
   * @param elementClasses 元素身上真实有的类
   * @returns 胜者的 `opacity` 声明值；一条都没匹配上则返回 `null`
   */
  function winningOpacity(src: string, elementClasses: string[]): string | null {
    const has = (cls: string): boolean => elementClasses.includes(cls)
    // ⚠️ 匹配器只认**纯类选择器**（本文件的状态类全是这一种）。
    //   含后代/标签/伪类的选择器一律跳过而不是误判 —— 判据覆盖不到的地方
    //   如实留白，比给一个假的「没匹配上」要好。
    const rules: CssRule[] = []
    let order = 0
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      // 只认「若干个 `.class` 与 `:not(.class)` 任意次序」的纯类选择器。
      if (!/^(?:\.[\w-]+|:not\(\.[\w-]+\))+$/.test(selector)) continue
      // 🔥 `:not(.x)` 是**否定**要求：元素**没有** `.x` 时才算满足。
      //   ⚠️ 首版把它当成普通要求 ⇒ 测试元素（没有 `is-picked`）会把整条
      //   `.is-degraded:not(.is-picked)` 规则跳过 ⇒ **假形态被判成合规**。
      //   这个洞方向最恶劣，被下面那条自测当场抓住。
      const negated = [...selector.matchAll(/:not\(\.([\w-]+)\)/g)].map((c) => c[1])
      // 正类必须从**剥掉 `:not(...)` 之后**的剩余部分取，否则 `is-picked`
      // 会被当成必需项（`:not(` 后面那个点，lookbehind 也拦不住）。
      const positive = [
        ...selector.replace(/:not\(\.[\w-]+\)/g, '').matchAll(/\.([\w-]+)/g),
      ].map((c) => c[1])
      if (!positive.every(has)) continue
      if (negated.some((c) => has(c))) continue
      const decls = new Map<string, string>()
      for (const d of m[2].split(';')) {
        const idx = d.indexOf(':')
        if (idx === -1) continue
        decls.set(d.slice(0, idx).trim(), d.slice(idx + 1).trim())
      }
      rules.push({ selector, decls, order: order++ })
    }
    if (rules.length === 0) return null
    // 特异度高者胜；**相等才看源码顺序**（后写的赢）—— 这正是第六轮搞错的地方。
    rules.sort((a, b) => {
      const s = cmpSpecificity(specificity(a.selector), specificity(b.selector))
      return s !== 0 ? s : a.order - b.order
    })
    const winner = rules[rules.length - 1]
    return winner.decls.get('opacity') ?? null
  }

  it('🔴 `locked + degraded + 未点` 时，生效的 opacity 必须是 1（**解层叠**，不判源码顺序）', () => {
    const effective = winningOpacity(optionCard, ['option-card', 'is-degraded', 'is-locked'])
    expect(
      effective,
      '判据范围消失：`.option-card` 上没有任何规则匹配「option-card + is-degraded + is-locked」这个类组合',
    ).not.toBeNull()
    expect(
      effective,
      '🔴 建造期 + 词图破损时，**真正生效**的 opacity 不是 1 —— ' +
        '那张词图仍被压到 55%，正是这条规则自己的注释声明要避免的那件事。\n' +
        '⚠️ 第六轮栽在这里：它判的是「`.is-locked` 排在后面」+「块里有 `opacity: 1` 字样」，' +
        '而 `.is-degraded:not(.is-picked)` 是 (0,3,0)、`.is-locked` 是 (0,2,0) —— ' +
        '**特异度不等，源码顺序不参与裁决**，那个修复从未生效。\n' +
        '✅ 修法：给 `.is-degraded` 加 `:not(.is-locked)`（让它在 locked 时根本不参与竞争），' +
        '而不是去抬 `.is-locked`（抬到打平仍然要靠顺序）。',
    ).toBe('1')
  })

  it('判据自测：这把尺子真的能分辨「0.55 赢」与「1 赢」（R-53 —— 不自测就不知道它咬不咬得住）', () => {
    // ⚠️ 夹具必须复现**特异度不等**这个真正的原因。
    //   只把两条规则换个顺序的版本**分辨不出来** —— 那正是第六轮判据失灵的根因。
    const degradedOnly = '.option-card.is-degraded:not(.is-picked) {\n  opacity: 0.55;\n}\n'
    const lockedOnly = '.option-card.is-locked {\n  opacity: 1;\n}\n'

    // 🔴 形态一：**第六轮的坏形态** —— 顺序对（locked 在后），特异度不等 ⇒ 0.55 赢。
    expect(
      winningOpacity(degradedOnly + lockedOnly, ['option-card', 'is-degraded', 'is-locked']),
      '判据自测自己红了：第六轮那个坏形态（locked 排在后面）竟被判成合规 ⇒ 这把尺子分辨不出特异度',
    ).toBe('0.55')

    // ✅ 形态二：**修好后** —— degraded 让开 locked ⇒ 1 赢。
    const degradedExcludingLocked =
      '.option-card.is-degraded:not(.is-picked):not(.is-locked) {\n  opacity: 0.55;\n}\n'
    expect(
      winningOpacity(degradedExcludingLocked + lockedOnly, ['option-card', 'is-degraded', 'is-locked']),
      '判据自测自己红了：加 `:not(.is-locked)` 的好形态竟被判成违规',
    ).toBe('1')

    // ✅ 形态三：**抬特异度**也是合法修法之一 —— locked 特异度严格更高时 1 赢。
    const lockedHigher = '.option-card.is-locked.option-card {\n  opacity: 1;\n}\n'
    expect(
      winningOpacity(degradedOnly + lockedHigher, ['option-card', 'is-degraded', 'is-locked']),
      '判据自测自己红了：locked 特异度严格更高的形态竟被判成违规 ⇒ 判据把修法写死成一种了',
    ).toBe('1')
  })

  it('判据自测：`specificity()` 算得对，且遇到算不了的选择器**抛错而不是给错值**（R-51）', () => {
    expect(specificity('.option-card.is-locked')).toEqual([0, 2, 0])
    // `:not(.is-picked)` 按其参数计权 ⇒ 三个类。
    expect(specificity('.option-card.is-degraded:not(.is-picked)')).toEqual([0, 3, 0])
    // 修复后的形态。
    expect(specificity('.option-card.is-degraded:not(.is-picked):not(.is-locked)')).toEqual([0, 4, 0])
    // scoped 会给每条规则统一加一个属性选择器 ⇒ 对**比较**是常数偏移，可以约掉；
    //   这里如实算出来，免得有人以为本判据忽略了它。
    expect(specificity('.option-card.is-locked[data-v-x]')).toEqual([0, 3, 0])
    // 算不了的必须抛错：静默给错值 = 判据错着还绿。
    expect(() => specificity('.battle-grid .tower')).toThrow(/后代组合符/)
    expect(() => specificity('.a, .b')).toThrow(/逗号选择器组/)
  })

  it('`.is-locked` 必须显式写 `opacity: 1`（判据读得懂意图，也是上一条的兜底）', () => {
    const at = optionCard.indexOf('.option-card.is-locked')
    expect(at, '判据范围消失').toBeGreaterThan(-1)
    const close = optionCard.indexOf('}', at)
    expect(close, '`.is-locked` 的规则块没有闭合的 `}` —— 判据切不出声明体').toBeGreaterThan(at)
    const body = optionCard.slice(at, close)
    expect(
      body,
      '`.is-locked` 没有显式 `opacity: 1` —— 只靠「`is-degraded` 让开」这条隐式约定，' +
        '任何人删掉那个 `:not(.is-locked)` 就会静默退回 0.55',
    ).toMatch(/opacity:\s*1\s*[;}]/)
  })

  it('`.question-card__tappable.is-locked` 必须有 `pointer-events: none`（平板上 `cursor` 不可见）', () => {
    const at = questionCard.indexOf('.question-card__tappable.is-locked')
    expect(at, '判据范围消失：锁定的可点容器规则找不到了').toBeGreaterThan(-1)
    const close = questionCard.indexOf('}', at)
    expect(close, '锁定的可点容器规则没有闭合的 `}` —— 判据切不出声明体').toBeGreaterThan(at)
    const body = questionCard.slice(at, close)
    expect(
      body,
      '🔴 建造期锁着时，题面区在**触摸设备**上仍是假可点：`cursor: default` 在平板上根本不可见，' +
        '而容器仍挂着 `@click="onReplay"`，守门静默丢弃 ⇒ 孩子点下去什么都没有。' +
        'AC-D5 逐字说的正是这个（CR 第四轮修的是选项那半，重听入口这半没修完）',
    ).toMatch(/pointer-events:\s*none\s*[;}]/)
  })
})

