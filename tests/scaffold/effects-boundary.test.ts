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
 *   并配**反向验证**：探针文本真的会被报出来（`deferred-work.md:117-118` 的要求），
 *   否则「规则配对了却根本没生效」会一路绿灯。
 * · 词边界用 `\bword\b`，**不**用 `\bword\s` —— 后者在中文顿号上失配（R-53）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { Linter } from 'eslint'

import eslintConfig from '../../eslint.config.js'
import { patternStrings, optionsOf, probeFilesExist, rulesForFile, severityOf } from '../fixtures/eslint-rules'

const root = process.cwd()

/** 去掉块注释与行注释 —— 扫描「代码里出现了什么」，不扫「注释里说了什么」。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** 递归列出目录下所有 `.ts` / `.vue`。 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.ts$|\.vue$/.test(name) ? [full] : []
  })
}

const COMPONENT_FILES = walk(join(root, 'src/components'))
const VIEW_FILES = walk(join(root, 'src/views'))

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

describe('G70 —— 组件与视图不 import `services/audio`（AC-F4）', () => {
  it.each(['src/components/quiz/QuestionCard.vue', 'src/views/StartView.vue'])(
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
    const runAt = body.indexOf('runEffectsFromStore(action, prev, next)')
    const assignAt = body.indexOf('state.value = next')

    expect(runAt, 'applyAction 里没有 runEffectsFromStore 调用 —— 音效链路没接上').toBeGreaterThan(-1)
    expect(assignAt, 'applyAction 里没有 state.value = next').toBeGreaterThan(-1)
    expect(
      runAt < assignAt,
      `runEffectsFromStore 在第 ${runAt} 字节、state.value = next 在第 ${assignAt} 字节 —— ` +
        '排在赋值之后的话 prev 取不到，一条音效都不会响',
    ).toBe(true)
  })

  it('清选中与进度合并仍在赋值之后（AC-E2：这两步读新 state，不许动）', () => {
    const body = store.slice(store.indexOf('export function applyAction'))
    const assignAt = body.indexOf('state.value = next')
    expect(body.indexOf('clearSelectionIfLeavingBuildPhase(next)')).toBeGreaterThan(assignAt)
    expect(body.indexOf('advanceProgress(progress.value, next)')).toBeGreaterThan(assignAt)
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
    // ⚠️ 这条是 AC-G8 的正题：`deferred-work.md:108-124` 记的 `.then()` 逃逸。
    //   只钉 AwaitExpression 时，`ctx.resume().then(() => { prewarmBgm() })` 被完全放行。
    expect(
      selectors.some((s) => s?.includes("property.name='then'")),
      `audio-unlock 的禁列里没有 .then() 的 selector（现有：${selectors.join(' / ') || '无'}）`,
    ).toBe(true)
  })

  it('🚨 反向验证：Linter 真的会拦下 .then() 逃逸与 await（AC-G8 / deferred-work.md:117-118）', () => {
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
