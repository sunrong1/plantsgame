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
import { ZOMBIE_SPAWN_COL, cellKey, parseCellKey } from './grid.js'
import { resolveCombatRound } from './turn.js'
import {
  assertSlowTurns,
  assertZombieCol,
  assertZombieHp,
  createTower,
  createZombie,
  isCorrect,
} from './types.js'
import type { Action, DeckEntry, State, Zombie } from './types.js'

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
    deck: input.deck,
    masteredEntryIds: [],
    unlocked: [],
  }
  // AC-6 / 自主设计 #5：僵尸入场发生在「回合开始」，而 Phase 联合没有 round-start 变体，
  // 所以它必须落在建局这一次转换上（另一半落在 round-over --CONTINUE-->）。
  const withZombie = { ...state, zombies: [...state.zombies, spawnZombie(1)] }
  assertInvariants(withZombie)
  return withZombie
}

/**
 * 取下一个该考的问题：题单里第一个尚未答对的条目。
 *
 * 全部答对时返回 `null`（由调用方转 `level-complete`）—— 不返回「随便挑一个」，
 * 因为那会让孩子已经学会的词又被考一遍，而界面上看不出任何异常。
 *
 * 答错的题**仍在题单里、仍未 mastered**，所以它会被再次选中（AC-4/AC-5 的重考）。
 */
export function nextQuestion(deck: readonly DeckEntry[], masteredEntryIds: readonly string[]): DeckEntry | null {
  for (const entry of deck) {
    if (!masteredEntryIds.includes(entry.entryId)) {
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
  const question = state.phase.kind === 'awaiting-answer' ? state.phase.question : undefined
  if (question === undefined) {
    // 类型系统已经保证这里必在 awaiting-answer；写不出就意味着上一行的收窄被改坏了。
    throw new Error('内部错误：applyAnswer 被非 awaiting-answer 阶段调用')
  }
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
  // ④ 该格必须为空（FR30）。
  if (state.grid[cell] !== undefined) {
    throw new Error(
      `格子 ${cell}（第 ${row + 1} 行第 ${col + 1} 列）已有塔 ${state.grid[cell]}，不能重叠建造 —— ` +
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
    grid: { ...state.grid, [cellKey(row, col)]: tower.id },
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
  const question = nextQuestion(state.deck, state.masteredEntryIds)
  if (question === null) {
    // 全部答对 ⇒ 通关。判定放在 CONTINUE 而不是 RESOLVE_ROUND：
    // 「这一回合答对了最后一道题」到「这一局通关」之间还隔着结算（孩子要看塔打完僵尸）。
    return { ...state, phase: { kind: 'level-complete' } }
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
 * ⚠️ **题单原样复用**（AC-5）：`deck` 引用不变，只清空 `masteredEntryIds`。
 * 换题单会让「这一局把这个单元学完」的承诺失效，而重打本来就是同一单元的再练。
 *
 * ⚠️ 战场整体清空（FR51）：进度与对局是两套独立持久化，战场每局清空、进度只增不减。
 * 带着上一局的塔重打 = 换个词不换局面，孩子会以为已经学会了。
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

/** 切到 `awaiting-build`，并把 State 侧的新值同步进 Phase 镜像（自主设计 #2）。 */
function withBuildPhase(state: State): State {
  return { ...state, phase: { kind: 'awaiting-build', unlocked: state.unlocked, sun: state.sun } }
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
  for (const id of state.unlocked) {
    if (!entryIds.has(id)) {
      throw new Error(`unlocked 含题单之外的 entryId ${id} —— 题单外的塔卡会让「解锁」的含义失去来源`)
    }
    if (!state.masteredEntryIds.includes(id)) {
      throw new Error(`塔卡 ${id} 已解锁却未答对 —— 解锁的唯一途径是答对，绕过它等于跳过学习`)
    }
  }
  for (const id of state.masteredEntryIds) {
    if (!entryIds.has(id)) {
      throw new Error(`masteredEntryIds 含题单之外的 entryId ${id} —— 存档与题单已失配，重考时会去找一个不存在的题`)
    }
  }
  // 正在问的题必须还没答对：否则那道题一挂上去就等于「刚学会又考一遍」。
  if (state.phase.kind === 'awaiting-answer' && state.masteredEntryIds.includes(state.phase.question.entryId)) {
    throw new Error(
      `正在考 ${state.phase.question.entryId}，而它已在 masteredEntryIds 里 —— ` +
        '已答对的题不该再出现，否则孩子刚学会的词会被反复重考',
    )
  }
}

/** `awaiting-build` 上的 unlocked / sun 是 State 的只读镜像，必须恒等（自主设计 #2）。 */
function assertPhaseMirror(state: State): void {
  if (state.phase.kind !== 'awaiting-build') {
    return
  }
  if (state.phase.unlocked.length !== state.unlocked.length || state.phase.unlocked.some((id, i) => id !== state.unlocked[i])) {
    throw new Error(
      'Phase 上的 unlocked 与 State 不一致 —— 镜像过期会让组件读到上一次的值。' +
        '唯一可写事实源是 State；Phase 上的那份只为满足架构 `:846-847` 的字面形状。',
    )
  }
  if (state.phase.sun !== state.sun) {
    throw new Error(
      `Phase 上的 sun（${state.phase.sun}）与 State（${state.sun}）不一致 —— ` +
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
