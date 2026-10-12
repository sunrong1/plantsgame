<script setup lang="ts">
/**
 * StartView —— 启动界面。
 *
 * AC-1 的验收对象：游戏名 + 页面最大、最易点的「开始游戏」按钮。
 *
 * 刻意不做的事（见 Story Dev Notes §10）：
 *   - 不引 vue-router —— 本 story 只有一个视图，view 切换属 Story 1.15
 *   - 不做任何选关 / 单元选择入口 —— FR59 / OUT-OF-SCOPE-5
 *   - 不实现音频解锁 / TTS —— 属 Story 1.2，且须走 app/effects-runner.ts
 *   - 不含任何战斗规则计算 —— 架构硬约束 2（此文件零计算）
 */
import { ref } from 'vue'

/**
 * 「开始游戏」的空实现。
 *
 * TODO(Story 1.2): 在此同步完成 audioCtx.resume() + TTS preheat + BGM buffer，
 * 三者之间不得 await（架构决策 4 / 硬约束 8）。
 * 落地时音效必须经由 app/effects-runner.ts，组件内不得自行播音效。
 */
const starting = ref(false)

function onStart(): void {
  // TODO(Story 1.2): 音频解锁 + TTS preheat —— 同步完成，三者间不得 await
  starting.value = false
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
      :disabled="starting"
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
  /* 色板属 Story 1.6，此处先用系统文字色，不预设品牌配色 */
  color: CanvasText;
}

/*
 * AC-1：这是页面上最大、最易点的目标。
 * min-height 用 --touch-min（48px）打底，实际给到 ~88px，
 * 因为目标设备是家长单手拿着的平板，不是鼠标。
 */
.start-button {
  min-height: max(var(--touch-min), 22vw);
  min-width: max(var(--touch-min), 46vw);
  padding: var(--space-panel-pad) calc(var(--space-panel-pad) * 2);
  border: none;
  border-radius: 12px;
  font-size: clamp(1.25rem, 5vw, 2rem);
  font-weight: 700;
  /* 色板属 Story 1.6：暂用系统控件色，不预设品牌配色 */
  background-color: ButtonFace;
  color: ButtonText;
  transition: transform var(--dur-fast) ease-out;
}

/* 按下反馈必须 ≤100ms（FR78 / NFR5）—— --dur-fast = 120ms，
   transform 不触发重排，实机上更早出现视觉变化 */
.start-button:active:not(:disabled) {
  transform: scale(0.97);
}

.start-button:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>