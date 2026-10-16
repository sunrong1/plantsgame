/**
 * 工程脚手架的边界回归测试。
 *
 * AC-2 / AC-3 / AC-4 全部是「某处配置必须长某个样」的验收。纯手工验收意味着
 * 半年后某次重构顺手把 tsconfig.core.json 的 lib 加回 DOM，或者有人把 build
 * script 里的 vue-tsc 删了（反正 build 也能过），边界静默失效、没有任何东西报警。
 *
 * 这三类「假绿」（配置看起来都在，但没生效）是本 story 最真实的失败模式，
 * 这个文件就是它们的守卫。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PROBE_FILES,
  isGloballyIgnored,
  optionsOf,
  patternStrings,
  probeFilesExist,
  rulesForFile,
  severityOf,
} from '../fixtures/eslint-rules'
import vitestConfig from '../../vitest.config'

const root = fileURLToPath(new URL('../../', import.meta.url))

// tsconfig 是 JSONC（允许 // 注释），所以不能直接 JSON.parse。
// 这里只剥掉整行注释 —— 配置文件里的注释都是独占一行的，行内注释不处理。
const readJson = (relPath: string): unknown =>
  JSON.parse(
    readFileSync(`${root}${relPath}`, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n'),
  )

describe('core/ 边界的工具链强制', () => {
  it('tsconfig.core.json 的 lib 不含 DOM，且 types 为空数组', () => {
    const core = readJson('tsconfig.core.json') as {
      compilerOptions: { lib: string[]; types: string[] }
    }
    const { lib, types } = core.compilerOptions

    // 零 DOM 红线就在 lib 这一行。DOM.Iterable 同理，附带的 DOM API 一样泄漏。
    expect(lib).not.toContain('DOM')
    expect(lib).not.toContain('DOM.Iterable')
    // 不写 types: [] 会全局注入 @types/node，于是 core/ 里 process、Buffer 可用
    expect(types).toEqual([])
  })

  it('tsconfig.app.json 排除 src/core，且 references 指向 core', () => {
    const app = readJson('tsconfig.app.json') as {
      exclude: string[]
      references: { path: string }[]
    }

    expect(app.exclude).toContain('src/core/**/*')

    // TS6307：即使 exclude 了 src/core，只要 app 层 import core 就会报错。
    // 缺了这条 reference，本 story 侥幸能过，Story 1.3 让 app 层 import core 时才炸。
    expect(app.references).toContainEqual({ path: './tsconfig.core.json' })
  })

  it('tsconfig.app.json 声明了 DOM（app 层确实需要）', () => {
    const app = readJson('tsconfig.app.json') as {
      compilerOptions: { lib: string[] }
    }
    const { lib } = app.compilerOptions

    expect(lib).toContain('DOM')
  })

  // ⚠️ 这里必须 import 真实配置求值，不能对 eslint.config.js 做子串匹配。
  // 早期版本用的是 toMatch(/files:\s*\[\s*'src\/core/) + 两条 toContain —— 那是三个互相独立的
  // 字符串检查，可以由三个不同的 config 块分别满足。以下都是「测试全绿但防线已废」的真实回归：
  //   · 把规则的 files 挪到别的目录（别的块仍匹配那个正则）
  //   · 后面追加一个 rules: { 'no-restricted-imports': 'off' } 的块
  //   · 把 'error' 降成 'warn'（且 eslint . 没有 --max-warnings，不会让 lint 失败）
  it('eslint 对 src/core 配了 no-restricted-imports，且严重级别是 error', async () => {
    const rule = (await rulesForFile('src/core/balance.ts'))['no-restricted-imports']

    expect(rule, 'src/core 上没有 no-restricted-imports 规则').toBeDefined()
    expect(severityOf(rule)).toBe('error')
  })

  it('eslint 对 src/core 配了 no-restricted-globals，且严重级别是 error', async () => {
    const rule = (await rulesForFile('src/core/grid.ts'))['no-restricted-globals']

    expect(rule, 'src/core 上没有 no-restricted-globals 规则').toBeDefined()
    expect(severityOf(rule)).toBe('error')
  })

  it('core/ 禁掉 DOM 全局：window / document / localStorage / speechSynthesis 都在名单里', async () => {
    // 光断言「规则存在」不够 —— 把某个名字从名单里删掉，规则照样在，防线已经开口子。
    const rule = (await rulesForFile('src/core/grid.ts'))['no-restricted-globals']
    // ESLint 把每个受限全局写成 ['error', {name:'window'}, {name:'document'}, …]
    // —— 名单是尾部展开的元素数组，不是嵌套在 rule[1] 里的数组。
    const entries = (Array.isArray(rule) ? rule.slice(1) : []) as { name: string }[]

    const guarded = entries.map((entry) => entry.name)
    expect(guarded).toEqual(
      expect.arrayContaining(['window', 'document', 'localStorage', 'speechSynthesis']),
    )
  })

  it('core/ 禁掉 vue 与向上依赖（app/ services/ components/）', async () => {
    const rule = (await rulesForFile('src/core/balance.ts'))['no-restricted-imports']
    const options = optionsOf(rule)

    expect(options?.paths?.map((p) => p.name)).toContain('vue')

    // 项目没有 @/ 别名，patterns 必须覆盖相对导入的上跳形态，否则规则永不触发。
    const patterns = patternStrings(options)
    expect(patterns.some((p: string) => p.includes('../app/'))).toBe(true)
    expect(patterns.some((p: string) => p.includes('../services/'))).toBe(true)
    expect(patterns.some((p: string) => p.includes('../components/'))).toBe(true)
  })

  /**
   * ⚠️ `[CR]` 2026-10-16 补 —— 原查询模型的两个洞之一：`ignores` 是**全局排除**。
   *
   * 实测：把 `'src/components/**'` 加进 flat config 的 ignores ⇒ 受 lint 文件数
   * 58 → 55，三个组件不再被 lint，而**所有守卫照绿**（lint 脚本是 `eslint .`，
   * 没有 `--max-warnings`，被 ignore 的文件是静默跳过）。
   *
   * 这里不再问「哪些块声明了 ignores」，而是直接断言「**探针文件没有被排除**」——
   * 因为若被排除，`calculateConfigForFile` 会返回一份空规则表，
   * 上面几条 `toBeDefined()` 会以另一种方式红（而那条红是偶然的，不是设计出来的）。
   */
  it.each(PROBE_FILES)('%s 没有被 flat config 的全局 ignores 排除', (path) => {
    expect(isGloballyIgnored(path), `${path} 被 eslint 的 ignores 排除了`).toBeUndefined()
  })

  it('全部探针文件在磁盘上真实存在（改名/移走会让查询悄悄落到兜底配置）', () => {
    for (const { path, exists } of probeFilesExist()) {
      expect(exists, `${path} 不在磁盘上，但它是规则的探针文件`).toBe(true)
    }
  })
})

describe('SFC 组件解析', () => {
  it('vitest 配置挂了 vue plugin（否则组件测试直接 transform 失败）', () => {
    // vitest.config.ts 不继承 vite.config.ts，plugin 必须显式挂 —— 见该文件注释。
    const plugins = (vitestConfig as { plugins?: unknown[] }).plugins ?? []

    expect(
      plugins.length,
      'vitest.config.ts 没有 plugins —— import .vue 会 transform 失败，报错看起来像工具链坏了',
    ).toBeGreaterThan(0)
  })

  it('eslint 全局启用了 vue/no-undef-components（防「漏 import 组件 → 白屏」）', async () => {
    // Debug Log #4：<script setup> 漏 import 时 vue-tsc / build / test / lint 全绿，页面却是纯白。
    const rule = (await rulesForFile('src/components/battle/Tower.vue'))['vue/no-undef-components']

    expect(rule, '没开 vue/no-undef-components，白屏那一类 bug 无自动守卫').toBeDefined()
    expect(severityOf(rule)).toBe('error')
  })
})

describe('tsconfig 项目覆盖', () => {
  it('tests/ 被某个 tsconfig 覆盖（守卫测试自己也要被类型检查）', () => {
    const root_ = readJson('tsconfig.json') as { references: { path: string }[] }
    const test = readJson('tsconfig.test.json') as {
      include: string[]
      references: { path: string }[]
    }

    expect(test.include).toContain('tests/**/*.ts')
    // 测试会 import src/core/ 的被测对象，缺这条 reference 会报 TS6307
    expect(test.references).toContainEqual({ path: './tsconfig.core.json' })
    // 且必须挂在 solution 上，否则 vue-tsc -b 根本不会走到它
    expect(root_.references).toContainEqual({ path: './tsconfig.test.json' })
  })

  it('src/content/ 被 test 项目列出（Story 1.6 / AC-30）', () => {
    const test = readJson('tsconfig.test.json') as { include: string[] }

    // composite 项目要求「所有文件必须被列出」。少了这一行，内容层测试与
    // validate-content.ts 在 vitest 加载时报 TS6307 —— 而报错发生在
    // 「加载测试文件」阶段，看起来像工具链坏了，不像内容层配置漏了。
    expect(
      test.include,
      'tsconfig.test.json 的 include 少了 src/content/**/*.ts —— ' +
        'tests/content/*.test.ts 与 scripts/validate-content.ts import 它时会报 TS6307',
    ).toContain('src/content/**/*.ts')
  })
})

describe('npm scripts 与 build 的类型检查', () => {
  const pkg = readJson('package.json') as { scripts: Record<string, string> }
  const scripts = pkg.scripts

  it('五个 AC-4 要求的 script 齐备', () => {
    for (const name of ['dev', 'build', 'test', 'validate:content', 'balance-sim']) {
      expect(scripts, `package.json 缺少 script: ${name}`).toHaveProperty(name)
    }
  })

  it('build 里含 vue-tsc', () => {
    // Vite 8（Rolldown）的构建管线是 transpile-only —— 不做类型检查。
    // 照字面写 `vite build` 的话，下面这行删掉类型检查就静默消失了。
    expect(scripts.build).toContain('vue-tsc')
  })
})

describe('vitest 配置', () => {
  it('passWithNoTests 为 true', () => {
    // AC-4 要求「npm run test 此刻通过（零测试）」。
    // Vitest 找不到测试文件时默认以非 0 退出码失败。
    expect(vitestConfig.test?.passWithNoTests).toBe(true)
  })

  it('测试只收 tests/ 下的文件（core/ 内不出现 .test.ts）', () => {
    expect(vitestConfig.test?.include).toEqual(['tests/**/*.test.ts'])
  })
})
