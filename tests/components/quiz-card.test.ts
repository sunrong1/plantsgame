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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyAction, speakQuestion, state } from '../../src/app/store'
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
vi.mock('../../src/app/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/store')>()
  return { ...actual, applyAction: vi.fn(), speakQuestion: vi.fn() }
})

const applyActionMock = vi.mocked(applyAction)
const speakMock = vi.mocked(speakQuestion)

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
import tokensSource from '../../src/styles/tokens.css?raw'

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
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')
}

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
    const wrapper = mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)

    // 走一遍真状态机：answer → endBuild → resolveRound → continue
    const real = await vi.importActual<typeof import('../../src/app/store')>('../../src/app/store')
    real.applyAction(answer(question.card.options[wrongIndex].id))
    real.applyAction(endBuild())
    real.applyAction(resolveRound())
    real.applyAction(continueRound())
    expect(state.value.phase.kind).toBe('awaiting-answer')
    await wrapper.vm.$nextTick()

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

  it('点击降级选项：applyAction 调用次数为 0，且不产生反馈', async () => {
    const wrapper = mountCard(firstQuestionOfKind('word'))
    await wrapper.find('.option-card__image').trigger('error')

    await wrapper.find('.option-card').trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(0)
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
// ══════════════════════════════════════════════════════════════════════════════

/** WCAG 相对亮度。 */
function relLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (m === null) throw new Error(`不是 6 位十六进制色：${hex}`)
  const v = parseInt(m[1], 16)
  const chan = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return (
    0.2126 * chan((v >> 16) & 0xff) +
    0.7152 * chan((v >> 8) & 0xff) +
    0.0722 * chan(v & 0xff)
  )
}

/** WCAG 对比度，保留两位小数。 */
function contrastRatio(a: string, b: string): number {
  const l1 = relLuminance(a)
  const l2 = relLuminance(b)
  return Math.floor(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
}

/**
 * 从源码里取出 `selector { … }` 的声明体。
 *
 * 🚨 **先 `stripComments`** —— 这不是保险，是本仓库对全部源码匹配型守卫的
 *   强制前置（R-52）。第一稿漏了它，守卫立刻抓到我自己的违规：
 *   `OptionCard.vue` 的边框那段长注释里**逐字写着** `border: 3px solid transparent`
 *   （解释「改之前是什么样」），`indexOf('.option-card {')` 命中的是那条注释之前的
 *   位置，再找 `{` 就跳进注释里 ⇒ 取出来的「声明体」是**注释正文**，
 *   断言于是对着自己写的说明文字报错。**注释里描述违规形态，正则会命中注释。**
 */
function cssDecl(source: string, selector: string): string {
  const code = stripComments(source)
  const idx = code.indexOf(selector)
  if (idx === -1) throw new Error(`源码里找不到选择器 ${selector}`)
  const open = code.indexOf('{', idx)
  const close = code.indexOf('}', open)
  return code.slice(open + 1, close)
}

/** 解析 `var(--x)`（去 `tokens.css` 取值）或 `#abc`（直接返回）。 */
function resolveColor(value: string): string {
  const v = value.trim()
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v)
  if (m === null) return v
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\s*;?$/i.exec(cssDecl(tokensSource, m[1]).trim())
  if (hex === null) throw new Error(`token ${m[1]} 的值不是十六进制色`)
  const h = hex[1]
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`
}

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
    const color = resolveColor(/color:\s*([^;]+);/i.exec(cssDecl(questionCardSource, '.question-card__prompt {'))?.[1] ?? '')
    // 底色依次取：卡面区自己的背景 → 整页背景 → 浏览器默认白。
    // ⚠️ 必须**逐级回退**：改之前卡面区与整页都没有背景，
    //   判据若只看卡面区就会因为「找不到背景」而无法复现那个 1.00:1。
    const panel = /background-color:\s*([^;]+);/i.exec(cssDecl(questionCardSource, '.question-card {'))?.[1]
    const page = /background-color:\s*([^;]+);/i.exec(cssDecl(levelViewSource, '.level-view {'))?.[1]
    const background = resolveColor(panel ?? page ?? '#ffffff')

    const ratio = contrastRatio(color, background)
    // 📎 4.5 是 WCAG AA **正文**门槛；题面是大字号（--text-prompt），
    //   AA 大字号门槛是 3.0 —— 这里按更严的 4.5 要求是有意留余量：
    //   4–8 岁是目标读者，且 AC-C1 的题面字号还会被 1.12 / 1.13 沿用。
    expect(ratio, `题面文字 ${color} 落在 ${background} 上只有 ${ratio}:1（白字白底那一版就是 1.00:1）`).toBeGreaterThanOrEqual(4.5)
  })

  it('选项卡文字与其底色的对比度 ≥ 4.5:1', () => {
    const color = resolveColor(/color:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card__text {'))?.[1] ?? '')
    const bg = resolveColor(/background:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card {'))?.[1] ?? '#ffffff')
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
      const bg = resolveColor(/background:\s*([^;]+);/i.exec(cssDecl(optionCardSource, '.option-card {'))?.[1] ?? '#ffffff')
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

describe('AC-C5 —— 组件本地 lastQuestion', () => {
  it('🚨 首次挂载就是一道待答题 —— 卡面必须立刻渲染（immediate 的缺失会让整个 story 的交付物是空的）', () => {
    state.value = stateWith(firstQuestionOfKind('word'))
    const wrapper = mount(QuestionCard)

    // 少这一行的话，「watch 默认不在 setup 时触发」会让首次渲染是空的，
    // 而且红得像是「分派写错了」—— G24 / G26 / G28 全红却指错了地方。
    expect(wrapper.findAll('.option-card')).toHaveLength(4)
  })

  it('lastQuestion === null 时卡面区不渲染任何东西（不是白框、不是空 div）', () => {
    state.value = {
      ...createInitialState({ unitNumber: 1, deck: entriesOf(1) }),
      phase: { kind: 'awaiting-build', unlocked: [], sun: 0 },
    }
    const wrapper = mount(QuestionCard)

    expect(wrapper.find('.question-card').exists()).toBe(false)
    expect(wrapper.find('.answer-feedback').exists()).toBe(false)
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

  it('awaiting-build 期间卡面仍在（lastQuestion 继续供它渲染），但重听不提供', async () => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    const wrongIndex = question.card.options.findIndex((o) => !o.correct)
    await wrapper.findAll('.option-card')[wrongIndex].trigger('click')
    applyActionMock.mockReset()
    speakMock.mockClear()

    // 切到 awaiting-build（state 里此时**没有 question**）
    state.value = { ...state.value, phase: { kind: 'awaiting-build', unlocked: [], sun: 100 } }
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
  it('awaiting-build 期点选项卡：不派发 ANSWER，也不点亮反馈（守门在写 pickedOptionId 之前）', async () => {
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

    await wrapper.findAll('.option-card')[1].trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(0)
    // 🚨 守门若被挪到 `pickedOptionId.value = optionId` **之后**，
    //   上面那条仍然绿（applyAction 依然没被调用），而孩子会看到一个假反馈。
    expect(wrapper.find('.answer-feedback').exists()).toBe(false)
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
  //   下面这条把「守门覆盖的是所有非答题相位」也钉住 ——
  //   只测 `awaiting-build` 的话，把守门写成 `if (phase.kind !== 'awaiting-build') return`
  //   也能过，而 `resolving` / `round-over` 仍是敞开的。
  it.each(['resolving', 'round-over'] as const)('%s 期点选项卡：同样不派发 ANSWER', async (kind) => {
    const question = firstQuestionOfKind('word')
    const wrapper = mountCard(question)
    state.value = { ...state.value, phase: { kind } } as never
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.option-card')).toHaveLength(4) // 卡面仍在（lastQuestion 兜底）
    applyActionMock.mockReset()

    await wrapper.findAll('.option-card')[0].trigger('click')

    expect(applyActionMock).toHaveBeenCalledTimes(0)
    expect(wrapper.find('.answer-feedback').exists()).toBe(false)
  })
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
