/**
 * 战斗数值 —— **单一事实源**（Story 1.4 / AC-3，架构 `:634`）。
 *
 * ⚠️ 塔伤害 / 射程 / 造价、僵尸血量 / 速度、阳光速率**全部**在本文件。
 * 组件与单元内容 JSON 都**不得**重复定义这些值 —— 两处各存一份，
 * 迟早一改一漏，而「一改一漏」正是 `decision-log.md` 里三次手算错误的同一个根因，
 * 只是换了个位置（架构 `:649` 记的就是这件事）。
 *
 * Story 3.2 / 3.6 调数值时会反复引用本文件那句纪律。它不是客套话。
 *
 * 形态：档位表（tier 数组），不是散落的常量。理由见 BALANCE_TIERS 的注释。
 */

import type { Tower, TowerType } from './types.js'

// ── 档位表（AC-3）────────────────────────────────────────────────────────

/**
 * 一档经济参数。
 *
 * 字段名与 `gdd.md` 经济表（FR63）的列名一一对应，读表即对得上 —— 这是本 story
 * 自主设计的九条里唯一被显式要求的取舍（Dev Notes §5）。架构全文没有 `Tier` 类型定义，
 * 所以字段名由本 story 定死；**改名的代价是要重写全部三档**。
 */
export interface BalanceTier {
  /** 覆盖的单元号，闭区间。单元 → 档位靠线性扫描，不用算术分区间（Dev Notes §5）。 */
  readonly unitRange: readonly [number, number]
  /** 开局阳光。 */
  readonly initialSun: number
  /** 答对一题所得阳光增量。 */
  readonly sunPerCorrect: number
  /** 三塔型造价，单位与 initialSun / sunPerCorrect 相同（阳光）。 */
  readonly towerCost: Readonly<Record<TowerType, number>>
}

/**
 * 档位表。
 *
 * **三档全填**（Story 2.3 落地），逐字对应 FR63 与 GDD §Economy Across Levels：
 * | 单元 | 初始阳光 | 答对增量 | 直射/减速/范围造价 | 比例 |
 * |---|---|---|---|---|
 * | 1–4  | 0  | +50  | 50 / 50 / 75  | 1 : 1 |
 * | 5–10 | 50 | +75  | 75 / 75 / 110 | 1 : 1 |
 * | 11–20| 100| +100 | 100 / 100 / 150| 1 : 1 |
 *
 * 比例恒为 1:1 的含义：**单次答对所得阳光恰好等于最低塔造价**（FR64 的等号取法）。
 * 「恰好」不是巧合 —— 比例取等时，**答对增量本身**恰好够买一座塔。
 *
 * ⚠️ **「跨档位的失败门槛不动」这句只在档位 1-2 成立**（Story 2.3 实测，真实 reducer）：
 *   比例之外还有**初始阳光**这一项。档位 3 的 `initialSun = 100` **恰好等于**它的塔造价 100，
 *   于是「初始 100 + 第一次答对 +100 = 200」够买 **2** 座塔；
 *   档位 1（0 + 50）与档位 2（50 + 75）都只够买 1 座。
 *   ⇒ 档位 3 的失败门槛夹在 **4 与 5 之间**，比档位 1-2（夹在 3 与 4 之间）**宽一问**。
 *   ⚠️ 宽 = **更宽容**，不是更难 ⇒「阳光递增不承载难度递增」这一推论**实质上仍成立**，
 *     但「门槛不动」这句**逐字不成立**。
 *   ⇒ 守卫：`tests/core/balance.test.ts` 的 G226（比例）/ G227（边界），
 *     `tests/scripts/balance-sim.test.ts` 的 G231（门槛曲线）/ G232（首次答对塔数）。
 *   ⇒ 「档位 3 要不要与前两档对齐门槛」是**产品裁决**，本 story 不擅自改数值
 *     （FR63 的值已由用户拍板）⇒ 已登记 `deferred-work.md` 的 DF-138。
 *   ⚠️ 这条结论的**旧**证据（出自有 `dict[col]` 覆盖 bug 的 Python 模拟器）已作废，
 *     现以 Story 2.3 的实测为准 —— 见 GDD §Economy Across Levels。
 *
 * ⚠️ **`towerCost` 必须三塔型逐个填**（[CR] P30）：旧 JSDoc 写「造价是档位的，不是塔型的」，
 *   与实现 `towerCost[towerType]` 当场矛盾（同档内 direct 50 / aoe 75 就是按塔型区分的）。
 *   只填一个数会把三塔型造价**静默压平**。
 *
 * ⚠️ 逐层 `Object.freeze`（[CR] P16）：类型层的 `readonly` 防不住运行期的 `as` 强转
 * ——「单一事实源」必须在运行期也不可改写，否则任何代码都能无痕篡改平衡数值，
 * 而全部平衡断言仍然绿。冻结状态由 balance.test.ts 的 **G224**（逐档断言）锁死。
 */
export const BALANCE_TIERS: readonly BalanceTier[] = Object.freeze([
  Object.freeze({
    unitRange: Object.freeze([1, 4] as const),
    initialSun: 0,
    sunPerCorrect: 50,
    towerCost: Object.freeze({ direct: 50, slow: 50, aoe: 75 }),
  }),
  Object.freeze({
    unitRange: Object.freeze([5, 10] as const),
    initialSun: 50,
    sunPerCorrect: 75,
    towerCost: Object.freeze({ direct: 75, slow: 75, aoe: 110 }),
  }),
  Object.freeze({
    unitRange: Object.freeze([11, 20] as const),
    initialSun: 100,
    sunPerCorrect: 100,
    towerCost: Object.freeze({ direct: 100, slow: 100, aoe: 150 }),
  }),
])

/**
 * 档位表的结构校验（[CR] P22）：空表、倒置区间、重叠区间**一律抛错**。
 *
 * 为什么每次查询都校验而不是模块加载时校验一次：3 档的表校验成本可忽略，
 * 而收益是**追加畸形档位时大声失败**，而不是「线性扫描静默取第一条命中」
 * 把重叠掩盖掉 —— 那正是数值静默漂移的最短路径。
 *
 * 旧版测试里「升序且不重叠」的守卫在表只有一条时循环体零次执行（空转守卫，
 * 当下不可能失败）；本函数把该性质变成运行期强制，测试可以用合成多档 fixture 驱动它。
 */
function assertTierTable(tiers: readonly BalanceTier[]): void {
  if (tiers.length === 0) {
    throw new Error('档位表不能为空 —— 任何单元都将无处取值')
  }
  for (const [i, a] of tiers.entries()) {
    const [fromA, toA] = a.unitRange
    if (fromA > toA) {
      throw new Error(`档位 ${i} 的区间倒置：[${fromA}, ${toA}]，from 必须 <= to`)
    }
    for (const [j, b] of tiers.entries()) {
      if (j <= i) {
        continue
      }
      const [fromB, toB] = b.unitRange
      if (fromA <= toB && fromB <= toA) {
        throw new Error(
          `档位 ${i} [${fromA},${toA}] 与档位 ${j} [${fromB},${toB}] 重叠 —— ` +
            '线性扫描会静默取先命中的一条，重叠必须大声失败',
        )
      }
    }
  }
}

/**
 * 取单元所属档位。
 *
 * ⚠️ **命中未填档位时抛错，不返回 undefined、不回退默认值**（AC-3）。
 * 静默回退就是「数值静默漂移」：一个没校准过的单元悄悄用了首档数值，
 * 试玩时看到的平衡问题会被归因到别处，而没有任何东西指向这里。
 *
 * 线性扫描而非算术分区间：只有 3 档，扫描更易读；将来加档位也不用改算法
 * （Dev Notes §5 的取舍）。
 *
 * @param tiers 仅供测试用合成 fixture 驱动 `assertTierTable`（[CR] P22）；
 *              生产调用一律走默认的 `BALANCE_TIERS`。
 */
export function tierForUnit(unitNumber: number, tiers: readonly BalanceTier[] = BALANCE_TIERS): BalanceTier {
  if (!Number.isInteger(unitNumber)) {
    throw new Error(`单元号必须是整数，收到 ${unitNumber}`)
  }
  assertTierTable(tiers)
  for (const tier of tiers) {
    const [from, to] = tier.unitRange
    if (unitNumber >= from && unitNumber <= to) {
      return tier
    }
  }
  // 抛错信息里带上「已填哪些档位」—— 接手的人不必翻代码就知道要补哪条。
  // ⚠️ **不写死任何区间，也不指向某个 story**（Story 2.3 / G230）：
  //   这段文案旧版写着「档位 5-10 与 11-20 的数值见 FR63，由 Story 2.3 追加。」——
  //   那个 story 做完之后，这句话会**每天都**出现在单元 21+ 的报错里，
  //   指向一个已经做完的事 ⇒ 一句会误导下一个人去找已完成工作的活注释。
  //   区间由实际档位表推导 ⇒ 表变了文案自动跟着变，永远不会过期。
  const filled = tiers.map((t) => `${t.unitRange[0]}-${t.unitRange[1]}`).join('、')
  throw new Error(
    `单元 ${unitNumber} 落在未填档位上。已填档位：${filled}。` +
      '未填档位不回退默认值（AC-3）—— 回退即静默漂移。' +
      '未覆盖的单元区间见 FR63。',
  )
}

/** 单元开局阳光。 */
export function initialSunFor(unitNumber: number): number {
  return tierForUnit(unitNumber).initialSun
}

/** 单元单次答对所得阳光。断言 5（AR25）断言的就是「它 ≥ 最低塔造价」。 */
export function sunPerCorrectFor(unitNumber: number): number {
  return tierForUnit(unitNumber).sunPerCorrect
}

/**
 * 某塔型在某单元的造价 —— 由**档位 × 塔型**共同决定（FR63 的三档三组数字）。
 *
 * ⚠️ [CR] P30：旧 JSDoc 写「造价是档位的，不是塔型的」，与实现 `towerCost[towerType]`
 * 当场矛盾（同档内 direct 50 / aoe 75 就是按塔型区分的）。**追加档位时**
 * 若照旧注释只填一个数，三塔型造价会被静默压平。
 */
export function costOf(towerType: TowerType, unitNumber: number): number {
  assertTowerType(towerType)
  return tierForUnit(unitNumber).towerCost[towerType]
}

// ── 战斗常量（架构 `:634`：塔伤害/射程、僵尸血量/速度）────────────────────

/** 僵尸满血。架构不变量「僵尸血量 ∈ [0, 100]」的上界就是它。 */
export const ZOMBIE_HP = 100
/** 僵尸每回合前进格数（未减速）。 */
export const ZOMBIE_MOVE_PER_ROUND = 2
/** 减速幅度 50%：减速期间每回合 `2 × (1 - 0.5) = 1` 格。 */
export const SLOW_FACTOR = 0.5
/** 减速持续回合数（AR27）。被同塔重复命中**刷新**为这个值，不是累加。 */
export const SLOW_TURNS = 3
/** 起始心数。 */
export const HEARTS = 3

/** 单塔型的战斗属性。字段名与 `gdd.md` 塔型表的列一一对应。 */
export interface TowerStats {
  /** 每回合伤害。 */
  readonly damage: number
  /**
   * 射程（格），**单向**：只覆盖塔右侧 `range` 格。
   *
   * ⚠️ 这是**伤害判定的**射程，不是 UI 画的形状（AC-4.1 / AC-4.2）。
   * 范围塔的伤害覆盖另由 `combat.ts` 的 `aoeColumns()` 给出，恒为同行 3 格，
   * **不由本字段驱动** —— 本字段对它只保留 GDD 塔型表里的语义值（2 格）。
   */
  readonly range: number
}

/**
 * 塔型的**运行期白名单**（[CR] P4）。
 *
 * `TowerType` 联合类型在编译期就被擦除 —— 存档 / 内容 JSON 里的脏值
 * （拼错的 `'driect'`）在运行期畅通无阻：`costOf()` 会静默取到 `undefined`
 * 让阳光扣减传播 NaN，`damageOf()` 会抛不受控的 TypeError。两者都违反
 * AC-7「只 throw、不静默」。所以字面量联合需要一份运行期镜像，
 * 这里是**唯一**写出三个字符串字面量的地方，键集合与 `TOWER_STATS` 的一致性有测试锁死。
 */
export const TOWER_TYPES: readonly TowerType[] = Object.freeze(['direct', 'slow', 'aoe'])

/** 塔型合法性校验：脏塔型一律抛错（AC-7）。 */
export function assertTowerType(towerType: TowerType): void {
  if (!TOWER_TYPES.includes(towerType)) {
    throw new Error(
      `未知塔型 ${JSON.stringify(towerType)}，合法值：${TOWER_TYPES.join(' / ')}。` +
        '塔型只可能来自存档或内容 JSON 的脏值 —— 静默放行会让造价变 undefined、伤害查表炸在远处。',
    )
  }
}

/**
 * 三塔型属性。逐字对应 `gdd.md:226` 的塔型表。
 *
 * ⚠️ [CR] D2（2026-10-13 用户裁决）：`slow` 条目里原有的 `slowFactor` / `slowTurns`
 * 字段**已删除** —— `stepZombie` 只读全局 `SLOW_FACTOR`、`applySlow` 只认全局
 * `SLOW_TURNS`，表内字段没有任何运行期消费者，是死数据。两处并存等于双事实源：
 * Story 3.2 按「单一事实源」注释只改表 → 行为零变化，恰好复刻本文件头布道的
 * 「一改一漏」。**减速数值的单一事实源是上方的 `SLOW_FACTOR` / `SLOW_TURNS` 常量。**
 *
 * ⚠️ `aoe.range = 2` 取自 GDD 塔型表「射程（格）」列，**与实际伤害覆盖无关**。
 * 范围塔的伤害判定是固定的同行 3 格（架构决策 1），改动它属架构变更，
 * 不属数值调优 —— 理由见 `aoeColumns()` 的注释。
 *
 * 逐层 `Object.freeze`：与 `BALANCE_TIERS` 同理（[CR] P16）。
 */
export const TOWER_STATS: Readonly<Record<TowerType, TowerStats>> = Object.freeze({
  direct: Object.freeze({ damage: 50, range: 3 }),
  slow: Object.freeze({ damage: 25, range: 3 }),
  aoe: Object.freeze({ damage: 60, range: 2 }),
})

/** 某塔型的伤害值。 */
export function damageOf(towerType: TowerType): number {
  assertTowerType(towerType)
  return TOWER_STATS[towerType].damage
}

/** 某塔型的射程。 */
export function rangeOf(towerType: TowerType): number {
  assertTowerType(towerType)
  return TOWER_STATS[towerType].range
}

/**
 * 塔的伤害 —— **AC-8 的机器守卫落点**。
 *
 * 为什么多这一层而不让调用方直接 `TOWER_STATS[tower.towerType].damage`：
 * 「战斗数值只读 towerType，永不读 wordId」是架构自认**无工具可强制**的 4 条之一
 * （`game-architecture.md:1018-1027`）。散落的 `TOWER_STATS[...]` 取法有无数处，
 * 任何一处改成读 `wordId` 都不会触发任何检查 —— 而「塔的显示名影响伤害」这种 bug
 * 在界面上完全看不出来（同一座塔换个词就打得更疼）。
 *
 * 收成单一函数后，「读 wordId」只可能发生在这一个地方，而这里有测试盯着。
 *
 * @param tower 只读 `towerType`；`wordId` / `row` / `col` **一律不参与**返回值。
 */
export function damageFor(tower: Tower): number {
  return damageOf(tower.towerType)
}

/** 塔的射程。AC-8 的守卫落点，与 {@link damageFor} 同理。 */
export function rangeFor(tower: Tower): number {
  return rangeOf(tower.towerType)
}
