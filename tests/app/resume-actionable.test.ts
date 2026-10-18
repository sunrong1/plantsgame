/**
 * @vitest-environment jsdom
 */

/**
 * 断点续学的**落点必须可行动**守卫（试玩实测发现的硬锁，1.19 CR 期间）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 一句话：**从存档恢复出来的 state，必须是一个孩子看到就能接着玩的相位。**
 *
 * 🔥 **实测症状（P0，硬锁）**：玩到一半关掉页面、重新点「开始游戏」，
 *   屏幕上只剩 45 格空战场 —— **卡面、手牌、「⚔ 开战」按钮三样全无**。
 *   读题时离开（每题 20-30 秒，是孩子停留最久的相位）**必然**复现。
 *
 * ── 成因（三条，缺一条都不成立）────────────────────────────────────────────
 *   ① `core/effects.ts` 的写盘表**不含 `awaiting-answer`**
 *      （原注释的理由逐字是「刚 CONTINUE 出来，与上一份 round-over 存档内容相同」
 *      —— **实测该理由为假**：`applyContinue` 会 `turn + 1`、换 `phase`、
 *      多入场一只僵尸，两者是实质不同的状态）；
 *   ② `QuestionCard` 的渲染源是 `phase.question`，而**刷新之前**，
 *      只有 `awaiting-answer` 变体带 `question`：
 *      `awaiting-build` 靠**组件本地**的 `lastQuestion` ref 兜底（新挂载恒 `null`），
 *      `round-over` 按 1.16 裁决 7 直接返回 `null`；
 *   ③ `HandDeck` 只在 `awaiting-build` 渲染 ⇒ 落在 `round-over` 上时
 *      **没有任何可点的元素**，孩子无从下手。
 *   ⇒ ①②③ 合起来 ⇒ 盘上从来不会出现 `awaiting-answer`，而盘上的每一个相位
 *     都是「卡面拿不到题」或「连按钮都没有」的相位。
 *
 * 📎 **[CR] 第二轮（2026-10-18）：① 补上之后，用户实测仍是「点开始后无卡面」**
 *   —— 调试面板读出落点是 **`awaiting-build`**，于是又中了 ② 的另一半：
 *   建造期在盘上是合法落点（AC 逐字要求），而它当时**拿不到题**。
 *   ⇒ 裁决 B：**把题面落进 State**（`Phase.awaiting-build` 自带 `question`），
 *     组件本地 `lastQuestion` 整个删掉。①②此后都不再是成因。
 *   ⇒ 于是本文件补了下面两条：**建造期恢复也要有卡面**、与
 *     **旧存档（尚无 `question` 字段）落到 awaiting-answer**。
 *
 * ── 为什么之前没抓到 ──────────────────────────────────────────────────────
 *   唯一碰恢复路径的 `tests/app/session-recorder.test.ts` 在 `startRound()` 之后
 *   **手工调了一次 `writeSave(progress.value, state.value)`**，
 *   把盘上那份 `round-over` 覆盖成了内存里的 `awaiting-build`，恰好把这个洞遮住。
 *   ⇒ 本文件走**真链路**（`applyAction` → `effects-runner` → `writeSave`），
 *     一个字节都不手工写盘。
 *
 * ── 判据纪律 ──────────────────────────────────────────────────────────────
 *   三条判据分别在**根因层**（盘上相位）、**渲染层**（卡面在不在 DOM 里）、
 *   **可行动层**（有没有能推进的入口）上，同一个 bug 钉三层。
 *
 *   ⚠️ **「三层」不是凑数，是按「谁读什么」分的**：
 *     根因层与可行动层**只读盘上的字节**，一个 `.vue` 都没碰 ⇒
 *     任何「在组件里打补丁把画面糊出来」的改法都动不了它们；
 *     渲染层反过来只看 DOM ⇒ 「盘上相位对了但界面拿不到题」这类漂移它能抓住。
 *   ⇒ 删掉任意一层，剩下的层仍然红。
 *
 * ── 变异验证（M185，2026-10-18）───────────────────────────────────────────
 *   把写盘表里 `awaiting-answer` 那一格改成一个永不成立的字面量后：
 *   本文件 **4 条红 3**（根因层 / 渲染层 / 可行动层）+ G79 那一条也红 = 共 4 红。
 *   ⚠️ **第 4 条（建造期对照）照绿是应该的** —— 它钉的是「建造期仍可继续」，
 *     而建造期一直是合法落点，它的作用是**防止有人为了修这条把建造期写盘点一起删掉**。
 *   ⚠️ 另跑了一次「让 `HandDeck` 恒渲染」的症状补丁变异：修好之后它 **4 条全绿**
 *     —— 这不说明它没鉴别力，而是**说明根因已经被写盘表那一格堵住了**，
 *     症状层压根没机会发作。别把它当成一条通过的变异记录。
 *
 * ── 变异验证（M186、M187，裁决 B 落地之后）────────────────────────────────
 *   ⚠️ M185 是在**只补了写盘点**的那一版上跑的。裁决 B 之后补跑了两次，
 *     证明新建的两层不是「贴上去就绿」的：
 *   · **M186**（把 `shown` 改回组件本地 ref 兜底 —— 即 B 之前的真实现）：
 *     **2 红** —— ① 本文件「渲染层：建造期落盘 → 重挂组件 → 卡面与四个选项都在」
 *     ② G94 的源码判据（「`shown` 读了 `state.value.phase` 之外的某个 `.value`」）。
 *     ⚠️ 根因层（盘上相位）**照绿是应该的** —— 它只读盘上的字节，
 *       而那一份盘里题面**确实在**，坏的是组件拿不拿得到；这正是分层守的意义。
 *   · **M187**（`restoreFromSave()` 里去掉 `backfillLegacyBuildPhase` 调用）：
 *     **1 红** —— 只有「兼容层：旧存档的 awaiting-build 落回 awaiting-answer」。
 *     另外 6 条照绿也是应该的：它们造的都是**新格式**的存档。
 *
 * ── 第三轮追加的「可行动层」判据 ────────────────────────────────────────────
 *   🔥 真机复验说「图能看见了，但**点不动**」。那一轮修的正是
 *   **「看起来能点却点不动」**（AC-D5 的假可点），判据见下面那条用例。
 *   · **M188**（`OptionCard` 的 `:disabled` 去掉 `|| locked`）：
 *     **2 红** —— 本文件「可行动层（第二轮）」那条 + G172 的第一条。
 *     （变异在本文件与 `quiz-card.test.ts` 一起跑；两处独立红，不是同一条。）
 *   ⚠️ 「渲染层」那几条**照绿是应该的** —— 它们量的是「卡面与四个选项在不在 DOM 里」，
 *     而那个 bug 从来没让它们红过（卡一直在，红的是它们**可不可点**）。
 *     ⇒ 这就是为什么同一个 bug 要钉两层。
 *
 * ── 第四轮：`round-over` 落点（真机撞出来的第二个硬锁）───────────────────────
 *   · **M191**（`advanceLegacyRoundOver` 里 `return reduce(…)` 改成 `return state`）：
 *     **1 红** —— 「可行动层（旧存档）」那条，实测输出
 *     `expected 'round-over' to be 'awaiting-answer'`。
 *   ⚠️ **本文件此前的「可行动层」那条对 M191 照绿**，因为它造的是**新格式**存档
 *     （`playOneRound()` 走完 `startRound()`，盘上早已是 `awaiting-answer`）。
 *     ⇒ 又一次印证同一个 bug 必须按**存档形态**分层，不能只按相位分层。
 */

import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { entriesOf } from '../../src/content'
import { afterEachUninstall, installFakeStorage } from '../fixtures/fake-storage'
import { stripComments } from '../fixtures/strip-comments'
import type { FakeStorage } from '../fixtures/fake-storage'
import type { State } from '../../src/core'

// ⚠️ `services/audio` 必须 mock：它会去真解码 mp3（与 `save-integration.test.ts` 同款）。
vi.mock('../../src/services/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/audio')>()
  return { ...actual, playSfx: vi.fn(), playPronunciation: vi.fn(), startBgmIfReady: vi.fn() }
})

const core = await import('../../src/core')
const saveApi = await import('../../src/services/save')
const store = await import('../../src/app/store')
const { default: QuestionCard } = await import('../../src/components/quiz/QuestionCard.vue')

let storage: FakeStorage

beforeEach(() => {
  storage = installFakeStorage()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEachUninstall()

/** 开一局全新的（空存档 ⇒ 走真实的开局组装，不手工摆 state 之外的任何东西）。 */
function startFreshGame(): void {
  store.state.value = core.createInitialState({ unitNumber: 1, deck: entriesOf(1) })
  store.progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
}

/** 答对当前那道题（**必须**在 dispatch 之前取 id —— 之后相位就变了）。 */
function answerCorrectly(): void {
  const phase = store.state.value.phase
  if (phase.kind !== 'awaiting-answer') throw new Error(`前置：相位是 ${phase.kind}，不是 awaiting-answer`)
  const hit = phase.question.card.options.find((option) => option.correct)
  if (hit === undefined) throw new Error('当前题没有正确项 —— 内容数据坏了')
  store.applyAction(core.answer(hit.id))
}

/** 走完一整个回合：答题 → 建造 → 开战 → 结算 → 推进到下一题。 */
function playOneRound(): void {
  answerCorrectly()
  store.startRound()
}

/** 从盘上**原样**读回对局（绕开 store 的读档门面 —— 这里要验的就是盘上的字节）。 */
function readGameOnDisk(): State {
  const raw = storage.data.get(saveApi.SAVE_KEY)
  if (raw === undefined) throw new Error('盘上根本没有存档 —— 链路没落盘')
  const parsed = JSON.parse(raw) as { currentGame: State | null }
  if (parsed.currentGame === null) throw new Error('盘上的 currentGame 是 null —— 这一局被当成已结束了')
  return parsed.currentGame
}

/**
 * 模拟「关掉页面再打开」：内存换成**盘上那份**（即 `enterLevel()` 的
 * `restoreFromSave()` 之后的状态），组件全新挂载。
 *
 * ⚠️ **组件必须重新挂载**而不是复用上一次的：组件本地的一切（ref、
 *   computed 缓存、模板里的过渡状态）在真实场景里都随页面一起没了，
 *   复用同一个实例等于假装它还在。
 *   📎 这也是 B 方案的核心：题面现在**由 State 提供**，所以「重新挂载」不再
 *     是一件需要被绕开的事 —— 挂上去就有题。
 */
function remountLevel() {
  store.state.value = readGameOnDisk()
  return mount(QuestionCard)
}

describe('🔥 G170 —— 断点续学的落点：读题时离开，重进必须拿得到题面', () => {
  it('G170 根因层：停在 awaiting-answer（孩子正在读题）时，盘上那份也必须是 awaiting-answer', () => {
    startFreshGame()
    playOneRound()

    expect(
      store.state.value.phase.kind,
      '前置：一整个回合走完应当回到 awaiting-answer（下一道题等着孩子）',
    ).toBe('awaiting-answer')
    expect(
      readGameOnDisk().phase.kind,
      '盘上的相位必须与内存里的一致 —— 写盘表漏掉 awaiting-answer 时，' +
        '盘上停着的是上一个相机的 round-over，重进就是一个没有按钮的画面',
    ).toBe('awaiting-answer')
  })

  it('G170 渲染层：用盘上那份 state 重挂组件，卡面与四个选项都在', () => {
    startFreshGame()
    playOneRound()

    const wrapper = remountLevel()

    expect(
      wrapper.find('.question-card').exists(),
      '重进之后屏幕上必须有卡面 —— 这是孩子看到的第一样东西，' +
        '它不见的那一路就是「重新进入不出现单词卡」',
    ).toBe(true)
    expect(
      wrapper.findAll('.option-card').length,
      '卡面在而选项不在，孩子看到的仍是一张点不动的空面板',
    ).toBe(4)
  })

  it('G170 可行动层：恢复出来的相位必须有能推进的入口', () => {
    startFreshGame()
    playOneRound()

    const restored = readGameOnDisk()
    // ⚠️🔥 **[R-57] 本条的判据与它的消息在 2026-10-18 被重写过。**
    //   原消息逐字写着「`round-over` **构造上不可达**，它每次都会被紧随其后的
    //   CONTINUE 覆盖掉」—— **那个前提是假的**，而且是我**从注释推出来、没实测**的：
    //   旧版写盘表里含 `round-over` 而当时的 `CONTINUE` **不写盘**
    //   ⇒ 孩子点一次「开战」，盘上就永久留下一份 `round-over` 快照。
    //   真机复验随即撞上它（平板重进**连卡面都没有**，见下面那条）。
    //   ⇒ 断言本身（落点必须在两个可行动相位里）**一个字没改**，
    //     改的是**它声称的理由** —— 一个被实测推翻的理由留在守卫里，
    //     下一个人会拿它当依据去推别的判断。
    expect(
      ['awaiting-answer', 'awaiting-build'],
      '可落盘点只有这两个：前者有题面可答，后者有手牌与开战按钮可推进',
    ).toContain(restored.phase.kind)
  })

  it('G170 可行动层（旧存档）：停在回合结算帧的那份，必须被推进到有卡面的相位', () => {
    // 🔥📎 **1.19 `[CR]` 第四轮真机撞出来的那个**（见上一条的消息）。
    // 实测修复前：重进相位 `round-over`、卡面 0 节点、手牌不渲染、
    // 「⚔ 开战」不存在 —— **一个可点的元素都没有**，而界面上没有任何东西指向原因。
    startFreshGame()
    playOneRound()
    // 真链路造出「结算帧」那份 state，再把相位摆回 `round-over` ——
    // ⚠️ 这不是手工拼造：`startRound()` 的三连 dispatch 是同步的，
    //   `round-over` 只是中间一帧，而**旧代码恰在那一帧写了盘**。
    //   这里手工摆的是那份**已经存在于用户设备上**的存档形状。
    const settled: State = { ...store.state.value, phase: { kind: 'round-over' } }
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1_700_000_000_000,
        progress: { currentUnitIndex: 0, masteredWordIds: [] },
        currentGame: settled,
      }),
    )

    store.enterLevel()

    expect(
      store.state.value.phase.kind,
      '结算帧恢复回来是一张 45 格空战场 + 零个按钮，孩子完全动不了 —— ' +
        '必须替他按一次「继续」（`advanceLegacyRoundOver`）',
    ).toBe('awaiting-answer')

    const wrapper = mount(QuestionCard)
    expect(wrapper.find('.question-card').exists(), '重进必须有卡面 —— 这是孩子看到的第一样东西').toBe(true)
    expect(wrapper.findAll('.option-card').length, '卡面在而选项不在，孩子看到的仍是一张空面板').toBe(4)
  })

  it('G170 对照：建造期离开仍可继续 —— 有手牌与「开战」按钮（沿用 1.15 已有的裁决，不在本次范围）', () => {
    startFreshGame()
    answerCorrectly() // 停在 awaiting-build（塔还没建完）

    expect(store.state.value.phase.kind, '前置：此刻是建造期').toBe('awaiting-build')
    const restored = readGameOnDisk()
    expect(restored.phase.kind, '建造期是一个合法的落点（AC 逐字要求存档这一相位）').toBe('awaiting-build')
    // ⚠️ **本条只钉「能继续」，不钉「有题面」** —— 1.11 裁决 4 逐字判定
    //   「重启本来就不该停在『刚刚答完』的反馈上」，那个裁决**本轮不推翻**。
    //   哪天要推翻，判据该加在 QuestionCard 的 `shown` 上，而不是这里。
    // 📎 2026-10-18：裁决 B 落地后「有题面」在建造期**也成立**了（题面随
    //   `Phase` 一起进盘），但那是**顺带**的收益，不是本条在守的东西 ——
    //   下面那条才是它的判据。
  })
})

describe('G170-b —— 建造期恢复也要有卡面（裁决 B：题面落进 State）', () => {
  it('根因层：建造期落盘时，题面必须**跟着 phase 一起写下去**', () => {
    startFreshGame()
    answerCorrectly()

    const restored = readGameOnDisk()
    expect(restored.phase.kind).toBe('awaiting-build')
    // ⚠️ **这条读的是盘上的字节，不是内存里的 state** ——
    //   「State 里带着题面」与「题面进了存档」是两件事：
    //   少一步序列化，孩子重进时拿到的就又是一个 `undefined` 卡面。
    const phase = restored.phase
    if (phase.kind !== 'awaiting-build') throw new Error(`前置：相位是 ${phase.kind}`)
    expect(
      restored.deck.some((entry) => entry.entryId === phase.question.entryId),
      '盘上建造期携带的题面不在本题单里 —— 序列化时丢了字段，或题面本身来路不对',
    ).toBe(true)
  })

  it('渲染层：建造期落盘 → 重挂组件 → 卡面与四个选项都在（🔥 就是复现「点开始后无卡面」那一步）', () => {
    startFreshGame()
    answerCorrectly()

    const wrapper = remountLevel()

    expect(
      wrapper.find('.question-card').exists(),
      '🔴 建造期重进之后卡面不见了 —— 这正是用户实测报的那一步：' +
        '起始页是 awaiting-answer（有卡），点「开始游戏」后变成 awaiting-build（无卡）',
    ).toBe(true)
    expect(wrapper.findAll('.option-card').length, '卡面在而选项不在，孩子看到的仍是一张空面板').toBe(4)
    // 🔥📎 **`[CR]` 第六轮补的第三条判据：卡面在**不等于**卡面是「那道题」。**
    //   ⚠️ 上面两条量的是「存在」，判据粒度**粗于它要守的东西**（R-51 第四种形态）：
    //     若恢复时把题面错写成 deck 里的另一道，孩子看到的是一道**长得像但不是自己
    //     刚答的那道题**的卡面 —— 上面两条全绿，而症状是「回来以后题目变了」。
    //   ⇒ 逐字比对：渲染出来的题面必须**就是盘上那份 state 的题面**。
    const onDisk = store.state.value.phase
    if (onDisk.kind !== 'awaiting-build') throw new Error(`前置：相位是 ${onDisk.kind}`)
    expect(
      wrapper.find('.question-card__prompt').text(),
      '渲染出来的题面与盘上那份对不上 —— 恢复时把题换成了另一道，孩子看到的是「回来后题目变了」',
    ).toBe(onDisk.question.card.promptText)
  })

  it('G170 可行动层（第二轮）：建造期恢复出来的四个选项**全部点不动** —— 不许是「假可点」', () => {
    // 🔥📎 **1.19 `[CR]` 第三轮修的正是这一条。** 第一、二轮把卡面救回来了，
    //   真机复验说「图能看见了，但点不动」—— 不是点不动有问题，是
    //   **看起来能点却点不动**有问题（AC-D5 的「假可点」）。
    //   ⇒ 判据读的是 DOM 上的 `disabled` 属性，那才是「点不动」的可见契约；
    //     组件里的 `onPick` 守门已经在别处钉了（守卫 M57 那组）。
    startFreshGame()
    answerCorrectly()

    const wrapper = remountLevel()
    const cards = wrapper.findAll('.option-card')
    expect(cards, '前置：卡面必须在').toHaveLength(4)
    for (const card of cards) {
      expect(
        card.attributes('disabled'),
        '选项卡未 disabled —— 白卡 + 灰边框 + 指针光标摆在孩子面前，点了却什么都不会发生',
      ).toBeDefined()
    }
    expect(
      wrapper.find('.answer-feedback').exists(),
      '必须有反馈条说明「这题已经答完了」—— 没有它，卡面看起来就是一道还没答的题',
    ).toBe(true)
  })

  it('兼容层：旧存档的 awaiting-build（没有 question 字段）落回 awaiting-answer，而不是空卡面', () => {
    // 📎 旧存档**真实存在**：平板上那份就是 1.19 CR 之前写下的。
    //   判据只认「`question` 字段在不在」，不认 schema 版本 ——
    //   故意**不**升 `SAVE_SCHEMA_VERSION`：升版本会让整份存档（含
    //   `masteredWordIds`）被判为不兼容而丢弃，那会连坐 FR58 已学的词。
    startFreshGame()
    answerCorrectly()

    const onDisk = readGameOnDisk()
    if (onDisk.phase.kind !== 'awaiting-build') throw new Error(`前置：相位是 ${onDisk.phase.kind}`)
    // 手工捏出旧形状 —— 这一步就是「从旧版代码写下的盘」：
    //   ⚠️ **不是** `const { question, ...rest } = onDisk.phase` 那种解构删字段，
    //   那样会把「旧盘缺字段」变成「运行时删掉」，两者的差别在 JSON 里看不到、
    //   在别的读档实现里却看得见。写死旧形状才是这条用例要的东西。
    const legacyPhase = {
      kind: 'awaiting-build',
      unlocked: onDisk.phase.unlocked,
      sun: onDisk.phase.sun,
    } as const
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1_700_000_000_000,
        progress: { currentUnitIndex: 0, masteredWordIds: [] },
        currentGame: { ...onDisk, phase: legacyPhase },
      }),
    )

    store.enterLevel()

    expect(
      store.state.value.phase.kind,
      '旧存档必须被归一化成答题相位 —— 硬渲染一个 question=undefined 的卡面，' +
        '孩子会看到一张「点哪里都不对」的卡',
    ).toBe('awaiting-answer')
    const phase = store.state.value.phase
    if (phase.kind !== 'awaiting-answer') throw new Error(`前置：相位是 ${phase.kind}`)
    expect(
      store.state.value.deck.some((entry) => entry.entryId === phase.question.entryId),
      '归一化出来的题必须属于本题单（它由 `nextQuestion(deck, …)` 选出）',
    ).toBe(true)
  })
})

describe('G175 —— 存档对局不合法时**只丢这一局，不丢跨局进度**（1.19 `[CR]` 第六轮裁决 1）', () => {
  /**
   * 造一份「**对局不合法**但**进度合法**」的存档，让 `restoreFromSave` 的
   * AC-D4 兜底 catch 真的触发。
   *
   * ⚠️ 用什么脏数据触发 catch 是有讲究的：必须落在 **`try` 之内**那一段
   *   （`assertInvariants`），不能落在 `try` 之外的补齐函数上 ——
   *   否则测的是另一条路径。
   * ⇒ 这里用「建造期携带的题面不在题单里」：那份 `deck` 只有第一条，
   *   而 `question` 指向一条不在其中的 entryId ⇒ `assertPhaseMirror` 抛。
   */
  function seedDirtyGameWithProgress(mastered: readonly string[]): void {
    const first = entriesOf(1)[0]
    const dirtyGame = {
      unitNumber: 1,
      phase: {
        kind: 'awaiting-build',
        // ⚠️ 指向一条**不在题单里**的 id —— 这是内容回滚/旧存档的唯一形态
        question: { ...first.card, entryId: 'u1-not-in-deck' },
        unlocked: [],
        sun: 50,
      },
      turn: 2,
      hearts: 3,
      sun: 50,
      grid: {},
      towers: [],
      zombies: [],
      deck: [first],
      masteredEntryIds: [],
      skippedEntryIds: [],
      unlocked: [],
    }
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1_700_000_000_000,
        progress: { currentUnitIndex: 0, masteredWordIds: mastered },
        currentGame: dirtyGame,
      }),
    )
  }

  it('脏对局 ⇒ 那一局退回开局，但 `progress.masteredWordIds` **逐条不变**', () => {
    const learned = entriesOf(1).slice(0, 21).map((e) => e.entryId)
    seedDirtyGameWithProgress(learned)

    expect(() => store.enterLevel(), 'AC-D4：孩子点「开始游戏」不许炸（NFR13）').not.toThrow()

    expect(
      store.progress.value.masteredWordIds,
      '🔴 跨局已学被一并清空了 —— FR58 逐字「累计所得只增不减」，' +
        '而一个孩子因为内容改了一版就赔上全部学习成果，是本作最不可接受的失败形态。' +
        '（判据：`restoreFromSave` 的 catch 只丢**对局**，不动 `progress`）',
    ).toEqual(learned)
  })

  it('同一次降级之后，界面是一个**能接着玩**的状态，不是技术错误', () => {
    seedDirtyGameWithProgress(entriesOf(1).slice(0, 5).map((e) => e.entryId))

    store.enterLevel()

    // AC-D4 逐字：「孩子看到的是一局新开局，而不是一个技术错误」。
    expect(store.view.value, '视图必须已经进关 —— 退回开始界面会让按钮看起来没反应').toBe('level')
    expect(
      ['awaiting-answer', 'awaiting-build'],
      `降级后停在不可行动的相位 ${store.state.value.phase.kind} —— 孩子看到的是一张动不了的战场`,
    ).toContain(store.state.value.phase.kind)
  })

  it('⚠️ 反向自测：把 catch 里的清空加回去，本文件必须变红（R-53 / R-50）', () => {
    // 这条不是测现状，是**把守卫的鉴别力钉住** —— 变异 N1 实测过：
    // 在补这条守卫之前，把 `progress.value = { currentUnitIndex: 0, masteredWordIds: [] }`
    // 加回 catch 里，**1952 条测试全绿**。
    // ⇒ 「这条判据真的会因为那个改动而红」这件事本身要被写下来，
    //   否则下一次有人清理那段代码时会以为它没有作用。
    const learned = entriesOf(1).slice(0, 21).map((e) => e.entryId)
    const source = readFileSync(
      join(process.cwd(), 'src/app/store.ts'),
      'utf8',
    )
    // 判据本体：AC-D4 的 catch 里**不许**出现对 `progress.value` 的赋值。
    const catchBody = /\} catch \(err\) \{([\s\S]*?)\n {2}\}/.exec(stripComments(source))?.[1] ?? ''
    expect(
      catchBody,
      '判据取不到 AC-D4 的 catch 体 —— 这条守卫自己失效了（R-53：判据要先在真实文本上自测）',
    ).not.toBe('')
    expect(
      /progress\.value\s*=/.test(catchBody),
      'AC-D4 的降级里不许写 `progress.value = …` —— 它只丢**对局**（裁决 1 / FR58）',
    ).toBe(false)

    // 而正确形态下，上面那条判据必须是绿的（否则它恒红，是装饰）。
    seedDirtyGameWithProgress(learned)
    store.enterLevel()
    expect(store.progress.value.masteredWordIds).toEqual(learned)
  })
})

describe('G176 —— 读档**不抛穿**：存档里的单元号未填档位时也不许炸（1.19 `[CR]` 第六轮）', () => {
  it('`enterLevel()` 不抛，且跨局进度不动', () => {
    // 🔥📎 **这条来自实测，不是推演。** 主评审的 jsdom 探针摆出下面这份存档后：
    //   ```
    //   THROWN = Error: 单元 999 落在未填档位上。已填档位：1-4。未填档位不回退默认值（AC-3）……
    //   ```
    //   异常**穿透 `restoreFromSave` 一路抛到 `enterLevel()`**，而那个 catch 存在的
    //   全部意义就是「孩子看到的是一局新开局，不是一个技术错误」（AC-D4 / NFR13）。
    // ⚠️ 根因是三件事叠起来，缺一件都不成立：
    //   ① `backfillLegacyBuildPhase` 被**刻意放在 `try` 之外**；
    //   ② 它的 `next === null` 分支调 `createUnitCompletedState(state.unitNumber)`；
    //   ③ `parseSaveFile` 逐字写着 `currentGame` **只校验「是对象或 null」**，
    //      而 `state.unitNumber` 直接来自存档 ⇒ **不受信任的值直达 `tierForUnit`**。
    const learned = entriesOf(1).slice(0, 21).map((e) => e.entryId)
    storage.data.set(
      saveApi.SAVE_KEY,
      JSON.stringify({
        schemaVersion: saveApi.SAVE_SCHEMA_VERSION,
        savedAt: 1_700_000_000_000,
        progress: { currentUnitIndex: 0, masteredWordIds: learned },
        currentGame: {
          unitNumber: 999, // ⚠️ 未填档位（`BALANCE_TIERS` 只覆盖 1-4）
          phase: { kind: 'awaiting-build', unlocked: [], sun: 50 }, // ⚠️ 旧存档：没有 question 字段
          turn: 2,
          hearts: 3,
          sun: 50,
          grid: {},
          towers: [],
          zombies: [],
          deck: [], // ⚠️ 空题单 ⇒ `nextQuestion()` 返回 null ⇒ 走那一支
          masteredEntryIds: [],
          skippedEntryIds: [],
          unlocked: [],
        },
      }),
    )

    expect(
      () => store.enterLevel(),
      '🔴 读档把「单元 999 落在未填档位上」抛给了孩子 —— AC-D4 / NFR13 逐字：孩子面前永不出现技术错误',
    ).not.toThrow()
    expect(
      store.progress.value.masteredWordIds,
      '同一份存档下跨局进度也不许丢 —— 降级只丢**对局**（裁决 1）',
    ).toEqual(learned)
  })
})
