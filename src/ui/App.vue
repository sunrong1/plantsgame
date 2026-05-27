<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import TopBar from './components/TopBar.vue';
import PlantCards from './components/PlantCards.vue';
import GameOverlay from './components/GameOverlay.vue';
import Tutorial from './components/Tutorial.vue';
import { GameEvents } from './bridge';

// Game state from Phaser
const sunlight = ref(150);
const currentWave = ref(0);
const totalWaves = ref(3);
const selectedPlant = ref<string | null>(null);
const gameState = ref<'playing' | 'won' | 'lost'>('playing');
const showTutorial = ref(true);

// UI scale factor
const uiScale = ref(1);

function updateUIScale() {
  const gameCanvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  if (gameCanvas) {
    const rect = gameCanvas.getBoundingClientRect();
    // Scale UI to match the actual rendered game size
    // Game base is 720x1280
    uiScale.value = rect.width / 720;
    document.documentElement.style.setProperty('--ui-scale', uiScale.value.toString());
  }
}

// Plant data
const plants = [
  { type: 'peashooter', name: '豌豆射手', cost: 100, description: '射击豌豆' },
  { type: 'sunflower', name: '向日葵', cost: 50, description: '生产阳光' },
  { type: 'wallnut', name: '坚果', cost: 50, description: '阻挡僵尸' },
  { type: 'cherrybomb', name: '樱桃炸弹', cost: 150, description: '爆炸范围' },
];

const canAfford = (cost: number) => sunlight.value >= cost;

function onPlantSelect(plantType: string) {
  selectedPlant.value = selectedPlant.value === plantType ? null : plantType;
  window.dispatchEvent(new CustomEvent(GameEvents.PLANT_SELECTED, { detail: plantType }));
}

function onStartGame() {
  showTutorial.value = false;
}

function handleSunlightChange(detail: { sunlight: number }) {
  sunlight.value = detail.sunlight;
}

function handleWaveStarted(detail: { wave: number; total: number }) {
  currentWave.value = detail.wave;
  totalWaves.value = detail.total;
}

function handleWaveCompleted(detail: { wave: number; total: number }) {
  currentWave.value = detail.wave;
  totalWaves.value = detail.total;
}

function handleGameWon() {
  gameState.value = 'won';
}

function handleGameLost() {
  gameState.value = 'lost';
}

function handleRestart() {
  location.reload();
}

onMounted(() => {
  // Initial scale
  updateUIScale();

  // Listen for resize
  window.addEventListener('resize', updateUIScale);

  // Also listen for Phaser game ready
  window.addEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.addEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateUIScale);
  window.removeEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.removeEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
});
</script>

<template>
  <div class="game-ui">
    <TopBar
      :sunlight="sunlight"
      :wave="currentWave"
      :total-waves="totalWaves"
    />

    <PlantCards
      :plants="plants"
      :selected-plant="selectedPlant"
      :can-afford="canAfford"
      @select="onPlantSelect"
    />

    <GameOverlay
      v-if="gameState !== 'playing'"
      :state="gameState"
      @restart="handleRestart"
    />

    <Tutorial
      v-if="showTutorial && gameState === 'playing'"
      @start="onStartGame"
    />
  </div>
</template>

<style scoped>
.game-ui {
  position: absolute;
  top: 0;
  left: 0;
  width: 720px;
  height: 1280px;
  transform-origin: top left;
  transform: scale(var(--ui-scale, 1));
}
</style>