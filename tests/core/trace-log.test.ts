/**
 * `[core] turn N …` 回合日志的**行为守卫**（Story 1.17 / AC-C1..C4，G102 / G103 / G104）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * AC 逐字要求的**那一行格式**，以及三条容易写错的判据：
 *   1. **格式逐字比对**（G102）—— 只断言「包含 `turn`」是一条恒绿的装饰守卫（R-51）。
 *      字段之间是**两个空格**（AC 逐字如此），少一个就红。
 *   2. **`<T>` 必须取自 `actionName()`**（G103）—— 另写一张映射表的话，
 *      联合新增成员时那张表会静默漏一个分支，而 `actionName` 是**抛错**的
 *      （`actions.ts` 的注释逐字说这是刻意的）。
 *   3. **逐 action 一条，不是逐回合一条**（G104）—— 一回合有 4~6 次 dispatch，
 *      而**正是 `answer` 那条最能说明「孩子选错了哪张卡」**。
 *
 * ── 为什么判据住在 `core/` 而不是 `app/` ────────────────────────────────────
 * 「该产出的那行文本」是纯判据，与「什么时候打印」无关。
 * ⚠️ 顺带的收益：`Effect` 联合加了成员而 `runEffects` 没跟上时，
 *   漏分支会在这里当场露出来（`assertNeverEffect` 那套机制，G106 另有一处源码级守卫）。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 * · `zombies` 读数组长度不读血量；`sun` / `hearts` 读 `next` 不读 `prev`（AC-C3 的裁决）。
 * · 本文件不做源码变异，变异走 M130 / M131 / M132。
 */

import { describe, expect, it } from 'vitest'

import {
  HEARTS,
  ZOMBIE_ROW,
  actionName,
  answer,
  cellKey,
  continueRound,
  createInitialState,
  endBuild,
  placeTower,
  reduce,
  resolveRound,
  restartLevel,
  runEffects,
  type Action,
  type Effect,
  type State,
} from '../../src/core'
import { correctOptionId, makeSyntheticDeck, wrongOptionId } from '../fixtures/synthetic-deck'

// ── 夹具 ───────────────────────────────────────────────────────────────────

const DECK = makeSyntheticDeck(6, 1)

function freshState(): State {
  return createInitialState({ unitNumber: 1, deck: DECK })
}

function currentQuestion(state: State) {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`当前阶段是 ${state.phase.kind}，没有正在问的题`)
  }
  return state.phase.question
}

/** 一次 dispatch 的完整快照 —— 与 `effects.test.ts` 的同名夹具同型。 */
function dispatch(prev: State, action: Action): { prev: State; next: State; effects: readonly Effect[] } {
  const next = reduce(prev, action)
  return { prev, next, effects: runEffects(action, prev, next) }
}

/** 只取 TRACE 行（过滤掉 SFX / SAVE —— 本文件只关心日志那一条）。 */
function traceLines(effects: readonly Effect[]): readonly string[] {
  return effects.filter((e): e is Extract<Effect, { kind: 'TRACE' }> => e.kind === 'TRACE').map((e) => e.line)
}

// ── G102 ───────────────────────────────────────────────────────────────────

describe('回合日志格式（Story 1.17 / AC-C1、G102）', () => {
  it('G102：`ANSWER` 那一行的字段与分隔符逐字相符', () => {
    const prev = freshState()
    const question = currentQuestion(prev)
    const action = answer(correctOptionId(question))
    const { next, effects } = dispatch(prev, action)

    // ⚠️ **两个空格**（AC 逐字）。这里写死整行而不是分段拼 ——
    //   分段拼的话「少一个空格」这种变异会绿，而那正是家长复制日志去搜索时的痛点。
    expect(traceLines(effects)).toEqual([
      `[core] turn ${next.turn}  action=ANSWER  sun=${next.sun}  hearts=${next.hearts}  zombies=${next.zombies.length}`,
    ])
  })

  it('G102：`PLACE_TOWER` / `END_BUILD` / `RESOLVE_ROUND` / `CONTINUE` 四种也逐字相符', () => {
    let cursor = freshState()
    const seen: string[] = []

    const step = (action: Action) => {
      const { next, effects } = dispatch(cursor, action)
      seen.push(...traceLines(effects))
      cursor = next
    }

    step(answer(correctOptionId(currentQuestion(cursor))))
    const entryId = cursor.unlocked[0]
    if (entryId === undefined) throw new Error('开局没有已解锁的卡')
    step(placeTower(entryId, cellKey(ZOMBIE_ROW, 1)))
    step(endBuild())
    step(resolveRound())
    if (cursor.phase.kind === 'round-over') step(continueRound())

    expect(seen).toHaveLength(5)
    // 每行都必须是 `[core] turn <n>` 开头，字段齐全且顺序固定。
    for (const line of seen) {
      expect(line).toMatch(/^\[core\] turn \d+ {2}action=[A-Z_]+ {2}sun=\d+ {2}hearts=\d+ {2}zombies=\d+$/)
    }
  })

  it('G102：日志读的是 `next`（dispatch 之后的状态），不是 `prev`', () => {
    // 这就是 M130 的正面判据：把 `hearts` 换成 `prev.hearts` 会红。
    //
    // ⚠️ **必须先跑到真的掉心那一回合** —— 不建塔时僵尸要走近 8 回合才摸到房子，
    //   在头几个回合里 `next.hearts === prev.hearts`，那条「读 next 不读 prev」的断言
    //   就恒绿了（一种装饰守卫，R-51）。这里一路空跑到心数下降为止。
    let cursor = freshState()
    let line: string | undefined
    let before = 0
    let after = 0

    for (let i = 0; i < 30 && line === undefined; i += 1) {
      if (cursor.phase.kind !== 'awaiting-answer') break
      cursor = reduce(cursor, answer(correctOptionId(currentQuestion(cursor))))
      cursor = reduce(cursor, endBuild())
      const resolved = reduce(cursor, resolveRound())
      const effects = runEffects(resolveRound(), cursor, resolved)
      if (resolved.hearts < cursor.hearts) {
        before = cursor.hearts
        after = resolved.hearts
        line = traceLines(effects)[0]
      }
      cursor = resolved.phase.kind === 'round-over' ? reduce(resolved, continueRound()) : resolved
    }

    expect(line).toBeDefined()
    expect(after).toBeLessThan(before)
    // 正面：报的是掉**之后**的数。
    expect(line).toContain(`hearts=${after} `)
    // 反面：不是掉之前的数（这两条同时成立才说明它读的是 `next`）。
    expect(line).not.toContain(`hearts=${before} `)
  })

  it('G102：`hearts` 上界就是 `HEARTS`（心数恒落在 `[0, HEARTS]`）', () => {
    // 顺带钉住 AC-D3 面板文案的前提：日志里的心数不会越界。
    const prev = freshState()
    const { next, effects } = dispatch(prev, answer(correctOptionId(currentQuestion(prev))))

    expect(next.hearts).toBeGreaterThanOrEqual(0)
    expect(next.hearts).toBeLessThanOrEqual(HEARTS)
    expect(traceLines(effects)[0]).toContain(`hearts=${next.hearts} `)
  })
})

// ── G103 ───────────────────────────────────────────────────────────────────

describe('`<T>` 取自 `actionName`（Story 1.17 / AC-C2、G103）', () => {
  it('G103：日志里的 `action=` 逐字等于 `actionName(action)`', () => {
    const prev = freshState()
    const question = currentQuestion(prev)

    // 六个 Action 构造器逐个过一遍 —— 少覆盖一个就等于给「自己另写映射表」开口子。
    const wrong = answer(wrongOptionId(question))
    const place = placeTower('u1-word-01', cellKey(ZOMBIE_ROW, 1))
    const cases: readonly Action[] = [wrong, place, endBuild(), resolveRound(), continueRound(), restartLevel()]

    for (const action of cases) {
      const effects = runEffects(action, freshState(), freshState())
      const line = traceLines(effects)[0]
      expect(line).toBeDefined()
      expect(line).toContain(`action=${actionName(action)} `)
    }
  })

  it('G103：`actionName` 对六个成员各给出自己的名字（无映射表可抄的余地）', () => {
    const question = currentQuestion(freshState())
    const names = [
      answer(correctOptionId(question)),
      placeTower('u1-word-01', cellKey(ZOMBIE_ROW, 1)),
      endBuild(),
      resolveRound(),
      continueRound(),
      restartLevel(),
    ].map(actionName)

    expect(names).toEqual([
      'ANSWER',
      'PLACE_TOWER',
      'END_BUILD',
      'RESOLVE_ROUND',
      'CONTINUE',
      'RESTART_LEVEL',
    ])
  })
})

// ── G104 ───────────────────────────────────────────────────────────────────

describe('逐 action 一条（Story 1.17 / AC-C3、G104）', () => {
  it('G104：一整回合内每个 action 各一条 TRACE，条数 = dispatch 次数', () => {
    let cursor = freshState()
    const actions: Action[] = []
    const lines: string[] = []

    const step = (action: Action) => {
      const { next, effects } = dispatch(cursor, action)
      actions.push(action)
      lines.push(...traceLines(effects))
      cursor = next
    }

    // 一个真实回合：答题 → 建塔 → 结算 → 推进。
    step(answer(correctOptionId(currentQuestion(cursor))))
    step(placeTower(cursor.unlocked[0] ?? 'u1-word-01', cellKey(ZOMBIE_ROW, 1)))
    step(endBuild())
    step(resolveRound())
    if (cursor.phase.kind === 'round-over') step(continueRound())

    // 🔥 「每回合一条」若实现成「每回合只在收尾那一次产」，
    //   上面 4~5 次 dispatch 就只会留下 1 行 ⇒ 这条断言会红（M132 专打）。
    expect(lines).toHaveLength(actions.length)
    expect(lines.map((l) => l.match(/action=([A-Z_]+)/)?.[1])).toEqual(actions.map(actionName))
  })

  it('G104：同一回合内的多条 TRACE 共享同一个回合号', () => {
    let cursor = freshState()
    const lines: string[] = []

    const step = (action: Action) => {
      const { next, effects } = dispatch(cursor, action)
      lines.push(...traceLines(effects))
      cursor = next
    }

    step(answer(correctOptionId(currentQuestion(cursor))))
    step(endBuild())
    step(resolveRound())

    const turns = new Set(lines.map((l) => l.match(/\[core\] turn (\d+)/)?.[1]))
    // `ANSWER` 与 `RESOLVE_ROUND` 之间 `turn` 不变 ⇒ 同一回合号。
    expect(turns.size).toBe(1)
    expect(lines.length).toBe(3)
  })

  it('G104：`CONTINUE` 把回合号推进一行', () => {
    let cursor = freshState()
    cursor = reduce(cursor, answer(correctOptionId(currentQuestion(cursor))))
    cursor = reduce(cursor, endBuild())
    const before = runEffects(resolveRound(), cursor, reduce(cursor, resolveRound()))
    const afterRound = reduce(cursor, resolveRound())
    const afterContinue = reduce(afterRound, continueRound())
    const continued = runEffects(continueRound(), afterRound, afterContinue)

    const beforeTurn = Number(traceLines(before)[0]?.match(/turn (\d+)/)?.[1])
    const afterTurn = Number(traceLines(continued)[0]?.match(/turn (\d+)/)?.[1])

    expect(afterTurn).toBe(beforeTurn + 1)
  })
})
