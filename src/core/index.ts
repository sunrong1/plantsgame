/**
 * core/ 的唯一对外出口（barrel，AR5）。
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
  assertInsideGrid,
  cellKey,
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
  ZOMBIE_HP,
  ZOMBIE_MOVE_PER_ROUND,
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
} from './types.js'

export type { CreateTowerInput, CreateZombieInput, Tower, TowerType, Zombie } from './types.js'