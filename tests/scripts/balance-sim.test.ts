/**
 * 平衡模拟脚本的守卫（Story 2.3 / G228 / G231 / G232 / G233，AC-D1 / AC-D2 / AC-D2b）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **G228 命令行单元号解析** —— 单元号必须被严格校验；不给参数时是单元 1
 *   （默认行为与 Story 2.3 之前逐字一致）。
 * · **G231 跨档位失败门槛** —— 三档的门槛曲线（复测结果，见下）。
 * · **G232 第一次答对能建几座塔** —— GDD 逐字点名要看的那个变量。
 * · **G233 CLI 端到端** —— 脚本真的能按参数跑，且默认跑单元 1。
 * · **G234 回合级黄金基线**（`[CR]` 2026-10-21 补）—— AC-D2b 逐字要求的
 *   「第 4 回合建成 / 第 4/5 回合各掉 1 心 / 迟到一回合 / 掉心落在第 4/5/6 回合」。
 * · **G235 报告的作用域限定**（`[CR]` 2026-10-21 补）—— AC-D4：报告里必须带
 *   GDD 那条「本单元数值下」的前提限定，不许把它当全局结论。
 * · **G236 不得写死档位取值的单元号**（`[CR]` 2026-10-21 补）—— 补上
 *   `simulateTower()` 里那处 `costOf(…, 1)` 的零覆盖洞。
 * · **G237 实体守恒**（`[CR]` 2026-10-21 补）—— R-23：模拟器不得静默丢实体。
 *
 * ⚠️ **编号为什么是 G228 + G231 起跳，不是连号**：`tests/core/balance.test.ts`
 *   已经占了 **G229**（档位配置的单一事实源）与 **G230**（未填档位的报错文案）。
 *   ⇒ 本文件从 **G228**（2.3 起的第一个号）之后**跳到 G231**，
 *   避免同号两义（守卫编号跨文件撞车会让「G229 是哪条」无法回答）。
 *
 * ⚠️ **`[CR]` 2026-10-21 新增的 G234–G237 接着 G233 往后发** ——
 *   全仓上界实测 **G233**（`grep -rhoP 'G[0-9]{2,3}'` 逐号核对，见 story 文档）。
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
 * | 11-24 | 11   | 100 + 100 = 200| **2** | **连错 4 通关 / 连错 5 失败** |
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
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { HEARTS, TOWER_TYPES, costOf, initialSunFor, sunPerCorrectFor, tierForUnit } from '../../src/core'
import { entriesOf } from '../../src/content'
import {
  buildSyntheticDeck,
  parseUnitNumber,
  realLevelDecks,
  runLevel,
  unitHasContent,
} from '../../scripts/balance-sim'

import { plain, sectionOf, tableRows } from '../fixtures/markdown-table'
import { stripComments } from '../fixtures/strip-comments'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 全部单元 —— 逐个验，不抽样。
 *
 * ⚠️ **2026-10-26 换源批次（Story 2.10）**：`src/core/balance.ts` 的档 3 区间
 *   从 `[11, 20]` 改成了 `[11, 24]`（两册各 12 个教材 Unit）⇒
 *   「全部单元」从 20 个变成 **24** 个 ⇒ 逐个验的范围也必须是 24，
 *   否则「全部」这个词会说谎（单元 21–24 没人验）。
 */
const ALL_UNITS = Array.from({ length: 24 }, (_, index) => index + 1)

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
    expect(parseUnitNumber('1'), '合法单元号 1 必须原样透传').toBe(1)
    expect(parseUnitNumber('5'), '合法单元号 5 必须原样透传').toBe(5)
    expect(parseUnitNumber('11'), '合法单元号 11 必须原样透传').toBe(11)
    expect(parseUnitNumber('20'), '合法单元号 20 必须原样透传').toBe(20)
    // ⚠️ 2026-10-26 换源批次：`LAST_UNIT` 现在是 24 ⇒ 末单元号也要被认。
    expect(parseUnitNumber('24'), '合法单元号 24 必须原样透传').toBe(24)
  })

  it('非法值一律抛错，不静默回退到 1', () => {
    // ⚠️ 静默回退是这里最危险的形态：`balance-sim 0` 若悄悄变成单元 1，
    //   跑出来的那张「看起来有效」的门槛表**属于错误的档位**，
    //   而报告里没有任何东西会提示它 —— 这正是 R-23 记的那类 bug。
    // ⚠️ `0x10` / `1e1` 也在这份清单里（`[CR]` 2026-10-21 补）：`Number()` 认这两种写法，
    //   于是 `balance-sim -- 0x10` 会**静默跑成单元 16** —— 报告里虽印着「模拟单元：16」，
    //   但人只看到自己敲的是 `0x10`。⇒ 判据收紧为「逐字是十进制数字」。
    for (const raw of ['0', '-1', '1.5', 'abc', '5x', '0x10', '1e1', ' 1 2 ', '٣']) {
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

  it('全部 24 个单元：塔数与「(初始阳光 + 答对增量) ÷ 最低造价」逐档吻合', () => {
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

  /**
   * 判据（CLI 报告的黄金基线）：返回「**该出现却没出现**」的内容清单。空数组 = 复现。
   *
   * ⚠️ 为什么要抽成判据（`[CR]` 2026-10-21，AC-F3 / R-51）：反向自测必须
   *   **调用判据本体**；内联的 `toContain` 链没有可调用的本体，
   *   于是「反向自测」只能另抄一份 —— 抄的那份与真判据分叉时，测试照样全绿。
   */
  function goldenBaselineGaps(out: string): string[] {
    const gaps: string[] = []
    if (!out.includes('[balance] === 平衡模拟')) {
      gaps.push('报告头（脚本必须真的跑起来并打印报告）')
    }
    if (!out.includes('[balance] 模拟单元：1（档位 1-4）')) {
      gaps.push('模拟单元行（默认必须跑单元 1）')
    }
    if (
      !out.includes(
        '[balance] 塔型选择：已解锁卡中造价最低者（direct/slow 50，aoe 75）',
      )
    ) {
      gaps.push('档位 1 的塔型造价行（direct/slow 50，aoe 75）')
    }
    if (!out.includes('[balance] === 单塔命中校验（直射塔，造价 50，只建这一种）===')) {
      gaps.push('单塔校验表头（造价必须现算，档位 1 恰好是 50）')
    }
    // ⚠️ 下面两行是 GDD 的**黄金基线**（门槛夹在 3 与 4 之间）在 CLI 上的复现 ——
    //   数字取自真实运行结果，格式用 `\s+` 松开只因列宽是排版细节，
    //   而「2 颗心 / 13 回合 / 通关」「3 颗心 / 6 回合 / 失败」这三个数是**内容**。
    if (!/\[balance\] 开局连错 3 题（其余全对）\s+2\s+13\s+通关/.test(out)) {
      gaps.push('档位 1 连错 3 题的门槛行（2 颗心 / 13 回合 / 通关）')
    }
    if (!/\[balance\] 开局连错 4 题（其余全对）\s+3\s+6\s+失败/.test(out)) {
      gaps.push('档位 1 连错 4 题的门槛行（3 颗心 / 6 回合 / 失败）')
    }
    return gaps
  }

  it('不带参数 ⇒ 跑单元 1，且门槛复现 GDD 的黄金基线', () => {
    const out = runCli()
    expect(
      goldenBaselineGaps(out),
      'CLI 报告必须逐字复现黄金基线 —— 一行都没有 = isMainModule() 判据坏了（静默失效方向）',
    ).toEqual([])
  })

  it('带单元号 ⇒ 跑那一档，表头造价随之改变', () => {
    const out = runCli(['5'])
    expect(out, '必须报出单元 5').toContain('[balance] 模拟单元：5（档位 5-10）')
    expect(out, '档位 2 的造价必须是 75/110').toContain(
      '[balance] 塔型选择：已解锁卡中造价最低者（direct/slow 75，aoe 110）',
    )

    const out11 = runCli(['11'])
    expect(out11, '必须报出单元 11').toContain('[balance] 模拟单元：11（档位 11-24）')
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

  it('反向自测：判据本体会认出「报告里没有黄金基线」（AC-F3 / R-51）', () => {
    // ⚠️ 调用判据本体（`goldenBaselineGaps`），不另抄一份。
    expect(
      goldenBaselineGaps('这不是报告'),
      '反向自测：一段无关文字必须被判为「黄金基线全缺」—— 否则判据恒真',
    ).not.toEqual([])
    expect(
      goldenBaselineGaps(runCli()),
      '反向自测：真实报告必须零缺口（判据不是恒假）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G234 —— 回合级黄金基线（AC-D2b 的回合级内容）
// ════════════════════════════════════════════════════════════════════════

describe('G234 —— 回合级黄金基线（AC-D2b）', () => {
  /**
   * 判据（轨迹里程碑）：**建成回合** + **掉心回合清单**。
   *
   * ⚠️ 为什么必须钉到回合级（`[CR]` 2026-10-21）：AC-D2b 逐字把「错算掉心时机」
   *   列为控制组必须揭穿的失败模式，而**只钉住结局**的守卫揭不穿它 ——
   *   实测把 `rows.push({ turn: turn + 1 })`（每一回合整体后移一回合）打进去，
   *   GDD 的「第 4 回合建成 / 第 4/5 回合各掉 1 心」当场被推翻，
   *   而 G231 / G232 / G233 **43 条全绿**。
   */
  function milestones(
    unitNumber: number,
    wrongCount: number,
  ): {
    readonly buildTurn: number | null
    readonly heartLoss: readonly { readonly turn: number; readonly lost: number }[]
  } {
    const deck = buildSyntheticDeck(10, unitNumber)
    const run = runLevel(deck, (turn) => turn > wrongCount, unitNumber, { maxTurns: 16 })
    const built = run.rows.find((row) => row.towers > 0)
    return {
      buildTurn: built === undefined ? null : built.turn,
      heartLoss: run.rows
        .filter((row) => row.heartsLost > 0)
        .map((row) => ({ turn: row.turn, lost: row.heartsLost })),
    }
  }

  /** 判据（轨迹文本）：把一回合轨迹压成 `回合→(塔,心掉,剩心)` 的串。 */
  function trajectory(unitNumber: number, wrongCount: number): string {
    const deck = buildSyntheticDeck(10, unitNumber)
    const run = runLevel(deck, (turn) => turn > wrongCount, unitNumber, { maxTurns: 16 })
    return run.rows
      .map((row) => `${row.turn}→(${row.towers},-${row.heartsLost},${row.hearts})`)
      .join(' ')
  }

  it('连错 3 题：第 4 回合建成、第 4/5 回合各掉 1 心（GDD 逐字）', () => {
    expect(
      milestones(1, 3),
      'GDD 黄金基线：连错 3 题时它在**第 4 回合**建成、**第 4/5 回合各掉 1 心**',
    ).toEqual({
      buildTurn: 4,
      heartLoss: [
        { turn: 4, lost: 1 },
        { turn: 5, lost: 1 },
      ],
    })
  })

  it('连错 4 题：迟到一回合（第 5 回合建成）、掉心落在第 4/5/6 回合（GDD 逐字）', () => {
    expect(
      milestones(1, 4),
      'GDD 黄金基线：连错 4 题时它**迟到一回合**、掉心落在**第 4/5/6 回合**',
    ).toEqual({
      buildTurn: 5,
      heartLoss: [
        { turn: 4, lost: 1 },
        { turn: 5, lost: 1 },
        { turn: 6, lost: 1 },
      ],
    })
  })

  it('逐字复现 GDD 引用的那段轨迹', () => {
    // ⚠️ 这一段是 GDD §Economy Across Levels 逐字引用的**证据本身**。
    expect(
      trajectory(1, 3),
      'GDD 引用的轨迹「4→(1,-1,2) 5→(2,-1,1) 6→(3,-0,1)」必须逐字复现',
    ).toContain('4→(1,-1,2) 5→(2,-1,1) 6→(3,-0,1)')
  })

  it('反向自测：判据能区分「连错 3 题」与「连错 4 题」（不是恒真）', () => {
    const three = milestones(1, 3)
    const four = milestones(1, 4)
    expect(three.buildTurn, '反向自测：连错 3 题的建成回合').toBe(4)
    expect(four.buildTurn, '反向自测：连错 4 题的建成回合（迟到一回合）').toBe(5)
    expect(
      three.heartLoss.length,
      '反向自测：两个场景的掉心回合数必须不同 —— 否则判据分不出场景',
    ).not.toBe(four.heartLoss.length)
  })
})

// ════════════════════════════════════════════════════════════════════════
// G235 —— 报告必须带 AC-D4 的作用域限定
// ════════════════════════════════════════════════════════════════════════

describe('G235 —— 报告的作用域限定（AC-D4）', () => {
  /** 判据：返回「报告里**该有却没有**」的作用域限定要素。空数组 = 带了。 */
  function scopeQualifierGaps(out: string): string[] {
    const gaps: string[] = []
    if (!out.includes('作用域限定')) {
      gaps.push('「作用域限定」字样')
    }
    if (!out.includes('本单元数值下')) {
      gaps.push('GDD 原话的「本单元数值下」')
    }
    if (!out.includes('3 座塔')) {
      gaps.push('「3 座塔」这个条件本身')
    }
    if (!out.includes('全局结论')) {
      gaps.push('「不是全局结论」的声明')
    }
    return gaps
  }

  it('CLI 报告里带着 GDD 那条作用域限定', () => {
    const out = execFileSync('node_modules/.bin/tsx', ['scripts/balance-sim.ts'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(
      scopeQualifierGaps(out),
      'AC-D4：报告**必须**带上「一旦场上建起 3 座塔，本单元数值下这一局就不可能再输」的' +
        '作用域限定 —— 报告是这次复测的凭据，凭据不带前提就是一条被剥掉前提的结论',
    ).toEqual([])
  })

  it('反向自测：判据能认出「报告里没有作用域限定」', () => {
    expect(
      scopeQualifierGaps('[balance] === 平衡模拟\n[balance] 开局连错 3 题……'),
      '反向自测：一份不带限定的报告必须被判为「缺限定」—— 否则判据恒真',
    ).not.toEqual([])
    expect(
      scopeQualifierGaps('作用域限定（AC-D4）：本单元数值下 / 3 座塔 / 不是全局结论'),
      '反向自测：带限定的文本必须零缺口（判据不是恒假）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G236 —— 脚本里不得写死档位取值的单元号
// ════════════════════════════════════════════════════════════════════════

describe('G236 —— 不得写死档位取值的单元号（AC-D1 / R-51）', () => {
  /**
   * 判据：源码里「把**写死的数字**当单元号传进档位取值函数」的落点。
   *
   * ⚠️ 为什么要这条结构守卫（`[CR]` 2026-10-21）：`simulateTower()` 里那一处
   *   `costOf(towerType, unitNumber)` 改回 `costOf(towerType, 1)` 之后，
   *   **输出断言一条都抓不住** —— 实测 71 文件 / 2149 条全绿，且三档的 stdout
   *   与干净版**逐字节相同**（今天数字恰好不翻转 ⇒ 它是一个**等价变异体**）。
   *   ⇒ 光靠「断言报告内容」永远补不上这个洞 ⇒ 补一条**结构**守卫：
   *   档位取值函数**只准**接受变量，不准接受数字字面量。
   */
  function hardcodedUnitLookups(source: string): string[] {
    const code = stripComments(source)
    const patterns = [
      /\bcostOf\s*\([^)]*?,\s*(\d+)\s*\)/g,
      /\b(?:initialSunFor|sunPerCorrectFor|tierForUnit)\s*\(\s*(\d+)\s*\)/g,
    ]
    const hits: string[] = []
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        hits.push(match[0].replace(/\s+/g, ' '))
      }
    }
    return hits
  }

  it('scripts/ 下没有任何地方把数字字面量当单元号传进档位取值函数', () => {
    const offenders: string[] = []
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (!/\.(ts|vue|json)$/.test(name)) {
        continue
      }
      const source = readFileSync(join(root, 'scripts', name), 'utf8')
      const hits = hardcodedUnitLookups(source)
      if (hits.length > 0) {
        offenders.push(`scripts/${name}: ${hits.join(' / ')}`)
      }
    }
    expect(
      offenders,
      '档位取值必须走传入的单元号 —— 写死一个数字就等于那个分支**静默地**只在测第 1 档，' +
        '而输出断言今天抓不住它（等价变异体）',
    ).toEqual([])
  })

  it('反向自测：判据能认出「写死的单元号」', () => {
    expect(
      hardcodedUnitLookups('const c = costOf(towerType, 1)'),
      '反向自测：`costOf(…, 1)` 必须被抓住（判据不是恒假）',
    ).not.toEqual([])
    expect(
      hardcodedUnitLookups('const c = costOf(towerType, unitNumber)'),
      '反向自测：走变量的合法取法必须放行（判据不是恒真）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G237 —— 实体守恒（R-23）
// ════════════════════════════════════════════════════════════════════════

describe('G237 —— 模拟器不得静默丢实体（R-23）', () => {
  /** 判据：返回「本该出现却没有出现」的回合号。空数组 = 没丢。 */
  function missingTurns(
    rows: readonly { readonly turn: number }[],
    turnsPlayed: number,
  ): number[] {
    const seen = new Set(rows.map((row) => row.turn))
    const missing: number[] = []
    for (let turn = 1; turn <= turnsPlayed; turn += 1) {
      if (!seen.has(turn)) {
        missing.push(turn)
      }
    }
    return missing
  }

  it('三档各跑一局：轨迹行数 = 回合数，且没有缺号', () => {
    // ⚠️ Task 3.3 逐字要求「参数化后**逐档**核对实体守恒」——
    //   而 AC-D1 逐字把 R-23 的「不得静默丢实体」写成了硬要求。
    for (const unit of TIER_STARTS) {
      const deck = buildSyntheticDeck(10, unit)
      const run = runLevel(deck, (turn) => turn > 3, unit, { maxTurns: 16 })
      expect(
        run.rows.length,
        `单元 ${unit}：轨迹行数必须等于回合数 —— 少一行就是有实体被静默吞掉（R-23）`,
      ).toBe(run.turnsPlayed)
      expect(
        missingTurns(run.rows, run.turnsPlayed),
        `单元 ${unit}：回合号必须连续无缺 —— 缺号 = 那一回合的实体被静默吞掉（R-23）`,
      ).toEqual([])
      expect(
        run.totalWrong,
        `单元 ${unit}：答错计数必须与轨迹里答错的回合数一致 —— 计数与实体不同步 = 有一半实体丢了`,
      ).toBe(run.rows.filter((row) => !row.correct).length)
      const last = run.rows[run.rows.length - 1]
      const totalLost = run.rows.reduce((sum, row) => sum + row.heartsLost, 0)
      // ⚠️ 心数守恒的**正确**写法带夹取：reducer 把心数夹在 0，
      //   「本回合掉的心多于剩余心」是**合法**情况 ⇒ 写成 `HEARTS - totalLost`
      //   会在那种局里假红（把合法行为当成 bug）。
      expect(
        last === undefined ? -1 : last.hearts,
        `单元 ${unit}：心数守恒 —— 剩余心必须等于 max(0, 起始 ${HEARTS} − 累计掉心 ${totalLost})`,
      ).toBe(Math.max(0, HEARTS - totalLost))
    }
  })

  it('反向自测：判据能认出「被吞掉的一回合」', () => {
    const doctored = [{ turn: 1 }, { turn: 3 }, { turn: 4 }]
    expect(
      missingTurns(doctored, 4),
      '反向自测：缺了第 2 回合就必须被报出来 —— 否则这条判据恒绿',
    ).toEqual([2])
    expect(
      missingTurns([{ turn: 1 }, { turn: 2 }], 2),
      '反向自测：没缺号时不得报（判据不是恒假）',
    ).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G340 —— 真实局规模的失败门槛（Story 2.10 `[CR]` 补丁 15）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * ── G340 —— 换源之后的**真实局**也得有门槛守卫 ──────────────────────────
 *
 * ⚠️ **守什么**：本文件其余的门槛守卫（G231 / G234）跑的都是**合成题单**
 *   （`buildSyntheticDeck(10, unitNumber)`）—— 那是 Story 2.3 定的口径。
 *   换源之后真实局是 **6 题**（单元 1）与 **10 + 1** 两局（单元 2）⇒
 *   合成题单标定的「连错 3 通关 / 连错 4 失败」**对真实局没有守卫**。
 *   ⇒ 本守卫盯的是**真实内容**切出来的局（`realLevelDecks`）的门槛。
 *
 * ⚠️ **为什么题单必须是「真实内容 + `sliceDeckForLevel`」**：
 *   脚本里另写一份切片 = 第二份口径（R-37）⇒ 切出来的局与游戏里的局不是同一局，
 *   而守卫会**对着一个不存在的局**发绿。
 *
 * ⚠️ **判据是实测的，不是设计意图**（R-21）：
 *   评审时写的是「『连错 3 通关 / 连错 4 失败』对 4–6 题的局**不成立**」。
 *   实测**只对 1 题的局成立**：6 题的局门槛**与 10 题的局完全相同**，
 *   而 1 题的末局**更宽**（连错 5 题仍通关）——
 *   机制：一局在**全部题目答对**时就结束 ⇒ 局越短结束得越早 ⇒ 僵尸压过来的回合越少。
 */

describe('G340 —— 真实局规模的失败门槛（补丁 15）', () => {
  /** 真实局里「连错 N 题」的结局。 */
  function realLevelOutcome(unitNumber: number, levelIndex: number, wrongCount: number): string {
    const deck = realLevelDecks(unitNumber)[levelIndex]
    if (deck === undefined) {
      throw new Error(`单元 ${unitNumber} 没有第 ${levelIndex + 1} 局 —— 判据在空集上成立`)
    }
    const run = runLevel(deck, (turn) => turn > wrongCount, unitNumber, { maxTurns: 16 })
    return run.state.phase.kind
  }

  /**
   * 某一局的门槛描述（「连错 N 通关 / 连错 M 失败」或「连错 N 题仍通关」）。
   *
   * ⚠️ **不许把「表里没测过的 N」说成「失败」** ——
   *   场景表只到「连错 5 题」，短局实测连错 5 题仍通关 ⇒ 那一局的门槛比表更宽。
   */
  function thresholdText(unitNumber: number, levelIndex: number): string {
    let survived = -1
    let failed: number | null = null
    for (let wrong = 1; wrong <= 5; wrong += 1) {
      const outcome = realLevelOutcome(unitNumber, levelIndex, wrong)
      if (outcome === 'level-complete') survived = wrong
      if (outcome === 'level-failed' && failed === null) failed = wrong
    }
    return failed === null
      ? `连错 ${survived} 题仍通关`
      : `连错 ${survived} 通关 / 连错 ${failed} 失败`
  }

  it('真实局序列：单元 1 = 一局 6 题，单元 2 = 两局 10 + 1', () => {
    expect(
      realLevelDecks(1).map((deck) => deck.length),
      '单元 1 的真实局序列 —— 6 条词条一局切完（`QUESTIONS_PER_LEVEL` = 10）',
    ).toEqual([6])
    expect(
      realLevelDecks(2).map((deck) => deck.length),
      '单元 2 的真实局序列 —— 11 条 ⇒ 10 + 1（末局只剩 1 条，这不是 bug）',
    ).toEqual([10, 1])
  })

  it('真实局的题单来自真实内容，不是合成题单', () => {
    for (const unit of [1, 2]) {
      const fromLevels = realLevelDecks(unit)
        .flat()
        .map((entry) => entry.entryId)
        .sort()
      const fromContent = entriesOf(unit)
        .map((entry) => entry.entryId)
        .sort()
      expect(
        fromLevels,
        `单元 ${unit}：各局题单拼起来必须正好是该单元的**全部词条** —— ` +
          '少了就是切片漏了，多了就是切出了不属于这一单元的条目',
      ).toEqual(fromContent)
    }
  })

  it('6 题的局与 10 题的局门槛相同；1 题的末局更宽', () => {
    // ⚠️ **实测结果**（R-21）：评审时那条「对 4–6 题的局不成立」只对 1 题的局成立。
    expect(
      realLevelOutcome(1, 0, 3),
      '单元 1 的 6 题局：连错 3 题仍通关（与 10 题局**相同**）',
    ).toBe('level-complete')
    expect(realLevelOutcome(1, 0, 4), '单元 1 的 6 题局：连错 4 题失败').toBe('level-failed')
    expect(
      realLevelOutcome(2, 0, 3),
      '单元 2 的 10 题局：连错 3 题仍通关',
    ).toBe('level-complete')
    expect(realLevelOutcome(2, 0, 4), '单元 2 的 10 题局：连错 4 题失败').toBe('level-failed')
    expect(
      realLevelOutcome(2, 1, 5),
      '单元 2 的 1 题末局：**连错 5 题仍通关** —— 局越短结束得越早，僵尸压过来的回合越少',
    ).toBe('level-complete')
  })

  it('没有内容的单元给不出真实局（脚本必须说清，而不是拿合成题单冒充）', () => {
    expect(unitHasContent(1), '单元 1 有内容').toBe(true)
    expect(unitHasContent(2), '单元 2 有内容').toBe(true)
    expect(unitHasContent(3), '单元 3 还没录内容').toBe(false)
  })

  it('反向自测：判据能区分「1 题的局」与「10 题的局」（不是恒真）', () => {
    const short = thresholdText(2, 1)
    const full = thresholdText(2, 0)
    expect(short, '反向自测：1 题的末局门槛').toBe('连错 5 题仍通关')
    expect(full, '反向自测：10 题局的门槛').toBe('连错 3 通关 / 连错 4 失败')
    expect(
      short === full,
      '反向自测：两个局的门槛必须不同 —— 否则判据分不出局规模',
    ).toBe(false)
  })

  it('`docs/level-size.md` §4 的门槛表与实算一致', () => {
    // ⚠️ 文档的 §4 是「失败门槛按真实局规模重算」那张表 ——
    //   它写的是**实测量**，所以它必须被实测量盯着（否则又是一次「文档说 14、实测 13」）。
    const doc = readFileSync(join(root, 'docs/level-size.md'), 'utf8')
    const section = sectionOf(doc, '## 4.')
    const rows = tableRows(section)
    const expected: readonly { readonly row: string; readonly unit: number; readonly level: number }[] = [
      { row: '单元 1 · 局 1', unit: 1, level: 0 },
      { row: '单元 2 · 局 1', unit: 2, level: 0 },
      { row: '单元 2 · 局 2', unit: 2, level: 1 },
    ]
    for (const { row, unit, level } of expected) {
      const cells = rows.find((candidate) => plain(candidate[0]).includes(row))
      expect(cells, `docs/level-size.md §4 缺「${row}」那一行`).toBeDefined()
      if (cells === undefined) continue
      const deck = realLevelDecks(unit)[level]
      expect(plain(cells[1] ?? ''), `§4「${row}」的题数`).toBe(String(deck?.length ?? -1))
      expect(
        plain(cells[2] ?? ''),
        `§4「${row}」的门槛必须等于实算 —— 文档写的是实测量，量错了就是假凭据`,
      ).toContain(thresholdText(unit, level))
    }
  })
})
