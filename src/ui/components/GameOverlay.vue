<script setup lang="ts">
defineProps<{
  state: 'won' | 'lost';
}>();

const emit = defineEmits<{
  (e: 'restart'): void;
}>();
</script>

<template>
  <div class="game-overlay">
    <div class="overlay-content">
      <div class="result-icon">{{ state === 'won' ? '🏆' : '💀' }}</div>
      <h1 class="result-title">{{ state === 'won' ? '胜利!' : '失败...' }}</h1>
      <button class="restart-btn" @click="emit('restart')">
        点击重新开始
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--z-overlay, 100);
}

.overlay-content {
  background: var(--color-card-bg, #2D5A27);
  border: 4px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius, 12px);
  box-shadow: var(--shadow-lg, 0 6px 0 rgba(0,0,0,0.25));
  padding: var(--spacing-xl, 32px) 64px;
  text-align: center;
}

.result-icon {
  font-size: 64px;
  margin-bottom: var(--spacing-md, 16px);
}

.result-title {
  font-size: 48px;
  font-weight: var(--font-weight-black, 900);
  color: var(--color-text, #FFFFFF);
  margin-bottom: var(--spacing-lg, 24px);
  text-shadow: 0 4px 8px rgba(0,0,0,0.3);
}

.restart-btn {
  background: var(--color-card-selected, #4CAF50);
  border: 3px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius-sm, 8px);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  padding: var(--spacing-md, 16px) var(--spacing-xl, 32px);
  font-size: 24px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
  cursor: pointer;
  transition: transform var(--transition-fast, 150ms ease-out);
}

.restart-btn:hover {
  transform: translateY(-2px);
}

.restart-btn:active {
  transform: translateY(2px);
  box-shadow: var(--shadow-sm, 0 2px 0 rgba(0,0,0,0.2));
}
</style>