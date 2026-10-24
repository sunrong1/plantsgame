/**
 * 用 **TypeScript 自己的解析器**列出源码里所有的「导入外部模块」写法。
 *
 * ── 为什么不用正则 ────────────────────────────────────────────────────────
 *   DF-120 的实测：`content-boundary.test.ts` 那条源码兜底只正则
 *   `/from\s+'([^']+)'/g` ⇒ **动态 `import()` 没有 `from` 关键字** ⇒ 看不见；
 *   而 ESLint 的 `no-restricted-imports` 是由 ESLint 解析 **import 声明**得出，
 *   动态 `import()` 不产生 ImportDeclaration ⇒ 规则也看不见。
 *   ⇒ 两道守卫都只认**静态**形态，往 `src/content/distribution.ts` 注入
 *   `await import('../core/balance')` 实测 **真的把 `ZOMBIE_HP` 读了回来**。
 *
 *   正则还有第二个毛病：**分不清注释与代码**（DF-120 记着「在 `src/content/` 里
 *   连『写清楚这条边界拦的是什么』都做不到，除非把导入形态拆开写」）。
 *
 *   本文件改用 TS 的 AST ⇒ 静态 / 动态 / 重导出 / `require` 四种形态一次收齐，
 *   且**注释与字符串里的字面量天然不算导入**。
 *
 * ── 口径 ──────────────────────────────────────────────────────────────────
 *   · 只报**模块说明符**（`'../core/balance'` 这种），不报具名导入。
 *   · 动态 `import()` 的参数**必须是字符串字面量**才能判定 ——
 *     `import(someVar)` 的目标在运行期才知道，静态判定不了（不报，不假装管得了）。
 */
import ts from 'typescript'

/** 导入写法分类 —— 报出来是为了让人一眼看出「用的是哪种形态」。 */
export type ImportForm = 'static' | 'dynamic' | 'reexport' | 'require' | 'import-equals'

export interface ImportSpecifierHit {
  /** 模块说明符的字面量（`'../core/balance'`）。 */
  readonly specifier: string
  readonly form: ImportForm
}

/** 把 AST 走一遍，收集所有导入写法。 */
function collect(file: ts.SourceFile): ImportSpecifierHit[] {
  const hits: ImportSpecifierHit[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      hits.push({ specifier: node.moduleSpecifier.text, form: 'static' })
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      hits.push({ specifier: node.moduleSpecifier.text, form: 'reexport' })
    } else if (ts.isImportEqualsDeclaration(node)) {
      // `import x = require('…')` / `import x = A.B`
      const ref = node.moduleReference
      if (
        ts.isExternalModuleReference(ref) &&
        ts.isStringLiteral(ref.expression)
      ) {
        hits.push({ specifier: ref.expression.text, form: 'import-equals' })
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        // 动态 `import('…')` —— 只有字符串字面量判得了。
        const arg = node.arguments[0]
        if (arg !== undefined && ts.isStringLiteral(arg)) {
          hits.push({ specifier: arg.text, form: 'dynamic' })
        }
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1
      ) {
        const arg = node.arguments[0]
        if (arg !== undefined && ts.isStringLiteral(arg)) {
          hits.push({ specifier: arg.text, form: 'require' })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  return hits
}

/** 源码里所有导入写法的模块说明符。 */
export function importSpecifiers(fileName: string, source: string): ImportSpecifierHit[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  return collect(file)
}

/**
 * 判据本体：列出源码里**命中禁列**的导入写法。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）——
 * 反向自测只断言假夹具自身的话，判据被掏空时照样绿。
 */
export function findForbiddenImports(
  fileName: string,
  source: string,
  forbidden: RegExp,
): string[] {
  return importSpecifiers(fileName, source)
    .filter((hit) => forbidden.test(hit.specifier))
    .map((hit) => `${hit.specifier}（${hit.form}）`)
}
