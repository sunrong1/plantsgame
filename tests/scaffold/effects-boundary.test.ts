/**
 * **G58 / G59 / G60 / G61 / G70** —— 音效架构边界的守卫（Story 1.14 / AC-B1、AC-F1、AC-E2、AC-F4）。
 *
 * ── 为什么全是结构守卫 ──────────────────────────────────────────────────────
 * 「音效没响」在浏览器里与「孩子没点到」长得一模一样：没有报错、没有差异、
 * 没有可截图的红。所以本 story 的自动化验收全部落在**结构**上，
 * 「好不好听」交给人工试听（裁决 2）。
 *
 * ── 判据纪律 ────────────────────────────────────────────────────────────────
 * · 源码扫描一律**先 `stripComments()`** —— 否则每个文件里那些解释「为什么不许写」
 *   的注释自己就会把守卫判红。
 * · ESLint 相关的断言用 **`Linter.verify` 真跑一遍**（AC-G3），
 *   并配**反向验证**：探针文本真的会被报出来（`_bmad-output/archive/deferred/2026-10-12--cr-story-1-2.md`
 *   里「ESLint「禁 await」守卫只拦 `AwaitExpression`，`.then()` 的等价逃逸放行」那条的要求），
 *   否则「规则配对了却根本没生效」会一路绿灯。
 * · 词边界用 `\bword\b`，**不**用 `\bword\s` —— 后者在中文顿号上失配（R-53）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { Linter } from 'eslint'

import eslintConfig from '../../eslint.config.js'
import { patternStrings, optionsOf, probeFilesExist, rulesForFile, severityOf } from '../fixtures/eslint-rules'
import { stripComments } from '../fixtures/strip-comments'

const root = process.cwd()

/** 去掉注释 —— 扫描「代码里出现了什么」，不扫「注释里说了什么」。
 *
 *  ⚠️ **实现已提到 `tests/fixtures/strip-comments.ts`（Story 1.17 / R-37）**：
 *   本文件原来那份是朴素的两段 replace，被本 story 的注释形态击穿过两次 ——
 *   注释里的星号 glob 与行尾星号加粗会配成一对假「块注释」，吃掉真代码，
 *   G105 与 G106 因此双双假红。共享版是字符串字面量感知的，并保持字符位置不变。
 */

/** 递归列出目录下所有 `.ts` / `.vue`。 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.ts$|\.vue$/.test(name) ? [full] : []
  })
}

const COMPONENT_FILES = walk(join(root, 'src/components'))
const VIEW_FILES = walk(join(root, 'src/views'))

/**
 * `src/` 下**全部**源码文件（`.ts` / `.vue`）—— 供 G105 的「console 落点」那条用。
 *
 * ⚠️ 从目录现读而不写死清单：加一个新模块就自动进扫描范围，
 *   而写死的清单会在第三次加文件时开始静默放行（R-51 同款）。
 */
const ALL_SOURCE_FILES = walk(join(root, 'src'))

/**
 * 「`case 'TRACE'` 这个分支里，DEV 门控出现在打印**之前**」（G105）。
 *
 * ⚠️📎 **首版是「距离正则」，已被本 story 自己击穿两次**，第二次在实现期：
 *   首版 `/case 'TRACE':[\s\S]{0,200}?if \(import\.meta\.env\.DEV\)…/`
 *   靠**字符距离上限**表达「门控在分支内」。而
 *   ① `stripComments` 换成保位置的共享版（`tests/fixtures/strip-comments.ts`）之后，
 *      注释从「删掉」变成「等长空白」⇒ `case 'TRACE':` 与 DEV 判断之间的
 *      **空白量**从 0 涨到 1008 ⇒ `{0,200}` 当场不够，G105 假红；
 *   ② 即便放宽上限，这个上限本身就是判据的一部分：注释再长一倍就重新假红。
 *   ⇒ 改成**切片判据**：先切出 `case 'TRACE':` 到下一个同缩进标签之间的分支体，
 *     再判 `if (import.meta.env.DEV)` 的位置在 `console.` 之前。
 *     这样判据**与注释长度无关**，也不可能匹配到别的分支。
 *
 * ⚠️ **必须先剥注释**：`case` 标签的切分靠「下一行同缩进的 `case '`」，
 *   而本文件的注释里逐字出现过 `` `case 'SAVE'` ``。R-52。
 */
function traceBranchIsDevGated(source: string): boolean {
  const label = "case 'TRACE':"
  const from = source.indexOf(label)
  if (from < 0) return false

  const rest = source.slice(from + label.length)
  // 分支体 = 到下一个**同缩进**的 case/default 标签为止（switch 的 case 在 4 空格）。
  const end = rest.match(/\n\s{4,}(?:case\s+'|default:)/)
  const branch = end?.index === undefined ? rest : rest.slice(0, end.index)

  const gate = branch.indexOf('if (import.meta.env.DEV)')
  const print = branch.indexOf('console.')
  return gate >= 0 && print >= 0 && gate < print
}


/**
 * 「`default:` 与 `assertNeverEffect(effect)` **之间**出现了 `try {`」（G106）。
 *
 * ⚠️ **必须是切片判据，不能是正则**：正则表达不了「之间不出现」。
 * 首版写成 `/default:[\s\S]*?assertNeverEffect/` —— 它对**两种**写法都匹配，
 *   于是自检当场抓到「探针都拦不住」。R-53 的同款教训：
 *   **判据自检的探针必须与判据本身同形。**
 */
function tryBetweenDefaultAndAssert(source: string): boolean {
  const from = source.indexOf('default:')
  const at = source.indexOf('assertNeverEffect(effect)')
  if (from < 0 || at < 0 || at < from) return false
  return /\btry\s*{/.test(source.slice(from, at))
}

/**
 * 「`devAdjust` 出现在 `runEffectsFromStore` 之前，**且两处都在**」（G109）。
 *
 * ⚠️ **两处都找不到时返回 `false` 而不是 `true`** ——
 *   若默认返回 `true`，「devAdjust 被整段删掉」这个最彻底的退化会**判成合规**
 *   （自测里那一档就是守它的）。判据一旦失明就必须报红，不是静默放行。
 */
function devAdjustOrderedCorrectly(source: string): boolean {
  const adjust = source.indexOf('devAdjust')
  const effects = source.indexOf('runEffectsFromStore')
  if (adjust < 0 || effects < 0) return false
  return adjust < effects
}

describe('G58 —— core/effects.ts 与 barrel 齐备（AC-B1）', () => {
  const source = stripComments(readFileSync(join(root, 'src/core/effects.ts'), 'utf8'))

  it('runEffects / assertNeverEffect / effectKindName / SfxCue / Effect 都已导出', () => {
    expect(source).toMatch(/\bexport function runEffects\b/)
    expect(source).toMatch(/\bexport function assertNeverEffect\b/)
    expect(source).toMatch(/\bexport function effectKindName\b/)
    expect(source).toMatch(/\bexport type SfxCue\b/)
    expect(source).toMatch(/\bexport type Effect\b/)
  })

  it('barrel 用 `export type` 重导出两个类型（verbatimModuleSyntax 下值语法会编译报错）', () => {
    const barrel = stripComments(readFileSync(join(root, 'src/core/index.ts'), 'utf8'))
    expect(barrel).toMatch(/export type \{[^}]*\bEffect\b/)
    expect(barrel).toMatch(/export type \{[^}]*\bSfxCue\b/)
    // ⚠️ 反向：不能出现值语法的重导出。
    expect(barrel, '类型必须走 `export type`，值语法重导出会 TS1484').not.toMatch(
      /export \{[^}]*\bSfxCue\b[^}]*\}(?! from)/,
    )
  })

  it('barrel 也重导出了三个函数', () => {
    const barrel = stripComments(readFileSync(join(root, 'src/core/index.ts'), 'utf8'))
    for (const name of ['runEffects', 'assertNeverEffect', 'effectKindName']) {
      expect(barrel, `barrel 漏了 ${name}`).toMatch(new RegExp(`export \\{[^}]*\\b${name}\\b`))
    }
  })
})

describe('G59 —— effects.ts 零 DOM / 零 Vue / 零随机 / 零时间（AC-B3）', () => {
  const source = stripComments(readFileSync(join(root, 'src/core/effects.ts'), 'utf8'))

  // ⚠️ 每条都配一份「探针文本」—— 首版把自检写成 `expect('window').toMatch(pattern)`，
  //   于是**七条共用同一个探针**：document / Date / Math.random 的正则必然不命中，
  //   六条用例全部假红。判据自检的探针必须与判据本身同形（R-53）。
  it.each([
    ['window', /\bwindow\b/, 'const a = window.innerWidth'],
    ['document', /\bdocument\b/, 'const b = document.title'],
    ['Date', /\bDate\b/, 'const c = Date.now()'],
    ['Math.random', /\bMath\.random\b/, 'const d = Math.random()'],
    ['performance', /\bperformance\b/, 'const e = performance.now()'],
    ['AudioContext', /\bAudioContext\b/, 'const f = new AudioContext()'],
    ['setTimeout', /\bsetTimeout\b/, 'setTimeout(() => {}, 1)'],
  ])('effects.ts 里没有 %s', (_name, pattern, probe) => {
    // ⚠️ 先在真实文本上确认正则本身能干活（AC-G3 / R-53）：
    //   若判据恒假，`expect(source).not.toMatch(...)` 就是恒真的假绿。
    expect(probe, `判据自检：${_name} 的正则连探针文本都命中不了`).toMatch(pattern as RegExp)
    expect(source, `core/ 是纯逻辑层，不得出现 ${_name}`).not.toMatch(pattern as RegExp)
  })

  it('effects.ts 不 import `../content/`（静态 JSON 导入会把 37 条词条拖进每个 core 测试）', () => {
    expect(source).not.toMatch(/\.\.\/content\//)
  })
})

describe('G64a —— 掉心判据必须复用 lostSlotIndexes，不许另算（AC-C6）', () => {
  // ⚠️ **这条守卫是变异 M116 逼出来的。**
  //   M116 把 `lostSlotIndexes(prev, next).length > 0` 换成
  //   `prev.hearts - next.hearts > 0` —— 实测 **0 红**（25 条全绿）。
  //   原因是 `State.hearts` 是**数字**，`heartSlots` 把它展开成布尔数组，
  //   于是两种写法在行为上**完全等价**：这是**等价变异体**，0 红是正确结果。
  //   但 AC-C6 要守的恰恰不是行为等价，而是「**只有一份判据**」——
  //   两份写法此刻等价，将来 `hud.ts` 一改（例如何时算「掉心」）就会分叉，
  //   而分叉后没有任何东西会红。⇒ 补**源码层**守卫钉住「调的是 `lostSlotIndexes`」。
  const source = readFileSync(join(root, 'src/core/effects.ts'), 'utf8')

  it('effects.ts 从 ./hud.js 导入 lostSlotIndexes', () => {
    expect(stripComments(source), 'effects.ts 必须复用 hud 的 lostSlotIndexes').toMatch(
      /import \{[^}]*\blostSlotIndexes\b[^}]*\} from '\.\/hud\.js'/,
    )
  })

  it('effects.ts 里出现 lostSlotIndexes 的调用', () => {
    // 判据自检：先在真文本上确认正则命中，避免恒真的假绿。
    const probe = "lostSlotIndexes(prev, next).length > 0"
    expect(probe).toMatch(/lostSlotIndexes\(prev, next\)\.length/)
    expect(stripComments(source), 'lostSlotIndexes 被导入了却没被调用').toContain('lostSlotIndexes(prev, next)')
  })

  it('🚨 effects.ts 里没有第二份心数差值判据（M116 的形态）', () => {
    // 三种「另算一份」的常见写法：直接相减、`heartsLostBetween`、自造数组。
    const code = stripComments(source)
    const offenders = [
      /prev\.hearts\s*-\s*next\.hearts/,
      /next\.hearts\s*-\s*prev\.hearts/,
      /\bheartsLostBetween\s*\(/,
    ].filter((p) => p.test(code))
    expect(
      offenders.map(String),
      '掉心判据出现了第二份实现 —— 画面与声音会各判一次，将来必然分叉（AC-C6）',
    ).toEqual([])
  })

  // 🚨📎 `[CR]` 2026-10-21 **G212 —— G64a 原先只扫 `core/effects.ts` 一个文件**。
  //
  //   AC-C6 的原文（见 story 文档 AC-C6 节）是三份文件一起点名：
  //   「❌ **不许**在 `effects.ts` / `effects-runner.ts` / `audio.ts`
  //   里写第二份掉心判据（包括 `prev.hearts - next.hearts > 0` 这类写法）」。
  //   首版守卫只覆盖了第一个 ⇒ 另两份里各写一份「画面差值」判据会**全绿**。
  //   这与本仓库记过的「非递归扫描只扫一个文件」是同一类形态：
  //   判据比 AC 窄，缺口落在没被扫描的那两份上。
  it.each([
    ['src/core/effects.ts'],
    ['src/app/effects-runner.ts'],
    ['src/services/audio.ts'],
  ])('G212 —— %s 里同样没有第二份心数差值判据（AC-C6 逐字点名三份文件）', (file) => {
    const code = stripComments(readFileSync(join(root, file), 'utf8'))
    const offenders = [
      /prev\.hearts\s*-\s*next\.hearts/,
      /next\.hearts\s*-\s*prev\.hearts/,
      /\bheartsLostBetween\s*\(/,
    ].filter((p) => p.test(code))
    expect(offenders.map(String), `${file} 里出现了 AC-C6 禁止的第二份掉心判据`).toEqual([])
  })
})

describe('G60 —— 组件与视图里不出现播放函数名（AC-F1）', () => {
  const PLAYBACK_NAMES = ['playSfx', 'startBgmIfReady', 'prewarmBgm']

  it.each(PLAYBACK_NAMES)('%s 不出现在 src/components 与 src/views 的代码里', (name) => {
    const files = [...COMPONENT_FILES, ...VIEW_FILES]
    expect(files.length, '扫不到任何组件文件 —— 路径变了或目录空了，守卫已失明').toBeGreaterThan(0)

    const offenders = files.filter((file) => stripComments(readFileSync(file, 'utf8')).includes(name))
    expect(
      offenders.map((f) => f.slice(root.length + 1)),
      '组件/视图自行播音效是架构硬约束 4 的破口 —— 副作用只能走 app/effects-runner.ts',
    ).toEqual([])
  })
})

describe('G70 —— 组件与视图不 import `services/audio`（AC-F4）', () => {  it.each(['src/components/quiz/QuestionCard.vue', 'src/views/StartView.vue'])(
    '%s 的 ESLint 配置上 no-restricted-imports 是 error',
    async (file) => {
      const rule = (await rulesForFile(file))['no-restricted-imports']
      expect(rule, `${file} 上没有 no-restricted-imports 规则`).toBeDefined()
      expect(severityOf(rule)).toBe('error')
    },
  )

  it('禁列里确实有 `services/audio` 的相对路径形态', async () => {
    for (const file of ['src/components/quiz/QuestionCard.vue', 'src/views/StartView.vue']) {
      const options = optionsOf((await rulesForFile(file))['no-restricted-imports'])
      const patterns = patternStrings(options)
      expect(
        patterns.some((p) => p.includes('services/audio')),
        `${file} 的禁列里没有 services/audio（现有：${patterns.join(', ') || '空'}）`,
      ).toBe(true)
    }
  })

  it('🚨 反向验证：ESLint 真的会在组件上拦下这条 import（真跑 Linter，不只看规则对象）', () => {
    // ⚠️ 「规则对象里有个 patterns 键」不证明规则**生效** ——
    //   块没匹配上、被后续块覆盖、被 ignores 排除，三种情况都会照绿。
    const linter = new Linter()
    const probe = "import { playSfx } from '../services/audio'\nexport const a = playSfx\n"

    // ⚠️ 探针路径用 `.ts` 而不是真实的 `.vue`：`Linter.verify` 不接
    //   `languageOptions.parser`（那要靠 flat config 的 `.vue` 块 + vue-eslint-parser，
    //   而 verify 的 `config` 形参走的是另一条解析路径），拿 `.vue` 去 verify 会
    //   **解析失败、零消息** —— 于是「没触发规则」与「没解析」长得一模一样。
    //   config 块的 `files` 对 `.ts` 与 `.vue` 是同一个模式，覆盖判定完全相同。
    for (const file of ['src/components/quiz/QuestionCard.ts', 'src/views/StartView.ts']) {
      const messages = linter.verify(probe, eslintConfig as never, file)
      const hit = messages.find((m) => m.ruleId === 'no-restricted-imports')
      expect(
        hit,
        `${file} 上没有触发 no-restricted-imports —— 配置看着对但没真生效` +
          `（实际报出：${messages.map((m) => m.ruleId ?? '(parse)').join(', ') || '无'}）`,
      ).toBeDefined()
    }
  })

  it('豁免仍在：`StartView.vue` 导入 `app/audio-unlock` 是合法的（架构硬约束 4 的唯一例外）', () => {
    // ⚠️ 这条守卫不许顺手把 `unlockAudioSequence` 也禁掉 ——
    //   它是「用户手势触发的、一次性、不可重放的资源初始化」，`audio-unlock.ts:23-24`
    //   逐字声明的例外。本条断言它在真实配置下**不被拦**。
    const linter = new Linter()
    const probe = "import { unlockAudioSequence } from '../app/audio-unlock'\nexport const a = unlockAudioSequence\n"

    const hit = linter
      .verify(probe, eslintConfig as never, 'src/views/StartView.ts')
      .find((m) => m.ruleId === 'no-restricted-imports')
    expect(hit, 'StartView 的 audio-unlock 例外被误伤了').toBeUndefined()
  })
})

describe('G61 —— runEffects 排在 `state.value = next` 之前（AC-E2）', () => {
  const store = stripComments(readFileSync(join(root, 'src/app/store.ts'), 'utf8'))

  it('applyAction 里 runEffectsFromStore 的行号 < state.value = next 的行号', () => {
    const body = store.slice(store.indexOf('export function applyAction'))
    // 📎 **Story 1.15 更新（登记留痕，非放宽）**：原判据写死整条调用串
    //   `'runEffectsFromStore(action, prev, next)'`，而 1.15 给它加了第 4 个实参
    //   `progress.value`（存档要写两样东西，裁决 4）⇒ 原字符串再也匹配不上，
    //   守卫会**恒红**，而它守的命题「runEffects 排在赋值之前」一个字都没变。
    //   ⇒ 改成**前缀匹配**（去掉右括号），命题与严格性完全不变：
    //     少一个括号照样匹配得到，多几个实参也照样匹配得到。
    //   ⚠️ **不许因此把判据改成 `indexOf('runEffectsFromStore')`**：
    //     那会把「函数名出现在别处」也算成调用点，命题就被放宽了。
    const runAt = body.indexOf('runEffectsFromStore(action, prev, next')
    const assignAt = body.indexOf('state.value = next')

    expect(runAt, 'applyAction 里没有 runEffectsFromStore 调用 —— 音效链路没接上').toBeGreaterThan(-1)
    expect(assignAt, 'applyAction 里没有 state.value = next').toBeGreaterThan(-1)
    expect(
      runAt < assignAt,
      `runEffectsFromStore 在第 ${runAt} 字节、state.value = next 在第 ${assignAt} 字节 —— ` +
        '排在赋值之后的话 prev 取不到，一条音效都不会响',
    ).toBe(true)
  })

  it('清选中仍在赋值之后，进度计算被 1.16 提到赋值之前（两条判据的方向相反）', () => {
    const body = store.slice(store.indexOf('export function applyAction'))
    const assignAt = body.indexOf('state.value = next')

    // ① 1.12 AC-D4：`clearSelectionIfLeavingBuildPhase` 判据必须读**新**相位
    //    ⇒ 仍在赋值之后。这条一个字没动。
    expect(body.indexOf('clearSelectionIfLeavingBuildPhase(next)')).toBeGreaterThan(assignAt)

    // ② 📎 **Story 1.16 裁决 11 把 `advanceProgress` 提到了赋值之前** ——
    //    原判据是 `toBeGreaterThan(assignAt)`，现改为 `toBeLessThan(assignAt)`。
    //    ⚠️ **这是「改判据」，不是「放宽判据」**（R-57 必须留痕，故记在这里）：
    //    · **被改的字面口径**：1.13 AC-B3 逐字「`advanceProgress` 排在 `state.value = next`
    //      **之后**是刻意的」；1.16 要它排在 `runEffectsFromStore` **之前**，
    //      否则写盘看到的 `progress` 少一次单元推进（关掉页面永远补不回来）。
    //    · **被改的判据方向**：由「必须在之后」改为「必须在之前」。
    //    · **没被推翻的是那条 AC 的**理由**逐字**：「必须读 `next`，读 `prev` 就永远慢一拍」
    //      —— `next` 在第 2 步就有了，下面 ③ 就在守它。
    //    · 1.13 的 story 文档已归档，按 R-40 本 story 不去动它；
    //      这条「已归档 story 的判据被后续 story 改写」记在 `deferred-work.md` 的 1.16 段。
    // 📎 **Story 1.17 第三次动了这两条（留痕 2）**：`applyAction` 里 `reduce` 的产物
    //    改名为 `reduced`，`next` 现在专指「补偿之后那份」。于是本 describe 里
    //    ①②③ 的字面量 `next` 全要改成 `reduced`。
    //    · **判据的实质一个字没变**：`reduced` 就是「`reduce` 算出的那份」，
    //      与 1.13/1.16 语境里的 `next` **同一个值**（在 1.16 的世界里它就叫 `next`）；
    //      生产构建里 `next === reduced` 恒成立（补偿只在 DEV 生效）。
    //    · **变的只是变量名**，以及「跨局进度刻意不读补偿后那份」这一条**新增**的语义 ——
    //      见 ③ 的留痕 3。若读 `next`（补偿后），「直接通关」勾一下会把整份题单
    //      永久写进 `masteredWordIds`，关掉开关重打也回不来。
    expect(body.indexOf('advanceProgress(progress.value, reduced)')).toBeLessThan(assignAt)

    // ③ 读的是 `reduce` 的产物而不是 `prev` —— 1.13 AC-B3 的**理由**，一个字没被推翻。
    //    ⚠️ 这条不许改成 `prev`：`prev` 里的掌握记录永远慢一拍，
    //    而守卫 G96 会在下一次 dispatch 才拿到补偿 ⇒ 判据立刻红。
    // 📎 **留痕 3（1.17）**：判据从「必须读 `next`」收紧为「**必须读 `reduced`**」——
    //    `next` 是补偿后的那份，进度**不许**读它。收紧方向比原来更严，不是放宽。
    expect(
      body,
      '进度必须从 reduce 的产物读（AC-B3 的理由逐字：「必须读 next，读 prev 就永远慢一拍」；' +
        '1.17 追加：不得读 dev 补偿后的 next）',
    ).toMatch(/advanceProgress\(\s*progress\.value\s*,\s*reduced\s*\)/)
    expect(body, '进度读的是 dev 补偿后的 state —— 「直接通关」会永久污染掌握记录').not.toMatch(
      /advanceProgress\(\s*progress\.value\s*,\s*next\s*\)/,
    )

    // ④ 算一次、赋一次：赋值的**右边**必须就是那个提前算出来的对象，
    //    不是重新调一遍纯函数（AC-C2 明令「各只调一次」）。
    expect(
      body,
      'progress 的赋值必须是 `progress.value = nextProgress` —— ' +
        '重新调一遍纯函数会让两次调用之间夹进别的 dispatch',
    ).toMatch(/progress\.value\s*=\s*nextProgress/)
  })
})

describe('G105 —— 回合日志的 DEV 门控与 console 的落点（Story 1.17 / AC-C4、裁决 2）', () => {
  const runner = stripComments(readFileSync(join(root, 'src/app/effects-runner.ts'), 'utf8'))

  it('判据自检：三种违规形态都被拦下，合规写法才通过', () => {
    // ⚠️ R-51：断言必须真能咬住它要防的违规。拿**故意违规**的 runner 片段试判据 ——
    //   「规则配对了却根本没生效」与「文件根本没解析」长得一模一样（R-53 同款）。
    // ① 分支里裸打，没有门控
    const bare = "case 'TRACE':\n      console.info(effect.line)\n      return\n    case 'TTS':\n      return\n"
    expect(traceBranchIsDevGated(bare), '判据自检：裸打没被拦下，G105 就是装饰守卫').toBe(false)

    // ② 门控在**别的分支**里 —— 这一档是首版距离正则真正防不住的那种
    const elsewhere =
      "case 'TRACE':\n      console.info(effect.line)\n      return\n" +
      "    case 'TTS':\n      if (import.meta.env.DEV) console.info(effect.line)\n      return\n"
    expect(traceBranchIsDevGated(elsewhere), '门控在别的分支里也算过 —— 回合日志会在生产里打出来').toBe(
      false,
    )

    // ③ 门控在打印**之后**（打印在 if 外面）
    const afterPrint = "case 'TRACE':\n      console.info(effect.line)\n      if (import.meta.env.DEV) return\n"
    expect(traceBranchIsDevGated(afterPrint)).toBe(false)

    // ④ 合规写法
    expect(
      traceBranchIsDevGated("case 'TRACE':\n      if (import.meta.env.DEV) console.info(effect.line)\n      return\n"),
    ).toBe(true)
  })

  it('`case \'TRACE\'` 的那行 console 在 `import.meta.env.DEV` 分支内', () => {
    expect(
      traceBranchIsDevGated(runner),
      'effects-runner 里没有 TRACE 分支，或那行 console 不在 import.meta.env.DEV 门控内',
    ).toBe(true)
  })

  it('🚨 回合日志的打印点**只有** effects-runner 一处（裁决 1 / AC-C4）', () => {
    // ⚠️📎 **📎 1.17 改判据留痕（R-57）**：`[CS]` 时这一条写的是
    //   「全仓新增的 `console.*` 只允许出现在 `app/effects-runner.ts` 与 `services/*`」——
    //   **它与既有交付正面冲突，实测 6 处违规**：
    //     · `src/app/store.ts` —— 1.15 交付的 `[save]` 三条 WARN
    //     · `Tower.vue` / `Zombie.vue` / `HandCard.vue` / `OptionCard.vue`
    //       —— 1.7 / 1.11 交付的 `[content]` 图片失败 WARN
    //     · `src/views/LevelView.vue` —— 既有注释里提到的那条
    //   而 R-14 逐字**允许**这些：「确需日志时带模块前缀，且不在逐帧路径」。
    //   ⇒ 原判据把「`core/` 零 console」错当成了「`core/` 外只有两个白名单文件」，
    //     **命题本身是错的**，不是实现违规。按 R-57 改判据，不放宽。
    //
    // **改后的命题（本条真正能守的那件）**：回合日志的**执行点唯一**。
    // 它必须在 runner 里（裁决 1），因为：
    //   · 放 `core/` ⇒ R-14 的「core 零 console」当场红；
    //   · 放组件 ⇒ 组件里出现第二次打印，同一行会被打两遍。
    // R-14 现有那条继续独立守 core 那一端（见 `save-boundary.test.ts`）。
    const offenders: string[] = []
    for (const file of ALL_SOURCE_FILES) {
      const rel = file.slice(root.length + 1)
      if (rel === 'src/app/effects-runner.ts') continue
      const clean = stripComments(readFileSync(file, 'utf8'))
      // ⚠️📎 **`[CR]` 2026-10-17 换判据锚点（R-57）**：原来锚在
      //   `/\bconsole\s*\.\w+\([^)]*\b(effect|trace)\w*\.line\b/` 上 ——
      //   **只认 `X.line` 一种语法形态**，于是三种真实违规全部放过（实测）：
      //     · `console.info(turnLogLine(action, next))` —— 直接调生产者
      //     · `console.log(l)` —— 变量名叫 `l`，正则里的 `\w+` 要求它以 line/trace 开头
      //     · `console.info(line)` —— 连属性访问都没有
      //   「一句话怎么被打印出来」的形态是**无限的**（包装函数、别名、中间变量），
      //   在 `console.*` 这一层收口收不干净。
      //   ⇒ 改锚在**两个有限的事实上**，它们合起来才等价于「打印点唯一」：
      //     ① **生产者唯一**：`turnLogLine` 是回合日志字符串的唯一产地
      //        （`core/effects.ts:263` 定义、`:154` 唯一的消费点）。
      //        它一旦被**别的文件**调用，就说明有人绕过 `runEffects` 自己拼日志。
      //     ② **读者唯一**：`TraceEffect` 的正文只有一个出口 `effect.line`。
      //        实测全仓 `src/` 里 `.line` **只出现一次**（`effects-runner.ts:133`），
      //        所以「除 runner 外零 `.line`」是一条**不误伤**的强判据。
      //
      // ⚠️ **两个豁免不是同一个范围**，别图省事合成一个：
      //   · `core/effects.ts` **可以**调 `turnLogLine` —— 它就是产地的家。
      //   · 但它**不可以**读 `.line` —— 产地自己读自己的出口没有意义，
      //     出现即说明有人绕过 `runEffects` 直接操作 `Effect` 数组。
      const isProducerHome = rel === 'src/core/effects.ts'
      const usesProducer = !isProducerHome && /\bturnLogLine\s*\(/.test(clean)
      const readsLine = /\.line\b/.test(clean)
      if (usesProducer || readsLine) {
        offenders.push(`${rel}${usesProducer ? '（调了 turnLogLine）' : ''}`)
      }
    }

    expect(
      offenders,
      `回合日志在 runner 之外被生成或被读取了：${offenders.join('、')}。` +
        '前缀 `[core]` 是语义标签，生产者 `turnLogLine` 的**消费点**与出口 `effect.line` ' +
        '都必须留在 effects-runner（裁决 1）',
    ).toEqual([])
  })

  // ⚠️📎 **R-53 反向自测**：换锚点之后必须证明新锚点**真的能咬**。
  //   评审第一版的原判据收得太窄，三种真实违规形态实测**全部放过** ——
  //   而当时没有反向自测，所以「绿」不说明任何事。
  //   下面这三条探针逐字对应那三种实测形态，外加一条合法写法防误伤。
  it('反向自测：换锚点后这三种违规形态都被拦下（旧判据实测全部放过）', () => {
    /** 与上面真判据**同形**的探针函数 —— 形态不同形的自测等于没有自测。 */
    const flags = (clean: string): { producer: boolean; readsLine: boolean } => ({
      producer: /\bturnLogLine\s*\(/.test(clean),
      readsLine: /\.line\b/.test(clean),
    })

    // ① 直接调生产者（旧判据放过）
    const direct = 'console.info(turnLogLine(action, next))\n'
    expect(flags(direct).producer, '判据自检：直接调生产者的探针都拦不住').toBe(true)

    // ② 变量名短到正则 `\w+` 匹配不上（旧判据放过）
    const shortVar = 'const l = effect.line\nconsole.log(l)\n'
    expect(flags(shortVar).readsLine, '判据自检：短变量名的探针都拦不住').toBe(true)

    // ③ 连属性访问都没有，只把结果塞进变量（旧判据放过）
    const viaFn = 'function say() { return turnLogLine(action, next) }\n'
    expect(flags(viaFn).producer, '判据自检：包装函数的探针都拦不住').toBe(true)

    // ④ 合规写法：一个字都不能误伤
    const legal = "case 'SAVE':\n  writeSave(p, s)\n  break\n"
    expect(flags(legal)).toEqual({ producer: false, readsLine: false })
  })
})

describe('G106 —— `assertNeverEffect` 仍在 default 分支且在 try 之外（Story 1.17 / AC-C5）', () => {
  // ⚠️ **必须 stripComments**：本 story 在 `case 'TRACE'` 里写的解释性注释里
  //   出现了字面量「`default: assertNeverEffect`」，不剥注释的话 `indexOf('default:')`
  //   会命中**注释里那一句**，切片从那里开始 —— 判据就此指向错误的区间（G106 假红）。
  const runner = stripComments(readFileSync(join(root, 'src/app/effects-runner.ts'), 'utf8'))

  it('判据自检：把 assertNeverEffect 裹进 try 的探针会被判据拦下', () => {
    // ⚠️ **判据是「切片」而不是「正则」** —— 正则表达不了「`default:` 与调用点**之间**
    //   不出现 `try`」，写成 `/default:[\s\S]*?assertNeverEffect/` 会把 try 内的版本
    //   也算成合规（首版就写反了，自检当场抓住）。R-53 同款教训。
    const insideTry = 'default:\n  try {\n    assertNeverEffect(effect)\n  } catch {}\n'
    const bare = 'default:\n  assertNeverEffect(effect)\n'

    expect(tryBetweenDefaultAndAssert(insideTry), '判据自检：探针都拦不住').toBe(true)
    expect(tryBetweenDefaultAndAssert(bare), '判据自检：合规写法被误判').toBe(false)
  })

  it('default 分支裸调 `assertNeverEffect`，前面没有 try', () => {
    const body = runner.slice(runner.indexOf('function runOne'))
    expect(body, 'runOne 找不到了 —— 函数名或结构变了，判据已失明').not.toBe('')
    expect(body.indexOf('assertNeverEffect(effect)'), 'runOne 里没有 assertNeverEffect —— 穷尽性检查消失了').toBeGreaterThan(-1)

    // ⚠️ 被 try 吞掉就退化成静默 warn，那正是 1.14 裁决 E4 逐字守住的东西
    //   （`case 'SAVE'` 的 catch 是**收窄**到那一条的，不是循环外一层）。
    expect(
      tryBetweenDefaultAndAssert(body),
      'assertNeverEffect 被裹进 try 里了 —— 编译期穷尽性退化成一条 WARN（1.14 裁决 E4）',
    ).toBe(false)
  })

  it('`Effect` 的五个成员在 runner 的 switch 里都有分支（新增成员漏了就红）', () => {
    for (const kind of ['ANIMATION', 'TTS', 'SAVE', 'TRACE']) {
      expect(runner, `runOne 的 switch 漏了 '${kind}' 分支 —— 该类副作用会静默不执行`).toContain(
        `case '${kind}'`,
      )
    }
  })
})

describe('G109 —— dev 补偿缝排在 `runEffectsFromStore` 之前（Story 1.17 / 裁决 5）', () => {
  // ⚠️ 同 G106：**必须 stripComments**。`store.ts` 里 `devAdjust` 那段的解释性注释
  //   逐字提到了 `runEffectsFromStore` —— 不剥注释的话 `indexOf` 会命中注释，
  //   顺序判据直接失明（G109 假绿）。
  const store = stripComments(readFileSync(join(root, 'src/app/store.ts'), 'utf8'))

  it('判据自检：把补偿缝挪到写盘之后的探针会被判为违规', () => {
    const legal = 'const a = devAdjust(reduced, prev)\nrunEffectsFromStore(action, prev, a, p)\n'
    const illegal = 'runEffectsFromStore(action, prev, reduced, p)\nconst a = devAdjust(reduced, prev)\n'

    expect(devAdjustOrderedCorrectly(legal), '判据自检：合规写法被判违规').toBe(true)
    expect(devAdjustOrderedCorrectly(illegal), '判据自检：违规写法没被抓到').toBe(false)
    // ⚠️ 判据自己失明的那一档（两处只找到一处）也必须显式判掉，否则它会返回 `true`。
    expect(
      devAdjustOrderedCorrectly('runEffectsFromStore(action, prev, reduced, p)\n'),
      '判据失明时被当成了合规',
    ).toBe(false)
  })

  it('G109：`devAdjust` 在 `runEffectsFromStore` 之前，且写出去的是补偿后的值', () => {
    const body = store.slice(store.indexOf('export function applyAction'))
    expect(body, 'applyAction 找不到了 —— 函数名或结构变了，判据已失明').not.toBe('')

    expect(
      devAdjustOrderedCorrectly(body),
      'devAdjust 排在写盘之后 —— SAVE 带走的是未补偿的 hearts',
    ).toBe(true)
    // 🔥 光有顺序不够：还要确认**写盘那一刻拿到的确实是补偿后的那份**。
    //   顺序对了但传的是 `reduced`，症状与顺序反了一模一样（盘上 0、内存 1）。
    expect(body, 'runEffectsFromStore 拿的不是补偿后的 state').not.toMatch(
      /runEffectsFromStore\(\s*action,\s*prev,\s*reduced\b/,
    )
  })
})

describe('AC-G8 —— effects-runner 禁 await、audio-unlock 禁 await 且禁 .then()', () => {
  it('effects-runner.ts 上配了 no-restricted-syntax 且是 error', async () => {
    const rule = (await rulesForFile('src/app/effects-runner.ts'))['no-restricted-syntax']
    expect(rule, 'effects-runner.ts 上没有 no-restricted-syntax 规则').toBeDefined()
    expect(severityOf(rule), "'warn' 不会让 npm run lint 失败 —— 等于没守").toBe('error')
  })

  it('audio-unlock.ts 的禁列同时含 AwaitExpression 与 .then() 两条 selector', async () => {
    const rule = (await rulesForFile('src/app/audio-unlock.ts'))['no-restricted-syntax']
    // ⚠️ `calculateConfigForFile` 返回的是归一化后的 `[level, opt1, opt2, …]` ——
    //   options 是 `rule.slice(1)`，**不是** `rule[1]`。写 `rule[1]` 只会拿到第一条，
    //   于是 `.then()` 那条 selector 被静默漏掉、断言反而可能通过。
    const selectors = (Array.isArray(rule) ? rule.slice(1) : [])
      .filter((o): o is { selector?: string } => typeof o === 'object' && o !== null)
      .map((o) => o.selector)

    expect(selectors, 'audio-unlock 的禁列读不到 selector —— 判据自己失明了').toContain('AwaitExpression')
    // ⚠️ 这条是 AC-G8 的正题：`_bmad-output/archive/deferred/2026-10-12--cr-story-1-2.md` 里
    //   「ESLint「禁 await」守卫只拦 `AwaitExpression`，`.then()` 的等价逃逸放行」那条记的 `.then()` 逃逸。
    //   只钉 AwaitExpression 时，`ctx.resume().then(() => { prewarmBgm() })` 被完全放行。
    expect(
      selectors.some((s) => s?.includes("property.name='then'")),
      `audio-unlock 的禁列里没有 .then() 的 selector（现有：${selectors.join(' / ') || '无'}）`,
    ).toBe(true)
  })

  it('🚨 反向验证：Linter 真的会拦下 .then() 逃逸与 await（AC-G8 / archive/deferred/2026-10-12--cr-story-1-2）', () => {
    const linter = new Linter()
    const thenProbe =
      'export function u(c: { resume(): Promise<void> }) {\n' +
      '  c.resume().then(() => { /* prewarmBgm() */ })\n' +
      '}\n'
    const awaitProbe = 'export async function f(): Promise<void> { await Promise.resolve() }\n'

    const thenHit = linter
      .verify(thenProbe, eslintConfig as never, 'src/app/audio-unlock.ts')
      .find((m) => m.ruleId === 'no-restricted-syntax')
    expect(thenHit, '.then() 探针没被拦 —— 规则配对了却没有真的生效').toBeDefined()
    expect(thenHit!.message).toMatch(/微任务/)

    const awaitHit = linter
      .verify(awaitProbe, eslintConfig as never, 'src/app/audio-unlock.ts')
      .find((m) => m.ruleId === 'no-restricted-syntax')
    expect(awaitHit, 'await 探针没被拦 —— .then() 那块的 selector 把 AwaitExpression 顶掉了').toBeDefined()
  })

  it('`.then()` 禁令不得外溢到 services/audio.ts（AC-D6 的解码链必须能用 .then）', () => {
    const linter = new Linter()
    const probe =
      'export function p(u: string): void {\n' +
      "  void fetch(u).then((r) => r.arrayBuffer())\n" +
      '}\n'

    const hit = linter
      .verify(probe, eslintConfig as never, 'src/services/audio.ts')
      .find((m) => m.ruleId === 'no-restricted-syntax')
    expect(
      hit,
      'services/audio.ts 被 `.then()` 禁令误伤了 —— AC-D6 要求这里用「同步发起 + 挂 .then」',
    ).toBeUndefined()
  })

  it('探针文件在磁盘上都真实存在（改名会让整批 ESLint 守卫静默失效）', () => {
    const missing = probeFilesExist()
      .filter((p) => !p.exists)
      .map((p) => p.path)
    expect(missing, '探针文件在磁盘上不存在 —— ESLint 会按兜底 glob 算配置，整批守卫失明').toEqual([])
  })

  it('effects-runner.ts 真实存在（AC-G8 裁决把它写进了禁 await 名单）', () => {
    expect(statSync(resolve(root, 'src/app/effects-runner.ts')).isFile()).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════════════
// [CR] 2026-10-21 —— G211：`src/app/**` 的音频边界（补 G60/G70 的扫描缺口）
// ════════════════════════════════════════════════════════════════════════

const APP_FILES = walk(join(root, 'src/app'))

/**
 * 🚨 **G60 / G70 原先只扫 `src/components` + `src/views` —— `src/app/` 整层没进扫描范围。**
 *
 * 这不是「多扫一个目录更保险」那么轻：AC-F1 的原文是
 * 「`src/` 里**唯一**调 SFX / BGM 播放函数的地方是 `app/effects-runner.ts`」，
 * 而 `src/app/` 里有 `store.ts`、`dev-adjust.ts`、`session-recorder.ts` 等 10+ 个文件 ——
 * 它们**和组件一样是 app 层代码**，同样可以在 `playSfx(` 前面不经过任何 facade 直接播。
 * 首版守卫让 `store.ts` 里写一行 `playSfx('answer-correct')` 全绿。
 *
 * ⇒ 现在 `src/app/**` 逐文件判定，但**放行两个合法出口**（各带理由，逐字写在下方）：
 *   · `app/effects-runner.ts` —— AC-E1 指定的那唯一执行点；
 *   · `app/audio-unlock.ts`   —— AC-1 三步同步块，解锁动作本身就是 1.2 定下的出口。
 *
 * ⚠️📎 **[CR] 2026-10-21 首版判据错在这里，已改** —— 首版是「名单外的文件里
 *   **不许出现这个函数名**」，当场把 `store.ts` 判红，而 `store.ts` 调的是
 *   **门面**（`import { stopBgm } from './effects-runner'`）—— 那正是架构要求的姿势。
 *   ⇒ 这就是本仓库记过的「判据粒度粗于豁免项」的又一例：**按名字判，分不出
 *     「从门面拿」与「绕过门面直连服务」**。改成按**来源**判：
 *     出现这个名字 ⇒ 必须能从 `./effects-runner` 导入它。
 *
 * ⚠️📎 **第二版判据又错了一次，是变异 M243 打出来的**：来源判据首版写成
 *   `/import[^;]*\bplaySfx\b[^;]*from\s*['"][^'"]*effects-runner['"]/`。
 *   `store.ts` **没有分号** ⇒ `[^;]*` 一路跨过整份文件，于是「后面**任意**位置
 *   有一条 effects-runner 的 import」被当成了「这个名字来自门面」。
 *   实测：在 store.ts 里加 `import { playSfx } from '../services/audio'`，
 *   名字那条判据**照样全绿** —— 第二次假绿。
 *   ⇒ 改成**逐条 import 语句**解析：先切出每条 `import { … } from '…'`，
 *     再看**哪一条**导入了这个名字、来源是哪儿。
 */
describe('G211 —— `src/app/**` 的音频边界：只能经 effects-runner 的门面（AC-E1 / AC-F1）', () => {
  /** 合法出口 —— 只有它们本身可以直接 import 音频服务。 */
  const ALLOWED = new Set(['effects-runner.ts', 'audio-unlock.ts'])

  /**
   * 这个名字在本文件里是从哪个模块导入的？`null` = 根本没导入（自造，或压根没用）。
   *
   * ⚠️ **逐条匹配**（`[^}]*` 只跨花括号内、`from` 紧跟其后）——
   *   不能用 `[^;]*` 把范围放开到整份文件，那正是首版假绿的成因。
   */
  function importSourceOf(code: string, name: string): string | null {
    const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
    for (const m of code.matchAll(re)) {
      const imported = m[1]!
        .split(',')
        .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim())
      if (imported.includes(name)) return m[2]!
    }
    return null
  }

  it('扫得到 app 层文件 —— 路径变了或目录空了，守卫已失明', () => {
    expect(APP_FILES.length, '扫不到任何 src/app 文件').toBeGreaterThan(1)
    expect(
      APP_FILES.some((f) => f.endsWith('store.ts')),
      'src/app/store.ts 不在扫描范围内 —— G211 的判据没生效',
    ).toBe(true)
  })

  it.each(['playSfx', 'startBgmIfReady', 'prewarmBgm', 'stopBgm'])(
    '%s 出现在 app 层时，只能从 effects-runner 的门面导入',
    (name) => {
      const offenders = APP_FILES.filter((file) => {
        if (ALLOWED.has(file.slice(file.lastIndexOf('/') + 1))) return false
        const code = stripComments(readFileSync(file, 'utf8'))
        if (!new RegExp(`\\b${name}\\b`).test(code)) return false
        const source = importSourceOf(code, name)
        // 导入了但来源不是门面 ⇒ 绕过出口；压根没导入却出现了名字 ⇒ 自造的同名函数。
        return source === null || !source.includes('effects-runner')
      })
      expect(
        offenders.map((f) => f.slice(root.length + 1)),
        `${name} 出现在 app 层却不是经 effects-runner 门面拿的 —— 副作用出口就不再唯一（架构硬约束 4）`,
      ).toEqual([])
    },
  )

  it('app 层不直接 import services/audio —— 只允许两个出口（AC-F4 的 app 侧）', () => {
    const offenders = APP_FILES.filter((file) => {
      const base = file.slice(file.lastIndexOf('/') + 1)
      if (ALLOWED.has(base)) return false
      const code = stripComments(readFileSync(file, 'utf8'))
      return /from\s+['"][^'"]*services\/audio['"]/.test(code)
    })
    expect(
      offenders.map((f) => f.slice(root.length + 1)),
      'app 层绕过 facade 直接 import 音频服务 —— 副作用出口就不再唯一',
    ).toEqual([])
  })

  it('反向自测：判据本身会咬 —— 直连服务与自造同名都被抓，走门面放过', () => {
    // ⚠️ 判据自检（R-53）：把判据本体抽出来喂四种文本，不能只断言真实代码全绿。
    const judge = (file: string, code: string): boolean => {
      if (ALLOWED.has(file.slice(file.lastIndexOf('/') + 1))) return false
      if (!/\bplaySfx\b/.test(code)) return false
      const source = importSourceOf(code, 'playSfx')
      return source === null || !source.includes('effects-runner')
    }
    // ① 绕过门面直连服务 —— 这正是 G211 要防的形态。
    expect(
      judge('store.ts', "import { playSfx } from '../services/audio'\nplaySfx('a')\n"),
      '直连 services/audio 必须判红 —— 否则这条守卫恒真',
    ).toBe(true)
    // ② **同一个文件里既有门面 import 又有直连 import** —— 首版判据在这里放过，
    //    变异 M243 打的就是这一形态（「别处有相关 import 就当它来自门面」）。
    expect(
      judge(
        'store.ts',
        "import { stopBgm } from './effects-runner'\n" +
          "import { playSfx } from '../services/audio'\n" +
          'playSfx("a")\n',
      ),
      '门面 import 不能替直连 import 背书 —— 这正是 M243 命中的假绿',
    ).toBe(true)
    // ③ 自造同名函数 —— 同样绕过出口。
    expect(judge('dev-adjust.ts', 'function playSfx() {}\n'), '自造同名必须判红').toBe(true)
    // ④ 走门面 —— 合法，判据必须放过它（首版就是在这里误伤 store.ts 的）。
    expect(
      judge('store.ts', "import { stopBgm } from './effects-runner'\nstopBgm()\n"),
      '门面调用必须放过 —— 首版判据在这里误伤真实代码',
    ).toBe(false)
    expect(judge('effects-runner.ts', "import { playSfx } from '../services/audio'\n"), '名单内必须放过').toBe(false)
  })
})

/**
 * 🚨 **G250 —— AC-B2 的 import 白名单 + AC-C7 的两条禁令，此前**一条守卫都没有**。**
 *
 * ── 坏法 ───────────────────────────────────────────────────────────────────
 * AC-B2 逐字写「**允许** import 的只有 `./types.js`、`./hud.js`、`./actions.js`、
 * `./balance.js`」，AC-C7 逐字写「**不许**在 `effects.ts` 里 `import.meta.glob`
 * 或 `fs.existsSync`」—— 而这两条**一条守卫都没有**：
 *   · G59 逐条扫的是「代码里出现了什么**标识符**」（window / Date / Math.random…），
 *     **没有一条扫 import** ⇒ 有人写 `import { existsSync } from 'node:fs'`，
 *     G59 全绿 —— 「零 DOM」守住了，「零文件系统」没守住；
 *   · `../content/` 那条 G59 有（`not.toMatch(/\.\.\/content\//)`），
 *     但那是**逐字符串**匹配，不是白名单 —— 加一个 `import ... from '../words.js'`
 *     照样放行。
 *
 * ⚠️ 这两条一旦破，坏法是**静默**的：
 *   · `import.meta.glob` 把构建期文件系统知识引进 core ⇒ core 测试依赖 vite 构建，
 *     `vitest` 之外的 runner（node --test）直接崩；
 *   · `fs.existsSync` 让 core 判据**依赖磁盘** ⇒ 「音效文件在不在」这个本层
 *     无权知道的事实（AC-C7）偷偷渗进判据 ⇒ 换台机器测试结果就变。
 */
describe('G250 —— core/effects.ts 的 import 白名单与 AC-C7 禁令（AC-B2 / AC-C7）', () => {
  const source = stripComments(readFileSync(join(root, 'src/core/effects.ts'), 'utf8'))

  /** AC-B2 逐字列出的四个允许项。 */
  const ALLOWED = new Set(['./types.js', './hud.js', './actions.js', './balance.js'])

  /** 抽出源码里出现的**全部**模块说明符（静态 import / 副作用 import / 动态 import）。 */
  function moduleSpecifiers(src: string): string[] {
    const specs = new Set<string>()
    for (const m of src.matchAll(/\bfrom\s+'([^']+)'/g)) specs.add(m[1]!)
    for (const m of src.matchAll(/\bimport\s+'([^']+)'/g)) specs.add(m[1]!)
    for (const m of src.matchAll(/\bimport\s*\(\s*'([^']+)'\s*\)/g)) specs.add(m[1]!)
    return [...specs]
  }

  it('判据自检：抽得出说明符，且四个允许项**都能被认出来**', () => {
    const specs = moduleSpecifiers(source)
    expect(specs.length, '判据自检：一个 import 都没抽出来 —— 判据已失明').toBeGreaterThan(0)
    // ⚠️ 不要求真实源码 import 满四个（用到几个是实现的事），
    //   只要求**白名单里的每一个都能被这套抽取认出来** —— 否则白名单可能写了四个
    //   死条目，判据却只认 `./types.js`（那就成了「恰好对上了」的假绿）。
    const probe = [...ALLOWED].map((s, i) => `import { x${i} } from '${s}'`).join('\n')
    expect(
      moduleSpecifiers(probe).sort(),
      '判据自检：白名单里的说明符有哪一个没被认出来',
    ).toEqual([...ALLOWED].sort())
  })

  it('AC-B2：import 的只有那四个白名单模块', () => {
    for (const spec of moduleSpecifiers(source)) {
      expect(
        ALLOWED.has(spec),
        `core/effects.ts import 了白名单之外的「${spec}」—— AC-B2 只允许 ${[...ALLOWED].join(' / ')}`,
      ).toBe(true)
    }
  })

  it('AC-C7：不许 import.meta.glob（构建期文件系统知识不许进 core）', () => {
    expect(source, 'core/effects.ts 不许用 import.meta.glob —— 那会让 core 依赖 vite 构建').not.toMatch(
      /import\.meta\.glob/,
    )
  })

  it('AC-C7：不许 fs.existsSync / 任何 node:fs（core 判据不许依赖磁盘）', () => {
    expect(source, 'core/effects.ts 不许 import node:fs —— 本层无权知道音频文件在不在磁盘上').not.toMatch(
      /node:fs/,
    )
    expect(source, 'core/effects.ts 不许出现 fs.existsSync（AC-C7 逐字禁令）').not.toMatch(/existsSync/)
  })

  it('反向自检：把白名单外的说明符塞进判据，它会红（证明判据不是恒真）', () => {
    const probe = "import { words } from '../content/index.js'\nimport { x } from 'node:fs'"
    const bad = [...moduleSpecifiers(probe)].filter((s) => !ALLOWED.has(s))
    expect(bad.length, '反向自检：探针里的两个说明符都该被白名单拒绝').toBe(2)
  })
})
