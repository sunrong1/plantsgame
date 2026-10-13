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

import { ZOMBIE_ROW, answer, cellKey, continueRound, costOf, createInitialState, endBuild, placeTower, reduce, resolveRound } from '../../src/core'
import type { Action, DeckEntry, State } from '../../src/core'
import { correctOptionId, wrongOptionId } from './synthetic-deck.js'

/** 可建列（0-based）。排除房子格 0 与僵尸入场格 8 —— 见文件头。 */
export const BUILDABLE_COLUMNS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

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
    const answered = answerCurrent(state, options.correctAt(turn))
    if (!options.correctAt(turn)) {
      totalWrong += 1
    }
    let withTowers = answered
    if (shouldBuild) {
      for (const action of greedyBuildActions(answered)) {
        withTowers = reduce(withTowers, action)
      }
    }
    const heartsBefore = withTowers.hearts
    const resolved = reduce(reduce(withTowers, endBuild()), resolveRound())
    turnsPlayed += 1
    log.push({
      turn,
      towers: resolved.towers.length,
      zombies: resolved.zombies.length,
      heartsLost: Math.max(0, heartsBefore - resolved.hearts),
      hearts: resolved.hearts,
      sun: resolved.sun,
    })
    state = resolved.phase.kind === 'round-over' ? reduce(resolved, continueRound()) : resolved
  }

  return { state, log, totalWrong, turnsPlayed }
}

/** 状态是否仍在进行中（既未通关也未失败）。 */
export function isRunning(state: State): boolean {
  return state.phase.kind === 'awaiting-answer' || state.phase.kind === 'round-over'
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
