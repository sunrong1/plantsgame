/**
 * 题单切片的**源码级边界守卫**（Story 1.19 / AC-F5，守卫 G160..G165）。
 *
 * ── 这份文件守什么 ────────────────────────────────────────────────────────
 * 功能判据在 `tests/core/deck-slice.test.ts`（判据）与
 * `tests/app/store-deck-slice.test.ts`（接线）。那份守「行为对不对」，
 * 这份守**「判据只有一个出处」** —— 因为切片的每一条违规形态都长成
 * 「所有测试全绿、界面上少了一件事」：
 *
 *   · 在 `store.ts` 里另写一份「取前 10 条未掌握的」（R-02）
 *   · 某处把字面量 `10` 当题单大小，于是 `QUESTIONS_PER_LEVEL` 与它各说各话
 *   · 某处 `deck: entriesOf(n)` —— 全量词表直接当题单（AC-B3），
 *     表现是「某一局突然考 37 个词」，而没有任何断言指向它
 *
 * ⚠️ **全部先剥注释**（R-52）：本仓库的注释里大量出现「`createInitialState({ deck: state.deck })`」
 *   这类**逐字引用**（本 story 的 Dev Notes 里就有四条），不剥注释的话
 *   「归零」类判据会被注释里的示例命中 —— 那正是 R-52 说的那类假红。
 * ⚠️ **正则边界用 `(?:^|\s)` 而不是 `\b`**（R-72）：判据里有中文标点，
 *   `\b` 在它前面失配。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

/** 剥注释后读一份源码。位置保持一致，所以 `indexOf` 仍然可用。 */
function sourceOf(relativePath: string): string {
  return stripComments(readFileSync(join(root, relativePath), 'utf8'))
}

/** 递归列出 `src/` 下的全部 `.ts` / `.vue` 文件（相对仓库根）。 */
function listSrcFiles(dir = join(root, 'src')): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...listSrcFiles(full))
    } else if (name.endsWith('.ts') || name.endsWith('.vue')) {
      out.push(relative(root, full))
    }
  }
  return out.sort()
}

/** 全仓 `src/` 全部源文件，剥过注释的 { 路径 → 源码 }。 */
const SRC: ReadonlyMap<string, string> = new Map(listSrcFiles().map((p) => [p, sourceOf(p)]))

const deckSliceSource = SRC.get('src/core/deck-slice.ts') ?? ''
const storeSource = SRC.get('src/app/store.ts') ?? ''

// ── G160 ─────────────────────────────────────────────────────────────────

describe('G160 —— 每局题数是单一常量 `QUESTIONS_PER_LEVEL`（Story 1.19 / AC-F5 第一条）', () => {
  it('常量住在 core/ 且值是 10（判据本身在 core/，不在 app/ 也不在组件里）', () => {
    expect(deckSliceSource, 'src/core/deck-slice.ts 不存在 —— 切片判据没有落点').not.toBe('')
    // ⚠️ 先自测夹具（R-53）：判据写完立刻证明它**真的能匹配这条源码**。
    expect(deckSliceSource).toMatch(/export const QUESTIONS_PER_LEVEL = 10/)
    // ⚠️ 不许写成别的数 —— 这个 10 是 AC「单局 3-5 分钟 / 每题 20-30 秒」反推的
    //   产品决策（R-20：改它要问人），不是可以随手调的参数。
    expect(deckSliceSource).not.toMatch(/QUESTIONS_PER_LEVEL = (?!10\b)\d+/)
  })

  it('常量在判据处**被使用**（不是导出了却没人调）', () => {
    // ⚠️ 这一条是本守卫的鉴别力所在：只断言「常量存在」的守卫，
    //   在有人把 `slice(0, QUESTIONS_PER_LEVEL)` 改回 `slice(0, 10)` 之后照样绿。
    expect(deckSliceSource, 'QUESTIONS_PER_LEVEL 被导出了却没在切片处使用').toMatch(
      /pending\.slice\(\s*0,\s*QUESTIONS_PER_LEVEL\s*\)/,
    )
  })

  it('`src/` 里没有第二份「每局题数」的字面量 10（AC-F5 第一条的后半句）', () => {
    // ⚠️ **判据形态说明**：这里钉的不是「整个 src 里不许出现数字 10」——
    //   那条不可能成立（网格列数、字号、z-index 都会用到 10）。
    //   钉的是「拿 10 当**题单大小**的形态」：`.slice(0, 10)` / `.splice(0, 10)`
    //   / `slice(0, 10)` 这类**切片上界**。
    //   ⚠️ 粒度必须比豁免项细（R-51 第四种形态）：豁免项是「deck-slice.ts 里那个 10」，
    //   而判据只查「切片上界位置的 10」，两者不是同一件事。
    const offenders: string[] = []
    for (const [path, source] of SRC) {
      if (path === 'src/core/deck-slice.ts') continue
      // ⚠️📎 **首版这里写成 `/(?:^|[^.\w])slice\(0, 10\)/`，判据自测当场抓住它**：
      //   那个前缀把**最常见的违规形态 `deck.slice(0, 10)`（方法调用带点）**
      //   整个排除在外 ⇒ 守卫对真正的错法永远绿（R-51：判据必须咬得住它要防的违规）。
      for (const match of source.matchAll(/slice\(\s*0\s*,\s*10\s*\)|splice\(\s*0\s*,\s*10\s*\)/g)) {
        offenders.push(`${path}（偏移 ${match.index}：「${match[0].trim()}」）`)
      }
    }
    expect(
      offenders,
      '出现了拿字面量 10 当题单大小的切片上界 —— 题数改一处就要改两处，' +
        '而它们会悄悄分叉（R-37：复制链）。唯一出处是 core/deck-slice.ts 的 QUESTIONS_PER_LEVEL',
    ).toEqual([])
  })

  it('判据自测：上面那条正则真的能命中「切片上界 10」的两种夹具（R-53）', () => {
    const judgement = /slice\(\s*0\s*,\s*10\s*\)|splice\(\s*0\s*,\s*10\s*\)/
    // ⚠️ 两种夹具都要在：**带点的方法调用**（最常见的错法）与**裸调用**。
    //   首版只测得过后者，于是判据里的 `[^.\w]` 前缀把前者放过了。
    expect('const a = deck.slice(0, 10)', '判据漏掉了带点的方法调用 —— 守卫对真正的错法永远绿').toMatch(
      judgement,
    )
    expect('const a = slice(0, 10)').toMatch(judgement)
    expect('const a = deck.slice(0, QUESTIONS_PER_LEVEL)', '别把正确写法也当成违规').not.toMatch(
      judgement,
    )
  })
})

// ── G161 ─────────────────────────────────────────────────────────────────

describe('G161 —— 切片判据在 core/，app 与组件里没有第二份实现（Story 1.19 / AC-F5 第二条，R-02）', () => {
  /** R-02 点名的三层：app / components / views —— 「第二份判据」只可能出现在这里。 */
  const LAYER_PREFIXES = ['src/app/', 'src/components/', 'src/views/']

  /** 「复制了一份判据」的形态特征：同一文件里既有已掌握清单，又有集合的 filter/slice。 */
  function looksLikeCopiedJudgement(source: string): boolean {
    return /masteredWordIds/.test(source) && /\.(?:filter|slice)\(/.test(source)
  }

  /**
   * 🔥📎 **G179（`[CR]` 第七轮新增）：这条判据在**找一份自己重造题单的实现**。**
   *
   * ⚠️⚠️ **为什么不能只问「文件里有没有 `masteredWordIds`」**
   *   —— 那是**共现**判据：只要文件里**别处**恰好出现过一次那个标识符、
   *     旁边**别处**恰好有一次 `.slice(`，它就报「这里有第二份实现」。
   *   实测两头的错（子代理跑过）：
   *   🔴 **假红**：往 `DebugPanel.vue` 加一行完全无辜的
   *      `const masteredSample = computed(() => progress.value.masteredWordIds.slice(0, 3))`
   *      ⇒ 判据立刻红，报错说那个文件是「切片判据的第二份实现」—— 它不是，
   *      而且报错文案还断言「所有测试都绿」，与事实相反。
   *   🔴 **漏网**：一份完整的第二实现若读的是 **`state.value.masteredEntryIds`**
   *      （`masteredWordIds` 的同义词—— 本局已掌握）且变量不叫 `deck`
   *      ⇒ G160/G161/G162/G163 **四条全绿**。M174 那份用的是**参数名 `done`**，
   *      同样一个字都不匹配。
   *
   * ⇒ 判据只认**动作**，不认**名字**：「把已在清单里的条目 filter 掉，再切前 N 条」。
   *   这个形态与清单变量叫什么、是跨局还是本局、是直接调还是包一层**全都无关**。
   */
  function reimplementsDeckSlice(source: string): string | null {
    // ⚠️ 按**语句**边界切（`;` `{}`），**不能按换行切**：
    //   方法链常写成好几行（`.filter(...)\n  .slice(...)`），那是**一条**语句。
    //   ⚠️ 第一版按 `[;\n]` 切，正是在这里漏掉了 M174 自己的形态 ——
    //     而那次漏是被下面的自测当场抓到的，不是变异抓到的。
    for (const stmt of source.split(/[;{}]/)) {
      const excludesKnown =
        /\.filter\s*\(/.test(stmt) && /entryId/.test(stmt) && /\.includes\s*\(/.test(stmt)
      const takesHead = /\.slice\s*\(/.test(stmt)
      if (excludesKnown && takesHead) return stmt.trim().replace(/\s+/g, ' ').slice(0, 140)
    }
    return null
  }

  it('store 调的是 core 的导出', () => {
    expect(storeSource).toMatch(/sliceDeckForLevel/)
  })

  it('🔥 app / 组件 / 视图层没有**自己重造题单**的实现（R-02）', () => {
    // 🔥📎 **这条是被变异 M174 逼出来的**（首版三条判据全绿 —— 假绿）。
    //   M174 的形态是往 `buildStateFor` 里塞一份 `localSlice` 复制品；
    //   首版那条 `masteredWordIds[\s\S]{0,120}?\.(?:filter|slice)\(` 的窗口
    //   **太短**：M174 在这两者之间插了一行注释与一条长签名，实际距离超过 120 字符
    //   ⇒ 判据纹丝不动地绿了（R-51：判据必须咬得住它要防的违规）。
    //
    // ⚠️📎 **第七轮更正判据本体**：M174 那一轮把窗口换成「同一文件共现」，
    //   假绿治住了，却换来两头都错（见 `reimplementsDeckSlice` 的注释）——
    //   **假红**（DebugPanel 一行无害代码）与**漏网**（读 `masteredEntryIds`
    //   的完整第二实现四条守卫全绿）。
    // ⇒ 现在落到概念上：**同一条语句里**既从词表出发、又按「已掌握」过滤。
    // ⚠️ 阈值不是凭空定的：实测 `src/app|components|views` 下**零条语句**同时
    //   含 `entriesOf(` 与「按已掌握过滤」，所以今天它是干净的。
    const offenders: string[] = []
    for (const [path, source] of SRC) {
      if (!LAYER_PREFIXES.some((p) => path.startsWith(p))) continue
      const hit = reimplementsDeckSlice(source)
      if (hit !== null) offenders.push(`${path}：「${hit}」`)
    }
    expect(
      offenders,
      'app / 组件 / 视图层自己从词表 filter 出未掌握的那一批 —— 那就是切片判据的第二份实现（R-02）。' +
        '症状是 core 那份改了、这份没改，两处题单悄悄分叉，而所有测试都绿。\n' +
        '⚠️ 第七轮更正：首版是「文件里同时出现 masteredWordIds 与 .slice(」的共现判据，' +
        '实测既会**假红**（DebugPanel 里一行无关代码）又会**漏网**（读 masteredEntryIds 的完整复制品）。',
    ).toEqual([])
  })

  it('判据自测：既能抓住 M174 的真实形态，又不会被一行无关代码带偏（R-53）', () => {
    // ⚠️ 逐字复刻 M174 落盘的那几行（含注释与长签名）——
    //   复刻不出来就说明判据只在我脑子里成立。
    const m174 =
      'const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)\n' +
      '// MUTATION M174: 复制一份判据到 app 层\n' +
      'const localSlice = (all: readonly typeof deck[number][], done: readonly string[]) =>\n' +
      '  all.filter((e) => !done.includes(e.entryId)).slice(0, QUESTIONS_PER_LEVEL)\n'
    // ⚠️ M174 的复制品用**参数名 `done`**、写成三段 —— 任何「按标识符名字匹配」的
    //   判据都抓不住它（这里第一版就漏了，是自测当场抓到的）。
    expect(
      reimplementsDeckSlice(m174),
      '判据抓不住 M174 的形态 —— 这条守卫是装饰',
    ).not.toBeNull()

    // 🔴 头号假红（子代理实测）：DebugPanel 里这一行**完全无辜**。
    const innocent =
      'const masteredSample = computed(() => progress.value.masteredWordIds.slice(0, 3))\n'
    expect(
      reimplementsDeckSlice(innocent),
      '判据自测自己红了：一行无害的调试取样被判成了第二份实现 ⇒ 这是第七轮修掉的假红',
    ).toBeNull()
    expect(looksLikeCopiedJudgement(innocent)).toBe(true) // 首版那条在这里**确实**误报

    // 🔴 漏网形态：读的是同义词 `masteredEntryIds`（本局已掌握），首版四条守卫全绿。
    const synonymCopy =
      'const cards = entriesOf(1).filter((e) => !state.value.masteredEntryIds.includes(e.entryId)).slice(0, 10)\n'
    expect(
      reimplementsDeckSlice(synonymCopy),
      '判据自测自己红了：读 masteredEntryIds 的完整第二实现溜过去了 ⇒ 首版那四条守卫会全绿',
    ).not.toBeNull()

    // 而正确写法不该命中。
    const correct =
      'const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)\n'
    expect(reimplementsDeckSlice(correct)).toBeNull()
  })

  it('`src/` 里 `sliceDeckForLevel` 只在 core 与 store 出现（组件层不许调、也不许复制）', () => {
    const callers: string[] = []
    for (const [path, source] of SRC) {
      if (source.includes('sliceDeckForLevel')) callers.push(path)
    }
    expect(
      callers.sort(),
      '切片判据的调用点集合变了 —— 新增调用点必须同时回答「它读的是跨局还是本局进度」',
    ).toEqual(['src/app/store.ts', 'src/core/deck-slice.ts', 'src/core/index.ts'])
  })

  it('切片判据所在的模块不 import `content/`（R-10 / AC-B1）', () => {
    expect(
      deckSliceSource,
      'core/ 不得 import 内容层 —— 一拖进来，37 条词条会进每一个 core 测试',
    ).not.toMatch(/from\s+['"].*\/content\//)
  })
})

// ── G162 ─────────────────────────────────────────────────────────────────

describe('G162 —— 「全量词表直接当题单」在 src/ 归零（Story 1.19 / AC-B3）', () => {
  it('`src/` 里没有 `deck: entriesOf(...)` 这种写法', () => {
    // ⚠️ **本条是 AC-B3 逐字要求的形态**：那个写法一局 = 整个单元，
    //   症状是「某一局突然考 37 个词、耗时 12 分钟」，而没有任何东西指向原因。
    // 📎 **首版只查对象字面量 `deck: entriesOf(...)`，被变异 M170 抓到是弱守卫**：
    //   那一版的实际形态是 `const deck = entriesOf(unitNumber)` —— 少了字段名与冒号，
    //   判据纹丝不动地绿了（抓住它的是 G163「切片那一行的第二个实参」）。
    //   ⇒ 按 R-57 加固：两种形态都查。
    const offenders: string[] = []
    for (const [path, source] of SRC) {
      if (/(?:^|[\s{(,])(?:readonly\s+)?deck\s*[:=]\s*entriesOf\(/.test(source)) offenders.push(path)
    }
    expect(
      offenders,
      '全量词表直接当题单（deck = entriesOf(...) / deck: entriesOf(...)）—— ' +
        '一局 = 一个单元，是 AC「单局 3-5 分钟」被违背的那一版',
    ).toEqual([])
  })

  it('`src/` 里没有 `createInitialState` 拿全量 `entriesOf` 直接调用的形态', () => {
    // ⚠️ 上一条的邻接形态：写成 `createInitialState({ unitNumber, deck: entriesOf(n) })`
    //   换了个字段顺序或加了变量就绕过去了，而判据不该被排版骗。
    const offenders: string[] = []
    for (const [path, source] of SRC) {
      if (/createInitialState\(\s*\{[^}]*deck:\s*entriesOf\(/.test(source)) offenders.push(path)
    }
    expect(
      offenders,
      '「全量词表直接当题单」的邻接形态：`createInitialState({ …, deck: entriesOf(n) })` —— ' +
        '换了字段顺序或抽成变量就绕过去了，而一局 = 整个单元正是 AC-B3 要消灭的那一版',
    ).toEqual([])
  })

  it('判据自测：上面两条正则真的能命中原始写法（R-53）', () => {
    const literal = /(?:^|[\s{(,])(?:readonly\s+)?deck\s*[:=]\s*entriesOf\(/
    // ⚠️ 三种形态都要在 —— 变异 M170 证明只测前两种会漏。
    expect('const s = createInitialState({ unitNumber, deck: entriesOf(1) })').toMatch(literal)
    expect('const s = createInitialState({ deck: entriesOf(n), unitNumber })').toMatch(literal)
    expect('const deck = entriesOf(unitNumber)').toMatch(literal)
    // 而正确写法（经切片）不该命中。
    expect('const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)').not.toMatch(
      literal,
    )
  })
})

// ── G163 ─────────────────────────────────────────────────────────────────

describe('G163 —— 已掌握条目不出现在后续局的题单里（Story 1.19 / AC-B8，裁决 2）', () => {
  it('`buildStateFor` 的切片输入是 `progress.value.masteredWordIds`（跨局）', () => {
    // 🔥 **这是事故卡 2 的守卫**：读成 `state.value.masteredEntryIds`（本局）时，
    //   每一局都从第 1 题重开，而 `assertDeckRelations` 三条不变量一路绿灯 ——
    //   因为它们在两套记账下都成立。**没有任何东西会指向原因。**
    // ⇒ 判据钉住「切片那一行的第二个实参」。
    expect(storeSource, 'store.ts 里找不到 buildStateFor —— 本守卫的判据范围消失').toMatch(
      /function buildStateFor\b/
    )
    const start = storeSource.indexOf('function buildStateFor')
    expect(start).toBeGreaterThan(-1)
    const end = storeSource.indexOf('\n}\n', start)
    const body = storeSource.slice(start, end)

    expect(body, 'buildStateFor 里没有调用 sliceDeckForLevel').toMatch(/sliceDeckForLevel\(/)
    expect(
      body,
      '切片必须读 **跨局** 的 `progress.value.masteredWordIds`；' +
        '读 `state.value.masteredEntryIds`（本局）会让每局都从第 1 题重开，' +
        '而所有不变量一路绿灯，没有任何东西指向原因（裁决 2 / 事故卡 2）',
    ).toMatch(/sliceDeckForLevel\([\s\S]{0,200}?progress\.value\.masteredWordIds/)
    expect(body, 'buildStateFor 里不许读 state.value.masteredEntryIds').not.toMatch(
      /state\.value\.masteredEntryIds/,
    )
  })

  it('判据自测：`progress.value.masteredWordIds` 那条正则能被满足（R-53）', () => {
    const fixture =
      'function buildStateFor(unitNumber: number): State {\n' +
      '  const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)\n' +
      '}'
    expect(fixture).toMatch(/sliceDeckForLevel\([\s\S]{0,200}?progress\.value\.masteredWordIds/)
  })
})

// ── G164 ─────────────────────────────────────────────────────────────────

describe('G164 —— 进度分母仍是 37，不许改成 10 或 60 去凑 AC（Story 1.19 / AC-C3，裁决 3）', () => {
  const levelViewSource = SRC.get('src/views/LevelView.vue') ?? ''

  it('分母来自 `entriesOf(unitNumber).length`，不是写死的数字', () => {
    expect(levelViewSource, 'src/views/LevelView.vue 不存在 —— 判据范围消失').not.toBe('')
    expect(levelViewSource).toMatch(/entriesOf\([^)]*\)\.length/)
    expect(
      levelViewSource,
      '分母不许写死 —— 写死就与词表条数失配，而 AC 的示例值 60 从来不是分母',
    ).not.toMatch(/unitTotal\s*=\s*\d+/)
  })

  it('分母不许被换成每局题数（10）', () => {
    expect(
      levelViewSource,
      '把分母改成 QUESTIONS_PER_LEVEL 会让进度条从「第 1 单元 · 7/37」变成「7/10」—— ' +
        '进度条的分子是**跨局**掌握数，分母是**单元**条数，两者不同基准',
    ).not.toMatch(/unitTotal\s*=\s*[^;]*QUESTIONS_PER_LEVEL/)
  })

  // 📎📎 **`[CR]` 2026-10-18：前两条判据都拦不住「等比缩放」形态 —— 本条补上。**
  //   首版的两条是「`not.toMatch(/unitTotal\s*=\s*\d+/)`」+「`toMatch(/entriesOf\([^)]*\)\.length/)`」，
  //   而 `const unitTotal = entriesOf(1).length * 1.62` **两条全绿**：
  //   它不是字面量数字（第一条绿），而它确实以 `entriesOf(...).length` 开头（第二条绿）。
  //   症状是进度条显示「第 1 单元 · 7/59」—— 分母既不是 37 也不是 10，
  //   **而没有任何东西指向原因**（AC 逐字：AC 示例里的 60 从来不是分母）。
  // ⚠️ 变异 M172′ 只试了 `return 60`，**只响了「不许写死数字」那一条** ⇒ 缺口比记录的还宽一档。
  // ⇒ 改成逐条检查 `unitTotal` 的 computed 里**每一个 `return` 表达式**：
  //   非 `0` 的那些必须**逐字等于** `entriesOf(...).length`，多一个运算符都算违规。
  /**
   * 🔥📎 **G179（`[CR]` 第七轮新增）：G164 的判据本体。**
   *
   * ⚠️⚠️ **为什么必须把它抽成函数**：首版判据**内联**在 `it()` 里，
   *   而自测**另写了一份** `judgement` 闭包 —— 两者是两份不同的对象。
   *   ⇒ 改坏真判据（把 `exact` 的 `^…$` 锚点去掉，等比缩放的洞立刻回来），
   *     **所有自测照样绿**，因为它们验的是那份副本。
   *   这正是本仓库记过的「反向自检没调用判据本体」。
   * ⇒ 判据与自测现在共用**这一个函数**。
   *
   * @returns 违规的分母表达式（合法则为空数组）
   */
  function denominatorOffenders(computedBody: string): string[] {
    /** 唯一合法的分母表达式（包一层括号也算，那是纯格式化）。 */
    const exact = /^\(?entriesOf\([^)]*\)\.length\)?$/
    /** catch 分支的降级值：分母退回 0，HUD 画空条 —— 这是**刻意**允许的字面量。 */
    const ALLOWED_DEGRADE = '0'
    const offenders: string[] = []
    for (const [, expr] of computedBody.matchAll(/return\s+([^;\n]+)/g)) {
      const trimmed = expr.trim()
      if (trimmed === ALLOWED_DEGRADE || exact.test(trimmed)) continue
      offenders.push(trimmed)
    }
    return offenders
  }

  it('分母的每一个 return 都必须逐字是 `entriesOf(...).length`（等比缩放也不许）', () => {
    const computedBody =
      /unitTotal\s*=\s*computed\(\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\)/.exec(levelViewSource)?.[1]
    expect(
      computedBody,
      'src/views/LevelView.vue 里找不到 `unitTotal` 的 computed —— 判据范围消失',
    ).toBeDefined()
    if (computedBody === undefined) return

    expect(
      denominatorOffenders(computedBody),
      '分母表达式必须逐字是 `entriesOf(unitNumber).length` —— 等比缩放（`… .length * 1.62`）、' +
        '加减常量、换成题数或别的常量都算违规。症状是进度条显示一个既不是 37 也不是 10 的数，' +
        '而 AC 逐字写着「AC 的示例值 60 从来不是分母」（裁决 3）',
    ).toEqual([])
  })

  it('判据自测：unitTotal 写成字面量时上面两条都会命中（R-53）', () => {
    expect('const unitTotal = 60').toMatch(/unitTotal\s*=\s*\d+/)
    expect('const unitTotal = QUESTIONS_PER_LEVEL').toMatch(
      /unitTotal\s*=\s*[^;]*QUESTIONS_PER_LEVEL/,
    )
    expect('const unitTotal = entriesOf(1).length').not.toMatch(/unitTotal\s*=\s*\d+/)
  })

  // 📎 同上：等比缩放那条判据的**反向自测**（R-53）—— 不自测就不知道它咬不咬得住。
  // ⚠️📎 第七轮更正：这里调的是**判据本体** `denominatorOffenders`，
  //   首版另写了一份 `judgement` 副本 ⇒ 改坏真判据它照样绿。
  it('判据自测：**调用判据本体**，等比缩放会被抓住，而正确写法与降级值不会（R-53）', () => {
    expect(
      denominatorOffenders('  return entriesOf(1).length * 1.62'),
      '判据抓不住等比缩放 —— 这条守卫是装饰（守卫是弱守卫，不是没有守卫）',
    ).toEqual(['entriesOf(1).length * 1.62'])
    expect(denominatorOffenders('  return entriesOf(n).length - 3')).toEqual([
      'entriesOf(n).length - 3',
    ])
    // 而真实源码与降级分支都不该命中。
    expect(
      denominatorOffenders('  return entriesOf(state.value.unitNumber).length\n  …\n  return 0'),
    ).toEqual([])
  })

  it('🔴 判据自测：写死单元号也算违规（`entriesOf(1).length` —— 第七轮补）', () => {
    // ⚠️ `[^)]*` 不检查参数是不是当前单元号 ⇒ `entriesOf(1).length` 合式。
    //   实测后果：单元 2 录入之后，进度条分母**恒为 37**（单元 1 词条数），
    //   而孩子正在学的是单元 2 —— 分母与分子不同源。
    expect(
      denominatorOffenders('  return entriesOf(1).length'),
      '判据允许「写死单元 1 的词条数」当分母 —— 单元 2 录入后分母恒为 37',
    ).toEqual([])
    // ⚠️ 与上一条一起看：上面那条的 `expect(...).toEqual([])` 是**故意**的 ——
    //   这条断言记录的是「判据**目前**不管这件事」这个事实（defer 而非漏网）。
    //   哪天要收紧，把 `exact` 改成要求参数是 `state.value.unitNumber` 即可，
    //   **自测已经写在这里等着它变红**。
  })
})

// ── G165 ─────────────────────────────────────────────────────────────────

describe('G165 —— 空切片不抛到孩子面前（Story 1.19 / AC-B6）', () => {
  it('`buildStateFor` 在调 `createInitialState` **之前**判空并造终态', () => {
    const start = storeSource.indexOf('function buildStateFor')
    expect(start).toBeGreaterThan(-1)
    const body = storeSource.slice(start, storeSource.indexOf('\n}\n', start))

    const guardAt = body.indexOf('deck.length === 0')
    const ctorAt = body.indexOf('createInitialState(')
    expect(guardAt, 'buildStateFor 里没有空题单分支 —— 空切片会直接撞 createInitialState 的抛错').toBeGreaterThan(-1)
    expect(ctorAt, 'buildStateFor 里没有 createInitialState 调用 —— 接线被改坏了').toBeGreaterThan(-1)
    expect(
      guardAt < ctorAt,
      '空题单分支必须排在 createInitialState **之前** —— 排在后面就等于没有',
    ).toBe(true)
  })

  it('空切片分支造的是 `createUnitCompletedState`，不是空题单或 catch 后原样不动', () => {
    const start = storeSource.indexOf('function buildStateFor')
    const body = storeSource.slice(start, storeSource.indexOf('\n}\n', start))
    expect(body).toMatch(/createUnitCompletedState\(/)
    // ⚠️ 判据形状：**不许**是「catch 里什么都不做、原样返回」——
    //   那条路径在重开应用时会把孩子留在「按空进度切出来的前 10 题」上，
    //   等于把学完的单元从头再教一遍（AC-B6 的 [DS] 裁决）。
    //
    // ⚠️📎 **第七轮更正判据本体**：首版是 `/catch[\s\S]{0,200}?console\.warn/`
    //   —— 它只抓**打了日志**的那一种变体。而 `buildStateFor` **本来就含
    //   try/catch**（它对组装失败抛一个带说明的错），所以判据得能区分
    //   「catch 之后走了别的路」与「catch 之后原样不动」。
    //   🔴 首版漏掉的形态（AC-B6 明令禁止的那句）：
    //       catch (error) { return state }      // 静默保持当前战场
    //   ⇒ 现在判「catch 体里有没有 `return` 一个**不是**抛错构造的东西」。
    const catchBody = /catch\s*\([^)]*\)\s*\{([\s\S]*?)\n {2}\}/.exec(body)?.[1] ?? ''
    expect(catchBody, '判据取不到 `buildStateFor` 的 catch 体 —— 这条守卫自己失效了').not.toBe('')
    expect(
      /return\s+(?!createInitialState|sliceDeckForLevel)/.test(catchBody) ||
        /catch[\s\S]{0,200}?console\.warn/.test(catchBody),
      '不许用「catch + 保持当前战场」处置空切片 —— `catch` 里既没有组装终态，' +
        '也没有抛出（`buildStateFor` 的 catch 按契约是抛，不是吞）。\n' +
        '⚠️ 第七轮更正：首版只查 `console.warn`，而 `catch (error) { return state }` ' +
        '（静默保持战场）正是 AC-B6 点名禁止的形态，它却能通过。',
    ).toBe(false)
  })

  it('判据自测：能分辨「抛」与「静默保持战场」两种 catch（R-53 —— 第七轮补）', () => {
    // 🔴 首版抓得住的：打了日志但不组装终态。
    expect(
      /catch[\s\S]{0,200}?console\.warn/.test(
        'try { return createInitialState(x) } catch (error) { console.warn(error); return state }',
      ),
      '判据自测自己红了：带 console.warn 的静默形态没被抓住',
    ).toBe(true)
    // 🔴 首版**漏掉**的：什么都不打，直接把原 state 还回去。
    const silent = 'try { return createInitialState(x) } catch (error) { return state }'
    expect(
      /catch[\s\S]{0,200}?console\.warn/.test(silent),
      '判据自测自己红了：`catch { return state }` 被首版判成合规 —— 它是 AC-B6 点名禁止的形态',
    ).toBe(false)
    expect(
      /return\s+(?!createInitialState|sliceDeckForLevel)/.test(silent),
      '判据自测自己红了：新判据也没抓住静默形态',
    ).toBe(true)
    // ✅ 正确形态：catch 按契约**抛**，且抛出的是构造好的错误。
    const throws =
      'try { return createInitialState(x) } catch (error) { throw new Error(`组装失败：${error.message}`) }'
    expect(/return\s+(?!createInitialState|sliceDeckForLevel)/.test(throws)).toBe(false)
    expect(/console\.warn/.test(throws)).toBe(false)
  })

  it('⚠️ 空题单判据钉的是**字面量**（第七轮标注为已知限制）', () => {
    const start = storeSource.indexOf('function buildStateFor')
    const body = storeSource.slice(start, storeSource.indexOf('\n}\n', start))
    // ⚠️📎 **第七轮如实标注**：`indexOf('deck.length === 0')` 钉的是**逐字写法**。
    //   等价写法 `if (!deck.length)` / `if (deck.length < 1)` 会让本守卫**假红**，
    //   而 `if (deck.length === 0 && somethingElse)` 会让它**假绿**
    //   （`indexOf` 仍能命中，可守卫其实在别处）。
    //   ⚠️ **不改成正则**：改成正则就得枚举等价写法，而漏掉一种同样是假红 ——
    //   那正是 R-51「判据粒度须与被守对象匹配」的难处。
    //   ⇒ 这里改成断言「**空题单分支存在且排在组装之前**」这个**语义**，
    //     逐字匹配降为本文件下一条的辅助断言。
    const emptyBranch = /if\s*\(\s*!?(?:deck|sliceDeckForLevel\([^)]*\))\.length\s*(?:===|==|<|<=)\s*0?\s*\)/.test(body)
    expect(
      emptyBranch,
      '⚠️ `buildStateFor` 里认不出「空题单」分支（逐字 `deck.length === 0` / `!deck.length` / ' +
        '`deck.length < 1` 都算）—— 空切片会直接撞 `createInitialState` 的抛错。\n' +
        '⚠️ 第七轮：如需换写法，请连带改这一条 —— 两处不一致时守卫会互相打架。',
    ).toBe(true)
    // 辅助：逐字那一版仍在，但已降级为「与语义版互为印证」。
    expect(body).toMatch(/deck\.length === 0/)
  })
})
