/**
 * core/ 的唯一对外出口（barrel，AR5）。
 *
 * 📎 业务逻辑自 **Story 1.4** 起填入（此前本文件是防 TS18003 的占位 `export {}`，
 * 旧注释「业务逻辑属 Story 1.3」的编号是错的，该句已随 barrel 化重写 ——
 * [CR] P14 补上这个锚点，避免「已改 1.4」的验收记录无处落地）。
 *
 * 边界（由工具链强制，不是靠自觉）：
 *   - 本层零 DOM —— tsconfig.core.json 的 lib 不含 DOM，写 window 即编译报错
 *   - 本层零 Vue —— ESLint no-restricted-imports 禁止 import 'vue'
 *   - 本层不得向上 import app/ services/ components/
 *
 * ⚠️ 纯类型必须用 `export type` 重导出 —— tsconfig.core.json 开了
 * `verbatimModuleSyntax: true`，值语法重导出类型会在编译期报错
 * （也正是它保证 `import type` 的类型导入被真正擦除）。
 *
 * 下游一律从 `'../core'`（或 `src/core`）导入，不要深路径 import 单个模块 ——
 * 否则模块间的依赖关系会漏出对外出口，改内部结构时波及调用方。
 *
 * 📎 本文件必须始终**存在**（哪怕导出为空）：tsconfig.core.json 的 include
 * 若命中 0 个文件，`vue-tsc -b` 会报 TS18003: No inputs were found。
 *
 * @see tests/scaffold/core-boundary.test.ts —— 那两条边界有回归测试守卫
 */

export {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  // ⚠️ assertGridIndex 住在 grid.ts（[CR] P17 收口后全层唯一的整数校验器），
  // 此前 types.ts 定义了它而 barrel 漏导出 —— 「唯一对外出口」不完整（[CR] P19）。
  assertGridIndex,
  assertInsideGrid,
  // 📎 Story 1.10 / AC-12：「这一格能不能建」的唯一出处。组件只调不算，
  //   否则 UI 显示的可建性会与 reducer 实际接受的分叉且无人察觉。
  buildBlockedReason,
  canBuildAt,
  cellKey,
  hasPassedHouse,
  hasReachedHouse,
  isInsideGrid,
  parseCellKey,
} from './grid.js'

export {
  BALANCE_TIERS,
  HEARTS,
  SLOW_FACTOR,
  SLOW_TURNS,
  TOWER_STATS,
  TOWER_TYPES,
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
  assertTowerType,
  costOf,
  damageFor,
  damageOf,
  initialSunFor,
  rangeFor,
  rangeOf,
  sunPerCorrectFor,
  tierForUnit,
} from './balance.js'

export type { BalanceTier, TowerStats } from './balance.js'

export {
  aoeColumns,
  aoeTargets,
  applyDamage,
  applySlow,
  inRange,
  isInAoe,
  selectTarget,
  stepZombie,
} from './combat.js'

export {
  assertNonEmptyId,
  assertSlowTurns,
  assertZombieCol,
  assertZombieHp,
  createTower,
  createZombie,
  // 📎 Story 1.10 / AC-9：血量条的**唯一**算术出处。见 types.ts 的函数注释 ——
  //   它的存在是为了让组件里不出现 `z.hp / 100`，漂移风险标为「最高」。
  zombieHpRatio,
} from './types.js'

export type {
  Action,
  AnswerAction,
  Card,
  ContinueAction,
  CreateTowerInput,
  CreateZombieInput,
  DeckEntry,
  EndBuildAction,
  ImageOption,
  Option,
  OptionId,
  Phase,
  PlaceTowerAction,
  Question,
  ResolveRoundAction,
  RestartLevelAction,
  State,
  TextOption,
  Tower,
  TowerType,
  Zombie,
} from './types.js'

export { isCorrect } from './types.js'

// 📎 回合结算编排（Story 1.5 / AC-7）。`turn.ts` 刻意不 import `reducer.ts`：单向依赖。
export { resolveCombatRound } from './turn.js'

export type { ResolveRoundResult } from './turn.js'

// 📎 回合层（Story 1.5）：构造器与判别式辅助函数。`Action` 联合本身在 types.ts。
export { actionName, answer, continueRound, endBuild, placeTower, resolveRound, restartLevel } from './actions.js'

// 📎 回合状态机（Story 1.5 / AC-1…AC-13）。唯一的状态变更点（决策 2）。
export { assertInvariants, createInitialState, nextQuestion, reduce } from './reducer.js'

export type { CreateInitialStateInput } from './reducer.js'

// 📎 建造判据（Story 1.12 / AC-B1）。架构硬约束 2 的落点：组件关于
//   「能不能放 / 会打到哪里 / 多少钱 / 手上有几张卡」的问题**只能**问这三个函数，
//   组件里出现第二份判断即为架构漂移。
export { coverCellsAt, handCards, placementBlockedReason } from './build.js'

export type { HandCard } from './build.js'

// 📎 词图加载失败时的内联占位图形（Story 1.11 / AC-B3）。**字符串常量，不造 DOM** ——
//   规格要求它「随 core/ 提供」是因为本层同时满足零 DOM 与不引入副作用事实两条约束。
//   下游一律从这里取，不要深路径 import `core/placeholder`。
export { WORD_IMAGE_PLACEHOLDER_SVG } from './placeholder.js'

// 📎 HUD 判据（Story 1.13 / AC-B1..AC-B7）。架构硬约束「组件只读 `state`，不得自行计算」
//   的落点：关于「掉了几颗心 / 哪几位是心 / 跨局掌握到哪了」的问题**只能**问这里，
//   组件里出现第二份判断即为架构漂移（守卫 G50a..G50d 会红）。
//   ⚠️ 掉心动画与将来的掉心音效**必须**共用 `lostSlotIndexes`，
//   否则画面与声音会各算各的，在一次掉 2 心时对不上。
export {
  advanceProgress,
  advanceUnit,
  heartSlots,
  heartsLostBetween,
  lostSlotIndexes,
  progressDisplay,
} from './hud.js'

export type { Progress, ProgressDisplay } from './hud.js'

// 📎 副作用判据（Story 1.14 / AC-B1）。架构硬约束 4「副作用只走 effects-runner」
//   的落点：关于「这次 dispatch 该播什么声音」的问题**只能**问 `runEffects`，
//   `app/effects-runner.ts` 按它返回的**顺序**逐条执行（AC-C5）。
//   ⚠️ 类型重导出必须 `export type`（`verbatimModuleSyntax`，见本文件头）。
export { assertNeverEffect, effectKindName, runEffects } from './effects.js'

export type { Effect, SfxCue } from './effects.js'
