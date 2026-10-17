/// <reference types="vite/client" />
/**
 * PWA manifest 与 index.html 接线的守卫（Story 1.18 / AC-B1、AC-B2、AC-B3、AC-B9、AC-F4、AC-H2-④）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * 要守的死法有两条，都是「静默」的那一种：
 *
 * ① **前缀漏掉 `/plantsgame/`**。`base` 已是 `/plantsgame/`（`deployment-base.test.ts`
 *    守着），而 manifest 的 `start_url` / `scope` / `id` 是**另一套**路径，
 *    不跟着 `base` 自动走 ⇒ 三处漏前缀时构建全绿、测试全绿，
 *    后果是「添加到主屏后启动落到站点根」或「SW 注册直接抛 `SecurityError`」
 *    （`ScopeError: The URL ... is outside the scope of the registered script`）。
 *    决策依据逐字：`manifest 的 start_url/scope/id 与 SW scope 必须同前缀`。
 *
 * ② **`theme-color` 是空的**。`index.html` 里它是 `content=""`，
 *    而 standalone 模式下它就是浏览器地址栏/任务栏的品牌色 ⇒ 空值会让
 *    PWA 以浏览器默认色启动，孩子看到的是「一个网页」而不是「一个游戏」。
 *
 * ── 为什么 manifest 住在 `vite.config.ts` 里（而不是 `src/` 的某个模块）─────────
 * 试过住在 `src/app/pwa-manifest.ts`，**实测撞到两个配置改动**：
 * `TS6307`（composite 项目要求所有文件被列出 ⇒ 要动 `tsconfig.node.json` 的
 * `include`），而 `tsconfig.test.json` 也编译 `vite.config.ts`，
 * 于是写 `.ts` 扩展名又要在两个项目里各开一次 `allowImportingTsExtensions`。
 * ⇒ 留在配置文件里。关键点不变：**本测试 import 的是那个对象本身**，
 *   不是对它做正则匹配，所以判据与实装不可能漂（R-37 的同源原则）。
 *
 * ── 判据为什么必须带反向自测 ──────────────────────────────────────────────
 * `expect(Object.keys(m).sort()).toEqual([...])` 这种「白名单相等」判据，
 * 一旦有人往 manifest 里加了字段就会红 —— 但如果它写成 `toMatchObject` 就永远绿。
 * 本文件在 G121 里对**前缀**用的是**等值**比对而不是 `toContain`，
 * M143（把 `start_url` 的前缀去掉）就是靠它变红的。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import viteConfig, { DEPLOY_BASE, pwaManifest } from '../../vite.config'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')

/** manifest 里必须齐全的字段（B1 逐字列出的 11 项 + 两项语言类）。 */
const REQUIRED_FIELDS = [
  'background_color',
  'description',
  'display',
  'icons',
  'id',
  'lang',
  'name',
  'orientation',
  'scope',
  'short_name',
  'start_url',
  'theme_color',
] as const

// ── G120 —— manifest 字段齐全 ─────────────────────────────────────────────

describe('G120 —— PWA manifest 字段齐全（Story 1.18 / AC-B1）', () => {
  it('十一个必填字段一个都不少，且不多不少', () => {
    expect(
      Object.keys(pwaManifest).sort(),
      'manifest 字段集与 AC-B1 列出的清单不一致 —— 少一个字段浏览器会静默用默认值，多一个字段是无意写入的漂移',
    ).toEqual([...REQUIRED_FIELDS])
  })

  it('每个必填字段都有非空字符串值（空串等于没写）', () => {
    for (const field of REQUIRED_FIELDS) {
      if (field === 'icons') continue
      const value: unknown = pwaManifest[field]
      expect(
        typeof value === 'string' && value.length > 0,
        `manifest.${field} 是空的 —— 浏览器会静默用默认值，应用看起来就不像这个游戏。` +
          `本次 story 的已知空值是 theme-color（index.html 里本来就是 content=""）。`,
      ).toBe(true)
    }
  })

  it('icons[] 含 192、512 两档，且各有一张 maskable', () => {
    const icons = pwaManifest.icons
    expect(Array.isArray(icons), 'manifest.icons 必须是数组，否则浏览器拿不到任何图标').toBe(true)

    const sizes = icons.map((icon) => icon.sizes)
    for (const size of ['192x192', '512x512']) {
      expect(
        sizes,
        `icons[] 缺 ${size} —— 安装横幅与启动画面按这两个尺寸选图，缺了会退化成浏览器默认图标`,
      ).toContain(size)
    }

    for (const size of ['192x192', '512x512']) {
      expect(
        icons.filter((icon) => icon.sizes === size && icon.purpose === 'maskable').length,
        `icons[] 缺 ${size} 的 maskable 图 —— 安卓按系统形状裁切时，非 maskable 图会被裁掉主体`,
      ).toBeGreaterThan(0)
    }
  })
})

// ── G121 —— manifest 的路径前缀与 base 同源 ───────────────────────────────

describe('G121 —— manifest 前缀与 base 同源（Story 1.18 / AC-B2、裁决 8）', () => {
  it('DEPLOY_BASE 与 vite.config 的 base 逐字一致', () => {
    expect(
      DEPLOY_BASE,
      'pwa-manifest 的 DEPLOY_BASE 与 vite.config 的 base 不一致 —— 两处独立各写一遍，' +
        '改了一处忘了另一处时构建全绿、部署后白屏或 SecurityError',
    ).toBe(viteConfig.base)
  })

  it('start_url / scope / id 三者逐字等于 DEPLOY_BASE', () => {
    // ⚠️ 这是**等值**比对，不是 `toContain`。
    //   M143（把 start_url 的前缀去掉）必须靠它变红 —— 用 `toContain(DEPLOY_BASE)`
    //   的话，去掉前缀会变成 false 而不是「另一个值」，这条会红；反过来若有人写成
    //   `expect(start_url).toContain('plantsgame')`，去前缀后仍可能命中别的字面量。
    //   等值是这里唯一无歧义的判据。
    for (const field of ['start_url', 'scope', 'id'] as const) {
      expect(
        pwaManifest[field],
        `manifest.${field} 没有逐字等于 base（${DEPLOY_BASE}）—— ` +
          `漏前缀的后果：start_url 落到站点根、id 跨域名失效、SW 注册抛 SecurityError`,
      ).toBe(DEPLOY_BASE)
    }
  })

  it('id 是相对站点根的稳定标识，不是绝对 URL', () => {
    // ⚠️ 决策原文：`id` 用 `/plantsgame/`（**相对站点根的稳定标识**，不是绝对 URL
    //   —— 换域名也不该失效）。绝对 URL 形式的 id 会让同一个应用在换域名后
    //   被浏览器当成「另一个应用」，旧的那个条目留在桌面上。
    expect(
      pwaManifest.id,
      'manifest.id 必须是相对路径而不是绝对 URL —— 绝对 URL 在换域名后会让同一个应用被当成另一个',
    ).not.toMatch(/^https?:\/\//)
  })

  it('每个 icon 的 src 都带 base 前缀', () => {
    for (const icon of pwaManifest.icons) {
      expect(
        icon.src.startsWith(`${DEPLOY_BASE}icons/`),
        `图标 ${icon.src} 没有带 ${DEPLOY_BASE} 前缀 —— 部署到子路径下 404，图标静默消失`,
      ).toBe(true)
    }
  })
})

// ── G122 —— index.html 的 theme-color 与 manifest 同值 ────────────────────

describe('G122 —— index.html 的 theme-color 与 manifest 同值（Story 1.18 / AC-B3、裁决 10）', () => {
  it('index.html 的 theme-color 非空', () => {
    // 剥注释后再扫：`content=""` 那段说明「theme-color 仍留空」的注释里
    // 也可能出现 `content=""` 字样，不剥会读到注释里的那份（R-52）。
    const code = stripComments(indexHtml)
    const meta = code.match(/<meta\s[^>]*name="theme-color"[^>]*>/)
    expect(meta, 'index.html 里没有 theme-color 的 meta 标签 —— standalone 模式缺它，地址栏用浏览器默认色').not.toBeNull()
    expect(
      meta![0],
      'theme-color 仍是空字符串 —— 它是 standalone 模式下地址栏/任务栏的品牌色，空值等于没配',
    ).not.toMatch(/content=""/)
  })

  it('index.html 的 theme-color 与 manifest.theme_color 同值', () => {
    const code = stripComments(indexHtml)
    const value = code.match(/<meta\s[^>]*name="theme-color"[^>]*content="([^"]*)"/)?.[1]
    expect(
      value,
      'index.html 的 theme-color 与 manifest.theme_color 不同值 —— ' +
        '同一个应用在「安装横幅」「地址栏」「启动画面」三处会露出两种品牌色',
    ).toBe(pwaManifest.theme_color)
  })

  it('theme-color 取值是 tokens.css 里已定稿的 token 值，不是随手填的色值（裁决 10 / R-12）', () => {
    const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8')
    const tokenValues = new Set(
      [...tokens.matchAll(/--color-[a-z-]+:\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => m[1].toLowerCase()),
    )
    // theme-color 会同时出现在 index.html 与 manifest 里，所以它自己也必须在
    // tokens.css 里有一份定稿值 —— 否则「随手填一个会被后续 story 当成已定稿继承」
    // 这个风险原封不动地留在下游（裁决 10 逐字）。
    expect(
      tokenValues.has(pwaManifest.theme_color.toLowerCase()),
      `theme_color ${pwaManifest.theme_color} 不是 tokens.css 里任何一个已定稿的 --color-* 值 —— ` +
        '裁决 10 要求它与 docs/art-direction.md §2 的定稿色板对齐',
    ).toBe(true)
    expect(
      tokenValues.has(pwaManifest.background_color.toLowerCase()),
      `background_color ${pwaManifest.background_color} 不是 tokens.css 里任何一个已定稿的 --color-* 值`,
    ).toBe(true)
  })
})
