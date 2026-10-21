/**
 * 网格规格与坐标换算（Story 1.4 / AC-2）。
 *
 * 本文件是网格尺寸的**唯一**定义处。组件不得重定义 `ROWS` / `COLS` /
 * `ZOMBIE_ROW` —— Story 1.10 的 CSS 网格读的是这里的常量。
 *
 * ⚠️📎 `[CR]` 2026-10-21 复审：上一句原来带**行号锚点**「架构 `:642`」——
 *   那个行号今天指的是 `### Configuration` 标题（GA 在 1.15–1.20 期间被大幅扩写，
 *   行号整体漂移）。按 **R-31**「引用文档一律用原文句子，不用行号」改为引用原句：
 *   架构逐字写着「网格尺寸在 `core/` 中是常量（`ROWS = 5` / `COLS = 9` / `ZOMBIE_ROW = 2`），
 *   **组件不得重定义**」。
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

/** 行数。架构逐字：「网格尺寸在 `core/` 中是常量（`ROWS = 5` / `COLS = 9` / `ZOMBIE_ROW = 2`），**组件不得重定义**」。 */
export const ROWS = 5
/** 列数。架构逐字：「网格尺寸在 `core/` 中是常量（`ROWS = 5` / `COLS = 9` / `ZOMBIE_ROW = 2`），**组件不得重定义**」。 */
export const COLS = 9
/** 僵尸所在行索引（= 界面「第 3 行」）。架构逐字：「网格尺寸在 `core/` 中是常量（`ROWS = 5` / `COLS = 9` / `ZOMBIE_ROW = 2`），**组件不得重定义**」。 */
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

// ── 塔位合法性（Story 1.10 / AC-12）───────────────────────────────────────────

/**
 * 这一格**位置上**能不能建塔？不可建时返回原因，可建时返回 `null`。
 *
 * ⚠️ **只管「位置」，不管「这一格现在有没有塔」「阳光够不够」** ——
 *   后两条是 reducer 的运行时校验，依赖 `State`。本函数是**纯几何**的：
 *   只看坐标，所以组件可以对任意一格调用它而不会碰到 `State`。
 *
 * ── 为什么放在 core/ 而不是组件里算（AC-12 逐字要求）──────────────────────
 *   `reducer.ts` 的 `placeTowerIn` 已经拒绝了两列（`[CR]` 2026-10-14 补的）：
 *     · `col === ZOMBIE_SPAWN_COL(8)` —— `inRange` 是**单边**的（只打自己左边的格），
 *       建在那里的直射塔/减速塔**永远打不到任何东西**。孩子花 50 阳光买到一个
 *       整局不动的塔，无报错、无红测试，症状只是「塔好像不打人」。
 *     · `col === HOUSE_COL(0)` —— 僵尸走到这一格就已离场并丢心，塔在它脚下
 *       **从未开过火**。白花阳光，不是取舍。
 *   这两条硬编码在 reducer 里时，**组件无从知道「这一格能不能建」**：
 *   `State.grid` 只说「这格有没有塔」，不说「这格能不能建」。
 *   若组件自己写一份 `col !== 0 && col !== 8`，那么「UI 显示可建」与
 *   「reducer 允许建」就是两份独立判断，改一处忘另一处时**界面上看不出任何异常**
 *   —— 孩子点下去只会撞上一条报错。
 *
 * ── 为什么 1.10 当时**不**改 reducer 去调它 ──────────────────────────────
 *   最彻底的做法是让 `placeTowerIn` 也走这个函数，那样两份判断在结构上就不可能分叉。
 *   1.10 没那么做，改为**保留 reducer 原样 + 加一条交叉断言**（见
 *   `tests/core/buildable-cells.test.ts`）：逐格比对 `canBuildAt` 与
 *   `placeTower` 的真实接受 / 拒绝。理由有二，都记在这里以便日后推翻：
 *     ① reducer 那两条抛错消息是**给排查用的**（写了「射程单边」「踏上即离场」
 *        这样的因果），走通用谓词会把它们压扁成一句笼统的「不能建」；
 *     ② 「不要改任何战斗数值 / 战斗判定」是 1.10 的硬边界（Dev Notes §6），
 *        改 reducer 属于越过边界做重构，而交叉断言已经能挡住漂移。
 *
 * ── ✅ Story 1.12 收口（2026-10-15，AC-B2）─────────────────────────────────
 *   上面那句「若日后 1.12 真的要动 reducer，应把两条抛错改成调用本函数并保留
 *   各自的消息」**已经照办了**：`reducer.placeTowerIn` 的 ③'/③'' 现在调用本函数，
 *   抛出的错误**逐字采用本函数的消息**（因果文案一条没丢）。
 *   ⇒ **漂移从「被守住的」升级成「被消除的」**：两份判断现在只有一份实现。
 *   `tests/core/buildable-cells.test.ts` 的交叉断言**继续留着** ——
 *   它守的不再是这两列，而是 `canBuildAt` 这一侧与 reducer 的整体一致性。
 */
export function buildBlockedReason(row: number, col: number): string | null {
  // ⚠️ 用 isInsideGrid 而不是 assertInsideGrid：本函数会被组件对**任意**坐标调用，
  //   组件层不许 throw（架构 `:567-606`：边界断言放纯逻辑层，不放组件层）。
  //   非整数与越界在这里统一回答「不可建」，而不是炸掉整个渲染。
  if (!isInsideGrid(row, col)) {
    return `格子 (${row}, ${col}) 不在 ${ROWS}×${COLS} 网格内`
  }
  // ⚠️ [CR] 2026-10-16 裁决 6 —— 本条是**改放置规则**（不是消歧）。
  //   事实基础：`turn.ts` 的 `resolveCombatRound` 只让 `row === ZOMBIE_ROW` 的塔开火，
  //   所以第 1/2/4/5 行的塔**整局一枪不开**；`coverCellsAt` 对它们返回空集合。
  //   在此之前，非僵尸行的格子是「能建、不能打」—— 孩子花 50~75 阳光买一座
  //   永远不会开火的塔，界面上没有任何提示，`coverCellsAt` 的空覆盖还要靠
  //   「整行压暗」反向解释。与「房子格」「入场格」两条同型（都是「能建但没意义」）。
  //   故与其让 UI 解释它，不如从规则上禁掉：**非僵尸行不可建塔**。
  //   GDD rev 5 已经把射程描述改成「同行单向窗口 / 范围塔横向 3 格」，
  //   本条与之一致；它禁掉的是 GDD 同时描述着、却从未成立的机制。
  //   ⚠️ **代价（已如实记录，不得当小事抹掉）**：合法塔位从 35 格降到 **7 格**
  //   （只剩第 3 行 × 第 2~7 列）。这**改动关卡平衡**，`tests/core/build.test.ts`
  //   与 `tests/core/buildable-cells.test.ts` 的逐格黄金值已随之更新并在
  //   Story 1.12 的 [CR] 记录里写明原因。要放宽回多行建塔，前提是让相邻行开火
  //   —— 那是战斗判定变更（见 [CC] / 1.19 重验），不是改一行谓词。
  if (row !== ZOMBIE_ROW) {
    return (
      `格子 (${row}, ${col}) 不在僵尸行（第 ${ZOMBIE_ROW + 1} 行）—— ` +
      '僵尸只走中间那一行，别的行建出来的塔整局不会开火'
    )
  }
  if (col === HOUSE_COL) {
    return (
      `格子 (${row}, ${col}) 是房子格（界面第 ${HOUSE_COL + 1} 列）—— ` +
      '僵尸走到这一格就已经离场并丢心，塔在它脚下从未开过火'
    )
  }
  if (col === ZOMBIE_SPAWN_COL) {
    return (
      `格子 (${row}, ${col}) 是僵尸入场格（界面第 ${ZOMBIE_SPAWN_COL + 1} 列）—— ` +
      '射程是单边的（只打自己左边的格子），建在这里的塔永远打不到任何东西'
    )
  }
  return null
}

/**
 * 这一格**位置上**能不能建塔 —— {@link buildBlockedReason} 的布尔版。
 *
 * 合法塔位因此是 `row === ZOMBIE_ROW` × `col ∈ [1, COLS-2]` = **7 格**，
 * 不是 45 格，也不是原先的 35 格。分两次落定：
 *   · 两条**列**拦截（房子列 / 入场列）是对 `[epics] AC:1013`「塔可种在任意空格」的
 *     **消歧，不是推翻** —— 那句 AC 写下时这两条拦截还没进 `[CR]`。落定时 35 格。
 *   · **行**拦截（非僵尸行）是 `[CR] 2026-10-16` 裁决 6 的**规则变更**，35 → 7。
 *     它禁掉的是「能建但整局不开火」的格子，理由见 `buildBlockedReason` 里的注释。
 * 两者性质不同，勿混为一谈：**把行拦截加回来＝改放置规则与关卡平衡**，
 * 属 1.19 重验的范围，不是 UI 层的自由度。
 */
export function canBuildAt(row: number, col: number): boolean {
  return buildBlockedReason(row, col) === null
}
