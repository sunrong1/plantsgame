<script setup lang="ts">
/**
 * HandDeck —— 手牌区容器（Story 1.12 / AC-C1、AC-C3、C5、C6、AC-D1、AC-D2②、AC-F1）。
 *
 * ── 这个组件只做三件事，其余一律不碰 ───────────────────────────────────────
 *   1. **只在 `awaiting-build` 渲染**（AC-C5）
 *   2. **按 `state.unlocked` 顺序**把 `handCards(state)` 的每一项渲染成一张卡
 *      （裁决 2：不排序、不分组、不按塔型归堆）
 *   3. 右侧常驻「⚔ 开战」按钮（AC-F1），点它调 `startRound()`（AC-F2 的三连在 store 里）
 *
 * ── 刻意不做的事 ──────────────────────────────────────────────────────────
 * · **不 dispatch 任何 action**（AC-D5）—— 组件只调 `app/store.ts` 的门面。
 * · **不 import `core/balance`**（ESLint `no-restricted-imports`）——
 *   造价、能否买、卡的顺序全部来自 `handCards()`，那是 core 的答案。
 * · **不算 affordability、不算 cost、不算射程**（架构硬约束 2：答案只有一个来源）。
 * · **不做拖拽 / 长按 / 防抖 / `setTimeout`**（FR31、守卫 G38、G39）——
 *   `epics.md:1114`：「防误触靠选中态高亮，不靠输入延迟」。
 * · **不引入新依赖**（skill 硬规则：超出 story 规格的依赖必须停下来问人）。
 *
 * ── 为什么横排必须能滚（AC-C3）────────────────────────────────────────────
 *   战场可建格 35 个（45 − 9 房子 − 1 入场），而 `unlocked` 会一路涨到整个单元的词数
 *   （全年 200-400 词）。⇒ 卡数**必然**超过一屏的宽度。
 *   若不滚，卡区会撑破容器把战场顶出屏幕 —— 那正是 1.10 踩过的
 *   「横向撑破」形态（`LevelView.vue:88-95` 的实测记录）。
 *
 * ── 「⚔ 开战」按钮为什么在卡区**之外**（AC-C3、AC-H1-3）──────────────────────
 *   按钮**常驻**、卡区滚 ⇒ 卡区实际可用宽 = 整幅宽 − 按钮宽 − 间隙。
 *   ⚠️ AC-H1-3 的「整卡数」按**这个宽度**算，不是按整幅 768px 算 ——
 *     校验阶段抓出来的算术漏洞（768px 的推导没扣掉按钮）。
 *
 * ── 实测（2026-10-15 T10，Chromium 1223，800×1280 竖屏，`npm run dev`）────────
 *   AC-H1-3 要求的那个算式，四个数全部量到了：
 *     · 整幅 768px（= 800 − 2×16 内边距）
 *     · **「⚔ 开战」按钮实测宽 83.44px**（`flex: 0 0 auto`，不写死）
 *     · 卡区 `clientWidth` 实测 **669px**（= 768 − 83.44 − 16 间隙，含 16 内边距）
 *     · 37 张卡时 `scrollWidth` = **5348px**（= 37×144 − 12 + 32）⇒ `scrollWidth > clientWidth`，
 *       横向滚动确实存在
 *   ⇒ **整卡数 = ⌊(669 + 12) / 144⌋ = ⌊4.73⌋ = 4 张整卡**，
 *     **第 5 张实测露出 76.56px**（≈ 0.58 张宽）—— 「露头」成立，
 *     且露出的是**半张以上**的卡面，孩子一眼能看出「右边还有」。
 *     37 张卡意味着要横滑 8 屏多，这条留给 1.19 真机试玩体感。
 */

import { computed } from 'vue'

import { handCards } from '../../core'
import { selectedEntryId, selectTowerCard, startRound, state } from '../../app/store'
import HandCard from './HandCard.vue'

/**
 * 只在 `awaiting-build` 渲染手牌区（AC-C5）。
 *
 * ⚠️ 用 `v-if` **整块不渲染**，不是 `v-show` —— 其它阶段孩子看到的应当是
 *   「这里没有东西」，而不是一个 `display: none` 的空壳（后者在某些辅助技术里
 *   仍会被算进可及性树）。
 */
const isBuildPhase = computed(() => state.value.phase.kind === 'awaiting-build')

/** 卡列表 —— 顺序由 core 决定（`state.unlocked` 顺序，裁决 2 / 守卫 G40）。 */
const cards = computed(() => handCards(state.value))

/**
 * AC-D2②：点**卡面区留白**取消选中。
 *
 * ⚠️ 用 `.self` 修饰符：事件目标必须**就是**卡区容器本身。
 *   点在卡片上时事件是从 `<button>` 冒上来的，`target` 是那个 button，
 *   `.self` 因此不成立 —— 选卡与「点空白取消」这两件事才不会互相误伤。
 *
 * ⚠️ **直接写 `selectedEntryId` 而不新增第四个门面**：AC-D5 把门面清单
 *   冻结在三个（`selectTowerCard` / `placeSelectedAt` / `startRound`），
 *   凭空加第四个就是超出 story 规格的实现。这里写的是**纯 UI ref**
 *   （AC-D4 明写它不参与 `reduce`、不存档、不触发副作用），
 *   与「组件不许碰 action 构造器」那条边界无关 —— 那条守的是 `actions.ts`。
 */
function onRailBlank(): void {
  selectedEntryId.value = null
}
</script>

<template>
  <!-- AC-C5：非 `awaiting-build` 阶段整块不渲染。 -->
  <section
    v-if="isBuildPhase"
    class="hand-deck"
    aria-label="手牌区"
  >
    <!--
      卡区本体：横排 + 横向滚动（AC-C3）。
      ⚠️ `flex: 1` 让它吃掉除按钮外的全部宽度；`min-width: 0` 是**必需的** ——
        缺了它 flex item 的自动最小尺寸会让轨道拒绝收缩到内容以下，
        于是横向滚动条永远出不来（卡区被顶成 768px 以外）。
        这个坑与 `LevelView.vue:88-95` 记的「横向撑破」同源。
    -->
    <div
      class="hand-deck__rail"
      @click.self="onRailBlank"
    >
      <HandCard
        v-for="card in cards"
        :key="card.entryId"
        :card="card"
        :selected="card.entryId === selectedEntryId"
        @select="selectTowerCard(card.entryId)"
      />
    </div>

    <!--
      「⚔ 开战」（AC-F1、AC-C6）：常驻右侧，**不随卡区滚动**。
      ⚠️ 文案直接说「开战」，不写「确定」「OK」—— NFR13：
         孩子面前不许出现没有信息量的机器文案。
      ⚠️ 按钮**不自己判相位**：容器已用 `v-if` 限定在 `awaiting-build`，
         `startRound()` 内部另有一道相位守卫（AC-F3）—— 两条都要有。
    -->
    <button
      type="button"
      class="hand-deck__start"
      @click="startRound"
    >
      ⚔ 开战
    </button>
  </section>
</template>

<style scoped>
/*
 * 横排容器：`⚔ 开战` + 卡区 + 间隙。
 *
 * ⚠️ **高度不钉死**：单词卡一行、短句卡两行，卡面高度随行数走
 *   （`1-11:904` 的同一条纪律：写死高度必然在下游 story 变成要返工的死代码）。
 *   也不给它 `flex: 1`（那会把战场的高度吃掉）。
 */
.hand-deck {
  display: flex;
  align-items: center;
  gap: var(--space-panel-pad);
  flex: 0 0 auto;
  padding: var(--space-panel-pad) 0;
}

/*
 * 卡区：横排 + 横向滚动（AC-C3 的三条硬要求：横向滚动 / 卡宽 132 / 档间距 12）。
 * 高度不钉死、最小高度由卡自己保（`--touch-min`，48px）。
 */
.hand-deck__rail {
  display: flex;
  flex: 1 1 auto;
  /* ⚠️ 必需：没有它，这一条 flex item 的 `min-width: auto`（自动最小尺寸）
     会按内容宽度设下界，卡区永远不肯收缩 ⇒ 横向滚动永远不出现。 */
  min-width: 0;
  /* 竖向不滚：卡高由行数决定，最多三行（`HandCard` 的行钳，T10 实测定的）。 */
  overflow-y: hidden;
  overflow-x: auto;
  gap: 12px;
  /* 触屏上让系统接管横向滑动手势，与卡区的点击互不干扰。 */
  overscroll-behavior-x: contain;
  /* 末卡与屏幕边缘之间留一点余量，让「还有更多卡」这件事看得见。 */
  padding-inline: var(--space-panel-pad);
  scrollbar-width: thin;
}

/*
 * 「⚔ 开战」按钮。
 *
 * ⚠️ 尺寸由**文案 + 内边距**自然得出，**不写死宽度** ——
 *   写死宽度而后改文案，字就会溢出按钮（1.11 的同一条纪律）。
 * ⚠️ **实测宽度 83.44px**（Chromium 1223 / 800×1280，T10 实测）——
 *   这就是 AC-C3 / AC-H1-3 里「卡区实际可用宽 = 整幅 − 按钮宽 − 间隙」
 *   被减掉的那一项，卡区实测 `clientWidth` = 669px、整卡数 4 + 露头 76.56px。
 *   ⚠️ **改文案就要重量**：按钮宽不是常数，下游动文案时 AC-H1-3 的整卡数要重算。
 *   命中区域走 `--touch-min`（48px），与战场格子同一条纪律。
 */
.hand-deck__start {
  flex: 0 0 auto;
  min-height: var(--touch-min);
  min-width: var(--touch-min);
  padding: var(--space-panel-pad) var(--space-panel-pad);
  border: none;
  border-radius: 8px;
  background-color: var(--color-sun);
  font-size: var(--text-body);
  cursor: pointer;
}
</style>
