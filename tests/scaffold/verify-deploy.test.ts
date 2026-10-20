/**
 * 上线前自检脚本的守卫（Story 1.18 / AC-F3、AC-G7；变异 M163）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * `scripts/verify-deploy.ts` 是**上线前唯一一道**拦住坏产物的闸。它有三个死路，
 * 且**没有一个会在 `npm run build` 失败时暴露**：
 *
 * ① **它 import 了 `src/`**（M163 / R-61）。那样它就只能在开发机上跑 ——
 *   而 `src/` 里要么有 `import.meta.env`（要 Vite 求值），要么是 `.vue`（tsx 跑不了）。
 *   上线前那台机器上没有开发服务器 ⇒ **自检脚本恰好在真正需要它的地方崩**。
 *   判据：源码级零 `src/` 路径 + **行为级**「换个空目录照样返回报告」。
 *
 * ② **CLI 门控写错 ⇒ 守卫 import 它就把整个测试跑炸**。判据反过来测它：
 *   把 `verifyDeploy` 换成那份**烂产物**的 fs ⇒ 必须**返回报告**，而不是抛。
 *
 * ③ **判据恒绿**：一份「空 fs」如果也能「全绿」，那这套自检在真实部署里等于没有。
 *   判据反过来测它：空 fs ⇒ 必须**红**。
 *
 * ── 为什么用内存 fs 而不是真建 `dist/` ────────────────────────────────────
 *   真建目录的夹具会**同时**验证「产物对不对」——那是 `npm run build` 里
 *   `postbuild` 干的活，而且它会随内容资产批次变红。这里要守的是**脚本的判据**，
 *   所以夹具必须是**人造的**，红绿才由本文件说了算。
 *   真实产物那份核对落在 `npm run verify:deploy`（`postbuild` 自动跑）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { verifyDeploy } from '../../scripts/verify-deploy'
import type { DeployFs } from '../../scripts/verify-deploy'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const scriptSource = sourceOf('scripts/verify-deploy.ts')

/**
 * 「好产物」形态的 `sw.js` —— 所有夹具**共用这一份**，探针只在它**后面追加**违规片段。
 *
 * ⚠️📎 **`[CR]` 2026-10-20 按真实产物重写**：workbox-build 做文本替换时
 *   把 `self.__WB_MANIFEST` **换成了字面量数组** ——
 *   实测真实产物 `dist/sw.js` 里 `__WB_MANIFEST` 出现 **0 次**，
 *   清单长这样：
 *   `[{"revision":"fe46491d…","url":"index.html"},{"revision":null,"url":"assets/index-xxx.js"},…]`
 *   ⇒ 原夹具（写的是 `self.__WB_MANIFEST`）**与真实产物不是同一种形态**，
 *   而原判据 `/\bprecache\b|\.precacheAndRoute|__WB_MANIFEST/` 在真实产物上
 *   **只靠 `\bprecache\b` 匹配缓存名的模板字符串**才绿 ⇒ **恒绿**。
 *   ⇒ 夹具现在照着**真实产物的注入形态**写，判据也改成**解析注入的清单**。
 *   ⇒ **夹具必须由判据的真实形态反推，而不是凭印象写一份像 SW 的字符串。**
 */
const SW_GOOD =
  'const t=__PWA_ASSET_TOKEN__;self.addEventListener("activate",()=>{' +
  'caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith("plantsgame-")).map(n=>caches.delete(n))))});' +
  // ⚠️📎 `[CR]` 2026-10-20：**照抄真实产物里那行缓存名模板**（实测 `dist/sw.js` 逐字：
  //   ``function t(t){return`${e}precache-${t}`}``）——
  //   它是旧判据 `/\bprecache\b/` 之所以**恒绿**的唯一原因：
  //   那个 `precache` 是**缓存名**，不是 precache **清单**。
  //   ⇒ 少了它，「旧判据会绿」这句话就无从证明，G199 第一条会空跑。
  'function c(t){return`plantsgame-precache-${t}`}' +
  'self.addEventListener("install",()=>{const m=[' +
  '{"revision":"fe46491d9ddb11cd22c1404ceabea996","url":"index.html"},' +
  '{"revision":null,"url":"assets/index-CCa7u-h3.js"},' +
  '{"revision":null,"url":"assets/index-BkSWzeM0.css"}' +
  '];});' +
  'self.addEventListener("fetch",()=>{});'

/**
 * 好产物的文件表 —— `goodFs()` 与 `brokenFs()` **共用同一份**。
 *
 * ⚠️ 初版两份各写一遍，于是探针的 `sw.js` 与好产物的 `sw.js` 形态不一致
 *   （探针那份少了 `caches.delete`），G156 的「反向自测」遂建立在错的基础上。
 *   共用一份 + 探针**只改自己那一处**，是这类「反向自测」唯一可靠的组织方式。
 */
const BASE_FILES: Record<string, string> = {
  'index.html':
    '<html><head><link rel="manifest" href="/plantsgame/manifest.webmanifest">' +
    '</head><body><script type="module" src="/plantsgame/assets/index-CCa7u-h3.js"></script>' +
    '<link rel="stylesheet" href="/plantsgame/assets/index-BkSWzeM0.css"></body></html>',
  'manifest.webmanifest': JSON.stringify({
    name: 'PVZ Pixel 单词塔防',
    short_name: 'PVZ Pixel',
    // ⚠️📎 `[CR]` 2026-10-20：AC-B1 逐字列的字段集**一个都不能少** ——
    //   `description` / `orientation` 原来不在夹具里（因为判据也不查它们）。
    description: '用英语单词挡住僵尸的回合制塔防',
    lang: 'zh-CN',
    start_url: '/plantsgame/',
    scope: '/plantsgame/',
    id: '/plantsgame/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#1f2d11',
    background_color: '#7cb342',
    icons: [
      { src: '/plantsgame/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/plantsgame/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/plantsgame/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/plantsgame/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }),
  'sw.js': SW_GOOD,
  'assets/index-CCa7u-h3.js': 'export const a=1',
  'assets/index-BkSWzeM0.css': '.a{color:red}',
  'icons/icon-192.png': 'x',
  'icons/icon-512.png': 'x',
  'icons/maskable-192.png': 'x',
  'icons/maskable-512.png': 'x',
  'assets/words/unit-01/u1-dog.svg': '<svg/>',
  'assets/towers/direct.svg': '<svg/>',
  'assets/towers/slow.svg': '<svg/>',
  'assets/towers/aoe.svg': '<svg/>',
  'assets/zombies/zombie.svg': '<svg/>',
  'assets/audio/sfx/answer-correct.mp3': 'ID3',
  'assets/audio/voice/u1-dog.mp3': 'ID3',
  'assets/audio/music/battle.mp3': 'ID3',
}

/** 把一张文件表包成一个 `DeployFs`。 */
function fsOf(files: Record<string, string>): DeployFs {
  const sizes: Record<string, number> = {}
  for (const [path, content] of Object.entries(files)) sizes[path] = content.length
  return {
    read: (p) => files[p] ?? null,
    exists: (p) => p in files,
    listDir: (dir) => {
      const prefix = `${dir}/`
      return Object.keys(files)
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length))
    },
    sizeOf: (p) => (p in sizes ? (sizes[p] as number) : -1),
  }
}

/** 一份**完整可用**的产物内存镜像 —— 「全绿」那一侧的夹具。 */
function goodFs(): DeployFs {
  return fsOf({ ...BASE_FILES })
}

/** 在好产物上按需打一个洞 —— 「只坏这一处」的反向探针共用它。 */
function brokenFs(mutate: (files: Record<string, string>) => void): DeployFs {
  const files: Record<string, string> = { ...BASE_FILES }
  mutate(files)
  return fsOf(files)
}

/** 按 id 取一条检查 —— 拿不到就当场报出「判据消失」，不静默跳过。 */
function checkOf(report: { checks: readonly { id: string; ok: boolean; why: string }[] }, id: string): {
  ok: boolean
  why: string
} {
  const found = report.checks.find((check) => check.id === id)
  expect(found, `产物自检里没有 \`${id}\` 这一项 —— 判据被改名或删掉了，这条守卫会空跑`).toBeDefined()
  return found!
}

// ── G155 —— 自检脚本零 `src/` 依赖，且换个空目录照样返回报告（AC-F3 / M163）──

describe('G155 —— 上线前自检不依赖 `src/`（Story 1.18 / AC-F3、变异 M163）', () => {
  it('源码里零 `src/` 路径引用（判据只来自 `dist/` 的字面内容）', () => {
    // ⚠️ 正则按**完整路径**写死 `src/`：只写 `src` 会命中 `manifest` 之类无关词。
    expect(
      scriptSource,
      'verify-deploy.ts 里出现了 `src/` —— 它就得在装了依赖、跑得出 Vite 环境的机器上才有意义，' +
        '而上线前那台机器上直接崩（自检脚本在真正需要它的地方不可用）',
    ).not.toMatch(/['"`][^'"`]*\bsrc\//)
  })

  it('零 `import.meta.env`（判据不得从构建期常量取值 —— 那在 dist 上算不出来）', () => {
    expect(
      scriptSource,
      'verify-deploy.ts 里出现 `import.meta.env` —— tsx 直跑时它是 undefined，' +
        '于是判据会变成「前缀是不是 undefined」，恒假或恒真，两种都指向不了原因',
    ).not.toMatch(/import\.meta\.env/)
  })

  it('行为级：对着**空目录**它返回报告而不是抛错（换台机器也跑得起来）', () => {
    const empty: DeployFs = {
      read: () => null,
      exists: () => false,
      listDir: () => [],
      sizeOf: () => -1,
    }
    let report: ReturnType<typeof verifyDeploy> | null = null
    expect(() => {
      report = verifyDeploy(empty)
    }, '对着空目录它就抛了 —— 上线前的自检不该自己先崩').not.toThrow()
    expect(report!.checks.length, '空目录下它一项都没查').toBeGreaterThan(0)
  })

  it('⚠️ 它的 CLI 入口在「被 import」时**不会**自己跑 `main()`（否则守卫 import 它就炸）', () => {
    // 判据盯的是**结构**（入口判定用 argv 文件名）而不是「跑一遍看会不会输出」——
    // 后者要把 console 打桩，代价大且仍然只能证明「这一次没跑」。
    expect(
      scriptSource,
      '入口判定不是「argv[1] 的文件名」⇒ 这个文件被任何东西 import 时都会执行 main()，' +
        '守卫测试在 import 它的那一刻就会打一屏日志并设置退出码',
    ).toMatch(/process\.argv\[1\]\?\.endsWith\(/)
  })

  it('反向自测：空产物必须**红**（判据恒绿 ⇒ 这套自检在真实部署里等于没有）', () => {
    const empty: DeployFs = { read: () => null, exists: () => false, listDir: () => [], sizeOf: () => -1 }
    const report = verifyDeploy(empty)

    expect(report.ok, '空产物居然全绿 —— 那这道闸门形同虚设').toBe(false)
    for (const id of ['index-html-exists', 'manifest-exists', 'sw-exists', 'asset-zombie.svg']) {
      expect(
        checkOf(report, id).ok,
        `空产物下 \`${id}\` 竟然判绿 —— 这一条恒绿，说明判据写成了「没读到就不算问题」`,
      ).toBe(false)
    }
  })

  it('反向自测：好产物**全绿**（否则「红」也没有信息量）', () => {
    const report = verifyDeploy(goodFs())
    const failed = report.checks.filter((check) => !check.ok)
    expect(
      failed.map((check) => `${check.id}：${check.why}`),
      '这份内存里的好产物被判红 —— 判据要么过严，要么夹具与判据脱节。' +
        '（夹具是照着判据写的，所以这里红几乎总是判据写错了）',
    ).toEqual([])
  })
})

// ── G156 —— 产物级 SW 边界判据真能抓到违规（M146 的变异落点）─────────────────

describe('G156 —— 产物级 SW 判据抓得住强制刷新（Story 1.18 / AC-C2、变异 M146）', () => {
  it('产物 `sw.js` 里出现 `clients.claim()` ⇒ 红', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = `${SW_GOOD}self.clients.claim();`
    }))
    expect(checkOf(report, 'sw-no-clients-claim').ok, 'SW 里加了 clients.claim() 而判据没红').toBe(false)
    expect(
      checkOf(report, 'sw-no-clients-claim').why,
      '红是红了，但原因要说清是「会抢正在玩的那一局」，否则排查的人会去看别处',
    ).toContain('AC-C2')
  })

  it('产物 `sw.js` 里出现 `skipWaiting()` ⇒ 红', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = `${SW_GOOD}self.addEventListener("install",()=>{self.skipWaiting()});`
    }))
    expect(checkOf(report, 'sw-no-force-reload').ok, 'SW 里加了 skipWaiting() 而判据没红').toBe(false)
  })

  it('产物 `sw.js` 里删掉 `caches.delete(...)` ⇒ 只有删除那条红，枚举那条仍绿（AC-C5）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      // ⚠️ 只删清理那一句，precache、枚举与 fetch 处理器都留着 ——
      //   整段重写会让「红」来自别的原因，而 M146 的变异只改**判据盯的那一处**
      //   （1.17 的教训：「变异把 API 面改坏 ⇒ 全红不等于判据命中」）。
      files['sw.js'] = SW_GOOD.replace(/caches\.delete\(n\)/, 'void 0')
      expect(files['sw.js'], '变异把 precache 那半也删掉了 ⇒ 红的不是判据命中').toContain('"revision"')
      expect(files['sw.js'], '变异把枚举也删掉了 ⇒ 红的是两条，变异不干净').toContain('keys()')
      expect(files['sw.js'], '变异把 fetch 处理器也删掉了 ⇒ 红的不是判据命中').toContain('"fetch"')
    }))
    expect(
      checkOf(report, 'sw-deletes-stale-caches').ok,
      '`caches.delete(...)` 被删了而判据没红 —— AC-C5 就地失效，' +
        '而表现只是「换了录音但孩子听的是旧的」，极难归因',
    ).toBe(false)
    // ⚠️ 枚举那一条必须**仍是绿** —— 变异没动它。
    //   这一条同时钉住「两条是分开判的」：初版把两者写成一个 OR
    //   （`caches.delete|.keys()`），删掉 delete 之后 keys 还在 ⇒ 整条绿，
    //   **判据放过了它要防的那个违规**。
    expect(
      checkOf(report, 'sw-enumerates-old-caches').ok,
      '枚举那一句还在，判据却报红 ⇒ 说明它与删除那条共用同一个正则（OR 合并过）',
    ).toBe(true)
    expect(checkOf(report, 'sw-has-precache-manifest').ok, 'precache 明明还在，判据却报红 ⇒ 这不是干净的变异').toBe(true)
    expect(checkOf(report, 'sw-no-force-reload').ok, '没有强制刷新调用，判据却报红 ⇒ 这不是干净的变异').toBe(true)
  })

  it('删掉枚举（`keys()`）⇒ 只有枚举那条红（另一半仍然绿 ⇒ 两条确实分开判）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = SW_GOOD.replace(/caches\.keys\(\)/, 'void 0')
    }))
    expect(checkOf(report, 'sw-enumerates-old-caches').ok, '枚举被删了而判据没红').toBe(false)
    expect(checkOf(report, 'sw-deletes-stale-caches').ok, '删除那一句还在，判据却报红 ⇒ 两条被 OR 在一起了').toBe(true)
  })

  it('⚠️ R-53：三条正则先在**真值**上自证能匹配（否则它们恒假，看着绿其实没在看）', () => {
    const withClaim = 'self.clients.claim();'
    const withSkip = 'self.skipWaiting()'
    const withReload = 'location.reload()'
    expect(withClaim, 'R-53：clients.claim 的判据正则不认自己的探针').toMatch(/clients\.claim\s*\(/)
    expect(withSkip, 'R-53：skipWaiting 的判据正则不认自己的探针').toMatch(/skipWaiting\s*\(\s*\)/)
    expect(withReload, 'R-53：location.reload 的判据正则不认自己的探针').toMatch(/location\.reload\s*\(/)
  })

  it('反向自测：把三条判据的**正则**原样抄进「好产物」，它们必须变成红（证明前三条不是恒真）', () => {
    // ⚠️ 这一条是本文件对 R-51 最直接的一次执行：
    //   前三条各测「坏产物红」，这一条测「坏产物的形态与判据完全一致」。
    //   若判据写成了别的形态（比如只查 `autoUpdate` 字面量），前三条会在
    //   「正则恰好也匹配」时侥幸绿，而这一条会暴露差异。
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = `${SW_GOOD}self.clients.claim();self.skipWaiting();`
    }))
    expect(checkOf(report, 'sw-no-clients-claim').ok, '判据与探针形态完全一致却判绿 —— 这一条恒真').toBe(false)
    expect(checkOf(report, 'sw-no-force-reload').ok, '判据与探针形态完全一致却判绿 —— 这一条恒真').toBe(false)
    // 旧缓存清理还在（`caches.delete(n)` 来自 `SW_GOOD`）⇒ 这一条必须仍是绿，
    // 否则判据认不出「在」—— 那种判据只能靠「所有产物都红」蒙对。
    expect(checkOf(report, 'sw-deletes-stale-caches').ok, '`caches.delete(n)` 明明在，判据却报红').toBe(true)
  })
})

// ── G157 —— 产物级判据覆盖 AC-B1/B2 的子路径事故面（变异 M143 的落点）──────

describe('G157 —— 产物级前缀判据覆盖 manifest 三字段（Story 1.18 / 裁决 8、变异 M143）', () => {
  it('`start_url` 去掉 `/plantsgame/` 前缀 ⇒ 红', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['manifest.webmanifest'] = files['manifest.webmanifest']!.replace('"/plantsgame/"', '"/"')
    }))
    expect(
      checkOf(report, 'manifest-base-start_url').ok,
      'start_url 丢了前缀而判据没红 —— 添加到主屏后启动会落到站点根',
    ).toBe(false)
  })

  it('`scope` 去掉前缀 ⇒ 红（SW 作用域会缩到 `/` 或不匹配）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['manifest.webmanifest'] = files['manifest.webmanifest']!.replace(
        '"scope":"/plantsgame/"',
        '"scope":"/"',
      )
    }))
    expect(checkOf(report, 'manifest-base-scope').ok, 'scope 丢了前缀而判据没红').toBe(false)
  })

  it('`id` 去掉前缀 ⇒ 红（换域名时应用身份不该失效，但也不能缩到站点根）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['manifest.webmanifest'] = files['manifest.webmanifest']!.replace('"id":"/plantsgame/"', '"id":"/"')
    }))
    expect(checkOf(report, 'manifest-base-id').ok, 'id 丢了前缀而判据没红').toBe(false)
  })

  it('index.html 的资源引用丢掉前缀 ⇒ 红（M149 的落点：hashing 之外的前缀失配）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['index.html'] = files['index.html']!.replaceAll('/plantsgame/assets/', '/assets/')
    }))
    expect(checkOf(report, 'asset-refs-carry-base').ok, '资源引用丢了前缀而判据没红 —— 部署后 404 白屏').toBe(false)
  })

  it('**非 JS/CSS** 的根相对引用丢前缀 ⇒ 红（手写 `link` 不会被构建工具重写的那种）', () => {
    // ⚠️ 上面那条只盯 `.js` / `.css`。本仓库丢过两次的形态恰恰是**非**这两种：
    //   手写一条 `<link rel="manifest" href="/manifest.webmanifest">` 不会被 Vite
    //   重写（`.webmanifest` 不在它的资源属性表里），部署到子路径后 404，
    //   而且它排在插件注入的那条**前面** ⇒ manifest 整个失效、装不到主屏。
    //   ⇒ 这一条把所有根相对 `src`/`href` 一网打尽，与扩展名无关。
    const report = verifyDeploy(brokenFs((files) => {
      files['index.html'] =
        files['index.html']!.replace('/plantsgame/manifest.webmanifest', '/manifest.webmanifest')
    }))
    expect(
      checkOf(report, 'all-root-relative-refs-carry-base').ok,
      'manifest 的 link 丢了前缀而判据没红 —— 部署后主屏图标装不上，' +
        '而构建成功、页面也能打开（症状只在「添加到主屏」那一步才显形）',
    ).toBe(false)
    // ⚠️ 同时确认**没有误伤**：只坏这一处时，JS/CSS 那条判据仍应绿 ——
    //   两条判据盯的不是同一件事（这条管「有没有被重写」，那条管「有没有前缀」）。
    expect(
      checkOf(report, 'asset-refs-carry-base').ok,
      '只坏了 manifest 的引用，JS/CSS 的前缀判据却跟着红了 —— 两条判据混成了一条，' +
        '报出来的原因会指向错的文件',
    ).toBe(true)
  })

  it('反向自测：好产物里「所有根相对引用都带前缀」这一条是**真在看**（判据恒假要当场露）', () => {
    // 判据是 `refs.filter(ref => !ref.startsWith(DEPLOY_BASE))`。
    // 若有人把 DEPLOY_BASE 改成空串，`every` 会恒真、这条永远绿 ⇒ 恒假。
    // ⇒ 直接断言好产物里**确实有**根相对引用，且每一条都带前缀。
    const report = verifyDeploy(goodFs())
    const html = goodFs().read('index.html')!
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]!)
    expect(refs.length, '好产物里一条根相对引用都没有 ⇒ 判据在真实产物上恒假').toBeGreaterThan(2)
    expect(
      refs.filter((ref) => !ref.startsWith('/plantsgame/')),
      '好产物里有不带前缀的引用 ⇒ BASE_FILES 这份夹具本身不成立',
    ).toEqual([])
    expect(
      checkOf(report, 'all-root-relative-refs-carry-base').ok,
      '好产物上这条判据就红了 ⇒ 判据比正确代码还严，会逼人去改对的东西（R-57）',
    ).toBe(true)
  })

  it('0 字节的 mp3 ⇒ 红（「文件存在」不等于「文件能用」，本仓库踩过）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['assets/audio/voice/u1-dog.mp3'] = ''
    }))
    expect(
      checkOf(report, 'audio-voice-non-empty').ok,
      '有个 0 字节的录音而判据没红 —— 孩子点卡片时会炸出一条浏览器错误，' +
        '而表现只是「这个单词不发声」',
    ).toBe(false)
  })

  it('⚠️ R-53：`start_url` 那条判据的正则先自证能匹配到「带前缀」的形态', () => {
    // 判据的真身是 `value.startsWith(DEPLOY_BASE)`，而 DEPLOY_BASE 是
    // `vite.config.ts` 的导出 —— 这里直接断言它确实是带前缀的那个字面量，
    // 免得有人把常量改成一个空前缀（那样下面三条会永远红，且原因指向错的地方）。
    const source = sourceOf('vite.config.ts')
    const matched = source.match(/export const DEPLOY_BASE = '([^']*)'/)
    expect(matched, "vite.config.ts 里找不到 `export const DEPLOY_BASE = '…'` —— 判据的前缀来源消失").not.toBeNull()
    expect(
      matched![1],
      'DEPLOY_BASE 不是 `/plantsgame/` 开头 —— 若这是有意的部署路径变更，' +
        'scripts/verify-deploy.ts 与 docs/deployment.md 的前缀必须同步改',
    ).toBe('/plantsgame/')
  })
})

// ── G199 —— `[CR]` 2026-10-20 新增/修正的产物判据真能抓到违规 ──────────────

describe('G199 —— 产物自检的新判据真能抓到违规（Story 1.18 `[CR]` 2026-10-20）', () => {
  it('⚠️ 把 precache 清单从产物 SW 里删掉 ⇒ 红（旧判据**放过**了这一条）', () => {
    // 🔥 **这一条是本轮最值钱的产出**：原判据是
    //   `/\bprecache\b|\.precacheAndRoute|__WB_MANIFEST/`。
    //   ⚠️ 它在真实产物上是**恒绿**的：`__WB_MANIFEST` 出现 0 次（workbox 把它
    //   换成了字面量数组），而 `\bprecache\b` 匹配到的是**缓存名的模板字符串**
    //   （`` `${e}precache-${t}` ``）—— 那不是清单。
    //   ⇒ workbox 一天不注入清单，这条照样绿。
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = SW_GOOD.replace(
        /\[\{"revision":"fe46491d9ddb11cd22c1404ceabea996","url":"index.html"\},{"revision":null,"url":"assets\/index-CCa7u-h3\.js"\},\{"revision":null,"url":"assets\/index-BkSWzeM0\.css"\}\]/,
        '[]',
      )
      expect(files['sw.js'], '变异没把清单删掉 ⇒ 红的不是判据命中').not.toContain('"revision"')
      // ⚠️ **缓存名的模板仍在** —— 那正是旧判据会绿的原因，逐字钉住。
      expect(files['sw.js'], '变异把缓存名模板也删了 ⇒ 旧判据不会绿，这条测不出东西').toContain('precache')
      // ⚠️📎 **R-53 反向自测**：把**旧判据的正则**原样抄过来，它在这份
      //   「清单已被删掉」的坏产物上**照样匹配** ⇒ 旧判据恒绿这件事被**当场证明**，
      //   而不是一个只写在注释里的断言。
      expect(
        files['sw.js'],
        '旧判据 `\\bprecache\\b|\\.precacheAndRoute|__WB_MANIFEST` 在这份没有清单的坏产物上' +
          '竟然匹配不上 —— 那说明旧判据其实不是恒绿的问题，请把本注释与结论一并更正',
      ).toMatch(/\bprecache\b|\.precacheAndRoute|__WB_MANIFEST/)
    }))
    expect(
      checkOf(report, 'sw-has-precache-manifest').ok,
      '产物 SW 里没有 precache 清单而判据没红 —— 飞行模式下打开是一张白纸（AC-B8 逐字）',
    ).toBe(false)
  })

  it('precache 清单里没有 `index.html` ⇒ 红（离线打开是空页面）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = SW_GOOD.replace(
        '{"revision":"fe46491d9ddb11cd22c1404ceabea996","url":"index.html"},',
        '',
      )
    }))
    expect(checkOf(report, 'sw-precaches-app-shell').ok, '外壳不在 precache 里而判据没红').toBe(false)
  })

  it('precache 清单里没有 JS / CSS ⇒ 红（外壳缓存了但它的脚本没缓存）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['sw.js'] = SW_GOOD.replace(
        '{"revision":null,"url":"assets/index-CCa7u-h3.js"},{"revision":null,"url":"assets/index-BkSWzeM0.css"}',
        '',
      )
    }))
    expect(checkOf(report, 'sw-precaches-built-assets').ok, 'JS / CSS 不在 precache 里而判据没红').toBe(false)
  })

  it('manifest 删掉 `description` / `orientation` ⇒ 红（AC-B1 明列的字段）', () => {
    for (const field of ['description', 'orientation']) {
      const report = verifyDeploy(brokenFs((files) => {
        const manifest = JSON.parse(files['manifest.webmanifest']!) as Record<string, unknown>
        delete manifest[field]
        files['manifest.webmanifest'] = JSON.stringify(manifest)
      }))
      expect(
        checkOf(report, `manifest-field-${field}`).ok,
        `manifest 缺 \`${field}\` 而判据没红 —— AC-B1 逐字列了它，删掉构建照样全绿`,
      ).toBe(false)
    }
  })

  it('图标的 `purpose` 被改成 `any` ⇒ 红（`any` 与 `maskable` 是两张不同的图）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      const manifest = JSON.parse(files['manifest.webmanifest']!) as {
        icons: Array<Record<string, unknown>>
      }
      for (const icon of manifest.icons) icon['purpose'] = 'any'
      files['manifest.webmanifest'] = JSON.stringify(manifest)
    }))
    expect(
      checkOf(report, 'manifest-icon-purpose-maskable-192.png').ok,
      'maskable 图标被当成普通图标而判据没红 —— Android 会把普通图标裁成自适应图标',
    ).toBe(false)
  })

  it('图标的 `sizes` 被删掉 ⇒ 红（Chrome 按 sizes 挑候选图标）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      const manifest = JSON.parse(files['manifest.webmanifest']!) as {
        icons: Array<Record<string, unknown>>
      }
      for (const icon of manifest.icons) delete icon['sizes']
      files['manifest.webmanifest'] = JSON.stringify(manifest)
    }))
    expect(checkOf(report, 'manifest-icon-sizes-icon-192.png').ok, 'sizes 被删了而判据没红').toBe(false)
  })

  it('多一条 `rel="manifest"` 的 link ⇒ 红（AC-B3 逐字「恰好一条」）', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['index.html'] =
        files['index.html']!.replace(
          '</head>',
          '<link rel="manifest" href="/plantsgame/manifest.webmanifest"></head>',
        )
    }))
    expect(
      checkOf(report, 'manifest-link-exactly-one').ok,
      '产物里有两条 manifest link 而判据没红 —— 浏览器取哪一条不确定',
    ).toBe(false)
  })

  it('manifest 那条 link 丢了 base 前缀 ⇒ 红', () => {
    const report = verifyDeploy(brokenFs((files) => {
      files['index.html'] = files['index.html']!.replace(
        '/plantsgame/manifest.webmanifest',
        '/manifest.webmanifest',
      )
    }))
    expect(
      checkOf(report, 'manifest-link-carries-base').ok,
      'manifest link 丢了前缀而判据没红 —— 部署在子路径下 404 ⇒ manifest 整个失效',
    ).toBe(false)
  })

  it('⚠️ 部署前缀**只有一个来源**（脚本 import `vite.config.ts`，不手抄）', () => {
    // 🔥 `[CR]` 2026-10-20 抓到的复制链：脚本里原本另有一份
    //   `const DEPLOY_BASE = '/plantsgame/'`，而守卫 G157 只 grep `vite.config.ts` 那份
    //   ⇒ 改脚本这份**无人报警**；
    //   而脚本里「所有根相对引用都带前缀」那条判据逐字是
    //   `refs.filter(ref => !ref.startsWith(DEPLOY_BASE))` ——
    //   一旦这份副本被改成 `'/'`，**所有引用都「带前缀」** ⇒ 判据静默放行
    //   ⇒ **恰好放过了它要防的那个事故**。
    expect(
      scriptSource,
      'scripts/verify-deploy.ts 没有从 vite.config.ts import DEPLOY_BASE —— ' +
        '部署前缀又变成了两份手抄的副本，改一处不会报红',
    ).toMatch(/import\s*\{\s*DEPLOY_BASE\s*\}\s*from\s*['"][^'"]*vite\.config['"]/)
    expect(
      scriptSource,
      'scripts/verify-deploy.ts 里还有 `const DEPLOY_BASE = …` —— 那是手抄的副本，' +
        '与 vite.config.ts 那份各改各的',
    ).not.toMatch(/const\s+DEPLOY_BASE\s*=/)
  })

  it('⚠️ HTML **注释**里提到 `<link rel="manifest">` ⇒ 不算一条（真产物就长这样）', () => {
    // 🔥📎 `[CR]` 2026-10-20 **实测抓到的假红**：
    //   本仓库的 `index.html` 注释里逐字写着
    //   「📎 PWA manifest 的 `<link rel="manifest">` 刻意不在本文件里写」，
    //   而朴素的 `<link[^>]*rel=["']manifest["'][^>]*>` 正则会把**注释里的那串文字**
    //   数成一条真的 link ⇒ 「产物里恰好一条 manifest link」这条判据
    //   在**真实产物上恒红**（实测报「有 2 条」，其中一条是注释）。
    //   ⇒ 判据必须**先剥 HTML 注释再扫**（与 R-52 同型，只是对象从 JS 注释换成 HTML 注释）。
    //   ⚠️ 这条守卫守的是**判据自己的红**（R-50 的第一步：先排除判据造成的红）。
    const report = verifyDeploy(
      brokenFs((files) => {
        files['index.html'] =
          '<!-- 📎 PWA manifest 的 `<link rel="manifest">` 刻意不在本文件里写。 -->\n' +
          files['index.html']!
      }),
    )
    expect(
      checkOf(report, 'manifest-link-exactly-one').ok,
      'HTML 注释里提到 `<link rel="manifest">` 就被数成一条 —— ' +
        '本仓库的 index.html 注释里逐字写着这句，真产物上这条判据恒红',
    ).toBe(true)
    expect(
      checkOf(report, 'manifest-link-carries-base').ok,
      '剥注释之后那条真的 manifest link 反而找不到了',
    ).toBe(true)
  })
})
