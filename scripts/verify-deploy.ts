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
 * ── 纯函数 + `main()` 的分层（与 `validate-content.ts` 同款）───────────────────
 *   `verifyDeploy()` 收一个「文件系统」进去，返回结构化结果；
 *   `console.*` / `process.exit` **只**出现在 `main()` 里。
 *   理由逐字见 `validate-content.ts` 的文件头：埋在 CLI 里的逻辑只能靠 spawn
 *   子进程测，而 1.5 的 `[CR]` 抓到过「断言退出码抓不到差异」的假绿。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 部署前缀 —— 与 `vite.config.ts` 的 `base` 同源（1.11 的教训：两者必须一致）。 */
const DEPLOY_BASE = '/plantsgame/'

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
  'start_url',
  'scope',
  'id',
  'display',
  'theme_color',
  'background_color',
] as const

/** manifest 里必须带部署前缀的字段（决定 SW 作用域与启动落点）。 */
const MANIFEST_BASE_FIELDS = ['start_url', 'scope', 'id'] as const

/**
 * 产物里必须存在的图标（PWA 安装判据）。
 *
 * ⚠️ **四个，不是两个**：Android 的自适应图标（maskable）走**另一张**图 ——
 *   漏掉 maskable 那一对时 `any` 那一对照样在、主屏也照样装得上，
 *   症状是「图标被裁成一块看不出是什么的图形」，而任何**只看文件在不在**的检查都绿。
 *   ⇒ 两个 `purpose` 各取两档，缺一即红。
 *   （`icon.svg` / `maskable.svg` 是**源**，不部署、不进 manifest，不在此列。）
 */
const REQUIRED_ICONS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
] as const

/**
 * 产物自检本体 —— 纯函数，无副作用（不读盘、不打日志、不退出）。
 *
 * ⚠️ **`checks` 的顺序是断言的一部分**：测试逐条按下标取值，
 *   中间插一条会让后面全部错位 —— 那时测试会红，而红是**真的**（有东西变了）。
 *   追加新检查请放在**末尾**，或同步更新 `tests/scaffold/verify-deploy.test.ts`。
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

  // ⚠️ 内容哈希判据**不是**「文件名里有没有横杠」（那种判据在关掉 hashing
  //   之后仍然绿 —— 名字照样带横杠），而是「index.html 引用到的每一个
  //   /assets/ 文件都真实存在于 dist 里」+「清单里没有裸文件名」。
  const assetRefs =
    indexHtml === null ? [] : [...indexHtml.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!)
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
  const rootRelativeRefs =
    indexHtml === null
      ? []
      : [...indexHtml.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]!)
  const unprefixed = rootRelativeRefs.filter((ref) => !ref.startsWith(DEPLOY_BASE))
  add(
    'all-root-relative-refs-carry-base',
    unprefixed.length === 0,
    `index.html 里有 ${unprefixed.join('、')} 没有以 \`${DEPLOY_BASE}\` 开头 —— ` +
      '它没被构建工具重写，部署在子路径下会指向站点根：孩子看到空白图标、' +
      '或整个 manifest 失效（本仓库已因此丢过全部录音与主屏图标）',
  )

  // ── ② manifest（AC-B1 / AC-B2）────────────────────────────────────────
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
    sw !== null && /\bprecache\b|\.precacheAndRoute|__WB_MANIFEST/.test(sw),
    'SW 里看不到 precache 清单 —— 应用外壳不被缓存，飞行模式下打开是一张白纸',
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

  // ── ⑤ 内容资产（**这个 story 要治的那个**）────────────────────────────────
  // ⚠️ 这里**只判「存在」不判「能加载」** —— 后者要真机（AC-B8 / AC-F5 的人工项）。
  //   判据取自**产物目录**而不是硬编码「30 张」：内容层加词时目录自动跟着变，
  //   而写死 30 的那份会静默过期、然后在某一天给出假绿。
  const wordImages = fs.listDir('assets/words/unit-01').filter((name) => name.endsWith('.svg'))
  add('word-images-present', wordImages.length > 0, '`dist/assets/words/unit-01/` 下一个 SVG 都没有')
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
