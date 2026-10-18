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
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  assetDegradations,
  assetDegradationsVersion,
  audioDegradations,
  audioDegradationsVersion,
  devFlags,
  devSetDirectWin,
  devSetInfiniteHearts,
  devSetInfiniteSun,
  exportSession,
  isRecording,
  jumpToTurn,
  MAX_JUMP_STEPS,
  onAssetDegradationsChanged,
  onAudioDegradationsChanged,
  onSaveDegradationsChanged,
  progress,
  retrySaveWrite,
  saveDegradations,
  saveDegradationsVersion,
  state,
} from '../../app/store'
import type { JumpResult } from '../../app/store'
import { heartSlots } from '../../core'

/** 每颗心的占位（`true` = 还在）。心数上限由 `heartSlots` 决定，面板不自己数。 */
const hearts = computed(() => heartSlots(state.value))

/** 已掌握的词数 —— 面板只需要一个数，不需要比例。 */
const masteredCount = computed(() => progress.value.masteredWordIds.length)

/**
 * 📎 当前相位 —— 2026-10-18 试玩排障加的一行读数。
 *
 * ⚠️ **它是为「断点续学恢复到哪个相位」这一个具体问题加的**：症状是
 *   「重进没有卡面」，而它有两条完全不同的成因（恢复到了 `awaiting-build`
 *   vs 恢复到了 `round-over`），**在平板上肉眼分不出来** ——
 *   两者都不渲染卡面，但前者有手牌与「开战」按钮、后者一个按钮都没有。
 *   没有这行就只能靠回忆「我当时是在读题还是在建塔」，那是猜。
 *
 * ⚠️ **不要给它加判据**（面板是给孩子家长看的事实面板，不是断言器）。
 *   它的价值全在「排障时一眼看到」，写测试用的话该去 `tests/app/`。
 */
const phaseKind = computed(() => state.value.phase.kind)

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
 * ⚠️ **本模块的三个 registry 都不是响应式的**（模块级 `Map` / `Set` / 普通变量），
 *   而 Vue 只重算依赖到响应式量的 computed ⇒ 单纯调 `saveDegradations()`
 *   **不会**让这段重渲染。
 *   ⇒ {@link registriesVersion} 是那个把「底层状态变了」翻译成「有东西变了」的信号。
 *
 * ⚠️ **为什么是本地 `ref` 而不是 service 直接返回 `ref`**
 *   （`[CR]` 2026-10-17 裁决）：`src/services/**` 与 `src/core/**` 今天**零 vue 依赖**
 *   （R-08 的依赖方向里没有 Vue 这一层，守卫会红）⇒ 底层只能给**纯数字**，
 *   响应式依赖由**这一层**建立。这正是裁决 2 选的那条缝。
 *
 * ⚠️ **不改两个既有 API 的返回类型**（AC-E4）：形状由 1.14 / 1.15 自己的守卫钉着，
 *   这里只读不写。
 */
const bump = ref(0)

/**
 * 三个 registry 的版本号快照 —— **把它读进 `computed` 只是记账，不是刷新**。
 *
 * ⚠️📎 **为什么必须配 {@link onDegradationChanged}，版本号单独不够**：
 *   Vue 的 `computed` **只追踪响应式量的读取**。`assetDegradationsVersion()`
 *   返回一个普通整数，读它**建不起任何依赖** ⇒ 只挂这个的话，
 *   底层版本号一路涨到 9999，面板从头到尾显示「一切正常」。
 *   版本号回答「**变没变**」（可拉、可断言），订阅回答「**什么时候变**」（推给 Vue）。
 */
const registriesVersion = computed(
  () =>
    `${bump.value}|${assetDegradationsVersion()}|${saveDegradationsVersion()}|${audioDegradationsVersion()}`,
)

/**
 * 挂载时订阅三个 registry，**卸载时逐个退订**（`[CR]` 2026-10-17）。
 *
 * ⚠️ **退订不是可选的洁癖**：监听者集合是**模块级**的，面板每次挂载都往里加一个
 *   闭包。漏退订 ⇒ 面板卸载后底层仍在回调它，第二次挂载时同一个 ref 被推两遍
 *   （本例无害，但下一任读者加了计数/日志就会出怪事）。
 * ⚠️ 底层给的是**纯 JS 回调**（零 vue），依赖由本层的 `bump` 建立 —— R-08 不动。
 */
const unsubscribers: Array<() => void> = []

onMounted(() => {
  unsubscribers.push(
    onAssetDegradationsChanged(() => {
      bump.value += 1
    }),
    onSaveDegradationsChanged(() => {
      bump.value += 1
    }),
    onAudioDegradationsChanged(() => {
      bump.value += 1
    }),
  )
})

onUnmounted(() => {
  for (const off of unsubscribers) off()
  unsubscribers.length = 0
})

const degradations = computed<readonly PanelDegradation[]>(() => {
  void registriesVersion.value
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
  void registriesVersion.value
  return saveDegradations().length > 0
})

/**
 * 「重试写入」：**再写一次**，不是清档（AC-E3）。
 *
 * ⚠️ **刻意不调 `clearSave()`** —— 清档与重试是两件事，
 *   调试面板误清玩家的存档**不可逆**（守卫 G115 读 `removeItem` 的调用痕迹）。
 * ⚠️ 写成功后 `save.ts` 自己清降级项；这里仍要 `bump` 一下，
 *   因为「按钮刚被点过」这件事本身也要让列表重算一次。
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
    // ⚠️ 与 `not-in-play` 必须是**两句话**（`[CR]` 2026-10-17 修）：
    //   原来步数预算耗尽也落进 `not-in-play`，面板如实显示「当前不在能推进的阶段」
    //   —— 而那一刻相位恰恰是完全可推进的 `round-over`。谎报比不报更难查。
    'step-budget-exhausted': `一次最多跳 ${MAX_JUMP_STEPS} 步（面板的输入框挡不住 99999），目标太远了`,
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

// ── 导出会话（裁决 3 / AR39）────────────────────────────────────────────────

/**
 * 「导出会话」按钮的可用性 —— **没录过时置灰**。
 *
 * ⚠️📎 **不能直接在模板里写 `isRecording()`**（`session-recorder.ts` 与
 *   `tests/app/session-recorder.test.ts:196` 的注释逐字点名那个绑定）。
 *   裸调函数**建不起任何响应式依赖** —— 它读的是模块级变量。
 *   本条显式读 `state.value` 只为**挂一个依赖**：每 dispatch 一次都会换掉
 *   `state.value`（`applyAction` 的第 2 步），于是这个 `computed` 必然重算，
 *   按钮的置灰状态跟着「第一条 action 有没有按过」走。
 *   ⚠️ 这是与上面 `registriesVersion` 同款的坑：**光读不算数，要挂上响应式量**。
 */
const canExport = computed(() => {
  void state.value
  return isRecording()
})

/** 上一次导出的结果反馈。`null` = 还没点过 —— 此时面板不显示任何反馈行。 */
const exportFeedback = ref<string | null>(null)

/**
 * 点「导出会话」：把整局复制到剪贴板（**裁决 3**，2026-10-17）。
 *
 * ⚠️ **序列化在复制之前**：`exportSession()` 交出的是**一份快照**
 *   （`[CR]` 2026-10-17 修掉了它原先交出活引用的问题），
 *   而 `JSON.stringify` 把它固化成字符串 ⇒ 之后即使 `resetSession()` 发生，
 *   剪贴板里那份仍然是完整的一局。
 *
 * ⚠️ **两条失败路径都**不**抛，且都不写技术字样**（NFR12 / NFR13 / 守卫 G111）：
 *   · 没录过 —— 按契约 `exportSession()` 抛，按钮本该是灰的；这里仍然兜住，
 *     因为「置灰」与「能不能导出」是两件事，中间可能隔着一次 `resetSession()`。
 *   · 剪贴板被拒 —— 非安全上下文 / 用户拒授权 / 老浏览器都没有 `clipboard`。
 *     面板对家长说的话是「没复制成」，不是 `undefined is not a function`。
 */
async function onExportSession(): Promise<void> {
  let text: string
  try {
    text = JSON.stringify(exportSession(), null, 2)
  } catch {
    exportFeedback.value = '这一局还没有录到任何操作，没什么可导出的'
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    exportFeedback.value = `已复制到剪贴板（${exportSession().actions.length} 步操作）`
  } catch {
    // ⚠️ 不退回去「弹一个 textarea 让人自己复制」—— 那要再加一块 UI，
    //   而面板是给家长在平板上用的，临时方案在平板上往往更难用。
    exportFeedback.value = '没复制成 —— 浏览器没让这个页面访问剪贴板'
  }
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
      <dt>相位</dt>
      <dd>{{ phaseKind }}</dd>
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

    <!--
      「导出会话」（裁决 3 / AR39）。
      ⚠️ **置灰而不是点完再报错**：家长在开始界面就点得到这个按钮，
        而那时一条 action 都还没按过 —— `exportSession()` 按契约**抛**，
        报错弹出来对家长毫无意义。
    -->
    <section class="debug-panel__export">
      <h3 class="debug-panel__subtitle">
        导出会话
      </h3>

      <button
        type="button"
        class="debug-panel__button"
        data-action="export-session"
        :disabled="!canExport"
        @click="onExportSession"
      >
        复制这一局
      </button>

      <p
        v-if="exportFeedback"
        class="debug-panel__export-feedback"
        data-action="export-feedback"
      >
        {{ exportFeedback }}
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

  /* ⚠️📎 **`position: fixed` 不是装饰，是可达性**（`[CR]` 2026-10-17 补）：
   *   `App.vue:41` 把本组件挂在模板**末尾**、与 `StartView` / `LevelView` 平级，
   *   而它是个普通 `<aside>` ⇒ 不定位就是**流内最后一个块级元素**，
   *   竖屏（本作的主场景）下被整块推到游戏视图**下方** ——
   *   而 `App.vue` 给出的挂载理由恰恰是「调试开始界面时也看得见面板」。
   *   ⇒ 修法是让它**脱离文档流、固定在视口内**，而不是改 `App.vue` 的挂载顺序
   *   （那会动到既有视图的布局，且「面板在末尾」本身没有错）。
   *
   * ⚠️ `inset-block-start: 0` + `inset-inline-end: 0`：贴**右上**角。
   *   不贴左上的理由：左上角是标题与生命条的常规位置，压上去会让面板**盖住**
   *   孩子真正要看的那些东西 —— NFR13 在这一层仍然成立（见文件头）。
   * ⚠️ **`max-height` + `overflow-y: auto`**：面板有五段（读数 / 开关 / 降级 / 跳回合 /
   *   导出），小屏竖屏下内容比视口高。不给滚动的话下半截（含「重试写入」与
   *   「导出会话」两个**补救入口**）会落在屏幕外 —— 而那正是家长最需要按到的两下。
   * ⚠️ `inset-block-end: 0` **不设**：不同时贴上下边，否则 `max-height` 会被两端挤成
   *   视口高度减去上下 padding，内容一多就还是溢出。
   */
  position: fixed;
  inset-block-start: 0;
  inset-inline-end: 0;
  z-index: 10;
  max-height: 100vh;
  max-height: 100dvh;
  overflow-y: auto;
  /* 离屏幕边缘留一点，压到最边上时贴边文字会被系统手势区挡住。 */
  margin: var(--space-panel-pad);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
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

/*
 * 「导出会话」那一段。
 * ⚠️ 零新美术资产（AC-D6）：只复用上面已经用过的 `__subtitle` / `__button`，
 *   这里的 `__export-feedback` 与 `__jump-result` 是同一形态（同为「一句话反馈」），
 *   所以沿用同一组已存在的变量，不新造一套间距/字号。
 */
.debug-panel__export-feedback {
  margin: 8px 0 0;
  opacity: 0.9;
}

/*
 * ⚠️ **置灰样式是必须的，不能只靠 `:disabled`**：`.debug-panel__button` 自己
 *   设了 `background: transparent` 与 `color: inherit`，浏览器默认的
 *   `:disabled` 变灰**会被它整个盖掉** ⇒ 按钮看起来完全可点，点了才没反应。
 */
.debug-panel__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
