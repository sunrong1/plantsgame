/**
 * 竖屏布局量测工具的守卫（Story 1.19 `[DS]` 第四轮）。
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
 *
 * ── ⚠️ 假浏览器的纪律 ──────────────────────────────────────────────────────
 *   夹具吐的是**合成数据** ⇒ 它证明的是**管线与算术**，**不证明任何几何**。
 *   真实几何只能由 `npm run verify:portrait` 在真浏览器上量（Story 1.19 Task 7.3）。
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  nextChromeDelta,
  parseMeasured,
  renderedColumnCount,
  summaryOf,
  viewportMatches,
  type Measured,
} from '../../scripts/verify-portrait-layout'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * 一份**像真测量**的载荷：选项区是 2 张卡、2 列，
 * 而 CSS 轨道数是 **57**（800px 宽 + `repeat(auto-fit, minmax(0,1fr))` 的实测值）。
 */
function fakeMeasured(): Measured {
  return {
    viewport: { w: 800, h: 1280 },
    diag: {
      start_button: false,
      level_view: true,
      body_classes: ['DIV.(no class)'],
      app_html_length: 7575,
      first_text: '第 1 单元',
      notice_forced: true,
      notice_scope_attr: 'data-v-2bef07c1',
    },
    level_view: { rect: null, scrollHeight: 1280, clientHeight: 1280 },
    level_view_display: 'flex',
    battle_grid: { top: 91, bottom: 566, left: 16, right: 784, w: 768, h: 475 },
    battle_ratio: 1.618,
    question_card: { top: 566, bottom: 1008, left: 16, right: 784, w: 768, h: 442 },
    question_card_fully_visible: true,
    hud: { top: 16, bottom: 59, left: 16, right: 784, w: 768, h: 43 },
    update_notice: { top: 0, bottom: 16, left: 0, right: 800, w: 800, h: 16 },
    notice_overlap_px: 0,
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
  }
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
    const row = summaryOf(m)
    expect(row['列数']).toBe(2)
    expect(row['列数']).not.toBe(m.options.grid_track_count)
  })

  it('G290.5 反向自测：把判据换成「按轨道数算」必须红（否则这条守卫是空的）', () => {
    const m = fakeMeasured()
    // 错误做法：按 CSS 轨道数报列数 ⇒ 报出 57
    const wrongColumnCount = m.options.grid_track_count
    expect(wrongColumnCount).toBe(57)
    expect(wrongColumnCount).not.toBe(renderedColumnCount(m.options.distinct_lefts))
    // 正确做法：按渲染位置 ⇒ 2
    expect(renderedColumnCount(m.options.distinct_lefts)).toBe(2)
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

describe('G292 假浏览器端到端：管线跑通且列数不是轨道数', () => {
  it('G292.1 整条管线跑一遍，表里的「列数」是 2（不是 57），退出码 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plantsgame-portrait-guard-'))
    try {
      // ① 假浏览器：`--version` 报版本，其余时刻吐一份带 <pre id="__measure"> 的 DOM
      const fakeBin = join(dir, 'fake-browser.sh')
      writeFileSync(
        fakeBin,
        [
          '#!/bin/sh',
          'if [ "$1" = "--version" ]; then echo "fake-browser 1.0"; exit 0; fi',
          `cat <<'EOF'`,
          `<html><body><pre id="__measure">${JSON.stringify(fakeMeasured())}</pre></body></html>`,
          `EOF`,
          '',
        ].join('\n'),
        { mode: 0o755 },
      )

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

      expect(out).toContain('5/5 项通过')
      // 矩阵表里的「列数」必须是 2；57 只允许出现在原始轨道字段里
      expect(out).toContain('"列数": 2')
      expect(out).not.toContain('"列数": 57')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('G292.2 载荷里没有 <pre id="__measure"> 时必须报错，不许静默当绿', () => {
    expect(() => parseMeasured('<html><body>白屏</body></html>')).toThrow(/__measure/)
  })
})
