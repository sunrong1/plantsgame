/**
 * ── G330 —— 内容层（`src/content/`）的零 DOM 边界在**类型层**也被守住 ───────
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * DF-020 记的根因逐字是：「**内容层的 DOM/Vue 边界只靠 ESLint，没有类型层兜底**」。
 * 这一条把内容层**单开一个 tsconfig 项目**（`tsconfig.content.json`，`lib` 不含 `DOM`），
 * 于是往 `src/content/` 里写一行 `window` / `document` / `localStorage`
 * 会在 `npm run typecheck` 当场红（TS2304 `Cannot find name 'window'`）——
 * 与 `src/core/` 的零 DOM 红线（`tsconfig.core.json`，R-01）**同一个手法**。
 *
 * ── 为什么判据落在「**看得见吗**」而不是「配置里写没写」 ──────────────────
 * DF-020 自己的原文就点破了旧守卫的毛病：
 * 「`tests/content/content-boundary.test.ts` 求值 eslint 配置来守，但守的是「**规则存在**」，
 *   不是「**规则被改动过**」」。
 * ⇒ 所以本守卫的**主判据是行为式的**：用 **TypeScript 自己的类型检查器**问一句
 *   「在 `src/content/schema.ts` 这个位置，`window` 这个名字**看得见吗**？」
 *   —— 看不见才算守住。
 *   ⚠️ 这一条**同时**覆盖了「把 `lib` 整行删掉」这种退化：
 *   删掉 `lib` ⇒ TS 用 target 的**默认 lib**（`lib.es2023.full.d.ts`，**含 DOM**）
 *   ⇒ `window` 立刻看得见 ⇒ 判据变红。
 *   纯字符串判据（「`lib` 里有没有 `DOM`」）对这一种退化**完全失明**
 *   （`lib` 字段整个不见了，字符串判据只会说「没有 DOM 呀」，照样绿）。
 *
 * ── 出处 ──────────────────────────────────────────────────────────────────
 * **DF-020**（Story 1.6 `[DS]` 登记：「内容层的 DOM/Vue 边界只靠 ESLint，没有类型层兜底」）
 * ＋ **R-01**（`core/` 零 DOM 的同款手法）＋ **R-16**（`content/` 零 DOM）。
 *
 * ── 变异验证（R-50 触发条件 ②：判据依赖配置书写形态）────────────────────
 * **M398**：往 `src/content/schema.ts` 注入一行
 *   `const __probe: string = window.location.href`
 *   ⇒ `npm run typecheck` **当场红**：
 *   `src/content/schema.ts(472,25): error TS2304: Cannot find name 'window'.`
 *   ⇒ 证明**边界真的在咬**（不是「配了一个项目但没人构建它」）；
 *   已复原（`git diff --stat src/content/schema.ts` 无输出）。
 *
 * **M399**：把 `tsconfig.content.json` 的 `lib` 改成 `["ES2023", "DOM"]`
 *   ⇒ **2 红**（G330.2 配置事实 + G330.3 行为式主判据，后者点名
 *   `src/content/distribution.ts 里看得见 window、document、localStorage…`）。
 *
 * **M400**（🔥 **本轮真抓到的洞**）：把 `lib` 改成 `[]`
 *   ⇒ **判据原本全绿**！因为 `[]` 里一个 DOM 都没有，可它同样让内容层
 *   看不见 `JSON` / `Array` —— 那不是「零 DOM」，是「**零世界**」。
 *   ⇒ 已补两条判据：G330.2 断言 `lib` 里**有 ES 基础库**、G330.3 断言
 *   内容层**看得见 `JSON`**（非空自检）⇒ 复测 **2 红**。
 *   ⚠️ 这一条就是 R-50 的意义：判据「看起来对」，不变异过就不知道它漏了什么。
 *
 * **M401**：把 `lib` 那一行**整个删掉**
 *   ⇒ **2 红**（G330.2「没有显式声明 lib」+ G330.3「看得见 window、document…」）
 *   ⇒ 坐实了文件头那句「删掉 `lib` ⇒ TS 用 target 的默认 lib（含 DOM）」——
 *   纯字符串判据对这一种退化**完全失明**。
 *
 * 三次都已复原（`git diff --stat tsconfig.content.json` 只剩新增行）。
 *
 * 不在 src/core/ 下 —— NFR16：测试全部在 tests/。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** 内容层源码目录。 */
const CONTENT_DIR = join(root, 'src/content')

/** 内容层的专用 tsconfig 项目。 */
const CONFIG_REL = 'tsconfig.content.json'

/** 内容层不许看见的浏览器全局（与 `src/core/` 那条红线同款）。 */
const BANNED_GLOBALS = ['window', 'document', 'localStorage', 'speechSynthesis', 'navigator']

/** 递归列出 `src/content/` 下的所有 `.ts` 源文件（绝对路径）。 */
function contentSourceFiles(dir: string = CONTENT_DIR): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...contentSourceFiles(full))
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** 解析一个 tsconfig（JSONC）⇒ TypeScript 自己的解析结果。 */
function parseProject(relPath: string): ts.ParsedCommandLine {
  const path = join(root, relPath)
  const raw = ts.readConfigFile(path, ts.sys.readFile)
  if (raw.error !== undefined) {
    throw new Error(
      `读 ${relPath} 失败：${ts.flattenDiagnosticMessageText(raw.error.messageText, ' ')}`,
    )
  }
  return ts.parseJsonConfigFileContent(raw.config, ts.sys, dirname(path), undefined, path)
}

/**
 * 判据本体：在**某个项目**的编译上下文里，某个源文件的位置上，**看得见**哪些名字。
 *
 * ⚠️ 用的是 TypeScript **自己的类型检查器**（`checker.getSymbolsInScope`），
 *   不是「配置里有没有写 `DOM`」那种字符串判据 —— 后者对「把 `lib` 整行删掉」
 *   这种退化完全失明（见文件头）。
 */
export function visibleGlobals(program: ts.Program, fileName: string): Set<string> {
  const source = program.getSourceFile(fileName)
  if (source === undefined) {
    throw new Error(`${fileName} 不在这个项目的文件列表里 —— 判据作用在了空集上`)
  }
  const symbols = program.getTypeChecker().getSymbolsInScope(source, ts.SymbolFlags.Value)
  return new Set(symbols.map((s) => s.getName()))
}

describe('G330 —— 内容层的零 DOM 边界在类型层也被守住（DF-020）', () => {
  it('G330.1 内容层项目覆盖了 src/content/ 的每一个源文件（否则它是装饰品）', () => {
    expect(
      existsSync(join(root, CONFIG_REL)),
      `${CONFIG_REL} 不存在 —— 内容层的类型层兜底根本没建`,
    ).toBe(true)

    const project = parseProject(CONFIG_REL)
    const onDisk = contentSourceFiles()
    expect(
      onDisk.length,
      'src/content/ 一个源文件都没有 ⇒ 判据在空集上成立（目录结构变了？）',
    ).toBeGreaterThan(0)

    const inProject = new Set(project.fileNames.map((f) => f.replace(/\\/g, '/')))
    const missing = onDisk.filter((f) => !inProject.has(f.replace(/\\/g, '/')))
    expect(
      missing,
      `这些内容层源文件不在 ${CONFIG_REL} 的文件列表里 —— 内容层的类型检查根本没覆盖它们：\n${missing
        .map((f) => relative(root, f))
        .join('\n')}`,
    ).toEqual([])

    // 反向：这是「内容层专用项目」，不许收进 src/content/ 之外的文件
    // （否则就变成第二个 app 项目，`lib` 里的 DOM 会重新漏进来）。
    const outside = project.fileNames.filter((f) => !f.startsWith(CONTENT_DIR))
    expect(
      outside,
      `${CONFIG_REL} 收了 src/content/ 之外的文件 —— 它是「内容层专用项目」，不是「另一个 app 项目」：\n${outside
        .map((f) => relative(root, f))
        .join('\n')}`,
    ).toEqual([])
  })

  it('G330.2 内容层项目的 lib 显式声明且不含 DOM，types 为空数组', () => {
    const project = parseProject(CONFIG_REL)
    const lib = project.options.lib

    // ⚠️ 「显式声明」这一步不是洁癖：`lib` 整个删掉 ⇒ TS 用 target 的默认 lib
    //   （`lib.es2023.full.d.ts`，**含 DOM**）⇒ 零 DOM 边界当场消失。
    expect(
      lib,
      `${CONFIG_REL} 没有显式声明 lib —— TS 会退回 target 的默认 lib（含 DOM），零 DOM 边界就没了`,
    ).toBeDefined()

    const domLibs = (lib ?? []).filter((f) => /dom/i.test(f))
    expect(
      domLibs,
      `${CONFIG_REL} 的 lib 里含 DOM：${domLibs.join('、')} —— 内容层不该看见浏览器 API`,
    ).toEqual([])

    // ⚠️ 「非空」也要断言：`lib: []` 里**一个 DOM 都没有**，可它同样让内容层
    //   看不见 `JSON` / `Array` / `Object` —— 那不是「零 DOM」，那是「零世界」。
    //   （实测 M400：`lib` 改成 `[]` 时，下面两条判据原本**全绿** ⇒ 洞已补。）
    const esLibs = (lib ?? []).filter((f) => /es\d*\.d\.ts$/.test(f))
    expect(
      esLibs.length,
      `${CONFIG_REL} 的 lib 里没有 ES 基础库（${(lib ?? []).join('、') || '空'}）—— ` +
        '那不是「零 DOM」，是「零世界」：内容层连 JSON / Array 都看不见',
    ).toBeGreaterThan(0)

    // 不写 types: [] 会全局注入 @types/node，于是内容层里 process / Buffer 可用
    expect(
      project.options.types,
      `${CONFIG_REL} 的 types 不是空数组 —— 内容层是浏览器代码，不该看见 node 的全局类型`,
    ).toEqual([])
  })

  it('G330.3 在内容层源码里，DOM 全局**看不见**（行为式主判据）', () => {
    const project = parseProject(CONFIG_REL)
    const program = ts.createProgram([...project.fileNames], project.options)
    const files = contentSourceFiles()

    for (const file of files) {
      const visible = visibleGlobals(program, file)
      const seen = BANNED_GLOBALS.filter((name) => visible.has(name))
      expect(
        seen,
        `${relative(root, file)} 里看得见 ${seen.join('、')} —— ` +
          `内容层是「录入 + 校验」的数据层，不该有浏览器全局（${CONFIG_REL} 的 lib 必须不含 DOM）`,
      ).toEqual([])
    }

    // ⚠️ 非空自检：内容层**必须看得见 ES 基础库**。
    //   否则「一个全局都看不见」也能满足上面那条（`lib: []` 就是这种状态）——
    //   那是「零 DOM」被误判成「零世界」。见 G330.2 里同源的 M400。
    const first = files[0]!
    expect(
      visibleGlobals(program, first).has('JSON'),
      `${relative(root, first)} 里连 JSON 都看不见 —— 内容层的 lib 装的是「零世界」而不是「零 DOM」，` +
        '判据在空集上成立（这一条挡不住 `lib: []` 那种退化）',
    ).toBe(true)
  })

  it('G330.4 反向自测：同一份判据在**装了 DOM** 的项目上必须答「看得见」（判据不是恒绿）', () => {
    const project = parseProject(CONFIG_REL)
    const withDom: ts.CompilerOptions = {
      ...project.options,
      lib: [...(project.options.lib ?? ['lib.es2023.d.ts']), 'lib.dom.d.ts'],
    }
    const program = ts.createProgram([...project.fileNames], withDom)
    const file = contentSourceFiles()[0]!

    const visible = visibleGlobals(program, file)
    expect(
      visible.has('window'),
      `构造失效：装了 DOM 的项目里 \`window\` 仍看不见 ⇒ 判据对任何配置恒绿，它什么也守不住（${relative(
        root,
        file,
      )}）`,
    ).toBe(true)
  })

  it('G330.5 内容层项目挂在 solution 上（`vue-tsc -b` 真的会构建它）', () => {
    const solution = parseProject('tsconfig.json')
    // ⚠️ `projectReferences[].path` 是**解析后**的路径（TS 把它换成绝对路径），
    //   所以不能拿配置里写的相对串去比 —— 要比「指向同一个文件」。
    const referenced = (solution.projectReferences ?? []).map((r) => resolve(root, r.path))
    const target = join(root, CONFIG_REL)

    expect(
      referenced.includes(target),
      '根 tsconfig.json 的 references 里没有内容层项目 ⇒ `vue-tsc -b` 根本不会构建它，' +
        '这条边界等于没加（配了项目但没人跑）',
    ).toBe(true)
  })
})
