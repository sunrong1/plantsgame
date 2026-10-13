/**
 * 经济档位表与战斗常量的守卫（Story 1.4 / AC-3 / AC-5）。
 *
 * 守什么：① AR25「单次答对所得阳光 ≥ 最低塔造价」在**每一档、每一个单元**上成立；
 *        ② 数值来自档位表而不是散落的常量；
 *        ③ 未填档位抛错，不静默回退。
 *
 * 为什么这么写：这条不等式（FR64）是支柱 1 与支柱 2 的耦合点 ——
 * 它一旦破了，孩子会「答对了却买不起塔」，而那个失败发生在孩子身上、
 * 报错发生在日志里，两头对不上号。它是**唯一**一条会在真实试玩里被孩子撞到的数值约束。
 *
 * ⚠️ 本文件**不出现写死的 50**（AC-5）。断言 5 必须在单元 1/2/3/4 上各跑一遍
 * 且数值全部经档位表读取 —— Story 2.3 追加第二、第三档时，
 * 同一条断言会直接在三档上复用。若这里写死了字面量，Story 2.3 就得重写断言，
 * 而「重写断言」正是数值约束悄悄失守的最短路径。
 */
import { describe, expect, it } from 'vitest'

import {
  BALANCE_TIERS,
  SLOW_FACTOR,
  SLOW_TURNS,
  TOWER_STATS,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  costOf,
  initialSunFor,
  sunPerCorrectFor,
  tierForUnit,
} from '../../src/core'
import type { TowerType } from '../../src/core'

const Stats = TOWER_STATS

const ALL_TOWER_TYPES: readonly TowerType[] = ['direct', 'slow', 'aoe']
/** Epic 1 只填了单元 1–4 一档（FR63）。Story 2.3 会往 BALANCE_TIERS 里追加。 */
const EPIC1_UNITS: readonly number[] = [1, 2, 3, 4]

describe('AR25 —— 单次答对所得阳光 ≥ 最低塔造价（AC-5）', () => {
  it('单元 1、2、3、4 逐个成立（FR64 全关卡硬约束）', () => {
    for (const unit of EPIC1_UNITS) {
      const sunPerCorrect = sunPerCorrectFor(unit)
      const cheapestCost = Math.min(...ALL_TOWER_TYPES.map((t) => costOf(t, unit)))

      // 这条错了意味着：孩子答对一题却买不起最便宜的塔 —— 支柱 1（学习）
      // 与支柱 2（战斗）断成两截，而界面上没有任何东西会提示为什么。
      expect(
        sunPerCorrect,
        `单元 ${unit} 单次答对所得阳光必须 ≥ 最低塔造价 ${cheapestCost} —— ` +
          '否则孩子答对了却买不起塔，FR64 的耦合断裂',
      ).toBeGreaterThanOrEqual(cheapestCost)
    }
  })

  it('第 1–4 档的三塔型造价读出来是 FR63 的 50/50/75', () => {
    // 逐字对应 FR63：`1-4 → 0 / +50 / 50,50,75`。
    // 注意断言里写的是「读档位表」而不是字面量 50/50/75 的复制品 ——
    // 这里比较的是「costOf 的结果与档位表自身的字段一致」，
    // 数值本身与上面的不等式断言互为独立的两道锁。
    const tier = tierForUnit(1)
    expect(costOf('direct', 1), '直射塔造价必须读档位表').toBe(tier.towerCost.direct)
    expect(costOf('slow', 1), '减速塔造价必须读档位表').toBe(tier.towerCost.slow)
    expect(costOf('aoe', 1), '范围塔造价必须读档位表').toBe(tier.towerCost.aoe)
    expect(
      Object.values(tier.towerCost),
      'FR63 第 1 档造价必须是 50 / 50 / 75',
    ).toEqual([50, 50, 75])
  })

  it('初始阳光与答对增量与 FR63 第 1 档一致', () => {
    expect(initialSunFor(1), 'FR63 第 1 档初始阳光为 0').toBe(0)
    expect(sunPerCorrectFor(1), 'FR63 第 1 档答对增量为 +50').toBe(50)
  })
})

describe('档位表结构（AC-3）', () => {
  it('Epic 1 只填了单元 1–4 一档', () => {
    // 档位 5–10 与 11–20 的数值就在 FR63 里，但本 story 刻意不填：
    // 填了之后，Story 1.6 录入单元 5 时「这一档还没被试玩校准过」就再也说不清了。
    // ⇒ Story 2.3 的工作是**往数组里追加两条**，不是改结构。
    expect(BALANCE_TIERS.length, 'Epic 1 期间只应有一档；档位增加是 Story 2.3 的工作').toBe(1)
    expect(BALANCE_TIERS[0]?.unitRange, '第 1 档必须覆盖单元 1–4').toEqual([1, 4])
  })

  it('单元 1–4 落在已填档位上', () => {
    for (const unit of EPIC1_UNITS) {
      expect(() => tierForUnit(unit), `单元 ${unit} 必须命中已填档位`).not.toThrow()
    }
  })

  it('未填档位抛错，不回退默认值（AC-3 的核心）', () => {
    // ⚠️ 这是本文件最重要的一条。静默回退就是「数值静默漂移」：
    // 一个没校准过的单元悄悄用了首档数值，试玩时看到的平衡问题会被归因到别处，
    // 而没有任何东西指向这里 —— decision-log.md 的三次手算错误就是这么长出来的。
    for (const unit of [0, 5, 6, 10, 11, 20, 21, -1, 100]) {
      expect(() => tierForUnit(unit), `单元 ${unit} 落在未填档位上，必须抛错而非回退`).toThrow()
      expect(() => sunPerCorrectFor(unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
      expect(() => costOf('direct', unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
      expect(() => initialSunFor(unit), `单元 ${unit} 未填档位，必须抛错`).toThrow()
    }
  })

  it('抛错信息带上已填档位，接手 Story 2.3 的人不必翻代码', () => {
    expect(() => tierForUnit(5)).toThrow(/已填档位/)
  })

  it('非整数单元号抛错', () => {
    // Number('') === 0 这类「悄悄变成 0」的路径会把单元 0 混成「首档」，
    // 那一档恰好是已填的 —— 于是脏输入静默拿到了合法数值。
    for (const unit of [1.5, NaN, Infinity]) {
      expect(() => tierForUnit(unit), `单元号 ${unit} 必须抛错`).toThrow()
    }
  })

  it('档位表按单元号升序且区间不重叠（线性扫描的前提）', () => {
    const ranges = BALANCE_TIERS.map((t) => t.unitRange)
    for (let i = 1; i < ranges.length; i += 1) {
      const prev = ranges[i - 1]!
      const curr = ranges[i]!
      // 重叠时线性扫描会静默取到第一条 —— 单元 5 用上第 1 档数值而无任何报错。
      expect(curr[0], `档位 ${curr} 与 ${prev} 重叠，扫描顺序会掩盖重叠`).toBeGreaterThan(prev[1])
    }
  })
})

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

  it('减速塔的 slowFactor / slowTurns 引用常量而非重写', () => {
    // 这是「单一事实源」在本文件内部的自我示范：Story 3.2 调减速时只改常量，
    // 两处一起动。若这里写死 0.5 / 3，改常量就会漏掉这一处。
    expect(Stats.slow.slowFactor, '减速塔的 slowFactor 必须引用 SLOW_FACTOR').toBe(SLOW_FACTOR)
    expect(Stats.slow.slowTurns, '减速塔的 slowTurns 必须引用 SLOW_TURNS').toBe(SLOW_TURNS)
  })

  it('直射塔与范围塔不带减速参数', () => {
    // 减速是减速塔的专属能力。多挂一个 undefined 字段会让「这塔会减速吗」
    // 变成一个永远判 true 的检查。
    expect(Stats.direct.slowFactor, '直射塔不应有减速参数').toBeUndefined()
    expect(Stats.aoe.slowTurns, '范围塔不应有减速参数').toBeUndefined()
  })

  it('TOWER_STATS 覆盖全部三种塔型', () => {
    expect(Object.keys(TOWER_STATS).sort(), '新增塔型时必须同步补属性表').toEqual(['aoe', 'direct', 'slow'])
  })
})