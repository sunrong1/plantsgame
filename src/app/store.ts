/**
 * 应用状态与视图状态（Story 1.10 / AC-3）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 本文件是 **`State` 的唯一持有处**（架构决策 2：纯 reducer，否决 Pinia）。
 * 组件不持有战斗状态、不复制它、也不自己算 —— 只读 `state` 或 `applyAction()`。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不建 `src/app/router.ts`** —— 📎 原写「属 Story 1.15」，
 *   **1.15 [CS] 裁决 5 已推翻**：epics.md 的 AC 正文里 1.15 **没有** router
 *   （R-32：三处源注释说的编号是旧的）。这里只有最小的 `view` 态（见下），
 *   真要拆路由得等真有第二个视图 —— 届时再起 `router.ts`，不预埋。
 * · **不写 `runEffects` 的实现** —— 属 Story 1.14（`app/effects-runner.ts`）。
 *   本文件**只调** `runEffectsFromStore`（`applyAction` 四步里的第 3 步），
 *   判据与播放实现在另外两层。另有 {@link speakQuestion} 这个**朗读门面**
 *   （Story 1.11 / 裁决 3），它与 `runEffects` 不是一回事：后者 action 驱动，
 *   前者是「用户点重听」触发的（裁决 6 明确本 story **不**把换题朗读收口进去）。
 * · 📎 **原写「不做存档 —— 属 Story 1.15」，那句话从 1.15 [DS] 起作废**：
 *   本文件现在**做**两件事存档相关，且都不自己碰 `localStorage` ——
 *   `applyAction` 第 3 步把 `progress.value` 递给 `effects-runner`（写盘），
 *   `enterLevel()` → {@link restoreFromSave} 把读档结果喂回 `progress` / `state`。
 *   **读写本体全在 `services/save.ts`**（架构硬约束 4 之外的第 4 条边界）。
 * · **不含任何战斗规则计算** —— 数值只读 `towerType`（架构硬约束 3），
 *   全部计算在 `core/`。
 *
 * ── 架构硬约束 4：副作用只在 `app/effects-runner.ts` 执行 ─────────────────
 * `applyAction` 的四步顺序里第 3 步就是给它的。顺序本身是架构的一部分
 * （架构 `:660-668`），**不是可以随手调换的样板**：
 *   prev = state.value → next = reduce(prev, action) → runEffects(...) → state.value = next
 * `runEffects` 必须在 `state.value` 赋值**之前**跑 —— 它读的是 prev/next 两个快照，
 * 若放在赋值之后，prev 就已经取不到了。
 */

import { ref, type Ref } from 'vue'

import { entriesOf, UNITS } from '../content'
import {
  advanceProgress,
  advanceUnit,
  answer,
  assertInvariants,
  cellKey,
  continueRound,
  createInitialState,
  endBuild,
  isCorrect,
  placementBlockedReason,
  placeTower,
  reduce,
  resolveRound,
  restartLevel as restartLevelAction,
} from '../core'
import type { Action, Progress, State } from '../core'
import { playPronunciation } from '../services/pronunciation'
import { readSave } from '../services/save'

import { runEffectsFromStore, startBgmIfReady } from './effects-runner'
import { devAdjust } from './dev-adjust'
import { recordStep, resetSession } from './session-recorder'

// 📎 **Story 1.17：会话录制的四个门面从本文件转出**（AC-D2 / AC-D1）。
//   ⚠️ **理由与 {@link selectTowerCard} 那组门面同款**：组件**只调 `store` 的门面**，
//     不自己 import 别的 app 模块。这样「面板调了哪些能力」在一处就能看全，
//     也让「面板不许 import `core/actions`」那条边界（守卫 G110）只需要盯一个文件。
//   ⚠️ **重导出而不是搬进来**：录制器持有自己的模块级状态，
//     搬进 `store.ts` 会让它与 `state` / `progress` 挤在一个文件里。
export { exportSession, isRecording, recordStep, resetSession } from './session-recorder'
export type { SessionExport } from './session-recorder'

// 📎 **Story 1.17：dev 调试开关的门面同样从本文件转出**（AC-D2 / G110）。
//   理由与上面那组门面同款：面板**只调 `store` 的门面**，
//   于是「面板调了哪些能力」在一处就能看全。
// ⚠️ **不转出 `devAdjust`**：它不是面板的能力，是 `applyAction` 内部四步中的一步。
//   转出它等于邀请组件自己去补偿 state，那正是 R-04 要防的事。
export {
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  isDebugPanelRequested,
  isTowerRangeOverlayRequested,
} from './dev-adjust'
export type { DevFlags } from './dev-adjust'

// 📎 **Story 1.17 / AC-E3：调试面板「重试写入」的门面。**
//   ⚠️ **理由与上面两组门面同款**：组件只调 `store` 的门面，不自己 import
//   `services/save` —— 那会让 `writeSave` 多出第二个调用点，当场撞红守卫 G86
//   （逐个调用点判定：`writeSave` 只许在 `src/app/effects-runner.ts`）。
export { retrySaveWrite } from './effects-runner'

// 📎 **Story 1.17 / AC-E4：三个降级 registry 的只读门面。**
//   ⚠️ **音频那个必须走 `effects-runner`** —— 组件与视图**整条** `services/audio`
//     都在 ESLint 禁列里（禁整个模块而不是逐个函数名，是 1.14 留下的纪律），
//     所以面板读音频降级项的唯一合法通道就是那个 app 层门面。
//   ⚠️ 另两个没有这条限制，但**仍然转出**，理由与上面那两组门面同款：
//     「面板调了哪些能力」在一处就能看全，守卫 G110 只盯 `DebugPanel.vue` 一个文件。
export { audioDegradations } from './effects-runner'
export { assetDegradations } from '../services/asset-degradations'
export { saveDegradations } from '../services/save'

/**
 * 首个单元号。Epic 1 只有单元 1。
 * ⚠️📎 **「选单元」入口不属 Story 1.15**（R-32 的编号残留更正，2026-10-17）：
 *   `1.15 [CS]` 裁决 5 与 `epics.md` 的 AC 正文里 1.15 **既没有 router 也没有选关**。
 *   GDD 无选关自由，架构 `:770-782` 专门有纠错说明 ⇒ **任何 story 都不得建**
 *   `UnitSelectView.vue`，除非先改 GDD。这里写死 1 而不是做成配置，是**有意的**。
 */
const FIRST_UNIT_NUMBER = 1

/**
 * 组装**指定单元**的初始 state。失败时抛出带上下文的错。
 *
 * ⚠️ **try/catch 归 app 层，这是本文件存在它的唯一理由。**
 *   `createInitialState` 会抛两种错，两种都指向**内容数据**而不是战斗逻辑：
 *     · 空题单 —— 会让开局卡在 `awaiting-answer` 等一个不存在的选项
 *     · 单元号未填档位 —— 静默回退到首档会让整个 Epic 跑在未校准的数值上
 *   在 `core/` 里包一层 try/catch 会把「哪一层的问题」这个信息抹掉，
 *   而报错现场离错误源头（某个单元 JSON）很远 —— 这正是
 *   `eslint.config.js` 里禁 `content/ → core/` 那条规则的理由。
 *
 * 这里**包了再抛**，不加前缀消音：包一层是为了把「app 层在开局组装」这条
 * 上下文写进消息，而不是把原错误换成一个笼统的「开局失败」。
 *
 * 📎 **Story 1.16（裁决 10）把它拆成了带 `unitNumber` 参数的一份**：
 *   「进关时用哪个单元」不再等于 `FIRST_UNIT_NUMBER`。
 * ⚠️ **调用点决定要不要降级**：模块求值期（{@link initialState}）**让它抛** ——
 *   那是内容数据坏了，必须炸出来；而 {@link restoreFromSave} 的调用点
 *   **必须接住并降级**（NFR13：孩子点「开始游戏」不许白屏）。
 */
function buildStateFor(unitNumber: number): State {
  try {
    return createInitialState({ unitNumber, deck: entriesOf(unitNumber) })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[app] 组装单元 ${unitNumber} 的初始 state 失败：${reason}。` +
        '这一层错误几乎总是内容数据的问题（单元 JSON 缺失 / 词条为空 / 该单元未填数值档位），' +
        '先跑 `npm run validate:content`。',
      { cause: error },
    )
  }
}

/** 模块求值期那份 state —— 恒为 `FIRST_UNIT_NUMBER`（见该常量的注释）。 */
function initialState(): State {
  return buildStateFor(FIRST_UNIT_NUMBER)
}

/**
 * 战斗状态 —— 全应用**唯一**的一份。
 *
 * 用 `ref` 而不是 `shallowRef`：`reduce` 每次返回全新对象，浅层替换已足够触发更新；
 * 但深响应式的额外代价在这个规模（场上 ≤ 10 个实体、回合驱动、无连续运动）下可忽略，
 * 而它让 Story 1.13 的 HUD、1.16 的关卡流程不必考虑「我这份 state 是深是浅」。
 */
export const state: Ref<State> = ref(initialState())

// ── 跨局进度（Story 1.13 / 裁决 3）────────────────────────────────────────
//
// ⚠️ **`progress` 与 `state` 是两个不同的生命周期**，这是它必须独立持有的原因：
//   `restartLevel()` 重置的是 `State`（含 `masteredEntryIds`），
//   而「孩子已经学会哪些词」不随重打消失 —— FR58「累计所得只增不减」。
//   若把它塞进 `State`，`RESTART_LEVEL` 一执行进度就归零，孩子会发现
//   「刚才答对的白答了」，而界面上没有任何东西指向原因。
//
// ⚠️ **`currentUnitIndex` 本 story 不推进** —— 单元推进 / 通关 / 失败判定
//   属 Story 1.16（AC-H1 明令不许在本 story 动它）。它现在只是随 `Progress`
//   原样带过，让 1.15 序列化时形状就已经是对的。
//
// ⚠️ **不入 `State`** —— 与 `view` / `selectedEntryId` 不同，`progress` 是
//   **业务事实**而非 UI 态：它要被存档（1.15）。但它仍然不进 reducer，
//   因为 reducer 的输入输出必须是一局之内的状态，而它是跨局的（架构决策 5）。

/**
 * 跨局进度。唯一的变更点是 {@link applyAction} 末尾那行 `advanceProgress`。
 *
 * ⚠️ `currentUnitIndex` 初值是 **0**，与裁决 3 逐字一致（「本 story 初值 0」）。
 *   `[DS]` 交付时曾取 `1`，理由写作「AC-B5『1 起』」—— **AC-B5 全文没有「1 起」**
 *   （它只讲键名逐字锁死与 `readonly` 宽窄）。那是 R-37 的凭记忆改判据。
 *   `[CR]` 2026-10-16 已裁决**改回 0**，并同时删掉 `core/hud.ts` 里自加的「1 起」注释。
 *   ⇒ 0 基还有一条独立佐证：裁决 3 逐字写「**不用** `progress.currentUnitIndex + 1`」，
 *     那句话预设的正是 0 基。
 *   ⚠️ 改这个数前先看 `docs/rules/range-and-balance.md`（R-20..R-24）——
 *     它会被 1.15 **逐字序列化进存档**，基错了只能走迁移。
 *   （显示路径不依赖它：`ProgressBar` 用 `state.value.unitNumber`，故此改动对 HUD 可见输出零影响。）
 */
export const progress: Ref<Progress> = ref({ currentUnitIndex: 0, masteredWordIds: [] })

// ── 视图状态（Story 1.10 / 裁决 1）────────────────────────────────────────
//
// ⚠️ **`view` 是 UI 态，不是战斗态。** 它：
//   · **不进 `State`** —— 不参与 `reduce`，不会有 action 能改它
//   · **不存档** —— 关掉页面重开就该回到 `start`，存档的是进度与对局（决策 5）
//   · **不触发任何副作用** —— 切视图不播音效、不发请求
// ⚠️ 「不触发副作用」仍然成立，但**读档不是 `view` 自己的副作用** ——
//   那是 `enterLevel()`（用户点了「开始」）整体干的另一件事，见那里的注释。
// 把 UI 态塞进 `State` 的代价是每一种 UI 都要占一个 `Action` 变体与一个 reducer 分支，
// 而它对「这局打成什么样」没有任何影响。

/**
 * 当前显示哪个视图。
 *
 * 📎 **原注「Story 1.15 建 `router.ts` 时由它接管」已按裁决 5 作废**
 *   （R-32 的编号残留：epics.md 的 AC 正文里 1.15 没有 router）。
 *   ⇒ 在出现第二个视图之前，它就是全部。
 */
export const view: Ref<'start' | 'level'> = ref('start')

/**
 * 进入战场。由 `StartView` 的 `onStart` 在音频解锁**之后**同步调用。
 *
 * 📎 **Story 1.14（AC-E3）：第二行是新增的 `startBgmIfReady()`。**
 *   BGM 由「进入战斗」触发，而**进关不是 action** —— `state` 在模块求值期就建好了，
 *   `enterLevel()` 只改 `view`。⇒ BGM 走 `effects-runner` 的门面，**不进 `runEffects`**（裁决 5）。
 *   ⚠️ 排在 `view.value = 'level'` **之后**：视图先切过去，再起播 —— 顺序反了会在
 *     孩子还看着开始界面时就响音乐。
 *
 * 📎 **Story 1.15（裁决 3 / AC-D1）：现在还会读档，把 `progress` 与 `state` 喂回来。**
 *   ⇒ 1.14 逐字写的那句「`enterLevel()` 只改 `view`」**从今天起不再成立**，
 *     原因见 {@link restoreFromSave}。
 *   ⚠️ 读档排在 `view.value = 'level'` **之后**：`readSave()` 失败时孩子看到的仍然是
 *     「从头开始一局」，而不是停在开始界面等他再点一次（NFR13）。
 */
export function enterLevel(): void {
  view.value = 'level'
  startBgmIfReady()
  restoreFromSave()
}

/**
 * 从存档恢复跨局进度与当前这一局（AC-D1）。
 *
 * ⚠️ **为什么在 `enterLevel()` 而不是模块求值期**（1.15 裁决 3）：`state` 在模块求值期就建好了，
 *   读档要**替换** `state.value`；放模块顶层会让 `initialState()` 白跑一次，
 *   且把内容层的校验错误提到读档之前，排查时两件事混在一行代码上。
 *
 * ⚠️ **顺序不可换：先 `progress` 后 `state`** —— 两者是两套生命周期独立的数据（FR60 / R-06）。
 *
 * 📎 **Story 1.16 裁决 10 改了 `currentGame === null` 那一支的语义**：
 *   1.15 逐字是「不动 `state`」（回到该单元起点）；现在是
 *   **按 `progress.currentUnitIndex + 1` 重新组装** ⇒ 通关 → 回开始 → 再进关，
 *   进的是**下一个单元**而不是重打单元 1。
 *   `currentGame !== null` 那一支（断点续学）**一个字都没改** —— FR60 优先于单元推进。
 */
function restoreFromSave(): void {
  const saveFile = readSave()
  if (saveFile === null) {
    // 「没有存档」与「存档用不了」结果都是开局，但只有前者是孩子的正常体验。
    // 后者已经在 `readSave()` 里登记了降级项（1.17 的面板会显示）。
    return
  }

  progress.value = saveFile.progress

  const restored = saveFile.currentGame
  if (restored === null) {
    restoreNextUnit(saveFile.progress)
    return
  }

  try {
    // ⚠️ **不变量违反时让 `core/` 照抛**（NFR12 第一层：「逻辑层必须 `throw`，禁止 catch」）。
    //   是**这一层**去接住它并降级 —— 不是让 `core/` 学会不抛。
    //   存档是外部数据，而 `assertInvariants` 是为「合法状态空间」写的；
    //   内容回滚或存档来自别的内容版本时，它会在这里拦下那份不可信的对局。
    state.value = assertInvariants(restored)
  } catch (err) {
    // AC-D4：安全降级为「从头开始」，**不弹窗、不 alert、不抛**。
    // 孩子看到的是一局新开局，而不是一个技术错误（NFR13）。
    // ⚠️ 进度**已经喂回去了且不回滚** —— 它是独立的、已通过结构校验的数据，
    //   而丢掉它才是 R-06 说的那个错误（「局末清空战场时会连带把『21/60』一起清掉」）。
    progress.value = { currentUnitIndex: 0, masteredWordIds: [] }
    console.warn(
      `[save] 存档里的对局不合法，已退回从头开始（进度也一并重置）：${describeRestore(err)}`,
    )
  }
}

/**
 * 🔥 局末清空（`currentGame === null`）时按进度重新组装战场 —— Story 1.16 裁决 10。
 *
 * ⚠️ **`+1` 是基的换算，不是「往后挪一格」**：`currentUnitIndex` 是 **0 基**
 *   （1.13 裁决 3），`State.unitNumber` 是 **1 基** ⇒ 推进后 `index + 1`
 *   恰好是下一个单元的 1 基单元号。`core/hud.ts` 的 `advanceUnit` 注释逐字记着同一条。
 *
 * ⚠️ **Epic 1 里这一支是恒等变换**（`UNITS.length === 1`，`currentUnitIndex` 恒 0）
 *   ⇒ 真机上永远组装出同一个单元 1。守卫 **G95** 因此**必须喂非零 `currentUnitIndex`**
 *   才不是装饰守卫（R-51）。
 *
 * ⚠️ **降级而不是崩**（NFR13）：目标单元取不到 / 内容校验不过时退回
 *   「打开页面时那份 state 原样不动」并记一条 WARN。
 *   「不回头的推进」是**静默丢数据** —— `currentUnitIndex` 留在指向一个不存在的单元的
 *   数值上，而 `advanceUnit` 只在通关时推进 ⇒ 它会**永远卡住**，
 *   界面上没有任何东西指向原因 ⇒ 必须留 WARN 让 1.17 的面板能显示。
 */
function restoreNextUnit(savedProgress: Progress): void {
  const targetUnitNumber = savedProgress.currentUnitIndex + 1

  // ⚠️ **先问「录了没有」再组装**，而不是 try/catch 兜住 `entriesOf` 的抛错 ——
  //   「存档指向一个没录的单元」是**存档坏了 / 内容回滚了**，不是开局失败。
  const hasNextUnit = UNITS.some((unit) => unit.unitNumber === targetUnitNumber)
  if (!hasNextUnit) {
    // ⚠️ **保持打开页面时那份 state 原样不动**，并记 WARN（AC-C5 判据 3）。
    //   ⚠️ 别和 Epic 1 的正常结局搞混：`currentUnitIndex` 恒 0 时 `+1` 恒为 1，
    //     而单元 1 录了 ⇒ **正常结局根本走不到这一支**（AC-C4 的「不 bump」
    //     是 `advanceUnit` 那一侧的事）。走到这里 = 进度指向了一个不存在的单元。
    console.warn(
      `[save] 存档指向单元 ${targetUnitNumber}（progress.currentUnitIndex = ` +
        `${savedProgress.currentUnitIndex}），该单元未录入；已保持当前战场，进度**不回退**`,
    )
    return
  }

  try {
    state.value = buildStateFor(targetUnitNumber)
  } catch (err) {
    console.warn(
      `[save] 存档指向单元 ${targetUnitNumber}（progress.currentUnitIndex = ` +
        `${savedProgress.currentUnitIndex}），但组装失败，已保持当前战场：` +
        describeRestore(err),
    )
  }
}

/** 把一个 unknown 变成一句可读的说明（不抛，NFR14）。 */
function describeRestore(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── 建造交互的视图状态与门面（Story 1.12 / AC-D4、AC-D5、AC-F2、AC-F3）──────
//
// ⚠️ **`selectedEntryId` 与 `view` 同一性质，是 UI 态，不是战斗态。** 它：
//   · **不进 `State`** —— 不参与 `reduce`，不会有 action 能改它
//   · **不存档** —— 关掉页面重开就该回到「没选中任何卡」
//   · **不触发任何副作用** —— 选中一张卡不播音效、不发请求
//
// ⚠️ 为什么它不能进 `State`：那会让「孩子此刻点了哪张卡」占一个 `Action` 变体与
//   一个 reducer 分支，而它对「这局打成什么样」没有任何影响 —— 与架构 `:842-849`
//   对 `State` 的两条纪律（回合内的两处无限等待才属 State）冲突。

/**
 * 当前选中的手牌卡 `entryId`。`null` = 没选中。
 *
 * ⚠️ **必须自动清空**，否则有个很具体的后果：孩子点「开战」进入下一回合，
 *   回来答题时上一张卡**还亮着**，于是他点战场就建出一座他没选过的塔。
 *   清空点有两个，`applyAction` 里的相位检查只是**其中一个**：
 *     ① `applyAction` —— 相位离开 `awaiting-build` 时置 `null`（AC-D4）
 *     ② `placeSelectedAt` —— **成功种下**后自己置 `null`（AC-D5）
 *   ⚠️ **② 不可省**：建塔之后 `phase.kind` **仍然是** `'awaiting-build'`，
 *     ① 那条检查**根本不触发**。守卫 **G42** 专测这一点。
 */
export const selectedEntryId: Ref<string | null> = ref(null)

/**
 * 派发后清掉不该跨阶段残留的 UI 态。
 *
 * ⚠️ 这段代码挂在 `applyAction` 里，所以**每一条** action 路径都会经过它 ——
 *   包括组件自己调的门面。挂在组件里则会漏掉「别的组件 dispatch」的那些路径。
 */
function clearSelectionIfLeavingBuildPhase(next: State): void {
  if (next.phase.kind !== 'awaiting-build') {
    selectedEntryId.value = null
  }
}

/**
 * 派发一个 action —— 状态变更的**唯一**入口。
 *
 * 四步顺序是架构的一部分（见文件头）。任何一步都不可省、不可换位。
 *
 * ⚠️ 组件**只调这个**，不自己改 `state.value`。直接赋值会跳过 `reduce` 的
 *   阶段校验与不变量断言（`assertInvariants`），战场就会推进到一个
 *   「格子与塔不一致」而界面看起来完全正常的态。
 */
export function applyAction(action: Action): void {
  const prev = state.value
  const reduced = reduce(prev, action)
  // 📎 **Story 1.17 在四步之中加的这一行**（AC-B1）：把这一记 dispatch 录进会话。
  //
  // ⚠️ **`initialState` 取的是 `prev`（本步之前那份），不是 `reduced`** ——
  //   它要的是「第一条 action **之前**的 state」。`reduce` 是纯函数不改编入参，
  //   所以 `prev` 在这一步之后**仍然**是那一份快照；这一点由 `reducer.test.ts`
  //   的「零随机、零时间」守卫兜着。
  // ⚠️ 它排在**第 2 步之后、第 3 步之前** —— 四步顺序是架构的一部分（见文件头），
  //   本 story 只是在中间插入记账，不是改了那四步的内容。
  recordStep(action, prev, reduced)
  // 📎 **Story 1.17 裁决 5：dev-only 补偿缝** —— 第 2 步（`reduce`）与第 3 步之间。
  //
  // ⚠️ **必须排在 `runEffectsFromStore` 之前**（守卫 G109）：`SAVE` effect 携带的那份
  //   必须与内存里孩子看到的一致。排在后面就出现「盘上一份、内存一份」。
  // ⚠️ **排在上面那条录制之前**：会话要记的是**玩家点的输入**，
  //   记在补偿之前 ⇒ dev 态天然不进回放（AC-B6 / 裁决 6：
  //   回放必须复现真实输入才叫复现，带 dev 态的局面那不叫复现）。
  // ⚠️ **`import.meta.env.DEV` 这道门必须留在调用点**：Vite 生产构建会把它
  //   静态替换成 `false`，整条 `devAdjust` 分支被 tree-shake 掉，
  //   生产包**不带**这三个开关的任何代码。
  const next = import.meta.env.DEV ? devAdjust(reduced, prev) : reduced
  // 🔥 **Story 1.16 裁决 11（AC-C2）：先把「本局结算后的进度」算出来，两处共用。**
  //
  // ⚠️ **为什么要提前算**：写盘（第 3 步）此前拿的是**旧**的 `progress.value`，
  //   因为 `advanceProgress` 排在它后面 —— 那是 1.15 的**偏离 3**，
  //   实测症状是「答完一题立刻关页面，盘上少一个词」（守卫 G96 逐条记着这个差值）。
  //   词条靠下一次 dispatch 补得回来；**`currentUnitIndex` 补不回来** ——
  //   它只在通关那一次 dispatch 里推进一次，关掉页面就永远停在上一个单元。
  //
  // ⚠️ **1.13 AC-B3 的「理由」一个字没被推翻**：那条 AC 的理由逐字是
  //   「**必须读 `next`，读 `prev` 就永远慢一拍**」。`next` 在上面第 2 步就有了，
  //   这里读的正是 `next` ⇒ 理由完整保留；被改的只是「**排在赋值之后**」这条
  //   **字面口径**。按 R-57 这属于「改判据」，留痕记在 story 文档的偏离表里，
  //   而 1.13 的 story 文档已归档、按 R-40 不去动它。
  //
  // ⚠️ **`advanceProgress` / `advanceUnit` 各只调一次** —— 不是「算两次对得上」。
  // ⚠️ **`hasNextUnit(reduced)` 只在 `reduced.phase.kind === 'level-complete'` 时为 `true`**，
  //   其余相位恒 false ⇒ 两条纯函数的「无增量返回入参本身」性质被绝大多数
  //   dispatch 保住，`progress.value` 的引用只在真有变化时才变（守卫 G54 的鉴别力）。
  // 📎 **1.17：这里刻意读 `reduced` 而不是 `next`（裁决 5 末段二选一的判定）** ——
  //   跨局进度是**孩子真的会带走的业务事实**（FR58 只增不减、还要落盘），
  //   dev 补偿是**临时手柄**。拿补偿后的掌握记录去算进度的话，
  //   「直接通关」勾一下就把整份题单永久写进了 `masteredWordIds` ——
  //   关掉开关、重打一局，那 25 个词仍然显示成「已掌握」，而界面上没有任何东西
  //   指向原因（R-06 说的那种「静默错到下一个生命周期」）。
  //   ⇒ 写盘拿 `next`（要一致），跨局进度拿 `reduced`（不能被 dev 手柄污染）。
  const nextProgress = advanceUnit(advanceProgress(progress.value, reduced), hasNextUnit(reduced))
  // 📎 **Story 1.14 接上的第三步**（AC-E2）：拿 `(action, prev, next)` 三个快照去播音效。
  //
  // ⚠️ **位置不可换** —— 它读的是 prev/next 两个快照，排在 `state.value = next`
  //   之后的话 `prev` 就已经取不到了（见文件头的四步顺序）。
  // ⚠️ 这一层**只负责调用**，判据（该播哪条 cue）全在 `core/effects.ts` 的
  //   `runEffects` 里，播放实现在 `services/audio.ts` —— 三层各司其职，
  //   store 不碰「播什么」，也不碰「怎么播」。
  // 📎 **Story 1.15 把第 4 参传了进去**（AC-C4）：存档要写两样东西 ——
  //   `currentGame` 来自 `next`（判据已编进 `SAVE` effect），
  //   而跨局进度是 store 里的独立 ref，`(action, prev, next)` 算不出来。
  //   🔥 **1.16 把它从 `progress.value` 换成了 `nextProgress`**（见上面的裁决 11）。
  runEffectsFromStore(action, prev, next, nextProgress)
  state.value = next
  // ⚠️ **📎 Story 1.12 在这一步之后加了一行**（AC-D4）：相位离开 `awaiting-build`
  //   时清掉选中态。排在赋值**之后**是刻意的 —— 判据必须读**新**相位。
  //   ⚠️ 这**不是**建塔成功那条路径的兜底：建塔后 `phase.kind` 仍是
  //   `'awaiting-build'`，这行不触发。成功那条见 `placeSelectedAt`（守卫 G42）。
  clearSelectionIfLeavingBuildPhase(next)
  // ⚠️ **📎 Story 1.13 在这一步之后加了第二行**（AC-B3 / 裁决 3）：
  //   把**新** state 的掌握记录并进跨局进度。
  //   ⚠️ `advanceProgress` 在**没有增量时返回入参本身**（AC-B3 第三条性质），
  //     所以这一行在绝大多数 dispatch 上**不产生引用变更** ⇒ `ProgressBar`
  //     不会每次 action 都重算。守卫 G54 正是靠这一点才有鉴别力。
  //   🔥 **1.16 把它与单元推进合并成一次赋值**（AC-C2）：算一次、赋一次。
  progress.value = nextProgress
}

/**
 * 通关了之后有没有**下一个单元** —— {@link advanceUnit} 的那条判据。
 *
 * ⚠️ **只在 `level-complete` 时为 `true`**：重打（`RESTART_LEVEL`）把相位推成
 *   `awaiting-answer`，而「重打」逐字是**同单元内的再来一次**（FR52）
 *   ⇒ 任何非通关的相位都不得推进单元号，否则「重打一次」会把孩子推到下一个单元，
 *   而他一个词都还没答。
 *
 * ⚠️ **用 `UNITS.some` 而不是 `getUnit` + try/catch**：内容层「这个单元没录」
 *   抛错是刻意设计，不是失败路径 —— 用异常表达一个**预期状态**，
 *   会把正常结局记成降级（1.17 的面板会给孩子报一个不存在的故障）。
 */
function hasNextUnit(next: State): boolean {
  if (next.phase.kind !== 'level-complete') return false
  const targetUnitNumber = next.unitNumber + 1
  return UNITS.some((unit) => unit.unitNumber === targetUnitNumber)
}

// ── 建造交互的三个门面（Story 1.12 / AC-D5、AC-F2、AC-F3）─────────────────
//
// ⚠️ **门面的存在理由不只是「方便」**：它是「组件层不碰 action 构造器」这条
//   边界的**落点**。`core/actions.ts:11-15` 明写「构造器若开始校验，组件就会有两套
//   入口」—— 反过来，组件直接 `applyAction(placeTower(id, cell))` 就绕过了下面这层
//   禁用判断：孩子点一下撞上一条抛错，界面上白着而没有任何东西指向原因
//   （架构 `:563` 压倒性原则「孩子面前永不出现技术错误」）。
//
// ⇒ **组件只调这三个函数**，不 import `core/actions`。

/**
 * 选中一张手牌卡；**再点同一张则取消**（AC-D2①）。
 *
 * ⚠️ **不校验这张卡此刻能不能建**：能不能放由 `placementBlockedReason` 在
 *   **落子那一格**上回答。选中态是 UI 态，此处多问一次只会把「卡已变灰」与
 *   「这张卡选不了」两件不同的事混在一起。
 */
export function selectTowerCard(entryId: string): void {
  selectedEntryId.value = selectedEntryId.value === entryId ? null : entryId
}

/**
 * 在 `(row, col)` 放下当前选中的卡。返回**是否真的种下了**。
 *
 * ⚠️ **内部先问 `placementBlockedReason`，非 `null` 直接 `return false`、不 dispatch**
 *   （AC-D3：点无效格子「不响应」且**不抛错** —— 组件层不许 throw，架构 `:567-606`）。
 *
 * ⚠️🚨 **成功种下后必须自己把 `selectedEntryId` 置 `null`**（AC-D2③ / AC-D5）：
 *   **别指望 `applyAction` 里那条相位检查兜底** —— 建塔之后 `phase.kind`
 *   **仍然是** `'awaiting-build'`，那条检查**根本不触发**。
 *   这是校验阶段抓出的一个「看起来有守卫、实际恒不触发」的洞，守卫 **G42** 专测它，
 *   变异 **M75** 专打它。
 *
 * @returns `true` = 塔已种下（且选中态已清）；`false` = 什么也没发生。
 */
export function placeSelectedAt(row: number, col: number): boolean {
  const entryId = selectedEntryId.value
  // 未选中任何卡 ⇒ 连判据都不必问（`placementBlockedReason` 需要一个 entryId）。
  if (entryId === null) {
    return false
  }
  if (placementBlockedReason(state.value, entryId, row, col) !== null) {
    return false
  }
  applyAction(placeTower(entryId, cellKey(row, col)))
  // 建塔之后相位仍是 awaiting-build ⇒ 上面的相位检查不触发 ⇒ 必须在这里清。
  selectedEntryId.value = null
  return true
}

/**
 * 「⚔ 开战」按钮的三连 dispatch（AC-F2，裁决 3）。
 *
 * ⚠️ **为什么这条链路归 1.12**：`applyAnswer` 答完立刻切到 `awaiting-build`
 *   （`reducer.ts` 的 `withBuildPhase`），而**没有任何 story 拥有 `END_BUILD`
 *   之后的那段链路** —— 1.13 管 HUD、📎 1.14 管 effects-runner，1.16 管通关 / 失败 / 重打，
 *   两者的 AC 里都没有「结算这一回合」。不接上它，1.12 交付后游戏停在
 *   `awaiting-build`，**1.12 的成果无法真机验证**。
 *
 * ⚠️ **`CONTINUE` 前必须判 `round-over`**（AC-F2 / AC-F3）：
 *   `RESOLVE_ROUND` 在心数归零时把相位直接推到 `level-failed`，而 `applyContinue`
 *   对该相位会 `rejectAction` **抛错** —— 孩子点一次「开战」就看到一个技术错误。
 *   守卫 **G37** 专测这条，变异 **M69** 专打它。
 *
 * ⚠️ **三连是同步的**：`applyAction` 同步替换 `state.value`，中间不需要 `await`。
 * ⚠️ **终态不渲染画面**（AC-F4，属 Story 1.16）：手牌区与开战按钮随相位离开
 *   `awaiting-build` 自动消失，`BattleField` 照常渲染（reducer 已清空战场实体）。
 */
export function startRound(): void {
  // 守卫：按钮不该可点，但要有（AC-F3）—— 与 AC-D6 同一口径。
  if (currentPhaseKind() !== 'awaiting-build') {
    return
  }
  applyAction(endBuild())
  applyAction(resolveRound())
  if (currentPhaseKind() === 'round-over') {
    applyAction(continueRound())
  }
}

/**
 * 当前相位种类 —— **每次调用都重新从 `state.value` 读**。
 *
 * ⚠️ **为什么不能直接写 `state.value.phase.kind === 'round-over'`**：
 *   TypeScript 会把上一次 `if (state.value.phase.kind !== 'awaiting-build')`
 *   之后**return** 的事实窄化下来，于是中间两次 `applyAction` 改变的那份
 *   `state.value` 不被看见，后面那句比较直接编译报错 TS2367
 *   （`'awaiting-build'` 与 `'round-over'` 无交集）。
 *   ⇒ 用函数把「重新读一遍」这件事写进类型里，而不是靠 `as` 逃出去。
 *   本仓库对 `as` 的态度见 §8 教训 3：它常用来把**断言**变得不再断言。
 */
function currentPhaseKind(): State['phase']['kind'] {
  return state.value.phase.kind
}

// ── 关卡流程的两个门面（Story 1.16 / AC-C1、AC-D3）────────────────────────
//
// ⚠️ **它们的存在理由与上面三个建造门面同款**：组件**只调门面**，不 import
//   `core/actions`，也不直接改 `state` / `view`。
//   孩子点一下撞上一条抛错，界面上白着而没有任何东西指向原因（架构 `:563`
//   「孩子面前永不出现技术错误」）—— 门面就是那层「不响应 / 静默」。

/**
 * 重打本单元（Story 1.16 / AC-C1）—— **失败画面上那个按钮的唯一入口**。
 *
 * ⚠️ **绝不调 `enterLevel()`**（裁决 4(a)）。`enterLevel()` 内部会
 *   {@link restoreFromSave}，而盘上这一刻存着的正是刚 `level-failed` 的那份 state
 *   ⇒ 走它等于把刚失败的那一局原样读回来，重打按钮**什么也没做**。
 *   这是本 story 最贵的一个「看起来等价」（两个入口都是「重新开始这一局」）。
 *
 * ⚠️ **走 `applyAction` 而不是直接调 `reduce`**：四步顺序不可绕（R-04）——
 *   `restartLevel` 是 1.15 新增的第 6 个**写盘点**（`core/effects.ts` 块 ④），
 *   绕开 `applyAction` 就绕开了写盘 ⇒ 重打的结果不落盘，
 *   症状是「孩子重打后关页面，重进又回到失败画面」。
 *
 * ⚠️ **相位守卫与 {@link startRound} 同款**：reducer 在非 `level-failed`
 *   相位下对 `RESTART_LEVEL` **抛错**（NFR12），而按钮按 AC-D1 只在失败态出现
 *   —— 门面仍要自己挡一次，否则将来接线接错就是白屏。
 *   守卫 **G93** 钉住「本门面是 `RESTART_LEVEL` 的唯一调用点」。
 */
export function restartLevel(): void {
  if (currentPhaseKind() !== 'level-failed') return
  applyAction(restartLevelAction())
  // 📎 **Story 1.17（AC-B5）：重打之后清掉会话录制。**
  //
  // ⚠️ **必须排在 `applyAction` 之后**：`recordStep` 挂在 `applyAction` 里，
  //   先清后 dispatch 会把这一条 `RESTART_LEVEL` 也录进去 —— 而它属于**上一局**。
  // ⚠️ 判据是「重打是**新一局**」，不是相位：上一局的 `initialState` 对新一局
  //   毫无意义（它还是那个孩子刚失败的局面），留着会让导出的 JSON
  //   从一个失败局面开始播。守卫 **G101** 专测。
  resetSession()
}

/**
 * 回开始界面（Story 1.16 / AC-D3）—— **通关画面上那个按钮的唯一入口**。
 *
 * ⚠️ **只做 `view.value = 'start'` 一件事**：不清 `selectedEntryId`
 *   （它在本就由 {@link clearSelectionIfLeavingBuildPhase} 清空了）、
 *   **不读档、不写盘、不停 BGM**。BGM 停止策略属 1.14 / 1.18，本 story 不碰。
 *
 * ⚠️ **不落盘**是有意的：孩子的进度与战场刚刚由通关那一次 dispatch 落过盘
 *   （`core/effects.ts` 块 ④ 的 `level-complete` 行存 `null`）。
 *   在这里再写一次只会把同一份内容写两遍，并让「写盘点有几个」这个问题多一个答案。
 *
 * ⚠️ **不扩 `view` 联合、不建 `router.ts`**（AC-D3）：1.15 裁决 5 已推翻
 *   「建 router」的原口径，且 GDD 无选关自由（见 {@link FIRST_UNIT_NUMBER}）。
 */
export function backToStart(): void {
  view.value = 'start'
}

/**
 * 朗读当前题 —— **朗读通路的唯一门面**（Story 1.11 / AC-D4 / 裁决 3）。
 *
 * ── 为什么组件不直接 import `pronunciation` ─────────────────────────────────
 * `StartView.vue:14-16` 立的纪律是「组件不直接碰 `services/`」，理由是音频解锁的
 * 三步顺序是一条架构约束，写在 `app/audio-unlock.ts` 里肉眼可查。
 * `pronunciation.ts` **完全落在那条理由之内** —— 它持有 `globalThis.AudioContext`
 * 且有解锁时序。
 * ⚠️ **但这条纪律不是「组件不碰整个 `services/`」**：无状态的 `asset-url.ts`
 *   由 1.10 为塔 / 僵尸开过直接 import 的口（守卫 G25 只禁 `pronunciation`）。
 *
 * ── 为什么**不**走 `effects-runner.ts` ──────────────────────────────────────
 * 它的签名 `runEffects(action, prev, next)` 是为 **action 驱动**设计的，
 * 而「孩子主动点重听」**不对应任何 action** —— 硬塞进去是形状错配。
 * 它属 Story 1.14，且那时的用法会是「本 facade 在 action 链路上转调它」。
 *
 * ── 🚨 为什么必须先做 phase 收窄 ──────────────────────────────────────────
 * `Phase` 是六变体联合，其中**五个没有 `question`**（`types.ts:307-314`）。
 * 不收窄就写 `state.value.phase.question` 会在**其余五种阶段**上抛
 * `Cannot read properties of undefined` —— 而卡面在 `awaiting-build` 期间
 * 仍然渲染（`lastQuestion`，AC-C5），点它就是必崩。
 * 写法与 `reducer.ts:180-182` 同型。
 */
export function speakQuestion(): void {
  const phase = state.value.phase
  if (phase.kind !== 'awaiting-answer') return
  // ⚠️ **`entryId` 必须传**（`pronunciation.ts:584-592`）：不传时直接走 TTS，
  //   而 TTS 再失败就只剩一条 console.warn —— `fallbackToRecording` 不播任何音频。
  //   也就是说「TTS 挂了也有录音兜底」这句话**只对传了 entryId 的调用方成立**。
  //
  //   朗读失败**绝不阻断回合**（FR5 / AR37）：`playPronunciation` 内部已保证
  //   「绝不向调用方抛」，所以这里**刻意不加 try/catch** ——
  //   再包一层会把「哪一层出的问题」这个信息抹掉，正是本文件 `initialState()`
  //   上方注释里说的那种损失。
  playPronunciation(phase.question.card.promptText, phase.question.entryId)
}

// ── 跳回合（Story 1.17 / AR40、裁决 7）──────────────────────────────────────

/** 跳回合的结果 —— 面板照它如实显示，不自己猜。 */
export interface JumpResult {
  /** 实际停下的回合号。 */
  readonly reachedTurn: number
  /**
   * 为什么停在这儿。
   * ⚠️ `reached` **不是**「一定到了目标回合」——目标回合 ≤ 当前回合时也是它
   *   （那本来就该是「原样不动」）。
   */
  readonly stoppedBy: 'reached' | 'level-failed' | 'level-complete' | 'not-in-play'
}

/**
 * 步数上限 —— 防「目标回合写成 99999」把浏览器挂死。
 *
 * ⚠️ 正常路径根本走不到它：循环体每次都推进一个相位，而相位是有限的
 *   （答题 → 开战 → 结算 → 推进）。它是**兜底**，不是流程的一部分。
 */
const MAX_JUMP_STEPS = 500

/**
 * 「跳到任意回合」（AR40）—— 调试面板上那个输入框 + 按钮的唯一入口。
 *
 * ── 为什么必须经 `enterLevel()`（裁决 7）────────────────────────────────
 * `deferred-work.md`（Story 1.15 第 4 条）逐字：「任何新增的『回到战场』路径
 * 若不经过 `enterLevel()`，**就读不到存档**」。而 G86 只管「谁调 `readSave`」，
 * **管不到「每条进关路径都调了」**（1.16 偏离表第 2 条已登记过这个缺口）。
 * ⇒ 不在战场上就先 `enterLevel()`，让读档这一步发生。
 * ⚠️ **已经在战场上时不重复调 `enterLevel()`**：它内部会 `restoreFromSave`，
 *   而盘上这一刻存着的正是当前这一局 ⇒ 重复调等于把内存里正在玩的局面丢掉。
 *   这与 1.16 裁决 4(a)「重打按钮绝不调 `enterLevel()`」是同一个坑的两面。
 *
 * ── 为什么链发真 action 而不是直接摆一个 state ───────────────────────────
 * ① `applyAction` 的四步（reduce → dev 补偿 → 进度 → 副作用）是架构的一部分，
 *   绕开它就绕开了写盘与音效；守卫 **G118** 断言「跳完之后盘上的回合号也跟着到了」。
 * ② 裁判与判定仍由 `core/` 出：答哪一题走 `isCorrect`，这里**不重写一遍判定**
 *   （与 AC-D1 那条「判定只有一个出处」同款）。
 *
 * ── 它**不做**什么 ────────────────────────────────────────────────────────
 * · 不建塔、不选卡 —— 「跳回合」只推进回合，建塔由人接着做；
 * · 不改胜负判定 —— 心耗尽就停在 `level-failed`，如实在 `JumpResult` 里报告。
 *   想跳更远请勾上「无限心」再跳（那是另一个开关的语义，本门面不偷偷替你开）。
 *
 * ⚠️ **跳完清掉会话录制**（与 1.16 偏离 3 同款理由）：这些回合不是玩家按出来的，
 *   留在录制里会让导出的 JSON 从一个**假局面**开始播，而复现要求是真输入。
 *
 * @param targetTurn 目标回合号（1 基）。非有限值或 < 1 一律按 **1** 处理 ——
 *   面板上的输入框可以是空的，而 `Math.max(1, NaN)` 是 `NaN`。
 */
export function jumpToTurn(targetTurn: number): JumpResult {
  if (view.value !== 'level') enterLevel()

  const target = Number.isFinite(targetTurn) ? Math.max(1, Math.trunc(targetTurn)) : 1

  for (let step = 0; step < MAX_JUMP_STEPS && state.value.turn < target; step += 1) {
    // ⚠️ 直接读 `phase` 而不是 `currentPhaseKind()`：那个 helper 只返回 `kind`
    //   （`State['phase']['kind']`），**判别联合到这一步已经收窄了**，
    //   `phase.question` 取不到。`tests/app/session-replay` 里同款处置见
    //   `tests/core/session-replay.test.ts:110` 的注释。
    const phase = state.value.phase
    if (phase.kind === 'awaiting-answer') {
      const { card } = phase.question
      const correct = card.options.find((option) => isCorrect(card, option.id))
      // ⚠️ 「没有正确项」只可能来自坏内容数据（`isCorrect` 是纯函数，
      //   卡上没有 `correct` 的项时它对每一项都返回 false）。
      //   ⇒ 停下来如实报告，而不是 dispatch 一条会被 reducer 判非法态的 ANSWER。
      if (correct === undefined) break
      applyAction(answer(correct.id))
      continue
    }
    if (phase.kind === 'awaiting-build') {
      startRound()
      continue
    }
    // ⚠️ `round-over` 只在 dev 补偿把 `level-failed` 翻回来之后才会出现
    //   （裁决 5 判据 1 + 偏离 6）—— 那种局面下回合**已经结算完**，
    //   要继续往后走就得再按一次推进。生产构建里这段不可达（dev 补偿被 tree-shake）。
    if (phase.kind === 'round-over') {
      applyAction(continueRound())
      continue
    }
    break
  }

  resetSession()

  const kind = currentPhaseKind()
  const stoppedBy: JumpResult['stoppedBy'] =
    state.value.turn >= target
      ? 'reached'
      : kind === 'level-failed'
        ? 'level-failed'
        : kind === 'level-complete'
          ? 'level-complete'
          : 'not-in-play'

  return { reachedTurn: state.value.turn, stoppedBy }
}
