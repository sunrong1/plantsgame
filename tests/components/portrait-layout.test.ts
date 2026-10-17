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

/** `src/` 下所有 `.vue` 文件。 */
/**
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

  it('断点里用了 dvh / dvw 视口单位与 env(safe-area-inset-*)', () => {
    expect(
      responsive,
      '断点里没有 dvh —— 移动端浏览器的地址栏会让 vh 失真，' +
        '而目标形态是竖屏平板（浏览器 UI 常驻与否都可能出现）',
    ).toMatch(/\d*d?vh/)
    expect(
      responsive,
      '断点里没有 env(safe-area-inset-*) —— 横屏或窄屏时刘海与手势条会吃掉边距，' +
        '而 `index.html` 早已有 `viewport-fit=cover` 让它们生效',
    ).toMatch(/env\(safe-area-inset-/)
  })

  it('反向自测：`@media (max-height: 800px)` 会被上面三条命中（证明判据没写坏）', () => {
    const probe = '@media (max-height: 800px) { .level-view { height: 100dvh; padding-bottom: env(safe-area-inset-bottom, 0px); } }'
    const queries = probe.match(/@media[^{]+/g) ?? []
    expect(queries.join('\n'), '探针没被抽出 ⇒ G134 那条 `not.toMatch` 是恒真的').not.toMatch(/orientation\s*:/)
    expect(probe, '探针里没有 dvh ⇒ 判据与实现对不上').toMatch(/\d*d?vh/)
    expect(probe, '探针里没有 safe-area ⇒ 判据与实现对不上').toMatch(/env\(safe-area-inset-/)
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

// ── G137 —— HUD 变高时的页面滚动处置（AC-D6）──────────────────────────────

describe('G137 —— HUD 变高不会把战场推出视口（Story 1.18 / AC-D6）', () => {
  const responsive = sourceOf('src/styles/responsive.css')

  it('`.level-view` 仍保留 min-height: 100dvh（不是 height —— 1.10 的纪律）', () => {
    expect(
      levelViewSource,
      '`.level-view` 上的 min-height: 100dvh 没了 —— 改用 height 会让浮层的 inset: 0 ' +
        '在内容超高时盖不满战场，而战场在终态下必须**仍然渲染**（AC-D2）',
    ).toMatch(/min-height:\s*100dvh/)
  })

  it('矮视口断点里 `.level-view` 有确定高度 + 可滚动的处置', () => {
    // ⚠️ D6 的原话是「HUD 变高时页面会滚动、战场可能被推出视口」。
    //   「可滚动」不是病 —— **战场被推出视口**才是。判定因此是两条一起看：
    //   ① 有 `height: 100dvh`（在矮视口下把战场锁进一屏内）；
    //   ② 仍有 `overflow-y: auto` 兜底（内容实在装不下时可滚，而不是被裁掉看不见）。
    expect(
      responsive,
      '矮视口断点里没有给 .level-view 确定高度 —— 战场高度由宽度（aspect-ratio）推出，' +
        '横向铺满时它在横屏上必然超出视口，底部几行（含僵尸行走那一行）被推出屏幕',
    ).toMatch(/height:\s*100dvh/)
    expect(
      responsive,
      '矮视口断点里没有 overflow-y: auto —— 高度锁死后若内容仍装不下，' +
        '底部会被直接裁掉，孩子连「还有内容」这件事都看不到',
    ).toMatch(/overflow-y:\s*auto/)
  })

  it('矮视口下战场改由高度定宽（否则锁高之后格子会被压成扁矩形）', () => {
    // 🔥 这是 D6 那条处置的**核心**，也是最容易漏的一步：
    //   `.battle-grid` 的高度本来是由宽度经 `aspect-ratio: 9/5` 推出来的。
    //   一旦在矮视口下给它一个确定高度，若不同步把宽度改成由高度推出，
    //   格子就会不再是正方形 —— 塔与僵尸是扁平矢量，会被整幅拉伸。
    expect(
      responsive,
      '矮视口断点里没有把 .battle-grid 的宽度改成由高度推出（width: auto + aspect-ratio）—— ' +
        '只锁高度不改宽度的话，格子变成扁矩形，塔与僵尸被拉伸变形（AC-D4 的同一条纪律）',
    ).toMatch(/width:\s*auto/)
    expect(
      responsive,
      '矮视口断点里没有居中（margin-inline: auto）—— 战场变窄后靠左会与页面右侧的空隙不匀，' +
        '而 4–8 岁孩子是靠「对称」判断画面是否正常的',
    ).toMatch(/margin-inline:\s*auto/)
  })

  it('反向自测：一条「只锁高不改宽」的写法会被上面两条抓住（证明判据有牙齿）', () => {
    const bad = '@media (max-height: 960px) { .level-view { height: 100dvh; overflow-y: auto; } }'
    expect(bad, '探针里没有 width: auto —— 判据与要防的形态对不上').not.toMatch(/width:\s*auto/)
    expect(bad, '探针里没有 margin-inline: auto —— 同上').not.toMatch(/margin-inline:\s*auto/)
    expect(bad, '探针里有 height: 100dvh —— 说明上面两条的正则不是恒假').toMatch(/height:\s*100dvh/)
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
   * 返回值：违规的 `选择器 声明项` 列表；空数组 = 全部合规。
   */
  function riskyClickRules(source: string): readonly string[] {
    // ⚠️ 解构**只取 body**：selector 在下面拼返回值时才用，
    //   在 filter 里解构出来却不用会让 `no-unused-vars` 报红。
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => {
        if (!/cursor:\s*pointer/.test(body)) return false
        const declared = [...body.matchAll(/min-(height|width)\s*:\s*([^;]+)/g)]
        // 声明了就逐项判值 —— 每一项都得自己引用 token。
        if (declared.length > 0) {
          return declared.some(([, , value]) => !/var\(--touch-min/.test(value))
        }
        // 两项都没写 ⇒ 必须是「尺寸由子元素撑出来」的容器。
        return !(/display:\s*flex/.test(body) && /flex-direction:\s*column/.test(body))
      })
      .map(([selector, body]) => {
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

      const risky = riskyClickRules(source)
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

// ── G140 —— 本 story 的布局判据不许用 jsdom 假绿（AC-D7）─────────────────

describe('G140 —— 布局判据不读 jsdom 的假布局（Story 1.18 / AC-D7）', () => {
  it('本文件与新增的样式守卫里零 getComputedStyle / offsetWidth / getBoundingClientRect', () => {
    // 🔥 AC-D7 逐字：jsdom 不做布局，这三个 API 在 jsdom 里返回 0 或声明值，
    //   拿它们断言「间距达标」等于断言「0 ≥ 0」—— **恒绿，且看起来很严谨**。
    //   Story 1.17 已实测证明过这条路径。
    const offenders: string[] = []
    for (const file of [
      'tests/components/portrait-layout.test.ts',
      'tests/scaffold/pwa-sw-guard.test.ts',
      'tests/services/sw-registration.test.ts',
    ]) {
      const source = sourceOf(file)
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
    expect(
      fieldRow?.indexOf('field'),
      '战场（field）与题面（quiz）落在了同一列 —— 那样它们仍会上下堆叠，' +
        '横屏下一个字都没多出来。战场必须在左栏、题面在右栏',
    ).not.toBe(quizRow?.indexOf('quiz'))
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

  it('战场那一格的高度归零 —— 缺它就被上一条媒体查询的高度预算压住', () => {
    // ⚠️ 同文件里还有 `@media (max-height: 900px)` 的
    //   `.level-view .battle-grid { height: calc(100% - var(--touch-min) - …) }`。
    //   宽屏（1280×800）**同时命中两条**，两条特异度相同、靠后者胜出。
    //   ⇒ 宽屏块必须显式把 `height` 归零，否则战场会被那条「把整个视口都算给它」
    //   的规则重新撑大——**也就是今天这个 bug 原样复活**。
    expect(
      rule,
      '宽屏块里 `.battle-grid` 没有 `height: auto` —— 它会被 @media (max-height: 900px) ' +
        '那条 `height: calc(100% - …)` 接管（横屏同时命中两条，同特异度靠后者胜），' +
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

  it('宽屏块自身不引入 `orientation` 媒体查询（裁决 13 / G134 的延伸）', () => {
    const block = landscapeBlock(responsive)
    expect(
      block,
      '宽屏块里出现了 `orientation` —— 布局不许依赖「我知道现在是横屏」这个' +
        '在部分 WebView 上读不到的信号（裁决 13）',
    ).not.toMatch(/orientation\s*:/)
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
 * `<template>` 正文（去掉 `<style>` 块，避免把 CSS 当成标签）。
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
function templateOf(source: string): string {
  const open = source.indexOf('<template>')
  const close = source.lastIndexOf('</template>')
  if (open === -1 || close === -1) return ''
  return source
    .slice(open + '<template>'.length, close)
    .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, ' '))
}

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
