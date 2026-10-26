/**
 * 上线前产物自检（Story 1.18 / AC-F3）。
 *
 * ── 这个脚本守什么 ────────────────────────────────────────────────────────
 * `npm run build` 会**成功**，而产物照样是坏的。本仓库在这条路上踩过两次：
 *   · `base` 与硬编码的 `/assets/...` 失配 ⇒ 部署后「每个录音必然 404」；
 *   · 在单词卡上更进一步 —— 实测「**单元 1 全部单词卡的正确项都是图片选项**」，
 *     正确项那张图 404 ⇒ **该关通不了**（AC-E4 要治的正是这个死路）。
 * ⇒ 这个脚本读 `dist/` 目录，逐条断言「部署出去之后孩子能不能玩」。
 *
 * ── ⚠️ 为什么它**不许** import `src/`（AC-F3 的逐字要求 + R-61）──────────────
 *   `src/` 里的模块要么带 `import.meta.env`（要 Vite 才能算值），要么是 `.vue`
 *   （tsx 跑不了）。而本脚本恰恰是**上线前**在**没有开发服务器**的机器上跑的 ——
 *   那时 `dist/` 是唯一能读的东西。
 *   ⚠️ 一旦它 import 了 `src/`，它就只能在开发机上跑，而上线前那台机器上直接崩 ——
 *     也就是「自检脚本恰好在真正需要它的地方不可用」。
 *   ⇒ 判据全部来自 `dist/` 的**字面内容**；守卫 **G155** 钉住这条边界。
 *   （对照：`scripts/balance-sim.ts` import 真实 `core/` 是**允许**的，
 *     因为它跑在开发机上、且需要那份判据。这里不需要判据，只需要产物。）
 *
 * ── ⚠️📎 它**确实** import 了 `vite.config.ts` —— 而那不违反 R-61 ───────────
 *   `[CR]` 2026-10-20 实测抓到：部署前缀原本在本文件里**手抄**了一份
 *   （`const DEPLOY_BASE = '/plantsgame/'`），而 `vite.config.ts` 里另有一份
 *   （`export const DEPLOY_BASE = '/plantsgame/'`）—— **两个独立字面量**。
 *   ⇒ 守卫 G157 那条判据只 grep **`vite.config.ts`** 那一份 ⇒ 改本文件这份**无人报警**。
 *   ⇒ 而本文件里那条「所有根相对引用都带前缀」的判据逐字是
 *   `rootRelativeRefs.filter((ref) => !ref.startsWith(DEPLOY_BASE))` ——
 *     一旦这份副本被改成 `'/'`，**所有根相对引用都「带前缀」** ⇒ 判据静默放行
 *     ⇒ **恰好放过了它要防的那个事故**（手写 `<link rel="manifest">` 不被重写 ⇒ 404
 *       ⇒ manifest 整个失效）。
 *   ⇒ 现在**从 `vite.config.ts` import 同一个常量** ⇒ 复制链从根上不存在。
 *   ⚠️ **为什么这不违反「脚本不该依赖构建环境」**：本脚本是 **`postbuild`** 跑的
 *   （`package.json` 逐字：`"postbuild": "npm run verify:deploy"`）——
 *   也就是说它**本来就跑在刚跑完 `vite build` 的那台机器上**，构建工具链必然在位。
 *   ⇒ 代价为零，而收益是「前缀只有一个来源」。
 *   ⚠️ **守卫 G155 仍然成立**：本文件依然零 `src/` 路径、零 `import.meta.env`
 *   （`vite.config.ts` 是**构建期配置**，不是应用代码；它自己也不 import `src/`）。
 *
 * ── 纯函数 + `main()` 的分层（与 `validate-content.ts` 同款）───────────────────
 *   `verifyDeploy()` 收一个「文件系统」进去，返回结构化结果；
 *   `console.*` / `process.exit` **只**出现在 `main()` 里。
 *   理由逐字见 `validate-content.ts` 的文件头：埋在 CLI 里的逻辑只能靠 spawn
 *   子进程测，而 1.5 的 `[CR]` 抓到过「断言退出码抓不到差异」的假绿。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { DEPLOY_BASE } from '../vite.config'

/** 自检读的文件系统。测试注入内存实现，不碰真实 `dist/`。 */
export interface DeployFs {
  /** 相对路径 → 文件内容（UTF-8）；文件不存在返回 `null`。 */
  read(relativePath: string): string | null
  /** 相对路径 → 是否存在（不读内容）。 */
  exists(relativePath: string): boolean
  /** 相对目录 → 直属文件名清单；目录不存在返回空数组。 */
  listDir(relativeDir: string): readonly string[]
  /** 相对路径 → 字节数；文件不存在返回 `-1`。 */
  sizeOf(relativePath: string): number
}

/** 一条检查项的结果。 */
export interface DeployCheck {
  readonly id: string
  readonly ok: boolean
  /** 失败原因：写清「错在哪 → 会怎样」（R-56 同款：错因要能指向动作）。 */
  readonly why: string
}

/** 自检的全部结论。 */
export interface DeployReport {
  readonly checks: readonly DeployCheck[]
  readonly ok: boolean
}

/** manifest 必须是非空字符串的字段。 */
const MANIFEST_TEXT_FIELDS = [
  'name',
  'short_name',
  // ⚠️📎 `[CR]` 2026-10-20 补上 `description` 与 `orientation` ——
  //   AC-B1 逐字列的字段集是
  //   `name / short_name / description / start_url / scope / id / display /
  //    orientation / theme_color / background_color / icons[]`，
  //   而原清单**漏了 `description` 与 `orientation`** ⇒ 删掉它们构建照样全绿。
  //   ⇒ 判据的字段集现在与 AC-B1 **逐字对齐**（一个不多一个不少，
  //   外加 manifest 里本来就有的 `lang`）。
  'description',
  'start_url',
  'scope',
  'id',
  'display',
  'orientation',
  'theme_color',
  'background_color',
  'lang',
] as const

/** manifest 里必须带部署前缀的字段（决定 SW 作用域与启动落点）。 */
const MANIFEST_BASE_FIELDS = ['start_url', 'scope', 'id'] as const

/**
 * 产物里必须存在的图标（PWA 安装判据）—— 连同 manifest 里必须写全的属性。
 *
 * ⚠️ **四个，不是两个**：Android 的自适应图标（maskable）走**另一张**图 ——
 *   漏掉 maskable 那一对时 `any` 那一对照样在、主屏也照样装得上，
 *   症状是「图标被裁成一块看不出是什么的图形」，而任何**只看文件在不在**的检查都绿。
 *   ⇒ 两个 `purpose` 各取两档，缺一即红。
 *   （`icon.svg` / `maskable.svg` 是**源**，不部署、不进 manifest，不在此列。）
 *
 * ⚠️📎 `[CR]` 2026-10-20 补上 `sizes` 与 `purpose` 的**取值**判据 ——
 *   原判据只判「文件存在」+「manifest 里出现过该路径」⇒
 *   把四个 `purpose` 全改成 `any`（或全删掉 `sizes`）构建与自检**照样全绿**。
 *   ⇒ 现在逐个图标断言它**带着正确的 `sizes` 与 `purpose`**。
 */
const REQUIRED_ICON_SPECS = [
  { path: 'icons/icon-192.png', sizes: '192x192', purpose: 'any' },
  { path: 'icons/icon-512.png', sizes: '512x512', purpose: 'any' },
  { path: 'icons/maskable-192.png', sizes: '192x192', purpose: 'maskable' },
  { path: 'icons/maskable-512.png', sizes: '512x512', purpose: 'maskable' },
] as const

/** 产物里必须存在的图标路径。 */
const REQUIRED_ICONS = REQUIRED_ICON_SPECS.map((spec) => spec.path)

/**
 * 产物自检本体 —— 纯函数，无副作用（不读盘、不打日志、不退出）。
 *
 * ⚠️ **每条检查的 `id` 是断言的一部分**：守卫测试逐条**按 id** 取值
 *   （`tests/scaffold/verify-deploy.test.ts` 的 `checkOf(report, id)`），
 *   ⇒ **改 id 会让守卫空跑**（`checkOf` 会当场报「判据被改名或删掉了」）。
 *   ⚠️ `[DS]` Story 2.5（2026-10-23）更正一条**过时的事实**：
 *   本注释原先写的是「测试逐条按下标取值，中间插一条会让后面全部错位」——
 *   那**已经不成立**（测试按 id 取值，实测 `tests/scaffold/verify-deploy.test.ts`
 *   里零处按下标访问 `checks`）⇒ 插入新检查是安全的。
 *   **但新增检查仍必须同步补一条守卫**（R-51：没有守卫的判据等于没有判据）。
 */
export function verifyDeploy(fs: DeployFs): DeployReport {
  const checks: DeployCheck[] = []
  const add = (id: string, ok: boolean, why: string): void => {
    checks.push({ id, ok, why })
  }

  // ── ① 应用外壳 ──────────────────────────────────────────────────────────
  const indexHtml = fs.read('index.html')
  add('index-html-exists', indexHtml !== null, '`dist/index.html` 不存在 —— 站点根打不开')
  add('index-html-not-empty', (indexHtml?.length ?? 0) > 0, '`dist/index.html` 是 0 字节')

  // ⚠️📎 `[CR]` 2026-10-20：**先把 HTML 注释剥掉再扫**。
  //   本仓库的 `index.html` 注释里逐字写着 `<link rel="manifest">`（说明
  //   「这条刻意不手写」），而朴素的正则会把**注释里的那串文字**当成一条真的
  //   link ⇒ 「产物里恰好一条 manifest link」这条判据在**真实产物上恒红**
  //   （实测：报「有 2 条」，其中一条是注释）。
  //   ⇒ 这与 R-52（源码匹配前先剥注释）**同型**，只是对象从 JS 注释换成 HTML 注释。
  const indexHtmlMarkup =
    indexHtml === null ? '' : indexHtml.replace(/<!--[\s\S]*?-->/g, '')

  // ⚠️ 内容哈希判据**不是**「文件名里有没有横杠」（那种判据在关掉 hashing
  //   之后仍然绿 —— 名字照样带横杠），而是「index.html 引用到的每一个
  //   /assets/ 文件都真实存在于 dist 里」+「清单里没有裸文件名」。
  const assetRefs = [
    ...indexHtmlMarkup.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g),
  ].map((m) => m[1]!)
  add(
    'index-references-assets',
    assetRefs.length >= 2,
    '`dist/index.html` 里找不到 JS / CSS 引用 —— 打开是一张白纸',
  )
  // ⚠️ 剥的是 **`${DEPLOY_BASE}` 整个前缀**，不是只剥一个 `/`。
  //   初版写的是 `ref.replace(/^\//, '')` ⇒ 剩下 `plantsgame/assets/index-xxx.js`，
  //   而 dist 里的真实路径是 `assets/index-xxx.js` ⇒ **每一项都报红**，
  //   而产物其实完全正常。这是「判据自己的红」（R-50：先排除夹具/判据造成的红，再谈判据）。
  const missingRefs = assetRefs.filter((ref) => !fs.exists(ref.replace(DEPLOY_BASE, '')))
  add(
    'index-referenced-files-exist',
    missingRefs.length === 0,
    `index.html 引用了 ${missingRefs.join('、')}，而 dist 里没有 —— 打开即 404 白屏`,
  )
  add(
    'asset-refs-carry-base',
    assetRefs.every((ref) => ref.startsWith(DEPLOY_BASE)),
    `资源引用没有全部带 \`${DEPLOY_BASE}\` 前缀 —— 部署在子路径下时它们会指向站点根` +
      '（本仓库已因此丢过全部录音）',
  )
  add(
    'assets-are-content-hashed',
    assetRefs.length > 0 &&
      assetRefs.every((ref) => /-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(ref.replace(/^.*\/assets\//, ''))),
    'JS / CSS 文件名里没有内容哈希 —— 发了新版本，孩子还在用旧缓存里的旧代码（AC-C5）',
  )
  // ⚠️ 这一条比上面三条**宽**：上面只盯 `.js` / `.css`，而本仓库丢过两次的形态是
  //   「**手写**一条站点根相对引用，Vite 不重写它 ⇒ 部署到子路径后 404」。
  //   实测过会被重写的：`favicon.svg`、`icons/*.png`、`.webmanifest`；
  //   实测过**不会**被重写的：手写的 `<link rel="manifest">`（它排在插件注入的那条
  //   前面，整个 manifest 失效）。⇒ 与其逐个记「哪些属性会被重写」，
  //   不如在**产物**上断言「**所有**根相对引用都带 base 前缀」——
  //   哪种形态没被重写会当场红，而不是等部署后孩子看到空白。
  const rootRelativeRefs = [...indexHtmlMarkup.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map(
    (m) => m[1]!,
  )
  const unprefixed = rootRelativeRefs.filter((ref) => !ref.startsWith(DEPLOY_BASE))
  add(
    'all-root-relative-refs-carry-base',
    unprefixed.length === 0,
    `index.html 里有 ${unprefixed.join('、')} 没有以 \`${DEPLOY_BASE}\` 开头 —— ` +
      '它没被构建工具重写，部署在子路径下会指向站点根：孩子看到空白图标、' +
      '或整个 manifest 失效（本仓库已因此丢过全部录音与主屏图标）',
  )

  // ⚠️📎 `[CR]` 2026-10-20：AC-B3 逐字要求「产物里**恰好一条** `rel="manifest"` 的
  //   link，且**带 base 前缀**」—— 而原判据只判「前缀」，**不数条数**。
  //   ⇒ 多一条**带前缀**的 link 时全绿（而两条 manifest link 会让浏览器
  //   取到哪一个不确定，症状是「装到主屏后图标是默认的」）。
  //   ⚠️ 扫的是**剥掉注释后**的 `indexHtmlMarkup`（见上）—— 否则本仓库
  //   `index.html` 注释里那串 `<link rel="manifest">` 会被数成一条。
  const manifestLinks = [
    ...indexHtmlMarkup.matchAll(/<link[^>]*\brel=["']manifest["'][^>]*>/gi),
  ].map((m) => m[0])
  add(
    'manifest-link-exactly-one',
    manifestLinks.length === 1,
    `产物里有 ${manifestLinks.length} 条 \`rel="manifest"\` 的 link（应为恰好一条）—— ` +
      '多于一条时浏览器取哪一条不确定，症状是「添加到主屏后图标是默认的」',
  )
  const manifestHref = manifestLinks.length === 1 ? /href=["']([^"']+)["']/.exec(manifestLinks[0]!) : null
  add(
    'manifest-link-carries-base',
    manifestHref !== null && manifestHref[1]!.startsWith(DEPLOY_BASE),
    `manifest 那条 link 的 href 没带 \`${DEPLOY_BASE}\` 前缀（实为 ` +
      `${JSON.stringify(manifestHref?.[1])}）—— 它不会被构建工具重写，` +
      '部署在子路径下 404 ⇒ manifest 整个失效（本仓库已因此丢过主屏图标）',
  )

  // ── ② 清单文件 manifest（AC-B1 / AC-B2）───────────────────────────────
  const manifestRaw = fs.read('manifest.webmanifest')
  add('manifest-exists', manifestRaw !== null, '`dist/manifest.webmanifest` 不存在 —— 加不到主屏')
  const manifest = parseJson(manifestRaw)
  add('manifest-parses', manifest !== null, 'manifest 不是合法 JSON —— 浏览器会静默忽略它')

  for (const field of MANIFEST_TEXT_FIELDS) {
    const value = manifest?.[field]
    add(
      `manifest-field-${field}`,
      typeof value === 'string' && value.length > 0,
      `manifest 缺 \`${field}\`（或不是非空字符串）—— Chrome 会判成不合格的 manifest` +
        (field === 'start_url' ? '，添加到主屏后启动会落到站点根' : ''),
    )
  }
  for (const field of MANIFEST_BASE_FIELDS) {
    const value = manifest?.[field]
    add(
      `manifest-base-${field}`,
      typeof value === 'string' && value.startsWith(DEPLOY_BASE),
      `manifest 的 \`${field}\` 没有以 \`${DEPLOY_BASE}\` 开头（实为 ${JSON.stringify(value)}）—— ` +
        '子路径部署时 SW 作用域与启动落点都会错（裁决 8 的头号事故面）',
    )
  }
  add(
    'manifest-display-standalone',
    manifest?.display === 'standalone',
    '`display` 不是 `standalone` —— 点开是浏览器标签页而不是应用窗口',
  )

  // ── ③ Service Worker（AC-C4 / AC-C5）──────────────────────────────────
  const sw = fs.read('sw.js')
  add('sw-exists', sw !== null, '`dist/sw.js` 不存在 —— 离线完全不可用')
  add('sw-not-empty', (sw?.length ?? 0) > 0, '`dist/sw.js` 是 0 字节 —— 注册成功但什么都不缓存')
  add(
    'sw-has-precache-manifest',
    parseInjectedManifest(sw).length > 0,
    'SW 里看不到被注入的 precache 清单 —— 应用外壳不被缓存，飞行模式下打开是一张白纸',
  )
  // ⚠️📎 `[CR]` 2026-10-20：原判据 `/\bprecache\b|\.precacheAndRoute|__WB_MANIFEST/`
  //   是**恒绿**的，逐条说清它为什么绿：
  //   ① `\bprecache\b` 匹配到的是**缓存名的模板字符串**
  //      （`` `${e}precache-${t}` ``）—— 那是**缓存名**，不是 precache **清单**；
  //   ② `__WB_MANIFEST` 在**真实产物里出现 0 次** —— workbox-build 做文本替换时
  //      把它**换成了字面量数组**（实测 `dist/sw.js` 里是
  //      `[{"revision":"fe46491d…","url":"index.html"},…]`）。
  //   ⇒ 真实产物之所以绿，**只靠 ①** ⇒ workbox 一天不注入清单，这条照样绿。
  //   ⇒ 现在判据改成**认被注入的清单本身**（每个条目同时有 `revision` 与 `url` 两个键）。
  const precachedUrls = parseInjectedManifest(sw).map((entry) => entry.url)
  add(
    'sw-precaches-app-shell',
    precachedUrls.some((url) => /(^|\/)index\.html$/.test(url)),
    'precache 清单里没有 `index.html` —— 飞行模式下打开的是**空页面**（AC-B8 逐字）',
  )
  add(
    'sw-precaches-built-assets',
    precachedUrls.some((url) => /\.js$/.test(url)) && precachedUrls.some((url) => /\.css$/.test(url)),
    'precache 清单里没有构建后的 JS / CSS —— 外壳 HTML 被缓存了但它的脚本没被缓存，' +
      '离线时打开是一片白（AC-B8 逐字）',
  )
  // ⚠️ **判据初版写成一个 OR**（`caches\.delete|\.keys\(\)`）⇒ **实测它放过了它要防的违规**：
  //   把 `caches.delete(...)` 整条删掉，`caches.keys()` 还在 ⇒ 判据仍绿。
  //   而 `keys()` 只是**枚举**旧缓存，真正把它们**删掉**的是 `caches.delete` ——
  //   AC-C5 要的是后者。⇒ 拆成两条，各自盯一半，「删掉清理」只会红其中一条。
  //   （这与 R-51 第 2 类失效同型：判据在**它自己要防的那个方向上**是绿的。）
  add(
    'sw-enumerates-old-caches',
    sw !== null && /\.keys\(\)/.test(sw),
    'SW 里没有枚举缓存名（`caches.keys()`）—— 换代时无从知道哪些是上一代的',
  )
  add(
    'sw-deletes-stale-caches',
    sw !== null && /caches\.delete\s*\(/.test(sw),
    'SW 里没有 `caches.delete(...)` —— 旧缓存**只被列出来不被删掉**，' +
      'mp3 / 词图会永远从旧缓存出（AC-C5）',
  )
  // ⚠️ 这两条**不是**「不许出现某个 API」的空话：AC-C2 要求「新版本下次启动生效」，
  //   而 `clientsClaim()` / 自动 `skipWaiting()` 都让新 SW **当场**接管，
  //   孩子正在玩的那一局没有保存点。守卫 G156 从**源码**（`sw/sw.ts`）那侧钉，
  //   这里从**产物**这侧钉 —— 打包器可能改写源码，两者都要看。
  add(
    'sw-no-clients-claim',
    sw !== null && !/clients\.claim\s*\(/.test(sw),
    '产物 SW 里出现 `clients.claim()` —— 新版本一装上就接管正在玩的那一局（AC-C2）',
  )
  add(
    'sw-no-force-reload',
    sw !== null && !/location\.reload\s*\(|skipWaiting\s*\(\s*\)/.test(sw),
    '产物 SW 里出现 `skipWaiting()` / `location.reload()` —— 强制刷新，' +
      '而孩子正在玩的那一局没有保存点（AC-C2 要求下次启动才生效）',
  )

  // ── ④ 图标（AC-B9）───────────────────────────────────────────────────
  for (const icon of REQUIRED_ICONS) {
    add(`icon-${icon.replace(/^icons\//, '')}`, fs.exists(icon), `\`${icon}\` 不存在 —— 主屏图标是默认的`)
  }
  const manifestText = manifestRaw ?? ''
  for (const icon of REQUIRED_ICONS) {
    add(
      `manifest-references-${icon.replace(/^icons\//, '')}`,
      manifestText.includes(icon),
      `manifest 没有引用 \`${icon}\` —— 图标躺在 dist 里但 Chrome 不认`,
    )
  }
  // ⚠️📎 `[CR]` 2026-10-20：逐个图标断言 manifest 里那条声明的 `sizes` 与 `purpose` ——
  //   「文件在」+「路径出现过」这两条**证明不了 Chrome 会用它**：
  //   把四个 `purpose` 全改成 `any`，或全删掉 `sizes`，原判据照样全绿。
  const manifestIconList = Array.isArray(manifest?.icons) ? (manifest!.icons as unknown[]) : []
  for (const spec of REQUIRED_ICON_SPECS) {
    const entry = manifestIconList.find(
      (item): item is Record<string, unknown> => {
        // ⚠️ `typeof item === 'object'` 把 `unknown` 收窄成 `object` ——
        //   而 `object` **不能**用 `['src']` 索引（TS7053）⇒ 先落成
        //   `Record<string, unknown>` 再取键。
        if (typeof item !== 'object' || item === null) return false
        const src = (item as Record<string, unknown>)['src']
        return typeof src === 'string' && src.includes(spec.path)
      },
    )
    const name = spec.path.replace(/^icons\//, '')
    add(
      `manifest-icon-sizes-${name}`,
      entry !== undefined && entry['sizes'] === spec.sizes,
      `manifest 里 \`${spec.path}\` 那条的 \`sizes\` 不是 \`${spec.sizes}\`（实为 ` +
        `${JSON.stringify(entry?.['sizes'])}）—— Chrome 按 sizes 挑候选图标，` +
        '挑不到就会退回用别的尺寸，主屏图标糊成一团',
    )
    add(
      `manifest-icon-purpose-${name}`,
      entry !== undefined && entry['purpose'] === spec.purpose,
      `manifest 里 \`${spec.path}\` 那条的 \`purpose\` 不是 \`${spec.purpose}\`（实为 ` +
        `${JSON.stringify(entry?.['purpose'])}）—— \`any\` 与 \`maskable\` 是**两张不同的图**，` +
        '把它俩混成一种，Android 会把普通图标裁成自适应图标 ⇒ 主屏图标被裁掉一块',
    )
  }

  // ── ⑤ 内容资产（**这个 story 要治的那个**）────────────────────────────────
  // ⚠️ 这里**只判「存在」不判「能加载」** —— 后者要真机（AC-B8 / AC-F5 的人工项）。
  //   判据取自**产物目录**而不是硬编码「30 张」：内容层加词时目录自动跟着变，
  //   而写死 30 的那份会静默过期、然后在某一天给出假绿。
  //
  // ⚠️📎 `[DS]` Story 2.5（2026-10-23）修一条**漏查**：
  //   原判据逐字是 `fs.listDir('assets/words/unit-01')` —— **只查单元 1 一个目录** ⇒
  //   **单元 2 的词图整批缺失时，`npm run build` 成功、产物自检也全绿**，
  //   而孩子的症状是「进了单元 2，每张单词卡都是空白」。
  //   ⇒ 现在改成**逐单元目录**都查，且**单元清单从产物自身推导**（不硬编码「有 N 个单元」）。
  //
  // ⚠️ **单元清单怎么推导的，为什么不是「只列 `assets/words/`」**：
  //   只列父目录能查出「目录在但里面是空的」⇒ **整个目录不在**时它连查都不会查。
  //   ⇒ 清单取**两处的并集**：
  //     ① **录音文件名前缀**（`u<N>-*.mp3`）—— 录音是内容层**每个词条**都会产出的
  //        （`generate:voice` 按内容层词表录），而词图**只**为单词卡产出
  //        ⇒ 「有录音、没词图」就是异常（**这正是单元 2 漏查的那一类**）；
  //     ② **产物里现存的 `unit-NN` 目录名** —— 目录在却一张图都没有，同样是异常。
  //   ⚠️ 反过来也成立：某个单元**确实一个单词卡都没有**时，这条会红 ——
  //     那时该改这条判据（写明豁免），**不是绕过它**。
  //   ⚠️ **这份清单是产物自身推出来的，不硬编码「有 N 个单元」** ——
  //     写死单元数的那份会静默过期、然后在某一天给出假绿。
  const voiceMp3s = fs
    .listDir('assets/audio/voice')
    .filter((name) => name.endsWith('.mp3') && !name.includes('/'))
  // ⚠️📎 `[CR]` 2026-10-23（Story 2.5）**按数字排序，不按字符串排序**：
  //   单元号是**数字**，`['2','10','11']` 按字符串排会得到 `['10','11','2']`
  //   ⇒ 单元 10 一进来，检查项的顺序就变成 `unit-01, unit-10, unit-11, …, unit-02`
  //   ⇒ 构建日志与 `docs/deployment.md` 里那份「逐项清单」对不上，
  //   而**扫一眼构建日志的人**恰恰最容易漏掉那条被打乱的项。
  //   ⇒ 先转成数字排序，再补零成目录名。
  const unitsWithVoice = [
    ...new Set(
      voiceMp3s
        .map((name) => /^u(\d+)-/.exec(name)?.[1])
        .filter((digits): digits is string => digits !== undefined)
        .map((digits) => Number(digits)),
    ),
  ].sort((a, b) => a - b)
  const unitDirs = [
    ...new Set([
      ...unitsWithVoice.map((n) => `unit-${String(n).padStart(2, '0')}`),
      ...fs.listDir('assets/words').filter((name) => /^unit-\d+$/.test(name)),
    ]),
  ].sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
  let unitsWithWordImages = 0
  for (const dir of unitDirs) {
    const svgs = fs
      .listDir(`assets/words/${dir}`)
      .filter((name) => name.endsWith('.svg') && !name.includes('/'))
    if (svgs.length > 0) unitsWithWordImages += 1
    add(
      `word-images-${dir}-present`,
      svgs.length > 0,
      `单元 ${dir} 的录音在产物里，但 \`dist/assets/words/${dir}/\` ` +
        '一个 SVG 都没有 —— 要么这批词图没进产物，要么这个单元真的没有单词卡' +
        '（那就该改这条判据并写明豁免，不是绕过它）',
    )
  }
  add(
    'word-images-present',
    unitsWithWordImages > 0,
    '`dist/assets/words/` 下一个单元的词图都没有 —— 全部单词卡都是空白',
  )
  for (const asset of [
    'assets/towers/direct.svg',
    'assets/towers/slow.svg',
    'assets/towers/aoe.svg',
    'assets/zombies/zombie.svg',
  ]) {
    add(`asset-${asset.split('/').pop()}`, fs.exists(asset), `\`${asset}\` 不存在 —— 战场上是空白`)
  }
  // ⚠️ 三类音频在**三个平级目录**里（不是 `assets/audio/` 直接挂着）：
  //   `sfx/` 音效、`voice/` 单词与句子录音、`music/` 背景音乐。
  //   初版判 `assets/audio/` 本身 ⇒ 恒红（产物其实正常），是判据自己的红。
  const AUDIO_DIRS = [
    { dir: 'assets/audio/sfx', what: '答对 / 放塔的音效' },
    { dir: 'assets/audio/voice', what: '单词与句子的朗读录音' },
    { dir: 'assets/audio/music', what: '战场背景音乐' },
  ] as const
  for (const { dir, what } of AUDIO_DIRS) {
    const mp3s = fs.listDir(dir).filter((name) => name.endsWith('.mp3'))
    // ⚠️ 同时判「有 mp3」与「**没有 0 字节的 mp3**」：
    //   本项目踩过「文件存在但 0 字节」的静默失效（记忆：`plants-game-skip-must-hash-not-exists`），
    //   「存在」在这里是**不够**的 —— 0 字节 mp3 会在孩子点卡片时炸出一条浏览器错误。
    add(
      `audio-${dir.split('/').pop()}-present`,
      mp3s.length > 0,
      `\`dist/${dir}/\` 下一个 mp3 都没有 —— ${what}完全消失`,
    )
    const empty = mp3s.filter((name) => fs.sizeOf(`${dir}/${name}`) === 0)
    add(
      `audio-${dir.split('/').pop()}-non-empty`,
      empty.length === 0,
      `这些 mp3 是 0 字节：${empty.join('、')} —— 「文件存在」不等于「文件能用」，` +
        '点卡片时它会炸出一条浏览器错误，而孩子只会以为游戏坏了',
    )
  }

  return { checks, ok: checks.every((check) => check.ok) }
}

/** precache 清单里的一条。 */
interface PrecacheEntry {
  readonly url: string
  readonly revision: string | null
}

/**
 * 从产物 SW 里**解析出被注入的 precache 清单**。
 *
 * ⚠️ **为什么必须解析清单，而不是 grep 一个词**（`[CR]` 2026-10-20）：
 *   workbox-build 做文本替换时把 `self.__WB_MANIFEST` **换成了字面量数组** ——
 *   实测真实产物 `dist/sw.js` 里 `__WB_MANIFEST` 出现 **0 次**，
 *   而清单长这样：
 *   `[{"revision":"fe46491d…","url":"index.html"},{"revision":null,"url":"assets/index-xxx.js"},…]`
 *   ⇒ 判据必须认「**一个同时带 `revision` 与 `url` 两个键的对象**」。
 *
 * ⚠️ **为什么用前瞻而不是「先找 revision 再找 url」**：
 *   产物里还有 `function l(e){return e.revision===null?…}` 这种形态 ——
 *   它的 `revision` 后面跟的是 `=`（不是 `:`）⇒ 用 `["']?revision["']?\s*:` 认不出它。
 *   ⇒ 用两个前瞻各认一个键，**顺序无关**（workbox 换字段顺序也不会失配）。
 *
 * @param sw 产物 `sw.js` 的内容
 * @returns 解析出的清单条目（解析不出就是空数组）
 */
export function parseInjectedManifest(sw: string | null): PrecacheEntry[] {
  if (sw === null) return []
  const out: PrecacheEntry[] = []
  const objectPattern = /\{(?=[^{}]*["']?revision["']?\s*:)(?=[^{}]*["']?url["']?\s*:)[^{}]*\}/g
  for (const match of sw.matchAll(objectPattern)) {
    const text = match[0]
    const url = /["']?url["']?\s*:\s*["']([^"']*)["']/.exec(text)
    if (url === null) continue
    const revision = /["']?revision["']?\s*:\s*(null|["']([^"']*)["'])/.exec(text)
    out.push({
      url: url[1]!,
      revision:
        revision === null
          ? null
          : revision[1] === 'null'
            ? null
            : (revision[2] ?? null),
    })
  }
  return out
}

/** JSON 解析；失败返回 `null` 而**不抛** —— 上线前自检不该自己先崩。 */
function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** 真实文件系统实现。**只有这里**摸盘，其余全是纯逻辑。 */
export function makeNodeFs(root: string): DeployFs {
  return {
    read: (relativePath) => {
      const full = join(root, relativePath)
      return existsSync(full) ? readFileSync(full, 'utf8') : null
    },
    exists: (relativePath) => existsSync(join(root, relativePath)),
    listDir: (relativeDir) => {
      const full = join(root, relativeDir)
      try {
        return existsSync(full) ? readdirSync(full) : []
      } catch {
        return []
      }
    },
    sizeOf: (relativePath) => {
      const full = join(root, relativePath)
      try {
        return existsSync(full) ? statSync(full).size : -1
      } catch {
        return -1
      }
    },
  }
}

function main(): void {
  const root = process.argv[2] ?? 'dist'
  const report = verifyDeploy(makeNodeFs(root))

  for (const check of report.checks) {
    if (check.ok) {
      console.log(`  ✅ ${check.id}`)
      continue
    }
    console.error(`  ❌ ${check.id} —— ${check.why}`)
  }
  const failed = report.checks.filter((check) => !check.ok)
  console.log(`\n[deploy] ${report.checks.length - failed.length}/${report.checks.length} 项通过（根目录 ${root}）`)
  if (failed.length > 0) {
    console.error(`[deploy] ${failed.length} 项未通过 —— 不要部署：上面每一条都会在部署后变成孩子的可见故障。`)
    process.exitCode = 1
  }
}

// ⚠️ 入口判定用 `import.meta.url` 的文件名而不是「文件是不是被 import」：
//   守卫测试会 import 本模块拿 `verifyDeploy`，那时 `main()` 绝不能跑。
if (process.argv[1]?.endsWith('verify-deploy.ts') === true) {
  main()
}
