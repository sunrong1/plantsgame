/**
 * 战斗单步原语（Story 1.4 / AC-4）。
 *
 * ── 结算顺序（AC-4.4，Dev Notes §6，与 Story 1.5 的 `turn.ts` 同源）────────
 * ```
 * 1. 攻击阶段：判定射程 → 选目标 → 结算伤害 → 减速塔「置位」slowTurnsLeft = 3
 * 2. 移动阶段：按**攻击后**的 slowTurnsLeft 决定移动格数（2 或 1）
 * ```
 * 顺序依据是 `epics.md:838` 的字面（攻击 → 推进 → 判定）。
 *
 * ⚠️ [CR] 复核修正（2026-10-13 实跑）：旧注释声称「先移动后攻击在减速塔上差一次命中
 * （实跑 2 次 vs 3 次）」——**在本文件原语的语义下不成立**：`stepZombie` 读的是
 * **当前** `slowTurnsLeft`（移动后减 1），两种阶段顺序对减速塔 col3 都是 3 次命中 /
 * 75 伤害。「2 次」只在「减速延迟一整回合才生效」的另一种模型下出现。
 * 按注释纪律（Dev Notes §9「只写站得住的理由」）撤下该查无实据的因果断言；
 * 攻击在前的唯一依据就是 epics.md:838 的字面顺序。Story 1.5 若要验证顺序敏感性，
 * 必须以本文件原语实跑为准，不得引用旧数字。
 *
 * ── 行过滤职责（[CR] D4，2026-10-13 用户裁决）──────────────────────────────
 * 本文件全部原语**只收列号（towerCol），不感知塔的 row**。僵尸恒在 ZOMBIE_ROW，
 * 塔可以建在任意行；「只有 row === ZOMBIE_ROW 的塔参与攻击判定」是**编排层**
 * （Story 1.5 的 turn.ts）的职责 —— 原语刻意不收 Tower 对象、不做行过滤。
 * 契约测试见 tests/core/combat.test.ts「行过滤职责契约」。
 *
 * 本文件只提供**单步原语**（射程判定 / 选目标 / 结算伤害 / 减速 / 单步移动），
 * 整回合的编排属 Story 1.5 的 `turn.ts` —— 刻意**不**提供 `simulateRound()`：
 * 提前建会导致回合层被写两次。唯一例外是 `aoeTargets()`（[CR] D1 裁决）：
 * 它是范围塔溅射语义在 core 层的唯一实现，仍属「单步」—— 只选目标，不结算。
 *
 * ── 硬规则（AC-8）────────────────────────────────────────────────────────
 * 战斗数值只读 `towerType`，**永远不读 `wordId`**。同一 towerType 的两座塔
 * （无论绑定什么词）计算结果必须完全相同。
 *
 * 零 DOM、零 Vue。失败一律抛（架构 `:568`：逻辑层只 throw，不 catch）。
 */

import { SLOW_FACTOR, SLOW_TURNS, ZOMBIE_MOVE_PER_ROUND, assertTowerType } from './balance.js'
import { COLS, assertGridIndex } from './grid.js'
import {
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
 * ⚠️ **不做行判定** —— 这是**分工**而非疏漏：行过滤是编排层（turn.ts）的职责，
 * 见文件头「行过滤职责」（[CR] D4 裁决）。本函数只回答「给定塔列，覆盖哪些列」。
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
 * ⚠️ 「裁剪」只对**网格内的合法塔列**成立（col 0 / col 8 裁成 2 格）；
 * towerCol 本身越界是调用方错误，抛错（[CR] P5）—— 静默返回空覆盖
 * 等于让塔「永远打不到」且没有任何报错指向它（AC-7：只 throw）。
 */
export function aoeColumns(towerCol: number): readonly number[] {
  assertGridIndex(towerCol, 'towerCol')
  if (towerCol < 0 || towerCol >= COLS) {
    throw new Error(`towerCol ${towerCol} 越界（合法范围 0 ~ ${COLS - 1}）—— 塔不可能建在网格外`)
  }
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
 *
 * ⚠️ 本函数回答的是「**先打谁**」（单目标）。范围塔的溅射语义（对覆盖内
 * **每一只**各结算一次）在 {@link aoeTargets} —— 两者刻意分开（[CR] D1）。
 */
export function selectTarget(
  zombies: readonly Zombie[],
  towerCol: number,
  towerType: TowerType,
  range: number,
): Zombie | null {
  assertGridIndex(towerCol, 'towerCol')
  assertTowerType(towerType)
  // 范围塔的覆盖只算一次，不对每只僵尸重算 aoeColumns。
  const covered = towerType === 'aoe' ? aoeColumns(towerCol) : null

  let best: Zombie | null = null
  for (const zombie of zombies) {
    // 校验面一致（[CR] P9）：direct 分支经 inRange 对 col 做整数校验，
    // aoe 分支的 includes() 却会静默放行非整数 —— 同一个脏 col 必须对两种塔型同样抛错。
    assertZombieCol(zombie.col)
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
 * 范围塔覆盖内的**全部**目标（[CR] D1，2026-10-13 用户裁决：溅射语义在 core 层的唯一实现）。
 *
 * ⚠️ 为什么必须有这个函数：架构决策 1 的范围塔是「同行 3 格条带，覆盖内**每只**
 * 各结算 60」。此前该语义只活在测试注释里，没有任何可执行实现 —— `selectTarget`
 * 对 aoe 也只返回 1 只。Story 1.5 的 turn.ts 若照 selectTarget 的模式编排，
 * 范围塔会静默退化成单体塔，而现有测试全部保持绿（M3 变异只守 aoeColumns 的形状）。
 *
 * 与 `selectTarget` 的分工：selectTarget 回答「先打谁」（单目标，三种塔型通用），
 * 本函数回答「溅射打中谁」（多目标，仅范围塔）。伤害结算仍由调用方对返回的
 * 每只僵尸 `applyDamage` —— 本函数不结算，维持单步原语的边界（不做整回合编排）。
 *
 * 返回按（列号，id）升序 —— 纯函数必须完全确定（AR6 / AR17，与 selectTarget 的
 * tie-break 同一套比较口径）。已死僵尸（hp <= 0）跳过，与 selectTarget 同口径。
 */
export function aoeTargets(zombies: readonly Zombie[], towerCol: number): readonly Zombie[] {
  assertGridIndex(towerCol, 'towerCol')
  // aoeColumns 自带 towerCol 越界抛错（[CR] P5）。
  const covered = aoeColumns(towerCol)
  const targets: Zombie[] = []
  for (const zombie of zombies) {
    assertZombieCol(zombie.col)
    if (zombie.hp <= 0) {
      continue
    }
    if (covered.includes(zombie.col)) {
      targets.push(zombie)
    }
  }
  return targets.sort((a, b) => a.col - b.col || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
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
 * 减速 —— **置位为 `SLOW_TURNS`，不是累加**（AC-4.4 / AR27）。
 *
 * 「被同一座塔重复命中刷新而非叠加」是 AR27 的逐字要求。
 * 写成 `slowTurnsLeft + SLOW_TURNS` 的后果不是「减速更强」，而是数值单调发散：
 * 一座减速塔反复命中同一只僵尸，减速无限续期，那只僵尸永远走不出去。
 *
 * ⚠️ [CR] D2（2026-10-13 用户裁决）：签名**没有时长参数**。旧签名
 * `applySlow(zombie, turns)` 只接受 `SLOW_TURNS` 一个合法值、传其他值抛错 ——
 * 参数存在但只有一个合法取值，是死 API 面，还诱导调用方写出
 * `applySlow(z, TOWER_STATS.slow.slowTurns!)`（表内死字段，已随 D2 一并删除）。
 * 减速时长的单一事实源是 balance.ts 的 `SLOW_TURNS` 常量，本函数直接读它。
 *
 * 减速在**命中当回合**即生效于该回合的移动（见文件头结算顺序）。
 */
export function applySlow(zombie: Zombie): Zombie {
  assertZombieCol(zombie.col)
  assertZombieHp(zombie.hp)
  assertSlowTurns(zombie.slowTurnsLeft)
  return { ...zombie, slowTurnsLeft: SLOW_TURNS }
}

/**
 * 僵尸单步推进：未减速移动 `ZOMBIE_MOVE_PER_ROUND` 格（当前 2 格），
 * 减速中按 `SLOW_FACTOR` 折算（当前 1 格）。
 *
 * ⚠️ [CR] P18：旧 JSDoc 首行写「僵尸移动**一格**」—— 与未减速走 2 格的实现
 * 直接矛盾。按首行建模移动，正是 §0.3 那类手算口径错误的温床。
 *
 * 格数由**当前** `slowTurnsLeft` 决定，并把剩余回合数减 1 ——
 * 减速的 3 回合就是这样消耗掉的。
 *
 * ⚠️ 减 1 发生在「本次移动之后」：`applySlow` 在命中当回合置位 3，
 * 于是该回合的移动读到 3（走 1 格），随后降到 2；下一回合若再被命中则刷新回 3。
 * 若反过来先减后判，第一次减速会被白白吃掉一回合 —— 那正是 `gdd.md:234`
 * 「6 回合窗口」手算链忽略的一半。
 *
 * 允许 `col` 变成负数：僵尸必须能越过房子（grid.ts 的 `hasPassedHouse`
 * 判的就是负列号）。这里刻意**不**夹取到 0（AC-7：逻辑层不静默修正）。
 */
export function stepZombie(zombie: Zombie): Zombie {
  assertZombieCol(zombie.col)
  assertZombieHp(zombie.hp)
  assertSlowTurns(zombie.slowTurnsLeft)

  const slowed = zombie.slowTurnsLeft > 0
  const steps = slowed ? Math.round(ZOMBIE_MOVE_PER_ROUND * (1 - SLOW_FACTOR)) : ZOMBIE_MOVE_PER_ROUND
  // 步数下界守卫（[CR] P8）：Story 3.2 若把 SLOW_FACTOR 调到 > 0.75，
  // Math.round(2 × (1 - f)) 得 0 —— 僵尸被静默冻结在原地，界面上只是「不动了」，
  // 没有任何断言指向步数。数值漂移必须响（AC-7：只 throw）。
  if (steps < 1) {
    throw new Error(
      `减速折算后的步数必须 >= 1，收到 ${steps}（SLOW_FACTOR = ${SLOW_FACTOR}）—— 步数 0 会把僵尸静默冻结`,
    )
  }
  const slowTurnsLeft = slowed ? zombie.slowTurnsLeft - 1 : 0
  assertSlowTurns(slowTurnsLeft)

  return { ...zombie, col: zombie.col - steps, slowTurnsLeft }
}
