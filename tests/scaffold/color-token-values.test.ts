/**
 * R-12「既有 `--color-*` 的**值**不得改」的守卫。
 *
 * ── 为什么需要这条 ────────────────────────────────────────────────────────
 *   R-12 的正文逐字写着「已定稿的 CSS 变量**值**一个都不许改」，
 *   而 R-12 自己的「守卫」字段逐字写着「⚠️ **无守卫**」——
 *   `palette.test.ts` 只断言 token **存在**与 WCAG 对比度；
 *   `asset-geometry.test.ts` 的 G3 只断言 SVG 里的 hex **等于 tokens.css 当期字面值**
 *   （那是**一致性**，不是**冻结**：两个值一起改，它照样绿）。
 *   ⇒ **改了 `tokens.css` 里一个既有 token 的值，全仓测试照样全绿。**
 *
 *   本条与 **G301**（个数只有一个出处）互补：
 *   G301 守「**几个**」与「文档里写的个数」，本条守「**每个值**」。
 *
 * ── 口径 ──────────────────────────────────────────────────────────────────
 *   · 「一个 token 的值」= `src/styles/tokens.css` 里 `--color-*` **声明行**上
 *     `:` 与 `;` 之间的字面量（行尾注释在 `;` 之后，不参与取值）。
 *   · 同一个名字出现**多次**且取值不同 ⇒ 本身就是问题（改值的手法之一），
 *     判据照报。
 *   · 快照（`tests/fixtures/color-tokens.ts`）里**多一个**名字（= 新 token 未登记）
 *     或**少一个**名字（= 既有 token 被删）⇒ 都算问题。
 *
 * 出处：DF-183（E36，Epic 1 集成层检视）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { COLOR_TOKEN_VALUES } from '../fixtures/color-tokens'

const root = fileURLToPath(new URL('../../', import.meta.url))

const TOKENS_PATH = `${root}src/styles/tokens.css`

/** 逐字定义一个 `--color-*` token 的声明行（`;` 之前的部分就是值）。 */
const TOKEN_DECLARATION = /^\s*(--color-[a-z0-9-]+)\s*:\s*([^;]+);/

/**
 * `tokens.css` 里 `--color-*` 的实测取值。
 *
 * ⚠️ **同名多次出现会全部保留**（不覆盖）—— 那正是「改值的手法」之一，
 *   判据必须看得见，不能在解析阶段就被悄悄压成最后一个。
 */
export function parseColorTokenValues(tokensCss: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const line of tokensCss.split('\n')) {
    const m = TOKEN_DECLARATION.exec(line)
    if (!m) continue
    const name = m[1]
    const value = m[2].trim()
    const bucket = out.get(name)
    if (bucket) bucket.push(value)
    else out.set(name, [value])
  }
  return out
}

/**
 * 判据本体：比对「实测取值」与「快照」，返回**逐条**问题（空数组 = 一致）。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）——
 * 反向自测只断言假夹具自身的话，判据被掏空时照样绿。
 */
export function tokenValueProblems(
  actual: Map<string, string[]>,
  expected: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = []
  for (const [name, snapshotValue] of Object.entries(expected)) {
    const seen = actual.get(name)
    if (!seen) {
      problems.push(`${name}：快照里登记了，tokens.css 里却找不到这个 token（被删了？）`)
      continue
    }
    const distinct = [...new Set(seen)]
    if (distinct.length > 1) {
      problems.push(`${name}：tokens.css 里出现了 ${distinct.length} 个不同的值（${distinct.join(' / ')}）`)
      continue
    }
    if (distinct[0] !== snapshotValue) {
      problems.push(`${name}：快照值是「${snapshotValue}」，tokens.css 现在是「${distinct[0]}」`)
    }
  }
  for (const name of actual.keys()) {
    if (!(name in expected)) {
      problems.push(`${name}：tokens.css 里新增了这个 token，但它没有登记进快照`)
    }
  }
  return problems
}

const tokensCss = readFileSync(TOKENS_PATH, 'utf8')

describe('G302 R-12 —— 既有 `--color-*` 的值不得改', () => {
  it('G302.1 tokens.css 里每个 `--color-*` 的值与快照一致', () => {
    const actual = parseColorTokenValues(tokensCss)
    expect(
      actual.size,
      'tokens.css 里一个 `--color-*` 声明都没读到 ⇒ 判据在空集上成立',
    ).toBeGreaterThan(0)

    const problems = tokenValueProblems(actual, COLOR_TOKEN_VALUES)
    expect(
      problems,
      `R-12 要求既有 \`--color-*\` 的值一个都不许改：\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('G302.2 反向自测：改快照里的值 / 改 tokens.css 里的值 / 增删 token，判据都必须报出来', () => {
    const actual = parseColorTokenValues(tokensCss)

    // ① 快照里的值被改 ⇒ 判据必须报出那个 token。
    const mutatedSnapshot = { ...COLOR_TOKEN_VALUES, '--color-sun': '#ffff00' }
    const problems1 = tokenValueProblems(actual, mutatedSnapshot)
    expect(
      problems1.length,
      '构造失效：把快照里 `--color-sun` 的值改了，判据却没报出来',
    ).toBeGreaterThan(0)
    expect(
      problems1.some((p) => p.includes('--color-sun')),
      `构造失效：判据报了别的 token，没报被改的那个：\n${problems1.join('\n')}`,
    ).toBe(true)

    // ② tokens.css 里的值被改 ⇒ 判据必须报出那个 token。
    const mutatedCss = tokensCss.replace('--color-sun: #fdd835;', '--color-sun: #ffff00;')
    expect(mutatedCss, '构造失效：没能在 tokens.css 里找到 `--color-sun` 的声明').not.toBe(tokensCss)
    const problems2 = tokenValueProblems(parseColorTokenValues(mutatedCss), COLOR_TOKEN_VALUES)
    expect(
      problems2.length,
      '构造失效：把 tokens.css 里 `--color-sun` 的值改了，判据却没报出来',
    ).toBeGreaterThan(0)
    expect(
      problems2.some((p) => p.includes('--color-sun')),
      `构造失效：判据报了别的 token，没报被改的那个：\n${problems2.join('\n')}`,
    ).toBe(true)

    // ③ 新增一个未登记的 token ⇒ 必须报出「没登记」（否则快照可以随便漏）。
    const withNew = `${tokensCss}\n  --color-brand-new: #123456;\n`
    const problems3 = tokenValueProblems(parseColorTokenValues(withNew), COLOR_TOKEN_VALUES)
    expect(
      problems3.some((p) => p.includes('--color-brand-new')),
      `构造失效：新增了一个没登记进快照的 token，判据却没报：\n${problems3.join('\n')}`,
    ).toBe(true)

    // ④ 既有 token 被删 ⇒ 必须报出「找不到」。
    const withoutOne = tokensCss.replace(/^\s*--color-sun:.*$/m, '')
    expect(withoutOne, '构造失效：没能在 tokens.css 里删掉 `--color-sun`').not.toBe(tokensCss)
    const problems4 = tokenValueProblems(parseColorTokenValues(withoutOne), COLOR_TOKEN_VALUES)
    expect(
      problems4.some((p) => p.includes('--color-sun')),
      `构造失效：删掉了一个既有 token，判据却没报：\n${problems4.join('\n')}`,
    ).toBe(true)
  })
})
