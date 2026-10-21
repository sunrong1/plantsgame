/**
 * 平衡模拟脚本的守卫（Story 2.3 / G228 / G231 / G232 / G233，AC-D1 / AC-D2 / AC-D2b）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G228 命令行单元号解析** —— 单元号必须被严格校验；不给参数时是单元 1
 *   （默认行为与 Story 2.3 之前逐字一致）。
 * · **G231 跨档位失败门槛** —— 三档的门槛曲线（复测结果，见下）。
 * · **G232 第一次答对能建几座塔** —— GDD 逐字点名要看的那个变量。
 * · **G233 CLI 端到端** —— 脚本真的能按参数跑，且默认跑单元 1。
 *
 * ⚠️ **编号为什么是 G228 + G231 起跳，不是连号**：`tests/core/balance.test.ts`
 *   已经占了 **G229**（档位配置的单一事实源）与 **G230**（未填档位的报错文案）。
 *   ⇒ 本文件从 **G228**（2.3 起的第一个号）之后**跳到 G231**，
 *   避免同号两义（守卫编号跨文件撞车会让「G229 是哪条」无法回答）。
 *
 * ── 为什么这个文件存在 ────────────────────────────────────────────────────
 * Story 2.3 之前，`scripts/balance-sim.ts` 把 `unitNumber` **写死成 1** ——
 * `createInitialState({ unitNumber: 1 })` 与九处 `costOf(…, 1)`。
 * 而档位表的三档数值**全部**经 `initialSunFor` / `sunPerCorrectFor` / `costOf` 取值
 * ⇒ 那个脚本**结构上只能测第 1 档**。
 * 于是 `epics.md` Story 2.3 的 AC 逐字要求「每档参数变更后必须重跑
 * `npm run balance-sim`」—— 照做也**照不到**第 2/3 档，是一句假门槛。
 * 本文件是那句话被兑现的前提。
 *
 * ── 复测结果（GDD §Economy Across Levels 逐字要求的那次复测）────────────────
 * GDD 逐字：「复测要看的具体变量是『**第一次答对能建几座塔**』—— 门槛是否移动全看它。」
 * 实测（真实 `src/core/` reducer；G231 / G232 逐条钉住）：
 *
 * | 档位 | 单元 | 首次答对后的阳光 | 能建几座塔 | 失败门槛 |
 * |---|---|---|---|---|
 * | 1-4   | 1    | 0 + 50 = 50    | 1 | 连错 3 通关 / 连错 4 失败 |
 * | 5-10  | 5    | 50 + 75 = 125  | 1 | 连错 3 通关 / 连错 4 失败 |
 * | 11-20 | 11   | 100 + 100 = 200| **2** | **连错 4 通关 / 连错 5 失败** |
 *
 * ⚠️ **档位 3 的门槛比档位 1-2 宽一问**（更宽容，**不是**更难）。
 * 机制：`sunPerCorrect === 最低塔造价` 的 1:1 比例在**三档都成立**（G226 已钉住），
 * 但**初始阳光是比例之外的另一个项** —— 档位 3 的 `initialSun = 100`
 * **恰好等于**它的塔造价 100，于是「初始阳光 + 第一次答对的增量 = 200」够买 2 座塔；
 * 档位 1（0+50）与档位 2（50+75）都只够买 1 座。
 * ⇒ 「递增阳光**不改变**失败门槛」这句**逐字**在档位 3 上不成立。
 * ⇒ 已按 R-21 更正源文档；数值**一个字未改**（FR63 的值已由用户拍板，R-20）。
 * ⚠️ 「档位 3 要不要跟档位 1-2 对齐门槛」是**产品裁决**，
 *   已登记在 `deferred-work.md`（条目 45），本 story 不擅自改数。
 *
 * ⚠️ 本文件**自己驱动** `scripts/balance-sim.ts` 导出的 `runLevel`，
 *   而 `runLevel` 走的是**真实 `src/core/` reducer** —— 不另写一份回合逻辑副本
 *   （脚本头「不得内联一份回合逻辑」那条纪律在测试侧同样成立）。
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TOWER_TYPES, costOf, initialSunFor, sunPerCorrectFor, tierForUnit } from '../../src/core'
import { buildSyntheticDeck, parseUnitNumber, runLevel } from '../../scripts/balance-sim'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 全部 20 个单元 —— 逐个验，不抽样。 */
const ALL_UNITS = Array.from({ length: 20 }, (_, index) => index + 1)

/** 三档的起始单元（FR63 的档位起点）。 */
const TIER_STARTS = [1, 5, 11] as const

/** 某单元的档位起点（取自真实档位表，不写死）。 */
function tierStart(unit: number): number {
  return tierForUnit(unit).unitRange[0]
}

/**
 * 跑一局「开局连错 `wrongCount` 题、其余全对」，返回结局。
 *
 * ⚠️ `correctAt` 的语义与脚本报告里的门槛行**完全一致**（`t > wrongCount`
 *   ⇒ 前 `wrongCount` 个回合答错）—— 判据若与报告口径分叉，
 *   守卫就会在断言另一条曲线。
 */
function outcome(unitNumber: number, wrongCount: number): {
  readonly phase: string
  readonly turns: number
  readonly heartsLost: number
} {
  const deck = buildSyntheticDeck(10, unitNumber)
  const run = runLevel(deck, (turn) => turn > wrongCount, unitNumber, { maxTurns: 16 })
  return {
    phase: run.state.phase.kind,
    turns: run.turnsPlayed,
    heartsLost: run.rows.reduce((sum, row) => sum + row.heartsLost, 0),
  }
}

/** 第一次答对之后场上建成的塔数（第一次答对发生在第 4 回合）。 */
function towersAfterFirstCorrect(unitNumber: number): number {
  const deck = buildSyntheticDeck(10, unitNumber)
  // 连错 3 题 ⇒ 第 4 回合第一次答对 ⇒ 那之后建成的塔就是「第一次答对能建几座塔」
  const run = runLevel(deck, (turn) => turn > 3, unitNumber, { maxTurns: 16 })
  const firstCorrectRow = run.rows.find((row) => row.correct)
  if (firstCorrectRow === undefined) {
    throw new Error(`单元 ${unitNumber} 的一局里没有出现过答对的回合 —— 策略写坏了`)
  }
  return firstCorrectRow.towers
}

// ════════════════════════════════════════════════════════════════════════
// G228 —— 命令行单元号解析
// ════════════════════════════════════════════════════════════════════════

describe('G228 —— 命令行单元号解析（AC-D1）', () => {
  it('不给参数时是单元 1（默认行为与 Story 2.3 之前逐字一致）', () => {
    expect(parseUnitNumber(undefined), '默认必须是单元 1 —— 那是 Story 2.3 之前的行为').toBe(1)
    expect(parseUnitNumber(''), '空串等于没给参数').toBe(1)
    expect(parseUnitNumber('  '), '纯空白等于没给参数').toBe(1)
  })

  it('给了合法单元号就照用', () => {
    expect(parseUnitNumber('1')).toBe(1)
    expect(parseUnitNumber('5')).toBe(5)
    expect(parseUnitNumber('11')).toBe(11)
    expect(parseUnitNumber('20')).toBe(20)
  })

  it('非法值一律抛错，不静默回退到 1', () => {
    // ⚠️ 静默回退是这里最危险的形态：`balance-sim 0` 若悄悄变成单元 1，
    //   跑出来的那张「看起来有效」的门槛表**属于错误的档位**，
    //   而报告里没有任何东西会提示它 —— 这正是 R-23 记的那类 bug。
    for (const raw of ['0', '-1', '1.5', 'abc', '5x']) {
      expect(
        () => parseUnitNumber(raw),
        `单元号 ${JSON.stringify(raw)} 必须抛错，不得静默回退到 1`,
      ).toThrow(/正整数/)
    }
  })

  it('反向自测：判据本体会抓住「静默回退到 1」', () => {
    const judge = (raw: string | undefined): number => parseUnitNumber(raw)
    expect(judge(undefined), '反向自测：没给参数时判据返回 1').toBe(1)
    expect(
      () => judge('0'),
      '反向自测：0 必须被判为非法（判据不是恒返回 1）',
    ).toThrow()
  })
})

// ════════════════════════════════════════════════════════════════════════
// G232 —— 第一次答对能建几座塔（GDD 点名的那个变量）
// ════════════════════════════════════════════════════════════════════════

describe('G232 —— 第一次答对能建几座塔（AC-D2，GDD 点名的变量）', () => {
  it('档位 1-2 的单元：第一次答对恰好建 1 座塔', () => {
    for (const unit of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(
        towersAfterFirstCorrect(unit),
        `单元 ${unit} 第一次答对应恰好建 1 座塔 —— 阳光只够一座，` +
          '建两座会让第二座打在同一目标上、白白浪费一次购买',
      ).toBe(1)
    }
  })

  it('档位 3 的单元：第一次答对建 2 座塔（初始阳光恰好等于塔造价）', () => {
    // ⚠️ 这是**实测结果**，不是设计意图 —— 机制见文件头。
    //   档位 3 的 `initialSun = 100` **恰好等于**它的塔造价 100，
    //   于是「初始 100 + 第一次答对 +100 = 200」够买 2 座。
    for (const unit of [11, 12, 15, 20]) {
      expect(
        towersAfterFirstCorrect(unit),
        `单元 ${unit} 第一次答对建 2 座塔 —— 初始阳光 100 恰好等于塔造价 100`,
      ).toBe(2)
    }
  })

  it('全部 20 个单元：塔数与「(初始阳光 + 答对增量) ÷ 最低造价」逐档吻合', () => {
    // ⚠️ 这条把**机制**写死：塔数由这两个量决定，不是玄学。
    //   档位 3 与档位 1-2 的差别**全部**来自初始阳光这一项。
    for (const unit of ALL_UNITS) {
      const cheapest = Math.min(...TOWER_TYPES.map((type) => costOf(type, unit)))
      const expected = Math.floor((initialSunFor(unit) + sunPerCorrectFor(unit)) / cheapest)
      expect(
        towersAfterFirstCorrect(unit),
        `单元 ${unit} 的首次答对塔数必须等于 floor((初始 ${initialSunFor(unit)} + 增量 ` +
          `${sunPerCorrectFor(unit)}) ÷ 最低造价 ${cheapest})`,
      ).toBe(expected)
    }
  })

  it('反向自测：判据会区分 1 座与 2 座（不是恒真的计数）', () => {
    const one = towersAfterFirstCorrect(1)
    const two = towersAfterFirstCorrect(11)
    expect(one, '反向自测：档位 1 的首次答对塔数').toBe(1)
    expect(two, '反向自测：档位 11 的首次答对塔数').toBe(2)
    expect(one, '反向自测：两个档位的塔数必须不同 —— 否则判据分不出档位').not.toBe(two)
  })
})

// ════════════════════════════════════════════════════════════════════════
// G231 —— 跨档位失败门槛（复测结果）
// ════════════════════════════════════════════════════════════════════════

describe('G231 —— 跨档位失败门槛（AC-D2 / AC-D2b，复测结果）', () => {
  it('档位 1-2：连错 3 题通关、连错 4 题失败（门槛夹在 3 与 4 之间）', () => {
    // ⚠️ 这是 GDD 的**黄金基线**（「门槛夹在 3 与 4 之间」）在档位 1-2 上的复现。
    //   档位 1 的数值一个字未改 ⇒ 它的门槛在数学上不可能动；
    //   它一动，就说明模拟器参数化时把别的东西也一起改了。
    for (const unit of TIER_STARTS.slice(0, 2)) {
      expect(
        outcome(unit, 3).phase,
        `单元 ${unit}（档位 ${tierStart(unit)}）连错 3 题必须通关 —— ` +
          '档位 1 的门槛是 GDD 的黄金基线，动了就是模拟器改错了',
      ).toBe('level-complete')
      expect(
        outcome(unit, 4).phase,
        `单元 ${unit}（档位 ${tierStart(unit)}）连错 4 题必须失败`,
      ).toBe('level-failed')
    }
  })

  it('档位 3：连错 4 题通关、连错 5 题失败（门槛夹在 4 与 5 之间）', () => {
    // ⚠️ **实测结果**：档位 3 的门槛比档位 1-2 **宽一问**（更宽容，不是更难）。
    //   机制见 G232 与文件头。数值未改（FR63 已拍板，R-20）。
    //   ⇒ 「递增阳光不改变失败门槛」这句逐字在档位 3 上不成立，已按 R-21 更正源文档。
    expect(outcome(11, 4).phase, '单元 11 连错 4 题通关（比档位 1-2 宽一问）').toBe('level-complete')
    expect(outcome(11, 5).phase, '单元 11 连错 5 题失败').toBe('level-failed')
  })

  it('反向自测：门槛判据能区分「失败」与「通关」（不是恒真）', () => {
    expect(outcome(1, 3).phase, '反向自测：连错 3 题').toBe('level-complete')
    expect(outcome(1, 4).phase, '反向自测：连错 4 题').toBe('level-failed')
    expect(
      outcome(1, 3).phase === outcome(1, 4).phase,
      '反向自测：同一档位下两个场景的结局必须不同 —— 否则门槛判据恒真',
    ).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════
// G233 —— CLI 端到端
// ════════════════════════════════════════════════════════════════════════

describe('G233 —— CLI 端到端（AC-D1 / Task 3.4）', () => {
  /** 跑一次脚本，拿它的 stdout。 */
  function runCli(args: readonly string[] = []): string {
    return execFileSync('node_modules/.bin/tsx', ['scripts/balance-sim.ts', ...args], {
      cwd: root,
      encoding: 'utf8',
      // ⚠️ stderr 收进管道而不是直接喷到父进程 —— 否则「非法单元号」那个用例
      //   会把一整段堆栈糊在测试输出里，掩盖真正的断言结果。
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  it('不带参数 ⇒ 跑单元 1，且门槛复现 GDD 的黄金基线', () => {
    const out = runCli()
    expect(
      out,
      '脚本必须真的跑起来并打印报告 —— 一行都没有 = isMainModule() 判据坏了（静默失效方向）',
    ).toContain('[balance] === 平衡模拟')
    expect(out, '默认必须跑单元 1').toContain('[balance] 模拟单元：1（档位 1-4）')
    // ⚠️ 下面两行是 GDD 的**黄金基线**（门槛夹在 3 与 4 之间）在 CLI 上的复现 ——
    //   数字取自真实运行结果，格式用 `\s+` 松开只因列宽是排版细节，
    //   而「2 颗心 / 13 回合 / 通关」「3 颗心 / 6 回合 / 失败」这三个数是**内容**。
    expect(out, '档位 1 连错 3 题：2 颗心、13 回合、通关').toMatch(
      /\[balance\] 开局连错 3 题（其余全对）\s+2\s+13\s+通关/,
    )
    expect(out, '档位 1 连错 4 题：3 颗心、6 回合、失败').toMatch(
      /\[balance\] 开局连错 4 题（其余全对）\s+3\s+6\s+失败/,
    )
    // ⚠️ 造价行逐字未变（档位 1 的三个数 50/50/75 来自 balance.ts，非本文件写死）。
    expect(out, '档位 1 的塔型造价行必须逐字未变').toContain(
      '[balance] 塔型选择：已解锁卡中造价最低者（direct/slow 50，aoe 75）',
    )
    expect(out, '单塔校验表头的造价必须现算（档位 1 恰好是 50）').toContain(
      '[balance] === 单塔命中校验（直射塔，造价 50，只建这一种）===',
    )
  })

  it('带单元号 ⇒ 跑那一档，表头造价随之改变', () => {
    const out = runCli(['5'])
    expect(out, '必须报出单元 5').toContain('[balance] 模拟单元：5（档位 5-10）')
    expect(out, '档位 2 的造价必须是 75/110').toContain(
      '[balance] 塔型选择：已解锁卡中造价最低者（direct/slow 75，aoe 110）',
    )

    const out11 = runCli(['11'])
    expect(out11, '必须报出单元 11').toContain('[balance] 模拟单元：11（档位 11-20）')
    expect(out11, '档位 3 的造价必须是 100/150').toContain(
      '[balance] 塔型选择：已解锁卡中造价最低者（direct/slow 100，aoe 150）',
    )
    // ⚠️ 档位 3 的门槛行 —— 复测结果，与 G231 一致。
    expect(out11, '档位 3 连错 4 题：2 颗心、14 回合、通关').toMatch(
      /\[balance\] 开局连错 4 题（其余全对）\s+2\s+14\s+通关/,
    )
    expect(out11, '档位 3 连错 5 题：3 颗心、6 回合、失败').toMatch(
      /\[balance\] 开局连错 5 题（其余全对）\s+3\s+6\s+失败/,
    )
  })

  it('非法单元号 ⇒ 非零退出并说清为什么', () => {
    // ⚠️ 静默跑单元 1 会产出一张「属于错误档位」的门槛表 ——
    //   而报告里没有任何东西会提示它（唯一能提示的是「模拟单元：N」那一行，
    //   但人往往只读门槛表本身）。
    expect(
      () => runCli(['abc']),
      '非法单元号必须让脚本失败',
    ).toThrow()
  })
})
