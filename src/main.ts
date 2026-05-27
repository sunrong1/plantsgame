import { createApp } from 'vue';
import { BootScene } from './scenes/BootScene';
import App from './ui/App.vue';
import './ui/styles/variables.css';

// Create Vue app and mount to #ui-overlay
const app = createApp(App);
app.mount('#ui-overlay');

// Determine viewport size at runtime
function getGameConfig() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isDesktop = viewportWidth > 1024;

  // Desktop gets larger canvas for better visibility
  if (isDesktop) {
    // Use RESIZE mode to fill the viewport
    return {
      phaserWidth: viewportWidth,
      phaserHeight: viewportHeight,
      scaleMode: Phaser.Scale.ScaleModes.RESIZE,
      gameWidth: viewportWidth,
      gameHeight: viewportHeight,
    };
  }

  // Mobile/tablet uses 720x1280 with FIT mode
  return {
    phaserWidth: 720,
    phaserHeight: 1280,
    scaleMode: Phaser.Scale.ScaleModes.FIT,
    gameWidth: 720,
    gameHeight: 1280,
  };
}

const gameConfig = getGameConfig();

// Initialize Phaser game (BootScene starts the scene chain)
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: gameConfig.phaserWidth,
  height: gameConfig.phaserHeight,
  parent: 'game-container',
  backgroundColor: '#87CEEB',
  scene: [BootScene],
  scale: {
    mode: gameConfig.scaleMode,
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
    detail: { width: gameConfig.gameWidth, height: gameConfig.gameHeight }
  }));
}, 100);

export default game;