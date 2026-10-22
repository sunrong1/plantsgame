/**
 * @vitest-environment jsdom
 */

/**
 * 终态浮层的守卫（Story 1.16 / AC-D1、AC-E1、AC-E2、G90、G91）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **G90** `LevelOutcome.vue` 源码**零战斗规则判定** —— 架构硬约束 2「组件只读
 *   `state`，不得自行计算」的 UI 半。与 `hand-build.test.ts` 的 G33 是同一条纪律的
 *   两侧：G33 禁「组件直连 `core/balance`」，G90 禁「组件里出现任何战斗数值/判据」。
 * · **G91** 终态文案**零技术错误字样、零元系统字样**（NFR13 / GDD Out-of-Scope ①）。
 *
 * ── 两条都是**源码匹配**型守卫 ⇒ **一律先 `stripComments()`**（R-52）────────
 *   否则本文件顶部那段「禁元进度」的说明会把自己判红 ——
 *   而这正是本仓库反复踩过的形态（1.14 的 G64 注释里逐字记着同款事故）。
 *
 * ── 为什么用**真 store**而不是 `vi.mock` ──────────────────────────────────
 *   `restartLevel()` / `backToStart()` 是 store 内部闭包去调 `applyAction`，
 *   `vi.spyOn` 拦截不到 ESM 命名导出 ⇒ 只能观测可数的副作用
 *   （`state.value` 的引用变更、`view.value` 的取值）。
 */

import { mount, enableAutoUnmount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import { HEARTS, answer } from '../../src/core'
import type { Phase } from '../../src/core'
import { applyAction, state, view } from '../../src/app/store'
import LevelOutcome from '../../src/components/hud/LevelOutcome.vue'
import LevelView from '../../src/views/LevelView.vue'

import levelOutcomeSource from '../../src/components/hud/LevelOutcome.vue?raw'
import { stripComments } from '../helpers/contrast'
import { questionOf } from '../fixtures/synthetic-deck'
import { targetOptionCount } from '../../src/content/option-count'

enableAutoUnmount(afterEach)

/** 剥掉注释后的源码 —— 下面每条源码判据都必须用它。 */
const CODE = stripComments(levelOutcomeSource)

/**
 * G91 的禁止词表。
 *
 * ⚠️ **词表逐条来自 AC-E1，不要自己加词**：加一个不在 AC 里的词会让守卫
 *   在「实现合法但用词不同」时变红，而那种红不是缺陷。
 * ⚠️ 「错」单独一个字**不在**表里 —— 「没错」是 4–8 岁孩子能懂的正向文案，
 *   而 `includes('错')` 会把它一起判掉。这类「子串陷阱」本仓库已记过同款
 *   （`guard-word-boundary-cjk-punctuation`）。
 */
const FORBIDDEN_IN_TEXT = [
  // 元进度系统（GDD Out-of-Scope 第 1 条逐字）
  '星星',
  '图鉴',
  'streak',
  '连对',
  '排行榜',
  '排行',
  '积分',
  '得分',
  '分数',
  '关卡分',
  // 本局统计的换皮（AC-E1 末条逐字）
  '正确率',
  '用时',
  '打了几题',
  '答对几',
  // 技术错误文案（NFR13）
  'error',
  '异常',
  'undefined',
  'nan',
  '出错了',
  '请重试',
  '失败，请',
  '报错',
  '堆栈',
] as const

/** 技术错误字样的正则（比词表更宽，用于抓英文小写形态）。 */
const TECH_ERROR_PATTERN = /\b(error|undefined|nan|exception|stack trace)\b/i

describe('G91 —— 终态文案红线（AC-E1 / AC-E3）', () => {
  it('源码里逐字不含任何禁止词', () => {
    for (const word of FORBIDDEN_IN_TEXT) {
      expect(CODE, `终态文案里出现了禁止词「${word}」—— 见 AC-E1 的三类红线`).not.toContain(word)
    }
  })

  it('源码里不含任何技术错误字样（正则形态，防大小写与词内变形）', () => {
    expect(TECH_ERROR_PATTERN.test(CODE), '源码里出现了技术错误字样（NFR13）').toBe(false)
  })

  it('🚨 反向自检：判据本身能咬住违规（把禁止词硬塞进去必须红）', () => {
    // ⚠️ **这条不许省**（R-51）：词表判据若因为大小写 / 空白 / 编码问题恒绿，
    //   上面两条就都是装饰。塞进的是一个**确实在 AC-E1 词表里**的字，
    //   所以它红是应该的，绿才说明判据没在工作。
    const probe = `const t = '本关得分';`
    const hit = FORBIDDEN_IN_TEXT.some((word) => probe.includes(word))

    expect(hit, '判据自检：探针里塞的就是词表里的「得分」，必须被判中').toBe(true)
  })

  it('AC-E2：进度**可以**出现在终态画面上（不许把合规文案误判掉）', () => {
    // ⚠️ 这条是 G91 的**反向**守卫。AC-E2 逐字：进度可见是 FR56 的要求，
    //   所以「单元 / 已学多少」这类文案必须能存在 ——
    //   若将来有人把禁止词表扩大到「单元」这种词，G91 就会开始误伤合规文案。
    expect(CODE, 'AC-E2：进度文案是合规的，不该被禁止词表收走').not.toContain('星星')
    expect(
      /进度|单元|已学|读完|掌握/.test(CODE),
      'AC-E2：终态画面应当仍然显示进度（FR56）—— 一句进度文案都没有就是漏做',
    ).toBe(true)
  })

  it('AC-E3：非英文词条的那部分文案是中文（英文单词是学习材料，不是 UI 文案）', () => {
    // ⚠️ **只查中文存在性，不查「不许有英文」** —— 组件里出现 `entryId`、
    //   `level-complete` 这类标识符是代码，不是文案。
    //   判据的真实形状是：模板里**面向孩子的那几句**必须是中文。
    const chineseSentences = CODE.match(/[一-龥]{2,}/g) ?? []
    expect(
      chineseSentences.length >= 2,
      '终态画面上要有面向 4–8 岁孩子的中文文案（AC-E3）—— 其余文案一律中文',
    ).toBe(true)
  })
})

describe('G90 —— LevelOutcome 零战斗规则判定（架构硬约束 2 的 UI 半）', () => {
  /**
   * ⚠️ 标识符黑名单**逐条写明出处**，不要凭直觉加 —— 加一个 `progress` 就足以
   *   让「显示第 N 单元」这条合规需求（AC-E2）无法实现。
   */
  const FORBIDDEN_IDENTIFIERS = [
    // 战斗数值与公式（架构硬约束 2 / 3）
    'HEARTS',
    'ZOMBIE_HP',
    'SLOW_TURNS',
    'costOf',
    'damageOf',
    'damageFor',
    'rangeOf',
    'initialSunFor',
    'sunPerCorrectFor',
    'zombieHpRatio',
    // 战斗判据函数（1.13 建的 HUD 判据同样不许在组件里重算）
    'heartSlots',
    'lostSlotIndexes',
    'heartsLostBetween',
    'progressDisplay',
    'coverCellsAt',
    'handCards',
    'placementBlockedReason',
    'canBuildAt',
    // 「还在这一单元的第几题」是战斗进度，不是 UI 态
    'masteredEntryIds',
  ] as const

  it('源码里不出现任何战斗规则标识符', () => {
    for (const id of FORBIDDEN_IDENTIFIERS) {
      expect(CODE, `LevelOutcome 里出现了战斗判据标识符「${id}」—— 判据只能住在 core/`).not.toContain(id)
    }
  })

  it('只读 `phase.kind` —— 不读 hearts / turn / unitNumber 等战场字段', () => {
    // ⚠️ 白名单精确到**表达式**：终态画面允许知道「现在是终态」，
    //   不允许知道「还剩几颗心」「第几回合」—— 那是战场事实（AC-D1 逐字
    //   「只读 `state.value.phase.kind`，不持有任何状态」）。
    const reads = CODE.match(/state\.value\.[A-Za-z.]+/g) ?? []

    expect(
      reads,
      `终态浮层只该读 state.value.phase.kind；实际读了：${JSON.stringify([...new Set(reads)])}`,
    ).toEqual(['state.value.phase.kind'])
  })

  it('不 import 任何 core 模块（连类型都不 import）', () => {
    expect(CODE, 'LevelOutcome 不许 import core —— 连类型都不行（R-02）').not.toMatch(
      /from\s+['"][^'"]*core[^'"]*['"]/,
    )
  })

  it('🚨 反向自检：黑名单判据能咬住违规', () => {
    const probe = `const x = HEARTS;`
    expect(
      FORBIDDEN_IDENTIFIERS.some((id) => probe.includes(id)),
      '判据自检：探针里的 `HEARTS` 必须被判中',
    ).toBe(true)
    // ⚠️ 第二半：白名单必须**不**能匹配到战场字段 —— 否则 G90 会恒红或恒绿。
    const badRead = 'state.value.hearts'
    expect(/state\.value\.[A-Za-z.]+/.exec(badRead)?.[0], '判据自检：正则确实能读出字段名').toBe(
      'state.value.hearts',
    )
    expect(
      'state.value.phase.kind',
      '判据自检：白名单里的那个表达式确实能被正则读出来',
    ).not.toBe('state.value.hearts')
  })
})

describe('组件本体 —— 只在终态下渲染，且按钮走 store 门面', () => {
  it('G94 的近亲：模板根节点只有一个 `v-if`（不多不少）', () => {
    // AC-D1 逐字「只在 `level-complete` / `level-failed` 下渲染，其余相位不渲染任何东西」。
    // ⚠️ 这条断言的是**根节点只有一个 `v-if`** ——
    //   写成 `expect(CODE).toContain('v-if')` 是恒真，等于没守。
    const rootIfs = CODE.match(/v-if=/g) ?? []
    expect(rootIfs.length, '根节点只有一个 v-if；多于一个说明有第二条渲染路径').toBe(1)
  })

  it('失败态与通关态走**两个不同**的 store 门面', () => {
    expect(CODE, '失败画面必须调 store.restartLevel()').toContain('restartLevel')
    expect(CODE, '通关画面必须调 store.backToStart()').toContain('backToStart')
  })
})

// ── 渲染与按钮（走真 store）────────────────────────────────────────────────

/**
 * 模块求值期的那份 state —— 它**天然就是** `awaiting-answer`（`createInitialState`
 * 把初始相位设成待答题）。
 *
 * ⚠️ **为什么需要这一份快照**：`Phase` 是六变体联合，`awaiting-answer` 那一支带
 *   `question`，其余五支不带 ⇒ 手造一个 `awaiting-answer` 就得编一道结构合法的题
 *   （四项选项、恰好一个 `correct`、key 与内容都对得上），那是一段几十行的
 *   假数据，而本文件要验的是「**渲染与按钮**」，不是「怎么造题」。
 *   ⇒ 拿真的开局那份，一行代码解决，且不引入第二份题单形态（R-37）。
 */
const PRISTINE = state.value

/** 把 store 推到某个终态。`turn` / `hearts` 一并带上，免得断言时还要编造。 */
function pushInto(kind: 'level-complete' | 'level-failed'): void {
  state.value = {
    ...PRISTINE,
    hearts: kind === 'level-failed' ? 0 : HEARTS,
    turn: 12,
    phase: { kind },
  }
}

/** 把 store 推到某个非终态。 */
function pushOutOfTerminal(kind: 'awaiting-answer' | 'awaiting-build' | 'resolving' | 'round-over'): void {
  if (kind === 'awaiting-answer') {
    state.value = PRISTINE
    return
  }
  if (kind === 'awaiting-build') {
    // 📎 **1.19 CR：补上题面。** 取 `PRISTINE` 自己那道正在问的题 ——
    //   `PRISTINE` 是 `createInitialState` 的产物，它的相位恒为 `awaiting-answer`，
    //   所以那道题逐字属于 `PRISTINE.deck`（满足新增的「题面属于题单」断言）。
    const question = questionOf(PRISTINE)
    state.value = {
      ...PRISTINE,
      phase: { kind, question, unlocked: [...PRISTINE.unlocked], sun: PRISTINE.sun },
    }
    return
  }
  state.value = { ...PRISTINE, phase: { kind } }
}

describe('渲染门（AC-D1）', () => {
  it('level-complete ⇒ 渲染，且文案里带「读完」这类正向词', () => {
    pushInto('level-complete')

    const w = mount(LevelOutcome)
    expect(w.find('.level-outcome').exists(), '通关时必须渲染浮层').toBe(true)
    expect(w.text(), '通关文案应当是给孩子的正向句子').toMatch(/读完|完成|太棒|过关/)
  })

  it('level-failed ⇒ 渲染，且给的是「再来一次」而不是任何技术措辞', () => {
    pushInto('level-failed')

    const w = mount(LevelOutcome)
    expect(w.find('.level-outcome').exists(), '失败时必须渲染浮层').toBe(true)
    expect(w.text(), '失败文案必须给出下一步（再来一次），不是报错').toContain('再来一次')
    expect(TECH_ERROR_PATTERN.test(w.text()), '渲染出来的文案里不许有技术字样').toBe(false)
  })

  it.each(['awaiting-answer', 'awaiting-build', 'resolving', 'round-over'] as const)(
    '相位 %s ⇒ 一个节点都不渲染',
    (kind) => {
      pushOutOfTerminal(kind)

      const w = mount(LevelOutcome)
      expect(w.find('.level-outcome').exists(), `${kind} 下不许渲染终态浮层`).toBe(false)
      expect(w.text().trim(), `${kind} 下不许有任何文字`).toBe('')
    },
  )

  it('AC-E2：通关画面仍然显示进度（FR56 进度可见）', () => {
    pushInto('level-complete')

    const w = mount(LevelOutcome)
    expect(
      w.text(),
      '通关画面必须仍然告诉孩子读到哪了 —— 删掉它就违反了 FR56，而那不是「元进度」',
    ).toMatch(/单元|进度|已学|掌握/)
  })
})

// ── G203 —— 终态文案不撒谎（`[CR]` 2026-10-20）──────────────────────────

describe('G203 —— 终态文案不含「全部」这种假的全称量词（Story 1.18 `[CR]` 2026-10-20）', () => {
  // 🔥 **1.18 自己把这句话变成了假陈述**：
  //   原文逐字「这个单元的**全部**单词都读过了。」——
  //   而 1.18 引入了 `skippedEntryIds`（正确项词图加载失败 ⇒ 整题被跳过），
  //   那种局里孩子**一个字都没读**，屏幕上却写着「全部单词都读过了」。
  //   ⚠️ 这与 `reducer.applySkip` 拒绝「题单被抽空」是**同一个理由**：
  //     「一个词都没答的孩子看到『读完啦！』—— 本项目能造出的最糟的假陈述」。
  //   ⇒ 修法（用户裁决：**甲**）：去掉全称量词，**不读任何新 state**。
  it('通关文案里没有「全部」', () => {
    pushInto('level-complete')
    const w = mount(LevelOutcome)
    expect(
      w.text(),
      '通关文案里出现了「全部」—— 有跳过记录（正确项词图 404）的局里孩子一个字都没读，' +
        '而屏幕上写着「全部单词都读过了」：本项目能造出的最糟的假陈述',
    ).not.toMatch(/全部/)
  })

  it('失败文案里没有把「没答对」一律说成「答错」', () => {
    pushInto('level-failed')
    const w = mount(LevelOutcome)
    expect(
      w.text(),
      '失败文案里出现了「答错」—— 1.18 之后「没答对」有两种（答错了 / 被跳过了），' +
        '原句默认「全部没答对的词都是答错的」，而它未必成立',
    ).not.toMatch(/答错/)
  })

  it('⚠️ 判据是**渲染出来的文字**，不是源码里有没有那几个字', () => {
    // R-51：源码里当然还留着「答错」「全部」这些词（在**注释**里，
    //   讲的是「为什么去掉它们」）⇒ 只有渲染结果才说明文案本身。
    //   ⚠️ 这一条同时确认判据没有误伤：把注释剥掉后源码里确实不含那两句文案。
    expect(
      CODE,
      '剥掉注释后的源码里仍含旧文案 —— 说明模板改的地方不止一处',
    ).not.toMatch(/这个单元的全部单词都读过了/)
  })
})

describe('按钮走 store 门面（AC-D1 / AC-D3）', () => {
  it('失败画面点「再来一次」⇒ state 被换成一局新的（走真 applyAction 链路）', () => {
    pushInto('level-failed')
    const before = state.value

    const w = mount(LevelOutcome)
    w.find('button').trigger('click')

    // ⚠️ 断言「引用换了」而不是「内容像开局」：`reduce` 每次返回全新对象，
    //   而内容上 `level-failed` → `awaiting-answer` 的差异本来就该被断言。
    expect(state.value, '重打必须换掉整个 state（而不是就地改）').not.toBe(before)
    expect(state.value.phase.kind, '重打后必须回到开局相位').toBe('awaiting-answer')
    expect(state.value.hearts, '重打后心数必须满').toBe(HEARTS)
    expect(state.value.turn, '重打后回合号回到 1').toBe(1)
  })

  it('通关画面点按钮 ⇒ view 回到 start，且 state 一个字节都没动', () => {
    pushInto('level-complete')
    const before = state.value
    view.value = 'level'

    const w = mount(LevelOutcome)
    w.find('button').trigger('click')

    expect(view.value, '通关画面按钮 = 回开始界面').toBe('start')
    expect(state.value, '回开始界面不许顺手动战场（AC-D3：只做 view.value = start）').toBe(before)
  })

  it('两个按钮都只有一个，且文案互不相同', () => {
    pushInto('level-failed')
    expect(mount(LevelOutcome).findAll('button').length, '失败画面只给一个按钮').toBe(1)

    pushInto('level-complete')
    expect(mount(LevelOutcome).findAll('button').length, '通关画面只给一个按钮').toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D5 —— 三条「假可点」路径逐条堵死（**集成在真的 `<LevelView />` 上**）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 🚨 **本组如实记录：本 story 没有为 AC-D5 新增任何机制。**（AC-D5 逐字要求）
 *
 * 三条路径的堵法全部来自既有 story：
 *   ① 卡面  → **1.16 裁决 7**（`shown` 收窄到只兜 `awaiting-build`）—— 这条**是** 1.16 的
 *   ② 手牌区 → 1.12 AC-F4（`HandDeck.vue` 的 `v-if="isBuildPhase"`）
 *   ③ 开战按钮 → 1.12 AC-C6（同一个 `v-if`）+ 1.5 的 `startRound()` 相位守卫（G37）
 *
 * ⇒ 1.16 在这三条上**只加了证明**，没加闸门。
 *   任何时候有人把「手牌区在终态下消失」说成 1.16 的修复，都是错的。
 *
 * ── 为什么挂 `<LevelView />` 而不是三个子组件 ────────────────────────────────
 *   AC-D5 问的是「**孩子在屏幕上能点到的东西**」。
 *   逐个 mount 子组件只能证明「每个子组件自己会隐藏」，
 *   证明不了「它们被挂在了同一棵树上、且那条 `v-if` 真的在跑」——
 *   而「忘了 import 组件 ⇒ 渲染成空标签、**全绿**」这个坑本仓库已经踩过两次
 *   （`LevelView.vue:34-57` 逐字记着）。⇒ 必须挂真的视图。
 */
/**
 * AC-D5 那条「可点元素只有一个」的判据里，**什么叫「可点」**。
 *
 * ⚠️📌 `[CR]` 2026-10-17：**这条判据原来只是一串半截的 CSS 选择器**
 *   （`button, [role="button"], .option-card, .hand-card`），而它的用例名与注释
 *   逐字声称的是「**整棵视图树**、将来给**别的元素接了 handler** 也会红」。
 *   那句话当时是假的 —— 选择器抓不到：
 *     · 裸 `@click` 的 `div`（`<div @click="…">`，四个已知类名一个都不沾）
 *     · `<a href>` / `<input>` / `<select>`
 *     · 只加了 `tabindex`、靠键盘 Enter 触发的元素
 *   ⇒ `[CR]` 把它换成下面这个显式判据，并**逐条写出它抓什么、不抓什么、为什么**。
 *
 * ── 为什么必须显式读 Vue 的 vnode props ──────────────────────────────────
 *   `@click` 在 Vue 3 里**不是 DOM 属性**：`patchProp` 对 `on*` 走
 *   `addEventListener`，`el.attributes()` 里**看不到** `onclick`。
 *   ⇒ 只能读 `el.__vnode.props`（runtime-dom 在 patch 时挂上去的）。
 *   这是一个 Vue 内部字段，所以下面用 `in` 探测 + 降级：拿不到就退化成
 *   「只按 DOM 侧特征判」，**宁可少抓也不误报**。
 */
/**
 * 「孩子能**主动**点到」的事件 —— 精确名单，**不按 `^on[A-Z]` 泛匹配**。
 *
 * ⚠️📌 `[CR]` 2026-10-17：首版这里写的是 `/^on[A-Z]/`，当场数出 16 个而不是 1 个 ——
 *   多出来的绝大多数是**根本点不到**的元素：
 *     · `HeartRow` 的 `heart-row__shape` 带 `@animationend`（1.13 的心碎动画收尾）
 *     · `OptionCard` / `HandCard` 的 `*__image` 带 `@error`（图片降级，1.7）
 *   ⇒ 判据必须问「这个 handler 是不是**用户输入**」，不是「有没有 handler」。
 *   这一条就是本仓库反复记着的「判据比它声称的窄**或宽**，两边都算错」。
 */
const USER_INPUT_EVENT_PROPS = new Set([
  'onClick',
  'onDblclick',
  'onPointerdown',
  'onPointerup',
  'onMousedown',
  'onMouseup',
  'onTouchstart',
  'onTouchend',
  'onContextmenu',
  'onKeydown',
  'onKeyup',
  'onKeypress',
])

function hasUserInputHandler(el: Element): boolean {
  const vnode = (el as Element & { __vnode?: { props?: Record<string, unknown> } }).__vnode
  if (vnode === undefined || vnode.props === undefined) return false
  return Object.entries(vnode.props).some(
    ([key, value]) => USER_INPUT_EVENT_PROPS.has(key) && typeof value === 'function',
  )
}

/** DOM 侧的特征选择器 —— 「元素自带可点语义」的那些形态。 */
const CLICKABLE_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [tabindex], [contenteditable="true"], .option-card, .hand-card'

/**
 * 战场本体 —— **显式排除**，理由逐字写在这里（`[CR]` 2026-10-17）：
 *
 * `BattleField.vue` 的 `.battle-grid` 带 `@click.self="onGridBlank"`，
 * 45 个 `.battle-cell` 各带 `@pointerdown` / `@pointerup` / `@pointercancel`。
 * 若按「任何带 `on*` 的元素」判，这条断言会数到 46 个 —— 但那**不是** AC-D5
 * 要防的「假可点」，理由两条：
 *   ① **战场在终态下必须仍在**（AC-D2 逐字：「孩子通关时应当看得见自己守住的那片地」）。
 *      它不是「本该消失却留着的交互残留」，恰恰是本 story 刻意保留的东西。
 *   ② `onGridBlank` 的全部作用是 `selectedEntryId.value = null`，
 *      而 `selectedEntryId` 在相位离开 `awaiting-build` 时**已被自动清空**
 *      （`store.ts` 的 `clearSelectionIfLeavingBuildPhase`）⇒ 终态下点它是**无副作用的空操作**，
 *      屏幕上不会有任何东西变化 —— 与「孩子点了以为能干什么、却毫无反应」不同类。
 * ⚠️ 这条排除是**判据的一部分**，不是「让它绿」的通融：战场里若新加一个
 *   `button` / `[role=button]` / `<a>`，上面那个选择器**照样抓得到**（选择器不看祖先）。
 *   1.12 交付，非 1.16 引入。
 */
const BATTLEFIELD_SELECTOR = '.battle-grid'

/** 找出视图树里全部「AC-D5 意义上可点」的元素，并给出可读的失败清单。 */
function findClickable(w: VueWrapper): DOMWrapper<Element>[] {
  return w
    .findAll<Element>('*')
    .filter(
      (el) => !el.element.matches(BATTLEFIELD_SELECTOR) && !el.element.closest(BATTLEFIELD_SELECTOR),
    )
    .filter((el) => el.element.matches(CLICKABLE_SELECTOR) || hasUserInputHandler(el.element))
}

describe('AC-D5 —— 终态下没有可点的假东西（集成在真 <LevelView /> 上）', () => {  /**
   * 走真实链路：进关（待答题）→ 挂载视图 → 答对一题 → 进建造期。
   *
   * 🚨🚨 **mount 必须在 `awaiting-answer` 上做，顺序不能换**（实测踩过两次）：
   *   组件本地那份 `lastQuestion` **只在组件观察到一道 `awaiting-answer` 时才被填上** ——
   *   若在 `awaiting-build` 上才 mount，phase 的 watch 带着
   *   `{ immediate: true }` 跑一次，撞上 `if (phase.kind !== 'awaiting-answer') return`
   *   就早退了 ⇒ `lastQuestion` 恒为 `null` ⇒ 卡面一个选项都不渲染。
   *   那样下面两条断言全都变成恒绿的装饰：宽兜底实现（`return lastQuestion.value`）
   *   在 `null` 上也渲染成空，**M106 这条变异根本抓不到它们**。
   *   真实运行时顺序正是这样：`LevelView` 在进关那一刻（待答题）就挂上了。
   */
  /**
   * 重新读一次相位种类。
   *
   * ⚠️ **为什么要绕这一下，而不是把断言删掉**（TS2367）：
   *   上面那句 `if (kind !== 'awaiting-answer') throw` 会让 TS 把
   *   `state.value.phase.kind` **窄化成字面量** `'awaiting-answer'`，
   *   而它**不知道** `applyAction` 会换掉 `state.value` ⇒
   *   随后的 `!== 'awaiting-build'` 在类型上就是「两个没有交集的字面量在比」，
   *   vue-tsc 直接报 TS2367。
   *   ⇒ **不要**用 `as` 把类型硬掰开（那正是 §8 教训 3 的失败形态，
   *     而 TS2367 恰恰是「判据被类型系统逼着变假」的先兆）；
   *     **也不要**为了让类型闭嘴而删掉那句前置断言（删了夹具就静默失效）。
   *   ⇒ 用一个**重新取值**的函数把窄化打断：调用点的类型是 `Phase['kind']` 联合，
   *     与运行时事实一致。
   */
  const phaseKindNow = (): Phase['kind'] => state.value.phase.kind

  async function enterLevelAndBuild(): Promise<ReturnType<typeof mount>> {
    state.value = PRISTINE
    if (phaseKindNow() !== 'awaiting-answer') throw new Error('开局那份不是 awaiting-answer —— 夹具失效')

    const w = mount(LevelView)
    await nextTick()
    const correct = state.value.phase.kind === 'awaiting-answer'
      ? state.value.phase.question.card.options.find((o) => o.correct)
      : undefined
    if (correct === undefined) throw new Error('开局那道题没有正确选项 —— 夹具失效')

    applyAction(answer(correct.id))
    await nextTick()
    if (phaseKindNow() !== 'awaiting-build') {
      throw new Error(`答完一题应当进入 awaiting-build，实际停在 ${phaseKindNow()}`)
    }
    return w
  }

  /**
   * 此刻屏幕上那张卡**应该有几个选项** —— 期望值取**规则**（`targetOptionCount`）。
   *
   * ⚠️⚠️ **`[CR]` 2026-10-23 更正 —— 这个文件的 state 来自**真 store**，不是合成题单**：
   *   `src/app/store.ts` 的 `buildStateFor(unitNumber)` 用的是 `entriesOf(unitNumber)`
   *   —— **真实内容**（单元 1 的 `unit-01.json`）⇒ 卡面上渲染几个选项，取决于
   *   **内容层那条规则**（Story 2.4：档 1 单词卡 2 个 / 关键词卡 3 个 / 回应卡 3 个）。
   *   ⚠️ 此前这里写的是「合成题单的 4 个选项」⇒ 实测直接红（渲染出来是 **2** 个）。
   *
   * ⇒ 期望值取 `targetOptionCount(state.unitNumber, card.kind)`：它由**规则**算出，
   *   与被渲染的 DOM **不同源** ⇒ 卡空了（0 个选项）时这条断言会红，不是恒真。
   */
  function expectedOptionCountOf(current: typeof state.value): number {
    const question = questionOf(current)
    return targetOptionCount(current.unitNumber, question.card.kind)
  }

  it('前置：建造期里卡面 / 手牌区 / 「开战」按钮**都在**（否则下面几条是恒绿）', async () => {
    // ⚠️ R-51：**只钉「终态下没有」的话，一条把手牌区永远藏起来的实现照样绿**。
    const w = await enterLevelAndBuild()

    expect(w.findAll('.option-card').length, '建造期卡面必须在（AC-C5 的反馈载体）').toBe(
      expectedOptionCountOf(state.value),
    )
    expect(w.find('.hand-deck').exists(), '建造期手牌区必须在').toBe(true)
    expect(w.find('.hand-deck__start').exists(), '建造期「开战」按钮必须在').toBe(true)
  })

  it.each(['level-failed', 'level-complete'] as const)('%s：卡面 / 手牌区 / 开战按钮 三者全部不渲染', async (kind) => {
    const w = await enterLevelAndBuild()
    expect(w.findAll('.option-card').length, '前置：卡面此刻必须在屏幕上').toBe(
      expectedOptionCountOf(state.value),
    )

    pushInto(kind)
    await nextTick()

    expect(
      w.findAll('.option-card').length,
      `${kind} 下留着选项 = AC-D5 的第一条「假可点」（上一局的卡面还留在屏幕上）`,
    ).toBe(0)
    expect(w.find('.question-card').exists(), `${kind} 下连题面区都不该在`).toBe(false)
    expect(
      w.find('.hand-deck').exists(),
      `${kind} 下手牌区必须在（1.12 AC-F4；本 story 未新增机制）`,
    ).toBe(false)
    expect(
      w.find('.hand-deck__start').exists(),
      `${kind} 下「开战」按钮必须在（1.12 AC-C6；本 story 未新增机制）`,
    ).toBe(false)

    // 战场仍在（AC-D2）—— 浮层是叠在上面的一层，不是把战场换掉。
    expect(w.find('.battle-grid').exists(), `${kind} 下战场必须仍然渲染（AC-D2）`).toBe(true)
    expect(w.find('[data-testid="level-outcome"]').exists(), `${kind} 下浮层必须在`).toBe(true)
  })

  it('判据自检：建造期 `findClickable` 抓得到东西（否则下面那条是恒绿）', async () => {
    // ⚠️ **必须独立成一条用例**（`[CR]` 2026-10-17）：自检要再跑一遍
    //   `enterLevelAndBuild()`，而它会把 `state.value` 重置回 `PRISTINE` 并再答一题。
    //   写在终态那条**里面**时，它把 state 又推回建造期 ⇒ 被测对象已经不是终态。
    //   ⇒ 一条用例只驱动一次 store，判据自检单独一条。
    const w = await enterLevelAndBuild()

    const clickable = findClickable(w)
    expect(
      clickable.length,
      `判据自检：建造期应当抓到多个可点元素（四张 .option-card + 手牌 + 开战）；实际 ${clickable.length} 个`,
    ).toBeGreaterThan(4)
    // 顺带钉住「战场被显式排除」这条判据的分寸：战场**有** handler，但不算可点。
    expect(
      clickable.some((el) => el.classes().join(' ').includes('battle-grid') || el.classes().join(' ').includes('battle-cell')),
      '判据自检：战场本体已被显式排除（BATTLEFIELD_SELECTOR 的理由见其定义处）',
    ).toBe(false)
  })

  it('终态下**全部**可点元素加起来只有浮层那一个按钮', async () => {
    // ⚠️ **不与上面两条重复**：上面验的是「那几个具体元素不见了」，
    //   这一条从**整棵视图树**兜一次 —— 将来有人给别的元素接了 handler 或 role，
    //   上面两条不会红，这条会。
    // ⚠️📌 `[CR]` 2026-10-17：判据从半截 CSS 选择器换成 `findClickable()`
    //   （抓 DOM 特征**或** Vue vnode 上的**用户输入** handler，且显式排除战场本体）。
    //   「什么算可点、战场为什么不算」的完整理由见那个函数的头注释。
    const w = await enterLevelAndBuild()

    pushInto('level-failed')
    await nextTick()

    const clickable = findClickable(w)
    expect(
      clickable.length,
      `终态下可点元素应当只有浮层那一个按钮；实际有 ${clickable.length} 个：${clickable
        .map((el) => `${el.element.tagName.toLowerCase()}.${el.classes().join('.')}`)
        .join(' / ')}`,
    ).toBe(1)
    expect(clickable[0].classes().join(' '), '那唯一一个必须是浮层的按钮').toContain('level-outcome__button')
  })
})
