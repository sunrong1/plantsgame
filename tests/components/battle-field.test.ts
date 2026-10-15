/**
 * @vitest-environment jsdom
 */

/**
 * 战场组件的守卫（Story 1.10 / AC-5、AC-6、AC-7、AC-12、AC-14、AC-15）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * · **G14** `.battle-grid` 的 `repeat(N, 1fr)` 与 `aspect-ratio` 与网格常量同源
 *   —— 变异 M42
 * · **G15** 组件层「不得直接读战斗数值」的 ESLint 规则**内容** —— 变异 M46
 * · **G17** 战场恰好 45 格，且 45 个 `(row, col)` 组合与合法集**完全相等**
 *   —— 变异 M43
 * · **G17b** 渲染出的僵尸元素数 === `state.zombies.length`（静默吞实体那条教训）
 * · **G18** 房子格渲染成**最左列**、入场格渲染成**最右列** —— 变异 M44
 * · **G19** 组件源码里不出现裸的血量算术
 *
 * ── 为什么按文件加 jsdom（裁决 2）────────────────────────────────────────
 *   全局 `environment` 保持 `'node'`：纯逻辑测试（core/、content/、脚本守卫）
 *   不该为 DOM 环境付开销。只有 mount SFC 的文件才需要 jsdom。
 *   ⚠️ **别把这个文件的环境改成全局的** —— 那会让 21 个测试文件全部慢一截，
 *   而收益为零。
 *
 * ── 组件测试只测「渲染与事件转发」，不测业务逻辑（AC-15 ⑤）────────────────
 *   `[GA]:954-956` 逐字：「逻辑层已覆盖的部分重复测一遍只会产生**虚假的信心**」。
 *   ⇒ 本文件**不**断言「点一下会发生什么战斗结果」—— 那些属于 `tests/core/`。
 *   它断言的是「state 长这样时，DOM 长那样」。
 *
 * ── 判据纪律（Story 1.9 的 P0）────────────────────────────────────────────
 *   每条判据都只有**一份实现**（本文件顶部的 `g14Violation` / `g15Violation` /
 *   `g19Violation`），真守卫与变异用例问的是**同一个函数**。
 */

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { state } from '../../src/app/store'
import BattleField from '../../src/components/battle/BattleField.vue'
import {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  cellKey,
  createTower,
  createZombie,
} from '../../src/core'
import type { State, Tower as TowerEntity, Zombie as ZombieEntity } from '../../src/core'
import { makeSyntheticDeck } from '../fixtures/synthetic-deck'
import { optionsOf, patternStrings, rulesFor, severityOf } from '../fixtures/eslint-rules'

// 组件**源码**用 Vite 的 `?raw` 导入 —— jsdom 下 `import.meta.url` 是 http:// URL，
// `fileURLToPath()` 会抛 `TypeError: The URL must be of scheme file`。
// `?raw` 由模块自身位置决定，与 cwd 和运行环境都无关（见 tests/types/raw-import.d.ts）。
import battleFieldSource from '../../src/components/battle/BattleField.vue?raw'
import towerSource from '../../src/components/battle/Tower.vue?raw'
import zombieSource from '../../src/components/battle/Zombie.vue?raw'
import levelViewSource from '../../src/views/LevelView.vue?raw'

/** 剥掉块注释与行注释，只留代码 —— 源码匹配的强制前置（同 asset-url-guard.test.ts）。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')
}

// ── 测试用的 state 组装 ──────────────────────────────────────────────────────

/**
 * 造一份**结构合法**的 `State` 供渲染。
 *
 * ⚠️ **刻意不走 `reduce` 跑一遍完整回合** —— 那是在重复测 reducer，而 reducer
 *   在 `tests/core/` 已有自己的守卫。这里要的是「给定 state，DOM 长什么样」，
 *   所以直接用 `createTower` / `createZombie` 工厂（它们带真实校验，
 *   越界坐标会抛）拼出战场。
 */
function makeState(towers: readonly TowerEntity[], zombies: readonly ZombieEntity[]): State {
  const deck = makeSyntheticDeck(3, 1)
  const grid: Record<string, string> = {}
  for (const tower of towers) grid[cellKey(tower.row, tower.col)] = tower.id

  return {
    unitNumber: 1,
    phase: { kind: 'awaiting-answer', question: deck[0] },
    turn: 1,
    hearts: 3,
    sun: 50,
    grid,
    towers,
    zombies,
    deck,
    masteredEntryIds: [],
    unlocked: [],
  }
}

function emptyState(): State {
  return makeState([], [])
}

// ══════════════════════════════════════════════════════════════════════════════
// G14 —— CSS Grid 的重复次数与 aspect-ratio 与网格常量同源
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G14 的判据 —— **真守卫与 M42 共用同一份**。
 *
 * 判据：`.battle-grid` 上的 `grid-template-columns: repeat(N, 1fr)` 里 `N === COLS`，
 * 且 `aspect-ratio: A / B` 里 `A === COLS`、`B === ROWS`。
 *
 * ⚠️ 为什么必须同时校验 `A` 与 `B`：容器宽高比若写反（`5 / 9`），格子会变成竖条，
 *   而**单看分母**（`ROWS === 9` 不成立）会红、单看 `repeat` 却全绿 ——
 *   只校验一条等于没校验。
 *
 * ⚠️ 为什么不用「格子个数」当判据：`.battle-cell` 的个数由 DOM 结构决定，
 *   与 CSS 的 `repeat()` 毫无关系 —— 拿它当判据就是「对着 5 个元素的图数出 5」，
 *   恒等于真。
 */
export function g14Violation(css: string, cols: number, rows: number): string | null {
  const code = stripComments(css)

  const repeatMatch = /grid-template-columns:\s*repeat\(\s*(\d+)\s*,\s*1fr\s*\)/.exec(code)
  if (repeatMatch === null) {
    return '读不到 .battle-grid 的 grid-template-columns: repeat(N, 1fr) —— G14 无从取 N'
  }
  const n = Number(repeatMatch[1])
  if (n !== cols) {
    return `repeat() 的重复次数 ${n} ≠ COLS ${cols} —— 改了 src/core/grid.ts 的 COLS 而没同步这里，战场会静默错位`
  }

  const ratioMatch = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*;/.exec(code)
  if (ratioMatch === null) {
    return '读不到 .battle-grid 的 aspect-ratio: A / B —— 格子无法保持正方形，塔与僵尸会被拉伸'
  }
  const [a, b] = [Number(ratioMatch[1]), Number(ratioMatch[2])]
  if (a !== cols || b !== rows) {
    return `aspect-ratio ${a} / ${b} 应当是 ${cols} / ${rows}（列 / 行）—— 写反了格子就不是正方形`
  }

  return null
}

describe('G14 —— .battle-grid 的重复次数与 aspect-ratio 与网格常量同源', () => {
  const css = battleFieldSource

  it('BattleField.vue 的 CSS 通过 G14', () => {
    expect(g14Violation(css, COLS, ROWS)).toBeNull()
  })

  it('M42：把 repeat() 的次数改坏（不同步 COLS），G14 必须红', () => {
    // 用**真实文件**当底稿，只把 `repeat(9, 1fr)` 换成 `repeat(12, 1fr)` ——
    // 这正是「COLS 从 9 改成 12 而忘了同步 CSS」留下的样子。
    const mutated = css.replace(/repeat\(\s*(\d+)\s*,\s*1fr\s*\)/, `repeat(${COLS + 3}, 1fr)`)

    expect(g14Violation(mutated, COLS, ROWS)).toContain('重复次数')
  })

  it('M42 的反向：aspect-ratio 写反（行 / 列），G14 也必须红', () => {
    const mutated = css.replace(/aspect-ratio:\s*9\s*\/\s*5\s*;/, 'aspect-ratio: 5 / 9;')

    expect(g14Violation(mutated, COLS, ROWS)).toContain('格子就不是正方形')
  })

  it('反向：把 COLS 改坏而 CSS 不动，G14 必须红（这才是 M42 真正的形态）', () => {
    // 前面两条改的是 CSS；这一条改的是**常量**。守卫必须对两者都敏感，
    // 否则「只从网格侧改」或「只从样式侧改」都能溜过去。
    expect(g14Violation(css, COLS + 3, ROWS)).toContain('≠ COLS')
    expect(g14Violation(css, COLS, ROWS + 2)).toContain('aspect-ratio')
  })

  it('反向：读不到 repeat() 时必须报「无从取 N」而不是静默通过', () => {
    expect(g14Violation('.battle-grid { display: grid; }', COLS, ROWS)).toContain('无从取 N')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G15 —— 组件不得直接读战斗数值（ESLint 规则的内容）
// ══════════════════════════════════════════════════════════════════════════════

/** `src/components/**` 上 `no-restricted-imports` 的实际 glob。 */
const COMPONENT_GLOB = 'src/components/**/*.{ts,vue}'

/**
 * G15 的判据 —— **真守卫与 M46 共用同一份**。
 *
 * 判据：规则存在、严重级别是 `error`、且 `patterns` 里禁掉了 `core/balance`。
 *
 * ⚠️ 为什么断言「内容」而不是「规则存在」：`[CR]` 实抓过一条假绿 ——
 *   守卫只断言「规则存在且含 vue」，而 core 从来不在禁列里，于是给 `schema.ts`
 *   加一行 `import { TOWER_TYPES } from '../core/balance'` 时**全部测试仍全绿**。
 *   「规则在」与「规则禁了该禁的」是两件事。
 */
export function g15Violation(rule: unknown): string | null {
  if (rule === undefined) return 'src/components/** 上没有 no-restricted-imports 规则'
  if (severityOf(rule) !== 'error') {
    return `严重级别是 ${String(severityOf(rule))} 而不是 error —— eslint . 不带 --max-warnings，warn 不会让 lint 失败，防线等于没有`
  }
  const patterns = patternStrings(optionsOf(rule))
  if (!patterns.some((p) => p.includes('core/balance'))) {
    return (
      `禁列里没有 core/balance（当前禁的是：${patterns.join(' / ') || '空'}）—— ` +
      '组件可以直接 import 战斗数值常量，漂移风险是全项目最高的（[GA]:1029）'
    )
  }
  return null
}

describe('G15 —— 组件不得直接读战斗数值', () => {
  it('src/components/** 上禁掉了 core/balance，且严重级别是 error', () => {
    const rule = rulesFor(COMPONENT_GLOB)['no-restricted-imports']

    expect(g15Violation(rule)).toBeNull()
  })

  it('M46：把 core/balance 从禁列里去掉，G15 必须红', () => {
    // 从**真实规则**出发，把禁 core/balance 的那几条 pattern 删掉 ——
    // 问的还是同一个 g15Violation。
    const rule = rulesFor(COMPONENT_GLOB)['no-restricted-imports']
    const options = optionsOf(rule)
    const stripped = {
      ...options,
      patterns: (options?.patterns ?? []).filter((p: string | { group: string[] }) =>
        patternStrings({ patterns: [p] }).every((s) => !s.includes('core/balance')),
      ),
    }

    // 先确认这次变异**真的改到了东西** —— 否则下面那条红是因为别的原因，
    // 而「变异有没有生效」本身没人守，是守卫测试的经典盲区。
    expect(patternStrings(options).some((s) => s.includes('core/balance'))).toBe(true)
    expect(patternStrings(stripped).some((s) => s.includes('core/balance'))).toBe(false)
    expect(stripped.patterns).toHaveLength((options?.patterns ?? []).length - 1)

    expect(g15Violation(['error', stripped])).toContain('禁列里没有 core/balance')
  })

  it('M46 的反向：把 error 降成 warn，G15 必须红', () => {
    // `eslint .` 不带 `--max-warnings`，所以 warn 在 CI 上**不会**让 lint 失败。
    // `[CR]` 把它列为三条真实回归之一。
    expect(g15Violation(['warn', optionsOf(rulesFor(COMPONENT_GLOB)['no-restricted-imports'])])).toContain(
      '严重级别',
    )
  })

  it('反向：规则整个不存在，G15 必须报「没有规则」而不是通过', () => {
    expect(g15Violation(undefined)).toContain('没有 no-restricted-imports 规则')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G17 / G17b / G18 —— 渲染出的战场结构
// ══════════════════════════════════════════════════════════════════════════════

describe('G17 —— 战场恰好 45 格，且坐标组合与合法集完全相等', () => {
  beforeEach(() => {
    state.value = emptyState()
  })

  it('渲染出 ROWS × COLS 个 .battle-cell', () => {
    const wrapper = mount(BattleField)

    expect(wrapper.findAll('.battle-cell')).toHaveLength(ROWS * COLS)
  })

  it('45 个 (data-row, data-col) 组合与 parseCellKey 的合法集完全相等（不多不少）', () => {
    const wrapper = mount(BattleField)
    const rendered = wrapper
      .findAll('.battle-cell')
      .map((cell) => cell.attributes('data-row') + ',' + cell.attributes('data-col'))

    // 独立枚举：不是从被测代码的同一份循环里推出来的，而是用 core 的
    // cellKey 重新生成一遍。若 `BattleField` 的遍历漏了一格或重复一格，
    // 两个集合就会不等。
    // ⚠️ 必须是**集合相等**而不是「元素个数相等」——
    //   44 个唯一坐标 + 1 个重复坐标同样是 45 个元素。
    const legal = new Set<string>()
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) legal.add(cellKey(row, col))
    }

    expect(new Set(rendered).size, '有格子渲染成了同一个 key —— 45 格静默变成了 44 格').toBe(legal.size)
    expect(new Set(rendered)).toEqual(legal)
  })

  it('M43：让两格渲染成同一个 key，G17 必须红', () => {
    // 判据是上面那条「集合相等」。这里问的是判据本身：
    // 把最后一格的坐标改成第一格的，集合立刻少一个元素。
    const legal = new Set<string>()
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) legal.add(cellKey(row, col))
    }
    const mutated = [...legal]
    mutated[mutated.length - 1] = cellKey(0, 0)

    expect(new Set(mutated).size).not.toBe(legal.size)
    expect(new Set(mutated)).not.toEqual(legal)
  })

  it('DOM 顺序是行优先（先左到右，再下一行）—— G18 判据的前提', () => {
    const wrapper = mount(BattleField)
    const cols = wrapper.findAll('.battle-cell').map((cell) => Number(cell.attributes('data-col')))

    for (let i = 0; i < cols.length; i += 1) {
      expect(cols[i], `第 ${i} 格的列号不是行优先顺序的第 ${i % COLS} 列`).toBe(i % COLS)
    }
  })
})

describe('G17b —— 一只僵尸都不许被静默吞掉', () => {
  beforeEach(() => {
    state.value = emptyState()
  })

  it('空战场渲染出 0 只僵尸', () => {
    expect(mount(BattleField).findAll('[data-zombie]')).toHaveLength(0)
  })

  it('每只 state.zombies 里的僵尸都渲染出且只渲染出一个元素', () => {
    // Story 1.7 踩过 `balance-scan.py` 按位置键入 `dict[col]` **静默吞僵尸**的坑，
    // 得出过错的失败门槛。渲染层同理：`find` 只取第一只会让同列的第二只消失。
    const zombies = [createZombie({ id: 'z1', col: 8, hp: 100 }), createZombie({ id: 'z2', col: 6, hp: 100 })]
    state.value = makeState([], zombies)

    const rendered = mount(BattleField).findAll('[data-zombie]')

    expect(rendered).toHaveLength(zombies.length)
    // ⚠️ 比**集合**而不是比数组顺序 —— DOM 顺序由网格的行列决定（col 6 的格
    //   在 col 8 的格之前），与 `state.zombies` 的数组顺序无关。
    //   比顺序会把它变成一条「数组顺序必须等于网格顺序」的假约束。
    expect([...rendered.map((el) => el.attributes('data-zombie'))].sort()).toEqual(['z1', 'z2'])
  })

  it('两只僵尸在同一列时，两只都渲染出来（filter 而非 find 的直接证据）', () => {
    // 这是「静默吞实体」最现实的形态：`zombiesAt()` 若写成
    // `state.value.zombies.find(z => z.col === cell.col)`，同一列的第二只就消失，
    // 而界面上只是「僵尸好像变少了」—— 没有任何报错。
    const zombies = [createZombie({ id: 'zA', col: 8, hp: 100 }), createZombie({ id: 'zB', col: 8, hp: 100 })]
    state.value = makeState([], zombies)

    const rendered = mount(BattleField).findAll('[data-zombie]')

    expect(rendered).toHaveLength(2)
    expect(rendered.map((el) => el.attributes('data-zombie')).sort()).toEqual(['zA', 'zB'])
    // 反向：只渲染一只的情形下计数确实会不等 —— 证明上面不是「有两只就必过」。
    const single = makeState([], [zombies[0]])
    expect(mountBattleFieldWith(single).findAll('[data-zombie]')).toHaveLength(1)
  })
})

describe('G18 —— 房子在最左列、入场在最右列（空间位置即判据，不依赖可见列号）', () => {
  beforeEach(() => {
    state.value = emptyState()
  })

  it('房子格是网格的第一个格子，且它的 data-col === HOUSE_COL（0）', () => {
    const wrapper = mount(BattleField)
    const cells = wrapper.findAll('.battle-cell')

    expect(cells[0].attributes('data-col')).toBe(String(HOUSE_COL))
    expect(cells[0].find('[data-house]').exists()).toBe(true)
    expect(cells[0].classes()).toContain('is-house')
  })

  it('入场格是网格的最后一个格子，且它的 data-col === ZOMBIE_SPAWN_COL（8）', () => {
    const wrapper = mount(BattleField)
    const cells = wrapper.findAll('.battle-cell')

    expect(cells[cells.length - 1].attributes('data-col')).toBe(String(ZOMBIE_SPAWN_COL))
    expect(cells[cells.length - 1].classes()).toContain('is-spawn')
  })

  it('每一行的第 1 格都是房子格、第 9 格都是入场格', () => {
    const wrapper = mount(BattleField)
    const cells = wrapper.findAll('.battle-cell')

    for (let row = 0; row < ROWS; row += 1) {
      expect(cells[row * COLS].attributes('data-row')).toBe(String(row))
      expect(cells[row * COLS].attributes('data-col')).toBe(String(HOUSE_COL))
      expect(cells[row * COLS + ZOMBIE_SPAWN_COL].attributes('data-col')).toBe(String(ZOMBIE_SPAWN_COL))
    }
  })

  it('M44：僵尸的列号按 0-based 渲染（把 col 当 1-based 会让房子跑到第 0 格）', () => {
    // 逐只僵尸核对它落在**哪个格子**里。这是 M44 可执行的形态：
    // 若渲染层把 `zombie.col` 当成界面列号（col + 1），
    // 那么 col 4 的僵尸会出现在 data-col="5" 的格子里 ⇒ 立刻红。
    const zombies = [
      createZombie({ id: 'z-house', col: HOUSE_COL, hp: 100 }),
      createZombie({ id: 'z-mid', col: 4, hp: 100 }),
      createZombie({ id: 'z-spawn', col: ZOMBIE_SPAWN_COL, hp: 100 }),
    ]
    state.value = makeState([], zombies)
    const wrapper = mount(BattleField)

    for (const zombie of zombies) {
      const element = wrapper.find(`[data-zombie="${zombie.id}"]`)
      expect(element.exists(), `僵尸 ${zombie.id} 没有渲染出来`).toBe(true)
      const host = element.element.closest('.battle-cell')
      expect(host, `僵尸 ${zombie.id} 不在任何 .battle-cell 里`).not.toBeNull()
      expect(
        host?.getAttribute('data-col'),
        `僵尸 ${zombie.id} 的 col=${zombie.col} 被渲染到了别的列 —— 0-based / 1-based 混用`,
      ).toBe(String(zombie.col))
      expect(host?.getAttribute('data-row')).toBe(String(ZOMBIE_ROW))
    }
  })

  it('僵尸永远落在 ZOMBIE_ROW 那��行（Zombie 类型没有 row 字段可读）', () => {
    const state_ = makeState([], [createZombie({ id: 'z1', col: 4, hp: 100 })])
    const wrapper = mountBattleFieldWith(state_)

    const host = wrapper.find('[data-zombie="z1"]').element.closest('.battle-cell')
    expect(host?.getAttribute('data-row')).toBe(String(ZOMBIE_ROW))
  })

  it('反向：把 HOUSE_COL 与 ZOMBIE_SPAWN_COL 对调，G18 的前提就反了（证明判据不是恒真）', () => {
    // 两条判据都是「与常量一致」。若有人把两个常量的语义对调
    // （房子在最右、僵尸从最左来），下面这条会红。
    const wrapper = mount(BattleField)
    const cells = wrapper.findAll('.battle-cell')

    // 当前实现里，界面第 1 列（索引 0）必须是房子格。
    expect(cells[0].classes()).toContain('is-house')
    // 若 HOUSE_COL 被改成 8，上面的 M44 那条会先红。
    expect(HOUSE_COL).toBe(0)
    expect(ZOMBIE_SPAWN_COL).toBe(COLS - 1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G19 —— 组件里不出现战斗规则算术
// ══════════════════════════════════════════════════════════════════════════════

/** 组件源码里不许出现的血量算术形态。 */
const HP_ARITHMETIC = [
  /\.hp\s*\/\s*\d+/,
  /\.hp\s*\*\s*/,
  /hp\s*\/\s*ZOMBIE_HP/,
  /ZOMBIE_HP\s*\/\s*/,
  /hp\s*<=\s*0/,
]

/** G19 的判据 —— 真守卫与变异共用。 */
export function g19Violation(source: string): string | null {
  const code = stripComments(source)
  for (const pattern of HP_ARITHMETIC) {
    if (pattern.test(code)) return `组件里出现了血量算术（匹配 ${pattern.source}）—— 用 core/ 的 zombieHpRatio()`
  }
  return null
}

describe('G19 —— 组件里不出现血量算术', () => {
  it.each([
    ['BattleField.vue', battleFieldSource],
    ['Tower.vue', towerSource],
    ['Zombie.vue', zombieSource],
    ['LevelView.vue', levelViewSource],
  ])('%s 源码不含裸的血量算术', (_name, source) => {
    expect(g19Violation(source)).toBeNull()
  })

  it('Zombie.vue 确实用了 zombieHpRatio()（证明上面那条不是「文件里什么都没有」的空绿）', () => {
    const code = stripComments(zombieSource)

    expect(code).toContain('zombieHpRatio')
    expect(code).toContain('hpRatio')
  })

  it('反向：把 zombieHpRatio(zombie) 展开成 zombie.hp / 100，G19 必须红', () => {
    const mutated = 'const hpRatio = zombie.hp / 100'

    expect(g19Violation(mutated)).toContain('血量算术')
  })

  it('反向：注释里出现同样的写法不算违规（剥注释是所有匹配的前置）', () => {
    expect(g19Violation('// 这里本可以写 zombie.hp / 100，但那是漂移\nconst x = 1')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G20 —— `<img>` 不许靠 `width/height: auto` 去「撑满 inset 框」
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G20 的判据 —— 真守卫与变异共用同一个函数。
 *
 * ⚠️ **这条守卫是被真浏览器核对逼出来的**（`[DS]` Story 1.10 收尾）：
 *   `<img>` 是**替换元素**，`width: auto` 解析成的是**图自身固有尺寸**
 *   （SVG 是 `viewBox="0 0 512 512"` ⇒ 512px），而不是「撑满 `inset` 框」。
 *   于是 `inset: 6%` 看着在缩进，实际整只图以 512px 从格子的定位原点画出去。
 *   症状：塔**全部消失**（跑到屏幕外），僵尸在战场右边平白多出一只巨大的。
 *
 * ⚠️ 为什么 jsdom 抓不到：jsdom **没有布局引擎**，`clientWidth` 恒为 0，
 *   任何关于尺寸的 DOM 断言在 jsdom 里都是空的。真浏览器核对（AC-16）是唯一
 *   能发现它的手段 —— 所以除了那条人工核对，这里再加一条**源码级**守卫，
 *   让同一个错误第二次出现时不必再靠人眼。
 *
 * ⚠️ 判据为什么不是「有没有写 width」而是「有没有写 `auto`」：
 *   `width: 100%`、`width: 88%`、`width: 10px` 都不会触发这个 bug；
 *   触发它的**精确**形态就是 `auto`。拦 `auto` 不会误伤正确写法。
 */
const REPLACED_AUTO_SIZING = /\b(?:width|height)\s*:\s*auto\b/g

export function g20Violation(source: string): string | null {
  const code = stripComments(source)
  const hits = code.match(REPLACED_AUTO_SIZING)
  if (hits !== null) {
    return (
      `组件给 <img> 写了 ${[...new Set(hits)].join('、')} —— ` +
      '替换元素的 `auto` 是图自身固有尺寸（512px），不是「撑满 inset 框」，' +
      '资产会整只画到格子外面去。要写显式百分比并配 object-fit。'
    )
  }
  return null
}

describe('G20 —— <img> 的尺寸不许交给 auto', () => {
  it.each([
    ['Tower.vue', towerSource],
    ['Zombie.vue', zombieSource],
  ])('%s 不含 width/height: auto', (_name, source) => {
    expect(g20Violation(source)).toBeNull()
  })

  it('两份源码确实都画了 <img>（证明上面不是「文件里什么都没有」的空绿）', () => {
    expect(stripComments(towerSource)).toContain('<img')
    expect(stripComments(zombieSource)).toContain('<img')
  })

  it('反向：把 width/height 改回 auto，G20 必须红', () => {
    const mutated = stripComments(zombieSource).replace('width: 88%;', 'width: auto;')

    expect(g20Violation(mutated)).toContain('替换元素')
  })

  it('反向：注释里出现 auto 不算违规（剥注释是所有匹配的前置）', () => {
    expect(g20Violation('/* 这里曾写成 width: auto，那是替换元素的坑 */\n.z { inset: 6% }')).toBeNull()
  })

  it('反向：显式百分比不误伤', () => {
    expect(g20Violation('.z { inset: 6%; width: 88%; height: 88%; object-fit: contain }')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// AC-8 —— 加载失败静默降级（结转 art-direction §4.4）
// ══════════════════════════════════════════════════════════════════════════════

describe('AC-8 —— 塔图加载失败时静默降级为 CSS 占位形状，且不阻断回合流转', () => {
  it('塔图 URL 带部署 base（与守卫 G16 同一口径）', () => {
    state.value = makeState([createTower({ id: 't1', towerType: 'direct', wordId: 'u1-dog', row: ZOMBIE_ROW, col: 3 })], [])
    const wrapper = mount(BattleField)

    expect(wrapper.find('[data-tower="t1"]').attributes('src')).toBe('/plantsgame/assets/towers/direct.svg')
  })

  it('触发 error 后换成占位形状，且原 <img> 不再存在', async () => {
    state.value = makeState([createTower({ id: 't1', towerType: 'direct', wordId: 'u1-dog', row: ZOMBIE_ROW, col: 3 })], [])
    const wrapper = mount(BattleField)

    // ⚠️ `trigger()` 返回 Promise，DOM 更新发生在下一个 tick ——
    //   不 await 就断言，看到的仍是旧 DOM，于是这条会以「降级没生效」的红脸收场，
    //   而真实原因是断言太早。这与 Story 1.9 那条「vitest 全绿而 typecheck 红」
    //   是同一类**时序**假象。
    await wrapper.find('[data-tower="t1"]').trigger('error')

    expect(wrapper.find('[data-tower="t1"][data-fallback]').exists()).toBe(true)
    expect(wrapper.find('img[data-tower="t1"]').exists()).toBe(false)
    // state 没被动过 —— 降级是**渲染层**的事，绝不能碰到战斗状态。
    expect(state.value.towers).toHaveLength(1)
    expect(state.value.grid[cellKey(ZOMBIE_ROW, 3)]).toBe('t1')
  })

  it('僵尸图加载失败同样降级，且血条仍在（血量信息不许一起丢）', async () => {
    state.value = makeState([], [createZombie({ id: 'z1', col: 4, hp: 50 })])
    const wrapper = mount(BattleField)

    await wrapper.find('[data-zombie="z1"]').trigger('error')

    expect(wrapper.find('[data-zombie="z1"][data-fallback]').exists()).toBe(true)
    // 血条是**独立于图**的 DOM 覆盖层，图挂了它必须还在 ——
    // 否则一次资产 404 就同时抹掉「血量可见」这条 AC。
    expect(wrapper.find('[data-hp-ratio]').exists()).toBe(true)
    expect(state.value.zombies).toHaveLength(1)
  })
})

// ── 小工具 ────────────────────────────────────────────────────────────────────

/** 以给定 state 挂载一次战场（不污染全局 `state` 的其余用例）。 */
function mountBattleFieldWith(next: State) {
  const previous = state.value
  state.value = next
  const wrapper = mount(BattleField)
  state.value = previous
  return wrapper
}
