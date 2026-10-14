/**
 * 内容层的边界守卫（Story 1.6 / Task 7.4）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **塔型集合 === `TOWER_TYPES`** —— `src/content/schema.ts` 里那份 `z.enum` 字面量
 *    是有意的重复，重复就会漂移。这条断言是它唯一的防漂移装置（M11 的守卫）。
 * 2. **`src/content/` 的 DOM / Vue 边界** —— 内容层落在 app 项目（有 DOM）里，
 *    core 那条「零 DOM」红线对它不生效，ESLint 是唯一还拦得住的地方。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **不写死 `['direct','slow','aoe']`**。写死了这条断言就变成「两处字面量相等」，
 *   而真正的风险是 core 那一侧变了（塔型增删）时内容层没跟上。
 *   所以期望值从 `TOWER_TYPES` 取 —— core 改了，这里立刻红。
 * · **求值 eslint 配置而不是匹配源码字符串**，理由同 `core-boundary.test.ts:84-89`：
 *   子串匹配可以被另一个 config 块分别满足，测试全绿而防线已废。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TOWER_TYPES } from '../../src/core/balance'
import { TowerTypeSchema } from '../../src/content/schema'
import eslintConfig from '../../eslint.config.js'

/** flat config 里单个 config 块的形状（只取这里用到的字段）。 */
interface EslintBlock {
  files?: string | string[]
  rules?: Record<string, unknown>
}

/** 从 flat config 数组里找出命中 files 的规则块（合并多块，同名后者覆盖前者）。 */
const rulesFor = (fileGlob: string): Record<string, unknown> => {
  const blocks = (eslintConfig as unknown as EslintBlock[]).filter(
    (block) =>
      !block.files || (Array.isArray(block.files) ? block.files : [block.files]).includes(fileGlob),
  )
  return Object.assign({}, ...blocks.map((block) => block.rules ?? {}))
}

/** schema 的塔型枚举取值集合（从 schema 的元信息取，不另抄一份字面量）。 */
function towerTypesFromSchema(): readonly string[] {
  // Zod 4 的枚举把合法值放在 `.def.entries` 里，形如 `{ direct: 'direct', ... }`。
  // ⚠️ 这是一次对 zod 内部形状的读取 —— 若 zod 升级改了它，本文件立刻红，
  //   那正是想要的：换版本时必须回来重新确认这条断言仍然等价于「枚举的取值集合」。
  const def = TowerTypeSchema.def as { entries?: Record<string, string> }
  if (def.entries === undefined) {
    throw new Error('TowerTypeSchema 不再是枚举 —— 塔型白名单的形状变了，本断言需要重写')
  }
  return Object.keys(def.entries)
}

describe('AC-7 / M11 —— 塔型的单一事实源', () => {
  it('内容层的塔型集合 === core 的 TOWER_TYPES', () => {
    expect(
      [...towerTypesFromSchema()].sort(),
      '内容 schema 的塔型集合与 core/balance.ts 的 TOWER_TYPES 不一致 —— ' +
        '战斗数值按 core 查表，内容层却能录入别的塔型 ⇒ 塔建成时静默 undefined',
    ).toEqual([...TOWER_TYPES].sort())
  })

  it('content/ 上 no-restricted-imports 同时禁 vue 与 core（两条边界都要真被守）', () => {
    // 若哪天有人图省事改成 `z.enum(TOWER_TYPES)`，内容校验就会依赖战斗层模块加载成功。
    // 这条断言把那个选择挡在外面：要改成 import，必须先改这条测试并说明理由。
    const rule = rulesFor('src/content/**/*.{ts,vue}')['no-restricted-imports']
    expect(rule, 'content/ 上没有 no-restricted-imports 规则').toBeDefined()

    const shape = (Array.isArray(rule) ? rule[1] : rule) as {
      paths?: { name?: string }[]
      patterns?: { group?: string[] }[]
    }
    // 边界一：零 Vue 依赖。
    expect(
      (shape.paths ?? []).map((p) => p.name),
      'vue 不在禁列里 ⇒ content/ 可以 import vue，边界已废',
    ).toContain('vue')

    // 边界二：不 import core。
    // ⚠️ [CR] 2026-10-14：这一条原先**根本不存在**。旧断言只检查了「规则存在且含 vue」，
    // 而 core 从来不在禁列里 —— 注释还写着「core 不在禁列里 —— 见下一条 it」，
    // 后面并没有下一条 it。变异坐实：给 schema.ts 加
    // `import { TOWER_TYPES } from '../core/balance'` 后 93/93 全绿。
    // 「声明的边界」和「被守的边界」差了整整一条，这是本项目记忆里那条教训的第四次。
    const groups = (shape.patterns ?? []).flatMap((p) => p.group ?? [])
    expect(
      groups,
      'core 不在 no-restricted-imports 的 patterns 里 ⇒ 内容层可以依赖战斗层模块加载成功，' +
        '一个坏 JSON 会先报成 import 失败，报错现场离错误源头很远',
    ).toContain('**/core/**')
  })

  it('content/ 的源码里真的没有 import core（规则之外再验一次实际代码）', () => {
    // 规则可能配错、可能只对某些 glob 生效。这条直接读源码，
    // 是「边界」这个断言最后一道不依赖任何配置的兜底。
    const srcDir = fileURLToPath(new URL('../../src/content/', import.meta.url))
    const offenders: string[] = []
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts')) continue
      const body = readFileSync(join(srcDir, name), 'utf8')
      for (const m of body.matchAll(/from\s+'([^']+)'/g)) {
        if (/(^|\/)core(\/|$)/.test(m[1])) offenders.push(`${name} → ${m[1]}`)
      }
    }

    expect(
      offenders,
      `内容层 import 了 core：${offenders.join('、')} —— 内容校验不得依赖战斗层模块加载成功`,
    ).toEqual([])
  })
})

describe('AC-30 的副作用 —— content/ 的 DOM 边界由 ESLint 守', () => {
  it('src/content 配了 no-restricted-globals，且严重级别是 error', () => {
    const rule = rulesFor('src/content/**/*.{ts,vue}')['no-restricted-globals']

    expect(
      rule,
      'src/content 上没有 no-restricted-globals —— 内容层落在 app 项目（有 DOM）里，' +
        'core 的零 DOM 红线对它不生效，没有这条就完全没有守卫',
    ).toBeDefined()
    expect(Array.isArray(rule) ? rule[0] : rule).toBe('error')
  })

  it('禁掉的是 DOM 全局（window / document / localStorage）', () => {
    const rule = JSON.stringify(rulesFor('src/content/**/*.{ts,vue}')['no-restricted-globals'])

    for (const name of ['window', 'document', 'localStorage']) {
      expect(rule, `content/ 的 DOM 边界没禁住 ${name}`).toContain(name)
    }
  })
})
