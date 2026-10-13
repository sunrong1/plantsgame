/**
 * 战斗结算的守卫（Story 1.4 / AC-4 / AC-5 / AC-6 / AC-8）。
 *
 * 守五条数值断言里的三条（AR21 / AR26 / AR27）+ AC-8 的直接证明 +
 * 全列事实守卫（AC-6）。
 *
 * ── 为什么用测试内的局部 helper 驱动回合 ─────────────────────────────────
 * `combat.ts` 只导出**单步原语**（射程判定 / 选目标 / 结算伤害 / 减速 / 单步移动），
 * **不做整回合编排** —— 那是 Story 1.5 的 `turn.ts`。
 * 提前在 core/ 里加一个 `simulateRound()` 会导致回合层被写两次。
 * 所以这里的 `runBattle()` 是测试内的局部 helper，它按 Dev Notes §6 的顺序
 * （攻击 → 移动）驱动那些原语，与 turn.ts 将来要做的事同源、不同处。
 *
 * ── 三条最容易写错的 ─────────────────────────────────────────────────────
 * ① 结算顺序是**先攻击后移动**（epics.md:838 的字面顺序）。
 *    ⚠️ [CR] 复核修正：旧头注释声称「反过来在减速塔上差一次命中」—— 在本实现
 *    原语的语义下不成立（两种顺序均 3 次命中），详见 combat.ts 文件头。
 * ② 射程**单向**：`0 < targetCol - towerCol <= range`，两半都不可去。
 * ③ 范围塔覆盖是**同行 3 格条带**，不是半径 2 的圆；溅射对覆盖内**每只**结算
 *    （[CR] D1 后由 core 层 aoeTargets 承载该语义）。
 */
import { describe, expect, it } from 'vitest'

import {
  SLOW_TURNS,
  TOWER_STATS,
  ZOMBIE_HP,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  aoeColumns,
  aoeTargets,
  applyDamage,
  applySlow,
  costOf,
  createTower,
  createZombie,
  damageFor,
  damageOf,
  hasPassedHouse,
  inRange,
  isInAoe,
  rangeFor,
  rangeOf,
  selectTarget,
  stepZombie,
} from '../../src/core'
import type { Tower, TowerType, Zombie } from '../../src/core'

// ── 测试内的局部 helper（不属 core/，理由见文件头）────────────────────────

/** 一场战斗的结果。 */
interface BattleResult {
  /** 塔实际开火的回合数。 */
  readonly hits: number
  /** 全程累计伤害。 */
  readonly damage: number
  /** 跑了多少回合（含僵尸已抵达房子后的空转回合）。 */
  readonly turns: number
  /** 战斗结束时的僵尸（已死的被移除）。 */
  readonly zombies: readonly Zombie[]
}

/** 一回合的硬上限。正常战斗远在它之前收敛（死光或走出房子）；它只防真死循环。 */
const MAX_TURNS = 30

/**
 * 驱动一场战斗 —— 严格按 Dev Notes §6 的顺序：所有塔各攻击一次 → 所有存活僵尸移动一次。
 *
 * ⚠️ 单塔模型：本 story 不处理多塔、也不处理「丢心」的完整规则（那是 turn.ts 的事）。
 * 这里只做两件收敛所需的最小清理：hp 归零的僵尸从场上剔除；**越过房子**
 * （hasPassedHouse）的僵尸不再驱动战斗继续（它已经离场，只是仍留在结果里供断言残血）。
 *
 * ⚠️ [CR] P11 两处修正：
 *   · `total` 记**实际扣血**（min(目标当前 hp, damage)），不记名义伤害 ——
 *     40 血僵尸挨 60 只扣 40，旧口径会把虚高的名义值焊进「窗口总伤害」类断言。
 *   · 打满 maxTurns 仍未收敛时**抛错**，不再静默截断返回 ——
 *     旧行为下「打不死的战斗」表现为被 30 回合悄悄截断的事实表，没人知道数据是截断产物。
 *
 * ⚠️ [CR] D1：范围塔经 core 层的 aoeTargets 对覆盖内**每一只**结算 ——
 * 旧写法用 selectTarget 单目标退化，Story 1.5 照抄会让范围塔静默变单体塔。
 */
function runBattle(tower: Tower, zombies: readonly Zombie[], maxTurns = MAX_TURNS): BattleResult {
  // ⚠️ 走 balance.ts 的 damageFor / rangeFor，而不是 TOWER_STATS[tower.towerType]：
  // 那两个函数是 AC-8「只读 towerType」的**唯一**守卫落点。
  // 在这里散开取表，等于把「伤害来源」摊成无数处，`wordId` 就能从任何一处渗进来
  // 而没有任何检查响（AC-10 的变异验证直接证明了这一点）。
  const damage = damageFor(tower)
  const range = rangeFor(tower)
  let field = [...zombies]
  let hits = 0
  let total = 0
  let turns = 0

  // 收敛判据：全部僵尸「已死或已越过房子」。空场（全死）时 every 恒真，同样收敛。
  const converged = (zs: readonly Zombie[]) => zs.every((z) => z.hp <= 0 || hasPassedHouse(z.col))

  while (turns < maxTurns && !converged(field)) {
    turns += 1

    // ── 攻击阶段
    if (tower.towerType === 'aoe') {
      // 溅射：覆盖内每只各结算一次（[CR] D1，语义源 = core 层 aoeTargets）。
      const targets = aoeTargets(field, tower.col)
      if (targets.length > 0) {
        hits += 1
        for (const t of targets) {
          total += Math.min(t.hp, damage)
          field = field.map((z) => (z.id === t.id ? applyDamage(z, damage) : z))
        }
      }
    } else {
      const target = selectTarget(field, tower.col, tower.towerType, range)
      if (target) {
        hits += 1
        total += Math.min(target.hp, damage)
        field = field.map((z) => (z.id === target.id ? applyDamage(z, damage) : z))
        // 减速塔命中即刷新减速（置位，不是累加）。
        if (tower.towerType === 'slow') {
          field = field.map((z) => (z.id === target.id ? applySlow(z) : z))
        }
      }
    }
    field = field.filter((z) => z.hp > 0)

    // ── 移动阶段（按攻击后的减速状态）
    field = field.map(stepZombie)
  }

  if (!converged(field)) {
    throw new Error(
      `runBattle 达到回合上限 ${maxTurns} 仍未收敛（场上还有活着且未越过房子的僵尸）—— ` +
        '结果不可信，拒绝静默截断返回（[CR] P11）',
    )
  }

  return { hits, damage: total, turns, zombies: field }
}

/**
 * 击杀一只满血僵尸要几个**回合**。返回 Infinity 表示僵尸**越过房子时仍未死**。
 *
 * ⚠️ [CR] P11 后语义收紧：runBattle 只在收敛（死光或越过房子）时返回，
 * 打满上限会抛错 —— 所以 Infinity 不再可能来自「被截断」，只来自「走到家还没死」。
 *
 * ⚠️ 「回合数」≠「命中次数」：直射塔 col3 命中 2 次，却要第 3 回合才打死
 * （第 1 回合僵尸在 col 8，不在射程内）。两者在本文件里都出现，必须分开说。
 */
function turnsToKill(tower: Tower, hp = ZOMBIE_HP, maxTurns = MAX_TURNS): number {
  const spawn = createZombie({ id: 'z-single', col: ZOMBIE_SPAWN_COL, hp })
  const result = runBattle(tower, [spawn], maxTurns)
  return result.zombies.length === 0 ? result.turns : Infinity
}

/** 建一座塔，位置显式给出。wordId 默认随便一个 —— AC-8 要证明它不影响任何计算。 */
function towerAt(towerType: TowerType, col: number, wordId = 'u1-dog'): Tower {
  return createTower({ id: `t-${towerType}-${col}`, towerType, wordId, row: 2, col })
}

/** 在入场列放一只满血僵尸。 */
function spawnZombie(id = 'z-1', hp = ZOMBIE_HP): Zombie {
  return createZombie({ id, col: ZOMBIE_SPAWN_COL, hp })
}

// ── AR21 —— 直射塔恰好 2 次命中 = 100 伤害（AC-4 / AC-6）───────────────────

describe('AR21 —— 直射塔恰好击杀 100 血僵尸（AC-6：钉具体列）', () => {
  it('塔在 col 3（界面「第 4 列」）命中 2 次，伤害 100，恰好打死', () => {
    const result = runBattle(towerAt('direct', 3), [spawnZombie()])

    // 「恰好 2 次」是整条战斗模型的地基：少一次则 100 血打不死（直射塔沦为摆设），
    // 多一次则射程窗口算宽了（后面所有塔位的判定一起错）。
    expect(result.hits, '直射塔在 col3 必须命中 2 次 —— 少一次则 100 血打不死，直射塔沦为摆设').toBe(2)
    expect(result.damage, '2 次 × 50 = 100 伤害，必须恰好等于满血').toBe(100)
    expect(
      result.zombies,
      '100 伤害必须恰好击杀 —— 若僵尸仍在场上，说明伤害判定算宽了',
    ).toHaveLength(0)
  })

  it('「恰好」的第二层：伤害溢出后血量夹在 0，不出现负数', () => {
    // 最后一发可能溢出（本例：40 血挨直射塔的 50；范围塔 60 打 40 血同理）。
    // [CR] P20：旧注释举例「范围塔 40 血挨 60」而代码用的是 50（直射塔伤害）——
    // 例子与代码对不上，照注释复核的人会对不上数。僵尸被消灭是「hp = 0」这个状态，
    // 不是「hp = -20」—— 负血量会让 UI 显示与存档回放各说各话。
    const wounded = applyDamage(spawnZombie('z-wounded', 40), 50)
    expect(wounded.hp, '40 血挨 50 伤害后必须夹到 0').toBe(0)
    expect(applyDamage(wounded, 50).hp, '已死的僵尸再挨一次仍是 0，不得为负').toBe(0)
  })

  // ── AC-6 的全列事实守卫 ────────────────────────────────────────────────
  // ⚠️ 这张表锁的是**实然**（当前数值下实测的事实），不是「所有塔位都能击杀」的应然。
  //
  // 由来（不是玄学）：射程窗口是塔右侧 3 格；僵尸每回合走 2 格 ⇒ 它在窗口内
  // 只可能落在偶数**索引**列；塔每右移 1 格，整个窗口平移 1 格 ⇒ col 1–6 的命中次数
  // 确实在 2 与 1 之间按奇偶交替。
  //
  // ⚠️ [CR] P12 模型修正：旧标题声称「命中次数由塔位列的**奇偶性**决定」——
  // 被自家事实表的最后一项证伪：col 7 是奇数列却只有 1 次命中。真因是 col 7 的
  // 窗口 (7,10] 被网格右缘裁剪到只剩 {8}，僵尸只在 col 8 踩中一次。
  // Story 3.2 若拿「奇偶性」当模型调数值而对 spawn 边缘交互毫无预期，
  // 第五次手算错误就地诞生。**奇偶交替只是 col 1–6 的局部规律，不是全列模型。**
  //
  // 它的作用不是「证明全部塔位都能击杀」——恰恰相反：col 0/2/4/6/7 单塔打不死，
  // 僵尸带着 50 血走进房子。GDD 未记录这一点，而 Story 1.10 的建塔 UI 会让孩子
  // 系统性地建到打不死僵尸的塔位。**本 story 不改数值**（那属 Story 3.2），
  // 只把事实测出来、写进测试、登记移交（deferred-work.md）。
  it('全列事实守卫：全部 9 列的命中次数逐列锁死（[CR] P13：含 col 0 与 col 8）', () => {
    // [CR] P13：旧表只覆盖 col 1..7，却自称「全列」—— col 0 的排除理由
    // （「僵尸踏上即抵达」）还与 grid.test.ts 的口径（col 0 站着**不算**越过）矛盾。
    // 「哪里可建塔」是 Story 1.5 / 1.12 的规则；本表只锁**命中事实**，9 列全锁。
    // 下标 = 塔所在列索引：col 0 → 1 次（窗口 (0,3] 只等到 col 2）；
    // col 8 → 0 次（窗口 (8,11] 无格，僵尸入场当回合 Δ=0 不满足 `0 <`）。
    const expectedHits = [1, 2, 1, 2, 1, 2, 1, 1, 0]

    for (let col = 0; col <= 8; col += 1) {
      const result = runBattle(towerAt('direct', col), [spawnZombie()])

      expect(
        result.hits,
        `塔在 col${col}（界面「第 ${col + 1} 列」）必须命中 ${expectedHits[col]} 次 —— ` +
          '这张表是实然事实（§0.2 + [CR] P13 扩展），任何数值改动都必须显式重跑并复核，' +
          '移交条目见 deferred-work.md（去向：Story 3.2）。' +
          ` 现象：${result.hits} 次命中 / ${result.damage} 伤害` +
          `${result.damage < ZOMBIE_HP ? '，僵尸带着残血走进房子（单塔打不死）' : ''}`,
      ).toBe(expectedHits[col])
    }
  })

  it('全列事实守卫：打不死的那几列，僵尸带着恰好 50 血抵达房子（col 8 毫发无损带 100 血）', () => {
    // 只断言「打不死」太弱 —— 僵尸可能根本没进射程。这里把残血也钉死：
    // 50 = 1 次命中 × 50，命中次数由上一条锁住，两者互为交叉验证。
    for (const col of [0, 2, 4, 6, 7]) {
      const result = runBattle(towerAt('direct', col), [spawnZombie()])
      expect(
        result.zombies[0]?.hp,
        `塔在 col${col} 单塔打不死 —— 僵尸必须带 50 血进房子（移交 Story 3.2）`,
      ).toBe(50)
      // 战斗收敛时僵尸已**越过** col 0（hasPassedHouse 的口径，[CR] D3），见 grid.test.ts。
      expect(result.zombies[0]?.col, '僵尸必须已越过房子列（负列号）').toBeLessThan(0)
    }

    // col 8 是全表唯一的 0 命中列 —— 僵尸毫发无损地走完全场。
    const untouched = runBattle(towerAt('direct', 8), [spawnZombie()])
    expect(untouched.hits, 'col 8 塔的窗口 (8,11] 没有任何格子，僵尸入场当回合 Δ=0 也不满足 `0 <`').toBe(0)
    expect(untouched.zombies[0]?.hp, 'col 8 的僵尸必须满血走进房子 —— 这一列的塔是纯摆设').toBe(ZOMBIE_HP)
  })
})

// ── AR26 —— 范围塔仅 1 只僵尸时严格劣于直射塔（AC-5 四条子断言）────────────

describe('AR26 —— 范围塔仅 1 只僵尸时严格劣于直射塔（AC-5）', () => {
  // ⚠️ GDD 原文「60 < 100 且 75 > 50」只有两句（单发口径），而实测（§0.4）
  // 范围塔在窗口口径上总伤害 120 > 直射塔 100 —— 只断言 (a) 会让人误以为
  // 「范围塔伤害更低」。**(a)+(c) 一起才构成「严格劣于」的完整语义。**

  it('(a) 单发打不死：60 < 100', () => {
    expect(TOWER_STATS.aoe.damage, '范围塔单发 60 伤害').toBeLessThan(ZOMBIE_HP)
    // 实测：col3 的范围塔窗口只挨 2 次 → 120 伤害，但每发都不足以单独打死一只。
    const firstSwing = applyDamage(spawnZombie(), TOWER_STATS.aoe.damage)
    expect(firstSwing.hp, '单发之后僵尸必须还活着 —— 单发打不死是「严格劣于」的第一层').toBeGreaterThan(0)
  })

  it('(b) 更贵：75 > 50', () => {
    // FR63 档位表造价。断言读 balance.ts 的档位表，不复制字面量 ——
    // Story 2.3 追加第二、三档时，同一条断言会在新档位上直接复用。
    expect(
      costOf('aoe', 1),
      '范围塔造价必须高于直射塔 —— 贵是「严格劣于」的第二层',
    ).toBeGreaterThan(costOf('direct', 1))
  })

  it('(c) 击杀回合数不更少：turnsToKill(aoe) >= turnsToKill(direct)', () => {
    const aoeTower = towerAt('aoe', 3)
    const directTower = towerAt('direct', 3)
    const aoeTurns = turnsToKill(aoeTower)
    const directTurns = turnsToKill(directTower)

    // 实测：直射塔第 3 回合打死（第 2、3 回合各命中一次），
    // 范围塔第 4 回合打死（第 3、4 回合各命中一次）——
    // **命中次数同为 2，击杀回合数范围塔多 1**。
    // 范围塔的覆盖 {2,3,4} 里，僵尸第一回合能落到的最近列是 4（第 3 回合），
    // 而直射塔窗口 {4,5,6} 的最近可达列是 6（第 2 回合）。
    //
    // ⚠️ §0.4 记的「同为 2 回合」说的是**命中 2 次**，不是第 2 回合打死。
    // 两者在 (c) 上的结论一致（范围塔不更少，实测还更慢），但口径必须写清：
    // 将来若有人照 §0.4 的字面去调数值，会以为范围塔在同回合数内输出更低。

    // ⚠️ [CR] P1 前置断言：Infinity >= Infinity 恒为 true —— 没有这两条，
    // 「两塔都打不死」（伤害 / 射程整体失效，最严重的一类变异）会让 (c) 静默保持绿。
    // 这正是本项目「变异验证抓假绿」铁律针对的形态：守卫必须在最该响的时候响。
    expect(
      Number.isFinite(directTurns),
      `直射塔必须能击杀（实测 ${directTurns} 回合）—— 打不死时 (c) 的比较毫无意义`,
    ).toBe(true)
    expect(
      Number.isFinite(aoeTurns),
      `范围塔必须能击杀（实测 ${aoeTurns} 回合）—— 打不死时 (c) 的比较毫无意义`,
    ).toBe(true)

    expect(
      aoeTurns,
      `范围塔击杀回合数必须 ≥ 直射塔 —— 实测 aoe ${aoeTurns} vs direct ${directTurns}，` +
        '打不快是「严格劣于」的第三层',
    ).toBeGreaterThanOrEqual(directTurns)

    // 命中次数必须**同为 2** —— 这是 §0.4 的原话，也是「窗口总伤害 120 vs 100」的来源。
    // 只锁 (c) 的回合数会让人误以为范围塔单次输出更低，而实测它每发更高。
    expect(runBattle(aoeTower, [spawnZombie('a')]).hits, '范围塔窗口命中 2 次（§0.4）').toBe(2)
    expect(runBattle(directTower, [spawnZombie('b')]).hits, '直射塔窗口命中 2 次（§0.4）').toBe(2)
  })

  it('(d) 射程内 2 只僵尸时范围塔才胜出 ——「堆积才赢」（[CR] D1：行为级）', () => {
    // 构造（AC-5 指定）：塔在 col 3，僵尸在索引 4 与索引 2，间距 2 格，两只都在 {2,3,4} 内。
    const pair = () => [
      createZombie({ id: 'z-b', col: 4, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-a', col: 2, hp: ZOMBIE_HP }),
    ]

    // ⚠️ [CR] D1：旧写法在测试里用**被测判据** isInAoe 自己 reduce 出期望值 120 ——
    // 自证结构，且 core 层没有任何可执行的多目标实现；runBattle 当时还把 aoe
    // 退化成单体。Story 1.5 照抄会让范围塔静默变单体塔而全部测试仍绿。
    // 现在：目标集合走 core 层唯一的溅射实现 aoeTargets，伤害走真实 applyDamage。
    const targets = aoeTargets(pair(), 3)
    expect(
      targets.map((z) => z.id),
      '范围塔必须一次锁定覆盖内**两只**（列号升序）—— 溅射语义的源在 core 层 aoeTargets',
    ).toEqual(['z-a', 'z-b'])

    const afterSwing = targets.map((z) => applyDamage(z, TOWER_STATS.aoe.damage))
    expect(afterSwing.map((z) => z.hp), '两只各挨 60：100 → 40，都必须还活着（单发打不死）').toEqual([40, 40])
    const aoeTotal = afterSwing.reduce((sum, z, i) => sum + (targets[i]?.hp ?? 0) - z.hp, 0)
    expect(aoeTotal, '范围塔一回合对 2 只各打 60，共 120 —— 这才是它买贵的理由').toBe(120)

    // 直射塔对同一场面只打得到窗口 (3,6] 里的 col 4 那只。
    const directSwing = selectTarget(pair(), 3, 'direct', TOWER_STATS.direct.range)
    expect(directSwing?.id, '直射塔一回合只打 1 只（窗口内最靠近房子的 col 4）').toBe('z-b')
    expect(TOWER_STATS.direct.damage, '直射塔一回合总伤害只有 50 < 范围塔的 120').toBeLessThan(aoeTotal)

    // 战斗级口径：同一双僵尸场面全程打下来，范围塔的实际总伤害必须高于直射塔 ——
    // Story 1.5 的 turn.ts 落地后，其溅射编排必须与本条口径一致（见 aoeTargets JSDoc）。
    const aoeBattle = runBattle(towerAt('aoe', 3), pair())
    const directBattle = runBattle(towerAt('direct', 3), pair())
    expect(
      aoeBattle.damage > directBattle.damage,
      `双僵尸场面全程实际伤害：aoe ${aoeBattle.damage} 必须 > direct ${directBattle.damage} —— 「堆积才赢」的行为级证明`,
    ).toBe(true)
  })
})

// ── AR27 —— 减速持续 3 回合，被同塔重复命中刷新而非叠加（AC-4.4）────────────

describe('AR27 —— 减速刷新而非叠加（AC-4.4）', () => {
  it('同塔重复命中后 slowTurnsLeft 仍是 3，不是 6', () => {
    const hit = createZombie({ id: 'z', col: 4, hp: ZOMBIE_HP })
    const first = applySlow(hit)
    const second = applySlow(first)

    // 这条错了意味着减速可以无限续期 —— 反复被命中的僵尸永远走不出窗口，
    // 而界面上它只是「走得慢一点」，没有任何异常表现。
    expect(
      second.slowTurnsLeft,
      '被同塔重复命中必须**刷新**为 3 回合，累加成 6 会让减速无限续期',
    ).toBe(SLOW_TURNS)
    expect(second.slowTurnsLeft, 'AR27：减速持续 3 回合').toBe(3)
  })

  it('applySlow 是置位：即使传入的僵尸还剩 2 回合，也刷新回 3', () => {
    // 场景：上一回合命中置 3，本回合移动后剩 2，同一回合内再次命中 → 必须回到 3。
    const worn = { ...createZombie({ id: 'z', col: 4, hp: ZOMBIE_HP }), slowTurnsLeft: 2 }
    expect(applySlow(worn).slowTurnsLeft, '刷新语义：2 → 3，不是 2 + 3 = 5').toBe(3)
  })

  it('applySlow 不改动入参（纯函数）', () => {
    const before = createZombie({ id: 'z', col: 4, hp: ZOMBIE_HP })
    applySlow(before)
    expect(before.slowTurnsLeft, '纯函数不就地改入参 —— 否则同一只僵尸会被重复减速').toBe(0)
  })

  it('applySlow 没有时长参数 —— 减速时长的单一事实源是 SLOW_TURNS（[CR] D2）', () => {
    // 旧签名 applySlow(z, turns) 只接受 SLOW_TURNS 一个合法值（死 API 面），
    // 旧用例「传 0/1/2/4/6 抛错」守的就是那个参数 —— 参数删除后该用例失去对象。
    //
    // ⚠️ [CR] 变异验证抓到的弱守卫（2026-10-13，M-M）：本用例最初只断言
    // `applySlow.length === 1`，而**带默认值的参数不计入 Function.length** ——
    // 把签名改回 `applySlow(zombie, turns: number = SLOW_TURNS)` 时 length 仍是 1，
    // 用例保持绿。弱守卫比它自己声称的力气小，正是变异验证存在的理由。
    // 现在改成双重守卫：类型级契约（下面那行）+ 无默认值参数的运行时兜底。
    const z = createZombie({ id: 'z-sig', col: 4, hp: ZOMBIE_HP })

    // 编译期契约：签名若再接受第二个参数，这行就不再报类型错，
    // `@ts-expect-error` 变成「无用指令」，`npm run typecheck` 当场失败（AC-12 关卡）。
    // 运行时多传的参数会被 JS 忽略 —— 所以这里同时断言「它确实被忽略」。
    // @ts-expect-error applySlow 只接受 (zombie)：减速时长是 balance.ts 的单一事实源
    const result = applySlow(z, 3)
    expect(result.slowTurnsLeft, '多传的时长参数必须被忽略 —— 减速恒为 SLOW_TURNS').toBe(SLOW_TURNS)

    // 运行时兜底：不带默认值的参数会被算进 length —— 覆盖类型级契约之外的另一种回退形态。
    expect(
      applySlow.length,
      'applySlow 不得有第二个（无默认值）参数 —— 回退到死 API 面（[CR] D2）',
    ).toBe(1)
  })

  it('减速期间每回合只走 1 格，且剩余回合数逐回合递减', () => {
    const slowed = applySlow(createZombie({ id: 'z', col: 6, hp: ZOMBIE_HP }))
    const steps: { col: number; left: number }[] = []
    let cur = slowed
    for (let i = 0; i < SLOW_TURNS; i += 1) {
      cur = stepZombie(cur)
      steps.push({ col: cur.col, left: cur.slowTurnsLeft })
    }

    // 6 → 5 → 4 → 3，且剩余回合 2 → 1 → 0：减速在**移动之后**才减，
    // 所以置位 3 的那一回合就能吃到减速（Dev Notes §6 的顺序）。
    expect(steps, '减速期间每回合 1 格，剩余回合数逐回合递减').toEqual([
      { col: 5, left: 2 },
      { col: 4, left: 1 },
      { col: 3, left: 0 },
    ])
  })

  it('未减速时每回合走 2 格', () => {
    const plain = createZombie({ id: 'z', col: 6, hp: ZOMBIE_HP })
    expect(stepZombie(plain).col, '未减速必须走满 2 格').toBe(4)
  })

  it('减速塔单独打不死僵尸（实测移交事实，不是断言）', () => {
    // ⚠️ `gdd.md:234` 写「减速期间停留 6 回合，减速塔自己即可完成击杀（6 × 25 = 150 > 100）」。
    // 实测**证伪**：减速只在 3 个窗口回合里生效，实打 3 次 = 75 < 100。
    // 那条 6 回合的手算链忽略了「僵尸已越过窗口的一半才被减速到」。
    //
    // 🔥 本条锁的是**实然**（且刻意不写成「减速塔能击杀」）——
    // 加一条「减速塔能击杀」的断言等于把一个已被证伪的值焊死。
    // 移交条目见 deferred-work.md，去向 Story 3.2（战斗数值调优）。
    const result = runBattle(towerAt('slow', 3), [spawnZombie()])

    expect(result.hits, '减速塔实测命中 3 次（GDD 手算声称 6 次窗口，已证伪）').toBe(3)
    expect(result.damage, '3 次 × 25 = 75 < 100 —— 减速塔单独打不死僵尸').toBe(75)
    expect(result.zombies[0]?.hp, '僵尸带着 25 残血进房子').toBe(25)
  })
})

// ── AC-4.1 —— 范围塔覆盖是同行 3 格条带，不是圆 ──────────────────────────

describe('AC-4.1 —— 范围塔覆盖形状', () => {
  it('覆盖以塔所在列为中心的 3 格', () => {
    expect(aoeColumns(3), 'col3 的范围塔必须覆盖 {2, 3, 4}').toEqual([2, 3, 4])
    expect(aoeColumns(5), 'col5 的范围塔必须覆盖 {4, 5, 6}').toEqual([4, 5, 6])
  })

  it('绝不是半径 2 的圆（那在同行横跨 5 格，60 × 5 = 300 超模）', () => {
    for (const col of [2, 3, 4, 5, 6]) {
      // 圆会返回 5 列；条带必须恰好 3 列。这是 AC-4.1 的直接表达。
      expect(
        aoeColumns(col).length,
        `col${col} 的范围塔覆盖必须是 3 格 —— 半径 2 的圆会让 60×5=300 伤害、造价形同虚设`,
      ).toBe(3)
    }
  })

  it('覆盖以塔为**中心**，含塔自身列与其左右各 1 格', () => {
    // 范围塔与直射塔的射程形状刻意不同：这里没有「单向」也没有「塔自身列不命中」。
    // 复用 inRange() 会让范围塔漏打塔左侧 1 格。
    expect(isInAoe(3, 2), '塔左侧 1 格在覆盖内').toBe(true)
    expect(isInAoe(3, 3), '塔自身列在覆盖内').toBe(true)
    expect(isInAoe(3, 4), '塔右侧 1 格在覆盖内').toBe(true)
    expect(isInAoe(3, 1), '塔左侧 2 格不在覆盖内').toBe(false)
    expect(isInAoe(3, 5), '塔右侧 2 格不在覆盖内').toBe(false)
  })

  it('覆盖裁剪到网格内：col 0 的塔覆盖 {0, 1}，不返回 -1', () => {
    expect(aoeColumns(0), '-1 不是格子，返回它会让覆盖里凭空多一个格子').toEqual([0, 1])
    expect(aoeColumns(8), 'col 8 的覆盖裁剪到 8').toEqual([7, 8])
  })

  it('越界 towerCol 抛错，不静默返回空覆盖（[CR] P5）', () => {
    // 「裁剪」只对网格内的合法塔列成立；towerCol 本身越界是调用方错误。
    // 静默返回 [] 等于让塔「永远打不到」且没有任何报错指向它（AC-7：只 throw）。
    for (const bad of [-1, 9, 100]) {
      expect(
        () => aoeColumns(bad),
        `towerCol ${bad} 越界必须抛错 —— 静默空覆盖会让塔永远打不到僵尸`,
      ).toThrow()
      expect(() => isInAoe(bad, 4), `isInAoe 对越界 towerCol ${bad} 同样必须抛错`).toThrow()
    }
  })
})

// ── aoeTargets —— 范围塔溅射语义在 core 层的唯一实现（[CR] D1）─────────────

describe('aoeTargets —— 溅射对覆盖内每只结算（[CR] D1）', () => {
  it('返回覆盖内全部存活僵尸，按（列号，id）升序，与输入顺序无关', () => {
    const zs = [
      createZombie({ id: 'z-b', col: 4, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-a', col: 2, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-out', col: 6, hp: ZOMBIE_HP }),
    ]
    expect(
      aoeTargets(zs, 3).map((z) => z.id),
      '覆盖 {2,3,4} 内的两只都必须返回（col 6 在覆盖外）—— 少一只范围塔就退化成单体塔',
    ).toEqual(['z-a', 'z-b'])
    expect(
      aoeTargets([...zs].reverse(), 3).map((z) => z.id),
      '输入顺序不得影响结果 —— 纯函数必须完全确定（AR6 / AR17，存档重放）',
    ).toEqual(['z-a', 'z-b'])
  })

  it('同列并列按 id 字典序（与 selectTarget 同一套 tie-break 口径）', () => {
    const pair = [
      createZombie({ id: 'z-b', col: 3, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-a', col: 3, hp: ZOMBIE_HP }),
    ]
    expect(
      aoeTargets(pair, 3).map((z) => z.id),
      '同列必须按 id 字典序 —— 否则平衡模拟不可复现',
    ).toEqual(['z-a', 'z-b'])
  })

  it('已死僵尸跳过；覆盖内无目标返回空数组', () => {
    const dead = applyDamage(createZombie({ id: 'z-dead', col: 3, hp: 60 }), 60)
    expect(aoeTargets([dead], 3), 'hp = 0 的僵尸不得进目标集 —— 否则塔对空气结算伤害').toEqual([])
    expect(
      aoeTargets([createZombie({ id: 'z-far', col: 7, hp: ZOMBIE_HP })], 3),
      '覆盖外目标返回空数组，本回合不攻击',
    ).toEqual([])
  })

  it('越界 towerCol 与非法僵尸 col 抛错（[CR] P5 / P9 同一校验面）', () => {
    expect(() => aoeTargets([], 9), 'towerCol 越界必须抛错').toThrow()
    const dirty = { id: 'z', col: 3.5, hp: 100, slowTurnsLeft: 0 } as Zombie
    expect(
      () => aoeTargets([dirty], 3),
      '非整数 col 必须抛错 —— 不得静默放行（与 direct 分支的校验面一致）',
    ).toThrow()
  })
})

// ── AC-4.2 —— 射程单向 ────────────────────────────────────────────────────

describe('AC-4.2 —— 射程判定是单向的', () => {
  it('充要条件 0 < targetCol - towerCol <= range', () => {
    const R = TOWER_STATS.direct.range
    expect(inRange(3, 4, R), '右侧 1 格在射程内').toBe(true)
    expect(inRange(3, 5, R), '右侧 2 格在射程内').toBe(true)
    expect(inRange(3, 6, R), '右侧 3 格 = 射程上界，在射程内').toBe(true)
    expect(inRange(3, 7, R), '右侧 4 格超出射程').toBe(false)
    expect(inRange(3, 3, R), '塔自身列不在射程内（射程只覆盖右侧）').toBe(false)
    expect(inRange(3, 2, R), '左侧 1 格不在射程内 —— 僵尸只从右侧接近').toBe(false)
    expect(inRange(3, 0, R), '左侧 3 格不在射程内 —— 射程是单向的').toBe(false)
  })

  it('非法坐标与非法射程抛错（不静默夹取）', () => {
    expect(() => inRange(3, 4.5, 3), '非整数列号必须抛错').toThrow()
    expect(() => inRange(3, NaN, 3), 'NaN 必须抛错').toThrow()
    expect(() => inRange(3, 4, -1), '负射程必须抛错').toThrow()
    expect(() => inRange(3, 4, 1.5), '非整数射程必须抛错').toThrow()
    expect(() => inRange(3, 4, NaN), 'NaN 射程必须抛错 —— Number(NaN) 参与比较恒为 false，会静默变成「永不命中」').toThrow()
  })

  it('负列号合法 —— 僵尸可以已经越过房子', () => {
    // ⚠️ 与 assertInsideGrid 的口径**刻意不同**：网格合法性（0 ~ COLS-1）管的是
    // 「塔能建在哪」，而僵尸必须能走到房子**之外**（grid.ts 的 hasReachedHouse
    // 判的就是负列号）。射程判定作用在可能已经越界的僵尸上，不能把负列号当非法。
    expect(inRange(3, -1, 3), '僵尸在 col -1 时射程判定必须给出确定结果而非抛错').toBe(false)
  })
})

// ── AC-4.3 —— 目标选择确定且可复现 ────────────────────────────────────────

describe('AC-4.3 —— 目标选择', () => {
  it('取射程内列号最小者（最靠近房子）', () => {
    const zombies = [
      createZombie({ id: 'z-far', col: 6, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-near', col: 4, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-mid', col: 5, hp: ZOMBIE_HP }),
    ]
    expect(selectTarget(zombies, 3, 'direct', 3)?.id, '必须打最靠近房子的那只').toBe('z-near')
  })

  it('同列并列时取 id 字典序最小者（纯函数性，AR6 / AR17）', () => {
    // 这半条**不是** GDD 原文，是本 story 补齐的隐含约束。
    // 没有 tie-break 的话，同一输入在不同 JS 引擎 / 不同插入顺序下可能给出不同结果 ——
    // 平衡模拟不可复现，存档重放也对不上。
    const pair = [
      createZombie({ id: 'z-b', col: 5, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-a', col: 5, hp: ZOMBIE_HP }),
    ]
    expect(selectTarget(pair, 3, 'direct', 3)?.id, '同列必须取 id 字典序最小者，与数组顺序无关').toBe('z-a')
    // 打乱输入顺序结果不变 —— 这才是「完全确定」的含义。
    expect(selectTarget([...pair].reverse(), 3, 'direct', 3)?.id, '输入顺序不得影响结果').toBe('z-a')
  })

  it('射程内无僵尸返回 null（本回合不攻击）', () => {
    const zombies = [createZombie({ id: 'z-far', col: 7, hp: ZOMBIE_HP })]
    expect(selectTarget(zombies, 3, 'direct', 3), 'col 7 在 col3 射程外').toBeNull()
    expect(selectTarget([], 3, 'direct', 3), '场上无僵尸时返回 null').toBeNull()
  })

  it('已死的僵尸不是合法目标', () => {
    const dead = applyDamage(spawnZombie('z-dead'), ZOMBIE_HP)
    const alive = createZombie({ id: 'z-alive', col: 4, hp: ZOMBIE_HP })
    expect(
      selectTarget([dead, alive], 3, 'direct', 3)?.id,
      'hp = 0 的僵尸还在数组里只是因为调用方没清理 —— 让它被选中会让塔打空气',
    ).toBe('z-alive')
  })

  it('范围塔选目标同样取列号最小者', () => {
    const pair = [
      createZombie({ id: 'z-far', col: 4, hp: ZOMBIE_HP }),
      createZombie({ id: 'z-near', col: 2, hp: ZOMBIE_HP }),
    ]
    expect(selectTarget(pair, 3, 'aoe', TOWER_STATS.aoe.range)?.id, '范围塔也打最靠近房子的').toBe('z-near')
  })

  it('非法僵尸 col 对 direct 与 aoe 分支同样抛错（[CR] P9：校验面一致）', () => {
    // 旧实现里同一个脏 col：direct 分支经 inRange 抛错，aoe 分支的 includes()
    // 却静默不命中 —— 校验面不一致，脏数据在一种塔型下炸、在另一种塔型下溜过去。
    const dirty = { id: 'z', col: 3.5, hp: 100, slowTurnsLeft: 0 } as Zombie
    expect(() => selectTarget([dirty], 3, 'direct', 3), 'direct 分支必须抛错（经 inRange）').toThrow()
    expect(() => selectTarget([dirty], 3, 'aoe', TOWER_STATS.aoe.range), 'aoe 分支不得静默放行非整数 col').toThrow()
    expect(() => selectTarget([dirty], 3, 'slow', 3), 'slow 分支同 direct，必须抛错').toThrow()
  })

  it('非法塔型抛错，不静默走非 aoe 分支（[CR] P4）', () => {
    const dirty = 'driect' as TowerType // 拼错的脏塔型，只可能来自存档 / 内容 JSON
    expect(
      () => selectTarget([], 3, dirty, 3),
      'selectTarget 必须拦下脏塔型 —— 静默按非 aoe 处理会让错误传播到伤害结算才炸',
    ).toThrow()
  })
})

// ── AC-8 —— 战斗数值只读 towerType，不读 wordId ────────────────────────────

describe('AC-8 —— wordId 绝不参与数值计算', () => {
  it('同 towerType、不同 wordId 的两座塔，计算结果完全相同', () => {
    // 这是架构自认「无工具可强制、只能靠 [CR]`」的 4 条之一
    //（game-architecture.md:1018-1027）—— 测试是这里唯一能建立的机器守卫。
    const dog = towerAt('direct', 3, 'u1-dog')
    const apple = createTower({
      id: 't-direct-apple',
      towerType: 'direct',
      wordId: 'u9-ice-cream',
      row: 2,
      col: 3,
    })

    const a = runBattle(dog, [spawnZombie('z-1')])
    const b = runBattle(apple, [spawnZombie('z-1')])

    expect(dog.wordId !== apple.wordId, '本测试的前提是两个不同的词条').toBe(true)
    expect(a.hits, '两座塔的命中次数必须相同 —— 否则同塔型因绑定词不同而表现不同').toBe(b.hits)
    expect(a.damage, '两座塔的累计伤害必须相同').toBe(b.damage)
    expect(a.turns, '两座塔的战斗回合数必须相同').toBe(b.turns)
  })

  it('三种塔型的伤害/射程与 wordId 无关', () => {
    // 守卫落点直测：damageFor / rangeFor 只读 towerType。
    for (const towerType of ['direct', 'slow', 'aoe'] as const) {
      const dog = createTower({ id: 'a', towerType, wordId: 'u1-dog', row: 2, col: 3 })
      const zebra = createTower({ id: 'b', towerType, wordId: 'u14-zebra', row: 2, col: 3 })
      expect(
        damageFor(dog),
        `${towerType} 塔的伤害必须只由 towerType 决定 —— 读 wordId 会让同一塔型因绑定词不同而表现不同`,
      ).toBe(damageFor(zebra))
      expect(rangeFor(dog), `${towerType} 塔的射程必须与词条无关`).toBe(rangeFor(zebra))
    }
  })

  it('属性表只按塔型索引', () => {
    // 反向检查：TOWER_STATS 的键只有塔型，不该、也不可能按 wordId 取值。
    // ⚠️ [CR] P21：旧写法 keys 排序、values 不排 —— 两列各自隐式依赖对象字面量
    // 的插入顺序（一处测试两种顺序约定），对字面量做无害重排即触发假红。
    // 现在两列出自同一份排序后的 entries。
    const entries = Object.entries(TOWER_STATS).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    expect(entries.map(([type]) => type), '属性表必须只按塔型索引').toEqual(['aoe', 'direct', 'slow'])
    expect(
      entries.map(([, s]) => `${s.damage}/${s.range}`),
      '三塔型的伤害/射程组合必须与词条无关（按塔型名排序：aoe / direct / slow）',
    ).toEqual(['60/2', '50/3', '25/3'])
  })
})

// ── AC-7 —— 逻辑层只 throw，不 catch ─────────────────────────────────────

describe('AC-7 —— 不变量违反时抛错', () => {
  it('血量越界抛错（架构不变量：僵尸血量 ∈ [0, 100]）', () => {
    // 造不出 hp = 150 的合法僵尸（工厂抛错），所以用字面量绕过工厂，
    // 模拟「某个 reducer 手滑写了个越界血量」的场景。
    const tooHigh = { id: 'z', col: 4, hp: 150, slowTurnsLeft: 0 } as Zombie
    expect(() => applyDamage(tooHigh, 50), '血量 150 越界必须抛错，不能被静默修正成 100').toThrow()
    expect(() => stepZombie(tooHigh), '血量 150 越界必须抛错').toThrow()

    const negative = { id: 'z', col: 4, hp: -1, slowTurnsLeft: 0 } as Zombie
    expect(() => applyDamage(negative, 50), '负血量必须抛错').toThrow()
  })

  it('createZombie 拒绝越界血量', () => {
    expect(() => createZombie({ id: 'z', col: 4, hp: 150 }), '工厂必须拒绝越界血量').toThrow()
    expect(() => createZombie({ id: 'z', col: 4, hp: -1 }), '工厂必须拒绝负血量').toThrow()
    expect(() => createZombie({ id: 'z', col: 4, hp: 12.5 }), '工厂必须拒绝非整数血量').toThrow()
  })

  it('createZombie 拒绝超过减速时长的 slowTurnsLeft', () => {
    // > SLOW_TURNS 只可能来自「把刷新写成了累加」—— 那正是本 story 要抓的变异。
    expect(() => createZombie({ id: 'z', col: 4, hp: 100, slowTurnsLeft: 6 }), '6 > 3 只可能是累加实现').toThrow()
    expect(() => createZombie({ id: 'z', col: 4, hp: 100, slowTurnsLeft: -1 }), '负剩余回合必须抛错').toThrow()
  })

  it('createZombie 的类型里没有 row —— 行不变量由工厂写死', () => {
    // 僵尸恒在 ZOMBIE_ROW。类型层面不给 row 字段，任何想改写它的调用方都会编译失败。
    const z = createZombie({ id: 'z', col: 4, hp: 100 })
    expect('row' in z, 'Zombie 不得有 row 字段 —— 僵尸恒在中间行').toBe(false)
    expect(Object.keys(z).sort(), '僵尸的字段集合必须锁死').toEqual(['col', 'hp', 'id', 'slowTurnsLeft'])
  })

  it('负伤害与非整数伤害抛错', () => {
    const z = spawnZombie()
    expect(() => applyDamage(z, -50), '负伤害必须抛错，不能被当成 0 而静默通过').toThrow()
    expect(() => applyDamage(z, 12.5), '非整数伤害必须抛错').toThrow()
  })

  it('createTower 拒绝越界坐标与空 id', () => {
    expect(() => createTower({ id: 't', towerType: 'direct', wordId: 'u1-dog', row: 2, col: 9 }), 'col 越界').toThrow()
    expect(() => createTower({ id: '', towerType: 'direct', wordId: 'u1-dog', row: 2, col: 3 }), '空 id 抛错').toThrow()
    expect(() => createTower({ id: 't', towerType: 'direct', wordId: '', row: 2, col: 3 }), '空 wordId 抛错').toThrow()
  })

  it('createZombie 拒绝超过入场列的 col（[CR] P7）', () => {
    // 旧注释声称「上界由 ZOMBIE_SPAWN_COL 管」而没有任何代码强制 ——
    // col 1000 的僵尸永远在全部塔窗口右侧之外，成为「不死行走模拟器」。
    expect(
      () => createZombie({ id: 'z', col: ZOMBIE_SPAWN_COL + 1, hp: ZOMBIE_HP }),
      'col > 入场列只可能是脏数据 —— 僵尸只从 ZOMBIE_SPAWN_COL 入场',
    ).toThrow()
    expect(() => createZombie({ id: 'z', col: 1000, hp: ZOMBIE_HP }), 'col 1000 必须抛错').toThrow()
    // 边界与下界口径：入场列本身合法；负列号合法（僵尸可以已越过房子）。
    expect(() => createZombie({ id: 'z', col: ZOMBIE_SPAWN_COL, hp: ZOMBIE_HP }), '入场列本身合法').not.toThrow()
    expect(() => createZombie({ id: 'z', col: -3, hp: ZOMBIE_HP }), '负列号合法 —— 下界刻意不设').not.toThrow()
  })

  it('脏塔型全链路抛错，不静默 undefined / TypeError（[CR] P4）', () => {
    const dirty = 'driect' as TowerType // 拼错的脏塔型，只可能来自存档 / 内容 JSON
    expect(() => createTower({ id: 't', towerType: dirty, wordId: 'u1-dog', row: 2, col: 3 }), '工厂必须在数据入口拦下脏塔型').toThrow()
    expect(() => costOf(dirty, 1), 'costOf 静默返回 undefined 会让阳光扣减传播 NaN 且无报错指向').toThrow()
    expect(() => damageOf(dirty), 'damageOf 必须抛受控错误，不是查表 undefined 的 TypeError').toThrow()
    expect(() => rangeOf(dirty), 'rangeOf 必须抛受控错误').toThrow()
  })

  it('runBattle 达到回合上限仍未收敛时抛错，不静默截断（[CR] P11）', () => {
    // maxTurns = 1 时僵尸还活着且在场上（既没死也没越过房子）—— 旧行为是
    // 静默返回截断数据，「打不死的战斗」会伪装成一份看起来正常的事实表。
    expect(
      () => runBattle(towerAt('direct', 3), [spawnZombie()], 1),
      '未收敛必须抛错 —— 静默截断的数据不可信',
    ).toThrow(/收敛/)
  })

  it('applyDamage / stepZombie 是纯函数，不就地改入参', () => {
    const z = spawnZombie()
    applyDamage(z, 50)
    stepZombie(z)
    expect(z, '入参必须原封不动 —— 就地改会让同一只僵尸在场上被结算两次').toEqual({
      id: 'z-1',
      col: ZOMBIE_SPAWN_COL,
      hp: ZOMBIE_HP,
      slowTurnsLeft: 0,
    })
  })
})

// ── 行过滤职责契约（[CR] D4，2026-10-13 用户裁决）─────────────────────────

describe('行过滤职责契约 —— 原语不感知塔的行（[CR] D4）', () => {
  it('row ≠ ZOMBIE_ROW 的塔在原语层行为完全相同 —— 所以行过滤必须发生在编排层', () => {
    // 这是**契约**而非缺陷：战斗原语只收 towerCol、刻意不收 Tower 对象。
    // 「只有 row === ZOMBIE_ROW 的塔参与攻击判定」是 Story 1.5 turn.ts 的职责
    // （见 combat.ts 文件头「行过滤职责」）。本用例把分工钉死：
    // 若未来原语获得了行感知（改签名 / 内部过滤行），这条会当场变红，
    // 迫使那次改动**有意识地**更新契约并通知 turn.ts，而不是悄悄改变职责边界。
    const mid = createTower({ id: 't-mid', towerType: 'direct', wordId: 'u1-dog', row: ZOMBIE_ROW, col: 3 })
    const edge = createTower({ id: 't-edge', towerType: 'direct', wordId: 'u1-dog', row: 0, col: 3 })

    const a = runBattle(mid, [spawnZombie('z')])
    const b = runBattle(edge, [spawnZombie('z')])

    expect(b.hits, '原语只看列号：row 0 与 row 2 的塔命中行为相同（行过滤在编排层，不在这里）').toBe(a.hits)
    expect(b.damage, '原语只看列号：伤害结算与塔的行无关').toBe(a.damage)
    expect(b.turns, '原语只看列号：战斗回合数与塔的行无关').toBe(a.turns)
  })
})
