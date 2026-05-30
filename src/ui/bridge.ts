// Event bridge between Phaser (PlayScene) and Vue
// Dispatch custom DOM events that Vue can listen to

export const GameEvents = {
  // Sunlight changed
  SUNLIGHT_CHANGED: 'game:sunlight-changed',

  // Wave started/completed
  WAVE_STARTED: 'game:wave-started',
  WAVE_COMPLETED: 'game:wave-completed',

  // Game over
  GAME_WON: 'game:won',
  GAME_LOST: 'game:lost',

  // Plant selected (from Vue to Phaser)
  PLANT_SELECTED: 'game:plant-selected',
  PLANT_DESELECTED: 'game:plant-deselected',

  // Speech learning event
  SPEECH_LEARN: 'game:speech-learn',

  // Grid info (from Phaser to Vue)
  GRID_INFO: 'game:grid-info',
} as const;

// Helper to dispatch events
export function dispatchGameEvent(event: string, detail?: any) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

export function dispatchSpeechLearnEvent(key: string) {
  window.dispatchEvent(new CustomEvent(GameEvents.SPEECH_LEARN, { detail: key }));
}

// Helper to listen for events (for Vue)
export function onGameEvent(event: string, callback: (detail?: any) => void) {
  window.addEventListener(event, (e) => callback((e as CustomEvent).detail));
}

export function offGameEvent(event: string, callback: (detail?: any) => void) {
  window.removeEventListener(event, (e) => callback((e as CustomEvent).detail));
}