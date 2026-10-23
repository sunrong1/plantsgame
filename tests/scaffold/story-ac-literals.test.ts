/**
 * Story 1.19 组 H 三条 AC 的**字面**不得再写死选项个数 —— DF-197 结清后加的守卫。
 *
 * ── 为什么需要这条 ────────────────────────────────────────────────────────
 *   Story 2.4（选项数量递进规则）把档 1 的选项数改成 **word 2 / keyword 3 / response 3**
 *   （事实来源：`src/content/option-count.ts` 的 `OPTION_COUNT_TIERS`），
 *   而 Story 1.19 的 AC-H1 / H3 / H4 正文里逐字写着**三个已经不存在于实现中的形状**
 *   （「四个选项」/「2×2」/「选项仍 4 列」）。
 *   ⇒ 2026-10-23 的 `[DS]` 只加了口径提示（改正文属 `[CC]`，R-33），
 *     并登记 **DF-197**；2026-10-24 的 `[CC]` 2026-10-24-2 更正了那三条正文 ⇒ 本条结清。
 *
 *   ⚠️ **为什么改完还要一条守卫**：AC 正文是**判据本身**。
 *     Story 1.19 的收尾门槛要拿真机实测去对照 AC 正文 ⇒ 正文里那个数字一旦又过期，
 *     **没有人会立刻发现**（只会得到一个「怎么对不上」的假结论）。
 *     提示里写一遍不够 —— 提示是给「读这一行的人」看的，正文才是被拿去对照的东西。
 *
 * ── 判据的三个要点 ────────────────────────────────────────────────────────
 *   ① **只扫「当前生效的正文」**：口径提示（`  - 📎 …`）里**必须**保留退休字面 ——
 *      那是「为什么正文变过」的留档 ⇒ 子条目被**明确排除**（不是遗漏，是有理由的豁免）。
 *   ② **切不到组 H 就红**：否则「把整段 AC 删掉」会**真空成立**（R-51 的已知形态之一）。
 *   ③ **要求 H1 / H3 / H4 三条都在**：少一条就红，不许「少写一条就绕过」。
 *
 * 出处：`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-24-2.md` §4.1。
 *
 * ── 变异验证（R-50 四步，2026-10-24 实测）────────────────────────────────
 *   · **M346**：把组 H 的 H1 正文改回「四个选项」⇒ **G295.2 红** ⇒ 已复原。
 *   跑之前先 `rm -rf node_modules/.vite`（R-50 第 0 步）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

const STORY_119_PATH = `${root}_bmad-output/implementation-artifacts/1-19-单元-1-首次试玩验证-epic-1-的生死线.md`

/**
 * 已退休的选项形状字面（Story 2.4 之前）。
 *
 * ⚠️ 这份清单**不是**「所有能表达个数的写法」—— 那不可能穷尽。
 * 它钉的是**实际踩过的那三个形状**（DF-197 逐字记录的那三个）。
 */
const RETIRED_OPTION_LITERALS = ['四个选项', '四选项', '2×2', '2x2', '4 列', '四列']

/** 组 H 小节的正文（`### 组 H` 到下一个 `### `）。切不到返回 `null`。 */
export function groupHBlock(md: string): string | null {
  const lines = md.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith('### 组 H'))
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.trim().startsWith('### '))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

/**
 * 每条 AC 的**正文行**（标题行 + 它的续行）。
 *
 * ⚠️ **续行** = 缩进两空格、且**不是** `  - ` 子条目的那些行。
 *   子条目（口径提示）被排除在外 —— 见文件头「判据的三个要点」①。
 */
export function acTextById(block: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const lines = block.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^- \*\*(H\d)\*\*/)
    if (!m) continue
    const own = [lines[i]]
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j]
      if (n.trim() === '') break
      if (/^ {2}\S/.test(n) && !/^ {2}- /.test(n)) {
        own.push(n)
        continue
      }
      break
    }
    map.set(m[1], own)
  }
  return map
}

/**
 * 判据本体：组 H 的 H1 / H3 / H4 三条 AC 正文里不得再出现退休字面。
 *
 * ⚠️ **它同时要求三条 AC 都在** —— 少一条就红（判据不许因为「文档被删了一段」而真空成立）。
 */
export function checkAcOptionLiterals(block: string | null): string[] {
  const problems: string[] = []
  if (block === null) {
    problems.push('切不到「### 组 H」小节 —— 判据在 AC 被整段删掉时会真空成立')
    return problems
  }
  const map = acTextById(block)
  for (const id of ['H1', 'H3', 'H4']) {
    const own = map.get(id)
    if (!own || own.length === 0) {
      problems.push(`组 H 里找不到 ${id} 的 AC 正文行`)
      continue
    }
    for (const line of own) {
      for (const lit of RETIRED_OPTION_LITERALS) {
        if (line.includes(lit)) {
          problems.push(`${id} 的 AC 正文仍写死「${lit}」—— ${line.trim().slice(0, 48)}`)
        }
      }
    }
  }
  return problems
}

/**
 * 选项数的**事实来源指针**必须留在组 H 里。
 *
 * ⚠️ 指针没了，读者就只能靠猜 —— 而「猜」正是 DF-197 的成因。
 */
export function checkOptionCountPointer(block: string | null): string[] {
  if (block === null) return ['切不到「### 组 H」小节 —— 事实来源指针无处可查']
  if (!block.includes('option-count.ts')) {
    return ['组 H 里找不到选项数的事实来源指针（`src/content/option-count.ts`）']
  }
  return []
}

const storyText = readFileSync(STORY_119_PATH, 'utf8')

describe('G295 Story 1.19 组 H 的 AC 正文不得写死选项个数（DF-197 结清后）', () => {
  it('G295.1 H1 / H3 / H4 三条正文都在，且都不含退休字面', () => {
    const problems = checkAcOptionLiterals(groupHBlock(storyText))
    expect(problems, `组 H 的 AC 正文仍写死了已退休的选项形状：\n${problems.join('\n')}`).toEqual([])
  })

  it('G295.2 反向自测：把 H1 正文改回「四个选项」，必须红（且判据要能取到 H1 正文行）', () => {
    const block = groupHBlock(storyText)
    expect(block, '构造失效：切不到组 H 小节').not.toBeNull()
    // ⚠️ **构造不依赖现行措辞**：直接把退休字面**追加**到 H1 的正文行上，
    //   而不是去替换某一句 —— 否则正文改个说法，这条自测就变成「构造失效」的假红。
    const h1Line = acTextById(block as string).get('H1')?.[0]
    expect(h1Line, '构造失效：判据取不到 H1 的正文行 —— 这正是它要防的那件事').toBeDefined()
    const mutated = (block as string).replace(h1Line as string, `${h1Line} 四个选项全在视口内`)
    expect(mutated, '构造失效：没能把 H1 的正文行改坏').not.toBe(block)
    const problems = checkAcOptionLiterals(mutated)
    expect(
      problems.some((p) => p.includes('H1') && p.includes('四个选项')),
      `构造失效：把 H1 正文改回「四个选项」竟没被判出来：\n${problems.join('\n')}`,
    ).toBe(true)
  })

  it('G295.3 组 H 里必须留着选项数的事实来源指针', () => {
    const problems = checkOptionCountPointer(groupHBlock(storyText))
    expect(problems, `组 H 丢了选项数的事实来源指针：\n${problems.join('\n')}`).toEqual([])
  })
})
