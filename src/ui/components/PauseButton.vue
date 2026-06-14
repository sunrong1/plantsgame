<script setup lang="ts">
import { GameEvents } from '../bridge';

defineProps<{
  paused: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

function handleClick(e: Event) {
  e.stopPropagation();
  emit('toggle');
  window.dispatchEvent(new CustomEvent(GameEvents.PAUSE_TOGGLE));
}
</script>

<template>
  <button
    class="pause-button"
    :class="{ paused }"
    :aria-label="paused ? '继续' : '暂停'"
    data-testid="pause-button"
    type="button"
    @click="handleClick"
  >
    <span v-if="!paused" class="icon">⏸</span>
    <span v-else class="icon">▶</span>
  </button>
</template>

<style scoped>
.pause-button {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 2px solid var(--color-card-border, #4A8B3C);
  background: var(--color-card-bg, #2D5A27);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2);
  color: #FFFFFF;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 150ms ease-out, border-color 150ms ease-out, box-shadow 150ms ease-out;
  pointer-events: auto;
  flex-shrink: 0;
}

.pause-button:hover {
  transform: translateY(-2px);
  border-color: var(--color-card-hover, #3D7A37);
  box-shadow: 0 5px 0 rgba(0, 0, 0, 0.25);
}

.pause-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

.pause-button.paused {
  border-color: var(--color-card-selected, #4CAF50);
}

.icon {
  line-height: 1;
}
</style>
