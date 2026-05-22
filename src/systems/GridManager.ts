import Phaser from 'phaser';
import type { GridPosition } from '../types';
import { GAME_CONFIG } from '../config';

export class GridManager {
  private scene: Phaser.Scene;
  private gridGraphics: Phaser.GameObjects.Graphics;
  private plantLayer: Phaser.GameObjects.Container;
  private grid: (string | null)[][];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.grid = this.createEmptyGrid();

    this.gridGraphics = scene.add.graphics();
    this.drawGrid();

    this.plantLayer = scene.add.container(0, 0);
  }

  private createEmptyGrid(): (string | null)[][] {
    return Array(GAME_CONFIG.grid.rows)
      .fill(null)
      .map(() => Array(GAME_CONFIG.grid.cols).fill(null));
  }

  private drawGrid(): void {
    const { cellSize } = GAME_CONFIG.grid;
    const offsetX = 25;
    const offsetY = 60;

    this.gridGraphics.clear();
    this.gridGraphics.lineStyle(1, 0x228B22, 0.5);

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
      x: 25 + col * cellSize + cellSize / 2,
      y: 60 + row * cellSize + cellSize / 2,
    };
  }

  getCellFromPixel(x: number, y: number): GridPosition | null {
    const { cellSize } = GAME_CONFIG.grid;
    const col = Math.floor((x - 25) / cellSize);
    const row = Math.floor((y - 60) / cellSize);

    if (!this.isValidPosition(row, col)) return null;
    return { row, col };
  }

  addPlant(sprite: Phaser.GameObjects.Sprite, plantId: string): void {
    sprite.setData('plantId', plantId);
    this.plantLayer.add(sprite);
  }

  getPlantLayer(): Phaser.GameObjects.Container {
    return this.plantLayer;
  }
}