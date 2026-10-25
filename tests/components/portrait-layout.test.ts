/**
 * 竖屏布局与语音浮层的守卫（Story 1.18 / AC-D1..D8）。
 *
 * ── ⚠️ 为什么这整个文件一条 `getComputedStyle` 都没有 ──────────────────────
 * AC-D7 逐字：jsdom **不做布局**，`getComputedStyle` 在 jsdom 里返回的是
 * 「声明值或空串」，不是算出来的盒模型。Story 1.17 的 DebugPanel `position`
 * 那条已经实测证明过：在 jsdom 里量出来的布局**恒绿**，而真机上是错的。
 * spec 又明令禁止用 headless 浏览器代替真机。
 * ⇒ 所以 AC-D 组只能是**源码级**判据：断点在哪个文件、`grid-template-columns`
 *   写成什么、`position` 用了哪一种、safe-area 有没有写。
 *   这些 jsdom 读得到（它们就是文本），但它们**证明不了像素** ——
 *   像素那一半进 `docs/deployment.md` 的人工待验清单，本文件不假装测过。
 *
 * ── 三条最容易写成恒绿的判据，这里逐条防 ─────────────────────────────────
 * ① **「不许出现 X」**类：先造探针证明正则不是恒假（R-53）。
 * ② **列宽 / 触控值**类：列宽从 `src/core/grid.ts` 的 `COLS` 现取、
 *    触控值从 `src/styles/tokens.css` 的 `--touch-min` 当期值现取，
 *    **一个字面量都不写死**（AC-D3 逐字「读 `tokens.css` 当期值断言，不写死 48px」）。
 * ③ **跨模块接线**类（AC-G7）：「浮层挂了」与「朗读状态真的会变」是两件事，
 *    所以 G139 既有源码级接线判据，也有**行为级**的状态机判据。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { COLS, ROWS } from '../../src/core'
import { stripComments } from '../fixtures/strip-comments'
import { clickableClassNames, templateOf } from '../helpers/clickable-classes'

const root = process.cwd()

/** 读并剥掉注释的源码（R-52：正则守卫必须先剥注释）。 */
function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(root, relative), 'utf8'))
}

const battleFieldSource = sourceOf('src/components/battle/BattleField.vue')
const levelViewSource = sourceOf('src/views/LevelView.vue')
const levelOutcomeSource = sourceOf('src/components/hud/LevelOutcome.vue')
const baseCss = sourceOf('src/styles/base.css')
const tokensCss = sourceOf('src/styles/tokens.css')

/** `tokens.css` 里 `--touch-min` 的**当期值** —— 绝不写死 48px（AC-D3 逐字）。 */
function touchMinValue(): number {
  const match = /--touch-min:\s*(\d+(?:\.\d+)?)px/.exec(tokensCss)
  if (match === null) {
    throw new Error('tokens.css 里读不到 --touch-min 的像素值 —— 下面的触控判据会整体失灵')
  }
  return Number(match[1])
}

/**
 * 切出 `<style>` 块的内容（判据只该看样式，不该把模板当 CSS）。
 *
 * ⚠️ `[CR]` 2026-10-20 新增：G138 的规则正则是「`{…}` 即一条规则」，
 *   而**模板里也有大括号**（`v-for` / `:prop="…"` 附近）⇒ 不切块就会把
 *   模板片段当成「选择器 + 规则体」⇒ 判据拓宽后开始命中假规则。
 */
function styleBlockOf(source: string): string {
  const open = source.indexOf('<style')
  if (open === -1) return ''
  const close = source.indexOf('</style>', open)
  if (close === -1) return ''
  const start = source.indexOf('>', open)
  if (start === -1) return ''
  return source.slice(start + 1, close)
}

/**
 * 这条 CSS 规则**是不是某个 class 的「基规则」**。
 *
 * ⚠️ 「基规则」= 选择器的**最后一段**恰好就是那个 class，
 *   **没有**额外的状态类（`.is-selected`）、**没有**伪类（`:hover` / `:disabled`）、
 *   **没有**伪元素（`::before`）。
 *   ⇒ 状态变体不判：它们的尺寸由基规则保证，逐条重判只会制造假红。
 *
 * @param selector 整条规则的选择器（可能含后代 / 子代组合符）
 * @param name 要问的那个 class 名
 */
function isBaseRuleFor(selector: string, name: string): boolean {
  const trimmed = selector.trim()
  if (trimmed.includes('::')) return false
  // ⚠️ **只取最后一段**（后代 / 子代组合符之后的那一段）：
  //   `.a .foo` 里 `foo` 才是**元素自己**身上的 class。
  const compound = trimmed.split(/[\s>+~]+/).filter((part) => part.length > 0).pop() ?? ''
  if (compound.includes(':')) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!new RegExp(`\\.${escaped}(?![\\w-])`).test(compound)) return false
  // 去掉那个 class 之后**必须什么都不剩** ⇒ 它确实是「基规则」而不是变体。
  return compound.replace(new RegExp(`\\.${escaped}(?![\\w-])`), '').trim() === ''
}

/**
 * 抽出模板里**带 `@click` / `@pointerdown` / `@pointerup`** 的元素上的 class 名。
 *
 * 📎 **Story 3.5 已抽到 `tests/helpers/clickable-classes.ts`** ——
 *   G138 与 G317 **共用同一份**（R-37：判据单一来源，不许抄两份；
 *   抄两份的漂移方向恰好是「判据静默变窄」）。
 *
 * ⚠️ **`[CR]` 2026-10-20 新增**：G138 的规则级判据原来只按 `cursor: pointer`
 *   取规则，而文件级闸门却按 `@click` 纳管 ⇒ 「模板里能点、样式里没写 cursor」
 *   的元素**整个逃过**触控尺寸判据。
 *   ⇒ 这份清单把两处接上：模板说它能点，规则就按它判。
 */

/** `src/` 下所有 `.vue` 文件。 *//**
 * `src/` 下**全部** `.vue` 文件（递归）。
 *
 * ⚠️⚠️ **初版只 `readdirSync` 一层且不递归** ⇒ 它只看得到 `src/App.vue` 一个文件，
 *   而本仓库 19 个 `.vue` 里的 18 个在 `components/` 与 `views/` 下。
 *   ⇒ G138 那条「每个自定义可点元素都显式引用 --touch-min」**从写下来那天起
 *     就在对着一个几乎为空的清单打转**，恒绿。
 *   **是变异 M161（把 HandDeck 的 `var(--touch-min)` 换成字面量 `48px`）把它逼出来的** ——
 *   那条变异本该让这条判据变红，而它绿着。
 *   ⚠️ 教训同 R-51 第 1 类：**一条「扫全仓」的判据要先证明它真的扫到了东西。**
 */
function vueFiles(dir = join(root, 'src')): readonly string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...vueFiles(path))
    else if (entry.name.endsWith('.vue')) out.push(path)
  }
  return out
}

/**
 * 递归列出 `dir` 下的**全部**文件（相对仓库根的路径）。
 *
 * 🔥 **`[CR]` 2026-10-20 新增**（G140 把扫描面从手写名单改成全仓时需要它）。
 *
 * ⚠️ **为什么不用手写名单**：名单型判据的病根是「**名单不会跟着 story 一起长大**」——
 *   本 story 新增了 9 个测试文件而名单只有 3 个（`[CR]` 抓到的 P2）。
 *   ⇒ 判据的扫描面必须由**文件系统**决定，而不是由人记得的那几个路径决定。
 */
function allFilesUnder(dir: string): readonly string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...allFilesUnder(path))
    else out.push(path)
  }
  return out
}

// ── G133 —— 战场列宽的 3px 溢出（AC-D4）───────────────────────────────────

describe('G133 —— 战场列宽用 minmax(0, 1fr) 且 flex 不许动（Story 1.18 / AC-D4）', () => {
  const forbiddenColumns = /grid-template-columns:\s*repeat\(\s*\d+\s*,\s*1fr\s*\)/
  const columnsDecl = /grid-template-columns:\s*([^;]+);/.exec(battleFieldSource)

  it('反向自测：三条判据的正则确实能匹配到违规形态（判据本身没写坏）', () => {
    // 三条违规形态各配一个探针：写错的正则是恒假的，而恒假的 `not.toMatch`
    // 会让「守卫在跑」与「守卫没牙齿」长得一模一样（R-53）。
    expect('grid-template-columns: repeat(9, 1fr);').toMatch(forbiddenColumns)
    expect('flex: 1 1 auto;').toMatch(/flex:\s*1\s+1\s+auto/)
    expect('grid-template-columns: repeat(8, minmax(0, 1fr));').not.toMatch(
      new RegExp(`repeat\\(\\s*${COLS}\\s*,`),
    )
  })

  it('grid-template-columns 的列数 === core 的 COLS，且轨道是 minmax(0, 1fr)', () => {
    expect(
      columnsDecl?.[1],
      'BattleField.vue 里没找到 grid-template-columns —— 战场网格的列定义被搬走了，' +
        '而 AC-D4 的 3px 溢出判据随之失明',
    ).toBeDefined()
    const decl = (columnsDecl?.[1] ?? '').trim()
    expect(
      decl,
      `列定义是「${decl}」—— 用裸 1fr 时 gap 不计入列宽，9 列各多出 4px/2，合计 3px 溢出` +
        '（1.10 实测：容器 453px 而轨道合计 456px）。AC-D4 要求 minmax(0, 1fr) 或等效做法',
    ).toBe(`repeat(${COLS}, minmax(0, 1fr))`)
  })

  it('`.battle-grid` 的 flex 仍是 0 0 auto（AC-D4：不得改成 1 1 auto）', () => {
    // ⚠️ 这一条与上面那条**互为约束**：列宽改成 minmax 是为了治 3px 溢出，
    //   而当年横向撑破到 1351px 的元凶是 `flex-grow: 1` ——
    //   格子的 `min-width: auto` 把行高换算成了列轨的最小宽度。
    //   只改一处不加这条守卫，下一个人「顺手」改成 1 1 auto 就前功尽弃。
    expect(
      levelViewSource,
      'LevelView.vue 里对 .battle-grid 的 flex 规则不见了 —— ' +
        'AC-D4 逐字要求「不得改 `.battle-grid` 的 flex」，那是 1.10「横向撑破到 1351px」的防线',
    ).toMatch(/flex:\s*0\s+0\s+auto/)
    expect(
      levelViewSource,
      '`.battle-grid` 上出现了 `flex: 1 1 auto` —— 实测会把战场高度拉满整屏，' +
        '再由 `aspect-ratio` 反推出 1351px 的列轨合计，战场横向撑破容器（1.10 的 P0）',
    ).not.toMatch(/flex:\s*1\s+1\s+auto/)
  })

  it('aspect-ratio 的分母仍是 ROWS（改了列定义不许顺手改比例）', () => {
    expect(
      battleFieldSource,
      `BattleField.vue 里没有 9 / 5 的 aspect-ratio —— 格子恒为正方形的前提没了，` +
        '而塔与僵尸是扁平矢量，格子一变非正方形整幅图就被拉伸',
    ).toMatch(new RegExp(`aspect-ratio:\\s*${COLS}\\s*/\\s*${ROWS}`))
  })
})

// ── G134 —— 竖屏断点（AC-D2、裁决 13）────────────────────────────────────

describe('G134 —— 竖屏断点存在且不依赖 orientation（Story 1.18 / AC-D2、裁决 13）', () => {
  const responsivePath = 'src/styles/responsive.css'
  const responsive = (() => {
    try {
      return sourceOf(responsivePath)
    } catch {
      return ''
    }
  })()

  it('响应式样式文件存在，且至少有一条 @media（本 story 之前全仓 @media 为 0）', () => {
    expect(
      responsive,
      `读不到 ${responsivePath} —— 竖屏断点还没有落进代码。` +
        'AC-D2 要求「资源栏与战场在竖屏高分辨率下保持可用间距」，而没有任何 @media 时它无从判',
    ).not.toBe('')
    const queries = responsive.match(/@media[^{]+/g) ?? []
    expect(
      queries.length,
      `${responsivePath} 里一条 @media 都没有 —— 竖屏适配整条 AC 落空`,
    ).toBeGreaterThan(0)
  })

  it('断点判定不靠 orientation 媒体查询（裁决 13：布局不许依赖 manifest 的 orientation）', () => {
    // ⚠️ **本条比「不许依赖 manifest 字段」更强**，理由写在这里以便后人改判：
    //   公开资料对鸿蒙自带浏览器是否实现 W3C PWA 安装流程互相矛盾，
    //   而 `orientation` 媒体查询在部分 WebView 上同样不可靠。
    //   ⇒ 断点一律按**视口高度**判定：竖屏 1280 高不命中，
    //     横屏 800 高命中 —— 横屏顺带被覆盖，而 orientation 媒体查询做不到这一点。
    const queries = (responsive.match(/@media[^{]+/g) ?? []).join('\n')
    expect(
      queries,
      '断点判定用了 `orientation` 媒体查询 —— 裁决 13 要求布局在横屏下靠 dvh + 安全区' +
        '自己活得下来，而不是靠「我知道现在是横屏」这个可能读不到的信号',
    ).not.toMatch(/orientation\s*:/)
  })

  it('断点里用了 dvh / dvw 视口单位；安全区由 `.level-view` 自己的 padding 承担', () => {
    // ⚠️📎 **`[CR]` 2026-10-20 按 R-57 改判据（前提被实测推翻）**：
    //   原判据是「`responsive.css` 里同时出现 dvh **与** `env(safe-area-inset-*)`」。
    //   前提是「竖屏的适配住在这个文件的一条 `@media (max-height: 900px)` 断点里」。
    //   ⚠️ **那个前提已被实测推翻**：那条断点把战场高度定成「整屏高 − 48px」，
    //   没扣 HUD(43) + 朗读带(24) + 内边距(16) ⇒ 实测 inner 800×900 时
    //   **题卡 `top=975` 整个落在 900px 折叠线以下** ⇒ 孩子看不见题。
    //   ⇒ 那条断点已被**整块删除**（`responsive.css` 文件头逐条记了实测数字），
    //   而**安全区的担子并没有消失** —— 它一直由 `.level-view` 的 padding 承担
    //   （`LevelView.vue` 的 `padding: … env(safe-area-inset-top/right/left)`）。
    //   ⇒ 判据的**落点**从「断点文件」移到「安全区真正在的地方」，
    //     **断言本身仍然是原来那个意思**（「安全区有被写」），一个字没放宽。
    expect(
      responsive,
      '断点里没有 dvh —— 移动端浏览器的地址栏会让 vh 失真，' +
        '而目标形态是竖屏平板（浏览器 UI 常驻与否都可能出现）',
    ).toMatch(/\d*d?vh/)
    expect(
      levelViewSource,
      '`.level-view` 的 padding 里没有 env(safe-area-inset-*) —— ' +
        '横屏或窄屏时刘海与手势条会吃掉边距，而 `index.html` 早已有 ' +
        '`viewport-fit=cover` 让它们生效。⚠️ 竖屏适配不再由 @media 断点承担之后，' +
        '**这里就是安全区唯一的落点**',
    ).toMatch(/env\(safe-area-inset-/)
  })

  it('反向自测：一条「按视口高度」的断点会被上面三条命中（证明判据没写坏）', () => {
    const probe = '@media (max-height: 800px) { .level-view { height: 100dvh; padding-bottom: env(safe-area-inset-bottom, 0px); } }'
    const queries = probe.match(/@media[^{]+/g) ?? []
    expect(queries.join('\n'), '探针没被抽出 ⇒ G134 那条 `not.toMatch` 是恒真的').not.toMatch(/orientation\s*:/)
    expect(probe, '探针里没有 dvh ⇒ 判据与实现对不上').toMatch(/\d*d?vh/)
    expect(probe, '探针里没有 safe-area ⇒ 判据与实现对不上').toMatch(/env\(safe-area-inset-/)
    // ⚠️📎 追加：`max-height` 这类**按高度**的断点现在本身就该被警惕 ——
    //   它正是 1.18 那个 P0 的形态。判据不禁止它（G134 只禁 `orientation`），
    //   但 G198 会盯着「有没有按高度改写战场尺寸」。
    expect(queries.join('\n'), '探针里的 `max-height` 没被抽出 ⇒ 那条判据形同虚设').toMatch(/max-height/)
  })
})

// ── G135 —— 语音浮层不遮挡战场任何一格（AC-D1）────────────────────────────

describe('G135 —— PronunciationOverlay 不遮挡战场（Story 1.18 / AC-D1）', () => {
  const overlayPath = 'src/components/hud/PronunciationOverlay.vue'
  const overlay = (() => {
    try {
      return sourceOf(overlayPath)
    } catch {
      return ''
    }
  })()

  it('组件存在', () => {
    expect(
      overlay,
      `读不到 ${overlayPath} —— AC-D1 要求「新建 src/components/hud/PronunciationOverlay.vue」`,
    ).not.toBe('')
  })

  it('模板里排在 <BattleField /> 之前（AC-D1 的实现方式：占独立一行的正常流元素）', () => {
    // 🔥 **本条是 AC-D1 的全部技术内容**：「不遮挡 `.battle-grid` 的任何一格」
    //   在竖屏平板上只有两种成立方式 —— 要么它在战场**之外**，
    //   要么它 `pointer-events: none`。前者更好判，且顺带不挡视觉。
    // ⇒ 判据钉住「在模板顺序上先于战场、且在 `.level-view` 这个 flex 列里」。
    expect(
      levelViewSource,
      'LevelView.vue 里没有引用 PronunciationOverlay —— 组件建了但没人挂，' +
        '而构建 / 类型 / 测试全绿，界面上什么反馈都没有',
    ).toMatch(/PronunciationOverlay/)
    const overlayAt = levelViewSource.indexOf('<PronunciationOverlay')
    const fieldAt = levelViewSource.indexOf('<BattleField')
    expect(
      overlayAt >= 0 && fieldAt >= 0 && overlayAt < fieldAt,
      'PronunciationOverlay 没有排在 <BattleField /> 之前 —— 它若是战场之后、又是绝对定位，' +
        '就会盖住战场最下面一行的格子（那正是僵尸走的那一行）',
    ).toBe(true)
  })

  it('样式里零绝对/固定定位、零负外边距（正常流 ⇒ 几何上不可能与战场重叠）', () => {
    // ⚠️ 这是**替代** `position: fixed` 的那条路。fixed + 底部定位看起来更"安全"，
    //   但战场高度是随视口变的，任何"我认为它在下面"的假设都会在某个机型上失效。
    for (const label of ['position: absolute', 'position: fixed', 'position: sticky']) {
      expect(
        overlay,
        `浮层里出现了 ${label} —— 它会脱离正常流，从而在某个视口尺寸下盖住战场格子。` +
          'AC-D1 要求的是「不遮挡任何一格」，只有正常流能给几何保证',
      ).not.toMatch(new RegExp(label.replace(':', '\\s*:')))
    }
    expect(
      overlay,
      '浮层里出现了负 margin —— 同样会把元素从正常流里拉出来贴到战场身上',
    ).not.toMatch(/margin[a-z-]*:\s*-\d/)
  })

  it('是 role="status" + aria-live="polite" 的非抢焦点提示（AC-C3）', () => {
    expect(overlay, '浮层不是 role="status" —— 朗读状态变化不会被读屏播报').toMatch(/role="status"/)
    expect(
      overlay,
      '浮层没有 aria-live="polite" —— 朗读开始/结束这件事对读屏用户完全不可见',
    ).toMatch(/aria-live="polite"/)
    expect(
      overlay,
      '浮层里出现了 tabindex —— 一旦可聚焦，「点卡面重听」时焦点会跳走，' +
        '而 AC-C3 要求提示不抢焦点',
    ).not.toMatch(/tabindex/)
  })
})

// ── G136 —— LevelOutcome 的 ARIA 与 safe-area（AC-D5）──────────────────────

describe('G136 —— LevelOutcome 补齐 ARIA 与安全区（Story 1.18 / AC-D5）', () => {
  it('浮层是 role="dialog" 且 aria-modal="true"', () => {
    expect(
      levelOutcomeSource,
      'LevelOutcome 缺 role="dialog" —— 它是一层模态浮层，而无障碍树里通用 div 没有模态语义，' +
        '读屏用户不会被挡住后面的战场',
    ).toMatch(/role="dialog"/)
    expect(
      levelOutcomeSource,
      'LevelOutcome 缺 aria-modal="true" —— 没有它，读屏会继续读浮层背后的战场与手牌',
    ).toMatch(/aria-modal="true"/)
  })

  it('浮层标题被 aria-labelledby 指向（dialog 必须有可访问名）', () => {
    expect(
      levelOutcomeSource,
      'LevelOutcome 缺 aria-labelledby —— 模态浮层没有可访问名时，读屏只会念出一堆无名容器',
    ).toMatch(/aria-labelledby/)
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(levelOutcomeSource)?.[1]
    expect(
      levelOutcomeSource.includes(`id="${labelledBy}"`),
      `aria-labelledby="${labelledBy}" 指向的元素在模板里不存在 —— 指向一个空 id 等于没有名字`,
    ).toBe(true)
  })

  it('有真正的焦点管理：元素出现时把焦点移进浮层、卸载时还回去', () => {
    // ⚠️ 「键盘用户能不能用」全押在这两条上：模态浮层不接管焦点时，
    //   Tab 会跑到浮层**背后**的按钮上（战场格子、手牌），孩子看不见自己按了什么。
    expect(
      levelOutcomeSource,
      'LevelOutcome 里没有 `.focus()` 调用 —— 浮层出现了而焦点还在背后的战场上，' +
        '键盘与读屏用户完全不知道该操作浮层里的按钮',
    ).toMatch(/\.focus\(\)/)
    expect(
      levelOutcomeSource,
      'LevelOutcome 里没有 `nextTick` —— v-if 刚渲染出来的按钮此刻还没有 DOM 节点，' +
        '直接 focus() 会静默失败（这正是「焦点管理看起来写了却不生效」的典型形态）',
    ).toMatch(/nextTick/)
  })

  it('按钮在打开前记下原焦点并还回去（不让焦点掉在浮层背后的死元素上）', () => {
    expect(
      levelOutcomeSource,
      'LevelOutcome 没有在打开时记住 document.activeElement —— 关闭后焦点会掉回 body，' +
        '键盘用户要从页面开头重新 Tab 一遍',
    ).toMatch(/activeElement/)
  })

  it('浮层留出了安全区（横屏 / 窄屏时刘海与手势条会吃掉它的边）', () => {
    expect(
      levelOutcomeSource,
      'LevelOutcome 的样式里没有 env(safe-area-inset-*) —— 裁决 12 判定这条 deferred 已被本 story 触发，' +
        '而 1.16 只补了 ARIA 没补安全区',
    ).toMatch(/env\(safe-area-inset-/)
  })

  it('触控目标仍不小于 tokens.css 的 --touch-min 当期值（AC-D3 与 AC-D5 同时成立）', () => {
    expect(
      levelOutcomeSource,
      `LevelOutcome 的按钮没有引用 --touch-min —— AC-D3 要求按 tokens.css 当期值（实测 ${touchMinValue()}px）` +
        '而不是写死 48px，写死会在有人调 token 之后静默失守',
    ).toMatch(/min-height:\s*var\(--touch-min/)
  })
})

// ── G137 —— HUD 变高时的页面滚动处置（AC-D6；`[CR]` 2026-10-20 按 R-57 改判据）──

describe('G137 —— 战场与题卡都不被推出视口（Story 1.18 / AC-D6；`[CR]` 2026-10-20 按 R-57 改判据）', () => {
  const responsive = sourceOf('src/styles/responsive.css')

  // ⚠️📎 **`[CR]` 2026-10-20 按 R-57 改判据** —— 本条的**前提**被实测推翻了。
  //   原判据守的是「`@media (max-height: 900px)` 那条断点里，`.level-view` 有确定高度
  //   + 可滚动，且战场改由高度定宽（width: auto + aspect-ratio）」。
  //   ⚠️ **那个前提是错的**：那条断点把战场高度定成「整屏高 − 48px」，
  //   而 `100%` 没扣掉 HUD(43px) + 朗读浮层(24px) + 页内边距(16px)，
  //   更没给题卡（实测 255px）与手牌区留位置。
  //   ⇒ **实测（真实 `vite build` 产物 + 真实 chromium）**：inner 800×900 竖屏时
  //     战场盒 753×884（宽高比 **0.852**，应为 1.8）、战场底边 975、
  //     **题卡 `top=975` 完全落在 900px 折叠线以下** ⇒ 孩子看不见题；
  //     inner 500×800 同样（题卡 `top=875`）。
  //   ⇒ 而且**同一个故障 1.19 已在真机上撞到过一次**（G166 注释逐字：
  //     「2026-10-17 真机试玩反馈『不能种植植物』… 题卡 top=875 落在 800 的
  //     折叠线下方 ⇒ 孩子看不见题 ⇒ 永远答不出」）——
  //     而 1.19 的修复条件是 `@media (min-aspect-ratio: 1/1)`，
  //     **竖屏但矮的视口两个分支都落空**。
  //   ⇒ 那条断点已被**整块删除**（`responsive.css` 文件头逐条记了实测数字）。
  //   ⇒ 判据改成**守新事实**。⚠️ **断言没有被放宽**：
  //     原来那条「**必须**按高度定宽」的正向要求，
  //     现在被一条**更强**的否定要求取代（「**不许**按高度改写战场的尺寸」），
  //     而 D6 的真正目标（「战场与题卡不被推出视口」）由 **G198 + 人工待验**承担。

  it('`.level-view` 仍保留 min-height: 100dvh（不是 height —— 1.10 的纪律）', () => {
    expect(
      levelViewSource,
      '`.level-view` 上的 min-height: 100dvh 没了 —— 改用 height 会让浮层的 inset: 0 ' +
        '在内容超高时盖不满战场，而战场在终态下必须**仍然渲染**（AC-D2）',
    ).toMatch(/min-height:\s*100dvh/)
  })

  it('🔴 竖屏下零「按视口高度改写 `.battle-grid` 尺寸」的规则', () => {
    // ⚠️ 这条取代了原来「矮视口断点里战场改由高度定宽」那条 ——
    //   那条**要求**一条按高度定宽的规则，而**正是那条规则把题卡推出了视口**。
    //   ⇒ 现在的要求是反过来：**别再按高度改写战场**。
    for (const { prelude, body } of mediaBlocks(responsive)) {
      // 宽屏分支（`min-aspect-ratio`）是唯一合法的一条：它把战场与题面**并排**，
      // 战场那一格的 `height: auto` 由 G167 逐条钉住（问的是**生效值**）。
      if (/min-aspect-ratio/.test(prelude)) continue
      for (const [, selector, decls] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/\.battle-grid/.test(selector)) continue
        expect(
          decls,
          `媒体查询「${prelude}」里的 .battle-grid 规则写了尺寸（${decls.trim()}）—— ` +
            '「按视口高度改写战场尺寸」是已被实测证伪的形态：它会让战场吃满视口高度、' +
            '把题卡推出折叠线（`[CR]` 2026-10-20 实测：inner 800×900 时题卡 top=975）',
        ).not.toMatch(/\b(?:width|height)\s*:/)
      }
    }
  })

  it('🔴 `responsive.css` 里零「按视口高度」的媒体查询', () => {
    // ⚠️ 这是上面那条的**更狠**的版本：连「按高度断点」本身都不许有。
    //   竖屏下战场的高宽全部由宽度经 `aspect-ratio` 推出 ⇒ 视口越窄战场越矮
    //   ⇒ 布局**自缩放** ⇒ 不需要按高度断点（实测 inner 800×900 与 500×800
    //   删掉那条断点后 `scrollHeight == clientHeight`，恰好装得下、零滚动）。
    //   ⇒ 要加这样一条断点之前，先读 `responsive.css` 文件头那一段实测。
    for (const { prelude } of mediaBlocks(responsive)) {
      expect(
        prelude,
        `responsive.css 里出现了按视口高度判定的媒体查询「${prelude}」—— ` +
          '竖屏不需要它：战场的高宽全部由宽度经 aspect-ratio 推出，布局自缩放。' +
          '⚠️ 而「按高度改写战场尺寸」已被实测证伪（`[CR]` 2026-10-20：' +
          'inner 800×900 时题卡 top=975，整个落在折叠线以下）',
      ).not.toMatch(/(?:max|min)-height/)
    }
  })

  it('反向自测：那条被删掉的写法会被上面两条抓住（证明判据有牙齿）', () => {
    // ⚠️ 探针是 1.18 那条断点的**原样**（`width: auto` + `height: calc(…)`）。
    const bad =
      '@media (max-height: 900px) { .level-view .battle-grid { width: auto; height: calc(100% - var(--touch-min)); margin-inline: auto; } }'
    const blocks = mediaBlocks(bad)
    expect(blocks.length, '探针没被解析出媒体查询块 ⇒ 判据空跑').toBe(1)
    expect(blocks[0]!.prelude, '探针的前导语没被抽出来').toMatch(/max-height/)
    // 上面两条判据在探针上的行为
    expect(blocks[0]!.prelude, 'R-53：探针的前导语没被「零按高度媒体查询」那条抓到').toMatch(/(?:max|min)-height/)
    const decls = [...blocks[0]!.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel]) => /\.battle-grid/.test(sel))?.[2] ?? ''
    expect(decls, 'R-53：探针里没有 .battle-grid 的规则体').not.toBe('')
    expect(decls, 'R-53：探针的 .battle-grid 规则体没被「零按高度改写尺寸」那条抓到').toMatch(
      /\b(?:width|height)\s*:/,
    )
  })
})

// ── G198 —— 竖屏下战场的尺寸**只有一个来源**：宽度（AC-D4、AC-D6）──────────

describe('G198 —— 竖屏下战场的高宽全部由宽度推出（Story 1.18 `[CR]` / AC-D4、AC-D6）', () => {
  // ⚠️📎 **`[CR]` 2026-10-20 新增** —— 这个 P0 的**机制**在这里，判据也在这里。
  //
  // 🔥 **那两条规则打起来的时候，谁赢？**
  //   · `LevelView.vue` 的 scoped 规则编译成 `.level-view[data-v-…]>.battle-grid`
  //     ⇒ **两个限定符 = (0,3,0)**；
  //   · `responsive.css` 的 `.level-view .battle-grid` ⇒ **两个类选择器 = (0,2,0)**。
  //   ⇒ **scoped 赢**（不是「同特异性靠顺序」—— 那条机制是错的）。
  //   ⇒ 于是在 1.18 的 `@media (max-height: 900px)` 里写的那句 `width: auto`
  //     **根本没生效**：宽度仍是 scoped 那条的 `width: 100%`。
  //   ⇒ 而同一块里的 `height: calc(100% - …)` **生效了**（没有更高特异度的竞争者）
  //     ⇒ **宽与高同时确定** ⇒ `aspect-ratio: 9 / 5` **直接失效**
  //     ⇒ 实测战场盒 753×884（**宽高比 0.852**）⇒ 格子被压成扁矩形，
  //       且战场吃满视口高度 ⇒ **题卡 `top=975` 整个落在折叠线以下**。
  //
  // ⇒ 那块断点已被**整块删除**（G137 守着「零按高度断点」）。
  // ⇒ 本条守的是**剩下的那条正确形态**：「战场的尺寸只有一个来源 —— 宽度」。

  const battleGridRule = ruleBodyFor(battleFieldSource, '.battle-grid')

  it('`BattleField.vue` 的 `.battle-grid` 规则里零 `height`（高度必须由宽度经 aspect-ratio 推出）', () => {
    // ⚠️ **实测今天这条规则里没有 `height`**（只有 `display` / `grid-template-*` /
    //   `gap` / `aspect-ratio`）—— 而一旦有人加了一条 `height`，
    //   竖屏下战场就不再自缩放，格子会被压扁、题卡会被推出视口。
    expect(
      battleGridRule,
      '`BattleField.vue` 的 `.battle-grid` 规则体没找到 —— 这条判据会空跑',
    ).not.toBe('')
    expect(
      battleGridRule,
      '`.battle-grid` 上出现了 `height` —— 战场的尺寸必须**只有一个来源**：' +
        '宽度（经 `aspect-ratio: 9 / 5` 推出高度）。竖屏下视口越窄战场越矮、' +
        '布局自缩放；一旦高度也被写死，比例当场失效（实测 0.852 vs 1.8）',
    ).not.toMatch(/(?:^|;)\s*height\s*:/)
  })

  it('`aspect-ratio` 仍在，且分母是 core 的 ROWS（高度由宽度推出的那个「推」还在）', () => {
    expect(
      battleGridRule,
      '`.battle-grid` 的 `aspect-ratio` 没了 —— 没有它，战场的高度就与宽度无关了，' +
        '而战场与塔、僵尸的比例全靠它',
    ).toMatch(/aspect-ratio\s*:\s*9\s*\/\s*5/)
    expect(
      battleGridRule,
      '`.battle-grid` 的 `aspect-ratio` 分母不是 5 —— ROWS 变了它必须跟着变（AC-D4）',
    ).toMatch(new RegExp(`aspect-ratio\\s*:\\s*${COLS}\\s*/\\s*${ROWS}`))
  })

  it('`LevelView.vue` 的 scoped 规则把战场宽度钉成 100%（不是 auto）', () => {
    // ⚠️ **这条是那个 P0 的另一半**：宽度必须由**宽度**决定（`width: 100%`），
    //   而不是 `width: auto` —— 后者要配合一个**确定的高度**才有意义，
    //   而竖屏下那个高度一旦存在，比例就塌了（实测 0.852）。
    //   ⇒ 竖屏下 `.battle-grid` 的宽度只允许是「由容器宽度决定」的那一种。
    //
    // ⚠️ **为什么不用 `ruleBodyFor(levelViewSource, '.battle-grid')`**：
    //   那条规则的选择器逐字是 `.level-view > :deep(.battle-grid)` ——
    //   `ruleBodyFor` 找的是「选择器原文 + ' {'」，而这里的选择器里
    //   `.battle-grid` 后面还跟着 `)` ⇒ 匹配不到，判据会**空跑**（恒绿）。
    //   ⇒ 这里直接按「选择器里含 `.battle-grid`」来找规则体。
    const at = /([^{}]*\.battle-grid[^{}]*)\{([^{}]*)\}/.exec(levelViewSource)
    expect(at, '`LevelView.vue` 里找不到含 `.battle-grid` 的规则 —— 这条判据会空跑').not.toBeNull()
    const scoped = at![2]!
    expect(
      scoped,
      '`LevelView.vue` 的 `.battle-grid` 规则里没有 `width: 100%` —— ' +
        '战场的宽度必须由容器宽度决定（高度再由 aspect-ratio 推出），' +
        '这样竖屏下布局才会自缩放',
    ).toMatch(/width:\s*100%/)
    expect(
      scoped,
      '`LevelView.vue` 的 `.battle-grid` 规则里出现了 `width: auto` —— ' +
        '`width: auto` 要配合一个**确定的高度**才有意义，而竖屏下那个高度一旦存在，' +
        '`aspect-ratio` 就失效（实测宽高比 0.852，格子被压成扁矩形）',
    ).not.toMatch(/width:\s*auto/)
  })

  it('⚠️ R-53 反向自测：把 `width: auto` 与一个确定高度同时写上，会被上面两条抓住', () => {
    const bad = 'width: auto; height: calc(100% - 48px);'
    expect(bad, 'R-53：探针里没有 width: auto —— 判据与要防的形态对不上').toMatch(/width:\s*auto/)
    expect(bad, 'R-53：探针里没有 height —— 同上').toMatch(/(?:^|;)\s*height\s*:/)
    // 而「height 写在 `.battle-grid` 规则里」这件事本身就被第一条判据排除
    expect(bad, 'R-53：探针里的 height 没被「零 height」那条抓到').toMatch(/(?:^|;)\s*height\s*:/)
  })
})

// ── G138 —— 触控目标 ≥ --touch-min 当期值（AC-D3）─────────────────────────

describe('G138 —— 所有可点区域不小于 --touch-min 当期值（Story 1.18 / AC-D3、R-56）', () => {
  /**
   * 判据本体 —— 抽成函数**就是为了让反向自测能真的调用它**。
   *
   * ⚠️ 原先判据内联在扫描循环里，而反向自测只对探针字符串
   *   `toMatch(/@click/)` / `not.toMatch(/var\(--touch-min/)` ——
   *   那**没有执行任何判据逻辑**，所以判据整个坏掉（恒假）它照样绿（R-51）。
   *   ⇒ 现在扫真实文件与喂探针走的是同一个函数。
   *
   * ⚠️📎 **`[CR]` 2026-10-20：规则级的「可点」判据被拓宽** ——
   *   原来逐字是 `if (!/cursor:\s*pointer/.test(body)) return false`，
   *   而**外层**的文件级闸门逐字是
   *   `/cursor:\s*pointer/.test(source) || /@click|@pointerdown|@pointerup/.test(source)`。
   *   ⇒ **文件级按 `@click` 纳管，规则级却只按 `cursor: pointer` 取规则** ——
   *     一个带 `@click`、规则里**没写** `cursor: pointer`、且 `min-height` 写死像素的
   *     元素**完全逃过** AC-D3 的触控尺寸判据。
   *   ⇒ 现在规则级的「可点」有**两个来源**：`cursor: pointer`（CSS 自称可点）
   *     **或** 选择器命中了模板里**带 `@click` 的那个元素**的 class。
   *
   * @param source 整个 `.vue` 文件的源码
   * @param clickableClasses 模板里带 `@click` / `@pointerdown` / `@pointerup`
   *   的元素上的 class 名（由 {@link clickableClassNames} 抽出）
   * @returns 违规的 `选择器 声明项` 列表；空数组 = 全部合规。
   */
  function riskyClickRules(source: string, clickableClasses: readonly string[] = []): readonly string[] {
    // ⚠️📎 **只扫 `<style>` 块**（`[CR]` 2026-10-20）——
    //   规则正则是「`{…}` 即一条规则」，而**模板里也有大括号**：
    //   `<div :data-row="cell.row" @pointerdown="…">` 这段模板会被当成一条
    //   「选择器 = 模板片段、规则体 = 下一段模板」的规则。
    //   ⇒ 判据被拓宽（按 class 认可点）之后，这种**假规则**开始命中
    //     （模板片段里含有可点元素的 class）⇒ 一堆假红。
    //   ⇒ 扫之前先把 `<style>` 块切出来。
    const style = styleBlockOf(source)
    // ⚠️ **解构必须跳过一个**：`matchAll` 的元素是 `[整段, 组1, 组2]` ——
    //   写 `([selector, body])` 会把**整段**当成 selector、把**组1**当成 body，
    //   于是 body 里根本没有 `cursor: pointer` ⇒ 规则一条都不被取到 ⇒ 判据恒绿。
    //   （`[CR]` 2026-10-20：把 `[, , body]` 顺手改成 `[selector, body]` 时踩到，
    //   是**反向自测**当场抓住的。）
    return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selector, body]) => {
        const declared = [...body.matchAll(/min-(height|width)\s*:\s*([^;]+)/g)]
        if (/cursor:\s*pointer/.test(body)) {
          // ── 分支一（原有，判据版本 v1）：CSS 自称可点 ──────────────────
          // 声明了就逐项判值 —— 每一项都得自己引用 token。
          if (declared.length > 0) {
            return declared.some(([, , value]) => !/var\(--touch-min/.test(value))
          }
          // 两项都没写 ⇒ 必须是「尺寸由子元素撑出来」的容器。
          return !(/display:\s*flex/.test(body) && /flex-direction:\s*column/.test(body))
        }
        // ── 分支二（`[CR]` 2026-10-20 新增）：模板说它能点 ──────────────
        //   ⚠️ **只判「基规则」**（选择器的最后一段恰好就是那个 class、
        //     没有额外的状态类 / 伪类 / 伪元素）——
        //     否则 `.option-card:disabled` / `.hand-card.is-selected` 这类
        //     **状态变体**会被各判一次，而它们的尺寸由基规则已经保证了。
        //   ⚠️ **只判「写死了尺寸」这一条**：
        //     「整条没有尺寸声明」在模板绑定的场景下**判不了** ——
        //     战场格子 `.battle-cell` 的尺寸来自**网格的 `aspect-ratio`**，
        //     滚动轨 `.hand-deck__rail` 的尺寸来自**里面的卡片**，
        //     两者都不是它自己的 `min-*` 能表达的。
        //     ⇒ 这一档收窄**如实登记在判据版本表**（R-56），不假装覆盖了。
        if (!clickableClasses.some((name) => isBaseRuleFor(selector, name))) return false
        return declared.some(([, , value]) => {
          const v = value.trim()
          // ⚠️ `0` 是 flexbox 的「无下界」惯用法（`min-width: 0` 让横排能收缩），
          //   **不是**一个 0px 的命中区 ⇒ 不算违规。
          if (v === '0' || v === '0px') return false
          return !/var\(--touch-min/.test(v)
        })
      })
      .map(([, selector, body]) => {
        const bad = [...body.matchAll(/min-(height|width)\s*:\s*([^;]+)/g)]
          .filter(([, , value]) => !/var\(--touch-min/.test(value))
          .map(([, prop, value]) => `${prop}: ${value.trim()}`)
        return `${selector.trim()}〔${bad.length > 0 ? bad.join('、') : '整条无尺寸依据'}〕`
      })
  }

  it('--touch-min 能从 tokens.css 读到当期值，且与 AC 引用的口径一致', () => {
    const value = touchMinValue()
    expect(
      value,
      `tokens.css 的 --touch-min 是 ${value}px —— 断言用的是**当期值**而不是写死的 48px，` +
        '所以这个数变了本文件会自动跟着变',
    ).toBeGreaterThanOrEqual(40)
  })

  it('全局 button 基线就引用了 --touch-min（而不是写死 48px）', () => {
    expect(
      baseCss,
      'base.css 的 button 基线没引用 var(--touch-min) —— 写死像素值的话，' +
        '有人调整 token 后所有按钮会一起静默失守',
    ).toMatch(/min-height:\s*var\(--touch-min\)/)
  })

  it('每个自定义可点元素都显式引用 --touch-min', () => {
    // 逐文件核对：凡是「看起来能点」的元素（div/span 上带 pointer 或 @click），
    // 或者非 button 的交互元素，都必须有 --touch-min 兜底。
    // ⚠️ 这份清单是**按需维护**的：新增可点元素而忘了写 --touch-min 时本条会红。
    //
    // ⚠️⚠️ **[DS] 把判据从「文件级」改成「规则级」**（变异 M161 逼出来的，见 `vueFiles` 注释）：
    //   文件级判据（`!source.includes('var(--touch-min')`）在递归修好之后**立刻误报**了
    //   `QuestionCard.vue` —— 它的 `.question-card__tappable` 是
    //   `display: flex; flex-direction: column` 的**容器**，尺寸由内部的
    //   选项卡（各自 ≥ `--touch-min`）撑出来，它本身就是那个可点区域里最大的一块。
    //   文件级判据看不见这一点，只会说「这个文件没写那个 token」。
    //
    //   ⇒ 判据改成**逐个属性**看：**声明了 `min-height`/`min-width` 的那一项，
    //     它自己的值**必须引用 token；**两项都没声明**的，必须是**纵向 flex 容器**
    //     （尺寸由子元素决定）。
    //
    // ⚠️⚠️ **[DS] 二次收紧：从「按规则体」改成「按属性」—— 变异 M161 逼出来的假绿。**
    //   第一版收紧版判的是**规则体里有没有出现过 token**。实测把
    //   `.hand-deck__start` 的 `min-height: var(--touch-min)` 改成 `48px`、
    //   而 `min-width: var(--touch-min)` 原样留着 ⇒ **判据仍然全绿**：
    //   同一规则体里那一个 `var(--touch-min)` 替写死的那一项洗了白。
    //   这与 R-51 第 2 类失效同型 —— 判据在**它自己要防的那个方向上**是绿的。
    //   ⇒ 每一项 `min-*` 声明单独取值、单独判；一处洗白不了另一处。
    //   判据本体抽成了上面的 `riskyClickRules()`，让反向自测能真的调用它。
    const offenders: string[] = []
    for (const path of vueFiles()) {
      const source = stripComments(readFileSync(path, 'utf8'))
      const looksInteractive =
        /cursor:\s*pointer/.test(source) || /@click|@pointerdown|@pointerup/.test(source)
      if (!looksInteractive) continue

      const risky = riskyClickRules(source, clickableClassNames(source))
      if (risky.length > 0) {
        offenders.push(`${path.slice(root.length + 1)} → ${risky.join(' / ')}`)
      }
    }
    expect(
      offenders,
      '这些可点规则里有一项尺寸写死了像素值（没引用 --touch-min），' +
        '或整条既没声明尺寸也不是靠内部内容撑大的纵向容器 —— ' +
        '4–8 岁孩子的指尖命中区不得小于 token 当期值',
    ).toEqual([])
  })

  it('反向自测：判据真的认得出违规 —— 四种违规形态逐一报红，合规形态放行', () => {
    // ⚠️ 这四条**调用的是上面那个函数**，不是对探针字符串做 toMatch。
    //   原来的反向自测只断言「探针里有 @click、没有 var(--touch-min)」，
    //   **一行判据逻辑都没执行** ⇒ 判据整个坏掉它照样绿（R-51 第 1 类）。
    const flagged = (css: string): readonly string[] => riskyClickRules(`<style>${css}</style>`)

    expect(
      flagged('.x { cursor: pointer; min-height: 48px; }'),
      '可点规则把 min-height 写死 48px 竟然没被认出来 —— 判据恒假，' +
        '有人调小 --touch-min 时所有这类命中区会一起静默失守',
    ).not.toEqual([])

    expect(
      // 👈 这条就是 M161 变异的样子：只写死一项、另一项仍引用 token。
      flagged('.x { cursor: pointer; min-height: 48px; min-width: var(--touch-min); }'),
      '同一条规则里一项写死、另一项引用 token 竟然放行了 —— ' +
        '一个 var(--touch-min) 会替写死的那一项洗白（[DS] 实测到的假绿）',
    ).not.toEqual([])

    expect(
      flagged('.x { cursor: pointer; }'),
      '可点规则既没声明尺寸、也不是纵向 flex 容器竟然放行了 —— ' +
        '它拿不到任何尺寸保证',
    ).not.toEqual([])

    expect(
      flagged('.x { cursor: pointer; min-height: 48px; display: flex; flex-direction: column; }'),
      '写了 `display:flex; flex-direction:column` 就想豁免尺寸判据 —— ' +
        '列方向只说明「宽由子元素撑」，**高仍然是自己的**，两个 token 引用也不是没有',
    ).not.toEqual([])

    // 反向：合规形态必须放行，否则本判据就是在制造假红。
    expect(
      flagged('.x { cursor: pointer; min-height: var(--touch-min); min-width: var(--touch-min); }'),
      '两项都引用 token 的可点规则被误报了 —— 判据写得太粗，会让人去改正确代码',
    ).toEqual([])
    expect(
      flagged('.x { cursor: pointer; display: flex; flex-direction: column; }'),
      '靠子元素撑大的纵向容器被误报了 —— 那正是 QuestionCard 那种形态',
    ).toEqual([])
    // 非可点的规则不受本判据管（否则 `.battle-cell` 之类会被误伤）。
    expect(
      flagged('.x { min-height: 48px; }'),
      '没有 cursor: pointer 的规则被本判据抓了 —— 判据越界，会把静态样式也算成命中区',
    ).toEqual([])
  })

  it('反向自测：模板绑定的可点元素把 min-height 写死 ⇒ 抓得到（`[CR]` 2026-10-20 补的分支）', () => {
    // ⚠️ **这一档是本轮补的**（P2：文件级按 `@click` 纳管、规则级只按 `cursor: pointer`
    //   取规则 ⇒ 「模板说它能点、样式里没写 cursor」的元素**整个逃过**触控尺寸判据）。
    //   ⇒ 判据本体多了一个分支：**基规则** + 模板绑定 + 尺寸写死 ⇒ 违规。
    const bound = (css: string, classes: readonly string[]): readonly string[] =>
      riskyClickRules(`<style>${css}</style>`, classes)

    expect(
      bound('.hit { min-height: 48px; }', ['hit']),
      '模板绑定的可点元素把 min-height 写死 48px 竟然没被认出来 —— ' +
        '它没有 `cursor: pointer`，而文件级闸门是按 `@click` 纳管的 ⇒ ' +
        '这一整类元素**整个逃过** AC-D3 的触控尺寸判据',
    ).not.toEqual([])

    // 状态变体不判：它的尺寸由基规则保证。
    expect(
      bound('.hit { min-height: var(--touch-min); } .hit:disabled { opacity: 0.5; }', ['hit']),
      '状态变体被单独判了 —— 它的尺寸由基规则保证，逐条重判只会制造假红',
    ).toEqual([])

    // `min-width: 0` 是 flexbox 的「无下界」惯用法，不是 0px 的命中区。
    expect(
      bound('.rail { min-width: 0; }', ['rail']),
      '`min-width: 0` 被当成了违规 —— 那是 flexbox 的「无下界」惯用法',
    ).toEqual([])

    // 没写尺寸的**不判**（战场格子的尺寸来自网格的 aspect-ratio）。
    expect(
      bound('.cell { aspect-ratio: 1 / 1; }', ['cell']),
      '没有尺寸声明的模板绑定元素被判了 —— 它的尺寸可能来自网格 / 父容器，' +
        '这一档收窄已登记在判据版本表里（R-56）',
    ).toEqual([])
  })
})

// ── G139 —— 朗读状态的跨模块接线（AC-G7）──────────────────────────────────

describe('G139 —— 朗读状态真的能驱动浮层（Story 1.18 / AC-D1、AC-G7）', () => {
  const pronunciationSource = sourceOf('src/services/pronunciation.ts')
  const overlay = sourceOf('src/components/hud/PronunciationOverlay.vue')

  it('pronunciation.ts 在起声时发布 playing', () => {
    expect(
      pronunciationSource,
      'pronunciation.ts 没有发布 playing —— 浮层永远停在 idle，' +
        '而构建 / 类型 / 测试 / lint 全绿，界面上没有任何朗读反馈',
    ).toMatch(/publishPronunciationStatus\(\s*'playing'\s*\)/)
  })

  it('pronunciation.ts 在收敛点发布 idle（不止一处 —— 录音 ended 与 TTS 兜底是两条路）', () => {
    const count = (pronunciationSource.match(/publishPronunciationStatus\(\s*'idle'\s*\)/g) ?? []).length
    expect(
      count,
      `只发布了 ${count} 处 idle —— 录音播完（ended）与 TTS 降级到终点（fallbackToRecording）` +
        '是两条互不相干的收敛路径，少一处就会让浮层卡在「朗读中」直到下一次朗读开始',
    ).toBeGreaterThanOrEqual(2)
  })

  it('浮层订阅了状态并在卸载时退订（组件卸载不订 ⇒ 监听器泄漏）', () => {
    expect(overlay, '浮层没有订阅朗读状态').toMatch(/subscribePronunciationStatus\(/)
    expect(
      overlay,
      '浮层订阅后没有在 onBeforeUnmount 里退订 —— 模块级监听器集合会留一份闭包，' +
        '每次挂载多留一份（Story 1.13 起的内存泄漏防线）',
    ).toMatch(/onBeforeUnmount/)
  })

  it('反向自测：漏掉退订会被上一条抓住（证明判据有牙齿）', () => {
    expect(
      'onMounted(() => { subscribePronunciationStatus(() => {}) })',
      '探针里没有 onBeforeUnmount ⇒ 上一条的判据确实会红',
    ).not.toMatch(/onBeforeUnmount/)
  })
})

// ── G158 —— 更新提示没有能力阻塞（Story 1.18 / AC-C2、AC-C3；变异 M148）──────

describe('G158 —— 更新提示是非阻塞的（Story 1.18 / AC-C3、变异 M148）', () => {
  // ⚠️ **这一整条是 [DS] 变异验证 M148 逼出来的**：把 `UpdateNotice.vue` 的
  //   `pointer-events: none` 改成 `auto`，`portrait-layout.test.ts` **31 条全绿**。
  //   ⇒ AC-C3 那半（「不抢焦点、不遮挡战场」）对**这个组件**此前零守卫 ——
  //   组件建了、类型过了、测试绿了，而它已经能吃掉孩子的点击了。
  //   这是 R-41 的正例：**新边界必须配守卫 + 变异**，而这条边界是靠变异发现的。
  const notice = sourceOf('src/components/hud/UpdateNotice.vue')

  it('整条 `pointer-events: none`（点击穿透 ⇒ 它没有能力抢走那一次点击）', () => {
    expect(
      notice,
      'UpdateNotice 不是 `pointer-events: none` —— 它就变成一块能吃掉点击的板：' +
        '孩子点卡片时的第一次点击被它吃掉（AC-C3「不抢点击」）',
    ).toMatch(/pointer-events:\s*none/)
  })

  it('⚠️ R-53：上面那条正则先在自己的探针上自证能匹配', () => {
    expect('.update-notice{pointer-events:none}', 'R-53：判据正则不认自己的探针').toMatch(/pointer-events:\s*none/)
  })

  it('零 `alert` / `confirm` / `window.focus` / `autofocus`（AC-C3 的四条硬禁令）', () => {
    for (const [label, pattern] of [
      ['alert()', /\balert\s*\(/],
      ['confirm()', /\bconfirm\s*\(/],
      ['window.focus()', /\.focus\s*\(\s*\)/],
      ['autofocus', /autofocus/],
    ] as const) {
      expect(
        notice,
        `UpdateNotice 里出现了 ${label} —— AC-C3 逐字要「不抢焦点、不 alert」，` +
          '而孩子面前弹出来的东西会被当成游戏坏了',
      ).not.toMatch(pattern)
    }
  })

  it('零 tabindex、零 `<button>`（AC-C2：不给「立即刷新」留路径）', () => {
    // ⚠️ **这条是 AC-C2 的实现方式**：一旦给一个按钮，就等于提供了
    //   「在孩子正在玩的那一局里强制刷新」的路径 —— 那正是 AC 禁止的行为。
    //   它不是「暂时没做」，是**结构上不该有**。
    expect(
      notice,
      'UpdateNotice 里有 tabindex —— 它变成可聚焦元素，焦点会在读状态变化时跳走',
    ).not.toMatch(/tabindex/)
    expect(
      notice,
      'UpdateNotice 里有 <button> —— 给了「立即刷新」的入口，' +
        '而 AC-C2 要的是「告知下次启动生效」，不是一个动作邀请',
    ).not.toMatch(/<button/)
  })

  it('固定定位时贴的是**顶部安全区**（唯一「战场到不了」的位置，AC-C3 + AC-D1）', () => {
    // ⚠️ 这条是**成对**的：`position: fixed` 本身不是问题（本组件确实用），
    //   问题的是 `top` 不带 `env(safe-area-inset-top)` —— 刘海屏上系统状态栏
    //   会盖掉它的一半，而那条提示恰好是孩子唯一能知道「要先关掉再开」的线索。
    if (!/position:\s*fixed/.test(notice)) return
    expect(
      notice,
      'UpdateNotice 用 position: fixed 却没有 top: env(safe-area-inset-top) —— ' +
        '刘海 / 挖孔屏上系统状态栏会盖掉它的一半',
    ).toMatch(/top:\s*env\(safe-area-inset-top/)
  })

  it('反向自测：探针（穿透那条被去掉）会被上面第一条判据抓到', () => {
    // R-51：若第一条写成了「样式块存在」或「有 pointer-events 字样」，
    // 它对 `auto` 是绿的。探针证明它真的在看**取值**。
    const probe = '.update-notice{pointer-events:auto}'
    expect(probe, '探针应当被判据认出来').not.toMatch(/pointer-events:\s*none/)
  })
})

// ── G201 —— 提示条**结构上**压不住 HUD（`[CR]` 2026-10-20）────────────────

describe('G201 —— 离线提示条压不住 HUD（Story 1.18 `[CR]` 2026-10-20）', () => {
  // 🔥 **实测（真实构建产物 + 真实 chromium，inner 800×900 竖屏）**：
  //   提示条 `top=0 bottom=32`，HUD `top=16 bottom=59` ⇒ **重叠 16px**；
  //   被盖住的叶子节点：`sun-counter__value`（"0"）上 9px、
  //   `progress-bar__label`（"第 1 单元 · 0/37"）上 10px、`heart-row__shape` ×3 各上 3px
  //   ⇒ **阳光数字被削掉一截、进度标签被盖掉一半、三颗心的顶部被削掉**。
  //
  // ⚠️ **为什么判据是「源码级」而不是「量出来」**：AC-D7 逐字禁止用 headless
  //   浏览器代替真机做布局断言（jsdom 更不行 —— 它返回 0）。
  //   ⇒ 这里守的是**结构不变式**：提示条的高度与两个视图的顶部内边距
  //   **用同一个 token** ⇒ 两者的差恒为 0 ⇒ **压不住**是构造出来的，不是量出来的。
  const notice = sourceOf('src/components/hud/UpdateNotice.vue')
  const noticeRule = ruleBodyFor(notice, '.update-notice')
  const levelViewRule = ruleBodyFor(sourceOf('src/views/LevelView.vue'), '.level-view')
  const startViewRule = ruleBodyFor(sourceOf('src/views/StartView.vue'), '.start-view')

  it('⚠️ R-53：三个规则体都找得到（找不到就是空跑）', () => {
    expect(noticeRule, '`UpdateNotice.vue` 里找不到 `.update-notice` 规则体').not.toBe('')
    expect(levelViewRule, '`LevelView.vue` 里找不到 `.level-view` 规则体').not.toBe('')
    expect(startViewRule, '`StartView.vue` 里找不到 `.start-view` 规则体').not.toBe('')
  })

  it('提示条的高度 = `--space-panel-pad`（与视图顶部内边距同一个 token）', () => {
    // ⚠️📎 **正则必须排除 `line-height`**：`/height:\s*var\(--space-panel-pad\)/`
    //   也会匹配 `line-height: var(--space-panel-pad)`（"height:" 是 "line-height:"
    //   的子串）⇒ 把 `height` 改成 `32px` 之后这条判据**照样绿**。
    //   ⇒ 这是**变异验证逼出来的**（变异 I：`height: 32px` ⇒ 判据未红）。
    //   ⇒ 现在用否定回顾断言 `height` 前面不是 `-`。
    expect(
      noticeRule,
      '`.update-notice` 没有 `height: var(--space-panel-pad)` —— 它的实际高度（实测 32px）' +
        '大于视图的顶部内边距（16px）⇒ 固定定位的浮层必然压住 HUD 的上沿',
    ).toMatch(/(?<![\w-])height:\s*var\(--space-panel-pad\)/)
  })

  it('提示条的上下内边距是 0（`box-sizing: border-box` 下它会挤掉文字的行盒）', () => {
    // ⚠️ `* { box-sizing: border-box }`（base.css 逐字）⇒ `height` 含内边距。
    //   若上下内边距非零，16px 的行盒会被挤成 8px ⇒ 文字被裁。
    const padding = /padding:\s*([^;]+);/.exec(noticeRule)?.[1] ?? ''
    expect(padding, '`.update-notice` 里读不到 `padding` 声明 —— 这条判据会空跑').not.toBe('')
    const parts = padding.trim().split(/\s+/)
    const vertical =
      parts.length === 1
        ? parts[0]!
        : parts.length === 2
          ? parts[0]!
          : parts.length === 3
            ? `${parts[0]} ${parts[2]}`
            : `${parts[0]} ${parts[2]}`
    for (const piece of vertical.split(/\s+/)) {
      expect(
        piece,
        `提示条的上下内边距不是 0（逐字 \`padding: ${padding}\`）—— ` +
          '`box-sizing: border-box` 下它会把 16px 的行盒挤扁，文字被裁掉一半',
      ).toMatch(/^0(px)?$/)
    }
  })

  it('两个视图的顶部内边距 = `--space-panel-pad` + 安全区（提示条的高度来源）', () => {
    for (const [label, rule] of [
      ['.level-view', levelViewRule],
      ['.start-view', startViewRule],
    ] as const) {
      expect(
        rule,
        `${label} 的规则体里读不到顶部内边距 —— 这条判据会空跑`,
      ).toMatch(/padding:\s*calc\(var\(--space-panel-pad\)\s*\+\s*env\(safe-area-inset-top\)\)/)
    }
  })

  it('反向自测：把提示条的高度改回 32px ⇒ 上面第一条会红', () => {
    // R-51：判据必须真的在看**取值**，不是「样式块里有个 height」。
    const probe = '.update-notice { height: 32px; }'
    expect(probe, '探针应当被判据认出来').not.toMatch(/(?<![\w-])height:\s*var\(--space-panel-pad\)/)
    // ⚠️📎 **第二个探针**（变异 I 逼出来的）：只有 `line-height` 时**必须**不匹配 ——
    //   否则「把 height 改成 32px、只留 line-height」这个真实变异会**静默通过**。
    const lineHeightOnly = '.update-notice { line-height: var(--space-panel-pad); }'
    expect(
      lineHeightOnly,
      '只有 `line-height` 的规则竟然被判据认成「高度对了」—— `height:` 是 `line-height:` 的子串，' +
        '这条判据必须在**否定回顾**上区分开',
    ).not.toMatch(/(?<![\w-])height:\s*var\(--space-panel-pad\)/)
  })
})

// ── G204 —— viewport 的两项「不许被顺手整理掉」（裁决 10）────────────────

describe('G204 —— viewport meta 的两项不许被整理掉（Story 1.18 / 裁决 10）', () => {
  // ⚠️📎 `[CR]` 2026-10-20 **补的守卫** ——
  //   裁决 10 逐字：「`maximum-scale=1` 禁掉双击缩放：否则 Android 上双击有 300ms 延迟，
  //   直接击穿 FR78 的『点击反馈 ≤100ms』预算。`viewport-fit=cover` 让 `env(safe-area-inset-*)`
  //   生效」⇒「**这两项都不许在 1.18 里被『顺手整理』掉**」。
  //   ⚠️ 而 `deferred-work.md` 逐字声称「`portrait-layout.test.ts`（源码级断言，非 PWA 组）」
  //     守着这一条 —— **实测零条**：那个文件里没有任何 viewport 取值断言
  //     （只命中一条错误提示文案里的字样）。
  //   ⇒ 两条「不许动」的取值**实际无人守** ⇒ 现在补上。
  const indexHtml = sourceOf('index.html')

  it('viewport meta 存在且读得到内容', () => {
    const meta = /<meta\s[^>]*name=["']viewport["'][^>]*>/i.exec(indexHtml)
    expect(meta, 'index.html 里找不到 `name="viewport"` 的 meta —— 竖屏布局的整个前提没了').not.toBeNull()
    expect(meta![0], 'viewport meta 是空的').toMatch(/content=["'][^"']+["']/)
  })

  it('`maximum-scale=1` 在（禁掉双击缩放，FR78 的 100ms 预算）', () => {
    const meta = /<meta\s[^>]*name=["']viewport["'][^>]*>/i.exec(indexHtml)?.[0] ?? ''
    expect(
      meta,
      'viewport meta 里没有 `maximum-scale=1` —— Android 上双击会有 300ms 延迟，' +
        '直接击穿 FR78 的「点击反馈 ≤100ms」预算（裁决 10 逐字：这项不许被整理掉）',
    ).toMatch(/maximum-scale\s*=\s*1\b/)
  })

  it('`viewport-fit=cover` 在（`env(safe-area-inset-*)` 的前提）', () => {
    const meta = /<meta\s[^>]*name=["']viewport["'][^>]*>/i.exec(indexHtml)?.[0] ?? ''
    expect(
      meta,
      'viewport meta 里没有 `viewport-fit=cover` —— `env(safe-area-inset-*)` 全部失效，' +
        '刘海 / 挖孔屏上整页内容被系统状态栏盖住（裁决 10 逐字：这项不许被整理掉）',
    ).toMatch(/viewport-fit\s*=\s*cover\b/)
  })

  it('反向自测：拿掉任一项 ⇒ 上面两条会红', () => {
    const probe = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
    expect(probe, '探针里没有 maximum-scale —— 判据认不出要防的形态').not.toMatch(
      /maximum-scale\s*=\s*1\b/,
    )
    expect(probe, '探针里没有 viewport-fit —— 判据认不出要防的形态').not.toMatch(
      /viewport-fit\s*=\s*cover\b/,
    )
  })
})

// ── G140 —— 本 story 的布局判据不许用 jsdom 假绿（AC-D7）─────────────────

describe('G140 —— 布局判据不读 jsdom 的假布局（Story 1.18 / AC-D7；`[CR]` 2026-10-20 扩大扫描面）', () => {
  it('**全仓** `tests/` 下零 getComputedStyle / offsetWidth / getBoundingClientRect', () => {
    // 🔥 AC-D7 逐字：jsdom 不做布局，这三个 API 在 jsdom 里返回 0 或声明值，
    //   拿它们断言「间距达标」等于断言「0 ≥ 0」—— **恒绿，且看起来很严谨**。
    //   Story 1.17 已实测证明过这条路径。
    //
    // ⚠️📎 **`[CR]` 2026-10-20 把扫描面从「一份手写名单」改成「全仓 `tests/`」**：
    //   原判据扫的是**三个文件**的手写名单（`portrait-layout` / `pwa-sw-guard` /
    //   `sw-registration`），而本 story 实际**新增了 9 个测试文件**
    //   ⇒ 另外 6 个文件里出现 jsdom 布局 API 时 G140 **不红**。
    //   ⇒ 名单型判据的病根是「**名单不会跟着 story 一起长大**」——
    //     改成递归扫全仓，这个失效形态**从此不存在**。
    //   ⚠️ **这不是「更严的空话」**：实测全仓 `tests/` 下
    //   `grep -rlE '\b(getComputedStyle|getBoundingClientRect|offsetWidth|offsetHeight|clientWidth)\s*\('`
    //   **零输出** ⇒ 改成全扫不会误伤任何一个既有文件。
    const offenders: string[] = []
    for (const file of allFilesUnder(join(root, 'tests'))) {
      // ⚠️ 这里直接读绝对路径（`sourceOf` 会再拼一次仓库根）——
      //   `allFilesUnder` 给的是绝对路径，交给 `sourceOf` 会拼成 `/root/repos/plants-game/root/…`。
      const source = stripComments(readFileSync(file, 'utf8'))
      if (/\b(getComputedStyle|getBoundingClientRect|offsetWidth|offsetHeight|clientWidth)\s*\(/.test(source)) {
        offenders.push(file)
      }
    }
    expect(
      offenders,
      `这些文件用了 jsdom 的布局 API：${offenders.join('、')} —— ` +
        'jsdom 不做布局，这些调用返回 0，断言必然恒绿。AC-D7 要求布局判据只能是源码级或真机级',
    ).toEqual([])
  })

  it('反向自测：扫描器真的能扫到 `tests/` 下的文件（不是「扫了个空集」）', () => {
    // ⚠️ R-53：一条「扫全仓」的判据必须先证明它**真的扫到了东西** ——
    //   否则「全仓零命中」与「扫了 0 个文件」长得一模一样。
    const files = allFilesUnder(join(root, 'tests'))
    expect(files.length, '扫描器在 `tests/` 下一个文件都没找到 —— 上面那条是恒真的').toBeGreaterThan(20)
    expect(
      files.some((file) => file.endsWith('portrait-layout.test.ts')),
      '扫描器没认出本文件 —— 扫描面可能只认了某几个后缀',
    ).toBe(true)
  })
})

// ── G166..G169 —— 宽屏分栏（Story 1.19 / AC-H1..H5）────────────────────────

/**
 * 宽屏分栏守卫（Story 1.19 / AC-H 组 —— 「孩子把平板转过来」）。
 *
 * ── 守的是哪一个已经付过代价的 bug ──────────────────────────────────────────
 * 2026-10-17 真机试玩反馈「不能种植植物」，逐层排查后定位到横屏：
 * `@media (max-height: 900px)` 把 `height: 100%`（整个视口）**全部分给战场**，
 * 而 HUD、朗读浮层、题卡、手牌是它的四个兄弟节点，一分都没算进去
 * （实测：`.level-view` 内容盒 784px，战场吃掉 736，剩下 48px 要装 558px）。
 * ⇒ 题卡 `top=875` 落在 800 的折叠线下方 ⇒ 孩子看不见题 ⇒ 永远答不出
 * ⇒ 手牌永远为空 ⇒ 点任何格子都无反应。
 *
 * ── 为什么判据仍然是源码级 ─────────────────────────────────────────────────
 * 同 G134 的理由：jsdom 不做布局，特异度与像素都证明不了。
 * ⚠️ **但有一条源码级判据证明不了**：全局 `.level-view` 是 (0,1,0)，
 *   压不过 SFC scoped 编译出的 `.level-view[data-v-*]` (0,2,0) ——
 *   实测注入 `display: grid` 无效、`!important` 才生效。
 *   G166 守的是「那行 `!important` 还在」，**不是**「它真的赢了层叠」。
 *   后者由 story 文档里记的浏览器实测背书，本文件不假装测过。
 *
 * ── 判据设计上防的三种假绿 ─────────────────────────────────────────────────
 * ① 「不许出现 X」类一律先跑**反向自测**（R-53）：三条判据各配一个正例探针。
 * ② G168 **不写死五个子节点的名字** —— 它去解析 `LevelView.vue` 模板里
 *    `<main class="level-view">` 的**真实直接子元素集合**，再回查每个子元素的
 *    根节点类名有没有 `grid-area`。写死名字的判据在新增第 6 个子元素那天就失明。
 * ③ 唯一的豁免项（`.level-outcome`）**同时**断言它仍是 `position: absolute` ——
 *    豁免的前提一旦不成立，豁免当场失效。
 */

describe('G166 —— 宽屏分栏块存在且是左右两栏（Story 1.19 / AC-H1、H5）', () => {
  const responsive = sourceOf('src/styles/responsive.css')

  it('反向自测：三条判据的正则确实能匹配到违规形态（判据本身没写坏）', () => {
    // ① **本条判据要咬住的正是今天那个失效写法**：不带 `!important` 的 `display: grid`
    //    会被 SFC scoped 压过（实测 getComputedStyle 仍是 flex）。
    //    正例匹配、违规不匹配，两边都写出来，否则这条自测只是走过场。
    expect('.level-view { display: grid !important; }').toMatch(LANDSCAPE_DISPLAY)
    expect(
      '.level-view { display: grid; }',
      '探针应当被判据认出来 —— 它就是会被 scoped 压过的那条死规则',
    ).not.toMatch(LANDSCAPE_DISPLAY)
    // ② 单栏写法必须能被认出来
    expect('.level-view { grid-template-columns: minmax(0, 1fr); }').not.toMatch(
      LANDSCAPE_TWO_COLUMNS,
    )
    // ③ `orientation` 写法必须会被 G134 那条拦下（证明禁令不是洁癖）
    expect('@media (orientation: landscape)').toMatch(/orientation\s*:/)
    // ④ `grid-template-areas` 的行解析：多行与单行两种合法写法都要拆对
    expect(
      gridAreaRows(`\n  'hud     hud'\n  'field   quiz'\n`),
      '多行写法拆错了 ⇒ 战场与题面在同一列那条判据会恒真',
    ).toEqual([
      ['hud', 'hud'],
      ['field', 'quiz'],
    ])
    expect(gridAreaRows(`'hud hud' 'field quiz'`)).toEqual([
      ['hud', 'hud'],
      ['field', 'quiz'],
    ])
    // ⑤ 顶层切分：`minmax(0, 1fr)` 内部的空格不得被当成轨道分隔符
    expect(
      topLevelTokens('minmax(0, 1fr) 25rem'),
      '把 minmax 内部空格当分隔符 ⇒ 轨道数算成 3，与区域图的 2 格对不上账',
    ).toEqual(['minmax(0, 1fr)', '25rem'])
    // ⑥ 非矩形具名区域必须被认出来（变异 M181 第一形态）
    //    ⚠️ 夹具**报出两个**名字（`quiz` 与 `hand`）不是笔误：那个变异里
    //    `quiz` 落在 (1,1)(2,0)(3,1)，外接矩形 3×2=6 而只有 3 格，同样不是矩形。
    //    初版夹具只写了 `['hand']`，跑出来才发现 —— 记在这里免得下一个人
    //    「顺手改成只报一个」。
    expect(
      raggedAreaNames([
        ['hud', 'hud'],
        ['overlay', 'quiz'],
        ['field', 'hand'],
        ['hand', 'quiz'],
      ]),
      'hand 同时落在 (2,1) 与 (3,0)，quiz 落在 (1,1)(2,0)(3,1) —— 两个都不是矩形',
    ).toEqual(['quiz', 'hand'])
    expect(
      raggedAreaNames([
        ['hud', 'hud'],
        ['overlay', 'quiz'],
        ['field', 'quiz'],
        ['hand', 'quiz'],
      ]),
      '合规的矩形区域图不得被误报',
    ).toEqual([])
  })

  it('断点用「视口比高更宽」表达，而不是 orientation 媒体查询', () => {
    // ⚠️ G134 逐字禁止 `orientation:`，而这里的判据比「不许 orientation」更具体：
    //   它要求**存在**这一条判据。manifest 的 `orientation: portrait` 在 Android
    //   浏览器里本就不可靠（`vite.config.ts` 的注释已记录），布局不能拿它当前提。
    expect(
      responsive,
      'responsive.css 里没有「视口比高更宽」的断点 —— 孩子把平板转过来时' +
        '整个关卡页仍是单列，题卡被推到折叠线以下（实测 1280×800：题卡 top=875 > vh=800）',
    ).toMatch(/@media[^{]*min-aspect-ratio/)
  })

  it('`.level-view` 在宽屏下真的切成了 grid（且带 !important，见 G166 的头注释）', () => {
    const rule = ruleBodyFor(landscapeBlock(responsive), '.level-view')
    // 📎📎 **`[CR]` 2026-10-18：这里原来写的是 `not.toBeNull()`，而那是一条恒真的空断言** ——
    //   `ruleBodyFor` 的返回类型是 `string`，找不到规则时返回 `''`（见它的实现），
    //   **永远不会返回 `null`** ⇒ 删掉整条 `.level-view` 规则它照样绿。
    //   真正拦下的是下面那句 `toMatch(LANDSCAPE_DISPLAY)`，但留着 `not.toBeNull()`
    //   会让人以为「规则存在」这件事已被**独立**验证过一次（R-51：断言不许允许它要防的违规）。
    // ⇒ 改成对 `''` 的显式判空，让「规则被删」与「规则存在但没切 grid」两种失败各有各的报错。
    expect(
      rule,
      '宽屏块里没有 `.level-view` 的规则 —— 战场与题面仍在同一条纵向流里，' +
        '横屏下题卡必然被推出视口',
    ).not.toBe('')
    expect(rule, '.level-view 在宽屏下没有切 grid ⇒ 左右分栏根本没发生').toMatch(
      LANDSCAPE_DISPLAY,
    )
    expect(
      rule,
      '`.level-view { display: grid }` 没带 `!important` —— 实测（Chromium）：' +
        'SFC scoped 把 `.level-view` 编译成 `.level-view[data-v-*]`（0,2,0），' +
        '压得过全局的 `.level-view`（0,1,0）。实测注入不带 important 的 `display:grid` ' +
        '后 getComputedStyle 仍是 flex，带了才变 grid ⇒ 不带就是一条死规则',
    ).toMatch(/display:\s*grid\s*!important/)
    expect(
      rule,
      '`.level-view` 在宽屏下没锁 `height` —— 战场那一行就没有「剩余多少」的确定答案，' +
        '而这正是矮视口那套规则当初要治的病',
    ).toMatch(/height:\s*100dvh/)
  })

  it('宽屏块声明了两栏与具名区域（战场在左、题面在右）', () => {
    const block = landscapeBlock(responsive)
    expect(
      ruleBodyFor(block, '.level-view'),
      '`.level-view` 在宽屏下没有两栏列定义 —— 战场与题面仍会上下堆叠',
    ).toMatch(LANDSCAPE_TWO_COLUMNS)
    const areas = /grid-template-areas:([^;]+);/.exec(block)?.[1] ?? ''
    expect(
      areas,
      '宽屏块没有 `grid-template-areas` —— 五个面板会落回 grid 自动排布并互相压盖，' +
        '而症状是「某个面板不见了」，界面上没有任何东西会报错',
    ).not.toBe('')
    // ⚠️ 这一条锁的是**形状**（战场那一格与题面那一格不同列），
    //   而不是「哪一格叫什么」—— 后者由 G168 从模板反查。
    const rows = gridAreaRows(areas)
    /*
     * ⚠️ 这条是**变异 M181 第一形态逼出来的**（见 story 文档的假绿登记）：
     *   把区域图改成 `'field hand' / 'hand quiz'` 时，判据是绿的 ——
     *   `field` 仍在第 1 列、`quiz` 仍在第 2 列，守的不变量确实没被破坏。
     *   但那个写法让 `hand` 同时出现在 (3,2) 与 (4,1)，**不是矩形** ——
     *   而 CSS 逐字要求每个具名区域是矩形，浏览器会**整条丢弃**
     *   `grid-template-areas`，五个面板当场落回自动布局。
     *   ⇒ 判据必须先确认区域图本身**合法**，否则它在为一份没人会执行的 CSS 背书。
     */
    const widths = new Set(rows.map((cells) => cells.length))
    expect(
      widths.size,
      `区域图每一行的格子数不一致（实际：${rows.map((c) => c.length).join(' / ')}）—— ` +
        '浏览器会整条丢弃 `grid-template-areas`，五个面板落回自动布局并互相压盖',
    ).toBe(1)
    const trackCount = topLevelTokens(/grid-template-columns:\s*([^;]+);/.exec(block)?.[1] ?? '').length
    expect(
      rows[0]?.length,
      `区域图每行 ${rows[0]?.length} 格，而 grid-template-columns 声明了 ${trackCount} 条轨道 —— ` +
        '两者对不上时浏览器同样丢弃整条声明',
    ).toBe(trackCount)
    /*
     * ⚠️ 「每行格子数一致」**不够** —— 变异 M181 第一形态把区域图改成
     *   `'field hand' / 'hand quiz'` 时每一行都还是 2 格，但 `hand` 同时落在
     *   (第3行,第2列) 与 (第4行,第1列)：它的外接矩形是 2×2 = 4 格，
     *   而实际只有 2 格被它占着 ⇒ **不是矩形** ⇒ 浏览器整条丢弃该声明。
     * ⇒ 判据按 CSS 的真实定义逐个名字算：格子数必须**填满外接矩形**。
     */
    const ragged = raggedAreaNames(rows)
    expect(
      ragged,
      `这些具名区域不是矩形：${ragged.join('、')} —— CSS 逐字要求每个具名区域是矩形，` +
        '浏览器会整条丢弃 `grid-template-areas`，五个面板落回自动布局并互相压盖',
    ).toEqual([])
    const fieldRow = rows.find((cells) => cells.includes('field'))
    const quizRow = rows.find((cells) => cells.includes('quiz'))
    expect(
      fieldRow,
      '`grid-template-areas` 里没有名为 `field` 的格子 —— 战场没被排版，' +
        '它会落回自动布局并压在别的面板上',
    ).toBeDefined()
    expect(
      quizRow,
      '`grid-template-areas` 里没有名为 `quiz` 的格子 —— 题面没被排版，孩子在横屏下看不见它',
    ).toBeDefined()
    // ⚠️📎 **`[CR]` 第七轮按 R-57 把这条从「不等式」升级为「顺序」**：
    //   原判据只有 `.not.toBe(...)`，而它上面那句消息逐字要求的是
    //   「战场必须在**左**栏、题面在**右**栏」—— 消息要的是顺序，判据只查不等。
    //   ⇒ `field` 在第 1 列、`quiz` 在第 0 列（两栏对调）同样绿，
    //     而那恰恰是消息明令禁止的形态。
    //   ⇒ 断言本身**不是**推翻，而是**补齐消息已声明的那一半**；
    //     原不等式保留为前置（同一列仍然更严重，且报错更直观）。
    expect(
      fieldRow?.indexOf('field'),
      '战场（field）与题面（quiz）落在了同一列 —— 那样它们仍会上下堆叠，' +
        '横屏下一个字都没多出来。战场必须在左栏、题面在右栏',
    ).not.toBe(quizRow?.indexOf('quiz'))
    expect(
      (fieldRow?.indexOf('field') ?? -1) < (quizRow?.indexOf('quiz') ?? -1),
      '🔴 战场与题面**两栏对调了** —— 战场落在右栏、题面落在左栏。' +
        '上面那条只判「不同列」，两栏对调它照样绿；' +
        '但 AC-H1 逐字要的是「战场在左、题面在右」（战场宽、题面窄，各按各的栏宽布局）。',
    ).toBe(true)
  })
})

describe('G167 —— 宽屏下战场那格的两个必需声明（Story 1.19 / AC-H2）', () => {
  const block = landscapeBlock(sourceOf('src/styles/responsive.css'))
  const rule = ruleBodyFor(block, '.battle-grid')

  it('反向自测：两条判据的正则确实能匹配到违规形态', () => {
    expect('.battle-grid { align-self: start; height: auto; }').toMatch(/align-self:\s*start/)
    expect('.battle-grid { flex: 0 0 auto; }').not.toMatch(/align-self:\s*start/)
    expect('.battle-grid { height: calc(100% - 48px); }').not.toMatch(/height:\s*auto/)
  })

  it('战场那一格对齐到行首 —— 缺它会被 1fr 行高拉伸，9/5 比例当场失效', () => {
    // 🔥 格子是 `aspect-ratio: 1 / 1` 的正方形，塔与僵尸是扁平矢量；
    //   grid item 默认 `align-self: stretch`，在 `minmax(0, 1fr)` 撑满的行里
    //   会被拉到整行高度 ⇒ 战场从 9:5 变成别的比例 ⇒ 整幅图被拉变形。
    expect(
      rule,
      '宽屏块里 `.battle-grid` 没有 `align-self: start` —— 它会被 1fr 行高拉满，' +
        '`aspect-ratio: 9 / 5` 失效，战场与塔、僵尸一起变形',
    ).toMatch(/align-self:\s*start/)
  })

  /**
   * 🔥📎 **G185（`[CR]` 第七轮新增）：规则体里某个属性的「**生效值**」。**
   *
   * ⚠️ **为什么不能只问「这行字在不在」**：CSS 里**同一条规则内后面的声明赢**。
   *   所以在 `height: auto;` 后面再补一条 `height: calc(100% - 48px)`，
   *   `/height:\s*auto/` 照样匹配，而**生效值是后者** —— 2026-10-17 那个 P0
   *   （题卡被推出折叠线）原样复活，G167 全绿。
   *
   * @param body 规则体（`{ … }` 内部或不含花括号的声明串）
   * @param prop 属性名（不带冒号）
   * @returns 最后一条该属性的声明值；一条都没有则返回 `null`
   */
  it('🔴 战场那格的**生效**高度是 `auto`（不是「块里写着 auto 就算数」）', () => {
    const battleRule = ruleBodyFor(block, '.level-view .battle-grid')
    expect(battleRule, '判据范围消失：宽屏块里找不到 `.level-view .battle-grid` 的规则').not.toBe('')
    // ⚠️ 这条是 G167 原判据（`toMatch(/height:\s*auto/)`）的**加固版**。
    //   原判据只问「这行字在不在」⇒ 后面再补一条 `height:` 就把它盖掉而全绿。
    expect(
      effectiveDecl(battleRule, 'height'),
      '🔴 战场那一格的**生效** height 不是 `auto` —— ' +
        '同规则内后面的 `height` 声明会赢它，战场重新吃满视口高度，' +
        '题卡被推出折叠线（2026-10-17 实测故障的根因）。\n' +
        '⚠️ 只写 `height: auto` 不够：还要保证它是**最后一条** height 声明。',
    ).toBe('auto')
  })

  it('判据自测：`effectiveDecl` 取的是**最后**一条，不是第一条（R-53）', () => {
    // 🔴 形态一：G167 首版能分辨的那种 —— 只有一条。
    expect(effectiveDecl('height: auto;', 'height')).toBe('auto')
    // 🔴 形态二：**后写覆盖** —— 首版判据在这里是绿的，生效值却不是 auto。
    expect(
      effectiveDecl('height: auto;\nheight: calc(100% - 48px);', 'height'),
      '判据自测自己红了：后写覆盖的形态没被取到最后一条',
    ).toBe('calc(100% - 48px)')
    // 🔴 形态三：前置一条不相关的属性，不能把边界算错。
    expect(effectiveDecl('grid-area: field;\nheight: auto;', 'height')).toBe('auto')
    // 反向：没有该属性时返回 null（不是空串）—— 「没声明」与「声明了空值」是两件事。
    expect(effectiveDecl('align-self: start;', 'height')).toBeNull()
    // ⚠️ 属性名要做转义边界：`--touch-min` 这种带连字符的名字不该被
    //   `touch-min` 的查询误命中（`--touch-min` 里也含 `touch-min`）。
    expect(effectiveDecl('--touch-min: 48px;', 'touch-min')).toBeNull()
  })

  it('战场那一格的高度归零 —— 缺它就被外来的高度预算压住', () => {
    // ⚠️📎 **`[CR]` 2026-10-20 按 R-57 换理由**（**断言一个字没动**）：
    //   原理由是「同文件里还有 `@media (max-height: 900px)` 那条
    //   `height: calc(100% - …)`，宽屏同时命中两条、靠后者胜」。
    //   ⚠️ **那条断点已被整块删除**（`[CR]` 实测：它在横屏是死代码、在竖屏是缺陷），
    //   而「宽屏块必须显式把 `height` 归零」这条**要求本身没变** ——
    //   它防的是**任何**外来的高度预算（包括将来某天 `BattleField.vue`
    //   自己加一条 `height`）。
    //   ⇒ **前提变了，结论没变** —— 这正是 R-57 说的「改判据时断言不动、改理由」。
    //
    // ⚠️📎 **`[CR]` 第七轮按 R-57 加固**：这条问的是「块里**写着** `height: auto`」，
    //   而 CSS 里同规则内**后面的声明赢** ⇒ 在它后面补一条 `height:` 就能盖掉它，
    //   而本条照样绿（子代理实测 51/51 全绿）。**断言本身一个字没动**，
    //   加固由上面那条「生效高度」判据承担 —— 本条降为**可读性断言**，
    //   真正的把关在那条。
    expect(
      rule,
      '宽屏块里 `.battle-grid` 没有 `height: auto` —— 它会被任何外来的高度预算接管，' +
        '战场重新吃满整个视口高度，题卡被推出折叠线（2026-10-17 实测故障的根因）',
    ).toMatch(/height:\s*auto/)
  })
})

describe('G168 —— 宽屏下每个面板都被排了版（Story 1.19 / AC-H1、H5）', () => {
  const block = landscapeBlock(sourceOf('src/styles/responsive.css'))
  const levelViewTemplate = templateOf(levelViewSource)

  it('反向自测：模板解析器能认出直接子元素（含嵌套在内的那些不算）', () => {
    // ⚠️ R-53：不自测的话，「解析出来是空数组」会让下面每条 `for` 都不执行 ——
    //   那正是恒绿的样子。
    const children = directChildrenOfLevelView(levelViewTemplate)
    expect(
      children.map((child) => child.tag).join(','),
      '模板解析器没认出任何直接子元素 —— 下面的逐项断言会整段空转',
    ).toBe('div,PronunciationOverlay,BattleField,QuestionCard,HandDeck,LevelOutcome')
  })

  it('`.level-view` 的每个直接子元素都有 `grid-area`（豁免项另行断言）', () => {
    const vueByName = new Map<string, string>()
    for (const file of vueFiles()) {
      vueByName.set(file.slice(file.lastIndexOf('/') + 1, -4), readFileSync(file, 'utf8'))
    }
    const assigned = panelsWithGridArea(block)
    const unplaced: string[] = []
    for (const child of directChildrenOfLevelView(levelViewTemplate)) {
      const rootClass = child.rootClass ?? rootClassOfComponent(child.tag, vueByName)
      if (rootClass === null) {
        unplaced.push(`${child.tag}（读不到根节点类名，判据失明）`)
        continue
      }
      // ⚠️ 终态浮层是**绝对定位**的，它不属于 grid 流 —— 豁免由 G168 下一条守住。
      if (rootClass === 'level-outcome') continue
      if (!assigned.has(rootClass)) unplaced.push(`${child.tag} → .${rootClass}`)
    }
    expect(
      unplaced,
      `这些面板没有排进宽屏的 grid：${unplaced.join('、')} —— ` +
        '没排版的面板会落回 grid 自动布局并压在别的面板上，' +
        '症状是「某个东西不见了」，界面上没有任何报错',
    ).toEqual([])
  })

  it('🔴 每个面板的 `grid-area` 必须**指向一个真实存在、且没人抢的格子**（G185 —— 第七轮补）', () => {
    const vueByName = new Map<string, string>()
    for (const file of vueFiles()) {
      vueByName.set(file.slice(file.lastIndexOf('/') + 1, -4), readFileSync(file, 'utf8'))
    }

    // ⚠️🔥 **`[CR]` 第七轮补的洞**：G166 只判**区域图模板**的形状（`field` 与 `quiz` 不同列），
    //   G168 只判「这个面板**有**一条带 `grid-area` 的规则」。
    //   **两者都没说「面板 A 的 `grid-area` 名字」必须是「模板里存在、且没有别的面板在用」的。**
    //   ⇒ 实测变异（子代理跑过，51/51 全绿）：
    //       .level-view .hand-deck { grid-area: field; }
    //     手牌与战场抢同一格 —— 战场不见了，界面上没有任何报错，而全套守卫绿灯。
    //   ⇒ 同形态还有 `grid-area: nonexistent`：模板里没这个名字 ⇒ 浏览器整条忽略
    //     ⇒ 面板落回自动布局、互相压盖 ⇒ 同样全绿。

    // ① 模板里真实存在的格子名集合（从 `grid-template-areas` 逐字取）。
    const areas = gridAreaNames(block)
    expect(
      areas.size,
      '判据范围消失：宽屏块里解析不出任何 `grid-template-areas` 格子名',
    ).toBeGreaterThan(0)

    // ② 面板 → 它声明的格子名
    const claimed = new Map<string, string>() // 格子名 -> 面板类名（用来查抢占）
    const problems: string[] = []
    for (const child of directChildrenOfLevelView(levelViewTemplate)) {
      const rootClass = child.rootClass ?? rootClassOfComponent(child.tag, vueByName)
      if (rootClass === null) continue
      if (rootClass === 'level-outcome') continue // 绝对定位浮层，G168 下一条守它
      const area = gridAreaOf(block, rootClass)
      if (area === null) continue // 没排版的由上一条判
      if (!areas.has(area)) {
        problems.push(`.${rootClass} → \`grid-area: ${area}\`，但模板里没有这个格子名`)
      }
      const rival = claimed.get(area)
      if (rival !== undefined) {
        problems.push(`.${rootClass} 与 .${rival} 都占了 \`${area}\` 这一格`)
      } else {
        claimed.set(area, rootClass)
      }
    }
    expect(
      problems,
      `🔴 面板与格子对不上：${problems.join('；')}。\n` +
        '症状是某个面板**从画面上消失**或与别的面板压在一起，界面上没有任何报错。\n' +
        '⚠️ G166/G168 各自都绿：G166 只看 `grid-template-areas` 的形状，' +
        'G168 只看「有没有 grid-area 声明」—— 没有任何一条把它们**绑起来**。',
    ).toEqual([])
  })

  it('反向自测：面板↔格子 判据分得清「抢占」与「指向不存在的格子」（R-53）', () => {
    // ⚠️ **夹具自足，不引用活文件** —— 首版把自测写在真实 `block` 上做 `replace`，
    //   结果变异真实 CSS 时**自测跟着一起红**，自测与被测对象耦合在一起。
    //   自测要验的是**判据**，判据该在最小夹具上验。
    const fixture = [
      '.level-view {',
      "  grid-template-areas:",
      "    'hud     hud'",
      "    'overlay quiz'",
      "    'field   quiz'",
      "    'hand    quiz';",
      '}',
      '.level-view .battle-grid { grid-area: field; }',
      '.level-view .question-card { grid-area: quiz; }',
      '.level-view .hand-deck { grid-area: hand; }',
    ].join('\n')

    // 前提自检：夹具本身必须是自洽的，否则下面的判据结果没有意义。
    const areas = gridAreaNames(fixture)
    expect([...areas].sort().join(','), '夹具自检：格子名集合解析错了').toBe('field,hand,hud,overlay,quiz')
    expect(gridAreaOf(fixture, 'hand-deck'), '夹具自检：hand-deck 的格子取错了').toBe('hand')
    // ⚠️ 祖先类名不算：`.level-view` 出现在每条选择器里，但它自己没被排版。
    expect(
      gridAreaOf(fixture, 'level-view'),
      '夹具自检：祖先类名 `.level-view` 被当成了被排版的面板',
    ).toBeNull()

    // 🔴 形态一：抢占。`hand-deck` 与 `battle-grid` 抢 `field`。
    const rival = fixture.replace('.hand-deck { grid-area: hand; }', '.hand-deck { grid-area: field; }')
    expect(gridAreaOf(rival, 'hand-deck'), '判据自测自己红了：抢占形态取不到 `field`').toBe('field')
    expect(gridAreaOf(rival, 'battle-grid'), '判据自测自己红了：抢占形态下另一方取错了').toBe('field')
    // ⇒ 两者取到同一个名字 —— 上游那条判据正是拿它判「抢占」。
    expect(
      gridAreaOf(rival, 'hand-deck') === gridAreaOf(rival, 'battle-grid'),
      '判据自测自己红了：抢占形态下两面板竟指向不同格子 ⇒ 上游判据会放过它',
    ).toBe(true)

    // 🔴 形态二：指向不存在的格子（浏览器会整条忽略这条声明）。
    const bogus = fixture.replace('.hand-deck { grid-area: hand; }', '.hand-deck { grid-area: nonexistent; }')
    expect(
      gridAreaOf(bogus, 'hand-deck'),
      '判据自测自己红了：不存在的格子名竟没被取出来',
    ).toBe('nonexistent')
    expect(
      gridAreaNames(fixture).has(gridAreaOf(bogus, 'hand-deck') ?? ''),
      '判据自测自己红了：`nonexistent` 竟被算进模板的合法格子名集合',
    ).toBe(false)
  })

  it('反向自测：判据分得清「格子名」与「面板类名」（第一版的恒真形态）', () => {
    // ⚠️ 这一条守的是本守卫**自己**那处假绿：初版拿 `grid-area` 的格子名
    //   （field/hud/overlay/quiz/hand）去比面板类名（battle-grid/…），
    //   而两套名字里恰好都有 `hud` ⇒ `.hud` 碰巧通过、其余四个全报红。
    //   正例：`.battle-grid` 的规则体里带 `grid-area` ⇒ 必须被认出来。
    expect(
      [...panelsWithGridArea('.level-view .battle-grid { grid-area: field; height: auto; }')],
      '带 `grid-area` 的规则，其面板类名必须被认出来',
    ).toEqual(['level-view', 'battle-grid'])
    // 反例：同名的**格子**不该被当成面板类名 —— `grid-area: battle-grid` 是
    //   「把战场放到名叫 battle-grid 的格子里」，它没给 `.battle-grid` 排版。
    expect(
      [...panelsWithGridArea('.level-view .hud { grid-area: battle-grid; }')],
      '把格子**命名**成面板类名，不等于给那个面板排了版 —— 判据不许被这个形态骗过',
    ).toEqual(['level-view', 'hud'])
    expect(
      [...panelsWithGridArea('.level-view .battle-grid { width: 100%; }')],
      '规则体里没有 `grid-area` 就不该算排过版',
    ).toEqual([])
  })

  it('豁免的 `.level-outcome` 确实仍是绝对定位（豁免的前提一旦不成立，豁免当场失效）', () => {
    const outcome = ruleBodyFor(sourceOf('src/components/hud/LevelOutcome.vue'), '.level-outcome')
    expect(
      outcome,
      '`.level-outcome` 不再是绝对定位 —— 它参与了正常流，' +
        '于是 G168 上一条对它的豁免就变成了一条真实的漏排',
    ).toMatch(/position:\s*absolute/)
  })

  // 📎📎 **`[CR]` 2026-10-18 加的反向自测（R-53）—— 这条守卫的鉴别力全靠扫描器。**
  //   G168 的全部价值是「区分直接子元素与孙元素」，而那正是 `directChildrenOfLevelView`
  //   的 depth 记账在做。**记账一旦失衡，G168 变成恒绿**，且没有任何东西会报错 ——
  //   症状与它要抓的漏排一模一样（某个面板不见了、界面上没有任何报错）。
  // ⇒ 夹具直接覆盖三种失衡：空元素多进一层、多余闭合标签让 depth 变负、以及正常嵌套。
  it('判据自测：直接子元素扫描器在「原生空元素」下不失明（R-53）', () => {
    const wrap = (inner: string): string =>
      `<main class="level-view">\n${inner}\n</main>\n`
    const tagsOf = (t: string): string[] => directChildrenOfLevelView(t).map((c) => c.tag)

    // ⚠️ 核心形态：`<img>` 之后**必须还能认出后面的直接子元素**。
    //   首版这里会得到 ['img'] —— `depth` 被 `<img>` 顶到 1 且永不回落。
    expect(
      tagsOf(wrap('  <img src="mascot.png">\n  <HandDeck />\n  <BattleField />')),
      '扫描器遇到原生空元素就永久失明 —— 后面新加的直接子元素永远不会被 G168 收集，' +
        '守卫从此恒绿而症状与它要抓的漏排完全一样',
    ).toEqual(['img', 'HandDeck', 'BattleField'])

    // 而成对嵌套的元素不该被当成直接子元素。
    expect(tagsOf(wrap('  <div><BattleField /></div>\n  <HandDeck />'))).toEqual(['div', 'HandDeck'])
    // 带 slot 的子组件（成对写法）要能正确收口。
    expect(tagsOf(wrap('  <HandDeck><Card /></HandDeck>\n  <BattleField />'))).toEqual([
      'HandDeck',
      'BattleField',
    ])
    // 空元素写成自闭合也该认得出（两种写法都得对）。
    expect(tagsOf(wrap('  <hr />\n  <BattleField />'))).toEqual(['hr', 'BattleField'])
  })
})

describe('G169 —— 竖屏基准没有被宽屏改动污染（Story 1.19 / AC-H4）', () => {
  const responsive = sourceOf('src/styles/responsive.css')

  it('`.level-view` 的竖屏基准仍是 flex 列 + min-height（AC-H4：竖屏七个尺寸零变化）', () => {
    const rule = ruleBodyFor(levelViewSource, '.level-view')
    expect(
      rule,
      '`.level-view` 的竖屏基准不再是 flex 列 —— 竖屏平板（800×1280 等七个尺寸）会被一起改坏',
    ).toMatch(/display:\s*flex/)
    expect(
      rule,
      '`.level-view` 的 `min-height: 100dvh` 不见了 —— G137 逐字要求保留它，' +
        '改 `height` 不改 `min-height` 是当时刻意的（见 responsive.css 的注释）',
    ).toMatch(/min-height:\s*100dvh/)
  })

  it('🔴 横屏下选项必须是 **2 列**（AC-H3 —— 第七轮补，此前零守卫）', () => {
    const wideBlock = landscapeBlock(sourceOf('src/styles/responsive.css'))
    const rule = ruleBodyFor(wideBlock, '.level-view .question-card .question-card__options')
    expect(
      rule,
      '判据范围消失：宽屏块里找不到那条三段后代选择器的规则 —— ' +
        '⚠️ 它必须写 `.level-view .question-card .question-card__options`（0,3,0），' +
        '直接写 `.question-card__options`（0,1,0）压不过 QuestionCard 自己的 scoped (0,2,0)。',
    ).not.toBe('')
    // ⚠️🔥 **`[CR]` 第七轮补的洞**：G166–G168 全部**没有**碰过这条。
    //   实测变异（子代理跑过）：删掉整条规则 ⇒ 选项退回竖屏的 `repeat(4, 1fr)`
    //   （**当时**的竖屏是 `repeat(4, 1fr)`，现在是 `repeat(auto-fit, minmax(0, 1fr))`），
    //   在 400px 的右栏里每张只剩 ~88px —— 而 `.option-card__image` 是
    //   `aspect-ratio: 1/1` 的词图，**88px 的图对 4–8 岁孩子认不出词**。
    //   M176–M181 六条变异没有一条打在这儿 ⇒ AC-H3 在守卫上是**空的**。
    expect(
      effectiveDecl(rule, 'grid-template-columns'),
      '🔴 横屏下选项不是 2 列 —— 选项并排挤在 400px 的右栏里，每张被摊薄到百来像素，' +
        '而词图是 1:1 的，这个尺寸对 4–8 岁孩子偏小（AC-H3 / 该规则自己的注释逐字这么写）。',
    ).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('⚠️ 宽屏块自身不引入 `orientation` 媒体查询（裁决 13 / G134 的延伸）', () => {
    // 🔥📎 **`[CR]` 第七轮按 R-57 更正这条判据的**对象**，并标注它原本恒真。**
    //
    //   原判据拿 `landscapeBlock(responsive)` 去 `not.toMatch(/orientation\s*:/)`。
    //   而 `landscapeBlock` 返回的是 `slice(open + 1, i)` —— **只有花括号之间的块体**，
    //   `@media (min-aspect-ratio: 1/1)` 那段**前导语根本不在里面**。
    //   ⇒ 它只能匹配到 CSS **属性**位置的 `orientation:`，
    //     **永远匹配不到媒体查询前导语里的 `orientation:`** ⇒ 这条恒真。
    //
    //   ⚠️ 覆盖它的是 G134（`:168`）—— 那条在**全文件**层面禁 `orientation:`，
    //     所以**没有净漏洞**。但本条自称「宽屏块的延伸」而实际什么都没守，
    //     属于「恒真守卫守着恒真的规则」（本仓库反复记过的那一种）。
    //
    //   ⇒ 现在把对象改成**前导语**，并配一条自测证明它真能咬住。
    const prelude = landscapeMediaPrelude(responsive)
    expect(
      prelude,
      '判据范围消失：抽不出 `min-aspect-ratio` 那条媒体查询的前导语',
    ).not.toBe('')
    expect(
      prelude,
      '⚠️ 宽屏块的前导语里出现了 `orientation` —— 布局不许依赖「我知道现在是横屏」' +
        '这个在部分 WebView 上读不到的信号（裁决 13）。' +
        '⚠️ 这条在第七轮之前拿的是**块体**（不含前导语）⇒ 恒真；' +
        '真正的全局禁令在 G134。',
    ).not.toMatch(/orientation\s*:/)
  })

  it('判据自测：前导语判据分得清「带 orientation」与「不带」（R-53 —— 原判据恒真）', () => {
    // 🔥 原判据（拿块体去匹配）在下面两种输入上**都是绿的** ——
    //   这就是「恒绿」的字面意思，必须把它钉在夹具上。
    const good = '@media (min-aspect-ratio: 1/1) and (max-width: 1024px) {\n  .a { color: red; }\n}'
    const bad = '@media (orientation: landscape) and (min-aspect-ratio: 1/1) {\n  .a { color: red; }\n}'
    expect(landscapeMediaPrelude(good), '夹具自检').toBe(
      '@media (min-aspect-ratio: 1/1) and (max-width: 1024px)',
    )
    expect(landscapeMediaPrelude(bad), '夹具自检').toBe(
      '@media (orientation: landscape) and (min-aspect-ratio: 1/1)',
    )
    // 新判据：能分辨。
    expect(good).not.toMatch(/orientation\s*:/)
    expect(bad).toMatch(/orientation\s*:/)
    // 🔥 而旧判据拿到的是**块体** —— 两种输入下块体里都没有 `orientation:`，
    //   所以旧判据恒绿。这里如实复现那个恒真，不掩饰。
    expect('{ .level-view { display: grid; } }').not.toMatch(/orientation\s*:/)
    expect('{ .level-view { orientation: 1; } }').toMatch(/orientation\s*:/)
  })
})

// ── G166..G169 的共用夹具 ─────────────────────────────────────────────────

/** 宽屏块的判据：必须带 `!important`（见 G166 的头注释里那段实测）。 */
const LANDSCAPE_DISPLAY = /display:\s*grid\s*!important/

/** 宽屏块必须有的两栏列定义。 */
const LANDSCAPE_TWO_COLUMNS = /grid-template-columns:[^;]*minmax\(0,\s*1fr\)[^;]*\S+\s*;/

/**
 * 从 `responsive.css` 里抽出「视口比高更宽」那个媒体查询的**块体**（不含 `@media` 行）。
 *
 * ⚠️ 为什么要自己配平花括号而不是用正则 `[\s\S]*?\}`：后者会在块体里的
 *   第一条嵌套规则处就截断，而本块体里恰恰每条规则都有自己的花括号。
 */
/**
 * 🔥📎 **G185（`[CR]` 第七轮新增）：规则体里某个属性的「**生效值**」。**
 *
 * ⚠️ **为什么不能只问「这行字在不在」**：CSS 里**同一条规则内后面的声明赢**。
 *   在 `height: auto;` 后面再补一条 `height: calc(100% - 48px)`，
 *   `/height:\s*auto/` 照样匹配，而**生效值是后者** —— 2026-10-17 那个 P0
 *   （题卡被推出折叠线）原样复活，而 G167 原判据全绿。
 *
 * @param body 规则体（`{ … }` 内部或不含花括号的声明串）
 * @param prop 属性名（不带冒号）
 * @returns 最后一条该属性的声明值；一条都没有则返回 `null`
 */
function effectiveDecl(body: string, prop: string): string | null {
  const pattern = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g')
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = pattern.exec(body)) !== null) last = m[1].trim()
  return last
}

/**
 * 🔥📎 **G185（`[CR]` 第七轮新增）：`min-aspect-ratio` 那条媒体查询的**前导语**。**
 *
 * ⚠️ **与 {@link landscapeBlock} 的区别就是第七轮那条恒真判据的病根**：
 *   `landscapeBlock` 返回 `slice(open + 1, i)` —— **只有花括号之间的块体**，
 *   `@media (…)` 那段前导语不在其中 ⇒ 拿它去判「有没有用 `orientation` 媒体查询」
 *   **永远判不出来**（媒体查询的 `orientation:` 写在花括号**之前**）。
 *   ⇒ 这里返回 `@media` 到 `{` 之间的那一段。
 */
function landscapeMediaPrelude(responsive: string): string {
  const hit = /min-aspect-ratio/.exec(responsive)
  if (hit === null) return ''
  // ⚠️ 不能用 `/@media[^{]*min-aspect-ratio/` 的**匹配串**当前导语 ——
  //   那个正则恰好停在 `min-aspect-ratio` 四个字上，`(orientation: landscape) and (`
  //   这些**在它前面**的内容会被整段丢掉。⇒ 从 `@media` 起扫到 `{`。
  const start = responsive.lastIndexOf('@media', hit.index)
  if (start === -1) return ''
  const end = responsive.indexOf('{', hit.index)
  if (end === -1) return ''
  return responsive.slice(start, end).trim()
}

function landscapeBlock(responsive: string): string {
  const at = /@media[^{]*min-aspect-ratio/.exec(responsive)
  if (at === null) return ''
  const open = responsive.indexOf('{', at.index)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < responsive.length; i += 1) {
    const ch = responsive[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return responsive.slice(open + 1, i)
    }
  }
  return ''
}

/**
 * `responsive.css` 里**所有** `@media` 块 —— 前导语 + 块体。
 *
 * 🔥 **`[CR]` 2026-10-20 新增**（G137 / G198 用它）。
 *
 * ⚠️ **为什么要「所有」而不是只取某一条**：`landscapeBlock()` 只能拿到
 *   `min-aspect-ratio` 那一条 ⇒ 而本轮要守的恰恰是「**别的**那条不许存在」。
 *   ⇒ 必须能枚举全部媒体查询。
 * ⚠️ **前导语与块体必须分开拿**：`@media (…)` 那段写在花括号**之前**，
 *   只取块体的话「有没有按高度断点」永远判不出来（G185 踩过同一个坑）。
 *
 * @returns 每块的 `prelude`（`@media` 到 `{` 之间，含 `@media` 本身）与 `body`（花括号内部）
 */
function mediaBlocks(css: string): Array<{ prelude: string; body: string }> {
  const out: Array<{ prelude: string; body: string }> = []
  let i = 0
  for (;;) {
    const at = css.indexOf('@media', i)
    if (at === -1) break
    const open = css.indexOf('{', at)
    if (open === -1) break
    let depth = 0
    let end = -1
    for (let j = open; j < css.length; j += 1) {
      const ch = css[j]
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end === -1) break
    out.push({ prelude: css.slice(at, open).trim(), body: css.slice(open + 1, end) })
    i = end + 1
  }
  return out
}

/**
 * 取 `selector` 在 `source` 里**第一条**匹配规则的花括号内容。
 *
 * ⚠️ 复刻 `tests/helpers/contrast.ts` 的 `cssDecl` 语义：取**首次出现**。
 *   这不是偷懒 —— G133 与 G30 两条既有守卫都建立在「首次出现」上，
 *   本文件必须和它们看到同一个规则体，否则同一个文件会同时「对」和「错」。
 */
function ruleBodyFor(source: string, selector: string): string {
  const at = source.indexOf(`${selector} {`)
  if (at === -1) return ''
  const open = source.indexOf('{', at)
  const close = source.indexOf('}', open)
  if (open === -1 || close === -1) return ''
  return source.slice(open + 1, close)
}

/**
 * 找出**不是矩形**的具名区域名（CSS 逐字要求每个具名区域必须是矩形）。
 *
 * 判据 = 「格子数 ≠ 外接矩形面积」。对 `.`（空格子）不算。
 * 例：`[['hud','hud'],['overlay','quiz'],['field','hand'],['hand','quiz']]`
 *   ⇒ `hand` 在 (2,1) 与 (3,0)，外接矩形 2×2=4 而只有 2 格 ⇒ 返回 `['hand']`。
 */
function raggedAreaNames(rows: readonly string[][]): readonly string[] {
  const cells = new Map<string, { r: number; c: number }[]>()
  rows.forEach((line, r) =>
    line.forEach((name, c) => {
      if (name === '.') return
      cells.set(name, [...(cells.get(name) ?? []), { r, c }])
    }),
  )
  const bad: string[] = []
  for (const [name, points] of cells) {
    const rs = points.map((p) => p.r)
    const cs = points.map((p) => p.c)
    const box = (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...cs) - Math.min(...cs) + 1)
    if (box !== points.length) bad.push(name)
  }
  return bad
}

/**
 * 按**顶层**空白切分一条 CSS 值（括号内的空白不算分隔符）。
 *
 * ⚠️ 不能直接 `split(/\s+/)`：`minmax(0, 1fr) 25rem` 会被切成三片
 *   （`minmax(0,` / `1fr)` / `25rem`），数出来的「轨道数」是 3 而不是 2 ——
 *   而判据正是要拿它和区域图的格子数对账。
 */
function topLevelTokens(value: string): readonly string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (depth === 0 && /\s/.test(ch)) {
      if (current !== '') out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current !== '') out.push(current)
  return out
}

/**
 * `grid-template-areas` 的值拆成「每行一格」：行内格子名数组。
 *
 * ⚠️ **按引号切而不是按分号切**：CSS 语法要求**每一行各自是一个字符串**
 *   （`"hud hud" "overlay quiz"`），写成一整条不带引号是无效的。
 *   而按 `;` 切会把「四个引号包着的行」当成一行，随后
 *   `indexOf('field')` 拿到 -1 —— 症状是判据恒假。
 *   正反两例都在本函数上方的自测里带着。
 */
function gridAreaRows(areas: string): readonly string[][] {
  return [...areas.matchAll(/["']([^"']*)["']/g)]
    .map((m) => m[1].trim().split(/\s+/))
    .filter((cells) => cells.length > 0 && cells[0] !== '')
}

/**
 * 宽屏块里「**被排了版的面板**」的类名集合。
 *
 * 🔥 **这一版是改过的，第一版是个恒真判据**（登记在 story 1.19 的假绿表里）：
 *   初版返回的是 `grid-area` 的**格子名**（`field`/`hud`/`overlay`/`quiz`/`hand`），
 *   而调用方拿它去比对面板的**根节点类名**（`battle-grid`/`question-card`/…）。
 *   两套名字里恰好都有 `hud` ⇒ 面板 `.hud` 是**碰巧**通过的，
 *   而真正的四个面板全部报「没排版」。若不是先把实现写出来跑一遍，
 *   这条守卫会以「只有 4 个面板没排版」的形态一路绿到合并。
 *   ⚠️ 形态同 R-51 第 4 类：**判据粒度与被比的对象不是一回事**。
 *   ⇒ 现在返回的是**规则体里带 `grid-area` 声明的那些规则的选择器类名**，
 *     粒度才与「面板有没有被排版」对齐。
 */
function panelsWithGridArea(block: string): ReadonlySet<string> {
  const out = new Set<string>()
  // ⚠️ 注释已剥（R-52）⇒ 块里除规则体外没有花括号，`[^{}]` 是安全的分隔符。
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = rulePattern.exec(block)) !== null) {
    if (!/grid-area\s*:/.test(match[2])) continue
    for (const cls of match[1].matchAll(/\.([A-Za-z][\w-]*)/g)) out.add(cls[1])
  }
  return out
}

/**
 * 🔥📎 **G185（`[CR]` 第七轮新增）：`grid-template-areas` 里真实存在的格子名集合。**
 *
 * ⚠️ 必须取**模板里的名字**，不是「源码里出现过的名字」—— 后者会把
 *   `grid-area: nonexistent` 这种**根本不存在**的格子也算进去，
 *   判据就永远不会发现「面板指向了一个浏览器会整条忽略的名字」。
 */
function gridAreaNames(block: string): Set<string> {
  const out = new Set<string>()
  const decl = /grid-template-areas\s*:\s*([^;}]+)/.exec(block)
  if (decl === null) return out
  // 值是一串带引号的名字：`'hud hud' 'overlay quiz' …`
  for (const q of decl[1].matchAll(/'([^']*)'|"([^"]*)"/g)) {
    for (const name of (q[1] ?? q[2]).trim().split(/\s+/)) {
      if (name !== '') out.add(name)
    }
  }
  return out
}

/**
 * 🔥📎 **G185（`[CR]` 第七轮新增）：某个面板声明的 `grid-area` 到底是哪一格。**
 *
 * ⚠️ 与 {@link panelsWithGridArea} 的区别：那个返回「选择器里出现过的**全部**类名」
 *   （含祖先类名），这个只认**该面板自己的类名后面跟的那个格子名**。
 *   ⚠️ 找不到时返回 `null`（而不是空串）—— 「没排版」与「排到了一个空名字」
 *   是两件不同的事，混起来判据就永远分辨不出。
 */
function gridAreaOf(block: string, panelClass: string): string | null {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = rulePattern.exec(block)) !== null) {
    if (!/grid-area\s*:/.test(match[2])) continue
    // 选择器的**最后一个**类名才是这条规则真正作用的那个元素。
    const classes = [...match[1].matchAll(/\.([A-Za-z][\w-]*)/g)].map((c) => c[1])
    const target = classes[classes.length - 1]
    if (target !== panelClass) continue
    return /grid-area\s*:\s*([^;}]+)/.exec(match[2])?.[1].trim() ?? null
  }
  return null
}

/**
 * `<template>` 正文（去掉 `<style>` 块，避免把 CSS 当成标签）。
 *
 * 📎 **Story 3.5 已抽到 `tests/helpers/clickable-classes.ts`**（与
 *   `clickableClassNames` 放在一起，G138 与 G317 共用一份）。
 *
 * ⚠️🔥 **顺带必须剥掉 HTML 注释**（`<!-- -->`），这是 R-52 在模板侧的同一课：
 *   `stripComments` 只认 `//` 与块注释两种形态（它的文档逐字写了「故意不处理」其它），
 *   而本仓库的模板注释里**大量用反引号提到真实标签** ——
 *   `LevelView.vue` 的手牌区注释就写着「接在 `<QuestionCard />` **之后**」。
 *   ⇒ 不剥的话，扫描器会把注释里那句话当成一个真的 `<QuestionCard />` 节点，
 *   直接子元素集合多出一项，而 G168 是**按集合逐项断言**的 ——
 *   同一块面板被数两遍。
 *   剥法复刻 `stripComments` 的规矩：换成等长空白而不是删掉，保持位置不变。
 */

interface DirectChild {
  /** 小写是原生标签（`div`），首字母大写是子组件（`BattleField`）。 */
  tag: string
  /** 原生标签自带 `class` 时用它；子组件要回查它自己的模板。 */
  rootClass: string | null
}

/**
 * HTML 的**空元素**（void elements）：语法上没有结束标签。
 *
 * 📎📎 **`[CR]` 2026-10-18 加进来的 —— 首版扫描器漏了它们，漏得很贵。**
 *   `<br>` / `<img>` / `<hr>` / `<input>` 既不是自闭合（没有 `/`）也没有闭合标签，
 *   而首版的 `if (selfClosing !== '/') depth += 1` 会给它们 **`+1` 且永不回落**
 *   ⇒ `depth` 从此再也回不到 0 ⇒ 扫描器认为整个 `<main>` 都没关过
 *   ⇒ **后面新加的任何直接子元素永远不会被收集**
 *   ⇒ G168「每个直接子元素都有 `grid-area`」变成恒绿，
 *   症状正是它自己文案里写的「某个东西不见了，界面上没有任何报错」。
 * ⚠️ 与 `<Component />` 的区别：Vue 子组件**必须**写自闭合或成对，
 *   所以这条漏法只对原生 HTML 空元素成立 —— 而原生空元素恰好是最容易被顺手加进来的
 *   （插一张图、分隔线、一个输入框）。
 *
 * ⚠️ 这份清单来自 HTML 规范而不是「当前模板里出现过什么」——
 *   若按后者归纳，等于让判据跟着被测对象一起漂移（今天模板里没有 `<br>` 就永远测不到 `<br>`）。
 */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/**
 * `<main class="level-view">` 的**直接**子元素（嵌套在它们内部的标签不算）。
 *
 * ⚠️ 用扫描而不是正则，是因为正则没法区分「直接子元素」与「孙元素」，
 *   而 G168 的全部价值就在于这个区分 —— 它要抓的正是
 *   「新增了一个直接子元素却忘了排版」。
 */
function directChildrenOfLevelView(template: string): readonly DirectChild[] {
  const mainAt = /<main\b[^>]*class="[^"]*\blevel-view\b[^"]*"[^>]*>/.exec(template)
  if (mainAt === null) return []
  const body = template.slice(mainAt.index + mainAt[0].length)
  const out: DirectChild[] = []
  let depth = 0
  const tagPattern = /<(\/?)([A-Za-z][\w.-]*)((?:[^<>"]|"[^"]*")*?)(\/?)>/g
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(body)) !== null) {
    const [, closing, tag, attrs, selfClosing] = match
    if (closing === '/') {
      depth -= 1
      continue
    }
    if (depth === 0) {
      const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? null
      out.push({ tag, rootClass: cls === null ? null : cls.split(/\s+/)[0] })
    }
    // ⚠️ 只有两种「不进 depth」：自闭合 `/>`，以及原生空元素。
    //   ⚠️ **不要**按「标签名首字母大写」再豁免 Vue 子组件 —— 带 slot 的写法
    //   （`<BattleField>…</BattleField>`）是有配对结束标签的，豁免它会让 depth 提前回落。
    if (selfClosing === '/' || VOID_ELEMENTS.has(tag.toLowerCase())) continue
    depth += 1
  }
  return out
}

/** 子组件模板根元素的第一个类名（`BattleField.vue` ⇒ `battle-grid`）。 */
function rootClassOfComponent(tag: string, vueByName: ReadonlyMap<string, string>): string | null {
  const file = vueByName.get(tag)
  if (file === undefined) return null
  const template = templateOf(stripComments(file))
  const root = /<([A-Za-z][\w.-]*)\b((?:[^<>"]|"[^"]*")*?)>/.exec(template)
  if (root === null) return null
  return /class="([^"]*)"/.exec(root[2])?.[1]?.split(/\s+/)[0] ?? null
}
