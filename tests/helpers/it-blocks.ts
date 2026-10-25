/**
 * 从测试源码里抽出**每个 `it(...)` 块**的结构化信息（Story 3.5 / G315.4）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 *   G315.4 要钉住 **G38 那个 `it` 块**的**调用点**：它的判据实参必须来自
 *   **共享扫描面**（`allVueSources` / `vueSourceFiles`），而不是 4 个文件的老名单。
 *   ⇒ 这件事**必须读源码**（运行期看不到「那个 `it` 块传了什么」）。
 *
 * ── 为什么用 AST 而不是正则 ────────────────────────────────────────────────
 *   正则在本仓库这个场景上有三个已实测的坑：
 *   ① 分不清**注释**与代码（注释里写「animationViolations(COMPONENT_SOURCES)」
 *      就会被当成真调用 ⇒ 假红）；
 *   ② 分不清**字符串字面量**与代码；
 *   ③ 括号跨行时正则要处理嵌套，脆得很。
 *   ⇒ 用 TypeScript 自己的解析器走一遍 AST（与 `tests/helpers/describe-titles.ts`
 *     同一路子）。
 *
 * ── 口径 ────────────────────────────────────────────────────────────────────
 *   · 只收 `it('…')` —— 第一个参数必须是**字符串字面量**（动态标题静态判不了）。
 *   · `it.each(…)` / `it.skip` **不收**（标题不是字面量，语义也不是「一条断言」）。
 *   · 「块」= 从 `it(` 那个调用表达式的**参数**（第一个参数是标题，其余是函数体）。
 */

import ts from 'typescript'

/** 一个 `it(...)` 调用里，**判据实参**的形状。 */
export type ItCall = {
  /** 被调用的函数名（如 `animationViolations`）。 */
  callee: string
  /** 实参的源码文本（逐字）。 */
  text: string
  /** 实参**是不是**对给定函数名的调用（可带类型参数）。 */
  argIsCallOf: (names: readonly string[]) => boolean
}

/** 一个 `it(...)` 块。 */
export type ItBlock = {
  /** `it(...)` 的第一个参数（标题字面量）。 */
  title: string
  /** 块里出现的**所有**调用表达式（浅一层：函数体内的直接调用）。 */
  calls: ItCall[]
  /** 块里出现的**所有**标识符（去重、排序）。 */
  identifiers: string[]
}

function calleeNameOf(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  const expr = node.expression
  if (ts.isIdentifier(expr)) return expr.text
  return null
}

/** 实参是不是「对 names 里某个函数的调用」。 */
function argIsCallOf(node: ts.Node, names: readonly string[]): boolean {
  if (!ts.isCallExpression(node)) return false
  const expr = node.expression
  if (!ts.isIdentifier(expr)) return false
  return names.includes(expr.text)
}

/**
 * 抽出一个 `it(...)` 块里的调用与标识符。
 *
 * @param call `it(...)` 那个调用表达式
 */
function collectBlock(call: ts.CallExpression): ItBlock {
  const calls: ItCall[] = []
  const identifiers = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeNameOf(node)
      if (callee !== null) {
        const args = node.arguments
        calls.push({
          callee,
          text: args.map((a) => a.getText()).join(', '),
          argIsCallOf: (names) => args.length > 0 && argIsCallOf(args[0]!, names),
        })
      }
    }
    if (ts.isIdentifier(node)) identifiers.add(node.text)
    ts.forEachChild(node, visit)
  }

  // 只看 `it` 的**函数体**（第一个参数是标题，其余是回调）。
  for (const arg of call.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) visit(arg)
  }

  return {
    title: '',
    calls,
    identifiers: [...identifiers].sort(),
  }
}

/** 源码里所有 `it('…')` 块。 */
export function itBlocksOf(fileName: string, source: string): ItBlock[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const out: ItBlock[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'it'
    ) {
      const first = node.arguments[0]
      if (first !== undefined && ts.isStringLiteral(first)) {
        const block = collectBlock(node)
        block.title = first.text
        out.push(block)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

/** 「共享扫描面」的两个入口函数名（**同一份实现**，见 `tests/helpers/vue-sources.ts`）。 */
export const SCAN_SURFACE_FUNCTIONS: readonly string[] = ['allVueSources', 'vueSourceFiles']

/**
 * **G315.4 的判据本体**（纯函数 ⇒ 可喂负向夹具）。
 *
 * 🔥 **守什么**：G38 那个 `it` 块里的判据实参**必须**来自**共享扫描面**
 *   （`allVueSources` / `vueSourceFiles`），**不许**用 4 个文件的老名单
 *   （`COMPONENT_SOURCES`，它共用给 G33a / G33b / G39 / G43）。
 *   ⇒ 有人把 G38 那行换回老名单 ⇒ G38 的覆盖面**静默缩回 4 个文件**
 *   ⇒ 而 G315.1（共享扫描面覆盖全仓）**照样绿**。
 *
 * @param blocks  全部 `it` 块
 * @param marker  用来认出「那个 `it` 块」的标记（标题里出现它）
 * @returns 问题描述列表（空数组 = 通过）
 */
export function scanSurfaceProblems(blocks: readonly ItBlock[], marker: string): string[] {
  const problems: string[] = []
  const targets = blocks.filter((block) => block.title.includes(marker))
  if (targets.length !== 1) {
    return [
      `点名「${marker}」的 it 块有 ${targets.length} 个（期望恰好 1 个）—— 判据的落点变了`,
    ]
  }
  const block = targets[0]!
  const shared = block.calls.filter(
    (call) => call.callee === 'animationViolations' && call.argIsCallOf(SCAN_SURFACE_FUNCTIONS),
  )
  if (shared.length === 0) {
    problems.push(
      `那个 it 块里没有「animationViolations(共享扫描面)」这一句 —— ` +
        `它现在调的是：${block.calls.map((c) => c.text).join(' / ')}。\n` +
        '  ⇒ 判据扫的文件集合被换掉了（很可能是换回了 4 个文件的老名单）' +
        ' ⇒ 覆盖面静默变窄而 G315 全绿。',
    )
  }
  if (block.identifiers.includes('COMPONENT_SOURCES')) {
    problems.push(
      '那个 it 块里出现了 COMPONENT_SOURCES —— ' +
        '它是 4 个文件的老名单（共用给 G33a / G33b / G39 / G43）⇒ ' +
        'G38 的覆盖面会缩回 4 个文件 ⇒ 判据静默变窄。',
    )
  }
  return problems
}
