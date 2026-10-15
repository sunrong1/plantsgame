<script setup lang="ts">
/**
 * BattleField —— 5 行 × 9 列战场（Story 1.10 / AC-6、AC-7、AC-12）。
 *
 * ── 职责边界 ──────────────────────────────────────────────────────────────
 * 只做两件事：把 `state` 里的战场**读出来铺成 DOM**，以及把「这一格长什么样」
 * 的静态区别表达出来。本文件**不含任何战斗规则计算**。
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不做建塔点击交互**（选卡 → 点格子）—— 属 Story 1.12（AR43 / FR32）。
 *   本 story 的格子只是「看起来」，不是「能点」。
 * · **不重算抵达判定**（AC-10）—— 抵达房子的僵尸已经不在 `state.zombies` 里了
 *   （`reducer.ts` 的 `applyResolve` 已扣心并移除）。渲染层若再判一次 `col <= 0`，
 *   就是**第二个**抵达事实源，而两个事实源迟早分叉。丢心口径以
 *   `grid.ts` 的 `hasReachedHouse` 为准。
 * · **不显示列号 / 行号**（AC-7）—— 内部 0-based、界面 1-based 的混用由守卫
 *   **G18** 从**空间位置**上抓，不依赖任何可见文字。6 岁半不需要读数。
 * · **不画射程预览** —— 属 1.12，且 GDD `:296/:310` 残留的「圆形射程」要改
 *   得走 `[CC]`（`deferred-work.md:229`）。
 * · **不做 HUD** —— 属 1.13。**尤其不在战场上画心。**
 * · **不在渲染路径打日志**（`[GA]:619-622`）—— 本文件一条日志都没有。
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

import { COLS, HOUSE_COL, ROWS, ZOMBIE_ROW, ZOMBIE_SPAWN_COL, canBuildAt, cellKey } from '../../core'
import type { Tower as TowerEntity, Zombie as ZombieEntity } from '../../core'
import { state } from '../../app/store'

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
</script>

<template>
  <div class="battle-grid">
    <div
      v-for="cell in cells"
      :key="cell.key"
      class="battle-cell"
      :class="{
        'is-house': cell.isHouse,
        'is-spawn': cell.isSpawn,
        'is-buildable': cell.isBuildable,
      }"
      :data-row="cell.row"
      :data-col="cell.col"
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
 * ⚠️ 静态区分，**点击交互属 Story 1.12**。本 story 不让这些格子可点，
 *   所以孩子此刻看到的是「这两列不一样」，而不是「点了会怎样」。
 *   塔位有效性的完整结论（deferred-work.md:171）已移交 1.12。
 */
.battle-cell.is-house::before,
.battle-cell.is-spawn::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--color-overlay-blocked);
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
