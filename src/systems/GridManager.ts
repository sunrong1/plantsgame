import Phaser from 'phaser';
import type { GridPosition } from '../types';
import { GAME_CONFIG } from '../config';

// STYLE_GUIDE colors
const CELL_LIGHT = 0xB8F0A8; // Light green #B8F0A8
const CELL_DARK = 0x8ED87A;  // Darker green #8ED87A
const GRID_LINE = 0xA0D68A; // Dotted line #A0D68A

// Flower colors (light pink, light yellow, light purple)
const FLOWER_COLORS = [0xFFB8D4, 0xFFF8B8, 0xE0B8FF];

export class GridManager {
  private scene: Phaser.Scene;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  private flowerGraphics!: Phaser.GameObjects.Graphics;
  private plantLayer: Phaser.GameObjects.Container;
  private grid: (string | null)[][];
  private hoverRow: number = -1;
  private hoverCol: number = -1;
  private previewSprite: Phaser.GameObjects.Image | null = null;
  private selectedPlantType: string | null = null;
  private cloudTweens: Phaser.Tweens.Tween[] = [];

  // Grid offset - more space at top for plant cards
  private offsetX = 25;
  private offsetY = 110; // Moved down to avoid overlapping plant cards

  // Track flower positions for redrawing
  private flowerCells: Set<string> = new Set();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.grid = this.createEmptyGrid();

    this.gridGraphics = scene.add.graphics();
    this.highlightGraphics = scene.add.graphics();
    this.flowerGraphics = scene.add.graphics();
    this.drawGrid();
    this.createClouds();

    this.plantLayer = scene.add.container(0, 0);

    this.setupHoverDetection();
  }

  private createClouds(): void {
    // Simple clouds made of overlapping circles
    const createCloud = (x: number, y: number, scale: number) => {
      const cloud = this.scene.add.graphics();
      cloud.fillStyle(0xFFFFFF, 0.7);

      // Main body
      cloud.fillCircle(0, 0, 20 * scale);
      cloud.fillCircle(25 * scale, -5 * scale, 15 * scale);
      cloud.fillCircle(50 * scale, 0, 20 * scale);
      cloud.fillCircle(15 * scale, 10 * scale, 12 * scale);
      cloud.fillCircle(35 * scale, 10 * scale, 12 * scale);

      cloud.setPosition(x, y);
      cloud.setDepth(-1);

      // Slow floating animation
      const tween = this.scene.tweens.add({
        targets: cloud,
        x: x + 30,
        duration: 8000 + Math.random() * 4000,
        ease: 'ease-in-out',
        yoyo: true,
        repeat: -1,
      });
      this.cloudTweens.push(tween);
    };

    // Create 3 clouds at different positions
    createCloud(80, 50, 0.6);
    createCloud(300, 40, 0.8);
    createCloud(450, 60, 0.5);
  }

  private setupHoverDetection(): void {
    let lastHoverTime = 0;
    const hoverThrottle = 50;

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const now = Date.now();
      if (now - lastHoverTime < hoverThrottle) return;
      lastHoverTime = now;

      if (pointer.y < 60) {
        this.clearHighlight();
        return;
      }

      const cell = this.getCellFromPixel(pointer.x, pointer.y);
      if (cell) {
        this.updateHighlight(cell.row, cell.col);
      } else {
        this.clearHighlight();
      }
    });

    this.scene.input.on('pointerdown', () => {
      this.clearHighlight();
    });
  }

  private updateHighlight(row: number, col: number): void {
    if (this.hoverRow === row && this.hoverCol === col) return;

    this.hoverRow = row;
    this.hoverCol = col;

    this.highlightGraphics.clear();

    const { cellSize } = GAME_CONFIG.grid;
    const x = this.offsetX + col * cellSize;
    const y = this.offsetY + row * cellSize;
    const isEmpty = this.isCellEmpty(row, col);

    if (isEmpty) {
      // Brighten empty cell with semi-transparent white overlay
      this.highlightGraphics.fillStyle(0xFFFFFF, 0.3);
      this.highlightGraphics.fillRect(x, y, cellSize, cellSize);
    }

    // Update preview sprite position if we have a selected plant
    if (this.previewSprite && isEmpty) {
      const pos = this.getGridPosition(row, col);
      this.previewSprite.setPosition(pos.x, pos.y);
      this.previewSprite.setVisible(true);
    }
  }

  private clearHighlight(): void {
    this.hoverRow = -1;
    this.hoverCol = -1;
    this.highlightGraphics.clear();
    if (this.previewSprite) {
      this.previewSprite.setVisible(false);
    }
  }

  private createEmptyGrid(): (string | null)[][] {
    return Array(GAME_CONFIG.grid.rows)
      .fill(null)
      .map(() => Array(GAME_CONFIG.grid.cols).fill(null));
  }

  private drawGrid(): void {
    const { cellSize, rows, cols } = GAME_CONFIG.grid;

    this.gridGraphics.clear();

    // Draw checkerboard pattern
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = this.offsetX + col * cellSize;
        const y = this.offsetY + row * cellSize;

        // Alternating colors (checkerboard)
        const isLight = (row + col) % 2 === 0;
        this.gridGraphics.fillStyle(isLight ? CELL_LIGHT : CELL_DARK, 1);
        this.gridGraphics.fillRect(x, y, cellSize, cellSize);
      }
    }

    // Draw dotted grid lines
    this.gridGraphics.lineStyle(2, GRID_LINE, 0.6);

    // Vertical lines
    for (let col = 0; col <= cols; col++) {
      const x = this.offsetX + col * cellSize;
      const startY = this.offsetY;
      const endY = this.offsetY + rows * cellSize;

      // Draw dashed line
      let y = startY;
      while (y < endY) {
        const dashLength = Math.min(6, endY - y);
        this.gridGraphics.lineBetween(x, y, x, y + dashLength);
        y += 10;
      }
    }

    // Horizontal lines
    for (let row = 0; row <= rows; row++) {
      const y = this.offsetY + row * cellSize;
      const startX = this.offsetX;
      const endX = this.offsetX + cols * cellSize;

      let x = startX;
      while (x < endX) {
        const dashLength = Math.min(6, endX - x);
        this.gridGraphics.lineBetween(x, y, x + dashLength, y);
        x += 10;
      }
    }
  }

  // Draw flower decoration on occupied cells
  drawFlowerAt(row: number, col: number): void {
    const { cellSize } = GAME_CONFIG.grid;
    const centerX = this.offsetX + col * cellSize + cellSize / 2;
    const centerY = this.offsetY + row * cellSize + cellSize / 2;
    const color = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];

    // Track this cell as having a flower
    this.flowerCells.add(`${row},${col}`);

    // Redraw all flowers (can't just append since we share one graphics object)
    this.redrawFlowers();
  }

  private redrawFlowers(): void {
    this.flowerGraphics.clear();

    for (const cellKey of this.flowerCells) {
      const [row, col] = cellKey.split(',').map(Number);
      const { cellSize } = GAME_CONFIG.grid;
      const centerX = this.offsetX + col * cellSize + cellSize / 2;
      const centerY = this.offsetY + row * cellSize + cellSize / 2;
      const color = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];

      // Center circle
      this.flowerGraphics.fillStyle(color, 0.9);
      this.flowerGraphics.fillCircle(centerX, centerY, 4);

      // 5 petals
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const petalX = centerX + Math.cos(angle) * 8;
        const petalY = centerY + Math.sin(angle) * 8;
        this.flowerGraphics.fillStyle(color, 0.7);
        this.flowerGraphics.fillCircle(petalX, petalY, 3);
      }
    }
  }

  isValidPosition(row: number, col: number): boolean {
    return (
      row >= 0 &&
      row < GAME_CONFIG.grid.rows &&
      col >= 0 &&
      col < GAME_CONFIG.grid.cols
    );
  }

  isCellEmpty(row: number, col: number): boolean {
    if (!this.isValidPosition(row, col)) return false;
    return this.grid[row][col] === null;
  }

  occupyCell(row: number, col: number, plantId: string): boolean {
    if (!this.isCellEmpty(row, col)) return false;
    this.grid[row][col] = plantId;
    this.drawFlowerAt(row, col); // Add flower decoration
    return true;
  }

  releaseCell(row: number, col: number): void {
    if (!this.isValidPosition(row, col)) return;
    this.grid[row][col] = null;
  }

  getCellOccupant(row: number, col: number): string | null {
    if (!this.isValidPosition(row, col)) return null;
    return this.grid[row][col];
  }

  getGridPosition(row: number, col: number): { x: number; y: number } {
    const { cellSize } = GAME_CONFIG.grid;
    return {
      x: this.offsetX + col * cellSize + cellSize / 2,
      y: this.offsetY + row * cellSize + cellSize / 2,
    };
  }

  getCellFromPixel(x: number, y: number): GridPosition | null {
    const { cellSize } = GAME_CONFIG.grid;
    const col = Math.floor((x - this.offsetX) / cellSize);
    const row = Math.floor((y - this.offsetY) / cellSize);

    if (!this.isValidPosition(row, col)) return null;
    return { row, col };
  }

  addPlant(sprite: Phaser.GameObjects.Image, plantId: string): void {
    sprite.setData('plantId', plantId);
    this.plantLayer.add(sprite);
  }

  getPlantLayer(): Phaser.GameObjects.Container {
    return this.plantLayer;
  }

  // Set preview sprite for showing plant ghost on hover
  setPreviewSprite(sprite: Phaser.GameObjects.Image | null): void {
    if (this.previewSprite) {
      this.previewSprite.destroy();
    }
    this.previewSprite = sprite;
    if (this.previewSprite) {
      this.previewSprite.setVisible(false);
      this.previewSprite.setAlpha(0.4);
    }
  }

  getOffsetY(): number {
    return this.offsetY;
  }
}