<script setup lang="ts">
import { GameEvents } from '../bridge';

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'resume'): void;
}>();

function onResume() {
  emit('resume');
  window.dispatchEvent(new CustomEvent(GameEvents.PAUSE_TOGGLE));
}
</script>

<template>
  <div
    v-if="visible"
    class="pause-overlay"
    data-testid="pause-overlay"
    @click.stop="onResume"
  >
    <div class="pause-card" @click.stop>
      <div class="pause-icon">⏸</div>
      <div class="pause-title">已暂停</div>
      <div class="pause-hint">点击继续 / 按 ESC</div>
      <button
        class="resume-button"
        type="button"
        data-testid="resume-button"
        @click.stop="onResume"
      >
        继续游戏
      </button>
    </div>
  </div>
</template>

<style scoped>
.pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  pointer-events: auto;
  animation: fadeIn 180ms ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pause-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 32px 48px;
  background: linear-gradient(180deg, #2D5A27 0%, #1E3F1A 100%);
  border: 3px solid #4A8B3C;
  border-radius: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  min-width: 280px;
  pointer-events: auto;
}

.pause-icon {
  font-size: 64px;
  line-height: 1;
  color: #FFD700;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
}

.pause-title {
  font-size: 28px;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 2px;
}

.pause-hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.resume-button {
  margin-top: 8px;
  padding: 12px 36px;
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  background: #4CAF50;
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 0 #2E7D32;
  cursor: pointer;
  transition: transform 100ms ease-out, box-shadow 100ms ease-out;
  pointer-events: auto;
}

.resume-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 #2E7D32;
}

.resume-button:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #2E7D32;
}
</style>
