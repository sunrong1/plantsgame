/**
 * 已退休的**规划口径数字**不得回到代码与活文档里。
 *
 * ── 为什么需要这条 ────────────────────────────────────────────────────────
 *   2026-10-24 的 `[CC]` 把 GDD 的关卡数改成 **24**、全书词图改成 **97 张**，
 *   于是「16–20 关」「200–400 词/张」「270–540」「480–600」「66–133 小时」「437–467」
 *   这些数字**全部退休**。
 *
 *   退休的数字最危险的地方不在它还在文档里，而在它**被抄进别处**：
 *   抄进产品代码注释（`HandDeck.vue` 的「全年 200-400 词」）、抄进设计文档
 *   （`art-direction.md` 的「避免 200–400 张图挤在一个目录」）、抄进规则的「依据」
 *   （R-11 / content.md）⇒ 每一处都在**复述一个已经作废的口径**，
 *   而**没有任何机制会提醒它们**。
 *
 *   ⇒ **G299** 扫 `src/**` 与 `docs/**`，退休数字出现即红。
 *
 * ── 豁免（**两层，每一层都写明理由**）──────────────────────────────────────
 *   **文件级**：`docs/word-image-throughput.md` —— 它是**实测分析文档**，§0 / §7.5 / §8
 *   里那些旧数字是**原始记录**（重算整节是 Story 2.1 级别的重做 ⇒ **DF-210**）。
 *   删掉它们就等于篡改实测记录 ⇒ 豁免，并由 DF-210 负责重算。
 *
 *   **行级**：同一行里带「旧口径」/「作废」标记 ⇒ 允许。
 *   这类引用是**显式声明退休**的（例如「不按旧口径的 480–600 排」），
 *   正是我们要的形状 —— 与「把它当现行事实用」相反。
 *   ⚠️ 文件级豁免是**整个文件**都算旧口径（那个文件本就是旧口径的原始记录）；
 *     其余文件里**新写的句子**仍不得直接引用退休数字（要引用必须标明「旧口径」）。
 *
 * 出处：`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-24.md`（口径变更）
 *       与 `sprint-change-proposal-2026-10-24-2.md`（§4.3 顺带清理）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 已退休的规划口径数字（2026-10-24 `[CC]` 之后）。 */
export const RETIRED_PATTERNS: { label: string; re: RegExp }[] = [
  { label: '16–20 关', re: /16\s*[-–]\s*20\s*关/ },
  { label: '200–400 词/张', re: /200\s*[-–]\s*400/ },
  { label: '270–540 张', re: /270\s*[-–]\s*540/ },
  { label: '480–600 张', re: /480\s*[-–]\s*600/ },
  { label: '66–133 小时', re: /66\s*[-–]\s*133/ },
  { label: '437–467 张', re: /437\s*[-–]\s*467/ },
]

/** 扫描范围内的目录。 */
const SCAN_DIRS = ['src', 'docs', 'scripts']

/** 文件级豁免（**每一条都要写明理由**）。 */
const EXEMPT_FILES = new Set([
  // 实测分析文档：§0 / §7.5 / §8 里的旧数字是**原始记录**，重算归 DF-210。
  'docs/word-image-throughput.md',
])

/** 只扫这些扩展名。 */
const SCAN_EXT = new Set(['.ts', '.vue', '.css', '.md', '.json', '.txt', '.yaml', '.yml'])

/** 目录遍历（跳过 `node_modules` 之类）。 */
function walk(dir: string, acc: string[] = []): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    let isDir = false
    try {
      readdirSync(full)
      isDir = true
    } catch {
      isDir = false
    }
    if (isDir) {
      walk(full, acc)
    } else if (SCAN_EXT.has(name.slice(name.lastIndexOf('.')))) {
      acc.push(full)
    }
  }
  return acc
}

/** 行级豁免标记：这一行显式声明了「这是退休口径」。 */
export const RETIRED_MARKERS = ['旧口径', '作废']

/**
 * 判据本体：在一段文本里找出退休口径数字。
 *
 * @param text 待扫文本
 * @param label 位置标签（文件名），只用于失败消息
 */
export function findRetiredNumbers(text: string, label: string): string[] {
  const hits: string[] = []
  const lines = text.split('\n')
  for (const { label: what, re } of RETIRED_PATTERNS) {
    for (const [i, line] of lines.entries()) {
      if (!re.test(line)) continue
      if (RETIRED_MARKERS.some((m) => line.includes(m))) continue
      hits.push(`${label}:${i + 1}：出现退休口径「${what}」`)
    }
  }
  return hits
}

/** 扫范围内的全部文件，返回全部命中。 */
export function scanForRetiredNumbers(): string[] {
  const hits: string[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(root, dir))) {
      const rel = relative(root, file)
      if (EXEMPT_FILES.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      hits.push(...findRetiredNumbers(text, rel))
    }
  }
  return hits
}

describe('G299 已退休的规划口径数字不得回到代码与活文档里', () => {
  it('G299.1 src/ docs/ scripts/ 里零命中（文件级豁免只有 word-image-throughput.md 一个）', () => {
    const hits = scanForRetiredNumbers()
    expect(
      hits,
      `退休的规划口径数字又回来了：\n${hits.join('\n')}\n` +
        '⚠️ 若该数字是**新的**事实，改这里没有用 —— 改事实源，别改守卫。',
    ).toEqual([])
  })

  it('G299.2 反向自测：往一段文本里塞一个退休数字，判据必须报出来', () => {
    const clean = '一个单元的卡数远超一屏放得下的张数 ⇒ 卡区必须能滚。'
    expect(
      findRetiredNumbers(clean, '夹具'),
      '构造失效：干净文本竟被判成了有退休数字',
    ).toEqual([])
    const mutated = clean.replace('必须能滚', '必须能滚（全年 200-400 词）')
    expect(
      findRetiredNumbers(mutated, '夹具').some((p) => p.includes('200–400')),
      '构造失效：塞进「200-400」竟没被判出来 —— 退休数字的正则漏了',
    ).toBe(true)
  })

  it('G299.3 行级豁免：同一行标明「旧口径」的引用必须放行（豁免本身也要被验）', () => {
    const marked = '词图批次规模必须按本表的数字排，不按旧口径的 480–600 排。'
    expect(
      findRetiredNumbers(marked, '夹具'),
      '行级豁免失效：已标明「旧口径」的行竟被判成违规 —— 这条豁免是本守卫的一部分，必须真的生效',
    ).toEqual([])
    const unmarked = marked.replace('旧口径的 ', '')
    expect(
      findRetiredNumbers(unmarked, '夹具').some((p) => p.includes('480–600')),
      '行级豁免越界：拿掉「旧口径」标记后竟没被判出来 —— 豁免只认标记本身',
    ).toBe(true)
  })
})
