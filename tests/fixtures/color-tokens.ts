/**
 * `--color-*` 的**值**快照 —— R-12「既有 `--color-*` 的值不得改」的守卫基准。
 *
 * ── 为什么这里要有一份副本 ────────────────────────────────────────────────
 *   R-12 逐字要求「已定稿的 CSS 变量**值**一个都不许改」，而它自己的「守卫」字段
 *   逐字写着「⚠️ **无守卫**」—— `palette.test.ts` 只断言 token **存在**与对比度，
 *   `asset-geometry.test.ts` 的 G3 只断言 SVG 里的 hex **等于 tokens.css 当期字面值**
 *   （那是**一致性**，不是**冻结**）⇒ **改了 tokens.css 的值，全仓测试照样全绿。**
 *
 *   冻结一个值，就**必须**有一份第二副本可比对 —— 这不是「复制链」（R-37），
 *   而是「冻结」这件事本身的必要条件：没有第二份就没有比对基准。
 *   这里选的是**可读的快照**而不是哈希：哈希只能告诉你「变了」，
 *   快照能让 reviewer 在 diff 里**直接看到**改成了什么。
 *
 * ── 这份快照的维护约定 ────────────────────────────────────────────────────
 *   · **新增** `--color-*` ⇒ 必须把新 token 登记进这里（新颜色另需过
 *     `palette.test.ts` 的 WCAG 实算）⇒ 快照的 diff 就是这次新增的**评审留痕**。
 *   · **修改**既有 token 的值 ⇒ 本文件与 `src/styles/tokens.css` 会当场一起红
 *     （守卫 G302）⇒ 那正是 R-12 要拦的动作；真要改就得先改 R-12 的正文，
 *     而不是绕过这条快照。
 *   · 本文件**只放值**，不放条数 —— 条数会随新 token 增长，写死条数本身
 *     就是新的过时约束（R-12 的注记逐字写着这一点）。
 *
 * 出处：DF-183（E36，Epic 1 集成层检视）。
 */
export const COLOR_TOKEN_VALUES: Readonly<Record<string, string>> = {
  '--color-bg': '#7cb342',
  '--color-path': '#d7ccc8',
  '--color-tower-shooter': '#09428c',
  '--color-tower-slow': '#6a1b9a',
  '--color-tower-aoe': '#7a3200',
  '--color-zombie': '#1b5e20',
  '--color-sun': '#fdd835',
  '--color-heart': '#e53935',
  '--color-hud-panel': '#1f2d11',
  '--color-neutral-dark': '#424242',
  '--color-correct': '#2e7d32',
  '--color-wrong': '#b71c1c',
  '--color-overlay-range': 'rgba(255, 255, 255, 0.3)',
  '--color-overlay-blocked': 'rgba(0, 0, 0, 0.18)',
  '--color-overlay-inert': 'rgba(0, 0, 0, 0.1)',
  '--color-overlay-unaffordable': 'rgba(0, 0, 0, 0.45)',
  '--color-on-tower': '#ffffff',
  '--color-asset-stroke': '#ffffff',
}
