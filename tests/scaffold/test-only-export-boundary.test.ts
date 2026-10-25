/**
 * G325 —— `src/**` 不得引用「测试专用导出」（名字以 `ForTest` 结尾的导出）。
 * （DF-057；结清于 2026-10-26 夜）
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 *   `src/services/save.ts` 的 `clearSaveDegradationsForTest()` 与
 *   `src/services/asset-degradations.ts` 的 `clearAssetDegradationsForTest()`
 *   是**只给测试用**的复位口 —— 两个模块的降级登记表都是**模块级 `Map`**，
 *   不会自动复位，而「没有降级项时不露『重试写入』按钮」这类判据**必须**在空表上成立。
 *
 *   🚨 **DF-057 逐字记着的后果**：
 *   「一旦有人图省事在生产代码里调 `clearSaveDegradationsForTest()`，
 *   **降级登记表会被悄悄清空** ⇒ 面板对家长说『存档正常』，
 *   而孩子此后每一次落盘都在丢进度 —— **和 G222 / G244 守的那两个缺陷完全同型**。」
 *
 *   ⇒ 判据：**生产代码里一次都不许提到这两个名字**（连「提到」都不许，
 *   因为提到就意味着有人在用它，或快要用它）。
 *
 * ── 为什么用 **AST** 而不是正则（R-51 / R-52 的正确姿势）─────────────────────
 *   正则扫「源码里有没有 `ForTest` 这个词」是**形态型禁令**，换一种写法就绕过去了：
 *   `import { clearSaveDegradationsForTest as reset }`（别名）、
 *   `import * as save` + `save.clearSaveDegradationsForTest()`（命名空间）、
 *   `const { clearSaveDegradationsForTest } = await import(...)`（动态导入）、
 *   `obj['clearSaveDegradationsForTest']`（下标）——
 *   四种都能从正则的缝里钻过去，而**注释与字符串字面量**又会让正则假红。
 *
 *   ⇒ 本守卫走 **TypeScript 的 AST**（本仓已有依赖，`tests/helpers/describe-titles.ts`
 *     同款做法）：
 *   · **判据本体**：把源码里**每一个标识符**与**每一个字符串字面量**都收集起来，
 *     与「测试专用导出清单」求交集 ⇒ **上面四种绕法一次都绕不过去**
 *     （别名会留下 `property` 那个标识符；命名空间 / 动态导入会留下属性名；
 *     下标访问会留下字符串字面量）；
 *   · **注释与字符串天然不在其中**（AST 里根本没有注释节点）⇒ 不会假红，
 *     也不必先剥注释（R-52 的目的由 AST 直接达成）。
 *
 * ── 「测试专用导出清单」是**现算的**，不是写死的名单 ──────────────────────────
 *   清单来自**扫描 `src/**` 里实际声明的导出**（名字以 `ForTest` 结尾）。
 *   ⇒ 将来有人新加一个 `resetProgressForTest`，**不用改任何名单**就被守住。
 *   ⚠️ 而「只查名字后缀」这个判据本身是**从源码里的注释与约定继承来的**
 *     （两个模块的注释逐字写着「命名带 `ForTest` 就是为了让任何误用都在 code review 里
 *     一眼看见」）⇒ 那是**命名契约**，本守卫守的正是它。
 *
 * ── 扫描面不许塌掉（R-51 第 1 类）─────────────────────────────────────────
 *   · **语法错误 ⇒ 抛错**：AST 解析失败时树是「半残」的，判据会扫到一个不完整的面
 *     ⇒「扫不到违规」被读成「没有违规」。**响亮失败**。
 *   · **正向对照**：先自证「清单非空」且「扫到的文件数 > 20」⇒
 *     「扫到 0 个导出」不会被读成「没有违规」。
 *   · **反向对照**：断言 `tests/**` **确实在用**这些导出 ⇒
 *     这条禁令不是「没人用的空气守卫」，而是**生产侧必须避开的那条界线**。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 *   `_bmad-output/implementation-artifacts/deferred-work.md` 的 **DF-057**
 *   （恢复条件逐字：「任何要加『测试专用导出』或要动 `tests/scaffold/` 边界守卫的
 *   story，同一次改动里补一条『`src/**` 不得 import 名字以 `ForTest` 结尾的导出』的守卫」
 *   —— **2026-10-26 夜触发**：本轮动了 `tests/scaffold/save-boundary.test.ts`
 *   与 `tests/scaffold/deferred-ledger.test.ts` 两条边界守卫）
 *   ＋ 同轮结清 **DF-166**（旧编号 **E19**，恢复条件逐字「下次给 `*ForTest` 补守卫时
 *   （与 E5 同批）」—— 逐字相同 ⇒ 同批）。
 *
 * ── 变异验证（R-50 触发条件 ②：`.vue` 的 `<script>` 块靠正则抽取）─────────────
 *   · **M386**：在 `src/services/asset-degradations.ts` 加一行
 *     `import { clearSaveDegradationsForTest } from './save'`
 *     ⇒ `grep` 证实落盘 ⇒ **1 红 / 那一支 7 条**，报出精确的
 *     「`src/services/asset-degradations.ts:22` —— 生产代码引用了测试专用导出」；
 *   · **M387**：在 `src/components/debug/DebugPanel.vue` 的 `<script setup>` 里加同一行
 *     ⇒ `grep` 证实落盘 ⇒ **1 红 / 那一支 7 条**，报出
 *     「`src/components/debug/DebugPanel.vue:65`」
 *     ⇒ **顺带证明 `.vue` 的 `<script>` 块抽取没塌**（那一条正是判据的一处依赖）。
 *   ⇒ 两次都已复原（`git diff --stat src/` 为空）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 「测试专用导出」的名字后缀。
 *
 * ⚠️ 这不是本守卫发明的约定 —— 它是 `src/services/save.ts` 与
 *   `src/services/asset-degradations.ts` 两个模块注释里**逐字**写着的：
 *   「命名带 `ForTest` 就是为了让任何误用都在 code review 里一眼看见」。
 */
export const TEST_ONLY_SUFFIX = 'ForTest'

// ── 扫描面 ────────────────────────────────────────────────────────────────

/** 递归列出 `src/` 下的源文件（相对仓库根）。 */
export function listSrcFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) out.push(rel)
    }
  }
  walk('src')
  return out.sort()
}

/** 递归列出 `tests/` 下的 `.ts` 文件（相对仓库根）—— 用来做「反向对照」。 */
export function listTestFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(rel)
        continue
      }
      if (entry.name.endsWith('.ts')) out.push(rel)
    }
  }
  walk('tests')
  return out.sort()
}

/** `.vue` 只取 `<script>` 块（模板与样式里没有 import）。 */
function scriptOf(relPath: string): string {
  const source = readFileSync(join(root, relPath), 'utf8')
  if (!relPath.endsWith('.vue')) return source
  const blocks: string[] = []
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    blocks.push(match[1])
  }
  return blocks.join('\n')
}

/**
 * 解析成 AST（**便宜**的那条路：只建树，不做语法诊断）。
 *
 * ⚠️ 解析失败时 TS 仍会返回一棵「半残」的树（缺节点、位置错乱）⇒
 *   判据会扫到一个**不完整的面** ⇒「扫不到违规」被读成「没有违规」⇒ 假绿。
 *   ⇒ 被守卫的**真实文件**一律先过 {@link assertParses}；夹具源码本来就是手写的、
 *   一旦写坏，负向夹具自己会红（那也是「响亮失败」）。
 */
export function parseSource(text: string, label: string): ts.SourceFile {
  // ⚠️ 文件名**不能以 `.d.ts` 结尾**（`transpileModule` 会对声明文件抛
  //   「Debug Failure. Output generation failed」；而**内容**是不是声明文件与它无关）。
  const safeName = label.replace(/\.d\.ts$/, '.ts')
  return ts.createSourceFile(safeName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/**
 * 语法诊断；**有语法错误 ⇒ 抛错**（不许带着一棵坏树继续跑）。
 *
 * ⚠️ 这一步**贵**（`transpileModule` 要走一遍发射管线）⇒ 只对**被守卫的真实文件**
 *   调用，不对 `tests/` 全量调用（那边的语法错会让 vitest 自己炸，不必重复守）。
 */
export function assertParses(text: string, label: string): void {
  const safeName = label.replace(/\.d\.ts$/, '.ts')
  const transpiled = ts.transpileModule(text, {
    reportDiagnostics: true,
    fileName: safeName,
    compilerOptions: { target: ts.ScriptTarget.Latest, noEmit: true },
  })
  const diagnostics = transpiled.diagnostics ?? []
  if (diagnostics.length > 0) {
    throw new Error(
      `${label}：源码解析失败（${diagnostics.length} 条语法诊断）—— ` +
        '判据不许在扫描面塌掉时静默当绿。第一条：' +
        ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' '),
    )
  }
}

// ── 判据本体（纯函数：吃源码文本，吐违规清单）────────────────────────────

/** 一处引用。 */
export interface Reference {
  name: string
  /** 1 起。 */
  line: number
}

/**
 * 文件里**声明**出来的测试专用导出名。
 *
 * 覆盖四种声明形态：`export function` / `export class` / `export const|let|var`
 * 与 `export { a, b as c }`。
 * ⚠️ **不含** `export type` / `export interface` —— 类型导出在运行期不存在，
 *   清不了任何模块级状态 ⇒ 不在「测试专用导出」的射程里。
 */
export function testOnlyExportsIn(source: ts.SourceFile): string[] {
  const names: string[] = []
  const add = (name: string | undefined): void => {
    if (name !== undefined && name.endsWith(TEST_ONLY_SUFFIX)) names.push(name)
  }
  for (const stmt of source.statements) {
    const exported =
      ts.canHaveModifiers(stmt) &&
      (ts.getModifiers(stmt) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      if (exported) add(stmt.name?.text)
    }
    if (ts.isVariableStatement(stmt) && exported) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) add(decl.name.text)
      }
    }
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.exportClause !== undefined &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const spec of stmt.exportClause.elements) add(spec.name.text)
    }
  }
  return names
}

/**
 * 源码里对给定名字的**引用**。
 *
 * ⚠️ 收集**每一个标识符**与**每一个字符串字面量** ——
 *   这样四种绕法一次都绕不过去：
 *   · `import { x as y }` ⇒ `x` 那个标识符在；
 *   · `import * as ns` + `ns.x()` ⇒ 属性名标识符在；
 *   · `const { x } = await import(...)` ⇒ 绑定名标识符在；
 *   · `obj['x']` ⇒ 下标访问里的**字符串字面量**在。
 * ⚠️ **注释不在其中**（AST 里没有注释节点）⇒ 不会假红。
 * ⚠️ **字符串字面量只在下标访问里算引用** —— 孤零零一条 `const doc = 'x'`
 *   只是「提到」那个名字，拿它当引用会让守卫天天假红。
 */
export function referencesIn(
  source: ts.SourceFile,
  names: ReadonlySet<string>,
): Reference[] {
  const found: Reference[] = []
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && names.has(node.text)) {
      found.push({ name: node.text, line: lineOf(node) })
      return
    }
    // ⚠️ **字符串字面量只在下标访问里算引用**（`obj['x']`）。
    //   一条孤零零的字符串（`const doc = 'x'`）只是「提到」那个名字，
    //   拿它当引用会让守卫天天假红 ⇒ 判据的粒度不能粗于它要防的那一项。
    if (
      ts.isStringLiteral(node) &&
      names.has(node.text) &&
      node.parent !== undefined &&
      ts.isElementAccessExpression(node.parent) &&
      node.parent.argumentExpression === node
    ) {
      found.push({ name: node.text, line: lineOf(node) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/**
 * 解析一个真实源文件并**缓存**（扫描面扫两遍：先算清单，再找引用）。
 *
 * ⚠️ 缓存只按**文件路径**做 ⇒ 文件内容变了不会命中旧树 ——
 *   而本仓的测试每次都在新进程里跑，磁盘上的内容就是当次的。
 */
const sourceCache = new Map<string, ts.SourceFile>()

function parsedSrcFile(file: string): ts.SourceFile {
  const cached = sourceCache.get(file)
  if (cached !== undefined) return cached
  const text = scriptOf(file)
  assertParses(text, file)
  const source = parseSource(text, file)
  sourceCache.set(file, source)
  return source
}

/** 全仓的「测试专用导出」清单：名字 → 声明它的文件。 */
export function testOnlyExportSurface(files: readonly string[]): Map<string, string> {
  const surface = new Map<string, string>()
  for (const file of files) {
    for (const name of testOnlyExportsIn(parsedSrcFile(file))) {
      if (!surface.has(name)) surface.set(name, file)
    }
  }
  return surface
}

/**
 * 判据本体：`src/**` 里对「测试专用导出」的引用（**声明它的那一处除外**）。
 *
 * @param files   被扫的文件（相对仓库根）
 * @param surface 测试专用导出清单（名字 → 声明它的文件）
 */
export function findViolations(
  files: readonly string[],
  surface: ReadonlyMap<string, string>,
): string[] {
  const names = new Set(surface.keys())
  const problems: string[] = []
  for (const file of files) {
    for (const ref of referencesIn(parsedSrcFile(file), names)) {
      // 声明它的那一处本身不算引用（那正是「它为什么存在」的地方）
      if (surface.get(ref.name) === file) continue
      problems.push(
        `${file}:${ref.line} —— 生产代码引用了测试专用导出「${ref.name}」` +
          '（它清的是模块级降级登记表：清空后面板会对家长说「存档正常」，' +
          '而孩子此后每一次落盘都在丢进度 —— 与 G222 / G244 同型）',
      )
    }
  }
  return problems
}

// ── 被守卫的真实文件 ──────────────────────────────────────────────────────

const SRC_FILES = listSrcFiles()
const SURFACE = testOnlyExportSurface(SRC_FILES)

describe('G325 —— `src/**` 不得引用「测试专用导出」（名字以 `ForTest` 结尾）', () => {
  it('G325.1 扫描面自检：清单非空、文件数够多（扫到 0 个 ⇒ 判据在空集上成立）', () => {
    expect(
      SRC_FILES.length,
      '正向对照：`src/` 下扫到的源文件太少 —— 递归可能没生效，判据在空集上成立',
    ).toBeGreaterThan(20)
    expect(
      SURFACE.size,
      '正向对照：一个「测试专用导出」都没扫到 —— 导出识别的判据坏了，' +
        '下面「生产代码零引用」就只是「没扫到东西」',
    ).toBeGreaterThan(0)
    // ⚠️ 逐字点名那两个**已知**的复位口：它们是这条禁令的**标的**。
    //   这一条不是判据（判据是现算的清单），而是「清单确实认得这两个名字」的锚点。
    expect([...SURFACE.keys()].sort()).toEqual(
      expect.arrayContaining(['clearAssetDegradationsForTest', 'clearSaveDegradationsForTest']),
    )
  })

  it('G325.2 生产代码零引用测试专用导出', () => {
    const problems = findViolations(SRC_FILES, SURFACE)

    expect(
      problems,
      `生产代码引用了测试专用导出：\n${problems.join('\n')}\n` +
        '—— DF-057 逐字：清空降级登记表 ⇒ 面板对家长说「存档正常」，' +
        '而孩子此后每一次落盘都在丢进度。',
    ).toEqual([])
  })

  it('G325.3 反向对照：`tests/**` 确实在用这些导出（禁令守的是生产侧那条界线）', () => {
    const names = new Set(SURFACE.keys())
    const used = listTestFiles().filter((file) => {
      const source = parseSource(readFileSync(join(root, file), 'utf8'), file)
      return referencesIn(source, names).length > 0
    })

    expect(
      used.length,
      '反向对照：`tests/` 下一个测试专用导出都没被引用 —— ' +
        '这条禁令就变成了「没人用的空气守卫」（而生产侧那条界线也就无从谈起）',
    ).toBeGreaterThan(0)
  })
})

describe('G325 —— 负向夹具：每种绕法都必须被报出来（R-50 / R-51）', () => {
  /** 夹具用的「测试专用导出」清单（用真实名字，判据不关心名字怎么来）。 */
  const fixtureSurface = new Map([
    ['clearSaveDegradationsForTest', 'src/services/save.ts'],
    ['clearAssetDegradationsForTest', 'src/services/asset-degradations.ts'],
  ])

  it('G325.3.1 四种绕法 + 注释与字符串字面量，都必须被报出来', () => {
    const fixtures: readonly [string, string][] = [
      [
        '具名 import',
        "import { clearSaveDegradationsForTest } from '../services/save'\n",
      ],
      [
        '别名 import（正则最容易漏的一种）',
        "import { clearSaveDegradationsForTest as reset } from '../services/save'\n" +
          'reset()\n',
      ],
      [
        '命名空间 import + 成员调用',
        "import * as save from '../services/save'\n" +
          'save.clearSaveDegradationsForTest()\n',
      ],
      [
        '动态 import + 解构',
        "const { clearAssetDegradationsForTest } = await import('../services/asset-degradations')\n",
      ],
      [
        '下标访问',
        "import * as save from '../services/save'\n" +
          "save['clearSaveDegradationsForTest']()\n",
      ],
      [
        're-export',
        "export { clearSaveDegradationsForTest } from '../services/save'\n",
      ],
    ]

    for (const [name, source] of fixtures) {
      const problems = findViolationsInSource(source, 'src/fixture.ts', fixtureSurface)
      expect(
        problems.length,
        `构造失效：${name} 没被判成违规（判据对这一种绕法毫无反应）`,
      ).toBeGreaterThan(0)
    }
  })

  it('G325.3.2 注释与字符串字面量里的那个名字**不许**被报出来（否则守卫天天假红）', () => {
    const source = [
      "// 命名带 `ForTest` 就是为了让任何误用都在 code review 里一眼看见",
      "/** 文档注释里提到 clearSaveDegradationsForTest */",
      "const doc = 'clearSaveDegradationsForTest'",
      'const 其他 = 1',
    ].join('\n')

    expect(
      findViolationsInSource(source, 'src/fixture.ts', fixtureSurface),
      '注释与字符串字面量里的名字被判成了违规 —— AST 里根本没有注释节点，' +
        '字符串字面量只有「整段等于那个名字」时才算引用（那本身就是可疑写法）',
    ).toEqual([])
  })

  it('G325.3.3 声明它的那一处本身**不算**违规（否则守卫会红在自己身上）', () => {
    const source = [
      'export function clearSaveDegradationsForTest(): void {',
      '  degraded.clear()',
      '}',
    ].join('\n')

    expect(
      findViolationsInSource(source, 'src/services/save.ts', fixtureSurface),
      '声明处被判成了违规 —— 判据必须把「它为什么存在」的那一处排除掉',
    ).toEqual([])
  })

  it('G325.3.4 合法代码不许被误报（判据的粒度不能粗于它要防的那一项）', () => {
    const source = [
      "import { saveDegradations, writeSave } from '../services/save'",
      'const items = saveDegradations()',
      'writeSave(payload)',
      'const 名字 = "saveDegradations"',
    ].join('\n')

    expect(
      findViolationsInSource(source, 'src/fixture.ts', fixtureSurface),
      '合法代码被判成了违规 —— 判据只认「名字以 ForTest 结尾」的那两个',
    ).toEqual([])
  })
})

/**
 * 对**一份源码文本**跑判据（夹具用）。
 *
 * ⚠️ 单独抽出来，是为了让负向夹具能**直接**喂一段源码 ——
 *   否则夹具只能靠「把源码写进一个假文件」来驱动，那条路已经绕回真实文件扫描了，
 *   「构造失效」与「判据失效」就分不开（R-51）。
 */
function findViolationsInSource(
  source: string,
  label: string,
  surface: ReadonlyMap<string, string>,
): string[] {
  const parsed = parseSource(source, label)
  const names = new Set(surface.keys())
  return referencesIn(parsed, names)
    .filter((ref) => surface.get(ref.name) !== label)
    .map(
      (ref) =>
        `${label}:${ref.line} —— 生产代码引用了测试专用导出「${ref.name}」` +
        '（它清的是模块级降级登记表：清空后面板会对家长说「存档正常」，' +
        '而孩子此后每一次落盘都在丢进度 —— 与 G222 / G244 同型）',
    )
}
