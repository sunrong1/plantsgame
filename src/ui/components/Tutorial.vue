<script setup lang="ts">
const emit = defineEmits<{
  (e: 'start'): void;
}>();
</script>

<template>
  <div class="tutorial-overlay">
    <div class="tutorial-content">
      <h1 class="tutorial-title">🌻 植物大战僵尸 🌻</h1>
      <p class="tutorial-subtitle">欢迎来到花园！</p>

      <div class="guide-section">
        <h3>游戏目标</h3>
        <p>阻止僵尸进入你的房子！</p>
      </div>

      <div class="guide-section">
        <h3>操作说明</h3>
        <ul>
          <li>点击底部植物卡片选择</li>
          <li>点击空格子种植</li>
          <li>收集阳光购买更多植物</li>
        </ul>
      </div>

      <div class="plant-guide">
        <div class="plant-item">
          <span class="plant-icon">🌱</span>
          <span>豌豆射手 - 100阳光</span>
        </div>
        <div class="plant-item">
          <span class="plant-icon">🌻</span>
          <span>向日葵 - 50阳光</span>
        </div>
        <div class="plant-item">
          <span class="plant-icon">🥜</span>
          <span>坚果墙 - 50阳光</span>
        </div>
        <div class="plant-item">
          <span class="plant-icon">💣</span>
          <span>樱桃炸弹 - 150阳光</span>
        </div>
      </div>

      <button class="start-btn" @click="emit('start')">
        开始游戏
      </button>
    </div>
  </div>
</template>

<style scoped>
.tutorial-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--z-overlay, 100);
}

.tutorial-content {
  background: var(--color-card-bg, #2D5A27);
  border: 4px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius, 12px);
  box-shadow: var(--shadow-lg, 0 6px 0 rgba(0,0,0,0.25));
  padding: var(--spacing-lg, 24px);
  max-width: 400px;
  text-align: center;
}

.tutorial-title {
  font-size: 28px;
  font-weight: var(--font-weight-black, 900);
  color: var(--color-text, #FFFFFF);
  margin-bottom: var(--spacing-xs, 4px);
  text-shadow: 0 3px 6px rgba(0,0,0,0.3);
}

.tutorial-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary, #B8F0A8);
  margin-bottom: var(--spacing-lg, 24px);
}

.guide-section {
  margin-bottom: var(--spacing-md, 16px);
  text-align: left;
}

.guide-section h3 {
  font-size: 14px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-sunlight, #FFD700);
  margin-bottom: var(--spacing-xs, 4px);
}

.guide-section p,
.guide-section li {
  font-size: 14px;
  color: var(--color-text, #FFFFFF);
}

.guide-section ul {
  margin: 0;
  padding-left: 20px;
}

.plant-guide {
  background: rgba(0,0,0,0.2);
  border-radius: var(--border-radius-sm, 8px);
  padding: var(--spacing-md, 16px);
  margin-bottom: var(--spacing-lg, 24px);
}

.plant-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  font-size: 13px;
  color: var(--color-text, #FFFFFF);
  margin-bottom: var(--spacing-xs, 4px);
}

.plant-item:last-child {
  margin-bottom: 0;
}

.plant-icon {
  font-size: 18px;
}

.start-btn {
  background: var(--color-card-selected, #4CAF50);
  border: 3px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius-sm, 8px);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  padding: var(--spacing-md, 16px) var(--spacing-xl, 32px);
  font-size: 20px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
  cursor: pointer;
  transition: transform var(--transition-fast, 150ms ease-out);
}

.start-btn:hover {
  transform: translateY(-2px);
}

.start-btn:active {
  transform: translateY(2px);
  box-shadow: var(--shadow-sm, 0 2px 0 rgba(0,0,0,0.2));
}
</style>