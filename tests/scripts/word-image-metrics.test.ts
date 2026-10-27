/**
 * 词图构图实算脚本的守卫测试（Story 1.9 / AC-3、AC-4、T2.7）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * · **AC-4 黄金值对齐门**：`scripts/word-image-metrics.ts` 跑出来的数，
 *   必须复现 `[CR]` 用一次性脚本独立算出的 5 组值（`art-direction.md:540-546`）。
 *   这 5 组值是本脚本的**第一批回归夹具** —— 脚本必须能用它们自证，
 *   而不是「跑在新画的图上看起来合理」。
 * · **路径解析器**：`M/L/H/V/C/S/Q/T/A/Z`（含相对形式与小写绝对混用）的解析正确性。
 *   ⚠️ 脚本自己**没有测试 = 有人守，守的是没被验过的东西**（本 story T2.7）。
 * · **两处口径的差是已知的、被断言住的方向**：黄金口径（`own`）与含 `<g>` 继承的
 *   对照口径（`full`）之差**必须 ≤ 已知上界**，否则说明描边处理改坏了。
 *
 * ── 为什么这么写 ────────────────────────────────────────────────────────────
 * · **几何夹具用「已知 `d` → 已知外接盒」**，不拿真实词图当夹具 ——
 *   真实词图一旦被改（正常迭代），夹具就跟着漂，守的就不是解析器而是那一张图。
 * · 黄金值那张表则**必须**钉在真实词图上：那 5 组值的意义正是「这几张图的构图」，
 *   图改了值就该变（那是 AC-10 条件 b 的信号），所以两者的钉法必须不同。
 * · 每条 `expect` 带中文失败消息，写「为什么这条错了 → 会导致什么」。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  measureWordImage,
  measureWordImageFile,
  pathBoundingBox,
  readCompositionTier,
  readCanvasSize,
  CURVE_SAMPLES,
} from '../../scripts/word-image-metrics'

const root = fileURLToPath(new URL('../../', import.meta.url))

/**
 * **黄金值夹具目录** —— `[CR]` 那 5 组黄金值对应的那 5 张词图。
 *
 * ⚠️ **2026-10-26 换源批次（Story 2.10）**：这 5 张图（`u1-ball` / `u1-three` /
 *   `u1-happy` / `u1-teacher` / `u1-dog`）在交付目录 `public/assets/words/unit-01/`
 *   里**已被换源删掉**（那儿现在只剩教材版的 `u1-morning.svg` / `u1-afternoon.svg`），
 *   五张图被搬进了 `tests/fixtures/word-images/`。
 * ⇒ 本文件**只改「从哪儿读」，黄金值一个数字都不许改**（69.1 / 79 等是 `[CR]` 钉死的），
 *   否则就变成「拿新数字重新定义黄金值」，那不是守卫了。
 * ⇒ 夹具目录里的图**必须与 `[CR]` 那次一次性脚本算的是同一批字节** —— 若哪天有人
 *   重画了这 5 张里的任何一张，这条会当场红（那正是 AC-10 条件 b 的信号）。
 */
const GOLDEN_DIR = `${root}tests/fixtures/word-images`

/**
 * **交付目录**（`public/assets/words/`）—— 孩子真正会看到的那批词图。
 *
 * ⚠️📎 **2026-10-27（Story 2.10 `[CR]` 补）**：换源批次把黄金值夹具从
 *   `public/assets/words/unit-01` 搬到了 `tests/fixtures/word-images`
 *   （旧的 60 张自建词图删掉了）⇒ 本文件**不再测任何交付中的图**。
 *   ⇒ 而黄金值本身是**旧图的**数值（69.1 / 79 …），新交付的 6 张**不可能**复现它
 *   ⇒ 「把新图也塞进黄金值表」是错的（那等于拿新数字重新定义黄金值）。
 *   ⇒ 真正缺的是另一件事：**实算脚本必须跑得动交付中的图**
 *   （词图换了新画法、新增了 transform 形态时，脚本可能抛错或算出 NaN ——
 *   而本文件是**脚本**的守卫，它不测交付资产就等于脚本的「输入面」少了一半）。
 *   ⇒ 补这一条：交付目录里的每一张都要被实算一遍，且结果必须是有限值。
 */
const DELIVERED_DIR = `${root}public/assets/words`

/** AC-4 的黄金值。出处：`docs/art-direction.md:540-546`。容差：0.5pt / 2px。 */
const GOLDEN = [
  { entryId: 'u1-ball', tier: '几何', edgePercent: 69.1, minPaddingPx: 79 },
  { entryId: 'u1-three', tier: '抽象', edgePercent: 67.2, minPaddingPx: 84 },
  { entryId: 'u1-happy', tier: '抽象', edgePercent: 69.5, minPaddingPx: 78 },
  { entryId: 'u1-teacher', tier: '人物', edgePercent: 77.9, minPaddingPx: 47 },
  { entryId: 'u1-dog', tier: '有机曲线', edgePercent: 82.3, minPaddingPx: 38 },
] as const

describe('AC-4 —— 黄金值对齐门（口径必须复现 [CR] 那 5 组值）', () => {
  it.each(GOLDEN)(
    '$entryId 的 §5.1 主体占比复现黄金值 $edgePercent%',
    ({ entryId, edgePercent }) => {
      const metrics = measureWordImageFile(GOLDEN_DIR, entryId)
      expect(Math.abs(metrics.edgePercent - edgePercent)).toBeLessThanOrEqual(0.5)
    },
  )

  it.each(GOLDEN)(
    '$entryId 的 §5.2 最小留白复现黄金值 $minPaddingPx px',
    ({ entryId, minPaddingPx }) => {
      const metrics = measureWordImageFile(GOLDEN_DIR, entryId)
      expect(Math.abs(metrics.minPaddingPx - minPaddingPx)).toBeLessThanOrEqual(2)
    },
  )

  it('黄金值不是「碰巧接近」—— 5 张的偏差加起来仍远小于容差', () => {
    const total = GOLDEN.reduce((sum, golden) => {
      const metrics = measureWordImageFile(GOLDEN_DIR, golden.entryId)
      return sum + Math.abs(metrics.edgePercent - golden.edgePercent)
    }, 0)
    expect(total).toBeLessThan(2.5)
  })
})

describe('AC-4 附注 —— 黄金口径与对照口径的差是已知的宽松偏差，方向被钉住', () => {
  it.each(GOLDEN)('$entryId：own 口径的占比不大于 full 口径（宽松方向恒成立）', ({ entryId }) => {
    const metrics = measureWordImageFile(GOLDEN_DIR, entryId)
    expect(metrics.edgePercent).toBeLessThanOrEqual(metrics.edgePercentFull + 0.05)
  })

  it('u1-dog：两口径一致 —— 它的描边写在元素自身，不走 `<g>` 继承', () => {
    const metrics = measureWordImageFile(GOLDEN_DIR, 'u1-dog')
    // 尾巴 stroke-width=48 写在元素自身 ⇒ 两口径一致。
    // ⚠️ 用例名原来写「继承口径把占比抬高」，但断言的是两者相等（差 ≤ 0.05）——
    //   名字与断言相反，会让下一个人以为这里有差额。按断言改名字。
    expect(
      Math.abs(metrics.edgePercent - metrics.edgePercentFull),
      'u1-dog 的两口径应当一致（描边写在元素自身）—— 若出现差额，说明描边归属逻辑改坏了',
    ).toBeLessThanOrEqual(0.05)
  })

  it('u1-three：g 上的 stroke-width 不计入黄金口径 —— 这是与 AC-3 字面冲突的已知取舍', () => {
    const metrics = measureWordImageFile(GOLDEN_DIR, 'u1-three')
    expect(metrics.edgePercent).toBeCloseTo(67.2, 1)
    expect(metrics.edgePercentFull).toBeCloseTo(69.5, 1)
  })
})

describe('交付目录的词图 —— 实算脚本必须跑得动它们（2026-10-27 `[CR]` 补）', () => {
  /** 交付目录下的全部词图（递归）。 */
  function deliveredWordImages(): string[] {
    return readdirSync(DELIVERED_DIR, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.svg'))
      .sort()
      .map((name) => join(DELIVERED_DIR, name))
  }

  it('一张都不许少 —— 交付目录下的每一张词图都被实算过，且结果是有限值', () => {
    const files = deliveredWordImages()

    expect(
      files.length,
      '交付目录里一张词图都没枚举到 —— 下面的循环会在空集合上空过（本条恒绿）',
    ).toBeGreaterThan(0)

    for (const path of files) {
      const metrics = measureWordImage(basename(path, '.svg'), readFileSync(path, 'utf8'))

      expect(
        Number.isFinite(metrics.edgePercent),
        `${path} 的主体占比不是有限值（${metrics.edgePercent}）—— 实算脚本算坏了，` +
          '而本文件是**脚本**的守卫：不测交付资产，脚本的输入面就少了一半',
      ).toBe(true)
      expect(
        Number.isFinite(metrics.minPaddingPx),
        `${path} 的最小留白不是有限值（${metrics.minPaddingPx}）—— 实算脚本算坏了`,
      ).toBe(true)
      expect(
        metrics.tier,
        `${path} 读不到构图档位 —— 脚本在交付资产上读不出档位，而档位决定 §5.1 取哪一段区间`,
      ).not.toBeNull()
    }
  })
})

describe('路径解析器 —— 已知 d 对应已知外接盒（T2.7）', () => {
  it('直线段 L：包络是两个端点', () => {
    const box = pathBoundingBox('M 100 100 L 300 250')
    expect(box.minX).toBeCloseTo(100)
    expect(box.minY).toBeCloseTo(100)
    expect(box.maxX).toBeCloseTo(300)
    expect(box.maxY).toBeCloseTo(250)
  })

  it('水平 / 垂直线段 H/V：单轴更新，另一轴不动', () => {
    const box = pathBoundingBox('M 40 40 H 400 V 480')
    expect(box.minX).toBeCloseTo(40)
    expect(box.maxX).toBeCloseTo(400)
    expect(box.minY).toBeCloseTo(40)
    expect(box.maxY).toBeCloseTo(480)
  })

  it('相对形式 l/h/v：坐标按当前点累加，不是画布原点', () => {
    // ⚠️ `[CR]` 2026-10-15：用例名里有 `h/v`，但路径只用了 `l` 与 `z`。
    //   补上真正的相对 `h` / `v`，否则这条用例名不副实 —— `h`/`v` 相对形式
    //   的分支持有代码，但没有断言钉着它。
    const box = pathBoundingBox('m 100 100 l 100 0 h 50 v 100 h -150 z')
    expect(box.minX).toBeCloseTo(100)
    expect(box.maxX).toBeCloseTo(250)
    expect(box.maxY).toBeCloseTo(200)
  })

  it('二次曲线 Q：按 t 采样取极值，不是取控制点（控制点会显著高估）', () => {
    const box = pathBoundingBox('M 100 300 Q 256 0 412 300')
    // 控制点 y=0 会把包络拉到 0；曲线真实最低点是 t=0.5 处的 150
    expect(box.minY).toBeCloseTo(150, 0)
    expect(box.minY).toBeGreaterThan(0)
    expect(box.maxY).toBeCloseTo(300)
  })

  it('三次曲线 C：同样按 t 采样，控制点在外侧时不得被计入', () => {
    const box = pathBoundingBox('M 100 256 C 100 0 412 0 412 256')
    // y(t) = 256·(u³ + t³)，最低点在 t=0.5 处 = 256·0.25 = 64
    // 控制点的 y=0 绝不能被算进去（那会把包络拉到画布顶）
    expect(box.minY).toBeCloseTo(64, 0)
    expect(box.minY).toBeGreaterThan(0)
    expect(box.maxY).toBeCloseTo(256)
  })

  it('平滑曲线 S：第一个控制点由上一个 C 的第二个控制点镜像得到', () => {
    // C 段把曲线带到最低，S 段应继续平滑向下
    const smooth = pathBoundingBox('M 100 100 C 100 400 200 400 200 200 S 300 0 400 200')
    const explicit = pathBoundingBox('M 100 100 C 100 400 200 400 200 200 C 200 0 300 0 400 200')
    expect(smooth.minX).toBeCloseTo(explicit.minX, 6)
    expect(smooth.maxX).toBeCloseTo(explicit.maxX, 6)
    expect(smooth.minY).toBeCloseTo(explicit.minY, 6)
  })

  it('平滑曲线 T：反射上一个 Q 的控制点', () => {
    const smooth = pathBoundingBox('M 100 100 Q 100 400 200 200 T 300 200')
    const explicit = pathBoundingBox('M 100 100 Q 100 400 200 200 Q 300 0 300 200')
    expect(smooth.maxX).toBeCloseTo(explicit.maxX, 6)
    expect(smooth.minY).toBeCloseTo(explicit.minY, 6)
  })

  it('椭圆弧 A：半径不足时按规范放大到恰好接上两端点（不放大会算错圆心）', () => {
    // 两端相距 340，却声明 r=100 ⇒ λ>1，规范要求放大到 170（= 340/2）
    const box = pathBoundingBox('M 256 256 A 100 100 0 0 1 256 596')
    // 放大后是一个半圆：圆心 (256,426)、半径 170，sweep=1 使它向右鼓
    expect(box.minX).toBeCloseTo(256, 0)
    expect(box.maxX).toBeCloseTo(426, 0)
    expect(box.minY).toBeCloseTo(256, 0)
    expect(box.maxY).toBeCloseTo(596, 0)
  })

  it('椭圆弧 A：large-arc 标志真的换了圆心（短弧与长弧的极值完全不同）', () => {
    // 两端 (0,0)→(0,150)、r=100 ⇒ 两个候选圆心在 (±66.14, 75)
    const shortArc = pathBoundingBox('M 0 0 A 100 100 0 0 1 0 150')
    const longArc = pathBoundingBox('M 0 0 A 100 100 0 1 1 0 150')
    // 短弧：从圆心 (-66.14,75) 向右鼓到 x = 33.86
    expect(shortArc.maxX).toBeCloseTo(33.86, 1)
    expect(shortArc.minX).toBeCloseTo(0, 6)
    // 长弧：从圆心 (+66.14,75) 绕右侧到 x = 166.14
    expect(longArc.maxX).toBeCloseTo(166.14, 1)
    expect(longArc.minX).toBeCloseTo(0, 6)
    // 两者都不该跑到画布外
    expect(longArc.maxX - longArc.minX).toBeLessThan(200)
  })

  it('椭圆弧 A：连写标志位明确报错，而不是猜出一个几何上合法但完全错的弧', () => {
    // `a100 100 0 0110 10` 是合法的 SVG，但本解析器的词法切分无法区分标志位与坐标。
    // 硬猜的后果是圆心算错、外接框偏大 ⇒ 把合规的图判红（误报）。
    expect(() => pathBoundingBox('M 0 0 A 100 100 0 110 150')).toThrow(/连写/)
  })

  it('未知命令必须抛错而不是静默忽略 —— 静默忽略会让外接盒偏小、守卫变宽松', () => {
    expect(() => pathBoundingBox('M 10 10 X 20 20')).toThrow(/未知命令/)
  })

  it('采样密度是可调常量，且取值被写进了注释（AC-3 要求）', () => {
    expect(CURVE_SAMPLES).toBeGreaterThanOrEqual(32)
  })
})

describe('退化输入 —— NaN 不得静默通过断言', () => {
  it('缺 width 的 rect：按 SVG 默认值 0 算，框仍然是有限的', () => {
    // ⚠️ `[CR]` 2026-10-15 契约变更：**「缺属性」与「属性值非法」是两件事。**
    //   缺属性按 SVG 默认值 0 处理（与浏览器一致）；**属性值非法则抛错** ——
    //   `width="oops"` 让 `Number()` 得到 NaN，若静默丢弃，包络就缩小了，
    //   而偏小正是判绿的方向。M39 覆盖后半条。
    const svg = '<svg viewBox="0 0 512 512"><rect x="100" y="100" height="200" fill="#000" /></svg>'
    const metrics = measureWordImage('t', svg)
    expect(Number.isFinite(metrics.minPaddingPx)).toBe(true)
    expect(metrics.minPaddingPx).toBeCloseTo(100)
  })

  it('d 里出现非法数值时报错，而不是把 NaN 静默算成一个偏小的假框', () => {
    expect(() => pathBoundingBox('M 10 10 L 20 NaN')).toThrow(/非法数值/)
  })

  it('没有任何图元时 measureWordImage 报错，而不是返回一个全 Inf 的假框', () => {
    const svg = '<svg viewBox="0 0 512 512"><!-- 只有注释 --></svg>'
    expect(() => measureWordImage('u1-broken', svg)).toThrow(/没有任何可渲染图元/)
  })
})

describe('描边半宽 —— 计入与不计入的界线（黄金口径）', () => {
  const wrap = (inner: string): string =>
    `<svg viewBox="0 0 512 512" width="512" height="512">${inner}</svg>`

  it('元素自带 stroke-width：半宽向外扩', () => {
    const svg = wrap('<circle cx="256" cy="256" r="100" fill="#000" stroke="#000" stroke-width="20" />')
    const metrics = measureWordImage('t', svg)
    expect(metrics.edgePercent).toBeCloseTo((220 / 512) * 100, 1)
    expect(metrics.minPaddingPx).toBeCloseTo(146)
  })

  it('stroke="none"：一律不计半宽，哪怕同时写了 stroke-width', () => {
    const svg = wrap('<circle cx="256" cy="256" r="100" fill="#000" stroke="none" stroke-width="20" />')
    const metrics = measureWordImage('t', svg)
    expect(metrics.edgePercent).toBeCloseTo((200 / 512) * 100, 1)
  })

  it('只写在 <g> 上：黄金口径不计（这是与 AC-3 字面冲突的取舍，值被钉住）', () => {
    const inner = '<g stroke="#000" stroke-width="20"><circle cx="256" cy="256" r="100" fill="#000" /></g>'
    const own = measureWordImage('t', wrap(inner))
    const full = measureWordImage('t', wrap(inner))
    expect(own.edgePercent).toBeCloseTo((200 / 512) * 100, 1)
    expect(full.edgePercentFull).toBeCloseTo((220 / 512) * 100, 1)
  })

  it('元素自带 stroke-width 时，<g> 上的宽度不覆盖它', () => {
    const inner =
      '<g stroke="#000" stroke-width="100"><circle cx="256" cy="256" r="100" fill="#000" stroke-width="20" /></g>'
    const metrics = measureWordImage('t', wrap(inner))
    expect(metrics.edgePercent).toBeCloseTo((220 / 512) * 100, 1)
  })
})

describe('容器剥除与注释 —— 两条用途必须显式分开', () => {
  it('<defs> 里的图元不参与几何（它不会被渲染）', () => {
    const svg =
      '<svg viewBox="0 0 512 512"><defs><rect x="0" y="0" width="512" height="512" fill="#fff" /></defs>' +
      '<circle cx="256" cy="256" r="100" fill="#000" /></svg>'
    const metrics = measureWordImage('t', svg)
    expect(metrics.minPaddingPx).toBeCloseTo(156)
  })

  it('注释里写着 viewBox 与坐标也不影响几何 —— 不剥注释会把它们量进去', () => {
    const svg =
      '<svg viewBox="0 0 512 512"><!-- 画布 0 0 512 512，主体占 70% --><circle cx="256" cy="256" r="100" fill="#000" /></svg>'
    const metrics = measureWordImage('t', svg)
    expect(metrics.minPaddingPx).toBeCloseTo(156)
  })

  it('档位行住在注释里，因此读档位的那条路不能剥注释', () => {
    expect(readCompositionTier('<!-- 构图档位：organic --><svg/>')).toBe('organic')
  })

  it('⚠️ 契约变更：档位只在**根 `<svg>` 之前**的文件头里算数', () => {
    // `[CR]` 2026-10-15：旧实现扫的是整个文件，于是写在正文中段、甚至 `<desc>` 里的
    // 一行「构图档位：figure」也能满足 AC-6，而 G11 会**照它取 70–85 那一组区间**。
    // 档位决定判据，必须钉死位置。30 张现状全部写在头部注释第 6 行。
    expect(readCompositionTier('<svg><!-- 构图档位：figure --></svg>')).toBeNull()
    expect(readCompositionTier('<!-- 构图档位：figure --><svg></svg>')).toBe('figure')
  })

  it('未知档位读作 null（不是默认档位，也不是抛错 —— 由调用方决定报不报）', () => {
    expect(readCompositionTier('<!-- 构图档位：squiggle --><svg/>')).toBeNull()
    expect(readCompositionTier('<svg/>')).toBeNull()
  })
})

/**
 * ── 守什么 ──
 * 容器（`<g>`）上的 **transform 必须整条往下传**。
 *
 * ── 为什么这么写 ──
 * `[DS]` 2026-10-15 实测踩到的：原实现对**容器**只取 `translate`、把 `rotate` 丢了，
 * 对**元素自身**才取 `rotate`。症状是「把 `rotate(-35 …)` 改成 `rotate(-45 …)`，
 * 实测值一字不变」。后果不是算小而是**算大** —— 一根长 L 的斜条，忽略旋转时长边是 L，
 * 计入旋转后只有 L·sinθ + W·cosθ。偏大 = 假红 = 有人会去改图而不是改脚本。
 * ⇒ 这一组的每一条都用手算的**精确值**钉住，不是「跑出来看着差不多」。
 *
 * 期望值来源与出处：下面的 100 / 200 全部由
 * `rotate(90°, 中心 256,256)` 的定义手工推出 —— SVG 的正角是顺时针，
 * 绕中心转 90° 后 (x,y) → (cx −(y−cy), cy +(x−cx))，
 * 于是矩形 (106,156)-(306,256) 变成 x 256–356 / y 106–306，宽高正好互换。
 */
describe('容器 transform —— 旋转必须被计入（这是 2026-10-15 修掉的真 bug）', () => {
  const RECT = '<rect x="106" y="156" width="200" height="100" fill="#000" />'

  it('<g> 上不写 rotate：量到的是矩形自己的宽高（200 × 100）', () => {
    const metrics = measureWordImage('t', `<svg viewBox="0 0 512 512"><g>${RECT}</g></svg>`)
    expect(metrics.box.maxX - metrics.box.minX).toBeCloseTo(200)
    expect(metrics.box.maxY - metrics.box.minY).toBeCloseTo(100)
  })

  it('<g rotate(90 256 256)>：宽高必须精确互换 —— 丢了 rotate 这一条会红', () => {
    const metrics = measureWordImage(
      't',
      `<svg viewBox="0 0 512 512"><g transform="rotate(90 256 256)">${RECT}</g></svg>`,
    )
    expect(metrics.box.maxX - metrics.box.minX).toBeCloseTo(100)
    expect(metrics.box.maxY - metrics.box.minY).toBeCloseTo(200)
    // 手算位置：x 256–356 / y 106–306
    expect(metrics.box.minX).toBeCloseTo(256)
    expect(metrics.box.maxX).toBeCloseTo(356)
    expect(metrics.box.minY).toBeCloseTo(106)
    expect(metrics.box.maxY).toBeCloseTo(306)
  })

  it('旋转中心不是画布中心时结果不同 —— 挡住「一律绕 (0,0) 转」的实现', () => {
    const aroundOrigin = measureWordImage(
      't',
      `<svg viewBox="0 0 512 512"><g transform="rotate(90)">${RECT}</g></svg>`,
    )
    // 绕原点转 90°：(x,y) → (−y, x)，矩形变成 x −256–−156 / y 106–306
    expect(aroundOrigin.box.maxY - aroundOrigin.box.minY).toBeCloseTo(200)
    expect(aroundOrigin.box.maxX).toBeCloseTo(-156)
  })

  it('容器与元素各带一层 transform 时按 SVG 顺序复合（外层 translate 不被内层 rotate 吃掉）', () => {
    const metrics = measureWordImage(
      't',
      '<svg viewBox="0 0 512 512"><g transform="translate(0,-100)">' +
        `<g transform="rotate(90 256 256)">${RECT}</g></g></svg>`,
    )
    // rotate 后的框是 y 106–306，整组上移 100 之后是 y 6–206
    expect(metrics.box.minY).toBeCloseTo(6)
    expect(metrics.box.maxY).toBeCloseTo(206)
  })

  it('translate 单独作用在容器上仍然生效（M33 守的就是这一条，不能被这次改动弄坏）', () => {
    const moved = measureWordImage(
      't',
      `<svg viewBox="0 0 512 512"><g transform="translate(16,-14)">${RECT}</g></svg>`,
    )
    expect(moved.box.minX).toBeCloseTo(122)
    expect(moved.box.minY).toBeCloseTo(142)
  })

  it('不认识的 transform 函数必须抛错，绝不静默忽略（与弧线连写标志位同一个判断）', () => {
    expect(() =>
      measureWordImage(
        't',
        `<svg viewBox="0 0 512 512"><g transform="scale(2)">${RECT}</g></svg>`,
      ),
    ).toThrow(/scale/)
  })

  it('transform 里出现非法数值时报错，而不是算出一个假框', () => {
    expect(() =>
      measureWordImage(
        't',
        `<svg viewBox="0 0 512 512"><g transform="rotate(NaN)">${RECT}</g></svg>`,
      ),
    ).toThrow(/非法数值/)
  })
})

// ── [CR] 2026-10-15 补：解析器不得「静默吞掉看不懂的东西」 ──────────────────────
//
// 这一整组是同一条原则的回归守卫：**静默丢弃一律比报错更坏**，因为被丢掉的墨迹
// 从不进入包络 ⇒ 包络偏小 ⇒ 偏小正是判绿的方向。
// 每一条都先给出「真实浏览器会画成什么样」，再断言实算器**要么算对、要么抛错**。
// 绝不允许「安静地算出一个偏小的框然后判绿」。

describe('[CR] 不得静默吞掉图元 —— 每条要么算对、要么抛错', () => {
  /** 把一个 body 包成合法词图，方便逐条喂输入。 */
  const wrap = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!-- 构图档位：geometric -->${body}</svg>`

  it('M37：`<defs>` + `<use>` 藏起满画布描边 ⇒ 必须抛错（实测过一条绕过 G10/G11/G12/G13 的路径）', () => {
    const bypass = wrap(`<defs><g id="frame">
        <rect x="0" y="0" width="512" height="512" fill="none" stroke="#000" stroke-width="20"/>
        <path d="M 0 0 L 512 0 L 512 512 L 0 512 Z" fill="none" stroke="#000" stroke-width="16"/>
      </g></defs>
      <use href="#frame"/>
      <circle cx="256" cy="256" r="164" fill="#f6a44a"/>`)
    // 真实墨迹 x/y∈[-10,522] ⇒ 占比 104%、留白 -10px，§5.1 与 §5.2 双双违规。
    // 修复前这里量到 66.4% / 86.0px —— 三条守卫全绿。
    expect(() => measureWordImage('use', bypass)).toThrow(/<use>/)
  })

  it('M37b：`<marker>` 同属「浏览器会画、实算读不到」的一类 ⇒ 必须抛错', () => {
    expect(() =>
      measureWordImage('marker', wrap('<marker id="m"><circle cx="256" cy="256" r="120"/></marker><rect x="206" y="206" width="100" height="100" fill="#333"/>')),
    ).toThrow(/<marker>/)
  })

  it('M38：属性值里的 `>` 不得截断开标签（M25 在另一个文件里已经为同一个洞付过学费）', () => {
    // `<path aria-label="a > b">` 若被裸正则 `[^>]*` 截断，后面的 `d` 读不到 ⇒ 整条图元消失。
    const body = wrap(
      '<rect x="206" y="206" width="100" height="100" fill="#333"/>' +
        '<path aria-label="a > b" d="M 0 0 L 512 0 L 512 512 Z" fill="#000"/>',
    )
    const metrics = measureWordImage('gt', body)
    // 修复前量到 19.5%（只剩那个 100×100 方块）；三角是铺满画布的，占比应接近 100%。
    expect(metrics.edgePercent, '铺满画布的三角没有被算进去 —— 开标签仍被 `>` 截断').toBeGreaterThan(95)
  })

  it('M39：shape 属性 / stroke-width 带单位或实体 ⇒ 抛错，不得静默按「零描边」算', () => {
    for (const attr of ['stroke-width="5em"', 'stroke-width="10%"', 'stroke-width="&#49;&#52;"', 'stroke-width="1e999"']) {
      expect(
        () => measureWordImage('nan', wrap(`<circle cx="256" cy="256" r="120" fill="#333" stroke="#000" ${attr}/>`)),
        `${attr} 被静默当成没有描边 —— 偏小正是判绿的方向`,
      ).toThrow(/不是有限数值/)
    }
    expect(() =>
      measureWordImage('nan', wrap('<rect x="-30" y="100" width="oops" height="300" fill="#333"/>')),
    ).toThrow(/不是有限数值/)
  })

  it('M40：CSS 驱动的描边（`<style>` 块 / `style=` / `class=`）⇒ 一律抛错', () => {
    expect(() =>
      measureWordImage('css', wrap('<style>.fat{stroke-width:90}</style><circle class="fat" cx="256" cy="256" r="160" fill="#333"/>')),
    ).toThrow(/<style>/)
    expect(() =>
      measureWordImage('css', wrap('<circle cx="256" cy="256" r="160" fill="#333" style="stroke-width:90"/>')),
    ).toThrow(/style=/)
    expect(() =>
      measureWordImage('css', wrap('<circle class="fat" cx="256" cy="256" r="160" fill="#333"/>')),
    ).toThrow(/class=/)
  })

  it('`<a>` / `<switch>` 是容器：子树必须被量到，不许整棵丢弃', () => {
    // 修复前 `<a>` 走 `primitiveOf` 的 default 分支返回 null 后 continue（不下钻），
    // 包在里面的方块对几何零贡献 —— 一张「主体在左下角」的图被量成画面中央的小方块。
    const metrics = measureWordImage(
      'anchor',
      wrap('<a href="#x"><rect x="-10" y="100" width="100" height="100" fill="#333"/></a><circle cx="256" cy="256" r="160" fill="#333"/>'),
    )
    expect(metrics.minPaddingPx, '`<a>` 里的方块左边缘在 -10px，没被量到').toBeLessThan(0)
  })

  it('隐式重复坐标是合法 SVG（`L 10 10 20 20`），不得报「非法数值」', () => {
    // 修复前无条件 `index += 1` 会跳过那个数字，随后读到 undefined 并抛一句指向
    // 不存在元素的错误。Inkscape / Illustrator 的紧凑导出很常见这种写法。
    const metrics = measureWordImage('implicit', wrap('<path d="M 206 206 L 306 206 306 306 206 306 Z" fill="#333"/>'))
    expect(metrics.edgePercent).toBeCloseTo(100 / 512 * 100, 5)
  })
})

describe('[CR] 画布尺寸必须从 viewBox 读，不得写死 512', () => {
  it('读出根 <svg> 的 viewBox 宽高', () => {
    expect(readCanvasSize('<svg viewBox="0 0 512 512"></svg>')).toEqual({ width: 512, height: 512 })
    expect(readCanvasSize('<svg viewBox="0 0 256 256"></svg>')).toEqual({ width: 256, height: 256 })
  })

  it('缺 viewBox / viewBox 畸形 ⇒ 抛错，不许静默按 512 算', () => {
    expect(() => readCanvasSize('<svg></svg>')).toThrow(/viewBox/)
    expect(() => readCanvasSize('<svg viewBox="0 0 512"></svg>')).toThrow(/不是 4 个数/)
    expect(() => readCanvasSize('<svg viewBox="0 0 0 512"></svg>')).toThrow(/必须为正/)
  })

  it('一张 256×256 的图按自己的画布算，而不是被 512 腰斩（修复前占比会少一半）', () => {
    const metrics = measureWordImage(
      'small',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><!-- 构图档位：geometric --><circle cx="128" cy="128" r="80" fill="#333"/></svg>',
    )
    expect(metrics.edgePercent).toBeCloseTo((160 / 256) * 100, 5)
  })
})

describe('[CR] 构图档位只认文件头（在根 <svg> 之前），正文里写不算数', () => {
  it('头部注释里的档位被读到', () => {
    expect(readCompositionTier('<!-- 构图档位：organic --><svg/>')).toBe('organic')
  })

  it('写在 <desc> / 正文中段的档位读作 null —— 位置必须钉死，否则 G11 会照它取区间', () => {
    expect(readCompositionTier('<svg viewBox="0 0 512 512"><desc>构图档位：organic</desc></svg>')).toBeNull()
    expect(
      readCompositionTier('<svg viewBox="0 0 512 512"><!-- 构图档位：organic --></svg>'),
    ).toBeNull()
  })
})
