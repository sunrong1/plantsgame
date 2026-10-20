/**
 * Service Worker 与缓存分层的守卫（Story 1.18 / AC-B5、AC-B7、AC-C2、AC-C4、AC-C5、AC-G7）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 四条死路，全部是「静默」的那一种：
 *
 * ① **强制刷新**。`skipWaiting()` / `clients.claim()` / `location.reload()`
 *   任一出现，孩子正在玩的那一局就被换成新版本 —— 而那一局**没有保存点**。
 *   这是 AC-C2 的全部内容。
 *
 * ② **旧缓存不清理**（AC-C5）。录音与词图的 URL 永远稳定（按词条 id 命名），
 *   `CacheFirst` 命中缓存就永远返回旧文件 ⇒ 部署了新版本，孩子听到的
 *   仍是上一次的录音，而页面上没有任何东西看起来变了。
 *
 * ③ **全量 precache**（AC-B7）。架构决策 6 逐字：「全量预载 400 张必超冷启动 3s」。
 *   预载 45 个 mp3 + 34 张 svg 会让冷启动那条 ≤3s 的门槛当场破掉。
 *
 * ④ **内容哈希被关掉**（AC-C4）。实测当前产物**本来就带哈希**
 *   （`index-novo08y6.js` / `index-BlggZDAk.css`），所以这条不是「新造机制」
 *   而是**钉住现状** —— 否则哪天有人为了「文件名好看」加一段
 *   `rollupOptions.output` 时，会静默退化且没有任何东西变红。
 *
 * ── 为什么判据有两类 ──────────────────────────────────────────────────────
 * 「纯规则」那份（`sw/sw-rules.ts`）是**纯函数**，直接求值断言（G124）；
 * SW 入口与注册模块是**浏览器全局作用域里的代码**，只能源码级判据
 * （G123）—— 但它们不是「正则刨字符串」：先剥注释（R-52），再断言
 * **调用形态**（`skipWaiting(` 这样的调用，而不是 `skipWaiting` 这个词出现过）。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import viteConfig, { DEPLOY_BASE, assetToken, assetTokenValue, pwaOptions } from '../../vite.config'
import {
  CACHE_PREFIX,
  isMediaPathname,
  precacheCacheName,
  runtimeCacheName,
  staleCacheNames,
} from '../../sw/sw-rules'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const swSource = sourceOf('sw/sw.ts')
const registrationSource = sourceOf('src/services/sw-registration.ts')
const mainSource = sourceOf('src/main.ts')

// ── G123 —— 零强制刷新路径（AC-C2）───────────────────────────────────────

describe('G123 —— Service Worker 链路零强制刷新（Story 1.18 / AC-C2）', () => {
  /**
   * 反向自测的锚点：下面每条 `not.toMatch` 都必须**能红**。
   * ⚠️ R-53：判据写完立刻在夹具里断言 `expect(raw).toMatch(那条正则)` ——
   *   否则「正则写错了」与「代码合规」在本文件里长得一模一样。
   */
  const forbidden = [
    { label: 'skipWaiting', pattern: /skipWaiting\s*\(/ },
    { label: 'clients.claim', pattern: /clients\s*\.\s*claim\s*\(/ },
    { label: 'location.reload', pattern: /(?:window|self|globalThis)\s*\.\s*location\s*\.\s*reload\s*\(/ },
  ] as const

  it('反向自测：三条正则确实能匹配到违规形态（判据本身没写坏）', () => {
    // 探针逐字对应真实的三种违规写法。它们**永远不会**进入被测源码 ——
    // 这里只是证明正则不是恒假的。
    const probes = [
      'self.skipWaiting()',
      'self.clients.claim()',
      'window.location.reload()',
    ]
    probes.forEach((probe, index) => {
      expect(
        probe,
        `探针「${probe}」没被第 ${index + 1} 条正则匹配到 —— 判据恒假，G123 会永远绿`,
      ).toMatch(forbidden[index].pattern)
    })
  })

  it('sw.ts 里零强制刷新调用', () => {
    for (const { label, pattern } of forbidden) {
      expect(
        swSource,
        `sw/sw.ts 出现了 ${label} —— 它会在孩子**正在玩的那一局**里切到新 SW 的缓存上，` +
          '而那一局没有保存点。AC-C2 要求的是「新版本，下次启动生效」',
      ).not.toMatch(pattern)
    }
  })

  it('注册模块里零强制刷新调用，也没有 updateServiceWorker 这条路径', () => {
    for (const { label, pattern } of forbidden) {
      expect(registrationSource, `src/services/sw-registration.ts 出现了 ${label}（AC-C2）`).not.toMatch(pattern)
    }
    // ⚠️ 这一条比上面三条更根本：`updateServiceWorker()` 是 `vite-plugin-pwa`
    //   虚拟模块提供的函数。它的**存在**本身就是「可在游戏中途强制刷新」的路径，
    //   而本仓库刻意手写注册正是为了让它压根不存在。
    expect(
      registrationSource,
      '注册模块引用了 updateServiceWorker —— 那是一条「在孩子正在玩的一局里强制刷新」的路径，' +
        'AC-C2 逐字禁止。手写注册的目的就是让它不存在',
    ).not.toMatch(/updateServiceWorker/)
  })

  it('注册类型是 prompt，不是 autoUpdate', () => {
    // ⚠️ 这是**等值**判据。写成 `not.toBe('autoUpdate')` 的话，
    //   改成 `'autoUpdate2'` 或 `undefined` 都会静默通过。
    expect(
      pwaOptions.registerType,
      'registerType 必须是 prompt —— autoUpdate 会 skipWaiting + clientsClaim + 自动刷新，' +
        '直接违反 AC-C2「不得在游戏进行中强制刷新」',
    ).toBe('prompt')
  })
})

// ── G124 —— 缓存名带 build token + 陈旧缓存清理（AC-C5）────────────────────

describe('G124 —— 旧缓存清理与缓存名版本化（Story 1.18 / AC-C5）', () => {
  it('两个缓存名都带 token，且 token 一变名字就变', () => {
    // 🔥 这就是 AC-C5 的本体：录音 URL 不带哈希，**缓存名是唯一的版本边界**。
    //   若名字与 token 无关，下面那条「会变」的断言就是恒假的。
    expect(
      precacheCacheName('aaa111') === precacheCacheName('bbb222'),
      'precache 缓存名与 token 无关 —— 换了 token 还会命中旧的应用外壳，' +
        '可能出现「新版 JS 配旧版 HTML」',
    ).toBe(false)
    expect(
      runtimeCacheName('aaa111') === runtimeCacheName('bbb222'),
      'runtime 缓存名与 token 无关 —— 换了 token 还会返回上一次的录音，而页面上没有任何东西变了',
    ).toBe(false)
  })

  it('缓存名带本应用前缀（staleCacheNames 只删得动自己的缓存）', () => {
    for (const name of [precacheCacheName('t'), runtimeCacheName('t')]) {
      expect(
        name.startsWith(CACHE_PREFIX),
        `缓存名 ${name} 不带前缀 ${CACHE_PREFIX} —— 没有前缀时 activate 会把用户` +
          '同源下其它应用 / 扩展 / 别的 PWA 的离线数据一起删掉',
      ).toBe(true)
    }
  })

  it('陈旧缓存：上一代的两个缓存被删，本代保留', () => {
    const keep = [precacheCacheName('new'), runtimeCacheName('new')]
    const all = [
      precacheCacheName('old'),
      runtimeCacheName('old'),
      precacheCacheName('new'),
      runtimeCacheName('new'),
    ]
    expect(
      staleCacheNames(all, keep).sort(),
      '换代时必须删掉上一代的 precache 与 runtime 缓存 —— ' +
        'runtime 那一份里存着 URL 永远稳定的录音/词图，删不掉就永远是旧文件',
    ).toEqual([precacheCacheName('old'), runtimeCacheName('old')].sort())
  })

  it('陈旧缓存：**别的应用**的缓存一个都不动', () => {
    // ⚠️ 这条是反向护栏，不是顺带覆盖：`caches.keys()` 返回的是**同源下所有**缓存。
    const others = ['workbox-precache-v2-https://sunrong.site/plantsgame/', 'my-other-pwa-v3', 'some-extension-cache']
    expect(
      staleCacheNames(others, [precacheCacheName('new'), runtimeCacheName('new')]),
      '删缓存时误伤了同源下其它应用的离线数据 —— 这是不可逆的用户数据损失',
    ).toEqual([])
  })

  it('媒体判定覆盖录音与词图，且不误伤外壳', () => {
    for (const path of ['/plantsgame/assets/audio/voice/u1-dog.mp3', '/plantsgame/assets/words/unit-01/u1-cat.svg']) {
      expect(isMediaPathname(path), `${path} 没被判定为媒体 —— 它不会被写进运行时缓存，也就不会被版本化清理`).toBe(true)
    }
    for (const path of ['/plantsgame/index.html', '/plantsgame/assets/index-abc123.js']) {
      expect(isMediaPathname(path), `${path} 被误判成媒体 —— 外壳进了运行时缓存就等于没有版本边界`).toBe(false)
    }
  })
})

// ── G159 —— activate 真的走 staleCacheNames（AC-C5 的**接线**；变异 M150）───

describe('G159 —— activate 真的用 staleCacheNames 过滤（Story 1.18 / AC-C5、AC-G7、变异 M150）', () => {
  // ⚠️ **这一整条也是变异验证逼出来的**（M150）。
  //   变异：`names.filter(() => false).map((name) => caches.delete(name))`
  //   —— 删掉 `staleCacheNames(...)` 换成恒假过滤器。
  //   `pwa-sw-guard.test.ts` **22 条全绿**，因为：
  //     · `staleCacheNames` 的**纯函数**行为被 G124 逐条测过（它是对的）；
  //     · 而「`sw.ts` 的 activate 有没有真的调它」**无人断言**。
  //   ⇒ 这正是 AC-G7 逐字警告的那种漏网：「判据只钉在纯函数上时，
  //     **跨模块传错对象是本仓库最贵的一种漏网**」。
  //   ⚠️ 后果：`caches.delete(` 这串字面量**还在源码里** ⇒
  //   任何「grep 一下 `caches.delete` 在不在」的判据都抓不到它。
  //   ⇒ 判据必须落在**调用点接的是什么**上，不是落在 API 名上。

  /** `activate` 监听器那个函数体的源码。 */
  function activateBody(): string {
    const start = swSource.indexOf("addEventListener('activate'")
    expect(start, 'sw/sw.ts 里找不到 activate 监听器 —— AC-C5 的清理逻辑不在了').toBeGreaterThan(-1)
    const end = swSource.indexOf('\n})\n', start)
    expect(end, 'activate 监听器的闭合括号形态变了 —— 这条守卫会空跑').toBeGreaterThan(start)
    return swSource.slice(start, end)
  }

  it('activate 处理器里出现 `staleCacheNames(`（旧缓存是**按规则**挑出来的，不是全删也不是不删）', () => {
    expect(
      activateBody(),
      'activate 里没有调 staleCacheNames —— 旧缓存要么全留（换不掉）要么全删（把用户别的应用的缓存也删了）。' +
        '它调不调这个纯函数，是「AC-C5 实现到位」的**唯一**区别',
    ).toMatch(/staleCacheNames\s*\(/)
  })

  it('传给 `staleCacheNames` 的正是 `caches.keys()` 那个结果（不是字面量、不是别处的数组）', () => {
    const body = activateBody()
    // ⚠️ **形态判据要跟着真实代码的写法走**。本仓库的写法是**分两步**：
    //   `const names = await caches.keys()`  然后  `staleCacheNames(names, …)`。
    //   ⚠️ 我第一版写的是「第一个实参必须字面是 `caches.keys()`」——
    //   那条对**正确代码**也是红的，而 R-53 的自检探针立刻抓到了它
    //   （记忆：`守卫断言允许了它要防的违规` 的同型反面 ——
    //     **判据把自己要守的正确形态判红了**）。
    //   ⇒ 判据改成「实参 === 从 caches.keys() 赋值来的那个变量」。
    const assigned = body.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+caches\.keys\s*\(\s*\)/)
    expect(assigned, 'activate 里没有 `const <名> = await caches.keys()` —— 它无从知道运行时有哪些缓存').not.toBeNull()
    const name = assigned![1]!
    const call = body.slice(body.indexOf('staleCacheNames('))
    expect(
      call.slice(0, 60),
      `staleCacheNames 的第一个实参不是 \`${name}\`（那个 \`${name}\` 正是 caches.keys() 的结果）—— ` +
        '它被喂了别的集合，于是 activate 会去删一堆根本不在缓存里的名字，而真正该删的一个没删',
    ).toMatch(new RegExp(`staleCacheNames\\(\\s*${name}\\s*,`))
  })

  it('⚠️ R-53：上面那条形态判据先在**正确形态**与 **M150 形态**上双向自证', () => {
    // 正向：真实代码的写法必须匹配（否则判据把正确实现判红 —— 那也是失效）。
    const good = 'const names = await caches.keys()\nawait Promise.all(staleCacheNames(names, [PRECACHE, RUNTIME]).map(...))'
    const assigned = good.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+caches\.keys\s*\(\s*\)/)
    expect(assigned, 'R-53：正向探针里连变量都提不出来').not.toBeNull()
    expect(good, 'R-53：形态判据不认「本仓库的正确写法」').toMatch(
      new RegExp(`staleCacheNames\\(\\s*${assigned![1]!}\\s*,`),
    )
    // 反向：M150 的形态里**压根不该**出现 `staleCacheNames(`。
    // ⚠️ 探针里必须用 `indexOf(...) < 0` 判，**不能**写 `slice(indexOf(...))` ——
    //   `indexOf` 返回 -1 时 `slice(-1)` 给的是**最后一个字符**，一个非空串，
    //   于是这条自检恒红，而看上去像「判据抓到了变异」。
    const mutated = 'const names = await caches.keys()\nawait Promise.all(names.filter(() => false).map(n => caches.delete(n)))'
    expect(
      mutated.indexOf('staleCacheNames('),
      'M150 的变异形态里居然还有 staleCacheNames( —— 那它就不是 M150 那个变异了',
    ).toBeLessThan(0)
    expect(
      mutated,
      'R-53：M150 形态里 `caches.delete(` 仍在而 `staleCacheNames(` 不在 —— ' +
        '这正是原判据漏掉它的原因，逐字钉住',
    ).toMatch(/caches\.delete\s*\(/)
  })

  it('删除的返回值仍被 await（不 await 的话 activate 可能在删完之前就结束）', () => {
    // ⚠️ 这是**另一条**独立的失效形态：调用对了但不 await ⇒
    //   `waitUntil` 可能在 `caches.delete` 还没落盘时就结束 activate，
    //   而旧缓存**留在原地** ⇒ AC-C5 静默失效，而所有判据都是绿的。
    expect(
      activateBody(),
      'activate 里没有 await 那些 Promise —— waitUntil 可能在清理落盘前就结束，' +
        '而旧缓存留在原地（AC-C5 静默失效）',
    ).toMatch(/await\s+Promise\.all\s*\(/)
  })

  it('反向自测：M150 那个变异形态（恒假过滤器）会被前两条抓到', () => {
    // R-51：把 M150 的真实变异原样抄进探针 —— 它必须**既**不含 `staleCacheNames(`，
    //   **又**不匹配「第一个实参是 caches.keys()」的形态判据。
    const mutated = 'const names = await caches.keys()\nawait Promise.all(names.filter(() => false).map(n => caches.delete(n)))'
    expect(mutated, 'M150 的变异形态不该出现 staleCacheNames(').not.toMatch(/staleCacheNames\s*\(/)
    expect(mutated, 'M150 的变异形态不该匹配「实参是 caches.keys()」').not.toMatch(
      /staleCacheNames\(\s*(await\s+)?caches\.keys\(\)/,
    )
    // ⚠️ **而 `caches.delete(` 仍然在里面** —— 这正是原判据漏掉它的原因，逐字记下。
    expect(
      mutated,
      'M150 的变异里 `caches.delete(` 仍在 —— 若守卫 grep 的是 API 名而不是调用点接了什么，' +
        '它就会放过这个变异（本条测试就是为记录这件事而存在）',
    ).toMatch(/caches\.delete\s*\(/)
  })
})

// ── G125 —— precache 只收外壳，媒体走 runtime（AC-B7）─────────────────────

describe('G125 —— 缓存分层：precache 不含媒体（Story 1.18 / AC-B7）', () => {
  it('precache 的 glob 模式里没有任何媒体后缀', () => {
    const patterns = pwaOptions.injectManifest?.globPatterns ?? []
    expect(
      patterns.length,
      '没有声明 globPatterns —— 插件的默认值会随版本变化，那时「预载了 400 张」这件事不会有人发现',
    ).toBeGreaterThan(0)
    for (const pattern of patterns) {
      expect(
        pattern,
        `precache 的 glob「${pattern}」收了媒体 —— 架构决策 6 逐字：「全量预载 400 张必超冷启动 3s」`,
      ).not.toMatch(/mp3|svg|png|jpe?g|webp|gif/)
    }
  })

  it('三个媒体目录逐个被显式排除', () => {
    const ignores = pwaOptions.injectManifest?.globIgnores ?? []
    for (const dir of ['**/assets/audio/**', '**/assets/words/**', '**/assets/towers/**']) {
      expect(
        ignores,
        `globIgnores 里没有 ${dir} —— public/ 下的文件会被 glob 扫到，` +
          '不显式排除的话 45 个 mp3 + 34 张 svg 会被一次性预载',
      ).toContain(dir)
    }
  })
})

// ── G126 —— 构建产物带内容哈希（AC-C4）────────────────────────────────────

describe('G126 —— 构建产物带内容哈希（Story 1.18 / AC-C4）', () => {
  it('没有关掉哈希：未自定义 output 文件名，或自定义时仍带哈希占位符', () => {
    // ⚠️ 实测当前产物**本来就带哈希**（index-novo08y6.js / index-BlggZDAk.css），
    //   所以这条 AC 不是「新造机制」而是**钉住现状** ——
    //   否则哪天有人为了「文件名好看」加一段 rollupOptions.output 时会静默退化。
    // ⚠️ Vite 的默认模板是 `assets/[name]-[hash].js`；这里不写任何 output 配置即等价。
    const output = viteConfig.build?.rollupOptions?.output
    if (output === undefined) return
    const entries = Array.isArray(output) ? output : [output]
    const fileNames = entries
      .map((entry) => entry.entryFileNames ?? entry.chunkFileNames ?? entry.assetFileNames)
      .filter((name): name is string => typeof name === 'string')
    for (const name of fileNames) {
      expect(
        name,
        `产物文件名模板「${name}」里没有哈希占位符 —— 关掉哈希后，同名文件在 CDN/` +
          'HTTP 缓存上永远是旧版本，而用户看不到任何更新',
      ).toMatch(/\[hash/)
    }
  })

  it('sw.js 是经典脚本（iife），不是 module 型 SW', () => {
    // ⚠️ module 型 Service Worker 在 Safari / Firefox 上**直接不被支持**
    //   （Chromium 系才支持）。实测 vite-plugin-pwa 的 injectManifest
    //   默认 rollupFormat 是 'es' ⇒ 不显式写 iife 就是 module 型。
    expect(
      pwaOptions.injectManifest?.rollupFormat,
      "injectManifest.rollupFormat 必须是 'iife' —— 'es' 产出的是 module 型 SW，Safari 与 Firefox 不支持",
    ).toBe('iife')
  })
})

// ── G127 —— 注册调用点（AC-G7：跨模块接线必须单独守卫）─────────────────────

describe('G127 —— SW 注册的调用点（Story 1.18 / AC-G7）', () => {
  it('registerServiceWorker() 由 main.ts 调用，且在 mount() 之后', () => {
    expect(
      mainSource,
      'src/main.ts 没有调用 registerServiceWorker() —— SW 写了但没人注册，离线能力整个不生效，' +
        '而构建、类型、测试全绿',
    ).toMatch(/registerServiceWorker\(\)/)

    const mountAt = mainSource.indexOf('.mount(')
    const registerAt = mainSource.indexOf('registerServiceWorker()')
    expect(
      mountAt >= 0 && registerAt > mountAt,
      'registerServiceWorker() 排在 mount() 之前 —— 注册是一次网络往返 + 一次 SW 脚本下载，' +
        '挂在挂载前面就是一次冷启动停顿',
    ).toBe(true)
  })

  it('注册目标与作用域都接 BASE_URL，不是站点根', () => {
    // ⚠️ SCOPE 越界的症状是 `SecurityError`，且**只在真机上出现**（本地 dev
    //   没有 base 前缀），所以必须钉住。
    const baseCount = (registrationSource.match(/import\.meta\.env\.BASE_URL/g) ?? []).length
    expect(
      baseCount,
      `src/services/sw-registration.ts 里 import.meta.env.BASE_URL 出现了 ${baseCount} 次，` +
        '至少要有两处（注册 URL 与 scope）—— 漏掉 scope 时 SW 注册会抛 SecurityError',
    ).toBeGreaterThanOrEqual(2)
    expect(
      registrationSource,
      '注册目标写成站点根而不是 BASE_URL —— 部署到 /plantsgame/ 下时 SW 文件根本不在那儿',
    ).not.toMatch(/register\(\s*['"`]\//)
  })

  it('注册失败路径零 throw、零 view 切换、零面向孩子的错误文案（裁决 7）', () => {
    const code = stripComments(readFileSync(join(root, 'src/services/sw-registration.ts'), 'utf8'))
    expect(
      code,
      '注册模块里出现了 `throw` —— SW 注册失败归运行时层，逐字要「记录并静默降级，绝不阻断回合」。' +
        '一个 throw 就能把整个应用启动打断，而症状是白屏',
    ).not.toMatch(/throw\s/)
    expect(
      code,
      '注册模块里出现了 view 切换 —— SW 失败不得改变用户看到的是哪个视图',
    ).not.toMatch(/\bview\b\s*=/)
    // NFR13：孩子面前永不出现技术错误。
    expect(
      code,
      '注册模块里出现了 alert / confirm —— 孩子的平板上弹一个对话框就是死局',
    ).not.toMatch(/\b(alert|confirm)\s*\(/)
  })

  it('降级路径都记了 [sw] 前缀的 WARN（静默 ≠ 不可见）', () => {
    const warnCount = (registrationSource.match(/console\.warn\(\s*'\[sw\]/g) ?? []).length
    expect(
      warnCount,
      `[sw] 前缀的 console.warn 只出现 ${warnCount} 次 —— 静默降级必须留痕，` +
        '否则真机上的失败完全没有归因线索',
    ).toBeGreaterThanOrEqual(3)
  })
})

// ── G128 —— build token 真的随媒体内容变化（AC-C5 的自动化侧）─────────────

describe('G128 —— build token 随媒体内容变化（Story 1.18 / AC-C5）', () => {
  /**
   * 🔥 这条 AC 在自动化侧唯一能守的东西是**这个函数本身的行为**。
   *
   * 产物 `dist/sw.js` 里的 token 只有在 `npm run build` 之后才存在，
   * 而 `npm run test` 不依赖 build ⇒ 「产物里是不是真哈希」是
   * `scripts/verify-deploy.ts`（Task 6）的活，不是测试的活。
   * 这里守的是**算法对不对**：内容变 → token 变；内容不变 → token 不变。
   *
   * ⚠️ 三个反向用例都是真实踩过的坑，不是凑数：
   *   · 目录遍历**不排序** ⇒ 同一份内容两次构建算出两个 token ⇒ 缓存永远命中不了；
   *   · 只哈希**字节**不哈希路径 ⇒ 改名换 id 后算不出变化；
   *   · 哈希**代码**不哈希媒体 ⇒ Story 2.x 换词图时 token 不变 ⇒ AC-C5 的清理不触发。
   */
  const dir = mkdtempSync(join(tmpdir(), 'pwa-token-'))

  it('内容变则 token 变', () => {
    writeFileSync(join(dir, 'a.mp3'), 'v1')
    const before = assetToken(dir)
    writeFileSync(join(dir, 'a.mp3'), 'v2')
    const after = assetToken(dir)
    expect(
      before === after,
      '换了录音内容而 token 不变 —— 运行时缓存名不变 ⇒ CacheFirst 永远返回旧录音，' +
        '部署了新版本孩子听到的还是上一次的（AC-C5 的整条死路）',
    ).toBe(false)
  })

  it('内容不变则 token 不变（排序稳定性）', () => {
    writeFileSync(join(dir, 'b.svg'), '<svg/>')
    writeFileSync(join(dir, 'c.svg'), '<svg/>')
    const first = assetToken(dir)
    const second = assetToken(dir)
    expect(
      first === second,
      '同一份内容两次算出不同 token —— 目录遍历顺序没排序时就会这样，' +
        '后果是每次构建都「换代」，缓存永远命中不了、离线能力形同虚设',
    ).toBe(true)
  })

  it('改名（字节相同）也算变化 —— 路径进哈希', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'pwa-token-'))
    writeFileSync(join(d2, 'u1-dog.svg'), '<svg/>')
    const before = assetToken(d2)
    rmSync(join(d2, 'u1-dog.svg'))
    writeFileSync(join(d2, 'u1-cat.svg'), '<svg/>')
    const after = assetToken(d2)
    expect(
      before === after,
      '只改文件名不改内容时 token 不变 —— 而 URL 变了、正好是缓存该换的那一次',
    ).toBe(false)
  })

  it('导出值就是 public/ 的真实 token（形状与来源都对得上）', () => {
    expect(
      assetTokenValue,
      '导出的 build token 不是 12 位十六进制 —— 它由 public/** 的内容哈希截断而来',
    ).toMatch(/^[0-9a-f]{12}$/)
    // ⚠️📎 **`[CR]` 2026-10-20 按 R-57 换范围**（**判据的意图一个字没变**）：
    //   原判据比的是 `assetToken('public/assets')`，前提是「运行时缓存里只有
    //   `public/assets` 下的媒体」。
    //   ⚠️ **那个前提不成立**：`sw/sw-rules.ts` 的 `isMediaPathname` 逐字把
    //   `.png` 与 `.svg` 都算作媒体 ⇒ `public/icons/*.png` 与 `public/favicon.svg`
    //   **也在运行时缓存里** ⇒ 换一批图标时 token 必须跟着变，
    //   否则旧图标长期驻留、主屏图标永远是旧的。
    //   ⇒ 范围扩到 `public/` 全量，判据跟着改成比同一个范围。
    //   ⚠️ **「导出值 == 按同一范围现算的值」这条要求本身没动** ——
    //   它防的是「SW 拿到的 token 与构建时算的不是同一个」，
    //   那会让它一激活就把「自己的」缓存当陈旧删掉（AC-C5 反过来变成事故）。
    expect(
      assetTokenValue === assetToken('public'),
      '导出的 token 与按 public 现算的不一致 —— SW 拿到的会是另一代缓存名，' +
        '于是它一激活就把「自己的」缓存当陈旧删掉（AC-C5 反过来变成事故）',
    ).toBe(true)
  })

  it('⚠️ 哈希范围覆盖了图标（否则换图标时 token 不变 ⇒ 旧图标长期驻留）', () => {
    // ⚠️ **行为判据**（不是源码扫描）：造两棵只差一个图标的树，
    //   token 必须不同 —— 这正是「图标换了要换代」这件事本身。
    const d1 = mkdtempSync(join(tmpdir(), 'pwa-token-icons-a-'))
    writeFileSync(join(d1, 'word.svg'), '<svg>词</svg>')
    writeFileSync(join(d1, 'icon.png'), 'old-icon')
    const before = assetToken(d1)
    writeFileSync(join(d1, 'icon.png'), 'new-icon')
    const after = assetToken(d1)
    expect(
      before === after,
      '只换图标时 token 不变 —— 图标是媒体（`isMediaPathname` 收 `.png`）、' +
        '进运行时缓存且 URL 不带哈希 ⇒ 旧图标会长期驻留，主屏图标永远是旧的（AC-C5）',
    ).toBe(false)
  })

  it('⚠️ 目录不存在时不抛（否则新克隆 / CI 里 `vite.config.ts` 在模块加载期就崩）', () => {
    // ⚠️ `[CR]` 2026-10-20 抓到的那条：原实现直接 `readdirSync(dir)`，
    //   而 `assetTokenValue` 是**模块顶层求值** ⇒ 目录不存在时
    //   **dev server 与 vitest 都起不来**，报错还指向 `readdirSync`（离源头很远）。
    const missing = join(tmpdir(), `pwa-token-missing-${process.pid}-${Date.now()}`)
    expect(() => assetToken(missing), '目录不存在时 assetToken 抛了 —— 新克隆 / 资产后生成的环境里构建直接起不来').not.toThrow()
    expect(
      assetToken(missing),
      '目录不存在时返回的不是 12 位十六进制 —— SW 拿到的缓存名形状变了，' +
        '而 `sw.ts` 的 `BUILD_TOKEN` 回落是字面量 `dev`（两者不是同一套口径）',
    ).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('G129 —— DEPLOY_BASE 与 base 同源，且注册范围与之匹配（AC-B2、AC-B6）', () => {
  it('vite.config 的 base 逐字等于 DEPLOY_BASE', () => {
    expect(
      viteConfig.base,
      'base 与 DEPLOY_BASE 不一致 —— 改了一处忘了另一处时构建全绿、部署后白屏或 SecurityError',
    ).toBe(DEPLOY_BASE)
  })
})
