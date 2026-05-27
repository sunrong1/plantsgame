import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Determine viewport size
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

// Always use portrait mode with FIT scaling - game stays 720x1280
// On desktop/landscape, it will be scaled up proportionally
const gameWidth = 720;
const gameHeight = 1280;

// Initialize Phaser game (BootScene starts the scene chain)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: gameWidth,
  height: gameHeight,
  parent: 'game-container',
  backgroundColor: '#87CEEB',
  scene: [BootScene],
  scale: {
    mode: Phaser.Scale.ScaleModes.RESIZE,
    autoCenter: Phaser.Scale.Center.CENTER_BOTH,
  },
  render: {
    antialias: false,
    pixelArt: false,
    roundPixels: false,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

// Expose game instance for Vue components to access
(window as any).phaserGame = game;

// Dispatch initial resize event
setTimeout(() => {
  window.dispatchEvent(new CustomEvent('game:resize', {
    detail: { width: gameWidth, height: gameHeight }
  }));
}, 100);

export default game;