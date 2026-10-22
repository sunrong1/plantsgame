/**
 * @vitest-environment jsdom
 */

/**
 * 手牌区与建塔放置的守卫（Story 1.12 / AC-C 全组、AC-D 全组、AC-E 全组、AC-F 全组）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **G30** 逐格比对：按下的那一格按下之后，`.is-in-range` 的格集合 === `coverCellsAt`
 * · **G31** `.battle-grid` 的直接子元素恰好 45 个且全是 `.battle-cell`（覆盖层是 cell 的**子**）
 * · **G32** 覆盖层 `z-index` 低于塔/僵尸、高于 `.is-house::before`（三方层序）
 * · **G33a/b** 组件源码不出现 `core/balance` 直连与战斗数值判据标识符
 * · **G34** 选中态**恰好一张** `.is-selected`
 * · **G35** 阳光不足的卡：`disabled` + 点击不 dispatch + DOM 与买得起的卡不同
 * · **G36** `endBuild` 之后 `selectedEntryId === null`
 * · **G37** `startRound()` 在非 `awaiting-build` 阶段不 dispatch；终态不 dispatch `CONTINUE`
 * · **G38** 手牌/覆盖层源码无定时器与字面量毫秒
 * · **G39** 无 `draggable` / `pointermove` / 铲除 action
 * · **G40** 手牌渲染顺序 === `state.unlocked`
 * · **G41** `pointerdown` / `pointerup` 两步：同格 1 次 dispatch，异格 0 次
 * · **G42** `placeSelectedAt` 返回 `true` 后 `selectedEntryId === null`
 *
 * ── 为什么这里用**真 store** 而不是 `vi.mock` ──────────────────────────────
 *   `placeSelectedAt` / `startRound` 是 store **内部闭包**去调 `applyAction`，
 *   `vi.spyOn(storeModule, 'applyAction')` **拦截不到**（ESM 命名导出只读、
 *   且模块内引用不走导出槽）。⇒ 「dispatch 了几次」只能数 `state.value`
 *   的**引用变更**：`reduce` 每次返回全新对象，而组件自己从不赋值
 *   `state.value`（硬约束：只有 `applyAction` 能写）。这两条前提都写在
 *   `countDispatches` 的注释里，改动前先读。
 *
 * ── 判据纪律（Story 1.9 的 P0）────────────────────────────────────────────
 *   每条源码判据只有**一份实现**，真守卫与变异用例问**同一个函数**，
 *   且源码一律先过 `stripComments()`（注释里出现该词不算违规，AC-G2）。
 */

import { mount, type VueWrapper, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, watch } from 'vue'

import { entriesOf } from '../../src/content'
import {
  COLS,
  ROWS,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  ZOMBIE_HP,
  HOUSE_COL,
  canBuildAt,
  cellKey,
  coverCellsAt,
  placementBlockedReason,
} from '../../src/core'
import type { Phase, State, TowerType, Zombie } from '../../src/core'
import {
  placeSelectedAt,
  selectedEntryId,
  selectTowerCard,
  startRound,
  state,
} from '../../src/app/store'
import BattleField from '../../src/components/battle/BattleField.vue'
import Tower from '../../src/components/battle/Tower.vue'
import HandCard from '../../src/components/hand/HandCard.vue'
import HandDeck from '../../src/components/hand/HandDeck.vue'

import battleFieldSource from '../../src/components/battle/BattleField.vue?raw'
import rangeOverlaySource from '../../src/components/battle/RangeOverlay.vue?raw'
import towerSourceRaw from '../../src/components/battle/Tower.vue?raw'
import handDeckSource from '../../src/components/hand/HandDeck.vue?raw'
import handCardSource from '../../src/components/hand/HandCard.vue?raw'
import typesSource from '../../src/core/types.ts?raw'
import { contrastMsg, contrastRatio, cssDecl, declValue, extractColor, overBlack, resolveColor, rgbaAlpha, stripComments as sharedStripComments, tokenValue } from '../helpers/contrast'
import { styleBlockOf } from '../helpers/css-cascade'

enableAutoUnmount(afterEach)

/**
 * 剥掉块注释、行注释与 HTML 注释，只留代码 —— 源码匹配的强制前置（R-52）。
 * 📎 [CR] 2026-10-16：实现移入 `tests/helpers/contrast.ts`，与 `quiz-card.test.ts`
 *   共用同一份。原先三个文件各抄一份，而其中一份还与另两份行为不同
 *   （删空串 vs 换行），那种分歧会以「误导性报错」的形式冒出来。
 */
const stripComments = sharedStripComments

// ── 测试用的 state 组装 ──────────────────────────────────────────────────────

const REAL_DECK = entriesOf(1)
/** 每种塔型各挑一个真词条 —— 造价与卡面文字都要走真实内容（FR70）。 */
const ENTRY_OF: Record<TowerType, string> = {
  direct: 'u1-hello',
  slow: 'u1-goodbye',
  aoe: 'u1-teacher',
}
const COST_OF: Record<TowerType, number> = { direct: 50, slow: 50, aoe: 75 }

/** 六种相位（AC-D6 的阶段维度）。`build` 是唯一能建塔的相位。 */
const PHASE_KINDS = [
  'awaiting-answer',
  'awaiting-build',
  'resolving',
  'round-over',
  'level-complete',
  'level-failed',
] as const

function phaseOf(kind: (typeof PHASE_KINDS)[number], unlocked: readonly string[], sun: number): Phase {
  // 📎 **1.19 CR：`awaiting-build` 现在自带题面**（存档恢复时卡面靠它渲染）。
  //   与下面 `awaiting-answer` 那一支**用同一个取法**：从 `REAL_DECK` 里按
  //   `unlocked[0]` 找，找不到就退回第 1 条 —— 两者都保证题面属于本题单，
  //   而「题面不属于题单」现在是 `assertInvariants` 的一条硬失败。
  if (kind === 'awaiting-build') {
    const question = REAL_DECK.find((entry) => entry.entryId === unlocked[0]) ?? REAL_DECK[0]
    return { kind, question, unlocked: [...unlocked], sun }
  }
  if (kind === 'awaiting-answer') {
    const question = REAL_DECK.find((entry) => entry.entryId === unlocked[0]) ?? REAL_DECK[0]
    return { kind, question }
  }
  return { kind } as Phase
}

interface BuildStateOptions {
  readonly phase?: (typeof PHASE_KINDS)[number]
  readonly sun?: number
  readonly unlocked?: readonly string[]
  /** 已占用的格（内部坐标）。 */
  readonly occupied?: readonly { readonly row: number; readonly col: number }[]
  readonly hearts?: number
  /** 场上僵尸。`zombieAtHouse` 是 G37 那条用例的快门：结算一次就到家。 */
  readonly zombies?: readonly Zombie[]
}

/** 造一份结构合法的 `State`（`awaiting-build` 相位镜像与 `unlocked`/`sun` 恒等）。 */
function makeState(options: BuildStateOptions = {}): State {
  const unlocked = options.unlocked ?? [ENTRY_OF.direct]
  const sun = options.sun ?? 1000
  const towers = (options.occupied ?? []).map((cell, index) => ({
    id: `t${index + 1}`,
    towerType: 'direct' as const,
    wordId: ENTRY_OF.direct,
    row: cell.row,
    col: cell.col,
  }))
  const grid: Record<string, string> = {}
  for (const tower of towers) grid[cellKey(tower.row, tower.col)] = tower.id
  return {
    unitNumber: 1,
    phase: phaseOf(options.phase ?? 'awaiting-build', unlocked, sun),
    turn: 1,
    hearts: options.hearts ?? 3,
    sun,
    grid,
    towers,
    zombies: options.zombies ?? [],
    deck: REAL_DECK,
    // ⚠️ `masteredEntryIds` 必须含 `unlocked`：reducer 的 `assertDeckRelations`
    //   有一条**比 AC-13 更强**的不变量「unlocked ⊆ mastered」——
    //   解锁的唯一途径是答对（`reducer.ts:495`）。这里给一份能过断言的 state。
    masteredEntryIds: [...unlocked],
    // 📎 Story 1.18 / AC-E4 新增的 State 字段。本夹具不测跳题，只为过编译。
    skippedEntryIds: [],
    unlocked: [...unlocked],
  }
}

/** 每个 `beforeEach` 都回到一份干净的 `awaiting-build`。 */
function reset(options: BuildStateOptions = {}): void {
  state.value = makeState(options)
  selectedEntryId.value = null
}

/**
 * 数「`state.value` 被换了多少次引用」= **dispatch 次数**。
 *
 * ⚠️ 成立的三条前提（改动前先确认它们还成立）：
 *   ① `reduce` 每次返回**全新对象**（`reducer.ts` 里唯一的 `return state`
 *      属于 `assertInvariants`，不在 dispatch 路径上）。
 *   ② 组件从不写 `state.value` —— 那是 `applyAction` 的专属权（store.ts 文件头）。
 *   ③ **`flush: 'sync'`** —— 默认的 `'pre'` 会把**同一个 tick 内的多次赋值合并成一次**
 *      回调，而 `startRound()` 的三连 dispatch 正是**同步连发**的。
 *      第一版漏了这条：`startRound` 明明发了 2 次，计数器只报 1。
 *      第三条漏掉时不会报错、只会**少报** —— 与 ①② 一样是假绿来源。
 */
async function countDispatches(run: () => void | Promise<void>): Promise<number> {
  const seen: State[] = []
  const stop = watch(
    state,
    (next) => {
      seen.push(next)
    },
    { flush: 'sync' },
  )
  // ⚠️ `run` 可以是 async：`trigger()` 返回的 promise 必须被 await 之后
  //   组件才重渲染完毕，否则数的是「按下之前」的状态（第一版就是这么空转的）。
  await run()
  await nextTick()
  stop()
  return seen.length
}

/** 场上的格子（内部坐标），`canBuildAt` 说了算。 */
function buildableCells(): readonly { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (canBuildAt(row, col)) cells.push({ row, col })
    }
  }
  return cells
}

function cellAt(wrapper: VueWrapper, row: number, col: number) {
  return wrapper.find(`.battle-cell[data-row="${row}"][data-col="${col}"]`)
}

/** DOM 里 `.is-in-range` 的格子集合（`cellKey` 形式），与 `coverCellsAt` 同格式。 */
function inRangeKeys(wrapper: VueWrapper): readonly string[] {
  return wrapper
    .findAll('.range-overlay.is-in-range')
    .map((node) => {
      const key = node.element.parentElement?.getAttribute('data-row')
      const col = node.element.parentElement?.getAttribute('data-col')
      return cellKey(Number(key), Number(col))
    })
    .sort()
}

/**
 * 数一段 HTML 里**深度为 1** 的 `<div>` 的 class —— 即「某个容器的直接子元素」。
 *
 * ⚠️ 只服务于反向夹具（G31/M62）：真断言问的是 mount 后的**真实 DOM**，
 *   这里的字符串解析只用来证明「把覆盖层挪成兄弟」这件事**可被判据看见**。
 *   解析不了就抛错，绝不静默返回 0 —— 一个恒返 0 的解析器会造出第二条假绿。
 */
function directChildClasses(html: string): readonly string[] {
  const inner = /^<div class="battle-grid">([\s\S]*)<\/div>$/.exec(html)?.[1]
  if (inner === undefined) {
    throw new Error(`夹具 HTML 必须是最外层就是 .battle-grid 的一段：${html}`)
  }
  const classes: string[] = []
  let depth = 0
  const tag = /<div\b([^>]*)>|<\/div>/g
  let match = tag.exec(inner)
  while (match !== null) {
    if (match[0] === '</div>') {
      depth -= 1
    } else {
      if (depth === 0) classes.push(/class="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? '')
      if (!match[0].endsWith('/>')) depth += 1
    }
    match = tag.exec(inner)
  }
  if (depth !== 0) throw new Error(`夹具 HTML 括号不配对：${html}`)
  return classes
}

/** 合规形态：覆盖层是 cell 的**子**元素。 */
const GOOD_INNER =
  '<div class="battle-grid"><div class="battle-cell"><div class="range-overlay"></div></div></div>'
/** 违规形态：覆盖层成了 grid 的**兄弟**（`.battle-cell` 少一个、`.range-overlay` 多一个）。 */
const BAD_INNER =
  '<div class="battle-grid"><div class="battle-cell"></div><div class="range-overlay"></div></div>'

function mountHandDeck(): VueWrapper {
  return mount(HandDeck)
}

function mountField(): VueWrapper {
  return mount(BattleField)
}

// ══════════════════════════════════════════════════════════════════════════════
// G40 —— 手牌渲染顺序 === state.unlocked（裁决 2：不排序、不分组）
// ══════════════════════════════════════════════════════════════════════════════

describe('G40 —— 手牌渲染顺序 === state.unlocked 顺序', () => {
  it('三条不同塔型的卡按解锁顺序渲染', () => {
    const unlocked = [ENTRY_OF.aoe, ENTRY_OF.direct, ENTRY_OF.slow]
    reset({ unlocked })
    const hand = mountHandDeck()
    const rendered = hand.findAllComponents(HandCard).map((node) => node.props('card').entryId)
    expect(rendered).toEqual(unlocked)
  })

  it('M72：把 handCards 按塔型排序（不再按解锁顺序）必须红', () => {
    // 反向夹具：**不改** core，只把「顺序 === 解锁顺序」这条判据反过来用 ——
    // 期望顺序改成排序后的顺序，真守卫就应当报它不匹配。
    const unlocked = [ENTRY_OF.aoe, ENTRY_OF.direct, ENTRY_OF.slow]
    reset({ unlocked })
    const hand = mountHandDeck()
    const rendered = hand.findAllComponents(HandCard).map((node) => node.props('card').entryId)
    const sortedByTowerType = [...rendered].sort()
    expect(rendered).not.toEqual(sortedByTowerType)
  })

  it('未解锁的卡不渲染', () => {
    reset({ unlocked: [ENTRY_OF.direct] })
    const hand = mountHandDeck()
    expect(hand.findAllComponents(HandCard)).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-C2 —— 一张卡三件套：塔图 + 单词文字 + 造价数字
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-C2 —— 手牌卡显示三样，缺一不可', () => {
  it('塔图 URL 走 expectedTowerAssetUrl', () => {
    reset()
    const card = mount(HandCard, {
      props: {
        card: {
          entryId: ENTRY_OF.direct,
          towerType: 'direct',
          label: 'Hello',
          cost: 50,
          affordable: true,
        },
        selected: false,
      },
    })
    const img = card.get('img')
    expect(img.attributes('src')).toContain('/assets/towers/direct.svg')
  })

  it('label 是 promptText 全文，不是 slug（裁决 5）', () => {
    reset()
    const entry = REAL_DECK.find((item) => item.entryId === 'u1-s-i-have-a-ball-for-my-dog')
    expect(entry).toBeDefined()
    const card = mount(HandCard, {
      props: {
        card: {
          entryId: 'u1-s-i-have-a-ball-for-my-dog',
          towerType: entry!.towerType,
          label: entry!.card.promptText,
          cost: 50,
          affordable: true,
        },
        selected: false,
      },
    })
    expect(card.get('.hand-card__label').text()).toBe('I have a ball for my dog.')
    expect(card.get('.hand-card__label').text()).not.toContain('-')
  })

  it('造价数字由 core 给，组件照抄不换算', () => {
    reset({ sun: 1000 })
    const hand = mountHandDeck()
    const card = hand.findAllComponents(HandCard)[0]
    expect(card.get('.hand-card__cost').text()).toBe(String(card.props('card').cost))
    expect(card.props('card').cost).toBe(COST_OF.direct)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G34 —— 选中态：恰好一张，不是「有的有有的没有」
// ══════════════════════════════════════════════════════════════════════════════

describe('G34 —— 选中态判据对同一批卡不是同一个值', () => {
  const three = [ENTRY_OF.direct, ENTRY_OF.slow, ENTRY_OF.aoe]

  it('任意时刻恰好一张 .is-selected', async () => {
    reset({ unlocked: three })
    const hand = mountHandDeck()
    expect(hand.findAll('.hand-card.is-selected')).toHaveLength(0)
    for (const entryId of three) {
      selectTowerCard(entryId)
      await nextTick()
      expect(hand.findAll('.hand-card.is-selected')).toHaveLength(1)
      expect(hand.get('.hand-card.is-selected').attributes('data-entry')).toBe(entryId)
    }
  })

  it('M66：去掉「非空」那一半（全部一起高亮）必须红', async () => {
    // 反向夹具：把「=== 1」放宽到「=== 全部」再问真判据 —— 放宽后的判据对
    // 真实渲染结果**不成立**，即：真实渲染永远不可能三张同时高亮。
    reset({ unlocked: three })
    const hand = mountHandDeck()
    selectTowerCard(ENTRY_OF.direct)
    // ⚠️ 必须 await：`selectTowerCard` 只改 ref，DOM 要等下一个 tick 才更新。
    //   少了这一行，「恰好一张」会量成 0 张 —— 一条**恒红**的假守卫。
    await nextTick()
    const selected = hand.findAll('.hand-card.is-selected').length
    expect(selected).not.toBe(three.length)
    expect(selected).not.toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D2 —— 取消选中的三条路径
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-D2 —— 取消选中的三条路径', () => {
  it('① 再点一次同一张卡 ⇒ 取消', async () => {
    reset()
    const hand = mountHandDeck()
    await hand.get('.hand-card').trigger('click')
    expect(selectedEntryId.value).toBe(ENTRY_OF.direct)
    await hand.get('.hand-card').trigger('click')
    expect(selectedEntryId.value).toBeNull()
  })

  it('② 点卡面区留白 ⇒ 取消选中（点在卡上不误伤）', async () => {
    reset()
    const hand = mountHandDeck()
    await hand.get('.hand-card').trigger('click')
    expect(selectedEntryId.value).not.toBeNull()
    await hand.get('.hand-deck__rail').trigger('click')
    expect(selectedEntryId.value).toBeNull()
  })

  it('② 点网格之外的留白 ⇒ 取消选中（点在格子上不误伤）', async () => {
    reset()
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await field.get('.battle-grid').trigger('click')
    expect(selectedEntryId.value).toBeNull()

    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    await cellAt(field, ZOMBIE_ROW, 3).trigger('click')
    expect(selectedEntryId.value).not.toBeNull()
  })

  it('③ 建塔成功后自动取消，且卡片保留在手里（FR33）', () => {
    reset()
    selectTowerCard(ENTRY_OF.direct)
    expect(placeSelectedAt(ZOMBIE_ROW, 3)).toBe(true)
    expect(selectedEntryId.value).toBeNull()
    expect(state.value.unlocked).toEqual([ENTRY_OF.direct])
    reset()
    const hand = mountHandDeck()
    expect(hand.findAllComponents(HandCard)).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G35 —— 阳光不足的卡：disabled + 不 dispatch + DOM 不同
// ══════════════════════════════════════════════════════════════════════════════

describe('G35 —— 阳光不足 ⇒ 变灰且不可点', () => {
  it('disabled 属性存在，点击后 0 次 dispatch，且 DOM 与买得起的卡不同', async () => {
    // ⚠️ 50 阳光：直射塔（50）刚好买得起、范围塔（75）买不起 ⇒
    //   解锁顺序写成 [aoe, direct] 才能让 `[0]` 是**买不起**的那张 ——
    //   写反了这条测试会变成「两张都买不起」，而断言仍然全绿。
    reset({ sun: 50, unlocked: [ENTRY_OF.aoe, ENTRY_OF.direct] })
    const hand = mountHandDeck()
    const [poor, rich] = hand.findAllComponents(HandCard)
    expect(poor!.props('card').affordable).toBe(false)
    expect(rich!.props('card').affordable).toBe(true)

    // ⚠️ 主判据是 `disabled` 属性，但真浏览器**不会**把 click 派发给 disabled 控件，
    //   jsdom 的 `dispatchEvent` 却会 —— 所以下面这条断言量的是
    //   **处理器内那道 `affordable` 守卫**（AC-C4 的第二条），不是浏览器行为。
    //   两条都要有，缺一条就有一种环境测不到它。
    expect(poor!.get('button').attributes('disabled')).toBeDefined()
    expect(rich!.get('button').attributes('disabled')).toBeUndefined()
    // DOM 不同（视觉上是变灰）
    expect(poor!.get('button').classes()).toContain('is-unaffordable')
    expect(rich!.get('button').classes()).not.toContain('is-unaffordable')

    const dispatches = await countDispatches(async () => {
      poor!.get('button').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(dispatches).toBe(0)
    expect(selectedEntryId.value).toBeNull()
  })

  it('M67：去掉 disabled 属性（只留变灰）必须红', () => {
    // 反向夹具：判据写成「只看变灰 class」时，真实 DOM 里两张卡的确不同 ——
    // 所以这条夹具要抓的是**别的**形态：把 affordable 判据反过来用。
    reset({ sun: 1000 })
    const hand = mountHandDeck()
    const rich = hand.findAllComponents(HandCard)[0]!
    expect(rich.props('card').affordable).toBe(true)
    // 「不可点」判据对买得起的卡**不成立** ⇒ 放宽成「有 is-unaffordable 或没有」就是恒真
    expect(rich.get('button').attributes('disabled')).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G30 —— 逐格比对：`.is-in-range` 集合 === coverCellsAt
// ══════════════════════════════════════════════════════════════════════════════

describe('G30 —— 射程覆盖层逐格 === coverCellsAt', () => {
  const cells = buildableCells()

  it('战场恰好 7 个可建格（矩阵规模本身就是判据的一部分）', () => {
    // ⚠️ [CR] 2026-10-16 裁决 6：35 → 7（非僵尸行整行不可建）。
    //   这条断言的**作用**不是「记住 35」，而是「可建格的规模不会悄悄漂移」——
    //   所以它跟着裁决走，但仍然是硬钉死的数字。理由见
    //   `src/core/grid.ts` 的 `buildBlockedReason` 行拦截注释。
    expect(cells).toHaveLength(COLS - 2)
  })

  for (const towerType of ['direct', 'slow', 'aoe'] as const) {
    it(`${towerType}：全部 7 个可建格的覆盖集合 === coverCellsAt`, async () => {
      for (const towerTypeKey of [towerType]) {
        for (const { row, col } of cells) {
          reset({ sun: 1000, unlocked: [ENTRY_OF[towerTypeKey]] })
          const field = mountField()
          selectTowerCard(ENTRY_OF[towerTypeKey])
          await cellAt(field, row, col).trigger('pointerdown')
          expect([...inRangeKeys(field)]).toEqual([...coverCellsAt(row, col, towerTypeKey)].sort())
          field.unmount()
        }
      }
    })
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 🚨 G30b —— 手牌与战场在**浅色底面**上的可见性（`[CR]` 2026-10-16 修的 2 个 P0）
  //
  // 与 1.11 的 G30 同一个洞（R-41 的「无守卫 + 不在人工清单」双重漏网），
  // 只是这次在 1.12 的三个位置上复发：
  //   · `.hand-card__cost` 的造价数字 `var(--color-sun)` 落在卡面米色 `--color-path`
  //     上只有 **1.13:1** —— 孩子看不见这张卡要多少钱。
  //   · `.hand-card.is-selected` 的选中描边同一个颜色同一个底 ⇒ 同样 1.13:1。
  //     而「防误触靠选中态高亮」是 `epics` 的正面判据 ⇒ **看不见的选中态
  //     等于没有选中态**，比造价数字更严重。
  //   · `.battle-cell.is-candidate::after` 的指向描边落在草地绿 `--color-bg`
  //     上只有 **1.80:1** —— 而「手指落在哪一格」是这条描边存在的全部理由。
  //
  // 根因是同一个：`tokens.css` 把 `--color-sun` 写成「对比度 3:1 的唯一例外」，
  // 那句「例外」被当成了「哪儿都能用」的通行证。三处都是**浅色底面**上的错用。
  //
  // 判据与 1.11 相同：**实算 WCAG 对比度**，不检查颜色字面量是否「合法」——
  // 上一版 `#fdd835` 每一条形式检查都会放行。
  // ════════════════════════════════════════════════════════════════════════════

  /** 卡面底色：`.hand-card` 自己的 `background-color`。 */
  function handCardBg(): string {
    return resolveColor(
      declValue(cssDecl(handCardSource, '.hand-card {'), 'background-color') ?? '#ffffff',
    )
  }

  /**
   * 指向描边可能落在**两种**格子底色上：草地 `--color-bg`（`.battle-cell` 自己的底色）
   * 与浅土路径 `--color-path`（僵尸行 —— 而**可建格全部在僵尸行**，所以这一次
   * 恰恰是孩子最常看到指向描边的那种底）。
   * ⚠️ 只查一种就是假绿 —— 与 1.11「必须逐级回退」同款纪律。
   *
   * ⚠️ 僵尸行是**手算 `:nth-child` 下标**选出来的（见 `BattleField.vue` 的注释），
   *   不是 class。这里必须跟着它一起变，改了下标而这里没跟上是会静默漏查的漂移。
   */
  function cellBackgrounds(): readonly string[] {
    const PATH_ROW = '.battle-cell:nth-child(n + 19):nth-child(-n + 27) {'
    return [
      cssDecl(battleFieldSource, '.battle-cell {'),
      cssDecl(battleFieldSource, PATH_ROW),
    ].map((b) => resolveColor(declValue(b, 'background-color') ?? '#ffffff'))
  }

  it('🚨 造价数字在卡面上 ≥ 4.5:1（改之前是 1.13:1）', () => {
    const fg = resolveColor(declValue(cssDecl(handCardSource, '.hand-card__cost {'), 'color') ?? '')
    const bg = handCardBg()
    const ratio = contrastRatio(fg, bg)
    expect(ratio, contrastMsg('手牌造价数字', fg, bg, ratio, 4.5)).toBeGreaterThanOrEqual(4.5)
  })

  it('🚨 造价数字不得复用 `--color-sun`（它在浅底面上只有 1.13:1）', () => {
    // 上一条锁住的是**比值**；这一条锁住**根因**：`--color-sun` 的「例外」
    // 条款被当成了通行证，换一个恰好也过 4.5 的亮色来用，守卫会静默放过。
    // 语义上造价也不该用「阳光」这个资源色 —— 它在 HUD 里表示的是阳光本身。
    const fg = declValue(cssDecl(handCardSource, '.hand-card__cost {'), 'color') ?? ''
    expect(fg, '造价数字复用了 --color-sun，在浅色卡面上不可见').not.toContain('--color-sun')
  })

  it('🚨 选中态描边在卡面上 ≥ 3:1，且不得复用 `--color-sun`（改之前是 1.12:1）', () => {
    const fg = resolveColor(
      declValue(cssDecl(handCardSource, '.hand-card.is-selected {'), 'border-color') ?? '',
    )
    expect(fg, '选中态描边复用了 --color-sun，孩子点了看不出任何变化').not.toContain('--color-sun')
    const bg = handCardBg()
    const ratio = contrastRatio(fg, bg)
    // 📎 **3.0 是 WCAG 1.4.11 对非文字（UI 组件/图形）的门槛**，不是 4.5。
    //   第一稿这里写的是 4.5 —— 那是**正文的**门槛，被我顺手套到了描边上。
    //   留 3.0 有两个理由：① 判据要能被引用和复核，自己另立一个更严的数
    //   会让后来人以为存在某条 4.5 的规范要求；② 余量仍然很大
    //   （实测 6.39:1，超出门槛一倍多），真要降也不会悄悄跌破。
    expect(ratio, contrastMsg('手牌选中态描边', fg, bg, ratio, 3)).toBeGreaterThanOrEqual(3)
  })

  it('🚨 指向格描边在**两种格子底色**上都 ≥ 3:1（改之前草地绿上只有 1.80:1）', () => {
    // `border` 是简写（`3px solid #424242`），宽度与样式要剥掉才是颜色。
    const fg = resolveColor(
      extractColor(declValue(cssDecl(battleFieldSource, '.battle-cell.is-candidate::after {'), 'border') ?? ''),
    )
    expect(fg, '指向格描边复用了 --color-sun，在草地上只有 1.80:1').not.toContain('--color-sun')
    for (const bg of cellBackgrounds()) {
      const ratio = contrastRatio(fg, bg)
      // ⚠️ **这一条第一稿要求 4.5，是我自己写错了** —— 4.5 是正文门槛，
      //   描边属非文字，适用 1.4.11 的 3.0。实测草地绿上 4.01、路径米色上 6.39，
      //   两者都过 3.0 且有实余量；写 4.5 会让守卫在**正确实现**上报红，
      //   而一条会对正确代码报红的守卫比没有守卫更坏。
      expect(ratio, contrastMsg('战场指向格描边', fg, bg, ratio, 3)).toBeGreaterThanOrEqual(3)
    }
  })

  /**
   * 「买不起」态的实际底色 = 卡面底色 ⊕ 压暗罩。
   * 罩取自 token（组件不许写死 rgba），alpha 由 token 的值算出。
   */
  function unaffordableBg(): string {
    return overBlack(handCardBg(), rgbaAlpha(tokenValue('--color-overlay-unaffordable')))
  }

  it('🚨 罩下的「买不起」态：卡面单词与造价数字都 ≥ 4.5:1（改之前单词只有 1.88:1）', () => {
    // 「买不起」的卡是被一层黑罩压暗的，**卡面底色本身没变**。
    // 算对比度必须把罩合成进底色 —— 拿未压暗的 `--color-path` 去算会得到
    // 5.85:1 的漂亮数字，而真实值是 1.88:1，守卫于是对着一版看不见的代码放行。
    const dimmed = unaffordableBg()

    // 罩下所有卡面文字都必须走白（`--color-on-tower`）——
    // 压暗只会让**深色**文字更难读，深橙在变暗的底上从 5.85 掉到 1.88。
    for (const [what, selector] of [
      ['卡面单词', '.hand-card.is-unaffordable .hand-card__label {'],
      ['造价数字', '.hand-card.is-unaffordable .hand-card__cost {'],
    ] as const) {
      const fg = resolveColor(declValue(cssDecl(handCardSource, selector), 'color') ?? '')
      const ratio = contrastRatio(fg, dimmed)
      expect(ratio, contrastMsg(`「买不起」卡上的${what}`, fg, dimmed, ratio, 4.5)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('M76：把罩下的单词颜色改回深橙必须红（守卫自证不是恒绿）', () => {
    // 直接复现「罩住深橙」那一版，证明上面那条不是恒绿。
    // ⚠️ 1.88 这个数是**当前 token（alpha 0.45）**下的值。
    //   改动之前组件里写死的是 0.38，那时同一处错误是 2.31:1 ——
    //   罩更深一点，文字更看不清一点，两个数都是同一件事的症状。
    const dimmed = unaffordableBg()
    expect(contrastRatio('#7a3200', dimmed)).toBeCloseTo(1.88, 2)
    expect(
      contrastRatio('#7a3200', handCardBg()),
      '未压暗时本该好看 —— 否则上面那条守卫的前提（是罩压垮了它）就错了',
    ).toBeCloseTo(5.85, 2)
  })

  it('M75：把造价数字改回 `var(--color-sun)` 必须红（守卫自证不是恒绿）', () => {
    // 变异验证：把**真实源码**换成改动之前那一版，上面的断言必须抓住。
    // ⚠️ 必须**真的改动源码字符串**，不能在本文件里重算一遍 —— 那是「反向夹具
    //   连着真组件都没有」的经典假绿（1.11 的 M57 实测）。
    //
    // 🚨 **第一稿这里用的是 `handCardSource.replace('color: #424242;', …)`，
    //   而它是错的 —— 而且错得极安静**：全文里 `color: #424242;` 出现**两次**
    //   （`.hand-card.is-selected` 的 `border-color: #424242;` 也包含这个子串，
    //   且它在文件里靠前）。`String.replace` 只换第一处 ⇒ 被改的是**选中态描边**，
    //   造价规则原封不动 ⇒ 算出来的比值是改**之后**的 6.39，而不是 1.13。
    //   若当时只是断言「小于 4.5」，这个假变异照样绿 —— 它绿得毫无道理。
    //   所以下面的写法要**先证明锚点唯一**，再按位置替换。
    const code = stripComments(handCardSource)
    const anchor = 'color: #424242;'
    const ruleAt = code.indexOf('.hand-card__cost {')
    expect(ruleAt, '源码里找不到 .hand-card__cost 规则').toBeGreaterThan(-1)
    const anchorAt = code.indexOf(anchor, ruleAt)
    expect(anchorAt, '.hand-card__cost 规则里没有锚点 ⇒ 变异会空转').toBeGreaterThan(ruleAt)
    expect(
      code.slice(ruleAt, anchorAt),
      '锚点在到达 .hand-card__cost 之前就出现了 ⇒ replace 会改到别的规则上',
    ).not.toContain(anchor)

    const mutated =
      code.slice(0, anchorAt) + 'color: var(--color-sun);' + code.slice(anchorAt + anchor.length)
    expect(mutated, '变异没有改变源码').not.toBe(code)

    // 复现的必须是**改动之前的实测值**：守卫若对那一版放行，上面两条就是装饰。
    const fg = resolveColor(declValue(cssDecl(mutated, '.hand-card__cost {'), 'color') ?? '')
    expect(contrastRatio(fg, handCardBg())).toBeCloseTo(1.12, 2)
    // 顺带确认另一条规则**没被这次变异碰到** —— 上面那个坑的直接反证。
    expect(
      declValue(cssDecl(mutated, '.hand-card.is-selected {'), 'border-color'),
      '变异误伤了选中态描边 ⇒ 替换锚点不唯一',
    ).toBe('#424242')
  })

  it('M57：把「覆盖挂在指向格」改成「选中即铺满所有可建格」必须红', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await nextTick()
    // 反向夹具：AC-E1 指名的那个**数学上退化**的形态 —— 不按任何格，
    // 第 3 行 7 个可建格全亮。真守卫认的是「按在哪就覆盖哪」。
    expect(inRangeKeys(field)).toHaveLength(0)
    await cellAt(field, ZOMBIE_ROW, 1).trigger('pointerdown')
    expect(inRangeKeys(field)).toEqual([...coverCellsAt(ZOMBIE_ROW, 1, 'direct')].sort())
  })

  it('M71：非僵尸行的候选格按下后一个 .is-in-range 都没有', async () => {
    for (const row of [0, 1, 3, 4]) {
      reset({ sun: 1000, unlocked: [ENTRY_OF.aoe] })
      const field = mountField()
      selectTowerCard(ENTRY_OF.aoe)
      await cellAt(field, row, 3).trigger('pointerdown')
      expect(inRangeKeys(field)).toEqual([])
      field.unmount()
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-E2b —— 指向格不额外点亮；AC-E3 —— 非僵尸行整行压暗
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-E2b / AC-E3 —— 指向格描边 与 非僵尸行整行压暗', () => {
  it('指向格有 .is-candidate；范围塔的指向格同时在覆盖内（coverCellsAt 本来就含自身）', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.aoe] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.aoe)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    expect(cellAt(field, ZOMBIE_ROW, 3).classes()).toContain('is-candidate')
    expect(inRangeKeys(field)).toContain(cellKey(ZOMBIE_ROW, 3))
  })

  it('直射塔的指向格不在覆盖内，但仍有描边', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    expect(cellAt(field, ZOMBIE_ROW, 3).classes()).toContain('is-candidate')
    expect(inRangeKeys(field)).not.toContain(cellKey(ZOMBIE_ROW, 3))
  })

  it('未选中任何卡时，四行压暗与覆盖层都不画', () => {
    reset({ sun: 1000 })
    const field = mountField()
    expect(field.findAll('.is-inert-row')).toHaveLength(0)
    expect(field.findAll('.is-in-range')).toHaveLength(0)
  })

  it('选中卡时，第 1/2/4/5 行每一格都压暗，第 3 行一格都不压暗', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await nextTick()
    const inert = field.findAll('.is-inert-row')
    expect(inert).toHaveLength((ROWS - 1) * COLS)
    for (const node of inert) {
      const row = Number(node.element.parentElement?.getAttribute('data-row'))
      expect(row).not.toBe(ZOMBIE_ROW)
    }
  })

  it('离开 awaiting-build 后整行压暗消失（与手牌区同相位）', async () => {
    reset({ phase: 'awaiting-answer', unlocked: [ENTRY_OF.direct] })
    selectedEntryId.value = ENTRY_OF.direct
    const field = mountField()
    expect(field.findAll('.is-inert-row')).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G31 —— 45 个直接子元素，且覆盖层是 cell 的子元素
// ══════════════════════════════════════════════════════════════════════════════

describe('G31 —— .battle-grid 的直接子元素恰好 45 个且全是 .battle-cell', () => {
  it('选中并按下之后仍然是 45 个 .battle-cell 直接子元素', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.aoe] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.aoe)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    const children = field.get('.battle-grid').element.children
    expect(children).toHaveLength(45)
    expect([...children].every((child) => child.classList.contains('battle-cell'))).toBe(true)
    // 覆盖层必须是 **cell 的子**，不是 grid 的兄弟
    // `find` 而不是 `get`：这里断言的正是「找不到」，`get` 找不到会直接抛。
    expect(field.find('.battle-grid > .range-overlay').exists()).toBe(false)
  })

  it('M62：把覆盖层挪成 .battle-grid 的直接子元素必须红', () => {
    // 反向夹具直接问 DOM 结构那条判据：`.battle-grid` 的**直接子元素**里
    // 出现了 `range-overlay` 就是违规形态。两种夹具都只是同一段 HTML。
    expect(directChildClasses(GOOD_INNER)).toEqual(['battle-cell'])
    expect(directChildClasses(BAD_INNER)).toEqual(['battle-cell', 'range-overlay'])
  })

  it('行优先 DOM 顺序不变（守卫 G17/G18 依赖它）', () => {
    const field = mountField()
    const cells = field.findAll('.battle-cell')
    expect(cells).toHaveLength(ROWS * COLS)
    expect(cells.map((node) => Number(node.attributes('data-row')))).toEqual(
      Array.from({ length: ROWS * COLS }, (_, i) => Math.floor(i / COLS)),
    )
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G41 —— pointerdown / pointerup 必须分开判
// ══════════════════════════════════════════════════════════════════════════════

describe('G41 —— 两步放置不许退化成「按哪放哪」', () => {
  it('同格 down + up ⇒ dispatch 恰好 1 次，且塔种在那一格', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerup')
    })
    expect(dispatches).toBe(1)
    expect(state.value.grid[cellKey(ZOMBIE_ROW, 3)]).toBe('t1')
    expect(state.value.sun).toBe(1000 - COST_OF.direct)
  })

  it('down 在 A、up 在 B ⇒ 0 次 dispatch，但预览跟着移到 B', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
      await cellAt(field, ZOMBIE_ROW, 5).trigger('pointerup')
    })
    expect(dispatches).toBe(0)
    expect(state.value.towers).toHaveLength(0)
    expect(inRangeKeys(field)).toEqual([...coverCellsAt(ZOMBIE_ROW, 5, 'direct')].sort())
  })

  it('M74：把 pointerup 换成「在任何格都种下」必须红', () => {
    // 反向夹具：AC-D1 指名的退化形态 —— 只看 pointerup 不比对 down 的格。
    // 真判据是 `down 的格 === up 的格`；反向夹具断言「只看 up 的格」会给出
    // 不同答案，且那条答案正是「种在了 B」。
    const down = { row: ZOMBIE_ROW, col: 3 }
    const up = { row: ZOMBIE_ROW, col: 5 }
    expect(down.col === up.col).toBe(false)
    expect(up.col).toBe(5)
  })

  it('只按下不松手 ⇒ 不建塔', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    })
    expect(dispatches).toBe(0)
    expect(state.value.towers).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D3 —— 三种无效点击：不响应、不抛错、且有 100ms 压暗闪
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-D3 —— 无效点击一律不响应、不抛错', () => {
  const invalid: readonly { readonly name: string; readonly row: number; readonly col: number }[] = [
    { name: '房子格', row: ZOMBIE_ROW, col: HOUSE_COL },
    { name: '入场格', row: ZOMBIE_ROW, col: ZOMBIE_SPAWN_COL },
  ]

  for (const { name, row, col } of invalid) {
    it(`位置不可建的格（${name}）⇒ 压暗闪 + 0 dispatch`, async () => {
      reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
      const field = mountField()
      selectTowerCard(ENTRY_OF.direct)
      const dispatches = await countDispatches(async () => {
        await cellAt(field, row, col).trigger('pointerdown')
      })
      expect(dispatches).toBe(0)
      expect(cellAt(field, row, col).find('.is-refused').exists()).toBe(true)
      expect(inRangeKeys(field)).toHaveLength(0)
      // 不顺带取消选中（AC-D2 的注释）
      expect(selectedEntryId.value).toBe(ENTRY_OF.direct)
    })
  }

  it('已占用格 ⇒ 压暗闪 + 0 dispatch', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct], occupied: [{ row: ZOMBIE_ROW, col: 4 }] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 4).trigger('pointerdown')
    })
    expect(dispatches).toBe(0)
    expect(cellAt(field, ZOMBIE_ROW, 4).find('.is-refused').exists()).toBe(true)
  })

  it('未选中任何卡 ⇒ 按格子什么也不发生（连覆盖层都没有）', async () => {
    reset({ sun: 1000 })
    const field = mountField()
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerup')
    })
    expect(dispatches).toBe(0)
    expect(field.findAll('.range-overlay')).toHaveLength(0)
  })

  it('压暗闪播完（animationend）自动收掉，不留残影', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, HOUSE_COL).trigger('pointerdown')
    expect(field.findAll('.is-refused')).toHaveLength(1)
    await cellAt(field, ZOMBIE_ROW, HOUSE_COL).trigger('animationend')
    expect(field.findAll('.is-refused')).toHaveLength(0)
  })

  it('阳光不足时按可建格 ⇒ 也是压暗闪 + 0 dispatch', async () => {
    reset({ sun: 10, unlocked: [ENTRY_OF.aoe] })
    const field = mountField()
    selectedEntryId.value = ENTRY_OF.aoe
    const dispatches = await countDispatches(async () => {
      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    })
    expect(dispatches).toBe(0)
    expect(cellAt(field, ZOMBIE_ROW, 3).find('.is-refused').exists()).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 🚨 [CR] 2026-10-16 —— 三条覆盖层/指针的修复各自的回归守卫
//
// **上一段所有 `is-refused` 用例用的都是僵尸行**（`row: ZOMBIE_ROW`）。
// 而僵尸行**永远不会命中压暗分支** —— 于是「压暗排在拒绝闪之前」这个顺序错误
// 在整整 1158 条用例里**没有一条能看见**。它不是被守卫放过的，是**守卫够不着**。
// 换句话说：AC-D3「任何不能建的格都要闪」在非僵尸行上从来就没有被验证过。
// ══════════════════════════════════════════════════════════════════════════════

describe('[CR] 覆盖层顺序 —— 拒绝闪必须盖过非僵尸行压暗', () => {
  /** 非僵尸行里任意一格（裁决 6 之后它整行不可建）。 */
  const INERT_ROW = 0

  it('🚨 按非僵尸行 ⇒ 闪「拒绝」，而不是只有一片静态压暗', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    // ⚠️ 必须等一拍：压暗是 `showInertRows` 这个 computed 驱动的，选中那一刻才出现。
    await nextTick()
    // 先确认压暗**本来就在**（否则这条会在压暗整体坏掉时假绿）。
    // ⚠️ 类名是 `.is-inert-row` 不是 `.is-inert`（RangeOverlay 的 `VARIANT_CLASS` 表）。
    expect(cellAt(field, INERT_ROW, 4).find('.is-inert-row').exists()).toBe(true)

    await cellAt(field, INERT_ROW, 4).trigger('pointerdown')
    expect(
      cellAt(field, INERT_ROW, 4).find('.is-refused').exists(),
      '按了不能建的格子却没有闪 ⇒ 拒绝闪被压暗分支吃掉了',
    ).toBe(true)
    // 同一格上两者**互斥**：闪的同时不该还挂着常驻压暗
    expect(cellAt(field, INERT_ROW, 4).find('.is-inert-row').exists()).toBe(false)
  })

  it('闪播完之后，常驻压暗回到原样（不打架、不留残影）', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, INERT_ROW, 4).trigger('pointerdown')
    expect(field.findAll('.is-refused')).toHaveLength(1)
    await cellAt(field, INERT_ROW, 4).trigger('animationend')
    expect(field.findAll('.is-refused')).toHaveLength(0)
    expect(cellAt(field, INERT_ROW, 4).find('.is-inert-row').exists()).toBe(true)
  })

  it('闪只影响被按的那一格，别的非僵尸行仍然是压暗', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, INERT_ROW, 4).trigger('pointerdown')
    expect(field.findAll('.is-refused')).toHaveLength(1)
    expect(cellAt(field, INERT_ROW, 5).find('.is-inert-row').exists()).toBe(true)
  })
})

describe('[CR] pointercancel —— 指针被中止时不留残影，且不破坏拖拽预览', () => {
  it('🚨 pointercancel ⇒ 指向预览与拒绝闪一并收掉', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    expect(inRangeKeys(field).length).toBeGreaterThan(0)
    // `is-candidate` 是**格子自己身上的** class，不是它的子节点。
    expect(cellAt(field, ZOMBIE_ROW, 3).classes()).toContain('is-candidate')

    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointercancel')
    // `pointercancel` 意味着**不会有 pointerup 跟来**，残留预览永远等不到收束。
    expect(inRangeKeys(field), 'pointercancel 后射程预览还留着 ⇒ 屏幕上是一片骗人的绿光').toHaveLength(0)
    expect(cellAt(field, ZOMBIE_ROW, 3).classes()).not.toContain('is-candidate')
  })

  it('🚨 pointercancel 也清掉拒绝闪', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, HOUSE_COL).trigger('pointerdown')
    expect(field.findAll('.is-refused')).toHaveLength(1)
    await cellAt(field, ZOMBIE_ROW, HOUSE_COL).trigger('pointercancel')
    expect(field.findAll('.is-refused')).toHaveLength(0)
  })

  it('🚨 从 A 滑到 B 再松开 ⇒ 预览**跟着走**（不能用 pointerleave 实现 pointercancel）', async () => {
    // 这一条是「为什么不用 `pointerleave`」的正面守卫：
    //   `pointerup` 靠 `candidate` 里记的旧指向格判断「是不是同一格」。
    //   若离开一格就清 candidate，这里会直接早退 ⇒ 预览再也不跟随手指，
    //   而 AC-E1 明写「落在别处 ⇒ 只移动预览，不种」。
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    const before = inRangeKeys(field)

    await cellAt(field, ZOMBIE_ROW, 5).trigger('pointerup')

    expect(cellAt(field, ZOMBIE_ROW, 5).classes()).toContain('is-candidate')
    expect(cellAt(field, ZOMBIE_ROW, 3).classes()).not.toContain('is-candidate')
    expect(inRangeKeys(field), '预览没有跟随手指移到 B 格').not.toEqual(before)
    // 只移动预览、不种：两格都仍然没有塔
    expect(field.findAllComponents(Tower).length, '预览移动却顺手种下了塔').toBe(0)
  })

  it('pointercancel 落在**别的**格上时，不该连坐清掉当前指向', async () => {
    // 手指已滑到 B，此时 A 发出的 pointercancel 不应清掉 B 上的指向。
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    await cellAt(field, ZOMBIE_ROW, 5).trigger('pointerup')
    expect(cellAt(field, ZOMBIE_ROW, 5).classes()).toContain('is-candidate')
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointercancel')
    expect(cellAt(field, ZOMBIE_ROW, 5).classes()).toContain('is-candidate')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-D6 —— 高价值：任何输入组合下要么不 dispatch，要么 dispatch 之后状态自洽
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-D6 —— placeSelectedAt 在任何输入组合下都不产生技术错误', () => {
  /** 全部 45 格（不只是可建的 35 格）—— 判据要覆盖到「点房子格」这种输入。 */
  const ALL_CELLS: { row: number; col: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) ALL_CELLS.push({ row, col })
  }

  it('阶段(6) × 选中(有/无) × 45 格 × 阳光(3) × 占用(2) 全矩阵 = 3240 组', () => {
    let compared = 0
    let placed = 0

    for (const kind of PHASE_KINDS) {
      for (const hasSelection of [true, false]) {
        for (const { row, col } of ALL_CELLS) {
          for (const sun of [0, 49, 1000]) {
            for (const occupied of [false, true]) {
              state.value = makeState({
                phase: kind,
                sun,
                unlocked: [ENTRY_OF.direct],
                occupied: occupied ? [{ row: ZOMBIE_ROW, col: 3 }] : [],
              })
              selectedEntryId.value = hasSelection ? ENTRY_OF.direct : null
              const before = state.value
              compared += 1

              // core 自己的答案：这一格能不能放。两条判据必须一致。
              const coreAllows =
                selectedEntryId.value !== null &&
                placementBlockedReason(before, selectedEntryId.value, row, col) === null

              let returned: boolean
              try {
                returned = placeSelectedAt(row, col)
              } catch (error) {
                // 「孩子面前永不出现技术错误」：抛出来就是红，且**不吞原文**
                throw new Error(
                  `placeSelectedAt 在 kind=${kind} sel=${String(hasSelection)} cell=(${row},${col}) ` +
                    `sun=${sun} occupied=${String(occupied)} 下抛了：${String(error)}`,
                )
              }

              const label = `kind=${kind} sel=${String(hasSelection)} (${row},${col}) sun=${sun} occupied=${String(occupied)}`
              expect(returned, label).toBe(coreAllows)
              if (coreAllows) {
                placed += 1
                // 真种下了：塔必须落在问过的那一格，且只多一座，阳光扣对
                expect(state.value.grid[cellKey(row, col)], label).toBeDefined()
                expect(state.value.towers.length, label).toBe(before.towers.length + 1)
                expect(state.value.sun, label).toBe(before.sun - COST_OF.direct)
              } else {
                // 不响应 ⇒ `state` 一个字节都不许动（引用都不换）
                expect(state.value, label).toBe(before)
              }
            }
          }
        }
      }
    }

    // ⚠️ 矩阵规模与「真种下」的次数都写死 —— 两者任一被悄悄缩小，
    //   这个测试仍然全绿，却什么也没测（1.11 的 M54 实测教训）。
    //
    //   算术（每一步都要能口算复核）：
    //     6 阶段 × 2 选中 × 45 格 × 3 阳光 × 2 占用 = 3240
    //   「真种下」要同时满足四个条件，逐层收窄：
    //     ① 有选中        —— 去掉一半            ⇒ 剩 1620 组候选
    //     ② awaiting-build —— 只有这一个相位放行 ⇒ 剩  540
    //     ③ 阳光 ≥ 50     —— 0 与 49 都被挡     ⇒ 剩  180（阳光 1000 那一档）
    //     ④ 该格可建且未被占 —— 45 格里只有 7 可建
    //        （[CR] 裁决 6：4 个非僵尸行 × 9 = 36，加僵尸行两列 2，合计 38 不可建）
    //        · 占用=false：7 组可种
    //        · 占用=true：(2,3) 被占              ⇒ 6 组可种
    //   ⇒ 7 + 6 = 13
    expect(compared).toBe(3240)
    expect(placed).toBe(13)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-C5 / AC-F1 / AC-F2 / G36 / G37 / AC-F4
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-C5 / AC-F —— 手牌区与开战按钮的相位边界', () => {
  it('只在 awaiting-build 渲染（其余五种相位都不渲染）', () => {
    for (const kind of PHASE_KINDS) {
      reset({ phase: kind })
      const hand = mountHandDeck()
      const rendered = hand.findAllComponents(HandCard)
      if (kind === 'awaiting-build') {
        expect(rendered.length, `相位 ${kind} 应当渲染手牌`).toBeGreaterThan(0)
      } else {
        expect(rendered, `相位 ${kind} 不该渲染手牌`).toHaveLength(0)
        expect(hand.find('.hand-deck__start').exists()).toBe(false)
      }
      hand.unmount()
    }
  })

  it('按钮文案与开战语义直接相关（NFR13，不许是「确定」「OK」）', () => {
    reset()
    const hand = mountHandDeck()
    expect(hand.get('.hand-deck__start').text()).toContain('开战')
  })

  it('G36：点一次「开战」后选中态清空，不跨回合残留', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const hand = mountHandDeck()
    selectTowerCard(ENTRY_OF.direct)
    expect(selectedEntryId.value).not.toBeNull()
    await hand.get('.hand-deck__start').trigger('click')
    expect(selectedEntryId.value).toBeNull()
  })

  it('AC-F2：三连同步完成 —— 相位离开 awaiting-build', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const hand = mountHandDeck()
    await hand.get('.hand-deck__start').trigger('click')
    expect(state.value.phase.kind).not.toBe('awaiting-build')
  })

  it('G37：非 awaiting-build 阶段 startRound 不 dispatch（六个相位逐个判）', async () => {
    for (const kind of PHASE_KINDS) {
      if (kind === 'awaiting-build') continue
      reset({ phase: kind })
      const before = state.value
      const dispatches = await countDispatches(async () => {
        startRound()
      })
      expect(dispatches, `相位 ${kind} 下 startRound 不该 dispatch`).toBe(0)
      expect(state.value).toBe(before)
    }
  })

  it('G37：终态（level-complete / level-failed）不 dispatch CONTINUE', async () => {
    for (const kind of ['level-complete', 'level-failed'] as const) {
      reset({ phase: kind })
      const before = state.value
      const dispatches = await countDispatches(async () => {
        startRound()
      })
      expect(dispatches).toBe(0)
      expect(state.value).toBe(before)
      // 战场照常渲染（AC-F4：不得白屏）
      const field = mountField()
      expect(field.findAll('.battle-cell')).toHaveLength(ROWS * COLS)
      field.unmount()
    }
  })

  /**
   * ⚠️ **上一条不够** —— 它只在「已经是终态」时调 `startRound`，那时函数在
   *   **第二道门**（`phase !== 'awaiting-build'`）就 return 了，`CONTINUE` 那一行
   *   **根本没被执行到**。把 `if (kind === 'round-over')` 改成 `if (true)` 全绿。
   *   本条才是真正打在那行上的：`resolveRound()` 这次**把相位推成终态**。
   *
   *   `level-complete` 从 `awaiting-build` 一路走不到（它在 `applyContinue` 内部），
   *   所以这里只有 `level-failed` 一档 —— 这正是 `startRound` 里那个 `if` 存在的
   *   全部理由（store.ts:231-234：终态再 `CONTINUE` 会 `rejectAction` 抛错，
   *   孩子点一次「开战」就看到一个技术错误）。
   */
  it('G37：结算当场失败（心数归零）时 startRound 不再 dispatch CONTINUE', async () => {
    // 僵尸在 col 1，结算第 2 步推进到 col 0 = 房子 ⇒ 丢 1 心 ⇒ 1 − 1 = 0 ⇒ level-failed
    const zombies: readonly Zombie[] = [{ id: 'z1', col: 1, hp: ZOMBIE_HP, slowTurnsLeft: 0 }]
    reset({ sun: 1000, hearts: 1, zombies })
    // ⚠️ 场上不能有塔 —— 有塔就可能把僵尸打死，结算就不会落到 level-failed。
    expect(state.value.towers).toHaveLength(0)
    expect(state.value.hearts).toBe(1)

    const dispatches = await countDispatches(() => {
      startRound()
    })
    // endBuild + resolveRound = 2 次；第三次（CONTINUE）若发出去，不是抛错就是推进了。
    expect(dispatches).toBe(2)
    expect(state.value.phase.kind).toBe('level-failed')
    expect(state.value.hearts).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 源码守卫（G32、G33a、G33b、G38、G39）+ 各自的反向用例
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G32 判据 —— 覆盖层 `z-index` 低于塔/僵尸、高于 `.is-house::before`。
 *
 * ⚠️ 「高于 `::before`」这条**靠的是机制而不是数值**：`.is-house::before` 保持
 *   `z-index: auto`，与覆盖层的 `z-index: 0` 落在同一层叠级别，按 **DOM 顺序**分胜负 ——
 *   `::before` 是 cell 的第一个子盒，覆盖层在模板里排在它后面。
 *   ⇒ 判据是「`::before` 那条规则里**没有** z-index」+「覆盖层在模板里排在塔之后」。
 */
function g32Violation(overlayCss: string, towerCss: string, fieldCss: string): string | null {
  const overlay = stripComments(overlayCss)
  const tower = stripComments(towerCss)
  const field = stripComments(fieldCss)

  const overlayZ = /z-index:\s*(-?\d+)\s*;/.exec(overlay)
  if (overlayZ === null) return '覆盖层没有 z-index —— 它会与房子格罩落到同一层，分不出先后'
  const towerZ = /z-index:\s*(-?\d+)\s*;/.exec(tower)
  if (towerZ === null) return '塔没有 z-index —— AC-E2 的三方层序无法成立'

  if (Number(overlayZ[1]) >= Number(towerZ[1])) {
    return `覆盖层 z-index ${overlayZ[1]} 不低于塔的 ${towerZ[1]} —— 射程罩会糊住塔身`
  }

  const houseRule = /\.is-house::before[\s\S]*?\{([\s\S]*?)\}/.exec(field)
  if (houseRule === null) return '读不到 .is-house::before 规则 —— 层序判据的第一根柱子没了'
  if (/z-index:/.test(houseRule[1] as string)) {
    return '.is-house::before 声明了 z-index —— 它会与覆盖层抢同一层，层序变成偶然'
  }
  return null
}

describe('G32 —— 覆盖层 / 塔 / 房子格罩的三方层序', () => {
  it('真实源码通过 G32', () => {
    expect(g32Violation(rangeOverlaySource, towerSourceRaw, battleFieldSource)).toBeNull()
  })

  it('M63：把覆盖层 z-index 提到塔之上必须红', () => {
    const bad = rangeOverlaySource.replace('z-index: 0;', 'z-index: 5;')
    expect(bad).not.toBe(rangeOverlaySource)
    expect(g32Violation(bad, towerSourceRaw, battleFieldSource)).not.toBeNull()
  })

  it('M63：给 .is-house::before 加 z-index 也必须红', () => {
    const bad = battleFieldSource.replace(
      'background-color: var(--color-overlay-blocked);',
      'background-color: var(--color-overlay-blocked);\n  z-index: 1;',
    )
    expect(bad).not.toBe(battleFieldSource)
    expect(g32Violation(rangeOverlaySource, towerSourceRaw, bad)).not.toBeNull()
  })
})

/**
 * G33b 判据 —— 组件源码不出现这些**产出战斗数值的判据标识符**。
 *
 * ⚠️ 白名单里只有 `ZOMBIE_ROW`：它是**布局常量**（僵尸走哪一行），
 *   AC-E3 的「哪些行整行压暗」要靠它 —— 它不产出任何战斗数值。
 *   硬约束 3 禁的是「读 `wordId` 取数值」与「组件自带数值判据」，
 *   布局常量不在其列。
 */
const FORBIDDEN_VALUE_IDENTIFIERS = [
  'costOf',
  'TOWER_STATS',
  'rangeOf',
  'rangeFor',
  'ZOMBIE_HP',
  'HEARTS',
  'SUN_START',
] as const

function g33bViolation(sources: readonly { readonly name: string; readonly source: string }[]): string[] {
  const defects: string[] = []
  for (const { name, source } of sources) {
    const code = stripComments(source)
    for (const identifier of FORBIDDEN_VALUE_IDENTIFIERS) {
      if (code.includes(identifier)) defects.push(`${name} 出现了战斗数值判据 ${identifier}`)
    }
  }
  return defects
}

const COMPONENT_SOURCES = [
  { name: 'hand/HandDeck.vue', source: handDeckSource },
  { name: 'hand/HandCard.vue', source: handCardSource },
  { name: 'battle/RangeOverlay.vue', source: rangeOverlaySource },
  { name: 'battle/BattleField.vue', source: battleFieldSource },
]

describe('G33a / G33b —— 组件不得自带战斗数值判据', () => {
  it('真实组件源码通过 G33b（白名单只有 ZOMBIE_ROW）', () => {
    expect(g33bViolation(COMPONENT_SOURCES)).toEqual([])
  })

  it('白名单判据先在真实源码上试过：ZOMBIE_ROW 确实出现（否则白名单是多余的）', () => {
    // AC-G1 的要求：判据字面量必须在真实文本里真的匹配得上（M56 的 0 红教训）。
    expect(stripComments(battleFieldSource)).toContain('ZOMBIE_ROW')
  })

  it('M64：组件里自己算造价（costOf）必须红', () => {
    // ⚠️ 必须锚在**模板**那一处 `{{ card.cost }}`：手写源码里 `card.cost`
    //   第一次出现是在文件头的**注释**里（`stripComments` 会把它抹掉），
    //   打在注释上会得到一条 0 红的假变异 —— 那正是 M56 记的坑。
    const bad = handCardSource.replace('{{ card.cost }}', '{{ costOf(card.towerType) }}')
    expect(bad).not.toBe(handCardSource)
    const defects = g33bViolation([{ name: 'hand/HandCard.vue', source: bad }])
    expect(defects).not.toHaveLength(0)
  })

  it('注释里出现该词不算违规（AC-G2：反向用例）', () => {
    // 🚨 `[CR]` 2026-10-16 —— 锚点原本写的是 `"const VARIANT_CLASS"`，
    //   而**那个字符串在 `HandCard.vue` 里一次都没出现**（它在 `RangeOverlay.vue:64`）。
    //   `String.replace` 找不到锚点是**静默**的 ⇒ `commented === handCardSource`
    //   ⇒ 一行注释都没插进去 ⇒ 下面那条「剥了注释所以不算违规」**因为错误的原因而绿**，
    //   零鉴别力。与 1.11 的 M56 / G28b 第一稿同型。
    //   改用 HandCard.vue 里**确实存在**的锚点，并在插入后断言「确实变了」——
    //   否则这个夹具下一次退化时还是绿的。
    const anchor = '{{ card.cost }}'
    expect(handCardSource, `锚点 ${anchor} 在 HandCard.vue 里不存在，replace 会静默空转`).toContain(anchor)
    const commented = handCardSource.replace(
      anchor,
      '/* 这里本来会写 costOf 与 TOWER_STATS，但它只是注释 */\n' + anchor,
    )
    expect(commented, 'replace 没有生效 ⇒ 本用例没有真的插入注释').not.toBe(handCardSource)
    expect(commented).toContain('costOf')

    // 现在才轮到断言：注释里有 costOf，但剥掉注释后不该算违规
    expect(g33bViolation([{ name: 'x', source: commented }])).toEqual([])
  })

  it('G33a：组件不直连 core/balance（这条同时由 ESLint 兜底）', () => {
    for (const { name, source } of COMPONENT_SOURCES) {
      expect(stripComments(source), name).not.toMatch(/from '.*core\/balance'/)
    }
  })
})

describe('[CR] G43 —— 组件不得自己「选中」卡（可清空，但不可置为非空）', () => {
  /**
   * 🚨 这条守卫堵的是 R-41 说的那条**零执行力的边界**：
   *   `selectedEntryId` 在 `app/store.ts` 里是 `export const … = ref(null)`，
   *   也就是说它在类型层面就是**可写的**。组件 `import` 进来就能写。
   *   而「写 null」与「写入一个 entryId」是**性质完全不同**的两件事：
   *     · 写 `null` —— 清空。store 自己也这么干（`placeSelectedAt` / `applyAction`），
   *       组件清空不会产生任何 store 之外不知道的状态。
   *     · 写入非空 —— **绕过门面选中一张卡**。`selectTowerCard` 身上带着
   *       「再点同一张则取消」这个 toggle 语义（AC-D2①），绕过去写就把它丢了；
   *       更要紧的是它把「哪些地方有权改选中态」从「只有 store」放宽成
   *       「任何 import 到它的组件」，而没有任何东西挡着。
   *   ⇒ 判据只禁后者，**不动 AC-D5 冻结的三门面清单**（加第四个门面
   *     属于改 story 规格，不是本 story 该顺手做的）。
   */
  function g43Violation(sources: readonly { readonly name: string; readonly source: string }[]): string[] {
    const bad: string[] = []
    for (const { name, source } of sources) {
      const code = stripComments(source)
      // 抓「赋值」，不抓读取：`selectedEntryId.value === null` 是判断，必须放过。
      // ⚠️ 排除 `===` / `!==`：`=` 的正则若不设边界，`===` 会被误判成赋值。
      const m = /selectedEntryId\.value\s*=(?!=)/.exec(code)
      if (m === null) continue
      const after = code.slice(m.index + m[0].length)
      if (/^\s*null\b/.test(after)) continue
      bad.push(`${name}: 组件把 selectedEntryId 置成了非空 —— 选中态只能经 store 的 selectTowerCard`)
    }
    return bad
  }

  it('真实组件源码通过 G43', () => {
    expect(g43Violation(COMPONENT_SOURCES)).toEqual([])
  })

  it('前置：白名单（写 `null`）真的存在于真实源码里，否则这条守卫是空转', () => {
    // 反向夹具必须**先证明那个放行的形态确实存在** ——
    // 否则「全部合法」可能只是因为源码里一处赋值都没有。
    const clears = COMPONENT_SOURCES.filter((s) => /selectedEntryId\.value\s*=\s*null\b/.test(stripComments(s.source)))
    expect(clears.map((c) => c.name).sort(), '白名单里一处都没有 ⇒ 前置条件不成立').not.toEqual([])
    expect(g43Violation(clears)).toEqual([])
  })

  it('M77：组件把选中态写成非空必须红', () => {
    // 🚨 变异必须**真的插进源码字符串**，且锚点要证明唯一 ——
    //   `selectedEntryId.value = null` 在两个组件里各有一处，
    //   `replace` 不加区分就会只改第一个（1.11 的 M57 同款坑）。
    const anchor = 'function onGridBlank(): void {\n  selectedEntryId.value = null\n}'
    expect(battleFieldSource, '锚点不存在 ⇒ 变异会空转').toContain(anchor)
    const bad = battleFieldSource.replace(
      anchor,
      'function onGridBlank(): void {\n  selectedEntryId.value = state.value.unlocked[0] ?? null\n}',
    )
    expect(bad).not.toBe(battleFieldSource)
    expect(g43Violation([{ name: 'battle/BattleField.vue', source: bad }])).not.toEqual([])
  })

  it('M77：读 `=== null` 不该被当成赋值（守卫不能误报）', () => {
    const probe = [
      'const x = selectedEntryId.value',
      'if (selectedEntryId.value === null) return',
      'if (selectedEntryId.value !== null) return',
      'const y = selectedEntryId.value ? 1 : 0',
    ].join('\n')
    expect(g43Violation([{ name: 'probe.ts', source: probe }])).toEqual([])
  })
})

describe('G38 / G39 —— 动效写 CSS、不引入拖拽', () => {
  it('真实源码通过 G38', () => {
    expect(g38Violation(COMPONENT_SOURCES)).toEqual([])
  })

  it('M70：覆盖层里写死 120ms 必须红', () => {
    const bad = rangeOverlaySource.replace('var(--dur-feedback)', '120ms')
    expect(g38Violation([{ name: 'battle/RangeOverlay.vue', source: bad }])).not.toEqual([])
  })

  it('M70：用 setTimeout 收掉压暗闪必须红', () => {
    const bad = battleFieldSource.replace(
      'function onCellAnimationEnd(): void {',
      'function onCellAnimationEnd(): void {\n  setTimeout(() => {}, 100)',
    )
    expect(g38Violation([{ name: 'battle/BattleField.vue', source: bad }])).not.toEqual([])
  })

  it('真实源码通过 G39（无拖拽 / 无 pointermove）', () => {
    expect(g39Violation(COMPONENT_SOURCES)).toEqual([])
  })

  it('M73：给手牌卡加上 draggable 必须红', () => {
    const bad = handCardSource.replace('type="button"', 'type="button" draggable="true"')
    expect(g39Violation([{ name: 'hand/HandCard.vue', source: bad }])).not.toEqual([])
  })

  it('G39：core 不出现删除塔的 action（FR31：无铲除/拖拽/建造模式）', () => {
    // 判据 = `Action` 联合的 `type` 判别式字面量集合**恰好等于**下面这一组。
    // ⚠️ 为什么要写死「恰好等于」而不是「不含 remove」：只查关键词，
    //   将来有人加一个叫 `PICK_UP` / `MOVE_TOWER` 的变体就悄悄放过了 ——
    //   而那正是 FR31 要禁的形态（把塔从格子里拿走的一切机制）。
    // 📎 **白名单式的新成员必须同时改这里**：Story 1.18 / AC-E4 加了 `SKIP_QUESTION`
    //   （跳过一道正确项词图 404 了的题 —— 不碰战场，因此不违反 FR31），
    //   加进来时本条立刻红，那正是它的设计意图。
    const variants = [...typesSource.matchAll(/readonly type: '([A-Z_]+)'/g)].map((m) => m[1])
    expect(variants).toEqual([
      'ANSWER',
      'PLACE_TOWER',
      'END_BUILD',
      'RESOLVE_ROUND',
      'CONTINUE',
      'RESTART_LEVEL',
      'SKIP_QUESTION',
    ])
  })

  it('反向用例：加一个 REMOVE_TOWER 变体必须被上面那条抓到', () => {
    const bad = typesSource.replace(
      "readonly type: 'PLACE_TOWER'",
      "readonly type: 'REMOVE_TOWER'",
    )
    const variants = [...bad.matchAll(/readonly type: '([A-Z_]+)'/g)].map((m) => m[1])
    expect(variants).not.toContain('PLACE_TOWER')
    expect(variants).toContain('REMOVE_TOWER')
  })
})

/** G38 判据：无定时器、无字面量毫秒（动效时长写 CSS）。 */
function g38Violation(sources: readonly { readonly name: string; readonly source: string }[]): string[] {
  const defects: string[] = []
  const forbidden: readonly [RegExp, string][] = [
    [/setInterval\s*\(/, 'setInterval'],
    [/setTimeout\s*\(/, 'setTimeout'],
    [/requestAnimationFrame\s*\(/, 'requestAnimationFrame'],
    [/\b\d+ms\b/, '字面量毫秒'],
  ]
  for (const { name, source } of sources) {
    const code = stripComments(source)
    for (const [pattern, label] of forbidden) {
      if (pattern.test(code)) defects.push(`${name} 出现了 ${label}`)
    }
  }
  return defects
}

/** G39 判据：无拖拽 / 无 hover 通路 / 无触摸拖动。 */
function g39Violation(sources: readonly { readonly name: string; readonly source: string }[]): string[] {
  const defects: string[] = []
  const forbidden: readonly [RegExp, string][] = [
    [/\bdraggable\b/, 'draggable'],
    [/\bdragstart\b/, 'dragstart'],
    [/\bpointermove\b/, 'pointermove'],
    [/\btouchmove\b/, 'touchmove'],
    [/\bmouseenter\b/, 'mouseenter'],
    [/\bmouseover\b/, 'mouseover'],
  ]
  for (const { name, source } of sources) {
    const code = stripComments(source)
    for (const [pattern, label] of forbidden) {
      if (pattern.test(code)) defects.push(`${name} 出现了 ${label}`)
    }
  }
  return defects
}

// ══════════════════════════════════════════════════════════════════════════════
// 🔥📎 G255 —— 触摸三件事（Epic 1 集成层检视，2026-10-22）
//
// ── 守的是什么 ──────────────────────────────────────────────────────────────
// ① **`.battle-cell` 必须有 `touch-action: none`**
//    全仓的触摸基线只给了 `button, .touch-target`（`src/styles/base.css` 的
//    `touch-action: manipulation`），而 45 个战场格是**裸 `<div>`**
//    ⇒ 整个游戏里唯一的主触摸目标没有 `touch-action`。
//    ⇒ 页面可滚时浏览器把手势判成滚动起点 ⇒ 派发 **`pointercancel` 而不是 `pointerup`**
//    ⇒ `onCellPointerCancel` 清掉候选格 ⇒ **点按什么都没发生**：
//    预览的绿光消失、没种塔、没有拒绝提示 ⇒ 对 4–8 岁孩子读起来就是「游戏坏了」。
//    ⚠️ `none` 而不是 `manipulation`：后者**允许**平移 ⇒ 也就允许浏览器判成滚动。
//
// ② **`pointerdown` 必须解除触摸指针的隐式捕获**
//    Pointer Events 规范对**触摸指针**规定「隐式指针捕获」（`pointerdown` 的目标
//    自动成为捕获目标），Chromium / Safari / WebKit 都实现
//    ⇒ 触摸时 `pointerup` **永远回到按下的那一格**
//    ⇒ `onCellPointerUp` 里的 `sameCell` **恒为 true**
//    ⇒ **AC-D1 / AC-E1 的「落在别处 ⇒ 只移预览，不种」在目标机型（平板）上整条不可达**。
//
// ③ **窗口级 `pointerup` 必须收束「松手处不是任何一格」**
//    孩子按住一格、原地不动、却在别处松手 ⇒ 指针**从未离开棋盘**
//    ⇒ `pointerleave` 不冒 ⇒ 候选格留在原地 ⇒ **射程覆盖层一直亮着**。
//    ⚠️ 而窗口处理器**不能**无条件清：格子自己的处理器先跑（它把候选格移到新格，
//      那正是 AC-E1 的「只移预览，不种」）⇒ 无条件清会让**预览永远不跟随手指**。
//    ⇒ 它必须**先问「这一下是不是格子自己处理的」**。
//
// 📎 **变异实测（R-51）**：
//   · **M305** 把 `.battle-cell` 的 `touch-action: none` 改成 `manipulation` ⇒ 全量 **1 红**，在 G255
//   · **M306** 去掉 `onCellPointerDown` 里的 `releaseImplicitCapture(event)` ⇒ 全量 **1 红**，在 G255
//   · **M307** 不再注册窗口级 `pointerup` 监听 ⇒ 全量 **1 红**，在 G255
// ══════════════════════════════════════════════════════════════════════════════

describe('G255 —— 触摸三件事：touch-action / 解除隐式捕获 / 窗口级 pointerup 收束', () => {
  it('① `.battle-cell` 必须写 `touch-action: none`（否则浏览器把手势判成滚动 → pointercancel）', () => {
    const style = stripComments(styleBlockOf(battleFieldSource))
    const at = style.indexOf('.battle-cell {')
    expect(at, '判据范围消失：找不到 `.battle-cell` 那条 CSS 规则').toBeGreaterThan(-1)
    const close = style.indexOf('}', at)
    expect(close, '`.battle-cell` 的规则块没有闭合的 `}` —— 判据切不出声明体').toBeGreaterThan(at)
    const body = style.slice(at, close)
    expect(
      body,
      '🔴 `.battle-cell` 没有 `touch-action: none` —— ' +
        '页面可滚时浏览器把手势判成滚动起点 ⇒ 派发 `pointercancel` 而不是 `pointerup` ⇒ ' +
        '候选格被清掉 ⇒ **点按什么都没发生**（预览的绿光消失、没种塔、没有拒绝提示）。\n' +
        '⚠️ 必须是 `none` 而不是 `manipulation`：后者**允许**平移 ⇒ 也就允许判成滚动。',
    ).toMatch(/touch-action:\s*none\s*[;}]/)
  })

  it('② `pointerdown` 必须解除该指针的隐式捕获（否则触摸时 `pointerup` 永远回按下的那一格）', async () => {
    const released: number[] = []
    await withPointerCaptureStubs({ released, releaseThrows: false }, async () => {
      reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
      const field = mountField()
      selectTowerCard(ENTRY_OF.direct)

      await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown', { pointerId: 42 })

      expect(
        released,
        '🔴 `pointerdown` 没有解除隐式捕获 —— ' +
          'Pointer Events 规范对**触摸指针**规定「`pointerdown` 的目标自动成为捕获目标」' +
          '（Chromium / Safari / WebKit 都实现）⇒ 触摸时 `pointerup` **永远回到按下的那一格** ⇒ ' +
          '`sameCell` 恒为 true ⇒ **AC-D1 / AC-E1 的「落在别处 ⇒ 只移预览，不种」在平板上整条不可达**：' +
          '孩子从 A 滑到 B 松手 ⇒ 塔**种在 A**，而且没有任何拒绝反馈。',
      ).toContain(42)
    })
  })

  it('② 拿不到捕获时**不许阻断**（解除失败就让它继续隐式捕获，行为退回今天的样子）', async () => {
    await withPointerCaptureStubs({ released: [], releaseThrows: true }, async () => {
      reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
      const field = mountField()
      selectTowerCard(ENTRY_OF.direct)

      await expect(
        cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown', { pointerId: 7 }),
        '解除捕获抛出的异常冒到了界面上 —— 孩子的点击路径上出现技术错误（NFR13）',
      ).resolves.not.toThrow()
      expect(
        field.findAll('.battle-cell.is-candidate').length,
        '解除捕获失败之后连候选格都没记下 —— 兜底过头了：解除失败只该「继续隐式捕获」，' +
          '其余分支照旧',
      ).toBe(1)
    })
  })

  it('③ 松手处**不是任何一格**时：候选格与覆盖层都得收掉（覆盖层不许一直亮着）', async () => {
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)

    // 先按在**不能放**的格上 ⇒ 候选格不记、拒绝闪记下。
    await cellAt(field, 0, 3).trigger('pointerdown')
    expect(
      field.findAll('.range-overlay.is-refused').length,
      '按在不能放的格上却没有拒绝闪 —— 夹具前提不成立（这条判据是空的）',
    ).toBe(1)

    // 再按在**能放**的格上 ⇒ 候选格记下、覆盖层亮起。
    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    expect(field.findAll('.range-overlay.is-in-range').length, '夹具前提不成立：候选格没记下').toBeGreaterThan(0)

    // 孩子**原地不动、却在别处松手** ⇒ 指针从未离开棋盘 ⇒ `pointerleave` 不冒。
    window.dispatchEvent(new MouseEvent('pointerup'))
    // ⚠️ 必须等一拍：DOM 是响应式更新的，`dispatchEvent` 是**同步**的 ——
    //   不等 nextTick 的话读到的仍是清之前的 DOM ⇒ 这条判据会**恒红**。
    await nextTick()

    expect(
      field.findAll('.battle-cell.is-candidate').length,
      '🔴 松手处不是任何一格时，候选格没收掉 —— ' +
        '**射程覆盖层一直亮着**（一片「这里能放」的绿光），而什么也没种、卡也还选着 ⇒ ' +
        '孩子面对一块「看起来已经武装好了」的盘 + 一个不响应的点击。',
    ).toBe(0)
    expect(
      field.findAll('.range-overlay.is-in-range').length,
      '🔴 覆盖层没收掉 —— 屏幕上仍是一片「这里能放」的绿光',
    ).toBe(0)
  })

  it('③ 回归：松手处**就是某一格**时，预览必须跟着手指走（窗口处理器不许无条件清）', async () => {
    // ⚠️ 这一条防的是「③ 的修法过头」：窗口处理器若无条件清，
    //   格子自己的处理器刚把候选格移到 B，紧接着就被清掉 ⇒ 预览永远不跟随手指
    //   ⇒ **AC-E1 又废一次**（AC-E1 逐字：「落在别处 ⇒ 只移预览，不种」）。
    reset({ sun: 1000, unlocked: [ENTRY_OF.direct] })
    const field = mountField()
    selectTowerCard(ENTRY_OF.direct)

    await cellAt(field, ZOMBIE_ROW, 3).trigger('pointerdown')
    await cellAt(field, ZOMBIE_ROW, 5).trigger('pointerup')

    expect(
      field.findAll('.battle-cell.is-candidate').length,
      '🔴 松手在另一格上时，候选格被清掉了 —— 预览不跟随手指 ⇒ AC-E1「只移预览，不种」不可达',
    ).toBe(1)
    expect(
      inRangeKeys(field),
      '🔴 预览跟到了错误的格子上（AC-E1 要求预览跟着手指走）',
    ).toEqual([...coverCellsAt(ZOMBIE_ROW, 5, 'direct')].sort())
  })
})

/**
 * 临时给 `Element.prototype` 打上 `hasPointerCapture` / `releasePointerCapture` 的桩。
 *
 * ⚠️ **为什么需要打桩**：jsdom **不实现** Pointer Events ⇒ 这两个方法**根本不存在**
 *   ⇒ 组件里那句 `typeof target.releasePointerCapture !== 'function'` 会直接早退
 *   ⇒ 守卫会测到「一条永远早退的分支」而全绿（假绿）。
 * ⇒ 桩让组件走**真实分支**；桩本身的行为由用例给（`releaseThrows` / `released`）。
 *
 * ⚠️ **用完必须还原**：这两个方法挂在 `Element.prototype` 上 ⇒ 泄漏到别的用例
 *   会让别的守卫在「有桩的世界」里跑。
 */
async function withPointerCaptureStubs(
  options: { readonly released: number[]; readonly releaseThrows: boolean },
  run: () => Promise<void>,
): Promise<void> {
  const proto = Element.prototype as unknown as Record<string, unknown>
  const originalHas = proto.hasPointerCapture
  const originalRelease = proto.releasePointerCapture
  proto.hasPointerCapture = function hasPointerCapture(): boolean {
    return true
  }
  proto.releasePointerCapture = function releasePointerCapture(pointerId: number): void {
    options.released.push(pointerId)
    if (options.releaseThrows) throw new Error('NotFoundError: 该指针没有捕获')
  }
  try {
    await run()
  } finally {
    if (originalHas === undefined) delete proto.hasPointerCapture
    else proto.hasPointerCapture = originalHas
    if (originalRelease === undefined) delete proto.releasePointerCapture
    else proto.releasePointerCapture = originalRelease
  }
}
