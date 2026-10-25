/**
 * 竖屏布局量测工具的守卫（Story 1.19 `[DS]` 第四轮；Story 3.5 扩到**两个相位**）。
 *
 * ── 为什么这个工具需要守卫 ────────────────────────────────────────────────
 *   `scripts/verify-portrait-layout.ts` **不是 vitest 守卫**（它要一个真浏览器），
 *   但它产出的数字会被**逐字抄进 story 文档的实测表** ⇒
 *   **工具算错 ⇒ 文档里的「实测值」就是假的**。
 *   2026-10-24 实测已经踩了两次：
 *   ① **列数算成 57** —— `gridTemplateColumns` 的 computed 值里，
 *      auto-fit 折叠掉的空轨道**仍然列着**（0px）⇒ 按轨道数报列数 ⇒ 报出「57 列」，
 *      而真实渲染是 **2 列**；
 *   ② **视口矮 87px** —— `--window-size` 设的是**窗口**，含工具栏 ⇒
 *      请求 768×1024 实际量到 768×937 ⇒ 矩阵里写着「768×1024」的那一行
 *      **量的不是那个设备尺寸**。
 *
 * ── 这里守什么 ────────────────────────────────────────────────────────────
 * · **G290**：列数按**渲染位置**算，**不许**按 CSS 轨道数算。
 *   （含一条**反向自测**：把判据换成轨道数，必须红。）
 * · **G291**：视口补偿的算术 —— 差值加回 `--window-size` 后，内视口必须等于请求值。
 * · **G292**：**假浏览器端到端** —— 整条管线（矩阵解析 → 起浏览器 → 解析 → 汇总表）
 *   跑一遍，断言表里的「列数」是 **2** 而不是 **57**。
 * · **G318**（Story 3.5 新增）：**三条**新判据的纯函数
 *   （`hudBattleGapVerdict` / `overlayBattleGapVerdict` / `touchTargetViolations`）
 *   的**表驱动负向夹具**：违规输入 ⇒ 红；合规输入 ⇒ 绿；量不到 ⇒ **「量不到」**
 *   （**不是**「不合格」，也不是「通过」）。
 *
 * ── ⚠️ 假浏览器的纪律 ──────────────────────────────────────────────────────
 *   夹具吐的是**合成数据** ⇒ 它证明的是**管线与算术**，**不证明任何几何**。
 *   真实几何只能由 `npm run verify:portrait` 在真浏览器上量（Story 3.19 Task 7.3）。
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  nextChromeDelta,
  overlayBattleGapVerdict,
  parseMeasured,
  renderedColumnCount,
  summaryOf,
  touchTargetViolations,
  hudBattleGapVerdict,
  viewportMatches,
  type Measured,
  type PhaseMeasured,
  type TouchTarget,
} from '../../scripts/verify-portrait-layout'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** 一条命中区量测记录。 */
function target(over: Partial<TouchTarget> = {}): TouchTarget {
  return {
    selector: '.probe',
    present: true,
    count: 1,
    rendered: 1,
    w: 60,
    h: 60,
    sizes: { '60x60': 1 },
    note: null,
    ...over,
  }
}

/**
 * 一份**像真测量**的相位载荷：选项区是 2 张卡、2 列，
 * 而 CSS 轨道数是 **57**（800px 宽 + `repeat(auto-fit, minmax(0,1fr))` 的实测值）。
 */
function fakePhase(phase: 'answer' | 'build'): PhaseMeasured {
  const isBuild = phase === 'build'
  return {
    phase,
    level_view: { rect: null, scrollHeight: 1280, clientHeight: 1280 },
    level_view_display: 'flex',
    battle_grid: { top: 91, bottom: 566, left: 16, right: 784, w: 768, h: 475 },
    battle_ratio: 1.8,
    question_card: { top: 566, bottom: 1008, left: 16, right: 784, w: 768, h: 442 },
    question_card_fully_visible: true,
    hud: { top: 16, bottom: 59, left: 16, right: 784, w: 768, h: 43 },
    update_notice: { top: 0, bottom: 16, left: 0, right: 800, w: 800, h: 16 },
    notice_overlap_px: 0,
    // 🔥 **`[CR]` 2026-10-25**：按相位的「提示条是不是合成的」标志。
    notice_forced: false,
    containing_block: {
      level_view_left: 0,
      level_view_padding_left: '16px',
      probe_left: 0,
      on_padding_box: true,
    },
    options: {
      count: 2,
      grid_columns: '362px 362px 0px 0px',
      grid_track_count: 57,
      row_count: 1,
      distinct_lefts: [32, 406],
      box: { top: 630, bottom: 992, left: 32, right: 768, w: 736, h: 362 },
      cards: [
        { top: 630, bottom: 992, left: 32, right: 394, w: 362, h: 362 },
        { top: 630, bottom: 992, left: 406, right: 768, w: 362, h: 362 },
      ],
      all_visible: true,
      text_overflow: [],
    },
    battle_cell: { top: 91, bottom: 173, left: 16, right: 98, w: 82, h: 82 },
    cells_total: 45,
    plantable_cells: 35,
    page_h_overflow: false,
    level_view_h_overflow: false,
    // ── Story 3.5 新增的四组数据 ────────────────────────────────────────
    // 📎 合规值（48 = 阈值 ⇒ 刚好合格）；**不合格**的那一档在 G318.1 里单独构造。
    hud_battle_gap_px: 48,
    overlay_battle_gap_px: 0,
    vertical_slack_px: 1280 - 1008,
    // 📎 **清单 7 项**（与 `TOUCH_TARGET_SELECTORS` 逐项对齐）——
    //   夹具原来只列了 4 项 ⇒ 「本相不存在」那条路径**从没被走到过**。
    //
    // 🔥 **`[CR]` 2026-10-25 再修一处**：夹具原来把 `.option-card` 与
    //   `.question-card__tappable` 在**建造相**写成「本相不存在」，
    //   而**真机实测里它们在建造相仍然在屏上**（答完不卸载，只是被标成
    //   已选/已答）⇒ 真机建造相是 **6/7**，不是夹具的 4/7
    //   ⇒ 夹具比真机**乐观**（少报了两个量得到的命中区）。
    //   ⇒ 按真机实测改：建造相这两个**仍然 present**。
    touch_targets: [
      // 📎 `.start-button` 只在**开始页**存在 ⇒ 量测脚本会把它从开始页
      //   **并进**每个相位（`mergeStartTargets`）⇒ 这里的值是**并进来之后**的。
      target({
        selector: '.start-button',
        w: 220,
        h: 56,
        sizes: { '220x56': 1 },
        note: '本相不存在（已在开始页量到）',
      }),
      target({ selector: '.battle-cell', count: 45, rendered: 45, w: 60, h: 60, sizes: { '60x60': 45 } }),
      target({
        selector: '.option-card',
        count: 2,
        rendered: 2,
        w: 362,
        h: 362,
        sizes: { '362x362': 2 },
      }),
      target({
        selector: '.question-card__tappable',
        count: 1,
        rendered: 1,
        w: 700,
        h: 120,
        sizes: { '700x120': 1 },
      }),
      target({
        selector: '.hand-card',
        present: isBuild,
        count: isBuild ? 1 : 0,
        rendered: isBuild ? 1 : 0,
        w: isBuild ? 56 : null,
        h: isBuild ? 56 : null,
        sizes: isBuild ? { '56x56': 1 } : {},
        note: isBuild ? null : '本相不存在',
      }),
      target({
        selector: '.hand-deck__start',
        present: isBuild,
        count: isBuild ? 1 : 0,
        rendered: isBuild ? 1 : 0,
        w: isBuild ? 56 : null,
        h: isBuild ? 56 : null,
        sizes: isBuild ? { '56x56': 1 } : {},
        note: isBuild ? null : '本相不存在',
      }),
      target({
        selector: '.level-outcome__button',
        present: false,
        count: 0,
        rendered: 0,
        w: null,
        h: null,
        sizes: {},
        note: '本相不存在',
      }),
    ],
    // ── 建造相专属 ──────────────────────────────────────────────────────
    // 🔥 **`[CR]` 2026-10-25**：夹具原来**两个相位的手牌几何都是空的**
    //   （而 `diag.hand_deck_present` 却写着 `true` ⇒ 夹具自相矛盾）
    //   ⇒ 端到端那条守卫（G292）只能证明「管线跑通」，**证明不了建造相真的量到了东西**。
    //   ⇒ 现在建造相有**真实的手牌几何**。
    hand_deck: isBuild ? { top: 1000, bottom: 1147, left: 16, right: 784, w: 768, h: 147 } : null,
    hand_card: isBuild ? { top: 1000, bottom: 1147, left: 16, right: 784, w: 768, h: 147 } : null,
    hand_cards: isBuild
      ? [{ top: 1000, bottom: 1147, left: 16, right: 784, w: 768, h: 147 }]
      : [],
    hand_battle_intersect: isBuild ? false : null,
    hand_cards_in_viewport: isBuild ? false : null,
  }
}

/** 一份**像真测量**的整体载荷。 */
function fakeMeasured(): Measured {
  const answer = fakePhase('answer')
  const build = fakePhase('build')
  return {
    viewport: { w: 800, h: 1280 },
    tokens: { touch_min: 48 },
    diag: {
      local_storage_cleared: true,
      start_button: true,
      start_button_box: { top: 600, bottom: 656, left: 290, right: 510, w: 220, h: 56 },
      level_view: true,
      body_classes: ['DIV.(no class)'],
      app_html_length: 7575,
      first_text: '第 1 单元',
      notice_forced: true,
      notice_scope_attr: 'data-v-2bef07c1',
      picked_option: 'u1-hello',
      answer_correct: true,
      answer_wrong: false,
      hand_deck_present: true,
      build_not_reached: null,
      no_option_to_pick: false,
    },
    answer,
    build,
    // 🔥 **`[CR]` 2026-10-25（B1.3）**：**开始页**量到的命中区清单
    //   （`.start-button` 只在开始页存在 ⇒ 不单独量它就永远量不到）。
    start_touch_targets: [
      target({ selector: '.start-button', w: 220, h: 56, sizes: { '220x56': 1 } }),
    ],
  }
}

/** 取一个相位的载荷（`null` ⇒ 测试写错了，不是被测行为）。 */
function phaseOf(m: Measured, phase: 'answer' | 'build'): PhaseMeasured {
  const p = phase === 'answer' ? m.answer : m.build
  if (p === null) throw new Error(`夹具里没有 ${phase} 相的载荷`)
  return p
}

describe('G290 选项列数按渲染位置算，不按 CSS 轨道数算', () => {
  it('G290.1 两张卡两个左边位置 ⇒ 2 列', () => {
    expect(renderedColumnCount([32, 406])).toBe(2)
  })

  it('G290.2 左边位置重复时仍按去重后的个数算（防御：调用方可能传原始数组）', () => {
    expect(renderedColumnCount([32, 406, 32, 406])).toBe(2)
  })

  it('G290.3 一个选项 ⇒ 1 列；没有选项 ⇒ 0 列（不许把「量不到」报成 1 列）', () => {
    expect(renderedColumnCount([32])).toBe(1)
    expect(renderedColumnCount([])).toBe(0)
  })

  it('G290.4 汇总表里的「列数」是 2，**不是** 57（轨道数）', () => {
    const m = fakeMeasured()
    const row = summaryOf(phaseOf(m, 'answer'))
    expect(row['列数']).toBe(2)
    expect(row['列数']).not.toBe(m.answer?.options.grid_track_count)
  })

  it('G290.5 反向自测：把判据换成「按轨道数算」必须红（否则这条守卫是空的）', () => {
    const m = fakeMeasured()
    // 错误做法：按 CSS 轨道数报列数 ⇒ 报出 57
    const wrongColumnCount = m.answer?.options.grid_track_count
    expect(wrongColumnCount).toBe(57)
    expect(wrongColumnCount).not.toBe(renderedColumnCount(m.answer?.options.distinct_lefts ?? []))
    // 正确做法：按渲染位置 ⇒ 2
    expect(renderedColumnCount(m.answer?.options.distinct_lefts ?? [])).toBe(2)
  })
})

describe('G291 视口补偿的算术', () => {
  it('G291.1 请求 800×1280 量到 800×1193 ⇒ 外壳差 87px 要加回去', () => {
    const delta = nextChromeDelta({ dw: 0, dh: 0 }, { w: 800, h: 1280 }, { w: 800, h: 1193 })
    expect(delta).toEqual({ dw: 0, dh: 87 })
  })

  it('G291.2 宽度差了也要补（外壳不一定只吃高度）', () => {
    const delta = nextChromeDelta({ dw: 0, dh: 0 }, { w: 800, h: 1280 }, { w: 785, h: 1193 })
    expect(delta).toEqual({ dw: 15, dh: 87 })
  })

  it('G291.3 补偿一次之后，内视口就等于请求值（收敛）', () => {
    const requested = { w: 800, h: 1280 }
    const actual = { w: 800, h: 1193 }
    const first = nextChromeDelta({ dw: 0, dh: 0 }, requested, actual)
    // 补偿的语义：窗口变大 delta ⇒ 量到的内视口也变大 delta
    const innerAfter = { w: actual.w + first.dw, h: actual.h + first.dh }
    expect(viewportMatches(requested, innerAfter)).toBe(true)
    // 再量一次已经相等 ⇒ 不需要再补（收敛）
    const second = nextChromeDelta(first, requested, innerAfter)
    expect(second).toEqual(first)
  })

  it('G291.4 不等就算不匹配（不许「差不多就算」）', () => {
    expect(viewportMatches({ w: 800, h: 1280 }, { w: 800, h: 1193 })).toBe(false)
    expect(viewportMatches({ w: 800, h: 1280 }, { w: 800, h: 1280 })).toBe(true)
  })
})

/**
 * 写一个**假浏览器**：`--version` 报版本，其余时刻吐一份带 `<pre id="__measure">` 的 DOM。
 *
 * 🔥 **它必须回显「被请求的窗口尺寸」** —— 否则多视口矩阵那一层根本跑不起来：
 *   `scripts/verify-portrait-layout.ts` 的 `measureAt` 会做**视口补偿**
 *   （真浏览器的内视口比 `--window-size` 矮 87px 的工具栏），
 *   补完必须**收敛**（收敛不上就抛错，不许把数字安在错误的设备头上）。
 *   ⇒ 假浏览器把 `--window-size=W,H` 里的 W、H 读出来，
 *     **扣掉 87px 外壳**当作内视口 ⇒ 与真浏览器同形 ⇒ 补偿一轮就收敛。
 *
 * ⚠️ **为什么不能一直吐同一个 800×1280**（旧夹具就是这样）：
 *   那会让 L1 恰好蒙对，而 L2 每个视口都**收敛不了** ⇒ 端到端守卫**测不到**
 *   补偿这条路径（测不到 = 等于没有这条守卫，R-51 第 1 类）。
 */
function writeFakeBrowser(dir: string): string {
  const payloadPath = join(dir, 'payload.json')
  const raw = JSON.stringify(fakeMeasured())
  // 载荷里的视口换成占位符 ⇒ 假浏览器按被请求的窗口尺寸回填。
  const patched = raw.replace(
    '"viewport":{"w":800,"h":1280}',
    '"viewport":{"w":__W__,"h":__IH__}',
  )
  if (patched === raw) {
    throw new Error('夹具载荷的视口字段形状变了 ⇒ 占位符替换没生效（不许悄悄吐固定尺寸）')
  }
  writeFileSync(payloadPath, patched)

  const fakeBin = join(dir, 'fake-browser.sh')
  writeFileSync(
    fakeBin,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "fake-browser 1.0"; exit 0; fi',
      'W=800',
      'H=1280',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    --window-size=*) rest=${arg#--window-size=}; W=${rest%%,*}; H=${rest#*,} ;;',
      '  esac',
      'done',
      '# 模拟浏览器外壳（工具栏）：内视口比窗口矮 87px',
      'IH=$((H - 87))',
      'printf \'<html><body><pre id="__measure">\'',
      'sed -e "s/__W__/$W/g" -e "s/__IH__/$IH/g" "$(dirname "$0")/payload.json"',
      'printf \'</pre></body></html>\'',
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  return fakeBin
}

describe('G292 假浏览器端到端：管线跑通且列数不是轨道数', () => {
  it('G292.1 整条管线跑一遍，表里的「列数」是 2（不是 57），退出码 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plantsgame-portrait-guard-'))
    try {
      // ① 假浏览器：`--version` 报版本，其余时刻吐一份带 <pre id="__measure"> 的 DOM
      const fakeBin = writeFakeBrowser(dir)

      // ② 最小产物：脚本只要求 index.html 里有 `</body>`
      const dist = join(dir, 'dist')
      mkdirSync(dist)
      writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body></body></html>')

      const out = execFileSync(
        join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
        [join(REPO_ROOT, 'scripts', 'verify-portrait-layout.ts'), dist],
        {
          encoding: 'utf8',
          env: { ...process.env, CHROMIUM_BIN: fakeBin },
        },
      )

      // ⚠️ 判据数从 5 变 8（Story 3.5 多了三条）⇒ 这个字面量必须跟着改。
      expect(out).toContain('8/8 项通过')
      // 矩阵表里的「列数」必须是 2；57 只允许出现在原始轨道字段里
      expect(out).toContain('"列数": 2')
      expect(out).not.toContain('"列数": 57')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('G292.4 建造相的**手牌几何**必须真的被量到（夹具原来两相都空 ⇒ 这条是空的）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plantsgame-portrait-guard-'))
    try {
      const fakeBin = writeFakeBrowser(dir)
      const dist = join(dir, 'dist')
      mkdirSync(dist)
      writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body></body></html>')

      const out = execFileSync(
        join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
        [join(REPO_ROOT, 'scripts', 'verify-portrait-layout.ts'), dist],
        { encoding: 'utf8', env: { ...process.env, CHROMIUM_BIN: fakeBin } },
      )
      // 🔥 建造相的列必须**有值** ⇒ 证明「建造相真的量到了东西」，
      //   而不只是「管线跑完了」（夹具原来两相的手牌几何都是空的）。
      expect(out).toContain('"手牌区": "768×147"')
      expect(out).toContain('"手牌卡在视口内": false')
      // 📎 命中区覆盖率：答题相 4/7、建造相 6/7（`.start-button` 从开始页并进来）
      expect(out).toContain('"命中区覆盖": "4/7"')
      expect(out).toContain('"命中区覆盖": "6/7"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('G292.2 载荷里没有 <pre id="__measure"> 时必须报错，不许静默当绿', () => {
    expect(() => parseMeasured('<html><body>白屏</body></html>')).toThrow(/__measure/)
  })

  it('G292.3 载荷是**旧版形状**（字段平铺、没有 answer/build）时必须报错', () => {
    const legacy = '<html><body><pre id="__measure">{"viewport":{"w":800,"h":1280}}</pre></body></html>'
    expect(() => parseMeasured(legacy)).toThrow(/answer/)
  })
})

/* ── G318：三条新判据的纯函数（Story 3.5 / B5）───────────────────────────────
 * 📎 **表驱动负向夹具**（R-50 降级后的默认动作）：
 *   违规输入 ⇒ 红；合规输入 ⇒ 绿；量不到 ⇒ **「量不到」**（既不是红也不是绿）。
 * 📎 ⚠️ **反向自测必须调用判据本体**（R-51 第 9 条）⇒ 这里每一行都直接调
 *   `hudBattleGapVerdict` / `overlayBattleGapVerdict` / `touchTargetViolations`。
 */
describe('G318 —— 三条新判据的纯函数', () => {
  describe('B2.1 HUD↔战场间距（竖屏专属）', () => {
    it('G318.1 竖屏 + 间距 32px（低于 48）⇒ 不合格', () => {
      const p = fakePhase('answer')
      p.hud_battle_gap_px = 32
      const j = hudBattleGapVerdict(p, 48, true)
      expect(j.status).toBe('fail')
      expect(j.value).toBe(32)
    })

    it('G318.2 竖屏 + 间距 48px（等于阈值）⇒ 合格（「≥」而不是「>」）', () => {
      const p = fakePhase('answer')
      p.hud_battle_gap_px = 48
      expect(hudBattleGapVerdict(p, 48, true).status).toBe('pass')
    })

    it('G318.3 横屏 ⇒ **不适用**（不是「通过」，也不是「不合格」）', () => {
      const p = fakePhase('answer')
      p.hud_battle_gap_px = 10
      const j = hudBattleGapVerdict(p, 48, false)
      expect(j.status).toBe('not-applicable')
      expect(j.status).not.toBe('pass')
      expect(j.status).not.toBe('fail')
    })

    it('G318.4 量不到盒子 ⇒ **量不到**（不是「不合格」）', () => {
      const p = fakePhase('answer')
      p.hud_battle_gap_px = null
      expect(hudBattleGapVerdict(p, 48, true).status).toBe('not-measured')
    })
  })

  describe('B2.2 浮层↔战场（与姿态无关）', () => {
    it('G318.5 间距 0（结构保证的常态）⇒ 合格', () => {
      const p = fakePhase('answer')
      p.overlay_battle_gap_px = 0
      expect(overlayBattleGapVerdict(p).status).toBe('pass')
    })

    it('G318.6 间距为负（浮层压住战场）⇒ 不合格', () => {
      const p = fakePhase('answer')
      p.overlay_battle_gap_px = -3
      const j = overlayBattleGapVerdict(p)
      expect(j.status).toBe('fail')
      expect(j.value).toBe(-3)
    })

    it('G318.7 量不到浮层 ⇒ **量不到**', () => {
      const p = fakePhase('answer')
      p.overlay_battle_gap_px = null
      expect(overlayBattleGapVerdict(p).status).toBe('not-measured')
    })
  })

  describe('B2.3 命中区（与姿态无关）', () => {
    it('G318.8 全部量到的元素都 ≥ 阈值 ⇒ 合格，且**覆盖率要报出来**', () => {
      const p = fakePhase('answer')
      const j = touchTargetViolations(p, 48)
      expect(j.status).toBe('pass')
      // 最小的那一个 = `.start-button` 的 56px（min(220, 56)）
      expect(j.value).toBe(56)
      // 📎 清单 7 项里答题相量到 4 项（其余三项「本相不存在」）
      expect(j.detail?.['coverage']).toBe('4/7')
    })

    it('G318.9 有一个元素只有 30×30 ⇒ 不合格，且**要点名是哪一个**', () => {
      const p = fakePhase('answer')
      p.touch_targets = [
        target({ selector: '.battle-cell', count: 45, rendered: 45, w: 30, h: 30 }),
      ]
      const j = touchTargetViolations(p, 48)
      expect(j.status).toBe('fail')
      expect(j.why).toContain('.battle-cell')
    })

    it('G318.10 本相不存在的选择器 ⇒ **不算合格也不算不合格**，但**必须被点名**', () => {
      const p = fakePhase('answer')
      p.touch_targets = [
        target({ selector: '.battle-cell' }),
        target({ selector: '.hand-card', present: false, count: 0, rendered: 0, w: null, h: null, note: '本相不存在' }),
      ]
      const j = touchTargetViolations(p, 48)
      expect(j.status).toBe('pass')
      expect(j.detail?.['coverage']).toBe('1/2')
      expect(j.why).toContain('.hand-card')
      expect(j.why).toContain('本相不存在')
    })

    it('G318.11 一个都量不到 ⇒ **量不到**（不许静默当过）', () => {
      const p = fakePhase('answer')
      p.touch_targets = [
        target({ selector: '.hand-card', present: false, count: 0, rendered: 0, w: null, h: null }),
      ]
      expect(touchTargetViolations(p, 48).status).toBe('not-measured')
    })

    it('G318.12 匹配到但**没有渲染尺寸**的元素不算「量到了」', () => {
      const p = fakePhase('answer')
      p.touch_targets = [
        target({ selector: '.battle-cell', count: 45, rendered: 0, w: null, h: null, note: '匹配到但都没有渲染尺寸（隐藏？）' }),
      ]
      const j = touchTargetViolations(p, 48)
      expect(j.status).toBe('not-measured')
      expect(j.detail?.['coverage']).toBe('0/1')
    })
  })
})
