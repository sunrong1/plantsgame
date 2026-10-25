/**
 * 🔥 **竖屏布局的真机量测**（Story 1.18 / AC-D7 的**盲区补上**；Story 3.5 扩到**两个相位**）
 *
 * ── 为什么这个脚本存在（AC-D7 逐字）──────────────────────────────────────
 *   「jsdom **不做布局**」⇒ `getComputedStyle` / `getBoundingClientRect`
 *   在 vitest 里返回 0 或声明值，拿它们断言「间距达标」等于断言「0 ≥ 0」——
 *   **恒绿，且看起来很严谨**。守卫 **G140** 因此逐字禁止 `tests/` 下出现这三个 API。
 *
 *   ⇒ 那条禁令的**另一半**是：「布局判据只能是**源码级**或**真机级**」。
 *     源码级判据（`tests/components/portrait-layout.test.ts`）守得住「写法」，
 *     **守不住「写出来的东西在浏览器里到底长什么样」** ——
 *     本 story 删掉 `@media (max-height: 900px)` 那个 P0 靠的就是这一层。
 *   ⇒ 这个脚本就是那一层：**真跑产物 + 真浏览器 + 取真实 `getBoundingClientRect()`**。
 *
 * ── ⚠️ 它**不是** vitest 守卫，也**不在** `npm run test` 里 ─────────────────
 *   ① 它要一个**真的 chromium**；CI 与别人的机器上不一定有。
 *   ② 按 **R-51 第 1 类**：一个「跑不起来就当绿」的守卫比没有守卫更坏 ——
 *      本脚本在**找不到浏览器时以退出码 2 结束**（既不是 0 也不是 1），
 *      并逐字说明「跳过」，**绝不**打印「通过」。
 *   ③ 它量的是 `dist/`，所以必须先 `npm run build`。
 *
 * ── R-61：本脚本**零 `src/` 依赖** ──────────────────────────────────────────
 *   判据只来自产物的字面内容与浏览器量到的盒子，**不 import 任何游戏代码**
 *   （与 `verify-deploy.ts` 同款纪律）。
 *
 * ── 📎 多视口量测矩阵（Story 1.19 第二轮 / Story 3.5 扩面）────────────────────
 *   `scripts/measure-viewports.txt` 里逐个列出的视口会在那 8 条判据跑完之后
 *   **各量一遍**，并打成一张表（选项数 / 列数 / 行数 / 题卡 / 战场 / 格子 /
 *   可建格 / 横向溢出 / 内部滚动 / 文字溢出 / **HUD↔战场间距 / 浮层↔战场间距 /
 *   垂直余量 / 命中区**）。
 *   ⚠️ **矩阵里的视口只量不判** —— 退出码只由 800×1280 那 8 条决定。
 *   ⚠️ 量到的**选项数**随内容变（Story 2.4 之后单词卡是 2 个选项）⇒
 *     「选项仍 4 列」这类旧基线必须重量，别拿旧文档的字面量当现状。
 *
 * ── 🔥 Story 3.5 的结构改动：**两层判据模型** ───────────────────────────────
 *   · **L1（退出码层）**：**只有主判据视口 `800×1280`** 跑判据
 *     ⇒ 既有 5 条 + 新增 3 条 = **8 条** ⇒ 任何一条不过 ⇒ 退出码非 0。
 *   · **L2（逐视口层）**：矩阵里**每个**视口都**求值**那 3 条新判据，
 *     结论（✔ / ✘ / 不适用 / 量不到 + 数值）打进表里，**不影响退出码**。
 *     📎 **为什么 L2 不进门**：竖屏垂直方向**没有弹性**，而目标设备形状
 *     **768×1024** 在**建造相位**的余量是未知数 ⇒ 现在就把它变成门，
 *     很可能造出一个**长期红着、且 Dev 不许调低判据**的假红（R-57）。
 *     ⇒ **「不进门 ≠ 不报」**：L2 的 ✘ 会逐条打印，并要求写进 story 文档。
 *
 * ── 🔥 Story 3.5 的另一个结构改动：**两个相位** ─────────────────────────────
 *   手牌区（`.hand-deck`）用 `v-if` **整块不渲染**，只在**建造相位**存在
 *   ⇒ 旧版脚本「进关即量」量到的**永远是答题相位** ⇒
 *   **手牌区从头到尾没被量过** ⇒ DF-087（「战场盖住手牌行」）**从未被观测过**。
 *   ⇒ 现在**同一次浏览器会话**里量两遍，两遍都带 `phase` 标记。
 *
 * 用法：`npm run build && npm run verify:portrait [-- dist]`
 */

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 🔥 **部署前缀从 `vite.config.ts` 导入**，不手抄 ——
//   同一份字面量抄两遍就是 AC-B3 那个事故的配方（手抄的那份没人守）。
//   R-61 只禁 `src/` 依赖，配置文件不在其列（与 `verify-deploy.ts` 同款做法）。
import { DEPLOY_BASE } from '../vite.config'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/* ── 命中区清单（Story 3.5 / B3）─────────────────────────────────────────────
 * ⚠️ **不许「靠 computed `cursor: pointer` 自动发现」** ——
 *   `.battle-cell` 是**裸 `<div>``，**没有** `cursor: pointer`
 *   ⇒ 靠 cursor 发现会**漏掉整片战场**（45 格）。
 * ⇒ 这份清单是**显式**的，并由守卫 **G317** 从源码反查钉住（不许漂移）。
 *
 * 📎 跨相位：清单里的元素在「答题相」根本不在 DOM 里
 *   （`HandDeck.vue` 用 `v-if` 整块不渲染）⇒ 量测输出里每个选择器都带
 *   `present` 字段，`count === 0` 记「本相不存在」并计入覆盖率（R-51 第 11 条）。
 */
export const TOUCH_TARGET_SELECTORS = [
  '.start-button',
  '.battle-cell',
  '.option-card',
  '.question-card__tappable',
  '.hand-card',
  '.hand-deck__start',
  '.level-outcome__button',
] as const

/**
 * **豁免清单**：源码里带 `@click` / `@pointerdown` / `@pointerup`、
 * 但**不是**命中区目标的 class ⇒ 每条必须写明理由（守卫 G317 逐条查）。
 *
 * ⚠️ 这不是「白名单」而是**带理由的登记** —— 理由写不出来的人应该把它加进
 *   `TOUCH_TARGET_SELECTORS`，而不是往这里塞一条空理由。
 */
export const TOUCH_TARGET_EXEMPTIONS: readonly { readonly className: string; readonly reason: string }[] = [
  {
    className: 'touch-target',
    reason: '工具类，与 `.start-button` 落在**同一个元素**上（StartView 的开始按钮同时带 `touch-target`）',
  },
  {
    className: 'battle-grid',
    reason: '战场容器，`@click.self` 只在「点空白处」时清选择 ⇒ 它是背景，不是命中区目标',
  },
  {
    className: 'hand-deck__rail',
    reason: '手牌区的横向滚动容器（滚动条），不是命中区目标',
  },
  {
    className: 'debug-panel__button',
    reason: '调试面板按钮，不在孩子的游玩路径上（DebugPanel 只在调试模式下出现）',
  },
]

/* ── 量测脚本：注入到产物 `index.html` 末尾，在**页面里**执行 ───────────────
 * ⚠️ 它必须**自己**完成「点开始游戏 → 进关 → 量答题相 → 点选项卡 → 量建造相」
 *   这一整串，因为浏览器命令行没有「等某个状态」的机制（本仓库不引 CDP 依赖）。
 * ⚠️ 所有量测都走**真实布局 API** —— 这正是 vitest 里被禁的那三个（AC-D7）。
 */
const MEASURE_SCRIPT = `
;(function () {
  var TOUCH_SELECTORS = ${JSON.stringify(TOUCH_TARGET_SELECTORS)}
  var ANSWER_SETTLE_MS = 1500
  var BUILD_SETTLE_MS = 900
  var out = { viewport: null, tokens: {}, diag: {}, answer: null, build: null }

  function box(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom),
             left: Math.round(r.left), right: Math.round(r.right),
             w: Math.round(r.width), h: Math.round(r.height) }
  }
  function q(sel) { return document.querySelector(sel) }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }

  // ⚠️ \`--touch-min\` **在页面里量**（R-56 / B4）——
  //   本脚本零 \`src/\` 依赖 ⇒ **不许** readFileSync('src/styles/tokens.css')。
  function touchMinPx() {
    var raw = window.getComputedStyle(document.documentElement).getPropertyValue('--touch-min')
    var m = /(-?\\d+(?:\\.\\d+)?)px/.exec(raw || '')
    return m ? Number(m[1]) : null
  }

  // 📎 **命中区清单的逐项量测**（B1.3）
  //   \`present\` = 该选择器在本相**存在**；\`rendered\` = 匹配到且**有渲染尺寸**的个数。
  //   ⚠️ \`count === 0\` 必须显式处理（不许静默当过）⇒ 记「本相不存在」并计入覆盖率。
  function touchTargets() {
    var list = []
    for (var i = 0; i < TOUCH_SELECTORS.length; i++) {
      var sel = TOUCH_SELECTORS[i]
      var els = qa(sel)
      if (els.length === 0) {
        list.push({ selector: sel, present: false, count: 0, rendered: 0,
                    w: null, h: null, sizes: {}, note: '本相不存在' })
        continue
      }
      var minW = null, minH = null, rendered = 0, sizes = {}
      for (var j = 0; j < els.length; j++) {
        var r = els[j].getBoundingClientRect()
        var w = Math.round(r.width), h = Math.round(r.height)
        if (w > 0 && h > 0) {
          rendered += 1
          if (minW === null || w < minW) minW = w
          if (minH === null || h < minH) minH = h
        }
        var key = w + 'x' + h
        sizes[key] = (sizes[key] || 0) + 1
      }
      list.push({ selector: sel, present: true, count: els.length, rendered: rendered,
                  w: minW, h: minH, sizes: sizes,
                  note: rendered === 0 ? '匹配到但都没有渲染尺寸（隐藏？）' : null })
    }
    return list
  }

  // 📎 \`.level-view\` 的**内容底边**（B1.4 的垂直余量）
  //   ⇒ 取**常规流**子元素的最大底边（绝对定位的浮层不算内容高度）。
  function contentBottom(view) {
    if (!view) return null
    var bottom = null
    var kids = view.children
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i]
      var cs = window.getComputedStyle(el)
      if (cs.position === 'absolute' || cs.position === 'fixed') continue
      var r = el.getBoundingClientRect()
      if (r.height <= 0) continue
      if (bottom === null || r.bottom > bottom) bottom = r.bottom
    }
    return bottom
  }

  // 📎 两个盒子**是否相交**（B8.4 / E3.2）
  //   ⚠️ 几何定义：矩形相交 = **两个轴上都有正交叠**（只在一个轴上交叠不算重叠）。
  //   ⚠️ **不是**「手牌区底边 > 战场顶边」这种单向比较（战场在手牌区上方时，
  //     那个不等式恒成立 ⇒ 会误报）。
  function intersects(a, b) {
    if (!a || !b) return null
    var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    var oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return ox > 0 && oy > 0
  }

  function measurePhase(phase) {
    var p = { phase: phase }
    var view = q('.level-view')
    var grid = q('.battle-grid')
    var card = q('.question-card')
    var hud = q('.hud')
    var overlay = q('.pronunciation-overlay')
    var notice = q('.update-notice')

    // ⚠️ 提示条**只在 \`preparing\` 状态下存在**，而首次加载时它可能已经退场
    //   ⇒ 量不到不等于「不重叠」。这里**合成一条**并**带上组件真实的 scoped 属性**
    //   ⇒ 结果里逐字标出 \`forced: true\`，**不假装**这是运行时的真实状态。
    if (!notice) {
      var scope = null
      for (var i = 0; i < document.styleSheets.length && !scope; i++) {
        var rules
        try { rules = document.styleSheets[i].cssRules } catch (e) { continue }
        for (var j = 0; j < rules.length; j++) {
          var m = /\\.update-notice\\[data-v-([0-9a-f]+)\\]/.exec(rules[j].cssText || '')
          if (m) { scope = 'data-v-' + m[1]; break }
        }
      }
      if (!scope) { out.diag.notice_scope_attr = null }
      else {
        var forced = document.createElement('p')
        forced.className = 'update-notice'
        forced.setAttribute(scope, '')
        forced.textContent = '正在准备离线，下次启动生效'
        document.body.appendChild(forced)
        notice = forced
        out.diag.notice_forced = true
        out.diag.notice_scope_attr = scope
      }
    } else {
      out.diag.notice_forced = false
    }

    p.level_view = view
      ? { rect: box(view), scrollHeight: view.scrollHeight, clientHeight: view.clientHeight }
      : null
    p.level_view_display = view ? window.getComputedStyle(view).display : null
    p.battle_grid = box(grid)
    if (grid) {
      var gr = grid.getBoundingClientRect()
      p.battle_ratio = gr.height > 0 ? +(gr.width / gr.height).toFixed(3) : null
    } else {
      p.battle_ratio = null
    }
    p.question_card = box(card)
    p.question_card_fully_visible = !!(card &&
      card.getBoundingClientRect().bottom <= window.innerHeight &&
      card.getBoundingClientRect().top >= 0)
    p.hud = box(hud)
    p.update_notice = box(notice)

    var optsEl = q('.question-card__options')
    var opts = qa('.question-card__options .option-card')
    var colsCss = optsEl ? window.getComputedStyle(optsEl).gridTemplateColumns : null
    var optTops = [], optLefts = []
    for (var oi = 0; oi < opts.length; oi++) {
      var obr = opts[oi].getBoundingClientRect()
      optTops.push(Math.round(obr.top))
      optLefts.push(Math.round(obr.left))
    }
    function uniq(arr) {
      var seen = [], res = []
      for (var ui = 0; ui < arr.length; ui++) {
        if (seen.indexOf(arr[ui]) < 0) { seen.push(arr[ui]); res.push(arr[ui]) }
      }
      return res
    }
    p.options = {
      count: opts.length,
      // ⚠️ computed 的 \`gridTemplateColumns\` 给的是**用掉的**轨道值 ⇒ **轨道数 ≠ 渲染列数**
      //   （auto-fit 把空轨道折叠成 0px，但那些 0px 轨道仍然列着）⇒ 列数由 TS 侧推导。
      grid_columns: colsCss,
      grid_track_count: colsCss ? colsCss.split(' ').filter(Boolean).length : 0,
      row_count: uniq(optTops).length,
      distinct_lefts: uniq(optLefts),
      box: box(optsEl),
      cards: opts.map(box),
      all_visible: opts.every(function (el) {
        var r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight &&
               r.left >= 0 && r.right <= window.innerWidth
      }),
      text_overflow: qa('.question-card__options .option-card__text').map(function (t) {
        return {
          text: (t.textContent || '').slice(0, 40),
          scrollWidth: t.scrollWidth,
          clientWidth: t.clientWidth,
          overflow: t.scrollWidth > t.clientWidth
        }
      }).filter(function (x) { return x.overflow })
    }

    var cellsAll = qa('.battle-cell')
    p.battle_cell = cellsAll.length ? box(cellsAll[0]) : null
    p.cells_total = cellsAll.length
    p.plantable_cells = qa('.battle-cell:not(.is-house):not(.is-spawn)').length

    p.page_h_overflow = document.documentElement.scrollWidth > window.innerWidth
    p.level_view_h_overflow = view ? view.scrollWidth > view.clientWidth : null

    p.notice_overlap_px = (notice && hud)
      ? Math.round(notice.getBoundingClientRect().bottom - hud.getBoundingClientRect().top)
      : null

    // ⚠️ **包含块判定**：\`position:absolute; inset:0\` 的子元素落在 padding box 还是 content box？
    if (view) {
      var probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      view.appendChild(probe)
      var pr = probe.getBoundingClientRect(), vr = view.getBoundingClientRect()
      p.containing_block = {
        level_view_left: Math.round(vr.left),
        level_view_padding_left: window.getComputedStyle(view).paddingLeft,
        probe_left: Math.round(pr.left),
        on_padding_box: Math.round(pr.left) === Math.round(vr.left)
      }
      view.removeChild(probe)
    } else {
      p.containing_block = null
    }

    // ── Story 3.5 新增的四组数据（B1.1 – B1.4）─────────────────────────────
    // 📎 间距口径 = **上边界的下沿减下边界的上沿** ⇒ 负值 = 重叠。
    p.hud_battle_gap_px = (grid && hud)
      ? Math.round(grid.getBoundingClientRect().top - hud.getBoundingClientRect().bottom)
      : null
    p.overlay_battle_gap_px = (grid && overlay)
      ? Math.round(grid.getBoundingClientRect().top - overlay.getBoundingClientRect().bottom)
      : null
    var cBottom = contentBottom(view)
    p.vertical_slack_px = cBottom === null ? null : Math.round(window.innerHeight - cBottom)
    p.touch_targets = touchTargets()

    // ── 建造相专属（B8.4 / E3.2）──────────────────────────────────────────
    var handDeck = q('.hand-deck')
    var handCards = qa('.hand-card')
    p.hand_deck = box(handDeck)
    p.hand_card = handCards.length ? box(handCards[0]) : null
    p.hand_cards = handCards.map(box)
    p.hand_battle_intersect = intersects(box(handDeck), box(grid))
    p.hand_cards_in_viewport = handCards.length === 0
      ? null
      : handCards.every(function (el) {
          var r = el.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= window.innerHeight &&
                 r.left >= 0 && r.right <= window.innerWidth
        })
    return p
  }

  function finish() {
    out.viewport = { w: window.innerWidth, h: window.innerHeight }
    out.tokens = { touch_min: touchMinPx() }
    var pre = document.createElement('pre')
    pre.id = '__measure'
    pre.textContent = JSON.stringify(out)
    document.body.appendChild(pre)
  }

  // 📎 **同一次会话里量两个相位**（B8.3）
  //   点掉「还没有 \`is-wrong\` 的」那张选项卡 ⇒ 相位同步翻成 \`awaiting-build\`
  //   ⇒ \`.hand-deck\` 整块出现 ⇒ 再量一遍。
  function afterAnswer() {
    out.answer = measurePhase('answer')
    var cards = qa('.option-card')
    var picked = null
    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].classList.contains('is-wrong')) { picked = cards[i]; break }
    }
    if (!picked) {
      out.diag.no_option_to_pick = true
      out.diag.build_not_reached = '本页没有可点的选项卡（已在关内？已答完？）'
      finish()
      return
    }
    var pickedId = picked.getAttribute('data-option')
    out.diag.picked_option = pickedId
    picked.click()
    setTimeout(function () {
      var again = pickedId === null
        ? null
        : document.querySelector('.option-card[data-option="' + pickedId + '"]')
      out.diag.answer_correct = again ? again.classList.contains('is-right') : null
      out.diag.answer_wrong = again ? again.classList.contains('is-wrong') : null
      out.diag.hand_deck_present = !!q('.hand-deck')
      if (q('.hand-deck')) {
        out.build = measurePhase('build')
      } else {
        out.build = null
        out.diag.build_not_reached = '答完后没出现 \`.hand-deck\` ⇒ 建造相位未覆盖'
      }
      finish()
    }, BUILD_SETTLE_MS)
  }

  function start() {
    var btn = q('.start-button')
    out.diag.start_button = !!btn
    // 📎 \`.start-button\` **必须在点它之前量**（B1.3）—— 点掉就没了。
    out.diag.start_button_box = box(btn)
    if (btn) btn.click()
    setTimeout(afterAnswer, ANSWER_SETTLE_MS)
  }

  // ⚠️ **清掉本 origin 的 localStorage** ⇒ 每次量测都从「开始页」进关，
  //   不受上一次量测残留的存档影响（否则可能直接恢复进关内，量到的不是标准那一帧）。
  //   📎 **只清本脚本自己起的那个临时 origin**（127.0.0.1:<随机端口>）⇒
  //   碰不到真实部署 origin 的存档。
  try {
    window.localStorage.clear()
    out.diag.local_storage_cleared = true
  } catch (e) {
    out.diag.local_storage_cleared = false
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start)
})()
`

/* ── 计时通道（Story 3.5 / F3.1）────────────────────────────────────────────
 * ⚠️⚠️ **绝不能用 `--dump-dom` 那条通道量耗时** —— 它带
 *   `--virtual-time-budget=15000` ⇒ 浏览器**把时间虚拟化**（快进）
 *   ⇒ 页面里 `performance.now()` 的差值**不是真实耗时**，而且看起来很严谨。
 * ⇒ 这里另开一条**不带** `--virtual-time-budget` 的通道：页面把结果
 *   `POST` 给脚本已经起好的那个本地 HTTP server，脚本等这个 POST。
 *
 * 📎 **这些数不进任何退出码判据**（裁决 4）—— 超时或没收到 ⇒ 报「未测」，
 *   **不许**报一个数。
 */
const TIMING_SCRIPT = `
;(function () {
  var out = { cold_start_ms: null, answer_feedback_ms: null, notes: [] }

  function post() {
    try {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', '/__timing', true)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.send(JSON.stringify(out))
    } catch (e) {
      out.notes.push('POST 失败：' + String(e))
    }
  }

  // 📎 冷启动：导航开始 → \`.start-button\` **首次可交互**
  //   「可交互」的判据写死（F3.1）：按钮**在 DOM 里**且 \`getBoundingClientRect()\`
  //   的宽高**都 > 0**（不许用「看起来出来了」这种说法）。
  function waitStart() {
    var deadline = performance.now() + 8000
    function tick() {
      var btn = document.querySelector('.start-button')
      if (btn) {
        var r = btn.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          out.cold_start_ms = Math.round(performance.now())
          return answerFeedback()
        }
      }
      if (performance.now() > deadline) {
        out.notes.push('冷启动：8s 内没等到可交互的 \`.start-button\`')
        return answerFeedback()
      }
      setTimeout(tick, 50)
    }
    tick()
  }

  // 📎 答题反馈：点击 \`.option-card\` 的时刻 → \`.answer-feedback\` 首次出现在 DOM
  function answerFeedback() {
    var card = document.querySelector('.option-card')
    if (!card) {
      out.notes.push('答题反馈：本页没有 \`.option-card\`')
      return post()
    }
    var clickedAt = null
    var observer = new MutationObserver(function () {
      if (document.querySelector('.answer-feedback')) {
        if (clickedAt !== null) out.answer_feedback_ms = Math.round(performance.now() - clickedAt)
        observer.disconnect()
        post()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    card.addEventListener('click', function () { clickedAt = performance.now() }, true)
    card.click()
    setTimeout(function () {
      if (out.answer_feedback_ms === null) {
        out.notes.push('答题反馈：8s 内没等到 \`.answer-feedback\` 出现')
        observer.disconnect()
        post()
      }
    }, 8000)
  }

  if (document.readyState === 'complete') waitStart()
  else window.addEventListener('load', waitStart)
})()
`

export type Box = { top: number; bottom: number; left: number; right: number; w: number; h: number }

export type Phase = 'answer' | 'build'

/** 一个命中区选择器的量测结果（B1.3）。 */
export type TouchTarget = {
  selector: string
  /** 该选择器在**本相**是否存在（`count === 0` ⇒ false，**不许**静默当过）。 */
  present: boolean
  /** 匹配到的元素个数。 */
  count: number
  /** 匹配到**且有渲染尺寸**的元素个数。 */
  rendered: number
  /** 渲染尺寸的**最小值**（w / h 各自取最小 ⇒ 判据按最坏的那个元素算）。 */
  w: number | null
  h: number | null
  /** 同尺寸合并后的计数（`"宽x高" => 个数`）—— 免得 45 行同尺寸噪声。 */
  sizes: Record<string, number>
  note: string | null
}

export type PhaseMeasured = {
  phase: Phase
  level_view: { rect: Box | null; scrollHeight: number; clientHeight: number } | null
  level_view_display: string | null
  battle_grid: Box | null
  battle_ratio: number | null
  question_card: Box | null
  question_card_fully_visible: boolean
  hud: Box | null
  update_notice: Box | null
  notice_overlap_px: number | null
  containing_block: {
    level_view_left: number
    level_view_padding_left: string
    probe_left: number
    on_padding_box: boolean
  } | null
  options: {
    count: number
    grid_columns: string | null
    /** ⚠️ CSS 轨道数（**不是**列数 —— auto-fit 的空轨道折叠成 0px 但仍在 computed 值里） */
    grid_track_count: number
    row_count: number
    distinct_lefts: number[]
    box: Box | null
    cards: (Box | null)[]
    all_visible: boolean
    text_overflow: { text: string; scrollWidth: number; clientWidth: number; overflow: boolean }[]
  }
  battle_cell: Box | null
  cells_total: number
  plantable_cells: number
  page_h_overflow: boolean
  level_view_h_overflow: boolean | null
  /** 📎 Story 3.5 新增：HUD 底边 → 战场顶边（负值 = 重叠）。 */
  hud_battle_gap_px: number | null
  /** 📎 Story 3.5 新增：朗读浮层底边 → 战场顶边（负值 = 浮层压住战场）。 */
  overlay_battle_gap_px: number | null
  /** 📎 Story 3.5 新增：视口高 − `.level-view` 内容底边（竖屏垂直余量）。 */
  vertical_slack_px: number | null
  /** 📎 Story 3.5 新增：命中区清单的逐项量测。 */
  touch_targets: TouchTarget[]
  /** 📎 建造相专属：手牌区盒子。 */
  hand_deck: Box | null
  /** 📎 建造相专属：第一张手牌卡的盒子。 */
  hand_card: Box | null
  /** 📎 建造相专属：全部手牌卡的盒子。 */
  hand_cards: Box[]
  /** 📎 建造相专属：手牌区与战场**是否相交**。 */
  hand_battle_intersect: boolean | null
  /** 📎 建造相专属：手牌卡**是否全部在视口内**（点得到吗）。 */
  hand_cards_in_viewport: boolean | null
}

export type Measured = {
  viewport: { w: number; h: number }
  /** 📎 Story 3.5 新增：在**页面里**量到的 token 当期值（R-56 / B4）。 */
  tokens: { touch_min: number | null }
  diag: {
    local_storage_cleared: boolean
    start_button: boolean
    start_button_box: Box | null
    level_view: boolean
    body_classes: string[]
    app_html_length: number
    first_text: string
    notice_forced: boolean
    notice_scope_attr?: string | null
    /** 这次点掉的是哪个选项（`data-option` 的值）。 */
    picked_option: string | null
    /** 点掉的那张**对不对**（决定手里有没有卡）。 */
    answer_correct: boolean | null
    answer_wrong: boolean | null
    hand_deck_present: boolean
    /** 建造相位**没进成**时的原因（诚实记录，不许假装量过）。 */
    build_not_reached: string | null
    no_option_to_pick: boolean
  }
  /** 答题相（进关即量）。 */
  answer: PhaseMeasured | null
  /** 建造相（点掉选项卡之后量）；**没进成时为 `null`**。 */
  build: PhaseMeasured | null
}

/* ── 三条新判据的判定结果 ───────────────────────────────────────────────────
 * 📎 四种状态**不许合并**：
 *   · `pass` —— 量到了，且达标；
 *   · `fail` —— 量到了，但不达标；
 *   · `not-applicable` —— 该判据在这一个视口**不适用**（如间距判据只对竖屏生效）
 *     ⇒ **不是「通过」**，输出里必须标成「不适用」；
 *   · `not-measured` —— **量不到**（不是「不合格」）⇒ 与 `fail` 分开标。
 */
export type Judgement = {
  status: 'pass' | 'fail' | 'not-applicable' | 'not-measured'
  why: string
  value: number | null
  detail?: Record<string, unknown>
}

/** 判定结果的显示符号（L2 表里用）。 */
export function statusMark(status: Judgement['status']): string {
  switch (status) {
    case 'pass':
      return '✔'
    case 'fail':
      return '✘'
    case 'not-applicable':
      return '不适用'
    case 'not-measured':
      return '量不到'
  }
}

/**
 * **B2.1**（竖屏专属）HUD 与战场之间隔开的距离 ≥ `--touch-min` 当期值。
 *
 * 📎 **能证明**：HUD 与战场之间真的隔开了 ≥ 一个命中区。
 * 📎 **证明不了**：隔开这一段**观感好不好**；以及**竖屏垂直方向没有弹性**
 *   ⇒ 补间距会挤压题卡与手牌区。
 */
export function hudBattleGapVerdict(
  m: PhaseMeasured,
  touchMin: number,
  isPortrait: boolean,
): Judgement {
  if (!isPortrait) {
    return {
      status: 'not-applicable',
      why: '横屏：间距判据只对竖屏生效（裁决 2）',
      value: m.hud_battle_gap_px,
    }
  }
  if (m.hud_battle_gap_px === null) {
    return { status: 'not-measured', why: '量不到 HUD 或战场盒子', value: null }
  }
  const gap = m.hud_battle_gap_px
  return {
    status: gap >= touchMin ? 'pass' : 'fail',
    why: `HUD↔战场间距 ${gap}px（阈值 ${touchMin}px）`,
    value: gap,
  }
}

/**
 * **B2.2**（与姿态无关）朗读浮层在**渲染后**没有压住战场。
 *
 * 📎 **能证明**：浮层在渲染后没有压到战场上（回归守卫：
 *   `position: absolute` / 负 `top` / `transform` / 改 `flex-direction`
 *   这些 G135 没禁住的形态会被它抓到）。
 * 📎 **证明不了**：「浮层好不好看」；以及**当前结构下它必然为 0**
 *   （`PronunciationOverlay.vue` 根节点没有 `v-if` + 模板里它排在战场**之前**
 *   ⇒ 相邻兄弟 ⇒ 结构上不可能重叠）⇒ 它**不是现状探针**。
 */
export function overlayBattleGapVerdict(m: PhaseMeasured): Judgement {
  if (m.overlay_battle_gap_px === null) {
    return { status: 'not-measured', why: '量不到朗读浮层或战场盒子', value: null }
  }
  const gap = m.overlay_battle_gap_px
  return {
    status: gap >= 0 ? 'pass' : 'fail',
    why: `浮层↔战场间距 ${gap}px（应 ≥ 0；负值 = 浮层压住战场）`,
    value: gap,
  }
}

/**
 * **B2.3**（与姿态无关）每个可点元素渲染出来的 `min(w, h)` ≥ `--touch-min`。
 *
 * 📎 **能证明**：每个可点元素**渲染出来**够大。
 * 📎 **证明不了**：元素**好不好点**（视觉辨识、误触邻近元素）；
 *   `.level-outcome__button`（只在终态出现，量不到）；
 *   **当前相位不存在的元素**（`present === false`）。
 * 📎 ⚠️ **`present === false` 不许静默当过**（R-51 第 11 条）⇒
 *   结论里**必须带覆盖率**，并把「本相不存在」的选择器**逐个列出来**。
 */
export function touchTargetViolations(m: PhaseMeasured, touchMin: number): Judgement {
  const targets = m.touch_targets ?? []
  const present = targets.filter((t) => t.present && t.rendered > 0)
  const absent = targets.filter((t) => !t.present)
  const unrendered = targets.filter((t) => t.present && t.rendered === 0)
  const coverage = `${present.length}/${targets.length}`
  if (present.length === 0) {
    return {
      status: 'not-measured',
      why: `本相一个可点元素都没量到（清单覆盖 ${coverage}）—— 判据空跑`,
      value: null,
      detail: { coverage, absent: absent.map((t) => t.selector) },
    }
  }
  const violations = present
    .filter((t) => Math.min(t.w ?? 0, t.h ?? 0) < touchMin)
    .map((t) => `${t.selector} ${t.w}×${t.h}`)
  const smallest = Math.min(...present.map((t) => Math.min(t.w ?? 0, t.h ?? 0)))
  const notes: string[] = []
  if (absent.length > 0) notes.push(`本相不存在 ${absent.map((t) => t.selector).join('、')}`)
  if (unrendered.length > 0) notes.push(`匹配到但无渲染尺寸 ${unrendered.map((t) => t.selector).join('、')}`)
  return {
    status: violations.length === 0 ? 'pass' : 'fail',
    why:
      `最小命中区 ${smallest}px（阈值 ${touchMin}px）；清单覆盖 ${coverage}` +
      (violations.length > 0 ? `；不合格 ${violations.join('、')}` : '') +
      (notes.length > 0 ? `；${notes.join('；')}` : ''),
    value: smallest,
    detail: { coverage, violations, absent: absent.map((t) => t.selector) },
  }
}

/* ── 判据清单 ────────────────────────────────────────────────────────────────
 * ⚠️ 每条都写明「**它能证明什么**」与「**它证明不了什么**」——
 *   一个不写「证明不了什么」的判据，下一个人会以为它是全覆盖的。
 */
type Check = { name: string; proves: string; run: (m: Measured) => { ok: boolean; why: string } }

/** 取出某个相位的量测；`null` 表示**这一相没进成**（例如建造相没量到）。 */
function phaseOf(m: Measured, phase: Phase): PhaseMeasured | null {
  return phase === 'answer' ? m.answer : m.build
}

/**
 * 把「答题相 + 建造相」两个判定合成一条结论。
 *
 * 📎 **建造相没进成时，它不参与本判据的成败** —— 但**必须出现在 `why` 里**
 *   （不许静默当过：R-51 第 11 条）。
 */
function combinePhases(label: string, a: Judgement, b: Judgement | null): { ok: boolean; why: string } {
  const parts = [`答题相 ${statusMark(a.status)}（${a.why}）`]
  let ok = a.status === 'pass' || a.status === 'not-applicable'
  if (b !== null) {
    parts.push(`建造相 ${statusMark(b.status)}（${b.why}）`)
    if (!(b.status === 'pass' || b.status === 'not-applicable')) ok = false
  } else {
    parts.push('建造相 未覆盖（没量到 —— 不参与本判据）')
  }
  return { ok, why: `${label}：${parts.join('；')}` }
}

const CHECKS: Check[] = [
  {
    // AC-D4 / AC-D6 —— 删掉 `@media (max-height: 900px)` 之后的核心判据。
    name: 'battle-grid-宽高比由宽度推出',
    proves: '战场的盒子不是被高度压扁的（≈9/5 ≈ 1.8）；证明不了格子内部有没有挤',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      if (a.battle_ratio === null)
        return { ok: false, why: '量不到 `.battle-grid` 的盒子 —— 判据空跑' }
      return {
        ok: Math.abs(a.battle_ratio - 1.8) < 0.25,
        why: `实测宽高比 ${a.battle_ratio}（期望 ≈1.8）；那个断点在时实测 0.852`,
      }
    },
  },
  {
    name: 'question-card-完整落在视口内',
    proves:
      '孩子看得见题（**这 8 条判据只判 800×1280**；矩阵里的其余视口只量不判）；' +
      '证明不了小屏与横屏',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      return {
        ok: a.question_card_fully_visible,
        why: a.question_card
          ? `题卡 top=${a.question_card.top} bottom=${a.question_card.bottom}，视口高 ${m.viewport.h}`
          : '量不到 `.question-card` —— 判据空跑',
      }
    },
  },
  {
    name: 'level-view-零滚动',
    proves: '竖屏靠「自缩放」装得下而不是靠滚动兜底；证明不了更矮的视口',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      const v = a.level_view
      if (!v) return { ok: false, why: '量不到 `.level-view` —— 判据空跑' }
      return {
        ok: v.scrollHeight <= v.clientHeight,
        why: `scrollHeight=${v.scrollHeight} clientHeight=${v.clientHeight}`,
      }
    },
  },
  {
    name: 'update-notice-不压住 HUD',
    proves:
      '版本更新提示条与 HUD 零重叠；⚠️ 若运行时它已退场，量的是**合成的那一条**' +
      '（带组件真实 scoped 属性，`forced: true`）—— 证明不了它与战场的关系',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      if (a.notice_overlap_px === null)
        return { ok: false, why: '既没渲染出提示条、也没合成出（scope 属性找不到）—— 判据空跑' }
      return {
        ok: a.notice_overlap_px <= 0,
        why: `重叠 ${a.notice_overlap_px}px（应 ≤ 0）${m.diag.notice_forced ? '，⚠️ 量的是合成的那条' : ''}`,
      }
    },
  },
  {
    name: 'level-outcome-浮层的包含块是 padding box',
    proves:
      'W7 更正的实测依据：`.level-view` 的左右安全区 padding **不会**把绝对定位浮层往里推；' +
      '证明不了浮层内容在横屏刘海下会不会被裁（那要真机）',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      const cb = a.containing_block
      if (!cb) return { ok: false, why: '量不到包含块 —— 判据空跑' }
      return {
        ok: cb.on_padding_box,
        why:
          `probe_left=${cb.probe_left} level_view_left=${cb.level_view_left} ` +
          `padding-left=${cb.level_view_padding_left} ⇒ on_padding_box=${cb.on_padding_box}`,
      }
    },
  },
  {
    // 📎 Story 3.5 / B2.1 —— 竖屏专属
    name: 'HUD-与战场间距 ≥ --touch-min（竖屏专属）',
    proves:
      'HUD 与战场之间真的隔开了 ≥ 一个命中区；' +
      '**证明不了**隔开这一段观感好不好，也**证明不了**竖屏垂直方向有弹性（补间距会挤压题卡与手牌区）',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      const touchMin = m.tokens.touch_min
      if (touchMin === null) return { ok: false, why: '量不到 `--touch-min` 当期值 —— 判据空跑' }
      const isPortrait = m.viewport.h > m.viewport.w
      const b = phaseOf(m, 'build')
      return combinePhases(
        'HUD↔战场',
        hudBattleGapVerdict(a, touchMin, isPortrait),
        b === null ? null : hudBattleGapVerdict(b, touchMin, isPortrait),
      )
    },
  },
  {
    // 📎 Story 3.5 / B2.2 —— 与姿态无关
    name: '朗读浮层-不压住战场（渲染级）',
    proves:
      '朗读浮层在**渲染后**没有压到战场上（回归守卫：绝对定位 / 负 top / transform / 改 flex-direction 会被它抓到）；' +
      '**证明不了**浮层好不好看，也**证明不了**当前结构下的现状（结构上它必然为 0）',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      const b = phaseOf(m, 'build')
      return combinePhases('浮层↔战场', overlayBattleGapVerdict(a), b === null ? null : overlayBattleGapVerdict(b))
    },
  },
  {
    // 📎 Story 3.5 / B2.3 —— 与姿态无关
    name: '可点元素-渲染尺寸 ≥ --touch-min',
    proves:
      '每个**量得到的**可点元素渲染出来够大；' +
      '**证明不了**好不好点，也**证明不了**本相不存在的元素与终态才出现的 `.level-outcome__button`',
    run: (m) => {
      const a = phaseOf(m, 'answer')
      if (a === null) return { ok: false, why: '量不到答题相 —— 判据空跑' }
      const touchMin = m.tokens.touch_min
      if (touchMin === null) return { ok: false, why: '量不到 `--touch-min` 当期值 —— 判据空跑' }
      const b = phaseOf(m, 'build')
      return combinePhases(
        '命中区',
        touchTargetViolations(a, touchMin),
        b === null ? null : touchTargetViolations(b, touchMin),
      )
    },
  },
]

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
}

/* ── 找浏览器 ──────────────────────────────────────────────────────────────── */
const CHROMIUM_CANDIDATES = [
  process.env['CHROMIUM_BIN'],
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
].filter((x): x is string => typeof x === 'string' && x.length > 0)

function findChromium(): string | null {
  for (const bin of CHROMIUM_CANDIDATES) {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8' })
    if (probe.status === 0) return bin
  }
  return null
}

/** 计时通道的载荷（F3.1）。 */
export type TimingPayload = {
  cold_start_ms: number | null
  answer_feedback_ms: number | null
  notes: string[]
}

/* ── 把产物复制一份、注入量测脚本、起服务器、跑一次浏览器 ────────────────────
 * ⚠️ **复制而不是直接改 `dist/`** —— 注入脚本会改 `index.html`，
 *   直接改产物等于污染部署目录（且下一次 `npm run build` 之前它一直是脏的）。
 *
 * 🔥 **为什么必须是异步的**：`spawnSync` 会**堵死事件循环**，
 *   而 HTTP 服务器要靠事件循环来应答请求 ——
 *   用 `spawnSync` 跑浏览器，服务器在浏览器整个运行期间**一次也答不上来**，
 *   页面拿到的是连接失败。⇒ 这里用 `spawn` + Promise，**不引任何 CDP 依赖**。
 */
async function runBrowser(
  distDir: string,
  chromium: string,
  width: number,
  height: number,
  mode: 'measure' | 'timing',
): Promise<{ dom: string; timing: TimingPayload | null }> {
  const tmp = mkdtempSync(join(tmpdir(), 'plantsgame-portrait-'))
  try {
    cpSync(distDir, tmp, { recursive: true })

    const indexPath = join(tmp, 'index.html')
    const html = readFileSync(indexPath, 'utf8')
    if (!html.includes('</body>')) {
      throw new Error(`产物 ${distDir}/index.html 里没有 </body> —— 注入点没了`)
    }
    // ⚠️ **内联**脚本不触发 CSP 的 `unsafe-eval`，而量测脚本只读 DOM、不 `eval`。
    const script = mode === 'measure' ? MEASURE_SCRIPT : TIMING_SCRIPT
    writeFileSync(indexPath, html.replace('</body>', `<script>${script}</script></body>`))

    let onTiming: ((payload: TimingPayload) => void) | null = null

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const raw = decodeURIComponent((req.url ?? '/').split('?')[0]!)
      // 📎 **计时通道的 POST 分支必须在部署前缀检查之前**（F3.1）：
      //   页面把耗时 POST 回 `/__timing` ⇒ 服务器要接住它。
      //   ⚠️ 这条分支只回 204，不写文件、不改任何东西。
      if (req.method === 'POST' && raw === '/__timing') {
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8')
        })
        req.on('end', () => {
          res.statusCode = 204
          res.end()
          let payload: TimingPayload
          try {
            const parsed = JSON.parse(body) as Partial<TimingPayload>
            payload = {
              cold_start_ms: typeof parsed.cold_start_ms === 'number' ? parsed.cold_start_ms : null,
              answer_feedback_ms:
                typeof parsed.answer_feedback_ms === 'number' ? parsed.answer_feedback_ms : null,
              notes: Array.isArray(parsed.notes) ? parsed.notes.map((n) => String(n)) : [],
            }
          } catch {
            payload = { cold_start_ms: null, answer_feedback_ms: null, notes: ['POST 的 body 不是 JSON'] }
          }
          onTiming?.(payload)
        })
        return
      }
      // 🔥🔥 **必须按 `DEPLOY_BASE` 前缀提供** —— 产物的 `index.html` 里
      //   资源引用逐字是 `/plantsgame/assets/…`（AC-B3）。
      //   在根路径上直接提供 ⇒ **每一个资源 404** ⇒ 应用**根本不会挂载**，
      //   而症状是「量不到任何东西」—— 与「布局坏了」看起来一模一样。
      //   ⇒ 前缀不匹配时**明确 404 并在诊断里说**，不许静默降级成「能跑」。
      const base = '/' + DEPLOY_BASE.replace(/^\/+|\/+$/g, '') + '/'
      if (!raw.startsWith(base)) {
        res.statusCode = 404
        res.end(`不在部署前缀 ${base} 下`)
        return
      }
      const rel = raw.slice(base.length - 1) || '/index.html'
      const file = resolve(tmp, '.' + rel)
      // ⚠️ 目录穿越防护：解析后必须仍在临时目录之内。
      if (!file.startsWith(resolve(tmp)) || !existsSync(file)) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      // ⚠️ 请求落在**目录**上时补 `index.html` ——
      //   否则 `readFileSync` 抛 `EISDIR`，整个服务器连带脚本一起挂掉，
      //   症状是「量测脚本崩了」而不是「那个路径没有文件」。
      const target = statSync(file).isDirectory() ? join(file, 'index.html') : file
      if (!existsSync(target)) {
        res.statusCode = 404
        res.end('directory without index.html')
        return
      }
      res.setHeader('Content-Type', MIME[extname(target)] ?? 'application/octet-stream')
      res.end(readFileSync(target))
    })

    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    const addr = server.address()
    if (addr === null || typeof addr === 'string') throw new Error('拿不到端口')
    const url = `http://127.0.0.1:${addr.port}/${DEPLOY_BASE.replace(/^\/+|\/+$/g, '')}/`

    try {
      // 🔥 `--dump-dom` 会**执行页面里的 JS** 并把执行后的 DOM 吐出来 ——
      //   量测脚本写出的 `<pre id="__measure">` 因此会出现在输出里。
      //   `--virtual-time-budget` 是**唯一**能让 `--dump-dom` 等待的机制
      //   （命令行没有 CDP 的 `Page.loadEventFired` 可订阅）。
      //
      //   ⚠️⚠️ **计时通道不带这两个参数**（F3）：`--virtual-time-budget` 会把时间
      //   虚拟化（快进）⇒ `performance.now()` 的差值**不是真实耗时**。
      const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        `--window-size=${width},${height}`,
      ]
      if (mode === 'measure') {
        args.push('--virtual-time-budget=15000', '--dump-dom')
      }
      args.push(url)

      return await new Promise<{ dom: string; timing: TimingPayload | null }>((done, fail) => {
        // ⚠️ **不传 `encoding`** —— `spawn` 的那几个重载在同时给 `stdio` 与
        //   `encoding` 时会被解析成一个 `never` 的交叉类型（TS2339/TS7006）。
        //   这里自己把 Buffer 拼成字符串，顺带把 stdout / stderr 两路都留着排错。
        const proc = spawn(chromium, args)
        let out = ''
        let err = ''
        proc.stdout?.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          err += chunk.toString('utf8')
        })
        let settled = false
        const timer = setTimeout(
          () => {
            if (settled) return
            settled = true
            proc.kill('SIGKILL')
            if (mode === 'timing') {
              // 📎 超时 ⇒ **报「未测」**，不许报一个数（F3.1）。
              done({ dom: out, timing: null })
            } else {
              fail(new Error(`浏览器 180s 还没退出。stderr 前 400 字符：\n${err.slice(0, 400)}`))
            }
          },
          180_000,
        )
        onTiming = (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          proc.kill('SIGKILL')
          done({ dom: out, timing: payload })
        }
        proc.on('error', (e: Error) => {
          clearTimeout(timer)
          if (!settled) {
            settled = true
            fail(e)
          }
        })
        proc.on('close', (code: number | null) => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          if (mode === 'timing') {
            // 浏览器自己退出了但**没等到 POST** ⇒ 未测。
            done({ dom: out, timing: null })
            return
          }
          if (code !== 0 && out.trim() === '') {
            fail(new Error(`浏览器以退出码 ${code} 结束且没有任何输出。stderr：\n${err.slice(0, 400)}`))
            return
          }
          done({ dom: out, timing: null })
        })
      })
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()))
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export function parseMeasured(dump: string): Measured {
  const at = /<pre id="__measure">([\s\S]*?)<\/pre>/.exec(dump)
  if (at === null) {
    throw new Error(
      '浏览器输出里找不到 `<pre id="__measure">` —— 量测脚本没跑完。\n' +
        '常见原因：① 产物没构建（先 `npm run build`）；② 页面在虚拟时间内没进关；' +
        '③ 这个 chromium 不认 `--headless=new`。\n' +
        `收到的输出前 400 字符：\n${dump.slice(0, 400)}`,
    )
  }
  const text = at[1]!
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
  const parsed = JSON.parse(text) as Partial<Measured>
  // ⚠️ **载荷形状自检** —— 旧版（单相位、字段平铺）的载荷会被误当成新版的
  //   「全部字段都 undefined」⇒ 症状是「判据空跑」这种看不懂的失败。
  if (parsed.answer === undefined && parsed.build === undefined) {
    throw new Error(
      '量测载荷里既没有 `answer` 也没有 `build` —— 量测脚本没注入成功，或产物里的脚本是旧版。\n' +
        `收到的载荷前 400 字符：\n${text.slice(0, 400)}`,
    )
  }
  return parsed as Measured
}

/* ── 视口补偿：让**内视口**等于请求的尺寸 ────────────────────────────────────
 * 🔥 **为什么必须补偿**：`--window-size` 设的是**窗口**尺寸，而 `--headless=new`
 *   的窗口含工具栏/边框 ⇒ **内视口比请求值矮**（2026-10-24 实测：14 个视口
 *   **一律差 87px**，请求 800×1280 ⇒ 内视口 800×1193）。
 *   ⇒ 不补偿的话，矩阵里写着「768×1024」的那一行**实际量的是 768×937**
 *   —— 而 768×1024 是**真实平板的分辨率**（PWA 全屏时内视口就是 768×1024）。
 *   ⇒ 把差值加回 `--window-size`，量到的才是设备真实视口。
 *
 * ⚠️ **口径变更（必须与旧基线对照着读）**：2026-10-18 的旧基线是**未补偿**时量的
 *   （「800×1280」那行实际是 800×1193）。战场盒子由**宽度**推出
 *   （`aspect-ratio: 9/5`）⇒ 补偿只改高度 ⇒ **战场尺寸逐字不变**
 *   ⇒ 旧基线与新数据在「战场 / 格子」两列仍可直接对照；
 *   而「题卡 / 选项是否全在视口内」两列**必须按新口径重读**。
 */
let chromeDelta = { dw: 0, dh: 0 }

/**
 * **渲染出的列数** = 选项卡左边位置的去重个数。
 *
 * 🔥 **为什么不能按 CSS 轨道数算**（2026-10-24 实测踩到）：
 *   `repeat(auto-fit, minmax(0, 1fr))` 会按容器宽度算出**几十条**轨道
 *   （800px 宽 ⇒ **57 条**），auto-fit 把空轨道折叠成 0px，
 *   **而 computed 的 `gridTemplateColumns` 里那些 0px 轨道仍然列着**
 *   ⇒ 按轨道数报列数会报出「**57 列**」这种假数（真实渲染是 2 列）。
 *   ⇒ 列数只能按**渲染位置**算。
 */
export function renderedColumnCount(distinctLefts: number[]): number {
  return new Set(distinctLefts).size
}

/** 量到的内视口是不是就是请求的那个视口。 */
export function viewportMatches(
  requested: { w: number; h: number },
  actual: { w: number; h: number },
): boolean {
  return requested.w === actual.w && requested.h === actual.h
}

/**
 * 算下一次该把多少像素加回 `--window-size`。
 *
 * 差值 = 「请求的」减「量到的」⇒ 浏览器外壳（工具栏 / 边框）有多厚就加多少。
 */
export function nextChromeDelta(
  delta: { dw: number; dh: number },
  requested: { w: number; h: number },
  actual: { w: number; h: number },
): { dw: number; dh: number } {
  return {
    dw: delta.dw + (requested.w - actual.w),
    dh: delta.dh + (requested.h - actual.h),
  }
}

/** 量一个视口，并保证量到的**内视口**就是 `w × h`（不满足就补偿后重量一次）。 */
async function measureAt(
  distDir: string,
  chromium: string,
  w: number,
  h: number,
): Promise<Measured> {
  let m = parseMeasured(
    (await runBrowser(distDir, chromium, w + chromeDelta.dw, h + chromeDelta.dh, 'measure')).dom,
  )
  if (!viewportMatches({ w, h }, m.viewport)) {
    // 量到的差值就是浏览器外壳的大小 ⇒ 加回去再量一次
    chromeDelta = nextChromeDelta(chromeDelta, { w, h }, m.viewport)
    m = parseMeasured(
      (await runBrowser(distDir, chromium, w + chromeDelta.dw, h + chromeDelta.dh, 'measure')).dom,
    )
  }
  return m
}

/* ── 多视口量测模式（Story 1.19 第二轮 / Story 2.4 之后重测布局）────────────
 * ⚠️ **这是「量测」，不是「判据」** —— 那 8 条判据逐字写着「本脚本只量 800×1280
 *   这一个视口」，它们的语义与竖屏绑死。
 *   ⇒ 额外视口**只产出数字**，供人抄进 story 文档的实测表；**不参与退出码**。
 *
 *   视口清单来自**仓库里的矩阵文件** `scripts/measure-viewports.txt`
 *   ⇒ 清单与代码分离，改设备只改文件。
 *   文件不存在 ⇒ 只跑那 8 条判据（旧的快路径，语义不变）。
 */
const VIEWPORT_PATTERN = /^(\d{2,5})x(\d{2,5})$/i

const MATRIX_FILE = resolve(REPO_ROOT, 'scripts/measure-viewports.txt')

function parseViewportLine(s: string, where: string): { w: number; h: number } {
  const m = VIEWPORT_PATTERN.exec(s)
  if (m === null) {
    throw new Error(`视口写法看不懂：「${s}」（${where}）。用 WxH，例如 1280x800`)
  }
  return { w: Number(m[1]), h: Number(m[2]) }
}

/** 读矩阵文件：一行一个 `WxH`，`#` 开头是注释，空行忽略。 */
function readViewportMatrix(file: string): { w: number; h: number }[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((x) => x.raw !== '' && !x.raw.startsWith('#'))
    .map((x) => parseViewportLine(x.raw, `${file} 第 ${x.line} 行`))
}

/** 把一次量测压成一行摘要（表格用）。⚠️ 字段名与 story 文档的实测表逐字对齐。 */
export function summaryOf(p: PhaseMeasured): Record<string, unknown> {
  const present = p.touch_targets.filter((t) => t.present && t.rendered > 0)
  const smallest = present.length === 0
    ? null
    : Math.min(...present.map((t) => Math.min(t.w ?? 0, t.h ?? 0)))
  return {
    相位: p.phase,
    display: p.level_view_display,
    选项数: p.options.count,
    列数: renderedColumnCount(p.options.distinct_lefts),
    行数: p.options.row_count,
    选项全可见: p.options.all_visible,
    题卡: p.question_card === null ? null : `${p.question_card.top}~${p.question_card.bottom}`,
    题卡全可见: p.question_card_fully_visible,
    战场: p.battle_grid === null ? null : `${p.battle_grid.w}×${p.battle_grid.h}`,
    格子: p.battle_cell === null ? null : `${p.battle_cell.w}`,
    可建格: `${p.plantable_cells}/${p.cells_total}`,
    页面横溢出: p.page_h_overflow,
    内部滚动: p.level_view === null ? null : p.level_view.scrollHeight > p.level_view.clientHeight,
    文字溢出: p.options.text_overflow.length,
    'HUD↔战场间距': p.hud_battle_gap_px,
    '浮层↔战场间距': p.overlay_battle_gap_px,
    垂直余量: p.vertical_slack_px,
    命中区最小边: smallest,
    命中区覆盖: `${present.length}/${p.touch_targets.length}`,
    手牌区: p.hand_deck === null ? null : `${p.hand_deck.w}×${p.hand_deck.h}`,
    手牌卡在视口内: p.hand_cards_in_viewport,
    手牌区与战场相交: p.hand_battle_intersect,
  }
}

/**
 * L2 逐视口层：把三条新判据的结论打进表里（**不影响退出码**）。
 *
 * 📎 **四种状态分开标**（B6）：✔ / ✘ / 不适用 / 量不到。
 */
export function verdictColumns(
  p: PhaseMeasured,
  touchMin: number | null,
  isPortrait: boolean,
): Record<string, unknown> {
  const cell = (j: Judgement): string => {
    if (j.status === 'not-measured') return '量不到'
    if (j.status === 'not-applicable') return '不适用'
    return `${statusMark(j.status)} ${j.value ?? '-'}px`
  }
  const gap =
    touchMin === null
      ? ({ status: 'not-measured', why: '量不到 `--touch-min` 当期值', value: null } satisfies Judgement)
      : hudBattleGapVerdict(p, touchMin, isPortrait)
  const overlay = overlayBattleGapVerdict(p)
  const touch =
    touchMin === null
      ? ({ status: 'not-measured', why: '量不到 `--touch-min` 当期值', value: null } satisfies Judgement)
      : touchTargetViolations(p, touchMin)
  return {
    '间距判据': cell(gap),
    '浮层判据': cell(overlay),
    '命中区判据': touch.status === 'not-measured' ? cell(touch) : `${cell(touch)} 最小 ${touch.value ?? '-'}px`,
  }
}

async function main(): Promise<void> {
  const distDir = resolve(REPO_ROOT, process.argv[2] ?? 'dist')
  if (!existsSync(distDir)) {
    console.error(`[portrait] 找不到产物目录 ${distDir} —— 先跑 \`npm run build\`（R-39：不许假设它在）`)
    process.exit(1)
  }

  const chromium = findChromium()
  if (chromium === null) {
    // ⚠️ **退出码 2**：既不是成功也不是失败。
    //   一个「跑不起来就当绿」的守卫比没有守卫更坏（R-51 第 1 类）。
    console.error(
      '[portrait] **跳过（这不是通过）**：本机找不到 chromium。\n' +
        '  试 `CHROMIUM_BIN=/path/to/chromium npm run verify:portrait`，或装一个。\n' +
        '  它量的东西 vitest 量不出来（AC-D7：jsdom 不做布局 ⇒ 那三个 API 返回 0）。',
    )
    process.exit(2)
  }

  const width = 800
  const height = 1280
  console.log(`[portrait] 浏览器：${chromium}；产物：${distDir}；视口：${width}×${height}`)
  console.log('[portrait] 视口是真浏览器量出来的（jsdom 不做布局，AC-D7）\n')

  const run = await measureAt(distDir, chromium, width, height)
  const measured = run
  console.log(
    `[portrait] 浏览器外壳补偿：${chromeDelta.dw}×${chromeDelta.dh}px ` +
      '（`--window-size` 设的是窗口，含工具栏 ⇒ 不补偿量到的视口会比请求值矮）',
  )
  console.log(
    `[portrait] 两个相位：答题相 ${measured.answer === null ? '未覆盖' : '已量'}、` +
      `建造相 ${measured.build === null ? '未覆盖' : '已量'}` +
      (measured.diag.build_not_reached === null ? '' : `（${measured.diag.build_not_reached}）`),
  )

  let failed = 0
  for (const check of CHECKS) {
    const { ok, why } = check.run(measured)
    if (ok) {
      console.log(`  ✅ ${check.name}`)
      console.log(`     证明：${check.proves}`)
    } else {
      failed += 1
      console.log(`  ❌ ${check.name} —— ${why}`)
      console.log(`     证明：${check.proves}`)
    }
  }

  console.log(`\n[portrait] 实测值：${JSON.stringify(measured, null, 2)}`)
  console.log(`\n[portrait] ${CHECKS.length - failed}/${CHECKS.length} 项通过`)

  // ── 多视口量测（**纯量测，不参与上面那 8 条判据**）──────────────────────
  const extra = readViewportMatrix(MATRIX_FILE)
  if (extra.length > 0) {
    const rows: Record<string, unknown>[] = []
    const l2Failures: string[] = []
    for (const vp of extra) {
      const m = await measureAt(distDir, chromium, vp.w, vp.h)
      const isPortrait = m.viewport.h > m.viewport.w
      for (const phase of ['answer', 'build'] as const) {
        const p = phase === 'answer' ? m.answer : m.build
        if (p === null) {
          rows.push({
            请求视口: `${vp.w}×${vp.h}`,
            相位: phase,
            状态: '未覆盖',
            原因: m.diag.build_not_reached ?? '本相没量到',
          })
          continue
        }
        const row = {
          请求视口: `${vp.w}×${vp.h}`,
          ...summaryOf(p),
          ...verdictColumns(p, m.tokens.touch_min, isPortrait),
        }
        rows.push(row)
        // ⚠️ **L2 的失败不许被静默**（B6）⇒ 逐条收集，打印出来，并要求写进 story 文档。
        if (m.tokens.touch_min !== null) {
          for (const [label, j] of [
            ['间距判据', hudBattleGapVerdict(p, m.tokens.touch_min, isPortrait)],
            ['浮层判据', overlayBattleGapVerdict(p)],
            ['命中区判据', touchTargetViolations(p, m.tokens.touch_min)],
          ] as const) {
            if (j.status === 'fail') {
              l2Failures.push(`${vp.w}×${vp.h} ${p.phase} ${label}：${j.why}`)
            }
          }
        }
      }
    }
    console.log(`\n[portrait] 多视口实测（${extra.length} 个视口 × 两个相位，纯量测，不参与退出码）：`)
    console.log(JSON.stringify(rows, null, 2))
    if (l2Failures.length > 0) {
      console.log(
        `\n[portrait] ⚠️ L2 逐视口层有 ${l2Failures.length} 处不达标（**不影响退出码**，但必须写进 story 文档）：`,
      )
      for (const line of l2Failures) console.log(`  ✘ ${line}`)
    } else {
      console.log('\n[portrait] L2 逐视口层：全部视口的三条新判据都达标或「不适用」。')
    }
  }

  // ── 计时通道（F3.1）—— **参考值，不进任何退出码判据** ────────────────────
  console.log(
    '\n[portrait] 计时通道（**不带** `--virtual-time-budget` ⇒ 不是虚拟时间；' +
      '⚠️ 这些数**不进任何退出码判据**，且只是本机参考值，不是平板值）：',
  )
  const timed = await runBrowser(distDir, chromium, width, height, 'timing')
  if (timed.timing === null) {
    console.log('  ⏱ 冷启动：**未测**（没收到 `POST /__timing` ⇒ 超时或页面没跑完）')
    console.log('  ⏱ 答题反馈：**未测**（同上）')
  } else {
    console.log(
      `  ⏱ 冷启动：${timed.timing.cold_start_ms === null ? '**未测**' : `${timed.timing.cold_start_ms}ms`}` +
        '（导航开始 → `.start-button` 首次可交互）',
    )
    console.log(
      `  ⏱ 答题反馈：${timed.timing.answer_feedback_ms === null ? '**未测**' : `${timed.timing.answer_feedback_ms}ms`}` +
        '（点 `.option-card` → `.answer-feedback` 首次出现）',
    )
    for (const note of timed.timing.notes) console.log(`     · ${note}`)
  }

  if (failed > 0) {
    console.error(
      '[portrait] 有项目不通过 —— 这不是「本机环境问题」，是竖屏布局真的坏了。\n' +
        '  ⚠️ 这台机器的字体与真实平板不同，真机结论仍以人工待验清单为准（AC-E6）。',
    )
    process.exit(1)
  }
}

/**
 * 只在被直接执行时才跑 `main()`。
 *
 * 测试要 import 本模块的纯函数（`renderedColumnCount` / `nextChromeDelta` /
 * `summaryOf` / `parseMeasured`），而顶层就跑 `main()` 会把测试进程一起收走 ——
 * 这就是「顶层副作用必须留到 main() 里」的具体理由（与 `scripts/generate-voice.ts` 同款）。
 */
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err: unknown) => {
    console.error('[portrait] 跑不起来（这不是通过）：', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
