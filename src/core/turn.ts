/**
 * 回合结算编排（Story 1.5 / AC-7、AC-9、AC-10）。
 *
 * ── 命名裁决：`resolveCombatRound` 而非 `resolveRound` ──────────────────────
 * 本 story 的 Dev Notes 让 `actions.ts` 的构造器与本文件的编排器**同名**
 * `resolveRound()` —— 那是两件不同的事（派发「结算」这一意图 vs 执行结算），
 * 而本 story 的 balance-sim 规格里 `resolveRound` 与 `answer` / `placeTower` /
 * `endBuild` 并列出现在 import 行上，说明**那个名字属构造器**。
 * 故编排器改名 `resolveCombatRound`：名字里多出的 `Combat` 正是二者的区别所在，
 * 而 `run*` 前缀会暗示它有副作用 —— 它是纯函数。
 *
 * ── 本文件的职责 ──────────────────────────────────────────────────────────
 * `combat.ts`（Story 1.4）提供八个**单步原语**，本文件把它们编排成一个回合。
 * 编排层要做、而原语刻意不做的事，只有三件：
 *   1. **行过滤** —— 原语只收列号、感知不到塔的 row（[CR] D4 裁决）；
 *   2. **按塔序逐座结算** —— 原语是纯函数，没有「上一座塔打完之后场况如何」的概念；
 *   3. **四步顺序** —— AC-7 逐字锁定，顺序不可交换。
 *
 * ── 四步顺序（AC-7 / FR49，`epics.md:838` 字面）────────────────────────────
 * ```
 * 1. 攻击：每座塔各攻击射程内最靠近房子的僵尸一次（范围塔对 aoeTargets 每只各结算）
 * 2. 推进：所有存活僵尸前进（减速生效时 1 格，否则 2 格）
 * 3. 抵达：移动后 col <= HOUSE_COL 的僵尸消失，各丢 1 心
 * 4. 判胜负：hearts <= 0 → level-failed        ← 这一步在 reducer，本文件不做
 * ```
 * ⚠️ 第 4 步**不在本文件**：本文件只报掉了几颗心（`heartsLost`），不持有心数余额。
 * 「心数归零 ⇒ 失败」属状态层（AC-8）—— 掉心与失败判定分开，才不会有两个可写来源。
 *
 * ── 为什么攻击阶段内部要先剔除死者 ────────────────────────────────────────
 * AC-7 第 1 步末尾剔除 `hp <= 0`（子任务 3.7）。不剔除的后果不是「多打一只空气」，
 * 而是**减速**：血量归零的僵尸若留在数组里，`selectTarget` 会跳过它（好），
 * 但 `aoeTargets` 同样跳过（也好）—— 真正的问题在下一回合：漏网的死僵尸会
 * 继续被推进、抵达、并**丢一颗心**。一只已经死了四回合的僵尸丢掉孩子的一颗心，
 * 界面上没有任何东西指向原因。
 *
 * ── 依赖方向 ──────────────────────────────────────────────────────────────
 * ⚠️ 本文件**不得 import `reducer.ts`**（子任务 3.5）：单向 `reducer → turn`。
 * turn 不认识 `State`，只认识「塔的数组 + 僵尸的数组」—— 这让它可以被 balance-sim
 * 与测试直接调用，也保证「回合规则写两遍」在结构上不可能发生。
 *
 * 零 DOM、零 Vue、零随机、零时间依赖。失败一律抛（AC-7）。
 */

import { damageFor, rangeFor } from './balance.js'
import { ZOMBIE_ROW, hasReachedHouse } from './grid.js'
import { aoeTargets, applyDamage, applySlow, selectTarget, stepZombie } from './combat.js'
import type { Tower, Zombie } from './types.js'

/**
 * 一次回合结算的结果。
 *
 * ⚠️ **刻意没有 `sun` 字段**：塔打死僵尸不产出任何阳光（AC-9 / FR65），
 * 阳光只在答对时增长。若这里带上阳光余额，「无战利品」就只是注释而不是形状 ——
 * 本文件（以及 tests/core/turn.test.ts 里那条 `Object.keys` 断言）就是那条形状的守卫。
 */
export interface ResolveRoundResult {
  /** 结算后仍在场的僵尸：已剔除死者与已抵达者。 */
  readonly zombies: readonly Zombie[]
  /** 本回合抵达房子、应当扣除的心数（可能大于剩余心数 —— 是否失败由 reducer 判）。 */
  readonly heartsLost: number
}

/**
 * 执行一个回合的结算：攻击 → 推进 → 抵达。
 *
 * ⚠️ **攻击顺序 = `towers` 数组顺序**（自主设计 #7），即建造顺序。
 * `reduce` 无随机无时间依赖 ⇒ 同一串 Action 必须重放出完全相同的一局，
 * 而「完全相同」要求「先建哪座塔」这件事有确定的后果。
 *
 * ⚠️ **丢心判 `hasReachedHouse(col)`（`col <= HOUSE_COL`），不是 `hasPassedHouse`。**
 * 两者差一个等号：僵尸在第 4 次结算后**正踩在** col 0 上，此时
 * `hasPassedHouse(0)` 仍是 false —— 用错的话关卡永不失败，且界面上看不出任何异常，
 * 只是「怎么答错都不会输」。这正是 [CR] D3 把两个口径拆名的原因。
 *
 * @param towers 本回合开火的塔（任意行）。行过滤在本函数内完成。
 * @param zombies 结算前的场上僵尸。
 */
export function resolveCombatRound(towers: readonly Tower[], zombies: readonly Zombie[]): ResolveRoundResult {
  // ── 第 1 步：攻击 ──────────────────────────────────────────────────────
  // 行过滤（[CR] D4）：僵尸恒在 ZOMBIE_ROW，只有同一行的塔够得着它。
  // 塔可以种在任意空格（GDD），所以「在场上」不等于「够得着」。
  const shooters = towers.filter((tower) => tower.row === ZOMBIE_ROW)
  let alive = zombies
  for (const tower of shooters) {
    alive = shoot(alive, tower)
  }
  // 攻击阶段结束立即剔除死者（子任务 3.7）—— 理由见文件头。
  alive = alive.filter((zombie) => zombie.hp > 0)

  // ── 第 2 步：推进 ──────────────────────────────────────────────────────
  // 步数与减速折算一律由 stepZombie 负责，本文件**不自己算格数**：
  // 自己算就是第二份步数实现，而它一定会在 Story 3.2 调 SLOW_FACTOR 时被漏改。
  const moved = alive.map(stepZombie)

  // ── 第 3 步：抵达 ──────────────────────────────────────────────────────
  const remaining: Zombie[] = []
  let heartsLost = 0
  for (const zombie of moved) {
    if (hasReachedHouse(zombie.col)) {
      heartsLost += 1
    } else {
      remaining.push(zombie)
    }
  }

  return { zombies: remaining, heartsLost }
}

/**
 * 单座塔的一次攻击（子任务 3.3、3.4）。
 *
 * ⚠️ **范围塔必须走 `aoeTargets()` 逐只 `applyDamage`**（[CR] D1）：若照
 * `selectTarget` 的单体模式编排，范围塔会静默退化成单体塔 —— 造价 75 却只打一只，
 * 而 `combat.ts` 的**全部测试仍然绿**（被绕过的代码不会因为被绕过而失败）。
 * 界面上唯一的迹象是「范围塔好像不划算」，而那正是玩家会据此做出的决策。
 *
 * ⚠️ **伤害 / 射程一律走 `damageFor(tower)` / `rangeFor(tower)`**（子任务 3.4）：
 * 散取 `TOWER_STATS[tower.towerType]` 等于绕过 AC-8 的机器守卫，
 * 而「读 wordId 决定伤害」这种 bug 在界面上完全看不出来。
 *
 * ⚠️ **减速只在目标挨完打还活着时施加**：血量归零的僵尸无需减速，
 * 且让它进 `applySlow` 只会让本回合结束前的中间态多一个无意义的字段写入。
 */
function shoot(zombies: readonly Zombie[], tower: Tower): readonly Zombie[] {
  const damage = damageFor(tower)
  if (tower.towerType === 'aoe') {
    // 覆盖内每一只各结算一次（[CR] D1）。`aoeTargets` 只选不结算 —— 逐只结算是本层的职责。
    let field = zombies
    for (const target of aoeTargets(zombies, tower.col)) {
      field = replaceZombie(field, applyDamage(target, damage))
    }
    return field
  }

  const target = selectTarget(zombies, tower.col, tower.towerType, rangeFor(tower))
  if (target === null) {
    return zombies
  }
  let field = replaceZombie(zombies, applyDamage(target, damage))
  if (tower.towerType === 'slow') {
    const wounded = requireZombie(field, target.id)
    if (wounded.hp > 0) {
      field = replaceZombie(field, applySlow(wounded))
    }
  }
  return field
}

/**
 * 按 id 换掉数组里的那只僵尸，返回**新数组**。
 *
 * 为什么不能就地改：纯函数性（决策 2 / AR11）。而且这里若用「按位置键入容器」
 * 的写法，就会重演 `balance-scan.py` 那个吞掉实体的 bug —— 按索引而非 id 定位时，
 * 同一回合里前一只僵尸的改动会让后一只的索引全部前移。
 */
function replaceZombie(zombies: readonly Zombie[], next: Zombie): readonly Zombie[] {
  return zombies.map((zombie) => (zombie.id === next.id ? next : zombie))
}

/** 按 id 取僵尸，取不到即抛错 —— 只在本文件内部的自洽路径上调用，出现即编排层有 bug。 */
function requireZombie(zombies: readonly Zombie[], id: string): Zombie {
  const hit = zombies.find((zombie) => zombie.id === id)
  if (hit === undefined) {
    throw new Error(
      `刚结算过的僵尸 ${id} 从场上消失了 —— 编排层内部的自洽性被破坏，` +
        '多半是 replaceZombie 按索引而非 id 定位，把实体覆盖掉了。',
    )
  }
  return hit
}
