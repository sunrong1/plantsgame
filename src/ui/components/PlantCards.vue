<script setup lang="ts">
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
      @click="emit('select', plant.type)"
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
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--spacing-sm, 8px);
  padding: var(--spacing-sm, 8px);
}

.plant-card {
  width: var(--card-width, 80px);
  height: var(--card-height, 100px);
  background: var(--color-card-bg, #2D5A27);
  border: 3px solid var(--color-card-border, #4A8B3C);
  border-radius: var(--border-radius, 12px);
  box-shadow: var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm, 8px);
  cursor: pointer;
  transition: transform var(--transition-fast, 150ms ease-out),
              border-color var(--transition-fast, 150ms ease-out),
              box-shadow var(--transition-fast, 150ms ease-out);
}

.plant-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-card-hover, #3D7A37);
  box-shadow: var(--shadow-lg, 0 6px 0 rgba(0,0,0,0.25));
}

.plant-card.selected {
  border-color: var(--color-card-selected, #4CAF50);
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.4),
             var(--shadow-md, 0 4px 0 rgba(0,0,0,0.2));
  transform: translateY(-6px);
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
  font-size: 32px;
  line-height: 1;
}

.card-name {
  font-size: 11px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
  text-align: center;
}

.card-cost {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(0,0,0,0.3);
  padding: 2px 6px;
  border-radius: 8px;
}

.cost-icon {
  font-size: 12px;
  color: var(--color-sunlight, #FFD700);
}

.cost-value {
  font-size: 12px;
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text, #FFFFFF);
}
</style>