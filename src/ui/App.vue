<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import PlantCards from './components/PlantCards.vue';
import GameOverlay from './components/GameOverlay.vue';
import Tutorial from './components/Tutorial.vue';
import SpeechOverlay from './components/SpeechOverlay.vue';
import RotatePrompt from './components/RotatePrompt.vue';
import PauseButton from './components/PauseButton.vue';
import PauseOverlay from './components/PauseOverlay.vue';
import { speechService } from '../systems/SpeechService';
import { GameEvents } from './bridge';

// Game state from Phaser
const sunlight = ref(100);
const currentWave = ref(0);
const totalWaves = ref(3);
const selectedPlant = ref<string | null>(null);
const gameState = ref<'playing' | 'won' | 'lost'>('playing');
const showTutorial = ref(true);
const speechVisible = ref(false);
const speechWord = ref('');
const isPaused = ref(false);

// Position and scale state
const canvasLeft = ref(0);
const canvasTop = ref(0);
const uiScale = ref(1);
const canvasWidth = ref(720);
const canvasHeight = ref(1280);

// Grid info from game (set by Phaser)
const gridOffsetY = ref(150); // Default fallback
const gridHeight = ref(400);  // 5 rows * 80px

// Computed style object for inline styling
// .game-ui uses internal 720x1280 coordinates; the transform scales it to match the canvas
const gameUIStyle = computed(() => ({
  left: `${canvasLeft.value}px`,
  top: `${canvasTop.value}px`,
  transform: `scale(${uiScale.value})`,
  transformOrigin: 'top left',
  width: `720px`,
  height: `1280px`,
}));

// Layout computed values - positioned in internal 720x1280 space; transform handles scaling
const resourceBarStyle = computed(() => ({
  top: `${gridOffsetY.value - 120}px`, // Above grid with 24px buffer (bar height ~96px) - leaves breathing room on FHD+ portrait
}));

// Speech overlay below grid
const speechOverlayStyle = computed(() => ({
  top: `${gridOffsetY.value + gridHeight.value + 10}px`, // Just below grid
}));

function updateCanvasPosition() {
  const gameCanvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  if (gameCanvas) {
    const rect = gameCanvas.getBoundingClientRect();
    canvasLeft.value = rect.left;
    canvasTop.value = rect.top;
    canvasWidth.value = rect.width;
    canvasHeight.value = rect.height;
    // Scale UI elements to match the canvas display size so layout tracks
    // the Phaser FIT letterbox rather than fighting it.
    uiScale.value = rect.width / 720;
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
  speechService.enable(); // Enable speech after user interaction
  speechService.preheat(); // Unlock Android audio session in this user gesture
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

function handleSpeechLearn(detail: string) {
  const content = speechService.getContent(detail);
  if (content) {
    speechWord.value = content.word;
    speechVisible.value = true;
    speechService.speak(content);
  }
}

function handleRestart() {
  location.reload();
}

function handlePauseChanged(detail: { paused: boolean }) {
  isPaused.value = detail.paused;
}

function onPauseButtonClick() {
  // Toggle is dispatched via the button's @click handler (see PauseButton.vue).
  // The PAUSE_CHANGED listener will flip isPaused.
}

// Listen to game resize events
function onGameResize(data: { width: number; height: number }) {
  // Game internally scales, UI just tracks canvas position
  setTimeout(updateCanvasPosition, 50);
}

// Listen for grid info from Phaser
function onGridInfo(data: { offsetY: number; gridHeight: number }) {
  gridOffsetY.value = data.offsetY;
  gridHeight.value = data.gridHeight;
}

onMounted(() => {
  setTimeout(updateCanvasPosition, 100);
  window.addEventListener('resize', updateCanvasPosition);

  // Listen for game resize from Phaser
  window.addEventListener('game:resize', ((e: CustomEvent) => onGameResize(e.detail)) as EventListener);
  window.addEventListener('game:grid-info', ((e: CustomEvent) => onGridInfo(e.detail)) as EventListener);

  window.addEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.addEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.addEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
  window.addEventListener(GameEvents.SPEECH_LEARN, ((e: CustomEvent) => {
    handleSpeechLearn(e.detail);
  }) as EventListener);
  window.addEventListener(GameEvents.PAUSE_CHANGED, ((e: CustomEvent) => handlePauseChanged(e.detail)) as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasPosition);
  window.removeEventListener('game:resize', ((e: CustomEvent) => onGameResize(e.detail)) as EventListener);
  window.removeEventListener('game:grid-info', ((e: CustomEvent) => onGridInfo(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.SUNLIGHT_CHANGED, ((e: CustomEvent) => handleSunlightChange(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_STARTED, ((e: CustomEvent) => handleWaveStarted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.WAVE_COMPLETED, ((e: CustomEvent) => handleWaveCompleted(e.detail)) as EventListener);
  window.removeEventListener(GameEvents.GAME_WON, handleGameWon as EventListener);
  window.removeEventListener(GameEvents.GAME_LOST, handleGameLost as EventListener);
  window.removeEventListener(GameEvents.SPEECH_LEARN, ((e: CustomEvent) => {
    handleSpeechLearn(e.detail);
  }) as EventListener);
  window.removeEventListener(GameEvents.PAUSE_CHANGED, ((e: CustomEvent) => handlePauseChanged(e.detail)) as EventListener);
});
</script>

<template>
  <div class="game-ui" :style="gameUIStyle">
    <!-- Resource bar: sunlight + wave + plant cards, positioned above grid -->
    <PlantCards
      :sunlight="sunlight"
      :wave="currentWave"
      :total-waves="totalWaves"
      :plants="plants"
      :selected-plant="selectedPlant"
      :can-afford="canAfford"
      class="resource-bar-aligned"
      :style="resourceBarStyle"
      @select="onPlantSelect"
    >
      <template #actions>
        <PauseButton
          v-if="gameState === 'playing' && !showTutorial"
          :paused="isPaused"
          class="pause-button-slot"
          @toggle="onPauseButtonClick"
        />
      </template>
    </PlantCards>

    <PauseOverlay
      v-if="isPaused && gameState === 'playing'"
      :visible="isPaused"
      @resume="isPaused = false"
    />

    <GameOverlay
      v-if="gameState !== 'playing'"
      :state="gameState"
      @restart="handleRestart"
    />

    <SpeechOverlay
      v-if="speechVisible"
      :visible="speechVisible"
      :word="speechWord"
      class="speech-overlay-aligned"
      :style="speechOverlayStyle"
      @done="speechVisible = false"
    />

    <Tutorial
      v-if="showTutorial && gameState === 'playing'"
      @start="onStartGame"
    />

    <RotatePrompt />

    <div class="version-label">v5.32.1</div>
  </div>
</template>

<style scoped>
.game-ui {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* UI elements that should receive events get pointer-events: auto */
.game-ui > .resource-bar-aligned {
  pointer-events: auto;
}

.resource-bar-aligned {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 10;
}

.speech-overlay-aligned {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.version-label {
  position: absolute;
  bottom: 8px;
  left: 12px;
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
</style>