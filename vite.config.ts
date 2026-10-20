import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { VitePWAOptions } from 'vite-plugin-pwa'

// ─────────────────────────────────────────────────────────────────────────────
// 📎 **Story 1.18 / AC-B1：manifest 字段集住在这个文件里，并由守卫 import 同一个对象。**
//
// ── 为什么是导出而不是放在 `src/` 的某个模块里 ───────────────────────────
// 一开始它住在 `src/app/pwa-manifest.ts`，`vite.config.ts` import 它。**实测撞到**
// `TS6307`（composite 项目要求所有文件被列出 ⇒ 要改 `tsconfig.node.json` 的
// `include`），而 `tsconfig.test.json` **也**编译 `vite.config.ts`，
// 于是写 `.ts` 扩展名又要在两个项目里各开一次 `allowImportingTsExtensions`。
// 两处配置改动只为搬一份纯数据，不划算。
//
// ⇒ 留在本文件：`vite.config.ts` 本来就是「构建期配置」的归属地，
//   而 `tests/scaffold/pwa-manifest.test.ts` **import 这个文件**
//   （`deployment-base.test.ts` 早就在 import 它）⇒ 判据与实装仍然是同一个对象，
//   不存在「正则刨源码」的第二份副本。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 部署前缀 —— `base` 与 manifest 的四组路径共用这一个常量。
 *
 * ⚠️ 守卫 **G121** 断言 `start_url` / `scope` / `id` / 每个 icon 的 `src`
 *   都由它派生。改部署路径只改这一处。
 */
export const DEPLOY_BASE = '/plantsgame/'

/** 图标路径（相对站点根，带 `DEPLOY_BASE` 前缀）。 */
function icon(file: string): string {
  return `${DEPLOY_BASE}icons/${file}`
}

/**
 * 📎 **Story 1.18 / AC-C5：`public/**` 全量内容哈希。**
 *
 * 这个 token 是「SW 换代」的判据 —— 它一变，运行时缓存的名字就变，
 * `sw/sw-rules.ts` 的 `staleCacheNames()` 就会把上一代的缓存删掉。
 *
 * ⚠️ **为什么必须哈希媒体文件，而不是只哈希代码**：
 *   录音与词图的 URL **永远稳定**（`u1-dog.mp3` / `u1-dog.svg`，按词条 id 命名），
 *   文件名里没有内容哈希 ⇒ 代码一行不动、只换一批图时，任何「由代码算出的版本号」
 *     都不会变 ⇒ `CacheFirst` 永远命中旧文件 ⇒ 孩子听到的是上一次的录音，
 *   页面上却没有任何东西看起来变了。Story 2.x 的每一次内容批次都会踩这个坑。
 *
 * ⚠️📎 **`[CR]` 2026-10-20：哈希范围从 `public/assets` 扩到 `public/` 全量** ——
 *   原范围只含 `public/assets`（录音 / 词图 / 塔图）。
 *   ⚠️ **漏了 `public/icons`（主屏图标，`.png`）与 `public/favicon.svg`** ——
 *     而 `sw/sw-rules.ts` 的 `isMediaPathname` 逐字把 `.png` 与 `.svg` 都算作**媒体**
 *     ⇒ 图标**进运行时缓存**、URL 不带内容哈希 ⇒ 换一批图标时 token 不变
 *     ⇒ 旧图标长期驻留 ⇒ **主屏图标永远是旧的**，而页面上没有任何东西看起来变了。
 *   ⇒ 范围必须是「**会被写进运行时缓存的一切**」，也就是 `public/` 全量。
 *
 * ⚠️ **为什么排序**：目录遍历顺序不保证稳定，不排序的话同一份内容两次构建
 *   可能算出两个不同的 token ⇒ 每次构建都「换代」，缓存永远命中不了。
 *
 * ⚠️ **路径也进哈希**：只哈希字节的话，把 `u1-dog.svg` 改名成 `u1-cat.svg`
 *   （字节相同）算不出变化。
 *
 * ⚠️📎 **`[CR]` 2026-10-20：目录不存在时不再抛** ——
 *   原实现用非递归的 `readdirSync` 直接调，目录不存在即抛
 *   ⇒ **新克隆 / CI / 资产尚未生成**的环境里，`vite.config.ts` 在**模块加载期**就崩
 *   ⇒ dev server 与 vitest **都起不来**，而报错信息指向 `readdirSync`（离源头很远）。
 *   ⇒ 现在：读不到的目录**跳过**，一个文件都没有时哈希一个固定哨兵
 *   （结果仍是 12 位十六进制，守卫 G128 的形状判据照样成立）。
 *
 * 实测：`public/` 下 92 个文件 / 1.8 MB，两次运行在 20ms 量级，
 * 相对 570ms 的构建可忽略。
 */
export function assetToken(dir: string): string {
  const files: string[] = []
  const walk = (current: string): void => {
    // `.sort()` 保证遍历顺序稳定 —— 见上方注释第三条。
    let names: string[]
    try {
      names = readdirSync(current).sort()
    } catch {
      // ⚠️ 目录不存在或读不到 ⇒ 跳过它，而不是让整个构建崩掉。
      return
    }
    for (const name of names) {
      const path = join(current, name)
      try {
        if (statSync(path).isDirectory()) walk(path)
        else files.push(path)
      } catch {
        // ⚠️ 竞态：遍历途中文件被删 / 权限变化 ⇒ 跳过这一条。
      }
    }
  }
  walk(dir)

  const hash = createHash('sha256')
  if (files.length === 0) {
    // ⚠️ 一个文件都没有 ⇒ 没有「内容」可版本化。哈希一个固定哨兵，
    //   让返回值仍是 12 位十六进制（G128 的形状判据按值形状写，不按来源写）。
    hash.update('plantsgame-empty-asset-tree')
    return hash.digest('hex').slice(0, 12)
  }
  for (const file of files) {
    hash.update(file.slice(dir.length))
    hash.update(readFileSync(file))
  }
  return hash.digest('hex').slice(0, 12)
}

/**
 * manifest 字段集 —— AC-B1 逐字列出的 11 项 + `lang`。
 *
 * ⚠️ **`id` 用 `/plantsgame/` 而不是绝对 URL**（裁决 8 逐字：相对站点根的稳定标识，
 *   换域名也不该失效）。绝对 URL 形式的 id 会让换域名后的同一个应用被浏览器当成
 *   **另一个**应用，孩子桌面上留下一个点开是空白页的旧图标。
 *
 * ⚠️ **`orientation: 'portrait'` 写进 manifest，但布局不许依赖它**（裁决 13）。
 *   公开资料对鸿蒙自带浏览器是否实现 W3C PWA 安装流程**互相矛盾**，
 *   且**没有任何一条证据表明 `orientation` 会被读取** ⇒ 照标准写全，
 *   同时竖屏布局本身必须用 `dvh` + 安全区在横屏下也活得下来。
 *
 * ⚠️ **色值全部取自已定稿 token，本文件不新增任何颜色**（R-12）：
 *   · `theme_color` ← `--color-hud-panel`（`#1f2d11`）：HUD 面板色，
 *     是「这个应用长什么样」最接近的颜色；
 *   · `background_color` ← `--color-bg`（`#7cb342`）：启动画面的底，
 *     语义上就是游戏的第一眼 —— 草地。
 *   裁决 10 逐字要求「取值必须与已定稿 token 对齐」，
 *   守卫 G122 把这两个 hex 钉回 `src/styles/tokens.css`。
 *
 * ⚠️ **字段清单在架构文档中不存在，是本 story 定案的**（AC-H2-④ 如实登记，
 *   不伪称「架构已定」）。
 */
export const pwaManifest = {
  name: 'PVZ Pixel 单词塔防',
  short_name: 'PVZ Pixel',
  description: '用英语单词挡住僵尸的回合制塔防 —— 面向 4 到 8 岁中文母语儿童。',
  lang: 'zh-CN',
  start_url: DEPLOY_BASE,
  scope: DEPLOY_BASE,
  id: DEPLOY_BASE,
  display: 'standalone' as const,
  orientation: 'portrait' as const,
  theme_color: '#1f2d11',
  background_color: '#7cb342',
  icons: [
    { src: icon('icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: icon('icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: icon('maskable-192.png'), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: icon('maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

/**
 * 📎 **Story 1.18：`vite-plugin-pwa` 的完整选项 —— 导出成常量，让守卫 import 同一个对象。**
 *
 * ⚠️ 与 `pwaManifest` 同一个理由：判据不该用正则去刨这份源码
 *   （同一个文件里还装着 `base`、`define`、`server` 与大段注释，正则既脆弱
 *   又只能证明「字符串出现过」，证明不了「值是对的」）。
 *
 * ⚠️ **为什么导出它比从 `plugins` 数组里刨更稳**：`VitePWA()` 返回的是
 *   **插件数组**，而选项并没有以可辨认的形式挂在插件对象上 ——
 *   守卫去 `find()` 某个 `name` 会依赖插件内部实现，改个版本就断。
 *
 * ⚠️ **用 `injectManifest` 而不是默认的 `generateSW`** —— 理由逐字写在
 *   `sw/sw.ts` 的文件头：AC-B7（mp3/svg 走 runtime CacheFirst）与
 *   AC-C5（换代时删旧 runtime cache）在 `generateSW` 下**无解**，
 *   因为它的 `GenerateSWOptions` 里没有自定义 `activate` 清理的钩子
 *   （实测只有 `cleanupOutdatedCaches`，只清 workbox 自己的 precache 缓存）。
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: 'injectManifest',
  srcDir: 'sw',
  filename: 'sw.ts',
  registerType: 'prompt',
  // ⚠️ **不用 `autoUpdate`**（AC-C2）：那个取值会 `skipWaiting` + `clientsClaim`
  // 并自动刷新 —— 直接违反「不得在游戏进行中强制刷新」。AC 要的是
  // 「有新版本，下次启动生效」，`prompt` 的 waiting 语义天然满足这一点
  // （`sw.ts` 里也刻意不调 `skipWaiting` / `clients.claim()`）。
  injectRegister: null,
  manifest: pwaManifest,
  injectManifest: {
    // ⚠️ **precache 只收应用外壳**（AC-B7）：html / js / css。
    //   媒体（mp3 / svg / png）由 `sw.ts` 的 fetch 处理器走运行时 `CacheFirst`，
    //   **不进 precache** —— 架构决策 6 逐字：「全量预载 400 张必超冷启动 3s」。
    //
    // ⚠️ **不含 `webmanifest`**：插件自己会把 manifest 作为一条 precache 记录
    //   加进去（实测 glob 里带上它时 `dist/sw.js` 的清单里
    //   `manifest.webmanifest` 出现了**两次**）。重复项会多一次 `cache.add`，
    //   虽不致错，但清单读起来像出了 bug。
    globPatterns: ['**/*.{html,js,css}'],
    // ⚠️ 显式排除媒体目录：`public/` 下的文件也会被 glob 扫到，
    //   不写这条的话 45 个 mp3 + 34 张 svg 会被一次性预载。
    globIgnores: ['**/assets/audio/**', '**/assets/words/**', '**/assets/towers/**'],
    // ⚠️ **`rollupFormat: 'iife'` 是刻意的**（实测默认是 `'es'`）：
    //   `'es'` 会产出 **module 类型**的 Service Worker，而 module 型 SW
    //   **Safari 与 Firefox 不支持**（Chromium 系才支持）。
    //   目标机型是鸿蒙（Chromium 内核）能跑，但 iife 是严格更兼容的那个，
    //   而这条改动的代价是零 —— 本文件没有任何动态 import 需求。
    rollupFormat: 'iife',
    // ⚠️ 不设 `maximumFileSizeToCacheInBytes`：媒体已按 glob 排掉，
    //   外壳四个文件全都远小于任何阈值，设了只是多一处需要解释的旋钮。
  },
}

/**
 * 📎 **Story 1.18 / AC-C5：`public/**` 的全量内容哈希。**
 *
 * ⚠️ **顶层 `define` 是唯一管用的位置**（实测 `VitePWAOptions` 没有 `define` 键，
 *   写在插件选项里 typecheck 当场红：TS2353）。
 *   `vite-plugin-pwa` 是在**同一次 Vite 构建内**打包 `swSrc` 的
 *   （实测它出现在 vite build 自己的 `✓ N modules transformed` 计数里）。
 *
 * ⚠️📎 **`[CR]` 2026-10-20：范围从 `public/assets` 扩到 `public/`** ——
 *   理由见 `assetToken()` 的注释第三条（图标也是媒体，也在运行时缓存里）。
 */
export const assetTokenValue: string = assetToken('public')

export default defineConfig({
  define: {
    __PWA_ASSET_TOKEN__: JSON.stringify(assetTokenValue),
  },
  // 应用挂在子路径 https://sunrong.site/plantsgame/ 下（Story 1.3 / AC-11）。
  //
  // ⚠️ 这不是可选的装饰。base 缺省 '/' 时有两处同源失效：
  //   ① `src/services/pronunciation.ts` 的 RECORDING_BASE_PATH 拼出的录音 URL
  //      指向 /assets/audio/voice/*，而真实路径在 /plantsgame/ 下
  //      ⇒ 每个录音必然 404，「预生成录音主通路」静默降级成设备 TTS，
  //        表现只是「音色偶尔不对」，极难归因；
  //   ② 构建产物的 JS/CSS 引用同样解析不到 ⇒ 部署后整页白屏。
  //
  // ⚠️ 📎 **Story 1.18 起这一行写的是常量 `DEPLOY_BASE`，不再写字面量** ——
  //   manifest 的 `start_url` / `scope` / `id` / 图标 `src` 四组路径都从它派生，
  //   写死字面量就会是五处各自为政的副本。
  //
  // 自定义域名根路径部署时，改 `DEPLOY_BASE` 这一处，并同步 vitest.config.ts 的 base
  // （tests/scaffold/deployment-base.test.ts 会断言两处一致 —— 不一致则守卫假绿）。
  base: DEPLOY_BASE,
  plugins: [vue(), VitePWA(pwaOptions)],
  server: {
    // AC-1 要求「平板浏览器能访问开发服务器」。Vite 默认只监听 localhost，
    // 平板输入 http://<开发机IP>:5173 会直接连不上。
    host: true,
    // 放开 Host header 校验是自用局域网场景的合理选择（AC-1 要求平板能访问开发服务器）。
    //
    // ⚠️ 真实的理由不是「本项目无后端、无遥测」—— 暴露面是 Vite dev server 本身：
    // 它会提供 /src/** 源码、/@fs/ 下的文件、以及 HMR websocket，而 allowedHosts: true
    // 关掉的正是 Vite 为防 DNS rebinding 加的那道校验。所以这条配置的前提是
    // 「开发机不直接暴露在公网」而不是「应用没有后端」。
    //
    // 若将来开发机需要被公网访问、或引入任何需要防跨站请求的机制，此处必须收回。
    allowedHosts: true,
  },
})
