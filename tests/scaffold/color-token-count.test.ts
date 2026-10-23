/**
 * `--color-*` 的**个数**只有一个出处：`src/styles/tokens.css`。
 *
 * ── 为什么需要这条 ────────────────────────────────────────────────────────
 *   R-12 的正文写「**既有 `--color-*` 的值一个都不许改**」——
 *   而 R-12 的那条注记又逐字写着：「条数会随新 token 增长，**写死条数本身就会变成
 *   新的过时约束** —— 本仓库已经因此出过事故」（`1-10` 写「12 个」、
 *   `1-11`/`1-12`/`1-13` 写「14 个」、1.12 之后各处写「15 个」，
 *   而 `tokens.css` 里的**真实个数**一路走到 18）。
 *
 *   ⇒ 那些「几处写着几」的地方，一旦新加一个 token 就**全部**变旧。
 *   ⇒ **G301** 把「文档里写的个数」与「tokens.css 里实测的个数」逐字对齐。
 *
 * ── 口径（写在这里，判据与文档共用同一个口径）──────────────────────────────
 *   · **个数** = `src/styles/tokens.css` 里逐字定义的 `--color-*` **声明行**数
 *     （不是「提到 `--color-` 的行数」—— 注释里提到的不算）。
 *   · **文档里写的个数** = `docs/rules/process.md` 的 R-37「漂移表」里那两行的
 *     「实际」列 —— 那两行是**活文档**里唯一以「当前个数」的口径写这个数的地方。
 *   · ⚠️ **归档文档不在这条判据的射程内**：`archive/1-10-…md` 的治理表里**不写数字**
 *     （它写「以 tokens.css 当期为准」）⇒ 那里没有会漂的副本。
 *
 * 出处：DF-143 / DF-176（同一个问题被两轮评审各登记一次）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const TOKENS_PATH = `${root}src/styles/tokens.css`
const PROCESS_RULES_PATH = `${root}docs/rules/process.md`

/** 逐字定义一个 `--color-*` token 的声明行（注释行不算）。 */
const TOKEN_DECLARATION = /^\s*--color-[a-z0-9-]+\s*:/

/**
 * `tokens.css` 里 `--color-*` 的实测个数。
 *
 * ⚠️ **只数声明行** —— 注释里提到 `--color-sun` 的行有几十条，
 *   那是**引用**不是**定义** ⇒ 把它们算进去会让这个数毫无意义。
 */
export function countColorTokens(tokensCss: string): number {
  return tokensCss.split('\n').filter((line) => TOKEN_DECLARATION.test(line)).length
}

/**
 * R-37 漂移表里「实际」列写的个数。
 *
 * ⚠️ **按「`--color-*` 出现的行」定位那两行**，不按行号、不按固定文本 ——
 *   表格的措辞会变（DF-143 那一批就把「15 个」改成了「以 tokens.css 当期为准」）。
 */
export function driftTableCounts(processRules: string): number[] {
  const counts: number[] = []
  for (const line of processRules.split('\n')) {
    if (!line.includes('--color-*')) continue
    const cells = line.split('|')
    if (cells.length < 4) continue
    // 「实际」列（索引 2）是那一行里**唯一**写着个数的格子。
    const m = cells[2]?.match(/(\d+)\s*个/)
    if (m) counts.push(Number(m[1]))
  }
  return counts
}

const tokensCss = readFileSync(TOKENS_PATH, 'utf8')
const processRules = readFileSync(PROCESS_RULES_PATH, 'utf8')

describe('G301 `--color-*` 的个数只有一个出处（tokens.css）', () => {
  it('G301.1 tokens.css 里的 `--color-*` 个数与 R-37 漂移表写的个数一致', () => {
    const measured = countColorTokens(tokensCss)
    expect(measured, 'tokens.css 里一个 `--color-*` 声明都没有 ⇒ 判据在空集上成立').toBeGreaterThan(0)

    const written = driftTableCounts(processRules)
    expect(
      written.length,
      'R-37 漂移表里没有找到写着个数的「实际」列 ⇒ 判据落空了（表格结构变了？）',
    ).toBeGreaterThan(0)

    for (const n of written) {
      expect(
        n,
        `docs/rules/process.md 的 R-37 漂移表写着「${n} 个 \`--color-*\`」，` +
          `而 src/styles/tokens.css 里实测 ${measured} 个 —— 两者必须一致`,
      ).toBe(measured)
    }
  })

  it('G301.2 反向自测：把漂移表里的个数改掉，必须红（判据真的在比对两处）', () => {
    const measured = countColorTokens(tokensCss)
    const hits = processRules.match(/\*\*\d+ 个\*\*/g) ?? []
    expect(
      hits.length,
      `构造失效：R-37 漂移表里应当**只有一处**写着「**N 个**」，实测 ${hits.length} 处 ⇒ ` +
        '要么表格结构变了，要么别处也在写这个数（那就是新的复制链）',
    ).toBe(1)

    const mutated = processRules.replace(/\*\*(\d+) 个\*\*/, (_m, n: string) => `**${Number(n) + 1} 个**`)
    expect(mutated, '构造失效：没能在 R-37 漂移表里找到那处个数').not.toBe(processRules)

    const written = driftTableCounts(mutated)
    expect(written.length, '构造失效：改完之后漂移表里的个数读不出来了').toBeGreaterThan(0)
    expect(
      written.every((n) => n !== measured),
      '构造失效：把漂移表里的个数 +1 之后判据仍说一致 ⇒ 它没有在比对两处',
    ).toBe(true)
  })
})
