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

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

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
import { vueSourceFiles } from '../helpers/vue-sources'
import {
  optionsOf,
  patternStrings,
  rulesForAnyFile,
  rulesForFile,
  severityOf,
} from '../fixtures/eslint-rules'
import { ZOMBIE_ASSET_URL } from '../../src/services/asset-url'

// 组件**源码**用 Vite 的 `?raw` 导入 —— jsdom 下 `import.meta.url` 是 http:// URL，
// `fileURLToPath()` 会抛 `TypeError: The URL must be of scheme file`。
// `?raw` 由模块自身位置决定，与 cwd 和运行环境都无关（见 tests/types/raw-import.d.ts）。
import battleFieldSource from '../../src/components/battle/BattleField.vue?raw'
import towerSource from '../../src/components/battle/Tower.vue?raw'
import zombieSource from '../../src/components/battle/Zombie.vue?raw'
import levelViewSource from '../../src/views/LevelView.vue?raw'
import startViewSource from '../../src/views/StartView.vue?raw'

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
    // 📎 Story 1.18 / AC-E4：`State` 新增的第三个记账字段。
    //   本文件不测跳题（那是 `tests/core/skip-question.test.ts` 的事），
    //   但 State 是**必填**字段 ⇒ 不填就编译不过。
    skippedEntryIds: [],
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
 * 取出某个**具体选择器的规则块**里的声明文本。
 *
 * ⚠️ `[CR]` 2026-10-16 新增 —— **这一段存在的全部理由**是下面 G14 原判据的一个
 *   硬伤：它用 `/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*;/.exec(code)` 取**第一个**
 *   `aspect-ratio`，而 `BattleField.vue` 里有**两条**：
 *
 *   ```css
 *   .battle-grid { … aspect-ratio: 9 / 5; }   ← :448，第一个
 *   .battle-cell  { … aspect-ratio: 1 / 1; }   ← :453，第二个
 *   ```
 *
 *   判据能对，**只是因为 `.battle-grid` 恰好写在前面**。CSS 规则块之间
 *   **没有顺序依赖**，把两条对调是完全合法的重构 —— 而那时 G14 会拿 `1 / 1`
 *   去比 `COLS/ROWS`，报出「格子就不是正方形」这种指向错误对象的假红。
 *
 *   同理 `box-sizing`：`.battle-grid` 的注释逐字写着 `content-box` 是**必需**的
 *   （「实测：border-box 时格子 46.8×37.5，content-box 时 46.8×47.1」），
 *   而原判据里根本没有这一项 —— 注释记着一次真机踩过的坑，守卫却管不着它。
 *
 * ⚠️ **本函数的能力边界（刻意不做得更宽）**：只处理**平铺**规则块，
 *   遇到 `}` 即止。当前三个组件的 `<style scoped>` 里没有 `@media`，
 *   这条前提一旦不成立（有人加了响应式断点），本函数会取到被截断的声明 ——
 *   那时它会**读不到**目标声明并返回 `null`，判据随之报「读不到」而不是
 *   静默放行（见 G14 里对 `null` 的处理）。失败方向是安全的那一侧。
 */
export function ruleBody(css: string, selector: string): string | null {
  // 选择器里的 `.` 与 `-` 都不是正则元字符，但显式转义以免将来出现 `[` 之类
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(stripComments(css))

  return match === null ? null : match[1] ?? null
}

/**
 * G14 的判据 —— **真守卫与 M42 共用同一份**。
 *
 * 判据：`.battle-grid` 上的 `grid-template-columns: repeat(N, 1fr)` 里 `N === COLS`，
 * 且 `aspect-ratio: A / B` 里 `A === COLS`、`B === ROWS`，
 * 且 `.battle-grid` 带 `box-sizing: content-box`、`.battle-cell` 带 `aspect-ratio: 1 / 1`。
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
  const grid = ruleBody(code, '.battle-grid')

  if (grid === null) {
    return '读不到 .battle-grid 的规则块 —— G14 无从取值（CSS 结构变了？）'
  }

  // ⚠️📎 **轨道形态从裸 `1fr` 放宽成 `minmax(0, 1fr)`（Story 1.18 / AC-D4）** ——
  //   `1fr` 等价于 `minmax(auto, 1fr)`，而 `auto` 下限把 `gap` 算进了列宽
  //   （实测溢出 3px，第 9 列被切）。判据只取 N，两种轨道写法都接受 ——
  //   **轨道形态本身由 G133 逐字钉住**（`repeat(N, minmax(0, 1fr))`），
  //   两处分工：G14 管「N 与 COLS 同源」，G133 管「轨道是 minmax 形态」。
  //   ⚠️ 别把这条正则收窄回 `1fr`：那会让 AC-D4 的修法当场把 G14 变红，
  //     而两个 AC 都是真的 —— 那说明判据的分工没写清，不是任一方错了。
  const repeatMatch = /grid-template-columns:\s*repeat\(\s*(\d+)\s*,\s*(?:minmax\(\s*0\s*,\s*1fr\s*\)|1fr)\s*\)/.exec(grid)
  if (repeatMatch === null) {
    // ⚠️📎 `[CR]` 2026-10-21 复审更正：这条文案原来写死 `repeat(N, minmax(0, 1fr))`，
    //   而**判据本身已经放宽成两种写法都收**（`minmax(0, 1fr)` 与裸 `1fr`）。
    //   ⇒ 文案在说「只认 minmax」，判据却在两种都放过 —— 一条自相矛盾的失败信息
    //   会把排障方向带偏（人会去查是不是轨道形态写错了，而真因是 repeat() 整个没读到）。
    return '读不到 .battle-grid 的 grid-template-columns: repeat(N, …) —— G14 无从取 N'
  }
  const n = Number(repeatMatch[1])
  if (n !== cols) {
    return `repeat() 的重复次数 ${n} ≠ COLS ${cols} —— 改了 src/core/grid.ts 的 COLS 而没同步这里，战场会静默错位`
  }

  const ratioMatch = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*;/.exec(grid)
  if (ratioMatch === null) {
    return '读不到 .battle-grid 的 aspect-ratio: A / B —— 格子无法保持正方形，塔与僵尸会被拉伸'
  }
  const [a, b] = [Number(ratioMatch[1]), Number(ratioMatch[2])]
  if (a !== cols || b !== rows) {
    return `aspect-ratio ${a} / ${b} 应当是 ${cols} / ${rows}（列 / 行）—— 写反了格子就不是正方形`
  }

  // ⚠️ `[CR]` 2026-10-16：`content-box` 是这条 AC 在真浏览器上踩出来的
  //   （border-box 时格子 46.8×37.5，非正方形 ⇒ 塔与僵尸被拉伸），
  //   而仓库全局是 `border-box`。改成 border-box 全绿，只在真机上现形。
  if (!/box-sizing:\s*content-box/.test(grid)) {
    return (
      '`.battle-grid` 上没有 `box-sizing: content-box` —— 仓库全局是 border-box，' +
      '那样格子会被 padding-bottom 挤成 48.81×42.6 的非正方形，塔与僵尸被拉伸。' +
      '本条是 AC-16 真浏览器核对实测出来的'
    )
  }

  // ⚠️ `.battle-cell` 的 `1 / 1` 同样没人守：它改成 `2 / 1` 时，
  //   上面的容器判据全部照绿（容器没动），而格子已经不是正方形了。
  const cell = ruleBody(code, '.battle-cell')
  if (cell === null) {
    return '读不到 .battle-cell 的规则块 —— 无法确认格子是否正方形'
  }
  const cellRatio = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)\s*;/.exec(cell)
  if (cellRatio === null) {
    return '`.battle-cell` 上没有 `aspect-ratio: A / B` —— 格子尺寸由内容决定，非正方形'
  }
  const [ca, cb] = [Number(cellRatio[1]), Number(cellRatio[2])]
  if (ca !== cb) {
    return `.battle-cell 的 aspect-ratio ${ca} / ${cb} 不是 1 : 1 —— 塔与僵尸是 512×512 正方形画布，会被拉伸`
  }

  return null
}

describe('G14 —— .battle-grid 的重复次数与 aspect-ratio 与网格常量同源', () => {
  const css = battleFieldSource

  it('BattleField.vue 的 CSS 通过 G14', () => {
    expect(g14Violation(css, COLS, ROWS)).toBeNull()
  })

  it('M42：把 repeat() 的次数改坏（不同步 COLS），G14 必须红', () => {
    // 用**真实文件**当底稿，只把 `repeat(9, minmax(0, 1fr))` 的 N 换成 N+3 ——
    // 这正是「COLS 从 9 改成 12 而忘了同步 CSS」留下的样子。
    // ⚠️📎 `[CR]` 2026-10-21 复审放宽：替换模式原来**只认 `minmax(0, 1fr)`**，
    //   而 AC-D4 之前 CSS 写的是裸 `1fr` ⇒ 轨道形态一变，这条变异就**静默空转**
    //   （`String.replace` 匹配不到就原样返回）。
    //   幸好它旁边有「变异没改到任何东西」那道防护会红 —— 但那条红的理由是
    //   「变异没生效」，不是「守卫咬住了违规」⇒ 变异覆盖面被收窄了。
    //   ⇒ 现在两种轨道写法都接受，与判据的放宽保持一致。
    // ⚠️📎 模式**必须锚在 `grid-template-columns:` 上**（不是光秃秃的 `repeat(`）：
    //   本文件里**注释中**也出现过 `repeat(9, …)` 这种写法（引架构原句那处），
    //   光秃秃的模式会先改到**注释里那一份**，判据（内部会剥注释）读到的真 CSS
    //   一字未动 ⇒ 变异空转、这条用例以「expected null to contain …」假红。
    //   —— 这是 R-52「源码匹配型守卫必须先剥注释」的**变体**：
    //   这次不是判据要剥，是**变异**不能改到注释里。
    const mutated = css.replace(
      /grid-template-columns:\s*repeat\(\s*(\d+)\s*,\s*(?:minmax\(\s*0\s*,\s*1fr\s*\)|1fr)\s*\)/,
      `grid-template-columns: repeat(${COLS + 3}, minmax(0, 1fr))`,
    )

    expect(css, '变异没改到任何东西 —— 替换模式与实际写法对不上，这条是假红').not.toBe(mutated)
    expect(g14Violation(mutated, COLS, ROWS)).toContain('重复次数')
  })

  it('M42 的反向：aspect-ratio 写反（行 / 列），G14 也必须红', () => {
    // ⚠️📎 `[CR]` 2026-10-21 复审改写：原来这里写死 `9 / 5`，
    //   而 COLS/ROWS 一变（网格尺寸调整是常事），`String.replace` 匹配不到
    //   ⇒ **变异静默空转**，该用例以「expected null to contain '格子就不是正方形'」失败 ——
    //   红的理由与真正的问题无关，指向错误对象。
    //   ⇒ 模式改为**由 COLS/ROWS 推导**，并补上「变异没生效」那道防护。
    const mutated = css.replace(
      new RegExp(`aspect-ratio:\\s*${COLS}\\s*\\/\\s*${ROWS}\\s*;`),
      `aspect-ratio: ${ROWS} / ${COLS};`,
    )

    expect(mutated, '这次变异没改到任何东西 —— aspect-ratio 的字面量与 COLS/ROWS 对不上').not.toBe(css)
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

/**
 * 组件层的探针文件 —— **真实路径，不是 glob**。
 *
 * ⚠️ `[CR]` 2026-10-16：原来这里是一个 glob 字符串常量（形如 `src/components/` + 两星一斜杠 + `*.{ts,vue}`），
 *   而查询函数拿它去和 config 块的 `files` 数组做 `includes` —— 于是「哪个块命中这个文件」
 *   被替换成了「哪个块的名字恰好等于这个字符串」。见 `fixtures/eslint-rules.ts` 里的实测。
 * ⇒ 现在传真实文件路径，由 ESLint 自己的解析器判定。
 */
const COMPONENT_PROBE = 'src/components/battle/Tower.vue'

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
  it('src/components/** 上禁掉了 core/balance，且严重级别是 error', async () => {
    const rule = (await rulesForFile(COMPONENT_PROBE))['no-restricted-imports']

    expect(g15Violation(rule)).toBeNull()
  })

  it('M46：把 core/balance 从禁列里去掉，G15 必须红', async () => {
    // 从**真实规则**出发，把禁 core/balance 的那几条 pattern 删掉 ——
    // 问的还是同一个 g15Violation。
    const rule = (await rulesForFile(COMPONENT_PROBE))['no-restricted-imports']
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

  it('M46 的反向：把 error 降成 warn，G15 必须红', async () => {
    // `eslint .` 不带 `--max-warnings`，所以 warn 在 CI 上**不会**让 lint 失败。
    // `[CR]` 把它列为三条真实回归之一。
    const rule = (await rulesForFile(COMPONENT_PROBE))['no-restricted-imports']

    expect(g15Violation(['warn', optionsOf(rule)])).toContain('严重级别')
  })

  it('反向：规则整个不存在，G15 必须报「没有规则」而不是通过', () => {
    expect(g15Violation(undefined)).toContain('没有 no-restricted-imports 规则')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G17 / G17b / G18 —— 渲染出的战场结构
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 合法格子键的全集 —— **独立枚举**，不是从被测代码的同一份循环里推出来的。
 *
 * ⚠️ 用 core 的 `cellKey` 重新生成一遍：若 `BattleField` 的遍历漏了一格或重复一格，
 *   两个集合就会不等。
 */
export function legalCellKeys(): Set<string> {
  const legal = new Set<string>()
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) legal.add(cellKey(row, col))
  }
  return legal
}

/**
 * G17 的判据 —— **真守卫与 M43 共用同一个函数**。
 *
 * ⚠️📎 `[CR]` 2026-10-21 **复审新增**（G242）：G17 原来**没有导出判据**，
 *   守卫生inline断言、变异在测试体内**另抄一份**集合逻辑，两边各写各的
 *   ⇒ 守卫生效时 M43 察觉不到，守卫被削弱时 M43 也察觉不到。
 *   实测：把 G17 那条「集合相等」的两行 `expect` 删掉 ⇒ 本文件 **73 条全绿**
 *   （含 M43 那条）—— 一条「守 45 格唯一性」的守卫可以被无声删掉。
 *   ⇒ 这正是 AC-13 逐字写的：「**判据必须是单一导出的函数，守卫与变异问同一个那个**」。
 *
 * ⚠️ 判据是**集合相等**而不是「元素个数相等」——
 *   44 个唯一坐标 + 1 个重复坐标同样是 45 个元素。
 */
export function g17Violation(rendered: readonly string[], legal: ReadonlySet<string>): string | null {
  const unique = new Set(rendered)
  if (unique.size !== legal.size) {
    return (
      `渲染出的 ${rendered.length} 个坐标里只有 ${unique.size} 个不同值 —— ` +
      `有格子渲染成了同一个 key，${legal.size} 格静默变成了 ${unique.size} 格`
    )
  }
  for (const key of legal) {
    if (!unique.has(key)) return `合法坐标 ${key} 没有被渲染出来 —— 战场少了一格`
  }
  return null
}

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

    expect(g17Violation(rendered, legalCellKeys()), '有格子渲染成了同一个 key —— 45 格静默变成了 44 格').toBeNull()
  })

  it('M43：让两格渲染成同一个 key，G17 必须红', () => {
    // ⚠️📎 `[CR]` 2026-10-21 **复审改写**：原来这条在测试体内**另拼了一份**
    //   本地集合再断言两个本地集合不等 —— 它**从不碰被测代码，也不调用 G17 的判据**
    //   （G17 当时根本没有导出判据函数）。⇒ 把 G17 的核心断言整条删掉，
    //   本条**照样全绿**（实测：删掉后本文件 73 条全绿，含本条）。
    //   ⇒ 这正是 AC-13 逐字要求的反面：「**判据必须是单一导出的函数，
    //   守卫与变异问同一个那个**」（Story 1.9 的 P0：判据被抄多份，
    //   真守卫整体停用后全套仍全绿）。
    //   现在 M43 问的是 `g17Violation` —— 判据被削弱，变异立刻察觉。
    const legal = legalCellKeys()
    const mutated = [...legal]
    mutated[mutated.length - 1] = cellKey(0, 0)

    expect(g17Violation(mutated, legal)).toContain('同一个 key')
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

  it('僵尸永远落在 ZOMBIE_ROW 那一行（Zombie 类型没有 row 字段可读）', () => {
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

/**
 * 组件源码里不许出现的血量算术形态。
 *
 * ⚠️ `[CR]` 2026-10-16 放宽：**原五条全部要求 `hp` 紧邻运算符或紧跟一个点**，
 *   于是 `hp * 0.01` / `hp / 50` / `ZOMBIE_HP * 2` / `z.hp - 10 < 0`
 *   这类**完全等价**的常见写法一条都不匹配。实测：把血条宽度改成
 *   `(zombie.hp / 500) * 100` —— G19 全绿。
 *   而 AC-14 自己写着这条边界的漂移风险是**全项目最高**。
 *   ⇒ 判据从「五种字面形态」改成「`hp` 这个标识符在任何地方参与算术或比较」。
 *
 * ⚠️ **`(?![\w-])` 这一段不是可有可无的**：它把 `hp` 与 `hp-bar`（CSS 类名）、
 *   `hp_ratio`（snake_case 变体）区分开。去掉它的实测后果 —— 首版就是没有它，
 *   `Zombie.vue` 的 `.hp-bar {` 当场误报（`hp` 后面跟 `-`，`\b` 成立，
 *   而紧跟着的 `-` 又正好被算术运算符分支吃掉）。
 *   「判据放宽」和「判据放宽到误伤」之间只差一个 lookahead。
 *
 * ⚠️⚠️ **这条守卫的契约到此为止，别把它当更强的守卫宣传**（`[CR]` 2026-10-16 实测边界）：
 *   它是**词法**判据，只抓「`hp` 这个标识符与运算符**直接相邻**」。
 *   实测三种它**抓不到**、且刻意不打算抓的形态：
 *     · `(z.hp ?? 0) / 100` —— `hp` 与 `/` 之间隔着 `?? 0`，无词法邻接
 *     · `const h = z.hp; const pct = h * 1` —— 中间隔了一次赋值
 *     · 任何代数等价重排
 *   想抓这些需要的是**值流分析**，那是另一个量级的东西，不是一条正则。
 *   ⇒ 这里把契约写准（而不是把判据堆到误报为止），并在上面那条
 *   「扫真实目录」上集中火力 —— **覆盖面**才是这条守卫本轮真正的改进，
 *   词法精度不是。写别的文档引用 G19 时，请照抄这个上限，别抄成「组件里不许算血量」。
 */
const HP_ARITHMETIC = [
  // hp 在运算符**左侧**（含前导点：`zombie.hp` / `props.zombie.hp`）
  /\b\w*\.?hp\b(?![\w-])\s*[*/+\-]/,
  // hp 在运算符**右侧**
  /[*/+\-]\s*\b\w*\.?hp\b(?![\w-])/,
  // 比较判定（hp <= 0 / hp > 0 / hp === maxHp …）
  /\b\w*\.?hp\b(?![\w-])\s*(?:<=|>=|===|!==|==|!=|<|>)/,
  // 战斗数值常量参与算术（与 G33b 的标识符黑名单同向，但覆盖全仓 .vue）
  /\b(?:ZOMBIE_HP|TOWER_STATS|HEARTS)\b\s*[*/+\-]/,
]

/** G19 的判据 —— 真守卫与变异共用。 */
export function g19Violation(source: string): string | null {
  const code = stripComments(source)
  for (const pattern of HP_ARITHMETIC) {
    if (pattern.test(code)) return `组件里出现了血量算术（匹配 ${pattern.source}）—— 用 core/ 的 zombieHpRatio()`
  }
  return null
}

/**
 * 受检的组件源码 —— **扫真实目录**，不是硬编码名单。
 *
 * ⚠️ `[CR]` 2026-10-16：原实现是 `it.each([['BattleField.vue', …], ['Tower.vue', …],
 *   ['Zombie.vue', …], ['LevelView.vue', …]])` 四元素字面量。实测：往
 *   `src/views/StartView.vue` 注入 `z.hp / 100` ⇒ **全仓 840 条测试全绿、eslint exit 0**。
 *   新增组件是**默认出_guard** 的 —— 而 `RangeOverlay.vue` / `HandCard.vue` /
 *   HUD 组件都是后续 story 落的，它们一律不在射程内。
 *
 * ⇒ 改成扫 `src/` 下全部 `.vue`。判据仍是同一份 `g19Violation`，
 *   只是被问到的文件集合从「手写的四个」变成「磁盘上真实存在的那些」。
 *
 * 🔥 **`[CR]` 2026-10-25（Story 3.5）**：本文件原来**自己写了一份**递归遍历
 *   ⇒ 仓库里出现了**三份**「列出 `src/` 下全部 `.vue`」的实现
 *   （本文件 / `tests/helpers/animation-rule.ts` / `tests/helpers/vue-sources.ts`）
 *   ⇒ 漂移方向恰好是「判据静默变窄」（G138 的病根，第三次）。
 *   ⇒ 收敛到**共享的那一份**（`tests/helpers/vue-sources.ts`），
 *     本文件只保留**形状适配**（`it.each` 要的是元组）。
 */
const allVueSources = (): Array<[string, string]> =>
  vueSourceFiles(process.cwd()).map((file) => [file.name, file.source] as [string, string])

describe('G19 —— 组件里不出现血量算术', () => {
  it('src/ 下每个 .vue 的源码都不含裸的血量算术（扫真实目录，不是手写名单）', () => {
    const files = allVueSources()

    // 先断言清单非空 —— 否则「扫到了 0 个文件」会是一轮漂亮的空绿
    expect(files.length, 'src/ 下一个 .vue 都没扫到 —— 目录扫描本身坏了').toBeGreaterThan(0)

    for (const [path, source] of files) {
      expect(g19Violation(source), `${path} 里有裸的血量算术`).toBeNull()
    }
  })

  it('扫出来的清单确实覆盖了那四个手写名单里的文件（防止目录扫描悄悄跑偏）', () => {
    const paths = allVueSources().map(([p]) => p.replace(/\\/g, '/'))

    for (const expected of [
      'src/components/battle/BattleField.vue',
      'src/components/battle/Tower.vue',
      'src/components/battle/Zombie.vue',
      'src/views/LevelView.vue',
    ]) {
      expect(paths, `目录扫描漏掉了 ${expected}`).toContain(expected)
    }
  })

  it('Zombie.vue 确实用了 zombieHpRatio()（证明上面那条不是「文件里什么都没有」的空绿）', () => {
    const code = stripComments(zombieSource)

    expect(code).toContain('zombieHpRatio')
    expect(code).toContain('hpRatio')
  })

  it.each([
    ['zombie.hp / 100（原判据能抓的那条）', 'const hpRatio = zombie.hp / 100'],
    ['hp * 0.01（原判据漏）', 'const pct = hp * 0.01'],
    ['hp / 50（原判据漏）', 'const pct = hp / 50'],
    ['z.hp - 10 < 0（原判据漏）', 'const dead = z.hp - 10 < 0'],
    ['ZOMBIE_HP * 0.3 派生阈值（原判据漏）', 'const HURT_AT = ZOMBIE_HP * 0.3'],
  ])('反向：%s 必须被 G19 抓住', (_label, mutated) => {
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
 *
 * ⚠️⚠️ **上面那段论证只证明了一半** —— 而漏掉的另一半正好是本守卫的真漏洞。
 *   `[CR]` 2026-10-16 实测：把 `.tower` 的 `width: 88%; height: 88%;`
 *   **两行整行删掉**（保留 `object-fit: contain`），本守卫 **38 条全绿**；
 *   真实 Chromium 实测同一份 CSS（`.cell` 49×49、`inset: 6%`、无 width/height）：
 *
 *   ```
 *   GOOD tower .tower : IMG 43x43
 *   MUT  tower no w/h : IMG 0x0      ← 整只塔消失
 *   ```
 *
 *   原因是「`auto` 只是触发条件之一，**没有显式尺寸**才是真正的成因」：
 *   绝对定位 + 四边 inset + 过约束 ⇒ `right` 被吃掉、宽度塌成 0。
 *   而「删掉那两行」比「写成 auto」更像是手滑，也更不容易被 code review 看见。
 *   ⇒ 判据改成**正向**的：目标规则块里**必须**出现 `width:` 与 `height:`
 *   的显式值。原「拦 auto」降级为其中一条子判据。
 */
const REPLACED_AUTO_SIZING = /\b(?:width|height)\s*:\s*auto\b/g

/** `<img>` 所在的规则块选择器 —— 尺寸必须写在这两个块里，不是文件里随便哪里。 */
const IMAGE_RULE_SELECTORS = ['.tower', '.zombie'] as const

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

  // ⚠️ `[CR]` 2026-10-16 补的正向判据：显式尺寸必须在**目标规则块里**。
  //   「文件里某处有 width」不算 —— `.hp-bar__fill` 有 width 而 `.tower` 没有，
  //   那条断言会照样绿（这正是删除 `width: 88%` 后原守卫全绿的原因）。
  for (const selector of IMAGE_RULE_SELECTORS) {
    const body = ruleBody(code, selector)
    if (body === null) {
      continue // 该组件不画这个形状，跳过（下面的「确实画了 <img>」会兜住）
    }
    for (const axis of ['width', 'height'] as const) {
      const declared = new RegExp(`(?:^|[;{\\s])${axis}\\s*:\\s*(?!auto)[^;}]+`).test(body)
      if (!declared) {
        return (
          `\`${selector}\` 的规则块里没有显式的 \`${axis}:\` —— ` +
          '`<img>` 是替换元素，绝对定位 + 四边 inset + 没有显式尺寸 ⇒ ' +
          '**过约束，`right` 被吃掉、该轴塌成 0，整只图渲染成 0×0（塔彻底消失）**。' +
          '这不是 `auto` 独有的坑，删掉那行也一样中招（本条是实测出来的）。'
        )
      }
    }
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

  /**
   * ⚠️ `[CR]` 2026-10-16 新增 —— 「降级」不等于「消失」。
   *
   * 塔的占位块原来是一个**自闭合的 `<span />`**：无文本、无 role、无 aria-label。
   * `v-if` 把带 `alt` 的 `<img>` 整块换掉的那一刻，这株塔**从无障碍树里整个消失**。
   * 而部署前缀配错导致全站 404 正是 AC-8 守的那个场景 ——
   * 也就是「占位路径被大面积触发」的场景：孩子看得见色块，读屏用户什么都听不到。
   *
   * ⇒ **降级只换视觉，不换语义。** 塔与僵尸、房子三处都要有可命名的角色。
   */
  it('AC-8 —— 降级不改变语义：塔的占位块仍可被读屏命名', async () => {
    state.value = makeState([createTower({ id: 't1', towerType: 'direct', wordId: 'u1-dog', row: ZOMBIE_ROW, col: 3 })], [])
    const wrapper = mount(BattleField)
    await wrapper.find('[data-tower="t1"]').trigger('error')

    const fallback = wrapper.find('[data-tower="t1"][data-fallback]')

    expect(fallback.attributes('role'), '占位块没有可命名的 role —— 读屏会跳过它').toBe('img')
    expect(
      fallback.attributes('aria-label'),
      '占位块没有 aria-label —— 它替掉了带 alt 的 <img>，语义就此丢失',
    ).toBe('direct 塔')
  })

  it('AC-8 —— 降级不改变语义：僵尸的占位块仍可被读屏命名', async () => {
    state.value = makeState([], [createZombie({ id: 'z1', col: 4, hp: 50 })])
    const wrapper = mount(BattleField)
    await wrapper.find('[data-zombie="z1"]').trigger('error')

    const fallback = wrapper.find('[data-zombie="z1"][data-fallback]')

    expect(fallback.attributes('role')).toBe('img')
    expect(fallback.attributes('aria-label')).toBe('僵尸')
  })

  it('房子是 CSS 画的图形，也必须有可命名的 role（aria-label 挂在裸 div 上会被忽略）', () => {
    state.value = makeState([], [])
    const wrapper = mount(BattleField)
    const house = wrapper.find('[data-house]')

    expect(house.exists()).toBe(true)
    expect(
      house.attributes('role'),
      'aria-label 挂在没有 role 的 div 上，多数 AT 直接忽略 —— 房子对读屏用户等于不存在',
    ).toBe('img')
    expect(house.attributes('aria-label')).toBe('房子')
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

// ══════════════════════════════════════════════════════════════════════════════
// 本轮 [CR] 新增的三条 —— **刻意不占 G 编号**
// ══════════════════════════════════════════════════════════════════════════════
//
// G21–G54a 已被 Story 1.12 / 1.13 在各自的守卫表里**预留**（见各 story 文档），
// 而本文件原来那份「G14b」指针（`tokens.css` 指向它）**从来不存在** ——
// 这正是「注释指向一条从未写出的守卫比没有守卫更危险」的现场。
// ⇒ 新断言挂在它们服务的 AC 下，沿用本文件已有的 `AC-8 —— …` 那种 describe 形态，
//   不新造编号，也就不会与后续 story 的预留号撞车。

/**
 * AC-12 —— 「组件只调不算」。
 *
 * `src/core/grid.ts` 的 `buildBlockedReason` 花了整段论证「若组件自己写一份
 * `col !== 0 && col !== 8`，两边分叉时界面上看不出任何异常」。
 * 而实测：把 `isBuildable: canBuildAt(row, col)` 换成内联判断 ⇒ **全仓 840 条测试全绿**。
 * 原因是 `buildable-cells.test.ts` 守的是 `canBuildAt()` **函数本身**，
 * 守不到「组件调了它」；而 `is-buildable` 这个 class 在 1.10 既没有 CSS 规则
 * 也没有任何断言，纯装饰。
 */
describe('AC-12 —— 组件只调 core 的建塔判据，不自己算一份', () => {
  it('BattleField.vue 的 isBuildable 来自 canBuildAt()，不是内联判断', () => {
    const code = stripComments(battleFieldSource)

    expect(
      code,
      'BattleField.vue 里没有 isBuildable: canBuildAt( —— 组件自己算了一份可建性，' +
        '与 core/buildBlockedReason 分叉时界面上看不出任何异常（AC-12 原话）',
    ).toMatch(/isBuildable:\s*canBuildAt\(/)
  })

  it('反向：换成内联判断必须被这条抓住', () => {
    const mutated = stripComments(battleFieldSource).replace(
      /isBuildable:\s*canBuildAt\([^)]*\)/,
      `isBuildable: col !== ${HOUSE_COL} && col !== ${ZOMBIE_SPAWN_COL}`,
    )

    expect(mutated, '这次变异没生效 —— 正则没匹配上，测试会因下面的 toMatch 而空绿').not.toMatch(
      /isBuildable:\s*canBuildAt\(/,
    )
  })

  it('canBuildAt 确实被从 core 导入（证明上面那条不是「靠正则凑出来的」）', () => {
    expect(stripComments(battleFieldSource)).toMatch(/import\s*\{[^}]*\bcanBuildAt\b[^}]*\}\s*from\s*'[^']*core'/)
  })
})

/**
 * 组件里引用的每一个 `var(--color-*)` 都必须在 `tokens.css` 里真的定义。
 *
 * ⚠️ 这条来自一次**真实交付过的 P0 级 bug**：`Story 1.10` 的 `Tower.vue` 曾写
 *   `` var(--color-tower-${tower.towerType}) ``，而塔型字面量是 `direct`、
 *   色板 token 叫 `--color-tower-shooter`（1.6 的历史命名）⇒ 拼出一个
 *   **不存在的** `--color-tower-direct`，`background-color` 在 computed-value
 *   时刻回落到 `transparent`。真实 Chromium 实测（49×49 格子）：
 *   ```
 *   GOOD fb shooter bg : rgb(9, 66, 140)
 *   MUT  fb direct bg  : rgba(0, 0, 0, 0)      ← 占位块完全透明
 *   ```
 *   即「塔图 404 → 降级占位」这条 AC-8 承诺的「塔型仍能看出」对 `direct` 不成立。
 *
 *   Story 1.12 把它改成了显式映射表 —— 但**没有任何东西守着那张表**，
 *   而且 `Tower.vue` / `HandCard.vue` / `asset-geometry.test.ts` 各存了一份，
 *   测试那份还是独立副本（压根不守组件那份）。
 * ⇒ 这里不查「映射表几份」（那是 R-37，另一件事），只查**最致命的那一环**：
 *   组件写出来的 token 名必须是 `tokens.css` 里真实存在的那个。
 */
describe('组件引用的 CSS token 必须真实存在于 tokens.css', () => {
  const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
  const definedTokens = new Set(
    [...tokensCss.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1] as string),
  )

  it('tokens.css 至少定义了 20 个 token（防止上面那个正则整体失灵）', () => {
    expect(
      definedTokens.size,
      '从 tokens.css 里只解析出这么少 token —— 正则与文件格式对不上了，' +
        '下面每条都会变成「扫不到任何引用 ⇒ 空绿」',
    ).toBeGreaterThanOrEqual(20)
  })

  it.each(allVueSources())('%s 引用的每个 var(--color-*) 都有定义', (path, source) => {
    const used = [...stripComments(source).matchAll(/var\(\s*(--color-[\w-]+)/g)].map(
      (m) => m[1] as string,
    )

    // ⚠️ 这个文件一个 color token 都没引用时，下面是「扫到 0 个」的恒真。
    //   本仓所有组件都引用了，所以这里断言「全仓至少有一个组件确实用到了」，
    //   把空绿的可能堵在入口，而不是每条都加一条「本文件非空」（那会误伤未来的纯逻辑组件）。
    for (const token of used) {
      expect(
        definedTokens.has(token),
        `${path} 引用了 ${token}，但 tokens.css 里没有 —— ` +
          'CSS 变量未定义时在 computed-value 时刻回落到 transparent/初始值，' +
          '**不报任何错**，元素静默变透明。塔型字面量与色板 token 名不同源' +
          '（direct vs shooter）正是踩这个坑的实例',
      ).toBe(true)
    }
  })

  it('确实扫到了引用（防止上面 it.each 的每一行都是「扫到 0 个」的恒真）', () => {
    const total = allVueSources().reduce(
      (sum, [, source]) =>
        sum + [...stripComments(source).matchAll(/var\(\s*--color-[\w-]+/g)].length,
      0,
    )

    expect(total, '全仓一个 var(--color-*) 都没有 —— 扫描正则与源码格式对不上了').toBeGreaterThan(5)
  })

  it('反向：`--color-tower-direct` 确实不在 tokens.css 里（证明判据有牙齿）', () => {
    // ⚠️ 这一条不是「编一个假 token 试试」，而是**钉住这次真实 bug 的现场**：
    //   塔型字面量是 `direct`、色板 token 叫 `--color-tower-shooter`，
    //   所以「按塔型拼 token 名」必然拼出一个不存在的名字。
    //   Story 1.12 改成显式映射表之后，这个名字本该在仓库里**彻底消失** ——
    //   若哪天有人图省事改回模板字符串，这条会先于那条一起红。
    expect(
      definedTokens.has('--color-tower-direct'),
      'tokens.css 里竟然定义了 --color-tower-direct —— 塔型字面量与色板 token 名' +
        '两套命名并存正是 asset-url.ts 注释里点名要避免的易混点',
    ).toBe(false)

    expect(
      definedTokens.has('--color-tower-shooter'),
      'tokens.css 里没有 --color-tower-shooter —— 那上面那条的「两套命名」前提变了',
    ).toBe(true)
  })
})

/**
 * 「点开始游戏 → 进战场」这条主链路不许凭空消失。
 *
 * ⚠️ 实测：把 `StartView.vue` 的 `enterLevel()` 调用与 import **同时删掉** ⇒
 *   `eslint .` exit 0、**全仓 840 条测试全绿**。而症状是
 *   「孩子点了按钮游戏却一动不动，看起来像坏了」——
 *   没有报错、没有白屏、没有红测试，`StartView.vue` 的注释里逐字写着
 *   「已经被坑过一次」。
 *
 *   本仓库没有 `@vue/test-utils` 之外的端到端挂载入口，也没有路由；
 *   挂 `App` 会连带真实的 AudioContext 与手势上下文，取而代之的是一条
 *   源码级判据 —— **廉价、且足以挡住「整条链路被删」这种形态**。
 */
describe('主链路 —— 点开始游戏一定切到战场', () => {
  it('StartView.vue 的 onStart 调了 enterLevel()', () => {
    const code = stripComments(startViewSource)
    const body = /function onStart\(\)[^{]*\{([\s\S]*?)\n\}/.exec(code)?.[1] ?? ''

    expect(body, 'StartView.vue 里读不到 onStart 的函数体').not.toBe('')
    expect(
      body,
      'onStart 没有调 enterLevel() —— 解锁音频跑完但 view 永远是 start，' +
        '孩子点了按钮游戏一动不动，且没有任何报错或红测试',
    ).toMatch(/\benterLevel\(\)/)
  })

  it('enterLevel 是从 app/store 导入的（不是本地定义的同名函数）', () => {
    expect(stripComments(startViewSource)).toMatch(
      /import\s*\{[^}]*\benterLevel\b[^}]*\}\s*from\s*'[^']*app\/store'/,
    )
  })

  it('反向：把 enterLevel() 调用删掉必须被抓住', () => {
    const mutated = stripComments(startViewSource).replace(/\n\s*enterLevel\(\)/, '')

    expect(mutated, '这次变异没生效 —— 会因下面 toMatch 空绿').not.toMatch(/\benterLevel\(\)/)
  })

  // ⚠️ `[CR]` 2026-10-16 补：上面三条只守住了「StartView 会切 view」，
  //   **没守住「切过去之后真的有画面」** —— 上一组三条全绿而战场一片空白的形态是：
  //   `LevelView.vue` 把 `<BattleField />` 整块删掉（或改错组件名），
  //   于是 `view` 正确变成 `'level'`、`App.vue` 也正确条件渲染了 `<LevelView />`，
  //   而**屏幕上什么也没有** —— 没有报错、没有红测试。
  //   上一组 describe 的注释里写着的那个症状（「孩子点了按钮游戏却一动不动」）
  //   有**两种**同因的形态，这里守的是第二种。
  it('LevelView.vue 真的渲染了 <BattleField />，且是显式 import 进来的', () => {
    const code = stripComments(levelViewSource)

    expect(code, 'LevelView.vue 的模板里找不到 <BattleField /> —— view 切过去也只会是空白页').toMatch(
      /<BattleField\b/,
    )
    expect(
      code,
      // ⚠️ 这一条不是形式主义：`script setup` 漏 import 时组件会按**原生自定义元素**
      //   渲染（Debug Log #4），vue-tsc / build / test / lint 全绿而页面白着。
      //   本判据与 `eslint.config.js` 的 `vue/no-undef-components` 是**两道独立的闸**：
      //   ESLint 那道可以被 ignores 关掉（见 `eslint-rules.ts` 记录的实测），这道不会。
      'BattleField 必须是显式 import 的（漏 import ⇒ 白屏且全套工具全绿）',
    ).toMatch(/import\s+\w*\s*BattleField\b\s+from\s*'[^']*BattleField\.vue'/)
  })

  it('反向：把 LevelView 的 <BattleField /> 删掉必须被抓住', () => {
    const mutated = stripComments(levelViewSource).replace(/<BattleField\b[^>]*\/?>/g, '')

    expect(mutated, '这次变异没生效 —— 会因下面 toMatch 空绿').not.toMatch(/<BattleField\b/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G238 —— 组件层的 import 禁令覆盖**每一个**组件与视图文件
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 磁盘上真实存在的 `src/components/**` 与 `src/views/**` 下的所有 `.ts` / `.vue`。
 *
 * ⚠️📎 `[CR]` 2026-10-21 复审新增（G238）。
 *   **为什么不能用 `PROBE_FILES` 那种手写名单**：名单型判据的老毛病是
 *   「名单不会跟着 story 一起长大」—— Story 1.19 的 G140 已经为同一个病
 *   改过一次（从 3 个手写文件改成扫全仓 `tests/`）。
 *   ⇒ 这里直接枚举磁盘，**新增组件默认出_guard**。
 */
function componentAndViewFiles(): string[] {
  const root = resolve(process.cwd(), 'src')
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts')) {
        found.push(relative(process.cwd(), full).replace(/\\/g, '/'))
      }
    }
  }
  walk(join(root, 'components'))
  walk(join(root, 'views'))
  return found.sort()
}

/**
 * 组件层那个 ESLint 块必须同时具备的**两条**禁列。
 *
 * ⚠️ 两条都必须查：只查 `core/balance` 的话，1.14 的 AC-G7（禁 `services/audio`）
 *   就没人守了 —— 而它们**在同一个块里**（`eslint.config.js` 的注释逐字写着
 *   「必须同块，不能另开一个 `src/components/**` 的块」，因为 flat config 里
 *   同名规则后块覆盖前块）。
 */
const REQUIRED_COMPONENT_BANS = ['core/balance', 'services/audio'] as const

/**
 * G238 的判据 —— 真守卫与变异共用同一个函数。
 *
 * ⚠️ 与 G15 的差别只有一处，但那一处是全部：
 *   G15 问的是「**那一个**探针文件上有没有这条规则」；
 *   G238 问的是「**每一个**组件与视图文件上有没有这条规则」。
 *   差别看起来很小，实测差别是：G15 覆盖全仓 18 个组件里的 **1 个**。
 */
export function g238Violation(rule: unknown): string | null {
  if (rule === undefined) {
    return '该文件上没有 no-restricted-imports 规则 —— 这个组件不受任何 import 禁令管辖'
  }
  if (severityOf(rule) !== 'error') {
    return (
      `严重级别是 ${String(severityOf(rule))} 而不是 error —— ` +
      'eslint . 不带 --max-warnings，warn 不会让 lint 失败，防线等于没有'
    )
  }
  const patterns = patternStrings(optionsOf(rule))
  const missing = REQUIRED_COMPONENT_BANS.filter((needle) => !patterns.some((p) => p.includes(needle)))
  if (missing.length > 0) {
    return (
      `禁列里少了 ${missing.join('、')}（当前禁的是：${patterns.join(' / ') || '空'}）—— ` +
      '组件可以直接 import 它，而 eslint . 不会报'
    )
  }
  return null
}

describe('G238 —— 组件层的 import 禁令覆盖每一个组件与视图文件', () => {
  it('src/components/** 与 src/views/** 下的每一个 .ts/.vue 都受两条禁列管辖', async () => {
    const files = componentAndViewFiles()

    expect(
      files.length,
      'src/components 或 src/views 下一个文件都没扫到 —— 目录扫描本身坏了（否则下面是一轮漂亮的空绿）',
    ).toBeGreaterThan(10)

    for (const file of files) {
      const rule = (await rulesForAnyFile(file))['no-restricted-imports']
      expect(
        g238Violation(rule),
        `${file} 不受组件层禁令管辖 —— 收窄 eslint 块的 files 就能悄悄放过它`,
      ).toBeNull()
    }
  })

  it('反向：G15 的探针文件确实在这个清单里（证明上面不是「扫到了别的目录」）', () => {
    expect(componentAndViewFiles()).toContain(COMPONENT_PROBE)
  })

  it('反向：判据本身能区分 —— 规则缺失 / 降成 warn / 少一条禁列，三种都要报出来', () => {
    expect(g238Violation(undefined)).toContain('没有 no-restricted-imports 规则')
    expect(g238Violation(['warn', { patterns: ['**/../core/balance', '**/../services/audio'] }])).toContain(
      '严重级别',
    )
    expect(g238Violation(['error', { patterns: ['**/../core/balance'] }])).toContain('services/audio')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G239 —— 僵尸图的 URL 也带部署 base（塔侧早有断言，僵尸侧原本没有）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G239 的判据 —— 真守卫与变异共用同一个函数。
 *
 * ⚠️📎 `[CR]` 2026-10-21 复审新增。
 *   塔侧早有断言（「塔图 URL 带部署 base」，在 AC-8 那组里），
 *   **僵尸侧却没有** —— 而 `Zombie.vue` 的 `:src` 绑的是 `ZOMBIE_ASSET_URL`
 *   这一个常量，看源码「像是对的」，可那不是证据。
 *   实测：把 `Zombie.vue` 的 `:src` 改成 `'/assets/zombies/zombie.svg'`
 *   （去掉 base）⇒ **整仓 2162 条全绿**。
 *   ⇒ 部署到子路径后僵尸图全部 404 —— 正是 G16 存在的那个场景
 *   （Story 1.2 修过的录音 404 同源）。
 */
export function g239Violation(src: string | undefined): string | null {
  if (src === undefined) return '僵尸的 <img> 没有 src —— 界面上根本看不见僵尸'
  if (src !== ZOMBIE_ASSET_URL) {
    return (
      `僵尸图 URL 是 ${src} 而不是 ${ZOMBIE_ASSET_URL} —— ` +
      '部署到子路径后它会 404，而塔图有断言、僵尸图没有'
    )
  }
  return null
}

describe('G239 —— 僵尸图的 URL 带部署 base（与 G16 同一口径）', () => {
  it('渲染出的僵尸 <img src> 等于 ZOMBIE_ASSET_URL', () => {
    state.value = makeState([], [createZombie({ id: 'z1', col: 6, hp: 100 })])
    const wrapper = mount(BattleField)

    const src = wrapper.find('[data-zombie="z1"]').attributes('src')

    expect(g239Violation(src), '僵尸 <img> 的 src 不对 —— 部署到子路径后它会 404').toBeNull()
  })

  it('反向：判据能抓住「去掉 base 的硬编码路径」（证明上面不是恒真）', () => {
    expect(g239Violation('/assets/zombies/zombie.svg')).toContain('而不是')
    expect(g239Violation(undefined)).toContain('没有 src')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G240 —— 僵尸行 = 浅土路径，且这一行的下标由 COLS 推导
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G240 的判据 —— 真守卫与变异共用同一个函数。
 *
 * ⚠️📎 `[CR]` 2026-10-21 复审新增。
 *   `BattleField.vue` 逐字承诺：「僵尸行走的那一行铺成浅土路径 ——
 *   孩子要能一眼看出『僵尸从右边沿着这条路过来』，而那条路必须是连续的。」
 *   而这条承诺由一条**手算的** `:nth-child(n + 19):nth-child(-n + 27)` 实现，
 *   **零守卫**：实测把它改成 `var(--color-bg)` ⇒ 212 条全绿；
 *   实测把 `COLS` 从 9 改成 10 而这条选择器不动 ⇒ 浅土路径横跨第 2 行末格与
 *   第 3 行前 8 格（**画歪了**），而 G14 / G17 / G18 / G30b **全部照绿**，
 *   36 条红的标题里**没有一条**提到路径。
 *   ⇒ 「守卫先红」那句注释在今天**不成立** —— 它靠的是别的守卫偶然会红，不是这条。
 */
export function g240Violation(source: string, cols: number, zombieRow: number): string | null {
  const code = stripComments(source)
  const m = /\.battle-cell:nth-child\(n\s*\+\s*(\d+)\):nth-child\(-n\s*\+\s*(\d+)\)\s*\{([^}]*)\}/.exec(code)
  if (m === null) {
    return '读不到「僵尸行 = 浅土路径」那条 nth-child 规则 —— 路径行没画，或选择器改了形状'
  }
  const from = Number(m[1])
  const to = Number(m[2])
  const expectedFrom = zombieRow * cols + 1
  const expectedTo = (zombieRow + 1) * cols
  if (from !== expectedFrom || to !== expectedTo) {
    return (
      `路径行选中的是 DOM 第 ${from}~${to} 格，而僵尸行（第 ${zombieRow + 1} 行）在 ${cols} 列下是` +
      `第 ${expectedFrom}~${expectedTo} 格 —— 浅土路径画歪了，僵尸走在草地上`
    )
  }
  const bg = /background-color\s*:\s*([^;]+);/.exec(m[3])
  if (bg === null) return '路径行规则里没有 background-color —— 僵尸行没有独立的底色'
  if (!/var\(\s*--color-path\s*\)/.test(bg[1])) {
    return (
      `路径行用的是 ${bg[1].trim()} 而不是 var(--color-path) —— ` +
      '「僵尸从右边沿着这条路过来」这条视觉承诺失效'
    )
  }
  return null
}

describe('G240 —— 僵尸行 = 浅土路径，且这一行的下标由 COLS 推导', () => {
  it('路径行选中的是僵尸行，且用 --color-path 铺底', () => {
    expect(g240Violation(battleFieldSource, COLS, ZOMBIE_ROW)).toBeNull()
  })

  it('反向：COLS 改了而 nth-child 下标没跟着改，必须被抓住（这正是「守卫先红」那句承诺）', () => {
    expect(g240Violation(battleFieldSource, COLS + 1, ZOMBIE_ROW)).toContain('画歪了')
  })

  it('反向：把路径行换成草地绿必须被抓住', () => {
    const mutated = battleFieldSource.replace(
      'background-color: var(--color-path);',
      'background-color: var(--color-bg);',
    )

    expect(mutated, '这次变异没改到任何东西 —— 路径行那条声明的写法变了').not.toBe(battleFieldSource)
    expect(g240Violation(mutated, COLS, ZOMBIE_ROW)).toContain('--color-path')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G241 —— 横屏断点里的 .battle-grid 覆盖块不得与 COLS/ROWS 打架
// ══════════════════════════════════════════════════════════════════════════════

/**
 * G241 的判据 —— 真守卫与变异共用同一个函数。
 *
 * ⚠️📎 `[CR]` 2026-10-21 复审新增。
 *   G14 与 1.18 的 G133 **只读 `BattleField.vue` 的 scoped 样式**，
 *   而 `src/styles/responsive.css` 里还有一块 `.level-view .battle-grid`
 *   —— 它的优先级与 scoped 的 `.battle-grid[data-v-*]` **同为 (0,2,0)**，
 *   靠**源码顺序**决胜（`responsive.css` 的注释逐字记着这件事）。
 *   ⇒ 在那块里写 `grid-template-columns: repeat(3, …)` 或 `aspect-ratio: 3 / 1`
 *   就会让横屏下的战场变成 3 列、格子不再正方形，而**没有任何一条守卫会红**。
 *   实测：加上那两行 ⇒ `battle-field.test.ts` + `portrait-layout.test.ts`
 *   **145 条全绿**。
 */
export function g241Violation(source: string, cols: number, rows: number): string | null {
  const code = stripComments(source)
  const blocks = [...code.matchAll(/([^{}]*\.battle-grid[^{}]*)\{([^}]*)\}/g)]
  if (blocks.length === 0) {
    return 'responsive.css 里读不到任何 .battle-grid 规则块 —— 判据可能扫错了地方（那是一轮空绿）'
  }
  for (const [, selector, body] of blocks) {
    const repeat = /grid-template-columns\s*:\s*repeat\(\s*(\d+)\s*,/.exec(body)
    if (repeat !== null && Number(repeat[1]) !== cols) {
      return (
        `responsive.css 的 \`${selector.trim()}\` 把列数写成 ${repeat[1]} 而不是 ${cols} —— ` +
        '横屏下战场与 core/grid.ts 错位，而它优先级与 scoped 样式相同'
      )
    }
    const ratio = /aspect-ratio\s*:\s*(\d+)\s*\/\s*(\d+)\s*;/.exec(body)
    if (ratio !== null && (Number(ratio[1]) !== cols || Number(ratio[2]) !== rows)) {
      return (
        `responsive.css 的 \`${selector.trim()}\` 的 aspect-ratio 是 ${ratio[1]} / ${ratio[2]}，` +
        `而不是 ${cols} / ${rows} —— 横屏下格子不再是正方形，塔与僵尸被拉伸`
      )
    }
  }
  return null
}

describe('G241 —— 横屏断点里的 .battle-grid 覆盖块不得与 COLS/ROWS 打架', () => {
  it('responsive.css 里的 .battle-grid 覆盖块没有另起一套网格形状', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/styles/responsive.css'), 'utf8')

    expect(g241Violation(source, COLS, ROWS)).toBeNull()
  })

  it('反向：在覆盖块里塞一套 3 列 / 3:1 的网格，必须被抓住', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/styles/responsive.css'), 'utf8')
    const mutated = source.replace(
      '.level-view .battle-grid {',
      '.level-view .battle-grid {\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n    aspect-ratio: 3 / 1;',
    )

    expect(mutated, '这次变异没改到任何东西 —— 覆盖块的选择器变了').not.toBe(source)
    expect(g241Violation(mutated, COLS, ROWS)).toContain('而不是')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G242 —— 判据纪律自检：G17 的判据只有一份实现（Story 1.9 的 P0 的同型防线）
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 本文件自己的源码 —— 用来做**判据纪律自检**。
 *
 * ⚠️ 为什么需要它：Story 1.9 的 P0 是「守卫真身与变异各抄了一份判据，
 *   把真守卫整体停用后全套仍全绿」。`asset-url-guard.test.ts` 早就为
 *   `g16Violations` 写过同款自检；本文件当时**没有** ——
 *   于是 G17 一直没有导出判据，M43 在测试体内另抄了一份集合逻辑，
 *   两边各写各的。实测（`[CR]` 2026-10-21 复审）：把 G17 那条
 *   「45 个 (data-row, data-col) 组合与合法集完全相等」整条删掉
 *   ⇒ 本文件 **83 条全绿**（含 M43）—— 一条守「45 格唯一性」的守卫
 *   可以被无声删掉。
 *
 * ⚠️ **本条能守住什么、不能守住什么**（如实写清楚，不夸大）：
 *   · 能守住：**判据只有一份实现**（定义恰好一次）+ **守卫生效的判定用的就是它**
 *     （本文件里 `g17Violation(` 至少出现三次：定义、守卫、M43）。
 *     ⇒ 守卫生效的判定若被换成「测试体内另抄的一份」，本条立刻红。
 *   · 不能守住：把守卫生效的那条 `expect` 整个删掉、同时**保留** M43 的调用 ——
 *     那时本文件里 `g17Violation(` 只剩两次 ⇒ 本条**仍然会红**（3 次的下限兜住了它）。
 *   ⇒ 这两条合起来，本文件**第一次**具备「守卫生效的判定与变异问同一个函数」的
 *     机器可查证据（AC-13 逐字要求）。
 */
describe('G242 —— 判据纪律自检：G17 的判据只有一份实现', () => {
  // ⚠️ **必须先剥注释**（R-52）：上面那段 JSDoc 里逐字提到了判据的名字与调用形态，
  //   不剥的话它自己就把计数撑上去了 —— 一次「自检把自己算进去」的假红。
  const selfSource = stripComments(
    readFileSync(resolve(process.cwd(), 'tests/components/battle-field.test.ts'), 'utf8'),
  )

  it('G17 的判据在本文件里只被定义了一次（没有第二份拷贝）', () => {
    // ⚠️ 模式**动态拼**：写成字面量的话，这段代码自己就成了「第二个定义」。
    const definitions = selfSource.match(new RegExp(['export function g17', 'Violation'].join(''), 'g')) ?? []

    expect(
      definitions.length,
      `G17 的判据被定义了 ${definitions.length} 次 —— 判据被抄多份，真守卫停用后全套仍会全绿` +
        '（Story 1.9 的 P0）',
    ).toBe(1)
  })

  it('守卫生效的判定与 M43 问的是同一个函数（删掉守卫生效的判定 ⇒ 本条红）', () => {
    const calls = selfSource.match(/g17Violation\(/g) ?? []

    // 三次 = 定义 1 + 守卫生效的判定 1 + M43 1。
    // ⚠️📎 失败消息里**不能**逐字写出「判据名 + 左括号」——
    //   那行模板字符串本身就在被统计的源码里，会把自己算成第 N 次
    //   （首版就踩了这个：变异 M289 打上来时全绿，因为消息串把它补回了 3 次）。
    //   ⇒ 消息里只写判据名，不带左括号。
    expect(
      calls.length,
      `本文件里判据 \`g17Violation\` 的调用只出现 ${calls.length} 次 —— ` +
        '守卫生效的判定或 M43 有一处已经不再问这个判据本体了',
    ).toBeGreaterThanOrEqual(3)
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
