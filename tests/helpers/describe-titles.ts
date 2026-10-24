/**
 * 用 **TypeScript 自己的解析器**列出源码里所有 `describe('…')` 的**标题**。
 *
 * ── 为什么不用正则 ────────────────────────────────────────────────────────
 *   正则扫源码有两个实测会踩的坑：
 *   ① **分不清注释与字符串** —— 一条守卫的源码里常有一句注释或一段**字符串夹具**
 *      写着 `describe('G16 —— …')`，正则会把夹具当成**声明点** ⇒
 *      凭空判出「撞号」（本仓库的 G306 守卫第一版就栽在这里）。
 *   ② **分不清 `describe` 与 `describe.each` / `describe.skip`** ——
 *      后面三种的标题不是守卫声明点。
 *
 *   AST 走一遍就没有这两个问题：**字符串字面量里的 `describe(...)` 不是调用表达式**，
 *   注释里更不是。
 *
 * ── 口径 ──────────────────────────────────────────────────────────────────
 *   · 只收 `describe('…')` —— 第一个参数必须是**字符串字面量**
 *     （`describe(someVar)` 的标题在运行期才知道，静态判不了，不假装管得了）。
 *   · `describe.each(…)('…')` / `describe.skip('…')` **不收** ——
 *     它们的标题不是「一个守卫一条声明点」那种写法。
 */
import ts from 'typescript'

/** 把 AST 走一遍，收集所有 `describe('…')` 的标题。 */
function collect(file: ts.SourceFile): string[] {
  const titles: string[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'describe'
    ) {
      const first = node.arguments[0]
      if (first !== undefined && ts.isStringLiteral(first)) {
        titles.push(first.text)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  return titles
}

/** 源码里所有 `describe('…')` 的标题。 */
export function describeTitles(fileName: string, source: string): string[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  return collect(file)
}
