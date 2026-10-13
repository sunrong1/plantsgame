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

/**
 * 坐标必须是整数，否则抛错（AC-7：逻辑层只 throw，不静默夹取）。
 *
 * ⚠️ 这是全 core/ 层**唯一**的整数校验器（[CR] P17 收口，2026-10-13）：
 * grid.ts、types.ts 的 `assertZombieCol`、combat.ts 全部走这里。
 * 此前存在三份几乎相同的实现（`assertIndex` / `assertZombieCol` / `assertGridIndex`）
 * 各带一套错误文案 —— 三份口径各自演化，迟早出现「其中一份放宽了 NaN」的漂移，
 * 而 Debug Log #5 正是这种口径漂移的教训。
 */
export function assertGridIndex(value: number, label: string): void {
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
  assertGridIndex(row, 'row')
  assertGridIndex(col, 'col')
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
  // 规范形态校验（[CR] P6）：正则放行 '02,8'、'-0,3' 这类**非规范整数**写法 ——
  // 它们能解析成合法坐标，但 cellKey 永远不会产出这种形态。放任不管，
  // 同一格子就会出现两种键，Story 1.5 的 Store 按规范键索引时非规范键静默失配
  // ——「塔凭空消失」的另一个入口。用「往返必须逐字符相等」一次性堵死。
  if (cellKey(row, col) !== key) {
    throw new Error(
      `格子键必须规范（无前导零、无 -0）：期望 "${cellKey(row, col)}"，收到 ${JSON.stringify(key)}`,
    )
  }
  return { row, col }
}

/**
 * 僵尸是否已**越过**房子（`col < HOUSE_COL`，即负列号的越界态）。
 *
 * ⚠️ [CR] D3 改名（2026-10-13 用户裁决）：本函数原名 `hasReachedHouse`，
 * 名字是「已抵达」、判据却是「已越过」—— `if (hasReachedHouse(z.col)) loseHeart()`
 * 是字面上最自然的调用，而僵尸站在 col 0 时它返回 false，于是僵尸站上房子不掉心、
 * 关卡永不失败。旧注释预言了这个 bug 却没改掉引发它的名字。现在两个口径各有各的
 * 名实相符函数：
 *   - {@link hasReachedHouse}（`col <= HOUSE_COL`）：**踏上房子格** —— 丢心判定用它
 *   - 本函数（`col < HOUSE_COL`）：**已越过房子** —— 清场 / 移除判定用它
 *
 * 判据锚点不变：`col < HOUSE_COL`，**不是** `col < 1`（后者是 `balance-scan.py`
 * 的 `nxt < 1`，混用了 1-based 的房子判定，裁决 3）。
 */
export function hasPassedHouse(col: number): boolean {
  assertGridIndex(col, 'col')
  return col < HOUSE_COL
}

/**
 * 僵尸是否已**抵达**房子（踏上房子格，`col <= HOUSE_COL`）。
 *
 * 📎 **接手 Story 1.5 必读**：丢心判定用**这个**函数。
 * 僵尸轨迹 `8→6→4→2→0` 落在第 4 回合 —— 那一刻它正**站在** col 0，
 * 本函数返回 true，应当扣心；`hasPassedHouse(0)` 仍是 false（要第 5 回合才越过）。
 * 两者差一步 —— 用错函数，僵尸就会站在房子上不掉血（旧移交 #3 的陷阱，D3 已拆）。
 */
export function hasReachedHouse(col: number): boolean {
  assertGridIndex(col, 'col')
  return col <= HOUSE_COL
}
