/// <reference lib="webworker" />
/**
 * Service Worker 入口（Story 1.18 / AC-B5、AC-B6、AC-B7、AC-C2、AC-C5）。
 *
 * ── 为什么是手写的 `sw.ts` 而不是 `generateSW` 的产物 ─────────────────────
 * AC-B7 与 AC-C5 在 `generateSW` 下**无解**，这是实测结论，不是偏好：
 *
 *  · **B7** 逐字要 `.mp3` / `.svg` 走运行时 `CacheFirst`；
 *  · **C5** 逐字要「SW 版本变更时旧 runtime cache 必须被清掉，否则 mp3 换了版本仍播旧的」。
 *
 * 而 workbox 的 `generateSW` **无法表达自定义 `activate` 清理逻辑** ——
 * 实测它的 `GenerateSWOptions` 里只有 `cleanupOutdatedCaches`（只清 workbox 自己的
 * precache 缓存），没有「运行时缓存随版本改名并删旧」的钩子。
 * ⇒ 改 `strategies: 'injectManifest'`：workbox 仍然负责**生成并注入 precache 清单**
 *   （`self.__WB_MANIFEST`），而 install / activate / fetch 三段逻辑由本文件写。
 *
 * ⚠️ **这么做没有引入任何新依赖**：workbox 的运行时包（`workbox-precaching` 等）
 *   全都用不上，清单注入由 `vite-plugin-pwa` 的 `injectManifest` 承担，
 *   而它随裁决 1 已获批准安装。纯手写 ≈ 90 行，换来三条 AC 的完全可控。
 *
 * ── 🔥 本文件里**刻意没有**的两样东西（AC-C2）────────────────────────────
 *   · `self.skipWaiting()` —— 没有它，新 SW 装好后停在 `waiting`，
 *     关掉应用再开才是新版本。这正是 AC 要的「有新版本，下次启动生效」。
 *   · `self.clients.claim()` —— 没有它，首次安装后**当前**页面不受控，
 *     离线能力要等下次启动才生效。同一条 AC 的另一面：抢控制权等于抢刷新。
 *
 * ⚠️ 两条都不是「忘了写」：`tests/scaffold/pwa-sw-guard.test.ts` 的 G125 会
 *   对 `sw/` 逐字扫这两个调用，出现即红。
 */
import {
  findAppShell,
  isMediaPathname,
  precacheCacheName,
  precacheCacheKey,
  runtimeCacheName,
  staleCacheNames,
} from './sw-rules'

/**
 * workbox 的 `injectManifest` 把它生成的清单注入到这里。
 *
 * ⚠️ **必须逐字写成 `self.__WB_MANIFEST`**，不能改名、不能加括号。
 *   `workbox-build` 是在构建产物里做文本替换来注入的（找不到这串字面量就报
 *   `Unable to find a place to inject the manifest`）—— 这是实测报过的原话。
 */
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: ReadonlyArray<{ url: string; revision: string | null }>
}

/**
 * build token 的注入点 —— 由 `vite.config.ts` 的 `define` 做**文本替换**。
 *
 * ⚠️ 下面那行三元用 `typeof` 是**故意的**：`typeof` 是 JavaScript 里唯一一个
 *   对未声明标识符也不抛 `ReferenceError` 的运算符。万一某次构建漏了 `define`，
 *   这里会安静地回落到字面量 `'dev'`（所有代际共享一个缓存名、清理不触发），
 *   而不是让整个 SW 在启动第一行就崩 —— 那会让离线能力整个消失，
 *   而且**只在真机上可见**，本地全绿。
 */
declare const __PWA_ASSET_TOKEN__: string | undefined

/**
 * build token —— 由 `vite.config.ts` 在**构建时**算出并替换进来。
 *
 * ⚠️ **它必须由媒体文件的内容算出**（`public/assets/**` 全量哈希），
 *   不能只哈希代码：Story 2.x 会整批换词图 / 重录录音而代码一行不动，
 *   那时 token 必须跟着变，否则 C5 的清理就不触发。
 *
 * ⚠️ **取不到（`__PWA_ASSET_TOKEN__` 未被替换）时回落到字面量 `dev`**：
 *   宁可让所有缓存共享一个名字、清理不触发，**也不能让整个 SW 在启动时抛
 *   `ReferenceError`** —— 那会让离线能力整个消失，且只在真机上可见。
 */
const BUILD_TOKEN: string = typeof __PWA_ASSET_TOKEN__ === 'string' ? __PWA_ASSET_TOKEN__ : 'dev'

const PRECACHE = precacheCacheName(BUILD_TOKEN)
const RUNTIME = runtimeCacheName(BUILD_TOKEN)

/** 应用外壳的入口 —— 导航请求离线时的兜底（AC-B8）。 */
const APP_SHELL = new URL('index.html', self.registration.scope).href

// ── install：只装缓存，不接管页面 ─────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE)
      // ⚠️ `cache: 'reload'` 让 `add()` 绕过 HTTP 缓存去真网取一份 ——
      //   否则「装 SW 这一刻正好命中了旧 HTTP 缓存」会把旧文件固化进新缓存。
      //   这一条是 AC-C5 能兑现的前提之一，离了它 token 变了也装到旧内容。
      //
      // 🔥 **用 `allSettled` 而不是 `all`**（`[CR]` 2026-10-20）——
      //   `Promise.all` 遇到**一条**非 2xx 就整体 reject ⇒ SW 安装失败
      //   ⇒ **离线能力整个没有**，而症状只在 console 里留一条错，孩子那边是白屏。
      //   代价极低（precache 清单实测只有 4 条），收益是「一条取不到不至于全盘皆输」。
      await Promise.allSettled(
        self.__WB_MANIFEST.map((entry) =>
          cache.add(new Request(precacheCacheKey(entry), { cache: 'reload', credentials: 'same-origin' })),
        ),
      )
      // ⚠️ **这里没有 `self.skipWaiting()`**（AC-C2）。
    })(),
  )
})

// ── activate：删掉本应用上一代版本的缓存 ───────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(staleCacheNames(names, [PRECACHE, RUNTIME]).map((name) => caches.delete(name)))
      // ⚠️ **这里没有 `self.clients.claim()`**（AC-C2）——
      //   抢控制权会让**正在玩的那一局**立刻切到新 SW 的缓存上。
    })(),
  )
})

// ── fetch：导航兜底 + 媒体 CacheFirst + 其余 cache-first 回落 ─────────────

/** 媒体走运行时缓存；缓存没有才回网，回网失败就让它失败（不假装有内容）。 */
async function cacheFirstMedia(request: Request): Promise<Response> {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  // 🔥 **只缓存 200**（`[CR]` 2026-10-20）——
  //   Cache API 的 `put()` 对 **206 Partial Content** 会抛 `TypeError`（它只接受 200），
  //   而媒体元素发的是 **Range 请求** ⇒ 响应就是 206 ⇒ `put` 必 reject
  //   ⇒ 该文件**永远进不了运行时缓存** ⇒ 离线时孩子听不到声音。
  //   ⚠️ 判据用 `=== 200` 而不是 `response.ok` —— `ok` 是 200..299，**包含 206**。
  if (response.status === 200) {
    const cache = await caches.open(RUNTIME)
    // ⚠️ `void` 挂载：写缓存失败**不得**让整个 fetch 失败 ——
    //   离线能力是增强项，它坏了不该让孩子连在线内容都看不到。
    // ⚠️ **但必须接 `.catch`**（`[CR]` 2026-10-20）：裸 `void` 会把那个 reject
    //   变成一条**全局未捕获 promise 拒绝** —— 目的达到了，代价是一条全局报错。
    void cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

/** 应用外壳：优先网络（拿更新），离线时回落到 precache 的 index.html。 */
async function navigationHandler(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    // 🔥 **必须 `ignoreSearch`**（`[CR]` 2026-10-20 抓到的 P0）——
    //   precache 里的 `index.html` 键带 `?__WB_REVISION__=…`，而 `APP_SHELL` 不带。
    //   `caches.match()` 默认 `ignoreSearch: false` ⇒ 查不到 ⇒
    //   飞行模式打开就是**白屏**（AC-B8 逐字失效），而**零守卫会红**。
    //   ⇒ 查找这一段放在 `sw-rules.ts` 的 `findAppShell` 里（纯函数，可被守卫执行）。
    const cached = await findAppShell(caches, APP_SHELL)
    if (cached) return cached
    throw new Error('offline 且 precache 里没有应用外壳')
  }
}

/** 同源非媒体资源：先查两个缓存，都没有才回网并写进运行时缓存。 */
async function precachedOrNetwork(request: Request): Promise<Response> {
  const cached = (await caches.match(request, { cacheName: PRECACHE })) ?? (await caches.match(request, { cacheName: RUNTIME }))
  if (cached) return cached
  const response = await fetch(request)
  // 🔥 同上：**只缓存 200**，且**接 `.catch`**（`[CR]` 2026-10-20）。
  if (response.status === 200) {
    const cache = await caches.open(RUNTIME)
    void cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // 非 GET 不碰：POST/HEAD 走浏览器自己的栈，SW 插一脚只会制造诡异失败。
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // ⚠️ **跨源不碰**：本应用没有任何跨源资源，而代理/预检类请求由 SW 接管
  //   在部分浏览器上会直接失败（Chrome 对 `no-cors` 跨源请求限制严格）。
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request))
    return
  }

  if (isMediaPathname(url.pathname)) {
    event.respondWith(cacheFirstMedia(request))
    return
  }

  event.respondWith(precachedOrNetwork(request))
})
