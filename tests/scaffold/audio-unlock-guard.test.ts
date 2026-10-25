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
 */
import { describe, expect, it } from 'vitest'

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Linter } from 'eslint'

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
 * 只实现 ESLint 用到的通配（`*` `**` `?`）加 `{a,b}` 选择，
 * 不引入 minimatch 依赖：本文件自己也要被 lint，不能为了它拉一个包。
 */
const GLOBSTAR_DIR = '\u0000'
const GLOBSTAR = '\u0001'

const matchesGlob = (pattern: string, file: string): boolean => {
  if (!/[*?{]/.test(pattern)) {
    return pattern === file
  }

  const regex = pattern
    // ⚠️ 替换顺序是这份实现的全部难点，动任何一步之前先读这三条：
    //  ① 先转义正则元字符（`*` `?` `{` `}` 不在其中，保持可解释）；
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

  return new RegExp(`^${regex}$`).test(file)
}

/**
 * ⚠️ `[CR]` 2026-10-16 删除 —— 这里原来还有**第二份** `rulesFor`。
 *
 * 它比 fixture 里那份更聪明一点（用了 `matchesGlob`），但**同样看不见 `ignores`**，
 * 同样会把「更窄 glob 在后面覆盖掉这条规则」的情形漏掉 —— 本文件第 152 行那条
 * `ignores` 断言正是为此而加，说明作者当时已经知道这个洞，却只补了 `ignores` 一半。
 * ⇒ 统一走 `fixtures/eslint-rules.ts` 的 `rulesForFile()`（ESLint 自己的解析器）。
 */

/** 配了 no-restricted-syntax 的全部 files 模式。 */
const guardedPatterns = (): string[] =>
  (eslintConfig as unknown as EslintBlock[])
    .filter((block) => block.rules?.['no-restricted-syntax'])
    .flatMap((block) => (Array.isArray(block.files) ? block.files : [block.files!]))
    .filter(Boolean) as string[]

const UNLOCK_CHAIN = [
  'src/services/audio.ts',
  'src/services/pronunciation.ts',
  'src/app/audio-unlock.ts',
]

describe('音频解锁链路禁 await（AC-10）', () => {
  it.each(UNLOCK_CHAIN)('%s 上配了 no-restricted-syntax，且严重级别是 error', async (file) => {
    const rule = (await rulesForFile(file))['no-restricted-syntax']

    expect(rule, `${file} 上没有 no-restricted-syntax 规则`).toBeDefined()
    // 'warn' 不会让 `npm run lint` 失败（没有 --max-warnings），等于没守
    expect(severityOf(rule), '严重级别必须是 error —— warn 不会让 `npm run lint` 失败，等于没守').toBe('error')
  })

  it('禁的正是 AwaitExpression（不是别的表达式，也不是空禁列）', async () => {
    for (const file of UNLOCK_CHAIN) {
      const rule = (await rulesForFile(file))['no-restricted-syntax']
      const options = (Array.isArray(rule) ? rule[1] : undefined) as
        | { selector?: string }
        | undefined

      expect(options?.selector, `${file} 的禁列没有 selector`).toBe('AwaitExpression')
    }
  })

  it('守卫刻意只覆盖这三个文件 —— 扩到 src/services/ 会挡住 Story 1.14 的 save.ts', () => {
    const guarded = guardedPatterns()

    expect(guarded, '守卫名单必须含这三个文件 —— 少一个就有文件不受禁 await 保护').toEqual(
      expect.arrayContaining(UNLOCK_CHAIN),
    )

    // ⚠️ 用 glob 语义判定「有没有哪个模式会覆盖到 save.ts」，
    // 而不是去黑名单几个字面量 —— `'src/services/*'`、`'src/services/**'`、
    // `'src/services/**/*.ts'`、`'src/services/*.{ts,vue}'` 全都要挡住。
    // 原写法只列了前两种，其余写法照样全绿而 save.ts 被误伤。
    const wouldCoverSave = guarded.some((pattern) => matchesGlob(pattern, 'src/services/save.ts'))
    expect(wouldCoverSave, `守卫覆盖到了 save.ts（模式：${guarded.join(', ')}）`).toBe(false)
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
   * 而本文件 13 条断言**全部照绿**。
   *
   * 已实测（变异）：注入 ignores → `vitest` 13 passed，
   * 同时 `npx eslint src/services/pronunciation.ts` 报
   * `File ignored because of a matching ignore pattern`；
   * 而 lint 脚本是 `eslint .`，被 ignore 的文件是**静默跳过**，连警告都没有。
   *
   * ⇒ 「规则没被挪走 / 没被降级」与「规则还真的在跑」是两件事，
   * 后者此前无人守。
   */
  it('解锁链路的三个文件不在任何 ignores 里 —— 否则守卫形同虚设', () => {
    const ignores = (eslintConfig as unknown as EslintBlock[])
      .flatMap((block) => (Array.isArray(block.ignores) ? block.ignores : []))
      .filter(Boolean)

    for (const file of UNLOCK_CHAIN) {
      const hit = ignores.find((pattern) => matchesGlob(pattern, file))
      expect(
        hit,
        `${file} 被 eslint 的 ignores（${hit}）排除 —— ESLint 根本不会 lint 它，` +
          '禁 await 守卫已失效，而规则对象本身仍然存在（本文件其余断言会照绿）',
      ).toBeUndefined()
    }
  })

  it('守卫名单里的三个文件真实存在（改名/移走会让整条守卫静默失效）', () => {
    // ⚠️ `[CR]` 2026-10-16：`UNLOCK_CHAIN` 是测试里的常量，与磁盘上的真实文件名
    //   **没有任何耦合**。有人把 `pronunciation.ts` 改名（无论是否同步改了 eslint 配置），
    //   本文件 13 条断言照绿，而 FR2 守卫已经守着一个不存在的文件。
    //   同理，Story 1.13 把 `prewarmBgm` 落进新文件时，新文件不在 `files` 名单里，
    //   禁 await 规则对它自动失效 —— 这条守卫断言不了「新增的解锁链路文件也被覆盖」，
    //   但至少能断言「名单里的文件不是幽灵」。
    for (const file of UNLOCK_CHAIN) {
      expect(
        existsSync(resolve(process.cwd(), file)),
        `${file} 不在磁盘上，但守卫名单里写着它 —— 改名或移走会让守卫静默失效`,
      ).toBe(true)
    }
  })

  it('eslint 确实会在这三个文件上报 AwaitExpression（真跑一次 linter，而不是只看规则对象）', () => {
    // ⚠️ 这条是上面两条的补强：前两条断言「配置长得对」，这条断言「配置真的生效」。
    //   `no-restricted-syntax` 是**核心规则**（不是插件规则），可以直接用
    //   `Linter.verify` 对一段带 `await` 的文本求值，无需真的落盘。
    //
    //   为什么必须真跑：`no-restricted-syntax` 命中与否还取决于该文件有没有被
    //   匹配到对应的 config 块、该块有没有被后续块的同名规则覆盖 ——
    //   这些都不是「规则对象里有个 no-restricted-syntax 键」能证明的。
    const linter = new Linter()
    const probe = 'export async function f(): Promise<void> { await Promise.resolve() }'

    for (const file of UNLOCK_CHAIN) {
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

  it('真实配置里的三个精确路径互相不覆盖', () => {
    expect(matchesGlob('src/services/audio.ts', 'src/services/pronunciation.ts'), 'audio.ts 的守卫不得覆盖 pronunciation.ts —— 否则 TTS 链路被误禁').toBe(false)
    expect(matchesGlob('src/app/audio-unlock.ts', 'src/app/effects-runner.ts'), 'audio-unlock.ts 的守卫不得覆盖 effects-runner.ts —— 否则音效链被误禁').toBe(false)
  })
})
