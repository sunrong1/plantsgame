import Phaser from 'phaser';
import type { GridPosition } from '../types';
import { GAME_CONFIG } from '../config';

const EMPTY_CELL_COLOR = 0x90EE90;
const OCCUPIED_CELL_COLOR = 0xFFB6C1;
const HIGHLIGHT_ALPHA = 0.8;

export class GridManager {
  private scene: Phaser.Scene;
  private gridGraphics: Phaser.GameObjects.Graphics;
  private highlightGraphics: Phaser.GameObjects.Graphics;
  private plantLayer: Phaser.GameObjects.Container;
  private grid: (string | null)[][];
  private hoverRow: number = -1;
  private hoverCol: number = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.grid = this.createEmptyGrid();

    this.gridGraphics = scene.add.graphics();
    this.highlightGraphics = scene.add.graphics();
    this.drawGrid();

    this.plantLayer = scene.add.container(0, 0);

    this.setupHoverDetection();
  }

  private setupHoverDetection(): void {
    let lastHoverTime = 0;
    const hoverThrottle = 50;

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const now = Date.now();
      if (now - lastHoverTime < hoverThrottle) return;
      lastHoverTime = now;

      if (pointer.y < 110) {
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

    const isEmpty = this.isCellEmpty(row, col);
    const color = isEmpty ? EMPTY_CELL_COLOR : OCCUPIED_CELL_COLOR;

    const { cellSize } = GAME_CONFIG.grid;
    const x = 50 + col * cellSize;
    const y = 120 + row * cellSize;

    this.highlightGraphics.lineStyle(2, color, HIGHLIGHT_ALPHA);
    this.highlightGraphics.strokeRect(x, y, cellSize, cellSize);
  }

  private clearHighlight(): void {
    this.hoverRow = -1;
    this.hoverCol = -1;
    this.highlightGraphics.clear();
  }

  private createEmptyGrid(): (string | null)[][] {
    return Array(GAME_CONFIG.grid.rows)
      .fill(null)
      .map(() => Array(GAME_CONFIG.grid.cols).fill(null));
  }

  private drawGrid(): void {
    const { cellSize } = GAME_CONFIG.grid;
    const offsetX = 50;
    const offsetY = 120;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, 0x1B5E20, 0.3);

    for (let row = 0; row < GAME_CONFIG.grid.rows; row++) {
      for (let col = 0; col < GAME_CONFIG.grid.cols; col++) {
        const x = offsetX + col * cellSize;
        const y = offsetY + row * cellSize;
        this.gridGraphics.strokeRect(x, y, cellSize, cellSize);
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
      x: 50 + col * cellSize + cellSize / 2,
      y: 120 + row * cellSize + cellSize / 2,
    };
  }

  getCellFromPixel(x: number, y: number): GridPosition | null {
    const { cellSize } = GAME_CONFIG.grid;
    const col = Math.floor((x - 50) / cellSize);
    const row = Math.floor((y - 120) / cellSize);

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
}