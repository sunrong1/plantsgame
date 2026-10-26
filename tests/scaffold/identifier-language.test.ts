/**
 * ── G334 —— R-13「标识符全英文、注释全中文」的机器守卫 ──────────────────────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * R-13 逐字：「**变量 / 函数 / 类型 / 文件名一律英文；注释一律中文**（SVG 内的注释也是，
 * 见 [content.md](content.md)）。」而它自己的守卫字段写着「⚠️ **无守卫**」。
 *
 * ⇒ 本守卫把这条**协作约定**变成机器可查的，分四半：
 *   ① **声明型标识符**（变量 / 函数 / 类型 / 参数 / 成员 / 文件名）**不许含中文**；
 *   ② **数据键**（对象字面量的键 / 属性访问）含中文 ⇒ 只许出现在**例外清单**里；
 *   ③ **注释**逐行含中文（或该行不含任何散文词）；
 *   ④ **CSS 类名**不许含中文。
 *
 * ── 为什么「注释」这一半不是「必须含汉字」这么死 ──────────────────────────
 *   注释里有**大量**合法的**非中文**形态，而它们**都不是散文**：
 *   · `/// <reference types="vite/client" />` —— **TypeScript 编译器指令**，
 *     语法固定，写不了中文；
 *   · **vitest 的环境注解**（docblock 里那行 `ENV_TAG`）—— **R-60 逐字要求**的
 *     英文注解，Vitest 靠它解析环境，写成中文就**直接失效**；
 *   · `// ── AC-C1 / G49：SunCounter ───` —— **分隔线** + 代码引用
 *     （AC 编号 / 守卫号 / 标识符名），没有散文可译；
 *   · 反引号里的**代码引用**（含跨行配对的那种）—— 是代码，不是散文。
 *   ⇒ 判据因此是：**这一行**含汉字，或**这一行**没有散文词，才算合规。
 *   而「散文词」的定义必须**可判** ⇒ 本守卫只认一种散文形态：
 *   **去掉代码引用形态之后剩下的纯小写单词**（`setTimeout` / `awaiting-answer` /
 *   `AC-C1` / `G49` / `SunCounter` 都不算散文；`this`、`the`、`manifest` 算）。
 *
 * ── 判据为什么落在 **AST** 上，而不是正则 ──────────────────────────────────
 *   · **标识符**用 AST 的角色判定
 *     ⇒ 字符串字面量里的中文、注释里的中文，都**不算标识符**（R-52）；
 *   · **注释**取自「**叶子 token 之间的缝隙**」⇒ 正则字面量里的 `//`
 *     （`/^\s*\/\/.*$/gm`）**不会被当成注释**（那是叶子节点，不在缝隙里）。
 *
 * ── ⚠️⚠️ **本文件里不许出现 vitest 环境注解的标签字面量** ──────────────────
 *   Vitest 读**整个文件内容**找环境标签 ⇒ 文件里**只要出现**那个标签，
 *   **整个文件**就被切到 jsdom 环境 ⇒ `import.meta.url` 不再是 `file:` URL
 *   ⇒ `fileURLToPath(new URL('../../', import.meta.url))` 当场抛
 *   「The URL must be of scheme file」（实测：删掉标签字面量就正常）。
 *   ⇒ 本守卫要用这个标签**做判据**，就只能**拼出来**（见 `ENV_TAG`）。
 *
 * ── 例外清单纪律（与 `log-prefix-boundary` 那套同款）─────────────────────
 *   每条例外写明**哪个文件**、**为什么合法**；守卫再去核**前提还在**
 *   （那个文件里确实还有中文数据键）—— 前提没了，例外当场失效并报出来。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖源码书写形态）────────────────────
 * **M408**：往 `src/app/store.ts` 注入一行 `const 题卡 = 1`
 *   ⇒ G334.1 **确实变红**（点名文件、变量名、行号）⇒ 声明型标识符那半在咬。
 * **M409**：往 `src/app/store.ts` 注入两行注释（中文标题行 + 英文散文行
 *   `// this is an english comment`）
 *   ⇒ **第一版判据全绿**（⚠️ 两个洞，见下）⇒ 修完判据后 G334.3 **确实变红**
 *   （点名文件、行号、散文词）⇒ 注释那半在咬。
 *   ⚠️ **M409 抓出的两个洞（第一版判据是假的）**：
 *   ① **文件末尾的注释取不到** —— 用「AST 的 leading / trailing 注释区间」取注释时，
 *      最后一个语句之后没有下一个 token ⇒ 那段注释**没人认领** ⇒ 判据压根没看见它
 *      ⇒ 改成「**叶子 token 之间的缝隙**」逐段扫。
 *   ② **中文行掩护英文行** —— 连续的 `//` 行合成一组、整组判 ⇒ 只要组里**有一行**含汉字
 *      整组就合规 ⇒ 英文行躲在中文行旁边**过** ⇒ 改成**逐行**判。
 *   两次变异都已复原（`git diff src/app/store.ts` 只剩「代码引用加反引号」那一处真修改）。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **R-13**（`docs/rules/architecture.md`）＋ **DF-189** 销账进度表里的
 * **R-13** 那一行（逐字：「**R-13 / R-72 / R-23** | 中文标识符 / SVG 正则锚定 /
 * 僵尸容器位置键，三条都无守卫 | 逐条扫过：中文标识符 **0**、中文 CSS 类名 **0**、
 * 用 `\b` 锚 SVG 属性的正则 **0** ⇒ 全部现状合规」）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 要扫的**代码**目录（.ts / .vue）。 */
const CODE_DIRS = ['src', 'tests', 'scripts'] as const

/** 要扫的 **SVG** 目录（只扫注释；R-13 明写「SVG 内的注释也是」）。 */
const SVG_DIRS = ['public', 'docs/word-image-lab'] as const

/** 汉字（判据只认汉字，标点与假名不算）。 */
const HAN = /[一-鿿]/

/**
 * 例外清单：**数据键**（对象字面量的键 / 属性访问）允许含中文的文件。
 *
 * ⚠️ 每条都要写清**为什么合法** —— 没有理由的例外就是「守卫允许了它要防的违规」。
 */
export const DATA_KEY_EXCEPTIONS: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'scripts/verify-portrait-layout.ts',
    why:
      '这些中文键**就是给人读的表头**（竖屏量测工具打出的表逐字贴进 story 文档的实测表）' +
      '⇒ 改成英文会让工具输出更难读；R-13 逐字列的是「变量 / 函数 / 类型 / 文件名」，数据键不在其中',
  },
]

// ── 判据本体 ────────────────────────────────────────────────────────────────

/** 一次标识符命中。 */
export interface IdentifierHit {
  readonly file: string
  /** `声明标识符`（永不许中文）或 `数据键`（走例外清单）。 */
  readonly role: string
  readonly text: string
  readonly line: number
}

/**
 * 这个标识符是**声明**还是**数据键**。
 *
 * ⚠️ 口径（写清楚，免得下次各判各的）：
 * · **声明标识符** = 变量 / 函数 / 类 / 方法 / 属性 / 接口成员 / 类型别名 /
 *   枚举 / 枚举成员 / 参数 / 解构出来的变量 / 导入导出的名字 / 命名空间成员。
 * · **数据键** = **对象字面量的键**、**属性访问的名字**、**解构时重命名的原键**
 *   ⇒ 它们是**数据**不是代码实体。
 */
export function roleOf(node: ts.Identifier): string {
  const parent = node.parent
  if (!parent) return '声明标识符'
  if (ts.isPropertyAssignment(parent) && parent.name === node) return '数据键'
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return '数据键'
  if (ts.isBindingElement(parent) && parent.propertyName === node) return '数据键'
  if (ts.isShorthandPropertyAssignment(parent)) return '声明标识符'
  return '声明标识符'
}

/** 扫一个 `.ts` 源码里的中文标识符。 */
export function identifierHits(file: string, source: string): IdentifierHit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const hits: IdentifierHit[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && HAN.test(node.text)) {
      hits.push({
        file,
        role: roleOf(node),
        text: node.text,
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

/** 一组注释（连续 `//` 行合并成组；块注释与 SVG / 模板里的 HTML 注释各成一组）。 */
export interface CommentRun {
  readonly file: string
  readonly kind: string
  readonly line: number
  readonly text: string
}

/**
 * 取一个 `.ts` 源码里的全部注释组。
 *
 * ⚠️ **实现要点（这是第一版的真 bug）** ——
 *   第一版用「AST 的 leading / trailing 注释区间」取注释，**漏掉了两处**：
 *   ① **文件末尾**的注释（最后一个语句之后没有下一个 token ⇒ 没有 leading 区间）；
 *   ② **闭合花括号之前**的注释（`}` 不是节点 ⇒ 那段 trivia 没人认领）。
 *   ⇒ 实测：注入一行末尾注释 `// this is an english comment` 时守卫**全绿**。
 *   ⇒ 现在改成「**叶子 token 之间的缝隙**」逐段扫描：那些缝隙里**只有 trivia**
 *     （字符串 / 正则 / 模板串都是叶子节点，不在缝隙里）⇒ 用 TS scanner 扫缝隙
 *     **不会**把正则里的 `//` 误当成注释。
 */
export function tsCommentRuns(file: string, source: string): CommentRun[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  /** 叶子 token 的区间（`getStart()` 跳过前导 trivia ⇒ 区间之间就是缝隙）。 */
  const leaves: { start: number; end: number }[] = []
  const collectLeaves = (node: ts.Node): void => {
    let hasChild = false
    ts.forEachChild(node, () => {
      hasChild = true
      return true
    })
    if (!hasChild) {
      leaves.push({ start: node.getStart(sf), end: node.end })
      return
    }
    ts.forEachChild(node, collectLeaves)
  }
  collectLeaves(sf)

  const ranges: { pos: number; end: number; kind: ts.SyntaxKind }[] = []
  const scanGap = (from: number, to: number): void => {
    if (to <= from) return
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      /* skipTrivia */ false,
      ts.LanguageVariant.Standard,
      source,
    )
    scanner.setTextPos(from)
    while (scanner.getTokenPos() < to) {
      const kind = scanner.scan()
      if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        ranges.push({ pos: scanner.getTokenPos(), end: scanner.getTextPos(), kind })
      }
      if (kind === ts.SyntaxKind.EndOfFileToken) break
    }
  }

  let cursor = 0
  for (const leaf of leaves) {
    scanGap(cursor, leaf.start)
    cursor = leaf.end
  }
  scanGap(cursor, source.length)

  const lineAt = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1
  ranges.sort((a, b) => a.pos - b.pos)

  const runs: CommentRun[] = []
  let i = 0
  while (i < ranges.length) {
    const c = ranges[i]!
    const text = source.slice(c.pos, c.end)
    if (c.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
      // 连续的 `//` 行合并成**一组** —— 一段中文注释的**续行**不该被单独判。
      const texts = [text]
      let lastLine = lineAt(c.end)
      let j = i + 1
      while (
        j < ranges.length &&
        ranges[j]!.kind === ts.SyntaxKind.SingleLineCommentTrivia &&
        lineAt(ranges[j]!.pos) === lastLine + 1
      ) {
        texts.push(source.slice(ranges[j]!.pos, ranges[j]!.end))
        lastLine = lineAt(ranges[j]!.end)
        j += 1
      }
      runs.push({ file, kind: 'line', line: lineAt(c.pos), text: texts.join('\n') })
      i = j
    } else {
      runs.push({ file, kind: 'block', line: lineAt(c.pos), text })
      i += 1
    }
  }
  return runs
}

/** 取一个 `.vue` 文件里的全部注释组（`<script>` / `<style>` / `<template>` 三块）。 */
export function vueCommentRuns(file: string, source: string): CommentRun[] {
  const runs: CommentRun[] = []
  const lineAt = (pos: number): number => source.slice(0, pos).split('\n').length
  for (const m of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const run of tsCommentRuns(file, m[1] ?? '')) {
      runs.push({ ...run, line: run.line + lineAt(m.index ?? 0) })
    }
  }
  for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const c of (m[1] ?? '').matchAll(/\/\*[\s\S]*?\*\//g)) {
      runs.push({
        file,
        kind: 'block',
        line: lineAt((m.index ?? 0) + (c.index ?? 0)),
        text: c[0],
      })
    }
  }
  for (const m of source.matchAll(/<!--([\s\S]*?)-->/g)) {
    runs.push({ file, kind: 'html', line: lineAt(m.index ?? 0), text: m[1] ?? '' })
  }
  return runs
}

/** 取一个 `.svg` 文件里的全部注释组。 */
export function svgCommentRuns(file: string, source: string): CommentRun[] {
  const runs: CommentRun[] = []
  const lineAt = (pos: number): number => source.slice(0, pos).split('\n').length
  for (const m of source.matchAll(/<!--([\s\S]*?)-->/g)) {
    runs.push({ file, kind: 'svg', line: lineAt(m.index ?? 0), text: m[1] ?? '' })
  }
  return runs
}

/**
 * 「代码引用形态」—— 出现这些形态的词**不算散文**。
 *
 * ⚠️ 顺序有意义：先剥行内代码，再剥 camelCase / kebab / snake / 含数字 / 全大写，
 *   剩下的**纯小写单词**才叫散文。
 */
const CODE_SHAPES: readonly RegExp[] = [
  /`[^`]*`/g, // 行内代码
  /\b[A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*\b/g, // camelCase / PascalCase
  /\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g, // kebab-case
  /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, // snake_case
  /\b[A-Za-z0-9_]*\d[A-Za-z0-9_-]*\b/g, // 含数字
  /\b[A-Z][A-Z0-9]*\b/g, // 全大写
]

/** 一段文字里的**散文词**（去掉代码引用形态后剩下的纯小写单词）。 */
export function proseWords(text: string): string[] {
  let rest = text
  for (const shape of CODE_SHAPES) rest = rest.replace(shape, ' ')
  return [...rest.matchAll(/\b[a-z]{2,}\b/g)].map((m) => m[0])
}

/**
 * 把**成对反引号之间**的内容遮成空格（保留换行与位置）。
 *
 * ⚠️ 为什么要在**整组**上做：仓库里有一段跨行的行内代码引用
 *   （`ReferenceError: Cannot access` 换行 `'progress' before initialization`）
 *   ⇒ 反引号**跨行配对** ⇒ 逐行遮会漏。
 * ⚠️ **双反引号**（Markdown 里的双反引号代码块）先配对：它允许**内层**再出现单反引号
 *   （仓库里 `function t(t){return`${e}precache-${t}`}` 就是这种）。
 * ⚠️ **没有配对**的反引号**不遮**（后文照常判）—— 否则「随手打一个反引号」
 *   就能把后面整段英文散文藏起来。
 */
export function maskCodeSpans(text: string): string {
  const chars = text.split('')
  const mask = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) if (chars[k] !== '\n') chars[k] = ' '
  }
  // ① 双反引号优先。
  let i = 0
  while (i < chars.length) {
    if (chars[i] !== '`' || chars[i + 1] !== '`') {
      i += 1
      continue
    }
    const close = text.indexOf('``', i + 2)
    if (close === -1) break
    mask(i + 2, close)
    chars[i] = ' '
    chars[i + 1] = ' '
    for (let k = i + 2; k < close; k += 1) if (chars[k] !== '\n') chars[k] = ' '
    chars[close] = ' '
    chars[close + 1] = ' '
    i = close + 2
  }
  // ② 单反引号。
  i = 0
  while (i < chars.length) {
    if (chars[i] !== '`') {
      i += 1
      continue
    }
    const close = text.indexOf('`', i + 1)
    if (close === -1) break
    mask(i + 1, close)
    chars[i] = ' '
    chars[close] = ' '
    i = close + 1
  }
  return chars.join('')
}

/**
 * TypeScript 的**编译器指令**（`/// <reference … />`）—— 语法固定，写不了中文。
 *
 * ⚠️ 口径要**紧**：只认 `types` / `path` / `lib` 三种**真属性**且值是带引号的字符串
 *   —— 否则「伪装成指令的散文」（`/// <reference this is prose />`）会被放行。
 */
const TS_DIRECTIVE = /^\/\/\/\s*<reference\s+(?:types|path|lib)\s*=\s*"[^"]*"\s*\/>$/

/**
 * vitest 的**环境注解标签**（docblock 里那行）。
 *
 * ⚠️⚠️ **为什么它是拼出来的** ——
 *   Vitest 5 读**整个文件的内容**，用正则
 *   `/@(?:vitest|jest)-environment\s+([\w-]+)\b/` 找环境（实测见 vitest 的
 *   `detectCodeBlock`）⇒ **文件里只要出现这个标签字面量，整个文件就被切到
 *   jsdom 环境** ⇒ `import.meta.url` 不再是 `file:` URL ⇒
 *   `fileURLToPath(new URL('../../', import.meta.url))` 当场抛
 *   「The URL must be of scheme file」（实测：同一个文件，删掉标签字面量就正常）。
 *   ⇒ 本守卫**要用这个标签做判据**，就只能**拼出来** —— 源码里不出现连续字面量。
 */
const ENV_TAG = '@vitest-' + 'environment'

/** vitest 的**环境注解** docblock（R-60 逐字要求，Vitest 靠它解析环境）。 */
export function isVitestEnvDocblock(text: string): boolean {
  if (!text.trimStart().startsWith('/*')) return false
  const lines = text
    .split('\n')
    // 剥掉每行的块注释装饰：`**` / `*/` / `*`（三种都要认，漏一种就多一行假内容）。
    .map((l) => l.replace(/^\s*(?:\/\*+|\*+\/|\*+)/, '').trim())
    .filter((l) => l.length > 0)
  return lines.length > 0 && lines.every((l) => l.startsWith(ENV_TAG))
}

/**
 * 一组注释**为什么不合规**（空数组 = 合规）。
 *
 * 合规的两种形态：**含汉字**，或**不含任何散文词**（纯分隔线 / 纯代码引用）。
 * 另有两类**语法固定**的例外：TS 编译器指令、vitest 的环境注解。
 *
 * ⚠️ **逐行判**，不是逐组判 —— 逐组判会让**中文行掩护英文行**：
 *   实测（变异 M409）注入两行
 *   「// ── M409 临时变异…」＋「// this is an english comment」时，
 *   逐组判只看到「整组含汉字」⇒ **全绿**（漏）。
 *   ⇒ 现在逐行判：**这一行**含汉字，或**这一行**没有散文词 ⇒ 才算合规。
 *   ⚠️ 而行内代码引用**按整组遮**（反引号可能跨行配对）—— 见 `maskCodeSpans`。
 */
export function commentProblems(run: CommentRun): string[] {
  if (TS_DIRECTIVE.test(run.text.trim())) return []
  if (isVitestEnvDocblock(run.text)) return []
  const masked = maskCodeSpans(run.text)
  const problems: string[] = []
  let offset = 0
  for (const line of run.text.split('\n')) {
    if (!HAN.test(line)) {
      const prose = proseWords(masked.slice(offset, offset + line.length))
      if (prose.length > 0) {
        problems.push(
          `注释里有英文散文词「${prose.join('、')}」—— R-13：注释一律中文` +
            `（代码引用、AC 编号、守卫号不算散文）：${line.trim()}`,
        )
      }
    }
    offset += line.length + 1
  }
  return problems
}

/**
 * CSS 类名（含中文的类名 = 中文标识符）。
 *
 * ⚠️ 口径：**只看类名本身**，不看整段绑定文本 ——
 *   `:class="{ 'is-alive': x }"` 里可以夹**中文注释**，那是注释的事（由 G334.3 判），
 *   不是类名的事。⇒ 先把**引号里的字符串**取出来（对象绑定的键就在引号里），
 *   没有引号时（`class="a b c"`）按空白切。
 */
export function cssClassProblems(file: string, source: string): string[] {
  const problems: string[] = []
  const classAttr = /:class\s*=\s*"([^"]*)"|(?<!:)class\s*=\s*"([^"]*)"/g
  for (const m of source.matchAll(classAttr)) {
    const value = m[1] ?? m[2] ?? ''
    const quoted = [...value.matchAll(/'([^']*)'|"([^"]*)"/g)].map((q) => q[1] ?? q[2] ?? '')
    const names = quoted.length > 0 ? quoted : value.split(/\s+/).filter((t) => t.length > 0)
    for (const name of names) {
      if (HAN.test(name)) problems.push(`${file}：class 属性里有中文类名「${name}」`)
    }
  }
  if (file.endsWith('.css')) {
    for (const m of source.matchAll(/\.[A-Za-z0-9_-]*[一-鿿][^{, ]*/g)) {
      problems.push(`${file}：CSS 选择器里有中文类名「${m[0]}」`)
    }
  }
  return problems
}

// ── 扫描面 ──────────────────────────────────────────────────────────────────

/** 递归列出目录下的文件（仓库相对路径）。 */
function filesUnder(dir: string, accept: (name: string) => boolean): string[] {
  const out: string[] = []
  const abs = join(root, dir)
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const path = join(abs, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(relative(root, path), accept))
    else if (accept(entry.name)) out.push(relative(root, path).replace(/\\/g, '/'))
  }
  return out.sort()
}

/** 要扫的代码文件（`.ts` / `.vue`）。 */
export function codeFiles(): string[] {
  const out: string[] = []
  for (const dir of CODE_DIRS) {
    out.push(...filesUnder(dir, (name) => name.endsWith('.ts') || name.endsWith('.vue')))
  }
  return out
}

/** 要扫的 SVG 文件。 */
export function svgFiles(): string[] {
  const out: string[] = []
  for (const dir of SVG_DIRS) {
    out.push(...filesUnder(dir, (name) => name.endsWith('.svg')))
  }
  return out
}

/** 某个文件的全部注释组（按扩展名分派）。 */
export function commentRunsOf(file: string): CommentRun[] {
  const source = readFileSync(join(root, file), 'utf8')
  if (file.endsWith('.svg')) return svgCommentRuns(file, source)
  if (file.endsWith('.vue')) return vueCommentRuns(file, source)
  return tsCommentRuns(file, source)
}

/** 某个文件里的全部中文标识符命中（`.vue` 只看 `<script>` 块）。 */
export function identifierHitsOf(file: string): IdentifierHit[] {
  const source = readFileSync(join(root, file), 'utf8')
  if (file.endsWith('.vue')) {
    const hits: IdentifierHit[] = []
    for (const m of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
      for (const hit of identifierHits(file, m[1] ?? '')) {
        hits.push({
          ...hit,
          line: hit.line + source.slice(0, m.index ?? 0).split('\n').length,
        })
      }
    }
    return hits
  }
  return identifierHits(file, source)
}

describe('G334 —— R-13：标识符全英文、注释全中文', () => {
  it('G334.1 声明型标识符（变量 / 函数 / 类型 / 参数 / 成员 / 文件名）不许含中文', () => {
    const problems: string[] = []
    let scanned = 0
    for (const file of codeFiles()) {
      if (HAN.test(file.split('/').pop() ?? '')) {
        problems.push(`${file}：文件名含中文（R-13：文件名一律英文）`)
      }
      for (const hit of identifierHitsOf(file)) {
        scanned += 1
        if (hit.role === '声明标识符') {
          problems.push(`${file} 第 ${hit.line} 行：${hit.role}「${hit.text}」含中文`)
        }
      }
    }
    expect(
      problems,
      `这些声明型标识符含中文 —— R-13：变量 / 函数 / 类型 / 文件名一律英文：\n${problems.join('\n')}`,
    ).toEqual([])
    // 非空自检：一个中文标识符都没扫到 ⇒ 判据在空集上成立（扫描面塌了）。
    expect(scanned, '一个中文标识符都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(0)
  })

  it('G334.2 数据键含中文只许在例外清单里，且每条例外的前提仍在', () => {
    const problems: string[] = []
    const allowed = new Set(DATA_KEY_EXCEPTIONS.map((e) => e.file))
    const perFile = new Map<string, number>()
    for (const file of codeFiles()) {
      for (const hit of identifierHitsOf(file)) {
        if (hit.role !== '数据键') continue
        perFile.set(file, (perFile.get(file) ?? 0) + 1)
        if (!allowed.has(file)) {
          problems.push(
            `${file} 第 ${hit.line} 行：数据键「${hit.text}」含中文` +
              '（R-13：代码实体一律英文；要豁免就把这个文件写进 DATA_KEY_EXCEPTIONS 并说明理由）',
          )
        }
      }
    }
    // 例外的前提：那个文件里**确实还有**中文数据键 —— 没了就是过期例外，当场报出来。
    for (const exception of DATA_KEY_EXCEPTIONS) {
      if ((perFile.get(exception.file) ?? 0) === 0) {
        problems.push(
          `${exception.file} 的例外已过期：文件里已经找不到中文数据键` +
            `（${exception.why}）⇒ 请把这条例外删掉`,
        )
      }
    }
    expect(
      problems,
      `数据键的中文用法越界或例外已过期：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G334.3 注释必须含中文（或不含任何散文词）', () => {
    const problems: string[] = []
    let runs = 0
    for (const file of [...codeFiles(), ...svgFiles()]) {
      for (const run of commentRunsOf(file)) {
        runs += 1
        for (const problem of commentProblems(run)) {
          problems.push(`${file} 第 ${run.line} 行：${problem}\n    ${run.text.slice(0, 120)}`)
        }
      }
    }
    expect(
      problems,
      `这些注释是英文散文 —— R-13：注释一律中文：\n${problems.join('\n')}`,
    ).toEqual([])
    // 非空自检：一条注释都没扫到 ⇒ 判据在空集上成立。
    expect(runs, '一条注释都没扫到 ⇒ 判据在空集上成立').toBeGreaterThan(500)
  })

  it('G334.4 CSS 类名不许含中文', () => {
    const problems: string[] = []
    for (const file of [...codeFiles(), ...filesUnder('src/styles', (n) => n.endsWith('.css'))]) {
      problems.push(...cssClassProblems(file, readFileSync(join(root, file), 'utf8')))
    }
    expect(
      problems,
      `CSS 类名含中文 —— R-13：标识符全英文：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G334.5 反向自测：判据本体真的能抓住违规（判据不是恒绿）', () => {
    // ① 中文变量名 ⇒ 声明型标识符命中。
    const varHits = identifierHits(
      'src/probe.ts',
      'export function probe(): number {\n  const 题卡 = 1\n  return 题卡\n}',
    )
    expect(
      varHits.filter((h) => h.role === '声明标识符').map((h) => h.text),
      '构造失效：中文变量名没被当成声明型标识符抓出来 ⇒ 判据漏了一种写法',
    ).toEqual(['题卡', '题卡'])

    // ② 中文对象字面量键 ⇒ 数据键命中（**不是**声明型标识符）。
    const keyHits = identifierHits('src/probe.ts', 'export const row = { 题卡: 1 }')
    expect(
      keyHits.map((h) => h.role),
      '构造失效：中文对象字面量键的分类不对 ⇒ 例外清单会管错东西',
    ).toEqual(['数据键'])

    // ③ 英文散文注释 ⇒ 违规；中文注释 ⇒ 合规。
    expect(
      commentProblems({
        file: 'src/probe.ts',
        kind: 'line',
        line: 1,
        text: '// this is an english comment',
      }),
      '构造失效：英文散文注释没被判成违规 ⇒ 注释那半是恒绿的',
    ).not.toEqual([])
    expect(
      commentProblems({
        file: 'src/probe.ts',
        kind: 'line',
        line: 1,
        text: '// 这一行是中文注释',
      }),
      '构造失效：中文注释被判成了违规 ⇒ 判据把标准搞反了',
    ).toEqual([])

    // ④ 纯代码引用的分隔线不算散文；真散文算。
    expect(
      proseWords('// ── AC-C1 / G49：SunCounter ────────'),
      '构造失效：代码引用（AC 编号 / 守卫号 / 标识符名）被判成了散文 ⇒ 判据太凶',
    ).toEqual([])
    expect(
      proseWords('// rotate the barrel to the left'),
      '构造失效：真散文没被抓出来',
    ).toEqual(['rotate', 'the', 'barrel', 'to', 'the', 'left'])
  })

  it('G334.7 反向自测：M409 抓出来的两个洞（末尾注释 / 中文行掩护英文行）必须堵住', () => {
    // ① **文件末尾**的注释必须被抓到（第一版判据压根没看见它 ⇒ 恒绿）。
    const runs = tsCommentRuns('src/probe.ts', 'const a = 1\n// 末尾的那一行注释')
    expect(
      runs.map((r) => r.text),
      '构造失效：文件末尾的注释没被抓出来 ⇒ 判据在空集上成立（M409 的第一个洞）',
    ).toEqual(['// 末尾的那一行注释'])

    // ② **中文行旁边**的英文行必须被抓出来（整组判会让中文行掩护它）。
    expect(
      commentProblems({
        file: 'src/probe.ts',
        kind: 'line',
        line: 1,
        text: '// 这一行是中文标题\n// this line is english prose',
      }),
      '构造失效：中文行掩护了旁边的英文行 ⇒ 整组判是个假绿（M409 的第二个洞）',
    ).not.toEqual([])
  })

  it('G334.6 反向自测：两类语法固定的注释豁免**只**认固定形态', () => {
    // 编译器指令豁免。
    expect(
      commentProblems({
        file: 'src/probe.ts',
        kind: 'line',
        line: 1,
        text: '/// <reference types="vite/client" />',
      }),
      '构造失效：TS 编译器指令被判成了违规 ⇒ 豁免面太窄',
    ).toEqual([])
    // 长得像指令、但其实是散文 ⇒ 不许豁免。
    expect(
      commentProblems({
        file: 'src/probe.ts',
        kind: 'line',
        line: 1,
        text: '/// <reference this is prose />',
      }),
      '构造失效：伪装成编译器指令的散文被豁免了 ⇒ 豁免面太宽',
    ).not.toEqual([])

    // vitest 的环境注解豁免（R-60 逐字要求）。
    expect(
      commentProblems({
        file: 'tests/probe.test.ts',
        kind: 'block',
        line: 1,
        text: `/**\n * ${ENV_TAG} jsdom\n */`,
      }),
      '构造失效：vitest 的环境注解被判成了违规 ⇒ 豁免面太窄',
    ).toEqual([])
    // 注解块里夹一句散文 ⇒ 不许豁免。
    expect(
      commentProblems({
        file: 'tests/probe.test.ts',
        kind: 'block',
        line: 1,
        text: `/**\n * ${ENV_TAG} jsdom\n * this line is english prose\n */`,
      }),
      '构造失效：夹带英文散文的注解块被豁免了 ⇒ 豁免面太宽',
    ).not.toEqual([])
  })
})
