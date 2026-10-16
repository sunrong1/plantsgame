/**
 * 塔位合法性与血量比例（Story 1.10 / AC-12、AC-9）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **`canBuildAt()` 与 `reducer.placeTower` 的真实接受 / 拒绝逐格一致** ——
 *   这是本 story 最重要的一条**漂移守卫**，理由见下。
 * · `canBuildAt()` 的真值表：合法塔位恰好 **7 格**，不是 45 格
 *   （[CR] 2026-10-16 裁决 6 之前是 35 格，见下方 describe 的注释）。
 * · `buildBlockedReason()` 对每一类不可建给出可区分的原因。
 * · `zombieHpRatio()` 的取值与钳位。
 *
 * ── 为什么必须有上面那条交叉断言（这是本文件存在的理由）──────────────────
 *   `canBuildAt()` 是**新增**的纯谓词，供组件表达「这一格能不能建」；
 *   而 `reducer.placeTowerIn` 里的两条拦截（`col === HOUSE_COL` /
 *   `col === ZOMBIE_SPAWN_COL`）是 `[CR]` 2026-10-14 补的、**本 story 没有改动**。
 *   两者读的是同一批常量，但**没有任何东西强制它们继续一致** ——
 *   改一处而忘了另一处时，UI 会把一格显示成「可以建」，孩子点下去撞上一条报错，
 *   **界面上没有任何东西指向原因**。
 *
 *   ⚠️ 本 story 刻意**没有**把 reducer 改成调用 `canBuildAt()`（取舍写在
 *     `src/core/grid.ts` 的 `buildBlockedReason` 注释里：会压扁那两条
 *     带因果的排查消息，且越过「不要改战斗判定」的边界）。
 *     ⇒ 结论是：**漂移是被守住的，不是被消除的**。这条断言就是那个「守住」。
 *
 * ── 这不是重复测 reducer ──────────────────────────────────────────────────
 *   reducer 的**阶段流转**由 `reducer.test.ts` / `turn.test.ts` 守；
 *   本文件只问一个跨层的一致性问题：「UI 说的和 reducer 做的是不是同一件事」。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_HP,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  buildBlockedReason,
  canBuildAt,
  cellKey,
  createInitialState,
  createZombie,
  reduce,
  zombieHpRatio,
  type State,
} from '../../src/core'

import { makeSyntheticDeck } from '../fixtures/synthetic-deck'

/** 全部 45 格的坐标。**独立枚举**，不从被测代码的同一份循环推出来。 */
function everyCell(): readonly { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) cells.push({ row, col })
  }
  return cells
}

describe('AC-12 —— 合法塔位恰好 7 格，不是 45 格', () => {
  // ⚠️ [CR] 2026-10-16 裁决 6：数字从 **35 改成 7**。这不是把守卫放松成「随它变」，
  //   是一次**已裁决的放置规则变更**，理由与代价写在 `src/core/grid.ts`
  //   `buildBlockedReason` 的行拦截注释里：非僵尸行的塔整局不开火，
  //   原本「能建但不能打」。守卫的**探测力不变** —— 它照样钉死真值表的形状，
  //   照样能把「悄悄少掉几格」变成红灯。改的是判据，不是松紧。
  it('canBuildAt 为真的格子数 === 1 行（僵尸行）× 7 列 = 7', () => {
    const buildable = everyCell().filter((c) => canBuildAt(c.row, c.col))

    expect(buildable).toHaveLength(7)
    expect(buildable).toHaveLength(COLS - 2)
  })

  it('僵尸行上只有两列不可建，其余行全部不可建', () => {
    for (const c of everyCell()) {
      // 三条拦截（行 + 两列）在本文件里**独立枚举**，不走被测代码的同一份判断 ——
      // 否则「实现和守卫同时改错」会一起变绿。
      const expected =
        c.row === ZOMBIE_ROW && c.col !== HOUSE_COL && c.col !== ZOMBIE_SPAWN_COL
      expect(canBuildAt(c.row, c.col), `格子 (${c.row}, ${c.col}) 的可建性与预期不符`).toBe(expected)
    }
  })

  it('非僵尸行的每一格都不可建，且**原因文案点明「整局不会开火」**', () => {
    // 这条是裁决 6 的正面守卫：孩子点非僵尸行时，reason 必须说清楚为什么，
    // 而不是笼统一句「不能建」（AC-B2 的逐条因果要求）。
    for (const c of everyCell()) {
      if (c.row === ZOMBIE_ROW) continue
      const reason = buildBlockedReason(c.row, c.col)
      expect(reason, `格子 (${c.row}, ${c.col}) 竟然可建`).not.toBeNull()
      expect(reason).toContain('不会开火')
    }
  })

  it('网格外与非整数坐标一律「不可建」，且**不抛错**', () => {
    // 组件层不许 throw（架构 `:567-606`：边界断言放纯逻辑层，不放组件层）。
    // 组件会对任意坐标调 canBuildAt，所以越界必须是 false 而不是异常。
    expect(canBuildAt(-1, 0)).toBe(false)
    expect(canBuildAt(0, -1)).toBe(false)
    expect(canBuildAt(ROWS, 0)).toBe(false)
    expect(canBuildAt(0, COLS)).toBe(false)
    expect(canBuildAt(1.5, 3)).toBe(false)
    expect(canBuildAt(Number.NaN, 3)).toBe(false)
  })

  it('buildBlockedReason 对三类不可建给出可区分的原因', () => {
    expect(buildBlockedReason(2, 3)).toBeNull()

    const offGrid = buildBlockedReason(9, 3)
    const house = buildBlockedReason(2, HOUSE_COL)
    const spawn = buildBlockedReason(2, ZOMBIE_SPAWN_COL)

    expect(offGrid).toContain('不在')
    expect(house).toContain('房子格')
    expect(spawn).toContain('入场格')
    // 三条消息必须**互不相同** —— 笼统的「不能建」会让排查时无从下手。
    expect(new Set([offGrid, house, spawn]).size).toBe(3)
  })
})

describe('AC-12 漂移守卫 —— canBuildAt 与 placeTower 的真实接受 / 拒绝逐格一致', () => {
  /**
   * 用**真实 reducer** 问「这一格能不能建」，绕开所有规则计算的复刻。
   *
   * ⚠️ **走公共入口 `reduce()`，不直接调 `placeTowerIn`**：
   *   `placeTowerIn` 是 reducer.ts 的**私有**函数（未 export），而且它对
   *   「被拒绝」的判断依赖调用方把 state 的前置条件摆对。早期版本从
   *   `src/core/reducer` import 它 —— import 到的是 `undefined`，调用即抛
   *   TypeError，被下面的 `catch` 吞掉，于是**每一格都答 false**，
   *   45 格比对立刻变成 35 条「不一致」。看起来是漂移守卫在报警，
   *   实际是探测棒自己坏了 —— 这正是守卫测试里最坏的一类假红。
   *   ⇒ 改用 `reduce()`（真正对外的那个函数），坏法变得无处藏身。
   *
   * ⚠️ **state 用 `createInitialState` 造，不手工拼对象字面量**：
   *   手工拼的 state 会在 `State` 增删字段时静默漂移，而工厂自带的
   *   `assertInvariants` 会当场报出不一致。
   */
  function reducerAccepts(row: number, col: number): boolean {
    const deck = makeSyntheticDeck(3, 1)
    const entryId = deck[0].entryId
    // 阳光给到极大值、题单全部解锁 —— 这样「被拒绝」只可能是因为**位置**，
    // 不会是因为阳光不足或未解锁（那两条是 ①⑤ 号规则，不在本守卫的范围内）。
    const unlocked = deck.map((entry) => entry.entryId)
    const sun = 1_000_000
    const state: State = {
      ...createInitialState({ unitNumber: 1, deck }),
      phase: { kind: 'awaiting-build', unlocked, sun },
      sun,
      unlocked,
      // ⚠️ 必须同步 `masteredEntryIds`：`reduce` 出口的 `assertInvariants`
      //   有一条**比 AC-13 更强**的不变量 `unlocked ⊆ mastered`
      //   （解锁的唯一途径是答对）。只填 `unlocked` 会让每一格都抛
      //   「已解锁却未答对」——探测棒又变成恒答 false，45 格比对全部误报。
      masteredEntryIds: [...unlocked],
      grid: {},
      towers: [],
    }
    try {
      reduce(state, { type: 'PLACE_TOWER', cell: cellKey(row, col), entryId })
      return true
    } catch {
      return false
    }
  }

  it('45 格逐格比对：canBuildAt 与 placeTower 的判断完全一致', () => {
    const disagreements = everyCell()
      .filter((c) => canBuildAt(c.row, c.col) !== reducerAccepts(c.row, c.col))
      .map((c) => `(${c.row}, ${c.col})：canBuildAt=${canBuildAt(c.row, c.col)} reducer=${reducerAccepts(c.row, c.col)}`)

    expect(
      disagreements,
      'canBuildAt() 与 reducer.placeTowerIn 的判断不一致 —— ' +
        'UI 会把 reducer 拒绝的格子显示成「可以建」，孩子点下去只会撞上一条报错，' +
        '而界面上没有任何东西指向原因。改动其中一侧时必须同步另一侧。',
    ).toEqual([])
  })

  it('反向：reducer 确实拒绝了房子格、入场格与非僵尸行（证明上面那条不是「两边都答 true」的恒真）', () => {
    expect(reducerAccepts(ZOMBIE_ROW, HOUSE_COL)).toBe(false)
    expect(reducerAccepts(ZOMBIE_ROW, ZOMBIE_SPAWN_COL)).toBe(false)
    expect(reducerAccepts(ZOMBIE_ROW, 4)).toBe(true)
    // 裁决 6 的行拦截同样走 reducer（`placeTowerIn` ③' 调 `buildBlockedReason`）。
    for (const row of [0, 1, 3, ROWS - 1]) {
      expect(reducerAccepts(row, 4), `非僵尸行 (${row}, 4) 竟然被 reducer 接受`).toBe(false)
    }
  })

  it('反向：reducer 恰好拒掉 38 格（4 非僵尸行 × 9 列 + 僵尸行 × 2 列），既不是全拒也不是全收', () => {
    // 这一条是上面那条 45 格比对的**前置**：如果探测棒恒答 false，
    // 上面那条会比对出 7 条「不一致」——看起来是守卫报警，其实是探测棒坏了。
    // 把真值表的形状在这里钉死（恰 38 拒 / 7 收），坏法就被限死在
    // 「某一行或某一列整体翻转」这两种。
    // ⚠️ [CR] 裁决 6 之前是「恰 10 拒 / 35 收 = 5 行 × 2 列」；
    //   多出的 28 拒正是新增的**行**拦截（4 行 × 7 个中间列）。
    const rejected = everyCell().filter((c) => !reducerAccepts(c.row, c.col))

    expect(rejected).toHaveLength(ROWS * COLS - (COLS - 2))
    // 拒掉的格子恰好 = 全部非僵尸行 + 僵尸行的两列，两部分互不重叠。
    expect(rejected.filter((c) => c.row !== ZOMBIE_ROW)).toHaveLength((ROWS - 1) * COLS)
    expect(rejected.filter((c) => c.row === ZOMBIE_ROW).map((c) => c.col)).toEqual([
      HOUSE_COL,
      ZOMBIE_SPAWN_COL,
    ])
  })
})

describe('AC-9 —— zombieHpRatio 返回 [0, 1] 的血量比例', () => {
  it('满血 = 1，空血 = 0', () => {
    expect(zombieHpRatio(createZombie({ id: 'z1', col: 4, hp: ZOMBIE_HP }))).toBe(1)
    expect(zombieHpRatio(createZombie({ id: 'z2', col: 4, hp: 0 }))).toBe(0)
  })

  it('半血 = 0.5', () => {
    expect(zombieHpRatio(createZombie({ id: 'z3', col: 4, hp: ZOMBIE_HP / 2 }))).toBe(0.5)
  })

  it('分母跟着 ZOMBIE_HP 走，不是写死的 100', async () => {
    // ⚠️ **不能用「断言结果不等于 (ZOMBIE_HP - 1) / 100」来证明这件事** ——
    //   ZOMBIE_HP 当前恰好是 100，两边算出来完全相等，任何实现（包括写死 100
    //   的错实现）都通过。这是一条**构造上恒真**的断言：早期版本正是这么写的，
    //   它证明不了任何事，只有 ZOMBIE_HP 改动之后才会突然变红 —— 而那时红的
    //   是这个守卫，不是被它守的代码。
    // ⇒ 真要区分，只能**改掉那个常量**：把 ZOMBIE_HP 换成 250，
    //   写死 100 的实现会答 0.5/2.5，正确的实现答 0.5/1.0。
    //   改的是 mock 出来的模块副本，仓库里的 balance.ts 不动。
    vi.resetModules()
    vi.doMock('../../src/core/balance', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/core/balance')>()
      return { ...actual, ZOMBIE_HP: 250 }
    })

    try {
      const { zombieHpRatio: withPatchedHp } = await import('../../src/core/types')
      const probe = (hp: number): number =>
        withPatchedHp({ id: 'zp', col: 4, hp, slowTurnsLeft: 0 })

      expect(probe(125)).toBe(0.5)
      expect(probe(250)).toBe(1)
      // 写死 100 的实现会在这里答 2.5 —— 钳位分支会把它拉到 1，所以
      // 真正把两者分开的是上面两条（尤其满血那条：写死 100 时是 1/1.25 = 0.8）。
    } finally {
      vi.doUnmock('../../src/core/balance')
      vi.resetModules()
    }
  })

  it('越界血量被钳到 [0, 1]，不返回负数或大于 1 的值', () => {
    // `createZombie` 会拒绝越界 hp，所以这里绕过工厂直接构造对象字面量 ——
    // 钳位是为了让返回值在结构上就适合直接当 CSS 宽度百分比。
    expect(zombieHpRatio({ id: 'z5', col: 4, hp: ZOMBIE_HP * 3, slowTurnsLeft: 0 })).toBe(1)
    expect(zombieHpRatio({ id: 'z6', col: 4, hp: -50, slowTurnsLeft: 0 })).toBe(0)
  })
})
