/**
 * 存档服务的边界守卫（Story 1.15 / AC-A3、AC-E1、AC-G1、G73、G82、G83、G84、R-14 补卫）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * `src/services/save.ts` 是全仓**唯一**允许碰 `localStorage` 的地方，也是
 * `SaveFile` 这个结构唯一的声明处。这两件事一旦被绕过，后果都不报错：
 *   · `core/` 或 `content/` 里写出 `localStorage` ⇒ 内容/战斗层与浏览器存储绑死，
 *     测试环境（node，无 DOM）下整条链路失效且**没有任何工具报警**；
 *   · `save.ts` 里另写一份 `Progress` / 另抄一份字段名 ⇒ 两个真相源，
 *     键名一改，存盘与读盘在**不同**的键上找数据，而两边都编译通过。
 * ⇒ 本文件把「谁能碰存储」与「存档结构声明在哪」两件事分别钉死。
 *
 * ── 为什么这么判 ────────────────────────────────────────────────────────────
 * 1. **源码型判据一律先 `stripComments`**（R-52）：本文件的注释里**逐字写着**
 *    `localStorage`、`` '../core' ``、`DebugPanel` 这些字样 —— 不剥注释，
 *    每一条正则都会命中**自己写的说明文字**，然后对着注释报错。
 * 2. **词边界用 `\b…\b`**（R-53）而不是 `\b…\s`：后者在中文顿号、逗号上失配。
 *    每条正则写完都先 `expect(cleaned).toMatch(...)` 自测，
 *    确认判据**真的会命中**再拿它去断言「不该命中」。
 * 3. **ESLint 侧用 `Linter.verify` 真跑**，并且探针路径一律用 `.ts` ——
 *    `Linter.verify` 不接 `languageOptions.parser`，拿 `.vue` 去 verify 会解析失败、
 *    零消息，而「规则没触发」与「没解析」长得一模一样（1.14 逐字记过）。
 * 4. **「豁免」与「误伤」分开验**：`save.ts` **不该**被禁 `localStorage` 拦住
 *    （那是它存在的理由），但 `core/` 与 `content/` **必须**仍被拦住 ——
 *    这两条各自都能被单独改坏。
 *
 * ⚠️ **R-14 此前无守卫**（`docs/rules/architecture.md` 逐字写着「⚠️ 无守卫」）——
 *   本文件顺带补上它最硬的一半：`src/core/**` 源码里 `console.` **零出现**。
 *   （`services/` 与 `app/` 的那部分按 R-14 允许「带前缀且不在逐帧路径」，
 *   判据放不进「零出现」这一条，所以只守 core/。）
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { Linter } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

import eslintConfig from '../../eslint.config.js'
import { PROBE_FILES, probeFilesExist, rulesForFile, severityOf } from '../fixtures/eslint-rules'

/** eslint flat config 的一个块（本仓只用到 `files` 与 `rules`）。 */
interface EslintBlock {
  files?: string | string[]
  rules?: Record<string, unknown>
}

/** 读源码；测试目录在仓库内，故以 `process.cwd()` 为基准（与 `PROBE_FILES` 一致）。 */
function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

/**
 * 剥掉注释再判（R-52）。
 *
 * ⚠️ 顺序不能换：先剥块注释再剥行注释。反过来的话 `* /` 里的 `//` 会先把块注释腰斩。
 * ⚠️ 行尾注释也剥（`const x = 1 // 解释`）—— 本仓现有代码全是行首注释，
 *   但守卫不能靠「现在碰巧都是」这种假设活着（deferred-work 里已记过这条坑）。
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const SAVE_SOURCE = readSource('src/services/save.ts')
const SAVE_CLEAN = stripComments(SAVE_SOURCE)

/**
 * 📎 `[CR]` 2026-10-21（Story 1.15 评审）补：AC-E1 逐字点的是**三个**文件 ——
 *   `src/services/save.ts` / `src/app/effects-runner.ts` / `src/app/store.ts` ——
 *   而 G82 原先只扫**第一个**。
 * ⚠️ 这不是「多扫一个目录更保险」：另两个是 app 层文件，**同样能 import
 *   `components/debug/DebugPanel`**，而 1.17 之后那个组件**真的存在**了 ⇒
 *   前向依赖会从后门溜进来，而全套件 0 红。
 */
const AC_E1_FILES = [
  'src/services/save.ts',
  'src/app/effects-runner.ts',
  'src/app/store.ts',
] as const

/** `core/` 与 `content/` 各取一份真文件做「禁令仍然生效」的实证。 */
const CORE_SAMPLE = stripComments(readSource('src/core/effects.ts'))
const CONTENT_SAMPLE = stripComments(readSource('src/content/schema.ts'))

beforeAll(() => {
  // 探针表里的每个文件都必须在磁盘上真的存在（改名会让整批查询悄悄拿到兜底配置）。
  for (const { path, exists } of probeFilesExist()) {
    expect(exists, `探针文件 ${path} 在磁盘上不存在 —— 整批 ESLint 查询会落到兜底配置上`).toBe(true)
  }
})

describe('G73 —— 存档结构只有一个声明处（裁决 1 / 2）', () => {
  it('SaveFile.progress 用 core/hud.ts 的 Progress，不是另写一份', () => {
    // ⚠️ **先自测判据真的会命中**：不先证明这条正则认得 `Progress`，
    //    后面那条「不许出现第二份声明」就只是在一个永远匹配不到的模式上空转。
    expect(SAVE_CLEAN, '判据自检：`readonly progress: Progress` 必须能被匹配到').toMatch(
      /\bprogress\b\s*:\s*Progress\b/,
    )

    expect(
      SAVE_CLEAN,
      'progress 的类型必须逐字是 Progress（来自 ../core）—— 另写一份就是造第二个真相（R-37）',
    ).toMatch(/\bprogress\b\s*:\s*Progress\b/)

    // ⚠️ 反向：内联的 object 字面量类型就是「第二份声明」的形态。
    expect(
      SAVE_CLEAN,
      'progress 不得写成内联对象字面量类型（那就是第二份 Progress 声明）',
    ).not.toMatch(/\bprogress\b\s*:\s*\{/)
  })

  it('SAVE_KEY 与 SAVE_SCHEMA_VERSION 都是导出的常量（裁决 1）', () => {
    expect(SAVE_CLEAN, '判据自检：`export const SAVE_KEY` 必须能被匹配到').toMatch(
      /\bexport\s+const\s+SAVE_KEY\b/,
    )
    expect(SAVE_CLEAN, '判据自检：`export const SAVE_SCHEMA_VERSION` 必须能被匹配到').toMatch(
      /\bexport\s+const\s+SAVE_SCHEMA_VERSION\b/,
    )
  })

  it('🔴 版本号不得编进键名（裁决 1：schemaVersion 是值里的字段）', () => {
    // ⚠️ 键名里带版本 ⇒ 旧键变成永远读不到也清不掉的垃圾，
    //   且「读取时校验 schemaVersion」那条判据**永远走不到**（读的是新键，版本天然一致）。
    expect(
      SAVE_CLEAN,
      '键名里带版本号会让 FR61 的版本校验构造上不可达 —— 判据自检：`plantsgame.save.v1` 应被拦',
    ).not.toMatch(/'[^']*\.save[.@]v\d/)
  })
})

describe('G86 —— R-04 的存档那一半：只有 effects-runner 能写盘，只有 store 能读盘', () => {
  /** 全仓 `src/**` 的 `.ts` / `.vue`，按相对路径列出。 */
  function srcFiles(): readonly string[] {
    const out: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(resolve(process.cwd(), dir)).sort()) {
        if (name === 'node_modules') continue
        const rel = `${dir}/${name}`
        if (name.endsWith('.ts') || name.endsWith('.vue')) out.push(rel)
        else if (!name.includes('.')) walk(rel)
      }
    }
    walk('src')
    return out
  }

  it('判据自检：这三份白名单文件真的都调了对应的 API', () => {
    // ⚠️ 拿白名单自身自证：名单里的文件**必须**真的有那处调用 ——
    //   否则「只有这两处能调」会退化成「哪都不许调」而照样全绿（R-51）。
    expect(
      stripComments(readSource('src/app/effects-runner.ts')),
      '判据自检：effects-runner 确实在调 writeSave',
    ).toMatch(/\bwriteSave\s*\(/)
    expect(
      stripComments(readSource('src/app/store.ts')),
      '判据自检：store 确实在调 readSave',
    ).toMatch(/\breadSave\s*\(/)
  })

  it('🚨 全仓再无第二处 writeSave / readSave / clearSave 调用点', () => {
    // ⚠️ **按「调用点」而不是按「文件」判**：`services/save.ts` 自己导出这些函数不算调用，
    //   若按文件判就得把它硬编码进例外名单，例外名单一多，守卫就开始靠自觉活着。
    //   这里逐个调用点比对，判据与名单都不需要维护。
    const CALLERS: Record<string, string> = {
      writeSave: 'src/app/effects-runner.ts',
      readSave: 'src/app/store.ts',
      // 📎 **1.17 [CS] 裁决 8 曾计划把这一条改判为「调用点只许在
      //   `src/components/debug/` 下、且 DEV 门控」—— `[DS]` 未改判，留痕如下。**
      //   前提不成立：`1.17` 的 AC-E3 逐字要求「重试写入」调 `writeSave`、
      //   **不许**调 `clearSave`（「清档与重试是两件事」）⇒ 1.17 从头到尾
      //   **没有造出任何 `clearSave` 调用点**（实测 `grep -rn clearSave src/`
      //   只剩定义处与三处注释）。
      //   ⇒ 原判据「零调用点」**一字未动**，且它比裁决 8 计划的改判**更强**：
      //   改判会允许 debug 组件清档，而那正是 AC-E3 禁止的行为。
      //   变异 M139（「重试写入」改调 `clearSave()`）因此由 **G115** 单独抓，
      //   不再依赖 G86 —— 验证见本 story 的 Task 9。
      clearSave: null as unknown as string,
    }

    for (const [fn, allowed] of Object.entries(CALLERS)) {
      const offenders: string[] = []
      for (const file of srcFiles()) {
        if (file === 'src/services/save.ts') continue
        const clean = stripComments(readSource(file))
        // ⚠️ 正则必须**排除声明处**（`export function writeSave(`）——
        //   只排除文件名是不够的：别的文件重新导出同名函数也会被算成调用点。
        //
        // 📎 **`[CR]` 2026-10-21 把 lookbehind 从 `(?<![\w.])` 改成 `(?<![\w])`** ——
        //   原来那个 `.` 是在**放过成员表达式调用**：任何 `sv.writeSave(` 前面都有个点
        //   ⇒ **一条都匹配不上** ⇒ 有人 `import * as sv from '../services/save'`
        //   再用 `sv.writeSave(...)` 另起一处调用点，本守卫**照样全绿**。
        //   而本守卫的全部意义就是 R-04 的「只有 effects-runner 能写盘」，
        //   它不能在这种形态下失效。**变异 M261 实测 1 红。**
        // ⚠️ **去掉 `.` 不会误伤 import**：`import { writeSave } from …` 里那个名字
        //   后面跟的是 ` }` 而不是 `(` ⇒ 匹配不上。
        for (const m of clean.matchAll(new RegExp(`(?<![\\w])${fn}\\s*\\(`, 'g'))) {
          const at = m.index ?? 0
          if (/export\s+(async\s+)?function\s+$/.test(clean.slice(Math.max(0, at - 40), at))) continue
          if (allowed !== null && file === allowed) continue
          offenders.push(`${file} → ${fn}()`)
        }
      }

      expect(
        offenders,
        allowed === null
          ? `R-04：${fn} 必须零调用点（1.17 的「重试写入」按 AC-E3 调 writeSave，不调它），却在这几处被调了`
          : `R-04：${fn} 只许在 ${allowed} 里调用，却在这几处也被调了`,
      ).toEqual([])
    }
  })
})

describe('G84 —— save.ts 只依赖 ../core（零 Vue、零 app/、零 components/）', () => {
  it('import 只有 ../core 一条', () => {
    // ⚠️ **只拦 import，不拦注释**（R-52 已剥过一遍）——
    //   本文件的注释里逐字提到 `DebugPanel` / `1.17 的调试面板`，那是允许的。
    const imports = [...SAVE_CLEAN.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1])

    expect(imports.length, '判据自检：至少要抓到一条 import').toBeGreaterThan(0)
    expect(
      imports,
      'save.ts 只许 import ../core —— 零 Vue、零 app/、零 components/（R-08 / R-09）',
    ).toEqual(['../core'])
  })

  it('零 Vue / 零 DOM 全局（判据自检：这三条正则认得东西）', () => {
    expect(SAVE_CLEAN, '判据自检：`localStorage` 必须能被匹配到').toMatch(/\blocalStorage\b/)
    expect(SAVE_CLEAN, '判据自检：`JSON.parse` 必须能被匹配到').toMatch(/\bJSON\b/)

    expect(SAVE_CLEAN, '零 Vue：存档服务不该出现 vue 符号').not.toMatch(/\bfrom\s+'vue'/)
    expect(SAVE_CLEAN, '零 window / document：与 core/ 同一条红线').not.toMatch(
      /\b(window|document|speechSynthesis)\b/,
    )
  })
})

describe('G82 —— 零前向依赖：不得引用 DebugPanel / components/debug / 1.17', () => {
  it('判据自检：stripComments 确实剥得掉注释里的字样（R-52 的自证）', () => {
    // ⚠️ 用**合成片段**自测，而不是拿 save.ts 的注释当真 ——
    //   依赖「源码里碰巧写了那句话」的自检，下一次有人改注释就会变成一条假红。
    const probe = stripComments(
      ['/* 将来要接 DebugPanel */', 'export const a = 1 // 这里提到 DebugPanel', ''].join('\n'),
    )

    // ⚠️ 断言两件事：注释里的字样被剥干净，**且真代码没被误伤** ——
    //   只断言前者的话，一个「把整份源码都删空」的 stripComments 也能通过。
    expect(probe, '自检：注释里的 DebugPanel 必须被剥干净（块注释 + 行尾注释）').not.toMatch(
      /\bDebugPanel\b/,
    )
    expect(probe, '自检：真代码必须保留 —— stripComments 只剥注释').toMatch(/export const a = 1/)
  })

  it('剥掉注释后，不得引用任何调试面板（AC-E1）', () => {
    expect(SAVE_CLEAN, '存档服务不得 import 调试面板 —— 那是 1.17 的东西').not.toMatch(
      /\bDebugPanel\b/,
    )
    expect(SAVE_CLEAN, '存档服务不得依赖 components/debug').not.toMatch(/components\/debug/)
    expect(
      SAVE_CLEAN,
      '不得静态 import 调试面板，也不得动态 import —— 判据只拦 require / import(...) 形态',
    ).not.toMatch(/\b(require\s*\(|import\s*\()/)
  })

  // 📎 `[CR]` 2026-10-21（Story 1.15 评审）：G216 —— AC-E1 点名的**另两个文件**。
  it.each([...AC_E1_FILES])('%s 同样不得前向依赖 1.17 的调试面板（AC-E1）', (file) => {
    // ⚠️ **判据自检**：先证明「剥完注释的真代码还在」，否则「把整份文件读空」
    //   也能让下面三条 not.toMatch 全部通过 —— 这是本文件第 3 次栽在这类空转上。
    const clean = stripComments(readSource(file))
    expect(clean.length, `${file} 剥完注释后不该是空的 —— 判据空转了`).toBeGreaterThan(100)
    expect(clean, '自检：真代码必须保留').toMatch(/\b(export|import|const|function)\b/)

    expect(clean, `${file} 不得引用 DebugPanel`).not.toMatch(/\bDebugPanel\b/)
    expect(clean, `${file} 不得依赖 components/debug`).not.toMatch(/components\/debug/)
    expect(clean, `${file} 不得动态 import 调试面板`).not.toMatch(/\b(require\s*\(|import\s*\()/)
  })

  it('反向自测：三份文件都真的进了扫描范围（少一个就判红）', () => {
    // ⚠️ 判据自检（R-53）：AC-E1 逐字点的是三个文件名，这里逐字比对 ——
    //   有人把 AC_E1_FILES 缩成一项时，本条当场红，而不是安静地少扫两个文件。
    expect(
      [...AC_E1_FILES],
      'AC-E1 逐字点的是 save.ts / effects-runner.ts / store.ts 三个文件，少一个都不行',
    ).toEqual(['src/services/save.ts', 'src/app/effects-runner.ts', 'src/app/store.ts'])
  })
})

describe('G83 —— ESLint：禁令仍守 core/ 与 content/，且不外溢到 save.ts', () => {
  /** 真跑一遍 `Linter.verify`，返回该路径上 `no-restricted-globals` 的消息。 */
  function restrictedGlobalsMessages(filePath: string, code: string): string[] {
    const linter = new Linter()
    return linter
      .verify(code, [
        {
          files: ['**/*.ts'],
          languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
          rules: { 'no-restricted-globals': ['error', ...RESTRICTED_GLOBALS] },
        },
      ], filePath)
      .filter((m) => m.ruleId === 'no-restricted-globals')
      .map((m) => m.message)
  }

  /** 与 `eslint.config.js` 里 core/ 与 content/ 两块**逐字相同**的四条禁列。 */
  const RESTRICTED_GLOBALS: readonly { name: string; message: string }[] = [
    { name: 'window', message: 'core/ 零 DOM' },
    { name: 'document', message: 'core/ 零 DOM' },
    { name: 'localStorage', message: '存档是 services/save.ts 的职责' },
    { name: 'speechSynthesis', message: 'TTS 是 services/pronunciation.ts 的职责' },
  ]

  it('探针自检：这两份真文件当下**不含**任何被禁全局（否则上面的正反向都是空跑）', () => {
    // ⚠️ 上两条用的是**合成片段**（「export const a = localStorage」）。合成片段永远
    //   会被拦，所以那两条证明的是「规则本身认得这个词」，不证明「真实 core/ 是干净的」。
    //   这一条把两份**真文件**也过一遍：它们必须是零命中 —— 拿到命中说明禁令外溢了，
    //   而那正是本 story 引入 `save.ts` 时最担心的回归。
    expect(
      restrictedGlobalsMessages('src/core/effects.ts', CORE_SAMPLE),
      '真实的 src/core/effects.ts 里不该出现任何被禁全局',
    ).toEqual([])
    expect(
      restrictedGlobalsMessages('src/content/schema.ts', CONTENT_SAMPLE),
      '真实的 src/content/schema.ts 里不该出现任何被禁全局',
    ).toEqual([])
  })

  it('正向：core/ 里写 localStorage 确实被拦', () => {
    const messages = restrictedGlobalsMessages('src/core/effects.ts', 'export const a = localStorage\n')

    expect(
      messages.some((m) => m.includes('存档是 services/save.ts 的职责')),
      `判据失效：正向用法没有被拦 —— 拿到 ${JSON.stringify(messages)}`,
    ).toBe(true)
  })

  it('反向：content/ 里写 localStorage 同样被拦', () => {
    const messages = restrictedGlobalsMessages('src/content/schema.ts', 'export const a = localStorage\n')

    expect(
      messages.some((m) => m.includes('存档是 services/save.ts 的职责')),
      `判据失效：内容层没有被拦 —— 拿到 ${JSON.stringify(messages)}`,
    ).toBe(true)
  })

  it('误伤检查：save.ts 里的 localStorage **不该**被这条禁令拦下', () => {
    // ⚠️ 这条是本 story 之所以要新加一个 eslint 块就**必须**配的反向验证。
    //   save.ts 用 `localStorage` 是它存在的理由；被拦住 = 1.15 无法交付。
    const messages = restrictedGlobalsMessages('src/services/save.ts', SAVE_CLEAN)

    expect(
      messages,
      `禁令外溢到 save.ts —— 存档服务必须能用 localStorage：${JSON.stringify(messages)}`,
    ).toEqual([])
  })

  // 🚨📎 `[CR]` 2026-10-21（Story 1.15 评审）**G217** —— 上面那三条用的
  //   `restrictedGlobalsMessages` 是拿**本文件里手抄的 `RESTRICTED_GLOBALS`** 拼出来的配置，
  //   跟 `eslint.config.js` **零关联**。
  //   ⇒ 后果：有人给 `eslint.config.js` 的 `src/core/**` 块加上 `src/services/save.ts`
  //     （或新建一个 `src/services/**` 块带 `no-restricted-globals`）——
  //     **`npm run lint` 当场红**（存档服务写 `localStorage` 被自己的禁令拦住），
  //     而**本文件五条一条都不红**，因为它们问的是那份手抄的配置。
  //   ⇒ 「save.ts 不在禁名单里」这一条，**从来没有人问过真配置**。
  //   （名单**内容**另有守卫看着：`tests/scaffold/core-boundary.test.ts` 与
  //     `tests/content/content-boundary.test.ts`。缺的是「save.ts 不在其覆盖范围内」。）
  it('G217：问**真配置** —— save.ts 上没有 no-restricted-globals', async () => {
    const rules = await rulesForFile('src/services/save.ts')
    expect(
      rules['no-restricted-globals'],
      '真实 eslint.config.js 把 no-restricted-globals 施加到了 save.ts 上 —— ' +
        '存档服务写 localStorage 会被自己的禁令拦住，`npm run lint` 当场红',
    ).toBeUndefined()
  })

  it('G217：core/ 与 content/ 在真配置上**确实有**这条禁令（否则上一条恒真）', async () => {
    // ⚠️ 上一条断言 `toBeUndefined()`，它要真的有鉴别力就得**证明反侧为真** ——
    //   否则「`rulesForFile` 对任何文件都返回 undefined」也能让上一条全绿。
    // ⚠️ 只能用 `PROBE_FILES` 里已有的路径 —— `rulesForFile` 对表外的文件会抛。
    for (const path of ['src/core/balance.ts', 'src/content/schema.ts']) {
      const rules = await rulesForFile(path)
      expect(
        severityOf(rules['no-restricted-globals']),
        `${path} 在真配置上必须有 no-restricted-globals —— 否则 G217 的上一条是恒真断言`,
      ).toBe('error')
    }
  })

  it('save.ts 在真实配置下**不在**禁 await 名单里', () => {
    // ⚠️ 断言的是「规则里没有 save.ts 这条路径」，而不是「规则不存在」。
    //   `rulesForFile` 返回的是**最终生效**的配置（含 glob 匹配顺序与 ignores），
    //   所以这条同时覆盖「有人把 save.ts 写进名单」与「有人把 src/services/ 整个写进名单」。
    const inProbeList = (PROBE_FILES as readonly string[]).includes('src/services/save.ts')
    expect(inProbeList, 'save.ts 必须先在 PROBE_FILES 里，否则本文件问不到它').toBe(true)

    return rulesForFile('src/services/save.ts').then((rules) => {
      const rule = rules['no-restricted-syntax']
      expect(rule, 'save.ts 上根本不该有 no-restricted-syntax —— 禁 await 名单不该覆盖它').toBeUndefined()
    })
  })

  // 🚨📎 `[CR]` 2026-10-21（Story 1.15 评审）**G218** —— 原用例标题写着
  //   「禁 await 名单仍然覆盖**那三个**文件」，实际只查了**两个**，
  //   而且其中一个（`audio-unlock.ts`）根本**不在**那条名单上 ——
  //   它在**另一个** eslint 块里（那个块同时禁 `await` 与 `.then()`）。
  //   ⇒ 真配置里只禁 `AwaitExpression` 的那块，逐字覆盖的是这三个文件：
  //   **`src/services/audio.ts` / `src/services/pronunciation.ts` / `src/app/effects-runner.ts`**。
  //   原来那两个**恰好各漏掉一个**：audio.ts 与 pronunciation.ts 从来没被查过。
  //   ⚠️ 这就是本仓库记过的「判「N 处」却只判了其中一部分」——
  //     标题里的数字是判据的一部分，标题错了守卫就名不副实。
  const AWAIT_BANNED = [
    'src/services/audio.ts',
    'src/services/pronunciation.ts',
    'src/app/effects-runner.ts',
    // ⚠️ **刻意不给 `as const`** —— 那会把元素类型收窄成三者的字面量联合，
    //   于是下面反向自测里的 `AWAIT_BANNED.includes('src/services/save.ts')`
    //   变成 TS2345（不在联合里）⇒ **要证明「名单外的东西不在名单里」，
    //   就必须让名单能被当成普通字符串查**。收窄类型反而挡住了判据本身。
  ] satisfies readonly string[]

  /**
   * 📎 `[CR]` 2026-10-21 第二轮：eslint 配置里「**只禁 await**」那一块的 `files`。
   *
   * ⚠️ **为什么直接读配置文件**（而不是问 ESLint 的最终生效结果）：
   *   `rulesForFile()` 只能回答「**某个**文件在不在名单里」，
   *   答不了「名单里**总共**有谁」—— 而「名单被扩大」正是本条要抓的。
   *   ⚠️ 也**不能**对 `eslint.config.js` 做子串匹配：那份配置里到处是注释，
   *   注释里逐字写着 `src/services/save.ts` 之类的路径（为什么不能禁它、为什么它合理需要 await）
   *   —— 子串匹配数到的会是**注释**（R-52）。
   *   ⇒ 求值**真实配置**（与 `tests/scaffold/audio-unlock-guard.test.ts` 同一姿势）。
   *
   * ⚠️ **为什么要挑出「只禁 await」的那一个块**：flat config 里同名规则**后块覆盖前块**，
   *   禁 `.then()` 的那个块（`src/app/audio-unlock.ts`）**也**禁 `AwaitExpression`
   *   —— 它是**另一个**文件、**另一条**规则（配置文件自己的注释逐字记着这个坑）。
   *   把两个块混在一起数，名单就永远对不上「那三个」。
   */
  async function awaitBanFiles(): Promise<readonly string[]> {
    const blocks = eslintConfig as unknown as EslintBlock[]
    const owners = blocks.filter((block) => {
      const rule = block.rules?.['no-restricted-syntax']
      if (!Array.isArray(rule)) return false
      const entries = rule.slice(1) as readonly { readonly selector?: string }[]
      const bansAwait = entries.some((e) => e.selector === 'AwaitExpression')
      const bansThen = entries.some((e) => (e.selector ?? '').includes("property.name='then'"))
      return bansAwait && !bansThen
    })
    if (owners.length !== 1) {
      // ⚠️ 构造失效**当场抛**：静默返回空数组会让下面那条断言变成「名单是空的」
      //   ⇒ 反而「通过」—— 那是一条恒绿守卫。
      throw new Error(
        `构造失效：期望恰好 1 个「只禁 await」的 eslint 块，实际 ${owners.length} 个 —— ` +
          '判据问的不是它了，先修判据',
      )
    }
    const files = owners[0].files
    if (files === undefined) return []
    return Array.isArray(files) ? files : [files]
  }

  it('G218：禁 await 名单逐字覆盖那三个文件（放宽别的不能顺手放宽它）', async () => {
    await Promise.all(
      AWAIT_BANNED.map(async (path) => {
        const rules = await rulesForFile(path)
        expect(
          severityOf(rules['no-restricted-syntax']),
          `${path} 必须仍在禁 await 名单里 —— 加 save.ts 不等于可以删掉它们`,
        ).toBe('error')
      }),
    )
  })

  it('G218：反向自测 —— 名单外的文件（save.ts）不在禁 await 名单里', async () => {
    const rules = await rulesForFile('src/services/save.ts')
    expect(
      rules['no-restricted-syntax'],
      'save.ts 不在禁 await 名单上（1.15 的存档服务是同步的，没有理由禁）',
    ).toBeUndefined()
    expect(
      AWAIT_BANNED.includes('src/services/save.ts'),
      '判据自检：save.ts 不该被写进禁 await 名单里',
    ).toBe(false)
  })

  // 📎📎 `[CR]` 2026-10-21 第二轮新增 —— 把「那三个文件」从**逐个查**改成**整张对账**。
  //
  // ⚠️ **原来那条不够**：它逐个查那三个文件「在不在名单里」，
  //   却**没查「名单里还有没有别人」** ⇒ 往那个块里加第 4 个文件，它照样全绿。
  //   而那个块是「**只禁 await**」的那一个（另一个块还禁 `.then()`）——
  //   加进去的文件**立刻**不许写 await，而这个变化**不报错、不变红**
  //   （要等到下一个人真的写 await 才炸，那时它已经长在配置里很久了）。
  //   ⚠️ 配置文件自己的注释逐字写着「Story 1.14 的 save.ts 合理需要 await」——
  //     名单被悄悄扩大，正是「改配置时顺手」会发生的事。
  //
  // 📎 **怎么问才准**：直接读**配置文件本身**（flat config 的数组），
  //   找出「拥有 `no-restricted-syntax`、禁 `AwaitExpression`、**且不**禁 `.then()`」
  //   的那**一个**块，把它的 `files` 与期望名单**对账**（集合相等，不只是包含）。
  it('G218：禁 await 名单**逐字就是**那三个文件（不多不少）', async () => {
    const files = await awaitBanFiles()

    expect(
      [...files].sort(),
      '🔴 禁 await 的名单与「那三个文件」不相等 —— 名单被扩大了：' +
        '被加进去的文件立刻不许写 await，而这个变化不报错、不变红。' +
        '（配置文件自己的注释写着「Story 1.14 的 save.ts 合理需要 await」——' +
        '往那个块里顺手加一行是最容易犯的那种。）',
    ).toEqual([...AWAIT_BANNED].sort())
  })
})

describe('R-14 —— src/core/ 源码里 console 零出现', () => {
  it('判据自检：`console` 在 core 的真实源码里……应当一个都没有', () => {
    // ⚠️ 写成「本来就该命中」会与下一条矛盾。正确的自检是**验证 stripComments 没把
    //   匹配能力弄坏**：拿一段含 console 的片段先试。
    const probe = stripComments('const a = 1 // console.info 这里只是注释\nconsole.warn("真调用")\n')
    expect(probe, '判据自检：剥掉行注释后仍要能匹配到真调用').toMatch(/\bconsole\s*\./)
  })

  it('src/core/** 逐文件零 console（补上 R-14 此前空着的「守卫」字段）', () => {
    // ⚠️ 逐文件扫，而不是只看 effects.ts —— 规则的价值在于**覆盖整层**。
    const offenders: string[] = []
    for (const path of CORE_FILES) {
      const clean = stripComments(readSource(path))
      if (/\bconsole\s*\./.test(clean)) offenders.push(path)
    }

    expect(
      offenders,
      `R-14「渲染与战斗主路径禁止打日志」在这几个文件里被违反了：${offenders.join('、')}`,
    ).toEqual([])
  })
})

/**
 * `src/core/` 的全部 `.ts` 文件 —— **从目录现读**，不写死清单。
 *
 * ⚠️ 写死清单的话，新增的 `core/xxx.ts` 默认**不在守卫范围内**，
 *   而「新文件忘了加进守卫名单」正是本仓库反复抓到的假绿形态
 *   （`tests/fixtures/eslint-rules.ts` 的文件头逐字记着同一个教训）。
 * ⇒ `readdirSync` 保证新文件自动纳入，代价是删了文件也不会红 —— 可接受。
 */
const CORE_FILES: readonly string[] = readdirSync(resolve(process.cwd(), 'src/core'))
  .filter((name) => name.endsWith('.ts'))
  .map((name) => `src/core/${name}`)
  .sort()
