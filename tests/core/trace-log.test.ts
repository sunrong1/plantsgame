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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
import { stripComments } from '../fixtures/strip-comments'

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

/**
 * 一路空跑到**心数真的下降**的那一次 dispatch，返回它的三份数据。
 *
 * ⚠️📎 **为什么必须是「真的下降」而不是任意一次 dispatch**（`[CR]` 2026-10-17 补）：
 *   `ANSWER` 不掉心 ⇒ 那一类 dispatch 上 `next.hearts === prev.hearts`，
 *   于是「日志读的是 `next`」与「日志读的是 `prev`」**构造上不可区分**（等价变异）。
 *   本仓已因此吃过一次假绿：一条 `toBeLessThanOrEqual(HEARTS)` 守的正是「心数不越界」，
 *   而它跑的那次 dispatch 心数恰好**等于**上界 ⇒ 断言允许的边界值就是当前值。
 *   不建塔时僵尸要走近 8 回合才摸到房子，所以这个循环真的要走十几步。
 *
 * @throws 30 步内一次都没掉心 —— 那说明夹具变了，本文件的判据全部失去鉴别力
 */
function findHeartDroppingTrace(): { before: number; after: number; line: string } {
  let cursor = freshState()
  for (let i = 0; i < 30; i += 1) {
    if (cursor.phase.kind !== 'awaiting-answer') break
    cursor = reduce(cursor, answer(correctOptionId(currentQuestion(cursor))))
    cursor = reduce(cursor, endBuild())
    const before = cursor.hearts
    const resolved = reduce(cursor, resolveRound())
    const effects = runEffects(resolveRound(), cursor, resolved)
    if (resolved.hearts < before) {
      const line = traceLines(effects)[0]
      if (line === undefined) throw new Error('掉心那一次 dispatch 没产出 TRACE 行')
      return { before, after: resolved.hearts, line }
    }
    cursor = resolved.phase.kind === 'round-over' ? reduce(resolved, continueRound()) : resolved
  }
  throw new Error('30 步内一次都没掉心 —— 夹具变了，本文件的判据全部失去鉴别力')
}

/** 从一行日志里把 `hearts=` 那个字段的值**取出来**（而不是 `toContain` 整段拼接）。 */
function heartsFieldOf(line: string): number {
  const hit = /\bhearts=(\d+)/.exec(line)
  if (hit === null) throw new Error(`这行里没有 hearts= 字段：${line}`)
  return Number(hit[1])
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

  it('G102：日志读的是 `next` —— 报的是掉心**之后**的数（正面）', () => {
    // M130 的正面判据：把 `hearts` 换成 `prev.hearts` 会红。
    const { before, after, line } = findHeartDroppingTrace()

    expect(after, '前置：这一次 dispatch 必须真的掉了心').toBeLessThan(before)
    // ⚠️ **取字段而不是 `toContain` 整段拼接**：拼接写法的反面断言
    //   （`not.toContain(\`hearts=${before} \`)`）在前 `before !== after` 时**恒真**，
    //   什么实现都能过。取出来比数才有鉴别力（R-51）。
    expect(heartsFieldOf(line), '日志报的是掉心之前的数 —— 它读的是 `prev`').toBe(after)
  })

  // ⚠️📎 **这一条与上一条是两条独立的判据**（`[CR]` 2026-10-17 拆开）：
  //   原版把正反两面挤在一条用例里、且共用循环里的一对 `before` / `after`
  //   ⇒ 只要循环没填上那一对（比如夹具变了、走不到掉心那一步），
  //   **两条会一起绿**，谁也证伪不了谁。拆开之后每条各自重新走一遍。
  it('G102：日志里那个数**不等于**掉心之前的数（反面）', () => {
    const { before, after, line } = findHeartDroppingTrace()

    expect(after, '前置：前后必须不同，否则「不等于之前」是废话').toBeLessThan(before)
    expect(
      heartsFieldOf(line),
      '日志报的还是掉心之前的数 —— 把 `next` 写成 `prev` 的变异没被抓住',
    ).not.toBe(before)
  })

  it('G102：`hearts` 上界就是 `HEARTS`（心数恒落在 `[0, HEARTS]`）', () => {
    // ⚠️📎 **两个 dispatch 都要量**（`[CR]` 2026-10-17 修）：
    //   原版只量 `ANSWER`，而 `ANSWER` **不掉心** ⇒ `next.hearts` 恰好**等于**
    //   `HEARTS` ⇒ `toBeLessThanOrEqual(HEARTS)` 允许的边界值就是当前值，
    //   任何「把心数夹成 HEARTS + 1」或「不夹」的实现都抓不住
    //   （本仓已因此出过一次假红）。
    //   ⇒ 补一次**真的掉心**的 dispatch：那里 `next.hearts < HEARTS`，
    //   上界断言才真正咬得住 —— 一个把它抬到 `HEARTS + 1` 的变异会红。
    const prev = freshState()
    const { next, effects } = dispatch(prev, answer(correctOptionId(currentQuestion(prev))))

    expect(next.hearts, '前置：`ANSWER` 不掉心，所以此刻应当就等于上界').toBe(HEARTS)
    expect(next.hearts).toBeGreaterThanOrEqual(0)
    expect(next.hearts).toBeLessThanOrEqual(HEARTS)
    expect(traceLines(effects)[0]).toContain(`hearts=${next.hearts} `)

    const dropped = findHeartDroppingTrace()
    expect(
      dropped.after,
      '前置：掉心之后必须**真的低于**上界，否则下面那条判据仍是恒绿的边界值',
    ).toBeLessThan(HEARTS)
    expect(dropped.after).toBeGreaterThanOrEqual(0)
    expect(dropped.after, '心数掉到上界之上了 —— 日志里的心数会越界（AC-D3 的前提）').toBeLessThanOrEqual(
      HEARTS,
    )
    expect(heartsFieldOf(dropped.line)).toBe(dropped.after)
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

// ── AC-C3 逐字要求的「写清楚 R-58 不适用」是一条**只由注释兜底**的 AC ──────

describe('AC-C3 的 R-58 说明**必须真的写在代码里**（不是只在 story 文档里）', () => {
  // ⚠️📎 为什么这条要写成守卫：R-58 自身的「守卫」字段逐字标注为「⚠️ 无守卫」，
  //   而 AC-C3 逐字要求「**写清楚这一点**」—— 也就是这条 AC 的**交付物是注释本身**。
  //   对一条「交付物是注释」的 AC 写行为守卫是本末倒置，但**完全不写**就等于
  //   「注释被谁删掉都不会有人发现」—— 评审实测 `grep -rn "R-58\|flush"`
  //   在三个相关文件里**零命中**，正是这个形态。
  // ⇒ 这里守的**不是**注释的内容，而是**它还在**。

  const CORE_EFFECTS = readFileSync(join(process.cwd(), 'src/core/effects.ts'), 'utf8')
  const SESSION_RECORDER = readFileSync(join(process.cwd(), 'src/app/session-recorder.ts'), 'utf8')

  it('两处「数 dispatch」的源头都点了 R-58 与 `flush`', () => {
    for (const [name, source] of [
      ['core/effects.ts', CORE_EFFECTS],
      ['app/session-recorder.ts', SESSION_RECORDER],
    ] as const) {
      expect(source, `${name} 里找不到 R-58 的说明`).toContain('R-58')
      expect(
        source,
        `${name} 点了 R-58 却没有提 flush —— AC-C3 逐字要求的是「必须 flush: 'sync'」那一半`,
      ).toContain('flush')
    }
  })

  // ⚠️ **反向自测**：证明上面那两条判据真能咬住它要防的形态。
  //   一份「只同步调用、没有 watch」的探针应当**通过** ——
  //   也就是说这两条守的不是「代码里不该有 watch」，而是「**说明不许消失**」。
  it('反向自测：判据自检（一份不含 R-58 说明的探针会被判为不合规）', () => {
    const withoutNote = 'export function recordStep() {}\n'
    const withNote = '// R-58 不适用：本条不走 watch，天然同步（flush 无关）\nfunction f() {}\n'
    expect(withoutNote.includes('R-58') && withoutNote.includes('flush')).toBe(false)
    expect(withNote.includes('R-58') && withNote.includes('flush')).toBe(true)
  })

  it('**当前实现确实不走 `watch`** —— 说明与事实相符（R-58 不适用是真的成立）', () => {
    // ⚠️ 这条不是查注释，是查**事实**：注释说「不走 watch」，那代码里就不该有 watch。
    //   两者一旦漂移（代码改了、注释没改），上面那条守卫照样绿，而 R-58
    //   已经**适用**了 —— 那正是它要防的形态。
    const wholeChain = stripComments(`${CORE_EFFECTS}\n${SESSION_RECORDER}`)
    expect(
      /\bwatch\s*\(/.test(wholeChain),
      '「数 dispatch」的链路上出现了 `watch(` —— R-58 从此适用，' +
        '而上面两条注释守卫对此一无所知',
    ).toBe(false)
  })
})
