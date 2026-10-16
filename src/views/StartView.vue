<script setup lang="ts">
/**
 * StartView —— 启动界面。
 *
 * AC-1 的验收对象：游戏名 + 页面最大、最易点的「开始游戏」按钮。
 *
 * 刻意不做的事（见 Story Dev Notes §10）：
 *   - 不引 vue-router —— ⚠️📎 原写「路由属 Story 1.15」，已按 R-32 更正（2026-10-17）：
 *     `epics.md` 的 AC 正文里 1.15 **没有 router**（1.15 [CS] 裁决 5 已推翻旧编号）。
 *     1.10 走 store 的最小 `view` 态（裁决 1），真要拆路由得等真有第二个视图
 *   - 不做任何选关 / 单元选择入口 —— FR59 / OUT-OF-SCOPE-5
 *   - 不含任何战斗规则计算 —— 架构硬约束 2（此文件零计算）
 *   - **不调 playPronunciation** —— 朗读的触发属 Story 1.11，由卡面出现时驱动
 */

// 视图只认识 app/：音频解锁的三步顺序是一条架构约束（FR2），
// 写在 app/audio-unlock.ts 里肉眼可查，散在这里就退化成一句注释。
// 直接 import '../services/pronunciation' 是跳过 app/ 的违规导入。
import { unlockAudioSequence } from '../app/audio-unlock'
import { enterLevel } from '../app/store'

/**
 * 「开始游戏」：同步完成音频解锁（Web Audio + TTS 预热 + BGM 预解，三步之间无 await），
 * 然后**同步**切到战场视图。
 *
 * 不写 `async` + `await`：解锁必须在用户手势的同一个同步块里完成。
 * 解锁本身是「用户手势触发的、一次性、不可重放的资源初始化」，
 * 是「副作用只走 effects-runner」那条规则的唯一合法例外（它发生在第一局之前）。
 *
 * ⚠️ **`unlockAudioSequence()` 必须在 `enterLevel()` 之前**（FR2）。
 *   两者之间**不允许出现 `await`** —— 一旦让出事件循环，浏览器的
 *   「用户手势已激活」上下文就可能失效，`AudioContext.resume()` 被拒，
 *   而失败的表现是「第一局没声音」，界面上完全看不出原因。
 *   ⚠️ **本文件没有 ESLint 兜底**：`no-restricted-syntax: AwaitExpression`
 *   **有意不覆盖 `src/views/`** —— `eslint.config.js` 里那段注释逐字写着
 *   「为什么不覆盖 src/views/StartView.vue：**有意为之**」，
 *   「将来若要扩到 views/，那是 Story 1.13+ 的决定」。
 *   ⇒ FR2 在本文件是**靠注释与审查**守着的，不是靠工具。Story 1.10
 *   **不自行扩大那条规则的范围**（Dev Notes §12）。
 *
 * 刻意**不**引入 `starting` 状态、**不**禁用按钮：`enterLevel()` 是同步的，
 * 切视图后本组件立刻被卸载，按钮随之消失 —— 不存在「按钮变灰之后
 * 没有任何东西会把它解开」那个旧问题（那是因为 Story 1.15 之前 onStart 不切视图）。
 * 防重复靠幂等（同一个 AudioContext / 只发一次预热 utterance）+ 组件卸载，不靠禁用。
 */
function onStart(): void {
  unlockAudioSequence()
  enterLevel()
}
</script>

<template>
  <main class="start-view">
    <h1 class="game-title">
      PVZ Pixel
    </h1>

    <button
      class="start-button touch-target"
      type="button"
      @click="onStart"
    >
      开始游戏
    </button>
  </main>
</template>

<style scoped>
.start-view {
  /* 竖屏平板是目标形态（架构决策 10）：dvh + flex 居中，
     四边留出安全区，避开刘海与系统手势条。
     标题与按钮作为一组整体居中 —— 不要用 grid-template-rows: 1fr auto，
     那会把标题顶到上沿、按钮压到下沿，中间留一大片空白。 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: calc(var(--space-panel-pad) * 2);
  min-height: 100dvh;
  padding: calc(var(--space-panel-pad) + env(safe-area-inset-top))
    calc(var(--space-panel-pad) + env(safe-area-inset-right))
    calc(var(--space-panel-pad) + env(safe-area-inset-bottom))
    calc(var(--space-panel-pad) + env(safe-area-inset-left));
  text-align: center;
}

.game-title {
  margin: 0;
  font-size: clamp(2.5rem, 12vw, 5rem);
  /* 色板已定稿（docs/art-direction.md §2 / tokens.css），但**文字的字号与字重阶梯**
     归 Story 1.9 / 1.12。颜色先用系统文字色：--color-* 里目前没有「正文文字色」这一档，
     补它等于替 Story 1.9 做决定。 */
  color: CanvasText;
}

/*
 * AC-1：这是页面上最大、最易点的目标。
 * min-height/min-width 用 --touch-min（48px）打底，再按视口宽度放大 ——
 * 目标设备是家长单手拿着的竖屏平板（800×1280 量级），不是鼠标，
 * 所以按 vw 给到 368×176px 这个量级，远超 48px 的下限。
 */
.start-button {
  min-height: max(var(--touch-min), 22vw);
  min-width: max(var(--touch-min), 46vw);
  padding: var(--space-panel-pad) calc(var(--space-panel-pad) * 2);
  border: none;
  border-radius: 12px;
  font-size: clamp(1.25rem, 5vw, 2rem);
  font-weight: 700;
  /* 按钮底色归 Story 1.7 的「应用化」：色板 §2 定的是**棋盘与棋子**的颜色，
     启动页属于应用外壳，它的品牌配色要连同构图一起看（见 art-direction §3）。 */
  background-color: ButtonFace;
  color: ButtonText;
  transition: transform var(--dur-fast) ease-out;
}

/* 按下反馈必须 ≤100ms（FR78 / NFR5）。保证它的是 base.css 里的
   touch-action: manipulation —— 那个是即时的，去掉浏览器 300ms tap delay。
   这里的 transition 控的是缩放动画的爬升时长（--dur-fast = 120ms），
   不是「按下到视觉变化」的延迟，两者不是同一件事。 */
.start-button:active {
  transform: scale(0.97);
}
</style>
