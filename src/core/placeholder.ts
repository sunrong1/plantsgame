/**
 * 词图加载失败时的**内联占位图形**（Story 1.11 / AC-B2、AC-B3）。
 *
 * ── 为什么它住在 `core/` ────────────────────────────────────────────────────
 * 规格上它是一个「**随 `core/` 提供的可内联 SVG 字符串常量**」（AC-B2 原文），
 * 而本层是唯一同时满足两条硬约束的地方：
 *   · 零 DOM（`tsconfig.core.json` 的 `lib` 不含 `DOM`）—— 它是**字符串**，
 *     不构造任何节点，也就没有任何运行时造 DOM 的机会（守卫见
 *     `tests/core/placeholder.test.ts`）
 *   · 不进 `app/` 或 `services/` —— 那两层都带副作用或部署期事实，
 *     一个静态图形常量放进去会让依赖方向变浑（`components/ → app/ → services/`）
 *
 * ── 为什么必须是「字符串」而不是「一个 Vue 组件」─────────────────────────
 * AC-B2 明确禁掉两条路：`<img :src="data:image/svg+xml,…">`（字符串含 `.svg`
 * 字面量，守卫 G23 会红）与 `new Image()` + `createObjectURL`（明确禁）。
 * 剩下的唯一合法形态就是 `v-html` 绑定一个**已经算好内容的字符串**。
 * 它是受控字面量、不是用户输入 ⇒ `v-html` 在这里是安全的
 * （`vue/no-v-html` 是 warn 而非 error，`npm run lint` 无 `--max-warnings`，
 * 留这条警告是**有意的**，见 Completion Notes）。
 *
 * ── 画法上刻意与真图不同 ──────────────────────────────────────────────────
 * 真图是**彩色、有主体、有细节**的插画；占位图形是**单色灰、只有轮廓、主体缺席**。
 * 孩子一眼能看出「这张图没出来」，而**看不出的是**「游戏坏了」——
 * NFR13 的口径是「孩子面前绝不出现任何英文错误提示」，
 * 而一个破图图标 / alt 文本 / 感叹号三角都是那类东西。
 *
 * ⚠️ **不许叠任何文字。** 词图已按 G10 剥掉全部 `<text>`（1.8 裁决 2），
 *   在选项卡上写字等于把答案印在图上，把那道守卫白做（AC-C1）。
 *
 * ⚠️ **不许引用任何外部资源。** `<image href>` / `href` / `url(#…)` 里的
 *   `url()` 之外的引用都会在渲染时发请求，而本 story 的前提恰恰是
 *   「这张图已经加载失败了」⇒ 再发一次只会再失败一次，
 *   那不是降级，是把失败推迟一次（守卫见 `placeholder.test.ts` 的「自包含」）。
 */

const PLACEHOLDER_STROKE = '#9e9e9e'
const PLACEHOLDER_FILL = '#bdbdbd'

/**
 * 512×512 的内联 SVG —— 与词图画布**同尺寸同比例**。
 *
 * ⚠️ 为什么尺寸必须一致：降级发生时**只该换内容，不该改几何**。
 *   若占位图形的 viewBox 与词图不同，一张卡的选项区会在「图没出来」的一瞬间重排，
 *   而布局抖动本身就会让另外三张卡跟着跳 —— 孩子会以为是自己点错了。
 */
export const WORD_IMAGE_PLACEHOLDER_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" focusable="false" aria-hidden="true">',
  `<rect x="72" y="72" width="368" height="368" rx="28" fill="none" stroke="${PLACEHOLDER_STROKE}" stroke-width="12"/>`,
  '<circle cx="204" cy="196" r="34" fill="' + PLACEHOLDER_FILL + '"/>',
  `<path d="M112 384 L206 258 L286 366 L346 292 L400 384 Z" fill="${PLACEHOLDER_FILL}"/>`,
  '</svg>',
].join('')
