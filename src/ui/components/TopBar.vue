<script setup lang="ts">
defineProps<{
  sunlight: number;
  wave: number;
  totalWaves: number;
}>();
</script>

<template>
  <div class="top-bar">
    <div class="sunlight-display">
      <div class="sunlight-icon">☀</div>
      <span class="sunlight-value">{{ sunlight }}</span>
    </div>

    <div class="wave-display">
      <span class="wave-label">波次</span>
      <span class="wave-value">{{ wave }}/{{ totalWaves }}</span>
    </div>
  </div>
</template>

<style scoped>
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--topbar-height, 60px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--spacing-md, 16px);
  background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 100%);
}

.sunlight-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  background: var(--color-card-bg, #2D5A27);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
  border-radius: var(--border-radius, 12px);
  border: 3px solid var(--color-card-border, #4A8B3C);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
}

.sunlight-icon {
  font-size: 24px;
  color: var(--color-sunlight, #FFD700);
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.sunlight-value {
  font-size: 20px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
}

.wave-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  background: var(--color-card-bg, #2D5A27);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
  border-radius: var(--border-radius, 12px);
  border: 3px solid var(--color-card-border, #4A8B3C);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
}

.wave-label {
  font-size: 14px;
  color: var(--color-text-secondary, #B8F0A8);
}

.wave-value {
  font-size: 18px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
}
</style>