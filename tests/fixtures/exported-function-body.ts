/**
 * 从源码里切出**某一个顶层导出函数**的函数体（`[CR]` 2026-10-17 提为 fixture）。
 *
 * ── 为什么不能直接用 `slice(indexOf(...))` ──────────────────────────────────
 * 那写法切到**文件末尾**。于是当目标函数按注释预告的方式重构过
 * （例如把 URL 解析抽成 `devParam(name)`），真正含判据的那几行会落到
 * **后面另一个函数**里，而判据照样绿 —— 实测过一次：
 * `guardAt 220  urlAt 361  green? true`，**静默放过**。
 * 而原注释逐字断言这种重构会让判据「当场失明」，⇒ **注释与行为不符**。
 *
 * ── 切法 ────────────────────────────────────────────────────────────────────
 * 从 `indexOf` 的**下一位**开始找第一个行首的 `export`，那就是下一个顶层导出的起点；
 * 找不到（这就是最后一个导出）就切到文件末尾。
 * ⚠️ 从 `from + 1` 起而不是 `from` 起：否则会命中**自己**那行 `export`，
 * 切出一个长度为 0 的空体 —— 那是比切片到末尾更隐蔽的一种失明。
 *
 * ── 为什么是 fixture 而不是各处自己写 ──────────────────────────────────────
 * G112（`debug-panel.test.ts`）与 G118（`jump-turn.test.ts`）在同一个 story 里
 * 撞上**同一个**形状的问题，而第一版只有 G118 写对了。
 * 各处抄一份 = 两份会各自漂移（R-37 说的 Story 1.9 P0）。
 */

/** 切不出函数体时抛错 —— 静默返回空串会让「判据已失明」变成「判据恒绿」。 */
export class FunctionNotFoundError extends Error {}

/**
 * 切出 `signature`（例如 `'export function jumpToTurn'`）那个顶层导出的函数体。
 *
 * @param source   **已剥掉注释**的源码（R-52）
 * @param signature 用于定位的**签名片段**，不必写全参数列表
 * @returns 从 `{` 到配对的 `}`，含签名行本身
 * @throws 找不到签名时抛 {@link FunctionNotFoundError}（不返回空串）
 */
export function exportedFunctionBody(source: string, signature: string): string {
  const from = source.indexOf(signature)
  if (from < 0) {
    throw new FunctionNotFoundError(
      `源码里找不到 \`${signature}\` —— 函数改名或搬走了，判据已失明（不是「这一条合规」）`,
    )
  }
  // ⚠️ 从 `from + 1` 起：否则会命中签名自己那行的 `export`，切出空体。
  const next = source.slice(from + 1).search(/^export\s/m)
  const end = next < 0 ? source.length : from + 1 + next
  return source.slice(from, end)
}
