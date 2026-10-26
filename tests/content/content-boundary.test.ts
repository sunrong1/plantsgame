/**
 * 内容层的边界守卫（Story 1.6 / Task 7.4）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 1. **塔型集合 === `TOWER_TYPES`** —— `src/content/schema.ts` 里那份 `z.enum` 字面量
 *    是有意的重复，重复就会漂移。这条断言是它唯一的防漂移装置（M11 的守卫）。
 * 2. **`src/content/` 的 DOM / Vue 边界** —— 内容层落在 app 项目（有 DOM）里，
 *    core 那条「零 DOM」红线对它不生效。⚠️ 2026-10-26 夜起**类型层也兜住了**
 *    （`tsconfig.content.json` 的 `lib` 不含 `DOM` ⇒ 写 `window` 编译报错），
 *    守卫在 `tests/scaffold/content-tsconfig-boundary.test.ts`；
 *    **本文件守的仍是 ESLint 那一道**（两道各管一半，缺一不可）。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * · **不写死 `['direct','slow','aoe']`**。写死了这条断言就变成「两处字面量相等」，
 *   而真正的风险是 core 那一侧变了（塔型增删）时内容层没跟上。
 *   所以期望值从 `TOWER_TYPES` 取 —— core 改了，这里立刻红。
 * · **求值 eslint 配置而不是匹配源码字符串**，理由同 `core-boundary.test.ts:84-89`：
 *   子串匹配可以被另一个 config 块分别满足，测试全绿而防线已废。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TOWER_TYPES } from '../../src/core/balance'
import { CARD_KINDS } from '../../src/core/types'
import { CardKindSchema, TowerTypeSchema } from '../../src/content/schema'
import { rulesForFile, severityOf } from '../fixtures/eslint-rules'
import { findForbiddenImports } from '../helpers/import-specifiers'

/**
 * ⚠️ `[CR]` 2026-10-16 删除 —— **这里原来还有第三份 `rulesFor` 副本。**
 *
 * `tests/fixtures/eslint-rules.ts` 存在的全部理由就是「一份实现，多处共用」，
 * 而本文件当时没跟上，于是：
 *   · 副本 1：`core-boundary.test.ts`（原始）
 *   · 副本 2：`audio-unlock-guard.test.ts`（1.2 抽出 fixture 后的受益者）
 *   · 副本 3：**本文件，一份从未被抽取的、无人知道的副本**
 *
 * 三份各自演化、各自带洞。三份都在「只认 `files` 数组里含有该 glob 字符串的块」，
 * 都看不见更窄 glob 的覆盖，也都从不读 `ignores`。
 * ⇒ 删掉本地的，全部走 `rulesForFile()`（ESLint 自己的解析器，见 fixture 里的说明）。
 */

/** schema 的塔型枚举取值集合（从 schema 的元信息取，不另抄一份字面量）。 */
function towerTypesFromSchema(): readonly string[] {
  // Zod 4 的枚举把合法值放在 `.def.entries` 里，形如 `{ direct: 'direct', ... }`。
  // ⚠️ 这是一次对 zod 内部形状的读取 —— 若 zod 升级改了它，本文件立刻红，
  //   那正是想要的：换版本时必须回来重新确认这条断言仍然等价于「枚举的取值集合」。
  const def = TowerTypeSchema.def as { entries?: Record<string, string> }
  if (def.entries === undefined) {
    throw new Error('TowerTypeSchema 不再是枚举 —— 塔型白名单的形状变了，本断言需要重写')
  }
  return Object.keys(def.entries)
}

describe('AC-7 / M11 —— 塔型的单一事实源', () => {
  it('内容层的塔型集合 === core 的 TOWER_TYPES', () => {
    expect(
      [...towerTypesFromSchema()].sort(),
      '内容 schema 的塔型集合与 core/balance.ts 的 TOWER_TYPES 不一致 —— ' +
        '战斗数值按 core 查表，内容层却能录入别的塔型 ⇒ 塔建成时静默 undefined',
    ).toEqual([...TOWER_TYPES].sort())
  })

  it('content/ 上 no-restricted-imports 同时禁 vue 与 core（两条边界都要真被守）', async () => {
    // 若哪天有人图省事改成 `z.enum(TOWER_TYPES)`，内容校验就会依赖战斗层模块加载成功。
    // 这条断言把那个选择挡在外面：要改成 import，必须先改这条测试并说明理由。
    const rule = (await rulesForFile('src/content/schema.ts'))['no-restricted-imports']
    expect(rule, 'content/ 上没有 no-restricted-imports 规则').toBeDefined()

    const shape = (Array.isArray(rule) ? rule[1] : rule) as {
      paths?: { name?: string }[]
      patterns?: { group?: string[] }[]
    }
    // 边界一：零 Vue 依赖。
    expect(
      (shape.paths ?? []).map((p) => p.name),
      'vue 不在禁列里 ⇒ content/ 可以 import vue，边界已废',
    ).toContain('vue')

    // 边界二：不 import core。
    // ⚠️ [CR] 2026-10-14：这一条原先**根本不存在**。旧断言只检查了「规则存在且含 vue」，
    // 而 core 从来不在禁列里 —— 注释还写着「core 不在禁列里 —— 见下一条 it」，
    // 后面并没有下一条 it。变异坐实：给 schema.ts 加
    // `import { TOWER_TYPES } from '../core/balance'` 后 93/93 全绿。
    // 「声明的边界」和「被守的边界」差了整整一条，这是本项目记忆里那条教训的第四次。
    const groups = (shape.patterns ?? []).flatMap((p) => p.group ?? [])
    expect(
      groups,
      'core 不在 no-restricted-imports 的 patterns 里 ⇒ 内容层可以依赖战斗层模块加载成功，' +
        '一个坏 JSON 会先报成 import 失败，报错现场离错误源头很远',
    ).toContain('**/core/**')
  })

  it('G304 content/ 的源码里真的没有 import core（规则之外再验一次实际代码）', () => {
    // 规则可能配错、可能只对某些 glob 生效。这条直接读源码，
    // 是「边界」这个断言最后一道不依赖任何配置的兜底。
    //
    // ⚠️ **G304（2026-10-24 夜）**：这一条原先用正则 `/from\s+'([^']+)'/g` 扫，
    //   **只认静态形态** ⇒ 动态 `import()` 两道守卫都放过（DF-120 的实测：
    //   往 `distribution.ts` 注入 `await import('../core/balance')`，
    //   ESLint 0 problems、typecheck 通过、**运行期真的把 `ZOMBIE_HP` 读了回来**）。
    //   现在改用 TypeScript 的 AST（`tests/helpers/import-specifiers.ts`）⇒
    //   静态 / 动态 / 重导出 / `require` 四种形态一次收齐，
    //   且**注释与字符串里的字面量天然不算导入**（正则分不清，AST 分得清）。
    const srcDir = fileURLToPath(new URL('../../src/content/', import.meta.url))
    const offenders: string[] = []
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts')) continue
      const body = readFileSync(join(srcDir, name), 'utf8')
      for (const hit of findForbiddenImports(name, body, /(^|\/)core(\/|$)/)) {
        offenders.push(`${name} → ${hit}`)
      }
    }

    expect(
      offenders,
      `内容层 import 了 core：${offenders.join('、')} —— 内容校验不得依赖战斗层模块加载成功`,
    ).toEqual([])
  })

  it('G304.2 反向自测：动态 import / 静态 import 都要被抓到，注释里的不算', () => {
    const forbidden = /(^|\/)core(\/|$)/

    // ① 动态 import —— 这正是 DF-120 实测能穿过两道守卫的形态。
    const dynamic = findForbiddenImports(
      'probe.ts',
      "export async function probe() {\n  const m = await import('../core/balance')\n  return m\n}\n",
      forbidden,
    )
    expect(
      dynamic.length,
      '构造失效：动态 `import(\'../core/balance\')` 没被抓到 ⇒ 判据仍然只认静态形态',
    ).toBeGreaterThan(0)
    expect(
      dynamic.some((h) => h.includes('dynamic')),
      `构造失效：抓到了，但不是认出的「dynamic」形态：\n${dynamic.join('\n')}`,
    ).toBe(true)

    // ② 静态 import —— 老判据唯一认得的形态，不能因为换实现而丢掉。
    const staticImport = findForbiddenImports(
      'probe.ts',
      "import { ZOMBIE_HP } from '../core/balance'\n",
      forbidden,
    )
    expect(
      staticImport.length,
      '构造失效：静态 import 没被抓到 ⇒ 换 AST 判据把老形态弄丢了',
    ).toBeGreaterThan(0)

    // ③ 注释里写着同样的字面量 ⇒ **不算导入**（DF-120 的「分不清注释与代码」）。
    const inComment = findForbiddenImports(
      'probe.ts',
      "// 边界拦的是这种写法：import { ZOMBIE_HP } from '../core/balance'\n/* 动态的也拦：await import('../core/balance') */\n",
      forbidden,
    )
    expect(
      inComment,
      `构造失效：注释里的字面量被判成了导入 —— 说明判据仍在按文本匹配：\n${inComment.join('\n')}`,
    ).toEqual([])

    // ④ 无关的导入不该误报（判据得是「按禁列」而不是「见到 import 就红」）。
    const benign = findForbiddenImports('probe.ts', "import { z } from 'zod'\n", forbidden)
    expect(
      benign,
      `构造失效：连 zod 都被报出来了 ⇒ 判据的禁列写错了：\n${benign.join('\n')}`,
    ).toEqual([])
  })
})

describe('AC-30 的副作用 —— content/ 的 DOM 边界（ESLint 一道 + 类型层一道）', () => {
  it('src/content 配了 no-restricted-globals，且严重级别是 error', async () => {
    const rule = (await rulesForFile('src/content/schema.ts'))['no-restricted-globals']

    expect(
      rule,
      'src/content 上没有 no-restricted-globals —— 内容层落在 app 项目（有 DOM）里，' +
        'core 的零 DOM 红线对它不生效，没有这条就完全没有守卫',
    ).toBeDefined()
    expect(severityOf(rule)).toBe('error')
  })

  it('禁掉的是 DOM 全局（window / document / localStorage）', async () => {
    const rule = JSON.stringify(
      (await rulesForFile('src/content/schema.ts'))['no-restricted-globals'],
    )

    for (const name of ['window', 'document', 'localStorage']) {
      expect(rule, `content/ 的 DOM 边界没禁住 ${name}`).toContain(name)
    }
  })
})

/**
 * 判据本体：比对 core 侧与 content 侧的卡型取值集合（**顺序无关**）。
 *
 * 抽成函数是为了让**反向自测真的调用判据本体**（R-51）——
 * 反向自测只断言假夹具自身的话，判据被掏空时照样绿。
 */
export function cardKindProblems(
  coreKinds: readonly string[],
  contentKinds: readonly string[],
): string[] {
  const problems: string[] = []
  const core = new Set(coreKinds)
  const content = new Set(contentKinds)
  for (const kind of core) {
    if (!content.has(kind)) problems.push(`core 认的卡型「${kind}」，内容层不认`)
  }
  for (const kind of content) {
    if (!core.has(kind)) problems.push(`内容层能录的卡型「${kind}」，core 不认`)
  }
  return problems
}

/** schema 的卡型枚举取值集合（从 schema 的元信息取，不另抄一份字面量）。 */
function cardKindsFromSchema(): readonly string[] {
  // Zod 4 的枚举把合法值放在 `.def.entries` 里（与塔型那条同款）。
  const def = CardKindSchema.def as { entries?: Record<string, string> }
  if (def.entries === undefined) {
    throw new Error('CardKindSchema 不再是枚举 —— 卡型白名单的形状变了，本断言需要重写')
  }
  return Object.keys(def.entries)
}

describe('G303 —— 卡型的单一事实源（core ↔ content）', () => {
  it('G303.1 内容层的卡型集合 === core 的 CARD_KINDS', () => {
    const contentKinds = cardKindsFromSchema()
    expect(
      contentKinds.length,
      '内容层的卡型集合读出来是空的 ⇒ 判据在空集上成立',
    ).toBeGreaterThan(0)

    const problems = cardKindProblems(CARD_KINDS, contentKinds)
    expect(
      problems,
      `core 的卡型与内容层的卡型不一致：\n${problems.join('\n')}\n` +
        '—— 两侧各写一份时，任何一侧增删卡型，另一侧一声不响（DF-117）',
    ).toEqual([])
  })

  it('G303.2 反向自测：任一侧多出一个卡型，判据必须报出来（判据本体真的被调用）', () => {
    const contentKinds = cardKindsFromSchema()

    const coreExtra = cardKindProblems([...CARD_KINDS, 'phrase'], contentKinds)
    expect(
      coreExtra.length,
      '构造失效：core 侧多出一个卡型，判据却没报出来',
    ).toBeGreaterThan(0)
    expect(
      coreExtra.some((p) => p.includes('phrase')),
      `构造失效：判据报了别的卡型，没报多出来的那个：\n${coreExtra.join('\n')}`,
    ).toBe(true)

    const contentExtra = cardKindProblems(CARD_KINDS, [...contentKinds, 'phrase'])
    expect(
      contentExtra.length,
      '构造失效：内容层多出一个卡型，判据却没报出来',
    ).toBeGreaterThan(0)
    expect(
      contentExtra.some((p) => p.includes('phrase')),
      `构造失效：判据报了别的卡型，没报多出来的那个：\n${contentExtra.join('\n')}`,
    ).toBe(true)

    // 一致时必须零命中 —— 否则判据可能恒红（那样它就什么也没守住）。
    expect(
      cardKindProblems(CARD_KINDS, contentKinds),
      '构造失效：两侧一致时判据却报了问题 ⇒ 判据恒红',
    ).toEqual([])
  })
})
