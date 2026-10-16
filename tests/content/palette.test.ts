/**
 * 色板的守卫（Story 1.6 / AC-23、AC-24）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 色板写在 `docs/art-direction.md` 第 2 节、`src/styles/tokens.css` 落 CSS 变量。
 * 文档里的「三个塔型肉眼可分」「白字对比度够」这类断言，如果只存在于文档里，
 * 下一个人改色值时没有任何东西会响 —— 而**三塔型不可分**正是 Story 1.7 的硬要求
 * （孩子要能看出哪株是减速塔、哪株是范围塔）。
 *
 * 所以这里把可判定的部分按 WCAG 相对亮度公式**实算**：
 * 1. 架构 `:508-531` 承诺的 11 个变量名一个都不能少（少一个 = 承诺落空）。
 * 2. 三个塔型两两**色相间隔 ≥ 60°**（主机制，见下方「为什么色相也要查」）。
 * 3. 每个塔与草地底色对比 ≥ 3:1 —— 塔种在草地上，必须看得见。
 * 4. 塔面文字对比度 ≥ 4.5:1，且**三个塔一条规则**（不给某一格开特例）。
 * 5. 僵尸与路径/草地的对比、路径与草地的对比、答对/答错的色相间隔。
 *
 * ── 为什么没有「塔与塔的对比度 ≥ 3:1」这条 ────────────────────────────────
 * 它**在当前色域里做不到**：要求每个塔与草地 ≥3:1，就等于把三个塔都压进
 * L ≤ 0.09 的深色区；而深色区内任意两色对比要够 3:1，需要明度跨度 9 倍
 * （例 0.087 → 0.039 → 0.004），现实中第三个色只能是近黑 —— 那不是「塔」，
 * 而且近黑的塔与路径、阴影全都糊在一起。
 * ⇒ 塔与塔的区分**只能靠色相**，这与「孩子靠颜色认出植物」的直观也一致。
 *   代价是明确的：灰度打印或完全色觉障碍下三塔不可分 ——
 *   已作为已知限制写进 `docs/art-direction.md` §2，Story 1.7 的美术必须
 *   额外提供形状/轮廓差异来兜底，这条写进了该文档而不是藏在这里。
 *
 * ── 为什么色相也要查 ──────────────────────────────────────────────────────
 * 对比度公式只看明度，对**同明度**的颜色会给出「很好」的评价，
 * 而孩子分辨「蓝塔」和「紫塔」靠的正是色相。两条轴分开查，缺一条都会漏掉一类退化。
 *
 * ── 为什么读 tokens.css 而不是 import CSS ─────────────────────────────────
 * Vitest 跑在 node 环境（没有 DOM），CSS 变量也没有可执行的语义。
 * 求值文件里的 `--color-*` 声明既不引依赖，又能保证「文档/变量/测试」三处同源。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const tokensSrc = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
)

/** 从 tokens.css 里取出某个自定义属性的字面文本（未做颜色解析，只取原样字符串）。 */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensSrc)
  expect(m, `tokens.css 里没有 --${name} —— 架构 :508-531 承诺的 token 清单少了一项`).not.toBeNull()
  return (m?.[1] ?? '').trim()
}

/** `#rgb` / `#rrggbb` → [r, g, b]。非 hex 的 token（rgba）返回 null。 */
function rgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (m?.[1] === undefined) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** sRGB 通道 → 线性亮度（WCAG 定义）。 */
function linear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** 相对亮度 L。 */
function luminance(hex: string): number {
  const v = rgb(hex)
  if (v === null) throw new Error(`不是 hex 色值，无法计算亮度：${hex}`)
  return 0.2126 * linear(v[0]) + 0.7152 * linear(v[1]) + 0.0722 * linear(v[2])
}

/** WCAG 对比度，恒 ≥ 1。 */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (la + 0.05) / (lb + 0.05)
}

/** 色相（0..360）。灰度色（饱和度 0）返回 null —— 它们没有色相可用。 */
function hue(hex: string): number | null {
  const v = rgb(hex)
  if (v === null) return null
  const [r, g, b] = v.map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return null
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return (h + 360) % 360
}

/** 两个色相之间的最小夹角（考虑 0°/360° 的回绕）。 */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const ARCH_PROMISED_TOKENS = [
  'color-bg',
  'color-path',
  'color-tower-shooter',
  'color-tower-slow',
  'color-tower-aoe',
  'color-zombie',
  'color-sun',
  'color-heart',
  'color-correct',
  'color-wrong',
  'color-overlay-range',
] as const

describe('AC-23 —— 架构承诺的 token 一个都不能少', () => {
  it.each(ARCH_PROMISED_TOKENS)('--%s 已在 tokens.css 里定稿', (name) => {
    const value = token(name)

    expect(value, `--${name} 的值是空的 —— 留空会被后续 story 当成「已定稿」继承`).not.toBe('')
  })

  it('三个塔型的色值都是可计算的 hex（能进对比度公式）', () => {
    for (const name of ['color-tower-shooter', 'color-tower-slow', 'color-tower-aoe']) {
      expect(rgb(token(name)), `--${name} 不是 hex，色板校验就绕过了它`).not.toBeNull()
    }
  })
})

describe('AC-23 —— 三个塔型肉眼可分（Story 1.7 的硬要求）', () => {
  const TOWERS = ['color-tower-shooter', 'color-tower-slow', 'color-tower-aoe'] as const

  const pairs: [string, string, string][] = [
    ['color-tower-shooter', 'color-tower-slow', '直射 vs 减速'],
    ['color-tower-shooter', 'color-tower-aoe', '直射 vs 范围'],
    ['color-tower-slow', 'color-tower-aoe', '减速 vs 范围'],
  ]

  it.each(pairs)('%s 的色相间隔 ≥ 60°', (a, b, label) => {
    const ha = hue(token(a))
    const hb = hue(token(b))
    expect(ha, `${label}：${a} 是灰度色，没有色相可用`).not.toBeNull()
    expect(hb, `${label}：${b} 是灰度色，没有色相可用`).not.toBeNull()

    const gap = hueGap(ha as number, hb as number)

    expect(
      gap,
      `${label} 的色相只差 ${gap.toFixed(0)}°（${token(a)} vs ${token(b)}）—— ` +
        '对比度只看明度，两个同样暗的颜色会拿到「对比度很好」的假结论，' +
        '而孩子分辨它们靠的正是色相',
    ).toBeGreaterThanOrEqual(60)
  })

  it.each(TOWERS)('%s 在草地上看得见（对比 ≥ 3:1）', (name) => {
    const ratio = contrast(token(name), token('color-bg'))

    expect(
      ratio,
      `${name}（${token(name)}）与草地（${token('color-bg')}）只有 ${ratio.toFixed(2)}:1 —— ` +
        '塔种在草地上，孩子看不见自己刚建了什么',
    ).toBeGreaterThanOrEqual(3)
  })

  // ── [CR] 2026-10-14：阈值余量护栏 ────────────────────────────────────────
  //
  // 为什么要有这一条：阈值「≥60°」「≥3:1」守的是**下限**，而色值是**连续可调**的。
  // 贴着阈值的色值意味着一改就红 —— 而人看到测试红了的第一反应是松阈值，
  // 于是守卫被静默拆掉、文档也不改。护栏要求色值离阈值留出可观余量，
  // 把「调色」和「调阈值」这两件事在成本上分开。
  it.each(pairs)('%s 的色相间隔除了 ≥60°，还要留出余量（≥62°）', (a, b, label) => {
    const gap = hueGap(hue(token(a))!, hue(token(b))!)

    expect(
      gap,
      `${label} 的色相间隔只有 ${gap.toFixed(1)}°（阈值 60°）—— 改一个 hex 位就会红，` +
        '而看到测试红了去松阈值，会把这个守卫静默拆掉。请调色值，不要动阈值。',
    ).toBeGreaterThanOrEqual(62)
  })

  it.each(TOWERS)('%s 对草地的对比除了 ≥3:1，还要留出余量（≥3.3:1）', (name) => {
    const ratio = contrast(token(name), token('color-bg'))

    expect(
      ratio,
      `${name}（${token(name)}）对草地只有 ${ratio.toFixed(2)}:1（阈值 3:1）—— ` +
        '余量不足 0.3 时改一个 hex 位就红。请调色值，不要动阈值。',
    ).toBeGreaterThanOrEqual(3.3)
  })

  // ── [CR] 2026-10-14：`--color-sun` 的显式例外 ───────────────────────────
  //
  // 它是**唯一**一个不在草地上、也不在路径上的棋盘元素，且必须保持「亮」才像阳光。
  // 草地 L = 0.369，要对它达到 3:1 需要 L_sun ≥ 1.208（数学上不可能）或
  // L_sun ≤ 0.090（那是深棕，不叫阳光）。所以这条判据**在数学上不可达**，
  // 硬套 3:1 只会逼着人把阳光改成深棕 —— 那是拿一个可达的坏方案换一条错的规则。
  // 改按色相间隔查：阳光黄 48.9° vs 草地绿 89.2°，间隔 40.3°，肉眼分得开。
  it('阳光是草地上唯一不适用 3:1 的元素，且按色相间隔 ≥30° 查（见上方理由）', () => {
    const sunHue = hue(token('color-sun'))
    const bgHue = hue(token('color-bg'))
    expect(sunHue, '阳光是灰度色，没有色相可用 ⇒ 无法按间隔判可分性').not.toBeNull()
    expect(bgHue, '草地是灰度色，没有色相可用').not.toBeNull()

    const gap = hueGap(sunHue!, bgHue!)
    expect(
      gap,
      `阳光与草地只差 ${gap.toFixed(1)}° —— 黄绿两色在色环上贴太近，孩子看不见阳光浮尘`,
    ).toBeGreaterThanOrEqual(30)
  })

  it('阳光的对比度保底 ≥1.5:1（防止有人把阳光调成草地色而「无懈可击地」豁免掉）', () => {
    const ratio = contrast(token('color-sun'), token('color-bg'))

    expect(
      ratio,
      `阳光对草地只有 ${ratio.toFixed(2)}:1 —— 例外判据是色相，不是「随便什么亮度都行」`,
    ).toBeGreaterThanOrEqual(1.5)
  })

  it('三个塔型互不重合（名字与色值一一对应，不是一套渐变）', () => {
    const values = TOWERS.map((name) => token(name))

    expect(new Set(values).size, '两个塔型用了同一个色值').toBe(3)
  })

  it('三个塔型与僵尸的色相都不重合（僵尸不长得像任何一种塔）', () => {
    for (const name of TOWERS) {
      const gap = hueGap(hue(token(name)) as number, hue(token('color-zombie')) as number)

      expect(gap, `${name} 与僵尸只差 ${gap.toFixed(0)}° —— 僵尸看起来像塔`).toBeGreaterThanOrEqual(60)
    }
  })
})

describe('AC-23 —— 塔面上的字读得出来', () => {
  it.each(['color-tower-shooter', 'color-tower-slow', 'color-tower-aoe'])(
    '%s 上的白字 ≥ 4.5:1（三个塔一条规则，不开特例）',
    (name) => {
      const ratio = contrast(token('color-on-tower'), token(name))

      expect(
        ratio,
        `塔面文字（${token('color-on-tower')}）在 ${name}（${token(name)}）上只有 ` +
          `${ratio.toFixed(2)}:1 —— 塔上的英文单词读不出来，而认读质量正是本作的核心指标之一`,
      ).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('塔面文字色就是白（别让它悄悄变成某个别的色再「单独调某一格」）', () => {
    expect(
      token('color-on-tower').toLowerCase(),
      '塔面文字色变了 —— 要么改 art-direction §2 的规格，要么所有塔一起改，不要只改某一格',
    ).toBe('#ffffff')
  })
})

describe('AC-23 —— 其余元素与反馈色两两可辨', () => {
  it('僵尸在路径上一眼可见（对比 ≥ 3:1）', () => {
    const ratio = contrast(token('color-zombie'), token('color-path'))

    expect(
      ratio,
      `僵尸（${token('color-zombie')}）与路径（${token('color-path')}）只有 ${ratio.toFixed(2)}:1 —— ` +
        '孩子在路径上找不到僵尸，「还剩几只没解决」这件事就变成猜',
    ).toBeGreaterThanOrEqual(3)
  })

  it('僵尸压在草地上也仍可见（相邻格子的边界会露出来）', () => {
    const ratio = contrast(token('color-zombie'), token('color-bg'))

    expect(ratio, `僵尸与草地只有 ${ratio.toFixed(2)}:1 —— 走到草地那一格就看不清了`).toBeGreaterThanOrEqual(3)
  })

  it('路径与草地分得开（否则僵尸「走在草地上」，行进路径这条信息消失）', () => {
    const ratio = contrast(token('color-path'), token('color-bg'))

    // 门槛取 1.5 而不是 3.0：两块各有几十像素高的**区域**，
    // WCAG 1.4.11 的 3:1 是给小元件/图形边界的；区域边界靠位置已经分得开，
    // 这里的诉求只是「一眼看出路径不是草地」。
    expect(ratio, `路径与草地只有 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.5)
  })

  it('答对 / 答错色相隔 ≥ 90°（它们永远成对出现，必须一眼分开）', () => {
    const gap = hueGap(hue(token('color-correct')) as number, hue(token('color-wrong')) as number)

    expect(
      gap,
      `答对/答错色相只差 ${gap.toFixed(0)}° —— 孩子分不清自己是被夸了还是做错了`,
    ).toBeGreaterThanOrEqual(90)
  })

  it('答对 / 答错不是同一个颜色的深浅版', () => {
    const delta = Math.abs(luminance(token('color-correct')) - luminance(token('color-wrong')))

    expect(delta, '两个反馈色的明度几乎相同，只靠色相区分 —— 加上深浅这条保险是有意的').toBeGreaterThan(0.03)
  })

  it('阳光是全盘最亮的资源色，与棋盘上的威胁一眼可分', () => {
    for (const name of ['color-zombie', 'color-tower-aoe']) {
      const gap = hueGap(hue(token('color-sun')) as number, hue(token(name)) as number)
      const delta = Math.abs(luminance(token('color-sun')) - luminance(token(name)))

      // 「色相隔开」或「明度隔开」任一成立即可 —— 阳光与溅射塔的色相差 24°，
      // 正好卡在 20° 门槛边上；两条轴只要有一条拉开就够了。
      expect(
        gap >= 20 || delta >= 0.3,
        `--color-sun 与 ${name} 色相只差 ${gap.toFixed(0)}°、明度只差 ${delta.toFixed(2)} —— ` +
          '阳光与它在盘上分不开（要色相隔 ≥20° 或明度差 ≥0.3）',
      ).toBe(true)
    }
  })

  it('射程高亮是半透明的中性色（不是某个色相，否则会与所属塔的主色打架）', () => {
    const value = token('color-overlay-range')

    expect(value, '射程高亮必须是半透明的 —— 不透明就盖住了路径，僵尸走哪条路看不见了').toMatch(
      /rgba?\(.+,\s*0?\.\d+\)$/,
    )
  })

  /**
   * ⚠️ `[CR]` 2026-10-16（Story 1.10）：上面那条判据此前**只覆盖 `color-overlay-range`
   * 一条**，而 1.10 新增了 `--color-overlay-blocked`、1.12 新增了
   * `--color-overlay-inert` —— 两条罩层 token 都进了 `tokens.css`，
   * **都没有任何断言**。
   *
   * AC-5 的原文是「新增 token（如血条颜色）须走 `palette.test.ts` 的实算，
   * 不得手写 hex」。当时对这两条的处置是「它们是半透明层，不进对比度公式」，
   * 这个处置本身是对的 —— 但**处置要有守卫兜着**，否则半年后有人把
   * `rgba(0,0,0,0.18)` 改成不透明，它就变成「底色」而没有一条测试会红。
   *
   * 上面那条注释正是这么写的（「若将来改成不透明……必须移进实算集」），
   * **而它指向的 G14b 从来不存在** —— 指针是个空壳。
   * ⇒ 这里把三条罩层 token 一起断言「必须仍是半透明」，
   * 让「改成不透明」当场变红而不是靠注释提醒。
   */
  it.each([
    ['color-overlay-range', '射程高亮'],
    ['color-overlay-blocked', '房子格 / 入场格的压暗罩（1.10）'],
    ['color-overlay-inert', '非僵尸行的压暗罩（1.12）'],
  ])('%s（%s）必须仍是半透明 —— 改成不透明它就不再是「罩」而是「底色」', (name) => {
    expect(token(name as string), `${name} 必须是半透明 rgba`).toMatch(/rgba?\(.+,\s*0?\.\d+\)$/)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// AC-11 —— `--color-asset-stroke` 的两条判据（Story 1.7 裁决 1）
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ **为什么这两条必须在这里，而不是只写在 `docs/art-direction.md` 里：**
//
// Story 1.7 的裁决 1 判掉「描边 vs 草地 ≥ 3:1」这条判据，**全部理由**是
// 「判据 2/3 才是兜底机制本身，描边与塔身同色时剪影边界消失」。
// 而 `[CR]` 2026-10-14 实测发现：**判据 2/3 一条守卫都没有** ——
// 把 `--color-asset-stroke` 改成 `#336699` 并同步改 4 个 SVG 的字面 hex，
// 全部测试仍全绿、`validate:content` exit 0，而三条对比度从
// 9.68 / 9.39 / 9.20 / 7.87 掉到 1.61 / 1.57 / 1.53 / 1.31。
//
// **用来正当化「放弃一条规则」的那条规则，自己可以悄悄消失** —— 这是本项目
// 反复吃亏的形态（memory：「守卫断言允许了它要防的违规」）。补上。

describe('AC-11 —— 描边色的两条判据（裁决 1 的兜底机制本身）', () => {
  /** 判据 2/3 的门槛。取 3 是 AC-11 的原值；这里留 1.0 余量以吸收实算误差。 */
  const STROKE_MIN_CONTRAST = 3

  const STROKE_AGAINST = ['color-tower-shooter', 'color-tower-slow', 'color-tower-aoe', 'color-zombie']

  it.each(STROKE_AGAINST)('描边 vs --%s ≥ 3:1 —— 描边糊进主体时剪影边界消失，AC-5 的兜底当场作废', (name) => {
    const stroke = token('color-asset-stroke')
    const ratio = contrast(stroke, token(name))

    expect(
      ratio,
      `--color-asset-stroke（${stroke}）对 --${name}（${token(name)}）只有 ${ratio.toFixed(2)}:1，` +
        `低于 ${STROKE_MIN_CONTRAST}:1。⚠️ 这正是 Story 1.7 裁决 1 用来放弃「判据 1」的` +
        '全部理由 ——「判据 2/3 才是兜底机制本身」。改了描边色就必须同步改 4 个 SVG 的' +
        '字面 hex，否则 G3/G4 会红；但**那些断言只管色值同源，管不了对比度**。',
    ).toBeGreaterThanOrEqual(STROKE_MIN_CONTRAST)
  })

  it('描边对草地的对比度记为「判据不成立」，不是「忘了查」', () => {
    // ⚠️ AC-11 判据 1 的**前提**是描边与草地相邻，而本项目描边画在轮廓内侧，
    // 永远不挨着草地（外缘由塔身对草地 3.86:1 守着）。前提不成立 ⇒ 判据不适用。
    // 这条断言守的是「有人明确知道它不适用」，而不是「它达标」。
    const ratio = contrast(token('color-asset-stroke'), token('color-bg'))

    expect(
      ratio,
      `描边对草地是 ${ratio.toFixed(2)}:1 —— 若将来把描边挪到轮廓**外侧**，` +
        '判据 1 立刻恢复成立性，必须重算并把 3:1 补回。' +
        '在那之前 docs/art-direction.md §2 记的是「判据不成立」，不是「已达标」。',
    ).toBeLessThan(3)
  })

  it('描边是浅色 —— 三塔底色都在 L 0.058–0.064，深色描边必然糊进塔身', () => {
    const strokeL = luminance(token('color-asset-stroke'))

    expect(
      strokeL,
      `描边的相对亮度是 ${strokeL.toFixed(3)} —— AC-11 实算过，描边要同时离草地与三塔都够远，` +
        '只能落在浅色区（L ≈ 0.7+）。**不要为了「看起来自然」把描边调暗**，那会直接废掉判据 2。',
    ).toBeGreaterThan(0.5)
  })
})

/**
 * Story 1.13 新增的 `--color-hud-panel` —— 裁决 8 的推导在这条 describe 里**变成守卫**。
 *
 * ── 为什么推导必须落成测试 ────────────────────────────────────────────────
 *   `tokens.css` 里那段推导是**注释**，而注释不会被任何人执行。
 *   没有守卫的话，「把面板调亮一点让它更透气」是一次毫无阻挡的改动：
 *   心红在调亮后的底上会直接跌破 3:1，而孩子看到的只是「HUD 变好看了」。
 *
 * ── 三条判据分别锁住推导的三个步骤 ────────────────────────────────────────
 *   ① 面板必须**足够暗**：阳光黄要 3:1 ⇒ L ≤ 0.2008（实测 L = 0.0221）
 *   ② 面板必须**不太暗**也不是草地色：否则 HUD 会从「暗底」退化成「另一种绿」，
 *      而 `--color-sun` 的 `[CR]` 收窄注释正是按「深色底面」写的
 *   ③ 前景三项在面板上全部达标（阳光 / 心 / 白字）
 *
 * ⚠️ 阈值写成 3.0（WCAG 1.4.11 非文本）/ 4.5（正文），不是当前实测值的逐位相等 ——
 *   逐位相等会在「把面板调深一格」这种**无害**的改动上报红，久而久之逼着人松阈值，
 *   而松掉的正是那条保护线（`tokens.css` 开头 `[CR] 2026-10-14` 记的就是这件事）。
 */
describe('Story 1.13 裁决 8 —— HUD 面板的三个前景在它上面都必须达标', () => {
  it('面板存在且是不透明的 hex（半透明底板的对比度取决于背后是谁）', () => {
    const panel = token('color-hud-panel')

    expect(panel, 'HUD 面板必须是 6 位 hex —— rgba 的对比度会随背后的元素漂移').toMatch(
      /^#[0-9a-f]{6}$/i,
    )
  })

  it('面板足够暗：阳光黄在它上面 ≥ 3:1（推导步骤 ①）', () => {
    const ratio = contrast(token('color-sun'), token('color-hud-panel'))

    expect(ratio).toBeGreaterThanOrEqual(3)
  })

  it('心红在它上面 ≥ 3:1 —— 这条是整块面板深度的**决定性约束**（推导步骤 ②）', () => {
    // ⚠️ 心红自身 L ≈ 0.198，要够 3:1 需面板 L ≤ 0.0328 ⇒ 面板必须是近黑。
    //   这一条红了就说明面板被调亮了，而 `--color-heart` 是 AC-D3 点名的必用色。
    const ratio = contrast(token('color-heart'), token('color-hud-panel'))

    expect(
      ratio,
      `心红落在面板上只有 ${ratio.toFixed(2)}:1 —— AC-D3 要求 HUD 用 --color-heart，` +
        '面板一旦调亮就跌破 WCAG 非文字 3:1。**不要为了「透气」把它调亮**。',
    ).toBeGreaterThanOrEqual(3)
  })

  it('白字在它上面 ≥ 4.5:1（进度条标签走白字，走的是正文门槛）', () => {
    const ratio = contrast('#ffffff', token('color-hud-panel'))

    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('面板与草地必须分得开（HUD 是压在草地上的，不是草地的延伸）', () => {
    const ratio = contrast(token('color-hud-panel'), token('color-bg'))

    expect(ratio, '面板与草地几乎同色 —— HUD 会与战场糊成一片').toBeGreaterThanOrEqual(3)
  })

  it('答对 / 答错色在面板上**不达标** —— 所以进度条不许用它们（裁决 8 的连带结论）', () => {
    // ⚠️ 这是一条**反向**守卫：它记的是「这两个 token 在这块面板上不可用」。
    //   将来若面板被调到足够亮，它们可能达标 —— 那时这条会红，
    //   提示你「可以去改 ProgressBar 的配色了」，而不是默默放过一个仍在用的违规。
    const correct = contrast(token('color-correct'), token('color-hud-panel'))
    const wrong = contrast(token('color-wrong'), token('color-hud-panel'))

    expect(correct).toBeLessThan(3)
    expect(wrong).toBeLessThan(3)
  })

  it('🚨 探测棒自检：这三项在**别的**底色上确实会翻（否则上面几条可能恒真）', () => {
    // 心红在卡面米色上 2.68:1、阳光黄在草地上 1.79:1 —— 都是真实存在的失败形态。
    expect(contrast(token('color-heart'), token('color-path'))).toBeLessThan(3)
    expect(contrast(token('color-sun'), token('color-bg'))).toBeLessThan(3)
  })
})
