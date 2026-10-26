/**
 * ── G331 —— `src/` 的层级依赖方向：**零反向依赖** ──────────────────────────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * R-08 逐字写着「依赖方向只能向下：`components → app → services → core`」，
 * 而它自己的**守卫**字段如实记着：
 * 「**components→app→services→core 的次序与跨层反向无守卫**」——
 * 现有的 `tests/scaffold/core-boundary.test.ts` 只守了 **core 那一端**
 * （core 不得 import vue 与 app/services/components），**其余各层的反向没人看**。
 *
 * ⇒ 本守卫把**每一层的反向依赖**都钉住：
 * `core` 不得 import 任何上层；`content` 不得 import 任何别的层；
 * `services` 不得 import `app` / `components` / `views`；
 * `app` 不得 import `components` / `views`；`components` 不得 import `views`。
 *
 * ── 为什么判据落在**源码**而不是 eslint 配置 ──────────────────────────────
 * `core-boundary.test.ts` 那套「求值 eslint 配置、断言规则存在」守的是
 * 「**规则还在**」；本守卫守的是「**代码真的没越界**」——
 * 哪天有人改了 `eslint.config.js` 的 `files` 块、把某个层从规则覆盖里漏掉，
 * eslint 那边会静默，而本守卫照样红。
 * ⚠️ 两道各管一半，**不是重复**（同 `tsconfig.core.json` 与 ESLint 的分工）。
 *
 * ── 为什么用 TS 的 AST 而不是正则 ─────────────────────────────────────────
 * DF-120 的实测：正则 `/from\s+'([^']+)'/g` **看不见动态 `import()`**
 * （动态 import 没有 `from` 关键字），而实测它能把 `ZOMBIE_HP` 真读回来。
 * ⇒ 这里走 `tests/helpers/import-specifiers.ts`：**静态 / 动态 / 重导出 / `require`**
 *   四种形态一次收齐，注释与字符串里的字面量天然不算导入。
 *
 * ── 口径 ──────────────────────────────────────────────────────────────────
 * · **层** = `src/` 下的**第一段目录名**（`core` / `content` / `services` /
 *   `app` / `components` / `views`）。`src/main.ts` 与 `src/App.vue` 是入口，
 *   **不属于任何层** ⇒ 不参与判定（它们本来就可以 import 任何东西）。
 * · 只判**相对导入**（`'../core'`）；`'vue'` / `'zod'` 这类包名不是层。
 * · 解析出来**逃出 `src/`** 的导入不判（层在 `src/` 内部，逃出去就与层无关）。
 * · **「跨层直连」不判**（`components → services` / `components → core` 现状合法，
 *   见下方「哪些不判」）。
 *
 * ── 哪些不判（写清楚，免得下次各判各的）──────────────────────────────────
 * ⚠️ R-08 的正文还写着「**不得跨层直连**」，但现状里 `components` 直连
 *   `services`（`asset-url` / `asset-degradations` / `sw-registration` /
 *   `pronunciation-status`）与直连 `core`（14 处）**都是合法的**
 *   —— ESLint 只禁 `components → core/balance`（战斗数值常量）那一条。
 *   ⇒ 本守卫**只守「反向」**（依赖方向倒过来），不守「跨层」。
 *   若哪天要连「跨层」一起守，得先改那 20 处 import，那是**另一个决定**。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖源码书写形态）────────────────────
 * **M402**：往 `src/app/store.ts` 注入一行 `import { Tower } from '../components/battle/Tower.vue'`
 *   ⇒ G331.1 **确实变红**（点名文件与那一条导入）⇒ 判据真的在咬。
 * **M403**：同一处改成**动态**形态 `await import('../components/battle/Tower.vue')`
 *   ⇒ 仍**变红** ⇒ 动态形态没被放过（DF-120 那条教训的回归检查）。
 * 两次都已复原（`git diff --stat src/app/store.ts` 无输出）。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **DF-189**（Epic 1 集成层检视登记的「六条规则今天合规但无机器守卫」那张表里
 * 的 **R-08** 那一行，逐字：「「次序与跨层反向」那半没守卫 … 逐文件核过 `src/`：
 * **今天零反向依赖** ⇒ 潜在风险」）＋ **R-08** 本身的守卫字段。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { importSpecifiers, type ImportSpecifierHit } from '../helpers/import-specifiers'

const root = fileURLToPath(new URL('../../', import.meta.url))
const SRC_DIR = join(root, 'src')

/** `src/` 下的层（第一段目录名）。 */
export const LAYERS = [
  'core',
  'content',
  'services',
  'app',
  'components',
  'views',
] as const

export type Layer = (typeof LAYERS)[number]

/**
 * 每层**可以** import 的层。
 *
 * ⚠️ 这张表是**判据本体的一部分**，不是「实测现状的转写」——
 *   表里放宽 = 允许跨层直连；表里收紧 = 那条边界的现状就变成违规（守卫会红）。
 *   改这张表等于改 R-08 的口径，必须在同一个改动里说清理由。
 */
export const ALLOWED_TARGETS: Readonly<Record<Layer, readonly Layer[]>> = {
  // 最底层：只许认识 core 内部。
  core: ['core'],
  // 数据层：只许认识 content 内部（**不许多 import core** —— R-10）。
  content: ['content'],
  // 服务层：可以往下用 core 与 content，但**不许认识 app / UI**。
  services: ['core', 'content', 'services'],
  // 应用层：可以往下用 core / content / services，但**不许认识 UI 组件**。
  app: ['core', 'content', 'services', 'app'],
  // 组件层：可以往下用 core / content / services / app，但**不许认识 views**
  // （views 是页面层的入口，组件被页面用，不是反过来）。
  components: ['core', 'content', 'services', 'app', 'components'],
  // 页面层：最上面，不许被任何层反向依赖。
  views: ['core', 'content', 'services', 'app', 'components', 'views'],
}

/** 取出 `.vue` 文件里的 `<script>` 块正文（`<script setup>` 也算）。 */
function scriptBlock(source: string): string {
  const parts: string[] = []
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    parts.push(match[1] ?? '')
  }
  return parts.join('\n')
}

/** 递归列出 `src/` 下全部 `.ts` 与 `.vue` 文件（仓库相对路径）。 */
function sourceFiles(dir: string = SRC_DIR): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
      out.push(relative(root, path).replace(/\\/g, '/'))
    }
  }
  return out.sort()
}

/** 这个目录下（含子目录）有没有 `.ts` / `.vue` 源码。 */
function hasCode(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (hasCode(path)) return true
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
      return true
    }
  }
  return false
}

/** 某个文件属于哪一层（`src/main.ts` 这类入口文件不属于任何层 ⇒ `null`）。 */
export function layerOf(filePath: string): Layer | null {
  const parts = filePath.split('/')
  if (parts[0] !== 'src' || parts.length < 3) return null
  const first = parts[1]!
  return (LAYERS as readonly string[]).includes(first) ? (first as Layer) : null
}

/**
 * 相对导入指向哪一层。
 *
 * ⚠️ 只认**相对**说明符；解析出来**逃出 `src/`** 的返回 `null`（不判）。
 */
export function targetLayerOf(filePath: string, specifier: string): Layer | null {
  if (!specifier.startsWith('.')) return null
  const base = dirname(filePath).split('/')
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') base.pop()
    else base.push(segment)
  }
  if (base[0] !== 'src' || base.length < 2) return null
  const first = base[1]!
  return (LAYERS as readonly string[]).includes(first) ? (first as Layer) : null
}

/**
 * 判据本体：列出「某层 import 了它不许碰的层」的条目。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）——
 * 反向自测只断言假夹具自身的话，判据被掏空时照样绿。
 */
export function layerViolations(
  filePath: string,
  hits: readonly ImportSpecifierHit[],
): string[] {
  const source = layerOf(filePath)
  if (source === null) return []
  const allowed = ALLOWED_TARGETS[source]
  const problems: string[] = []
  for (const hit of hits) {
    const target = targetLayerOf(filePath, hit.specifier)
    if (target === null) continue
    if (!allowed.includes(target)) {
      problems.push(
        `${filePath} → '${hit.specifier}'（${hit.form}）：` +
          `${source} 层不得 import ${target} 层（依赖方向只能向下）`,
      )
    }
  }
  return problems
}

/** 读一个源文件里**全部**导入写法（`.vue` 只取 `<script>` 块）。 */
function importsOf(filePath: string): ImportSpecifierHit[] {
  const raw = readFileSync(join(root, filePath), 'utf8')
  const body = filePath.endsWith('.vue') ? scriptBlock(raw) : raw
  return importSpecifiers(filePath, body)
}

describe('G331 —— `src/` 的层级依赖方向：零反向依赖（R-08 / DF-189）', () => {
  it('G331.1 `src/` 里没有任何一层 import 了它不许碰的层', () => {
    const files = sourceFiles()
    const problems: string[] = []
    let importCount = 0
    for (const file of files) {
      const hits = importsOf(file)
      importCount += hits.length
      problems.push(...layerViolations(file, hits))
    }

    expect(
      problems,
      `层级反向依赖（依赖方向只能向下：components → app → services → core）：\n${problems.join('\n')}`,
    ).toEqual([])

    // 非空自检：扫不到文件 / 扫不到导入 ⇒ 判据在空集上成立。
    expect(files.length, '一个 src/ 源文件都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(20)
    expect(importCount, '一条导入都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(40)
  })

  it('G331.2 层表覆盖了 `src/` 下的每一个层目录（新增层不许漏）', () => {
    // ⚠️ 漏一条层 = 那一层的反向依赖**全都不判** ⇒ 判据静默变宽。
    //   只数**含代码**（`.ts` / `.vue`）的目录 —— `src/styles/` 只有 CSS，
    //   它不是层（也不 import 任何东西）。
    const dirs = readdirSync(SRC_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => hasCode(join(SRC_DIR, name)))
      .sort()
    const layers = [...LAYERS].sort()

    expect(
      dirs,
      `src/ 下含代码的目录与层表对不上 —— 新增一个层目录却没在 ALLOWED_TARGETS 里登记，\n` +
        '那一层的反向依赖就全都不判了（判据静默变宽）',
    ).toEqual(layers)

    // 层表里每一条都必须真的被用上 —— 写错层名（比如 `component` 少了 s）会在这里红。
    for (const layer of LAYERS) {
      expect(
        ALLOWED_TARGETS[layer],
        `层 '${layer}' 在 ALLOWED_TARGETS 里没有登记 —— 判据会把它当成「不许碰任何层」`,
      ).toBeDefined()
    }
  })

  it('G331.3 反向自测：判据本体真的会把「反向导入」判成问题（判据不是恒绿）', () => {
    // 构造：app 层 import components ⇒ 判据必须报出来。
    const reverse = layerViolations('src/app/store.ts', [
      { specifier: '../components/battle/Tower.vue', form: 'static' },
    ])
    expect(
      reverse.length,
      `构造失效：app → components 这条反向依赖没被抓出来：\n${reverse.join('\n')}`,
    ).toBeGreaterThan(0)
    expect(
      reverse[0],
      '构造失效：报出来的不是 app → components 那一条',
    ).toContain('app 层不得 import components 层')

    // 反向：合规的向下导入不许报。
    expect(
      layerViolations('src/app/store.ts', [
        { specifier: '../core/reducer', form: 'static' },
        { specifier: '../services/save', form: 'static' },
        { specifier: '../content', form: 'static' },
      ]),
      '构造失效：app → core / services / content 这三条合规导入被误报了',
    ).toEqual([])

    // 反向：入口文件（不属于任何层）不参与判定。
    expect(
      layerViolations('src/main.ts', [
        { specifier: './components/battle/BattleField.vue', form: 'static' },
      ]),
      '构造失效：入口文件 src/main.ts 被当成层内文件判了',
    ).toEqual([])
  })

  it('G331.4 反向自测：动态 import 与 `require` 形态也咬得住（DF-120 的回归检查）', () => {
    const dynamic = layerViolations('src/app/store.ts', [
      { specifier: '../components/battle/Tower.vue', form: 'dynamic' },
    ])
    expect(
      dynamic.length,
      '构造失效：动态 import 的反向依赖没被抓出来 ⇒ 判据只认静态形态（DF-120 的老坑）',
    ).toBeGreaterThan(0)

    const required = layerViolations('src/services/save.ts', [
      { specifier: '../app/store', form: 'require' },
    ])
    expect(
      required.length,
      '构造失效：`require` 形态的反向依赖没被抓出来',
    ).toBeGreaterThan(0)
  })
})
