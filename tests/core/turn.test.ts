/**
 * `turn.ts` 的回合结算编排（Story 1.5 / AC-7、AC-9、AC-10；子任务 7.2）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * `resolveCombatRound()` 是战斗层八个单步原语（Story 1.4）与回合状态机之间**唯一**的编排层。
 * 编排层的错误有两类形态，都极难在界面上看出来：
 *
 *  1. **顺序错**（AC-7 逐字锁死的四步：攻击 → 推进 → 抵达丢心 → 判胜负）。
 *     把「推进」提到「攻击」前，单塔命中数不变、伤害不变，只有**回合末的列号**变；
 *     把「抵达」判在「推进」前则整局不掉心。所有这类 bug 在界面上都表现为
 *     「僵尸好像走得慢了一点」，没有任何报错。
 *  2. **编排层自己做错了本该由原语做的事**：范围塔照 `selectTarget` 编排（退化成单体塔）、
 *     丢心判 `hasPassedHouse`、行过滤漏做、减速写成累加。每一项都有对应原语被绕过，
 *     而原语自身的测试**全部保持绿** —— 被绕过的代码不会因为被绕过而失败。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * 每条守卫测试都配一次**能真正区分对错的变异**（见本 story 的 Dev Agent Record
 * 「变异验证记录」）：断言写成「换个顺序/换个函数结果就会不同」的形式，
 * 而不是「结果等于某个数」—— 后者对一半的错误实现同样绿。
 *
 * ⚠️ 本文件**不构造 `State`**，只传塔与僵尸：`turn.ts` 是纯编排层，
 * 刻意不 import `reducer.ts`（单向依赖）。State 层的阶段转换由 reducer.test.ts 守。
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  HOUSE_COL,
  SLOW_TURNS,
  TOWER_STATS,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  ZOMBIE_SPAWN_COL,
  ZOMBIE_ROW,
  createTower,
  createZombie,
  damageFor,
  rangeFor,
  resolveCombatRound,
} from '../../src/core'
import type { Tower, TowerType, Zombie } from '../../src/core'

/** 造一只僵尸。默认满血、未减速。 */
function z(id: string, col: number, hp = ZOMBIE_HP, slowTurnsLeft = 0): Zombie {
  return createZombie({ id, col, hp, slowTurnsLeft })
}

/** 造一座塔。默认建在僵尸行 —— 行过滤的用例显式传别的 row。 */
function t(id: string, towerType: TowerType, col: number, row = ZOMBIE_ROW): Tower {
  return createTower({ id, towerType, wordId: `word-${id}`, row, col })
}

/** 按 id 取结算后的僵尸。取不到即抛错 —— 断言「僵尸消失了」不能靠 `undefined` 蒙混过关。 */
function zombieAfter(result: { zombies: readonly Zombie[] }, id: string): Zombie {
  const hit = result.zombies.find((zz) => zz.id === id)
  if (hit === undefined) {
    throw new Error(`结算后场上没有 ${id}，现有：${result.zombies.map((q) => q.id).join('、') || '（空）'}`)
  }
  return hit
}

describe('AC-7 —— 攻击先于推进（顺序锁定第一项）', () => {
  it('攻击发生在推进之前：同一只僵尸既挨打又前进两格', () => {
    // ⚠️ 判别力来源：塔在 col 2、僵尸在 col 3（direct 射程 3）。
    //   攻击在前 → inRange(2, 3, 3) 的 delta = 1 成立 → 挨打；随后推进 2 格 → col 1。
    //   推进在前 → 僵尸先到 col 1 → delta = -1，不 > 0 → **打不到**。
    // 两个顺序给出 hp 50 / hp 100 的差别，本断言能区分。
    const result = resolveCombatRound([t('t1', 'direct', 2)], [z('z1', 3)])

    const after = zombieAfter(result, 'z1')
    expect(
      after.hp,
      '攻击必须发生在推进之前 —— 推进在前会让塔打空（僵尸先走掉了），全部测试仍可能绿',
    ).toBe(ZOMBIE_HP - TOWER_STATS.direct.damage)
    expect(
      after.col,
      '推进必须发生在攻击之后 —— 攻击后僵尸才前进 2 格，顺序反了这只僵尸会停在原地',
    ).toBe(3 - ZOMBIE_MOVE_PER_ROUND)
  })

  it('塔在射程左边界之外时打不到（射程是单向窗口，不是半径）', () => {
    // 僵尸在塔的**左侧** —— 若把 inRange 的单向约束写成绝对距离，塔会隔空打人，
    // 而界面上只是「塔打到了它看不见的方向」，不会有任何报错。
    const result = resolveCombatRound([t('t1', 'direct', 5)], [z('z1', 3)])
    expect(
      zombieAfter(result, 'z1').hp,
      '射程只覆盖塔右侧 —— 僵尸从左侧经过时挨打说明单向约束丢失，孩子会看到塔打空气',
    ).toBe(ZOMBIE_HP)
  })

  it('射程外的僵尸不挨打，射程内的挨打（射程上界必须生效）', () => {
    const range = rangeFor(t('probe', 'direct', 0))
    const inWindow = z('inside', range) // delta = range，边界内
    const outWindow = z('outside', range + 1) // delta = range + 1，边界外

    const result = resolveCombatRound([t('probe', 'direct', 0)], [inWindow, outWindow])
    expect(zombieAfter(result, 'inside').hp, '射程边界值 delta = range 必须命中 —— 写成 < range 会让塔少打一格').toBe(
      ZOMBIE_HP - damageFor(t('probe', 'direct', 0)),
    )
    expect(zombieAfter(result, 'outside').hp, 'delta 超出射程不得挨打 —— 上界失效会让射程变成无限窗口').toBe(ZOMBIE_HP)
  })
})

describe('AC-7 / [CR] D1 —— 范围塔溅射必须逐只结算', () => {
  it('范围塔对同行 3 格内的每一只各结算一次伤害', () => {
    // ⚠️ 本文件最重要的一条。照 `selectTarget` 编排范围塔时，每只僵尸只挨 60 而
    // 不是「覆盖内各挨 60」—— 界面上的差别是范围塔看起来像单体塔，
    // 而 combat.ts 自身的**全部测试仍然绿**（被绕过的代码不会因为被绕过而失败）。
    // 列号取 5/6/7 是为了让三只僵尸在本回合推进后（3/4/5）都不抵达房子，
    // 断言才能只观察伤害、不被「抵达即离场」干扰。
    const result = resolveCombatRound([t('a1', 'aoe', 6)], [z('left', 5), z('mid', 6), z('right', 7)])

    for (const id of ['left', 'mid', 'right']) {
      expect(
        zombieAfter(result, id).hp,
        `范围塔必须对 ${id} 结算伤害 —— 只打一只说明编排层用了 selectTarget，范围塔静默退化成单体塔`,
      ).toBe(ZOMBIE_HP - TOWER_STATS.aoe.damage)
    }
  })

  it('范围塔不溅射到 3 格条带之外', () => {
    const result = resolveCombatRound([t('a1', 'aoe', 3)], [z('near', 4), z('far', 5)])
    expect(
      zombieAfter(result, 'far').hp,
      '范围塔覆盖恒为同行 3 格 —— 若按 rangeOf(aoe) = 2 算或写成半径 2 的圆，覆盖会多出/少掉格子',
    ).toBe(ZOMBIE_HP)
    expect(zombieAfter(result, 'near').hp, '条带内的僵尸必须挨打').toBe(ZOMBIE_HP - TOWER_STATS.aoe.damage)
  })

  it('直射塔只打一只，即使射程内有多只', () => {
    // 与上一条对照：三种塔型共用「先打谁」的判定，但**只有范围塔**打多只（[CR] D1）。
    const result = resolveCombatRound([t('d1', 'direct', 2)], [z('a', 3), z('b', 4)])
    const hit = result.zombies.filter((q) => q.hp < ZOMBIE_HP)
    expect(
      hit.length,
      '直射塔每回合只打射程内最靠近房子的那一只 —— 打两只说明编排层把溅射语义误用到单体塔',
    ).toBe(1)
    expect(zombieAfter(result, 'a').hp, '被选中的必须是射程内最靠近房子的那只').toBe(
      ZOMBIE_HP - TOWER_STATS.direct.damage,
    )
  })

  it('直射塔优先打最靠近房子的僵尸（选目标规则在编排层被正确使用）', () => {
    const result = resolveCombatRound([t('d1', 'direct', 3)], [z('far', 6), z('near', 4)])
    expect(
      zombieAfter(result, 'near').hp,
      '塔永远打最靠近房子的那只 —— 打远处那只意味着编排层没用 selectTarget 或按数组顺序取目标',
    ).toBe(ZOMBIE_HP - TOWER_STATS.direct.damage)
    expect(zombieAfter(result, 'far').hp, '更远的僵尸本回合不该挨打').toBe(ZOMBIE_HP)
  })
})

describe('子任务 3.2 / [CR] D4 —— 行过滤在编排层', () => {
  it('建在非僵尸行的塔完全不参与攻击', () => {
    // ⚠️ 判别力：塔在 row 0、僵尸在 row 2（本层唯一的僵尸行），且塔在射程内。
    //   漏做行过滤 → 这座塔照样开火。界面上表现为「孩子明明把塔种在空行上，
    //   塔也在打人」，而原语（只收列号）无从拦它 —— 这正是 [CR] D4 把行过滤
    //   判给编排层的原因。
    const offRow = t('off', 'direct', 2, ZOMBIE_ROW - 1)
    const result = resolveCombatRound([offRow], [z('z1', 4)])

    expect(zombieAfter(result, 'z1').hp, '非僵尸行的塔不得开火 —— 僵尸恒在 ZOMBIE_ROW，塔不在同一行就打不到').toBe(
      ZOMBIE_HP,
    )
  })

  it('同列同射程的塔，只有僵尸行那一座开火', () => {
    // 把上条与本条配对：同列同射程，唯一变量是 row。
    const sameColumn = t('same', 'direct', 2, ZOMBIE_ROW + 1)
    const result = resolveCombatRound([sameColumn], [z('z1', 4)])
    expect(zombieAfter(result, 'z1').hp, '上下相邻行的塔同样不得开火 —— 行过滤必须是等值判定而不是「不小于」').toBe(ZOMBIE_HP)
  })

  it('行过滤对范围塔同样生效', () => {
    // 范围塔的条带是横向 3 格，**不含行**（[CR] D4），所以行过滤漏做时它的伤害面最大。
    const result = resolveCombatRound([t('off', 'aoe', 6, ZOMBIE_ROW - 1)], [z('a', 5), z('b', 6), z('c', 7)])
    for (const zz of result.zombies) {
      expect(
        zz.hp,
        `范围塔在非僵尸行不得溅射（${zz.id}）—— 漏做行过滤会让范围塔打到它根本够不着的行`,
      ).toBe(ZOMBIE_HP)
    }
  })

  it('僵尸行的塔照常开火（行过滤不是「全部不开火」）', () => {
    // 变异守卫：把 `row === ZOMBIE_ROW` 写成恒假，本条变红。
    const result = resolveCombatRound([t('on', 'direct', 2)], [z('z1', 4)])
    expect(zombieAfter(result, 'z1').hp, '僵尸行的塔必须能开火 —— 行过滤写成恒假会让所有塔变成哑巴，界面完全看不出原因').toBe(
      ZOMBIE_HP - TOWER_STATS.direct.damage,
    )
  })
})

describe('AC-7 —— 攻击顺序 = towers 数组顺序（自主设计 #7）', () => {
  it('先结算的塔打空目标后，后结算的塔改打下一个目标', () => {
    // ⚠️ 判别力来源：范围塔（60 溅射，覆盖 4/5/6）与直射塔（50 单体，射程 col 3..6）。
    //   顺序 [直射, 范围]：直射塔先打死 z1；范围塔只溅到 z2 → z2 剩 40 存活。
    //   顺序 [范围, 直射]：范围塔打死 z1 并把 z2 打到 40；直射塔补刀打死 z2 → 两只全灭。
    // 若实现按别的顺序（例如按 col 排序、或并发结算），结果落在两者之间或与两者都不同。
    const direct = t('direct-tower', 'direct', 3)
    const aoe = t('aoe-tower', 'aoe', 5)
    const field = [z('z1', 4, 50), z('z2', 6, ZOMBIE_HP)]

    const directFirst = resolveCombatRound([direct, aoe], field)
    expect(
      zombieAfter(directFirst, 'z2').hp,
      '顺序 [直射, 范围] 下 z2 只能吃到一次溅射 —— 若结算顺序被改写（例如按 col 排序）本断言会变红',
    ).toBe(ZOMBIE_HP - TOWER_STATS.aoe.damage)

    const aoeFirst = resolveCombatRound([aoe, direct], field)
    expect(aoeFirst.zombies.length, '顺序 [范围, 直射] 下两只僵尸应全灭 —— 直射塔补刀死掉被溅射打残的那只').toBe(0)
  })
})

describe('AC-7 —— 推进与抵达丢心（顺序锁定第二、三项）', () => {
  it('未减速僵尸每回合前进 ZOMBIE_MOVE_PER_ROUND 格', () => {
    const result = resolveCombatRound([], [z('z1', ZOMBIE_SPAWN_COL)])
    expect(
      zombieAfter(result, 'z1').col,
      '推进步数必须由 stepZombie 决定（单一事实源）—— 编排层自己算格数等于第二份步数实现',
    ).toBe(ZOMBIE_SPAWN_COL - ZOMBIE_MOVE_PER_ROUND)
  })

  it('抵达的僵尸消失并各丢 1 心', () => {
    const result = resolveCombatRound([], [z('arriving', ZOMBIE_MOVE_PER_ROUND), z('far', 6)])
    expect(
      result.heartsLost,
      '移动后 col <= HOUSE_COL 的僵尸必须丢心 —— 不丢心则关卡永不失败，孩子输了也不知道',
    ).toBe(1)
    expect(
      result.zombies.some((q) => q.id === 'arriving'),
      '抵达的僵尸必须从场上移除 —— 留在场上会让它每回合再丢一次心',
    ).toBe(false)
  })

  it('僵尸从入场列走到房子恰好 4 回合，且**丢心发生在第 4 回合**', () => {
    // ⚠️ 本条守的是 hasReachedHouse / hasPassedHouse 的那一回合之差（[CR] D3）。
    // 僵尸在第 4 次结算后 col = 0，**正踩在房子格上**。此刻
    //   hasReachedHouse(0) = true  → 丢心（本断言要的）
    //   hasPassedHouse(0) = false → 不丢心（错误口径会让失败门槛整整差一个回合）
    // 两者的差别恰好是「开局连错几题会输」那个门槛数字。
    const roundsToHouse = ZOMBIE_SPAWN_COL / ZOMBIE_MOVE_PER_ROUND
    expect(
      roundsToHouse,
      '从入场列到房子格必须是整数回合 —— 否则本断言的循环次数算错，门槛数字会跟着偏',
    ).toBe(4)

    let zombie = z('walker', ZOMBIE_SPAWN_COL)
    let lost = 0
    for (let round = 1; round <= roundsToHouse; round += 1) {
      const result = resolveCombatRound([], [zombie])
      lost += result.heartsLost
      zombie = result.zombies[0] ?? zombie
      if (round < roundsToHouse) {
        expect(result.heartsLost, `第 ${round} 回合僵尸尚未抵达，不该掉心`).toBe(0)
      }
    }
    expect(lost, '僵尸第 4 次结算时踩上房子格（col 0）就该掉心 —— 判 hasPassedHouse 会让它多走一回合').toBe(1)
  })

  it('踩在房子格上的僵尸（col 0）本回合即丢心，不等它越过', () => {
    // ⚠️ 与上一条是同一件事的**直接**形态，放在这里是因为这是最容易写错的调用点：
    // `hasReachedHouse`（col <= HOUSE_COL）与 `hasPassedHouse`（col < HOUSE_COL）
    // 只差 `=` 一处，而用错的那个恰好在僵尸「站在房子上」那一刻返回 false。
    const result = resolveCombatRound([], [z('onHouse', HOUSE_COL)])
    expect(
      result.heartsLost,
      '僵尸踩在 col 0（房子格）上就丢心 —— 判 hasPassedHouse 会让它站上房子不掉心，关卡永不失败',
    ).toBe(1)
  })

  it('同一回合两只同时抵达就丢 2 心', () => {
    const result = resolveCombatRound([], [z('a', 2), z('b', 2)])
    expect(result.heartsLost, '同回合抵达的僵尸逐只丢心 —— 只丢 1 心会让失败门槛虚高一倍').toBe(2)
  })

  it('丢心数上限不被编排层夹取（超过心数的抵达全部计入，由 reduce 判失败）', () => {
    // 编排层只报事实。心数归零的判定在 reducer（AC-8），
    // 编排层若自行 `min(1, ...)` 夹取，失败门槛会随抵达只数而漂移。
    const result = resolveCombatRound([], [z('a', 1), z('b', 1), z('c', 2), z('d', 2)])
    expect(result.heartsLost, '编排层必须如实报告抵达只数 —— 夹取会让「掉心数」不再是失败门槛的事实').toBe(4)
  })
})

describe('AC-10 / AR27 —— 减速刷新而非叠加', () => {
  it('减速塔命中后僵尸本回合只走 1 格（减速在命中当回合即生效于移动）', () => {
    // ⚠️ 判别力：塔 col 1、僵尸 col 2。攻击 → 减速置位 → 推进读**当前** slowTurnsLeft。
    //   命中当回合即走 1 格 → col 1；若减速晚一回合生效 → 走 2 格 → col 0。
    const result = resolveCombatRound([t('s1', 'slow', 1)], [z('z1', 2)])
    const after = zombieAfter(result, 'z1')
    expect(after.col, '减速当回合即生效于移动 —— 晚一回合生效会让僵尸凭空多走一格（正好是失败门槛差一回合的量）').toBe(1)
    expect(after.slowTurnsLeft, '移动后减速剩余回合数减 1 —— 剩余数不对会让减速时长在多回合后发散').toBe(SLOW_TURNS - 1)
  })

  it('两座减速塔同时命中同一只僵尸，减速时长不叠加（applySlow 只刷新）', () => {
    // ⚠️ 这是 AC-10 的核心。写成 `slowTurnsLeft + SLOW_TURNS` 时，
    // `assertSlowTurns` 会因超过 SLOW_TURNS 上界**直接抛错** —— 本测试会变红而非给出错误数字，
    // 正是我们想要的：数值单调发散必须响。
    const result = resolveCombatRound([t('s1', 'slow', 1), t('s2', 'slow', 2)], [z('z1', 3)])
    expect(
      zombieAfter(result, 'z1').slowTurnsLeft,
      '被多座减速塔命中时减速必须刷新而非累加 —— 叠加会让那只僵尸永远走不出去，失败门槛随之消失',
    ).toBe(SLOW_TURNS - 1)
  })

  it('减速到期后恢复每回合 2 格', () => {
    // 减速剩余 1 回合 → 本回合走 1 格且清零 → 下一回合走 2 格。
    const first = resolveCombatRound([], [z('z1', 6, ZOMBIE_HP, 1)])
    const afterFirst = zombieAfter(first, 'z1')
    expect(afterFirst.col, '减速最后一回合走 1 格 —— 折算口径由 stepZombie 唯一定义').toBe(6 - 1)
    expect(afterFirst.slowTurnsLeft, '减速剩余回合数耗尽后归零').toBe(0)

    const second = resolveCombatRound([], [afterFirst])
    expect(
      zombieAfter(second, 'z1').col,
      '减速到期后必须恢复 2 格 —— 不恢复意味着减速变成永久，僵尸再也不会抵达房子',
    ).toBe(5 - ZOMBIE_MOVE_PER_ROUND)
  })

  it('减速不影响塔的开火判定（减速改的是移动，不是射程）', () => {
    // 减速僵尸仍在原射程内，照常挨打。若编排层把「减速」误实现成「跳过攻击」，
    // 减速塔会变成「不攻击的塔」，而界面上只是僵尸走得慢 —— 伤害对不上很难察觉。
    const result = resolveCombatRound([t('d1', 'direct', 1)], [z('slowed', 2, ZOMBIE_HP, SLOW_TURNS)])
    expect(zombieAfter(result, 'slowed').hp, '被减速的僵尸必须照常挨打 —— 减速只改移动格数').toBe(
      ZOMBIE_HP - TOWER_STATS.direct.damage,
    )
  })
})

describe('AC-9 —— 僵尸死亡无战利品', () => {
  it('塔打死僵尸后场上不再有它，且结算结果不携带任何阳光信息', () => {
    // 「无战利品」在本层的形态：resolveRound 的返回值里**根本没有阳光字段** ——
    // 塔打死僵尸不能有任何途径改写 sun（AC-9 / FR65：阳光只在答对时增长）。
    const result = resolveCombatRound([t('d1', 'direct', 1)], [z('victim', 2, TOWER_STATS.direct.damage)])
    expect(result.zombies.length, '血量归零的僵尸必须离场 —— 留在场上会被下一座塔当活靶子白打一回合').toBe(0)

    const carried = Object.keys(result).sort()
    expect(
      carried,
      '结算结果不得携带阳光字段 —— 塔打死僵尸一旦能改写阳光，「阳光只在答对时增长」就是空话',
    ).toEqual(['heartsLost', 'zombies'])
  })

  it('血量归零的僵尸不被后续塔当成目标（不存在的目标不消耗这一回合的攻击）', () => {
    // 两座塔打同一只已被打死的僵尸：第二座应改打下一只，否则它的这一回合被浪费，
    // 而界面上只是「塔好像没打中」。
    const field = [z('first', 2, TOWER_STATS.direct.damage), z('second', 3, ZOMBIE_HP)]
    const result = resolveCombatRound([t('d1', 'direct', 1), t('d2', 'direct', 2)], field)
    expect(
      zombieAfter(result, 'second').hp,
      '第一座塔打死后，射程内的第二只必须成为下一个目标 —— 打空气会让这一回合白过',
    ).toBe(ZOMBIE_HP - TOWER_STATS.direct.damage)
  })

  it('溢出伤害不产生负血量（僵尸的死亡态是 hp = 0，不是 hp = -20）', () => {
    const result = resolveCombatRound([t('a1', 'aoe', 3)], [z('weak', 3, 10)])
    expect(result.zombies.length, '血量归零的僵尸离场 —— 负血量会让「hp <= 0 即离场」的判定散落到多处').toBe(0)
  })
})

describe('AC-7 —— 纯函数性与边界', () => {
  it('不修改传入的塔与僵尸数组（纯函数，返回新对象）', () => {
    // 决策 2（纯 reducer）：同一串 Action 必须重放出完全相同的一局。
    // 编排层就地改入参会破坏存档重放与平衡模拟的可比性。
    const towers = [t('d1', 'direct', 1)]
    const zombies = [z('z1', 2)]
    const towerSnapshot = JSON.stringify(towers)
    const zombieSnapshot = JSON.stringify(zombies)

    resolveCombatRound(towers, zombies)

    expect(JSON.stringify(towers), '编排层不得就地修改入参塔 —— 就地改会让同串 Action 重放出不同结果').toBe(towerSnapshot)
    expect(JSON.stringify(zombies), '编排层不得就地修改入参僵尸 —— 同上，且 reducer 的不可变性前提被破坏').toBe(zombieSnapshot)
  })

  it('无塔时照常推进（没有塔不是「回合不成立」，而是「没有攻击阶段」）', () => {
    const result = resolveCombatRound([], [z('z1', 6), z('z2', 7)])
    expect(result.zombies.length, '无塔时僵尸一只都不该消失').toBe(2)
    expect(zombieAfter(result, 'z1').col, '无塔时僵尸仍须推进 —— 跳过推进会让「开局连错就没有塔 ⇒ 掉心」这条门槛链断掉').toBe(6 - ZOMBIE_MOVE_PER_ROUND)
  })

  it('空僵尸场返回零掉心', () => {
    const result = resolveCombatRound([t('d1', 'direct', 1)], [])
    expect(result.heartsLost, '空场不得掉心 —— 凭空掉心会让失败门槛与场上实体脱钩').toBe(0)
    expect(result.zombies.length, '空场结算后仍为空').toBe(0)
  })

  it('起始心数常量与结算结果无关（编排层不碰心数余额，只报掉了几颗）', () => {
    // 心数余额由 reduce 管（AC-8）。编排层若接受并扣减 hearts 参数，
    // 「掉心」这件事就有了两个可写来源。
    //
    // ⚠️ 此前这里是 `expect(HEARTS).toBe(3)`（`[CR]` 2026-10-14）：它把字面量 3
    //   重复了一遍到测试里，于是 `deferred-work.md` 与 `gdd.md:596` 都记录的
    //   **首选**修复「起始心数 3 → 4」会让这条以误导性消息变红
    //   （把人引去 `turn.ts` 找第二处心数常量 —— 那里根本没有）。
    //   断言想表达的是「编排层不引入第二处心数常量」，那就**直接查 turn.ts 的源码**，
    //   而不是钉死 `balance.ts` 的取值。
    const turnSource = readFileSync(new URL('../../src/core/turn.ts', import.meta.url), 'utf8')
    expect(
      /\bHEARTS\b/.test(turnSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
      '编排层不得引用 HEARTS —— 心数余额只有一个可写来源（reduce / balance.ts）',
    ).toBe(false)
    expect(
      /hearts\s*[:=]/.test(turnSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
      '编排层不得持有 hearts 字段 —— 它只报「掉了几颗」，余额归 reduce 管',
    ).toBe(false)

    const result = resolveCombatRound([], [z('z1', 1), z('z2', 1)])
    expect(result.heartsLost, '编排层只报掉了几颗心，不返回余额').toBe(2)
  })
})
