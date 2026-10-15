/**
 * ESLint flat config 的规则查询（Story 1.10 / AC-14 的 G15 抽取）。
 *
 * ⚠️ **为什么抽出来**：`tests/scaffold/core-boundary.test.ts` 里本来就有一份
 *   `rulesFor()`。G15 要问「`src/components/**` 上有没有禁 `core/balance` 的规则」，
 *   若在 G15 的文件里**再抄一份**，两份查询逻辑就会各自演化 ——
 *   而这正是 Story 1.9 的 P0（判据被抄多份，真守卫停用后全套仍全绿）的同一个形状。
 *   ⇒ 一份实现，两个测试文件共用。
 *
 * ⚠️ **必须真实求值 `eslint.config.js`，不能对源码做子串匹配**：
 *   早期版本用 `toMatch(/files:\s*\[\s*'src\/core/)` + 两条 `toContain`，
 *   那是三个互相独立的字符串检查，可以由三个不同的 config 块分别满足 ——
 *   三条互不相干的假绿。`core-boundary.test.ts:84-89` 逐字记着这三个回归。
 */

import eslintConfig from '../../eslint.config.js'

/** flat config 里单个 config 块的形状（只取这里用到的字段）。 */
export interface EslintBlock {
  files?: string | string[]
  rules?: Record<string, unknown>
}

/**
 * 从 flat config 数组里找出命中 `files` 匹配的规则块，合并多块（同名后者覆盖前者）。
 *
 * ⚠️ 「后者覆盖前者」与 ESLint 真实的 flat config 语义一致：后面的块覆盖前面的。
 *   这也是 `[CR]` 记下的一条真实回归形态 —— 在后面追加一个
 *   `rules: { 'no-restricted-imports': 'off' }` 的块就能让前面那条防线静默作废，
 *   而本函数（合并后取最后一个）会**如实**返回 `'off'`，
 *   于是断言那条规则「必须是 error」的测试立刻红。
 */
export function rulesFor(fileGlob: string): Record<string, unknown> {
  const blocks = (eslintConfig as unknown as EslintBlock[]).filter(
    (block) =>
      !block.files || (Array.isArray(block.files) ? block.files : [block.files]).includes(fileGlob),
  )
  return Object.assign({}, ...blocks.map((block) => block.rules ?? {}))
}

/** 取规则的严重级别。ESLint 允许 `'error'` / `['error', opts]` 两种写法。 */
export function severityOf(rule: unknown): unknown {
  return Array.isArray(rule) ? rule[0] : rule
}

/** 取规则的第一段选项（`['error', { paths, patterns }]` 里的那个对象）。 */
export function optionsOf(rule: unknown): { paths?: { name?: string }[]; patterns?: (string | { group: string[] })[] } | undefined {
  return (Array.isArray(rule) ? rule[1] : undefined) as { paths?: { name?: string }[]; patterns?: (string | { group: string[] })[] } | undefined
}

/** 把 `patterns` 摊平成一个字符串数组（ESLint 允许字符串与 `{ group }` 两种形态）。 */
export function patternStrings(options: ReturnType<typeof optionsOf>): string[] {
  return (options?.patterns ?? []).flatMap((p: string | { group: string[] }) => (typeof p === 'string' ? [p] : p.group))
}
