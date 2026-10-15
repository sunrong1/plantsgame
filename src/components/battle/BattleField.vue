<script setup lang="ts">
/**
 * BattleField —— 5 行 × 9 列战场（Story 1.10 / AC-6、AC-7、AC-12）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只做两件事：把 `state` 里的战场**读出来铺成 DOM**，以及把「这一格长什么样」
 * 的静态区别表达出来。本文件**不含任何战斗规则计算**。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不重算抵达判定**（AC-10）—— 抵达房子的僵尸已经不在 `state.zombies` 里了
 *   （`reducer.ts` 的 `applyResolve` 已扣心并移除）。渲染层若再判一次 `col <= 0`，
 *   就是**第二个**抵达事实源，而两个事实源迟早分叉。丢心口径以
 *   `grid.ts` 的 `hasReachedHouse` 为准。
 * · **不显示列号 / 行号**（AC-7）—— 内部 0-based、界面 1-based 的混用由守卫
 *   **G18** 从**空间位置**上抓，不依赖任何可见文字。6 岁半不需要读数。
 * · **不做 HUD** —— 属 1.13。**尤其不在战场上画心。**
 * · **不在渲染路径打日志**（`[GA]:619-622`）—— 本文件一条日志都没有。
 *
 * ── 建塔点击交互（Story 1.12 / AC-D1 … D3、AC-E1 … E4）──────────────────────
 *   两步放置：**`pointerdown` 只负责「指向」，`pointerup` 才负责「种下」**。
 *   ⚠️ 为什么必须分开：手指按下与抬起之间会有落点漂移，用 `click` 一把梭
 *     就会在漂移后于**别的格子**建塔 —— 而「种错位置」正是孩子最常见、
 *     也最看不出所以然的失败形态（AC-D1 的原话）。
 *   ⚠️ **不用 hover、不用拖拽、不用 `pointermove`**（守卫 G39）：目标形态是
 *     竖屏平板，压根没有 hover；拖拽是另一套交互，本 story 不做。
 *   ⚠️ **不用任何延迟/防抖代替选中态**（`epics.md:1114`）：防误触靠**看得见的高亮**。
 *
 *   ⚠️ GDD `:296/:310` 残留的「圆形射程」**本 story 不改**（裁决 1）：
 *     覆盖层画的是 `coverCellsAt` 的**真实伤害形状**（范围塔 = 同行 3 格），
 *     而 GDD 正文仍写着圆。改文档要走 `[CC]`，登记见 AC-H2。

 *
 * ── 索引基准 ──────────────────────────────────────────────────────────────
 * 内部 0-based，界面 1-based（`grid.ts` 裁决 3）。本文件渲染的是**内部**坐标，
 * 孩子看到的是「第 1 列在最左、第 9 列在最右」—— 顺序由 DOM 顺序 + CSS Grid 决定。
 *
 * ── 45 格，不多不少（AC-6 / 守卫 G17）────────────────────────────────────
 * `state.grid` 是 `Record<cellKey, towerId>`，**没有格子数组、没有「空格子」列表**
 * （`types.ts:296-316`）—— 所以「铺满 45 格」只能由本文件遍历 `ROWS × COLS` 得到。
 * ⚠️ 绝不能靠数组下标去对齐 grid 的键：Story 1.7 踩过 `balance-scan.py` 按位置
 *   键入 `dict[col]` **静默吞僵尸**的坑，得出过错的失败门槛。
 */

import { computed, ref, watch } from 'vue'

import {
  COLS,
  HOUSE_COL,
  ROWS,
  ZOMBIE_ROW,
  ZOMBIE_SPAWN_COL,
  canBuildAt,
  cellKey,
  coverCellsAt,
  handCards,
  placementBlockedReason,
} from '../../core'
import type { HandCard, Tower as TowerEntity, Zombie as ZombieEntity } from '../../core'
import { placeSelectedAt, selectedEntryId, state } from '../../app/store'

import RangeOverlay from './RangeOverlay.vue'
import Tower from './Tower.vue'
import Zombie from './Zombie.vue'

/** 一格。`key` 用 `cellKey()` 产出，与 `state.grid` 的键**同源**，不是另编一套。 */
interface Cell {
  readonly key: string
  readonly row: number
  readonly col: number
  readonly isHouse: boolean
  readonly isSpawn: boolean
  readonly isBuildable: boolean
}

/**
 * 铺满 `ROWS × COLS`。
 *
 * 刻意写成**普通函数在 setup 期调用一次**而不是 `computed`：
 * 它只依赖网格常量、不依赖 `state`，放进 computed 只会让它在每次 state 变化时
 * 白白重算一遍并产出一个内容完全相同的新数组（⇒ 无谓的渲染）。
 */
function buildCells(): readonly Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      cells.push({
        key: cellKey(row, col),
        row,
        col,
        isHouse: col === HOUSE_COL,
        isSpawn: col === ZOMBIE_SPAWN_COL,
        // 📎 「能不能建」由 core/ 回答，不由本文件算（AC-12 逐字要求）。
        //   详见 grid.ts 的 buildBlockedReason 注释：reducer 里那两条拦截
        //   若被组件另抄一份，两边分叉时界面上看不出任何异常。
        isBuildable: canBuildAt(row, col),
      })
    }
  }
  return cells
}

const cells = buildCells()

/**
 * 这一格上的塔（可能 0 座）。
 *
 * `state.grid` 只存 `cellKey → towerId`，实体在 `state.towers` 里 —— 两者必须回查，
 * 跳过回查就只能拿到一个 id，那不是能渲染的东西。
 *
 * 用 `filter` 而不是 `find` + `[0]`：格子非空规则由 reducer 保证同一格不会有两座塔，
 * 但那是一条**运行期**保证；渲染层若用 `find` 取第一个，将来那条保证一松动，
 * 第二座塔就会**静默不渲染**（与 balance-scan 吞僵尸同源）。
 */
function towersAt(cell: Cell): readonly TowerEntity[] {
  const towerId = state.value.grid[cell.key]
  if (towerId === undefined) return []
  return state.value.towers.filter((tower) => tower.id === towerId)
}

/**
 * 这一格上的僵尸（可能 0 只，也可能多只）。
 *
 * ⚠️ **僵尸的行号一律是 `ZOMBIE_ROW`，本函数只在 `cell.row === ZOMBIE_ROW` 时被问**
 *   —— `Zombie` 类型**刻意没有 `row` 字段**（`types.ts:56-63`）：
 *   「行不变量不是靠断言守住的，是靠类型里根本没有这个字段守住的」。
 *   所以这里没有任何地方从 zombie 对象上读行号。
 *
 * ⚠️ 同样用 `filter`：`find` 只取第一只会让同列的第二只僵尸静默消失。
 *   守卫 G17b 断言「渲染出的僵尸元素数 === state.zombies.length」正是为此。
 */
function zombiesAt(cell: Cell): readonly ZombieEntity[] {
  if (cell.row !== ZOMBIE_ROW) return []
  return state.value.zombies.filter((zombie) => zombie.col === cell.col)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 建塔交互（Story 1.12）
 *
 * ⚠️ **这里只有 UI 态，没有规则。** 「这一格能不能放」的答案只有一个来源：
 *   `placementBlockedReason(state, entryId, row, col)`（架构硬约束 2）。
 *   本文件**不**重写「已占用 / 位置不可建 / 阳光不足 / 相位不对」中的任何一条 ——
 *   AC-B5 那道交叉断言守的就是「预览与落子用同一把尺子」。
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 当前选中的是哪张卡（`null` = 没选）。
 *
 * 走 `handCards(state)` 回查而不是直接读 `state.deck`：
 * 那是**同一个** core 函数给出手牌区渲染的列表，取的就是孩子眼睛看见的那一张 ——
 * 若两者哪天分叉（比如 core 过滤掉了一条脏数据），战场预览会亮起一张
 * **根本没有渲染出来**的卡 ⇒ 孩子按住看到一片高亮，松手什么也没发生。
 */
const selectedCard = computed<HandCard | null>(() => {
  const entryId = selectedEntryId.value
  if (entryId === null) return null
  return handCards(state.value).find((card) => card.entryId === entryId) ?? null
})

/**
 * **指向格**（candidate）：已选中卡 + 手指/鼠标按在某个格子上（AC-E1）。
 *
 * ⚠️ 刻意**不放在 `app/store.ts`**：它连 `State` 都不参与、连跨组件都不需要 ——
 *   只有战场内部的预览读它。放进 store 只会让它看起来像跨组件状态。
 *   （对照 AC-D4：`selectedEntryId` 之所以进 store，是因为手牌区与战场**两处**都读它。）
 *
 * ⚠️ 刻意**不用 hover、不用 `pointermove`**（守卫 G39）：目标设备没有 hover。
 */
const candidate = ref<{ readonly row: number; readonly col: number } | null>(null)

/**
 * 压暗闪：按在不可建 / 已占用格上的那一格（AC-D3）。
 *
 * ⚠️ 只存**一个** key —— 同时按两格在触摸设备上不可能，而存一个数组
 *   会诱使后来人写出「同时闪多格」的语义，那不是 AC-D3 要的形态。
 */
const refusedKey = ref<string | null>(null)

/**
 * 射程覆盖到的格子（AC-E1）。
 *
 * ⭐ **这一行是整个 story 的正题**：第 3 行 7 个可建格的并集是**整行全亮**，
 *   什么也没告诉孩子（AC-E1 的原话：那样「所有空格子都显示」在数学上退化）。
 *   ⇒ 覆盖**必须**挂在具体的一格上，而那一格的坐标由 `pointerdown` 给出。
 *   `coverCellsAt` 本来就含/不含指向格（范围塔含，直射与减速塔不含），
 *   **UI 不得额外把指向格点亮**（AC-E2b）。
 */
const coveredKeys = computed<ReadonlySet<string>>(() => {
  const card = selectedCard.value
  const point = candidate.value
  if (card === null || point === null) return new Set()
  return new Set(coverCellsAt(point.row, point.col, card.towerType))
})

/**
 * 非第 3 行整行压暗的开关（AC-E3）。
 *
 * ⚠️ 要 `selectedCard !== null` **且**相位是 `awaiting-build`：
 *   AC-E3 明写「整行压暗在 `awaiting-build` 之外的阶段不画」，与手牌区同相位。
 *   （`selectedEntryId` 通常已经随相位被清掉，那道是常态路径；
 *   这里再判一次是**冗余保险** —— 两道都要有，理由同 AC-D5 对门面的说法。）
 */
const showInertRows = computed(
  () => selectedCard.value !== null && state.value.phase.kind === 'awaiting-build',
)

/** 这一格此刻能不能放（唯一判据：`placementBlockedReason`）。 */
function blockedAt(cell: Cell): boolean {
  const entryId = selectedEntryId.value
  if (entryId === null) return true
  return placementBlockedReason(state.value, entryId, cell.row, cell.col) !== null
}

/**
 * AC-D1：`pointerdown` —— **只指向，不种**。
 *
 * 三条分支，缺一不可：
 * ① 没选中任何卡 ⇒ **什么都不做**（连覆盖层都不出现，AC-D1 明写）
 * ② 按在不能放的格上 ⇒ 压暗闪（AC-D3），**不清选中**（AC-D2 的注释：
 *    「点了个这里不能放」已经是一个信号，再把卡也取消就是两个信号叠一起，更难懂）
 * ③ 能放 ⇒ 记指向格，画覆盖
 */
function onCellPointerDown(cell: Cell): void {
  if (selectedEntryId.value === null) return
  if (blockedAt(cell)) {
    refusedKey.value = cell.key
    return
  }
  candidate.value = { row: cell.row, col: cell.col }
}

/**
 * AC-D1：`pointerup` —— **只落在与 `pointerdown` 同一格时才种**。
 *
 * ⚠️ 落在别处 ⇒ **只移动预览，不种**（AC-E1 的逐字要求）。
 *   这一格能不能放要**重新问一次**：从能放的格滑到不能放的格上松手，
 *   预览必须跟着撤掉 —— 否则屏幕上会留着一片「这里能放」的绿光，
 *   而松手什么也没发生，孩子完全无从判断是哪一步出的问题。
 */
function onCellPointerUp(cell: Cell): void {
  if (selectedEntryId.value === null) return
  const point = candidate.value
  if (point === null) return
  const sameCell = point.row === cell.row && point.col === cell.col
  candidate.value = blockedAt(cell) ? null : { row: cell.row, col: cell.col }
  if (!sameCell) return
  /**
   * 调门面包办：内部先问 `placementBlockedReason`，非 `null` 直接 `return false`
   * 且**不 dispatch**（AC-D5），成功种下后自己清 `selectedEntryId`（AC-D2③）。
   *
   * ⚠️ 组件**不**自己 dispatch `applyAction(placeTower(...))` ——
   *   绕过了禁用判断就是「孩子点一下白屏」。
   */
  placeSelectedAt(cell.row, cell.col)
  candidate.value = null
}

/**
 * AC-D2②：点**网格之外**的空白取消选中。
 *
 * ⚠️ `.self` 修饰符：事件目标必须**就是** `.battle-grid` 容器本身。
 *   点在格子上时事件从 `.battle-cell` 冒上来，`target` 是那个 cell，
 *   `.self` 因此不成立 —— 「按格建塔」与「点空白取消」才不会互相误伤。
 * ⚠️ 这里清的是**网格外**的空白。网格**之内**的空可建格是落子目标（AC-D1），
 *   点它不是取消选中 —— AC-D2 的注释专门澄清过这个歧义。
 */
function onGridBlank(): void {
  selectedEntryId.value = null
}

/** 压暗闪动画播完 ⇒ 收掉 class，不留残影（架构硬约束 5：时长写 CSS 不写 TS）。 */
function onCellAnimationEnd(): void {
  refusedKey.value = null
}

/**
 * 选中态一变 ⇒ 指向与压暗闪一并作废。
 *
 * ⚠️ 不作废的后果很具体：孩子换了一张卡（射程完全不同），
 *   屏幕上却还留着上一张卡的射程预览 —— 那不是「过期」，那是**错的**。
 *   （AC-E1：选中卡但尚未指向任何格时，不画 `.is-in-range`。）
 *
 * 🚨 **必须 `flush: 'sync'`**（这条是被测试逼出来的，不是偏好）：
 *   默认的 `'pre'` 是**批处理**的 —— watcher 在下一个渲染周期才跑。
 *   于是「选卡」与「按格」若落在同一个 tick 内（本组件测试里正是如此：
 *   `selectTowerCard(...)` 之后紧接着 `trigger('pointerdown')`），
 *   顺序会变成「设 candidate → watcher 才把 candidate 清掉」，
 *   **覆盖层一帧都不显示**。真机上两次触摸通常不在一个 tick，所以那条路径
 *   平时看不出来 —— 正是这种「只在测试里复现」的次序依赖最容易活到线上。
 *   `flush: 'sync'` 让「作废」与「换卡」发生在**同一个瞬间**，语义也对：
 *   换卡的那一刻，上一张卡的指向信息就不再有意义了。
 */
watch(selectedEntryId, () => {
  candidate.value = null
  refusedKey.value = null
}, { flush: 'sync' })
</script>

<template>
  <div
    class="battle-grid"
    @click.self="onGridBlank"
  >
    <div
      v-for="cell in cells"
      :key="cell.key"
      class="battle-cell"
      :class="{
        'is-house': cell.isHouse,
        'is-spawn': cell.isSpawn,
        'is-buildable': cell.isBuildable,
        'is-candidate': candidate !== null && candidate.row === cell.row && candidate.col === cell.col,
      }"
      :data-row="cell.row"
      :data-col="cell.col"
      @pointerdown="onCellPointerDown(cell)"
      @pointerup="onCellPointerUp(cell)"
      @animationend="onCellAnimationEnd"
    >
      <!-- 房子（第 1 列 = 内部 col 0）。CSS 画，不新增 SVG 资产 ——
           守卫 G1 断言塔/僵尸目录里的文件集合「恰好等于」预期，多一个文件就红。 -->
      <div
        v-if="cell.isHouse"
        class="house"
        data-house
        aria-label="房子"
      />

      <!-- 塔。本格可有 0~1 座。 -->
      <Tower
        v-for="tower in towersAt(cell)"
        :key="tower.id"
        :tower="tower"
      />

      <!-- 僵尸。本格可有 0~多只。叠在塔的上层（CSS z-index），
           这纯粹是**渲染顺序**决定，与战斗判定无关 —— 塔照常在射程内开火。 -->
      <Zombie
        v-for="zombie in zombiesAt(cell)"
        :key="zombie.id"
        :zombie="zombie"
      />

      <!--
        覆盖层（Story 1.12）。⚠️ 三个 `RangeOverlay` 必须排在塔与僵尸**之后**：
          层序靠 `z-index: 0` 与 `::before` 的 `auto` 落在同一级后的 **DOM 顺序**分胜负
          （见 `RangeOverlay.vue` 的文件头）。把这段往上挪，覆盖层就会钻到房子罩底下，
          而那道改动**不会让任何测试变红**。
      -->
      <!-- ① 射程覆盖：该格落在 `coverCellsAt(指向格, 塔型)` 里。 -->
      <RangeOverlay
        v-if="coveredKeys.has(cell.key)"
        variant="range"
      />
      <!-- ② 非第 3 行整行压暗：选中卡时，第 1/2/4/5 行。 -->
      <RangeOverlay
        v-else-if="showInertRows && cell.row !== ZOMBIE_ROW"
        variant="inert"
      />
      <!-- ③ 拒绝闪：按在不能放的格上。与 ① 互斥（能放的格不会走到压暗闪）。 -->
      <RangeOverlay
        v-else-if="refusedKey === cell.key"
        variant="refused"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * ⚠️ 下面三条声明是 `game-architecture.md:498-501` 的**逐字**要求。
 *   守卫 **G14** 断言 `repeat(N, 1fr)` 的 N === `COLS`、`aspect-ratio` 的分母 === `ROWS`，
 *   变异 **M42** 证明「改坏 COLS 而不同步这里」会变红。
 *   ⇒ **不许把 9 / 5 改成别的数而不改 `src/core/grid.ts`**（反之亦然）。
 *
 *   为什么这条值得一条守卫：`tests/core/grid.test.ts:36-40` 早就埋下了这条前向引用，
 *   但那个测试守的是网格常量本身 —— 两处可以各自「看起来对」而整体错位，
 *   而战场会**静默**把 45 个元素排进一个错误的网格里，界面上只是「有点挤」。
 */
.battle-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: var(--space-grid-gap);
  /* ⚠️ `content-box` 是**必需**的，不是口味问题：
     `base.css` 全局把 `box-sizing` 设成 `border-box`，而 `aspect-ratio` 算的是
     **border-box** 的比例。`padding-bottom` 有 48px（`--touch-min`），
     于是 9:5 那个框里先被挖掉 48px 留给安全区，剩下给 5 行的高度不足，
     格子就变成「宽 46.8 / 高 37.5」的扁矩形 —— 正方形的结论当场失效。
     改成 `content-box` 后，`aspect-ratio` 描述的是**格子区**本身，
     padding 额外加在下面，两件事不再互相扣。
     （实测：border-box 时格子 46.8×37.5，content-box 时 46.8×47.1。）
   */
  box-sizing: content-box;
  /* 底部留出触控安全区：格子是战场里最大的可点区域（1.12 起），
     不留出手势条的高度，最下面一行的格子会被系统手势吃掉一块。
     真机数值校准属 Story 1.18（GDD `:557`）。 */
  padding-bottom: calc(var(--touch-min) + env(safe-area-inset-bottom, 0px));
  /* 9 列 × 5 行 ⇒ 容器宽高比 = 9:5，配合下面每个格子的 1:1
     ⇒ 格子恒为正方形。塔与僵尸是**扁平矢量**，格子一旦不是正方形，
     整幅图会被拉伸变形（`[GA]:490-496`）。 */
  aspect-ratio: 9 / 5;
}

.battle-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  /* 格子底色：与 `--color-bg` 同值，让「网格」在视觉上融进草地，
     分隔靠 gap 而不是靠色块 —— 45 个色块会把画面切碎。 */
  background-color: var(--color-bg);
  border-radius: 2px;
}

/*
 * 僵尸行走的那一行铺成浅土路径（`--color-path`）——
 * 孩子要能一眼看出「僵尸从右边沿着这条路过来」，而那条路必须是连续的。
 *
 * ⚠️ 用 `:nth-child(n + 19):nth-child(-n + 27)` 定位**第 3 行**（DOM 顺序 19~27），
 *   那是**手算出来的**下标，依赖 DOM 顺序严格是行优先、且 COLS === 9。
 *   守卫 **G17** 断言的正是这个行优先顺序（`data-row`/`data-col` 组合恰好等于
 *   `parseCellKey` 的合法集），所以 COLS 一变这条就会指错行 —— 那时守卫先红。
 */
.battle-cell:nth-child(n + 19):nth-child(-n + 27) {
  background-color: var(--color-path);
}

/*
 * 不可建格（房子格 col 0 与入场格 col 8）：盖一层压暗罩。
 *
 * ⚠️ 这层罩**保持 `z-index: auto`**（AC-E2）：射程覆盖层是 `z-index: 0`，
 *   两者落在同一层叠级别，靠 DOM 顺序分先后 —— `::before` 是 cell 的第一个子盒，
 *   覆盖层在模板里排在它**之后**，所以射程罩必然压在上面。
 * ⚠️ 别给这条加 `z-index`：一旦它变成 `z-index: 1` 就会与塔/僵尸同层，
 *   而此时压不压得住就变成「谁在 DOM 里靠后」的偶然 —— 房子格那一列
 *   会出现层级跳变（AC-H1-2 要在真浏览器里核的那一项）。
 *
 * Story 1.12 起，按在这两列上的行为是 AC-D3 的「不响应 + 100ms 压暗闪」。
 */
.battle-cell.is-house::before,
.battle-cell.is-spawn::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--color-overlay-blocked);
}

/*
 * 指向格描边（AC-E1 / AC-E2b）。
 *
 * ⚠️ **指向格不靠 `.is-in-range` 表达，另有另一套视觉**：范围塔的覆盖本就含自身，
 *   直射与减速塔不含 —— UI 若额外把指向格也点亮，就与范围塔的语义打架了。
 *   所以指向格是**描边**，射程罩是**填充**，两件事在视觉上可分辨。
 *
 * ⚠️ 用 `::after` + `z-index: 2` 而不是 `outline`/`box-shadow`：
 *   后两者画在 cell 自己的背景/边框层，会被塔（`z-index: 1`）压住边缘；
 *   描边的职责是「手指落在这儿」，**任何时候都看得见**才成立。
 * ⚠️ `pointer-events: none`：描边绝不能吃掉格子的指针事件。
 */
.battle-cell.is-candidate::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border: 3px solid var(--color-sun);
}

/* 入场格在**最右**列：给它一条指向左侧的入场标记，
   让孩子看出僵尸是从这一侧进来的（房子在另一侧）。 */
.battle-cell.is-spawn {
  border-right: 3px solid var(--color-zombie);
}

/* 房子格在**最左**列。 */
.battle-cell.is-house {
  border-left: 3px solid var(--color-tower-aoe);
}

/*
 * 房子 —— **纯 CSS 画**，不新增 SVG 资产。
 *
 * ⚠️ 为什么不用 SVG：`tests/assets/asset-geometry.test.ts` 的 **G1** 断言塔/僵尸
 *   目录里的文件集合**恰好等于**预期集合，多一个文件也红。加一张 house.svg
 *   会让 G1 立刻失败，而「让一个恰好集合的守卫放宽」正是本仓库明令禁止的松阈值。
 *
 *   ⚠️ 房子的视觉是 **Story 1.10 的新增设计** —— GDD 与 epics 都没有描述房子长什么样
 *   （GDD 只在概念层提到「第 1 列的房子」，`gdd.md:212` / `:336`）。
 *   两个三角形 + 一个方块，够 6 岁半认出「那是我要守的东西」。
 */
.house {
  position: absolute;
  inset: 8%;
}

/* 屋顶：三角形。用 `clip-path` 而不是「零边框三角形」——
   后者的宽高比无法控制，而这里要的是**恰好填满房子那半格宽**的屋顶。
   色板 token，不手写 hex。 */
.house::before {
  content: '';
  position: absolute;
  inset: 0 0 58% 0;
  background-color: var(--color-tower-aoe);
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
}

/* 墙：方块。 */
.house::after {
  content: '';
  position: absolute;
  inset: 42% 18% 0 18%;
  background-color: var(--color-path);
  border-radius: 2px;
}
</style>
