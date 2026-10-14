/**
 * 资产守卫（Story 1.7 / AC-16 的 G1–G6，外加 §3.4 / §3.5 / §3.6 三条机器判据）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · G1 塔/僵尸文件集合「恰好等于」预期（多一个、少一个都红）—— AC-1 / AC-2 / FR70
 * · G2 四张 SVG 的几何规格（`viewBox` / `512×512` / 透明底）—— AC-3 / AC-14.2
 * · G3 主体填充色 === `tokens.css` 里对应 token 的**字面字符串** —— AC-4
 * · G4 SVG 内不出现 token 之外的 hex —— AC-4 / AC-13
 * · G5 **三塔结构签名两两不等** —— AC-5（本文件存在的主要理由）
 * · G6 30 张词图的几何规格 —— 补 `docs/art-direction.md` §1 的假绿
 * · G9 §3 的适用范围（`[CC]` 2026-10-14 裁决：**§3.2–§3.7 只约束塔与僵尸，
 *   词图只受 §3.1**）—— 变异 M12 / M13 / M14
 * · §3.4 留白 ≥ 8% 画布边长、§3.5 重心 ±6%、§3.6 描边统一 16px —— AC-8
 *
 * ── 三条「这里最容易写出假绿」的纪律 ────────────────────────────────────────
 *
 * 1. **剥注释是所有匹配的前置**（AC-15）。`u1-dog.svg` 的文件头注释里逐字写着
 *    `viewBox 0 0 512 512`。不对注释做剥离就匹配，任何守卫都会在**所有文件**上恒绿 ——
 *    那不是「守卫不严」，是守卫恒等于真。本文件所有读 SVG 的地方都先过
 *    `stripXmlComments()`，且 Task 5 的 M8 会把删掉剥离后的行为跑一遍来验证。
 *
 * 2. **G5 不许退化成「元素个数」或「比字节」**。前者对 5 元素的图恒等于 `5`；
 *    后者因三个文件颜色必不同而恒通过 —— 两种都是「看着在守，实际没守」。
 *    签名取的是**去掉颜色之后的几何**（AC-16 的算法），下面有专门的单测证明它
 *    既不是个数、也不受颜色影响。
 *
 * 3. **「全绿」不是证据，「改坏后确实变红」才是**（Task 5 的 M1–M11，
 *    `[CC]` 2026-10-14 又补了 M12–M14）。
 *    本文件里每一条断言都对应变异清单里的至少一项。
 *
 * ── 为什么 SVG 解析写在测试里而不是导出复用 ──────────────────────────────
 * `validate-content.ts` 那边只需要「存在性 + 三条几何规格」，已经实现；
 * 这里的结构签名 / 外接盒 / 线宽是**资产专属**判据（塔与僵尸才有 §3.4–3.6，
 * 词图没有），放进去只会让校验脚本报出「词图必须有 16px 描边」这种错误的话。
 * 口径相同的部分（剥注释）**仍然复用** `validate-content.ts` 的导出 ——
 * 两份剥注释实现漂移起来，同样是一种假绿。
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  assetPresenceProblems,
  loadUnitFiles,
  readSvgGeometry,
  stripXmlComments,
  validateContent,
  type ValidateDeps,
} from '../../scripts/validate-content'

const root = fileURLToPath(new URL('../../', import.meta.url))
const assetRoot = join(root, 'public/assets')
const towersDir = join(assetRoot, 'towers')
const zombiesDir = join(assetRoot, 'zombies')
const wordsDir = join(assetRoot, 'words')

const tokensSrc = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8')

/** 从 tokens.css 取某个自定义属性的字面文本。取原样，不做颜色解析。 */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensSrc)
  expect(m, `tokens.css 里没有 --${name}`).not.toBeNull()
  return (m?.[1] ?? '').trim()
}

/**
 * 塔型 → 色板 token 名。
 *
 * ⚠️ **塔型是 `direct`，色板 token 叫 `color-tower-shooter`** —— 两者不同名。
 * 这里显式建映射而不是靠字符串拼接，是因为拼错会得到一个不存在的 token，
 * 而 `token()` 的断言只会报「tokens.css 里没有 --color-tower-direct」，
 * 看不出根因是「这两个名字本来就不一样」。
 */
const TOWER_COLOR_TOKEN: Record<string, string> = {
  direct: 'color-tower-shooter',
  slow: 'color-tower-slow',
  aoe: 'color-tower-aoe',
}
const TOWER_TYPES = ['direct', 'slow', 'aoe'] as const
const ALL_ASSETS = [
  ...TOWER_TYPES.map((t) => join(towersDir, `${t}.svg`)),
  join(zombiesDir, 'zombie.svg'),
]

/** 读磁盘上真实的 SVG；不存在时让测试红在一句人话上，而不是 `ENOENT` 栈。 */
function readAsset(path: string): string {
  expect(
    existsSync(path),
    `资产缺失：${path} —— 先把图画出来（Task 3/4），再谈它合不合规。` +
      '「文件不存在」时任何关于它长什么样的断言都无从谈起，那不是守卫在守。',
  ).toBe(true)
  return readFileSync(path, 'utf8')
}

/** 真文件系统上的 `ValidateDeps`（AC-14.1 要求词图根目录参数化，资产同理）。 */
const realDeps: ValidateDeps = {
  wordImageRoot: join(assetRoot, 'words'),
  assetRoot,
  fileExists: existsSync,
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  listFiles: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
}

// ══════════════════════════════════════════════════════════════════════════
// SVG 图元解析
//
// ⚠️ **只支持 5 种图元**（`rect` / `circle` / `ellipse` / `polygon` / `polyline` /
//    `line`），且遇到 `<path>` 一律判定为不合规。
//
// 理由不是「懒得实现曲线包围盒」，而是 §3.4 / §3.5 声明为 🤖 机器判据
// （「主体外接盒的留白与重心」）。要机器判定就必须**精确**算外接盒；
// 而 `path` 的 `d` 里可以有弧线、贝塞尔、控制点，任何手写的包围盒算法都只是
// 近似 —— 近似值算出来的「留白 ≥ 41px」是**假绿**：它可能因为低估而放行一个
// 真的贴边的图。限定图元集合是把「可判定」变成真的，代价写在 §3.7。
//
// 这条约束同时让 G5 的签名可精确复现：签名 = 图元 + 几何属性的排序集合，
// 不含任何需要解释的语法。
// ══════════════════════════════════════════════════════════════════════════

const PARSEABLE_TAGS = ['rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'] as const

interface Element {
  tag: string
  attrs: Record<string, string>
}

/** 剥掉注释后，取出全部绘制元素。`<path>` 等不可解析图元也会被取出来（由调用方拒收）。 */
function drawElements(source: string): Element[] {
  const stripped = stripXmlComments(source)
  const out: Element[] = []
  const re = /<(path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*)>/gi
  for (let m = re.exec(stripped); m !== null; m = re.exec(stripped)) {
    const attrs: Record<string, string> = {}
    const body = m[2] ?? ''
    const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
    for (let a = attrRe.exec(body); a !== null; a = attrRe.exec(body)) {
      const name = (a[1] ?? '').toLowerCase()
      if (name === '') continue
      attrs[name] = (a[2] ?? '').trim()
    }
    out.push({ tag: (m[1] ?? '').toLowerCase(), attrs })
  }
  return out
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number.parseFloat(raw.replace(/px$/i, '').trim())
  return Number.isFinite(n) ? n : null
}

function nums(raw: string | undefined): number[] {
  if (raw === undefined) return []
  return (raw.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

// ── G5：结构签名 ───────────────────────────────────────────────────────────

/** 每个图元参与签名的几何属性（AC-16 逐字给定）。**不含任何颜色或描边属性。** */
const SIGNATURE_ATTRS: Record<string, readonly string[]> = {
  path: ['d'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height'],
  polygon: ['points'],
}

/**
 * 🎯 **去掉颜色之后**的结构签名（AC-16 / AC-5 的唯一可判定形式）。
 *
 * 签名 = 每个图元的 `(tag, 几何属性)` 对 → 排序 → join。
 *
 * ⚠️ 数值做**空白归一**（连续空白压成一个空格），否则
 * `M10 20L30 40` 与 `M 10 20 L 30 40` 会算出「不同」的签名 ——
 * 那是排版差异不是形状差异，会让 G5 在人没改形状的时候变红。
 * 但**不做任何数值化简**：`(10 20)` 与 `(10.0 20)` 保持不同，
 * 免得签名在「同形状不同写法」上放过真正的差异。
 */
export function structuralSignature(source: string): string {
  const parts = drawElements(source).map((el) => {
    const keys = SIGNATURE_ATTRS[el.tag]
    if (keys === undefined) return `${el.tag}:<不可解析>`
    return `${el.tag}:${keys.map((k) => `${k}=${(el.attrs[k] ?? '').replace(/\s+/g, ' ')}`).join(',')}`
  })
  return parts.sort().join('\n')
}

// ── §3.4 / §3.5：几何外接盒 ────────────────────────────────────────────────

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 图元的外接盒。`path` 返回 `null` —— 由调用方拒收（理由见上方「只支持 5 种图元」）。 */
function elementBox(el: Element): Box | null {
  const { tag, attrs } = el
  const one = (k: string): number => num(attrs[k]) ?? 0
  if (tag === 'rect') {
    const x = one('x')
    const y = one('y')
    return { minX: x, minY: y, maxX: x + one('width'), maxY: y + one('height') }
  }
  if (tag === 'circle') {
    const cx = one('cx')
    const cy = one('cy')
    const r = one('r')
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
  }
  if (tag === 'ellipse') {
    const cx = one('cx')
    const cy = one('cy')
    const rx = one('rx')
    const ry = one('ry')
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }
  }
  if (tag === 'line') {
    const x1 = one('x1')
    const y1 = one('y1')
    const x2 = one('x2')
    const y2 = one('y2')
    return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) }
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const p = nums(attrs['points'])
    const xs = p.filter((_, i) => i % 2 === 0)
    const ys = p.filter((_, i) => i % 2 === 1)
    if (xs.length === 0 || xs.length !== ys.length) return null
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
  }
  return null
}

/** 整张图的主体外接盒（各图元外接盒的并集）。任一图元不可解析 ⇒ `null`。 */
export function subjectBox(source: string): Box | null {
  const boxes: Box[] = []
  for (const el of drawElements(source)) {
    const b = elementBox(el)
    if (b === null) return null
    boxes.push(b)
  }
  if (boxes.length === 0) return null
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

// ── G3 / G4：颜色 ──────────────────────────────────────────────────────────

/** 文件里**实际用作填充/描边**的颜色值（只取 `fill=` / `stroke=` 的属性值）。 */
function usedColors(source: string): string[] {
  const stripped = stripXmlComments(source)
  const out: string[] = []
  const re = /(?:fill|stroke)\s*=\s*"([^"]*)"/gi
  for (let m = re.exec(stripped); m !== null; m = re.exec(stripped)) out.push((m[1] ?? '').trim())
  return out
}

/** 文件里出现的所有 hex 色值字面量（用于「不许出现 token 之外的 hex」）。 */
function hexLiterals(source: string): string[] {
  const stripped = stripXmlComments(source)
  return [...new Set((stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()))]
}

// ══════════════════════════════════════════════════════════════════════════
// G1 —— 文件集合「恰好等于」预期
// ══════════════════════════════════════════════════════════════════════════

describe('G1 —— 塔/僵尸文件集合不多不少（AC-1 / AC-2 / FR70）', () => {
  it('towers/ 下恰好 3 个 .svg，文件名就是 direct / slow / aoe', () => {
    const actual = readdirSync(towersDir).filter((n) => n.endsWith('.svg')).sort()

    expect(actual, '多了文件孩子永远看不到，而「三个都在」的守卫照样全绿').toEqual([
      'aoe.svg',
      'direct.svg',
      'slow.svg',
    ])
  })

  it('zombies/ 下恰好 1 个 .svg，文件名就是 zombie', () => {
    const actual = readdirSync(zombiesDir).filter((n) => n.endsWith('.svg')).sort()

    expect(actual).toEqual(['zombie.svg'])
  })

  it('校验脚本在真实磁盘上也同意这个集合（两层守卫不是同一层的复读）', () => {
    const problems = assetPresenceProblems(realDeps).filter(
      (p) => p.category === 'asset-missing' || p.category === 'asset-unexpected',
    )

    expect(
      problems.map((p) => p.message),
      '§1 的断言过了但 validate:content 说不过 ⇒ 两层口径已漂移',
    ).toEqual([])
  })

  it('M7：多一张 towers/extra.svg 会被「多了」这一侧抓到（不是只查「三个都在」）', () => {
    // ⚠️ 在**临时目录的副本**上做，不往仓库里写文件。
    // 测试期间改动 `public/assets/` 的后果不是「多一个文件忘了删」那么简单 ——
    // vitest 的文件是并行跑的，另一条正在读真实磁盘的断言会撞上这个临时状态，
    // 红的原因与它自己无关，报错指不到真正坏的地方。
    const sandbox = mkdtempSync(join(tmpdir(), 'plants-asset-'))
    try {
      cpSync(towersDir, join(sandbox, 'towers'), { recursive: true })
      cpSync(zombiesDir, join(sandbox, 'zombies'), { recursive: true })
      writeFileSync(join(sandbox, 'towers', 'extra.svg'), readFileSync(join(towersDir, 'direct.svg'), 'utf8'))

      const problems = assetPresenceProblems({ ...realDeps, assetRoot: sandbox }).filter(
        (p) => p.category === 'asset-unexpected',
      )

      expect(problems.map((p) => p.message).join('\n')).toContain('extra.svg')
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it('M6：少一张（改名成 shooter.svg）会被「缺失」+「多了」两侧同时抓到', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'plants-asset-'))
    try {
      cpSync(towersDir, join(sandbox, 'towers'), { recursive: true })
      cpSync(zombiesDir, join(sandbox, 'zombies'), { recursive: true })
      rmSync(join(sandbox, 'towers', 'direct.svg'))
      writeFileSync(join(sandbox, 'towers', 'shooter.svg'), readFileSync(join(towersDir, 'direct.svg'), 'utf8'))

      const categories = assetPresenceProblems({ ...realDeps, assetRoot: sandbox }).map((p) => p.category)

      expect(categories, '改名后「缺失」必须报').toContain('asset-missing')
      expect(categories, '改名后「多了」也必须报 —— 只有前者的话，改名会退化成一句看不懂的报错').toContain(
        'asset-unexpected',
      )
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G2 —— 四张 SVG 的几何规格
// ══════════════════════════════════════════════════════════════════════════

describe('G2 —— SVG 几何规格（AC-3 / AC-14.2）', () => {
  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s：viewBox / 512×512 / 透明底都合规', (_label, path) => {
    const geo = readSvgGeometry(readAsset(path))

    expect(
      {
        viewBox: geo.viewBox,
        width: geo.width,
        height: geo.height,
        hasOpaqueCanvas: geo.hasOpaqueCanvas,
      },
      `${path} 的几何规格不合规 —— 与 viewBox 不一致的 width/height 会被浏览器按 CSS 拉伸，图会糊`,
    ).toEqual({ viewBox: '0 0 512 512', width: '512', height: '512', hasOpaqueCanvas: false })
  })

  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s：≤ 10KB（架构 :374 给的量级是 2-10KB）', (_l, path) => {
    const bytes = Buffer.byteLength(readAsset(path), 'utf8')

    expect(bytes, `${path} ${bytes} 字节，超出架构给的 2-10KB 量级`).toBeLessThanOrEqual(10 * 1024)
  })

  it('真实磁盘上的四张资产，校验脚本也认（脚本与测试两层）', () => {
    const geometry = assetPresenceProblems(realDeps).filter((p) => p.category === 'svg-geometry')

    expect(geometry.map((p) => p.message), 'validate:content 报了几何问题').toEqual([])
  })
})

describe('G2 的解析器本身 —— 三条已知的误判陷阱（单元测试，不依赖磁盘）', () => {
  it('注释里写着 viewBox 512 但真实属性是 100 —— 报**不**合规（AC-15 的假绿陷阱）', () => {
    const svg = [
      '<!-- 规格：viewBox 0 0 512 512 / 512×512 / 透明底 -->',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512"></svg>',
    ].join('\n')

    expect(readSvgGeometry(svg).viewBox, '读到了注释里的规格 ⇒ 剥注释没起作用').toBe('0 0 100 100')
  })

  it('`stroke-width="16"` 不会被当成 `width="16"`（`\\b` 前缀的老坑）', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
      '<line x1="10" y1="10" x2="40" y2="40" stroke="#ffffff" stroke-width="16"/></svg>'

    expect(readSvgGeometry(svg).width).toBe('512')
  })

  it('铺满画布的不透明 rect 被认出；`fill="none"` 与半透明放行', () => {
    const opaque =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
      '<rect x="0" y="0" width="512" height="512" fill="#7cb342"/></svg>'
    const none =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
      '<rect x="0" y="0" width="512" height="512" fill="none"/></svg>'
    const translucent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
      '<rect x="0" y="0" width="512" height="512" fill="rgba(124,179,66,0.2)"/></svg>'

    expect(readSvgGeometry(opaque).hasOpaqueCanvas).toBe(true)
    expect(readSvgGeometry(none).hasOpaqueCanvas).toBe(false)
    expect(readSvgGeometry(translucent).hasOpaqueCanvas).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G5 —— 三塔结构签名两两不等（AC-5 的唯一可判定形式）
// ══════════════════════════════════════════════════════════════════════════

describe('G5 —— 三塔去掉颜色后仍可分（AC-5 / §4 第 5 条）', () => {
  it('三塔两两签名不等', () => {
    const signatures = TOWER_TYPES.map((t) => [t, structuralSignature(readAsset(join(towersDir, `${t}.svg`)))] as const)

    for (const [a, sa] of signatures) {
      for (const [b, sb] of signatures) {
        if (a >= b) continue
        expect(
          sa,
          `${a}.svg 与 ${b}.svg 的结构签名相同 ⇒ 它们只是换了颜色。` +
            '三个塔底色都在 L ≤ 0.09 的深色区，灰度下必然糊成一片，' +
            '此时「靠颜色区分塔型」这条主机制在色觉障碍/灰度屏上直接失效。' +
            '回 §4 第 5 条重新分配剪影分工，不要改这条断言。',
        ).not.toBe(sb)
      }
    }
  })

  it('签名函数不是「元素个数」—— 元素数相同但形状不同的两图，签名必须不等', () => {
    const a = '<svg><circle cx="100" cy="100" r="50"/><circle cx="300" cy="300" r="20"/></svg>'
    const b = '<svg><circle cx="256" cy="256" r="120"/><circle cx="256" cy="420" r="10"/></svg>'

    expect(a.match(/<circle/g)).toHaveLength(2)
    expect(b.match(/<circle/g)).toHaveLength(2)
    expect(structuralSignature(a)).not.toBe(structuralSignature(b))
  })

  it('签名函数不是「比字节」—— 同一形状换个颜色，签名必须相等（否则 G5 是恒绿）', () => {
    const blue = '<svg><ellipse cx="256" cy="300" rx="90" ry="120" fill="#09428c"/></svg>'
    const orange = '<svg><ellipse cx="256" cy="300" rx="90" ry="120" fill="#7a3200"/></svg>'

    expect(blue).not.toBe(orange)
    expect(structuralSignature(blue), '颜色进了签名 ⇒ 换色即换签名 ⇒ M5 抓不到').toBe(
      structuralSignature(orange),
    )
  })

  it('签名函数会剥注释 —— 注释里画一个不同的形状不该改变签名', () => {
    const real = '<svg><rect x="100" y="100" width="200" height="200"/></svg>'
    const withComment = `<!-- <rect x="0" y="0" width="512" height="512"/> -->\n${real}`

    expect(structuralSignature(withComment)).toBe(structuralSignature(real))
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G3 / G4 —— 色值同源
// ══════════════════════════════════════════════════════════════════════════

describe('G3 —— 主体填充色 === tokens.css 的字面 hex（AC-4）', () => {
  it.each(TOWER_TYPES.map((t) => [t, TOWER_COLOR_TOKEN[t] as string] as const))(
    '%s.svg 的填充色里有 --%s',
    (tier, tokenName) => {
      const expected = token(tokenName).toLowerCase()

      expect(
        usedColors(readAsset(join(towersDir, `${tier}.svg`))).map((c) => c.toLowerCase()),
        `${tier}.svg 里没有出现 ${expected} —— 塔色必须与 tokens.css 逐字一致` +
          '（SVG 经 <img> 加载拿不到 CSS 变量，一致性只能靠这条断言守）',
      ).toContain(expected)
    },
  )

  it('zombie.svg 的填充色里有 --color-zombie', () => {
    const expected = token('color-zombie').toLowerCase()

    expect(usedColors(readAsset(join(zombiesDir, 'zombie.svg'))).map((c) => c.toLowerCase())).toContain(
      expected,
    )
  })
})

describe('G4 —— SVG 里不出现 token 之外的 hex（AC-4 / AC-13）', () => {
  it.each(TOWER_TYPES.map((t) => [t, TOWER_COLOR_TOKEN[t] as string] as const))(
    '%s.svg 只用「本塔底色 + 描边色」两个色值',
    (tier, tokenName) => {
      const allowed = new Set(
        [token(tokenName), token('color-asset-stroke')].map((c) => c.toLowerCase()),
      )
      const foreign = hexLiterals(readAsset(join(towersDir, `${tier}.svg`))).filter((h) => !allowed.has(h))

      expect(
        foreign,
        `${tier}.svg 里有 token 之外的色值 —— 新增任何色都必须先在 tokens.css 落 token`,
      ).toEqual([])
    },
  )

  it('zombie.svg 只用「僵尸色 + 描边色」两个色值', () => {
    const allowed = new Set([token('color-zombie'), token('color-asset-stroke')].map((c) => c.toLowerCase()))
    const foreign = hexLiterals(readAsset(join(zombiesDir, 'zombie.svg'))).filter((h) => !allowed.has(h))

    expect(foreign, 'zombie.svg 里有 token 之外的色值').toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════════════════
// §3.4 / §3.5 / §3.6 —— 构图规范里声明为 🤖 机器可判定的三条
// ══════════════════════════════════════════════════════════════════════════

describe('§3.7 —— 资产只用可精确解析外接盒的图元', () => {
  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s：不含 <path> 等不可解析图元', (_l, path) => {
    const tags = [...new Set(drawElements(readAsset(path)).map((el) => el.tag))].sort()

    expect(
      tags.filter((t) => !PARSEABLE_TAGS.includes(t as (typeof PARSEABLE_TAGS)[number])),
      `${path} 用了不可解析图元 —— §3.4/§3.5 声明为机器判据，而 path 的 d 里可以有弧线与贝塞尔，` +
        '手写包围盒只能近似，近似值算出来的「留白 ≥ 41px」是假绿。要用 path 就得把这两条改成 👁。',
    ).toEqual([])
  })
})

describe('§3.4 —— 主体四边最小留白 ≥ 8% 画布边长（41px）', () => {
  const MIN_MARGIN = (512 * 0.08)

  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s', (_l, path) => {
    const box = subjectBox(readAsset(path))
    expect(box, `${path} 的外接盒算不出来（图元不可解析或一个图元都没有）`).not.toBeNull()
    const margins = [box!.minX, box!.minY, 512 - box!.maxX, 512 - box!.maxY]

    expect(
      Math.min(...margins),
      `${path} 最小留白 ${Math.min(...margins).toFixed(1)}px < ${MIN_MARGIN.toFixed(1)}px —— ` +
        '留白不足时主体在 48px 的格子里会被裁掉边缘，孩子看到的是「植物缺了一块」。' +
        '（描边 16px 在此外再吃掉 8px，本条按几何本体判。）',
    ).toBeGreaterThanOrEqual(MIN_MARGIN)
  })
})

describe('§3.5 —— 主体外接框中心落在画布中心 ±6%', () => {
  const TOLERANCE = 512 * 0.06

  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s', (_l, path) => {
    const box = subjectBox(readAsset(path))
    expect(box).not.toBeNull()
    const cx = (box!.minX + box!.maxX) / 2
    const cy = (box!.minY + box!.maxY) / 2
    const why = `重心偏移 (±${TOLERANCE.toFixed(1)}px) —— 同一批资产重心不统一时，` +
      '孩子会先比哪个画得大而不是哪个是哪个'

    expect(Math.abs(cx - 256), `${path} 横向 ${why}`).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(cy - 256), `${path} 纵向 ${why}`).toBeLessThanOrEqual(TOLERANCE)
  })
})

describe('§3.6 —— 描边统一 16px，四张资产一致', () => {
  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s 的全部 stroke-width 都是 16', (_l, path) => {
    const stripped = stripXmlComments(readAsset(path))
    const widths = [...stripped.matchAll(/stroke-width\s*=\s*"([^"]*)"/g)].map((m) => Number.parseFloat(m[1] ?? ''))

    expect(
      widths.filter((w) => w !== 16),
      `${path} 有非 16px 的描边 —— 线宽是颜色以外的第二个一致性维度，` +
        '缩到 48px 后描边粗细差会盖过剪影差，AC-5 的兜底又被架空。',
    ).toEqual([])
  })

  it('四张资产都有描边（一张都不描 = 剪影边界消失，AC-5 空转）', () => {
    for (const path of ALL_ASSETS) {
      const stripped = stripXmlComments(readAsset(path))
      expect(stripped, `${path} 一个 stroke-width 都没有`).toMatch(/stroke-width\s*=/)
    }
  })
})

describe('G8 —— 注释正文里不出现连续双短横（XML 良构性）', () => {
  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s 是合法 XML', (_l, path) => {
    const source = readAsset(path)
    // XML 规范：注释正文里不允许出现 `--`（只有 `-->` 能结束注释）。
    // ⚠️ 这条不是洁癖。本 story 画图时真的踩了：注释里为了写清 token 名打了
    //    `--color-tower-shooter`，结果**三张塔图在浏览器里一张都渲染不出来**
    //    （按 image/xml 解析时报 parse error），而 G1–G7 **全部绿着** ——
    //    守卫查的是「属性对不对」，SVG 根本没能被解析时，属性当然是对的。
    //    「文件存在」≠「文件能被浏览器读」，与 memory 里那条同源。
    const comments = source.match(/<!--[\s\S]*?-->/g) ?? []
    const bad = comments.filter((c) => c.slice(4, -3).includes('--'))

    expect(
      bad.map((c) => c.split('\n')[1] ?? c),
      `${path} 的注释正文里有连续双短横 —— 这份 SVG 不是合法 XML，浏览器解析失败、图一片都渲染不出来`,
    ).toEqual([])
  })

  it('单测：确实会被这条抓到（注释里写个 -- 就会红）', () => {
    const bad = '<svg><!-- 见 --color-tower-shooter --><rect x="1" y="1" width="2" height="2"/></svg>'
    const comments = bad.match(/<!--[\s\S]*?-->/g) ?? []

    expect(comments.filter((c) => c.slice(4, -3).includes('--'))).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G6 —— 30 张词图的几何规格（补 art-direction §1 的假绿）
// ══════════════════════════════════════════════════════════════════════════

describe('G6 —— 词图的几何规格也合规（AC-14.2 词图侧）', () => {
  it('30 张占位词图逐张打开读几何，没有一条 svg-geometry 报错', () => {
    const units = loadUnitFiles(join(root, 'src/content/units'))
    const result = validateContent(
      units.map((u) => u.raw),
      realDeps,
    )
    const wordImageGeometry = result.problems.filter(
      (p) => p.category === 'svg-geometry' && p.entryId !== null,
    )

    expect(
      wordImageGeometry.map((p) => p.message),
      '词图的几何规格没人守 —— docs/art-direction.md §1 登记的假绿还没补上',
    ).toEqual([])
  })

  it('每张词图都真的被打开读过（不是「列表非空就算过」）', () => {
    const dir = join(assetRoot, 'words', 'unit-01')
    const files = readdirSync(dir).filter((n) => n.endsWith('.svg'))

    expect(files.length).toBe(30)
    for (const name of files) {
      const geo = readSvgGeometry(readFileSync(join(dir, name), 'utf8'))
      expect(geo.viewBox, `${name} 的 viewBox 不是 0 0 512 512`).toBe('0 0 512 512')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G9 —— `[CC] 2026-10-14` 裁决：§3.2–§3.7 只约束塔与僵尸，词图只受 §3.1
// ══════════════════════════════════════════════════════════════════════════
//
// **为什么文档裁决还要配一组测试？** 因为本文件 §2「真被守着吗」那张表自己写着：
// 「声明本身没人守，是最容易骗人的一种绿」。Story 1.7 已经因为这个吃过两次亏
// （占位图 viewBox 没人查；XML 注释里的双短横让三张图渲染不出来而 G1–G7 全绿）。
// 所以本次裁决 —— 「词图不受 §3 约束」—— 同样必须有东西证明它**现在是真���**。
//
// 这一组的红绿含义与前面相反：**前面前提是「合规要绿」，这里的前提是「不受约束要绿」。**
// 若哪天有人给词图补上 §3.7 的断言，或把 §3.7 扩展到词图，这三条会红 ——
// 那不是「测试坏了」，是**裁决变了，文档必须一起改**。

describe('G9 —— §3 的适用范围（`[CC]` 2026-10-14）', () => {
  /**
   * 把词图目录复制到临时目录，并把其中一张换成带 `<path>` 的版本。
   * 返回可交给 `validateContent` 的 `ValidateDeps`。
   *
   * ⚠️ 为什么非得造一张假的：真实占位图里**一张 `<path>` 都没有**（它们用
   * `rect` / `line` / `text`，而 `text` 压根不在 `drawElements()` 的匹配里）。
   * 拿真实占位图去证明「§3.7 不管词图」，会得到一条**恒绿**的断言 ——
   * 它变红只能靠占位图重画，而那一天跟这次裁决没关系。
   * 「要造一张才会红的图」正是 M1–M11 的做法。
   */
  function sandboxWithPathWordImage(): { deps: ValidateDeps; sandbox: string; file: string } {
    const sandbox = mkdtempSync(join(tmpdir(), 'plants-scope-'))
    const sandboxWords = join(sandbox, 'words')
    cpSync(wordsDir, sandboxWords, { recursive: true })

    const dir = join(sandboxWords, 'unit-01')
    const name = readdirSync(dir).filter((n) => n.endsWith('.svg'))[0]
    const file = join(dir, name)
    const original = readFileSync(file, 'utf8')

    // 塞一个**贴边**的 `<path>`：既违反 §3.4 的 8% 留白，也违反 §3.7 的图元白名单。
    // 若哪天有人把 §3 的构图判据扩到词图，这一张必须立刻红 —— 那才是「裁决变了」。
    writeFileSync(
      file,
      original.replace(
        '</svg>',
        '  <path d="M 2 2 L 510 2 L 510 510 L 2 510 Z" fill="#cccccc"/>\n</svg>',
      ),
    )

    // `realDeps` 的三个函数都是「给绝对路径就干活」，所以只换根目录即可。
    return { sandbox, file, deps: { ...realDeps, wordImageRoot: sandboxWords } }
  }

  it('词图塞进一张贴边的 <path>，`validateContent` 一条都不报 —— 词图确实只受 §3.1', () => {
    const { deps, sandbox, file } = sandboxWithPathWordImage()
    try {
      const units = loadUnitFiles(join(root, 'src/content/units'))
      const problems = validateContent(
        units.map((u) => u.raw),
        deps,
      ).problems.filter((p) => p.category === 'svg-geometry' && p.entryId !== null)

      expect(
        problems.map((p) => p.message),
        `${file} 里有贴边的 <path>（同时违反 §3.4 留白与 §3.7 图元白名单），` +
          '校验却报错了 —— 说明 §3 的构图判据已经扩到词图，[CC] 2026-10-14 的裁决被推翻，' +
          'docs/art-direction.md §3 的「适用范围」小节必须一起改。',
      ).toEqual([])
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  it('同一个 <path> 放到塔上会被 §3.7 拦下 —— 证明上一条不是「校验器根本没这功能」', () => {
    const tags = drawElements(
      '<svg><rect x="0" y="0" width="10" height="10"/><path d="M 1 1 L 9 9" fill="#fff"/></svg>',
    ).map((el) => el.tag)

    expect(tags).toContain('path')
    expect(
      tags.filter((t) => !PARSEABLE_TAGS.includes(t as (typeof PARSEABLE_TAGS)[number])),
      '白名单没能拦住 <path> —— §3.7 对塔与僵尸的约束就是恒绿的，' +
        '那么 §3.7 的白名单在词图上放行也就说明不了任何事。',
    ).not.toEqual([])
  })

  it('四张塔/僵尸一张都不含 <path> —— §3.7 当前的覆盖面（AC-5 的剪影分工靠它）', () => {
    for (const path of ALL_ASSETS) {
      expect(
        drawElements(readAsset(path)).map((el) => el.tag),
        `${path} 含 <path> —— §3.7 只允许 6 种可精确解析的图元`,
      ).not.toContain('path')
    }
  })

  it('art-direction.md §3 里写着「只约束塔与僵尸」「只有 §3.1」—— 文档不能悄悄改成别的', () => {
    const doc = readFileSync(join(root, 'docs/art-direction.md'), 'utf8')

    expect(
      doc,
      'docs/art-direction.md §3 缺「适用范围」小节 —— [CC] 2026-10-14 撤销了词图受 §3 约束的默认读法，' +
        '这段声明是唯一会提醒后来者的地方。删掉它等于让旧读法复活。',
    ).toContain('只约束塔与僵尸')
    expect(
      doc,
      '§3 的适用范围必须明说词图只受 §3.1 —— 否则「词图不受约束」仍然只能靠读代码推断。',
    ).toContain('只有 §3.1')
  })
})
