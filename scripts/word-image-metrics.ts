/**
 * 词图构图实算 —— `art-direction.md` §5.1 / §5.2 / §5.3 的唯一算法来源。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 把 §5 三条构图判据（主体占比、最小留白、重心）从「👁 取景框目视」变成实算。
 * 守卫 `tests/assets/word-image-composition.test.ts` 的 G11 / G12 / G13 全部
 * 调本模块的 `measureWordImage()`，**不在测试里另写一份几何算法**。
 *
 * ── 为什么这么写 ────────────────────────────────────────────────────────────
 * `asset-geometry.test.ts` 的 `drawElements()` / `subjectBox()` 解析不了 `<path>`，
 * 拿它量词图算出来的是假数字（`art-direction.md:507-513`）。
 * 所以这里是**并行的第二套**，**没有替换**、也不去改那两个取样器。
 *
 * ⚠️ **描边半宽的口径（AC-3 与 AC-4 冲突，`[DS]` 2026-10-14 上报后由用户裁决）**
 * AC-3 写「处理 `<g>` 上的 `stroke-width` / `stroke` 继承」，AC-4 写「脚本必须
 * 复现 `[CR]` 那 5 组黄金值」。**两条互斥**：按继承算，5 张里 3 张对不上黄金值。
 * 实测证明黄金值出自**只读元素自身属性**的口径。本模块据此实现 `own` 口径
 * （= 黄金口径，G11/G12/G13 断言用它），同时算出 `full` 口径（含 `<g>` 继承）
 * 供对照输出。
 * ⚠️ **这是一条方向明确的宽松偏差**：`own` 比 `full` 小（5 张上最多差 3.2pt / 8px）。
 * 真正被渲染的墨迹是 `full` 那一份。两列都打印在 `--verbose` 表格里，
 * 不藏着 —— 藏着就是「守的是错的东西」。
 *
 * ── 期望值来源与出处 ────────────────────────────────────────────────────────
 * 黄金值：`docs/art-direction.md:540-546`（`[CR]` 2026-10-14 一次性实算，
 * 本仓库此前**没有留脚本**，`art-direction.md:557-558` 把这件事登记为成本）。
 * 档位取值域与归类：`art-direction.md` §5.1 与本 story AC-7。
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripNonRenderedBlocks, stripXmlComments } from './validate-content'

// ── 可调常量（AC-3：「采样密度必须是可调常量并写明取值」）──────────────────────

/**
 * 曲线采样密度：每条贝塞尔 / 二次曲线 / 弧线各取多少个采样点。
 *
 * 取值 **64**。依据：一张 512×512 的词图，主体最长的曲线弧长在 1000px 量级；
 * 64 个采样点对应最坏约 16px 的弦长，而描边半宽最小 4.5px ——
 * **弦长远小于半宽，采样误差（O(h²)）不会超过 1px**，落在 AC-4 的 2px 容差内。
 * 调大会让极值更准、调小会让外接框偏小（偏宽松），所以**不调小**。
 */
export const CURVE_SAMPLES = 64

/** 椭圆与圆按角度参数化采样时，每圈取多少点 —— 与 CURVE_SAMPLES 同量级即可（真解是解析的）。 */
const OVAL_SAMPLES = 72

// ── 基础几何 ─────────────────────────────────────────────────────────────────

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function boxIsEmpty(box: Box): boolean {
  return !Number.isFinite(box.minX) || !Number.isFinite(box.maxX)
}

/**
 * 把一个点并进外接盒。
 *
 * ⚠️ **非有限值直接丢弃，而不是让断言去比较 `NaN`**（本 story Dev Notes §6 ⑥）：
 * 退化控制点会让贝塞尔算出 `NaN`，而 `NaN` 与任何区间比较都是 `false` ——
 * **断言会静默通过**。在这里丢掉它，结果至少是「这个图元没被量到」的可查状态。
 */
function growBox(box: Box, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  if (x < box.minX) box.minX = x
  if (x > box.maxX) box.maxX = x
  if (y < box.minY) box.minY = y
  if (y > box.maxY) box.maxY = y
}

function sampleCubic(box: Box, p0: Point, p1: Point, p2: Point, p3: Point): void {
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const t = i / CURVE_SAMPLES
    const u = 1 - t
    growBox(
      box,
      u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    )
  }
}

function sampleQuad(box: Box, p0: Point, p1: Point, p2: Point): void {
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const t = i / CURVE_SAMPLES
    const u = 1 - t
    growBox(box, u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y)
  }
}

/**
 * 椭圆弧：端点参数化 → 圆心参数化 → 按角度采样。
 *
 * ⚠️ 半径过小时（`λ > 1`，SVG 规范要求放大到恰好接上）**必须照做**，
 *   否则圆心算错、整条弧跑到画布外，那是一个「凭空多出几万像素」的假外接框。
 */
function sampleArc(box: Box, from: Point, rx: number, ry: number, xAxisRotationDeg: number, largeArc: boolean, sweep: boolean, to: Point): void {
  const phi = (xAxisRotationDeg * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx2 = (from.x - to.x) / 2
  const dy2 = (from.y - to.y) / 2
  const x1 = cosPhi * dx2 + sinPhi * dy2
  const y1 = -sinPhi * dx2 + cosPhi * dy2

  let rxa = Math.abs(rx)
  let rya = Math.abs(ry)
  if (rxa === 0 || rya === 0) {
    // 规范：半径为 0 时本段退化成直线
    growBox(box, to.x, to.y)
    return
  }
  const lambda = (x1 * x1) / (rxa * rxa) + (y1 * y1) / (rya * rya)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rxa *= scale
    rya *= scale
  }

  const numerator = rxa * rxa * rya * rya - rxa * rxa * y1 * y1 - rya * rya * x1 * x1
  const denominator = rxa * rxa * y1 * y1 + rya * rya * x1 * x1
  const coefficient = denominator === 0 ? 0 : Math.sqrt(Math.max(0, numerator) / denominator)
  const sign = largeArc === sweep ? -coefficient : coefficient
  const cxp = (sign * rxa * y1) / rya
  const cyp = (-sign * rya * x1) / rxa
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2

  const ux = (x1 - cxp) / rxa
  const uy = (y1 - cyp) / rya
  const vx = (-x1 - cxp) / rxa
  const vy = (-y1 - cyp) / rya
  const theta0 = Math.atan2(uy, ux)
  let deltaTheta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI

  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const theta = theta0 + (deltaTheta * i) / CURVE_SAMPLES
    const ex = rxa * Math.cos(theta)
    const ey = rya * Math.sin(theta)
    growBox(box, cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy)
  }
}

// ── path 解析（AC-3：M/L/H/V/C/S/Q/T/A/Z，含相对形式）────────────────────────

interface Point {
  x: number
  y: number
}

class PathReader {
  private readonly tokens: string[]
  private index = 0
  private command = ''

  constructor(d: string) {
    this.tokens = d.match(/[a-zA-Z]|[-+]?(?:[0-9]*\.[0-9]+|[0-9]+\.?)(?:[eE][-+]?[0-9]+)?/g) ?? []
  }

  get done(): boolean {
    return this.index >= this.tokens.length
  }

  private static isCommand(token: string | undefined): boolean {
    return token !== undefined && /^[a-zA-Z]$/.test(token)
  }

  /**
   * 读一个数值。
   *
   * ⚠️ **必须校验，不能直接 `Number(raw)`**：`Number('N')` 是 `NaN` 而不是抛错，
   *   于是 `d="M 10 10 L 20 NaN"` 会被读成一条 y 为 NaN 的线段 ——
   *   `growBox` 把 NaN 丢掉，包络悄悄缩成 (10,10)，
   *   **断言拿到的是一个偏小的假框并判它合规**（本 story Dev Notes §6 ⑥ 的同源形态）。
   *   这里抛错，把「文件里有非法数值」变成一条能被发现的错误。
   */
  private number(): number {
    const raw = this.tokens[this.index]
    this.index += 1
    const value = Number(raw)
    if (raw === undefined || !Number.isFinite(value)) {
      // ⚠️ 判据必须是 `!Number.isFinite`，不是 `Number.isNaN`：`Number('1e999')` 是 **Infinity**
      //   而不是 NaN，而 `growBox`（:75）会把非有限值静默丢弃 —— 那正是注释承诺要防的偏小方向。
      //   `[CR]` 2026-10-15 补（与 `finiteNumber()` 的判据对齐）。
      throw new Error(`word-image-metrics：path 里出现非法数值 "${String(raw)}"`)
    }
    return value
  }

  /**
   * 读弧线的一个标志位（`large-arc` / `sweep`）。
   *
   * ⚠️ **连写的标志位（`a100 100 0 0110 10`）本解析器不支持，遇到就抛错。**
   *   SVG 允许两个标志位与后面的坐标粘在一起，而本模块是**先按词法切分再解析**的 ——
   *   切分阶段无法知道哪个 token 是「两个标志位」哪个是「坐标」，
   *   硬猜的后果是**读出一个几何上合法但完全错误的弧**（圆心落到别处，外接盒偏大）。
   *   **偏大是判红的方向，会把合规的图判红 —— 误报比漏报更坏**
   *   （`validate-content.ts` 的 `stripNonRenderedBlocks` 注释里是同一条理由）。
   *   ⇒ 抛错而不是猜。本项目的词图由人手写、绘图工具也一律输出带空格的标志位。
   */
  private flagCompact(): boolean {
    const raw = this.tokens[this.index]
    this.index += 1
    if (raw !== '0' && raw !== '1') {
      throw new Error(
        `word-image-metrics：弧线标志位读到 "${String(raw)}"（可能是连写形式如 "0110"）。` +
          '本解析器不支持连写标志位 —— 请把 large-arc / sweep 写成带空格的 "0 1"。',
      )
    }
    return raw === '1'
  }

  /**
   * 把一条 `d` 的全部曲线并进 `box`。
   */
  walkPath(box: Box): void {
    this.index = 0
    this.command = ''

    let current: Point = { x: 0, y: 0 }
    let subpathStart: Point = { x: 0, y: 0 }
    let lastCubicControl: Point | null = null
    let lastQuadControl: Point | null = null

    while (!this.done) {
      if (PathReader.isCommand(this.tokens[this.index])) {
        this.command = this.tokens[this.index]
        this.index += 1
      } else if (this.command === '') {
        throw new Error(
          `word-image-metrics：path 以数值开头（首个 token "${this.tokens[0]}"），缺命令字母`,
        )
      }
      // ⚠️ 非命令 token **不推进指针** —— 它是上一个命令的隐式重复坐标。
      //   SVG 允许 `L 10 10 20 20`（Inkscape / Illustrator 的紧凑导出很常见）。
      //   `[CR]` 2026-10-15：旧实现在这里无条件 `index += 1`，会跳过那个数字，
      //   随后 `number()` 读到 undefined 并报一句指向不存在元素的「非法数值」。

      const letter = this.command.toUpperCase()
      const relative = this.command === this.command.toLowerCase()
      const originX = relative ? current.x : 0
      const originY = relative ? current.y : 0

      switch (letter) {
        case 'M': {
          const x = this.number() + originX
          const y = this.number() + originY
          // `M` 之后的隐含命令是 `L`
          if (!this.done && !PathReader.isCommand(this.tokens[this.index])) {
            const lx = this.number() + originX
            const ly = this.number() + originY
            growBox(box, x, y)
            growBox(box, lx, ly)
            current = { x: lx, y: ly }
          } else {
            growBox(box, x, y)
            current = { x, y }
          }
          this.command = relative ? 'l' : 'L'
          subpathStart = current
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        case 'L': {
          current = { x: this.number() + originX, y: this.number() + originY }
          growBox(box, current.x, current.y)
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        case 'H': {
          current = { x: this.number() + originX, y: current.y }
          growBox(box, current.x, current.y)
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        case 'V': {
          current = { x: current.x, y: this.number() + originY }
          growBox(box, current.x, current.y)
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        case 'C':
        case 'S': {
          let firstControl: Point
          let secondControl: Point
          if (letter === 'C') {
            firstControl = { x: this.number() + originX, y: this.number() + originY }
            secondControl = { x: this.number() + originX, y: this.number() + originY }
          } else {
            // `S` 的第一个控制点是上一个 `C` 第二个控制点的镜像；
            // 上一个命令不是 `C`/`S` 时规范规定用当前点。
            firstControl =
              lastCubicControl === null
                ? { x: current.x, y: current.y }
                : { x: 2 * current.x - lastCubicControl.x, y: 2 * current.y - lastCubicControl.y }
            secondControl = { x: this.number() + originX, y: this.number() + originY }
          }
          const end = { x: this.number() + originX, y: this.number() + originY }
          sampleCubic(box, current, firstControl, secondControl, end)
          lastCubicControl = secondControl
          lastQuadControl = null
          current = end
          break
        }
        case 'Q':
        case 'T': {
          let control: Point
          if (letter === 'Q') {
            control = { x: this.number() + originX, y: this.number() + originY }
          } else {
            control =
              lastQuadControl === null
                ? { x: current.x, y: current.y }
                : { x: 2 * current.x - lastQuadControl.x, y: 2 * current.y - lastQuadControl.y }
          }
          const end = { x: this.number() + originX, y: this.number() + originY }
          sampleQuad(box, current, control, end)
          lastQuadControl = control
          lastCubicControl = null
          current = end
          break
        }
        case 'A': {
          const rx = this.number()
          const ry = this.number()
          const rotation = this.number()
          // 标志位在 SVG 里允许紧贴（`a1 1 0 0110 10`），连写时按单字符读
          const largeArc = this.flagCompact()
          const sweep = this.flagCompact()
          const end = { x: this.number() + originX, y: this.number() + originY }
          sampleArc(box, current, rx, ry, rotation, largeArc, sweep, end)
          current = end
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        case 'Z': {
          current = subpathStart
          lastCubicControl = null
          lastQuadControl = null
          break
        }
        default:
          throw new Error(`word-image-metrics：path 里出现未知命令 "${this.command}"`)
      }
    }
  }
}

/** 取一条 `d` 的外接盒（**不含**描边半宽）。导出供路径解析器的单元测试使用。 */
export function pathBoundingBox(d: string): Box {
  const box = emptyBox()
  new PathReader(d).walkPath(box)
  return box
}

// ── XML 读取 ─────────────────────────────────────────────────────────────────

const NON_RENDERED = new Set(['defs', 'mask', 'clipPath', 'pattern', 'symbol'])

/** 属性表。同时支持双引号与单引号（绘图工具导出的是单引号，本 story Dev Notes §6 ⑤）。 */
function parseAttributes(tag: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /([-a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let hit = pattern.exec(tag)
  while (hit !== null) {
    map.set(hit[1].toLowerCase(), hit[2] ?? hit[3] ?? '')
    hit = pattern.exec(tag)
  }
  return map
}

/** 元素扫描器产出的一个节点。 */
interface Node {
  tag: string
  attrs: Map<string, string>
  children: Node[]
}

/**
 * 2×3 仿射矩阵（SVG 的 matrix(a b c d e f)）。
 *
 * ⚠️ **为什么用矩阵而不是「一个 offset + 一个角度」**
 * —— `[DS]` 2026-10-14 的实测教训，别改回去：
 * 原实现只把 `<g>` 上的 **translate** 往下传，**rotate 直接丢掉**。
 * 症状是「把 `rotate(-35 …)` 改成 `rotate(-45 …)`，实测值一字不变」。
 * 后果不是「算小一点」而是**算大**：一根长 L 宽 W 的斜条，
 * 忽略旋转时长边是 L，计入旋转后长边只有 L·sinθ + W·cosθ —— 45° 时小掉三成。
 * 偏大正是判红的方向，所以这是**假红**；而假红会让人去改图，不该让人去改脚本。
 * ⇒ 现在容器与元素**一律**把完整的仿射矩阵往下传。
 */
interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** SVG 的复合顺序：列表里靠右的先作用。返回 `outer · inner`。 */
function multiply(outer: Matrix, inner: Matrix): Matrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  }
}

const TRANSFORM_FUNCTION = /([a-zA-Z]+)\s*\(([^)]*)\)/g

/**
 * 解析 `transform` 属性。
 *
 * ⚠️ **只认 `translate` 与 `rotate`**（单元 1 的 30 张词图只用到这两种，
 * 已逐张 grep 确认：18 处 rotate、1 处 translate、0 处 scale / skew / matrix）。
 * 遇到不认识的一律**抛错**，不静默忽略 ——
 * 这与弧线连写标志位是同一个判断：**猜错方向比报错更糟**，
 * 因为猜错会安静地产生一个偏大的框，而偏大 = 假红 = 有人会去改图。
 */
function matrixOf(node: Node): Matrix {
  const raw = node.attrs.get('transform')
  if (raw === undefined || raw.trim() === '') return IDENTITY

  let out = IDENTITY
  let consumed = ''
  TRANSFORM_FUNCTION.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TRANSFORM_FUNCTION.exec(raw)) !== null) {
    consumed += match[0]
    const name = match[1]
    const args = match[2]
      .split(/[\s,]+/)
      .filter((s) => s !== '')
      .map(Number)
    if (args.some((n) => !Number.isFinite(n))) {
      throw new Error(`word-image-metrics：transform 里出现非法数值 "${match[2]}"`)
    }
    if (name === 'translate') {
      out = multiply(out, { a: 1, b: 0, c: 0, d: 1, e: args[0] ?? 0, f: args[1] ?? 0 })
      continue
    }
    if (name === 'rotate') {
      const rad = ((args[0] ?? 0) * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const cx = args[1] ?? 0
      const cy = args[2] ?? 0
      // 绕点旋转公式：`rotate(deg cx cy) = translate(cx cy) · rotate(deg) · translate(-cx -cy)`
      out = multiply(
        out,
        multiply(
          { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy },
          multiply(
            { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
            { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy },
          ),
        ),
      )
      continue
    }
    throw new Error(
      `word-image-metrics：不认识的 transform 函数 "${name}("。` +
        '本解析器只实现 translate / rotate —— 请不要在词图里用 scale / skew / matrix，' +
        '也不要在这里悄悄加一个「猜」的实现。',
    )
  }
  const stripped = raw.replace(/\s/g, '')
  if (consumed.replace(/\s/g, '') !== stripped) {
    throw new Error(
      `word-image-metrics：transform 里有一段没能解析："${stripped}"（已认出 ${consumed}）`,
    )
  }
  return out
}

/** 把已经量出来的局部框按仿射矩阵变换到画布坐标系，取四角包络。 */
function applyMatrix(box: Box, m: Matrix): Box {
  const out = emptyBox()
  for (const [px, py] of [
    [box.minX, box.minY],
    [box.minX, box.maxY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
  ] as [number, number][]) {
    growBox(out, m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f)
  }
  return out
}

/**
 * 扫描一棵标签树。**先剥注释与不渲染容器**，再解析。
 *
 * ⚠️ `stripNonRenderedBlocks` 在这里**只用来做几何**（剥掉 `<defs>` 等不参与渲染的图元）。
 *   ⚠️ **它绝不能用来做内容完整性判定** —— 剥掉容器会让 `<defs><text id="a">…</text></defs>`
 *   从检查里消失，那正是 Story 1.8 的 G10 绕过路径（`1-8-…md:311`）。
 *   **两处用途必须显式分开**：G10 用 `stripXmlComments`（不剥容器），这里才剥。
 */
function parseTree(source: string): Node {
  const cleaned = stripNonRenderedBlocks(stripXmlComments(source))
  const root: Node = { tag: '#root', attrs: new Map(), children: [] }
  const stack: Node[] = [root]
  for (const raw of scanTags(cleaned)) {
    if (raw.closing) {
      const top = stack[stack.length - 1]
      if (top.tag === '#root') throw new Error(`word-image-metrics：多余的结束标签 </${raw.name}>`)
      if (top.tag !== raw.name) {
        throw new Error(`word-image-metrics：标签不配对 —— <${top.tag}> … </${raw.name}>`)
      }
      stack.pop()
      continue
    }
    if (NON_RENDERED.has(raw.name)) continue
    if (raw.name === 'style') {
      throw new Error(
        'word-image-metrics：词图里不得有 <style> 块 —— CSS 里的描边与变换本模块读不到，' +
          '静默忽略会把「按 0 描边算」的偏小框交给断言。请把样式写成每个图元的 presentation 属性。',
      )
    }
    const attrs = parseAttributes(raw.text)
    // ⚠️ `style=` / `class=` 走的是另一条通道（CSS 级联），本模块一条都不解析。
    //   与 `<style>` 块同理：**抛错而不是当「没有样式」** —— 后者偏小 = 判绿的假绿方向。
    for (const banned of ['style', 'class']) {
      if (attrs.has(banned)) {
        throw new Error(
          `word-image-metrics：<${raw.name}> 上不得有 ${banned}="${attrs.get(banned) ?? ''}" —— ` +
            'CSS 样式本模块读不到，描边/变换会被静默按 0 算。请改写成 presentation 属性。',
        )
      }
    }
    const node: Node = { tag: raw.name, attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!raw.selfClosing && !VOID_TAGS.has(raw.name)) stack.push(node)
  }
  return root
}

/** HTML 风格的空元素（SVG 本身没有，但输入不保证干净）。 */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link'])

/**
 * 引号感知的标签扫描器 —— **不要退回正则 `[^>]*`**。
 *
 * ⚠️ **为什么**：`aria-label="a > b"` 这类属性值里的 `>` 会把裸正则的开标签**截断**在 `>` 之前，
 *   后面的 `d` / `stroke-width` 全部读不到 ⇒ 那个图元对几何零贡献 ⇒
 *   **一张铺满画布的图可以被量成「只有中间一个小方块」**。
 *   本项目已经为同一个洞付过学费：`validate-content.ts` 的 `svgRootTag` 是引号感知的，
 *   `asset-geometry.test.ts` 的 **M25** 专门记着它。
 *   词图每张都带中文 `aria-label`，正是高发区 —— 这里的实现照抄 `svgRootTag` 的扫描规则。
 */
interface RawTag {
  text: string
  name: string
  closing: boolean
  selfClosing: boolean
}

function scanTags(source: string): RawTag[] {
  const out: RawTag[] = []
  let i = 0
  while (i < source.length) {
    const lt = source.indexOf('<', i)
    if (lt === -1) break

    // 注释 / CDATA / 处理指令 / 声明：一律整段跳过，它们的内容不是标签
    if (source.startsWith('<!--', lt) || source.startsWith('<![CDATA[', lt)) {
      const close = source.startsWith('<!--', lt) ? '-->' : ']]>'
      const end = source.indexOf(close, lt)
      i = end === -1 ? source.length : end + close.length
      continue
    }
    if (source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
      const end = source.indexOf('>', lt)
      i = end === -1 ? source.length : end + 1
      continue
    }

    // 引号感知：进到引号里就一路走到配对的引号，引号外的 `>` 才是标签结束
    let quote: '"' | "'" | null = null
    let end = -1
    for (let j = lt + 1; j < source.length; j += 1) {
      const ch = source[j]
      if (quote !== null) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '>') {
        end = j
        break
      }
    }
    if (end === -1) break

    const text = source.slice(lt, end + 1)
    const inner = text.slice(1, -1)
    const closing = inner.startsWith('/')
    const body = closing ? inner.slice(1) : inner
    const selfClosing = body.endsWith('/')
    const name = (/^\s*([a-zA-Z][-a-zA-Z0-9]*)/.exec(selfClosing ? body.slice(0, -1) : body)?.[1] ?? '')
      .toLowerCase()
    if (name !== '') out.push({ text, name, closing, selfClosing })
    i = end + 1
  }
  return out
}

interface StrokeContext {
  width: number
  present: boolean
}

/** 单个图元的局部框 + 它「自己」声明的描边（不含从 `<g>` 继承来的）。 */
interface Primitive {
  box: Box
  ownStrokeWidth: number | null
  ownStrokePresent: boolean
}

/**
 * 已知容器 —— 自己不产生几何，但**要让子图元继续被量**，并把 transform 与描边往下传。
 *
 * ⚠️ `[CR]` 2026-10-15：**`<a>` / `<switch>` 曾在这里整棵子树被丢弃**。
 *   旧实现对 `primitiveOf` 返回 null 的标签一律 `continue` 而**不下钻**，
 *   于是 `<a>` 包住的图元对几何零贡献 —— 一张「主体在左下角」的图被量成画面中央的小方块。
 */
const CONTAINER_TAGS = new Set(['g', 'svg', 'a', 'switch'])
/** 已知「不可能含图元」的标签：整棵跳过，不下钻。 */
const SKIPPED_TAGS = new Set(['title', 'desc', 'metadata', 'script'])

/**
 * 读一个必须是有限数值的属性。
 *
 * ⚠️ **为什么必须校验**：`Number()` 遇到 `5em` / `10%` / `&#49;` 得到的是 **NaN 或 Infinity 而不是抛错**，
 *   `growBox` 会把它们丢掉 ⇒ 包络悄悄缩小 ⇒ **偏小正是判绿的方向**。
 *   作者在 `PathReader.number()` 里已经为同一条防线写过注释（`Number('N')` 是 NaN 不抛错），
 *   但描边与 shape 属性这条路当时漏了 —— `[CR]` 2026-10-15 补上。
 */
function finiteNumber(raw: string, where: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(
      `word-image-metrics：${where} = "${raw}" 不是有限数值。` +
        '⚠️ 带单位（em/px/%）、HTML 实体与溢出值（1e999）都会让 Number() 得到 NaN/Infinity 而不抛错；' +
        '若静默丢弃，包络会缩小，而偏小正是判绿的方向。请只写无单位的数值。',
    )
  }
  return value
}

/** 容器的描边继承。`<g stroke-width="…">` 与元素自身写的是同一套解析。 */
function inheritedStroke(attrs: Map<string, string>, inherited: StrokeContext): StrokeContext {
  const raw = attrs.get('stroke-width')
  const stroke = attrs.get('stroke')
  return {
    width: raw === undefined ? inherited.width : finiteNumber(raw, '容器的 stroke-width'),
    present: stroke === undefined ? inherited.present : stroke !== 'none',
  }
}

function primitiveOf(node: Node): Primitive | null {
  const a = node.attrs
  const box = emptyBox()
  const number = (name: string, fallback = 0): number => {
    const raw = a.get(name)
    return raw === undefined ? fallback : finiteNumber(raw, `<${node.tag}> 的 ${name}`)
  }
  switch (node.tag) {
    case 'rect': {
      const x = number('x')
      const y = number('y')
      const w = number('width')
      const h = number('height')
      growBox(box, x, y)
      growBox(box, x + w, y)
      growBox(box, x, y + h)
      growBox(box, x + w, y + h)
      break
    }
    case 'circle': {
      const cx = number('cx')
      const cy = number('cy')
      const r = number('r')
      growBox(box, cx - r, cy - r)
      growBox(box, cx + r, cy + r)
      break
    }
    case 'ellipse': {
      const cx = number('cx')
      const cy = number('cy')
      const rx = number('rx')
      const ry = number('ry')
      for (let i = 0; i <= OVAL_SAMPLES; i += 1) {
        const theta = (2 * Math.PI * i) / OVAL_SAMPLES
        growBox(box, cx + rx * Math.cos(theta), cy + ry * Math.sin(theta))
      }
      break
    }
    case 'line': {
      growBox(box, number('x1'), number('y1'))
      growBox(box, number('x2'), number('y2'))
      break
    }
    case 'polyline':
    case 'polygon': {
      const points = (a.get('points') ?? '').trim().split(/[\s,]+/).map(Number)
      for (let i = 0; i + 1 < points.length; i += 2) growBox(box, points[i], points[i + 1])
      break
    }
    case 'path': {
      new PathReader(a.get('d') ?? '').walkPath(box)
      break
    }
    default:
      return null
  }
  if (boxIsEmpty(box)) return null
  const rawWidth = a.get('stroke-width')
  return {
    box,
    ownStrokeWidth: rawWidth === undefined ? null : finiteNumber(rawWidth, `<${node.tag}> 的 stroke-width`),
    ownStrokePresent: a.get('stroke') !== undefined,
  }
}

function collect(
  node: Node,
  inherited: StrokeContext,
  own: Box,
  full: Box,
  parentMatrix: Matrix,
): void {
  for (const child of node.children) {
    // ⚠️ 元素的 transform 与容器的 transform **走同一条路**。
    //   原实现在这里对容器只取 translate、对元素才取 rotate ——
    //   于是 `<g transform="rotate(...)">` 被静默丢弃（见 Matrix 的注释）。
    const matrix = multiply(parentMatrix, matrixOf(child))
    if (SKIPPED_TAGS.has(child.tag)) continue
    if (CONTAINER_TAGS.has(child.tag)) {
      // 容器只传递样式，不产生几何 —— 但它的 transform 要往下传。
      collect(child, inheritedStroke(child.attrs, inherited), own, full, matrix)
      continue
    }
    const primitive = primitiveOf(child)
    if (primitive === null) {
      throw new Error(
        `word-image-metrics：不认识的元素 <${child.tag}>。` +
          '本模块只实测 path / rect / circle / ellipse / line / polyline / polygon；' +
          '容器只能是 g / svg / a / switch。' +
          '⚠️ **`<use>` 正是这一类**：浏览器会把它引用到的图形照常画出来，' +
          '而本模块剥掉了 `<defs>` 又读不懂 `<use>` ⇒ 那一整块墨迹对实测**完全隐形**，' +
          '实测过一条把 G10/G11/G12/G13 四道守卫同时绕过的路径。' +
          '请把图形直接写在图元上；确实要用 `<use>` 就先把它加进词图禁标签表。',
      )
    }

    const placed = applyMatrix(primitive.box, matrix)

    // 口径 own（黄金口径）：只有元素**自己**带 stroke / stroke-width 才计半宽
    if (primitive.ownStrokeWidth !== null || primitive.ownStrokePresent) {
      const width = primitive.ownStrokeWidth ?? inherited.width
      const visible = primitive.ownStrokePresent ? child.attrs.get('stroke') !== 'none' : inherited.present
      if (visible) {
        const half = width / 2
        growBox(own, placed.minX - half, placed.minY - half)
        growBox(own, placed.maxX + half, placed.maxY + half)
        growBox(own, placed.minX, placed.minY)
        growBox(own, placed.maxX, placed.maxY)
      } else {
        growBox(own, placed.minX, placed.minY)
        growBox(own, placed.maxX, placed.maxY)
      }
    } else {
      growBox(own, placed.minX, placed.minY)
      growBox(own, placed.maxX, placed.maxY)
    }

    // 口径 full：把 `<g>` 继承来的描边也算进去（浏览器真正渲染的那份墨迹）
    const fullWidth = primitive.ownStrokeWidth ?? inherited.width
    const fullVisible = primitive.ownStrokePresent ? child.attrs.get('stroke') !== 'none' : inherited.present
    if (fullVisible) {
      const half = fullWidth / 2
      growBox(full, placed.minX - half, placed.minY - half)
      growBox(full, placed.maxX + half, placed.maxY + half)
      growBox(full, placed.minX, placed.minY)
      growBox(full, placed.maxX, placed.maxY)
    } else {
      growBox(full, placed.minX, placed.minY)
      growBox(full, placed.maxX, placed.maxY)
    }
  }
}

// ── 构图档位（AC-6）───────────────────────────────────────────────────────────

export type CompositionTier = 'geometric' | 'abstract' | 'organic' | 'figure' | 'food' | 'scene'

export const COMPOSITION_TIERS: readonly CompositionTier[] = [
  'geometric',
  'abstract',
  'organic',
  'figure',
  'food',
  'scene',
]

/**
 * §5.1 的三条区间。出处：`art-direction.md` §5.1
 * （`[CR]` 按第一批 5 张实测分档；`[DS]` Story 2.5 按 DF-105 补 `food` / `scene` 两档）。
 *
 * ⚠️ **这张表是 `art-direction.md` §5.1 分档表的复制品** —— 两边分家时
 *   G11 会拿「代码里的区间」去判「文档里承诺的图」，而守卫仍然全绿。
 *   ⇒ 守卫 **G277** 逐字比对两张表（`tests/assets/word-image-composition.test.ts`）。
 */
export const TIER_EDGE_RANGES: Record<CompositionTier, readonly [number, number]> = {
  geometric: [60, 75],
  abstract: [60, 75],
  organic: [70, 85],
  figure: [70, 85],
  // ⚠️ `food` 的带是 **20 个百分点**（几何/抽象只有 15）⇒ 判别力弱于其他档。
  //   这不是笔误 —— §5.1 的代价列逐字写着为什么。
  food: [60, 80],
  scene: [70, 85],
}

/** §5.2：四边最小留白的下限，6% 边长。 */
export const MIN_PADDING_PERCENT = 6
/** §5.3：重心相对画布中心的容差，6% 边长。 */
export const CENTER_TOLERANCE_PERCENT = 6

/**
 * 从文件头注释里读机读档位行。
 *
 * ⚠️ **必须读的是剥注释之前的内容** —— 档位声明本身就住在注释里（AC-6）。
 *   所以这里**不能**复用几何那条路径上的 `stripXmlComments`，那是两条不同的路。
 *   这也正是「剥注释」这件事必须**按用途分开**的第二个例子。
 *
 * ⚠️ `[CR]` 2026-10-15：**只在根 `<svg>` 之前找**。
 *   旧实现扫的是整个文件，于是写在正文中段、甚至 `<desc>` 里的一行「构图档位：figure」
 *   都能满足 AC-6。档位决定 G11 取哪一组区间（60–75 / 70–85 / 60–80），位置必须钉死。
 */
export function readCompositionTier(source: string): CompositionTier | null {
  const svgAt = source.search(/<svg\b/i)
  const head = svgAt === -1 ? source : source.slice(0, svgAt)
  const match = /构图档位[：:]\s*(geometric|abstract|organic|figure|food|scene)\b/.exec(head)
  return match === null ? null : (match[1] as CompositionTier)
}

/**
 * 读根 `<svg>` 的 `viewBox`，当作画布尺寸。
 *
 * ⚠️ `[CR]` 2026-10-15：**旧实现把画布写死成 `CANVAS_SIZE = 512` 且从不读 `viewBox`**。
 *   当时是安全的 —— `validate-content.ts` 另有一套守卫守 `viewBox`，
 *   但那是**另一个文件**的守卫；一旦那条的覆盖范围收窄，实算器就会拿 512 去量一张
 *   256×256 的图，静默给出 2 倍偏差。自己读一遍，成本几行。
 */
export function readCanvasSize(source: string): { width: number; height: number } {
  const rootTag = scanTags(stripXmlComments(source)).find((tag) => !tag.closing && tag.name === 'svg')
  if (rootTag === undefined) throw new Error('word-image-metrics：读不到根 <svg> 标签')
  const viewBox = parseAttributes(rootTag.text).get('viewbox')
  if (viewBox === undefined) {
    throw new Error(
      'word-image-metrics：根 <svg> 没有 viewBox —— 没有画布尺寸，§5.2 留白与 §5.3 重心都无从算起',
    )
  }
  const parts = viewBox.trim().split(/[\s,]+/)
  if (parts.length !== 4) {
    throw new Error(`word-image-metrics：viewBox="${viewBox}" 不是 4 个数`)
  }
  const numbers = parts.map((part, i) => finiteNumber(part, `viewBox 第 ${i + 1} 项`))
  const [, , width, height] = numbers
  if (width <= 0 || height <= 0) {
    throw new Error(`word-image-metrics：viewBox 宽高必须为正（得到 ${width}×${height}）`)
  }
  return { width, height }
}

// ── 对外主入口 ───────────────────────────────────────────────────────────────

export interface WordImageMetrics {
  entryId: string
  /** §5.1 主体占画布比例（黄金口径），百分数。 */
  edgePercent: number
  /** §5.2 四边最小留白（黄金口径），px。 */
  minPaddingPx: number
  /** §5.3 重心相对画布中心的偏移（黄金口径），px。 */
  centerOffsetPx: number
  centerX: number
  centerY: number
  /**
   * 对照口径：含 `<g>` 继承的描边半宽，也就是浏览器真正渲染的那份墨迹。
   *
   * ⚠️ `[CR]` 2026-10-15：旧注释写「`edgePercent` ≥ 这个值才是宽松偏差」，**方向是反的** ——
   *   实测 `own ≤ full`（own 只认元素自身的描边，漏掉继承来的），**偏松的是 `edgePercent`**。
   */
  edgePercentFull: number
  minPaddingPxFull: number
  box: Box
  tier: CompositionTier | null
}

/**
 * 单元 1 的标称画布边长。
 *
 * ⚠️ `[CR]` 2026-10-15：实算**不再**拿它当画布尺寸用（那是旧实现的错），
 *   画布一律从各文件自己的 `viewBox` 读（`readCanvasSize`）。
 *   它现在只作**期望值**：`validate-content.ts` 与守卫都用它确认 30 张确实是 512×512。
 */
export const CANVAS_SIZE = 512

/**
 * 量一张词图。
 *
 * @param entryId 词条 id（文件名，不带 `.svg`）
 * @param source  SVG 全文（由调用方读盘 —— 测试要在临时副本上量，所以不自己读文件）
 */
export function measureWordImage(entryId: string, source: string): WordImageMetrics {
  const canvas = readCanvasSize(source)
  const own = emptyBox()
  const full = emptyBox()
  collect(parseTree(source), { width: 1, present: false }, own, full, IDENTITY)

  if (boxIsEmpty(own)) {
    throw new Error(`word-image-metrics：${entryId} 没有任何可渲染图元，外接盒是空的`)
  }

  const width = own.maxX - own.minX
  const height = own.maxY - own.minY
  const centerX = (own.minX + own.maxX) / 2
  const centerY = (own.minY + own.maxY) / 2

  const fullWidth = full.maxX - full.minX
  const fullHeight = full.maxY - full.minY

  return {
    entryId,
    edgePercent: (Math.max(width, height) / canvas.width) * 100,
    minPaddingPx: Math.min(own.minX, own.minY, canvas.width - own.maxX, canvas.height - own.maxY),
    centerOffsetPx: Math.max(Math.abs(centerX - canvas.width / 2), Math.abs(centerY - canvas.height / 2)),
    centerX,
    centerY,
    edgePercentFull: (Math.max(fullWidth, fullHeight) / canvas.width) * 100,
    minPaddingPxFull: Math.min(full.minX, full.minY, canvas.width - full.maxX, canvas.height - full.maxY),
    box: own,
    tier: readCompositionTier(source),
  }
}

export function measureWordImageFile(dir: string, entryId: string): WordImageMetrics {
  return measureWordImage(entryId, readFileSync(path.join(dir, `${entryId}.svg`), 'utf8'))
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main(): number {
  const dir = path.resolve(process.argv[2] ?? 'public/assets/words/unit-01')
  const fileNames = readdirSync(dir).filter((name) => name.endsWith('.svg')).sort()
  const rows: WordImageMetrics[] = []
  const problems: string[] = []

  for (const fileName of fileNames) {
    const entryId = fileName.replace(/\.svg$/, '')
    try {
      const metrics = measureWordImageFile(dir, entryId)
      rows.push(metrics)
      if (metrics.tier === null) {
        problems.push(`${entryId}：头部注释里读不到「构图档位：xxx」`)
        continue
      }
      const [low, high] = TIER_EDGE_RANGES[metrics.tier]
      const padLimit = (MIN_PADDING_PERCENT / 100) * CANVAS_SIZE
      const centerLimit = (CENTER_TOLERANCE_PERCENT / 100) * CANVAS_SIZE
      if (metrics.edgePercent < low || metrics.edgePercent > high) {
        problems.push(
          `${entryId}（${metrics.tier}）：§5.1 主体占比 ${metrics.edgePercent.toFixed(1)}% 不在 ${low}–${high}%`,
        )
      }
      if (metrics.minPaddingPx < padLimit) {
        problems.push(`${entryId}：§5.2 最小留白 ${metrics.minPaddingPx.toFixed(1)}px < ${padLimit.toFixed(1)}px`)
      }
      if (metrics.centerOffsetPx > centerLimit) {
        problems.push(
          `${entryId}：§5.3 重心偏移 ${metrics.centerOffsetPx.toFixed(1)}px > ${centerLimit.toFixed(1)}px`,
        )
      }
    } catch (error) {
      problems.push(`${entryId}：${(error as Error).message}`)
    }
  }

  console.log(`[word-image-metrics] ${dir} —— 共 ${rows.length} 张`)
  console.log(
    '词条'.padEnd(14) +
      '档位'.padEnd(10) +
      '§5.1占比'.padStart(10) +
      '§5.2留白'.padStart(10) +
      '§5.3偏移'.padStart(10) +
      '重心'.padStart(12) +
      '  对照（含 <g> 继承）：占比 / 留白',
  )
  for (const row of rows) {
    console.log(
      row.entryId.padEnd(14) +
        (row.tier ?? '（缺失）').padEnd(9) +
        `${row.edgePercent.toFixed(1)}%`.padStart(9) +
        `${row.minPaddingPx.toFixed(1)}px`.padStart(10) +
        `${row.centerOffsetPx.toFixed(1)}px`.padStart(10) +
        `(${row.centerX.toFixed(0)},${row.centerY.toFixed(0)})`.padStart(12) +
        `    ${row.edgePercentFull.toFixed(1)}% / ${row.minPaddingPxFull.toFixed(1)}px`,
    )
  }

  if (problems.length > 0) {
    console.error(`[word-image-metrics] ${problems.length} 处不符合 §5：`)
    for (const problem of problems) console.error(`  - ${problem}`)
    return 1
  }
  console.log('[word-image-metrics] 全部符合 §5.1 / §5.2 / §5.3')
  return 0
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main())
}
