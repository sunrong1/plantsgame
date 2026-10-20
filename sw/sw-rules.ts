/**
 * Service Worker 的**纯规则**部分（Story 1.18 / AC-B7、AC-C2、AC-C5）。
 *
 * ── 为什么把纯规则与 SW 入口分开 ──────────────────────────────────────────
 * `sw.ts` 是一段**只在浏览器里、且只在 Service Worker 全局作用域里**运行的代码：
 * 顶层就 `self.addEventListener(...)`，需要 `caches` / `self.registration` /
 * `ServiceWorkerGlobalScope` 这些类型。它**没法被 vitest 直接 import**（node
 * 环境下求值会在第一行就炸）。
 *
 * ⇒ 于是「哪些 URL 进哪个缓存」「哪些缓存该删」这两组**决策**抽到这里 ——
 *   它们是纯函数，node 环境直接测。这也让 AC-C5 那条守卫有一个真正能跑的落点：
 *   「旧缓存必须被清掉」可以被断言成
 *   `staleCacheNames(['plantsgame-runtime-v1', 'plantsgame-runtime-v2'], 当前两个) === ['plantsgame-runtime-v1']`。
 *
 * ⚠️ **零 DOM 依赖是硬要求**：`sw/` 归 `tsconfig.sw.json`（`lib` 是 `WebWorker`
 *   而不是 `DOM`），两个全局作用域的类型互不覆盖 —— 往这里写 `document` 会当场红。
 *
 * ⚠️ R-61 同款纪律（`scripts/` 那条）：`sw/` 下的代码**不得 import `src/`**。
 *   SW 与应用代码是两个独立的全局作用域，共享一份模块反而会让两边的类型打架。
 */

/** 本应用所有缓存名的统一前缀 —— `staleCacheNames` 靠它区分「我们的」与「别人的」。 */
export const CACHE_PREFIX = 'plantsgame-'

/**
 * 应用外壳的 precache 缓存名 —— **带 build token**（AC-C5）。
 *
 * ⚠️ 为什么 precache 也要带 token：`index.html` **不带内容哈希**
 *   （它是 SPA 的入口，文件名固定），所以它的内容变化对 URL 不可见。
 *   token 一变，旧 precache 里的 `index.html` 就整体作废 —— 否则会出现
 *   「新版 JS 配旧版 HTML」的组合。
 */
export function precacheCacheName(token: string): string {
  return `${CACHE_PREFIX}precache-${token}`
}

/**
 * 运行时缓存名（`mp3` / `svg` 等媒体）—— **同样带 build token**（AC-C5）。
 *
 * 🔥 **这正是 AC-C5 要防的那条死路**：录音与词图的 URL **永远稳定**
 *   （`/plantsgame/assets/audio/voice/u1-dog.mp3`），文件名里没有内容哈希。
 *   `CacheFirst` 命中缓存就永远返回**旧文件** ⇒ 新版本部署后，孩子听到的
 *   仍是上一次的录音，而页面上没有任何东西变了。
 *   ⇒ token 一变，缓存名就变 ⇒ 旧的那一份被 `staleCacheNames` 删掉、重新拉。
 *
 * ⚠️ **token 必须由媒体文件的内容算出**（见 `vite.config.ts` 的 `assetToken()`），
 *   只由代码算出是不够的 —— Story 2.x 会整批换词图而代码一行不动。
 */
export function runtimeCacheName(token: string): string {
  return `${CACHE_PREFIX}runtime-${token}`
}

/**
 * 该删掉的缓存名（AC-C5 的本体）。
 *
 * ⚠️ **只删带本前缀的**：`caches.keys()` 返回的是**同源下所有**缓存，
 *   包括别的应用、浏览器扩展、用户装过的其他 PWA 写进来的。
 *   前缀过滤是它们唯一的护栏 —— 没有它的话，本应用每次激活都会
 *   把用户的其它离线数据删掉。
 *
 * @param allNames `caches.keys()` 的返回值
 * @param keep 本次激活后应当**保留**的两个缓存名
 */
export function staleCacheNames(allNames: readonly string[], keep: readonly string[]): string[] {
  return allNames.filter((name) => name.startsWith(CACHE_PREFIX) && !keep.includes(name))
}

/**
 * 这个请求该不该走运行时 `CacheFirst`（AC-B7）。
 *
 * ⚠️ **只收媒体后缀**。应用外壳（html/js/css）由 precache 负责，
 *   放进运行时缓存等于让它**没有版本边界** —— 那正是 AC-C5 要消除的形态。
 *
 * ⚠️ **为什么图片也算媒体**：词图是 `.svg`，图标是 `.png`，两者的 URL 同样不带哈希
 *   （`u1-dog.svg` 是内容层按 id 命名的）。只收 `mp3` 会让「换了词图版本」这一种
 *   场景完全漏在清理之外。
 *
 * @param pathname `new URL(request.url).pathname` —— 调用方已经保证同源
 */
export function isMediaPathname(pathname: string): boolean {
  return /\.(?:mp3|svg|png|jpe?g|webp|gif)$/i.test(pathname)
}

/**
 * precache 清单项的**缓存键**（workbox 的约定）。
 *
 * ⚠️ `revision` 为 `null` 时缓存键就是 URL 本身；非 `null` 时按 workbox 的约定
 *   追加 `__WB_REVISION__` 查询串 —— 内容变了就换一个键，而不是命中旧条目。
 *
 * 🔥 **这条键的形状正是离线兜底那个 P0 的根**（`[CR]` 2026-10-20 实测）：
 *   真实产物 `dist/sw.js` 的 precache 清单里 `index.html` 的 revision **非空**
 *   （`{"revision":"fe46491d9ddb11cd22c1404ceabea996","url":"index.html"}`）
 *   ⇒ 它的缓存键是 `index.html?__WB_REVISION__=fe46491d…`，
 *   **与 `APP_SHELL`（不带查询串）不是同一个字符串**。
 *   而 Cache API 的 `match()` 默认 `ignoreSearch: false`
 *   ⇒ 查询串必须逐字相同才命中 ⇒ 不带查询串去查**必然落空**
 *   ⇒ 飞行模式打开即抛「offline 且 precache 里没有应用外壳」⇒ 白屏。
 *   ⇒ 查的时候**必须** `ignoreSearch: true`（见 `findAppShell`）。
 */
export function precacheCacheKey(entry: { url: string; revision: string | null }): string {
  return entry.revision === null ? entry.url : `${entry.url}?__WB_REVISION__=${entry.revision}`
}

/**
 * 缓存查询的**最小端口** —— 只要求 `match` 与 `ignoreSearch` 语义。
 *
 * ⚠️ 为什么不直接写 `CacheStorage`：那样这个文件就得引用 `CacheStorage` /
 *   `CacheQueryOptions` 这些**全局作用域相关**的类型，
 *   而 `sw-rules.ts` 同时被 `tsconfig.sw.json`（WebWorker lib）与
 *   `tsconfig.test.json`（DOM lib）收录 —— 两套 lib 的同名类型互不相通。
 *   ⇒ 端口用**泛型**自描述，零全局依赖。
 */
export interface CacheQueryPort<T> {
  match(url: string, options: { ignoreSearch: boolean }): Promise<T | undefined>
}

/**
 * 在缓存里找应用外壳 —— **必须忽略查询串**（AC-B8）。
 *
 * 🔥 **这是 `[CR]` 2026-10-20 抓到的 P0 的修复点**，原理逐字：
 *   precache 里的 `index.html` 键带 `?__WB_REVISION__=…`（见 `precacheCacheKey`），
 *   而 `APP_SHELL` 是不带查询串的绝对 URL。
 *   `caches.match()` 默认 `ignoreSearch: false` ⇒ **两者不是同一个键** ⇒ 必然落空。
 *   ⇒ `ignoreSearch: true` 让查找**只按路径**匹配 ⇒ 命中。
 *
 * ⚠️ **为什么把它做成纯函数**（而不是在 `sw.ts` 里直接写 `caches.match(APP_SHELL, {...})`）：
 *   `sw.ts` 没法被 vitest 直接 import（node 环境下求值会在第一行 `self.addEventListener` 就炸），
 *   所以判据落不到它身上 —— 这正是 AC-G7 警告的「跨模块接线漏网」。
 *   把**查找这一段**搬到这里，判据就能**真的执行**它：
 *   守卫用一个**按规范实现 `ignoreSearch` 语义的假缓存**喂给它，
 *   断言它找得到那条带 revision 的条目；
 *   而「假缓存不认 `ignoreSearch` 时就找不到」这条反向自测，
 *   保证这条判据**不是恒真的**。
 *
 * ⚠️ **别把 `ignoreSearch` 去掉**：去掉 ⇒ 飞行模式下打开就是白屏（AC-B8 逐字失效），
 *   而**没有任何一条守卫会红**（那正是 `[CR]` 判为「零守卫覆盖」的原因）。
 */
export async function findAppShell<T>(cache: CacheQueryPort<T>, shellUrl: string): Promise<T | undefined> {
  return cache.match(shellUrl, { ignoreSearch: true })
}
