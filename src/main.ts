import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Determine viewport size at runtime
function getGameSize() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isDesktop = viewportWidth > 1024 && viewportHeight > 600;

  // Desktop gets larger game canvas for better visibility
  if (isDesktop) {
    return { width: 1080, height: 1920, scale: 1.5 };
  }
  return { width: 720, height: 1280, scale: 1 };
}

const gameSize = getGameSize();

// Initialize Phaser game (BootScene starts the scene chain)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: gameSize.width,
  height: gameSize.height,
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
    detail: { width: gameSize.width, height: gameSize.height }
  }));
}, 100);

export default game;