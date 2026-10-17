/**
 * 内容资产（词图 / 塔图 / 僵尸图）降级登记（Story 1.17 / 裁决 10、AC-E1）。
 *
 * ── 为什么这个模块存在 ─────────────────────────────────────────────────────
 * 三个降级源里，**只有内容资产这一路是缺的**：
 *   · 音频 —— `audioDegradations()`（1.14 交付）
 *   · 存档 —— `saveDegradations()`（1.15 交付）
 *   · **内容资产 —— 四个组件各有一个 `failed` ref + 一条 `console.warn`，
 *     全仓零可查询标志** ⇒ 面板读不到它。
 * ⇒ AC 逐字要面板列出「词图加载失败」，1.17 就必须自己把这件事变成可查询状态。
 *
 * ── 形态照抄 `services/save.ts`，不是照抄它的灵感 ───────────────────────────
 * · **`Map` 而不是数组** —— 同一个 URL 反复失败 10 次仍只是一项
 *   （`save.ts` 的注释逐字写了这个理由；R-37：照抄，不另发明）。
 * · **本模块内零 `console`** —— 那条 `[content]` WARN **逐字留在组件里**。
 *   登记点只记账、不出声；出声的是「刚刚发现图挂了」的那个组件，
 *   它知道塔 id / 塔型 / 卡型，而这里什么都不知道。
 * · **不抛、不弹窗、不阻断**（NFR12：运行时降级绝不阻断回合）。
 */

/** 一条正在生效的内容资产降级项。 */
export interface AssetDegradation {
  /** 失败的资源 URL —— 通常是带 `import.meta.env.BASE_URL` 前缀的绝对路径。 */
  readonly url: string
  /** 人话原因（组件自己写，它才知道是什么挂了）。 */
  readonly reason: string
}

/**
 * 全部正在生效的降级项。
 *
 * ⚠️ **`Map` 的键是 `url`，值是最后登记的理由** —— 同一个 URL 再挂一次就覆盖理由，
 *   不新增一项。看到「最后一次为什么挂」比看到「它挂过几次」有用。
 */
const degraded = new Map<string, string>()

/**
 * 登记一条内容资产降级。**不抛、不出声、不阻断**（AC-E1 第 3 条）。
 *
 * @param url 失败的资源 URL
 * @param reason 人话原因
 */
export function markAssetDegraded(url: string, reason: string): void {
  degraded.set(url, reason)
}

/** 全部正在生效的内容资产降级项 —— 调试面板的数据源（AC-E4）。 */
export function assetDegradations(): readonly AssetDegradation[] {
  return [...degraded.entries()].map(([url, reason]) => ({ url, reason }))
}

/** 是否有内容资产在降级中（用来决定面板要不要把这一段渲染出来）。 */
export function isAssetDegraded(): boolean {
  return degraded.size > 0
}

/**
 * 清空登记 —— **只给测试用**。
 *
 * ⚠️ **生产代码不许调它**。`save.ts` 有 `clearSave()`，那是有真实语义的
 *   「玩家要求清档」；本模块没有对应的用户操作 —— 一张图在一次会话里挂过一次，
 *   就是挂过一次，不该有人替它「洗白」。
 *   导出它是为了让**测试之间不串味**（模块级 `Map` 不会自动复位），
 *   命名带 `ForTest` 就是为了让任何误用都在 code review 里一眼看见。
 */
export function clearAssetDegradationsForTest(): void {
  degraded.clear()
}
