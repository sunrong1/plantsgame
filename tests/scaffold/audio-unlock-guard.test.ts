/**
 * 「解锁链路禁 await」这条静态守卫的回归测试（Story 1.2 / AC-10）。
 *
 * FR2 是本项目唯一一个「写了 await 就彻底失效、且编译与运行都不报错」的验收：
 * 手势上下文被让出后 Android 音频解锁只是**静默**失败，没有异常、没有警告。
 * 纯手工验收意味着半年后某次重构在某处补了个 `await`，边界静默失效。
 *
 * ⚠️ 必须 import 真实 eslint 配置求值后检查规则对象，**不得**用子串匹配
 * （Story 1.1 `[CR]` Debug Log #7 的教训）：三个互相独立的字符串检查
 * 可以由三个不同的 config 块分别满足 —— 把规则挪走、降级成 'warn'、追加 'off'
 * 都照样全绿。这里断言的是「规则对象本身」：严重级别 + selector + 覆盖文件名单。
 *
 * ── 2026-10-26 夜：DF-006 / DF-043 结清（两处假绿）────────────────────────
 *
 * **假绿一：手写的 `matchesGlob` 看不见字符类 `[...]`。**
 *   原实现把 `[` `]` 当字面量 ⇒ `src/services/[st]*.ts` 对它**不可见**。
 *   实测（拿 ESLint 自己的解析器逐条对账）：那条模式**真的**覆盖了
 *   `src/services/save.ts`，而旧 `matchesGlob` 说「没覆盖」
 *   ⇒ 守卫会判「save.ts 安全」而 ESLint 真的在禁它 ⇒ **假绿**。
 *   ⇒ 修法：字符类先摘成占位符（类里的 `*` `?` 是字面量），再走通配替换。
 *
 * **假绿二：守卫名单少了一个文件。**
 *   `eslint.config.js` 的禁 await 块覆盖**四个**文件
 *   （`audio.ts` / `pronunciation.ts` / `effects-runner.ts` / `audio-unlock.ts`），
 *   而守卫的名单只写了**三个** —— 1.14 加 `effects-runner.ts`（AC-G8）时漏更了。
 *   ⇒ 那个文件的严重级别 / ignores / 存在性 / 是否真的报出来，**一条都没人守**。
 *   ⇒ 修法：名单补齐，并加一条**漂移断言**（配置里的每个精确路径都必须在名单里）。
 *
 * **DF-043 的恢复条件是「引入 minimatch 做交叉校验」** —— minimatch 会与 ESLint
 * 在 ESLint 自己那条「通用模式」规则上分叉（实测 `src/**` 对 `src/save.ts`：
 * minimatch 说 true、ESLint 说 false）⇒ 本文件改用**ESLint 自己的解析器**当
 * oracle（`calculateConfigForFile`），那才是唯一不会分叉的权威。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖源码书写风格 / 手写 glob 语义）──────
 * 本轮**真做了**两个变异（M394 / M395），因为这两条判据都是**手写实现**：
 * 一个写错了没人看得出来的 glob 语义差异，恰恰就是 DF-006 的成因。
 *   **M394**：把字符类的翻译摘掉（`return \`[${body}]\`` —— 退回「括号当字面量」
 *   的老行为）⇒ `grep` 证实落盘 ⇒ **4 红**：三条字符类自测 + G328 的对账；
 *   且 G328 的报错**逐条点名了四个分叉的（模式, 文件）对**
 *   （`src/services/[st]*.ts || src/services/save.ts ⇒ 本实现 false，ESLint true`）
 *   ⇒ 判据落在**后果**上，不是「实现里有没有某个分支」这种写法级判据。
 *   已复原（`grep` 复核那一行逐字相同）。
 *   **M395**：把 `src/app/effects-runner.ts` 从守卫名单里删掉
 *   ⇒ **1 红**：新加的漂移断言，且报错**点名了那个文件**
 *   ⇒ 「配置加了文件、守卫没跟上」这个方向确实有人守。已复原。
 */
import { describe, expect, it } from 'vitest'

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ESLint, Linter } from 'eslint'

import eslintConfig from '../../eslint.config.js'
import { rulesForFile, severityOf } from '../fixtures/eslint-rules'

interface EslintBlock {
  files?: string | string[]
  ignores?: string[]
  rules?: Record<string, unknown>
}

/**
 * 判断一个 `eslint.config.js` 的 `files` 模式是否覆盖某个文件。
 *
 * ⚠️ 按 ESLint 自己的 glob 语义匹配，而不是字符串相等。精确相等会把
 * 「等价且更合理的写法」误判成「守卫失效」：把 `'src/services/audio.ts'`
 * 重构成「一条覆盖整个 `src/services` 目录的通配」时，守卫其实完全有效，
 * `rulesFor` 却会因为字符串不相等而返回空 —— 于是守卫测试误报红。
 * —— `[CR]` 2026-10-12 的 P16。
 *
 * 只实现 ESLint 用到的通配（`*` `**` `?`）加 `{a,b}` 选择与字符类 `[...]`，
 * 不引入 minimatch 依赖：本文件自己也要被 lint，不能为了它拉一个包。
 * ⚠️ 语义**不靠记忆**，靠本文件末尾那条「与 ESLint 自己的解析器逐条对账」兜底。
 */

/**
 * 字符类占位符的前缀 —— 摘出来的字符类在**最后**一步才还原。
 *
 * ⚠️ 为什么用可打印字符而不是控制符：控制符（U+0000）在源码里是**不可见字节**，
 *   grep 会把整个文件当二进制处理（本轮就踩过：`grep` 静默无输出，
 *   差点以为文件写坏了），`git diff` 也看不出它改了什么。
 * ⇒ 改用一个「路径模式里不会出现」的 token；代价是「理论上可被撞」，
 *   撞上的后果是模式里同名片段被误当成类 —— 比控制符更可见、更易查。
 */
const CHAR_CLASS_MARK = '__CHAR_CLASS_'
/** 双星通配（`**`）与「双星加斜杠」的占位符 —— 先占位再还原，免得还原出的 `.*` 被后面的步骤再改一遍。 */
const GLOBSTAR_DIR = '\u0000'
const GLOBSTAR = '\u0001'

const matchesGlob = (pattern: string, file: string): boolean => {
  // ⚠️ 短路条件必须把 `[` 也算进去 —— 只认 `*?{` 的话，一个**只有**字符类的
  // 模式（`src/x/[a-c].ts` 这种没有通配符的）会被拿去跟文件路径做**字符串相等**，
  // 判据就落在一条它并不保证的路径上了。
  if (!/[*?{[]/.test(pattern)) {
    return pattern === file
  }

  // ── 第 0 步：字符类先摘成占位符 ────────────────────────────────────────
  //   minimatch 语义：`[st]` 是「s 或 t」、`[!st]` / `[^st]` 是取反、
  //   `[a-c]` 是区间；类**内部**的 `*` `?` `{` `}` 都是字面量。
  //   ⇒ 必须在通配替换**之前**摘出来，否则类里的 `*` 会被当成通配。
  const classes: string[] = []
  const regex = pattern
    .replace(/\[([^\]]*)\]/g, (_all, body: string) => {
      const negate = body.startsWith('!') || body.startsWith('^')
      const inner = negate ? body.slice(1) : body
      // 类内只需处理正则元字符：`-` 保留（区间语义），`^` 只在首位表示取反。
      // 反斜杠直接丢掉（`\]` 这种转义写法在 eslint 配置里不出现，
      // 而留着它会拼出**非法**的正则字符类，`new RegExp` 直接抛）。
      const safe = inner.replace(/\\/g, '').replace(/\^/g, '\\^')
      if (safe === '') {
        // 空类（`[]`）：拼出 `[]` 是非法正则 ⇒ 按**字面量 `[`** 处理。
        return '['
      }
      classes.push(`[${negate ? '^' : ''}${safe}]`)
      return `${CHAR_CLASS_MARK}${classes.length - 1}__`
    })
    // ⚠️ 替换顺序是这份实现的全部难点，动任何一步之前先读这三条：
    //  ⓪ 字符类**最先**摘走（上面第 0 步）：它必须在转义之前 ——
    //     否则 `[` `]` 被转义掉，类就再也认不出来；也必须在通配之前，
    //     否则类里的 `*` 会被当成通配；
    //  ① 再转义正则元字符（`*` `?` `{` `}` 不在其中，保持可解释）；
    //  ② 再处理通配，顺序为 **/ → ** → * → ?；
    //  ③ `{a,b}` 必须**最后**展开。展开出的是 `(?:ts|vue)`，
    //     若放在 ② 之前，它那个 `?` 会被 ② 的 `?` → `[^/]` 吃掉，
    //     模式退化成 `([^/]:ts|vue)`；若放在 ① 之前，它的 `(` `)` `|`
    //     会被 ① 逃逸掉，模式退化成字面量。两条都实测踩过。
    .replace(/[.+^$()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, GLOBSTAR_DIR)
    .replace(/\*\*/g, GLOBSTAR)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(new RegExp(GLOBSTAR_DIR, 'g'), '(?:.*/)?')
    .replace(new RegExp(GLOBSTAR, 'g'), '.*')
    .replace(/\{([^}]*)\}/g, (_all, group: string) => `(?:${group.split(',').join('|')})`)

  // 字符类占位符还原（**最后**一步 —— 类里的 `*` `?` 必须是字面量）
  let out = regex
  classes.forEach((cls, i) => {
    out = out.replace(new RegExp(`${CHAR_CLASS_MARK}${i}__`, 'g'), cls)
  })

  return new RegExp(`^${out}$`).test(file)
}

/**
 * ⚠️ `[CR]` 2026-10-16 删除 —— 这里原来还有**第二份** `rulesFor`。
 *
 * 它比 fixture 里那份更聪明一点（用了 `matchesGlob`），但**同样看不见 `ignores`**，
 * 同样会把「更窄 glob 在后面覆盖掉这条规则」的情形漏掉 —— 本文件那条
 * `ignores` 断言正是为此而加，说明作者当时已经知道这个洞，却只补了 `ignores` 一半。
 * ⇒ 统一走 `fixtures/eslint-rules.ts` 的 `rulesForFile()`（ESLint 自己的解析器）。
 */

/** 配了 no-restricted-syntax 的全部 files 模式。 */
const guardedPatterns = (): string[] =>
  (eslintConfig as unknown as EslintBlock[])
    .filter((block) => block.rules?.['no-restricted-syntax'])
    .flatMap((block) => (Array.isArray(block.files) ? block.files : [block.files!]))
    .filter(Boolean) as string[]

/**
 * 禁 await 的**全部**受保护文件。
 *
 * ⚠️ 2026-10-26 夜补上 `src/app/effects-runner.ts` —— 1.14 加它进
 * `eslint.config.js`（AC-G8）时漏更了守卫的名单 ⇒ 它的严重级别 / ignores /
 * 存在性 / 是否真的报出来，**一条都没人守**。
 */
const AWAIT_GUARDED_FILES = [
  'src/services/audio.ts',
  'src/services/pronunciation.ts',
  'src/app/effects-runner.ts',
  'src/app/audio-unlock.ts',
]

describe('音频解锁链路禁 await（AC-10）', () => {
  it.each(AWAIT_GUARDED_FILES)('%s 上配了 no-restricted-syntax，且严重级别是 error', async (file) => {
    const rule = (await rulesForFile(file))['no-restricted-syntax']

    expect(rule, `${file} 上没有 no-restricted-syntax 规则`).toBeDefined()
    // 'warn' 不会让 `npm run lint` 失败（没有 --max-warnings），等于没守
    expect(severityOf(rule), '严重级别必须是 error —— warn 不会让 `npm run lint` 失败，等于没守').toBe('error')
  })

  it('禁的正是 AwaitExpression（不是别的表达式，也不是空禁列）', async () => {
    for (const file of AWAIT_GUARDED_FILES) {
      const rule = (await rulesForFile(file))['no-restricted-syntax']
      const options = (Array.isArray(rule) ? rule[1] : undefined) as
        | { selector?: string }
        | undefined

      expect(options?.selector, `${file} 的禁列没有 selector`).toBe('AwaitExpression')
    }
  })

  it('守卫刻意只覆盖这几个文件 —— 扩到 src/services/ 会挡住 Story 1.14 的 save.ts', () => {
    const guarded = guardedPatterns()

    expect(guarded, '守卫名单必须含这几个文件 —— 少一个就有文件不受禁 await 保护').toEqual(
      expect.arrayContaining(AWAIT_GUARDED_FILES),
    )

    // ⚠️ 用 glob 语义判定「有没有哪个模式会覆盖到 save.ts」，
    // 而不是去黑名单几个字面量 —— `'src/services/*'`、`'src/services/**'`、
    // `'src/services/**/*.ts'`、`'src/services/*.{ts,vue}'` 全都要挡住。
    // 原写法只列了前两种，其余写法照样全绿而 save.ts 被误伤。
    const wouldCoverSave = guarded.some((pattern) => matchesGlob(pattern, 'src/services/save.ts'))
    expect(wouldCoverSave, `守卫覆盖到了 save.ts（模式：${guarded.join(', ')}）`).toBe(false)
  })

  /**
   * ⚠️ 2026-10-26 夜新增 —— 补上「配置加了文件、守卫没跟上」这个方向的漂移。
   *
   * 上面那条只守一个方向：**名单里的文件**在配置里被覆盖。
   * 反方向没人守：有人往 `eslint.config.js` 的禁 await 块里加一个新文件
   * （1.14 加 `effects-runner.ts` 就是这么发生的），那个文件**立刻**受禁 await 保护
   * —— 而守卫**一无所知**：它不查那个文件的严重级别、不查它有没有被 `ignores`
   * 排除、不查它是不是真的存在、甚至不查它是不是幽灵路径。
   * ⇒ 这里断言：配置里**写成精确路径**的每一条，都必须在守卫名单里。
   *
   * ⚠️ 口径：只查**精确路径**（不含通配符的）。配置若改写成通配，
   *   这条断言会**空转**（扫不到精确路径）—— 所以下面先断言「扫到了至少一条」，
   *   让人看得见它空转了，而不是让它悄悄失去意义。
   */
  it('eslint.config.js 的禁 await 覆盖名单里，每个精确路径都在守卫名单里（1.14 那次漂移的补洞）', () => {
    const exactPaths = guardedPatterns().filter((pattern) => !/[*?{[]/.test(pattern))

    expect(
      exactPaths.length,
      '一条精确路径都没扫到 —— 判据在空集上成立（配置若改成了通配写法，这条要改判据）',
    ).toBeGreaterThan(0)

    const unknown = exactPaths.filter((pattern) => !AWAIT_GUARDED_FILES.includes(pattern))
    expect(
      unknown,
      `eslint.config.js 的禁 await 名单里有文件不在守卫名单里（${unknown.join(', ')}）—— ` +
        '那个文件不受本守卫的严重级别 / ignores / 存在性 / 触发性检查，而守卫照绿' +
        '（1.14 加 effects-runner.ts 时就漏过一次）',
    ).toEqual([])
  })

  it('守卫不扩大到 src/services/ 的其他文件', () => {
    const guarded = guardedPatterns()

    for (const other of [
      'src/services/save.ts',
      'src/services/effects.ts',
      'src/services/word-audio.ts',
    ]) {
      expect(
        guarded.some((pattern) => matchesGlob(pattern, other)),
        `${other} 不该被这条守卫覆盖（模式：${guarded.join(', ')}）`,
      ).toBe(false)
    }
  })

  it('守卫有意不覆盖 views/ —— FR2 管的是「三步之间」，不是「三步之后」', () => {
    // 覆盖名单是有意为之，不是遗漏。见 eslint.config.js 里那条注释。
    const guarded = guardedPatterns()

    expect(
      guarded.some((glob) => String(glob).includes('views/')),
      '守卫不得覆盖 views/ —— FR2 管的是「三步之间」，覆盖 views/ 会把无关代码一起禁掉',
    ).toBe(false)
  })

  /**
   * ⚠️ `[CR]` 2026-10-16 新增 —— 原守卫测试的一个**结构性**假绿出口。
   *
   * flat config 的 `ignores` 是**全局排除**：命中后 ESLint 连 lint 都不做。
   * 而 `rulesFor` / `guardedPatterns` 只遍历 `rules` 块、**从不读 `ignores`**，
   * 于是往 `eslint.config.js` 的第一个配置块里加一行
   * `'src/services/pronunciation.ts'`，FR2 的机器守卫就此彻底失效 ——
   * 而本文件的断言**全部照绿**。
   *
   * 已实测（变异）：注入 ignores → `vitest` 13 passed，
   * 同时 `npx eslint src/services/pronunciation.ts` 报
   * `File ignored because of a matching ignore pattern`；
   * 而 lint 脚本是 `eslint .`，被 ignore 的文件是**静默跳过**，连警告都没有。
   *
   * ⇒ 「规则没被挪走 / 没被降级」与「规则还真的在跑」是两件事，
   * 后者此前无人守。
   */
  it('解锁链路的受保护文件不在任何 ignores 里 —— 否则守卫形同虚设', () => {
    const ignores = (eslintConfig as unknown as EslintBlock[])
      .flatMap((block) => (Array.isArray(block.ignores) ? block.ignores : []))
      .filter(Boolean)

    for (const file of AWAIT_GUARDED_FILES) {
      const hit = ignores.find((pattern) => matchesGlob(pattern, file))
      expect(
        hit,
        `${file} 被 eslint 的 ignores（${hit}）排除 —— ESLint 根本不会 lint 它，` +
          '禁 await 守卫已失效，而规则对象本身仍然存在（本文件其余断言会照绿）',
      ).toBeUndefined()
    }
  })

  it('守卫名单里的文件真实存在（改名/移走会让整条守卫静默失效）', () => {
    // ⚠️ `[CR]` 2026-10-16：`AWAIT_GUARDED_FILES` 是测试里的常量，与磁盘上的真实文件名
    //   **没有任何耦合**。有人把 `pronunciation.ts` 改名（无论是否同步改了 eslint 配置），
    //   本文件的断言照绿，而 FR2 守卫已经守着一个不存在的文件。
    //   同理，Story 1.13 把 `prewarmBgm` 落进新文件时，新文件不在 `files` 名单里，
    //   禁 await 规则对它自动失效 —— 这条守卫断言不了「新增的解锁链路文件也被覆盖」，
    //   但至少能断言「名单里的文件不是幽灵」。
    for (const file of AWAIT_GUARDED_FILES) {
      expect(
        existsSync(resolve(process.cwd(), file)),
        `${file} 不在磁盘上，但守卫名单里写着它 —— 改名或移走会让守卫静默失效`,
      ).toBe(true)
    }
  })

  it('eslint 确实会在这几个文件上报 AwaitExpression（真跑一次 linter，而不是只看规则对象）', () => {
    // ⚠️ 这条是上面两条的补强：前两条断言「配置长得对」，这条断言「配置真的生效」。
    //   `no-restricted-syntax` 是**核心规则**（不是插件规则），可以直接用
    //   `Linter.verify` 对一段带 `await` 的文本求值，无需真的落盘。
    //
    //   为什么必须真跑：`no-restricted-syntax` 命中与否还取决于该文件有没有被
    //   匹配到对应的 config 块、该块有没有被后续块的同名规则覆盖 ——
    //   这些都不是「规则对象里有个 no-restricted-syntax 键」能证明的。
    const linter = new Linter()
    const probe = 'export async function f(): Promise<void> { await Promise.resolve() }'

    for (const file of AWAIT_GUARDED_FILES) {
      const messages = linter.verify(probe, eslintConfig as never, file)
      const hit = messages.find((m) => m.ruleId === 'no-restricted-syntax')
      expect(
        hit,
        `${file} 上没有触发 no-restricted-syntax —— 配置看起来对，但没有真的生效` +
          `（实际报出：${messages.map((m) => m.ruleId ?? '(parse)').join(', ') || '无'}）`,
      ).toBeDefined()
    }
  })
})

/**
 * `matchesGlob` 自己的自测。
 *
 * 守卫测试的正确性完全建立在它之上：它一旦悄悄失灵，上面每一条断言都会
 * 变成恒真或恒假 —— 那正是本文件开头引用的 Story 1.1 `[CR]` #7 那类假绿。
 */
describe('matchesGlob 自测（P16）', () => {
  it('精确路径按相等匹配', () => {
    expect(matchesGlob('src/services/audio.ts', 'src/services/audio.ts'), '同一条路径必须命中 —— 不命中则守卫对这条文件形同虚设').toBe(true)
    expect(matchesGlob('src/services/audio.ts', 'src/services/save.ts'), '不同路径必须不命中 —— 命中则 save.ts 会被误伤（1.14 的老账）').toBe(false)
  })

  it('* 不跨 /，** 跨 /', () => {
    expect(matchesGlob('src/services/*', 'src/services/save.ts'), '单层通配必须命中同目录文件').toBe(true)
    expect(matchesGlob('src/services/*', 'src/services/deep/save.ts'), '单层通配不得跨目录 —— 跨了就误伤 save.ts').toBe(false)
    expect(matchesGlob('src/services/**', 'src/services/deep/save.ts'), '双星通配必须跨目录').toBe(true)
  })

  it('**/ 可匹配零层目录', () => {
    expect(matchesGlob('src/services/**/*.ts', 'src/services/save.ts'), '**/ 必须匹配零层目录 —— 少一层就误伤 save.ts').toBe(true)
    expect(matchesGlob('src/services/**/*.ts', 'src/services/deep/save.ts'), '**/ 必须匹配一层目录').toBe(true)
    expect(matchesGlob('src/services/**/*.ts', 'src/services/deep/deeper/save.ts'), '**/ 必须匹配多层目录').toBe(true)
    expect(matchesGlob('src/services/**/*.ts', 'src/app/save.ts'), '**/ 不得跨出 services/ —— 跨了就误伤 app 层').toBe(false)
  })

  it('{a,b} 选择', () => {
    expect(matchesGlob('src/services/*.{ts,vue}', 'src/services/save.ts'), '花括号选择必须命中 .ts').toBe(true)
    expect(matchesGlob('src/services/*.{ts,vue}', 'src/services/Panel.vue'), '花括号选择必须命中 .vue').toBe(true)
    expect(matchesGlob('src/services/*.{ts,vue}', 'src/services/notes.md'), '花括号选择不得命中 .md —— 命中就误伤非代码文件').toBe(false)
  })

  it('点号按字面处理 —— `.` 是字面点，不是正则的任意字符', () => {
    // ⚠️ `[CR]` 二轮 2026-10-12：原用例用 `'src/a.b/c.ts'`，而 `matchesGlob`
    // 对不含 `*?{` 的模式会**短路成字符串相等** —— 于是两条断言都走的是那条短路，
    // 根本没进到下面 `.replace(/[.+^$()|[\]\\]/g, ...)` 的转义分支。
    // 而转义顺序恰恰是这个自测文件自己声明的「全部难点」。
    // 所以这里必须用**带通配符**的模式，逼它走转义路径：
    // 若 `.` 没被转义，`src/*/c.ts` 会把 `aXb` 也当成命中。
    expect(matchesGlob('src/*/c.ts', 'src/a.b/cXts'), '`.` 被当成了正则的任意字符').toBe(false)
    expect(matchesGlob('src/*/c.ts', 'src/a.b/c.ts'), '转义后的点号必须仍匹配字面点 —— 不匹配则通配模式整体失灵').toBe(true)

    // 无通配符时的短路分支同样要有覆盖（精确路径按相等匹配）
    expect(matchesGlob('src/a.b/c.ts', 'src/aXb/c.ts'), '短路分支必须按字面相等 —— 放行 `aXb` 就等于把点号当通配').toBe(false)
    expect(matchesGlob('src/a.b/c.ts', 'src/a.b/c.ts'), '短路分支必须命中完全相同的路径').toBe(true)
  })

  /**
   * ⚠️ 2026-10-26 夜新增 —— 字符类 `[...]`（DF-006 的那个洞）。
   *
   * 这几条是 DF-006 记的那个失败模式的**原样重演**：
   * 旧实现把 `[` `]` 当字面量 ⇒ `src/services/[st]*.ts` 对它不可见
   * ⇒ 守卫会说「save.ts 没被覆盖」，而 ESLint 真的覆盖了它 ⇒ **假绿**。
   */
  it('字符类 `[st]` 按 minimatch 语义匹配（DF-006）', () => {
    expect(matchesGlob('src/services/[st]*.ts', 'src/services/save.ts'), '字符类必须被认出来 —— 否则 save.ts 会被误判成「没被覆盖」，而 ESLint 真的在禁它').toBe(true)
    expect(matchesGlob('src/services/[st]*.ts', 'src/services/pronunciation.ts'), '字符类不得匹配类外的字母').toBe(false)
    expect(matchesGlob('src/app/[ae]*.ts', 'src/app/effects-runner.ts'), '字符类必须命中类内的首字母').toBe(true)
    expect(matchesGlob('src/app/[ae]*.ts', 'src/app/store.ts'), '字符类不得命中类外的首字母').toBe(false)
  })

  it('取反类 `[!st]` / 区间类 `[a-c]`（DF-006）', () => {
    expect(matchesGlob('src/services/[!st]*.ts', 'src/services/save.ts'), '取反类不得匹配被排除的字母 s').toBe(false)
    expect(matchesGlob('src/services/[!st]*.ts', 'src/services/pronunciation.ts'), '取反类必须匹配没被排除的字母 p').toBe(true)
    expect(matchesGlob('src/app/[a-c]*.ts', 'src/app/audio-unlock.ts'), '区间类必须匹配区间内的首字母 a').toBe(true)
    expect(matchesGlob('src/app/[a-c]*.ts', 'src/app/store.ts'), '区间类不得匹配区间外的首字母 s').toBe(false)
  })

  it('类里的 `*` 是字面量（不是通配）', () => {
    // 字符类必须在通配替换**之前**被摘出来，否则类里的 `*` 会被当成 `[^/]*`。
    expect(matchesGlob('src/services/[*].ts', 'src/services/*.ts'), '类里的 `*` 必须匹配一个字面的星号').toBe(true)
    expect(matchesGlob('src/services/[*].ts', 'src/services/save.ts'), '类里的 `*` 是字面量 —— 不得当成通配去匹配 save.ts').toBe(false)
  })

  it('真实配置里的几个精确路径互相不覆盖', () => {
    expect(matchesGlob('src/services/audio.ts', 'src/services/pronunciation.ts'), 'audio.ts 的守卫不得覆盖 pronunciation.ts —— 否则 TTS 链路被误禁').toBe(false)
    expect(matchesGlob('src/app/audio-unlock.ts', 'src/app/effects-runner.ts'), 'audio-unlock.ts 的守卫不得覆盖 effects-runner.ts —— 否则音效链被误禁').toBe(false)
  })
})

/**
 * ESLint 自己的解析器 —— `matchesGlob` 的**唯一权威判据**。
 *
 * ⚠️ 为什么不用 minimatch 当 oracle（DF-043）：
 *   ESLint 的 `files` 语义 = minimatch **加上**一条 ESLint 自己的「通用模式」规则
 *   （`files` 全是 `*` / `!…` / 以 `/*` 或 `/**` 结尾的块，若没有**别的**块
 *   按扩展名匹配过这个文件，它就不生效）
 *   ⇒ minimatch 会在这条规则上与 ESLint 分叉。
 *   实测（2026-10-26 夜）：`src/**` 对 `src/save.ts`，minimatch 说 true、
 *   ESLint 说 false；`src/services/*` 对 `src/services/save.ts` 同理。
 *   ⇒ 唯一不会分叉的 oracle 就是 **ESLint 自己**。
 *
 * 这里**自带配置**（`overrideConfigFile: true`），不读项目的 `eslint.config.js`
 * ⇒ 判据不随项目配置的改动漂移；同时保留一条「双星 + 扩展名通配」的空规则块，
 * 复刻「有别的块按扩展名匹配过这个文件」这一前提（否则 `src/services/*` 这类
 * 模式在 ESLint 眼里**不生效**，oracle 会与真机行为分叉 —— 那正是上面那条实测）。
 */
const eslintCovers = async (pattern: string, file: string): Promise<boolean> => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.{ts,vue,js}'], rules: {} },
      {
        files: [pattern],
        rules: { 'no-restricted-syntax': ['error', { selector: 'AwaitExpression' }] },
      },
    ],
  })
  const config = await eslint.calculateConfigForFile(resolve(process.cwd(), file))
  return config?.rules?.['no-restricted-syntax'] !== undefined
}

/**
 * `matchesGlob` 与 **ESLint 自己的解析器**逐条对账（DF-043 的「交叉校验」）。
 *
 * ⚠️ 为什么这才是权威：`matchesGlob` 是**手写**的 glob 实现，它与 ESLint 的
 *   真实语义之间的分叉，只能靠**拿 ESLint 当 oracle 逐条对账**发现 ——
 *   靠人读代码读不出来（DF-006 的字符类就是这样漏过去的：读起来完全合理）。
 *
 * ⚠️ 判据要落在**后果**上：不是断言「实现里有字符类分支」这种写法级判据，
 *   而是断言「同一个（模式, 文件）对上，本实现与 ESLint 的答案一致」。
 */
describe('G328 —— matchesGlob 与 ESLint 自己的解析器逐条对账（DF-006 / DF-043）', () => {
  /**
   * 对账表。**每一行都是实测过的**（2026-10-26 夜，用 ESLint 的
   * `calculateConfigForFile` 逐条求值）⇒ 判据不是「我以为 ESLint 怎么匹配」，
   * 而是「ESLint 实际怎么匹配」。
   *
   * ⚠️ 表里刻意含**字符类**那几行（DF-006 修的就是它们）。
   */
  const TABLE: [pattern: string, file: string][] = [
    ['src/services/[st]*.ts', 'src/services/save.ts'],
    ['src/services/[st]*.ts', 'src/services/pronunciation.ts'],
    ['src/services/[!st]*.ts', 'src/services/save.ts'],
    ['src/services/[!st]*.ts', 'src/services/pronunciation.ts'],
    ['src/app/[ae]*.ts', 'src/app/effects-runner.ts'],
    ['src/app/[ae]*.ts', 'src/app/store.ts'],
    ['src/app/[a-c]*.ts', 'src/app/audio-unlock.ts'],
    ['src/app/[a-c]*.ts', 'src/app/store.ts'],
    ['src/services/*', 'src/services/save.ts'],
    ['src/services/*', 'src/services/pronunciation.ts'],
    ['src/services/**', 'src/services/save.ts'],
    ['src/services/*.ts', 'src/services/save.ts'],
    ['src/services/*.{ts,vue}', 'src/services/save.ts'],
    ['src/services/save.ts', 'src/services/save.ts'],
    ['src/services/save.ts', 'src/services/pronunciation.ts'],
    ['src/views/*.vue', 'src/views/StartView.vue'],
    ['src/app/effects-runner.ts', 'src/app/effects-runner.ts'],
  ]

  it('每一对（模式, 文件）上，本实现与 ESLint 的判定必须一致', async () => {
    const diffs: string[] = []
    for (const [pattern, file] of TABLE) {
      const mine = matchesGlob(pattern, file)
      const theirs = await eslintCovers(pattern, file)
      if (mine !== theirs) {
        diffs.push(`${pattern}  ||  ${file}  ⇒ 本实现 ${mine}，ESLint ${theirs}`)
      }
    }

    expect(
      diffs,
      `matchesGlob 与 ESLint 的 glob 语义分叉了（DF-006 / DF-043）—— 守卫会因此判错「某个文件有没有被禁 await 覆盖」：\n${diffs.join('\n')}`,
    ).toEqual([])
    expect(TABLE.length, '对账表是空的 —— 判据在空集上恒绿（那等于没校验）').toBeGreaterThan(10)
  })
})
