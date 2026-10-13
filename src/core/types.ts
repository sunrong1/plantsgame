/**
 * 战斗层实体类型（Story 1.4）。
 *
 * ⚠️ 本文件**不含** `State` / `Action` —— 那属 Story 1.5。
 * 这里只定义战斗层实体：塔型、塔、僵尸，以及它们的工厂函数与不变量校验。
 *
 * 形态：纯类型 + 纯函数，零 DOM、零 Vue（tsconfig.core.json 的 lib 不含 DOM）。
 */

// ⚠️ ZOMBIE_HP 从 balance.ts 取（战斗数值的单一事实源，架构 `:634`）。
// balance.ts 反过来 import 本文件的 TowerType —— 那是 `import type`，
// 被 verbatimModuleSyntax 在编译期擦除，所以两者之间**不存在运行期循环**。
import { SLOW_TURNS, ZOMBIE_HP } from './balance.js'
import { assertInsideGrid } from './grid.js'

/**
 * 塔的战斗类型（架构模式 C 逐字锚点）。
 *
 * 用**字符串字面量联合**而非 TS `enum`：
 *   · 架构模式 C 的写法就是字面量联合，改成 enum 等于偏离锚点；
 *   · `verbatimModuleSyntax` 下 enum 是值导出，会给 core/ 添一个运行期对象，
 *     而战斗规则不需要它；
 *   · 本项目脚本用 `tsx` 跑，不依赖原生类型擦除，也就不该顺手引入 enum 的约束。
 */
export type TowerType = 'direct' | 'slow' | 'aoe'

/**
 * 塔 —— 架构模式 C。
 *
 * 硬规则（AC-8）：战斗数值只能读 `towerType`，**永远不读 `wordId`**。
 * `wordId` 只用于显示名与词图。
 *
 * ⚠️ `row` / `col` 是**本 story 对架构模式 C 的一处扩展**：架构 `:876-881` 的
 * `Tower` 只有 `id` / `towerType` / `wordId`，没有位置字段。但射程判定必须有塔的列号
 * —— 僵尸恒在 `ZOMBIE_ROW`，塔却可以种在任意行（GDD「只有一行有僵尸，
 * 但塔可以种在任意空格」）。留档以免 `[CR]` 误判为偏离架构。
 */
export interface Tower {
  /** 稳定唯一标识。目标选择的同列 tie-break 依赖它可比较（AC-4.3）。 */
  readonly id: string
  readonly towerType: TowerType
  readonly wordId: string
  readonly row: number
  readonly col: number
}

/**
 * 僵尸。
 *
 * ⚠️ **刻意没有 `row` 字段。** 僵尸恒在 `ZOMBIE_ROW`（架构不变量清单），
 * 把这个恒真值写进类型等于开放给调用方改写 —— 只要有人构造出 `row: 3`，
 * 类型系统拦不住，僵尸就永远走不到塔的射程里。
 * 行不变量不是靠断言守住的，是靠**类型里根本没有这个字段**守住的。
 *
 * 同理没有第二个维度，位置字段叫 `col` 而不是 `x`。
 */
export interface Zombie {
  readonly id: string
  /** 0-based 列索引。僵尸单向递减（结算顺序见 combat.ts 文件头）。 */
  readonly col: number
  readonly hp: number
  /** 减速剩余回合数，≥ 0 且 ≤ SLOW_TURNS。0 = 未减速。 */
  readonly slowTurnsLeft: number
}

/** `createTower()` 的入参。位置必填 —— 建造位置永远是显式的，没有合理的默认值。 */
export interface CreateTowerInput {
  readonly id: string
  readonly towerType: TowerType
  readonly wordId: string
  readonly row: number
  readonly col: number
}

/** `createZombie()` 的入参。⚠️ 没有 `row` —— 见上面 `Zombie` 的注释。 */
export interface CreateZombieInput {
  readonly id: string
  readonly col: number
  readonly hp: number
  /** 默认 0。> SLOW_TURNS 直接抛错（见函数注释）。 */
  readonly slowTurnsLeft?: number
}

/**
 * 建塔（AR11：工厂函数返回普通对象字面量，场上 ≤ 10 个实体，无需对象池）。
 *
 * 工厂是**唯一**能强制「塔落在合法格子里」的位置：`Tower` 字段全是 `readonly`，
 * 裸对象字面量绕过校验后无法纠错 —— 越界的塔会静默地永远打不到僵尸。
 */
export function createTower(input: CreateTowerInput): Tower {
  assertNonEmptyId(input.id)
  assertNonEmptyId(input.wordId)
  assertInsideGrid(input.row, input.col)
  return {
    id: input.id,
    towerType: input.towerType,
    wordId: input.wordId,
    row: input.row,
    col: input.col,
  }
}

/**
 * 建僵尸（AR11）。
 *
 * ⚠️ 入参里没有 row，返回值里也没有 —— 这是「僵尸恒在 `ZOMBIE_ROW`」的强制方式。
 *
 * `slowTurnsLeft` 的上限校验放在这里，与 combat.ts 的 `applySlow` 同一口径：
 * 减速恒为 `SLOW_TURNS` 回合（AR27），一个 > SLOW_TURNS 的值只可能来自
 * 「把刷新写成了累加」的实现错误 —— 那正是本 story 要抓的变异之一。
 */
export function createZombie(input: CreateZombieInput): Zombie {
  assertNonEmptyId(input.id)
  assertZombieCol(input.col)
  assertZombieHp(input.hp)
  const slowTurnsLeft = input.slowTurnsLeft ?? 0
  assertSlowTurns(slowTurnsLeft)
  return { id: input.id, col: input.col, hp: input.hp, slowTurnsLeft }
}

// ── 不变量校验（架构「必须断言的不变量」清单里落在本 story 的那几条）────────

/**
 * 僵尸血量必须落在 `[0, ZOMBIE_HP]`（架构不变量清单逐字）。
 *
 * 上界从 `balance.ts` 读而非在 types.ts 里另写一个 100 ——
 * 战斗数值的单一事实源在 balance.ts（架构 `:634`），两处各写一份迟早一改一漏，
 * 而「血量上界」恰好是会被 Story 3.2 调到 150 的那种值。
 */
export function assertZombieHp(hp: number): void {
  if (!Number.isInteger(hp) || hp < 0 || hp > ZOMBIE_HP) {
    throw new Error(`僵尸血量必须落在 [0, ${ZOMBIE_HP}]，收到 ${hp}`)
  }
}

/**
 * 僵尸列号必须是整数。
 *
 * ⚠️ **刻意不设上下界**：僵尸必须能走到房子**之外**（col < 0），
 * `hasReachedHouse` 判的就是负列号；上界由 grid.ts 的 `ZOMBIE_SPAWN_COL` 管，
 * 战斗层不重复那个口径。
 */
export function assertZombieCol(col: number): void {
  if (!Number.isInteger(col)) {
    throw new Error(`僵尸列号必须是整数，收到 ${col}`)
  }
}

/** 减速剩余回合数：必须是 `[0, SLOW_TURNS]` 区间内的整数。恒等式由 applySlow 负责建立。 */
export function assertSlowTurns(turns: number): void {
  if (!Number.isInteger(turns) || turns < 0 || turns > SLOW_TURNS) {
    throw new Error(`slowTurnsLeft 必须落在 [0, ${SLOW_TURNS}]，收到 ${turns}（减速是刷新而非叠加）`)
  }
}

/** 实体 id 不能为空 —— 目标选择的同列 tie-break 依赖 id 可比较（AC-4.3）。 */
export function assertNonEmptyId(id: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`实体 id 不能为空，收到 ${JSON.stringify(id)}`)
  }
}

/** 网格坐标必须是整数。grid.ts 的边界校验以它为前置。 */
export function assertGridIndex(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数，收到 ${value}`)
  }
}