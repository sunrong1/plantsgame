/**
 * 经济档位表与战斗常量的守卫（Story 1.4 / AC-3 / AC-5；Story 2.3 追加 G223–G227 / G229 / G230）。
 *
 * 守什么：① AR25「单次答对所得阳光 ≥ 最低塔造价」在**每一档、每一个单元**上成立；
 *        ② 数值来自档位表而不是散落的常量；
 *        ③ 未填档位抛错，不静默回退；
 *        ④（Story 2.3）三档的字面量、边界、比例、冻结状态、单一事实源。
 *
 * 为什么这么写：这条不等式（FR64）是支柱 1 与支柱 2 的耦合点 ——
 * 它一旦破了，孩子会「答对了却买不起塔」，而那个失败发生在孩子身上、
 * 报错发生在日志里，两头对不上号。它是**唯一**一条会在真实试玩里被孩子撞到的数值约束。
 *
 * ⚠️ [CR] P15 口径（旧头注释自称「本文件不出现写死的 50」，与正文当场矛盾）：
 * **AR25 不等式主断言**不写死任何数值、全部经档位表读取 —— Story 2.3 追加
 * 第二、第三档时同一条断言直接在三档上复用；而 **FR63 核对用例**（「造价读出来是
 * 50/50/75」那几条）**有意**钉死字面量，作为独立于档位表的第二道锁 ——
 * 改表必红，红了就是「数值变了」的显式信号。两类断言分工不同，别混为一谈。
 *
 * ⚠️ **Story 2.3 的分工（三层锁，缺一不可）**：
 *   · G225 不等式（`>=`）—— 安全性质，破了就出事（孩子答对了却买不起塔）。
 *   · G226 比例 1:1（`===`）—— 设计意图。**`>=` 抓不住它**：
 *     某档改成「增量翻倍而造价不变」时 `>=` 仍然成立，而 GDD 明确说
 *     「从来没有『增量翻倍而造价不变』的档位」⇒ 那不是游戏能产生出来的配置。
 *   · G223 字面量 —— 独立于档位表的第二道锁。
 * ⇒ 三条各管一件事，**任何一条都不能替代另一条**。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BALANCE_TIERS,
  SLOW_FACTOR,
  SLOW_TURNS,
  TOWER_STATS,
  TOWER_TYPES,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  costOf,
  initialSunFor,
  sunPerCorrectFor,
  tierForUnit,
} from '../../src/core'
import type { BalanceTier, TowerType } from '../../src/core'

import { stripComments } from '../fixtures/strip-comments'

const root = fileURLToPath(new URL('../../', import.meta.url))

const Stats = TOWER_STATS

const ALL_TOWER_TYPES: readonly TowerType[] = ['direct', 'slow', 'aoe']

/**
 * 全部已填档位覆盖的单元：**1..24**（FR63 三档 1-4 / 5-10 / 11-24）。
 *
 * ⚠️ **R-57 留痕**：**原判据**是 `const EPIC1_UNITS = [1, 2, 3, 4]`，
 * 注释逐字写着「Epic 1 只填了单元 1–4 一档（FR63）。Story 2.3 会往 BALANCE_TIERS 里追加。」
 * **新判据**是本常量（1..24 逐个）。
 * **为什么**：Story 2.3 已把 5-10 与 11-24 两档追加进表 ⇒ 旧常量与它的注释**双双过时**：
 * 一个叫 `EPIC1_UNITS` 却装着 20 个单元的常量，会让下一个读的人以为
 * 「只有前 4 个单元参与了断言」—— 而它其实全跑了。
 * ⇒ 常量**改名**为 `ALL_UNITS`，范围**扩到 1..24**（Story 2.10 又把末档从 20 抬到 24）。改名不是洁癖：
 * **常量名是判据的一部分**。
 */
const ALL_UNITS: readonly number[] = Array.from({ length: 24 }, (_, index) => index + 1)

/**
 * FR63 的三档字面量 —— **第二道锁**（G223）。
 *
 * ⚠️ 本表**故意**是档位表之外的一份抄本：它与 `BALANCE_TIERS` 逐字一致，
 * 而「改表必红」正是它存在的意义（文件头 [CR] P15 口径）。
 * ⇒ 改档位数值时**必须同时改这里** —— 忘了改就是「两处各存一份」的漂移，
 * 而这里红不红取决于有没有人记得它。
 */
const FR63_TIERS: readonly {
  readonly unitRange: readonly [number, number]
  readonly initialSun: number
  readonly sunPerCorrect: number
  readonly towerCost: Readonly<Record<TowerType, number>>
}[] = [
  {
    unitRange: [1, 4],
    initialSun: 0,
    sunPerCorrect: 50,
    towerCost: { direct: 50, slow: 50, aoe: 75 },
  },
  {
    unitRange: [5, 10],
    initialSun: 50,
    sunPerCorrect: 75,
    towerCost: { direct: 75, slow: 75, aoe: 110 },
  },
  {
    unitRange: [11, 24],
    initialSun: 100,
    sunPerCorrect: 100,
    towerCost: { direct: 100, slow: 100, aoe: 150 },
  },
]

/** 合成档位夹具（未冻结、未校验）—— 专供「反向自测」驱动判据本体。 */
function syntheticTier(from: number, to: number): BalanceTier {
  return {
    unitRange: [from, to],
    initialSun: 0,
    sunPerCorrect: 50,
    towerCost: { direct: 50, slow: 50, aoe: 75 },
  }
}

// ════════════════════════════════════════════════════════════════════════
// 判据本体（供真实断言与反向自测**共用** —— 反向自测必须调用判据本身，
// 而不是抄一份「看起来一样」的逻辑，否则测的是抄本不是判据）
// ════════════════════════════════════════════════════════════════════════

/** 某单元的「答对所得阳光」与「最低塔造价」。 */
interface TierEconomics {
  readonly sunPerCorrect: number
  readonly cheapestCost: number
}

/** 真实档位表的取值口径（走公开派生函数，与消费者同一条路）。 */
function realEconomics(unit: number): TierEconomics {
  return {
    sunPerCorrect: sunPerCorrectFor(unit),
    cheapestCost: Math.min(...ALL_TOWER_TYPES.map((type) => costOf(type, unit))),
  }
}

/** 判据（FR64）：返回**违反**「答对所得 ≥ 最低造价」的单元号。空数组 = 全部成立。 */
function unitsViolatingHardConstraint(
  units: readonly number[],
  resolve: (unit: number) => TierEconomics,
): number[] {
  return units.filter((unit) => {
    const { sunPerCorrect, cheapestCost } = resolve(unit)
    return sunPerCorrect < cheapestCost
  })
}

/** 判据（比例 1:1）：返回**不等于**「答对所得 = 最低造价」的单元号。 */
function unitsViolatingRatioOneToOne(
  units: readonly number[],
  resolve: (unit: number) => TierEconomics,
): number[] {
  return units.filter((unit) => {
    const { sunPerCorrect, cheapestCost } = resolve(unit)
    return sunPerCorrect !== cheapestCost
  })
}

/** 判据（连续无空洞）：返回 `[from, to]` 区间内**没人管**的单元号。 */
function uncoveredUnits(
  tiers: readonly BalanceTier[],
  from: number,
  to: number,
): number[] {
  const covered = new Set<number>()
  for (const tier of tiers) {
    const [tierFrom, tierTo] = tier.unitRange
    for (let unit = tierFrom; unit <= tierTo; unit += 1) {
      covered.add(unit)
    }
  }
  const missing: number[] = []
  for (let unit = from; unit <= to; unit += 1) {
    if (!covered.has(unit)) {
      missing.push(unit)
    }
  }
  return missing
}

/** 判据（逐层冻结）：档位对象、它的 unitRange、它的 towerCost 三者都要被冻结。 */
function isFullyFrozen(tier: BalanceTier): boolean {
  return (
    Object.isFrozen(tier) && Object.isFrozen(tier.unitRange) && Object.isFrozen(tier.towerCost)
  )
}

/**
 * 判据（FR63 字面量）：返回与 `expected` **不一致**的字段描述。空数组 = 逐字一致。
 *
 * ⚠️ 为什么要把判据抽成函数（`[CR]` 2026-10-21）：AC-F3 要求每条新守卫都写
 *   **反向自测**，而反向自测必须**调用判据本体**（R-51：抄一份「看起来一样」的
 *   逻辑 = 测的是抄本，不是判据）。内联的 `toBe` 链**没有可调用的本体**。
 */
function fr63Mismatches(
  expected: (typeof FR63_TIERS)[number],
  tier: BalanceTier,
): string[] {
  const problems: string[] = []
  const expectedRange = JSON.stringify([...expected.unitRange])
  const actualRange = JSON.stringify([...tier.unitRange])
  if (actualRange !== expectedRange) {
    problems.push(`unitRange ${actualRange} ≠ ${expectedRange}`)
  }
  if (tier.initialSun !== expected.initialSun) {
    problems.push(`initialSun ${tier.initialSun} ≠ ${expected.initialSun}`)
  }
  if (tier.sunPerCorrect !== expected.sunPerCorrect) {
    problems.push(`sunPerCorrect ${tier.sunPerCorrect} ≠ ${expected.sunPerCorrect}`)
  }
  for (const type of ALL_TOWER_TYPES) {
    if (tier.towerCost[type] !== expected.towerCost[type]) {
      problems.push(`towerCost.${type} ${tier.towerCost[type]} ≠ ${expected.towerCost[type]}`)
    }
  }
  return problems
}

/** 判据（报错文案）：运行期报错**不该**指向某个已完成的 story。 */
function pointsAtAStory(text: string): boolean {
  return /Story\s*\d/.test(text)
}

/**
 * 判据（档位字段副本）：**源码文本**里是否出现了档位字段的定义。
 *
 * ⚠️ **JSON 形态也必须命中**（`[CR]` 2026-10-21 修掉的盲区）：
 *   旧判据是 `/\b(initialSun|sunPerCorrect|towerCost)\s*:/` —— 要求键名**未加引号**。
 *   而 AC-E1 逐字点名的两类落点之一就是「**单元 JSON**」，JSON 的键是 `"initialSun"`，
 *   中间多一个 `"` ⇒ 旧正则**一条都匹配不到** ⇒ 在 JSON 里抄一份档位配置，
 *   守卫**全绿**（实测过）。⇒ 现在键名两侧的引号是**可选**的。
 *
 * ⚠️ 为什么不把 `unitRange` 也算进来：Story 2.2 的卡型分布锚点里**合法**有一个
 *   `unitRange` 字段，那是**另一个概念**（卡型分段的覆盖范围），不是经济档位的副本。
 *   把它算进来 = 判据误伤合规代码，然后被「放松」成恒绿。
 */
function sourceDefinesTierFields(source: string): boolean {
  return /\b(initialSun|sunPerCorrect|towerCost)\b["']?\s*:/.test(stripComments(source))
}

/** 递归列出某个目录下的所有源文件（相对仓库根）。 */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const relPath = `${dir}/${name}`
    if (statSync(join(root, relPath)).isDirectory()) {
      sourceFiles(relPath, acc)
    } else if (/\.(ts|vue|json)$/.test(name)) {
      acc.push(relPath)
    }
  }
  return acc
}

/** 档位表的**唯一合法落点**（唯一事实源本人在内，不豁免）。 */
const TIER_FIELD_EXEMPT: ReadonlySet<string> = new Set(['src/core/balance.ts'])

/**
 * 判据（档位字段副本）：返回**定义了档位字段**的文件清单。空数组 = 没有副本。
 *
 * ⚠️ 判据本体是 `sourceDefinesTierFields` —— 反向自测**调用它**（R-51）。
 */
function filesDefiningTierFields(dirs: readonly string[]): string[] {
  const offenders: string[] = []
  for (const dir of dirs) {
    for (const file of sourceFiles(dir)) {
      if (TIER_FIELD_EXEMPT.has(file)) {
        continue
      }
      const source = readFileSync(join(root, file), 'utf8')
      if (sourceDefinesTierFields(source)) {
        offenders.push(file)
      }
    }
  }
  return offenders
}

// ════════════════════════════════════════════════════════════════════════
// G225 —— AR25 不等式（FR64 全关卡硬约束）
// ════════════════════════════════════════════════════════════════════════

describe('G225 —— 单次答对所得阳光 ≥ 最低塔造价（AC-5 / FR64）', () => {
  it('单元 1–20 逐个成立（判据不写死任何数值，全部经档位表读取）', () => {
    // 这条错了意味着：孩子答对一题却买不起最便宜的塔 —— 支柱 1（学习）
    // 与支柱 2（战斗）断成两截，而界面上没有任何东西会提示为什么。
    expect(
      unitsViolatingHardConstraint(ALL_UNITS, realEconomics),
      'FR64：答对所得阳光必须 ≥ 最低塔造价 —— 破了就是「孩子答对了却买不起塔」',
    ).toEqual([])
  })

  it('判据覆盖的单元就是 1..24 —— 缩回 [1,2,3,4] 就是参数化空转', () => {
    // ⚠️ 这条单独存在：G225 上一条的循环体在 `ALL_UNITS` 上跑，
    //   而 `ALL_UNITS` 是个常量 —— 有人把它改回 4 个单元时，
    //   上一条**照样全绿**（它只断言「没有违规」，4 个单元当然没有违规）。
    //   ⇒ 必须有一条把「覆盖范围」本身钉死。
    expect(
      ALL_UNITS,
      '判据覆盖的单元必须逐个列出 —— 缩回 [1,2,3,4] 会让 G225 静默退化成 Epic 1 的范围',
    ).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    ])
  })

  it('反向自测：判据在「答对所得 < 最低造价」时必须报出违规单元', () => {
    // ⚠️ 反向自测**调用判据本体**（unitsViolatingHardConstraint），不是抄一份逻辑。
    const violations = unitsViolatingHardConstraint(ALL_UNITS, () => ({
      sunPerCorrect: 10,
      cheapestCost: 50,
    }))
    expect(violations, '反向自测：注入「答对 10 < 造价 50」后，判据必须报出全部单元').toEqual(ALL_UNITS)
    expect(
      unitsViolatingHardConstraint(ALL_UNITS, realEconomics),
      '反向自测：真实档位下判据必须报零违规（判据不是「恒真」也不是「恒假」）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G226 —— 比例恒为 1:1
// ════════════════════════════════════════════════════════════════════════

describe('G226 —— 比例恒为 1:1（AC-C2）', () => {
  it('三档的答对增量恰好等于最低塔造价', () => {
    // GDD §Economy Across Levels 的表逐字写着三档的「比例」列都是 `1 : 1`。
    expect(
      unitsViolatingRatioOneToOne(ALL_UNITS, realEconomics),
      'FR63 三档的比例恒为 1:1 —— 答对所得阳光必须**恰好**等于最低塔造价',
    ).toEqual([])
  })

  it('反向自测：`>=` 抓不住「增量翻倍而造价不变」，`===` 抓得住', () => {
    // ⚠️ 这条是 G226 存在的**全部理由**。GDD 逐字写着：
    //   「从来没有『增量翻倍而造价不变』的档位」——
    //   而「增量 100 / 造价 50」在 `>=` 判据下**完全合法**。
    const doubled: TierEconomics = { sunPerCorrect: 100, cheapestCost: 50 }
    expect(
      doubled.sunPerCorrect >= doubled.cheapestCost,
      '反向自测的前提：`>=` 判据会放过「增量翻倍而造价不变」',
    ).toBe(true)
    expect(
      unitsViolatingRatioOneToOne([1], () => doubled),
      '反向自测：`===` 判据必须抓住它 —— 否则这条守卫就是 G225 的重复',
    ).toEqual([1])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G223 —— FR63 三档字面量核对（第二道锁）
// ════════════════════════════════════════════════════════════════════════

describe('G223 —— FR63 三档字面量核对（AC-C3，第二道锁）', () => {
  it('三档的区间 / 初始阳光 / 答对增量 / 三塔型造价逐字对应 FR63', () => {
    for (const expected of FR63_TIERS) {
      const first = expected.unitRange[0]
      const tier = tierForUnit(first)
      // ⚠️ 判据本体是 `fr63Mismatches` —— 下面那条反向自测**调用它**（R-51）。
      expect(
        fr63Mismatches(expected, tier),
        `FR63 第 ${first} 档必须逐字一致 —— 区间变了就是范围收窄或扩档；` +
          '三塔型造价必须逐个对上，照旧注释只填一个数会把三塔型造价静默压平（[CR] P30）',
      ).toEqual([])
    }
  })

  it('读表口径：派生函数的结果与档位表自身的字段一致（逐键，与插入顺序解耦）', () => {
    // ⚠️ [CR] P21：旧写法 `Object.values(tier.towerCost)` 隐式依赖对象字面量的
    //   插入顺序 —— 对表做无害重排就触发假红。改逐键断言，与顺序彻底解耦。
    for (const unit of ALL_UNITS) {
      const tier = tierForUnit(unit)
      for (const type of ALL_TOWER_TYPES) {
        expect(costOf(type, unit), `单元 ${unit} 的 ${type} 造价必须读档位表`).toBe(
          tier.towerCost[type],
        )
      }
      expect(initialSunFor(unit), `单元 ${unit} 的初始阳光必须读档位表`).toBe(tier.initialSun)
      expect(sunPerCorrectFor(unit), `单元 ${unit} 的答对增量必须读档位表`).toBe(
        tier.sunPerCorrect,
      )
    }
  })

  it('反向自测：判据本体会抓住「档位与 FR63 不符」（AC-F3 / R-51）', () => {
    // ⚠️ 这条**调用判据本体**（`fr63Mismatches`），不是抄一份「看起来一样」的比较。
    const doctored = { ...FR63_TIERS[0], sunPerCorrect: 999 }
    expect(
      fr63Mismatches(doctored, tierForUnit(1)),
      '反向自测：答对增量被改必须被报出来 —— 否则 G223 就是恒绿的抄本检查',
    ).not.toEqual([])
    expect(
      fr63Mismatches(FR63_TIERS[0], tierForUnit(1)),
      '反向自测：真实首档必须零差异（判据不是恒真 —— 它真的在比）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G227 —— 档位边界与连续覆盖
// ════════════════════════════════════════════════════════════════════════

describe('G227 —— 档位边界与连续覆盖（AC-B3 / AC-C4）', () => {
  it('恰好三档，边界逐字是 [1,4] / [5,10] / [11,24]', () => {
    expect(
      BALANCE_TIERS.length,
      'FR63 是三档 —— 档数变了就是范围收窄或扩档，须先改 FR63 再改表',
    ).toBe(3)
    expect(
      BALANCE_TIERS.map((tier) => [...tier.unitRange]),
      'FR63 的三档边界必须逐字是 [1,4] / [5,10] / [11,24]',
    ).toEqual([
      [1, 4],
      [5, 10],
      [11, 24],
    ])
  })

  it('三档连续无空洞地覆盖单元 1..24', () => {
    // ⚠️ `assertTierTable()` **只查重叠与倒置，不查空洞** ——
    //   「两档之间空了一段」它一声不吭，而线性扫描会让那段单元
    //   落到「未填档位」的抛错路径上（表现为单元 5 突然报「未填档位」，
    //   报错文案还会说「已填档位：1-4、5-10、11-24」—— 自相矛盾）。
    expect(
      uncoveredUnits(BALANCE_TIERS, 1, 24),
      '三档必须连续覆盖单元 1..24 —— 中间空一段没有任何运行期校验会拦（assertTierTable 不查空洞）',
    ).toEqual([])
  })

  it('反向自测：带空洞的档位表必须被同一条判据抓住', () => {
    const holed = [syntheticTier(1, 4), syntheticTier(6, 10)]
    expect(
      uncoveredUnits(holed, 1, 10),
      '反向自测：单元 5 没人管，必须被报出来 —— 判据不查空洞的话这条就是恒绿',
    ).toEqual([5])
    expect(
      uncoveredUnits([syntheticTier(1, 4), syntheticTier(5, 10)], 1, 10),
      '反向自测：连续的两档不得报出空洞（判据不是「恒真」）',
    ).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G224 —— 逐档逐层冻结
// ════════════════════════════════════════════════════════════════════════

describe('G224 —— 每一档都逐层冻结（AC-B2 / AC-F4）', () => {
  it('档位对象、它的 unitRange、它的 towerCost 三者都被冻结', () => {
    // ⚠️ 类型层的 readonly 防不住 `as` 强转（本仓库的测试自己就在示范 `as Zombie`）——
    //   「单一事实源」必须运行期不可改写，否则任何代码都能无痕篡改平衡数值而全部断言仍绿。
    // ⚠️ **R-57 留痕**：旧判据只查 `BALANCE_TIERS[0]`（今天只有一档 ⇒ 恒绿）；
    //   新增两档若被忘冻，旧判据**照样绿**。⇒ 改为逐档断言。
    for (const [index, tier] of BALANCE_TIERS.entries()) {
      expect(
        isFullyFrozen(tier),
        `第 ${index} 档必须逐层冻结 —— 运行期可改写 = 单一事实源失效，而全部平衡断言仍然绿`,
      ).toBe(true)
    }
  })

  it('反向自测：未冻结的档位必须被判为未冻结', () => {
    expect(
      isFullyFrozen(syntheticTier(1, 4)),
      '反向自测：合成夹具确实未被冻结（判据不是恒真）',
    ).toBe(false)
    expect(
      isFullyFrozen(BALANCE_TIERS[0]),
      '反向自测：真实首档确实已冻结（判据不是恒假）',
    ).toBe(true)
  })

  it('档位表的**外层数组**也被冻结（[CR] 2026-10-21 补回）', () => {
    // ⚠️ **这条是被我漏掉的**（`[CR]` 2026-10-21 自查抓到）：改写本文件时，
    //   旧的 `expect(Object.isFrozen(BALANCE_TIERS), 'BALANCE_TIERS 数组必须冻结')`
    //   被拆成「逐档断言」时**一起删掉了**，而外层数组的运行期不可改写
    //   从此**零守卫** —— 实测把 `Object.freeze([` 改回 `([`，
    //   **全仓 71 文件 / 2149 条全绿、0 红**。
    //   ⇒ 逐档冻结与外层冻结是**两层**，少一层就少一层。
    expect(
      Object.isFrozen(BALANCE_TIERS),
      'BALANCE_TIERS 数组必须冻结 —— 数组本身可 push/splice = 第二份档位表能长出来，' +
        '而全部平衡断言仍然绿',
    ).toBe(true)
    // 反向自测：普通数组确实不是冻结的（判据不是恒真）。
    expect(Object.isFrozen([]), '反向自测：普通数组不是冻结的（判据不是恒真）').toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════
// 档位表结构（AC-3）
// ════════════════════════════════════════════════════════════════════════

describe('档位表结构（AC-3）', () => {
  it('未填档位抛错，不回退默认值（AC-3 的核心）', () => {
    // ⚠️ 这是本文件最重要的一条。静默回退就是「数值静默漂移」：
    // 一个没校准过的单元悄悄用了首档数值，试玩时看到的平衡问题会被归因到别处，
    // 而没有任何东西指向这里 —— decision-log.md 的三次手算错误就是这么长出来的。
    // ⚠️ **R-57 留痕**：原判据的单元表是 `[0, 5, 6, 10, 11, 20, 21, -1, 100]` ——
    //   其中 5 / 6 / 10 / 11 / 20 在 Story 2.3 追加档位后**已不再是未填档位**，
    //   留着它们会让本条从「抛错」变成「抛错」（仍然绿）但**测错了东西** ——
    //   它会变成「这五个单元恰好也被填了」的假象，而真正的未填区间没人守。
    //   ⇒ 新判据只留**确实未填**的单元：0（低于首档）与 25+（高于末档）。
    //   📎 **2026-10-26（Story 2.10）**：末档从 11–20 扩到 11–24 ⇒ 21 / 22 **变成已填**
    //   ⇒ 越界样例必须跟着抬到 25+，否则这两条会变成「测错了东西」的恒绿断言。
    for (const unit of [0, 25, 26, 30, 100, -1]) {
      expect(() => tierForUnit(unit), `单元 ${unit} 落在未填档位上，必须抛错而非回退`).toThrow()
      expect(() => sunPerCorrectFor(unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
      expect(() => costOf('direct', unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
      expect(() => initialSunFor(unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
    }
  })

  it('抛错信息带上已填档位，接手的人不必翻代码', () => {
    // [CR] P10：补上 AC-11 要求的中文失败原因（旧写法漏了）。
    // ⚠️ **R-57 留痕**：原判据用的是 `tierForUnit(5)` —— 单元 5 在 Story 2.3 之后
    //   **已填档位**，那一抛不再发生，本条会**空转**（`toThrow` 匹配不到任何东西）。
    //   ⇒ 改用仍然未填的单元 25。
    expect(
      () => tierForUnit(25),
      '抛错信息必须列出已填档位 —— 接手的人不必翻代码就知道要补哪条',
    ).toThrow(/已填档位/)
  })

  it('非整数单元号抛错', () => {
    // Number('') === 0 这类「悄悄变成 0」的路径会把单元 0 混成「首档」，
    // 那一档恰好是已填的 —— 于是脏输入静默拿到了合法数值。
    for (const unit of [1.5, NaN, Infinity]) {
      expect(() => tierForUnit(unit), `单元号 ${unit} 必须抛错`).toThrow()
    }
  })

  it('真实档位表：非空、每档区间 from <= to（[CR] P22）', () => {
    // 旧守卫「升序且不重叠」在表只有一档时循环体零次执行 —— 空转守卫，
    // 当下不可能失败，给出的是虚假信心。倒置区间 [4,1] 旧版能同时通过
    // 测试与线性扫描（静默不命中任何单元）。现在 from<=to 逐档断言，
    // 且结构性质（重叠 / 倒置 / 空表）已由 tierForUnit 的运行期校验强制。
    expect(BALANCE_TIERS.length, '空档位表会让一切单元查询抛错 —— 表必须至少有一档').toBeGreaterThan(0)
    for (const [i, tier] of BALANCE_TIERS.entries()) {
      const [from, to] = tier.unitRange
      expect(from, `档位 ${i} 的区间 [${from},${to}] 倒置 —— 畸形档位会静默不命中任何单元`).toBeLessThanOrEqual(to)
    }
  })

  it('合成多档 fixture：空表 / 倒置 / 重叠区间全部大声抛错（[CR] P22）', () => {
    // 「线性扫描的前提」必须在真正的多档输入上测 —— 单档真实表测不到扫描性质。
    // tierForUnit 的第二个参数就是为合成 fixture 开的口子（生产调用走默认表）。
    const tier = (from: number, to: number): BalanceTier => syntheticTier(from, to)

    expect(() => tierForUnit(3, []), '空表必须抛错').toThrow(/不能为空/)
    expect(() => tierForUnit(3, [tier(4, 1)]), '倒置区间必须抛错 —— 它静默不命中任何单元').toThrow(/倒置/)
    expect(
      () => tierForUnit(3, [tier(1, 4), tier(4, 8)]),
      '区间重叠必须抛错 —— 静默取第一条命中会把重叠掩盖掉（单元 4 用哪档？）',
    ).toThrow(/重叠/)
    expect(
      tierForUnit(6, [tier(1, 4), tier(5, 10)]).unitRange,
      '合法多档表按单元号正确命中第二档',
    ).toEqual([5, 10])
  })
})

// ════════════════════════════════════════════════════════════════════════
// G230 —— 未填档位的报错文案
// ════════════════════════════════════════════════════════════════════════

describe('G230 —— 未填档位的报错文案（AC-B4）', () => {
  /** 触发未填档位的抛错并取回文案。 */
  function errorText(unit: number): string {
    try {
      tierForUnit(unit)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    throw new Error(`单元 ${unit} 竟然没有抛错 —— 判据的前提被破坏了`)
  }

  it('带上已填档位、保留「不回退默认值」的理由，且不再指向已完成的 story', () => {
    const text = errorText(25)
    expect(text, '报错必须列出已填档位').toContain('已填档位')
    expect(text, '「不回退默认值」是这条报错的核心理由，不得删').toContain('不回退默认值')
    // ⚠️ 旧文案逐字是「档位 5-10 与 11-24 的数值见 FR63，**由 Story 2.3 追加**。」
    //   Story 2.3 做完之后，这句话会**每天都**出现在单元 25+ 的报错里，
    //   指向一个已经做完的事 —— 一句会误导下一个人去找已完成工作的活注释。
    expect(
      pointsAtAStory(text),
      '运行期报错不该指向某个 story —— 它讲的是「这个单元没有档位」，不是「谁该去补」',
    ).toBe(false)
  })

  it('反向自测：判据本体会抓住「指向已完成 story」的文案', () => {
    expect(
      pointsAtAStory('档位 5-10 与 11-24 的数值见 FR63，由 Story 2.3 追加。'),
      '反向自测：Story 2.3 做完后的旧文案必须被判为违规',
    ).toBe(true)
    expect(
      pointsAtAStory('单元 25 落在未填档位上。已填档位：1-4、5-10、11-24。未填档位不回退默认值。'),
      '反向自测：合规文案必须放行（判据不是恒真）',
    ).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════
// G229 —— 档位配置的单一事实源
// ════════════════════════════════════════════════════════════════════════

describe('G229 —— 档位配置在 src/core/balance.ts 之外没有副本（AC-E1）', () => {
  it('src/ 与 scripts/ 下除 balance.ts 外没有任何地方定义档位字段', () => {
    // ⚠️ **判据只看对象字面量的键**（`initialSun:` / `sunPerCorrect:` / `towerCost:`），
    //   **不**看 `unitRange` —— Story 2.2 的卡型分布锚点里**合法**有一个
    //   `unitRange` 字段（`src/content/distribution.ts` 的 CARD_DISTRIBUTION_ANCHORS），
    //   那是**另一个概念**（卡型分段的覆盖范围），不是经济档位的副本。
    //   把 `unitRange` 也算进来 = 判据会误伤合规代码，然后被「放松」成恒绿。
    // ⚠️ 先 `stripComments`（R-52）：本仓库的注释里**逐字写着**这些字段名 ——
    //   不剥注释，每条正则都会命中**自己写的说明文字**。
    // ⚠️ **扫描范围含 `scripts/`**（`[CR]` 2026-10-21 补）：`scripts/balance-sim.ts`
    //   是**唯一**接触档位数值的地方（旧判据只扫 `src/`）——
    //   在那里抄一份档位表，旧判据**一条都看不见**。
    expect(
      filesDefiningTierFields(['src', 'scripts']),
      '档位配置只能在 src/core/balance.ts 一处定义 —— 这些文件里出现了档位字段，' +
        '说明存在第二份事实源（一改一漏的起点）',
    ).toEqual([])
  })

  it('BALANCE_TIERS 不出现在 core/ 之外（barrel 转发除外）', () => {
    // `src/core/index.ts` 是 core 的对外出口，转发 `BALANCE_TIERS` 是它的职责；
    // 除此之外任何地方提到它，都是「绕过 balance.ts 自己拿档位表」。
    const offenders: string[] = []
    for (const dir of ['src', 'scripts']) {
      for (const file of sourceFiles(dir)) {
        if (file === 'src/core/balance.ts' || file === 'src/core/index.ts') {
          continue
        }
        const source = stripComments(readFileSync(join(root, file), 'utf8'))
        if (/\bBALANCE_TIERS\b/.test(source)) {
          offenders.push(file)
        }
      }
    }
    expect(
      offenders,
      '档位表必须经 balance.ts 的公开接口取用 —— 这些文件直接提到了 BALANCE_TIERS',
    ).toEqual([])
  })

  it('反向自测：判据本体会抓住「在组件里抄一份档位配置」（TS 与 JSON 两种形态）', () => {
    // ⚠️ **JSON 那一支是本条被补上的原因**（`[CR]` 2026-10-21）：
    //   AC-E1 逐字点名的落点之一就是「**单元 JSON**」，而旧判据要求键名未加引号
    //   ⇒ JSON 里的 `"initialSun": 0` **匹配不到** ⇒ 在 JSON 里抄一份档位配置，
    //   守卫**全绿**（实测过：29 条全绿）。
    const fakeTs = `
      const LOCAL_TIERS = [
        { unitRange: [1, 4], initialSun: 0, sunPerCorrect: 50, towerCost: { direct: 50, slow: 50, aoe: 75 } },
      ]
    `
    const fakeJson = `{"tiers":[{"unitRange":[1,4],"initialSun":0,"sunPerCorrect":50,"towerCost":{"direct":50,"slow":50,"aoe":75}}]}`
    expect(
      sourceDefinesTierFields(fakeTs),
      '反向自测：组件里抄一份档位表（TS 形态）必须被判为违规（判据不是恒假）',
    ).toBe(true)
    expect(
      sourceDefinesTierFields(fakeJson),
      '反向自测：单元 JSON 里抄一份档位表（**JSON 形态**）必须被判为违规 —— ' +
        '旧判据在这里是**失明**的（AC-E1 逐字点名的落点之一）',
    ).toBe(true)
    expect(
      sourceDefinesTierFields('const x = { unitRange: [1, 4] }'),
      '反向自测：只用 unitRange 的不算违规 —— Story 2.2 的卡型锚点合法用它',
    ).toBe(false)
    expect(
      sourceDefinesTierFields('const a = initialSunFor(1); const b = costOf("direct", 1)'),
      '反向自测：只是**调用**派生函数不算违规 —— 那是合法取用，不是副本',
    ).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════
// 战斗常量（AC-3）
// ════════════════════════════════════════════════════════════════════════

describe('战斗常量（AC-3）', () => {
  it('僵尸满血 100、每回合 2 格', () => {
    // AR21 / AR22 的分母与分子。同时是血量上界（架构不变量「僵尸血量 ∈ [0,100]」）。
    expect(ZOMBIE_HP, '僵尸满血被改动会让 AR21 的「恰好击杀」全部失真').toBe(100)
    expect(ZOMBIE_MOVE_PER_ROUND, '僵尸速度被改动会整体平移射程窗口').toBe(2)
  })

  it('减速 50% 持续 3 回合', () => {
    // AR27 的逐字：减速 3 回合 + 刷新而非叠加。
    expect(SLOW_FACTOR, '减速幅度必须 50%（每回合 2 格 → 1 格）').toBe(0.5)
    expect(SLOW_TURNS, 'AR27：减速持续 3 回合').toBe(3)
  })

  it('三塔型属性与 GDD 塔型表逐字一致', () => {
    expect(Stats.direct.damage, '直射塔 50 伤害 / 射程 3 格（gdd.md:226）').toBe(50)
    expect(Stats.direct.range, '直射塔射程 3 格').toBe(3)
    expect(Stats.slow.damage, '减速塔 25 伤害（直射的一半）').toBe(25)
    expect(Stats.slow.range, '减速塔射程 3 格').toBe(3)
    expect(Stats.aoe.damage, '范围塔 60 伤害（决策日志：40 → 60）').toBe(60)
    // ⚠️ aoe.range 是 GDD 塔型表「射程（格）」列的语义值，**与伤害覆盖无关** ——
    // 范围塔的伤害覆盖恒为同行 3 格，由 combat.ts 的 aoeColumns() 给出。
    // 见 TOWER_STATS.aoe 的注释与 AC-4.1。
    expect(Stats.aoe.range, '范围塔 GDD 射程列为 2；实际伤害覆盖是固定 3 格条带').toBe(2)
  })

  it('TowerStats 只有 damage / range 两字段 —— 减速死字段已删除（[CR] D2）', () => {
    // 旧表在 slow 条目里挂了 slowFactor / slowTurns，而 stepZombie 只读全局
    // SLOW_FACTOR、applySlow 只认全局 SLOW_TURNS —— 表内字段零运行期消费者，
    // 是死数据。两处并存 = 双事实源：Story 3.2 按「单一事实源」注释只改表 → 行为零变化，
    // 恰好复刻本文件头布道的「一改一漏」。减速数值的单一事实源 = 全局常量（上面两条用例锁死）。
    for (const type of ALL_TOWER_TYPES) {
      expect(
        Object.keys(TOWER_STATS[type]).sort(),
        `${type} 的属性字段必须只有 damage / range —— 再长出 slowFactor/slowTurns 就是双事实源回潮（[CR] D2）`,
      ).toEqual(['damage', 'range'])
    }
  })

  it('TOWER_STATS 覆盖全部三种塔型', () => {
    expect(Object.keys(TOWER_STATS).sort(), '新增塔型时必须同步补属性表').toEqual(['aoe', 'direct', 'slow'])
  })

  it('TOWER_TYPES 运行期白名单与 TOWER_STATS 键集合一致（[CR] P4）', () => {
    // 白名单是字面量联合的运行期镜像（类型擦除后唯一的拦截点）。
    // 两处名单不同步 = 新增塔型时一半入口放行脏值、另一半抛错。
    expect(
      [...TOWER_TYPES].sort(),
      '白名单与属性表键必须同集合 —— 新增塔型漏改任何一边都是漂移',
    ).toEqual(Object.keys(TOWER_STATS).sort())
  })

  it('属性表与白名单在运行期被逐层冻结（[CR] P16）', () => {
    // ⚠️ **R-57 留痕**：本条**原先**与档位表的冻结断言写在同一条里，
    //   且只查 `BALANCE_TIERS[0]`。Story 2.3 把档位表扩到三档后，
    //   那条断言对新增两档**完全失明** ⇒ 拆成两条：
    //   档位表见 G224（逐档断言），本条只管 TOWER_STATS / TOWER_TYPES。
    expect(Object.isFrozen(TOWER_STATS), 'TOWER_STATS 必须冻结').toBe(true)
    for (const type of ALL_TOWER_TYPES) {
      expect(Object.isFrozen(TOWER_STATS[type]), `${type} 的属性条目必须冻结`).toBe(true)
    }
    expect(Object.isFrozen(TOWER_TYPES), 'TOWER_TYPES 白名单必须冻结').toBe(true)
  })
})
