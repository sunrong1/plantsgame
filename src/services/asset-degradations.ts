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
 * 登记表版本号 —— 每次登记 / 清除都 +1（`[CR]` 2026-10-17 补）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * `degraded` 是个**模块级 `Map`**：Vue 的响应式追踪只认 `ref` / `reactive` / `computed`，
 * 读一个普通 `Map` **建不起任何依赖** ⇒ 面板上那个 `computed` 只会在挂载时算一次，
 * 之后词图 404 再也刷不出来。
 *
 * 📎 **刻意用纯数字而不是 `ref`**：`src/services/**` 与 `src/core/**` 今天**零 vue 依赖**
 *   （R-08 的依赖方向里没有 Vue 这一层，守卫会红）。版本号在这里只是一个**普通整数**。
 */
let version = 0

/**
 * 变更监听者 —— **纯函数数组，零框架**（`[CR]` 2026-10-17 补）。
 *
 * ⚠️📎 **为什么光有版本号不够**（这是本条最容易想当然的一处）：
 *   Vue 的 `computed` **只追踪响应式量的读取**。把 `assetDegradationsVersion()`
 *   写进 `computed` 里读一遍，**建不起任何依赖** —— 那个 `computed` 只会在
 *   它自己别的响应式依赖变动时才重算 ⇒ 版本号变了面板**照样不刷**。
 *   「版本号」回答的是「**变没变**」（可拉、可断言），「监听者」回答的是
 *   「**什么时候变**」（推给 Vue）。两个都要，缺一不可。
 */
const listeners = new Set<() => void>()

/**
 * 订阅降级变化 —— 返回**退订函数**（照 `AbortSignal` 的形状，不留半截订阅）。
 *
 * ⚠️ 监听者集合是模块级的，**每个订阅都必须在 `onUnmounted` 退订** ——
 *   漏一个就是面板卸载后仍被回调，第二次挂载时回调翻倍。
 */
export function onAssetDegradationsChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/**
 * 「降级状态变了」—— **本模块唯一的变更入口**。
 *
 * ⚠️📎 **版本号与通知写在同一个函数里，是刻意的**：它们回答的是同一个事实
 *   （「状态变了」）。分成两处调用点就多一次「加了一个忘了另一个」的机会，
 *   而那种不一致**测不出来** —— 版本号涨了面板不刷，或者反之，两边单看都绿
 *   （与 R-58 记的那个「默认 `flush: 'pre'` 把同步多次赋值合并成一次」同类：
 *   一个只监一个信号的判据恒绿）。
 */
function noteChanged(): void {
  version += 1
  for (const cb of listeners) cb()
}

/** 登记表的当前版本号 —— **只在登记 / 清除时递增**。
 *
 *  ⚠️ **同一条降级项重复登记也要递增**：面板要能反映「理由变了」，
 *    而不只是「多了一项」。
 */
export function assetDegradationsVersion(): number {
  return version
}

/**
 * 登记一条内容资产降级。**不抛、不出声、不阻断**（AC-E1 第 3 条）。
 *
 * @param url 失败的资源 URL
 * @param reason 人话原因
 */
export function markAssetDegraded(url: string, reason: string): void {
  degraded.set(url, reason)
  noteChanged()
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
  noteChanged()
}
