import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Determine viewport size
const viewportWidth = window.innerWidth;
const isDesktop = viewportWidth > 1024;

// On desktop, render at 2x resolution so game appears bigger
// Game logic stays at 720x1280, but rendering at 1440x2560
const gameWidth = isDesktop ? 1440 : 720;
const gameHeight = isDesktop ? 2560 : 1280;

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