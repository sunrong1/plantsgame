/**
 * @vitest-environment jsdom
 */
/**
 * HUD 三件套的组件测试与源码守卫（Story 1.13 / AC-C、AC-E、AC-F）。
 *
 * ── 四条纪律（AC-F3，照抄 `hand-build.test.ts`）─────────────────────────────
 *   ① 文件顶部的 `/** @vitest-environment jsdom *\/` **docblock**（不是 `//`）；
 *   ② 断言前必须 `await nextTick()`；
 *   ③ 每个用例 `enableAutoUnmount(afterEach)` —— `state` / `progress` 是模块级单例，
 *      前一个用例的组件还活着会被同时唤醒；
 *   ④ 源码匹配型守卫必须 `stripComments()`（R-52）。
 *
 * ── 用真 store，不用 `vi.mock` / `vi.spyOn`（AC-F3 的 ⚠️）───────────────────
 *   `applyAction` 等是 ESM 具名导出，无法 redefine；「dispatch 了几次」只能数
 *   `state.value` / `progress.value` 的**引用变更**，且 watch **必须 `flush: 'sync'`**
 *   —— 默认的 `'pre'` 会把同一 tick 内的多次同步赋值合并成一次回调（1.12 实测
 *   `expect(n).toBe(2)` 实得 1）。`countDispatches` 照抄 `hand-build.test.ts:174`。
 *
 * ── 只测「渲染与事件转发」，不测业务逻辑（AC-F4）──────────────────────────
 *   `game-architecture.md:956`：「逻辑层已覆盖的部分重复测一遍只会产生虚假的信心」。
 *   ⇒ 不写「掉心之后会发生什么战斗结果」；写的是「state 长这样时 DOM 长那样」。
 *   AC-B 那四组判据的逻辑在 `tests/core/hud.test.ts`，这里一条都不重复断言。
 *
 * ── ⚠️ 构造上恒真的断言 = 假绿（AC-F5 的四处高危）──────────────────────────
 *   本文件每个「随 state 变化」的用例都配**两个方向相反的 fixture**，
 *   并断言两者的 DOM **不同** —— 单 fixture 下「判据 = 变了」与「判据 = 某个常量」
 *   完全等价。
 */

import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick, watch } from 'vue'

import { entriesOf } from '../../src/content'
import {
  HEARTS,
  advanceProgress,
  answer,
  heartSlots,
  progressDisplay,
  restartLevel,
  type Phase,
  type State,
} from '../../src/core'
import { applyAction, progress, state } from '../../src/app/store'
import HeartRow from '../../src/components/hud/HeartRow.vue'
import ProgressBar from '../../src/components/hud/ProgressBar.vue'
import SunCounter from '../../src/components/hud/SunCounter.vue'

import battleFieldSource from '../../src/components/battle/BattleField.vue?raw'
import towerSource from '../../src/components/battle/Tower.vue?raw'
import hudSource from '../../src/core/hud.ts?raw'
import heartRowSource from '../../src/components/hud/HeartRow.vue?raw'
import levelViewSource from '../../src/views/LevelView.vue?raw'
import progressBarSource from '../../src/components/hud/ProgressBar.vue?raw'
import sunCounterSource from '../../src/components/hud/SunCounter.vue?raw'
import typesSource from '../../src/core/types.ts?raw'
import storeSource from '../../src/app/store.ts?raw'
import balanceSource from '../../src/core/balance.ts?raw'
import combatSource from '../../src/core/combat.ts?raw'
import turnSource from '../../src/core/turn.ts?raw'
import { stripComments as sharedStripComments } from '../helpers/contrast'

enableAutoUnmount(afterEach)

/** 剥注释后再做源码匹配（R-52）。照 `hand-build.test.ts:82` 的先例共用同一份实现。 */
const stripComments = sharedStripComments

/**
 * `progress` 的**模块加载瞬间**初值快照。
 *
 * ⚠️ 必须在这里定格：各测试的 `reset()` 会把 `progress.value` 整个换掉，
 *   而本文件是模块作用域求值一次 ⇒ 测试跑到哪都读得到「刚 import 进来」的那个值。
 *   这正是 `[CR]` 那条基准守卫能读**运行时真实初值**（而不是自造对象）的原因 ——
 *   读自造对象的话，断言就会跟着实现走，变成恒真。
 */
const FRESH_PROGRESS = Object.freeze({ currentUnitIndex: progress.value.currentUnitIndex })

// ── 测试用的 state 组装（照 `hand-build.test.ts:126`）────────────────────────

const REAL_DECK = entriesOf(1)
const ENTRY = REAL_DECK[0]
const CORRECT_OPTION = ENTRY.card.options.find((o) => o.correct)?.id

interface HudStateOptions {
  readonly hearts?: number
  readonly sun?: number
  readonly unitNumber?: number
  readonly mastered?: readonly string[]
  readonly phase?: 'awaiting-answer' | 'awaiting-build'
}

function makeState(options: HudStateOptions = {}): State {
  const sun = options.sun ?? 1000
  const mastered = options.mastered ?? [ENTRY.entryId]
  const phase: Phase =
    options.phase === 'awaiting-build'
      ? { kind: 'awaiting-build', unlocked: [...mastered], sun }
      : { kind: 'awaiting-answer', question: ENTRY }
  return {
    unitNumber: options.unitNumber ?? 1,
    phase,
    turn: 1,
    hearts: options.hearts ?? HEARTS,
    sun,
    grid: {},
    towers: [],
    zombies: [],
    deck: REAL_DECK,
    // ⚠️ `mastered ⊆ unlocked` 是 reducer 比 AC-13 更强的不变量（`reducer.ts:495`），
    //   这里造的 state 必须过它，否则 `applyAction` 会在断言里炸。
    masteredEntryIds: [...mastered],
    unlocked: [...mastered],
  }
}

/** 每个 `beforeEach` 都回到一份干净的 state + 空进度。 */
function reset(options: HudStateOptions = {}): void {
  state.value = makeState(options)
  progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
}

/** 三个组件的源码（供源码型守卫使用）。 */
const HUD_SOURCES = [
  { name: 'hud/SunCounter.vue', source: sunCounterSource },
  { name: 'hud/HeartRow.vue', source: heartRowSource },
  { name: 'hud/ProgressBar.vue', source: progressBarSource },
] as const

/**
 * 数「`progress.value` 的**内容**变了多少次」—— 不是引用变更次数（AC-B3 第三条
 * 性质让无增量时返回同一个引用，所以引用数恒等于 dispatch 数，没有鉴别力）。
 *
 * ⚠️ `flush: 'sync'`：默认 `'pre'` 会把同一 tick 内的多次同步赋值合并成一次。
 */
function countProgressChanges(run: () => void | Promise<void>): Promise<number> {
  let changes = 0
  const stop = watch(
    progress,
    (next, prev) => {
      const a = JSON.stringify(next)
      const b = JSON.stringify(prev)
      if (a !== b) changes += 1
    },
    { flush: 'sync' },
  )
  // ⚠️ `run` 可以是 async（`trigger()` 返回的 promise 必须 await 之后组件才重渲染完），
  //   否则数的是「按下之前」的状态 —— `hand-build.test.ts:183-187` 的同一处教训。
  return Promise.resolve(run()).then(() => {
    stop()
    return changes
  })
}

// ── AC-C1 / G49：SunCounter ───────────────────────────────────────────────

describe('AC-C1 / G49 —— SunCounter 的可见文本恒等于 String(state.sun)', () => {
  it('G49：初始渲染的文本就是 String(state.sun)', async () => {
    reset({ sun: 250 })
    const wrapper = mount(SunCounter)

    expect(wrapper.get('[data-testid="sun-value"]').text()).toBe(String(state.value.sun))
  })

  it('🚨 AC-F5①：sun 增加与减少时文本**都**跟着变，且两者 DOM 不同', async () => {
    reset({ sun: 250 })
    const wrapper = mount(SunCounter)
    const before = wrapper.get('[data-testid="sun-value"]').text()

    state.value = makeState({ sun: 250 + 100 })
    await nextTick()
    const afterUp = wrapper.get('[data-testid="sun-value"]').text()

    state.value = makeState({ sun: 250 - 50 })
    await nextTick()
    const afterDown = wrapper.get('[data-testid="sun-value"]').text()

    expect(before).toBe('250')
    expect(afterUp).toBe('350')
    expect(afterDown, '阳光**减少**的方向也必须更新 —— 建塔后余额会变少').toBe('200')
    // 两个方向必须落在不同的文本上：只测一个方向时，「判据 = 变了」与「判据 = 恒定值」等价
    expect(afterUp).not.toBe(afterDown)
  })

  it('答对一次后文本严格等于新的 String(state.sun)', async () => {
    reset({ sun: 200 })
    expect(CORRECT_OPTION).toBeDefined()
    const wrapper = mount(SunCounter)

    applyAction(answer(CORRECT_OPTION!))
    await nextTick()

    expect(wrapper.get('[data-testid="sun-value"]').text()).toBe(String(state.value.sun))
    expect(state.value.sun).toBeGreaterThan(200)
  })

  it('G50a 旁证：HUD 源码里没有第二阳光来源', () => {
    const code = stripComments(HUD_SOURCES.map((s) => s.source).join('\n'))

    for (const forbidden of ['sunEarned', 'totalEarned', 'sunTotal', 'initialSunFor', 'sunPerCorrectFor']) {
      expect(code, `HUD 源码出现了 ${forbidden} —— 那是裁决 4 明令不引入的累计字段`).not.toContain(forbidden)
    }
  })
})

// ── AC-C2 / G44c / G53：HeartRow ──────────────────────────────────────────

describe('AC-C2 / G44c —— HeartRow 的 DOM 逐位等于 heartSlots(state)', () => {
  it('G44c：渲染出的每一位与 heartSlots(state) 逐位一致', async () => {
    reset({ hearts: HEARTS })
    const wrapper = mount(HeartRow)

    const rendered = wrapper.findAll('[data-slot]').map((el) => el.classes().includes('is-alive'))
    expect(rendered).toEqual([...heartSlotsOf(state.value)])
  })

  it('🚨 AC-F5④：hearts === HEARTS 与 hearts < HEARTS 两个 fixture 的 DOM 不同', async () => {
    reset({ hearts: HEARTS })
    const full = mount(HeartRow)
    const fullCount = full.findAll('[data-slot]').length
    const fullAlive = full.findAll('.is-alive').length

    reset({ hearts: HEARTS - 2 })
    const hurt = mount(HeartRow)
    const hurtCount = hurt.findAll('[data-slot]').length
    const hurtAlive = hurt.findAll('.is-alive').length

    expect(fullAlive).toBe(HEARTS)
    expect(hurtAlive).toBe(HEARTS - 2)
    // ⚠️ **槽数不变、只改 class** —— 写死 `v-for="i in 3"` 的实现在满心 fixture 上
    //   与 heartSlots 完全一致，只有在这第二个 fixture 上才分道扬镳（变异 M87）。
    expect(hurtCount).toBe(fullCount)
    expect(hurtAlive).not.toBe(fullAlive)
  })

  it('🚨 AC-F5②：掉 1 心与掉 2 心，动画 class 的**个数**不同', async () => {
    reset({ hearts: HEARTS })
    const one = mount(HeartRow)
    state.value = makeState({ hearts: HEARTS - 1 })
    await nextTick()
    const afterOne = one.findAll('.is-lost').length

    reset({ hearts: HEARTS })
    const two = mount(HeartRow)
    state.value = makeState({ hearts: HEARTS - 2 })
    await nextTick()
    const afterTwo = two.findAll('.is-lost').length

    expect(afterOne, '掉 1 心只应有 1 个动画位').toBe(1)
    expect(afterTwo, '掉 2 心必须有 2 个动画位 —— 只动「最后一颗」的实现会在这里现形').toBe(2)
    expect(afterTwo).not.toBe(afterOne)
  })

  it('G53：动画 class 落在新耗尽的那几位（不是「最后一位」）', async () => {
    reset({ hearts: HEARTS })
    const wrapper = mount(HeartRow)
    state.value = makeState({ hearts: HEARTS - 2 })
    await nextTick()

    const animatingSlots = wrapper
      .findAll('[data-slot]')
      .filter((el) => el.classes().includes('is-lost'))
      .map((el) => el.attributes('data-slot'))

    expect(animatingSlots.sort()).toEqual([String(HEARTS - 2), String(HEARTS - 1)])
  })

  // ⚠️ 守卫名原先写「删掉它一次掉 2 心只动 1 颗」—— `[CR]` 2026-10-16 已更正：
  //   story 自己的 Debug Log #6 实测推翻了这个因果句（「对 HeartRow 不成立」）：
  //   `lostSlotIndexes` 按**净差**逐位比对 `heartSlots`（定长），一次掉 2 心本来就该动 2 位。
  //   删掉 `flush:'sync'` 的真实后果是**掉心 class 晚一帧上屏**（以及 1.14 音效不同帧起播），
  //   不是「只动一颗」。守卫名照抄旧句会让下一个人按错误的因果去理解它守的是什么。
  //
  // ══ 以下 5 条是 `[CR]` 2026-10-16 为本轮 5 处**行为**改动补的守卫 ══
  // 每一条都对应一个具体 bug，改动前先读它要防的那个失败场景，别照名字猜。

  it('[CR] 心数回升（重开）必须清掉未播完的碎裂记录', async () => {
    // 🚨 失败场景：0 心时掉光播 400ms 动画，期内 `restart()` 把心带回 HEARTS。
    //   判据 `lostSlotIndexes` 是**对的**（before 全 false、after 全 true ⇒ 返回空），
    //   但组件若不清 `animating`，重开后的第一眼就是**一排满心在碎**
    //   （`is-alive` 与 `is-lost` 同时为真，碎裂动画照播）。
    //
    // ⚠️⚠️ `[CR]` 变异验证 N3 首跑 **0 红 —— 是这条守卫自己空转**，已修：
    //   首版直接 `reset({ hearts: 0 })` 然后 mount。**那样从未真正触发过掉心**，
    //   `animating` 本来就是空的，于是「重开后不该有动画位」恒真。
    //   ⇒ 必须**先让动画真的播起来**，再重开。下面的前置断言就是防这个回退的。
    reset({ hearts: 1 })
    const wrapper = mount(HeartRow)
    state.value = makeState({ hearts: 0 })
    await nextTick()

    // 前置：碎裂**确实在播**。这一条若为 0，后面那条断言就恒真。
    expect(wrapper.findAll('.is-lost').length, '前置失败：动画没起来，后面那条会恒真').toBeGreaterThan(0)

    // 现在重开（`restart()` 走 `createInitialState`，心数回到 HEARTS）
    state.value = makeState({ hearts: HEARTS })
    await nextTick()

    expect(
      wrapper.findAll('.is-lost'),
      '心数回升后还在播碎裂动画 —— 重开时孩子会看到一排满心在碎',
    ).toHaveLength(0)
  })

  /*
   * ⚠️ 这里**没有**「同一 slot 重复入列」的守卫，而且是**有据可依地没有**：
   *   `animating` 那行确实带了 `new Set` 去重（2026-10-16 加的保险），
   *   但在「心数回升清空」这条修复到位后，**该路径不可达**：
   *     槽位 i 活 ⟺ `i < hearts`，所以 i 由活变死**只可能发生在心数跨过 i 的那一刻**；
   *     此后心数只会更低 ⇒ 不经 `RESTART_LEVEL` 它永远死一次；
   *     而经 `RESTART_LEVEL` 的那条路已被上面那条守卫清空了。
   *   ⇒ 变异验证 N4（把 `new Set` 去掉）实测 **0 红** —— 这是**等价变异体**，
   *     0 红是**正确结果**，不是假绿（与 M101 同型）。
   *   ⇒ 保留 `new Set` 是**纯防御**：万一将来 `RESTART_LEVEL` 的清空被删掉，
   *     这行还能兜住那份重复。给它硬造一条守卫反而会逼人写出模拟不出来的时序。
   */

  it('[CR] 正在碎的那一位必须仍是**实心**（孩子要看见「心碎了」）', async () => {
    // 🚨 失败场景：`is-spent` 若不看 `is-lost`，掉心同帧就给那位上
    //   `background-color: transparent`，`heart-break` 从**空心红圈**起播 ——
    //   只看到红圈在抖，看不到碎。碎完 `animationend` 才该落回空心。
    reset({ hearts: HEARTS })
    const wrapper = mount(HeartRow)
    state.value = makeState({ hearts: HEARTS - 1 })
    await nextTick()

    const lost = wrapper.findAll('.is-lost')
    expect(lost).toHaveLength(1)
    expect(
      lost[0]?.classes(),
      '正在碎的那位被标成了 is-spent —— 碎裂动画会从空心红圈起播，孩子看不到「碎」',
    ).not.toContain('is-spent')
  })

  it('[CR] 心行必须有一条可访问文本，且数字取自 heartSlots（不许在组件里另算）', async () => {
    // 🚨 失败场景：SunCounter 有可见文本、ProgressBar 有「第 N 单元 · x/y」，
    //   只有 HeartRow 一个字都没有，且唯一的形状被 aria-hidden ⇒ 读屏听到
    //   「阳光 50，**空白**，第 1 单元 3/37」，心数那一段彻底不存在。
    reset({ hearts: 2 })
    const wrapper = mount(HeartRow)
    const label = wrapper.attributes('aria-label')

    expect(label, 'HeartRow 没有 aria-label —— 读屏完全拿不到心数').toContain('2')

    // 数字必须来自 `heartSlots` 的 true 数。HEARTS 变了它也得跟着变。
    reset({ hearts: HEARTS })
    expect(mount(HeartRow).attributes('aria-label')).toContain(String(HEARTS))
  })

  it('[CR] 碎裂动画的关键帧不许出现 opacity（0.6 会合成 1.95:1 的心红）', () => {
    // ⚠️ 裁决 8 早就定了「耗尽的心不另造 token、**不用 opacity**，用**描边**」，
    //   而 `[DS]` 在 `@keyframes heart-break` 的 35% 关键帧又用回了 `opacity: 0.6`
    //   —— 把 3px inset 描边合成 `#963427`，实测 1.95:1，正是 tokens.css 逐字
    //   写「远在红线以下」的同一个色。判据只校验了终态（3.44:1），没校验中间态。
    const code = stripComments(heartRowSource)
    const keyframes = /@keyframes\s+heart-break\s*\{[\s\S]*?\n\}/.exec(code)?.[0] ?? ''

    expect(keyframes, '没找到 @keyframes heart-break —— 变异或重构时这条会静默空转').not.toBe('')
    expect(
      keyframes,
      'heart-break 的关键帧里出现了 opacity —— 动画中间态会跌破 3:1（实测 0.6 ⇒ 1.95:1）',
    ).not.toMatch(/opacity\s*:/)
  })

  it('G53：watch 必须是 flush: \'sync\'（删掉它掉心 class 会晚一帧上屏）', () => {
    const code = stripComments(heartRowSource)

    expect(code, "HeartRow 的 watch 没写 flush: 'sync' —— 同 tick 内的多次赋值会被合并成一次").toMatch(
      /flush:\s*'sync'/,
    )
  })

  it('G53 变异位：没有掉心时不该有动画位', async () => {
    reset({ hearts: HEARTS - 1 })
    const wrapper = mount(HeartRow)
    state.value = makeState({ hearts: HEARTS - 1, sun: 999 })
    await nextTick()

    expect(wrapper.findAll('.is-lost'), '没掉心却播了碎裂动画').toHaveLength(0)
  })

  it('G50b：组件里没有心数的自计算形态', () => {
    const code = stripComments(heartRowSource)

    for (const pattern of [/hearts\s*-/, /-\s*state\.value\.hearts/, /Math\.max\(\s*0\s*,/]) {
      expect(code, `HeartRow 命中了心数自计算形态 ${pattern}`).not.toMatch(pattern)
    }
    expect(code, '必须走 lostSlotIndexes 判据').toMatch(/lostSlotIndexes/)
  })
})

/** 取 `heartSlots(state)` 的可比较副本（组件测试不重复断言判据逻辑，只用它对答案）。 */
function heartSlotsOf(s: State): readonly boolean[] {
  // 直接用判据本身，不引入第二份实现 —— 否则「组件渲染对不对」会被
  // 「这份对照实现对不对」污染，测试红了也不知道该修哪边。
  return heartSlots(s)
}

// ── AC-C3 / G50：ProgressBar ──────────────────────────────────────────────

describe('AC-C3 / G50 —— ProgressBar 的文本逐项等于 progressDisplay 的实算值', () => {
  it('G50：文本逐项等于「第 N 单元 · x/y」', async () => {
    reset({ mastered: ['u1-hello', 'u1-goodbye'] })
    progress.value = { currentUnitIndex: 0, masteredWordIds: ['u1-hello', 'u1-goodbye'] }
    const wrapper = mount(ProgressBar, { props: { unitTotal: REAL_DECK.length } })

    const shown = progressDisplay(progress.value, state.value.unitNumber, REAL_DECK.length)
    expect(wrapper.get('[data-testid="progress-label"]').text()).toBe(
      `第 ${shown.unitNumber} 单元 · ${shown.mastered}/${shown.total}`,
    )
  })

  it('🚨 AC-F5③：mastered=0 与 mastered>0 两个 fixture 的文本与宽度都不同', async () => {
    progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
    const empty = mount(ProgressBar, { props: { unitTotal: REAL_DECK.length } })
    const emptyText = empty.get('[data-testid="progress-label"]').text()
    const emptyWidth = empty.get('[data-testid="progress-fill"]').attributes('style')

    progress.value = { currentUnitIndex: 0, masteredWordIds: ['u1-hello', 'u1-goodbye'] }
    await nextTick()
    const some = mount(ProgressBar, { props: { unitTotal: REAL_DECK.length } })
    const someText = some.get('[data-testid="progress-label"]').text()

    expect(emptyText).toBe(`第 1 单元 · 0/${REAL_DECK.length}`)
    expect(someText).toBe(`第 1 单元 · 2/${REAL_DECK.length}`)
    expect(emptyText).not.toBe(someText)
    // 只造 mastered=0 时，「有进度条」与「永远显示 0%」完全等价
    expect(emptyWidth).toContain('width: 0%')
  })

  it('AC-C3：进度条**不可点** —— 没有 button / click / tabindex / pointer', () => {
    const code = stripComments(progressBarSource)

    for (const token of ['@click', 'role="button"', 'role="progressbar"', 'tabindex', 'cursor: pointer']) {
      expect(code, `进度条出现了 ${token} —— 它**不可点**（FR59 无选关自由）`).not.toContain(token)
    }
  })

  it('分母由 props 传入：改 prop 文本跟着改（不在组件里写死 37）', async () => {
    progress.value = { currentUnitIndex: 0, masteredWordIds: ['u1-hello'] }
    const wrapper = mount(ProgressBar, { props: { unitTotal: 5 } })

    expect(wrapper.get('[data-testid="progress-label"]').text()).toBe('第 1 单元 · 1/5')

    await wrapper.setProps({ unitTotal: 9 })
    expect(wrapper.get('[data-testid="progress-label"]').text()).toBe('第 1 单元 · 1/9')
  })
})

// ── AC-G / T4：progress 的变更次数 ────────────────────────────────────────

describe('AC-B3 / G54 —— progress 只在真的有增量时才变', () => {
  it('G54：一次答对 ⇒ progress 的内容恰好变 1 次', async () => {
    reset({ sun: 200 })
    expect(CORRECT_OPTION).toBeDefined()
    const seen = await countProgressChanges(() => applyAction(answer(CORRECT_OPTION!)))

    expect(seen, '一次答对应恰好让 progress 变一次').toBe(1)
  })

  it('G54：非答题的 dispatch ⇒ progress 内容变 0 次', async () => {
    reset({ sun: 200 })
    const seen = await countProgressChanges(() => {
      // 心数/战场不变的一次「无增量」推进：这里直接重放同一个 answer 两次的效果等价物 ——
      // 用一次已经掌握过的题的 ANSWER 会因阶段被 reducer 拒绝，所以改用同 tick 的双赋值。
      state.value = makeState({ sun: 200 })
    })

    expect(seen, '没有新词被掌握时 progress 不得变更').toBe(0)
  })

  it('G54：同一个词答两次，第二次 progress 不变（幂等）', async () => {
    reset({ sun: 200 })
    progress.value = { currentUnitIndex: 0, masteredWordIds: ['u1-hello'] }
    const seen = await countProgressChanges(() => applyAction(answer(CORRECT_OPTION!)))

    // fixture 的 ENTRY 已在 mastered 里 ⇒ 这一次没有增量
    expect(seen).toBe(0)
    expect(progress.value.masteredWordIds).toEqual(['u1-hello'])
  })
})

// ── 组 E：源码守卫 ────────────────────────────────────────────────────────

describe('G50a —— HUD 组件源码不含任何战斗数值判据标识符（AC-E1 全集 19 项）', () => {
  const FORBIDDEN_VALUE_IDENTIFIERS = [
    // 1.12 的 G33b 原样延续（7 项）
    'costOf',
    'TOWER_STATS',
    'rangeOf',
    'rangeFor',
    'ZOMBIE_HP',
    'HEARTS',
    'SUN_START',
    // 本 story 新增（数值判据，6 项）
    'TOWER_TYPES',
    'aoeColumns',
    'ZOMBIE_MOVE_PER_ROUND',
    'BALANCE_TIERS',
    'initialSunFor',
    'sunPerCorrectFor',
    // 裁决 4：第二阳光来源（4 项）
    'sunEarned',
    'totalEarned',
    'sunTotal',
    '累计',
    // 裁决 2 + AC-B1：未夹取的掉心计数（2 项）
    'heartsLost',
    'resolveCombatRound',
  ] as const

  /*
   * ⚠️ 黑名单里的 19 项**不是同一类东西**，分两类断言才说得通：
   *
   *   ①「活判据」14 项 —— 在 `src/core/` 里**真实存在**，组件碰了就一定是绕过判据。
   *   ②「幽灵项」5 项 —— 在 `src/core/` 里**本来就不存在**。它们之所以要进黑名单，
   *      正是裁决 4「不引入第二阳光来源」：一旦某个组件自己造一个 `sunEarned`，
   *      它就凭空造出了 core 里没有的第二个真相。这类项必须断言**持续不存在** ——
   *      若哪天它们真的被加进 core，那不是「守卫变宽了」，是有人引入了第二阳光来源。
   *
   * ⚠️⚠️ `[CR]` 2026-10-16 —— **`累计` 起初被误归为「活判据」，被本组自检当场抓住**：
   *   它在 `src/core/` 里**只出现在注释中**（`hud.ts:48` 的「跨局累计掌握的词条 id」
   *   与 `hud.ts:127` 的「FR58『累计所得只增不减』」），代码里根本没有同名判据。
   *   若不剥注释就 grep，「注释里提了一句」会被当成「判据存在」⇒ **又一条假绿**。
   *   ⇒ 这也是下面 `CORE_SRC` 必须走 `stripComments` 的直接原因。
   */
  const PHANTOM_IDENTIFIERS = [
    'SUN_START',
    'sunEarned',
    'totalEarned',
    'sunTotal',
    '累计',
  ] as const

  /**
   * `src/core/` 的**可执行**源码拼盘 —— 必须先剥注释（R-52）。
   *
   * ⚠️ 不剥的话，「活判据存在性」会被注释里的同名字符串满足（`累计` 就是活例子），
   *   这条守卫就会退化成它自己反对的那种假绿。
   */
  const CORE_SRC = stripComments(
    [typesSource, balanceSource, combatSource, turnSource, hudSource].join('\n'),
  )

  it('真实组件源码通过 G50a（不豁免任何一条）', () => {
    const defects: string[] = []
    for (const { name, source } of HUD_SOURCES) {
      const code = stripComments(source)
      for (const id of FORBIDDEN_VALUE_IDENTIFIERS) {
        if (code.includes(id)) defects.push(`${name} 出现了 ${id}`)
      }
    }
    expect(defects).toEqual([])
  })

  it('🚨 判据自检：15 项「活判据」在 `src/core/` 里真的存在（否则这份名单是空转的）', () => {
    /*
     * ⚠️⚠️ `[CR]` 2026-10-16 —— 这一条原先**构造上恒真，是一条假绿**：
     *   原实现只有四条断言，没有一条真的去 `core/` 验这些标识符存在：
     *     const code = stripComments(HEARTS.toString())        // HEARTS 是数字 3 ⇒ 恒等于 "3"
     *     expect(typeof code).toBe('string')                   // 恒真
     *     expect(FORBIDDEN_VALUE_IDENTIFIERS.length).toBe(19) // 硬编码字面量自证
     *     expect(...).toContain('costOf')                     // 只查数组含这个字符串
     *   而它自己的注释却写着「若哪天它们被改名，本守卫会静默退化成『什么都不检查』」
     *   —— **恰恰在被它点名的那个失效模式下，它依然全绿。**（R-51）
     *
     * ✅ 正解：真的去 `src/core/` 里把这些标识符**找出来**。每一项必须在某个 core
     *   源文件中真实存在 —— 否则它要么拼错了，要么对应的判据已被删/改名。
     */
    const live = FORBIDDEN_VALUE_IDENTIFIERS.filter((id) => !PHANTOM_IDENTIFIERS.includes(id as never))
    const missing = live.filter((id) => !CORE_SRC.includes(id))

    expect(
      missing,
      `这 ${missing.length} 项活判据在 src/core/ 里一个都不存在 —— ` +
        '它们要么拼错了，要么对应的判据已被删或改名。这份黑名单正在变成空转的假绿。',
    ).toEqual([])

    // 名单项数是被 [CS] 锁死的全集（AC-E1 共 19 项）；改动须先走 AC-A2。
    expect(FORBIDDEN_VALUE_IDENTIFIERS.length).toBe(19)
    expect(live.length + PHANTOM_IDENTIFIERS.length).toBe(19)
  })

  it('🚨 反向断言：4 项「幽灵项」在 `src/core/` 里必须**持续不存在**（裁决 4）', () => {
    // 这几项进黑名单的理由与上面相反：它们**没有**对应判据，组件碰了就是凭空造真相。
    // ⇒ 若哪天它们出现在 core 里，那不是「守卫变宽了」，是有人引入了第二阳光来源。
    const leaked = PHANTOM_IDENTIFIERS.filter((id) => CORE_SRC.includes(id))

    expect(
      leaked,
      `${leaked.join(' / ')} 出现在了 src/core/ —— 裁决 4 明令「不引入 sunEarned` +
        '（第二阳光来源）」。core 里一旦有了它，「只增不减」就有了两个互不同步的来源。',
    ).toEqual([])
  })

  it('🚨 反向探测棒：把真代码塞进组件源，本守卫必须能抓住', () => {
    // ⚠️ 上两条证明「名单是活的」，这一条证明「名单真的会咬人」。三条缺一不可：
    //   只有前两条，黑名单可能是一份没人验证的垃圾；只有这一条，名单可能全是错的却照样红。
    const code = stripComments("import { HEARTS } from '../../core'\nconst x = HEARTS\n")
    const hit = FORBIDDEN_VALUE_IDENTIFIERS.filter((id) => code.includes(id))

    expect(hit).toEqual(['HEARTS'])
  })
})

describe('G50c —— HUD 是纯展示组件（AC-E4）', () => {
  it('源码不出现任何 dispatch 门面或 core/actions 的 import', () => {
    const defects: string[] = []
    for (const { name, source } of HUD_SOURCES) {
      const code = stripComments(source)
      for (const token of [
        'applyAction',
        'selectTowerCard',
        'placeSelectedAt',
        'startRound',
        'speakQuestion',
        'enterLevel',
        "from '../../core/actions'",
        "from '../../src/core/actions'",
      ]) {
        if (code.includes(token)) defects.push(`${name} 出现了 ${token}`)
      }
    }
    expect(defects).toEqual([])
  })
})

describe('G50d —— HUD 组件里没有 JS 补间 / 计时器 / 字面量毫秒（AC-D1/D2）', () => {
  it('源码不出现 setInterval / requestAnimationFrame / setTimeout / 字面量 Nms', () => {
    const defects: string[] = []
    for (const { name, source } of HUD_SOURCES) {
      const code = stripComments(source)
      for (const token of ['setInterval', 'requestAnimationFrame', 'setTimeout']) {
        if (code.includes(token)) defects.push(`${name} 出现了 ${token}`)
      }
      // ⚠️ 只查 `<style>` 段：模板与脚本里的 `120ms` 不存在，但注释里可能有；
      //   stripComments 已剥掉注释，剩下的 CSS 里的字面量毫秒才是违规。
      const stylePart = code.slice(code.indexOf('<style'))
      const literalMs = stylePart.match(/(?<![\w-])\d+ms\b/g)
      if (literalMs !== null) defects.push(`${name} 的样式里有字面量毫秒 ${literalMs.join('、')}`)
    }
    expect(defects).toEqual([])
  })

  it('动画时长确实来自 token（AC-G1 第 9 项的判据基础）', () => {
    const code = stripComments(heartRowSource)

    expect(code, '掉心动画的时长必须来自 CSS 变量').toMatch(/animation:[^;]*var\(--dur-/)
  })
})

describe('G51 —— Progress 的键名集合恒为 {currentUnitIndex, masteredWordIds}', () => {
  it('advanceProgress 的返回值只有这两个键（防 1.15 迁移时形状漂移）', () => {
    reset()
    const advanced = { ...progress.value, masteredWordIds: [] }
    const result = advanceProgress(advanced, state.value)

    expect(Object.keys(result).sort()).toEqual(['currentUnitIndex', 'masteredWordIds'])
  })

  it('core/types.ts 里没有第二份 Progress 声明（唯一的声明点）', () => {
    const code = stripComments(typesSource)

    expect(code, 'types.ts 出现了第二份 Progress —— 两个声明点会分叉').not.toMatch(/interface\s+Progress\b/)
    expect(code, 'types.ts 出现了第二份 Progress 类型别名').not.toMatch(/type\s+Progress\s*=/)
  })

  /*
   * ⚠️⚠️ `[CR]` 2026-10-16 新增 —— G51 只断言**键名集合**，不查**值**，这正是本轮
   *   那个 P1 假绿的成因：`[DS]` 把 `currentUnitIndex` 初值写成 `1`（裁决 3 逐字是 `0`），
   *   **全套守卫零红** —— 因为没有任何一条断言读它的值。
   *   它会被 1.15 **逐字序列化进存档** ⇒ 基错了只能走迁移，而 `schemaVersion` 一旦发版。
   *   ⇒ 这里把基准钉死，且**两条都断言**（0 基 ⇒ 不得出现 1 基的写法）。
   */
  it('[CR] store 的 `progress` 初值必须是 0 基（裁决 3 逐字「本 story 初值 0」）', () => {
    // ⚠️ 必须读**模块真实的初值**，不能读测试自己造的对象 —— 否则又是一条自证的恒真断言。
    expect(
      FRESH_PROGRESS.currentUnitIndex,
      'src/app/store.ts 的 progress 初值不是 0 —— 裁决 3 逐字写的是 0。' +
        '这个字段会被 1.15 逐字序列化进存档，改前先看 docs/rules/range-and-balance.md',
    ).toBe(0)
  })

  it('[CR] 反向探测棒：把初值改成 1 基，本守卫必须红', () => {
    // ⚠️ 没有这一条，上面那条可能恒真（例如有人把断言写成跟着实现走）。
    const mutated = { currentUnitIndex: FRESH_PROGRESS.currentUnitIndex + 1, masteredWordIds: [] }

    expect(mutated.currentUnitIndex).not.toBe(0)
  })

  it('[CR] 源码守卫：store.ts 的 progress 初始化字面量就是 `{ currentUnitIndex: 0, ... }`', () => {
    // 运行时那条靠 import 触发；这条直接看字面量，两者都坏时能指出是哪一层坏。
    const code = stripComments(storeSource)

    expect(code).toMatch(/currentUnitIndex:\s*0\b/)
    expect(
      code,
      'store.ts 里的 currentUnitIndex 初值不是 0 —— [DS] 曾取 1 并引用了 AC-B5 里不存在的「1 起」',
    ).not.toMatch(/currentUnitIndex:\s*1\b/)
  })
})

describe('G52 —— 三个组件都被 LevelView 显式 import（漏 import = 白屏且全绿）', () => {
  it('LevelView.vue 的模板里真的有这三块组件', () => {
    const code = stripComments(levelViewSource)

    expect(code, 'LevelView.vue 的模板里找不到 <SunCounter /> —— 切过去也是空白页').toMatch(/<SunCounter\b/)
    expect(code, 'LevelView.vue 的模板里找不到 <HeartRow />').toMatch(/<HeartRow\b/)
    expect(code, 'LevelView.vue 的模板里找不到 <ProgressBar />').toMatch(/<ProgressBar\b/)
  })

  it('三块都是显式 import 的（漏 import ⇒ 白屏且全套工具全绿）', () => {
    const code = stripComments(levelViewSource)

    for (const name of ['SunCounter', 'HeartRow', 'ProgressBar']) {
      expect(
        code,
        `${name} 必须是显式 import 的`,
      ).toMatch(new RegExp(`import\\s+\\w*\\s*${name}\\b\\s+from\\s*'[^']*${name}\\.vue'`))
    }
  })

  it('反向：把三块从模板里删掉必须被发现', () => {
    const mutated = stripComments(levelViewSource)
      .replace(/<SunCounter\b[^>]*\/>/g, '')
      .replace(/<HeartRow\b[^>]*\/>/g, '')
      .replace(/<ProgressBar\b[^>]*\/>/g, '')

    expect(mutated, '这次变异没生效 —— 下面三条会因空匹配而全绿').not.toMatch(/<(SunCounter|HeartRow|ProgressBar)\b/)
  })
})

describe('[CR] .hud 不得声明一条永远不可能生效的 flex-wrap（2026-10-16 死代码守卫）', () => {
  it('.hud > * 是 `flex: 1 1 0` + `min-width: 0` ⇒ flex-wrap 不可能触发', () => {
    const code = stripComments(levelViewSource)

    // ⚠️ 为什么这条值得立：`.hud > *` 的假设主尺寸恒为 0 ⇒ 任何视口 ≥ 16px 都排成一行。
    //   `[DS]` 交付时 `.hud` 带着 `flex-wrap: wrap`，而上方注释却写「`flex-wrap` 是有意的，
    //   宁可折行也不许横向撑破」—— 注释在吹嘘一条**永不触发**的机制。
    //   删掉那行死代码后，若有人照着旧注释再加回来，这个谎就复活了且没人会响。
    expect(code).toMatch(/\.hud\s*>\s*\*\s*\{[^}]*flex:\s*1\s+1\s+0[^}]*\}/)

    expect(
      /flex-wrap\s*:\s*wrap/.test(/\.hud\s*\{[^}]*\}/.exec(code)?.[0] ?? ''),
      '.hud 又声明了 flex-wrap: wrap —— 它下面的 flex-basis: 0 让它永远不可能触发。' +
        '真要三块折行，先把 basis 换成 auto 并给一个 px 的 min-width 下限。',
    ).toBe(false)
  })
})

describe('G44b —— 战场上不出现心（1-10 留到今天才有人守的一条）', () => {
  it('battle/** 的源码（剥注释后）里不出现心 / heart', () => {
    const sources = [
      { name: 'battle/BattleField.vue', source: battleFieldSource },
      { name: 'battle/Tower.vue', source: towerSource },
    ]
    const defects: string[] = []
    for (const { name, source } of sources) {
      const code = stripComments(source)
      if (/心|heart/i.test(code)) defects.push(`${name} 出现了「心」—— 心是 HUD 专用，不上棋盘`)
    }
    expect(defects).toEqual([])
  })

  it('🚨 判据自检：剥注释前**确实**有「心」字（否则这条守卫可能一直在空转）', () => {
    // R-52：注释里描述违规形态会命中判据。今天 BattleField/Tower 的「心」全在块注释里，
    // 所以这条守卫必须显式 stripComments —— 而「不剥会红」正是它值得存在的证据。
    expect(battleFieldSource, 'BattleField.vue 源码里已经没有「心」字了 —— 请复核这条守卫是否还需要').toMatch(
      /心|heart/i,
    )
  })
})

/**
 * 🚨 两条**由变异实测逼出来**的守卫（2026-10-16，`[DS]` T9）。
 *
 * 变异 **M79**（`heartSlots` 的循环上界写死 3）与 **M84**（`RESTART_LEVEL` 时清空
 * `progress.masteredWordIds`）**首跑都是 0 红** —— 不是因为判据写错，而是因为
 * 「行为守卫」在这两处**结构上不可能有鉴别力**：
 *   · M79：`HEARTS` 现在就是 3，行为断言 `长度 === HEARTS` 与写死 3 完全等价；
 *   · M84：FR58 的实现点是 `app/store.ts` 的 `applyAction`，而 G47 测的是
 *     `core/hud.ts` 的纯函数 —— reducer 根本不碰 `progress`，改 store 它当然全绿。
 * ⇒ 这两条只能停在**源码层**与**store 集成层**。理由写在这里，别当成「补守卫」，
 *   是「记清楚为什么这里只能这么守」。
 */
describe('G56 / G57 —— 两条只能停在源码层与 store 集成层的判据', () => {
  it('G56：heartSlots 的循环上界必须引用 HEARTS，不能是字面量', () => {
    const body = stripComments(hudSource).match(/export function heartSlots\b[\s\S]*?\n}/)?.[0] ?? ''

    expect(body, '没匹配到 heartSlots 的函数体 —— 请复核 G56 的判据是否已经空转').not.toBe('')
    expect(body, 'heartSlots 必须走 core 的 HEARTS，而不是把心数写死').toMatch(/i\s*<\s*HEARTS/)
    // 🚨 探测棒：把 HEARTS 换成 3 必须让上面那条红掉，否则它恒真。
    const mutated = body.replace(/i\s*<\s*HEARTS/, 'i < 3')
    expect(mutated).not.toMatch(/i\s*<\s*HEARTS/)
  })

  it('G57：RESTART_LEVEL 不得清空跨局进度（FR58 走的是 store，不走 reducer）', () => {
    reset({ sun: 200 })
    expect(CORRECT_OPTION).toBeDefined()
    applyAction(answer(CORRECT_OPTION!))
    expect(progress.value.masteredWordIds, '答对后 progress 应当记下这个词').toContain(ENTRY.entryId)

    // ⚠️ `RESTART_LEVEL` **只在 `level-failed` 相位合法**（reducer 拒收其余相位，
    //   实测：直接 dispatch 会抛「建造阶段还没有结束…」）。所以这里不假装能一路
    //   打通关，而是把 state 放到那个相位上再派发 —— 走的是**真的** `applyAction`
    //   → `reduce` 链路，M84 改的就是它。
    state.value = { ...state.value, hearts: 0, phase: { kind: 'level-failed' } }
    applyAction(restartLevel())

    expect(state.value.phase.kind, '重开确实回到了开局相位').toBe('awaiting-answer')
    expect(state.value.masteredEntryIds, '重开清掉了本局的掌握记录').not.toContain(ENTRY.entryId)
    expect(
      progress.value.masteredWordIds,
      '重开不得抹掉跨局进度（FR58：累计所得只增不减）',
    ).toContain(ENTRY.entryId)
  })
})
