/**
 * `src/` 下**全部** `.vue` 文件的源码清单（**共享来源**，R-37）。
 *
 * ── 为什么要有这个共享件 ─────────────────────────────────────────────────
 *   Story 3.5 里有**两条**守卫都要「扫 `src/` 下的 `.vue`」：
 *   · **G38**（动效写 CSS）的扫描面从 4 个文件扩到**全部 `.vue`**（D2）；
 *   · **G317**（命中区清单不许漂移）要**从源码反查**可点 class（B3）。
 *   ⇒ 两处各写一份递归列文件的实现 = 迟早漂移 ⇒ **抽到这里**。
 *
 * ── ⚠️⚠️ **递归是硬要求**（G138 的教训，第二次）──────────────────────────
 *   G138 当年用 `readdirSync` **只列一层** ⇒ 只扫到 `src/App.vue` 一个文件
 *   ⇒ 它自打出来起就在对着一个几乎为空的清单打转，**而它一直是绿的**。
 *   ⇒ 本实现**递归**下钻目录；守卫 **G315** 另外断言「扫到的集合 == 全仓 `.vue` 集合」。
 *
 * 📎 **排序**：按路径排 ⇒ 输出稳定 ⇒ 报告里的文件顺序可复核。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 一个源码文件：`name` 是**仓库相对路径**（如 `src/views/LevelView.vue`）。 */
export type SourceFile = { name: string; source: string }

/**
 * 递归列出 `dir` 下**全部** `.vue` 文件（连同它们的源码）。
 *
 * @param root 仓库根（用来算相对路径）
 * @param dir   要扫的目录（默认 `root/src`）
 */
export function vueSourceFiles(root: string, dir: string = join(root, 'src')): SourceFile[] {
  const out: SourceFile[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...vueSourceFiles(root, path))
    } else if (entry.name.endsWith('.vue')) {
      out.push({ name: relative(root, path), source: readFileSync(path, 'utf8') })
    }
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}
