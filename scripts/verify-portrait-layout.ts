/**
 * 🔥 **竖屏布局的真机量测**（Story 1.18 / AC-D7 的**盲区补上**）
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
 * ── 📎 多视口量测矩阵（Story 1.19 第二轮）───────────────────────────────────
 *   `scripts/measure-viewports.txt` 里逐个列出的视口会在那 5 条判据跑完之后
 *   **各量一遍**，并打成一张表（选项数 / 列数 / 行数 / 题卡 / 战场 / 格子 /
 *   可建格 / 横向溢出 / 内部滚动 / 文字溢出）。
 *   ⚠️ **矩阵里的视口只量不判** —— 退出码只由 800×1280 那 5 条决定。
 *   ⚠️ 量到的**选项数**随内容变（Story 2.4 之后单词卡是 2 个选项）⇒
 *     「选项仍 4 列」这类旧基线必须重量，别拿旧文档的字面量当现状。
 *
 * 用法：`npm run build && npm run verify:portrait [-- dist]`
 */

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 🔥 **部署前缀从 `vite.config.ts` 导入**，不手抄 ——
//   同一份字面量抄两遍就是 AC-B3 那个事故的配方（手抄的那份没人守）。
//   R-61 只禁 `src/` 依赖，配置文件不在其列（与 `verify-deploy.ts` 同款做法）。
import { DEPLOY_BASE } from '../vite.config'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/* ── 量测脚本：注入到产物 `index.html` 末尾，在**页面里**执行 ───────────────
 * ⚠️ 它必须**自己**完成「点开始游戏 → 进关 → 量布局」这一整串，
 *   因为浏览器命令行没有「等某个状态」的机制（本仓库不引 CDP 依赖）。
 * ⚠️ 所有量测都走**真实布局 API** —— 这正是 vitest 里被禁的那三个（AC-D7）。
 */
const MEASURE_SCRIPT = `
;(function () {
  var out = {}

  function box(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom),
             left: Math.round(r.left), right: Math.round(r.right),
             w: Math.round(r.width), h: Math.round(r.height) }
  }
  function q(sel) { return document.querySelector(sel) }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }

  function finish() {
    out.viewport = { w: window.innerWidth, h: window.innerHeight }
    // ⚠️ 诊断信息：**判据空跑时必须能看出「为什么没量到」**，
    //   否则「0/5 项通过」和「页面根本没加载」看起来一模一样（R-51 第 5 类）。
    out.diag = {
      start_button: !!q('.start-button'),
      level_view: !!q('.level-view'),
      // 顶层节点的前几个 class —— 足以分辨「还在开始页」「进关了但类名不同」「白屏」
      body_classes: Array.prototype.slice.call(document.body.children, 0, 6).map(function (el) {
        return el.tagName + '.' + (el.className || '(no class)')
      }),
      app_html_length: (q('#app') || document.body).innerHTML.length,
      first_text: ((document.body.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 80)
    }
    var view   = q('.level-view')
    var grid   = q('.battle-grid')
    var card   = q('.question-card')
    var hud    = q('.hud')
    var notice = q('.update-notice')

    // ⚠️ 提示条**只在 \`preparing\` 状态下存在**，而首次加载时它可能已经退场
    //   （本 story 的 \`[CR]\` 修好了那三条退路）。⇒ 量不到不等于「不重叠」。
    //   这里**合成一条**并**带上组件真实的 scoped 属性**（否则 scoped 规则不生效，
    //   量到的是浏览器默认 \`<p>\` 的盒子 —— 那个洞量测过一次，h=24 且落在文档流末尾）。
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

    out.level_view = view
      ? { rect: box(view), scrollHeight: view.scrollHeight, clientHeight: view.clientHeight }
      : null
    // \`display\` 是竖屏/横屏两套布局的分水岭（竖屏 flex / 横屏 grid）⇒ 必须量。
    out.level_view_display = view ? window.getComputedStyle(view).display : null
    out.battle_grid = box(grid)
    // 战场盒的宽高比 —— 「格子是不是被压扁了」的唯一判据（AC-D4）
    if (grid) {
      var gr = grid.getBoundingClientRect()
      out.battle_ratio = gr.height > 0 ? +(gr.width / gr.height).toFixed(3) : null
    } else {
      out.battle_ratio = null
    }
    out.question_card = box(card)
    out.question_card_fully_visible = !!(card &&
      card.getBoundingClientRect().bottom <= window.innerHeight &&
      card.getBoundingClientRect().top >= 0)
    out.hud = box(hud)
    out.update_notice = box(notice)

    // ⚠️ **选项区**（Story 1.19 第二轮量测）：选项数 / 列数 / 行数 / 是否全可见。
    //   「选项仍 4 列」这类判据**只对旧形状成立**（Story 2.4 之后单词卡是 2 个选项），
    //   ⇒ 必须量，不能靠旧文档里的字面量。
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
    out.options = {
      count: opts.length,
      // ⚠️ computed 的 \`gridTemplateColumns\` 给的是**用掉的**轨道值（如 \`"384px 384px"\`）
      //   ⇒ 拆成空格分隔的段数就是列数（比数 DOM 子元素更可靠：它数的是布局结果）。
      grid_columns: colsCss,
      column_count: colsCss ? colsCss.split(' ').filter(Boolean).length : 0,
      row_count: uniq(optTops).length,
      distinct_lefts: uniq(optLefts),
      box: box(optsEl),
      cards: opts.map(box),
      // 「全在视口内」＝ 每一张都在视口矩形内（横屏 AC-H1 的口径）
      all_visible: opts.every(function (el) {
        var r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight &&
               r.left >= 0 && r.right <= window.innerWidth
      }),
      // 文字溢出：\`scrollWidth > clientWidth\` ⇒ 词被裁掉（认读质量问题）
      text_overflow: qa('.question-card__options .option-card__text').map(function (t) {
        return {
          text: (t.textContent || '').slice(0, 40),
          scrollWidth: t.scrollWidth,
          clientWidth: t.clientWidth,
          overflow: t.scrollWidth > t.clientWidth
        }
      }).filter(function (x) { return x.overflow })
    }

    // 战场格子：单格尺寸 + 可建格数量（AC-H2 的「格子边长 ≥ --touch-min」靠前者）
    var cellsAll = qa('.battle-cell')
    out.battle_cell = cellsAll.length ? box(cellsAll[0]) : null
    out.cells_total = cellsAll.length
    out.plantable_cells = qa('.battle-cell:not(.is-house):not(.is-spawn)').length

    // 横向溢出：文档级 + \`.level-view\` 自身级（后者是横屏那块 \`overflow-y: auto\` 的容器）
    out.page_h_overflow = document.documentElement.scrollWidth > window.innerWidth
    out.level_view_h_overflow = view ? view.scrollWidth > view.clientWidth : null

    // 提示条与 HUD 是否重叠（AC-C3 的「不得遮挡」口径）
    out.notice_overlap_px = (notice && hud)
      ? Math.round(notice.getBoundingClientRect().bottom - hud.getBoundingClientRect().top)
      : null

    // ⚠️ **包含块判定**：\`position:absolute; inset:0\` 的子元素落在 padding box 还是 content box？
    //   绝对定位子元素的包含块**就是祖先的 padding box**（而 padding box 含 padding 区）
    //   ⇒ \`.level-view\` 的左右安全区 padding **不会**把浮层往里推。
    //   这条量测是 \`deferred-work.md\` 的 W7 更正所依据的实测。
    if (view) {
      var probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      view.appendChild(probe)
      var pr = probe.getBoundingClientRect(), vr = view.getBoundingClientRect()
      out.containing_block = {
        level_view_left: Math.round(vr.left),
        level_view_padding_left: window.getComputedStyle(view).paddingLeft,
        probe_left: Math.round(pr.left),
        on_padding_box: Math.round(pr.left) === Math.round(vr.left)
      }
      view.removeChild(probe)
    }

    var pre = document.createElement('pre')
    pre.id = '__measure'
    pre.textContent = JSON.stringify(out)
    document.body.appendChild(pre)
  }

  function start() {
    var btn = q('.start-button')
    // 🔥 没有「开始游戏」按钮也可能已经在关内（刷新后状态恢复）⇒ 照样量。
    if (btn) btn.click()
    // 🔥 等进场动画走完再量 —— 过早量到的是中间态。
    setTimeout(finish, 1500)
  }
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start)
})()
`

type Box = { top: number; bottom: number; left: number; right: number; w: number; h: number }

type Measured = {
  viewport: { w: number; h: number }
  diag: {
    start_button: boolean
    level_view: boolean
    body_classes: string[]
    app_html_length: number
    first_text: string
    notice_forced: boolean
    notice_scope_attr?: string | null
  }
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
    column_count: number
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
}

/* ── 判据清单 ────────────────────────────────────────────────────────────────
 * ⚠️ 每条都写明「**它能证明什么**」与「**它证明不了什么**」——
 *   一个不写「证明不了什么」的判据，下一个人会以为它是全覆盖的。
 */
type Check = { name: string; proves: string; run: (m: Measured) => { ok: boolean; why: string } }

const CHECKS: Check[] = [
  {
    // AC-D4 / AC-D6 —— 删掉 `@media (max-height: 900px)` 之后的核心判据。
    // 那个断点在时：`.battle-grid` 的 scoped `width: 100%` 与它那句 `width: auto`
    // 打起来是 scoped 赢（(0,3,0) > (0,2,0)），而它那句 `height: calc(...)`
    // **没有竞争者所以生效** ⇒ 宽高同时确定 ⇒ `aspect-ratio: 9/5` 失效
    // ⇒ 实测宽高比 **0.852**、题卡 `top=975` 掉出视口。
    name: 'battle-grid-宽高比由宽度推出',
    proves: '战场的盒子不是被高度压扁的（≈9/5 ≈ 1.8）；证明不了格子内部有没有挤',
    run: (m) => {
      if (m.battle_ratio === null)
        return { ok: false, why: '量不到 `.battle-grid` 的盒子 —— 判据空跑' }
      return {
        ok: Math.abs(m.battle_ratio - 1.8) < 0.25,
        why: `实测宽高比 ${m.battle_ratio}（期望 ≈1.8）；那个断点在时实测 0.852`,
      }
    },
  },
  {
    name: 'question-card-完整落在视口内',
    proves:
      '孩子看得见题（**这 5 条判据只判 800×1280**；矩阵里的其余视口只量不判）；' +
      '证明不了小屏与横屏',
    run: (m) => ({
      ok: m.question_card_fully_visible,
      why: m.question_card
        ? `题卡 top=${m.question_card.top} bottom=${m.question_card.bottom}，视口高 ${m.viewport.h}`
        : '量不到 `.question-card` —— 判据空跑',
    }),
  },
  {
    name: 'level-view-零滚动',
    proves: '竖屏靠「自缩放」装得下而不是靠滚动兜底；证明不了更矮的视口',
    run: (m) => {
      const v = m.level_view
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
      if (m.notice_overlap_px === null)
        return { ok: false, why: '既没渲染出提示条、也没合成出（scope 属性找不到）—— 判据空跑' }
      return {
        ok: m.notice_overlap_px <= 0,
        why: `重叠 ${m.notice_overlap_px}px（应 ≤ 0）${m.diag.notice_forced ? '，⚠️ 量的是合成的那条' : ''}`,
      }
    },
  },
  {
    name: 'level-outcome-浮层的包含块是 padding box',
    proves:
      'W7 更正的实测依据：`.level-view` 的左右安全区 padding **不会**把绝对定位浮层往里推；' +
      '证明不了浮层内容在横屏刘海下会不会被裁（那要真机）',
    run: (m) => {
      const cb = m.containing_block
      if (!cb) return { ok: false, why: '量不到包含块 —— 判据空跑' }
      return {
        ok: cb.on_padding_box,
        why:
          `probe_left=${cb.probe_left} level_view_left=${cb.level_view_left} ` +
          `padding-left=${cb.level_view_padding_left} ⇒ on_padding_box=${cb.on_padding_box}`,
      }
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
): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'plantsgame-portrait-'))
  try {
    cpSync(distDir, tmp, { recursive: true })

    const indexPath = join(tmp, 'index.html')
    const html = readFileSync(indexPath, 'utf8')
    if (!html.includes('</body>')) {
      throw new Error(`产物 ${distDir}/index.html 里没有 </body> —— 注入点没了`)
    }
    // ⚠️ **内联**脚本不触发 CSP 的 `unsafe-eval`，而量测脚本只读 DOM、不 `eval`。
    writeFileSync(indexPath, html.replace('</body>', `<script>${MEASURE_SCRIPT}</script></body>`))

    const server = createServer((req, res) => {
      const raw = decodeURIComponent((req.url ?? '/').split('?')[0]!)
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
      return await new Promise<string>((done, fail) => {
        // ⚠️ **不传 `encoding`** —— `spawn` 的那几个重载在同时给 `stdio` 与
        //   `encoding` 时会被解析成一个 `never` 的交叉类型（TS2339/TS7006）。
        //   这里自己把 Buffer 拼成字符串，顺带把 stdout / stderr 两路都留着排错。
        const proc = spawn(chromium, [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          `--window-size=${width},${height}`,
          '--virtual-time-budget=15000',
          '--dump-dom',
          url,
        ])
        let out = ''
        let err = ''
        proc.stdout?.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8')
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          err += chunk.toString('utf8')
        })
        const timer = setTimeout(() => {
          proc.kill('SIGKILL')
          fail(new Error(`浏览器 180s 还没退出。stderr 前 400 字符：\n${err.slice(0, 400)}`))
        }, 180_000)
        proc.on('error', (e: Error) => {
          clearTimeout(timer)
          fail(e)
        })
        proc.on('close', (code: number | null) => {
          clearTimeout(timer)
          if (code !== 0 && out.trim() === '') {
            fail(new Error(`浏览器以退出码 ${code} 结束且没有任何输出。stderr：\n${err.slice(0, 400)}`))
            return
          }
          done(out)
        })
      })
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()))
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function parseMeasured(dump: string): Measured {
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
  return JSON.parse(text) as Measured
}

/* ── 多视口量测模式（Story 1.19 第二轮 / Story 2.4 之后重测布局）────────────
 * ⚠️ **这是「量测」，不是「判据」** —— 那 5 条判据逐字写着「本脚本只量 800×1280
 *   这一个视口」，它们的语义与竖屏绑死。
 *   ⇒ 额外视口**只产出数字**，供人抄进 story 文档的实测表；**不参与退出码**。
 *
 *   视口清单来自**仓库里的矩阵文件** `scripts/measure-viewports.txt`
 *   （Story 1.19 的竖屏 7 个 + 横屏 7 个）⇒ 清单与代码分离，改设备只改文件。
 *   文件不存在 ⇒ 只跑那 5 条判据（旧的快路径，语义不变）。
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
function summaryOf(m: Measured): Record<string, unknown> {
  return {
    viewport: `${m.viewport.w}×${m.viewport.h}`,
    display: m.level_view_display,
    选项数: m.options.count,
    列数: m.options.column_count,
    行数: m.options.row_count,
    选项全可见: m.options.all_visible,
    题卡: m.question_card === null ? null : `${m.question_card.top}~${m.question_card.bottom}`,
    题卡全可见: m.question_card_fully_visible,
    战场: m.battle_grid === null ? null : `${m.battle_grid.w}×${m.battle_grid.h}`,
    格子: m.battle_cell === null ? null : `${m.battle_cell.w}`,
    可建格: `${m.plantable_cells}/${m.cells_total}`,
    页面横溢出: m.page_h_overflow,
    内部滚动: m.level_view === null ? null : m.level_view.scrollHeight > m.level_view.clientHeight,
    文字溢出: m.options.text_overflow.length,
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

  const run = await runBrowser(distDir, chromium, width, height)
  const measured = parseMeasured(run)

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

  // ── 多视口量测（**纯量测，不参与上面那 5 条判据**）──────────────────────
  const extra = readViewportMatrix(MATRIX_FILE)
  if (extra.length > 0) {
    const rows: Record<string, unknown>[] = []
    for (const vp of extra) {
      const m = parseMeasured(await runBrowser(distDir, chromium, vp.w, vp.h))
      rows.push(summaryOf(m))
    }
    console.log(`\n[portrait] 多视口实测（${extra.length} 个视口，纯量测，不参与通过判定）：`)
    console.log(JSON.stringify(rows, null, 2))
  }

  if (failed > 0) {
    console.error(
      '[portrait] 有项目不通过 —— 这不是「本机环境问题」，是竖屏布局真的坏了。\n' +
        '  ⚠️ 这台机器的字体与真实平板不同，真机结论仍以人工待验清单为准（AC-E6）。',
    )
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('[portrait] 跑不起来（这不是通过）：', err instanceof Error ? err.message : err)
  process.exit(1)
})
