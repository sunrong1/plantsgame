/**
 * 平衡模拟 —— **跑的是游戏真实实现，不是模型复刻**（Story 1.5 / AC-15，架构 `:640-649`）。
 *
 * ── 为什么这个脚本存在 ────────────────────────────────────────────────────
 * GDD 目录里的 `balance-scan.py` 是 Python，与 TypeScript 的 `src/core/` **各存一份数值**，
 * 迟早一改一漏 —— 这正是 `decision-log.md` 记录的「三次手算错误」的同一个根因，
 * 只是换了个位置。而那份 Python 已经因为 `dict[col]` 覆盖 bug **每回合静默吞掉一只僵尸**，
 * 导致它输出的「开局连错 7 题 = 失败」是错的（正确为 4）。
 *
 * 本脚本直接 `import` 真实 reducer，于是：
 *   · 数值只有一份（在 `src/core/balance.ts`）；
 *   · 门槛曲线由真实实现跑出，不存在「模型与实现漂移」；
 *   · 单元 2 / 3 调数值后，重跑本脚本即可，无需改脚本。
 *
 * ⚠️ **不得 import `src/` 以外的任何东西**（尤其 `tests/`）：本脚本自建一份
 * 合成题单与策略实现。两处策略与测试侧刻意**独立** —— 若共享一份，
 * 测试与模拟就会同时错，而两边都绿。两份跑出的门槛数字必须一致，
 * 那正是「模拟跑的是真实实现」的证据。
 *
 * ⚠️ **不得在脚本内内联一份回合逻辑** —— 那是本脚本要消灭的东西。
 * 下面每一个数字都来自 `reduce()` 的返回值。
 *
 * 用 tsx 而非 Node 原生 type stripping：原生方案不支持 enum，
 * 会给整个 src/core/ 施加一条与架构无关的书写约束。
 */

import {
  COLS,
  HEARTS,
  HOUSE_COL,
  SLOW_TURNS,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  actionName,
  answer,
  cellKey,
  continueRound,
  costOf,
  damageOf,
  createInitialState,
  endBuild,
  placeTower,
  reduce,
  resolveRound,
} from '../src/core/index.js'
import type { Action, DeckEntry, State } from '../src/core/index.js'

// ════════════════════════════════════════════════════════════════════════
// 策略层（表头必须打印 —— 门槛数字只在策略固定时才有意义）
// ════════════════════════════════════════════════════════════════════════

/**
 * 可建列（0-based）。
 *
 * ⚠️ 与 `balance-scan.py` 的 `range(1, cols - 1)` **完全一致**：排除 `HOUSE_COL = 0`
 * 的房子格与 `ZOMBIE_SPAWN_COL = 8` 的僵尸入场格。
 * `[CS]` 2026-10-13 实测：放宽到 `[0..8]` 会把门槛从 4 变成 5 ——
 * col 0 / col 1 两座塔会打在同一目标上，白白浪费前两次购买。
 * 策略改变会改变门槛数字，所以它必须被打印在表头上，而不是藏在代码里。
 */
const BUILDABLE_COLUMNS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

/** 建塔策略：阳光够就买造价最低的已解锁卡，建在 ZOMBIE_ROW 的最低空列。 */
function greedyBuildPolicy(state: State): readonly Action[] {
  if (state.phase.kind !== 'awaiting-build') {
    return []
  }
  const actions: Action[] = []
  let cursor: State = state
  while (true) {
    const entry = cheapestUnlockedCard(cursor)
    const free = BUILDABLE_COLUMNS.find((col) => cursor.grid[cellKey(ZOMBIE_ROW, col)] === undefined)
    if (entry === null || free === undefined) {
      return actions
    }
    const action = placeTower(entry.entryId, cellKey(ZOMBIE_ROW, free))
    actions.push(action)
    cursor = reduce(cursor, action)
  }
}

/**
 * 答题策略：第 n 回合（1 起）是否答对。
 *
 * ⚠️ 按**回合号**而不是「第几题」取答案：答错会重复考同一题，
 * 用题序会让「连错 4 题」与「连错 4 回合」在长局里悄悄分叉。
 */
function answerPolicy(state: State, correctAt: (turn: number) => boolean): Action {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`答题策略在 ${state.phase.kind} 阶段被调用 —— 驱动脚本的阶段机错了`)
  }
  const card = state.phase.question.card
  const chosen = correctAt(state.turn)
    ? (card.options.find((o) => o.correct) ?? { id: '' })
    : (card.options.find((o) => !o.correct) ?? { id: '' })
  return answer(chosen.id)
}

/** 已解锁卡里造价最低的一张（并列取先出现者 —— 确定性优先）。 */
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
  return best !== null && bestCost <= state.sun ? best : null
}

// ════════════════════════════════════════════════════════════════════════
// 合成题单（本地自建，不 import tests/）
// ════════════════════════════════════════════════════════════════════════

const TOWER_TYPE_CYCLE = ['direct', 'slow', 'aoe'] as const
const CARD_KIND_CYCLE = ['word', 'keyword', 'response'] as const

/**
 * 产出 n 道结构合法的题目：每张卡恰有 1 个正确项（FR16）。
 *
 * @param forceTowerType 指定塔型（专项实验用）。省略时按 `direct → slow → aoe` 轮转，
 *        让三种造价都被真实走到 —— 只用一种塔型的题单会让造价分支永远走一半。
 */
function buildSyntheticDeck(n: number, unitNumber = 1, forceTowerType?: (typeof TOWER_TYPE_CYCLE)[number]): readonly DeckEntry[] {
  const entries: DeckEntry[] = []
  for (let i = 0; i < n; i += 1) {
    const ordinal = String(i + 1).padStart(2, '0')
    const entryId = `u${unitNumber}-word-${ordinal}`
    const kind = CARD_KIND_CYCLE[i % CARD_KIND_CYCLE.length]
    const options = [0, 1, 2, 3].map((k) => {
      const id = `${entryId}-o${k + 1}`
      return kind === 'word'
        ? { id, imageSrc: `/assets/word/${entryId}.svg`, correct: k === 0 }
        : { id, text: `选项 ${k + 1}`, correct: k === 0 }
    })
    entries.push({
      entryId,
      wordId: `u${unitNumber}-w${ordinal}`,
      towerType: forceTowerType ?? TOWER_TYPE_CYCLE[i % TOWER_TYPE_CYCLE.length],
      card: { kind, promptText: entryId, options },
    })
  }
  return entries
}

// ════════════════════════════════════════════════════════════════════════
// 驱动
// ════════════════════════════════════════════════════════════════════════

/** 一个回合的轨迹行。 */
interface TurnRow {
  readonly turn: number
  readonly correct: boolean
  readonly towers: number
  readonly zombies: number
  readonly heartsLost: number
  readonly hearts: number
  readonly sun: number
}

interface LevelRun {
  readonly state: State
  readonly rows: readonly TurnRow[]
  readonly turnsPlayed: number
  readonly totalWrong: number
}

/**
 * 跑一局，逐回合记录轨迹。
 *
 * ⚠️ `maxTurns` 默认给足（题单长度 + 30）：**重考回合必须模拟到第 10 回合之外**
 * （AR19，`balance-scan.py` 的已知缺口）—— 一局 10 题但答错会拉长局数，
 * 第 11 回合之后仍有僵尸入场，而那正是「重考回合的掉心行为」的观测窗口。
 */
function runLevel(deck: readonly DeckEntry[], correctAt: (turn: number) => boolean, options?: { build?: boolean; maxTurns?: number; verbose?: boolean }): LevelRun {
  const shouldBuild = options?.build ?? true
  const maxTurns = options?.maxTurns ?? deck.length + 30
  const verbose = options?.verbose ?? false

  let state = createInitialState({ unitNumber: 1, deck })
  const rows: TurnRow[] = []
  let totalWrong = 0
  let turnsPlayed = 0

  while (turnsPlayed < maxTurns && (state.phase.kind === 'awaiting-answer' || state.phase.kind === 'round-over')) {
    const turn = state.turn
    const correctThisTurn = correctAt(turn)
    if (!correctThisTurn) {
      totalWrong += 1
    }
    // 📎 回合日志（架构 `:620-628` 规定格式）：每回合一条，供导出会话。
    if (verbose) {
      logTurn(turn, actionName(answerPolicy(state, correctAt)), state)
    }

    let withTowers = reduce(state, answerPolicy(state, correctAt))
    if (shouldBuild) {
      for (const action of greedyBuildPolicy(withTowers)) {
        withTowers = reduce(withTowers, action)
      }
    }
    const heartsBefore = withTowers.hearts
    const resolved = reduce(reduce(withTowers, endBuild()), resolveRound())
    turnsPlayed += 1
    rows.push({
      turn,
      correct: correctThisTurn,
      towers: resolved.towers.length,
      zombies: resolved.zombies.length,
      heartsLost: Math.max(0, heartsBefore - resolved.hearts),
      hearts: resolved.hearts,
      sun: resolved.sun,
    })
    if (resolved.phase.kind === 'round-over') {
      state = reduce(resolved, continueRound())
    } else {
      state = resolved
    }
  }

  return { state, rows, turnsPlayed, totalWrong }
}

/** `[core] turn N action=<T> sun=<n> hearts=<n> zombies=<n>` —— 架构 `:620-628` 逐字格式。 */
function logTurn(turn: number, action: string, state: State): void {
  console.log(`[core] turn ${turn} action=${action} sun=${state.sun} hearts=${state.hearts} zombies=${state.zombies.length}`)
}

// ════════════════════════════════════════════════════════════════════════
// 输出
// ════════════════════════════════════════════════════════════════════════

const DECK = buildSyntheticDeck(10)

console.log('[balance] === 平衡模拟（Story 1.5 / AC-15，跑真实 src/core/ reducer）===')
console.log(`[balance] 建塔策略：ZOMBIE_ROW 最低空列，可建列 ${BUILDABLE_COLUMNS[0]}..${BUILDABLE_COLUMNS[BUILDABLE_COLUMNS.length - 1]}（与 balance-scan.py range(1, cols-1) 一致）`)
console.log(`[balance] 塔型选择：已解锁卡中造价最低者（direct/slow ${costOf('direct', 1)}，aoe ${costOf('aoe', 1)}）`)
console.log(`[balance] 答题策略：按回合号取答案（答错重复考同一题，故按回合而非题序）`)
console.log(
  `[balance] 规格：僵尸 ${ZOMBIE_HP} 血 / 每回合 ${ZOMBIE_MOVE_PER_ROUND} 格 / 入场列 ${ZOMBIE_SPAWN_COL} / 房子列 ${HOUSE_COL} / 起始 ${HEARTS} 心 / 减速 ${SLOW_TURNS} 回合 / 网格 ${COLS} 列`,
)

// ── 失败门槛曲线 ─────────────────────────────────────────────────────────

console.log('\n[balance] === 失败门槛 ===')
console.log('[balance] 场景                              掉心  结束回合  结果（未结束 = 跑满 16 回合上限）')
const thresholdRows: readonly { label: string; correctAt: (turn: number) => boolean; maxTurns: number }[] = [
  { label: '开局连错 1 题（其余全对）', correctAt: (t) => t > 1, maxTurns: 16 },
  { label: '开局连错 2 题（其余全对）', correctAt: (t) => t > 2, maxTurns: 16 },
  { label: '开局连错 3 题（其余全对）', correctAt: (t) => t > 3, maxTurns: 16 },
  { label: '开局连错 4 题（其余全对）', correctAt: (t) => t > 4, maxTurns: 16 },
  { label: '开局连错 5 题（其余全对）', correctAt: (t) => t > 5, maxTurns: 16 },
  { label: '分散错（每 3 题错 1）', correctAt: (t) => t % 3 !== 0, maxTurns: 16 },
  { label: '分散错（每 2 题错 1）', correctAt: (t) => t % 2 !== 0, maxTurns: 16 },
  { label: '后半程连错 7 题（1-3 全对）', correctAt: (t) => t <= 3, maxTurns: 10 },
  { label: '全程全对', correctAt: () => true, maxTurns: 16 },
]
for (const { label, correctAt, maxTurns } of thresholdRows) {
  const run = runLevel(DECK, correctAt, { maxTurns })
  const lost = run.rows.reduce((sum, row) => sum + row.heartsLost, 0)
  const result = run.state.phase.kind === 'level-failed' ? '失败' : run.state.phase.kind === 'level-complete' ? '通关' : '未结束'
  console.log(`[balance] ${label.padEnd(30)}  ${String(lost).padStart(2)}   ${String(run.turnsPlayed).padStart(4)}   ${result}`)
}

// 门槛两侧的逐回合轨迹：门槛是「第几回合输」而不只是「输不输」，
// 只看总掉心数会让「整条曲线后移一回合」（hasReachedHouse/hasPassedHouse 那一等号之差）完全看不见。
for (const label of ['开局连错 3 题（其余全对）', '开局连错 4 题（其余全对）']) {
  const row = thresholdRows.find((r) => r.label === label)
  if (row === undefined) continue
  const run = runLevel(DECK, row.correctAt, { maxTurns: row.maxTurns })
  console.log(`[balance]   ${label}：回合→(塔,心掉,剩心)`)
  console.log(
    `[balance]     ${run.rows
      .map((r) => `${r.turn}→(${r.towers},-${r.heartsLost},${r.hearts})`)
      .join(' ')}`,
  )
}

// ── 单塔命中校验 ─────────────────────────────────────────────────────────

console.log('\n[balance] === 单塔命中校验（直射塔，造价 50，只建这一种）===')
console.log('[balance] 塔在第 N 列 → 满速推进的僵尸经过它时能被命中几次（12 回合窗口）')
for (const towerCol of [1, 3, 5, 7]) {
  const r = simulateTower('direct', towerCol)
  console.log(
    `[balance]   col ${towerCol}（界面「第 ${towerCol + 1} 列」）→ 塔 ${r.towersBuilt} 座，命中 ${r.hits} 次，` +
      `击杀 ${r.kills} 只，首只僵尸${r.firstArrivalTurn === null ? '未抵达' : `第 ${r.firstArrivalTurn} 回合抵达`}`,
  )
}

// ── 减速塔表现 ───────────────────────────────────────────────────────────

console.log('\n[balance] === 减速塔表现 ===')
console.log(`[balance] 减速 ${SLOW_TURNS} 回合、期间每回合走 1 格（未减速 ${ZOMBIE_MOVE_PER_ROUND} 格）；伤害 25（直射塔 50）`)
{
  const direct = simulateTower('direct', 3)
  const slow = simulateTower('slow', 3)
  console.log(`[balance]   ${summarize('直射塔 col 3', direct)}`)
  console.log(`[balance]   ${summarize('减速塔 col 3', slow)}`)
  // ⚠️ 单只僵尸的轨迹才是减速的**直接证据**：总体掉心/击杀会被后续入场的一波波
  //   僵尸淹没，而轨迹逐格显示「同样几格射程内多走了几回合」。
  console.log(`[balance]   首只僵尸 z1 逐回合列号（存活才记录）`)
  console.log(`[balance]     直射塔：${direct.firstZombieTrace.join(' → ') || '第 1 回合即死'}`)
  console.log(`[balance]     减速塔：${slow.firstZombieTrace.join(' → ') || '第 1 回合即死'}`)
  console.log(
    `[balance]   ⇒ 造价直射 ${costOf('direct', 1)} / 减速 ${costOf('slow', 1)}（相同），伤害 ${damageOf('direct')} / ${damageOf('slow')}（减半）。` +
      '减速换来的是 z1 少走的那几格 —— 两条同时成立才构成取舍；若减速塔既慢又打不疼还一样贵，它就是纯劣化。',
  )
}

// ── 范围塔表现 ───────────────────────────────────────────────────────────

console.log('\n[balance] === 范围塔表现 ===')
console.log('[balance] 范围塔覆盖恒为同行 3 格（架构决策 1），不是半径 2 的圆；每回合对覆盖内每只各结算 60（`aoeTargets`）')
{
  const direct = simulateTower('direct', 5)
  const aoe = simulateTower('aoe', 5)
  console.log(`[balance]   ${summarize('直射塔 col 5', direct)}`)
  console.log(`[balance]   ${summarize('范围塔 col 5', aoe)}`)
  console.log(
    `[balance]   ⇒ 造价 ${costOf('direct', 1)} vs ${costOf('aoe', 1)}。造价更高的那座塔必须换来更多命中/更少掉心，` +
      '否则「范围塔贵」在数值上不成立 —— 这一条是 AR26 的前提。',
  )
}

// ── 重考回合的掉心行为 ───────────────────────────────────────────────────

console.log('\n[balance] === 重考回合的掉心行为 ===')
console.log('[balance] 场景：第 1-3 回合答对建塔，之后全程答错（重考同一题），跑到第 10 回合之外')
{
  const run = runLevel(DECK, (turn) => turn <= 3, { maxTurns: 24 })
  const beyondTen = run.rows.filter((row) => row.turn > 10)
  const lostBeyondTen = beyondTen.reduce((sum, row) => sum + row.heartsLost, 0)
  console.log(`[balance]   跑满 ${run.turnsPlayed} 回合，共答错 ${run.totalWrong} 回合`)
  console.log(`[balance]   第 1-10 回合掉心 ${run.rows.filter((r) => r.turn <= 10).reduce((s, r) => s + r.heartsLost, 0)} 颗`)
  console.log(`[balance]   第 11 回合之后掉心 ${lostBeyondTen} 颗（共 ${beyondTen.length} 个回合）`)
  console.log(`[balance]   最终结果：${run.state.phase.kind}`)
  console.log(
    `[balance]   ⇒ 重考本身**不**直接掉心：掉心只来自「场上僵尸抵达房子」。` +
      '但重考会让一局无限拉长，而每一回合都入场一只僵尸 —— 所以「答错要多试几次」的代价体现在局面压力上，不是直接罚心。',
  )
  console.log('[balance]   ⚠️ 对照：不建塔的同一答题模式（第 1-3 回合也不建）才会掉心：')
  const noBuild = runLevel(DECK, (turn) => turn <= 3, { build: false, maxTurns: 24 })
  console.log(`[balance]     不建塔 → 共掉心 ${noBuild.rows.reduce((s, r) => s + r.heartsLost, 0)} 颗，结果 ${noBuild.state.phase.kind}`)
}

// ── 回合日志 ─────────────────────────────────────────────────────────────

console.log('\n[balance] === 回合日志 ===')
console.log('[balance] 格式：[core] turn N action=<T> sun=<n> hearts=<n> zombies=<n>（架构 :620-628）')
console.log('[balance] 以下是「开局连错 4 题」那一局的逐回合日志：')
runLevel(DECK, (turn) => turn > 4, { maxTurns: 8, verbose: true })
console.log(`[balance] === 模拟结束 ===`)


// ════════════════════════════════════════════════════════════════════════
// 专项小实验（全部经由真实 reducer —— 下面没有任何一份回合逻辑副本）
// ════════════════════════════════════════════════════════════════════════

/** 一次「只建指定塔型」模拟的观测结果。 */
interface TowerRunResult {
  /** 建成的塔数（造价差异会让三种塔型的塔数不同 —— 那正是要比较的东西）。 */
  readonly towersBuilt: number
  /** 命中次数：血量下降的次数。**不含致死那一击**（僵尸离场后无从比较血量）。 */
  readonly hits: number
  /** 击杀数：离场僵尸减去抵达房子的（离场 − 掉心 = 死亡，恒等式而非模型）。 */
  readonly kills: number
  /** 第一只僵尸抵达房子的回合；null = 没等到。 */
  readonly firstArrivalTurn: number | null
  readonly heartsLost: number
  readonly zombiesAlive: number
  readonly result: string
  /** 第一只僵尸（z1）逐回合结算后的列号 —— 减速塔的效果在这一行上直接可见。 */
  readonly firstZombieTrace: readonly number[]
}

/**
 * 跑一局「只建 `towerType` 这一种塔、建在 `towerCol`」的模拟。
 *
 * ⚠️ 塔型**不是**事后改字段伪造的：题单在构造时就被指定成该塔型，
 * 塔由 `placeTower()` 真实建出来。伪造塔型的做法会在输出里给出
 * 「范围塔表现」的漂亮数字，而游戏里的范围塔其实从没被建过。
 */
function simulateTower(towerType: 'direct' | 'slow' | 'aoe', towerCol: number, maxTurns = 12): TowerRunResult {
  const deck = buildSyntheticDeck(20, 1, towerType)
  const cell = cellKey(ZOMBIE_ROW, towerCol)
  let state = createInitialState({ unitNumber: 1, deck })
  let hits = 0
  let kills = 0
  let heartsLost = 0
  let firstArrivalTurn: number | null = null
  const firstZombieTrace: number[] = []
  let turns = 0

  while (turns < maxTurns && state.phase.kind === 'awaiting-answer') {
    const answered = reduce(state, answerPolicy(state, () => true))
    const entry = answered.deck[0]
    // 阳光攒够造价、且该格还空时才建 —— 与真实玩家的约束完全一致。
    const canBuild =
      entry !== undefined &&
      answered.sun >= costOf(towerType, 1) &&
      answered.grid[cell] === undefined &&
      answered.unlocked.includes(entry.entryId)
    const withTowers = canBuild ? reduce(answered, placeTower(entry.entryId, cell)) : answered

    const before = withTowers.zombies
    const heartsBefore = withTowers.hearts
    const resolved = reduce(reduce(withTowers, endBuild()), resolveRound())
    turns += 1

    for (const zombie of before) {
      const after = resolved.zombies.find((z) => z.id === zombie.id)
      if (after !== undefined && after.hp < zombie.hp) {
        hits += 1
      }
    }
    const firstZombie = resolved.zombies.find((z) => z.id === 'z1')
    if (firstZombie !== undefined) {
      firstZombieTrace.push(firstZombie.col)
    }
    const lost = Math.max(0, heartsBefore - resolved.hearts)
    heartsLost += lost
    // 离场的僵尸 = 被打死的 + 抵达房子的。两个数字都是实测，恒等式不是模型。
    kills += before.length - resolved.zombies.length - lost
    if (lost > 0 && firstArrivalTurn === null) {
      firstArrivalTurn = turns
    }

    if (resolved.phase.kind !== 'round-over') {
      state = resolved
      break
    }
    state = reduce(resolved, continueRound())
  }

  return {
    towersBuilt: state.towers.length,
    hits,
    kills,
    firstArrivalTurn,
    heartsLost,
    zombiesAlive: state.zombies.length,
    result: state.phase.kind === 'level-failed' ? '失败' : state.phase.kind === 'level-complete' ? '通关' : '未结束',
    firstZombieTrace,
  }
}

/** 一行摘要。 */
function summarize(label: string, r: TowerRunResult): string {
  const arrival = r.firstArrivalTurn === null ? '未抵达' : `第 ${r.firstArrivalTurn} 回合抵达`
  return `${label.padEnd(12)} 塔 ${String(r.towersBuilt).padStart(2)} 座，命中 ${String(r.hits).padStart(2)} 次，击杀 ${String(r.kills).padStart(2)} 只，掉心 ${r.heartsLost} 颗（首只${arrival}），场上剩 ${r.zombiesAlive} 只，${r.result}`
}
