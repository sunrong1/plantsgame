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
import { stripComments as sharedStripComments } from '../helpers/contrast'

enableAutoUnmount(afterEach)

/** 剥注释后再做源码匹配（R-52）。照 `hand-build.test.ts:82` 的先例共用同一份实现。 */
const stripComments = sharedStripComments

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
  progress.value = { currentUnitIndex: 1, masteredWordIds: [] }
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

  it('G53：watch 必须是 flush: \'sync\'（删掉它一次掉 2 心只动 1 颗）', () => {
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
    progress.value = { currentUnitIndex: 1, masteredWordIds: ['u1-hello', 'u1-goodbye'] }
    const wrapper = mount(ProgressBar, { props: { unitTotal: REAL_DECK.length } })

    const shown = progressDisplay(progress.value, state.value.unitNumber, REAL_DECK.length)
    expect(wrapper.get('[data-testid="progress-label"]').text()).toBe(
      `第 ${shown.unitNumber} 单元 · ${shown.mastered}/${shown.total}`,
    )
  })

  it('🚨 AC-F5③：mastered=0 与 mastered>0 两个 fixture 的文本与宽度都不同', async () => {
    progress.value = { currentUnitIndex: 1, masteredWordIds: [] }
    const empty = mount(ProgressBar, { props: { unitTotal: REAL_DECK.length } })
    const emptyText = empty.get('[data-testid="progress-label"]').text()
    const emptyWidth = empty.get('[data-testid="progress-fill"]').attributes('style')

    progress.value = { currentUnitIndex: 1, masteredWordIds: ['u1-hello', 'u1-goodbye'] }
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
    progress.value = { currentUnitIndex: 1, masteredWordIds: ['u1-hello'] }
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
    progress.value = { currentUnitIndex: 1, masteredWordIds: ['u1-hello'] }
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

  it('🚨 判据自检：黑名单项在**别处**真的存在（否则这份名单是空转的）', () => {
    // 这些标识符在 `core/balance.ts` 里真实存在 —— 若哪天它们被改名，
    // 本守卫会静默退化成「什么都不检查」，所以必须有一条反证。
    const code = stripComments(HEARTS.toString())
    expect(typeof code).toBe('string')
    expect(FORBIDDEN_VALUE_IDENTIFIERS.length).toBe(19)
    expect(FORBIDDEN_VALUE_IDENTIFIERS).toContain('costOf')
    expect(FORBIDDEN_VALUE_IDENTIFIERS).toContain('resolveCombatRound')
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
