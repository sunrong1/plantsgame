/**
 * 建造判据 —— UI 层关于「能不能放 / 会打到哪里 / 多少钱 / 手上有几张卡」的问题，
 * **答案只能从这里来**（Story 1.12 / AC-B1 … AC-B5）。
 *
 * ── 为什么单独一个文件 ────────────────────────────────────────────────────
 * 这四个问题此前散落在三处：塔位的两列拦截硬编码在 `reducer.ts:238-250`、
 * `buildBlockedReason` 是 1.10 为 1.12 预留的纯谓词、造价在 `balance.ts`。
 * 组件层**无从知道** reducer 会拒绝什么 —— `State.grid` 只说「这格有没有塔」，
 * 不说「这格能不能建」。若组件自己写一份 `col !== 0 && col !== 8`，
 * 那么「UI 显示可建」与「reducer 允许建」就是两份独立判断，
 * 改一处忘另一处时**界面上看不出任何异常** —— 孩子点下去只会撞上一条报错。
 *
 * ── 架构硬约束 2（组件内不得出现战斗规则计算）的落点 ──────────────────────
 * 组件只要读本文件的返回值；**任何一条战斗数值都不许在组件里重算**。
 * 变异 M64（M65 同理）守这条：组件绕过 `handCards` 自己 import `costOf`，
 * 或直接 import `core/balance`，`npm run lint` / 源码守卫 G33a/G33b 会变红。
 *
 * ── `coverCellsAt` 为什么画「真实伤害形状」而不是圆（裁决 1，2026-10-15）──────
 * 这是本文件最容易被后来人「修回去」的一处，三方文档正面冲突，裁决如下：
 *   · `epics.md:1134` / `game-architecture.md:245-246` / `gdd.md:351`
 *     —— 「放置预览 = 半径 3 的圆（含斜向）」
 *   · `gdd.md:337` / `epics.md:1014` —— 「相邻行的塔也能打到中间行」
 *   · **`src/core/turn.ts:82`（实际代码）** —— `tower.row === ZOMBIE_ROW`，
 *     **只有第 3 行的塔开火**
 * ⇒ 后两条描述的机制**从未存在**，第 2/4 行的塔整局一枪不开。
 *   而没有人显式裁决过这件事 —— 它是从「战斗原语只收列号、不收行号」
 *   这个设计里长出来的（`combat.ts` 文件头「行过滤职责」，[CR] D4 只裁了
 *   「行过滤住在哪一层」，没裁「过滤掉什么」）。
 *
 * **裁决：预览 = 「若把塔种在 (row, col)，它实际能打到哪些格子」。**
 * 于是 `row !== ZOMBIE_ROW` ⇒ 空集合，而 UI 用「非僵尸行整行压暗」表达
 * （AC-E3）—— 让孩子从画面直接读出「僵尸只走中间那一行」，而不是靠文字说明。
 *
 * ⚠️ **为什么不让实现去迁就文档**：改「相邻行能不能开火」是**战斗判定变更**，
 *   `tests/core/assertions.test.ts` 的 5 条数值断言与 `npm run balance-sim`
 *   的门槛数字都要重跑，而 Story 1.19（Epic 1 生死线）就建立在那些门槛上。
 *   要让相邻行开火，那是 `[CC]` + 1.19 重验的事，不是 UI story 顺手带的事。
 *
 * 零 DOM、零 Vue、零日志。不 import `app/` `services/` `components/`。
 */

import { assertTowerType, costOf, rangeOf } from './balance.js'
import { aoeColumns, inRange } from './combat.js'
import { COLS, ZOMBIE_ROW, assertGridIndex, buildBlockedReason, cellKey } from './grid.js'
import type { State, TowerType } from './types.js'

/**
 * 手牌区要渲染的一张卡（AC-B1 / AC-B2）。
 *
 * ⚠️ **`label` 是 `promptText` 全文（裁决 5），不是 `wordId` 去掉前缀**：
 *   单元 1 实测 37 词条 = `word 30 / response 6 / keyword 1`。前者的 `wordId`
 *   就是 `promptText` 的化简（最长 `beautiful`，9 字符），后两者的 `wordId` 是
 *   **句子 slug** —— `u1-s-i-have-a-ball-for-my-dog` 是 26 字符，是前者的 2.9 倍。
 *   走 slug 路线会让**最长的 label 变成 26 字符**，把 AC-C3 的整套宽度推导
 *   （112px 可用宽）当场推翻；更糟的是它在孩子界面上显示一个他从没见过的
 *   机器名 —— 卡面应当是「你答对了这句话」，不是它的文件名。
 *
 * ⚠️ **一条规则覆盖全部卡型，不分卡型**：短句卡自然折成两行，
 *   单词卡自然一行；卡面高度随行数走（手牌区**不钉死**高度）。
 */
export interface HandCard {
  readonly entryId: string
  readonly towerType: TowerType
  /** 卡面上的单词文字 = `card.promptText` 全文（裁决 5）。组件只读不算。 */
  readonly label: string
  /** 造价，由 `costOf(towerType, unitNumber)` 给出。组件不许写死 50 / 75。 */
  readonly cost: number
  /** `state.sun >= cost`。变灰与不可点的唯一判据（AC-C4）。 */
  readonly affordable: boolean
}

/**
 * 这一格现在能不能放这张卡？不可放返回**原因**，可放返回 `null`（AC-B2）。
 *
 * ⚠️ **契约：`null` ⇔ `reduce(state, placeTower(entryId, cellKey(row, col)))` 不抛错。**
 *   这条等价关系就是 AC-D6 守卫的内容，**两边必须同时改**。
 *   `tests/core/build.test.ts` 用「阶段(6) × 45 格 × 占用态 × 阳光(4 档) × 解锁态」
 *   的矩阵守住它，而 `tests/core/buildable-cells.test.ts` 继续守着
 *   `buildBlockedReason` 那一侧 —— 两条守卫问的是不同层，合起来才封住分叉。
 *
 * ⚠️ **收口：③ ③' ③'' 三条都走 `grid.ts` 的 `buildBlockedReason()`。**
 *   1.10 在 `grid.ts:184-185` 留了话给本 story：「若 1.12 真的要动 reducer，
 *   应把两条抛错改成调用本函数并保留各自的消息，而不是各留一份判断」——
 *   本 story 照办，`reducer.placeTowerIn` 的两条硬编码已改成调用本函数
 *   （`reducer.ts` 的 `PLACE_TOWER` 分支），于是 UI 判据与 reducer 判据
 *   在**结构上**不可能分叉，而不只是「有一条断言盯着」。
 *
 * ── 八条判据逐条对应 `placeTowerIn`（AC-B2 的表）────────────────────────
 *   ① 塔卡未解锁 → `state.unlocked.includes(entryId)`
 *   ② 题单回查不到 → `state.deck.find(...)`
 *   ③ / ③' / ③'' 坐标非法、房子格、入场格 → `buildBlockedReason(row, col)`（**收口**）
 *   ④ 该格已有塔 → `state.grid[cellKey(row, col)]`
 *   ⑤ 阳光不足 → `state.sun < costOf(...)`
 *   ⑥ 不在 `awaiting-build` 阶段 → 本函数**新增**的一条（reducer 侧是 `rejectAction` 抛错）
 *
 * ⚠️ **逐条给各自的因果文案，不得压扁成一句笼统的「不能放」**（AC-B2）：
 *   排查时最需要看清的正是「为什么这一格特殊」，而「不能放」把那部分信息
 *   整个抹掉了 —— 这与 `buildBlockedReason` 自 1.10 起就坚持的三条消息可区分
 *   是同一条纪律。
 *
 * ⚠️ **组件层不 throw**（架构 `:567-606`：边界断言放纯逻辑层，不放组件层）。
 *   本函数会被组件对**任意**输入调用（含非整数与越界坐标），
 *   所以非法坐标一律**返回原因**而不是炸掉整个渲染。
 */
export function placementBlockedReason(
  state: State,
  entryId: string,
  row: number,
  col: number,
): string | null {
  // ⑥ 阶段：reducer 的 `reduce` 按 phase 分发，非 `awaiting-build` 时 `PLACE_TOWER`
  //   走的是 `rejectAction`（抛错）。UI 侧必须**先**答这个问题 ——
  //   否则孩子点了格子，界面给出的是「阳光不足」，而真相是「现在根本不能建」。
  if (state.phase.kind !== 'awaiting-build') {
    return (
      `现在不是建造时间（当前阶段是 ${state.phase.kind}）—— ` +
      '塔只在拿到卡的那一段里能种下；此刻点格子不会有任何事情发生。'
    )
  }
  // ① 塔卡是答对的奖励，未解锁就建等于让孩子白嫖所有词。
  if (!state.unlocked.includes(entryId)) {
    return (
      `塔卡 ${entryId} 尚未解锁，不能建造 —— 塔卡是答对的奖励。` +
      '放过它等于让孩子开局白嫖所有词，「听懂才建塔」这条激励链会整条消失。'
    )
  }
  // ② 词与塔型一律回查题单（FR23）。查不到只可能来自存档 / 内容 JSON 的脏值。
  const entry = state.deck.find((item) => item.entryId === entryId)
  if (entry === undefined) {
    return (
      `题单里没有 entryId ${entryId} —— 只可能来自存档或内容 JSON 的脏值。` +
      '放过它会造出一座词与塔型都无从追溯的塔，而战斗数值照常生效，平衡验证全部作废。'
    )
  }
  // ③ ③' ③''：坐标非整数 / 越界 / 房子格 / 僵尸入场格 —— 一律走 grid.ts 那一份。
  const positionReason = buildBlockedReason(row, col)
  if (positionReason !== null) {
    return positionReason
  }
  // ④ 该格必须为空（FR30）。读的是**规范键** `cellKey(row, col)` 而非调用方手里的
  //   任何字符串 —— reducer 侧读同一份，两边在结构上就不可能失配。
  const cell = cellKey(row, col)
  const occupant = state.grid[cell]
  if (occupant !== undefined) {
    return (
      `格子 (${row}, ${col})（第 ${row + 1} 行第 ${col + 1} 列）已有塔 ${occupant}，不能重叠建造 —— ` +
      'grid 与 towers 会立刻双向不一致，而那座塔永远打不到僵尸，界面上只是一格空白。'
    )
  }
  // ⑤ 阳光必须够（档位 × 塔型的造价）。少 1 点都放不下 ——
  //   放宽会让「答对才有钱建塔」这条链形同虚设。
  const cost = costOf(entry.towerType, state.unitNumber)
  if (state.sun < cost) {
    return (
      `阳光不足：建 ${entry.towerType} 塔需要 ${cost}，当前只有 ${state.sun}。` +
      '少 1 点都放不下 —— 放宽会让「答对才有钱建塔」这条链形同虚设。'
    )
  }
  return null
}

/**
 * 若把该塔种在 `(row, col)`，它**实际能打到哪些格子** —— `cellKey` 升序数组（AC-B3）。
 *
 * ── 形状逐字取自 core 的既有判据，**本函数不新写一份算术**（AC-B3）──────────
 *   · 前置 `row === ZOMBIE_ROW`（`turn.ts:82`）—— 不满足 ⇒ 空集合（裁决 1）
 *   · `aoe` → `aoeColumns(col)`（`combat.ts:88`），即 `[col-1, col, col+1] ∩ 网格`
 *   · 否则 → `rangeOf(towerType)`（`balance.ts:229`）取 range，再返回
 *     `inRange(col, c, range)` 为真的全部 `c`，即 `[col+1, col+range] ∩ [0, COLS-1]`
 *
 * ⚠️ **不要走 `rangeFor({towerType, …})`**（AC-B3）：它收的是一个 `Tower` 对象，
 *   而本函数收 `towerType` —— 造一个假 `Tower` 去喂它既绕过类型检查，
 *   又在测试里埋下一个**假实体**（实体是 `createTower` 造的，不是对象字面量）。
 *   `rangeOf` 就是为此存在的那个函数。
 *
 * ⚠️ **返回值逐字等于「伤害能落到的格子」，UI 不得额外点亮指向格**（AC-E2b）：
 *   `aoe` 本来就含自身、`direct`/`slow` 本来就不含 —— 若 UI 把指向格也算进去，
 *   它会与 `aoe` 的语义打架（`aoe` 的指向格本来就该亮，另两种不该）。
 *   指向格用**另一套视觉** `.is-candidate`，不复用 `.is-in-range`。
 *
 * 空集合是**合法返回值**而不是错误：它正是「种在非僵尸行的塔整局不开火」
 * 这一事实的形状，UI 据此改画整行压暗（AC-E3）。
 */
export function coverCellsAt(row: number, col: number, towerType: TowerType): readonly string[] {
  assertGridIndex(row, 'row')
  assertGridIndex(col, 'col')
  // ⚠️ 显式校验塔型：`aoe` 分支**不经过** `rangeOf`，而 `rangeOf` 自带
  //   `assertTowerType`。不补这一次的话，脏塔型（只可能来自存档 / 内容 JSON）
  //   在 `aoe` 上会安静地拿到「同行 3 格」而不是抛错，与另两种塔型反应不一致 ——
  //   与 `combat.ts` 的 [CR] P9「校验面一致」同型。
  assertTowerType(towerType)
  // 裁决 1：非僵尸行的塔**整局不开火** ⇒ 覆盖为空。这条短路是本 story
  // 与三份文档正面冲突的地方，删掉它就是变异 M57。
  if (row !== ZOMBIE_ROW) {
    return []
  }
  // ⚠️ 两个分支都必须对越界列**同等对待**：`aoeColumns` 越界抛错，而
  //   `inRange` 只会安静地答「没有一格在射程内」—— 同一个脏 col 在两种塔型上
  //   得到两种反应，那正是 [CR] P9「校验面一致」记的那类漂移。
  if (col < 0 || col >= COLS) {
    throw new Error(`col ${col} 越界（合法范围 0 ~ ${COLS - 1}）—— 塔不可能建在网格外`)
  }
  if (towerType === 'aoe') {
    return aoeColumns(col).map((covered) => cellKey(ZOMBIE_ROW, covered))
  }
  const range = rangeOf(towerType)
  const cells: string[] = []
  // 升序（`c` 自增）。降序就是变异 M71。
  for (let c = 0; c < COLS; c += 1) {
    if (inRange(col, c, range)) {
      cells.push(cellKey(ZOMBIE_ROW, c))
    }
  }
  return cells
}

/**
 * 手牌区要渲染的每一张卡 —— 按 `state.unlocked` 顺序，**不排序、不分组**（AC-B4 / 裁决 2）。
 *
 * 顺序 = `state.unlocked` 的顺序 = **解锁顺序 = 答对顺序**。排序或分组看起来更整齐，
 * 但那会把「你答对了哪些词、什么时候答对的」这条因果抹掉，
 * 而那正是孩子能读懂的部分。
 *
 * ⚠️ **已解锁但题单里查不到的条目（存档脏数据）跳过而不是抛错**（AC-B4）：
 *   与 `level-driver.ts` 的「造价最低的已解锁卡」同一口径。抛错会让一张脏卡
 *   挡住整个手牌区 —— 孩子看到的是空白，而不是「这一张没了」。
 *
 * ⚠️ **`cost` 与 `affordable` 一律由本函数算出**：组件不许 import `costOf`
 *   （ESLint `no-restricted-imports`，`eslint.config.js:172-190`），
 *   也不许写死 50 / 75 —— 那会随档位扩展（Epic 2 的 2-3）静默过期。
 */
export function handCards(state: State): readonly HandCard[] {
  const cards: HandCard[] = []
  for (const entryId of state.unlocked) {
    const entry = state.deck.find((item) => item.entryId === entryId)
    // 脏数据跳过（见上方注释）。`unlocked ⊆ deck` 是 reducer 出口的不变量，
    // 而存档能绕过 reducer —— 所以这条对**来自 State 的**脏数据同样适用。
    if (entry === undefined) {
      continue
    }
    const cost = costOf(entry.towerType, state.unitNumber)
    cards.push({
      entryId,
      towerType: entry.towerType,
      // 裁决 5：全文，不是 slug。
      label: entry.card.promptText,
      cost,
      affordable: state.sun >= cost,
    })
  }
  return cards
}
