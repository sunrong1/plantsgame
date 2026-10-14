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
  SLOW_FACTOR,
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
  resolveCombatRound,
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
const BUILDABLE_COLUMNS: readonly number[] = Array.from(
  { length: ZOMBIE_SPAWN_COL - 1 },
  (_, index) => index + 1,
)

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
function answerPolicy(state: State, correct: boolean): Action {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`答题策略在 ${state.phase.kind} 阶段被调用 —— 驱动脚本的阶段机错了`)
  }
  const card = state.phase.question.card
  // ⚠️ 找不到对应选项时**就地抛出**，不许退化成 `{ id: '' }`（`[CR]` 2026-10-14）。
  //   静默兜底会把「合成题单构造坏了」伪装成「孩子答错」，几帧后在 `isCorrect`
  //   里以选项 id 的名义炸出来 —— 排查方向会被带到完全错误的地方。
  const chosen = correct ? card.options.find((o) => o.correct) : card.options.find((o) => !o.correct)
  if (chosen === undefined) {
    throw new Error(
      `题单条目 ${state.phase.question.entryId} 的「${card.kind}」卡没有${correct ? '正确' : '错误'}选项 —— ` +
        '合成题单构造坏了，不要让它退化成空 id 后再在别处炸出来。',
    )
  }
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
        // ⚠️ 这个路径**不会**被读到（合成题单只喂战斗层，不渲染），
        // 但仍按 AC-22 的规范写，免得留下一个「看起来像路径规范、其实是错的」字符串。
        ? { id, imageSrc: `/assets/words/unit-01/${entryId}.svg`, correct: k === 0 }
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

  while (turnsPlayed < maxTurns && state.phase.kind === 'awaiting-answer') {
    const turn = state.turn
    // ⚠️ `correctAt` 只求值一次（`[CR]` 2026-10-14）：原先每回合调三次
    //   （totalWrong 一次、日志一次、dispatch 一次），三处结果被假定相等，
    //   而类型上 `correctAt` 没有任何纯性保证。这个计数是门槛数字的来源。
    const correctThisTurn = correctAt(turn)
    if (!correctThisTurn) {
      totalWrong += 1
    }
    const answerAction = answerPolicy(state, correctThisTurn)

    // 📎 回合日志（架构 `:620-628` 规定格式）。
    // ⚠️ **每个 action 一行**，不是每回合一行（`[CR]` 2026-10-14）。此前只在回合
    //   开头打一行 `action=ANSWER` —— 而 `answerPolicy` 恒返回 AnswerAction，
    //   于是建塔、结算、推进这些真实发生的事**一条都没进日志**，导出的会话
    //   根本重建不出这一局。而且那一行打的是**动作前**的 state，
    //   于是日志里 `sun` 连着 6 回合都是 0，看着像 bug。
    //   现在改成 dispatch 时逐个打，打的是**动作后**的状态 ⇒ 日志自洽可重放。
    let cursor = state
    const step = (action: Action): State => {
      const next = reduce(cursor, action)
      if (verbose) {
        logTurn(turn, actionName(action), next)
      }
      cursor = next
      return next
    }

    let withTowers = step(answerAction)
    if (shouldBuild) {
      for (const action of greedyBuildPolicy(withTowers)) {
        withTowers = step(action)
      }
    }
    // ⚠️ 真实掉心数取自 `resolveCombatRound`，**不能**用差值反推
    //   （`Math.max(0, heartsBefore - resolved.hearts)`）：reducer 把心数夹到 0，
    //   「本回合掉的心多于剩余心」是合法情况，差值会小于真实掉心数，
    //   丢掉的那几颗随后被下面的击杀恒等式**记成击杀**
    //   —— 一只抵达房子的僵尸凭空变成一次击杀（`[CR]` 2026-10-14）。
    const realHeartsLost = resolveCombatRound(withTowers.towers, withTowers.zombies).heartsLost
    step(endBuild())
    const resolved = step(resolveRound())
    turnsPlayed += 1
    rows.push({
      turn,
      correct: correctThisTurn,
      towers: resolved.towers.length,
      zombies: resolved.zombies.length,
      heartsLost: realHeartsLost,
      hearts: resolved.hearts,
      sun: resolved.sun,
    })
    if (resolved.phase.kind === 'round-over') {
      state = step(continueRound())
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
// ⚠️ 表头一律读 `balance.ts` 的常量与 `damageOf()`，不写死 25 / 50 / 「走 1 格」
//   （`[CR]` 2026-10-14）：Story 3.2 一调数值，写死的表头会与下方实时数据互相矛盾，
//   而读者没有任何信号能发现两者不一致。
const SLOW_MOVE_PER_ROUND = ZOMBIE_MOVE_PER_ROUND * SLOW_FACTOR
console.log(
  `[balance] 减速 ${SLOW_TURNS} 回合、期间每回合走 ${SLOW_MOVE_PER_ROUND} 格（未减速 ${ZOMBIE_MOVE_PER_ROUND} 格）；` +
    `伤害 ${damageOf('slow')}（直射塔 ${damageOf('direct')}）`,
)
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
  // ⚠️ 结论由**实测数字**推出，不写死叙事（`[CR]` 2026-10-14）。
  //   原措辞断言「减速换来的是 z1 少走的那几格」，而紧邻的两条 trace 证明的
  //   恰恰相反：慢塔让 z1 多走了几格。同造价、伤害减半、掉心相同 ⇒ 当前数值下
  //   减速塔被完全支配。这是 Epic 3 的输入，**本 story 不改任何数值**
  //   （硬约束：数值平衡参数不得擅动），已登记进 deferred-work.md。
  const slowWalked = slow.firstZombieTrace.length
  const directWalked = direct.firstZombieTrace.length
  const dominated =
    costOf('slow', 1) >= costOf('direct', 1) &&
    damageOf('slow') <= damageOf('direct') &&
    slow.kills <= direct.kills &&
    slow.heartsLost >= direct.heartsLost
  console.log(
    `[balance]   ⇒ 造价直射 ${costOf('direct', 1)} / 减速 ${costOf('slow', 1)}，伤害 ${damageOf('direct')} / ${damageOf('slow')}。` +
      `z1 走过 ${directWalked} 格（直射）/ ${slowWalked} 格（减速）。` +
      (dominated
        ? '⚠️ **当前数值下减速塔被完全支配**：同造价、伤害更低、击杀不更多、掉心不减，' +
            '而轨迹显示它让僵尸多走了几格 —— 减速塔目前是纯劣化，不是取舍。' +
            '已登记 deferred-work，等 Epic 3 定夺（本 story 不擅改数值）。'
        : '减速确实换来了 z1 少走的那几格 —— 两条同时成立才构成取舍。'),
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
    const answered = reduce(state, answerPolicy(state, true))
    const entry = answered.deck[0]
    // 阳光攒够造价、且该格还空时才建 —— 与真实玩家的约束完全一致。
    const canBuild =
      entry !== undefined &&
      answered.sun >= costOf(towerType, 1) &&
      answered.grid[cell] === undefined &&
      answered.unlocked.includes(entry.entryId)
    const withTowers = canBuild ? reduce(answered, placeTower(entry.entryId, cell)) : answered

    const before = withTowers.zombies
    // ⚠️ 真实掉心数取自 `resolveCombatRound`，不能用差值反推 ——
    //   reducer 把心数夹到 0，差值会小于真实掉心数，丢掉的那几颗随后被
    //   下面的击杀恒等式记成击杀（`[CR]` 2026-10-14）。
    const lost = resolveCombatRound(withTowers.towers, withTowers.zombies).heartsLost
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
