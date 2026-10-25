/**
 * 动效守卫的**覆盖面**与**依赖白名单**（Story 3.5 / D3 + D4）。
 *
 * ── G315 为什么必须存在（G138 的教训，第二次）────────────────────────────
 *   G138 当年用 `readdirSync` **只列一层** ⇒ 只扫到 `src/App.vue` 一个文件
 *   ⇒ 它自打出来起就在对着一个几乎为空的清单打转，**而它一直是绿的**。
 *   Story 3.5 把 G38 的扫描面扩到**全部 `.vue`** ⇒ **同一个坑，第二次**的风险
 *   就在眼前 ⇒ 必须有一条守卫**先证明「扫到的集合 == 全仓 `.vue` 集合」**。
 *
 * ── G316 为什么存在 ──────────────────────────────────────────────────────
 *   NFR11 逐字「禁止 JS 补间库」⇒ 「不使用补间库」这句话在 `package.json`
 *   里**长出牙齿**的唯一位置就是**依赖白名单**。
 *   ⇒ 白名单写成**集合相等**（不是「≤ N 个」也不是「不含某几个」）⇒
 *     多一个包即红。
 *
 * ── 判据纪律 ────────────────────────────────────────────────────────────
 *   · **集合相等**（不是上限类断言）⇒ 少一个也红；
 *   · **反向自测调用判据本体**（R-51 第 9 条）；
 *   · **独立实现**：G315 的「全仓 `.vue` 集合」由**本文件里另一份**遍历实现
 *     算出来 ⇒ 「扫描面」与「真相」不是同一份代码。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { allVueSources } from '../helpers/animation-rule'

const root = process.cwd()

/**
 * **独立**列出 `src/` 下全部 `.vue`（栈式遍历，与 `allVueSources` 的递归实现
 * **刻意不同** ⇒ 一份实现的 bug 不会同时骗过「扫描面」与「真相」）。
 */
function independentVueFiles(dir: string = join(root, 'src')): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
      } else if (entry.name.endsWith('.vue')) {
        out.push(relative(root, path))
      }
    }
  }
  return out.sort()
}

/** G316 的判据本体：`dependencies` **恰好**是 `{vue, zod}`。 */
const ALLOWED_DEPENDENCIES = ['vue', 'zod'] as const

function dependencyViolations(pkg: unknown): string[] {
  const deps = (pkg as { dependencies?: Record<string, string> } | null)?.dependencies
  if (deps === undefined || deps === null) return ['package.json 里没有 dependencies 字段']
  const actual = Object.keys(deps).sort()
  const expected = [...ALLOWED_DEPENDENCIES].sort()
  if (actual.length === expected.length && actual.every((name, i) => name === expected[i])) {
    return []
  }
  return [`dependencies 实际是 {${actual.join(', ')}}，期望恰好 {${expected.join(', ')}}`]
}

describe('G315 —— 动效判据的覆盖面不退化', () => {
  it('G315.1 扫描面 **确实覆盖了 `src/` 下全部 `.vue`**（与独立遍历的集合逐项相等）', () => {
    const scanned = allVueSources(root)
      .map((f) => f.name)
      .sort()
    const truth = independentVueFiles()
    // ⚠️ 先断言「真扫到了东西」—— R-51 第 1 类：
    //   「扫全仓」的判据要先证明它真的扫到了东西。
    expect(scanned.length).toBeGreaterThan(1)
    expect(scanned).toEqual(truth)
  })

  it('G315.2 三个代表性文件**都在**扫描面里（它们都在**子目录**下 ⇒ 非递归扫不到）', () => {
    const scanned = allVueSources(root).map((f) => f.name)
    expect(scanned).toContain('src/views/LevelView.vue')
    expect(scanned).toContain('src/components/battle/BattleField.vue')
    expect(scanned).toContain('src/components/quiz/OptionCard.vue')
  })

  it('G315.3 扫描面的大小与实测一致（2026-10-25 实测 19 个 `.vue`）', () => {
    // 📎 **下限**而不是等值 ⇒ 将来新增 `.vue` 不会让这条守卫假红；
    //   真正的「等值」由 G315.1 的集合比对负责。
    expect(allVueSources(root).length).toBeGreaterThanOrEqual(15)
  })
})

describe('G316 —— 依赖白名单（不使用 JS 补间库）', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as unknown

  it('G316.1 `dependencies` **恰好**是 `{vue, zod}`（多一个即红、少一个也红）', () => {
    expect(dependencyViolations(pkg)).toEqual([])
  })

  it('G316.2 反向自测：多一个依赖（模拟装了个补间库）必须被报出来', () => {
    const bad = {
      ...(pkg as { dependencies: Record<string, string> }),
      dependencies: { ...(pkg as { dependencies: Record<string, string> }).dependencies, gsap: '3.12.5' },
    }
    const violations = dependencyViolations(bad)
    expect(violations).not.toEqual([])
    expect(violations[0]).toContain('gsap')
  })

  it('G316.3 反向自测：**少一个**依赖也要报出来（集合相等，不是「只要不含禁物」）', () => {
    const bad = {
      ...(pkg as { dependencies: Record<string, string> }),
      dependencies: { vue: (pkg as { dependencies: Record<string, string> }).dependencies['vue'] ?? '3.5.0' },
    }
    expect(dependencyViolations(bad)).not.toEqual([])
  })
})
