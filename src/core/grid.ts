/**
 * 网格规格与坐标换算（Story 1.4 / AC-2）。
 *
 * 本文件是网格尺寸的**唯一**定义处（架构 `:637`）。组件不得重定义 `ROWS` / `COLS` /
 * `ZOMBIE_ROW` —— Story 1.10 的 CSS 网格读的是这里的常量。
 *
 * ── 索引基准（裁决 3，2026-10-13 用户拍板）─────────────────────────────────
 * 内部**一律 0-based**。只有 0-based 能同时满足 GDD 的两句话：
 *   · `gdd.md:238` 命中发生在「第 6、4 列」   ⇒ 轨迹 8→6→4→2→0 中确有索引 6 与 4
 *   · `gdd.md:243` 从「第 9 列」入场、走到「第 1 列」的房子
 * 1-based 下轨迹是 9→7→5→3→1，**永远不经过第 6、4 列**，断言 1 立即塌成 1 次命中。
 *
 * ⇒ 凡对用户可见的「第 N 列」，在代码与测试注释里一律双写：`col 3（界面「第 4 列」）`。
 *
 * 本文件零依赖（只 assert 整数），是被依赖最深的一层。
 */

/** 行数。架构 `:493-496` 逐字锚点。 */
export const ROWS = 5
/** 列数。架构 `:493-496` 逐字锚点。 */
export const COLS = 9
/** 僵尸所在行索引（= 界面「第 3 行」）。架构 `:493-496` 逐字锚点。 */
export const ZOMBIE_ROW = 2

/** 僵尸入场列索引 8 = 界面「第 9 列」（裁决 3）。 */
export const ZOMBIE_SPAWN_COL = 8
/** 房子所在列索引 0 = 界面「第 1 列」（裁决 3）。 */
export const HOUSE_COL = 0

/** 坐标必须是整数，否则抛错（AC-7：逻辑层只 throw，不静默夹取）。 */
function assertIndex(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数，收到 ${value}（坐标不夹取，非法输入直接抛）`)
  }
}

/** 坐标是否落在网格内。非整数一律 false —— 它不是合法坐标，不是「越界」那种合法坐标。 */
export function isInsideGrid(row: number, col: number): boolean {
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < ROWS && col >= 0 && col < COLS
}

/**
 * 坐标合法性校验，越界或非整数一律抛错（AC-2 / AC-7）。
 *
 * 为什么必须抛而不是返回 false 让人自己处理：调用方（建造流程、Story 1.5 的 reducer）
 * 漏判一个 false 的返回值，塔就会被静默地建在网格外 —— 而它永远打不到僵尸，
 * 没有任何报错指向它。
 */
export function assertInsideGrid(row: number, col: number): void {
  assertIndex(row, 'row')
  assertIndex(col, 'col')
  if (row < 0 || row >= ROWS) {
    throw new Error(`row ${row} 越界（合法范围 0 ~ ${ROWS - 1}）`)
  }
  if (col < 0 || col >= COLS) {
    throw new Error(`col ${col} 越界（合法范围 0 ~ ${COLS - 1}）`)
  }
}

/**
 * 格子 → 键。
 *
 * 键格式自定（本 story 的选择是 `"行,列"`，如 `"2,4"`），只要求**往返无损**。
 * 存在的理由：战场实体在 Store 里要按格子索引，而坐标换算是纯逻辑层的职责，
 * 组件与 Story 1.10 的渲染都要复用同一套键。
 *
 * ⚠️ 刻意不加 `0x` 之类前缀 —— 一旦将来需要序列化进存档（决策 5），
 * 键格式变更会作废全部存档。当前无存档依赖，格式选择以可读性优先。
 */
export function cellKey(row: number, col: number): string {
  assertInsideGrid(row, col)
  return `${row},${col}`
}

/**
 * 格子键的**唯一合法形态**。
 *
 * ⚠️ 为什么用正则而不是 `key.split(',')` + `Number()`：
 * `Number()` 会静默接受一串脏输入 —— `Number('')` 是 0、`Number(' 2')` 是 2、
 * `Number('0x2')` 是 2、`Number('2\n')` 是 2。每一项都会把一个**非法键**
 * 悄悄解析成一个**看起来合法的格子**，而调用方拿到的正是「塔的位置」。
 * 存档或 URL 里混进一个空格，塔就会无声地挪到别处 —— 这类 bug 极难溯源。
 */
const CELL_KEY_PATTERN = /^-?\d+,-?\d+$/

/**
 * 键 → 格子。往返无损：`parseCellKey(cellKey(r, c))` 恒等于 `{ row: r, col: c }`。
 *
 * 非法键抛错（AC-7）。静默返回 `null` 会让 Story 1.5 的 Store 索引把非法键
 * 当成「空格」，于是一次键格式不匹配就表现为「塔消失了」。
 */
export function parseCellKey(key: string): { row: number; col: number } {
  if (typeof key !== 'string' || !CELL_KEY_PATTERN.test(key)) {
    throw new Error(`格子键格式必须是 "行,列"（两侧均为十进制整数），收到 ${JSON.stringify(key)}`)
  }
  const [rowText, colText] = key.split(',') as [string, string]
  const row = Number(rowText)
  const col = Number(colText)
  // 正则已挡住非整数，剩下的只有「越界」这一种非法性 —— 由 assertInsideGrid 抛。
  assertInsideGrid(row, col)
  return { row, col }
}

/**
 * 僵尸是否已抵达房子。
 *
 * ⚠️ 判据是 `col < HOUSE_COL`（即 `col < 0`），**不是** `col < 1`。
 * 后者是 `balance-scan.py` 的 `nxt < 1`，混用了 1-based 的房子判定（裁决 3）。
 * `HOUSE_COL` 是索引 0，所以「走进房子」与「已经走过房子」是两件事，
 * 本函数回答的是后者。
 *
 * 📎 **接手 Story 1.5 必读的口径分界**：
 * 僵尸从入场列 8 以 2 格/回合前进，`8→6→4→2→0` 落在第 4 回合 —— 那一回合结束时
 * 僵尸**正站在** col 0（房子格上），`hasReachedHouse(0)` 是 false。
 * 因此「踏上房子格」与「越过房子」必须由 `turn.ts` 分开表达：
 * 丢心发生在 `col <= HOUSE_COL`，而本函数守的是 `col < HOUSE_COL` 的越界态。
 * 两者差一步 —— 少写这一步，僵尸就会站在房子上不掉血。
 */
export function hasReachedHouse(col: number): boolean {
  assertIndex(col, 'col')
  return col < HOUSE_COL
}