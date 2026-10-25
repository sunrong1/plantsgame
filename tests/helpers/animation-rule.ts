/**
 * 「动效写 CSS」的**共享判据**（Story 3.5 / D1）。
 *
 * ── 为什么必须抽成共享实现（R-37）────────────────────────────────────────
 *   原先这条判据是 `tests/components/hand-build.test.ts` 里的**局部函数**
 *   `g38Violation`。Story 3.5 要给它加一条**覆盖面不退化**的守卫（G315），
 *   而 G315 必须能问「你到底扫了哪些文件」⇒ 判据与扫描面必须**在一起**。
 *   ⇒ 判据搬到这里，**G38 与 G315 共用同一份**（**不许抄两份**）。
 *
 * ── 判据守的是什么（NFR11）──────────────────────────────────────────────
 *   「动画时长写在 CSS，不写在 TS；动效为『状态变化 → 切 class → CSS transition』，
 *   禁止 JS 补间库与逐帧 setInterval/rAF」
 *   ⇒ 禁四样东西：`setInterval(` / `setTimeout(` / `requestAnimationFrame(` /
 *   **字面量毫秒**（`\d+ms`）。
 *
 * ⚠️⚠️ **判据形状的坑（R-51 第 12 类）**：
 *   「不许出现某个写法」是**形态型禁令** ⇒ 同一份违规换个写法就绕过去。
 *   ⇒ 这里能落到**后果**上的只有「时长写在了 CSS 里没有」这一条；
 *   其余三条是形态型禁令 ⇒ **它们的强度靠「反向用例」保证**
 *   （M70 两条 + 新增的反向用例必须真的变红）。
 *
 * ── 📎 HTML 注释这条边界（D1 的 ①）────────────────────────────────────────
 *   共享 `stripComments` **不剥** `.vue` 模板里的 `<!-- … -->` ⇒ 扩面到 19 个
 *   `.vue` 之后，模板注释里的字面量会被当代码扫 ⇒ 假红。
 *   ⇒ 本模块**配对**使用 `stripComments` + `stripHtmlComments`
 *   （**先**剥 HTML 注释 —— 否则 HTML 注释里的 `//` 会把真代码吃掉）。
 */

import { stripComments, stripHtmlComments } from '../fixtures/strip-comments'
import { vueSourceFiles, type SourceFile } from './vue-sources'

export type { SourceFile }

/** 被禁的四种形态（**逐条**列出，报告里要点名是哪一种）。 */
export const ANIMATION_FORBIDDEN: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  { pattern: /setInterval\s*\(/, label: 'setInterval' },
  { pattern: /setTimeout\s*\(/, label: 'setTimeout' },
  { pattern: /requestAnimationFrame\s*\(/, label: 'requestAnimationFrame' },
  { pattern: /\b\d+ms\b/, label: '字面量毫秒' },
]

/**
 * 判据本体（**纯函数**，可单测）。
 *
 * @param sources 要扫的源码清单
 * @returns 违规描述列表（空数组 = 通过）
 */
export function animationViolations(sources: readonly SourceFile[]): string[] {
  const defects: string[] = []
  for (const { name, source } of sources) {
    // 📎 **先剥 HTML 注释，再剥 JS 注释**（顺序不能反）。
    const code = stripComments(stripHtmlComments(source))
    for (const { pattern, label } of ANIMATION_FORBIDDEN) {
      if (pattern.test(code)) defects.push(`${name} 出现了 ${label}`)
    }
  }
  return defects
}

/**
 * **G38 / G315 的扫描面** = `src/` 下**全部** `.vue`（Story 3.5 / D2）。
 *
 * ⚠️ **不许改 `hand-build.test.ts` 里那个共用的 `COMPONENT_SOURCES`** ——
 *   它是**五条守卫共用**的（G33a / G33b / G39 / G43 / G38）⇒ 扩到 19 个 `.vue`
 *   会**连带打红 G33b**（`HeartRow.vue` 的 HTML 注释里有 `HEARTS`）。
 *   ⇒ 这里**另建**一份，只给 G38 / G315 用。
 */
export function allVueSources(root: string): SourceFile[] {
  return vueSourceFiles(root)
}
