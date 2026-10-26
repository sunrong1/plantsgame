/**
 * ── G332 —— `core/` 的唯一对外出口：**外部只许走 barrel** ───────────────────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * R-09 逐字写着：「外部引用 `core/` 的成员一律经 `src/core/index.ts`，
 * **不得深路径 import 内部模块**」，而它自己的**守卫**字段如实记着：
 * 「⚠️ **无守卫** ……**测试侧是明示例外**；`src/` 侧的约束目前只靠约定」。
 * ⇒ 本守卫补上 `src/` 侧与 `scripts/` 侧那道约定。
 *
 * ── 为什么值得守 ──────────────────────────────────────────────────────────
 * `src/core/index.ts` 的文件头逐字写着「**下游一律从 `'../core'` 导入，
 * 不要深路径 import 单个模块** —— 否则模块间的依赖关系会漏出对外出口，
 * 改内部结构时波及调用方」。
 * ⇒ 一旦有人写 `import { ZOMBIE_HP } from '../core/balance'`，
 *   内部模块名就**变成了对外 API** ⇒ 以后想改 `balance.ts` 的内部结构，
 *   就得先数一遍谁在深路径引用它。
 * ⚠️ `eslint.config.js` 只禁了 `components → core/balance` **那一条**
 *   （战斗数值常量，漂移风险最高）⇒ 其余内部模块的深路径 import **无人看**。
 *
 * ── 口径 ──────────────────────────────────────────────────────────────────
 * · **判的范围** = `src/` 下（`src/core/` **之外**）的全部 `.ts` / `.vue`
 *   ＋ `scripts/` 下的全部 `.ts`。
 * · **测试侧是明示例外**（R-09 守卫字段逐字写着「`tests/core/placeholder.test.ts`
 *   的文件头明确写着『深路径 import 是本仓库既有测试的写法，零守卫强制』」）
 *   ⇒ `tests/` **不判**。本文件只管 `src/` 与 `scripts/`。
 * · **barrel** = `src/core`（目录导入）或 `src/core/index.*`（点名文件）。
 *   两者都算「走出口」。
 * · 只判**相对导入**（`'../core/balance'`）；包名不是深路径。
 * · 判据用 **TypeScript 的 AST**（`tests/helpers/import-specifiers.ts`）：
 *   静态 / 动态 / 重导出 / `require` 四种形态一次收齐；
 *   注释与字符串里的字面量天然不算导入（R-52）。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖源码书写形态）────────────────────
 * **M404**：往 `src/app/store.ts` 注入一行
 *   `import { ZOMBIE_HP } from '../core/balance'`
 *   ⇒ G332.1 **确实变红**（点名文件与那一条导入）⇒ 判据真的在咬。
 * **M405**：同一处改成**动态**形态 `await import('../core/balance')`
 *   ⇒ 仍**变红** ⇒ 动态形态没被放过（DF-120 那条教训的回归检查）。
 * 两次都已复原（`git diff --stat src/app/store.ts` 无输出）。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **DF-189** 销账进度表里的 **R-09** 那一行（逐字：「`core/` 只走 barrel 唯一出口，
 * 在 `src/` 侧纯靠约定 … `src/` 与 `scripts/` 的深路径 import 数 = **0** ⇒ 潜在风险」）
 * ＋ **R-09** 本身。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { importSpecifiers, type ImportSpecifierHit } from '../helpers/import-specifiers'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** barrel 本体。 */
const BARREL = 'src/core/index.ts'

/** 判据覆盖的两个根目录（`src/core/` 自身除外）。 */
const ROOTS = ['src', 'scripts'] as const

/** 递归列出某个根目录下全部 `.ts` / `.vue` 文件（仓库相对路径）。 */
function filesUnder(relRoot: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
        out.push(relative(root, path).replace(/\\/g, '/'))
      }
    }
  }
  walk(join(root, relRoot))
  return out.sort()
}

/** 取出 `.vue` 文件里的 `<script>` 块正文（`<script setup>` 也算）。 */
function scriptBlock(source: string): string {
  const parts: string[] = []
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    parts.push(match[1] ?? '')
  }
  return parts.join('\n')
}

/** 把相对导入解析成仓库相对路径（`..` / `.` 归一化掉）。 */
function resolveRelative(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = dirname(filePath).split('/')
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') base.pop()
    else base.push(segment)
  }
  return base.join('/')
}

/**
 * 判据本体：列出「绕过 barrel 深路径 import 了 `core/` 内部模块」的条目。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）。
 */
export function barrelViolations(
  filePath: string,
  hits: readonly ImportSpecifierHit[],
): string[] {
  // ⚠️ `core/` **内部**互相 import 是允许的 —— 出口只管外部。
  //   这一句放在判据**本体**里（而不是扫描侧过滤），这样反向自测才有意义。
  if (filePath.startsWith('src/core/')) return []

  const problems: string[] = []
  for (const hit of hits) {
    const resolved = resolveRelative(filePath, hit.specifier)
    if (resolved === null) continue
    // 只关心指进 `src/core/` 的导入。
    if (resolved !== 'src/core' && !resolved.startsWith('src/core/')) continue
    // 走 barrel 的两种写法都算数：目录导入 `../core` 与点名 `../core/index.js`。
    if (resolved === 'src/core' || /^src\/core\/index\.[cm]?[jt]s$/.test(resolved)) continue
    problems.push(
      `${filePath} → '${hit.specifier}'（${hit.form}）：` +
        'core/ 的内部模块只能经 src/core/index.ts 引用（深路径 import 会把内部模块名变成对外 API）',
    )
  }
  return problems
}

/** 某条导入是不是「指进了 `src/core/`」（用于非空自检计数）。 */
function pointsIntoCore(filePath: string, specifier: string): boolean {
  const resolved = resolveRelative(filePath, specifier)
  if (resolved === null) return false
  return resolved === 'src/core' || resolved.startsWith('src/core/')
}

/** 读一个源文件里**全部**导入写法（`.vue` 只取 `<script>` 块）。 */
function importsOf(filePath: string): ImportSpecifierHit[] {
  const raw = readFileSync(join(root, filePath), 'utf8')
  const body = filePath.endsWith('.vue') ? scriptBlock(raw) : raw
  return importSpecifiers(filePath, body)
}

describe('G332 —— `core/` 的唯一对外出口：外部只许走 barrel（R-09 / DF-189）', () => {
  it('G332.1 `src/`（core 之外）与 `scripts/` 里没有绕过 barrel 的深路径 import', () => {
    const files = ROOTS.flatMap((relRoot) => filesUnder(relRoot))

    const problems: string[] = []
    let coreImportCount = 0
    for (const file of files) {
      const hits = importsOf(file)
      coreImportCount += hits.filter((h) => pointsIntoCore(file, h.specifier)).length
      problems.push(...barrelViolations(file, hits))
    }

    expect(
      problems,
      `绕过 barrel 深路径 import 了 core/ 的内部模块：\n${problems.join('\n')}`,
    ).toEqual([])

    // 非空自检：一条 core 导入都没扫到 ⇒ 判据在空集上成立。
    expect(coreImportCount, '一条 core 导入都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(10)
  })

  it('G332.2 barrel 本体存在且非空（出口本身不能缺）', () => {
    expect(
      existsSync(join(root, BARREL)),
      `${BARREL} 不存在 —— core/ 就没有对外出口了（R-09）`,
    ).toBe(true)
    expect(
      readFileSync(join(root, BARREL), 'utf8').length,
      `${BARREL} 是空的 —— 出口存在但什么都没导出`,
    ).toBeGreaterThan(100)
  })

  it('G332.3 反向自测：判据本体真的会把「深路径 import」判成问题（判据不是恒绿）', () => {
    // 构造：app 层深路径 import core/balance ⇒ 判据必须报出来。
    const deep = barrelViolations('src/app/store.ts', [
      { specifier: '../core/balance', form: 'static' },
    ])
    expect(
      deep.length,
      `构造失效：深路径 import 没被抓出来 ⇒ 判据在空集上成立\n${deep.join('\n')}`,
    ).toBeGreaterThan(0)

    // 反向：走 barrel 的两种写法都不许报。
    expect(
      barrelViolations('src/app/store.ts', [
        { specifier: '../core', form: 'static' },
        { specifier: '../core/index.js', form: 'static' },
      ]),
      '构造失效：走 barrel 的导入被误报了',
    ).toEqual([])

    // 反向：core 内部互相 import 不判（出口只管外部）。
    expect(
      barrelViolations('src/core/reducer.ts', [
        { specifier: './balance.js', form: 'static' },
      ]),
      '构造失效：core/ 内部互相 import 被判成了越界',
    ).toEqual([])

    // 反向：与 core 无关的深路径 import 不判。
    expect(
      barrelViolations('src/components/hud/HeartRow.vue', [
        { specifier: '../../app/store', form: 'static' },
      ]),
      '构造失效：与 core 无关的导入被误报了',
    ).toEqual([])
  })

  it('G332.4 反向自测：动态 import 与 `require` 形态也咬得住（DF-120 的回归检查）', () => {
    const dynamic = barrelViolations('src/app/store.ts', [
      { specifier: '../core/balance', form: 'dynamic' },
    ])
    expect(
      dynamic.length,
      '构造失效：动态 import 的深路径引用没被抓出来 ⇒ 判据只认静态形态（DF-120 的老坑）',
    ).toBeGreaterThan(0)

    const required = barrelViolations('scripts/balance-sim.ts', [
      { specifier: '../src/core/balance', form: 'require' },
    ])
    expect(
      required.length,
      '构造失效：`require` 形态的深路径引用没被抓出来',
    ).toBeGreaterThan(0)
  })
})
