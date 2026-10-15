/**
 * 建造判据的守卫（Story 1.12 / AC-B5）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **`placementBlockedReason` 与 `reducer.placeTower` 的真实接受 / 拒绝逐条一致**
 *   —— 本 story 最重要的一条跨层漂移守卫。判据「本函数返回 `null`」与
 *   「`reduce()` 不抛错」必须**同时**成立或同时不成立（AC-B2 的契约）。
 * · `coverCellsAt` 的**逐格实算表**（裁决 1：预览 = 真实伤害形状）。
 * · `handCards` 的顺序 / 造价 / `affordable` 边界 / `label` 规则（裁决 5）。
 *
 * ── 为什么走公共入口 `reduce()`（照 `buildable-cells.test.ts` 的先例）─────────
 *   `placeTowerIn` 是 reducer.ts 的**私有**函数（未 export）。早期版本从
 *   `src/core/reducer` 直接 import 它 —— import 到的是 `undefined`，调用即抛
 *   TypeError，被 `catch` 吞掉，于是**每一格都答「不可放」**，
 *   矩阵立刻变成几千条「不一致」。看起来是漂移守卫在报警，实际是探测棒自己坏了 ——
 *   这是守卫测试里最坏的一类假红。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 *   「本函数返回 null」与「reduce 不抛错」是**两条独立算出来的**事实：
 *   一条来自 `core/build.ts`，一条穿过 `reducer` 的完整阶段分发与不变量断言。
 *   **绝不可**写成「若 reason 为 null 才去调 reduce」—— 那会让矩阵的每一格都
 *   构造上恒真（AC-G5：恒真的断言 = 假绿）。
 */

import { describe, expect, it } from 'vitest'

import {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  answer,
  cellKey,
  continueRound,
  costOf,
  coverCellsAt,
  createInitialState,
  endBuild,
  handCards,
  placeTower,
  placementBlockedReason,
  reduce,
  resolveRound,
  type DeckEntry,
  type State,
} from '../../src/core'
import { entriesOf } from '../../src/content'

import { correctOptionId, makeSyntheticDeck } from '../fixtures/synthetic-deck'

// ── 测试用的题单与常量 ──────────────────────────────────────────────────────

/** 三道题的合成题单：`direct / slow / aoe` 三塔型各一（fixture 的轮转保证）。 */
const DECK = makeSyntheticDeck(3, 1)
const ALL_ENTRY_IDS = DECK.map((entry) => entry.entryId)
/** 本文件绝大多数用例用这一张卡（fixture 第 0 条 ⇒ `direct` 塔）。 */
const ENTRY_ID = DECK[0].entryId
/** 该卡的造价。**从 `costOf` 取而不是写死 50** —— 档位扩展（Epic 2 的 2-3）后本文件跟着走。 */
const COST = costOf(DECK[0].towerType, 1)

/** 全部 45 格的坐标。**独立枚举**，不从被测代码的同一份循环推出来。 */
function everyCell(): readonly { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) cells.push({ row, col })
  }
  return cells
}

/** 六种阶段。**逐一列出**而不是从 `Phase` 类型反推 —— 反推需要运行时值，拿不到。 */
const ALL_PHASE_KINDS: readonly State['phase']['kind'][] = [
  'awaiting-answer',
  'awaiting-build',
  'resolving',
  'round-over',
  'level-complete',
  'level-failed',
]

// ── state 工厂 ─────────────────────────────────────────────────────────────

/**
 * 造一份 `awaiting-build` 且**全部解锁**、阳光给足的 state。
 *
 * ⚠️ **镜像必须同步**（`types.ts:302-305` / `reducer.ts` 的 `assertPhaseMirror`）：
 *   `awaiting-build` 上的 `unlocked` / `sun` 是 State 侧同名字段的只读镜像，
 *   `reduce` 出口会断言两者恒等。手工拼 `State` 时漏掉这一半，
 *   下面每一次 `reduce` 都会抛「Phase 上的 sun 与 State 不一致」——
 *   **探测棒坏掉**，矩阵整片误报（与 `buildable-cells.test.ts` 记的同一个坑）。
 */
function baseBuildState(
  sun: number,
  unlocked: readonly string[] = ALL_ENTRY_IDS,
  deck: readonly DeckEntry[] = DECK,
): State {
  return {
    ...createInitialState({ unitNumber: 1, deck }),
    phase: { kind: 'awaiting-build', unlocked: [...unlocked], sun },
    sun,
    unlocked: [...unlocked],
    // ⚠️ `unlocked ⊆ mastered` 是 reducer 出口一条**比 AC-13 更强**的不变量
    //   （解锁的唯一途径是答对）。只填 `unlocked` 会让每次 reduce 都抛错。
    masteredEntryIds: [...unlocked],
    grid: {},
    towers: [],
  }
}

/** 在给定 state 上真的建一座塔（走 `reduce`），返回带塔的新 state。 */
function withTower(base: State, row: number, col: number): State {
  return reduce(base, placeTower(ENTRY_ID, cellKey(row, col)))
}

/**
 * 把 state 切到指定阶段。
 *
 * ⚠️ **终态（`level-complete` / `level-failed`）是直接拼出来的**，不走 `reduce`。
 *   理由：要真走到 `level-complete` 需要把 3 道题全部答对再推三个回合，
 *   而本断言问的是「判据在那个阶段答什么」，与那个 state 是怎么来的无关。
 *   `{kind: 'level-complete'}` 是 `Phase` 联合的合法成员，类型上完全成立。
 *
 * ⚠️ 只有 `awaiting-build` 带镜像字段 —— 换到别的阶段时镜像字段本就���存在，
 *   所以这里**整个替换** `phase`，而不是逐字段改。
 */
function atPhase(base: State, kind: State['phase']['kind']): State {
  if (kind === 'awaiting-build') {
    // 保住镜像：解锁集合与阳光都可能已被调用方改过。
    return { ...base, phase: { kind: 'awaiting-build', unlocked: [...base.unlocked], sun: base.sun } }
  }
  return { ...base, phase: { kind } as State['phase'] }
}

/**
 * 覆盖态：真的在 (row, col) 建一座塔，让 `grid` 与 `towers` 双向一致。
 *
 * ⚠️ **两个陷阱都是实测踩出来的，两者都不会让交叉断言变红**（两边都答「拒」），
 *   只会悄悄削掉一半以上的鉴别力：
 *   ① **建塔会扣掉 `COST`**，所以起始阳光要多给一份 —— 否则余额变成 1，
 *      「占用」这一维被「阳光不足」掩盖（实测接受数 70 而非 138）。
 *   ② **塔是拿「全部解锁」造的**，所以解锁集与相位必须**事后**替换 ——
 *      否则矩阵里另外四个维度（6 个相位 × 2 个解锁态）在这一支上全部失效，
 *      接受数被放大到 886。`sun` 是**建塔之后**的余额，与矩阵那一维一一对应。
 */
function occupiedAt(
  row: number,
  col: number,
  sun = COST,
  unlocked: readonly string[] = ALL_ENTRY_IDS,
  kind: State['phase']['kind'] = 'awaiting-build',
): State {
  const built = withTower(baseBuildState(sun + COST, ALL_ENTRY_IDS), row, col)
  const trimmed: State = { ...built, unlocked: [...unlocked], masteredEntryIds: [...unlocked] }
  return atPhase(trimmed, kind)
}

// ══════════════════════════════════════════════════════════════════════════════
// AC-B2 / AC-B5 —— 与 placeTowerIn 的交叉断言矩阵
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 「reducer 接受这一格吗」—— **独立于** `placementBlockedReason` 算出。
 *
 * 走公共入口 `reduce()`；非法坐标时 `cellKey` 自己会抛，同样答「不可放」，
 * 这与 `buildBlockedReason` 对越界坐标的判定是同一件事的两端。
 */
function reducerAccepts(state: State, row: number, col: number): boolean {
  try {
    reduce(state, placeTower(ENTRY_ID, cellKey(row, col)))
    return true
  } catch {
    return false
  }
}

describe('AC-B2 契约 —— placementBlockedReason 返回 null ⇔ reduce 不抛错', () => {
  it('🚨 阶段(6) × 45 格 × 占用态(2) × 阳光(4) × 解锁态(2) 全矩阵一致', () => {
    // 矩阵规模：6 × 45 × 2 × 4 × 2 = 4320 组。
    // ⚠️ 每组的两个事实**独立**算出：判据来自 `core/build.ts`，接受与否来自
    //   `reduce()` 的完整阶段分发 + 不变量断言。任何一侧漂移都会在这里露出来。
    const sunLevels: readonly number[] = [0, COST - 1, COST, COST + 1]
    const occupancy: readonly (readonly [number, number] | null)[] = [null, [ZOMBIE_ROW, 4]]
    const unlockStates: readonly (readonly string[])[] = [[], ALL_ENTRY_IDS]

    const disagreements: string[] = []
    let compared = 0
    let accepted = 0

    for (const kind of ALL_PHASE_KINDS) {
      for (const { row, col } of everyCell()) {
        for (const occupied of occupancy) {
          for (const sun of sunLevels) {
            for (const unlocked of unlockStates) {
              const base = atPhase(baseBuildState(sun, unlocked), kind)
              // ⚠️ 占用态单独造（而不是把造好的 state 铺到 base 上）：
              //   后者会把 base 的 sun / phase 一起覆盖掉，占用维度就被
              //   「阳光不足」掩盖 —— 两边都答「拒」，交叉断言照样绿。
              const state =
                occupied === null ? base : occupiedAt(occupied[0], occupied[1], sun, unlocked, kind)

              const reason = placementBlockedReason(state, ENTRY_ID, row, col)
              const acceptedByReducer = reducerAccepts(state, row, col)
              compared += 1
              if (acceptedByReducer) accepted += 1

              if ((reason === null) !== acceptedByReducer) {
                disagreements.push(
                  `[${kind}] (${row},${col}) 占用=${occupied === null ? '空' : '已占'} ` +
                    `sun=${sun} 解锁=${unlocked.length > 0}：` +
                    `placementBlockedReason=${reason === null ? 'null' : JSON.stringify(reason)} ` +
                    `reducer=${acceptedByReducer ? '接受' : '拒绝'}`,
                )
              }
            }
          }
        }
      }
    }

    expect(disagreements.slice(0, 10), `共 ${disagreements.length} 组不一致`).toEqual([])
    expect(compared).toBe(6 * 45 * 2 * 4 * 2)
    // 🚨 **矩阵既不是全拒也不是全收**（探测棒没坏）。
    // 精确账：只有 `awaiting-build` 且解锁充足的两档阳光能过；空战场 35 格 /
    // 已占一格 34 格（被占的那格是 (2,4)，恰好在可建区内）。
    //   2 档阳光(COST / COST+1) × (35 + 34) = 138
    // 其余五个相位、以及阳光不足的两档、未解锁的一档，恒被拒。
    expect(accepted).toBe(138)
    expect(compared - accepted).toBe(4320 - 138)
  })

  it('反向：矩阵既不是「全拒」也不是「全收」（探测棒没坏）', () => {
    // ⚠️ **这条是上面那条的前置**：如果探测棒恒答 false，上面会报出几千条
    //   「不一致」，看起来像守卫报警，实际是探测棒坏了。把真值表的形状钉死，
    //   坏法就被限死在少数几种。
    let accepted = 0
    let rejected = 0
    const state = baseBuildState(COST + 1)
    for (const { row, col } of everyCell()) {
      if (reducerAccepts(state, row, col)) accepted += 1
      else rejected += 1
    }
    // 阳光充足、全部解锁、战场为空 ⇒ 只有两列不可建 ⇒ 恰 35 收 / 10 拒。
    expect(accepted).toBe(35)
    expect(rejected).toBe(ROWS * 2)

    // 而「未解锁」「阳光不足」这两个维度各自都能独立翻面。
    expect(placementBlockedReason(baseBuildState(COST + 1, []), ENTRY_ID, ZOMBIE_ROW, 4)).toContain('尚未解锁')
    expect(placementBlockedReason(baseBuildState(COST - 1), ENTRY_ID, ZOMBIE_ROW, 4)).toContain('阳光不足')
  })
})

describe('AC-B2 —— 八条判据逐条给出各自的因果文案', () => {
  /** 造一份「其余条件全部满足」的 state，用它逐条单独破坏一个条件。 */
  function otherwisePerfect(overrides: Partial<State> = {}): State {
    return { ...baseBuildState(COST + 1), ...overrides }
  }

  it('① 塔卡未解锁', () => {
    const reason = placementBlockedReason(baseBuildState(COST + 1, []), ENTRY_ID, ZOMBIE_ROW, 4)
    expect(reason).toContain('尚未解锁')
    expect(reason).toContain('答对的奖励')
  })

  it('② 题单回查不到（脏数据）', () => {
    // ⚠️ 必须让这个 entryId **在 unlocked 里、却不在 deck 里** ——
    //   若它压根没解锁，先撞上的是 ①「尚未解锁」，这条就测不到 ② 了
    //   （而 ① 与 ② 恰好是本函数里仅有的两条「数据找不到」判据）。
    const state = baseBuildState(COST + 1, ['u1-not-in-deck'])
    const reason = placementBlockedReason(state, 'u1-not-in-deck', ZOMBIE_ROW, 4)

    expect(reason).toContain('题单里没有')
    expect(reason).toContain('存档')
  })

  it('③ 坐标非法（非整数 / 越界）—— 组件层不 throw，返回原因', () => {
    for (const [row, col] of [
      [-1, 4],
      [ROWS, 4],
      [0, -1],
      [0, COLS],
      [1.5, 4],
      [2, Number.NaN],
    ] as const) {
      const reason = placementBlockedReason(otherwisePerfect(), ENTRY_ID, row, col)
      expect(reason, `(${row}, ${col}) 必须被拒`).toContain('不在')
    }
  })

  it("③' 僵尸入场格", () => {
    const reason = placementBlockedReason(otherwisePerfect(), ENTRY_ID, ZOMBIE_ROW, ZOMBIE_SPAWN_COL)
    expect(reason).toContain('入场格')
    expect(reason).toContain('单边')
  })

  it("③'' 房子格", () => {
    const reason = placementBlockedReason(otherwisePerfect(), ENTRY_ID, ZOMBIE_ROW, HOUSE_COL)
    expect(reason).toContain('房子格')
    expect(reason).toContain('离场')
  })

  it('④ 该格已有塔（返回已有塔的 id）', () => {
    const state = occupiedAt(ZOMBIE_ROW, 4)
    const reason = placementBlockedReason(state, ENTRY_ID, ZOMBIE_ROW, 4)
    expect(reason).toContain('已有塔 t1')
  })

  it('⑤ 阳光不足：消息里带**所需与现有两个数字**', () => {
    const reason = placementBlockedReason(baseBuildState(COST - 1), ENTRY_ID, ZOMBIE_ROW, 4)
    expect(reason).toContain(`需要 ${COST}`)
    expect(reason).toContain(`只有 ${COST - 1}`)
  })

  it('⑥ 不在 awaiting-build 阶段', () => {
    for (const kind of ALL_PHASE_KINDS.filter((k) => k !== 'awaiting-build')) {
      const reason = placementBlockedReason(atPhase(otherwisePerfect(), kind), ENTRY_ID, ZOMBIE_ROW, 4)
      expect(reason, `${kind} 阶段必须被拒`).toContain('现在不是建造时间')
    }
  })

  it('🚨 八条消息两两不同（不得压扁成一句笼统的「不能放」）', () => {
    // 逐条取一个「只被这一条拒绝」的 state，收集 8 条消息。
    const messages = [
      placementBlockedReason(baseBuildState(COST + 1, []), ENTRY_ID, ZOMBIE_ROW, 4),
      placementBlockedReason(baseBuildState(COST + 1, ['u1-not-in-deck']), 'u1-not-in-deck', ZOMBIE_ROW, 4),
      placementBlockedReason(otherwisePerfect(), ENTRY_ID, -1, 4),
      placementBlockedReason(otherwisePerfect(), ENTRY_ID, ZOMBIE_ROW, ZOMBIE_SPAWN_COL),
      placementBlockedReason(otherwisePerfect(), ENTRY_ID, ZOMBIE_ROW, HOUSE_COL),
      placementBlockedReason(occupiedAt(ZOMBIE_ROW, 4), ENTRY_ID, ZOMBIE_ROW, 4),
      placementBlockedReason(baseBuildState(COST - 1), ENTRY_ID, ZOMBIE_ROW, 4),
      placementBlockedReason(atPhase(otherwisePerfect(), 'resolving'), ENTRY_ID, ZOMBIE_ROW, 4),
    ]

    for (const m of messages) expect(m).not.toBeNull()
    expect(new Set(messages).size, '8 条判据必须给出 8 条互不相同的原因').toBe(8)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-B3 —— coverCellsAt 的逐格实算表
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-B3 —— coverCellsAt 逐格实算（裁决 1：预览 = 真实伤害形状）', () => {
  it('direct / slow（range 3，第 3 行）：col1→[2,3,4] … col7→[8]', () => {
    // ⚠️ 这些数字是**实算结果**，不是「应该是」—— 它们由 `inRange` 与
    //   `rangeOf` 的实现决定，写在这里是为了让任何人改动判据时立刻看到差异。
    const expected: Record<number, readonly string[]> = {
      1: ['2,2', '2,3', '2,4'],
      2: ['2,3', '2,4', '2,5'],
      3: ['2,4', '2,5', '2,6'],
      4: ['2,5', '2,6', '2,7'],
      5: ['2,6', '2,7', '2,8'],
      6: ['2,7', '2,8'],
      7: ['2,8'],
    }

    for (const towerType of ['direct', 'slow'] as const) {
      for (const [col, cells] of Object.entries(expected)) {
        expect(coverCellsAt(ZOMBIE_ROW, Number(col), towerType), `${towerType} @ col${col}`).toEqual(cells)
      }
    }
  })

  it('aoe（第 3 行）：col1→[0,1,2] col3→[2,3,4] col7→[6,7,8] —— 含自身', () => {
    expect(coverCellsAt(ZOMBIE_ROW, 1, 'aoe')).toEqual(['2,0', '2,1', '2,2'])
    expect(coverCellsAt(ZOMBIE_ROW, 3, 'aoe')).toEqual(['2,2', '2,3', '2,4'])
    expect(coverCellsAt(ZOMBIE_ROW, 7, 'aoe')).toEqual(['2,6', '2,7', '2,8'])
  })

  it('🚨 非僵尸行一律空集合（turn.ts:82 —— 第 2/4 行的塔整局不开火）', () => {
    // 这是裁决 1 的核心断言，也是变异 M57 的靶心。
    // ⚠️ 注意它在**每一个** col 上都成立，包括可建格 —— 「相邻行能打到中间行」
    //   是 epics.md:1014 / gdd.md:337 说的话，而实现里从未成立过。
    for (const row of [0, 1, 3, 4]) {
      for (const towerType of ['direct', 'slow', 'aoe'] as const) {
        for (let col = 0; col < COLS; col += 1) {
          expect(coverCellsAt(row, col, towerType), `(${row},${col}) ${towerType}`).toEqual([])
        }
      }
    }
  })

  it('返回值恒为升序（变异 M71：升序改成降序会红）', () => {
    for (const towerType of ['direct', 'slow', 'aoe'] as const) {
      for (let col = 0; col < COLS; col += 1) {
        const cells = coverCellsAt(ZOMBIE_ROW, col, towerType)
        expect([...cells], `${towerType} @ col${col} 必须升序`).toEqual([...cells].sort())
      }
    }
  })

  it('返回的每一格都必须是合法的规范格子键（不给假格子）', () => {
    for (let col = 0; col < COLS; col += 1) {
      for (const cell of coverCellsAt(ZOMBIE_ROW, col, 'aoe')) {
        expect(cell).toMatch(/^-?\d+,-?\d+$/)
        const [row, c] = cell.split(',')
        expect(Number(row)).toBe(ZOMBIE_ROW)
        expect(Number(c)).toBeGreaterThanOrEqual(0)
        expect(Number(c)).toBeLessThan(COLS)
      }
    }
  })

  it('脏输入抛错（AC-7：只 throw 不静默）', () => {
    expect(() => coverCellsAt(1.5, 4, 'direct')).toThrow()
    expect(() => coverCellsAt(ZOMBIE_ROW, 4, 'driect' as never)).toThrow()
    // 🚨 越界列在**两种塔型上同等对待**（[CR] P9「校验面一致」）：
    //   `aoe` 走 `aoeColumns` 会抛，而 `direct` 若不补这一刀就只会安静地答 []。
    expect(() => coverCellsAt(ZOMBIE_ROW, -1, 'direct')).toThrow()
    expect(() => coverCellsAt(ZOMBIE_ROW, -1, 'aoe')).toThrow()
    expect(() => coverCellsAt(ZOMBIE_ROW, COLS, 'slow')).toThrow()
  })

  it('🚨 非僵尸行时**不校验列**（短路在越界检查之前）', () => {
    // 短路是有意的：非僵尸行 ⇒ 空集合，与列无关。这条把「短路顺序」钉死，
    // 否则将来把列校验提到前面去，这条会红而没人说得清为什么。
    expect(coverCellsAt(1, 99, 'direct')).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-B4 —— handCards
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-B4 —— handCards 的顺序 / 造价 / 可买性边界', () => {
  it('只收录 state.unlocked 里的条目，且顺序 === unlocked 顺序（不排序）', () => {
    // ⚠️ 顺序必须是**解锁顺序 = 答对顺序**（裁决 2）。这里特意给一个**逆字典序**
    //   的 unlocked，排序过的实现会立刻露馅。
    const shuffled = [DECK[2].entryId, DECK[0].entryId, DECK[1].entryId]
    const cards = handCards(baseBuildState(COST * 3, shuffled))

    expect(cards.map((c) => c.entryId)).toEqual(shuffled)
    expect(shuffled).not.toEqual([...shuffled].sort())
  })

  it('空 unlocked ⇒ 空数组', () => {
    expect(handCards(baseBuildState(COST, []))).toEqual([])
  })

  it('造价由 costOf(towerType, unitNumber) 给出，组件不得写死', () => {
    const cards = handCards(baseBuildState(COST * 10, ALL_ENTRY_IDS))

    for (const card of cards) {
      expect(card.cost).toBe(costOf(card.towerType, 1))
    }
    // 三个 fixture 塔型都要走到（direct 50 / slow 50 / aoe 75）。
    expect(new Set(cards.map((c) => c.cost))).toEqual(new Set([costOf('direct', 1), costOf('aoe', 1)]))
  })

  it('affordable 边界：sun === cost ⇒ true；sun === cost − 1 ⇒ false', () => {
    // 🚨 **两个 fixture 必须成对**，不能用「sun 恰好等于造价」单条 ——
    //   那时判 affordability 的条件与不判等价（AC-G5：构造上恒真 = 假绿）。
    const affordable = handCards(baseBuildState(COST, [ENTRY_ID]))
    const short = handCards(baseBuildState(COST - 1, [ENTRY_ID]))

    expect(affordable[0].affordable).toBe(true)
    expect(short[0].affordable).toBe(false)
  })

  it('已解锁但题单里查不到的条目**跳过而不是抛错**（存档脏数据）', () => {
    // 与 level-driver.ts 的「造价最低的已解锁卡」同一口径：抛错会让一张脏卡
    // 挡住整个手牌区 —— 孩子看到的是空白，而不是「这一张没了」。
    const state = baseBuildState(COST * 3, [...ALL_ENTRY_IDS, 'u1-ghost-entry'])

    expect(() => handCards(state)).not.toThrow()
    expect(handCards(state).map((c) => c.entryId)).toEqual(ALL_ENTRY_IDS)
  })
})

describe('AC-B4 / 裁决 5 —— label = promptText 全文，三类卡各取一条 fixture', () => {
  /** 真实单元 1 题单（37 词条）。裁决 5 的三类 fixture 都出自这里。 */
  const REAL = entriesOf(1)

  /** 造一份「单卡已解锁」的 state，题单用**真实**单元 1。 */
  function stateWithOne(entryId: string, sun: number): State {
    return baseBuildState(sun, [entryId], REAL)
  }

  it('word 卡：u1-hello ⇒ Hello', () => {
    const card = handCards(stateWithOne('u1-hello', 9999))[0]
    expect(card.label).toBe('Hello')
    expect(card.label).toBe(REAL.find((e) => e.entryId === 'u1-hello')?.card.promptText)
  })

  it('response 卡：u1-s-good-morning ⇒ Good morning!', () => {
    const card = handCards(stateWithOne('u1-s-good-morning', 9999))[0]
    expect(card.label).toBe('Good morning!')
  })

  it('keyword 卡：u1-s-i-have-a-ball-for-my-dog ⇒ I have a ball for my dog.（25 字符）', () => {
    const card = handCards(stateWithOne('u1-s-i-have-a-ball-for-my-dog', 9999))[0]
    expect(card.label).toBe('I have a ball for my dog.')
    // 这个字面量是 AC-C3 宽度推导的**最坏情况**，注释里引用的就是它。
    expect(card.label.length).toBe(25)
  })

  it('🚨 全部 37 张的 label 里没有一个含 `-`（被否掉的 slug 路线的反向夹具）', () => {
    // 被否掉的那条路是 `wordId` 去掉 `u1-` 前缀。它在单词卡上恰好等于
    // `promptText`，在 response / keyword 卡上却是句子 slug
    // （`s-i-have-a-ball-for-my-dog` 26 字符，是最长单词 `beautiful` 的 2.9 倍）。
    // ⇒ 「label 含 `-`」正是那条路留下的痕迹，一条就足以把整批卡否掉。
    const cards = handCards(baseBuildState(999_999, REAL.map((e) => e.entryId), REAL))

    expect(cards).toHaveLength(37)
    const withHyphen = cards.filter((c) => c.label.includes('-'))
    expect(withHyphen.map((c) => `${c.entryId} ⇒ ${c.label}`)).toEqual([])
  })

  it('🚨 label 逐字等于 promptText（不是它的化简，也不是 slug）', () => {
    const cards = handCards(baseBuildState(999_999, REAL.map((e) => e.entryId), REAL))

    for (const card of cards) {
      const entry = REAL.find((e) => e.entryId === card.entryId)
      expect(entry, `题单里没有 ${card.entryId}`).toBeDefined()
      expect(card.label, `${card.entryId} 的 label 必须逐字等于 promptText`).toBe(entry?.card.promptText)
    }
  })

  it('反向：走 wordId 去前缀这条路的 label 确实含 `-`（证明上面那条夹具有鉴别力）', () => {
    // AC-B5 明确要求的反向夹具：把裁决 5 的**被否方案**实算一遍，
    // 让上面那条 `label.includes('-')` 的断言证明自己不是恒真。
    const slugRoute = REAL.map((e) => ({
      entryId: e.entryId,
      label: e.wordId.replace(/^u1-/, ''),
    }))

    const offenders = slugRoute.filter((c) => c.label.includes('-'))
    expect(offenders.map((c) => `${c.entryId} ⇒ ${c.label}`)).toContain('u1-s-i-have-a-ball-for-my-dog ⇒ s-i-have-a-ball-for-my-dog')
    // 最长的一条：26 字符，是最长单词 `beautiful`（9 字符）的 2.9 倍。
    const longest = slugRoute.reduce((a, b) => (a.label.length >= b.label.length ? a : b))
    expect(longest.label).toBe('s-i-have-a-ball-for-my-dog')
    expect(longest.label.length).toBe(26)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-B5 的最后一条 —— handCards 与真实状态机走一遍
// ══════════════════════════════════════════════════════════════════════════════

describe('handCards 与真实状态机的一致性（不是手拼 state）', () => {
  it('答对一题 ⇒ 手牌恰好多出一张卡，且它就是那道题', () => {
    const start = createInitialState({ unitNumber: 1, deck: DECK })
    expect(handCards(start)).toEqual([])

    const answered = reduce(start, answer(correctOptionId(DECK[0])))

    expect(answered.phase.kind).toBe('awaiting-build')
    const cards = handCards(answered)
    expect(cards.map((c) => c.entryId)).toEqual([DECK[0].entryId])
    expect(cards[0].label).toBe(DECK[0].card.promptText)
    expect(cards[0].towerType).toBe(DECK[0].towerType)
    expect(cards[0].cost).toBe(costOf(DECK[0].towerType, 1))
  })

  it('建塔后卡**仍留在手里**（FR33：手牌不因建造而消失）', () => {
    const start = createInitialState({ unitNumber: 1, deck: DECK })
    const answered = reduce(start, answer(correctOptionId(DECK[0])))
    const built = reduce(answered, placeTower(DECK[0].entryId, cellKey(ZOMBIE_ROW, 4)))

    expect(built.sun).toBe(answered.sun - COST)
    expect(handCards(built).map((c) => c.entryId)).toEqual([DECK[0].entryId])
    // 阳光扣掉后可能买不起 —— 那正是「变灰且不可点」的数据来源（AC-C4）。
    expect(handCards(built)[0].affordable).toBe(built.sun >= COST)
  })

  it('走完一整个回合（END_BUILD → RESOLVE → CONTINUE）后手牌仍在', () => {
    const start = createInitialState({ unitNumber: 1, deck: DECK })
    const answered = reduce(start, answer(correctOptionId(DECK[0])))
    const resolved = reduce(reduce(answered, endBuild()), resolveRound())
    const next = reduce(resolved, continueRound())

    expect(next.phase.kind).toBe('awaiting-answer')
    expect(handCards(next).map((c) => c.entryId)).toEqual([DECK[0].entryId])
  })
})
