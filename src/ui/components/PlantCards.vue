<script setup lang="ts">
import { dispatchSpeechLearnEvent } from '../bridge';

defineProps<{
  sunlight: number;
  wave: number;
  totalWaves: number;
  plants: Array<{
    type: string;
    name: string;
    cost: number;
    description: string;
  }>;
  selectedPlant: string | null;
  canAfford: (cost: number) => boolean;
}>();

const emit = defineEmits<{
  (e: 'select', plantType: string): void;
}>();

const onCardClick = (plantType: string, cost: number) => {
  emit('select', plantType);
  dispatchSpeechLearnEvent(plantType);
};
</script>

<template>
  <div class="resource-bar" data-testid="resource-bar">
    <!-- Sunlight Display -->
    <div class="resource-item sunlight-item">
      <span class="sun-icon">☀</span>
      <span class="sun-value">{{ sunlight }}</span>
    </div>

    <!-- Wave Display -->
    <div class="resource-item wave-item">
      <span class="wave-label">波</span>
      <span class="wave-value">{{ wave }}/{{ totalWaves }}</span>
    </div>

    <!-- Plant Cards -->
    <div class="plant-cards">
      <div
        v-for="plant in plants"
        :key="plant.type"
        class="plant-card"
        :class="{
          'selected': selectedPlant === plant.type,
          'disabled': !canAfford(plant.cost)
        }"
        @click="onCardClick(plant.type, plant.cost)"
      >
        <div class="card-icon">
          <span class="plant-emoji">{{ plant.type === 'peashooter' ? '🌱' : plant.type === 'sunflower' ? '🌻' : plant.type === 'wallnut' ? '🥜' : '💣' }}</span>
        </div>
        <div class="card-name">{{ plant.name }}</div>
        <div class="card-cost">
          <span class="cost-icon">☀</span>
          <span class="cost-value">{{ plant.cost }}</span>
        </div>
      </div>
    </div>

    <slot name="actions" />
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px;
  background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 100%);
  border-radius: 12px;
  pointer-events: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-card-bg, #2D5A27);
  padding: 8px 14px;
  border-radius: 10px;
  border: 2px solid var(--color-card-border, #4A8B3C);
  box-shadow: 0 3px 0 rgba(0,0,0,0.2);
}

.sunlight-item {
  min-width: 70px;
}

.sun-icon {
  font-size: 20px;
  color: var(--color-sunlight, #FFD700);
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.sun-value {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
}

.wave-item {
  min-width: 60px;
}

.wave-label {
  font-size: 12px;
  color: var(--color-text-secondary, #B8F0A8);
}

.wave-value {
  font-size: 16px;
  font-weight: 700;
  color: #FFFFFF;
}

.plant-cards {
  display: flex;
  gap: 10px;
}

.plant-card {
  width: 65px;
  height: 80px;
  background: var(--color-card-bg, #2D5A27);
  border: 3px solid var(--color-card-border, #4A8B3C);
  border-radius: 12px;
  box-shadow: 0 4px 0 rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 6px;
  cursor: pointer;
  transition: transform 150ms ease-out, border-color 150ms ease-out, box-shadow 150ms ease-out;
}

.plant-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-card-hover, #3D7A37);
  box-shadow: 0 6px 0 rgba(0,0,0,0.25);
}

.plant-card.selected {
  border-color: var(--color-card-selected, #4CAF50);
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.4), 0 4px 0 rgba(0,0,0,0.2);
  transform: translateY(-4px);
}

.plant-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plant-card.disabled:hover {
  transform: none;
  border-color: var(--color-card-border, #4A8B3C);
  box-shadow: 0 4px 0 rgba(0,0,0,0.2);
}

.card-icon {
  font-size: 26px;
  line-height: 1;
  transition: transform 0.15s ease;
}

.plant-card:active .card-icon {
  transform: scale(1.15);
}

.card-name {
  font-size: 9px;
  font-weight: 700;
  color: #FFFFFF;
  text-align: center;
}

.card-cost {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(0,0,0,0.3);
  padding: 2px 5px;
  border-radius: 6px;
}

.cost-icon {
  font-size: 9px;
  color: var(--color-sunlight, #FFD700);
}

.cost-value {
  font-size: 10px;
  font-weight: 700;
  color: #FFFFFF;
}
</style>