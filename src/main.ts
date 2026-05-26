import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Initialize Phaser game (BootScene starts the scene chain)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 720,
  height: 1280,
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

export default game;