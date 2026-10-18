/**
 * 回合状态机 —— **唯一的状态变更点**（Story 1.5 / AC-1…AC-8、AC-11…AC-13）。
 *
 * ── 本文件的四条纪律 ──────────────────────────────────────────────────────
 * 1. **纯函数**（决策 2 / AR6）：无随机、无时间依赖、不就地改入参。
 *    同一串 Action 必须重放出完全相同的一局 —— 存档回放（Story 1.15）与
 *    平衡模拟（AR17）都靠这一点，而它们都直接 import 本文件。
 * 2. **按阶段拒绝非法 action**（AC-2 / FR54）：非法即抛错，绝不静默忽略。
 *    静默忽略的后果是界面上「点了没反应」，而重进游戏后状态又对不上 ——
 *    两者之间没有任何因果链可循。
 * 3. **组件不得计算任何战斗规则**（NFR8）：本文件是答案的唯一来源。
 * 4. **依赖方向**：`reducer → turn → combat` 单向。本文件**不得**被 turn.ts import
 *    ——否则回合规则会同时住在两个模块里，而「写两遍」的那份没有任何东西盯着。
 *
 * ── 题单为什么这么存（自主设计 #4、AC-5）─────────────────────────────────
 * `state.deck` 是本局题单的**固定全集**，一局内数组本身永不变动；
 * 「已答对的题不再出现」由 `masteredEntryIds` 表达，`nextQuestion()` 取第一个未答对者。
 * 不维护一个会重排的队列：队列的顺序一局内一变，存档里的 mastered 就可能对不上，
 * 而两者失配的现场是「这局已经学会的词又考了一遍」—— 没有任何报错指向它。
 *
 * 零 DOM、零 Vue、零日志（core/ 一律不打日志：`tsconfig.core.json` 的 `types: []` 会让
 * `console.log` 报 TS2584；回合日志由 `scripts/balance-sim.ts` 打印，架构 `:620-628`）。
 */

import { HEARTS, ZOMBIE_HP, assertTowerType, costOf, initialSunFor, sunPerCorrectFor } from './balance.js'
import { ZOMBIE_SPAWN_COL, buildBlockedReason, cellKey, parseCellKey } from './grid.js'
import { resolveCombatRound } from './turn.js'
import {
  assertSlowTurns,
  assertZombieCol,
  assertZombieHp,
  createTower,
  createZombie,
  isCorrect,
} from './types.js'
import type { Action, DeckEntry, Question, SkipQuestionAction, State, Zombie } from './types.js'

/** `createInitialState()` 的入参。deck 是本局题单的全集（AC-5）。 */
export interface CreateInitialStateInput {
  readonly unitNumber: number
  readonly deck: readonly DeckEntry[]
}

/**
 * 造出回合 1 的 state：心数 / 阳光 / 空战场 / **第 1 只僵尸入场** / 第 1 题挂上。
 *
 * ⚠️ 空题单抛错：否则开局就卡在 `awaiting-answer` 等一个不存在的选项，
 * 而界面上什么都不会发生。
 *
 * ⚠️ 未填档位的单元号抛错（沿用 `tierForUnit` 的 AC-3 口径）：静默回退到首档
 * 会让整个 Epic 在未校准的数值上运行 —— 平衡模拟尤其危险，它会输出一整张
 * 「看起来有效」的门槛表。
 */
export function createInitialState(input: CreateInitialStateInput): State {
  if (input.deck.length === 0) {
    throw new Error('题单不能为空 —— 开局没有题可问，界面会停在一个永远等不到答案的阶段且无任何报错')
  }
  // 阳光与心数都来自档位/常量，本行同时完成「单元号是否落在已填档位上」的校验。
  const sun = initialSunFor(input.unitNumber)
  const question = nextQuestion(input.deck, [])
  if (question === null) {
    // 上面已排除空题单，所以这里不可达 —— 但把它写成断言而不是 `!`，是为了让
    // 「题单非空却一道题都选不出来」这类未来改动**响**，而不是静默造出一个坏 state。
    throw new Error('题单非空却选不出第一题 —— nextQuestion 与题单构造之间出了不一致')
  }

  const state: State = {
    unitNumber: input.unitNumber,
    phase: { kind: 'awaiting-answer', question },
    turn: 1,
    hearts: HEARTS,
    sun,
    grid: {},
    towers: [],
    zombies: [],
    // ⚠️ 题单**复制**一层，不与调用方共用数组引用（`[CR]` 2026-10-14）。
    //   `State` 里其余集合（`grid` / `towers` / `zombies` / `unlocked`）每次 reduce
    //   都新分配，`deck` 曾是唯一共享的可变别名：内容层一次 `sort()` / `splice()`
    //   就会悄悄改变**一局进行中**的存档在考什么，而没有任何东西会报错。
    //   条目本身是 `readonly` 对象，只复制数组即可。
    deck: [...input.deck],
    masteredEntryIds: [],
    // 📎 Story 1.18 / AC-E4：跳过记录同样从空开始。见 `types.ts` 的说明 ——
    //   它是**第三个**记账字段，不是 `masteredEntryIds` 的子集。
    skippedEntryIds: [],
    unlocked: [],
  }
  // AC-6 / 自主设计 #5：僵尸入场发生在「回合开始」，而 Phase 联合没有 round-start 变体，
  // 所以它必须落在建局这一次转换上（另一半落在 round-over --CONTINUE-->）。
  const withZombie = { ...state, zombies: [...state.zombies, spawnZombie(1)] }
  assertInvariants(withZombie)
  return withZombie
}

/**
 * 🔥📎 **造出「这个单元已经学完」的终态**（Story 1.19 / AC-B6）。
 *
 * ⚠️ **为什么它必须存在**：`createInitialState` 对空题单**抛错**
 *   （理由逐字写在上面：空题单会让开局卡在 `awaiting-answer`）。
 *   而 Story 1.19 起（裁决 1）「一局 = 10 题」，孩子把这个单元的 37 条全部掌握之后，
 *   切片结果就是**空题单** ⇒ 开局组装撞上那条抛错。
 *   ⇒ 抛错的调用点之一是**孩子点的「开始游戏」** —— NFR13 压倒性原则
 *     「孩子面前永不出现技术错误」。
 *
 * ⚠️ **为什么不选「退回开始界面」**：孩子点一次按钮回到开始界面、再点一次又回来，
 *   读起来就是「这个按钮按了没反应」。而**造一份终态**给孩子看到的是
 *   **他打完整单元后看过的那一张通关卡** —— 同一句话、同一个按钮、同一份布局。
 *   即「本单元已学完」是**如实报告**，不是技术错误。
 *
 * ⚠️ **战场三件套全空**（`towers` / `grid` / `zombies`），与 `CONTINUE`
 *   判定「全部答对」时造出的终态**逐项同形** —— 那条分支的注释逐字写着
 *   「终态里留着塔会让『通关了但还能改局面』成立」。这里同理：
 *   一份带塔的「已学完」会被持久化层当成「正在进行中的对局」。
 *
 * ⚠️ **三份记账字段全空**：`masteredEntryIds` / `skippedEntryIds` / `unlocked`
 *   与 {@link createInitialState} 的初值一致 —— 这正是切片不撞
 *   `assertDeckRelations` 的原因（「本局」是 `State.masteredEntryIds`，
 *   「跨局」是 `Progress.masteredWordIds`，两套独立记账，R-06）。
 *
 * ⚠️ **心数取满、阳光取开局值、回合号取 1**：这份 state **没有对应的局**可打，
 *   而这三个字段会显示在 HUD 上。取「打了一局之后的残值」是编造，取开局值是诚实。
 *   （`LevelOutcome` 浮层只读 `phase.kind`，这三项只在它背后的 HUD 上可见。）
 *
 * ⚠️ **单元号未填档位时抛错**：与 {@link createInitialState} 同款 ——
 *   静默回退到首档会让整个 Epic 跑在未校准的数值上。
 *
 * ⚠️ **`deck` 是空数组**：跨局的全部掌握记录在 `Progress.masteredWordIds` 里
 *   （`src/app/store.ts` 的切片读它），不在这份 state 里。
 *   ⇒ 存档存下这份 state 后再读回来，仍然是终态，不会变回一局（AC-B9）。
 *
 * @param unitNumber 1 基单元号（与 `State.unitNumber` 同一基准）。
 */
export function createUnitCompletedState(unitNumber: number): State {
  const state: State = {
    unitNumber,
    phase: { kind: 'level-complete' },
    turn: 1,
    hearts: HEARTS,
    // 📎 同一行同时完成「单元号是否落在已填档位上」的校验，理由与
    //   `createInitialState` 里那行逐字相同 —— 不静默回退（R-20 的前提是数值可复现）。
    sun: initialSunFor(unitNumber),
    grid: {},
    towers: [],
    zombies: [],
    deck: [],
    masteredEntryIds: [],
    skippedEntryIds: [],
    unlocked: [],
  }
  assertInvariants(state)
  return state
}

/**
 * 取下一个该考的问题：题单里第一个尚未答对、也未被跳过的条目。
 *
 * 全部答对时返回 `null`（由调用方转 `level-complete`）—— 不返回「随便挑一个」，
 * 因为那会让孩子已经学会的词又被考一遍，而界面上看不出任何异常。
 *
 * 答错的题**仍在题单里、仍未 mastered**，所以它会被再次选中（AC-4/AC-5 的重考）。
 *
 * 🔥📎 **`skippedEntryIds` 是 Story 1.18 / AC-E4 加的第三个参数。**
 *   ⚠️ **刻意给了默认值 `[]` 而不是必填** —— 理由与它造成的风险都写在这里：
 *     · 给默认值的好处：`applyAnswer` / `applySkip` 两处调它时**必须显式传**才能拿到
 *       正确语义，而任何**新写的**调用点（脚本、未来的工具）在漏传时会立刻少排除一层，
 *       症状是「跳过的那道题又回来了」—— 可见、且指向本函数。
 *     · 必填的坏处：会让 1.x 已有的三处调用点（`createInitialState`、本文件两处）
 *       与既有测试一起改，而它们本来就不涉及跳过。
 *   ⇒ 守卫 G143 断言「跳过之后 `nextQuestion` 不再抽中那道题」，
 *     那条判据直接覆盖「`applySkip` 漏传第三个参数」这个最可能的错法。
 */
export function nextQuestion(
  deck: readonly DeckEntry[],
  masteredEntryIds: readonly string[],
  skippedEntryIds: readonly string[] = [],
): DeckEntry | null {
  for (const entry of deck) {
    if (!masteredEntryIds.includes(entry.entryId) && !skippedEntryIds.includes(entry.entryId)) {
      return entry
    }
  }
  return null
}

/**
 * 状态机本体：`reduce(state, action) -> state`（纯函数）。
 *
 * ⚠️ 组件**只** dispatch action、只读 state —— 它不推进阶段、不算造价、不算掉心
 * （NFR8，AI 最易漂移的一条）。
 *
 * 每个分支产出的新 state 都过一遍 {@link assertInvariants}：断言挂在出口而不是靠调用方自觉，
 * 是因为它对**所有**调用路径都成立 —— 组件、模拟器、未来的回放工具都被覆盖到。
 */
export function reduce(state: State, action: Action): State {
  switch (state.phase.kind) {
    case 'awaiting-answer':
      // 🔥📎 Story 1.18 / AC-E4：`SKIP_QUESTION` 与 `ANSWER` 同处这个相位，
      //   但走的是**另一个** apply —— 见 `applySkip` 的注释。
      if (action.type === 'SKIP_QUESTION') {
        return assertInvariants(applySkip(state, action))
      }
      return assertInvariants(applyAnswer(state, action))
    case 'awaiting-build':
      return assertInvariants(applyBuild(state, action))
    case 'resolving':
      return assertInvariants(applyResolve(state, action))
    case 'round-over':
      return assertInvariants(applyContinue(state, action))
    case 'level-complete':
      rejectAction(state, action, '本局已通关 —— 战场已清空，继续操作会造出「通关了但还能改局面」的怪状态')
      break
    case 'level-failed':
      if (action.type === 'RESTART_LEVEL') {
        return assertInvariants(restart(state))
      }
      rejectAction(state, action, '本局已失败 —— 只有 RESTART_LEVEL 合法')
      break
    default:
      // 穷尽检查：新增 Phase 变体而本 switch 没跟上时编译期报错。
      return assertPhaseNever(state.phase)
  }
  // switch 的每条分支都 return 或 throw；这里只是让 TS 知道控制流已终止。
  throw new Error('unreachable')
}

/** 拒绝一个 action，并把「为什么这条错了 → 会导致什么」写进错误消息。 */
function rejectAction(state: State, action: Action, why: string): never {
  throw new Error(
    `${why}：当前阶段是 ${state.phase.kind}（回合 ${state.turn}），收到 ${action.type}。` +
      '阶段只能由 reduce 推进 —— 组件自行推进会让回合日志与实际局面脱节，断点续学恢复后也不知道该等什么。',
  )
}

/** 新增 Phase 变体而 switch 没跟上时的编译期兜底。 */
function assertPhaseNever(phase: never): never {
  throw new Error(`未处理的阶段：${JSON.stringify(phase)} —— 新增了 Phase 变体而状态机没跟上`)
}

// ── awaiting-answer ───────────────────────────────────────────────────────

/** 在等答案时，只有 `ANSWER` 合法。 */
function applyAnswer(state: State, action: Action): State {
  if (action.type !== 'ANSWER') {
    rejectAction(
      state,
      action,
      '还在等孩子答题，此刻不能做别的事 —— 先答题才能拿到建塔的阳光，塔卡也是答对的奖励',
    )
  }

  // ⚠️ 这是**类型守卫**，不是运行时检查（`[CR]` 2026-10-14 更正）。
  //   `applyAnswer` 只有 `case 'awaiting-answer'` 一个调用点，而**调用点的收窄不会
  //   传进函数体** —— 不在这里自己收窄，`state.phase` 就还是那个六变体联合，
  //   `state.phase.question` 直接编译不过（`npm run build` 实测）。
  //   此前被当成「恒真的多余判断」删掉过一轮，是错的。
  //
  //   改的是**写法**而非有无：原来那句
  //   `state.phase.kind === 'awaiting-answer' ? state.phase.question : undefined`
  //   再加随后的 `if (question === undefined) throw`，逼出了 `question` 的
  //   `undefined` 中间态，让后面每一次 `question.entryId` 都被读成「可能为 undefined」。
  //   现在直接收窄并解构，下游拿到的就是确定的 `Question`。
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`内部错误：applyAnswer 被 ${state.phase.kind} 阶段调用 —— reduce 的阶段分发被改坏了`)
  }
  const { question } = state.phase
  const correct = isCorrect(question.card, action.optionId)

  // ⚠️ 答错的分支**不做任何事**（AC-4）：阳光不变、塔卡不解锁、不进 mastered。
  // 尤其不能「答错扣阳光」—— 那会让答题与战斗两层耦合，塔防退化成答题罚款，
  // 而这一层的存在意义正是让孩子答错时仍有事可做（照看塔）。
  const next: State = {
    ...state,
    sun: correct ? state.sun + sunPerCorrectFor(state.unitNumber) : state.sun,
    masteredEntryIds: correct ? [...state.masteredEntryIds, question.entryId] : state.masteredEntryIds,
    unlocked: correct ? [...state.unlocked, question.entryId] : state.unlocked,
  }
  return withBuildPhase(next)
}

/**
 * 🔥 **Story 1.18 / AC-E4（裁决 11）：跳过一道正确项词图加载失败的题。**
 *
 * ── 为什么它是「换一道题」而不是「结算这一回合」 ─────────────────────────
 * 跳过时**什么都没发生**：孩子没答题、没有战斗、没有僵尸推进。
 * 若把它做成「结算空回合」，战场上的僵尸会在没有任何交互的情况下被打一次，
 * `turn` 会 +1，而这一回合孩子什么也没做 ⇒ 界面上「我啥也没干僵尸却动了」，
 * 而塔防的全部意义就是「你做的事有后果」。
 * ⇒ 跳过只做三件事：**记一笔跳过**、**换下一道题**、**其余一律不动**。
 *
 * ⚠️ **`turn` 与 `zombies` 一律不动**（守卫 G142 逐项断言）：
 *   僵尸是按回合入场的，而跳过**不是**一个回合 —— 没有发生任何事，
 *   不该有新的敌人出现在场上。
 *
 * ⚠️ **题单被抽空时必须拒绝**（裁决 11 ③）：
 *   `nextQuestion` 返回 `null` 在 `CONTINUE` 里意味着「全部答对 ⇒ 通关」。
 *   跳过若也接到那个 `null` 上，一个字都没答的孩子会看到「读完啦！」——
 *   本项目能造出的最糟的假陈述。
 *   ⇒ 这里 `rejectAction` 抛错；`app/store.ts` 的门面在 dispatch 前先问一遍，
 *     所以正常路径不会有异常冒到界面上（NFR13）。
 */
function applySkip(state: State, action: SkipQuestionAction): State {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`内部错误：applySkip 被 ${state.phase.kind} 阶段调用 —— reduce 的阶段分发被改坏了`)
  }
  const { question } = state.phase
  if (action.entryId !== question.entryId) {
    rejectAction(
      state,
      action,
      `要跳过的是 ${action.entryId}，而当前问的是 ${question.entryId} —— ` +
        '跳过只能作用于当前这一道，否则会有一道好着的题凭空消失，而界面上看不出少了什么',
    )
  }
  // 🔥 1.18 `[DS]` 补的一条：**必须核对破掉的确实是正确项**。
  //   组件不许读 `option.correct`，所以「是不是正确项」只能由 core 判。
  //   ⚠️ 不核对的后果：一张**干扰项**的图 404 也会把整道题跳掉 ——
  //     而干扰项破图时那道题**仍然答得了**（孩子从剩下的选项里选就行），
  //     于是每一张干扰项的 404 都会白扔掉一道好题。
  //   ⚠️ `isCorrect` 在 id 不存在时**抛错**（AC-7），而 id 来自这张卡自己的选项，
  //     所以这里正常路径不会抛；若真抛了，那是组件传错了 id，抛出来是对的。
  if (!isCorrect(question.card, action.optionId)) {
    rejectAction(
      state,
      action,
      `选项 ${action.optionId} 不是当前这道题的正确项 —— 跳过只对「正确项那张图加载失败」成立。` +
        '干扰项破图时这道题仍然答得了（把它跳掉就是白扔一道好题）',
    )
  }
  // ⚠️ 先记跳过**再**取下一题：顺序反了的话 `nextQuestion` 会把当前这道
  //   （它此刻还不在 skipped 里）当成合法候选，返回一道和现在完全相同的题 ——
  //   症状是「跳过了但界面没换题」，而回合日志里明明记了一条 SKIP_QUESTION。
  const skippedEntryIds = [...state.skippedEntryIds, question.entryId]
  const next = nextQuestion(state.deck, state.masteredEntryIds, skippedEntryIds)
  if (next === null) {
    rejectAction(
      state,
      action,
      '题单里已经没有别的题可考了 —— 继续跳过去只会让这一局走进「全部答对 ⇒ 通关」那一支，' +
        '而孩子一个词都没答。这是内容或部署出了问题（正确项词图全部加载失败），' +
        '请先查 public/assets/words/ 是否部署完整、以及 BASE_URL 是否与站点前缀一致',
    )
  }
  return {
    ...state,
    skippedEntryIds,
    phase: { kind: 'awaiting-answer', question: next },
  }
}

// ── awaiting-build ────────────────────────────────────────────────────────

/** 在建造阶段：`PLACE_TOWER`（自环）与 `END_BUILD` 合法。 */
function applyBuild(state: State, action: Action): State {
  switch (action.type) {
    case 'PLACE_TOWER':
      return placeTowerIn(state, action.entryId, action.cell)
    case 'END_BUILD':
      // ⚠️ 只切 phase，**不结算**（自主设计 #3）：`resolving` 是真实的一帧，
      // 战斗动画需要落脚点，effects-runner 也才能拿到前后两份快照。
      return { ...state, phase: { kind: 'resolving' } }
    default:
      return rejectAction(
        state,
        action,
        '建造阶段还没有结束 —— 此时结算会让「塔还没建完就被要求面对僵尸」发生，而 END_BUILD 才是那道闸门',
      )
  }
}

/** 放塔的全部 reducer 侧规则（AC-12）。UI 侧的两步放置 / 高亮 / 射程预览属 Story 1.12。 */
function placeTowerIn(state: State, entryId: string, cell: string): State {
  // ① 只允许种已解锁的塔卡。
  if (!state.unlocked.includes(entryId)) {
    throw new Error(
      `塔卡 ${entryId} 尚未解锁，不能建造 —— 塔卡是答对的奖励。` +
        '放过它等于让孩子开局白嫖所有词，「听懂才建塔」这条激励链会整条消失。',
    )
  }
  // ② 词与塔型一律回查题单（FR23）：action 只带 entryId，不带 towerType/wordId。
  const entry = requireEntry(state.deck, entryId)
  // ③ 格子键必须规范且在网格内。`parseCellKey` 抛错消息已写明为什么非规范键危险。
  const { row, col } = parseCellKey(cell)
  // ③' **房子格（col 0）与僵尸入场格（col 8）不得建塔**（`[CR]` 2026-10-14 补）。
  //   col 8 的危害是**确定的**：僵尸恒在 `col <= ZOMBIE_SPAWN_COL` 入场，而 `inRange`
  //   是单边的（`delta > 0`）⇒ 建在 col 8 的直射塔/减速塔**永远打不到任何东西**。
  //   孩子花 50 阳光买到一个整局不动的塔，无报错、无红测试，症状只是「塔好像不打人」。
  //   col 0 的危害是浪费：僵尸走到 col 0 就已离场，塔在它脚下却从未开过火。
  //   此前 AC-12 只列了三条规则，本 story 据此实现且把这两列记进了 deferred-work；
  //   现在补上，因为「不能建在一格必然无效的位置」不是取舍，是 bug。
  //
  //   📎 **Story 1.12 收口（AC-B2，2026-10-15）**：这两条硬编码现已改成调用
  //   `grid.ts` 的 `buildBlockedReason()`，消息由它给出。这正是 1.10 在
  //   `grid.ts:184-185` 留下的那句话——「若 1.12 真的要动 reducer，应把两条抛错
  //   改成调用本函数并保留各自的消息，而不是各留一份判断」。
  //   改动之前，两份判断读同一批常量但**没有任何东西强制它们继续一致**：
  //   改一处而忘了另一处时，UI 会把一格显示成「可以建」，孩子点下去撞上一条报错，
  //   **界面上没有任何东西指向原因**。收口之后它们在**结构上**就不可能分叉，
  //   而 `tests/core/buildable-cells.test.ts` 的交叉断言继续守着另一侧。
  const positionReason = buildBlockedReason(row, col)
  if (positionReason !== null) {
    throw new Error(positionReason)
  }
  // ④ 该格必须为空（FR30）。
  // ⚠️ 读的是**规范键** `canonicalCell` 而不是调用方传进来的 `cell`
  //   （`[CR]` 2026-10-14）：写入用的是 `cellKey(row, col)`，读若用原始串，
  //   两者仅当 `parseCellKey` 保证规范形时才相等 —— 而那恰恰是周围代码在守的不变量。
  //   一旦 `parseCellKey` 放行某种非规范拼写，④ 会回答「空」，第二座塔就被写进
  //   同一个规范键，FR30 静默失效，错误延后到 `assertGridAndTowers` 的
  //   「格子 X 上有两座塔」才浮现，排查方向被带偏。
  const canonicalCell = cellKey(row, col)
  if (state.grid[canonicalCell] !== undefined) {
    throw new Error(
      `格子 ${cell}（第 ${row + 1} 行第 ${col + 1} 列）已有塔 ${state.grid[canonicalCell]}，不能重叠建造 —— ` +
        'grid 与 towers 会立刻双向不一致，而那座塔永远打不到僵尸，界面上只是一格空白。',
    )
  }
  // ⑤ 阳光必须够（档位 × 塔型的造价，见 balance.ts）。
  const cost = costOf(entry.towerType, state.unitNumber)
  if (state.sun < cost) {
    throw new Error(
      `阳光不足：建 ${entry.towerType} 塔需要 ${cost}，当前只有 ${state.sun}。` +
        '少 1 点都放不下 —— 放宽会让「答对才有钱建塔」这条链形同虚设。',
    )
  }
  // 塔 id 用序号而非随机数：reduce 是纯函数，同串 Action 必须重放出同一局。
  const tower = createTower({
    id: `t${state.towers.length + 1}`,
    towerType: entry.towerType,
    wordId: entry.wordId,
    row,
    col,
  })
  const next: State = {
    ...state,
    sun: state.sun - cost,
    towers: [...state.towers, tower],
    // 刻意**保留**已解锁塔卡（FR33：同一张卡可反复建多株）⇒ unlocked 是数组不是集合。
    grid: { ...state.grid, [canonicalCell]: tower.id },
  }
  return withBuildPhase(next)
}

// ── resolving ─────────────────────────────────────────────────────────────

/** 结算阶段：只有 `RESOLVE_ROUND` 合法。 */
function applyResolve(state: State, action: Action): State {
  if (action.type !== 'RESOLVE_ROUND') {
    rejectAction(
      state,
      action,
      '正在结算本回合，战斗还没算完 —— 中途插入别的动作会让这一回合的塔开火与僵尸推进不在同一份场况上',
    )
  }
  const { zombies, heartsLost } = resolveCombatRound(state.towers, state.zombies)
  // 心数夹到 0：失败**必然**是 hearts === 0，而 assertInvariants 要求 hearts ∈ [0, HEARTS]。
  // 夹取不是「静默修正非法输入」，而是把「本回合掉的心多于剩余心」这个合法情况
  // 归一化到一个有定义的状态。
  const hearts = Math.max(0, state.hearts - heartsLost)

  // ⚠️ AC-11：结算**不清空塔**。塔跨回合持久是 FR82，也是 GDD 那条
  // 「递增阳光不改变失败门槛」的论据 —— 每回合清空的话多出来的阳光什么也买不到。
  return {
    ...state,
    zombies,
    hearts,
    phase: hearts <= 0 ? { kind: 'level-failed' } : { kind: 'round-over' },
  }
}

// ── round-over ────────────────────────────────────────────────────────────

/** 回合结束阶段：只有 `CONTINUE` 合法。 */
function applyContinue(state: State, action: Action): State {
  if (action.type !== 'CONTINUE') {
    rejectAction(
      state,
      action,
      '本回合已经结算完 —— 在结算与推进之间插入别的动作，会让下一题的僵尸在错误的场况里入场',
    )
  }
  // 📎 Story 1.18 / AC-E4：第三参数**必须**传 —— 漏传的话这一回合结束后，
  //   上一轮被跳过的那道题会重新回到题面上（症状：跳了跟没跳一样）。
  //   判据见守卫 G143 的「CONTINUE 之后仍不抽中被跳过的那道题」。
  const question = nextQuestion(state.deck, state.masteredEntryIds, state.skippedEntryIds)
  if (question === null) {
    // 全部答对 ⇒ 通关。判定放在 CONTINUE 而不是 RESOLVE_ROUND：
    // 「这一回合答对了最后一道题」到「这一局通关」之间还隔着结算（孩子要看塔打完僵尸）。
    //
    // ⚠️ **战场在此清空**（AC-11 / spec 转换表 `:431`「战场清空（本 story 只做 reducer 侧）」）。
    // 终态里留着塔会让「通关了但还能改局面」成立：`grid` 与 `towers` 仍然配平，
    // 任何不变量断言都不会报错，而持久化层会把这份局面当成「正在进行中的对局」。
    // `level-failed` 的清空指派给 `RESTART_LEVEL`，这里是它的对称 —— 两个终态都清。
    return {
      ...state,
      towers: [],
      grid: {},
      zombies: [],
      phase: { kind: 'level-complete' },
    }
  }
  const turn = state.turn + 1
  const next: State = {
    ...state,
    turn,
    phase: { kind: 'awaiting-answer', question },
    // AC-6 / 自主设计 #5：回合开始时本题对应的僵尸入场（另一半在建局那一次转换上）。
    zombies: [...state.zombies, spawnZombie(turn)],
  }
  assertInvariants(next)
  return next
}

// ── 重打 ──────────────────────────────────────────────────────────────────

/**
 * 重打本关（只在 `level-failed` 合法）。
 *
 * ⚠️ **题单原样复用**（AC-5）：`deck` 的**内容**不变（条目、顺序、数量都一致），
 * 只清空 `masteredEntryIds`。换题单会让「这一局把这个单元学完」的承诺失效，
 * 而重打本来就是同一单元的再练。
 * ⚠️ 复用的是内容而非**数组引用**：`createInitialState` 会复制一层，
 * 这样题单就不会与调用方共用可变别名（`[CR]` 2026-10-14）。
 *
 * ⚠️ 战场整体清空（FR51）：进度与对局是两套独立持久化，战场每局清空、进度只增不减。
 * 带着上一局的塔重打 = 换个词不换局面，孩子会以为已经学会了。
 *
 * 📎 **Story 1.18 / AC-E4：`skippedEntryIds` 也一并清空** —— 不必在这里显式写，
 *   因为 `restart` 直接复用 `createInitialState`，而那里的初始值就是 `[]`。
 *   ⚠️ 这个「靠别处清空」的性质值得写出来：将来若 `restart` 改成在既有 state 上
 *   打补丁（而不是重建），跳过记录就会**静默地留下来**，孩子重打一遍仍然遇不到
 *   那个词 —— 而此时所有不变量都不会报错（跳过记录本身完全合法）。
 *   守卫 G145 钉住「重打后 `skippedEntryIds` 为空」。
 */
function restart(state: State): State {
  return createInitialState({ unitNumber: state.unitNumber, deck: state.deck })
}

// ── 辅助 ──────────────────────────────────────────────────────────────────

/**
 * 造出回合 r 入场的僵尸。
 *
 * ⚠️ id 用回合号而非随机数 —— 纯函数要求（决策 2）。同时它天然唯一：一只僵尸
 * 一个回合入场，而回合号严格递增。
 */
function spawnZombie(turn: number): Zombie {
  return createZombie({ id: `z${turn}`, col: ZOMBIE_SPAWN_COL, hp: ZOMBIE_HP })
}

/**
 * 切到 `awaiting-build`，并把 State 侧的新值同步进 Phase 镜像（自主设计 #2）。
 *
 * 🔥📎 **1.19 CR（2026-10-18）：现在还要把「刚刚答完的那道题」带进 Phase。**
 *   两个调用点都拿得到它，来源不同：
 *     · `applyAnswer` —— 入参还在 `awaiting-answer`，题面就在 `state.phase` 上；
 *     · `applyBuild`  —— 入参已经是 `awaiting-build`，题面**已经在** `state.phase` 上，
 *       建塔不改题（`PLACE_TOWER` 不推进任何题面），所以直接透传。
 *   ⚠️ **因此这里不需要额外参数** —— 多给一个 `question` 实参反而制造
 *   「调用点传的那份与 phase 上那份可以不一致」的缝，而那种缝测不出来
 *   （两份都合法，`assertInvariants` 全绿，卡面显示的却是另一道题）。
 *   唯一能读到的那一份就是 `state.phase` 上的那份。
 */
function withBuildPhase(state: State): State {
  const question = currentQuestionOf(state.phase)
  // ⚠️ `unlocked` 必须**复制**而不是共用引用（`[CR]` 2026-10-14）。共用时
  //   `phase.unlocked === state.unlocked`，而 `assertPhaseMirror` 是逐元素比对 ——
  //   同一引用让任何就地修改（`.sort()` / `.splice()`）在结构上**不可能**被它发现，
  //   两个本该独立的「事实」会一起被改掉。Story 1.12 的建塔 UI 或 effects-runner
  //   一次就地排序就能同时污染两者，而断言全绿。
  //   `createInitialState` 里的 `grid` / `towers` / `zombies` 都是新分配的，
  //   `unlocked` 是 `State` 里唯一共享的可变数组 —— 现在不再是了。
  return {
    ...state,
    phase: { kind: 'awaiting-build', question, unlocked: [...state.unlocked], sun: state.sun },
  }
}

/**
 * 从一个相位上读出「此刻正在问的那道题」。
 *
 * ⚠️ **只对两个带题面的相位成立**：另外四个（`resolving` / `round-over` /
 *   `level-complete` / `level-failed`）本来就没有题面，读到就是 bug
 *   ⇒ 这里**抛**而不是返回 `undefined`（NFR12 第一层：逻辑层必须 `throw`）。
 *   写成一个返回 `Question | undefined` 的函数会让下游每一次取 `entryId`
 *   都变成「可能为 undefined」，而那种 `undefined` 在渲染期才炸。
 */
function currentQuestionOf(phase: State['phase']): Question {
  if (phase.kind === 'awaiting-answer' || phase.kind === 'awaiting-build') {
    return phase.question
  }
  throw new Error(
    `内部错误：${phase.kind} 阶段没有题面，却被要求取「正在问的那道题」—— ` +
      'withBuildPhase 的调用点被改到了别的相位上。',
  )
}

/** 按 entryId 回查题单条目，查不到即抛错（存档 / 脏数据入口）。 */
function requireEntry(deck: readonly DeckEntry[], entryId: string): DeckEntry {
  const hit = deck.find((entry) => entry.entryId === entryId)
  if (hit === undefined) {
    throw new Error(
      `题单里没有 entryId ${entryId} —— 只可能来自存档或内容 JSON 的脏值。` +
        '放过它会造出一座词与塔型都无从追溯的塔，而战斗数值照常生效，平衡验证全部作废。',
    )
  }
  return hit
}

// ── 不变量（AC-13）────────────────────────────────────────────────────────

/**
 * 状态不变量校验（AC-13）—— 挂在 `reduce` 的出口，覆盖**所有**调用路径。
 *
 * 放在 core/ 而不是组件层（架构 `:572`）：纯逻辑层里的廉价断言天然覆盖每一条路径；
 * 放进组件则每个组件都要重复一遍，且必然有组件漏掉。
 *
 * 「僵尸恒在 ZOMBIE_ROW」**不在本列表**里 —— 它由类型保证（`Zombie` 刻意没有 `row` 字段），
 * 运行期断言守不住一个根本没有的字段。
 */
export function assertInvariants(state: State): State {
  assertGridAndTowers(state)
  assertDeckRelations(state)
  assertPhaseMirror(state)
  assertCounters(state)
  for (const tower of state.towers) {
    // 脏塔型只在存档 / 内容 JSON 里可能出现；放过它会让伤害查表炸在很远的地方。
    assertTowerType(tower.towerType)
    const owner = state.grid[cellKey(tower.row, tower.col)]
    if (owner !== tower.id) {
      throw new Error(
        `塔 ${tower.id} 占了 (${tower.row},${tower.col})，但 grid 里该格的归属是 ${String(owner)} —— ` +
          'grid 与 towers 双向不一致时，「格子是否被占」与「这座塔在哪」会给出两个答案，塔就永远打不到僵尸。',
      )
    }
  }
  for (const zombie of state.zombies) {
    assertZombieCol(zombie.col)
    assertZombieHp(zombie.hp)
    assertSlowTurns(zombie.slowTurnsLeft)
  }
  assertEntityIdsUnique(state)
  return state
}

/** `grid` 与 `towers` 双向一致，且没有两座塔占同一格。 */
function assertGridAndTowers(state: State): void {
  const seen = new Set<string>()
  for (const key of Object.keys(state.grid)) {
    const towerId = state.grid[key]
    const tower = state.towers.find((t) => t.id === towerId)
    if (tower === undefined) {
      throw new Error(
        `grid 里的格子 ${key} 指向塔 ${towerId}，但 towers 里没有它 —— 无主的格子键会让「这格被占了吗」永远为真，` +
          '界面上表现为塔凭空消失，且没有任何报错指向它。',
      )
    }
    const towerKey = cellKey(tower.row, tower.col)
    if (towerKey !== key) {
      throw new Error(`grid 的键 ${key} 与塔 ${towerId} 的位置 ${towerKey} 不一致 —— 同一座塔有两个位置，存档会还原出哪一个无从判断`)
    }
    if (seen.has(towerKey)) {
      throw new Error(`格子 ${towerKey} 上有两座塔 —— 重叠建造会让两座塔互相顶替，永远只有一座能开火`)
    }
    seen.add(towerKey)
  }
  if (seen.size !== state.towers.length) {
    throw new Error(
      `towers 有 ${state.towers.length} 座，grid 只索引了 ${seen.size} 座 —— 有一座塔不在格子索引里，` +
        '「这格空吗」会回答「空」，于是孩子可以在同一格上再建一座。',
    )
  }
}

/** `unlocked` / `masteredEntryIds` 都必须是题单的子集，且 unlocked ⊆ mastered。 */
function assertDeckRelations(state: State): void {
  const entryIds = new Set(state.deck.map((entry) => entry.entryId))
  // ⚠️ 题单自身的 entryId 必须唯一（`[CR]` 2026-10-14 补）。两条 entry 共用一个 id 时，
  //   `nextQuestion` 按 id 过滤 ⇒ 那个词**永远不会被考、永远解锁不了**，
  //   而本函数其余全部断言一路绿灯，症状只是「某个词怎么都不考」，
  //   且没有任何东西指向出问题的那个内容文件。
  if (entryIds.size !== state.deck.length) {
    throw new Error(
      `题单有 ${state.deck.length} 条但只有 ${entryIds.size} 个不同 entryId —— ` +
        '同一 entryId 出现多次会让其中一条永远抽不中（nextQuestion 按 id 过滤），' +
        '那个词会静默地既不被考也不被解锁。',
    )
  }
  for (const id of state.unlocked) {
    if (!entryIds.has(id)) {
      throw new Error(`unlocked 含题单之外的 entryId ${id} —— 题单外的塔卡会让「解锁」的含义失去来源`)
    }
    if (!state.masteredEntryIds.includes(id)) {
      throw new Error(
        `塔卡 ${id} 已解锁却未答对 —— 解锁的唯一途径是答对，绕过它等于跳过学习。` +
          '⚠️ 注意：AC-13 只要求 unlocked ⊆ deck，这条更强的「unlocked ⊆ mastered」是本实现额外加的，' +
          '它同时是对任何存档 / 内容 JSON 的硬失败 —— 见 Dev Agent Record 的 deviation 清单。',
      )
    }
  }
  for (const id of state.masteredEntryIds) {
    if (!entryIds.has(id)) {
      throw new Error(`masteredEntryIds 含题单之外的 entryId ${id} —— 存档与题单已失配，重考时会去找一个不存在的题`)
    }
  }
  // 📎 Story 1.18 / AC-E4：`skippedEntryIds` 的两条不变量。
  // ⚠️ **越界的 id 为什么必须在唯一出口挡掉**：它不匹配任何题单条目 ⇒
  //   在 `nextQuestion` 的排除集合里**毫无效果**（过滤是按 id 比对题单条目的），
  //   而孩子面对的仍是一道答不了的题。症状是「跳过了但那张图还是不出来」，
  //   且没有任何东西指向存档里那个多出来的 id。
  //   存档来自旧内容版本、题单被回滚时，这真的会发生。
  for (const id of state.skippedEntryIds) {
    if (!entryIds.has(id)) {
      throw new Error(
        `skippedEntryIds 含题单之外的 entryId ${id} —— ` +
          '它在 nextQuestion 的排除集合里匹配不到任何题单条目，等于什么都没排除，' +
          '孩子仍会面对那道答不了的题（存档与题单已失配）。',
      )
    }
    if (state.masteredEntryIds.includes(id)) {
      throw new Error(
        `skippedEntryIds 与 masteredEntryIds 同时含 ${id} —— ` +
          '同一个词既「没学会所以跳过」又「已答对」，两条路径各自声称它不用再考，' +
          '这个词到底学会没有已经无法判断。',
      )
    }
  }
  // 正在问的题必须还没答对：否则那道题一挂上去就等于「刚学会又考一遍」。
  if (state.phase.kind === 'awaiting-answer' && state.masteredEntryIds.includes(state.phase.question.entryId)) {
    throw new Error(
      `正在考 ${state.phase.question.entryId}，而它已在 masteredEntryIds 里 —— ` +
        '已答对的题不该再出现，否则孩子刚学会的词会被反复重考',
    )
  }
  // 同理：正在问的题不能是**被跳过**的那一道。
  // ⚠️ 这条不是「重复考已会的词」那么温和：它意味着跳过压根没生效，
  //   孩子会一直对着四个选项点不动的那张图。
  if (state.phase.kind === 'awaiting-answer' && state.skippedEntryIds.includes(state.phase.question.entryId)) {
    throw new Error(
      `正在考 ${state.phase.question.entryId}，而它在 skippedEntryIds 里 —— ` +
        '被跳过的题不该再挂上来，否则「跳过」这个动作等于什么都没做',
    )
  }
}

/** `awaiting-build` 上的 unlocked / sun 是 State 的只读镜像，必须恒等（自主设计 #2）。 */
function assertPhaseMirror(state: State): void {
  // ⚠️📎 **1.19 CR：先取成局部 `const` 再收窄。**
  //   判据体里有 `state.deck.some((entry) => … state.phase.question …)` ——
  //   TypeScript 对**属性访问**的收窄在**回调体内作废**（它假定回调执行时
  //   `state.phase` 可能已被换掉），于是 `state.phase.question` 会报
  //   TS2339「question 不存在于 Phase」（联合里另外四个变体没有它）。
  //   换成局部 `const` 之后收窄**跟着 const 进闭包**，回调里也能读。
  //   ⚠️ 这不是「为了让类型过而加的一行」——它同时让断言体读起来是同一份 `phase`，
  //   而不是三处各写一遍 `state.phase`（那三处本来就该是同一个事实）。
  const phase = state.phase
  if (phase.kind !== 'awaiting-build') {
    return
  }
  // 🔥📎 **1.19 CR 新增：`question` 必须是本题单里的某一条。**
  //   ⚠️ **它为什么进 `assertPhaseMirror` 而不是新开一个断言函数**：这一组断言的
  //   职责就是「`awaiting-build` 上 Phase 携带的东西是不是真的」——
  //   `unlocked` / `sun` 比的是「与 State 侧是否一致」，`question` 没有 State 侧
  //   对应物可比，但同样是「Phase 上这份东西可不可信」。开第二个函数会让
  //   「建造期相位带了三样东西，其中两样有人查」这种半吊子状态成立。
  //
  //   ⚠️ **不变量写的是「属于 deck」而不是「等于 deck[0]」**：建造期显示的那道题
  //   是**孩子刚答的那一道**，AC-4 的重考机制下它完全可能是 deck 的任何一条。
  //   写死 `deck[0]` 会让「连错 3 题」这种正常路径当场红，而红的原因与 bug 无关。
  //
  //   ⚠️ **它挡的是哪一种坏**：存档来自旧版本（`question` 字段压根不存在）
  //   或内容回滚（题单里已经没有这道题）时，卡面会渲染一道
  //   **「点哪里都不对」的题**——`pickedRight` 恒 false，而界面看不出任何异常。
  if (!state.deck.some((entry) => entry.entryId === phase.question.entryId)) {
    throw new Error(
      `建造期携带的题面 ${phase.question.entryId} 不在本题单里 —— 题单只有 ` +
        `${state.deck.length} 条。旧存档（尚无该字段）与内容回滚是仅有的两个来源；` +
        '放过它的话卡面会渲染一道答不对的题，而界面上没有任何东西指向原因。',
    )
  }
  if (phase.unlocked.length !== state.unlocked.length || phase.unlocked.some((id, i) => id !== state.unlocked[i])) {
    throw new Error(
      'Phase 上的 unlocked 与 State 不一致 —— 镜像过期会让组件读到上一次的值。' +
        '唯一可写事实源是 State；Phase 上的那份只为满足架构 `:846-847` 的字面形状。',
    )
  }
  if (phase.sun !== state.sun) {
    throw new Error(
      `Phase 上的 sun（${phase.sun}）与 State（${state.sun}）不一致 —— ` +
        '镜像过期会让建造界面显示答题前的余额，孩子会以为点不动是游戏坏了。',
    )
  }
}

/** 心数 / 阳光 / 回合号的取值域。 */
function assertCounters(state: State): void {
  if (!Number.isInteger(state.hearts) || state.hearts < 0 || state.hearts > HEARTS) {
    throw new Error(`心数必须落在 [0, ${HEARTS}]，收到 ${state.hearts} —— 心数越界会让「耗尽即失败」永远不触发或立刻触发`)
  }
  if (!Number.isInteger(state.sun) || state.sun < 0) {
    throw new Error(`阳光必须是非负整数，收到 ${state.sun} —— 负阳光会让「阳光够才建塔」这条判定被绕过`)
  }
  if (!Number.isInteger(state.turn) || state.turn < 1) {
    throw new Error(`回合号必须是 >= 1 的整数，收到 ${state.turn} —— 回合号同时是僵尸 id 的一部分（z<turn>），不是整数会让 id 撞名`)
  }
}

/** 塔与僵尸的 id 各自唯一（僵尸 id 还是回合号的函数，重放的锚点）。 */
function assertEntityIdsUnique(state: State): void {
  assertUnique(
    state.towers.map((t) => t.id),
    '塔',
  )
  assertUnique(
    state.zombies.map((z) => z.id),
    '僵尸',
  )
}

function assertUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`${label} id ${id} 重复 —— 目标选择的同列 tie-break 依赖 id 可比较，重名会让结算结果无法复现`)
    }
    seen.add(id)
  }
}
