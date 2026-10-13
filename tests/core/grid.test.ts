/**
 * 网格规格与坐标换算的守卫（Story 1.4 / AC-2 / AC-7）。
 *
 * 守什么：① 网格常量与 0-based 索引基准不被悄悄改成 1-based；
 *        ② AR22「僵尸从第 9 列走到房子 = 4 回合」；
 *        ③ 非法坐标抛错而非被夹取。
 *
 * 为什么这么写：索引基准一旦漂移，**战斗层全部断言会同时变红或同时变绿** ——
 * 而「同时变绿」是最坏的一种：射程窗口整体平移一格，单看任何一条断言都还成立，
 * 只有全列守卫能发现。所以基准的每个常量都单独锁，且注释写明 0-based 的依据。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { describe, expect, it } from 'vitest'

import {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  assertInsideGrid,
  cellKey,
  createZombie,
  hasPassedHouse,
  hasReachedHouse,
  isInsideGrid,
  parseCellKey,
  stepZombie,
} from '../../src/core'

describe('网格规格（AC-2）', () => {
  it('5 行 9 列，僵尸行索引 2', () => {
    // 这三个是架构 :493-496 的逐字锚点。组件的 CSS 网格读的是它们 ——
    // 改了这里而不改 Story 1.10 的 repeat()，战场会静默错位。
    expect(ROWS, 'ROWS 被改动会让 CSS 网格行数与逻辑层不一致').toBe(5)
    expect(COLS, 'COLS 被改动会让 CSS 网格列数与逻辑层不一致').toBe(9)
    expect(ZOMBIE_ROW, 'ZOMBIE_ROW 必须恒为 2（界面「第 3 行」），僵尸只走中间行').toBe(2)
  })

  it('入场列索引 8 = 界面「第 9 列」，房子列索引 0 = 界面「第 1 列」', () => {
    // 裁决 3：内部全 0-based。只有 0-based 能同时满足 gdd.md:238「命中第 6、4 列」
    // 与 gdd.md:243「第 9 列入场、第 1 列是房子」—— 1-based 的轨迹 9→7→5→3→1
    // 永远不经过第 6、4 列，AR21 立即塌成 1 次命中。
    expect(ZOMBIE_SPAWN_COL, '入场列索引被改成 1-based 会让 AR21 的整条轨迹平移').toBe(8)
    expect(HOUSE_COL, '房子列索引必须是 0（0-based 基准）').toBe(0)
  })

  it('入场列与房子列都落在网格内', () => {
    expect(isInsideGrid(ZOMBIE_ROW, ZOMBIE_SPAWN_COL), '入场格必须是合法格子').toBe(true)
    expect(isInsideGrid(ZOMBIE_ROW, HOUSE_COL), '房子格必须是合法格子').toBe(true)
  })
})

describe('AR22 —— 僵尸从第 9 列走到房子 = 4 回合', () => {
  it('起点到房子共 8 格，每回合 2 格 ⇒ 4 回合', () => {
    const distance = ZOMBIE_SPAWN_COL - HOUSE_COL
    const rounds = distance / ZOMBIE_MOVE_PER_ROUND

    // AR22 的原文是「第 9 列 → 第 1 列 = 4 回合」。在 0-based 下就是 8 格 ÷ 2 格/回合。
    // 写成读常量的算式而不是写死 4，是为了让「改了速度却没改这条断言」当场变红 ——
    // 写死 4 的话，速度一改这里还是绿的，而战斗层的窗口全变了。
    expect(distance, '0-based 下起点到房子必须是 8 格（索引 8 → 0）').toBe(8)
    expect(rounds, 'AR22 要求的回合数 —— 僵尸必须 4 回合从入场列走到房子列').toBe(4)
  })

  it('沿轨迹逐格推进（由真实 stepZombie 驱动），第 4 回合正好落在房子所在列', () => {
    // ⚠️ [CR] P2：本用例旧写法是手算 `col -= ZOMBIE_MOVE_PER_ROUND` 循环 ——
    // 全程不触碰被测实现，stepZombie 的步数 / 方向改错它也保持绿（同义反复），
    // AR22 作为五条断言之一就没有了行为级守卫。现在由真实原语驱动。
    // 轨迹 8→6→4→2→0：注意它**落在** col 0 而不是越过它 ——
    // 「踏上房子格」与「越过房子」是两个口径，见下一个 describe。
    let z = createZombie({ id: 'z-walk', col: ZOMBIE_SPAWN_COL, hp: ZOMBIE_HP })
    const visited: number[] = []
    let rounds = 0
    // 有界循环：正常 4 回合收敛。若 stepZombie 反向或步数变 0，僵尸永远走不到房子 ——
    // 无界 while 会挂到 vitest 的 30 秒超时才变红（是红，但慢且噪声大）。
    // 20 是「最坏情况（全程减速 1 格/回合）也够了」的宽裕上限（[CR] 变异验证 M-L 的副产品）。
    const MAX_ROUNDS = 20
    while (!hasReachedHouse(z.col) && rounds < MAX_ROUNDS) {
      z = stepZombie(z)
      visited.push(z.col)
      rounds += 1
    }

    expect(
      rounds < MAX_ROUNDS,
      '僵尸必须在上限内抵达房子 —— stepZombie 反向 / 不移动时这里当场变红，而不是挂到超时',
    ).toBe(true)
    expect(visited, '真实 stepZombie 的推进轨迹必须逐格可复现（8→6→4→2→0）').toEqual([6, 4, 2, 0])
    expect(
      rounds,
      'AR22：必须恰好 4 回合从入场列走到房子 —— stepZombie 的步数或方向被改，这里当场变红',
    ).toBe(4)
    expect(z.col, '第 4 回合结束时僵尸必须正好站在房子列上').toBe(HOUSE_COL)
  })
})

describe('抵达房子的判定（AC-2 口径 + [CR] D3：两个口径两个函数）', () => {
  it('hasPassedHouse 判「越过房子」，即 col < HOUSE_COL（AC-2 的字面判据）', () => {
    // AC-2 逐字要求抵达判定为 `col < HOUSE_COL`，且**明令不是** `col < 1`
    // （后者是 balance-scan.py 的 nxt < 1，混用了 1-based 房子判定）。
    // [CR] D3 裁决（2026-10-13）：该判据改名 hasPassedHouse（名实相符），
    // hasReachedHouse 让给「踏上房子格」（col <= HOUSE_COL）—— 旧名在全部
    // 已知未来用途里都是陷阱（详见 grid.ts 的函数注释）。
    expect(hasPassedHouse(0), 'col 0 是「正站在房子格上」，按 col < HOUSE_COL 口径不算已越过').toBe(false)
    expect(hasPassedHouse(-1), 'col -1 已越过房子，必须为 true —— 清场 / 移除判定用它').toBe(true)
  })

  it('hasReachedHouse 判「踏上房子格」，即 col <= HOUSE_COL —— Story 1.5 丢心用它', () => {
    expect(hasReachedHouse(1), 'col 1 离房子还有一格，不算抵达').toBe(false)
    expect(
      hasReachedHouse(0),
      'col 0 正站在房子格上必须判抵达 —— 这是丢心口径；用错函数僵尸会站上房子不掉心、关卡永不失败',
    ).toBe(true)
    expect(hasReachedHouse(-1), '越过房子自然也算抵达').toBe(true)
  })

  // 📎 两个口径差一步（旧移交 #3 的分界，[CR] D3 已拆成两个名实相符的函数）：
  // 「踏上房子格」（col <= 0，第 4 回合）丢心用 hasReachedHouse；
  // 「越过房子」（col < 0，第 5 回合）清场用 hasPassedHouse。
  it('踏上房子格与越过房子是两个不同的事件，相差一步', () => {
    expect(hasReachedHouse(HOUSE_COL), '踏上房子格：抵达 = true').toBe(true)
    expect(hasPassedHouse(HOUSE_COL), '踏上房子格：越过 = false（还没走过去）').toBe(false)
    expect(hasPassedHouse(HOUSE_COL - ZOMBIE_MOVE_PER_ROUND), '越过一整步后：两个口径都为 true').toBe(true)
  })

  it('两个函数对非整数列号都抛错（不静默夹取）', () => {
    expect(() => hasReachedHouse(1.5), '坐标非整数必须抛错，静默夹取会让轨迹出现半格').toThrow()
    expect(() => hasPassedHouse(NaN), 'NaN 必须抛错').toThrow()
  })
})

describe('格子键往返（AC-2）', () => {
  it('cellKey → parseCellKey 对全网格无损往返', () => {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        expect(parseCellKey(cellKey(row, col)), `格子 (${row},${col}) 往返丢失了坐标`).toEqual({
          row,
          col,
        })
      }
    }
  })

  it('僵尸行与入场格的键可预期', () => {
    expect(cellKey(ZOMBIE_ROW, ZOMBIE_SPAWN_COL), '僵尸入场格的键格式必须是「行,列」').toBe('2,8')
  })

  it('非法键抛错，不静默解析成默认格子', () => {
    // 静默返回 null 会让 Store 把非法键当成「空格」——
    // 一次键格式不匹配就会表现为「塔凭空消失」，且没有任何报错指向它。
    for (const bad of ['', '2', '2,', ',2', '2,8,9', 'a,b', '2,08x', ' 2,8']) {
      expect(() => parseCellKey(bad), `非法键 "${bad}" 必须抛错，不能被静默解析`).toThrow()
    }
  })

  it('格式合法但越界或非规范形态的键同样抛错（[CR] P6）', () => {
    // '02,8' / '-0,3' 能过正则、也能解析成合法坐标，但 cellKey 永不产出这种形态 ——
    // 同一格子出现两种键，Story 1.5 的 Store 按规范键索引时非规范键会静默失配，
    // 表现与上一条注释里的「塔凭空消失」一模一样。
    // '9,0' / '-1,3' / '5,9' 是「格式合法但坐标越界」—— 旧用例只测了格式非法这一半。
    for (const bad of ['9,0', '-1,3', '5,9', '02,8', '-0,3', '007,1', '0,09']) {
      expect(
        () => parseCellKey(bad),
        `键 "${bad}" 必须抛错 —— 越界与非规范形态（前导零 / -0）都不合法`,
      ).toThrow()
    }
  })
})

describe('非法坐标抛错（AC-7）', () => {
  it('isInsideGrid 对越界与非整数一律返回 false', () => {
    expect(isInsideGrid(0, 0), '左上角是合法格子').toBe(true)
    expect(isInsideGrid(ROWS - 1, COLS - 1), '右下格是合法格子').toBe(true)
    expect(isInsideGrid(-1, 0), 'row 越界').toBe(false)
    expect(isInsideGrid(0, COLS), 'col 越界').toBe(false)
    expect(isInsideGrid(1.5, 0), '非整数不是合法坐标，不是有边界的合法坐标').toBe(false)
  })

  it('assertInsideGrid 对越界抛错', () => {
    expect(() => assertInsideGrid(-1, 0), '越界坐标必须抛错（塔会被静默建到网格外且永远打不到僵尸）').toThrow()
    expect(() => assertInsideGrid(0, COLS), '越界坐标必须抛错').toThrow()
    expect(() => assertInsideGrid(ROWS, 0), '越界坐标必须抛错').toThrow()
  })

  it('assertInsideGrid 对非整数抛错', () => {
    // Number('') === 0 这类「悄悄变成 0」的路径是同类 bug 的温床，必须挡掉。
    expect(() => assertInsideGrid(0.5, 0), '非整数 row 必须抛错').toThrow()
    expect(() => assertInsideGrid(0, NaN), 'NaN 必须抛错').toThrow()
    expect(() => assertInsideGrid(0, Infinity), 'Infinity 必须抛错').toThrow()
  })

  it('合法坐标不抛错', () => {
    // [CR] P10：AC-11 要求每条断言带中文失败原因 —— 这两条旧写法漏了。
    expect(() => assertInsideGrid(0, 0), '左上角 (0,0) 是合法坐标，抛错说明边界校验写反了').not.toThrow()
    expect(
      () => assertInsideGrid(ROWS - 1, COLS - 1),
      '右下角是合法坐标，抛错说明上界用了开区间之外的口径',
    ).not.toThrow()
  })
})
