/**
 * 离线兜底与缓存写入的守卫（Story 1.18 `[CR]` 2026-10-20 新增 / AC-B8、AC-B7、AC-C5）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 三条**静默**的死路，全部是「本地全绿、真机白屏」那一类：
 *
 * ① **离线兜底命中不到 precache 里的 `index.html`**（`[CR]` 2026-10-20 实测的 P0）。
 *   precache 清单里 `index.html` 的 revision **非空** ⇒ 它的缓存键是
 *   `index.html?__WB_REVISION__=fe46491d…`；而 `APP_SHELL` 是不带查询串的绝对 URL。
 *   `caches.match()` 默认 `ignoreSearch: false` ⇒ **两者不是同一个键** ⇒ 必然落空
 *   ⇒ 飞行模式打开即抛「offline 且 precache 里没有应用外壳」⇒ **白屏**。
 *   ⚠️ **这在修复前是零守卫覆盖的** —— `verify-deploy.ts` 对 SW 只有 5 条**文本**判据。
 *
 * ② **`cache.put()` 拒收 206**（`[CR]` 实测）。
 *   Cache API 规定 `put()` 只接受 200，收到 **206 Partial Content** 会抛 `TypeError`；
 *   而媒体元素发的是 **Range 请求** ⇒ 响应就是 206 ⇒ put 必 reject
 *   ⇒ **录音永远进不了运行时缓存** ⇒ 离线时孩子听不到声音。
 *   而原来的写法是**裸 `void`** ⇒ 那个 reject 变成一条**全局未捕获 promise 拒绝**。
 *
 * ③ **install 用 `Promise.all`** ⇒ 一条非 2xx 就整体 reject
 *   ⇒ SW 永不激活 ⇒ **离线能力整个消失**，而症状只在 console 里留一条错。
 *
 * ── 为什么判据能**真的执行**生产代码 ───────────────────────────────────────
 * `sw/sw.ts` 没法被 vitest 直接 import（node 环境下求值会在第一行
 * `self.addEventListener` 就炸）—— 这是 `sw-rules.ts` 存在的全部理由。
 * ⇒ 于是**查找这一段**被搬进 `sw-rules.ts` 的纯函数 `findAppShell`，
 *   本文件喂给它一个**按规范实现 `ignoreSearch` 语义的假缓存**，
 *   断言它找得到那条带 revision 的条目。
 * ⚠️ 而**接线**（`sw.ts` 真的调它、真的传对参数）由 G196 单独守 ——
 *   这正是 AC-G7 逐字警告的「跨模块接线必须单独守卫」。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findAppShell, precacheCacheKey } from '../../sw/sw-rules'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const swSource = sourceOf('sw/sw.ts')

/** 真实产物 `dist/sw.js` 的 precache 清单里 `index.html` 的 revision（`[CR]` 2026-10-20 实测）。 */
const REAL_REVISION = 'fe46491d9ddb11cd22c1404ceabea996'

/** SW 的作用域（真实部署下是 `https://<host>/plantsgame/`）。 */
const SCOPE = 'https://example.test/plantsgame/'
const APP_SHELL = new URL('index.html', SCOPE).href

/**
 * 一个**按规范实现 `ignoreSearch` 语义**的假缓存。
 *
 * ⚠️ **必须忠实**：Cache API 的规则是「`ignoreSearch: true` 时**只**忽略查询串，
 *   其余部分（scheme / host / path）仍要逐字相同」。
 *   这个假实现把那条规则写死在这里 ⇒ 守卫才敢断言「找得到」。
 */
function makeFakeCache(entries: ReadonlyArray<{ url: string; body: string }>) {
  const seen: Array<{ url: string; options: { ignoreSearch: boolean } }> = []
  return {
    seen,
    async match(url: string, options: { ignoreSearch: boolean }) {
      seen.push({ url, options })
      const target = new URL(url)
      for (const entry of entries) {
        const cached = new URL(entry.url, target)
        if (cached.origin !== target.origin) continue
        if (cached.pathname !== target.pathname) continue
        if (!options.ignoreSearch && cached.search !== target.search) continue
        return { body: entry.body }
      }
      return undefined
    },
  }
}

// ── G195 —— 离线兜底能命中带 revision 的外壳（AC-B8）────────────────────────

describe('G195 —— 离线兜底命中得到 precache 里的应用外壳（Story 1.18 `[CR]` / AC-B8）', () => {
  it('precache 的缓存键在 revision 非空时带 `__WB_REVISION__` 查询串（这正是坑的形状）', () => {
    expect(
      precacheCacheKey({ url: 'index.html', revision: REAL_REVISION }),
      'precache 的缓存键没带 revision 查询串 —— 那说明 workbox 注入的清单形态变了，' +
        'G195 下面那条「带查询串时也要找得到」就变成恒真，判据失去牙齿',
    ).toBe(`index.html?__WB_REVISION__=${REAL_REVISION}`)
    expect(
      precacheCacheKey({ url: 'index.html', revision: null }),
      'revision 为 null 时缓存键应当就是 URL 本身',
    ).toBe('index.html')
  })

  it('离线兜底找得到那条带 revision 的外壳（行为判据）', async () => {
    // ⚠️ 缓存里放的是**真实形态**：键带 `?__WB_REVISION__=…`，而查的是不带查询串的 `APP_SHELL`。
    const cache = makeFakeCache([
      { url: precacheCacheKey({ url: 'index.html', revision: REAL_REVISION }), body: '<html>外壳</html>' },
    ])
    const found = await findAppShell(cache, APP_SHELL)
    expect(
      found,
      '离线兜底没找到 precache 里的 index.html —— 飞行模式打开就是白屏（AC-B8 逐字失效）',
    ).toBeDefined()
    expect(found?.body).toBe('<html>外壳</html>')
  })

  it('查找时确实带了 `ignoreSearch: true`（断言落在**传了什么**上，不是落在 API 名上）', async () => {
    const cache = makeFakeCache([
      { url: precacheCacheKey({ url: 'index.html', revision: REAL_REVISION }), body: '<html>外壳</html>' },
    ])
    await findAppShell(cache, APP_SHELL)
    expect(cache.seen.length, 'findAppShell 一次都没查缓存 —— 判据空跑').toBe(1)
    expect(cache.seen[0]?.options.ignoreSearch).toBe(true)
    expect(cache.seen[0]?.url).toBe(APP_SHELL)
  })

  it('⚠️ R-53 反向自测：同一批缓存，**不认查询串**时就找不到（证明上一条不是恒真）', async () => {
    const cache = makeFakeCache([
      { url: precacheCacheKey({ url: 'index.html', revision: REAL_REVISION }), body: '<html>外壳</html>' },
    ])
    // 这正是修复前 `sw.ts` 的形态：`caches.match(APP_SHELL)` —— 默认 `ignoreSearch: false`。
    const without = await cache.match(APP_SHELL, { ignoreSearch: false })
    expect(
      without,
      '假缓存「不认查询串时也找到了」—— 那说明这个假实现没有忠实实现 Cache API 的 ' +
        'ignoreSearch 语义，G195 那条正向断言就测不出任何东西（R-51 第 1 类）',
    ).toBeUndefined()
    // ⇒ 而带查询串时找得到 ⇒ 差别**只**来自 ignoreSearch ⇒ 那条判据真的在咬。
    const with_ = await cache.match(APP_SHELL, { ignoreSearch: true })
    expect(with_, '假缓存连 `ignoreSearch: true` 都找不到 —— 假实现本身坏了').toBeDefined()
  })

  it('路径不同的条目不会被误命中（`ignoreSearch` 只忽略查询串，不忽略路径）', async () => {
    const cache = makeFakeCache([
      { url: precacheCacheKey({ url: 'other.html', revision: REAL_REVISION }), body: '<html>别的</html>' },
    ])
    const found = await findAppShell(cache, APP_SHELL)
    expect(found, '把别的路径当外壳命中了 —— 那会给孩子一个打不开的页面').toBeUndefined()
  })
})

// ── G196 —— 离线兜底的**接线**（AC-B8、AC-G7）────────────────────────────────

describe('G196 —— sw.ts 真的走 findAppShell（Story 1.18 `[CR]` / AC-B8、AC-G7）', () => {
  /** `navigationHandler` 那个函数体的源码。 */
  function navigationBody(): string {
    const start = swSource.indexOf('async function navigationHandler')
    expect(start, 'sw/sw.ts 里找不到 navigationHandler —— 离线兜底不在了').toBeGreaterThan(-1)
    const end = swSource.indexOf('\n}\n', start)
    expect(end, 'navigationHandler 的闭合括号形态变了 —— 这条守卫会空跑').toBeGreaterThan(start)
    return swSource.slice(start, end)
  }

  it('navigationHandler 的兜底走的是 findAppShell', () => {
    expect(
      navigationBody(),
      'navigationHandler 没有调 findAppShell —— 离线兜底绕过了那条带 ignoreSearch 的查找，' +
        '飞行模式打开就是白屏（AC-B8 逐字失效）',
    ).toMatch(/findAppShell\s*\(/)
  })

  it('传给 findAppShell 的是全局 caches 与 APP_SHELL（形态判据）', () => {
    const body = navigationBody()
    const call = body.match(/findAppShell\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/)
    expect(call, 'navigationHandler 里找不到 findAppShell 的调用形态 —— 这条守卫会空跑').not.toBeNull()
    expect(call![1], 'findAppShell 的第一个实参不是全局 `caches` —— 它查的不是缓存').toBe('caches')
    expect(call![2], 'findAppShell 的第二个实参不是 APP_SHELL —— 它查的不是应用外壳').toBe('APP_SHELL')
  })

  it('源码里没有残留「不带 ignoreSearch 的裸 `caches.match(APP_SHELL`」（P0 的原始形态）', () => {
    expect(
      swSource,
      'sw/sw.ts 里出现了 `caches.match(APP_SHELL` —— 那正是修复前的形态：' +
        '查询串必须逐字相同才命中，而 precache 的键带 `?__WB_REVISION__=…` ⇒ 必然落空',
    ).not.toMatch(/caches\.match\s*\(\s*APP_SHELL/)
  })

  it('APP_SHELL 自身不带查询串（它是入口页，不是 precache 键）', () => {
    expect(
      swSource,
      'APP_SHELL 的定义变了 —— 它必须是不带查询串的入口页 URL，' +
        '而 precache 里的键带 `?__WB_REVISION__=…`（两者靠 ignoreSearch 对上）',
    ).toMatch(/APP_SHELL\s*=\s*new\s+URL\(\s*['"]index\.html['"]/)
  })
})

// ── G197 —— 缓存写入的三个静默失效（AC-B7、AC-C5）──────────────────────────

describe('G197 —— 缓存写入的三个静默失效（Story 1.18 `[CR]` / AC-B7、AC-C5）', () => {
  it('只缓存 200（206 Partial Content 会被 Cache API 拒收）', () => {
    expect(
      swSource,
      'sw/sw.ts 里没有 `response.status === 200` —— 判据用 `response.ok` 的话，' +
        '206（Range 请求的响应）也会被 put，而 Cache API 只接受 200 ⇒ put 必 reject ⇒ ' +
        '录音永远进不了运行时缓存（AC-B7 逐字失效）',
    ).toMatch(/response\.status\s*===\s*200/)
    expect(
      swSource,
      'sw/sw.ts 里还在用 `response.ok` 当写缓存的条件 —— `ok` 是 200..299，**包含 206**',
    ).not.toMatch(/response\.ok/)
  })

  // ⚠️📎 **`[CR]` 2026-10-20 变异验证当场加的**（M178）——
  //   上面那条判据是**文件级**的：`swSource` 里**任何一处**出现 `status === 200` 就算过。
  //   而 `sw.ts` 里有**两处** `cache.put`（`cacheFirstMedia` 与 `precachedOrNetwork`）——
  //   ⇒ **把其中一处的 200 判据删掉，另一处替它背书**，判据照样绿。
  //   这与 AC-F3 那条 OR 合并的缓存判据、判据版本表里 G138 的「一处合规替另一项背书」**同型**：
  //   **判据的粒度必须细到「被豁免的那一项」以下。**
  //   ⇒ 现在逐个 `cache.put` 判：每一处所在的**函数体自己**必须带 200 判据。
  it('⚠️ 每一处 `cache.put` **自己那个函数里**都有 200 判据（不许一处替另一处背书）', () => {
    const putIndices = [...swSource.matchAll(/cache\.put\s*\(/g)].map((m) => m.index!)
    expect(
      putIndices.length,
      'sw/sw.ts 里一处 `cache.put` 都没有 —— 判据空跑',
    ).toBeGreaterThan(0)
    for (const at of putIndices) {
      // 该 `cache.put` 所在函数的起点：往前找最后一个 `async function ` / `function `。
      const before = swSource.slice(0, at)
      const fnStart = Math.max(before.lastIndexOf('async function '), before.lastIndexOf('function '))
      expect(
        fnStart,
        '有一处 `cache.put` 找不到它所在的函数 —— 这条判据的切分方式已失效',
      ).toBeGreaterThan(-1)
      const fnBody = swSource.slice(fnStart, at)
      expect(
        fnBody,
        `sw/sw.ts 第 ${at} 个字符处的 \`cache.put\` 所在的函数体里没有 \`response.status === 200\` —— ` +
          '206 Partial Content 会被 Cache API 的 put 拒收（它只接受 200），' +
          '而媒体元素发的是 Range 请求 ⇒ 该文件永远进不了运行时缓存（AC-B7 逐字失效）。' +
          '⚠️ 另一处 `cache.put` 的 200 判据**不能**替这一处背书',
      ).toMatch(/response\.status\s*===\s*200/)
    }
  })

  it('每一处 `cache.put` 都接了 `.catch`（裸 void 会变成全局未捕获拒绝）', () => {
    const puts = swSource.match(/cache\.put\s*\(/g) ?? []
    expect(puts.length, 'sw/sw.ts 里一处 `cache.put` 都没有 —— 判据空跑').toBeGreaterThan(0)
    const caught = swSource.match(/cache\.put\s*\([^;]*?\)\s*\.catch\s*\(/g) ?? []
    // ⚠️⚠️ **第一版这里写的是 `expect(caught.length).toBe(caught.length)`** ——
    //   那是**恒真**的（R-51 第 1 类：断言允许了它要防的违规）。
    //   它是被变异验证抓出来的：把其中一处 `cache.put` 的 `.catch` 去掉，守卫照样全绿。
    expect(
      caught.length,
      `sw/sw.ts 里有 ${puts.length} 处 cache.put，只有 ${caught.length} 处接了 .catch —— ` +
        '没接的那个 reject 会变成一条全局未捕获 promise 拒绝',
    ).toBe(puts.length)
  })

  it('install 用 allSettled（一条取不到不至于让整个 SW 安装失败）', () => {
    const start = swSource.indexOf("addEventListener('install'")
    expect(start, 'sw/sw.ts 里找不到 install 监听器 —— 这条守卫会空跑').toBeGreaterThan(-1)
    const end = swSource.indexOf('\n})\n', start)
    const body = swSource.slice(start, end)
    expect(
      body,
      'install 里没有 Promise.allSettled —— 一条非 2xx 就整体 reject ⇒ SW 永不激活 ⇒ ' +
        '离线能力整个消失，而症状只在 console 里留一条错',
    ).toMatch(/Promise\.allSettled\s*\(/)
    expect(
      body,
      'install 里仍在用 Promise.all —— 一条取不到就整体失败（离线能力整个没有）',
    ).not.toMatch(/Promise\.all\s*\(/)
  })
})
