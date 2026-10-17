/**
 * `services/save.ts` 的行为守卫（Story 1.15 / AC-B、AC-C、AC-E2、G74–G81、G85）。
 *
 * ── 守什么 ──────────────────────────────────────────────────────────────────
 * 存档的三类坏法在界面上**长得一模一样** —— 都是「重进后从头开始」：
 *   · 存储用不了（隐私模式 / 配额满 / 无痕）—— 第一次玩也长这样；
 *   · 存档读不出来（JSON 坏了 / 版本对不上）—— 第一次玩也长这样；
 *   · 存档能读但结构不认得 —— **也长这样**。
 * 没有报错、没有差异、没有可截图的红。而三条路径各自该**登记哪一条降级项**
 * 直接决定 1.17 的调试面板会对家长说什么 —— 说错原因比不显示更糟。
 * ⇒ 本文件把每条路径的「返回值 + 降级键 + 原数据是否被动过」三件事分别钉死。
 *
 * ── 为什么 ──────────────────────────────────────────────────────────────────
 * 1. **`localStorage` 必须自己造**（AC-G3）：全局 `environment: 'node'`
 *    （R-60，不得改 jsdom），而 Node 22 没有这个全局。不 stub 就只有两条路 ——
 *    要么改生产代码的形状，要么每个文件抄一份 fake。
 *    fake 在 `tests/fixtures/fake-storage.ts`，**全仓只有那一份**（R-37）。
 * 2. **写盘点用 `runEffects` 的纯函数判据验，不跑真实战斗**：真实战斗耦合
 *    `ZOMBIE_HP` / 单回合伤害，Story 3.2 会重调它们 ⇒ 那时这几条守卫会因
 *    **与存档无关**的原因变红。合成的 `(prev, next)` 对逐条自带自检断言，
 *    构造失效当场报错而不是静默空转。
 * 3. **`[save]` 日志前缀必须验**：没有前缀，1.17 的面板无法把存档的失败
 *    与音效的失败分支（两者都用 console.warn）。
 *
 * ⚠️ **`vi.resetModules()` 是必需的**：`src/services/save.ts` 的 `degraded`
 *   是**模块级**状态，一份测试文件里上一例登记的降级项会漏给下一例。
 *   每例重新 import 一次 = 每例一份干净的 `Map`。
 *
 * ⚠️ **本文件不碰 `app/` 与组件**：`enterLevel()` 的读档与 `applyAction` 的
 *   接线由 `tests/app/` 侧守卫负责（那是「接线对不对」，这里是「存档本身对不对」）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Progress, State } from '../../src/core'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import type { FakeStorage } from '../fixtures/fake-storage'

/** 每例新建一份 fake。 */
let storage: FakeStorage
/** 每例新建一份 console 探针（只装，不自动还原 —— afterEach 里统一撤）。 */
let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  vi.resetModules()
  storage = installFakeStorage()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const save = await import('../../src/services/save')
  core = await import('../../src/core')
  content = await import('../../src/content')
  saveApi = save
})

afterEachUninstall()

/** 三段动态 import 的容器（`vi.resetModules()` 后每次都是新的一份）。 */
let saveApi: typeof import('../../src/services/save')
let core: typeof import('../../src/core')
let content: typeof import('../../src/content')

/** 一份结构合法的空存档进度。 */
function freshProgress(): Progress {
  return { currentUnitIndex: 0, masteredWordIds: [] }
}

/** 一份非空进度 —— 用它才能验「progress 被原样搬过去」。 */
function busyProgress(): Progress {
  return { currentUnitIndex: 2, masteredWordIds: ['u1-hello', 'u1-cat'] }
}

/** 一份结构合法的初始对局（`deck` 用真实内容，保证 `reduce` 能跑）。 */
function freshState(): State {
  return core.createInitialState({ unitNumber: 1, deck: content.entriesOf(1) })
}

/**
 * 真实走三步，把对局推进到「答完一题、种下一座塔」的 `awaiting-build`。
 *
 * ⚠️ **为什么必须走真实 action 而不是手搓 state**：`grid` 与 `towers` 双向一致
 *   是 `core/` 的不变量（`assertInvariants` 逐条查），手搓一份就会在
 *   `assertInvariants` 那里炸，而那与存档无关。手搓出来的那份只能过
 *   `JSON.stringify`，测不出「存的到底是完整 state 还是残渣」。
 */
function stateWithTower(): State {
  const base = freshState()
  const question = base.phase.kind === 'awaiting-answer' ? base.phase.question : null
  if (question === null) throw new Error('开局不是 awaiting-answer')
  const correct = question.card.options.find((o) => o.correct)
  if (correct === undefined) throw new Error(`题 ${question.entryId} 没有正确项`)
  const answered = core.reduce(base, core.answer(correct.id))
  if (answered.phase.kind !== 'awaiting-build') {
    throw new Error(`答完应在 awaiting-build，实际 ${answered.phase.kind}`)
  }
  return core.reduce(answered, core.placeTower('u1-hello', core.cellKey(core.ZOMBIE_ROW, 1)))
}

/** 只留下 `SAVE` 那一条；多于一条或零条都当场报错（构造失效不留后手）。 */
function onlySaveEffect(prev: State, next: State): { readonly currentGame: State | null } {
  const saves = core.runEffects({ type: 'CONTINUE' }, prev, next).filter((e) => e.kind === 'SAVE')
  if (saves.length !== 1) {
    throw new Error(`构造失效：期望恰好 1 条 SAVE，实际 ${saves.length} 条`)
  }
  const one = saves[0] as { kind: 'SAVE'; currentGame: State | null }
  return one
}

// ══════════════════════════════════════════════════════════════════════════

describe('AC-B3 / G74 —— writeSave 的返回值逐字区分「存上了」与「没存上」', () => {
  it('G74：写成功返回 true，且值真落进了 localStorage', () => {
    const result = saveApi.writeSave(freshProgress(), null)

    expect(result, '写成功必须返回 true —— 静默丢弃正是这条 AC 要防的').toBe(true)
    expect(storage.data.get(saveApi.SAVE_KEY), '必须真的写进了 localStorage').toBeTypeOf('string')
  })

  it('G74：setItem 抛错时返回 false 且**不抛**', () => {
    storage.throwOnSet = true

    // ⚠️ 断言两件事，缺一不可：只断言 false 会漏掉「catch 了但又抛出去」。
    let result: boolean | undefined
    expect(() => {
      result = saveApi.writeSave(freshProgress(), null)
    }, 'writeSave 绝不允许抛 —— 它跑在副作用循环里，冒上去会中断后续条目').not.toThrow()

    expect(result, '写失败必须返回 false，不能假装成功').toBe(false)
    expect(storage.data.size, '写失败不该留下任何数据').toBe(0)
  })

  it('G74：返回的 boolean 是本次的真实结果，不是固定字面量', () => {
    // ⚠️ 这一条专打「无条件 `return true`」与「无条件 `return false`」两种变异。
    //   两次调用的**先后顺序**是判据的一部分：先成功、再失败。
    storage.throwOnSet = false
    const ok = saveApi.writeSave(freshProgress(), null)
    storage.throwOnSet = true
    const bad = saveApi.writeSave(freshProgress(), null)

    expect(
      [ok, bad],
      '同一份实现必须对「能存」与「存不了」给出两个不同的答案 —— 全 true / 全 false 都是假绿',
    ).toEqual([true, false])
  })
})

describe('AC-B7 / G75 —— 存档内容坏了：读不出来、降级为 parse、原串不动', () => {
  it('G75：JSON 损坏 ⇒ 返回 null、登记 parse、**原始字符串逐字未被改动**', () => {
    const corrupt = '{ 这不是 JSON'
    storage.data.set(saveApi.SAVE_KEY, corrupt)

    // ⚠️ **只调一次** `readSave`：本用例末尾要断言「只读不删」，
    //   调两次会让调用记录变成 ['get','get']，判据就恒假了。
    let result: unknown = '没有调用'
    expect(() => {
      result = saveApi.readSave()
    }, 'readSave 绝不允许抛 —— app 层调用它时没有 try/catch').not.toThrow()

    expect(result, '读不出来必须返回 null，而不是把坏数据喂回 store').toBeNull()
    expect(
      saveApi.saveDegradations().map((d) => d.key),
      '降级键必须是 parse —— 1.17 的面板照它对家长说「存档文件坏了」',
    ).toEqual(['parse'])
    // ⚠️ **裁决 8**：不删、不覆写那个 key。删掉就只剩「什么都没发生过」，
    //   1.17 再想排查时现场已经没了。
    expect(storage.data.get(saveApi.SAVE_KEY), '原始字符串必须逐字保留（裁决 8）').toBe(corrupt)
    expect(storage.calls.map((c) => c.op), '损坏的存档只该被读，不该被删或被写').toEqual(['get'])
  })

  it('G75：JSON 合法但内容不是对象（null / 数组 / 字符串）也归 parse', async () => {
    for (const [label, raw] of [
      ['null', 'null'],
      ['数组', '[]'],
      ['裸字符串', '"就一行字"'],
    ] as const) {
      vi.resetModules()
      storage.data.clear()
      const save = await import('../../src/services/save')
      storage.data.set(save.SAVE_KEY, raw)

      expect(save.readSave(), `${label} 不是存档对象，必须返回 null`).toBeNull()
      expect(
        save.saveDegradations().map((d) => d.key),
        `${label} 应归 parse，而不是被当成合法存档放行`,
      ).toEqual(['parse'])
    }
  })

  it('G75：progress 字段结构不完整 ⇒ 归 parse，不把 undefined 喂回 store', () => {
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1,
        progress: { currentUnitIndex: 0 },
        currentGame: null,
      }),
    )

    expect(saveApi.readSave(), '缺 masteredWordIds 的 progress 不是 Progress').toBeNull()
    expect(saveApi.saveDegradations().map((d) => d.key)).toEqual(['parse'])
  })
})

describe('AC-B8 / G76 —— 版本对不上：归 schema-version，不当 parse', () => {
  it('G76：schemaVersion 不匹配 ⇒ 返回 null + schema-version + 原串不动', () => {
    const foreign = JSON.stringify({
      schemaVersion: saveApi.SAVE_SCHEMA_VERSION + 1,
      savedAt: 1,
      progress: freshProgress(),
      currentGame: null,
    })
    storage.data.set(saveApi.SAVE_KEY, foreign)

    expect(() => saveApi.readSave(), '版本不匹配也不允许抛').not.toThrow()
    expect(saveApi.readSave(), '版本对不上必须返回 null，从头开始').toBeNull()
    expect(
      saveApi.saveDegradations().map((d) => d.key),
      '降级键必须是 schema-version —— 与 parse 分开，1.17 要说「这局存档是旧版本」',
    ).toEqual(['schema-version'])
    expect(storage.data.get(saveApi.SAVE_KEY), '版本不匹配的存档同样逐字保留（裁决 8）').toBe(foreign)
  })

  it('G76：版本检查**先于**其余结构检查（版本字段缺失也归 schema-version）', () => {
    // ⚠️ 一个「根本没有 schemaVersion」的存档若被归成 parse，家长会看到
    //   「存档文件坏了」，而真相是「这份数据不是本游戏写的」。
    storage.data.set(saveApi.SAVE_KEY, JSON.stringify({ savedAt: 1, progress: freshProgress() }))

    expect(saveApi.readSave()).toBeNull()
    expect(
      saveApi.saveDegradations().map((d) => d.key),
      '缺 schemaVersion 应归 schema-version，不是 parse —— 判据顺序不能反',
    ).toEqual(['schema-version'])
  })
})

describe('AC-E3 / G77 —— 写失败不损坏既有存档', () => {
  it('G77：成功写一次后让 setItem 抛，重新读拿到的仍是上一份且逐字相等', () => {
    const progress = busyProgress()
    const game = stateWithTower()
    expect(saveApi.writeSave(progress, game), '前置：第一次必须写成功').toBe(true)
    const firstRaw = storage.data.get(saveApi.SAVE_KEY)
    expect(firstRaw, '前置：第一次必须真落盘').not.toBeNull()

    storage.throwOnSet = true
    expect(saveApi.writeSave(progress, null), '前置：第二次必须写失败').toBe(false)

    // ⚠️ **再读要先把 throwOnSet 关掉**：模拟「配额恢复了再来读」，
    //   否则这次失败是读侧的，测的就不是「写失败有没有损坏数据」了。
    storage.throwOnSet = false
    expect(storage.data.get(saveApi.SAVE_KEY), '写失败不得覆写既有内容').toBe(firstRaw)

    const back = saveApi.readSave()
    expect(back, '写失败之后既有存档仍必须读得出来').not.toBeNull()
    expect(back?.progress, '既有存档的 progress 必须逐字没变').toEqual(progress)
    expect(back?.currentGame, '既有存档的对局必须逐字没变').toEqual(game)
  })
})

describe('AC-E2 / G78 —— 🔥 R-06 的守卫：局末清战场不得连带清进度', () => {
  it('G78：level-complete 写盘后 currentGame === null 且 progress 逐字不变', () => {
    const base = freshState()
    const prev: State = { ...base, hearts: 3, phase: { kind: 'resolving' } }
    const next: State = { ...base, hearts: 3, phase: { kind: 'level-complete' } }
    const effect = onlySaveEffect(prev, next)

    expect(effect.currentGame, '局末落盘必须存 null，而不是存那个已被清空的 state').toBeNull()

    const progress = busyProgress()
    expect(saveApi.writeSave(progress, effect.currentGame), '局末写盘必须成功').toBe(true)

    const back = saveApi.readSave()
    expect(back, '局末写盘后必须读得回来').not.toBeNull()
    expect(back?.currentGame, 'currentGame 必须仍是 null —— 重进要回到该单元起点').toBeNull()
    // ⚠️ **逐字**而不是「包含」：R-06 说的错误是「21/60 被一起清掉」，
    //   一个 `toMatchObject` 式的宽松断言会让「少了一个键」照样通过。
    expect(
      JSON.stringify(back?.progress),
      'progress 必须逐字不变 —— 局末清战场不得连带把跨局进度一起清掉（R-06）',
    ).toBe(JSON.stringify(progress))
  })
})

describe('AC-C2 / G79 —— 写盘点 5 行表逐行钉死，含两条负向', () => {
  /**
   * 六种相位各自的「该不该写盘」与理由，判据**逐字**来自裁决 6 的表。
   *
   * ⚠️ `makePhase` 是函数而不是字面量：`awaiting-answer` 变体**必带 `question`**，
   *   手写一个 `{ kind: 'awaiting-answer' }` 过不了 TS —— 而用 `as` 硬压过去
   *   正是本仓库记过多次的假绿开头。⇒ 从真实 state 里取那一行。
   */
  const TABLE: readonly {
    readonly kind: State['phase']['kind']
    readonly makePhase: (base: State) => State['phase']
    readonly shouldWrite: boolean
    readonly why: string
  }[] = [
    {
      kind: 'awaiting-answer',
      makePhase: (base) => base.phase,
      shouldWrite: false,
      why: '刚 CONTINUE 出来，与上一份内容相同',
    },
    {
      kind: 'awaiting-build',
      makePhase: () => ({ kind: 'awaiting-build', unlocked: ['u1-hello'], sun: 50 }),
      shouldWrite: true,
      why: 'AC 逐字要求包括 awaiting-build 的局面',
    },
    {
      kind: 'resolving',
      makePhase: () => ({ kind: 'resolving' }),
      shouldWrite: false,
      why: '真实一帧，用户看不到也退不出',
    },
    {
      kind: 'round-over',
      makePhase: () => ({ kind: 'round-over' }),
      shouldWrite: true,
      why: '每个回合结束的主路径',
    },
    {
      kind: 'level-failed',
      makePhase: () => ({ kind: 'level-failed' }),
      shouldWrite: true,
      why: '同样是结算出口',
    },
    {
      kind: 'level-complete',
      makePhase: () => ({ kind: 'level-complete' }),
      shouldWrite: true,
      why: '局末，清空战场',
    },
  ]

  for (const row of TABLE) {
    it(`G79：进入 ${row.kind} ${row.shouldWrite ? '要' : '**不**要'}写盘 —— ${row.why}`, () => {
      const base = freshState()
      const prev: State = { ...base, phase: { kind: 'resolving' } }
      const next: State = { ...base, phase: row.makePhase(base) }
      expect(next.phase.kind, '夹具自检：构造出来的相位与表里那行不符').toBe(row.kind)
      const saves = core
        .runEffects({ type: 'CONTINUE' }, prev, next)
        .filter((e) => e.kind === 'SAVE')

      if (row.shouldWrite) {
        expect(saves.length, `${row.kind} 必须产出 SAVE`).toBe(1)
      } else {
        // ⚠️ 负向断言**必须写死 0**：`toBeLessThanOrEqual(1)` 会让
        //   「误加了 SAVE」照样通过 —— 那正是本仓库记过的假绿（R-51）。
        expect(saves.length, `${row.kind} 不得写盘（${row.why}）`).toBe(0)
      }
    })
  }

  it('G79：awaiting-build 那一行不是构造上不可达（反向：它必须真能产出 SAVE）', () => {
    // ⚠️ 上一条只钉了「会写」的行数；这里再钉「写的是**那个 awaiting-build 局面**」，
    //   否则「判定退化成无条件写盘」也能满足上面那张表。
    const base = freshState()
    const prev: State = { ...base, phase: { kind: 'resolving' } }
    const built = stateWithTower()
    const next: State = { ...base, ...built, phase: built.phase }
    const effect = onlySaveEffect(prev, next)

    expect(
      effect.currentGame?.phase.kind,
      'awaiting-build 那一行落盘的必须正是 awaiting-build 的局面',
    ).toBe('awaiting-build')
  })
})

describe('AC-C3 / G80 —— 落盘的是完整 state，不是「答对记录」', () => {
  it('G80：round-over 落盘的 currentGame 逐字段等于当时的对局', () => {
    const built = stateWithTower()
    const prev: State = { ...built, phase: { kind: 'resolving' } }
    const next: State = { ...built, phase: { kind: 'round-over' } }
    const effect = onlySaveEffect(prev, next)
    expect(saveApi.writeSave(busyProgress(), effect.currentGame)).toBe(true)

    const back = saveApi.readSave()
    const game = back?.currentGame
    expect(game, 'round-over 必须落盘对局').not.toBeNull()

    // ⚠️ **逐字段 toEqual，不是「长度 > 0」**：AC 逐字要「完整 state」，
    //   而上限型断言在当前 fixture 值恰好等于上限时会恒绿（R-51 第 1 类）。
    for (const field of ['sun', 'hearts', 'zombies', 'towers', 'grid', 'phase'] as const) {
      expect(game?.[field], `落盘的 ${field} 必须与当时逐字相等`).toEqual(next[field])
    }
    // ⚠️ 夹具自检：这座塔与这只僵尸若不存在，上面那条循环会**空转**
    //   （两边都是空数组，toEqual 恒真）。故先确认夹具非空。
    expect(game?.towers.length, '夹具自检：towers 非空，否则本用例是空转').toBe(1)
    expect(game?.zombies.length, '夹具自检：zombies 非空，否则本用例是空转').toBeGreaterThan(0)
  })

  it('G80：落盘的 deck 也在（题单全集是断点续学的前提）', () => {
    const built = stateWithTower()
    const prev: State = { ...built, phase: { kind: 'resolving' } }
    const next: State = { ...built, phase: { kind: 'round-over' } }
    saveApi.writeSave(freshProgress(), onlySaveEffect(prev, next).currentGame)

    const back = saveApi.readSave()
    expect(
      back?.currentGame?.deck.length,
      'deck 不落盘的话，重进的这一局答完一轮就没有下一题了',
    ).toBe(built.deck.length)
  })
})

describe('AC-D2 / G81 —— awaiting-build 的局面能被完整还原', () => {
  it('G81：写入再读出的 awaiting-build 局面，phase.unlocked / phase.sun 与 state 一致', () => {
    const built = stateWithTower()
    expect(built.phase.kind, '夹具自检：本用例跑在 awaiting-build 上').toBe('awaiting-build')
    const prev: State = { ...built, phase: { kind: 'resolving' } }
    const effect = onlySaveEffect(prev, built)
    expect(saveApi.writeSave(freshProgress(), effect.currentGame)).toBe(true)

    const back = saveApi.readSave()
    const phase = back?.currentGame?.phase
    if (phase === undefined) throw new Error('读回来没有对局')
    expect(phase.kind, '重读后必须仍在 awaiting-build').toBe('awaiting-build')

    // ⚠️ 这两条正是 `Phase` 里那两个**只在 awaiting-build 上存在**的字段 ——
    //   写盘丢了它们，界面就会显示「阳光 0 · 没解锁任何卡」，而判据全绿。
    expect(phase.kind === 'awaiting-build' ? phase.unlocked : null, 'unlocked 必须逐字还原').toEqual(
      built.unlocked,
    )
    expect(phase.kind === 'awaiting-build' ? phase.sun : null, 'sun 必须逐字还原').toBe(built.sun)
    expect(back?.currentGame?.unlocked, 'state 上的 unlocked 也必须逐字还原').toEqual(built.unlocked)
    expect(back?.currentGame?.sun, 'state 上的 sun 必须逐字还原').toBe(built.sun)
  })

  it('G81：还原出来的对局能继续玩（过 assertInvariants）', () => {
    const built = stateWithTower()
    const prev: State = { ...built, phase: { kind: 'resolving' } }
    saveApi.writeSave(freshProgress(), onlySaveEffect(prev, built).currentGame)

    const back = saveApi.readSave()
    expect(() => core.assertInvariants(back?.currentGame as State), '读回来的对局必须是合法状态').not.toThrow()
  })
})

describe('AC-B4 / G85 —— 降级 API 与 `[save]` 日志前缀', () => {
  it('G85：写成功记一条以 [save] 开头的 INFO', () => {
    saveApi.writeSave(busyProgress(), null)

    expect(info.mock.calls.length, '写成功恰好一条 INFO —— 多条会让 1.17 的面板刷屏').toBe(1)
    expect(String(info.mock.calls[0][0]), 'INFO 必须带 [save] 前缀').toMatch(/^\[save\]/)
  })

  it('G85：四条失败路径各记一条以 [save] 开头的 WARN', async () => {
    const cases: readonly { readonly label: string; readonly arrange: (save: typeof saveApi) => void }[] = [
      {
        label: 'write',
        arrange: (save) => {
          storage.throwOnSet = true
          save.writeSave(freshProgress(), null)
        },
      },
      {
        label: 'read',
        arrange: (save) => {
          storage.throwOnGet = true
          save.readSave()
        },
      },
      {
        label: 'parse',
        arrange: (save) => {
          storage.data.set(save.SAVE_KEY, '坏了')
          save.readSave()
        },
      },
      {
        label: 'schema-version',
        arrange: (save) => {
          storage.data.set(
            save.SAVE_KEY,
            JSON.stringify({
              schemaVersion: save.SAVE_SCHEMA_VERSION + 99,
              savedAt: 1,
              progress: freshProgress(),
              currentGame: null,
            }),
          )
          save.readSave()
        },
      },
    ]

    for (const c of cases) {
      // ⚠️ **每个 case 一份全新模块**：`degraded` 是模块级状态，
      //   不重置的话上一 case 登记的键会漏进来，`toEqual([label])` 恒假，
      //   而改成 `toContain` 又会放过「一条失败登记了两个键」。
      vi.resetModules()
      const save = await import('../../src/services/save')
      warn.mockClear()
      info.mockClear()
      storage.throwOnSet = false
      storage.throwOnGet = false
      storage.data.clear()
      c.arrange(save)

      expect(warn.mock.calls.length, `${c.label} 失败必须恰好一条 WARN`).toBe(1)
      expect(
        String(warn.mock.calls[0][0]),
        `${c.label} 的 WARN 必须带 [save] 前缀 —— 否则 1.17 分不清是存档还是音效坏了`,
      ).toMatch(/^\[save\]/)
      expect(save.saveDegradations().map((d) => d.key), `${c.label} 的降级键`).toEqual([c.label])
      expect(info.mock.calls.length, `${c.label} 失败不得记 INFO —— 那会让面板说「已存档」`).toBe(0)
    }
  })

  it('G85：没有存档时既不 WARN 也不降级（第一次玩是正常路径）', () => {
    expect(saveApi.readSave(), '没有存档返回 null').toBeNull()
    expect(warn.mock.calls.length, '第一次玩不该有任何 WARN —— 那会让孩子看到技术噪音').toBe(0)
    expect(saveApi.isSaveDegraded(), '第一次玩不算降级').toBe(false)
  })

  it('G85：写成功会清掉先前登记的降级项（1.17「重试写入」的语义）', () => {
    storage.throwOnSet = true
    saveApi.writeSave(freshProgress(), null)
    expect(saveApi.isSaveDegraded(), '前置：写失败确实登记了降级项').toBe(true)

    storage.throwOnSet = false
    saveApi.writeSave(freshProgress(), null)

    expect(saveApi.isSaveDegraded(), '存储恢复后不该还挂着降级项').toBe(false)
    expect(saveApi.saveDegradations(), 'saveDegradations 要返回空列表').toEqual([])
  })

  it('G85：读到一份好存档时，先前的 parse 降级项不再生效', () => {
    storage.data.set(saveApi.SAVE_KEY, '坏了')
    saveApi.readSave()
    expect(saveApi.isSaveDegraded(), '前置：读到坏数据确实登记了降级项').toBe(true)

    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1,
        progress: freshProgress(),
        currentGame: null,
      }),
    )
    const back = saveApi.readSave()

    expect(back, '换成好存档后必须读得出来').not.toBeNull()
    expect(
      saveApi.isSaveDegraded(),
      '读到的数据既然合法，先前的 parse 理由已不成立 ⇒ 不该仍算降级',
    ).toBe(false)
  })
})

describe('AC-B7 —— readSave 的两条 null 语义可区分', () => {
  it('readSave 读出的是 SaveFile 的完整形状（不是部分字段）', () => {
    const game = stateWithTower()
    saveApi.writeSave(busyProgress(), game)

    const back = saveApi.readSave()
    expect(
      Object.keys(back as object).sort(),
      'SaveFile 的四个字段必须齐全 —— 缺一个，调用方拿到的就是 undefined',
    ).toEqual(['currentGame', 'progress', 'savedAt', 'schemaVersion'])
    expect(back?.schemaVersion, 'schemaVersion 必须等于当前版本').toBe(saveApi.SAVE_SCHEMA_VERSION)
    expect(back?.savedAt, 'savedAt 必须是数字（写入时刻）').toBeTypeOf('number')
  })

  it('clearSave 删干净后 readSave 返回 null 且不算降级', () => {
    saveApi.writeSave(busyProgress(), null)
    saveApi.clearSave()

    expect(storage.data.size, 'clearSave 必须真删').toBe(0)
    expect(saveApi.readSave()).toBeNull()
    expect(saveApi.isSaveDegraded(), '删干净了就是「没有存档」，那是正常状态').toBe(false)
  })
})

// ── [CR] 2026-10-17 —— 变更信号（版本号 + 订阅）──────────────────────────
describe('[CR 2026-10-17] 增与删**四条路径**都要发信号', () => {
  it('写失败：版本号递增 **且** 订阅被调用', () => {
    storage.throwOnSet = true
    const before = saveApi.saveDegradationsVersion()
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })

    saveApi.writeSave(freshProgress(), null)

    expect(saveApi.saveDegradations(), '前置：确实登记了一条').toHaveLength(1)
    expect(saveApi.saveDegradationsVersion(), '版本号没涨').toBeGreaterThan(before)
    expect(fired, '订阅没被调用 —— 面板上的「重试写入」永远不会露脸').toBe(1)
    off()
  })

  it('读失败：同样发信号（不是只有写失败这一条路）', () => {
    storage.throwOnGet = true
    const before = saveApi.saveDegradationsVersion()
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })

    saveApi.readSave()

    expect(saveApi.saveDegradations(), '前置：确实登记了一条').toHaveLength(1)
    expect(saveApi.saveDegradationsVersion(), '读这条路漏了').toBeGreaterThan(before)
    expect(fired, '读这条路漏通知了').toBe(1)
    off()
  })

  // ⚠️📎 **「清空」那几条比「登记」更容易被漏掉**：登记路径全部汇进 `markDegraded`
  //   一个函数，而清空散在 `writeSave` / `readSave` / `clearSave` **三处** `degraded.clear()`
  //   —— 每处都得记得跟一句通知。评审变异实测：删掉其中任意一处通知，
  //   只判「登记」的判据**全绿**。
  it('写成功清空降级项：版本号递增 **且** 订阅被调用', () => {
    storage.throwOnSet = true
    saveApi.writeSave(freshProgress(), null)
    expect(saveApi.saveDegradations(), '前置：先落一条降级项').toHaveLength(1)
    storage.throwOnSet = false
    const before = saveApi.saveDegradationsVersion()
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })

    saveApi.writeSave(freshProgress(), null)

    expect(saveApi.saveDegradations(), '写成功后降级项应当被清掉').toHaveLength(0)
    expect(saveApi.saveDegradationsVersion(), '「好了」也是一条要刷的消息').toBeGreaterThan(before)
    expect(fired, '清空没通知 —— 面板会一直挂着一条已经不生效的降级项').toBe(1)
    off()
  })

  it('读到可用存档同样清空并发信号', () => {
    storage.data.set(saveApi.SAVE_KEY, '不是 JSON')
    saveApi.readSave()
    expect(saveApi.saveDegradations(), '前置：先落一条 parse 降级项').toHaveLength(1)
    saveApi.writeSave(freshProgress(), null)
    const before = saveApi.saveDegradationsVersion()
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })

    saveApi.readSave()

    expect(saveApi.saveDegradations()).toHaveLength(0)
    expect(saveApi.saveDegradationsVersion(), 'readSave 的清空漏了').toBeGreaterThan(before)
    expect(fired, 'readSave 的清空没通知').toBe(1)
    off()
  })

  it('`clearSave()` 的清空也发信号', () => {
    storage.throwOnSet = true
    saveApi.writeSave(freshProgress(), null)
    storage.throwOnSet = false
    const before = saveApi.saveDegradationsVersion()
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })

    saveApi.clearSave()

    expect(saveApi.saveDegradations()).toHaveLength(0)
    expect(saveApi.saveDegradationsVersion(), 'clearSave 的清空漏了').toBeGreaterThan(before)
    expect(fired, 'clearSave 的清空没通知').toBe(1)
    off()
  })

  it('退订之后不再被调用', () => {
    storage.throwOnSet = true
    let fired = 0
    const off = saveApi.onSaveDegradationsChanged(() => {
      fired += 1
    })
    off()

    saveApi.writeSave(freshProgress(), null)

    expect(fired, '退订之后还被回调 —— 模块级监听者集合漏了清理').toBe(0)
  })
})
