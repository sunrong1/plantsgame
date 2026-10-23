/**
 * 关卡流程的接线守卫（Story 1.16 / AC-C1–AC-C5、G89 / G93 / G95 / G96）。
 *
 * ── 这个文件守什么 ────────────────────────────────────────────────────────
 * **全是接线**，一条纯函数判据都没有。这是刻意的：1.15 的 M90 与 M97 两次 0 红
 * （`docs/rules/architecture.md` 的 R-06 段逐字记着）都是同一个形态 ——
 * 判据钉在 `runEffects` / `advanceProgress` 的**返回值**上，
 * 而调用方把错的对象递进去时，**纯函数照样返回正确的东西**。
 * ⇒ 「跨模块传错对象」是本仓库最贵的一种漏网，它绕过的不是「没写守卫」，
 *   而是「守卫站在错的一侧」。
 *
 * 四条判据各自对应一个具体的坏法：
 *   · **G89** 重打的结果必须落盘 —— 否则重打后关页面，重进又回到失败画面（FR51）
 *   · **G93** `RESTART_LEVEL` 的唯一调用点是 `store.restartLevel()`（R-04 的接线半）
 *   · **G95** 进关单元号 = `progress.currentUnitIndex + 1` —— 否则推进对孩子零可见效果
 *   · **G96** 落盘的那份 `progress` 是**这一次结算之后**的 —— 否则「答完就关页面」会丢词
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────────
 * 1. **`localStorage` 用共享 fake**（R-37：`tests/fixtures/fake-storage.ts` 是全仓唯一一份）。
 *    不装的话 `writeSave` 会静默降级成 `'write'`，**没有一条用例变红** ——
 *    守卫自己先漏那就太难看了。
 * 2. **判据全部走真的 `applyAction` 链路**，不许直接改 `state.value` 来「模拟」
 *    一次 dispatch —— 那正是 M90 漏掉的那一半。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ⚠️ 类型必须走**静态** `import type`：`core` 那个命名空间来自下面的
//   `await import('../../src/core')`，而 `await import` 的返回值**不能当命名空间用**
//   （TS2503）。两者指向同一个模块 —— 值走动态 import 是为了让 `vi.mock` 能生效，
//   类型走静态 import 只是要那几个形状。
import type { Progress, State } from '../../src/core'
import { stripComments } from '../helpers/contrast'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'
import { driveStoreLevel } from '../fixtures/store-level-driver'

let storage: FakeStorage
let warn: ReturnType<typeof vi.spyOn>

const core = await import('../../src/core')
const content = await import('../../src/content')
const saveApi = await import('../../src/services/save')
const store = await import('../../src/app/store')

const SRC = join(process.cwd(), 'src')

/** 一份结构合法的初始对局。 */
function freshState(): State {
  return core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
}

/**
 * 把 store 推到 `level-failed`。
 *
 * ⚠️ **直接构造而不是答题答错四次**：`assertInvariants` 要求 `hearts` 落在
 * `[0, HEARTS]`，而「连错 4 题」这个门槛属于 `applyResolve` 内部的战斗结算，
 * 与本文件要验的**写盘接线**无关 ⇒ 走真实门槛只会让用例慢且脆。
 * `tests/components/hud.test.ts` 的 G57 用的是同一手法。
 */
function pushIntoLevelFailed(): void {
  const base = store.state.value
  store.state.value = { ...base, hearts: 0, phase: { kind: 'level-failed' } }
}

/**
 * 用**真的** store 门面跑完整一局，直到通关。
 *
 * 📎 **Story 2.5 / Task 5.3 把这份驱动搬到了 `tests/fixtures/store-level-driver.ts`。**
 *   2.5 要验「单元 1 要打 4 局」⇒ 又需要一份同样的驱动 ⇒ 两份各写各的会**悄悄漂移**
 *   （建塔策略改了只有一份 ⇒ 「4 局」这个数字在两份文件里给出不同的答案，而两边都绿 ——
 *   这正是 `level-driver.ts` 文件头记着的那个坑）。
 *   ⇒ 现在是**全仓一份**（R-37），本文件与 `tests/app/unit-advance.test.ts` 共用它。
 *   ⚠️ **建塔策略仍然复用 `greedyBuildActions`**（R-37：全仓一份建塔策略）。
 *   ⚠️ 走 store 门面而不是 `applyAction(action)`：`placeSelectedAt` 才有
 *   「自动清选中态」那条边（G42），绕开它等于测的不是孩子实际走的那条路。
 *   ⚠️ `afterEachAnswer` 为什么必须挂在**答题之后**而不是整局之后 ——
 *     实测（R-50 探针的结论，见 G96）：落盘的滞后**只在「同一次 dispatch 里既结算了
 *     掌握记录、又命中了写盘点」时**才露得出来。`ANSWER` 正是那一次
 *     （`awaiting-build` 是写盘点），而 `advanceProgress` 排在 `runEffectsFromStore`
 *     **之后** ⇒ 答题那一刻盘上少一个词。
 *     `startRound()` 的三次 dispatch 各自重读 `progress.value`，会把这一条补上。
 *     ⚠️ ⇒ **只在整局之后断言「落盘 = 内存」是一条恒绿判据**：它测不出 1.15 的偏离 3，
 *       而症状（孩子答完最后一题立刻关页面，丢一个词）恰恰发生在**中途**。
 */
const driveLevel = driveStoreLevel

/** 直接读盘上的原始 JSON —— 不走 `readSave()`，免得解析层把问题藏起来。 */
function readRawSave(): { progress: Progress; currentGame: State | null } {
  const raw = storage.data.get(saveApi.SAVE_KEY)
  // ⚠️ `Map.get` 的缺席值是 `undefined` 而不是 `null` —— 只判 `=== null` 会把
  //   「没落盘」当成「落了个 undefined 进去」，JSON.parse 立刻报一个看不懂的错。
  if (raw === undefined) throw new Error('盘上根本没有存档 —— 接线没落盘')
  return JSON.parse(raw)
}

beforeEach(() => {
  storage = installFakeStorage()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  store.state.value = freshState()
  store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
  store.view.value = 'start'
})

afterEachUninstall()

// ── G89：重打的结果必须落盘 ───────────────────────────────────────────────

describe('G89 —— 重打之后盘上必须是一局**新的**（FR51 战场不跨局保留）', () => {
  it('重打走完 applyAction 链路 ⇒ 盘上的 currentGame 换成新的一局', () => {
    pushIntoLevelFailed()

    store.restartLevel()

    const saved = readRawSave().currentGame
    if (saved === null) throw new Error('重打后 currentGame 为 null —— 盘上还是局末清空的那份')
    expect(saved.hearts, '重打后盘上的心数必须是满值，不是 0').toBe(core.HEARTS)
    expect(saved.phase.kind, '重打后盘上的相位必须是新一局的开局').toBe('awaiting-answer')
    expect(saved.turn, '重打后回合号回到 1').toBe(1)
  })

  it('🚨 反向钉住：删掉 effects.ts 那第 6 行判据，本用例必须红', () => {
    // 夹具自检 —— 失败态本身必须真的落过盘，否则下面那条断言会拿到 null 而误判。
    pushIntoLevelFailed()
    store.restartLevel()
    expect(readRawSave().currentGame?.hearts, '前置：重打后盘上确实是满心').toBe(core.HEARTS)
  })

  it('重打不推进 currentUnitIndex —— 重打是同单元内的再来一次（FR52）', () => {
    store.progress.value = { currentUnitIndex: 0, masteredWordIds: ['u1-hello'] }
    pushIntoLevelFailed()

    store.restartLevel()

    expect(store.progress.value, '重打不是过关 —— 单元号一个字都不许动').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: ['u1-hello'],
    })
    expect(readRawSave().progress, '盘上那份也一样：掌握记录只增不减（FR58）').toEqual({
      currentUnitIndex: 0,
      masteredWordIds: ['u1-hello'],
    })
  })

  it('重打绝不走 enterLevel —— 走它会把刚失败的那一局读回来', () => {
    pushIntoLevelFailed()

    store.restartLevel()

    expect(
      store.state.value.phase.kind,
      '若这一步内部调了 enterLevel → restoreFromSave，盘上那份 level-failed 会覆盖重打结果',
    ).toBe('awaiting-answer')
  })
})

// ── G93：RESTART_LEVEL 的唯一调用点 ───────────────────────────────────────

/**
 * 这个文件里**从 `core` 绑定了 `restartLevel` action 构造器**的全部本地名。
 *
 * ⚠️📌 `[CR]` 2026-10-17 新增。原来 G93 的正则只认**字面名** `restartLevel(`，
 *   而 `viaStoreFacade`（从 `app/store` import 了同名符号）是**文件级**布尔 ——
 *   两件事叠起来留了一个洞，而 R-51 记的正是「守卫为了让自己绿而允许了要防的违规」：
 * ```ts
 *   import { restartLevel }        from '../../app/store'   // 合法：调门面
 *   import { restartLevel as mk }  from '../../core'        // 🚨 第二个 dispatch 点
 *   applyAction(mk())
 * ```
 *   上面那段**同时**满足 `viaStoreFacade === true`（于是 ⑤ 把整份文件放行）
 *   与「正则在 `mk(` 上什么都不匹配」⇒ 违规调用点完全隐形。
 *   ⇒ 判据必须**先把别名解析出来**，再一起扫。
 *
 * ⚠️ 返回值是 `Set` 而非单个名字：别名可以任意起。
 * ⚠️ `import type { … }` 显式排除 —— 类型位置的构造器调不出来。
 */
function coreCtorLocalNames(clean: string): Set<string> {
  const names = new Set<string>()
  const importRe = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  for (const m of clean.matchAll(importRe)) {
    const from = m[2] ?? ''
    if (!/(^|\/)core(\/|$)/.test(from)) continue
    for (const clause of (m[1] ?? '').split(',')) {
      const parts = clause.trim().split(/\s+as\s+/)
      const imported = (parts[0] ?? '').trim()
      if (imported !== 'restartLevel') continue
      const local = (parts[1] ?? parts[0] ?? '').trim()
      if (local !== '') names.add(local)
    }
  }
  return names
}

/** 扫「可能是一个 dispatch 点」的调用 —— 匹配字面名**与**全部 core 别名。 */
function dispatchPointPattern(ctorNames: Set<string>): RegExp {
  const alts = ['restartLevel', ...ctorNames]
  // ⚠️ 排序只为让错误信息可复现；`Set` 的插入序在 `import` 顺序变时会飘。
  const uniq = [...new Set(alts)].sort()
  return new RegExp(`(?<!\\w)(${uniq.join('|')})\\s*\\(`, 'g')
}

describe('G93 —— RESTART_LEVEL 只有一个调用点，且是 store 门面', () => {
  it('判据自检：白名单里那个门面真的调了 applyAction(restartLevel(...))', () => {
    // R-52：源码匹配型守卫必须先 stripComments —— `store.ts` 的文件头注释里
    // 逐字出现过「`restartLevel()` 重置的是 `State`」，不剥注释它会被当成调用点。
    const src = stripComments(readFileSync(join(SRC, 'app', 'store.ts'), 'utf8'))

    // ⚠️ **用 `.test()` 而不是 `expect(src).toMatch(...)`**：后者失败时会把整个
    //   `store.ts`（450+ 行中文注释）打进报告，把真正的失败信息埋掉。
    //   R-53 要的是「判据不是恒真的」这一件事，`.test()` 已经把它验到了。
    // ⚠️ 匹配 `restartLevelAction`（core 那个**构造器**的别名）而不是 `restartLevel`
    //   —— 门面与构造器同名，不加别名就没法在同一文件里同时存在。
    //   守卫 2（扫全仓的那个）只认**无别名的** `restartLevel(`，
    //   所以别名调用不会被误报成「第二个调用点」，而它本来就在白名单里。
    // ⚠️ `[^{]*` 而不是 `\s*`：`{` 前面还隔着返回类型标注 `: void`，
    //   写成 `\s*` 会让这条自检在**任何**实现下都不匹配 —— 那就是恒假，
    //   比恒真更难查（R-51）。
    expect(
      /export\s+function\s+restartLevel\(\)[^{]*\{[\s\S]{0,300}?applyAction\(\s*restartLevelAction\(\s*\)\s*\)/.test(src),
      '判据自检：`store.restartLevel()` 若不再调 `restartLevel` action（`applyAction`），' +
        '下面那条「唯一调用点」守卫会静默空转（白名单里什么都找不到）',
    ).toBe(true)
  })

  it('🚨 全仓再无第二个 RESTART_LEVEL 的 dispatch 点', () => {
    const offenders: string[] = []

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|vue)$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue
        const clean = stripComments(readFileSync(full, 'utf8'))
        // ⚠️ **门面调用与 action 构造器同名，正则本身分不出来** ——
        //   `LevelOutcome.vue` 里那处 `restartLevel()` 是**调 store 门面**（合法，
        //   AC-D3 逐字要求的），而 `core/actions.ts` 里那处是**造 action**。
        //   ⇒ 判据加一层**来源判定**：这个文件若从 `app/store` import 了
        //     `restartLevel`，那它手里那个同名符号就**一定是门面**（R-02 分层
        //     决定了它不可能同时从 core 拿到构造器而不引起 TS 重复标识符错误）。
        //   ⚠️ **不许改成「把 `LevelOutcome.vue` 加进白名单」**（R-51/R-57）：
        //     那样以后第五个组件绕过门面直连 core 也会照样绿。
        const viaStoreFacade = /import\s*\{[^}]*\brestartLevel\b[^}]*\}\s*from\s*['"][^'"]*app\/store['"]/.test(
          clean,
        )
        // ⚠️📌 `[CR]` 2026-10-17：这里从「只扫字面名」改成「扫字面名 **+ 从 core
        //   绑定的全部别名」——原来别名调用整条隐形，而 ⑤ 又会把整份文件放行。
        const ctorNames = coreCtorLocalNames(clean)
        for (const m of clean.matchAll(dispatchPointPattern(ctorNames))) {
          const at = m.index ?? 0
          const called = m[1] ?? 'restartLevel'
          // ① 定义本身不算调用点。
          if (/export\s+function\s+$/.test(clean.slice(Math.max(0, at - 40), at))) continue
          // ② `core/actions.ts` 里的 `restartLevel()` 是 **action 构造器**，
          //    它是这条链路的**源头**，不算违规调用点。
          if (full.endsWith(join('core', 'actions.ts'))) continue
          // ③ `core/index.ts` 的 barrel 只是重导出。
          if (full.endsWith(join('core', 'index.ts'))) continue
          // ④ 白名单：`store.ts` 的门面自己 dispatch 一次。
          if (full.endsWith(join('app', 'store.ts'))) continue
          // 🚨📌 `[CR]` 新增的前置判定（排在 ⑤ 之前）：**这一处调的是从 core
          //   绑来的构造器**，无论文件里有没有同时 import 门面，都算第二个 dispatch 点。
          if (ctorNames.has(called) && called !== 'restartLevel') {
            offenders.push(`${full.slice(SRC.length + 1)} → ${called}()（从 core 绑定的构造器别名）`)
            continue
          }
          // ⑤ 从 `app/store` import 的那个同名符号**就是门面**，不是第二个 dispatch 点。
          if (viaStoreFacade) continue
          offenders.push(`${full.slice(SRC.length + 1)} → ${called}()`)
        }
      }
    }

    walk(SRC)
    expect(offenders, `RESTART_LEVEL 的 dispatch 必须只经 store 门面；多出来的调用点：\n${offenders.join('\n')}`)
      .toEqual([])
  })

  it('🚨 反向自测：判据仍能咬住「绕过门面直连 core」（R-51）', () => {
    // ⚠️ **这条不许省**：上面那条加的 ⑤ 是一个真实的「放行」分支，
    //   而 R-51 记着的正是「守卫为了让它自己绿而允许了它要防的违规」。
    //   探针刻意写成**从 core import 构造器再调**——这才是 AC-D3 禁的那件事。
    const probe = `import { restartLevel } from '../../core'\nconst a = restartLevel()`
    const viaStoreFacade = /import\s*\{[^}]*\brestartLevel\b[^}]*\}\s*from\s*['"][^'"]*app\/store['"]/.test(
      probe,
    )
    expect(viaStoreFacade, '判据自检：从 core import 的同名符号不得被当成门面').toBe(false)
    expect([...probe.matchAll(/(?<!\w)restartLevel\s*\(/g)].length, '判据自检：正则确实命中了那处调用').toBe(1)

    // 反过来，门面那一侧必须**被**判成门面，否则 AC-D3 的正常写法会被误报。
    const facade = `import { restartLevel, state } from '../../app/store'\nconst a = restartLevel()`
    expect(
      /import\s*\{[^}]*\brestartLevel\b[^}]*\}\s*from\s*['"][^'"]*app\/store['"]/.test(facade),
      '判据自检：从 app/store import 的那个必须被判成门面',
    ).toBe(true)
  })

  it('🚨 反向自测：判据能咬住「别名 import 的 core 构造器」（`[CR]` 2026-10-17 补）', () => {
    // ⚠️ **这一条守的是刚补的那个洞**：同一份文件里既 import 门面、又从 core
    //   别名绑一次构造器。旧判据下它**完全隐形** ——
    //   `viaStoreFacade` 是文件级布尔（把整份文件放行），
    //   而正则只认字面名 `restartLevel(`（`mk(` 一个字符都不匹配）。
    const probe = [
      `import { restartLevel } from '../../app/store'`,
      `import { restartLevel as mk } from '../../core'`,
      `const a = restartLevel()`,
      `const b = mk()`,
    ].join('\n')

    const viaStoreFacade = /import\s*\{[^}]*\brestartLevel\b[^}]*\}\s*from\s*['"][^'"]*app\/store['"]/.test(
      probe,
    )
    expect(viaStoreFacade, '判据自检：这份探针**确实**同时 import 了门面（这正是那个洞的前提）').toBe(true)

    const ctorNames = coreCtorLocalNames(probe)
    expect(
      [...ctorNames],
      '判据自检：必须把别名 `mk` 解析成「从 core 绑定的构造器」',
    ).toEqual(['mk'])

    const matches = [...probe.matchAll(dispatchPointPattern(ctorNames))].map((m) => m[1])
    expect(
      matches,
      '判据自检：新的扫描模式必须同时命中门面调用与别名调用',
    ).toEqual(['restartLevel', 'mk'])

    // 真正要断的那一条：别名调用**不得**被 `viaStoreFacade` 放行。
    const offenders = [...probe.matchAll(dispatchPointPattern(ctorNames))]
      .filter((m) => ctorNames.has(m[1] ?? '') && (m[1] ?? '') !== 'restartLevel')
      .map((m) => m[1])
    expect(offenders, '🚨 判据自检：别名构造器调用必须被判为违规，不得被文件级放行吞掉').toEqual([
      'mk',
    ])
  })
})

// ── G95：进关单元号 = progress.currentUnitIndex + 1 ───────────────────────

describe('G95 —— 局末清空后重进，进的是**下一个单元**', () => {
  it('currentUnitIndex = 0 ⇒ 进单元 1（Epic 1 的恒等变换，必须仍然成立）', () => {
    seedSave({ currentUnitIndex: 0, masteredWordIds: [] }, null)

    store.enterLevel()

    expect(store.state.value.unitNumber, '0 基的 0 推进后是 1 基的单元 1').toBe(1)
  })

  it('🚥 currentUnitIndex > 0 时按 index + 1 组装（Epic 1 真机上走不到，靠假存档构造）', () => {
    // ⚠️ 这是 AC-F2 要求的构造：`UNITS.length === 1` ⇒ 真机永远走到「目标单元不存在」的
    //   那一半。不喂一个越界的 index，这条判据就永远是装饰守卫（R-51）。
    seedSave({ currentUnitIndex: 7, masteredWordIds: [] }, null)

    store.enterLevel()

    expect(store.progress.value.currentUnitIndex, '进度逐字恢复').toBe(7)
    expect(
      store.state.value.unitNumber,
      '目标单元 8 不存在 ⇒ 降级回首个单元，且不得抛（NFR13）',
    ).toBe(1)
    expect(
      warn.mock.calls.length,
      '降级必须留一条 WARN ——「不回头的推进」是静默丢数据，必须可查',
    ).toBeGreaterThan(0)
  })

  it('currentGame 非 null 时**一律**走断点续学原路径，一个字段都不许动', () => {
    const game = freshState()
    // ⚠️ `state.unitNumber` 故意与「下一个单元」= 6 不同：只有这样这条断言才有鉴别力 ——
    //   两者都等于 1 时，「走了重新组装」与「走了断点续学」给出同一个结果。
    seedSave({ currentUnitIndex: 5, masteredWordIds: ['u1-hello'] }, game)

    store.enterLevel()

    // ⚠️ 用 `toEqual` 而不是 `toBe`：`restoreFromSave` 把存档 JSON 过了
    // `assertInvariants`，而它是会**返回新对象**的。断言引用相等就是在断言
    // 「校验函数没有 copy」—— 那是一条与本 story 无关、且实现有权改的细节。
    expect(store.state.value, '断点续学优先于「下一个单元」—— 否则孩子会丢一整局').toEqual(game)
    expect(store.state.value.phase.kind, '存档里是开局相位，重进后必须仍在开局').toBe('awaiting-answer')
  })
})

// ── G96：落盘的那份 progress 是结算后的 ───────────────────────────────────

describe('G96 —— 落盘的 progress 必须是**这一次结算之后**的', () => {
  it('🚥 每答对一题，盘上立刻就有这个词 —— 不许「等下一次 dispatch 再补」', () => {
    // ⚠️ 这是 1.15 偏离 3（「落盘比内存少一条」）的**真实**后果所在。
    //   `ANSWER` 是唯一一次「既结算了掌握记录、又命中了写盘点（`awaiting-build`）」
    //   的 dispatch，而 `advanceProgress` 排在 `runEffectsFromStore` **之后**
    //   ⇒ 答题那一刻盘上少这个词。`startRound()` 的三次 dispatch 各自重读
    //   `progress.value`，会把这一条补上。
    //   ⇒ **只在整局之后断言「落盘 = 内存」是恒绿的**（实测：裁决 11 落地前后都绿），
    //     而孩子的症状恰恰发生在中途：答完最后一题立刻关页面。
    const lags: number[] = []
    driveLevel(() => {
      lags.push(diskMasteredCount() - store.progress.value.masteredWordIds.length)
    })

    expect(
      lags.filter((lag) => lag !== 0),
      '每一次答题后盘上都必须已经含这个词；实际逐回合差值 = ' + JSON.stringify(lags),
    ).toEqual([])
    // ⚠️📌 `[CR]` 2026-10-17：这条消息原来写死「**至少 37 个回合**」，
    //   而判据是 `toBe(deck.length)` —— **等值**不是「至少」。
    //   两处坏处，各有其形：
    //     · Epic 2 把单元 1 的题单从 37 改成 35 ⇒ 断言仍绿，但「至少 37」成了死字，
    //       下一个读它的人会以为 36 也算数；
    //     · 真跑出 36 个 lag（少一题，**这才是本用例要抓的 bug**）⇒ 断言红，
    //       消息却写着「至少 37」，读的人会以为 36 也能接受 ⇒ 误判严重度。
    //   ⇒ 消息里的数字改为跟着 `deck.length` 走，措辞与判据逐字对齐。
    const expectedTurns = store.state.value.deck.length
    expect(
      expectedTurns,
      '判据自检：题单非空（否则上面那条是恒绿 —— 空数组上跑，filter 出来也是空）',
    ).toBeGreaterThan(0)
    expect(lags.length, `跑完整局应得 ${expectedTurns} 个回合（= 题单长度，一题一个 lag）`).toBe(
      expectedTurns,
    )
  })

  it('整局跑完：盘上的词条数 = 内存 = 题单长度，且 currentGame 已清空', () => {
    driveLevel()

    const saved = readRawSave()
    expect(saved.currentGame, '通关时 currentGame 存 null（局末清空，FR51）').toBeNull()
    expect(saved.progress.masteredWordIds.length, '落盘 = 内存').toBe(store.progress.value.masteredWordIds.length)
    expect(saved.progress.masteredWordIds.length, '一局全部答对 ⇒ 每个词都在盘上').toBe(
      store.state.value.deck.length,
    )
  })

  it('📎 [CR]` 2026-10-23（Story 2.5）：通关**且本单元全部词条已掌握** ⇒ 推进到下一个单元', () => {
    // ⚠️ 这条用例原来逐字是「**Epic 1 的 `UNITS.length === 1` ⇒ 通关不推进
    //   currentUnitIndex**（缺单元时不推进）」—— 它的**前置在 2.5 之后不再成立**
    //   （单元 2 已录入），而它咬的是「**无条件推进**」。
    //   ⚠️ **本文件的 `freshState()` 用的是全部 37 条当题单**（不是每局 10 条）
    //   ⇒ 这一局就把整个单元学完了 ⇒ **推进是应该发生的**。
    //   ⚠️ 「该推进时没推进」那一半由 `tests/app/unit-advance.test.ts` 的
    //   AC-5.2（第一局不推进）/ AC-5.5（缺下一个单元不推进）以**真路径**守住；
    //   「缺单元时不推进」在 2.5 之后已经**不是**这一层的职责了。
    driveLevel()

    expect(
      store.progress.value.currentUnitIndex,
      '本单元全部词条已掌握 ⇒ 推进到单元 2（不抛错，不记降级）',
    ).toBe(1)
    expect(readRawSave().progress.currentUnitIndex, '盘上那份也一样').toBe(1)
  })

  it('⚠️ 通关**不是**一次降级 —— 不得留下任何 WARN（否则 1.17 的面板会误报）', () => {
    driveLevel()

    expect(
      warn.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[save]')).length,
      '孩子读完单元 1 是正常结局，不是一次可诊断的失败',
    ).toBe(0)
  })
})

/** 盘上那份存档的掌握词条数；没落盘时返回 -1（让断言的差值显形而不是恒 0）。 */
function diskMasteredCount(): number {
  const raw = storage.data.get(saveApi.SAVE_KEY)
  return raw === undefined ? -1 : JSON.parse(raw).progress.masteredWordIds.length
}

// ── AC-C4 的前提到期：2.5 之后「有下一个单元」这一支**真机可达** ──────────────

describe('AC-F2 —— 「有下一个单元」这一支在 Story 2.5 之后**真机可达**', () => {
  it('读完单元 1 ⇒ 推进判据真的走 true 分支（currentUnitIndex 0 → 1）', () => {
    // ⚠️ 这条用例原来逐字是「UNITS 里确实只有单元 1 —— 所以 store 侧的推进判据
    //   **永远走 false 分支**」，而它自己的失败消息逐字写着
    //   「若这里变了（2.5 录入了单元 2），AC-C4 的『不做下一单元 UI 路径』就需要重新评估」
    //   ⇒ 2.5 正是那个「变了」的事件，而 AC-C4 的前提**到期**（DF-059 的 UI 路径
    //   正是 2.5 的 Task 5.2 补上的）。
    // ⚠️ **不许把它改成 `toEqual([1, 2])` 就完事** —— 那是一条恒真的装饰守卫（R-51）：
    //   判据要落在「这一支**真的走得到**」这个**行为**上。
    expect(
      content.UNITS.map((u) => u.unitNumber),
      '前置：单元 2 已录入 ⇒ 这一支不再是恒 false',
    ).toEqual([1, 2])

    driveLevel()

    expect(
      store.progress.value.currentUnitIndex,
      '读完单元 1 ⇒ 这一支**真的走得到**（构造上不可达的那半年已经过去）',
    ).toBe(1)
  })
})

/** 往 fake 里塞一份存档（绕过写盘，测的是**读**这一侧）。 */
function seedSave(progress: Progress, currentGame: State | null): void {
  storage.data.set(
    saveApi.SAVE_KEY,
    JSON.stringify({
      schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
      savedAt: 1_700_000_000_000,
      progress,
      currentGame,
    }),
  )
}
