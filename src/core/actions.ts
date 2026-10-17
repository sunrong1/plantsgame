/**
 * Action 构造器（Story 1.5 / AC-1、AC-2，架构 `:714`）。
 *
 * ── 本文件的职责边界 ──────────────────────────────────────────────────────
 * 架构 `:714` 把「`Action` 的 `type` 字面量不漂移」划给本模块。字面量联合在编译期
 * 拦不住拼写漂移：写 `'END_BULID'` 不会报错（联合里还有别的成员），只会在
 * reducer 的阶段转换表里多出一个永远匹配不到的分支 —— 状态机从此少一条边，
 * 而**全部测试仍然绿**。所以每个 action 的诞生必须经过本文件，
 * 收敛成六行可被穷尽检查的代码。
 *
 * ── 为什么只有构造器，没有别的东西 ────────────────────────────────────────
 * 本模块**不做**合法性判断（那是 `reducer.ts` 的阶段转换表，按阶段拒绝非法 action），
* 也不做载荷规范化。构造器只保证一件事：产出的对象是该 action 的规范形态。
 * 理由：构造器若开始校验，组件就会有两套入口（自己造对象 / 走构造器），
 * 而 reducer 只能守住走它的那一套 —— 组件自己造的字面量漂移恰好是本文件要防的东西。
 *
 * ⚠️ **`Action` 联合定义住在 `types.ts`**（子任务 1.2 的字面），本文件只导构造器。
 * 单向依赖：本文件 → types.ts，反向不依赖 ⇒ reducer 可以分别从两处取类型与构造器，
 * 不产生循环。
 */

import type {
  Action,
  AnswerAction,
  ContinueAction,
  EndBuildAction,
  OptionId,
  PlaceTowerAction,
  ResolveRoundAction,
  RestartLevelAction,
  SkipQuestionAction,
} from './types.js'

/** 答题（子任务 2.1）。 */
export function answer(optionId: OptionId): AnswerAction {
  return { type: 'ANSWER', optionId }
}

/**
 * 放塔（架构 `:578` 给定的**唯一**既定名字，**不得改名**）。
 *
 * `cell` 是 `cellKey(row, col)` 字符串（架构 `:579` 的示例即 `state.grid[action.cell]`）——
 * 传坐标对象会绕过 grid.ts 的格子键规范化，与存档里的键形态失配。
 * `entryId` 而非 `towerType` + `wordId`：塔的一切由题单条目决定（FR23），
 * 让组件自己挑塔型就是让它能造出「词与塔型错配」的塔。
 */
export function placeTower(entryId: string, cell: string): PlaceTowerAction {
  return { type: 'PLACE_TOWER', entryId, cell }
}

/** 结束建造阶段 —— 只切 phase 到 `resolving`，**不结算**（自主设计 #3：`resolving` 是真实一帧）。 */
export function endBuild(): EndBuildAction {
  return { type: 'END_BUILD' }
}

/** 执行本回合结算（攻击 → 推进 → 抵达丢心 → 判胜负）。只在 `resolving` 阶段合法。 */
export function resolveRound(): ResolveRoundAction {
  return { type: 'RESOLVE_ROUND' }
}

/** 回合结算后推进到下一回合。只在 `round-over` 阶段合法。 */
export function continueRound(): ContinueAction {
  return { type: 'CONTINUE' }
}

/**
 * 重打本关。只在 `level-failed` 阶段合法（阶段转换表逐字）。
 *
 * **刻意不带任何载荷**：重置值（hearts / sun / mastered / 战场）一律由
 * `reduce` 依据 `state.deck` 与 `state.unitNumber` 重算。构造器若带载荷，
 * 就会出现第二个可写的重置来源，而「题单一局内固定、重打原样复用」（AC-5）
 * 恰恰要求 deck 不可能被 action 换掉。
 */
export function restartLevel(): RestartLevelAction {
  return { type: 'RESTART_LEVEL' }
}

/**
 * 🔥 **Story 1.18 / AC-E4（裁决 11）：跳过一道正确项词图加载失败的题。**
 *
 * ⚠️ **`entryId` 是必填**：reducer 拿它与「当前题」比对，
 *   而载荷缺了它就会出现「界面想跳 A、core 跳了 B」—— 一道好着的题凭空消失。
 *
 * ⚠️ **`optionId` 同样必填**（理由逐字写在 `types.ts` 的 `SkipQuestionAction` 上）：
 *   组件**不许**读 `option.correct`（守卫 `quiz-card.test.ts` 逐字禁止），
 *   所以「破的是不是正确项」这件事只有一条路可走：载荷告诉 core，
 *   由 core 用 `isCorrect` 核对。
 *   本构造器**不**做核对 —— 构造器一旦开始判断，组件就有了两套入口。
 *
 * ⚠️ 本构造器**不做**「还有没有下一题」的判断：那是 `reducer` 的职责
 *   （它在唯一出口 `assertInvariants` 之前就该拒绝掉那条会让关卡变成
 *   「没答却通关」的动作）。构造器若开始判断，组件就有了两套入口。
 */
export function skipQuestion(entryId: string, optionId: OptionId): SkipQuestionAction {
  return { type: 'SKIP_QUESTION', entryId, optionId }
}

/**
 * action 的日志名 —— 回合日志 `[core] turn N action=<T> ...` 的取值处（架构 `:620-628`）。
 *
 * ⚠️ **返回联合外的 `type` 时抛错，不返回 `'unknown'`**：脏 type 只能来自存档或
 * 调试回放，而「对局日志里出现一条无法归因的记录」恰恰是排查时最需要看清的那条 ——
 * 把它渲染成 `unknown` 等于在最需要它的时刻把它抹掉。
 *
 * ⚠️ 为什么用 `switch` + `assertNever` 而不是查表：`switch` 在联合新增成员时
 * **编译期报错**，查表不会。少一个分支的后果是日志里某类动作静默消失。
 */
export function actionName(action: Action): string {
  switch (action.type) {
    case 'ANSWER':
      return 'ANSWER'
    case 'PLACE_TOWER':
      return 'PLACE_TOWER'
    case 'END_BUILD':
      return 'END_BUILD'
    case 'RESOLVE_ROUND':
      return 'RESOLVE_ROUND'
    case 'CONTINUE':
      return 'CONTINUE'
    case 'RESTART_LEVEL':
      return 'RESTART_LEVEL'
    case 'SKIP_QUESTION':
      // 📎 Story 1.18：跳过也要有名字 —— 真机上「为什么这道题没被考」是
      //   最难自查的一类问题，而回合日志是唯一的线索来源。
      return 'SKIP_QUESTION'
    default:
      return assertNeverAction(action)
  }
}

/**
 * 穷尽检查：`action` 走到这里意味着联合新增了成员而本文件的 switch 没跟上。
 *
 * 返回 `never`（而不是抛错）让调用方的返回类型仍是 `string`，
 * 同时把「漏分支」变成编译期错误 —— 漏分支时 `action` 收窄为 `never`，
 * 下面的模板字符串类型检查失败。
 */
function assertNeverAction(action: never): never {
  throw new Error(
    `未知的 Action type：${JSON.stringify((action as { type?: unknown }).type)}。` +
      '联合新增了成员而 actionName 的 switch 没跟上 —— 回合日志会少记这类动作。',
  )
}
