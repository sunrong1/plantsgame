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
 * · §3.7 图元白名单（G10 之外的词图侧扩展见下方 G10）—— 变异 M17
 * · G8 注释良构性（正文无 `--` **且不留未闭合的 `<!--`**）—— 变异 M16
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

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ⚠️ 走 barrel `../../src/core/index.js` + `.js` 后缀 —— 与
// `scripts/validate-content.ts` 同一形态（`verbatimModuleSyntax` +
// `moduleResolution: bundler` 的既定写法）。项目没有 `@/` 别名。
import { TOWER_TYPES as CORE_TOWER_TYPES } from '../../src/core/index.js'

import {
  assetPresenceProblems,
  loadUnitFiles,
  readSvgGeometry,
  stripNonRenderedBlocks,
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
/**
 * 🔥 **塔型集合的单一事实源是 `src/core/balance.ts` 的 `TOWER_TYPES`。**
 *
 * ⚠️ `[CR]` 2026-10-14：本文件原来写死 `['direct','slow','aoe']`，而
 * `scripts/validate-content.ts` import 了真实来源 —— **两处**。
 * core 新增第四种塔型时：脚本立刻要求新 svg，而由本常量派生的
 * **G2 / G3 / G4 / G5 / §3.4 / §3.5 / §3.6 / G8 / G9 共 9 组**
 * 会同时对它失明。AC-14.1 明文要求「直接 import，不要另写一份」。
 *
 * ⚠️ `TOWER_COLOR_TOKEN` 仍然是本文件独有的映射（core 里没有「塔型→token 名」
 * 这层信息），它的键必须覆盖全部 `TOWER_TYPES` —— 由下面那条断言钉住。
 */
const TOWER_TYPES = CORE_TOWER_TYPES
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

/**
 * 解析一个标签的属性体（`m[2]` 那段）。
 *
 * ⚠️ `[CR]` 2026-10-14：**必须同时认单引号与双引号。**
 * 旧实现只认 `"..."`，而 Inkscape / Illustrator / 多数 SVG 导出器发的是单引号 ——
 * 实测 `<ellipse cx='256' cy='300' rx='90' ry='120'/>` 会得到 `attrs = {}`，
 * 于是 G5 的结构签名退化成 `ellipse:cx=,cy=,rx=,ry=`（几何全丢），
 * §3.4 的外接盒塌成 0，§3.6 的线宽扫描看到 0 个宽度而**空过**。
 *
 * `scripts/validate-content.ts` 的 `attrOf` 早就同时认两种引号 ——
 * **同一个项目里两个解析器只修了一半**，这正是漂移的来源。
 */
function readAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (let a = attrRe.exec(body); a !== null; a = attrRe.exec(body)) {
    const name = (a[1] ?? '').toLowerCase()
    if (name === '') continue
    attrs[name] = (a[3] ?? a[2] ?? '').trim()
  }
  return attrs
}

/** 剥掉注释后，取出全部绘制元素。`<path>` 等不可解析图元也会被取出来（由调用方拒收）。 */
function drawElements(source: string): Element[] {
  const stripped = stripXmlComments(source)
  const out: Element[] = []
  const re = /<(path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*)>/gi
  for (let m = re.exec(stripped); m !== null; m = re.exec(stripped)) {
    out.push({ tag: (m[1] ?? '').toLowerCase(), attrs: readAttrs(m[2] ?? '') })
  }
  return out
}

/**
 * `allTags()` 的选项。
 *
 * 🔥 **「要不要剥不渲染容器」不是实现细节，是两种互不相容的语义** ——
 * 这是 `[CR]` 2026-10-14 抓到的那条 P1：
 *
 * · **要剥**（§3.7 的图元白名单）：`<pattern>` 里的 `<image>` 是**定义数据**不是画面，
 *   剥掉它才不会把一份合规的塔图判成违规。
 * · **要剥才出事**（G10 的内容完整性）：
 *   `<defs><text id="a">u1-dog</text></defs><use href="#a"/>` 会把那段文字
 *   **真的画到选项卡上** —— 而剥掉 defs 之后 G10 命中 `[]`，一声不吭。
 *   （`<pattern>` 被 `fill="url(#p)"` 引用时同样是真在渲染的。）
 *
 * 同一份代码对两个用途给出不同答案时，正确做法是**让调用方显式选**，
 * 而不是把其中一种语义写死进函数里、再指望另一个调用方记得绕开。
 */
export interface AllTagsOptions {
  /** 是否剥掉 `<defs>` / `<mask>` / `<pattern>` / `<symbol>` / `<clipPath>`。默认 true。 */
  stripNonRendered?: boolean
}

/**
 * 逐个标签扫描出来源里的标签名，**跳过属性值内部**。
 *
 * ⚠️ 为什么不能用一条正则 —— 两个各自会误报的形态：
 *
 * ① **属性值里的 `<`**：正则 `/<([a-zA-Z][a-zA-Z0-9-]*)/g` 分不清
 *    「标签开始」和「属性值里恰好有个尖括号」。实测
 *    `<svg aria-label="a <text> b"/>` 会被读出一个 `text` ——
 *    G10 于是对一份**合法文件**报「有被禁的标签」。
 *    P2-4 刚为词图那 30 个中文 `aria-label` 修好了 `>` 的一侧，`<` 的一侧是同一个洞。
 * ② **属性值里的 `>`**：不跟踪引号就会在属性值中间截断，后面的标签全看不见 ——
 *    截断方向同样表现为「守卫恒绿」。
 *
 * ⇒ 必须**跟踪引号状态**跳到配对的 `>`，这也是 P2-4 修 `svgRootTag()` 用的同一手法。
 * 两处各写一份会漂移，那本身又是一种假绿，故手法一致、注释互相指认。
 */
function tagNames(source: string): string[] {
  const names: string[] = []
  let i = 0
  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt === -1) break
    // ⚠️ 只认**开标签**：`</g>` 的 `/`、`<?xml?>` 的 `?`、`<!DOCTYPE` 的 `!`
    //    都不是 `[A-Za-z]`，自然落进下面的 `m === null` 分支被跳过。
    const m = /^<([A-Za-z][A-Za-z0-9-]*(?::[A-Za-z0-9-]+)?)/.exec(source.slice(lt))
    if (m === null) {
      i = lt + 1
      continue
    }
    const raw = m[1] ?? ''
    // ⚠️ 命名空间：`svg:` 前缀是**本命名空间**的元素（`svg:rect` ≡ `rect`，归一化成本地名）；
    //    其余前缀（`sodipodi:` / `inkscape:` / `rdf:` …）是编辑器元数据，渲染器直接忽略。
    //    不做这一步，正则会在 `:` 处停住把 `<sodipodi:namedview>` 读成 `sodipodi` ——
    //    而它不在白名单里，于是 §3.7 对一份完全合规的 Inkscape 导出文件报错。
    //    触发场景正是 §3 ⚠️ 里点名的「从绘图工具导出 SVG」。
    const colon = raw.indexOf(':')
    const prefix = colon === -1 ? '' : raw.slice(0, colon).toLowerCase()
    const local = colon === -1 ? raw : raw.slice(colon + 1)
    if (prefix === '' || prefix === 'svg') names.push(local.toLowerCase())

    // 跳过这个开标签的整个属性区，跟踪引号状态
    let j = lt + raw.length + 1
    let quote: string | null = null
    while (j < source.length) {
      const ch = source[j]
      if (quote !== null) {
        if (ch === quote) quote = null
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      j += 1
    }
    i = j + 1
  }
  return names
}

/**
 * 🔥 **文件里用到的全部标签名**（已剥注释），去重且小写有序。
 *
 * ⚠️ `[DS]` Story 1.8 / P2-2 —— 这个函数的由来是一条**看不见的漏洞**：
 *   §3.7 原来是拿 `drawElements()` 的结果去比白名单，而 `drawElements()`
 *   的正则里**只列了 7 种 tag**。于是 `<text>` / `<image>` / `<use>` /
 *   `<foreignObject>` 对 §3.7 **完全隐形** —— 你往资产里塞一个 `<image>`，
 *   §3.7 一声不吭。
 *
 *   那不是「白名单宽松」，是**白名单根本没有被完整枚举**：黑名单式的「检查你写的东西」
 *   永远漏，枚举式的「检查全部再用差集」才漏不掉。
 *
 *   ⚠️ **`drawElements()` 一个字都不能动。** G5 的结构签名、§3.4/§3.5 的外接盒
 *   都依赖它「只收可精确算外接盒的图元」这一语义 —— 它是**取样器**，不是**清点器**。
 *   两个职责混在一个函数里，正是这条漏洞的成因。
 *
 * ⚠️ 剥不渲染容器**复用** `scripts/validate-content.ts` 的导出而不是另写一份 ——
 *   两份实现漂移起来同样是一种假绿。但**是否要剥由调用方显式选**，理由见 `AllTagsOptions`。
 */
export function allTags(source: string, options: AllTagsOptions = {}): string[] {
  const { stripNonRendered = true } = options
  const commentsOff = stripXmlComments(source)
  const body = stripNonRendered ? stripNonRenderedBlocks(commentsOff) : commentsOff
  return [...new Set(tagNames(body))].sort()
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

/** 文件里出现的所有 hex 色值字面量（用于「不许出现 token 之外的 hex」）。 */
function hexLiterals(source: string): string[] {
  const stripped = stripXmlComments(source)
  return [...new Set((stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()))]
}

/**
 * 🎯 **主体填充色** —— AC-4 要守的是「主体是那个颜色」，不是「那个颜色在场」。
 *
 * ⚠️ `[CR]` 2026-10-14：G3 原来是 `toContain(expected)`，把
 * `<g fill="塔色" stroke="描边">` 对调成 `<g fill="描边" stroke="塔色">`
 * （塔身渲染成白色）之后**全绿** —— 因为两个 hex 都在文件里、都合法。
 *
 * ⇒ 改成**按面积取最大**：主体就是画面上占地方最多的那块。
 * `<g>` 上的 `fill` 会向下继承给没有自己 `fill` 的子图元，
 * 因此逐个图元解析「自己的 fill，没有就沿用祖先 `<g>` 的 fill」。
 *
 * ⚠️ 面积算不出来（图元缺属性）时该图元**不参与**竞选，
 * 而不是按 0 面积算 —— 后者会让「解析失败」冒充「面积最小」。
 */
function dominantFillColor(source: string): string | null {
  const stripped = stripXmlComments(source)
  let best: { color: string; area: number } | null = null

  // 逐个 `<g>` 开标签推进一条继承栈，扫描到哪个图元就用当时的栈顶 fill。
  const re = /<(\/?)(g|rect|circle|ellipse|polygon|polyline|line)\b([^>]*)>/gi
  const stack: Array<string | null> = [null]
  for (let m = re.exec(stripped); m !== null; m = re.exec(stripped)) {
    const closing = m[1] === '/'
    const tag = (m[2] ?? '').toLowerCase()
    const body = m[3] ?? ''
    const own = readAttrs(body).fill
    const inherited = stack[stack.length - 1] ?? null

    if (tag === 'g') {
      if (closing) {
        if (stack.length > 1) stack.pop()
        continue
      }
      // `fill="none"` 不往下传颜色（SVG 语义如此），否则子图元会被算成一个 0 面积的 none
      const next = own === undefined ? null : own.trim().toLowerCase()
      stack.push(next === 'none' ? null : next)
      continue
    }

    const fill = (own ?? inherited)?.trim().toLowerCase() ?? null
    if (fill === null || fill === 'none') continue
    const area = elementArea(tag, readAttrs(body))
    if (area === null) continue
    if (best === null || area > best.area) best = { color: fill, area }
  }
  return best?.color ?? null
}

/** 图元的签名面积（`line` / `polyline` 没有面积，返回 null）。 */
function elementArea(tag: string, attrs: Record<string, string>): number | null {
  const n = (k: string): number | null => {
    const raw = attrs[k]
    if (raw === undefined) return null
    const v = Number.parseFloat(raw.replace(/(?:px|%)$/i, '').trim())
    return Number.isFinite(v) ? v : null
  }
  switch (tag) {
    case 'rect': {
      const w = n('width')
      const h = n('height')
      return w === null || h === null ? null : w * h
    }
    case 'circle': {
      const r = n('r')
      return r === null ? null : Math.PI * r * r
    }
    case 'ellipse': {
      const rx = n('rx')
      // SVG 缺 ry 时取 rx —— 不这么算会把一张正常的椭圆算成 0 面积
      const ry = n('ry') ?? rx
      if (rx === null || ry === null) return null
      return Math.PI * rx * ry
    }
    case 'polygon': {
      const pts = nums(attrs['points'])
      if (pts.length < 6) return null
      const xs = pts.filter((_, i) => i % 2 === 0)
      const ys = pts.filter((_, i) => i % 2 === 1)
      const w = Math.max(...xs) - Math.min(...xs)
      const h = Math.max(...ys) - Math.min(...ys)
      return w * h
    }
    default:
      return null
  }
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

  it('P2-4 变异：属性值里的 `>` 不许截断 `<svg>` 开标签（aria-label / id 是高发区）', () => {
    // ⚠️ 旧实现 `/<svg\b[^>]*>/i` 会在**引号外的** `>` 处停下，把开标签截断。
    //    报错的形态是：viewBox / width / height 读成 null，于是
    //    `validate:content` 对**这个完全合规的文件**报「读不到 viewBox」——
    //    报错指向错误的文件，而真正的问题在解析器里。
    //
    // ⚠️⚠️ `>` 必须出现在被读属性**之前**才算数。这条测试第一版把 aria-label
    //    写在 viewBox 之后，旧正则照样截断出一个包含全部几何属性的片段 ——
    //    **变异 M18 打上去时全绿**，白跑一次。
    //    「变异打上去没红」有两种原因：守卫写松了，或者**测试根本没覆盖那条路径**。
    //    这里属于后者，而它更隐蔽：测试读起来像模像样，覆盖的是「属性值里有 `>`」，
    //    唯独不覆盖「`>` 把要读的属性截掉了」。
    const withGreaterThan =
      '<svg role="img" aria-label="词图：a > b > c 的入口 id=u1-ball" ' +
      'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"></svg>'

    expect(
      readSvgGeometry(withGreaterThan),
      '属性值里的 > 把开标签截断了 —— 报错会指向这个文件，但它其实完全合规',
    ).toEqual({ viewBox: '0 0 512 512', width: '512', height: '512', hasOpaqueCanvas: false })
  })

  it('P2-4 变异：单引号属性值里的 `>` 同样不许截断', () => {
    const singleQuoted =
      "<svg role='img' id='x > y' aria-label='词图' " +
      "xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' width='512' height='512'>" +
      "<rect x='1' y='1' width='2' height='2'/></svg>"

    expect(readSvgGeometry(singleQuoted)).toEqual({
      viewBox: '0 0 512 512',
      width: '512',
      height: '512',
      hasOpaqueCanvas: false,
    })
  })

  it('P2-4 反向：没有 `>` 的普通开标签仍然读得到（证明上一条不是靠「永不截断」蒙对的）', () => {
    const plain =
      '<svg role="img" aria-label="词图：u1-ball" ' +
      'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"></svg>'

    expect(readSvgGeometry(plain)).toEqual({
      viewBox: '0 0 512 512',
      width: '512',
      height: '512',
      hasOpaqueCanvas: false,
    })
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
  it('TOWER_COLOR_TOKEN 覆盖 core 里的每一个塔型 —— 否则下面那些断言会静默跳过新塔型', () => {
    const missing = TOWER_TYPES.filter((t) => TOWER_COLOR_TOKEN[t] === undefined)

    expect(
      missing,
      `core 的 TOWER_TYPES 新增了 ${missing.join('、')}，但本文件没有对应的 token 名映射 —— ` +
        'G3 / G4 会拿 undefined 去 tokens.css 里找，报出「tokens.css 里没有 --undefined」，' +
        '看不出根因是映射表没跟上。',
    ).toEqual([])
  })

  it.each(TOWER_TYPES.map((t) => [t, TOWER_COLOR_TOKEN[t] as string] as const))(
    '%s.svg 的**主体**填充色就是 --%s',
    (tier, tokenName) => {
      const expected = token(tokenName).toLowerCase()
      const source = readAsset(join(towersDir, `${tier}.svg`))

      expect(
        dominantFillColor(source),
        `${tier}.svg 里画面上最大的一块是 ${dominantFillColor(source)}，不是 ${expected} —— ` +
          '塔色必须与 tokens.css 逐字一致（SVG 经 <img> 加载拿不到 CSS 变量，' +
          '一致性只能靠这条断言守）。⚠️ 断言的是**主体**，不是「这个色值在文件里出现过」：' +
          '把塔身与描边对调，两种颜色都还在文件里，但塔已经不是那个颜色了。',
      ).toBe(expected)
    },
  )

  it('zombie.svg 的主体填充色是 --color-zombie', () => {
    const expected = token('color-zombie').toLowerCase()

    expect(dominantFillColor(readAsset(join(zombiesDir, 'zombie.svg')))).toBe(expected)
  })

  it('三塔的主体填充色两两不等 —— 否则三塔在同色盲条件下无差别', () => {
    const bodies = TOWER_TYPES.map((t) => dominantFillColor(readAsset(join(towersDir, `${t}.svg`))))

    expect(
      new Set(bodies).size,
      `三塔主体填充色是 ${bodies.join(' / ')} —— 有重复。` +
        'G5 只保证「去色后剪影可分」，若三塔底色又相同，灰度之外也没有第二重区分。',
    ).toBe(TOWER_TYPES.length)
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

/**
 * §3.7 的白名单 —— **枚举式的「允许清单」，不是黑名单。**
 *
 * ① `svg` / `g` 在白名单里：它们是**容器**，自己不画任何东西，因此不影响
 *    §3.4/§3.5 的外接盒计算。排除它们会让「一个 `<g>` 包一层」这种无害写法变红 ——
 *    而一个会误报的守卫会被当成噪声忽略掉，那比没有守卫更糟。
 * ② 其余 **6 种**是能**精确**算外接盒的图元（G5 的签名与 §3.4/§3.5 都建立在精确上）——
 *    注意是 6 不是 7：`drawElements()` 的正则里是 `path + 6`，而 `path` 恰恰是本条要**拒收**的那个。
 * ③ ⚠️ **词图不在本条的适用范围内** —— `[CC]` 2026-10-14 裁决词图只受 §3.1，
 *    由 G9 钉住。这里若把词图加进 `ALL_ASSETS`，30 张会当场全红，那不是「测试坏了」，
 *    是**裁决被推翻**。
 */
const SECTION_3_7_ALLOWED_TAGS: readonly string[] = ['svg', 'g', ...PARSEABLE_TAGS]

describe('§3.7 —— 资产只用可精确解析外接盒的图元', () => {
  it.each(ALL_ASSETS.map((p) => [p, p] as const))('%s：白名单外一个标签都没有', (_l, path) => {
    // ⚠️ 用 allTags（**全量清点**）而不是 drawElements（只认 7 种 tag）——
    //    后者对 `<image>` / `<text>` / `<use>` 完全隐形，是 Story 1.8 的 P2-2。
    const tags = allTags(readAsset(path))

    expect(
      tags.filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t)),
      `${path} 用到了白名单外的标签（实际用到：${tags.join('、')}）—— ` +
        '§3.4/§3.5 声明为机器判据，而 path 的 d 里可以有弧线与贝塞尔，' +
        '手写包围盒只能近似，近似值算出来的「留白 ≥ 41px」是假绿。' +
        '要用 path 就得把这两条改成 👁。',
    ).toEqual([])
  })

  it('P2-2 变异：塞一个 <image> / <text> / <use> / <foreignObject>，这条必须红（各一个都不许放过）', () => {
    // ⚠️ 这四个正是**旧实现完全看不见**的那些标签。逐个验证，避免「只挡住了 <image>，
    //    换个标签名又漏」—— 白名单的价值在于它对**未知**标签也成立。
    for (const injected of ['image', 'text', 'use', 'foreignObject']) {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
        `<${injected} id="x"/>` +
        '<rect x="1" y="1" width="2" height="2"/></svg>'

      expect(
        allTags(svg).filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t)),
        `塞进 <${injected}> 之后白名单没拦住 —— 说明扫描器对它不可见，P2-2 没修干净`,
      ).toEqual([injected.toLowerCase()])
    }
  })

  it('P2-2 反向：容器 `<svg>` / `<g>` 不许被误报（误报的守卫会被当噪声忽略）', () => {
    const svg = '<svg viewBox="0 0 512 512"><g stroke="#fff"><circle cx="1" cy="1" r="1"/></g></svg>'

    expect(allTags(svg).filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t))).toEqual([])
  })

  it('P2-2 反向：注释里的标签与不渲染容器里的标签都不许被算进去', () => {
    const svg =
      '<svg viewBox="0 0 512 512">' +
      '<!-- <text>这是注释里的字</text> -->' +
      '<defs><pattern id="p"><image href="a.png"/></pattern></defs>' +
      '<rect x="1" y="1" width="2" height="2"/></svg>'

    expect(
      allTags(svg).filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t)),
      '注释 / defs / pattern 里的标签被算进来了 —— 剥注释与剥不渲染容器这两步没生效',
    ).toEqual([])
  })

  it('M23：命名空间前缀 —— `sodipodi:` 这类编辑器元数据不许让合规的导出文件变红', () => {
    // ⚠️ `[CR]` 2026-10-14 抓到的**误报**：旧正则 `/<([a-zA-Z][a-zA-Z0-9-]*)/g`
    //    在 `:` 处停住，把 `<sodipodi:namedview>` 读成 `sodipodi` ——
    //    而 `sodipodi` 不在白名单里，于是 §3.7 对一份**完全合规**的
    //    Inkscape / Illustrator 导出文件报错。
    //    触发场景正是 §3 ⚠️ 里点名的「从绘图工具导出 SVG」。
    const exported =
      '<svg viewBox="0 0 512 512" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">' +
      '<sodipodi:namedview id="n" inkscape:zoom="4"/>' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>' +
      '<rect x="1" y="1" width="2" height="2"/></svg>'

    expect(
      allTags(exported).filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t)),
      '编辑器元数据标签被算进 §3.7 了 —— 前缀 `sodipodi:` / `inkscape:` / `rdf:` ' +
        '不是 SVG 命名空间，渲染器直接忽略，不该判违规。但 `svg:` 前缀**要**归一化成本地名' +
        '（`svg:rect` ≡ `rect`），否则它反而会被当成外来标签。',
    ).toEqual([])
    // 反向：`svg:` 前缀是**本命名空间**，归一化后必须仍然被认成 `rect`（白名单放行）。
    // ⚠️ 这条断言同时锁住两个方向：外来前缀被跳过、`svg:` 前缀被归一化。
    //   把命名空间处理整个删掉，这里会得到 `['rect']` 仍然通过 ——
    //   所以它的守护靠的是上面那条（外来前缀必须被跳过），不是这一条。
    expect(allTags('<svg:rect x="1"/>')).toEqual(['rect'])
  })

  it('M24：自闭合的 `<defs/>` 也要被剥掉', () => {
    // ⚠️ `stripNonRenderedBlocks` 原本只认「成对」标签。该函数已从私有提升为 `export`
    //    并成为 `allTags()` 的地基 —— 它现在是内容完整性守卫的一部分了。
    expect(allTags('<svg viewBox="0 0 512 512"><defs/><rect x="1"/></svg>')).toEqual(['rect', 'svg'])
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

/**
 * 🔥 注释的三个良构性缺口 —— **必须真正扫描，不能靠正则「找得到才算坏」。**
 *
 * ① **正文里的 `--`**：XML 规范只允许 `-->` 结束注释，正文出现 `--` 即非法。
 * ② **未闭合的注释**：旧实现 `source.match(/<!--[\s\S]*?-->/g)` 只找**成对**的注释 ——
 *    一个只有 `<!--` 没有 `-->` 的文件，这个正则返回**空数组**，
 *    `bad` 就是空，**判为合法**。而「判为合法」的代价是：整份 SVG 解析失败、一片都渲染不出来，
 *    而 G1–G7 全部绿着（它们查的是「属性对不对」，文件根本没被解析时属性当然是对的）。
 *    ⇒ P2-1 把它改成「数 `<!--` 与 `-->` 的出现次数，不等即报错」。
 * ③ **孤立的 `-->`**：反过来也不合法，同一个计数判据能发现。
 *
 * ⚠️ `[CR]` 2026-10-14 —— **计数判据本身漏了一个形态，② ③ 被换成了逐个扫描。**
 *   `<svg><!---></svg>` 里 `<!--` 出现 1 次、`-->` 也出现 1 次，**计数相等 ⇒ 判为合法**。
 *   但那个 `-->` 的两个短横是**从开标记里借的**：XML 解析器从第 5 个字符起找终止符，
 *   剩下 `->` 凑不满三个字符，于是**整份文件解析失败** ——
 *   与 P2-1 声称已彻底修掉的是**同一类**输入，只是形态不同。
 *   ⇒ 改成顺序扫描：找到 `<!--` 之后**从 `open + 4` 起**找终止符，
 *     绝不允许终止符与开标记重叠。
 *
 * ⚠️ 顺带修掉一条**文案说反**的缺陷：旧判据对「开 0 次 / 闭 1 次」也报「未闭合」，
 *   而成因恰恰是相反方向（多了一个终止符，不是少了一个）。排错的人会被指到错的成因上。
 */
function commentDefects(source: string): string[] {
  const problems: string[] = []
  let i = 0

  while (i < source.length) {
    const open = source.indexOf('<!--', i)
    const orphan = source.indexOf('-->', i)
    if (open === -1 && orphan === -1) break

    // ③ 孤立的 `-->`：先遇到它，说明它前面没有 `<!--`
    if (orphan !== -1 && (open === -1 || orphan < open)) {
      problems.push(
        `多余的注释结束标记 \`-->\`（第 ${orphan + 1} 个字符）：它前面没有对应的 \`<!--\``,
      )
      i = orphan + 3
      continue
    }

    // ② 真正的注释：终止符**从 open + 4 起找**，不与开标记重叠
    const close = source.indexOf('-->', open + 4)
    if (close === -1) {
      problems.push(
        `未闭合的注释：\`<!--\` 出现在第 ${open + 1} 个字符，之后再没有 \`-->\` —— ` +
          '整份 SVG 会按 image/xml 解析失败，一片都渲染不出来',
      )
      break
    }

    const body = source.slice(open + 4, close)
    if (body.includes('--')) {
      problems.push(`注释正文里有连续双短横：${(body.split('\n')[1] ?? body).trim()}`)
    }
    i = close + 3
  }

  return problems
}

/**
 * G8 的覆盖面 —— **塔与僵尸 + 全部 30 张词图**（`[DS]` Story 1.8 / AC-2 扩）。
 *
 * ⚠️ 扩之前词图**一张都没进过 G8**。而词图恰恰是中文注释的高发区 ——
 *   Story 1.7 真的踩过：三张塔图因为注释里写了 `--color-tower-shooter` 而
 *   **一张都渲染不出来**，而当时 G1–G7 全部绿着。
 *   这次给 5 张新词图写中文注释，是同一个坑的第二次高发期。
 */
const G8_COVERED_ASSETS: readonly string[] = [...ALL_ASSETS, ...wordImageFiles()]

/**
 * 磁盘上真实存在的塔与僵尸 SVG —— **刻意不经 `TOWER_TYPES` / `ALL_ASSETS` 派生**。
 *
 * 🔥 `[CR]` 2026-10-14：G8 那条「反向断言」原本写成
 * `ALL_ASSETS.filter((p) => !G8_COVERED_ASSETS.includes(p))`，
 * 而 `G8_COVERED_ASSETS` **本身就是用 `...ALL_ASSETS` 定义的** ——
 * 于是这个差集**按构造恒为 `[]`，任何改动都变不红**。
 * 它承诺的是「证明扩覆盖面不许把塔挤掉」，而它连「挤掉」这个状态都构造不出来。
 *
 * 按本仓库的口径（「没被证明会红就是假绿」），这与没有守卫是同一件事。
 * ⇒ 反向断言必须拿一个**独立枚举**作被减数：只有当数据源真的不再是 `ALL_ASSETS` 时，
 *   它才可能红。
 */
function towerAndZombieFilesOnDisk(): string[] {
  const out: string[] = []
  for (const dir of [towersDir, zombiesDir]) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.svg')) out.push(join(dir, name))
    }
  }
  return out.sort()
}

describe('G8 —— 注释良构性：正文不出现连续双短横 + 不留未闭合注释', () => {
  it('覆盖面真的扩到了 30 张词图，而不是「碰巧读到几张」（AC-2）', () => {
    const wordImages = G8_COVERED_ASSETS.filter((p) => p.startsWith(wordsDir))

    expect(
      wordImages.length,
      'G8 里的词图数量不对 —— `it.each` 的数据源没扩到词图目录，' +
        '词图上的中文注释就仍然没人守，而那正是本条被造出来要守的地方。',
    ).toBe(30)
    // ⚠️ 反向断言：扩覆盖面**不许**把塔与僵尸挤掉。
    //    只断言「词图有 30 张」时，一个写成 `[...wordImageFiles()]` 的数据源也能过 ——
    //    而那会让 Story 1.7 修好的那条（塔图注释里的 token 名炸掉三张图）重新失守。
    //    ⚠️ 被减数必须是 `towerAndZombieFilesOnDisk()`（独立枚举），**不能是 `ALL_ASSETS`** ——
    //    见那个函数的注释：拿 `ALL_ASSETS` 求差集在构造上恒为 `[]`，永远红不了。
    const droppedTowers = towerAndZombieFilesOnDisk().filter((p) => !G8_COVERED_ASSETS.includes(p))

    expect(
      droppedTowers,
      'G8 的数据源里少了塔与僵尸 —— 扩词图覆盖面时把它们挤掉了，' +
        'Story 1.7 那条「三张塔图因注释里的 token 名而无法渲染」的守卫就失守了。',
    ).toEqual([])
  })

  it('独立枚举与 `ALL_ASSETS` 必须逐条相等 —— 否则上面那条反向断言的「独立」是假的', () => {
    // ⚠️ `towerAndZombieFilesOnDisk()` 只有在它确实代表「磁盘上真实存在的塔与僵尸」时，
    //    反向断言才有意义。若它与 `ALL_ASSETS` 已经漂移（比如 core 加了塔型却没出图），
    //    那条反向断言就会拿一个错误的全集去求差集，红的也是别的东西。
    expect(
      towerAndZombieFilesOnDisk(),
      '磁盘上的塔/僵尸 SVG 与 `ALL_ASSETS` 不一致 —— 要么 core 加了塔型还没出图，' +
        '要么磁盘上多了没登记的文件。G8 的反向断言建立在这个集合相等的前提上。',
    ).toEqual([...ALL_ASSETS].sort())
  })

  it.each(G8_COVERED_ASSETS.map((p) => [p, p] as const))('%s 是合法 XML', (_l, path) => {
    // ⚠️ 这条不是洁癖。本 story 画图时真的踩了：注释里为了写清 token 名打了
    //    `--color-tower-shooter`，结果**三张塔图在浏览器里一张都渲染不出来**
    //    （按 image/xml 解析时报 parse error），而 G1–G7 **全部绿着** ——
    //    守卫查的是「属性对不对」，SVG 根本没能被解析时，属性当然是对的。
    //    「文件存在」≠「文件能被浏览器读」，与 memory 里那条同源。
    expect(
      commentDefects(readAsset(path)),
      `${path} 的注释不合法 —— 这份 SVG 不是合法 XML，浏览器解析失败、图一片都渲染不出来`,
    ).toEqual([])
  })

  it('M20：往**真实的词图**注释里塞 `--`，同一套判据必须抓到（AC-2 扩覆盖面的意义）', () => {
    // ⚠️ 为什么不在真实磁盘上改：vitest 并行跑，改 `public/assets/` 会让**无关**的
    //   断言撞上这个临时状态，红的原因与它自己无关，报错指不到真正坏的地方。
    //   ⇒ 取一份**真实的词图原文**注入违规注释，再喂给同一个谓词。
    //   这样既证明了词图走的是同一条判定路径，又不碰仓库磁盘。
    const real = readAsset(join(wordsDir, 'unit-01', 'u1-cat.svg'))

    expect(
      commentDefects(real),
      '真实词图自己就带违例 ⇒ 后面「变红」证明不了什么',
    ).toEqual([])

    const mutated = real.replace('</svg>', '  <!-- 色板：#9aa0a6 = tokens.css 的 --color-word-stroke -->\n</svg>')

    expect(
      commentDefects(mutated),
      '往真实词图的注释里塞了 -- 却没被抓到 —— G8 扩到词图是形式上的，' +
        '而中文注释里的 token 名正是本条被造出来守的场景',
    ).not.toEqual([])
  })

  it('M20：真实的词图同样怕「未闭合的 <!--」—— 中文注释是高发区', () => {
    const real = readAsset(join(wordsDir, 'unit-01', 'u1-cat.svg'))
    const mutated = real.replace('</svg>', '  <!-- 忘了写结束符\n</svg>')

    expect(commentDefects(mutated).join('\n')).toContain('未闭合')
  })

  it('P2-1 变异：一个字都没坏的 SVG 必须是干净的（证明这条不是恒红）', () => {
    const ok = '<svg>\n<!-- 色板：#09428c = tokens.css 的 color-tower-shooter -->\n<rect x="1" y="1" width="2" height="2"/>\n</svg>'

    expect(commentDefects(ok)).toEqual([])
  })

  it('P2-1 变异：注释正文里的 -- 必须被抓到（并且中文破折号 —— 不许被误报）', () => {
    const bad = '<svg><!-- 见 --color-tower-shooter --><rect x="1" y="1" width="2" height="2"/></svg>'

    expect(commentDefects(bad), '注释正文里的连续双短横没被抓到 —— G8 的第一条失效了').toHaveLength(1)
    // 中文破折号 U+2014 不是 ASCII 的 `--`，写注释时最容易手抖打成后者。
    expect(commentDefects('<svg><!-- 占位图 —— 替换 --><rect x="1" y="1" width="2" height="2"/></svg>')).toEqual(
      [],
    )
  })

  it('P2-1 变异：未闭合的 `<!--` 必须被抓到 —— **旧实现对这一整类恒绿**', () => {
    // ⚠️ 这一条是 P2-1 的正身。旧实现的 `match(/<!--[\s\S]*?-->/g)` 对它返回**空数组**。
    const unclosed = '<svg>\n<!-- 这里忘了写结束符，色板：#09428c\n<rect x="1" y="1" width="2" height="2"/>\n</svg>'

    expect(
      commentDefects(unclosed),
      '未闭合的注释没被抓到 —— 旧实现对这一类输入恒为「合法」，而这类文件在浏览器里一片都渲染不出来',
    ).not.toEqual([])
    expect(commentDefects(unclosed).join('\n')).toContain('未闭合')
  })

  it('P2-1 变异：`</svg>` 也被吞进注释的情形（开 1 个、闭 0 个的等价形态）', () => {
    // 只有 `-->` 而没有 `<!--` 同样不合法：反向计数也要能发现不平衡。
    const orphan = '<svg><rect x="1" y="1" width="2" height="2"/><!-- 尾巴 --></svg>'

    expect(commentDefects(orphan)).toEqual([])
    const trulyOrphan = '<svg><rect x="1" y="1" width="2" height="2"/>\n-->\n</svg>'

    // ⚠️ `[CR]` 2026-10-14：旧判据把它报成「未闭合」，而成因是**反的** ——
    //    不是少了开标记，而是多了一个终止符。断言跟着改成正确文案，
    //    否则这条守卫会把排错的人指到错的成因上。
    expect(commentDefects(trulyOrphan).join('\n')).toContain('多余的注释结束标记')
  })

  it('M22：`<!--->` 必须红 —— **计数判据对它恒绿，而它正是 P2-1 声称修掉的那一类**', () => {
    // ⚠️ 为什么要单列这一条：`<!--->` 里 `<!--` 出现 1 次、`-->` 也出现 1 次，
    //    **计数相等 ⇒ 旧判据判为「合法」**。但那个 `-->` 的两个短横是从开标记里借的：
    //    XML 解析器从第 5 个字符起找终止符，剩下 `->` 凑不满三个字符，
    //    整份文件解析失败 —— 与 P2-1 的目标输入是同一类，只是形态不同。
    const inputs = ['<svg><!---></svg>', '<svg><!---><rect x="1" y="1" width="2" height="2"/></svg>']

    for (const src of inputs) {
      expect(
        commentDefects(src),
        '`<!--->` 被判为合法 —— 终止符的开头两个短横是从 `<!--` 里借的，' +
          '这不是合法注释，整份 SVG 会解析失败。计数判据对它恒绿，必须顺序扫描才抓得住。',
      ).not.toEqual([])
    }
  })

  it('M22 反向：合法注释一个都不许被误报（误报的守卫会被当噪声忽略）', () => {
    expect(commentDefects('<svg><!-- 色板：#09428c = tokens.css 的 color-tower-shooter --></svg>')).toEqual([])
    expect(commentDefects('<svg><!-- 占位图 —— 替换 --></svg>')).toEqual([])
    expect(commentDefects('<svg><!-- a --></svg><!-- b --></svg>')).toEqual([])
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
// G10 —— 词图不含 `<text>` / `<image>` / `<foreignObject>`（裁决 2 / AC-3）
// ══════════════════════════════════════════════════════════════════════════
//
// **为什么这条与 G9 不矛盾、不许合并。** G9 钉的是「§3.2–§3.7 **不**约束词图」；
// G10 是一条**独立的教学内容硬约束**：这个游戏教的是「听到 dog → 看见一只狗」，
// 而答案绝不允许以任何形式出现在选项上。两者方向相反（一松一紧），
// 合在一起会让下一个人以为「词图被 §3 绑住了」或「G10 是 §3 的一部分」。
//
// ⚠️ **词图照样可以用 `<path>`、可以贴边、可以重心偏移、线宽不必 16px。**
//   G10 只禁这三个标签，与 §3 无关。
//
// ⚠️ **顺序：守卫先于图。** 本组是先写的，写完那一刻它在 30 张占位图上**全红**
//   （占位图各有 3 个 `<text>`），红完才去改图。反过来做，守卫就会按
//   「手头这些图长什么样」去写，写出只对当前文件成立的断言 ——
//   `art-direction.md` 那句「声明本身没人守，是最容易骗人的一种绿」的另一种形态。

/**
 * G10 禁的三个标签 —— **文档与 spec 里的原样大小写**。
 * 单独成常量，便于断言「文档里写的也是这三个」。
 */
const WORD_IMAGE_FORBIDDEN_TAGS = ['text', 'image', 'foreignObject'] as const

/**
 * 🔥 **匹配用的小写集合** —— `allTags()` 把标签名统一归一化成小写
 * （与 `drawElements()` / `drawableElements()` 一致）。
 *
 * ⚠️ `foreignObject` 在 SVG 里是**大小写敏感**的驼峰写法，`foreignobject` 根本不是
 *   一个合法元素 —— 而守卫归一化之后两者不可区分。
 *   **这不是 bug，是守卫该有的方向**：判不出来时宁可多拦一个不存在的写法，
 *   也不能放过真正那个。（Story 1.8 的 M19 第一版就是漏了这层，红了才发现。）
 */
const WORD_IMAGE_FORBIDDEN_TAGS_LOWER = WORD_IMAGE_FORBIDDEN_TAGS.map((t) => t.toLowerCase())

/** 磁盘上真实存在的全部词图文件（按相对路径排序）。 */
function wordImageFiles(): string[] {
  return readdirSync(wordsDir, { recursive: true })
    .map(String)
    .filter((n) => n.endsWith('.svg'))
    .sort()
    .map((n) => join(wordsDir, n))
}

/**
 * 同一批词图的**第二套枚举** —— 逐个单元目录手读，不用 `readdirSync({ recursive })`。
 *
 * 🔥 `[CR]` 2026-10-14：G10 原本有一条「有重复计数」的断言
 * `new Set(files.map(f => f.split('/').pop())).size === files.length`，
 * 而 `files` 来自**一次** `readdirSync` —— 每个条目恰好返回一次，路径不可能重复，
 * basename 只在跨子目录同名时才可能撞。它文案说的是「目录被读了不止一次」，
 * 而它验证不了这件事，**结构上恒真**。
 * ⇒ 改成「两套互不相干的枚举必须给出同一个集合」：
 *   只要 `wordImageFiles()` 的 root 写错、漏了 `recursive`、或将来换成 glob，
 *   两条枚举就会分叉，而 G10 恰好是那种「少读几张就在剩下的图上恒绿」的守卫。
 */
function wordImageFilesPerUnitDir(): string[] {
  const out: string[] = []
  for (const unit of readdirSync(wordsDir).sort()) {
    const dir = join(wordsDir, unit)
    if (!statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir).sort()) {
      if (name.endsWith('.svg')) out.push(join(dir, name))
    }
  }
  return out.sort()
}

/**
 * 该文件用到的被禁标签（小写形式）。
 *
 * ⚠️ `[CR]` 2026-10-14 —— **`stripNonRendered: false`，这是必须的，不是可选优化。**
 *   剥掉不渲染容器对 §3.7 的图元白名单是对的，对**这条守卫是反的**：
 *   `<defs><text id="a">u1-dog</text></defs><use href="#a"/>` 会把答案
 *   **真的画到选项卡上**，而剥掉 defs 之后 G10 命中 `[]`。
 *   （`<pattern>` 被 `fill="url(#p)"` 引用时同样是真在渲染的。）
 *   内容完整性守卫要问的是「这份文件里有没有 `<text>`」，不是「画面上有没有」。
 */
function forbiddenTagsInSource(source: string): string[] {
  return allTags(source, { stripNonRendered: false }).filter((t) =>
    WORD_IMAGE_FORBIDDEN_TAGS_LOWER.includes(t),
  )
}

function forbiddenTagsIn(path: string): string[] {
  return forbiddenTagsInSource(readAsset(path))
}

describe('G10 —— 词图不含 <text> / <image> / <foreignObject>（裁决 2 / AC-3）', () => {
  it.each(wordImageFiles().map((p) => [p, p] as const))('%s：不含被禁的三个标签', (_l, path) => {
    // ⚠️ 用 `allTags()`（P2-2 新增的全量扫描器）。旧的 `drawElements()` 压根不认识
    //    `<text>` —— 用它写这条断言会得到一个**恒绿**的守卫，正是 P2-2 的原型。
    expect(
      forbiddenTagsIn(path),
      `${path} 里有被 G10 禁的标签 —— 词图是把「听到的声音」和「看到的东西」连起来的载体，` +
        '答案以文字形式印在选项上时，这道题会退化成文本匹配题，而这个游戏教的恰恰不是文本匹配。' +
        '（`PLACEHOLDER` 这类说明可以留在 XML 注释里，注释不渲染。）',
    ).toEqual([])
  })

  it('确实覆盖了全部 30 张词图，而不是「读了目录里碰到的头几张」', () => {
    const files = wordImageFiles()

    expect(files.length, '词图数量不对 —— 少读几张，G10 就在剩下的图上恒绿').toBe(30)
    // ⚠️ 这一条不再用「basename 去重后个数 == 数组长度」——
    //    那来自一次 readdirSync，结构上恒真，见 `wordImageFilesPerUnitDir()` 的注释。
    //    改成与**第二套独立枚举**逐条比对：只要两套枚举分叉，就说明有一张图没人守。
    expect(
      files,
      '两套枚举（recursive 递归 vs 逐单元目录）给出了不同的词图集合 —— ' +
        '说明有一张图没进 G10 的覆盖面，而 G10 恰好是那种「少读几张就在剩下的图上恒绿」的守卫。' +
        '查 `wordImageFiles()` 的 root / recursive 参数有没有被人改过。',
    ).toEqual(wordImageFilesPerUnitDir())
  })

  it('M21：`<defs>` / `<symbol>` / `<pattern>` 里藏 `<text>` + `<use>` 引出来，必须红', () => {
    // ⚠️ `[CR]` 2026-10-14 抓到的完整绕过路径 —— 旧实现（剥不渲染容器）命中 `[]`，
    //    而 `<use>` 会把那段文字真的画到选项卡上。这条是 AC-4「答案泄漏闭合」的本体。
    const smuggles = [
      '<defs><g id="a"><text x="20" y="40">u1-dog</text></g></defs><use href="#a"/>',
      '<defs><text id="a">u1-dog</text></defs><use href="#a"/>',
      '<symbol id="a"><image href="x.png"/></symbol><use href="#a"/>',
      '<defs><pattern id="p"><text>u1-cat</text></pattern></defs><rect width="512" height="512" fill="url(#p)"/>',
    ]

    for (const body of smuggles) {
      const svg = `<svg viewBox="0 0 512 512" width="512" height="512">${body}</svg>`

      expect(
        forbiddenTagsInSource(svg),
        '这段把被禁标签藏进不渲染容器再用 `<use>` / `fill="url(#)"` 引出来，G10 却没红 —— ' +
          '答案会被真的画到选项卡上，而这正是本条守卫存在的理由',
      ).not.toEqual([])
    }
  })

  it('M25：`aria-label` 之类的属性值里出现 `<text>` 不许被读成真标签', () => {
    // ⚠️ `[CR]` 2026-10-14 抓到的**误报**：旧实现是一条裸正则，分不清「标签开始」
    //    和「属性值里恰好有个尖括号」。实测 `aria-label="a <text> b"` 被读出一个 `text`。
    //    P2-4 刚为词图那 30 个中文 `aria-label` 修好了 `>` 的一侧，`<` 的一侧是同一个洞。
    //    方向也正是本文件反复警告的：会误报的守卫会被当成噪声忽略。
    const svg =
      '<svg viewBox="0 0 512 512" role="img" aria-label="词图：a <text> 与 b <image> 的对照">' +
      '<circle cx="256" cy="256" r="180"/></svg>'

    expect(
      forbiddenTagsInSource(svg),
      '属性值里的字面量被读成了标签 —— 这份 SVG 完全合法，却报「有被禁的标签」。' +
        '扫描必须跟踪引号状态，属性值内部的 `<` 不是标签的开始。',
    ).toEqual([])
  })

  it('M25 变异：属性值里的 `>` 也不许把开标签截断（截断方向同样表现为「守卫恒绿」）', () => {
    // 截断与误报是同一个洞的两个方向：一个造出幻影标签，一个吃掉后面的真标签。
    const svg =
      '<svg viewBox="0 0 512 512" aria-label="a > b"><text x="1">u1-dog</text></svg>'

    expect(
      forbiddenTagsInSource(svg),
      '属性值里的 `>` 把标签扫描截断了 —— 真存在的 `<text>` 没被看见，G10 恒绿',
    ).toEqual(['text'])
  })

  it('M21 反向：§3.7 那边**仍然要**剥不渲染容器（两处用途要的答案不同，不许一刀切）', () => {
    // ⚠️ 如果为了让 G10 变严而把 `allTags()` 里的剥离整个删掉，§3.7 会开始误报 ——
    //    `<pattern>` 里的 `<image>` 是定义数据不是画面。一个会误报的守卫会被当噪声忽略。
    const svg =
      '<svg viewBox="0 0 512 512">' +
      '<defs><pattern id="p"><image href="a.png"/></pattern></defs>' +
      '<rect x="1" y="1" width="2" height="2"/></svg>'

    expect(
      allTags(svg).filter((t) => !SECTION_3_7_ALLOWED_TAGS.includes(t)),
      '不渲染容器里的标签被算进 §3.7 了 —— 剥容器那一步失效，塔图会误报',
    ).toEqual([])
    // 而同一条 SVG 在 G10 那边（不剥）必须**看得见** `<image>` —— 这正是两种语义的分野
    expect(forbiddenTagsInSource(svg)).toEqual(['image'])
  })

  it('M19：塞一个 <text> 进词图必须红 —— 且红的原因只能是「有 <text>」，不是别的东西', () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
      '<circle cx="256" cy="256" r="180" fill="#e8a33d"/></svg>'
    const smuggled = clean.replace('</svg>', '<text x="256" y="256">u1-ball</text></svg>')

    expect(
      forbiddenTagsInSource(clean),
      '干净样本自己就带违例 ⇒ 后面「变红」证明不了什么',
    ).toEqual([])
    expect(
      forbiddenTagsInSource(smuggled),
      '塞进 <text> 没被判为违例 —— G10 是恒绿的',
    ).toEqual(['text'])
  })

  it('M19：<image> 与 <foreignObject> 同样各拦一个（三个标签只挡住一个的话，换个标签名就漏了）', () => {
    // ⚠️ 期望值一律写成**小写**：`allTags()` 归一化，`<foreignObject>` 读到的是
    //    `foreignobject`。M19 第一版写成驼峰，红了一次才发现 —— 这正是它该发现的东西。
    for (const tag of ['image', 'foreignObject']) {
      const svg =
        '<svg viewBox="0 0 512 512"><rect x="1" y="1" width="2" height="2"/>' + `<${tag} id="x"/></svg>`

      expect(
        forbiddenTagsInSource(svg),
        `<${tag}> 没被判为违例 —— 白名单的价值在于它对**未知**标签也成立`,
      ).toEqual([tag.toLowerCase()])
    }
  })

  it('M19 反向：注释里写 <text> 不算违例（说明「挪进注释」这条路是通的）', () => {
    const commented =
      '<svg viewBox="0 0 512 512"><!-- 占位词图：u1-ball，Story 1.8 / 1.9 替换 -->' +
      '<rect x="1" y="1" width="2" height="2"/></svg>'

    expect(
      forbiddenTagsInSource(commented),
      '注释里的标签被算成违例了 —— 那等于逼着人把说明留在图上',
    ).toEqual([])
  })

  it('G10 对塔与僵尸同样生效 —— 否则有人会把它读成「只有词图禁 <text>」，把 §3.7 的范围搞混', () => {
    // ⚠️ 这一条是**故意**让 G10 覆盖到塔/僵尸的：塔与僵尸是 4 张固定资产，
    //   禁 `<text>` 对它们的成本是零（一张都没有），而一旦哪天真给塔图加了标签，
    //   这里会立刻红。
    //   ⚠️ 它与 §3.7 白名单是**两条独立的规则**：
    //      §3.7 说「塔只许用这 6+2 种图元」（几何可判定性），G10 说「不许把字印在图上」（教学）。
    //      塔落在两条的交集里，不是 G9 的例外。
    for (const path of ALL_ASSETS) {
      expect(forbiddenTagsIn(path), `${path} 里有被 G10 禁的标签`).toEqual([])
    }
  })

  it('art-direction.md 写着这条规则，且列的是**同样三个**标签 —— 文档与守卫不许各说各的', () => {
    const doc = readFileSync(join(root, 'docs/art-direction.md'), 'utf8')

    expect(
      doc,
      'docs/art-direction.md 缺「词图不得含 <text> / <image> / <foreignObject>」这条规则 —— ' +
        '它是裁决 2 的正文，删掉之后 G10 会变成一条没有出处、也没人知道为什么存在的断言。',
    ).toContain('<foreignObject>')
    for (const tag of WORD_IMAGE_FORBIDDEN_TAGS) {
      expect(
        doc.includes(`<${tag}>`),
        `art-direction.md 的规则正文里没点名 <${tag}> —— 文档与守卫的标签集必须一致`,
      ).toBe(true)
    }
  })

  it('G10 不得被写成推翻 §3 适用范围（G9 的裁决还站着）', () => {
    // ⚠️ 照 G9 的写法。G10 与 G9 方向相反且都合法，
    //    唯一的失败模式就是把它们**混成一条** —— 那会让「词图是不是被 §3 绑住了」
    //    变成一个只能靠读代码推断的问题。
    const doc = readFileSync(join(root, 'docs/art-direction.md'), 'utf8')

    expect(
      doc,
      '§3 的「只约束塔与僵尸」被改没了 —— G10 新增之后有人顺手扩大了 §3 的适用范围。' +
        'G10 只禁三个标签，与 §3.2–§3.7 无关；词图用 <path> 仍然合法。',
    ).toContain('只约束塔与僵尸')
    expect(doc, '§3 的适用范围必须仍然明说词图只受 §3.1。').toContain('只有 §3.1')
    expect(
      doc,
      '§3 的「不约束词图」小节必须仍然明确写着词图不受 §3.2–§3.7 约束。',
    ).toContain('词图不受 §3.2–§3.7 约束')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// G9 —— `[CC] 2026-10-14` 裁决：§3.2–§3.7 只约束塔与僵尸，词图只受 §3.1
// ══════════════════════════════════════════════════════════════════════════
//
// **为什么文档裁决还要配一组测试？** 因为本文件 §2「真被守着吗」那张表自己写着：
// 「声明本身没人守，是最容易骗人的一种绿」。Story 1.7 已经因为这个吃过两次亏
// （占位图 viewBox 没人查；XML 注释里的双短横让三张图渲染不出来而 G1–G7 全绿）。
// 所以本次裁决 —— 「词图不受 §3 约束」—— 同样必须有东西证明它**现在是真的**。
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
