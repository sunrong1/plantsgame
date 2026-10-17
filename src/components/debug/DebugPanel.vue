<script setup lang="ts">
/**
 * 调试面板（Story 1.17 / AC-D1、AC-D3、AC-D4）。
 *
 * ── 它是什么 ──────────────────────────────────────────────────────────────
 * 一个**只读** store 与 services 公开 API 的侧栏。它**不持有游戏状态** ——
 * 全部显示值都在模板里现算，读的都是 `state.value` / `progress.value`。
 *
 * ── 它不是什么 ────────────────────────────────────────────────────────────
 * · **不是页面** —— 它挂在既有的视图里（AC-D5 / 裁决 9），`src/views/` 下
 *   零 `components/debug` 的 import（守卫 G113）。GDD 无选关自由、架构也没有
 *   第二个视图，把它做成可路由到达的页面只会凭空多一条「孩子能点进去的入口」。
 * · **不是给孩子的界面** —— 面向家长与开发者。但 NFR13 在这一层仍然成立：
 *   家长看不懂的报错就是「白着而没有任何东西指向原因」（守卫 G111）。
 *
 * ── ⚠️ 心数用 `heartSlots()` 而不是 `HEARTS` ──────────────────────────────
 *   `eslint.config.js` 对 `src/components/**` 硬禁 `core/balance` ——
 *   心数上限是**数值调优**（Story 3.2）的对象，组件直读它就是绕过那条边界。
 *   `heartSlots(state)` 是已封好的纯函数（1.13 交付，`HUD/HeartRow.vue` 同款用法），
 *   它返回「每颗心还在不在」的布尔数组 —— 面板要显示的正是这个形状。
 *
 * ── ⚠️ 三个开关必须经 `store` 的门面 ──────────────────────────────────────
 *   直连 `app/dev-adjust` 会让「面板调了哪些能力」这件事散到两个文件里，
 *   而守卫 G110 只盯 `DebugPanel.vue` 一个文件就会失明（AC-D2）。
 *
 * ── ⚠️ 降级项也全部经 `store` 的门面（AC-E4）──────────────────────────────
 *   其中 `audioDegradations` **不是风格问题而是硬边界**：组件与视图整条
 *   `services/audio` 都在 ESLint 禁列里（禁整个模块而不是逐个函数名，
 *   `eslint.config.js` 逐字写了这个理由）⇒ 它经 `app/effects-runner.ts`
 *   放行，与 1.14 裁决 5 的 `startBgmIfReady` 同构。
 *   另两个（`saveDegradations` / `assetDegradations`）没有这条限制，
 *   仍然走门面是**为了同一个理由**：G110 只盯这一个文件。
 *
 * ── ⚠️ 「跳回合」是面板的第四**段**，不是第四个开关 ────────────────────────
 *   AC-D3 逐字列的是三个开关（无限心 / 无限阳光 / 直接通关），多加一个就是超出 AC。
 *   「跳到任意回合」（AR40 / 裁决 7）是独立的一段：目标回合 + 按钮 + 结果行，
 *   经 `store` 的 `jumpToTurn` 门面执行（守卫 G118 盯的是**门面那份**的实现）。
 */
import { computed, ref } from 'vue'

import {
  assetDegradations,
  audioDegradations,
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  jumpToTurn,
  progress,
  retrySaveWrite,
  saveDegradations,
  state,
} from '../../app/store'
import type { JumpResult } from '../../app/store'
import { heartSlots } from '../../core'

/** 每颗心的占位（`true` = 还在）。心数上限由 `heartSlots` 决定，面板不自己数。 */
const hearts = computed(() => heartSlots(state.value))

/** 已掌握的词数 —— 面板只需要一个数，不需要比例。 */
const masteredCount = computed(() => progress.value.masteredWordIds.length)

// ── 降级列表（AC-E4）────────────────────────────────────────────────────────

/**
 * 面板上的一行降级项。
 *
 * ⚠️ **`locator` 是一个已经拼好的字符串，不是结构化字段** —— AC-E4 的三张表
 *   逐字给了三种展示形态（`scope=… key=…` / `key=…` / `url=…`），它们**字段就不同**
 *   （音频多一个 `scope`）⇒ 归一化的产物就是「一句能读的定位串」。
 */
interface PanelDegradation {
  readonly locator: string
  readonly reason: string
}

/**
 * 三个来源归一化成一个列表。
 *
 * ⚠️ **本模块的三个 registry 都不是响应式的**（模块级 `Map` / `Set`），
 *   而 Vue 只重算依赖到响应式量的 computed ⇒ 点完「重试写入」后，
 *   光调 `saveDegradations()` **不会**让这段重渲染。
 *   ⇒ {@link bump} 是那个「手动踩一下」的响应式量。
 *
 * ⚠️ **不改两个既有 API 的返回类型**（AC-E4）：形状由 1.14 / 1.15 自己的守卫钉着，
 *   这里只读不写。
 */
const bump = ref(0)

const degradations = computed<readonly PanelDegradation[]>(() => {
  void bump.value
  const rows: PanelDegradation[] = []
  for (const item of assetDegradations()) {
    rows.push({ locator: `url=${item.url}`, reason: item.reason })
  }
  for (const item of saveDegradations()) {
    rows.push({ locator: `key=${item.key}`, reason: item.reason })
  }
  for (const item of audioDegradations()) {
    rows.push({ locator: `scope=${item.scope} key=${item.key}`, reason: item.reason })
  }
  return rows
})

/** 有没有存档降级项 —— 决定「重试写入」这个按钮露不露脸。 */
const saveDegraded = computed(() => {
  void bump.value
  return saveDegradations().length > 0
})

/**
 * 「重试写入」：**再写一次**，不是清档（AC-E3）。
 *
 * ⚠️ **刻意不调 `clearSave()`** —— 清档与重试是两件事，
 *   调试面板误清玩家的存档**不可逆**（守卫 G115 读 `removeItem` 的调用痕迹）。
 * ⚠️ 写成功后 `save.ts` 自己清降级项，本函数只需让列表重算。
 */
function onRetrySaveWrite(): void {
  retrySaveWrite(progress.value, state.value)
  bump.value += 1
}

// ── 跳回合（AR40 / 裁决 7）─────────────────────────────────────────────────

/**
 * 目标回合（输入框的值）。
 *
 * ⚠️ 类型是 `number | string` 而不是 `number`：输入框被清空时 `v-model.number`
 *   给回的是**空串**。写成 `number` 就是拿类型骗自己 —— 而 AR40 的用法里
 *   「先把框清掉再输」是最正常的手势。
 */
const targetTurn = ref<number | string>(1)

/** 上一次跳回合的结果。`null` = 还没跳过 —— 此时面板不显示任何结果行。 */
const jumpResult = ref<JumpResult | null>(null)

/**
 * 把结果说成人话（AC-D3 同款纪律）。
 *
 * ⚠️ **没说到达就是没到达**：跳不远时（心耗尽 / 已通关 / 当前相位推不动）
 *   报的是「停在第几回合」，不是目标回合。
 *   面板报一个够不着的数字，等于把「没跳到」说成「跳到了」。
 */
const jumpSummary = computed(() => {
  const result = jumpResult.value
  if (result === null) return ''
  if (result.stoppedBy === 'reached') return `已到第 ${result.reachedTurn} 回合`
  const why = {
    'level-failed': '这一局已经失败',
    'level-complete': '这一局已经通关',
    'not-in-play': '当前不在能推进的阶段',
  }[result.stoppedBy]
  return `停在第 ${result.reachedTurn} 回合：${why}`
})

/**
 * 点「跳回合」：把输入框的值原样交给 `store` 的门面。
 *
 * ⚠️ **转换只做 `Number()`** —— 夹取（≥ 1、非整数取整）都在 `jumpToTurn` 里，
 *   面板不重写一遍口径，否则两处会各自漂移（守卫 G118 盯的是门面那份）。
 */
function onJumpTurn(): void {
  jumpResult.value = jumpToTurn(Number(targetTurn.value))
}
</script>

<template>
  <aside
    class="debug-panel"
    aria-label="调试面板"
  >
    <h2 class="debug-panel__title">
      调试面板
    </h2>

    <dl class="debug-panel__readout">
      <dt>回合</dt>
      <dd>{{ state.turn }}</dd>
      <dt>阳光</dt>
      <dd>{{ state.sun }}</dd>
      <dt>心</dt>
      <dd>
        <span
          v-for="(alive, i) in hearts"
          :key="i"
          class="debug-panel__heart"
        >{{
          alive ? '●' : '○'
        }}</span>
      </dd>
      <dt>已掌握</dt>
      <dd>{{ masteredCount }}</dd>
    </dl>

    <fieldset class="debug-panel__switches">
      <legend>调试开关</legend>

      <label class="debug-panel__switch">
        <input
          type="checkbox"
          data-flag="infiniteHearts"
          :checked="devFlags.infiniteHearts"
          @change="devSetInfiniteHearts(($event.target as HTMLInputElement).checked)"
        >
        <span class="debug-panel__switch-name">无限心</span>
        <span class="debug-panel__switch-hint">掉心后回到 1，永远不会失败</span>
      </label>

      <label class="debug-panel__switch">
        <input
          type="checkbox"
          data-flag="infiniteSun"
          :checked="devFlags.infiniteSun"
          @change="devSetInfiniteSun(($event.target as HTMLInputElement).checked)"
        >
        <span class="debug-panel__switch-name">无限阳光</span>
        <span class="debug-panel__switch-hint">阳光不少于 9999</span>
      </label>

      <label class="debug-panel__switch">
        <input
          type="checkbox"
          data-flag="directWin"
          :checked="devFlags.directWin"
          @change="devSetDirectWin(($event.target as HTMLInputElement).checked)"
        >
        <span class="debug-panel__switch-name">直接通关</span>
        <span class="debug-panel__switch-hint">下一次 CONTINUE 即通关</span>
      </label>
    </fieldset>

    <!--
      降级列表（AC-E4）。**面板是唯一展示降级状态的地方**（裁决 13）——
      对局画面上不许出现任何降级提示（NFR13），守卫 G117。
    -->
    <section class="debug-panel__degradations">
      <h3 class="debug-panel__subtitle">
        降级项
      </h3>

      <ul
        v-if="degradations.length > 0"
        class="debug-panel__degradation-list"
      >
        <li
          v-for="(item, i) in degradations"
          :key="i"
          class="debug-panel__degradation"
        >
          <code class="debug-panel__locator">{{ item.locator }}</code>
          <span class="debug-panel__reason">{{ item.reason }}</span>
        </li>
      </ul>
      <p
        v-else
        class="debug-panel__empty"
      >
        没有降级项
      </p>

      <!-- 「重试写入」= 再写一次存档，不是清档（AC-E3）。 -->
      <button
        v-if="saveDegraded"
        type="button"
        class="debug-panel__button"
        data-action="retry-save-write"
        @click="onRetrySaveWrite"
      >
        重试写入
      </button>
    </section>

    <!--
      「跳到任意回合」（AR40 / 裁决 7）。
      ⚠️ **这一段刻意不是第四个开关** —— AC-D3 逐字列的是三个，多加一个就是超出 AC。
    -->
    <section class="debug-panel__jump">
      <h3 class="debug-panel__subtitle">
        跳回合
      </h3>

      <label class="debug-panel__jump-row">
        <span class="debug-panel__jump-label">到第几回合</span>
        <input
          v-model.number="targetTurn"
          class="debug-panel__jump-input"
          type="number"
          min="1"
          step="1"
          data-action="target-turn"
        >
      </label>
      <button
        type="button"
        class="debug-panel__button"
        data-action="jump-turn"
        @click="onJumpTurn"
      >
        跳回合
      </button>

      <p
        v-if="jumpResult"
        class="debug-panel__jump-result"
        data-action="jump-result"
      >
        {{ jumpSummary }}
      </p>
    </section>
  </aside>
</template>

<style scoped>
/*
 * ⚠️ **零新美术资产**（AC-D6）：全部用 `tokens.css` 里**已有**的变量。
 *   新增色值要过 `tests/content/palette.test.ts` 的 WCAG 实算（R-56），
 *   而调试面板不需要新色 —— 它要的是「不抢孩子画面的注意力」。
 */
.debug-panel {
  /* `--color-hud-panel` 是 1.13 HUD 定稿的深中性底，与战场草地对得开。 */
  background: var(--color-hud-panel);
  border-radius: 8px;
  color: var(--color-path);
  padding: var(--space-panel-pad);
  font-size: 14px;
}

.debug-panel__title {
  font-size: 14px;
  margin: 0 0 8px;
}

.debug-panel__readout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin: 0 0 12px;
}

.debug-panel__readout :is(dt, dd) {
  margin: 0;
}

/* 复用 1.13 的心色，不再引入第五种红。 */
.debug-panel__heart {
  color: var(--color-heart);
}

.debug-panel__switches {
  border: 1px solid var(--color-overlay-inert);
  border-radius: 4px;
  padding: 8px;
}

.debug-panel__switch {
  align-items: baseline;
  display: grid;
  /* 触控目标 ≥ `--touch-min` —— AC-1 对所有可点元素的要求，面板也不例外。 */
  gap: 8px;
  grid-template-columns: auto auto 1fr;
  min-height: var(--touch-min);
}

.debug-panel__switch-hint {
  color: var(--color-path);
  opacity: 0.8;
}

.debug-panel__subtitle {
  font-size: 14px;
  margin: 12px 0 6px;
}

.debug-panel__degradation-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.debug-panel__degradation {
  /* 定位串要能整段复制走 —— 所以它是 `<code>` 而不是被截断的一行文本。 */
  overflow-wrap: anywhere;
  padding: 2px 0;
}

.debug-panel__reason {
  display: block;
  opacity: 0.8;
}

.debug-panel__empty {
  margin: 0;
  opacity: 0.8;
}

.debug-panel__button {
  /* 触控目标 ≥ `--touch-min` —— 与三个开关同一条（AC-1）。 */
  min-height: var(--touch-min);
  margin-top: 8px;
  padding: 0 12px;
  border: 1px solid var(--color-overlay-inert);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.debug-panel__jump-row {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: auto 1fr;
}

.debug-panel__jump-input {
  /* 触控目标 ≥ `--touch-min` —— 输入框也是可点元素（AC-1）。 */
  min-height: var(--touch-min);
  padding: 0 8px;
  border: 1px solid var(--color-overlay-inert);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
}

.debug-panel__jump-result {
  margin: 8px 0 0;
  opacity: 0.9;
}
</style>
