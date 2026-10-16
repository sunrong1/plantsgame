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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ `[CR]` 2026-10-16 —— **本文件整个查询模型换掉了**，理由是实测出来的两类
 * 结构性假绿。原实现是：
 *
 * ```ts
 * const blocks = eslintConfig.filter(
 *   (b) => !b.files || (Array.isArray(b.files) ? b.files : [b.files]).includes(fileGlob),
 * )
 * ```
 *
 * 它有两个洞，**每一个都能让整个边界守卫彻底失效而所有测试照绿**：
 *
 * **洞一：它问的是「哪些块的名字等于这个 glob」，不是「哪些块真的命中这个文件」。**
 *   实测 —— 在 `eslint.config.js` 末尾追加一个 `files` 只写
 *   `src/components/battle/` 子树（比原块更窄）、且带
 *   `rules: { 'no-restricted-imports': 'off' }` 的块：
 *   结果：`npx eslint --print-config` 显示 `Tower.vue` 的该规则严重级别是 **0（off）**，
 *   而 G15 **38 条全绿**、`eslint .` exit 0。因为那个更窄的 glob 覆盖了
 *   Story 1.10 的**全部**组件（`Tower.vue` / `Zombie.vue` / `BattleField.vue`），
 *   而 `includes('src/components/` + 那个 glob 字符串 `')` 为 false ⇒ 那个块被整个漏掉。
 *   **本文件原注释宣称「在后面追加一个 off 的块本函数会如实返回 'off'」——
 *   这句话只在追加块复用同一个 glob 字符串时成立。注释比代码更自信，是最坏的一种。**
 *
 * **洞二：它完全不看 `ignores`。** flat config 的 `ignores` 是**全局排除**，
 *   命中后 ESLint 连 lint 都不做，而 lint 脚本是 `eslint .`（无 `--max-warnings`），
 *   被 ignore 的文件**静默跳过**。实测把 `'src/components/**'` 加进 ignores：
 *   受 lint 文件数 58 → 55，`vue/no-undef-components`（「漏 import 组件 → 白屏」那条）
 *   同时失效，而全部守卫照绿。
 *
 * ⇒ **不再自己实现 glob 语义**，改用 ESLint 自己的解析器：
 * `new ESLint().calculateConfigForFile(path)` 返回的就是**那个文件的最终生效配置**，
 * 洞一（窄 glob 的覆盖顺序）与洞二（ignores）由构造性保证同时消失。
 * 代价是 `async` —— 调用方改用 `beforeAll`。
 *
 * ⚠️ **写这段注释时踩到的坑，值得记一笔**：上面三处 glob 字面量在 JSDoc 里写全，
 *   会因为其中含两星一斜杠这个子串而**提前终止块注释**，oxc 报 `Unexpected token`，
 *   而报错位置指向注释里一个完全无辜的字符 —— 排障方向会被带偏很远。
 *   ⇒ 本文件里凡是出现在注释中的 glob，一律写成「`src/components/` + 那个 glob」，
 *   不写全。同一个坑本轮踩了三次（第三次是为了写下这条注意事项本身）。
 */

import { ESLint } from 'eslint'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import eslintConfig from '../../eslint.config.js'

/** flat config 里单个 config 块的形状（只取这里用到的字段）。 */
export interface EslintBlock {
  files?: string | string[]
  ignores?: string[]
  rules?: Record<string, unknown>
}

/** 解析结果缓存 —— 同一份配置解析多次没有意义，`ESLint` 构造也不便宜。 */
let cache: Promise<Map<string, Record<string, unknown>>> | null = null

const resolveAll = async (): Promise<Map<string, Record<string, unknown>>> => {
  const eslint = new ESLint()
  const out = new Map<string, Record<string, unknown>>()

  for (const path of PROBE_FILES) {
    // ⚠️ 被全局 `ignores` 排除的文件，ESLint 返回的是 **undefined 而不是空配置**。
    //   直接读 `config.rules` 会抛 `TypeError`，把「守卫正确地发现了文件被忽略」
    //   降级成「测试崩了」—— 前者能指出原因，后者只让人看到栈。
    //   ⇒ 归一成空规则表，让上层断言以「规则不存在」的形式红，并附带 ignores 的判定。
    const config = await eslint.calculateConfigForFile(resolve(process.cwd(), path))
    out.set(path, (config?.rules ?? {}) as Record<string, unknown>)
  }
  return out
}

/**
 * 【要探针的文件】—— 覆盖本仓库三条边界守卫各自的作用域。
 *
 * ⚠️ **为什么必须是真实存在的文件**：flat config 的 `ignores` 只对真实路径求值，
 *   且 `calculateConfigForFile` 会对不存在的文件按最接近的 glob 兜底 ——
 *   探针写成假路径会得到一份「看着对其实没算 ignores」的配置。
 *   ⇒ 下面每一条都有 `existsSync` 断言兜着（见 `probeFilesExist`）。
 */
export const PROBE_FILES = [
  'src/core/balance.ts',
  'src/core/grid.ts',
  'src/components/battle/Tower.vue',
  'src/components/battle/Zombie.vue',
  'src/components/hand/HandCard.vue',
  'src/views/StartView.vue',
  'src/services/audio.ts',
  'src/services/pronunciation.ts',
  'src/app/audio-unlock.ts',
  'src/content/schema.ts',
] as const

/**
 * **该文件上最终生效的规则表**（已含 glob 匹配顺序与 `ignores` 排除）。
 *
 * ⚠️ 形参是**仓库相对的真实路径**，不是 glob。传 glob 是本文件历史上的接口，
 *   它正是洞一的成因 —— 保留它等于把漏洞留在 API 上。
 */
export async function rulesForFile(filePath: string): Promise<Record<string, unknown>> {
  cache ??= resolveAll()
  const all = await cache

  if (!all.has(filePath)) {
    throw new Error(
      `${filePath} 不在 PROBE_FILES 里 —— rulesForFile 只能查探针文件。` +
        '要守新作用域，先把它加进 PROBE_FILES（并确认磁盘上真的有这个文件）。',
    )
  }
  return all.get(filePath) as Record<string, unknown>
}

/** 探针文件在磁盘上真实存在（改名/移走会让整批查询悄悄拿到兜底配置）。 */
export function probeFilesExist(): { path: string; exists: boolean }[] {
  return PROBE_FILES.map((path) => ({ path, exists: existsSync(resolve(process.cwd(), path)) }))
}

/** 该文件是否被 flat config 的**全局** `ignores` 排除（被排除 ⇒ ESLint 根本不 lint 它）。 */
export function isGloballyIgnored(filePath: string): string | undefined {
  const ignores = (eslintConfig as unknown as EslintBlock[])
    .flatMap((block) => (Array.isArray(block.ignores) ? block.ignores : []))
    .filter((p): p is string => typeof p === 'string')

  // ⚠️ 这里刻意只做**字面前缀与目录前缀**匹配，不做完整 glob：
  //   本函数是「粗筛 + 报出可疑项」，权威判定仍然是 `rulesForFile` ——
  //   `calculateConfigForFile` 返回空规则表就说明它被排除了。
  //   宁可多报一个可疑项让人来看一眼，也不要在这里重造一份会失灵的 glob 语义。
  return ignores.find(
    (pattern) =>
      filePath === pattern ||
      filePath.startsWith(pattern.endsWith('/**') ? pattern.slice(0, -2) : `${pattern.replace(/\/?$/, '/')}`),
  )
}

/**
 * 取规则的严重级别，统一成**字符串**。
 *
 * ⚠️ `[CR]` 2026-10-16：原来这里直接返回 `rule[0]`，在 config 原文上是对的
 *   （`'error'`）。换成 `calculateConfigForFile` 之后返回的是 ESLint 的
 *   **归一化**结果 —— 严重级别是 `Linter.RuleLevel` 的**数字**
 *   （`0`=off / `1`=warn / `2`=error），规则本体也已被拆成 `[level, ...options]`。
 *   于是所有 `expect(severityOf(rule)).toBe('error')` 会收到 `2` 而假红。
 *   ⇒ 归一化放在**这一处**，不让每个调用方各写一遍映射表。
 */
export function severityOf(rule: unknown): unknown {
  const level = Array.isArray(rule) ? rule[0] : rule

  return typeof level === 'number' ? ['off', 'warn', 'error'][level] : level
}

/** 取规则的第一段选项（`['error', { paths, patterns }]` 里的那个对象）。 */
export function optionsOf(rule: unknown): { paths?: { name?: string }[]; patterns?: (string | { group: string[] })[] } | undefined {
  if (!Array.isArray(rule)) return undefined
  const option = rule[1]
  // ⚠️ `[CR]` 2026-10-16：原来是裸 `as`。ESLint 的规则选项可以是
  //   **数组**（`['error', ['a', 'b']]`），那时 `options?.patterns` 是 undefined，
  //   `patternStrings` 返回空数组，G15 会报「禁列里没有 core/balance」——
  //   一条指向错误对象的假红，而它只在有人改了配置形态时才出现。
  //   ⇒ 形状不对就明确返回 undefined，判据层据此报「读不到选项」而不是「选项是空的」。
  return typeof option === 'object' && option !== null && !Array.isArray(option)
    ? (option as { paths?: { name?: string }[]; patterns?: (string | { group: string[] })[] })
    : undefined
}

/** 把 `patterns` 摊平成一个字符串数组（ESLint 允许字符串与 `{ group }` 两种形态）。 */
export function patternStrings(options: ReturnType<typeof optionsOf>): string[] {
  return (options?.patterns ?? []).flatMap((p: string | { group: string[] }) => (typeof p === 'string' ? [p] : p.group))
}
