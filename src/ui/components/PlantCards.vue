<script setup lang="ts">
import { dispatchSpeechLearnEvent } from '../bridge';

defineProps<{
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

const onCardClick = (plantType: string) => {
  emit('select', plantType);
  dispatchSpeechLearnEvent(plantType); // NEW: trigger English learning
};
</script>

<template>
  <div class="plant-cards">
    <div
      v-for="plant in plants"
      :key="plant.type"
      class="plant-card"
      :class="{
        'selected': selectedPlant === plant.type,
        'disabled': !canAfford(plant.cost)
      }"
      @click="onCardClick(plant.type)"
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
</template>

<style scoped>
.plant-cards {
  position: absolute;
  /* Position at top of screen, well above the grid area */
  top: 20px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm, 12px);
  padding: 0 var(--spacing-md, 16px);
  z-index: 10;
}

.plant-card {
  width: 70px;
  height: 85px;
  background: var(--color-card-bg, #2D5A27);
  border: 3px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius, 12px);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs, 6px);
  cursor: pointer;
  transition: transform var(--transition-fast, 150ms ease-out),
              border-color var(--transition-fast, 150ms ease-out),
              box-shadow var(--transition-fast, 150ms ease-out);
}

.plant-card:hover {
  transform: translateY(-3px);
  border-color: var(--color-card-hover, #3D7A37);
  box-shadow: var(--shadow-lg, 0 6px 0 rgba(0,0,0,0.25));
}

.plant-card.selected {
  border-color: var(--color-card-selected, #4CAF50);
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.4),
             var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  transform: translateY(-4px);
}

.plant-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plant-card.disabled:hover {
  transform: none;
  border-color: var(--color-card-border, #4A8B3C);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
}

.card-icon {
  font-size: 28px;
  line-height: 1;
  transition: transform 0.15s ease;
}

.plant-card:active .card-icon {
  transform: scale(1.15);
}

.card-name {
  font-size: 10px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
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
  font-size: 10px;
  color: var(--color-sunlight, #FFD700);
}

.cost-value {
  font-size: 11px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
}
</style>