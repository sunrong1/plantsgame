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
