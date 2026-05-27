<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
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

// Position and scale state
const canvasLeft = ref(0);
const canvasTop = ref(0);
const uiScale = ref(1);
const gameWidth = ref(720);
const gameHeight = ref(1280);

// Computed style object for inline styling
const gameUIStyle = computed(() => ({
  left: `${canvasLeft.value}px`,
  top: `${canvasTop.value}px`,
  transform: `scale(${uiScale.value})`,
  transformOrigin: 'top left',
  width: `${gameWidth.value}px`,
  height: `${gameHeight.value}px`,
}));

function updateCanvasPosition() {
  const gameCanvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  if (gameCanvas) {
    const rect = gameCanvas.getBoundingClientRect();
    canvasLeft.value = rect.left;
    canvasTop.value = rect.top;
    uiScale.value = rect.width / gameWidth.value;
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

// Listen to game resize events
function onGameResize(data: { width: number; height: number }) {
  gameWidth.value = data.width;
  gameHeight.value = data.height;
  setTimeout(updateCanvasPosition, 50);
}

onMounted(() => {
  setTimeout(updateCanvasPosition, 100);
  window.addEventListener('resize', updateCanvasPosition);

  // Listen for game resize from Phaser
  window.addEventListener('game:resize', ((e: CustomEvent) => onGameResize(e.detail)) as EventListener);

  window.addEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.addEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasPosition);
  window.removeEventListener('game:resize', ((e: CustomEvent) => onGameResize(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.removeEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
});
</script>

<template>
  <div class="game-ui" :style="gameUIStyle">
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
  pointer-events: none;
}

.game-ui > * {
  pointer-events: auto;
}
</style>