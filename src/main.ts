import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Get viewport dimensions
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

// Calculate game size - try to fill more of the screen on desktop
// Base game is 720x1280 (portrait)
// On desktop with landscape viewport, we want to scale up

// Determine if this is a desktop viewport (landscape and larger than tablet)
const isDesktop = viewportWidth > 1024 && viewportHeight > 600;

// For desktop, use larger game dimensions while maintaining aspect ratio
const gameWidth = isDesktop ? 1080 : 720;
const gameHeight = isDesktop ? 1920 : 1280;

// Initialize Phaser game (BootScene starts the scene chain)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: gameWidth,
  height: gameHeight,
  parent: 'game-container',
  backgroundColor: '#87CEEB',
  scene: [BootScene],
  scale: {
    mode: Phaser.Scale.ScaleModes.FIT,
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