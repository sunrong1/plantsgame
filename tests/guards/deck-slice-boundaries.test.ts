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

  it('store 调的是 core 的导出', () => {
    expect(storeSource).toMatch(/sliceDeckForLevel/)
  })

  it('🔥 app / 组件 / 视图层没有任何文件同时出现「已掌握清单」与「filter/slice」', () => {
    // 🔥📎 **这条是被变异 M174 逼出来的**（首版三条判据全绿 —— 假绿）。
    //   M174 的形态是往 `buildStateFor` 里塞一份 `localSlice` 复制品；
    //   首版那条 `masteredWordIds[\s\S]{0,120}?\.(?:filter|slice)\(` 的窗口
    //   **太短**：M174 在这两者之间插了一行注释与一条长签名，实际距离超过 120 字符
    //   ⇒ 判据纹丝不动地绿了（R-51：判据必须咬得住它要防的违规）。
    // ⇒ 改成「**同一文件里同时出现两者**」，与排版、注释、签名长度全无关。
    // ⚠️ 阈值不是凭空定的：实测 `src/app|components|views` 下**零个**文件
    //   同时含 `masteredWordIds` 与 `.filter(`/`.slice(`，所以今天它是干净的。
    const offenders: string[] = []
    for (const [path, source] of SRC) {
      if (!LAYER_PREFIXES.some((p) => path.startsWith(p))) continue
      if (looksLikeCopiedJudgement(source)) offenders.push(path)
    }
    expect(
      offenders,
      'app / 组件 / 视图层出现「已掌握清单 + filter/slice」—— 那就是切片判据的第二份实现（R-02）。' +
        '症状是 core 那份改了、这份没改，两处题单悄悄分叉，而所有测试都绿',
    ).toEqual([])
  })

  it('判据自测：上面那条能抓住 M174 的真实形态（R-53）', () => {
    // ⚠️ 逐字复刻 M174 落盘的那几行（含注释与长签名）——
    //   复刻不出来就说明判据只在我脑子里成立。
    const m174 =
      'const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)\n' +
      '// MUTATION M174: 复制一份判据到 app 层\n' +
      'const localSlice = (all: readonly typeof deck[number][], done: readonly string[]) =>\n' +
      '  all.filter((e) => !done.includes(e.entryId)).slice(0, QUESTIONS_PER_LEVEL)\n'
    expect(looksLikeCopiedJudgement(m174), '判据抓不住 M174 的形态 —— 这条守卫是装饰').toBe(true)

    // 而正确写法不该命中。
    const correct =
      'const deck = sliceDeckForLevel(entriesOf(unitNumber), progress.value.masteredWordIds)\n'
    expect(looksLikeCopiedJudgement(correct)).toBe(false)
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
    expect(offenders).toEqual([])
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

  it('判据自测：unitTotal 写成字面量时上面两条都会命中（R-53）', () => {
    expect('const unitTotal = 60').toMatch(/unitTotal\s*=\s*\d+/)
    expect('const unitTotal = QUESTIONS_PER_LEVEL').toMatch(
      /unitTotal\s*=\s*[^;]*QUESTIONS_PER_LEVEL/,
    )
    expect('const unitTotal = entriesOf(1).length').not.toMatch(/unitTotal\s*=\s*\d+/)
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
    // ⚠️ 判据形状：**不许**是「catch 里 console.warn 然后原样不动」——
    //   那条路径在重开应用时会把孩子留在「按空进度切出来的前 10 题」上，
    //   等于把学完的单元从头再教一遍（AC-B6 的 [DS] 裁决）。
    expect(body, '不许用「catch + 保持当前战场」处置空切片').not.toMatch(
      /catch[\s\S]{0,200}?console\.warn/
    )
  })
})
