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

import vitestConfig from '../../vitest.config'

const root = fileURLToPath(new URL('../../', import.meta.url))

const readJson = (relPath: string): unknown => JSON.parse(readFileSync(`${root}${relPath}`, 'utf8'))
const readText = (relPath: string) => readFileSync(`${root}${relPath}`, 'utf8')

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

  it('eslint 对 src/core 配了 no-restricted-imports', () => {
    const eslintConfig = readText('eslint.config.js')

    expect(eslintConfig).toMatch(/files:\s*\[\s*'src\/core/)
    expect(eslintConfig).toContain('no-restricted-imports')
    expect(eslintConfig).toContain('no-restricted-globals')
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