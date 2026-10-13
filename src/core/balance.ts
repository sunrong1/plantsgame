/**
 * 战斗数值 —— **单一事实源**（Story 1.4 / AC-3，架构 `:634`）。
 *
 * ⚠️ 塔伤害 / 射程 / 造价、僵尸血量 / 速度、阳光速率**全部**在本文件。
 * 组件与单元内容 JSON 都**不得**重复定义这些值 —— 两处各存一份，
 * 迟早一改一漏，而「一改一漏」正是 `decision-log.md` 里三次手算错误的同一个根因，
 * 只是换了个位置（架构 `:649` 记的就是这件事）。
 *
 * Story 2.3 / 3.2 / 3.6 会反复引用本文件那句纪律。它不是客套话。
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
 * 所以字段名由本 story 定死；改名的代价是 Story 2.3 要重写全部三档。
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
 * **Epic 1 只填单元 1–4 一档**，逐字对应 FR63：
 * `1-4 → 0 / +50 / 50,50,75`。
 * 档位 5–10（`50 / +75 / 75,75,110`）与 11–20（`100 / +100 / 100,100,150`）
 * **留空** —— 值就写在 FR63 里，但本 story 不填。
 *
 * 为什么填了反而有害：`tierForUnit()` 对未填档位必须抛错（AC-3），
 * 一旦现在把三档都填上，Story 1.6 录入单元 5 的内容时，
 * 「这一档的数值还没被试玩校准过」这件事就再也说不清了。
 * 留空 ⇒ 抛错 ⇒ 在 Story 2.3 真正落地该档时才需要填。
 *
 * ⇒ **Story 2.3 是往这个数组里追加两条，不是改结构。**
 */
export const BALANCE_TIERS: readonly BalanceTier[] = [
  {
    unitRange: [1, 4],
    initialSun: 0,
    sunPerCorrect: 50,
    towerCost: { direct: 50, slow: 50, aoe: 75 },
  },
]

/**
 * 取单元所属档位。
 *
 * ⚠️ **命中未填档位时抛错，不返回 undefined、不回退默认值**（AC-3）。
 * 静默回退就是「数值静默漂移」：一个没校准过的单元悄悄用了首档数值，
 * 试玩时看到的平衡问题会被归因到别处，而没有任何东西指向这里。
 *
 * 线性扫描而非算术分区间：只有 3 档，扫描更易读；将来加档位也不用改算法
 * （Dev Notes §5 的取舍）。
 */
export function tierForUnit(unitNumber: number): BalanceTier {
  if (!Number.isInteger(unitNumber)) {
    throw new Error(`单元号必须是整数，收到 ${unitNumber}`)
  }
  for (const tier of BALANCE_TIERS) {
    const [from, to] = tier.unitRange
    if (unitNumber >= from && unitNumber <= to) {
      return tier
    }
  }
  // 抛错信息里带上「已填哪些档位」—— 接手 Story 2.3 的人不必翻代码就知道要补哪条。
  const filled = BALANCE_TIERS.map((t) => `${t.unitRange[0]}-${t.unitRange[1]}`).join('、')
  throw new Error(
    `单元 ${unitNumber} 落在未填档位上。已填档位：${filled}。` +
      '未填档位不回退默认值（AC-3）—— 回退即静默漂移。' +
      '档位 5-10 与 11-20 的数值见 FR63，由 Story 2.3 追加。',
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

/** 某塔型在某单元的造价。造价是**档位**的，不是塔型的 —— FR63 的三档三组数字。 */
export function costOf(towerType: TowerType, unitNumber: number): number {
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
  /** 仅减速塔有：减速幅度。 */
  readonly slowFactor?: number
  /** 仅减速塔有：减速持续回合数。 */
  readonly slowTurns?: number
}

/**
 * 三塔型属性。逐字对应 `gdd.md:226` 的塔型表。
 *
 * ⚠️ `slow` 条目里的 `SLOW_FACTOR` / `SLOW_TURNS` 引用本文件上方的常量，
 * 而不是重写一遍 0.5 与 3 —— 这是「单一事实源」在本文件内部的自我示范。
 * Story 3.2 调减速时只改常量，两处一起动。
 *
 * ⚠️ `aoe.range = 2` 取自 GDD 塔型表「射程（格）」列，**与实际伤害覆盖无关**。
 * 范围塔的伤害判定是固定的同行 3 格（架构决策 1），改动它属架构变更，
 * 不属数值调优 —— 理由见 `aoeColumns()` 的注释。
 */
export const TOWER_STATS: Readonly<Record<TowerType, TowerStats>> = {
  direct: { damage: 50, range: 3 },
  slow: { damage: 25, range: 3, slowFactor: SLOW_FACTOR, slowTurns: SLOW_TURNS },
  aoe: { damage: 60, range: 2 },
}

/** 某塔型的伤害值。 */
export function damageOf(towerType: TowerType): number {
  return TOWER_STATS[towerType].damage
}

/** 某塔型的射程。 */
export function rangeOf(towerType: TowerType): number {
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