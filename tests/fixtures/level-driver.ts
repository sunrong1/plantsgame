/**
 * 关卡驱动 —— 测试侧跑完整一局的唯一入口（Story 1.5 / AC-16）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 断言 3 / 3b / 4 / 8 都要跑完整的一局（答题 → 建塔 → 结算 → 推进），而这一局
 * 的每一个细节都会改变门槛数字：建塔策略差一列、答对少一题、回合数差一格。
 * 本文件把「怎么跑一局」收敛成**一份**实现，让 reducer.test.ts 与
 * assertions.test.ts 跑的是同一局 —— 否则两份驱动漂移时，
 * 「门槛是 4」这个结论会在两份文件里给出不同的数，而两边都绿。
 *
 * ⚠️ **`scripts/balance-sim.ts` 不许 import 本文件**（AC-15）：那是 `src/` 之外的
 * 开发期脚本，耦合测试 fixture 等于把测试的重构自由度交出去。脚本里另有一份
 * 策略实现 —— 两份跑出的门槛数字必须一致，那正是「模拟跑的是真实实现」的证据。
 *
 * ── 建塔策略为什么钉死「最低空列 + 可建列 [1..7]」 ────────────────────────
 * 与 `balance-scan.py` 的 `range(1, cols-1)` 完全一致（排除 `HOUSE_COL = 0` 的房子格
 * 与 `ZOMBIE_SPAWN_COL = 8` 的僵尸入场格）。策略改变会改变门槛数字 ——
 * `[CS]` 2026-10-13 实测把可建列放宽到 `[0..8]`，门槛从 4 变成 5，
 * 因为 col 0 / col 1 两座塔会打在同一目标上，白白浪费前两次购买。
 * 数字写进注释而不是「设计如此」：这是实测值。
 *
 * 选塔型时取**造价最低**的已解锁卡（单元 1 是 50/50/75）：同样的阳光买更多塔，
 * 而塔是本层唯一的消灭手段。造价口径一律走 `costOf()`，不写死 50。
 */

import { ZOMBIE_ROW, ZOMBIE_SPAWN_COL, answer, cellKey, continueRound, costOf, createInitialState, endBuild, placeTower, reduce, resolveCombatRound, resolveRound } from '../../src/core'
import type { Action, DeckEntry, State } from '../../src/core'
import { correctOptionId, wrongOptionId } from './synthetic-deck.js'

/** 可建列（0-based）。排除房子格 0 与僵尸入场格 8 —— 见文件头。 */
/**
 * 可建列（0-based）—— **从网格常量派生**，不写死 `[1,2,3,4,5,6,7]`。
 *
 * ⚠️ 写死数组会随网格尺寸变化而静默失效（`[CR]` 2026-10-14）：`COLS` 从 9 改成 12
 *   或 `ZOMBIE_SPAWN_COL` 从 8 改成 10 时，两份驱动会**一起**在错误的战场上
 *   测出同一个门槛数字，而它们互相同步 ⇒ 没有任何东西会红。
 *   「门槛 = 4」这个结论必须在真实网格上成立。
 *
 * 与 `balance-scan.py` 的 `range(1, cols - 1)` 一致：排除 `HOUSE_COL` 的房子格
 * 与 `ZOMBIE_SPAWN_COL` 的僵尸入场格 —— 这两格 `placeTowerIn` 现在也会拒绝
 * （`[CR]` 2026-10-14 补的规则），所以派生出来的集合就是全部合法塔位。
 */
export const BUILDABLE_COLUMNS: readonly number[] = Array.from(
  { length: ZOMBIE_SPAWN_COL - 1 },
  (_, index) => index + 1,
)

/** 一个回合的轨迹行。字段与 `[CS]` 实测的逐回合表一一对应。 */
export interface TurnLogEntry {
  readonly turn: number
  readonly towers: number
  readonly zombies: number
  readonly heartsLost: number
  readonly hearts: number
  readonly sun: number
}

/** 一局的跑完结果。 */
export interface LevelRun {
  readonly state: State
  readonly log: readonly TurnLogEntry[]
  /** 跑完全部回合后的累计答错题数。 */
  readonly totalWrong: number
  /** 实际跑过的回合数。 */
  readonly turnsPlayed: number
}

/** 跑一局的选项。 */
export interface RunLevelOptions {
  readonly deck: readonly DeckEntry[]
  /** 第 n 回合（1 起）是否答对。用回合号而不是「第几题」，因为答错会重复考同一题。 */
  readonly correctAt: (turn: number) => boolean
  /** 是否按贪心策略建塔（默认建）。 */
  readonly build?: boolean
  /** 回合数上限（默认 deck.length + 30）—— 重考会把局数拉长。 */
  readonly maxTurns?: number
  /** 单元号，默认 1。 */
  readonly unitNumber?: number
}

/**
 * 跑一局，返回最终 state 与逐回合轨迹。
 *
 * 停止条件：通关 / 失败 / 达到 `maxTurns`。**不会**自己重打。
 */
export function runLevel(options: RunLevelOptions): LevelRun {
  const unitNumber = options.unitNumber ?? 1
  const shouldBuild = options.build ?? true
  const maxTurns = options.maxTurns ?? options.deck.length + 30

  let state = createInitialState({ unitNumber, deck: options.deck })
  const log: TurnLogEntry[] = []
  let totalWrong = 0
  let turnsPlayed = 0

  while (turnsPlayed < maxTurns && isRunning(state)) {
    const turn = state.turn
    // ⚠️ `correctAt` 只求值一次（`[CR]` 2026-10-14）：原先 `answerCurrent` 与
    //   `totalWrong` 各调一次，两次结果被假定相等 —— 而类型上 `correctAt` 没有任何
    //   纯性保证。这个计数正是「门槛 = 4」的来源，必须来自那一次求值。
    const correct = options.correctAt(turn)
    const answered = answerCurrent(state, correct)
    if (!correct) {
      totalWrong += 1
    }
    let withTowers = answered
    if (shouldBuild) {
      for (const action of greedyBuildActions(answered)) {
        withTowers = reduce(withTowers, action)
      }
    }
    // ⚠️ 真实掉心数必须取自 `resolveCombatRound`，**不能**用
    //   `Math.max(0, heartsBefore - resolved.hearts)` 反推：reducer 会把心数夹到 0
    //   （「本回合掉的心多于剩余心」是合法情况），差值于是小于真实掉心数。
    //   少掉的那几颗会被下游的「前 − 后 − 掉心 = 击杀」恒等式**记成击杀** ——
    //   一只抵达房子的僵尸凭空变成一次击杀，而这正是 `decision-log.md`
    //   「模拟器不静默丢弃实体」那条教训在上一层又犯了一次（`[CR]` 2026-10-14）。
    //   `resolveCombatRound` 是纯函数，多调一次不改变结果，也不重复任何规则。
    const realHeartsLost = resolveCombatRound(withTowers.towers, withTowers.zombies).heartsLost
    const resolved = reduce(reduce(withTowers, endBuild()), resolveRound())
    turnsPlayed += 1
    log.push({
      turn,
      towers: resolved.towers.length,
      zombies: resolved.zombies.length,
      heartsLost: realHeartsLost,
      hearts: resolved.hearts,
      sun: resolved.sun,
    })
    state = resolved.phase.kind === 'round-over' ? reduce(resolved, continueRound()) : resolved
  }

  return { state, log, totalWrong, turnsPlayed }
}

/**
 * 状态是否仍在进行中（既未通关也未失败）。
 *
 * ⚠️ 只列 `awaiting-answer`（`[CR]` 2026-10-14）：此前还有 `round-over`，
 *   但 `runLevel` 的循环体尾部必然走到 `CONTINUE`（`round-over` 下它是唯一的合法边）
 *   或一个终态，`round-over` 活不到下一次条件判断 ⇒ 那个分支不可达。
 *   留着会让人以为「回合结束阶段会被重新进入并重新答题」，
 *   而真相是 `CONTINUE` 是强制的那一步。
 */
export function isRunning(state: State): boolean {
  return state.phase.kind === 'awaiting-answer'
}

/**
 * 贪心建塔产生的 action 序列（**纯函数**：不改变入参，也不自己 reduce）。
 *
 * 纯函数是刻意的：调用方要拿到「这一回合打算建什么」来断言，
 * 而驱动脚本要自己按顺序 reduce 同一个序列 —— 两边用同一份决策。
 */
export function greedyBuildActions(state: State): readonly Action[] {
  if (state.phase.kind !== 'awaiting-build') {
    return []
  }
  const actions: Action[] = []
  let cursor: State = state
  while (true) {
    const entry = cheapestUnlockedCard(cursor)
    if (entry === null) {
      return actions
    }
    const free = BUILDABLE_COLUMNS.find((col) => cursor.grid[cellKey(ZOMBIE_ROW, col)] === undefined)
    if (free === undefined) {
      return actions
    }
    const action = placeTower(entry.entryId, cellKey(ZOMBIE_ROW, free))
    actions.push(action)
    cursor = reduce(cursor, action)
  }
}

/**
 * 已解锁卡里造价最低的一张（并列取 `unlocked` 里的先出现者 —— 确定性优先）。
 *
 * ⚠️ 必须**排除**已建过的卡吗？不必：同一张卡可反复建（FR33），而「塔型种类」
 * 对门槛的影响已经由造价体现。刻意不加这层限制 —— 它会让策略依赖历史，
 * 而策略应当只依赖当前局面。
 */
function cheapestUnlockedCard(state: State): DeckEntry | null {
  let best: DeckEntry | null = null
  let bestCost = Number.POSITIVE_INFINITY
  for (const entryId of state.unlocked) {
    const entry = state.deck.find((e) => e.entryId === entryId)
    if (entry === undefined) {
      continue
    }
    const cost = costOf(entry.towerType, state.unitNumber)
    if (cost < bestCost) {
      best = entry
      bestCost = cost
    }
  }
  if (best === null || bestCost > state.sun) {
    // 造价读档位表、可能抛错（未填档位）；sun 比较放在同一处，避免上层重复判断。
    return null
  }
  return best
}

/** 回答当前这道题（对或错）。非答题阶段抛错 —— 驱动脚本写错步骤要立刻炸。 */
export function answerCurrent(state: State, correct: boolean): State {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${state.phase.kind}，没有正在问的题`)
  }
  const question = state.phase.question
  return reduce(state, answer(correct ? correctOptionId(question) : wrongOptionId(question)))
}
