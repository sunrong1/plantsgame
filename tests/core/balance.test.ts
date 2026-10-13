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
 * ⚠️ [CR] P15 口径（旧头注释自称「本文件不出现写死的 50」，与正文当场矛盾）：
 * **AR25 不等式主断言**不写死任何数值、全部经档位表读取 —— Story 2.3 追加
 * 第二、第三档时同一条断言直接在三档上复用；而 **FR63 核对用例**（「造价读出来是
 * 50/50/75」那几条）**有意**钉死字面量，作为独立于档位表的第二道锁 ——
 * 改表必红，红了就是「数值变了」的显式信号。两类断言分工不同，别混为一谈。
 */
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
    // 前三条比较的是「costOf 的结果与档位表自身的字段一致」（读表口径）；
    // 后三条是**有意钉死的 FR63 字面量**（第二道锁，见文件头 [CR] P15 口径）。
    // ⚠️ [CR] P21：旧写法 `Object.values(tier.towerCost)` 隐式依赖对象字面量的
    // 插入顺序 —— 对表做无害重排就触发假红。改逐键断言，与顺序彻底解耦。
    const tier = tierForUnit(1)
    expect(costOf('direct', 1), '直射塔造价必须读档位表').toBe(tier.towerCost.direct)
    expect(costOf('slow', 1), '减速塔造价必须读档位表').toBe(tier.towerCost.slow)
    expect(costOf('aoe', 1), '范围塔造价必须读档位表').toBe(tier.towerCost.aoe)
    expect(tier.towerCost.direct, 'FR63 第 1 档直射塔造价 50').toBe(50)
    expect(tier.towerCost.slow, 'FR63 第 1 档减速塔造价 50').toBe(50)
    expect(tier.towerCost.aoe, 'FR63 第 1 档范围塔造价 75 —— 贵是范围塔「严格劣于」的第二层').toBe(75)
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
    // [CR] P10：补上 AC-11 要求的中文失败原因（旧写法漏了）。
    expect(
      () => tierForUnit(5),
      '抛错信息必须列出已填档位 —— 接手 Story 2.3 的人不必翻代码就知道要补哪条',
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
    const tier = (from: number, to: number): BalanceTier => ({
      unitRange: [from, to],
      initialSun: 0,
      sunPerCorrect: 50,
      towerCost: { direct: 50, slow: 50, aoe: 75 },
    })

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

  it('档位表与属性表在运行期被逐层冻结（[CR] P16）', () => {
    // 类型层的 readonly 防不住 `as` 强转（本仓库的测试自己就在示范 `as Zombie`）——
    // 「单一事实源」必须运行期不可改写，否则任何代码都能无痕篡改平衡数值而全部断言仍绿。
    expect(Object.isFrozen(BALANCE_TIERS), 'BALANCE_TIERS 数组必须冻结').toBe(true)
    expect(Object.isFrozen(BALANCE_TIERS[0]), '每一档对象必须冻结').toBe(true)
    expect(Object.isFrozen(BALANCE_TIERS[0]?.towerCost), '造价子对象必须冻结').toBe(true)
    expect(Object.isFrozen(TOWER_STATS), 'TOWER_STATS 必须冻结').toBe(true)
    for (const type of ALL_TOWER_TYPES) {
      expect(Object.isFrozen(TOWER_STATS[type]), `${type} 的属性条目必须冻结`).toBe(true)
    }
    expect(Object.isFrozen(TOWER_TYPES), 'TOWER_TYPES 白名单必须冻结').toBe(true)
  })
})
