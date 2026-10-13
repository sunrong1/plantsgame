/**
 * 战斗单步原语（Story 1.4 / AC-4）。
 *
 * ── 结算顺序（AC-4.4，Dev Notes §6，与 Story 1.5 的 `turn.ts` 同源）────────
 * ```
 * 1. 攻击阶段：判定射程 → 选目标 → 结算伤害 → 减速塔「置位」slowTurnsLeft = 3
 * 2. 移动阶段：按**攻击后**的 slowTurnsLeft 决定移动格数（2 或 1）
 * ```
 * 顺序不是随意的：先移动后攻击在减速塔上**差一次命中**（实跑 2 次 vs 3 次）。
 * 「攻击在前」是 `epics.md:838` 的字面顺序。
 *
 * 本文件只提供**单步原语**（射程判定 / 选目标 / 结算伤害 / 减速 / 单步移动），
 * 整回合的编排属 Story 1.5 的 `turn.ts` —— 刻意**不**提供 `simulateRound()`：
 * 提前建会导致回合层被写两次。
 *
 * ── 硬规则（AC-8）────────────────────────────────────────────────────────
 * 战斗数值只读 `towerType`，**永远不读 `wordId`**。同一 towerType 的两座塔
 * （无论绑定什么词）计算结果必须完全相同。
 *
 * 零 DOM、零 Vue。失败一律抛（架构 `:568`：逻辑层只 throw，不 catch）。
 */

import { SLOW_FACTOR, SLOW_TURNS, ZOMBIE_MOVE_PER_ROUND } from './balance.js'
import { COLS } from './grid.js'
import {
  assertGridIndex,
  assertSlowTurns,
  assertZombieCol,
  assertZombieHp,
  type TowerType,
  type Zombie,
} from './types.js'

/**
 * 射程判定 —— **单向**（AC-4.2）。
 *
 * 充要条件：`0 < targetCol - towerCol <= range`。
 *
 * 下界 `0` 的那一半不是冗余：去掉它，僵尸从塔的**左侧**经过时也会挨打 ——
 * 而射程本该只覆盖塔右侧那几格（僵尸只从右侧接近，GDD 逐字）。
 * 上界 `<= range` 同样不可去：去掉后射程变成无限，窗口内每一回合都命中。
 */
export function inRange(towerCol: number, targetCol: number, range: number): boolean {
  assertGridIndex(towerCol, 'towerCol')
  assertGridIndex(targetCol, 'targetCol')
  if (!Number.isInteger(range) || range < 0) {
    throw new Error(`射程必须是非负整数，收到 ${range}`)
  }
  const delta = targetCol - towerCol
  return delta > 0 && delta <= range
}

/**
 * 范围塔的伤害覆盖 —— **以塔所在列为中心的横向 3 格条带**（AC-4.1 / 架构决策 1）。
 *
 * ⚠️ **不是半径 2 的圆。** 圆形在同一条行上横跨 5 格，`60 × 5 = 300` 伤害，
 * 而造价只比直射塔贵 25 —— 造价形同虚设，GDD「后期清场，贵」的定位当场失效。
 *
 * ⚠️ **不做行判定。** 僵尸恒在 `ZOMBIE_ROW`，所以上下相邻行的塔不参与判定 ——
 * 不得因为「圆形」或「有行差」让它们也加入判定。
 *
 * 📎 与 UI 预览是两套形状，**不要混用**：
 * | 用途 | 形状 | 谁画 |
 * |---|---|---|
 * | 伤害判定（本函数） | 横向 3 格条带 | combat.ts |
 * | 放置预览 | 半径 3 的圆（含斜向） | Story 1.12 |
 * AR43 / FR32 要画的是**预览**形状。本函数绝不返回圆形覆盖。
 *
 * 返回列号升序，并裁剪到网格内：塔建在 col 0 时 `t - 1` 是 -1，
 * 那里不是格子，返回它会让「覆盖范围」里凭空多出一个格子。
 */
export function aoeColumns(towerCol: number): readonly number[] {
  assertGridIndex(towerCol, 'towerCol')
  const columns: number[] = []
  for (let col = towerCol - 1; col <= towerCol + 1; col += 1) {
    if (col >= 0 && col < COLS) {
      columns.push(col)
    }
  }
  return columns
}

/**
 * 范围塔专用：某列是否在覆盖内。
 *
 * 与 `inRange()` 刻意**不共用**判据：这里既没有单向约束，也没有 `range` 上界 ——
 * 覆盖是以塔为中心的对称条带（架构决策 1），而直射 / 减速塔的射程是单向窗口。
 * 复用 `inRange()` 会让范围塔漏打塔左侧 1 格。
 */
export function isInAoe(towerCol: number, targetCol: number): boolean {
  assertGridIndex(targetCol, 'targetCol')
  return aoeColumns(towerCol).includes(targetCol)
}

/**
 * 选目标 —— 列号最小者优先，同列取 `id` 字典序最小者（AC-4.3）。
 *
 * 列号最小 = 最靠近房子（GDD「塔永远打最危险的那个」）。
 *
 * ⚠️ tie-break 这半条**不是 GDD 原文**，是本 story 补齐的隐含约束：
 * GDD 与架构都只说了「最靠近房子的」，没说并列怎么办。而纯函数性（AR6 / AR17）
 * 要求结果完全确定 —— 平衡模拟与存档重放都靠这一点。
 * 一旦规则放宽到「同列多只僵尸」，没有 tie-break 的选目标函数立刻不可复现。
 *
 * 射程内无存活僵尸返回 null —— 本回合不攻击。
 *
 * 已死僵尸（`hp <= 0`）一律跳过：它还在数组里只是因为调用方还没清理，
 * 让它被选中会让塔「打空气」并白耗这一回合。
 */
export function selectTarget(
  zombies: readonly Zombie[],
  towerCol: number,
  towerType: TowerType,
  range: number,
): Zombie | null {
  assertGridIndex(towerCol, 'towerCol')
  // 范围塔的覆盖只算一次，不对每只僵尸重算 aoeColumns。
  const covered = towerType === 'aoe' ? aoeColumns(towerCol) : null

  let best: Zombie | null = null
  for (const zombie of zombies) {
    if (zombie.hp <= 0) {
      continue
    }
    const isCovered = covered === null ? inRange(towerCol, zombie.col, range) : covered.includes(zombie.col)
    if (!isCovered) {
      continue
    }
    if (best === null || zombie.col < best.col || (zombie.col === best.col && zombie.id < best.id)) {
      best = zombie
    }
  }
  return best
}

/**
 * 结算伤害（纯函数，返回**新对象**，不就地改入参 —— AR11 / 纯函数性）。
 *
 * 血量下探到 0 即停，不为负：僵尸被消灭是「hp = 0」这个状态，不是「hp = -20」。
 *
 * ⚠️ 校验写在**纯逻辑层**，不在组件层（架构 `:572`）：纯函数里的廉价断言
 * 天然覆盖所有调用路径；放在组件里则每个组件都要重复一遍，且必然有组件漏掉。
 */
export function applyDamage(zombie: Zombie, dmg: number): Zombie {
  assertZombieCol(zombie.col)
  assertZombieHp(zombie.hp)
  assertSlowTurns(zombie.slowTurnsLeft)
  if (!Number.isInteger(dmg) || dmg < 0) {
    throw new Error(`伤害必须是非负整数，收到 ${dmg}`)
  }
  const hp = Math.max(0, zombie.hp - dmg)
  // 入参 hp 已合法 ⇒ 结果必在 [0, hp] 内。这里再断言是纵深防御：
  // 一旦 ZOMBIE_HP 与实体约定脱节，它会立刻指向「血量上界与实体不符」。
  assertZombieHp(hp)
  return { ...zombie, hp }
}

/**
 * 减速 —— **置位为 `turns`，不是累加**（AC-4.4 / AR27）。
 *
 * 「被同一座塔重复命中刷新而非叠加」是 AR27 的逐字要求。
 * 写成 `slowTurnsLeft + turns` 的后果不是「减速更强」，而是数值单调发散：
 * 一座减速塔反复命中同一只僵尸，减速无限续期，那只僵尸永远走不出去。
 *
 * `turns` 必须恰好等于 `SLOW_TURNS`：减速时长是全局常量（balance.ts），
 * 不是调用方能自由传的参数。传别的值要么是写错了，要么是有人想把「刷新 3 回合」
 * 改成「刷新 N 回合」而没走数值调优流程 —— 两种都抛。
 *
 * 减速在**命中当回合**即生效于该回合的移动（见文件头结算顺序）。
 */
export function applySlow(zombie: Zombie, turns: number = SLOW_TURNS): Zombie {
  assertZombieCol(zombie.col)
  assertZombieHp(zombie.hp)
  assertSlowTurns(zombie.slowTurnsLeft)
  if (turns !== SLOW_TURNS) {
    throw new Error(
      `减速时长只能是 ${SLOW_TURNS} 回合（balance.ts 的单一事实源），收到 ${turns}。` +
        '减速是「刷新为固定时长」，既不叠加，也不是任意时长。',
    )
  }
  return { ...zombie, slowTurnsLeft: turns }
}

/**
 * 僵尸移动一格（单步）。
 *
 * 格数由**当前** `slowTurnsLeft` 决定（减速中 1 格，否则 2 格），
 * 并把剩余回合数减 1 —— 减速的 3 回合就是这样消耗掉的。
 *
 * ⚠️ 减 1 发生在「本次移动之后」：`applySlow` 在命中当回合置位 3，
 * 于是该回合的移动读到 3（走 1 格），随后降到 2；下一回合若再被命中则刷新回 3。
 * 若反过来先减后判，第一次减速会被白白吃掉一回合 —— 那正是 `gdd.md:234`
 * 「6 回合窗口」手算链忽略的一半。
 *
 * 允许 `col` 变成负数：僵尸必须能越过房子（grid.ts 的 `hasReachedHouse`
 * 判的就是负列号）。这里刻意**不**夹取到 0（AC-7：逻辑层不静默修正）。
 */
export function stepZombie(zombie: Zombie): Zombie {
  assertZombieCol(zombie.col)
  assertZombieHp(zombie.hp)
  assertSlowTurns(zombie.slowTurnsLeft)

  const slowed = zombie.slowTurnsLeft > 0
  const steps = slowed ? Math.round(ZOMBIE_MOVE_PER_ROUND * (1 - SLOW_FACTOR)) : ZOMBIE_MOVE_PER_ROUND
  const slowTurnsLeft = slowed ? zombie.slowTurnsLeft - 1 : 0
  assertSlowTurns(slowTurnsLeft)

  return { ...zombie, col: zombie.col - steps, slowTurnsLeft }
}