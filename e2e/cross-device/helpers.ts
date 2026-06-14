import { Page, expect } from '@playwright/test';

// Game constants matching src/config/game.ts
const GRID_OFFSET_X = 0;
const GRID_OFFSET_Y = 440;
const CELL_SIZE = 80;
const INTERNAL_WIDTH = 720;

/**
 * Wait for the Vue UI shell, the Phaser canvas, and a few warmup frames
 * to render. Screenshots taken before this can be unstable.
 */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForSelector('.resource-bar', { state: 'visible' });
  // Phaser first-frame render + a couple of update ticks
  await page.waitForTimeout(500);
}

/**
 * Click on a grid cell. Translates the (col, row) grid coordinate to CSS
 * pixels by reading the canvas bounding box and Phaser's FIT scale factor.
 *
 * Internal 720x1280 coords:
 *   gridOffsetX = 0
 *   gridOffsetY = 440
 *   cellSize = 80
 */
export async function clickGridCell(
  page: Page,
  col: number,
  row: number,
): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const scale = box.width / INTERNAL_WIDTH;
  const cellCenterX = GRID_OFFSET_X + CELL_SIZE * col + CELL_SIZE / 2;
  const cellCenterY = GRID_OFFSET_Y + CELL_SIZE * row + CELL_SIZE / 2;
  await page.mouse.click(
    box.x + cellCenterX * scale,
    box.y + cellCenterY * scale,
  );
}

/**
 * Dismiss the tutorial overlay by clicking the start button.
 */
export async function dismissTutorial(page: Page): Promise<void> {
  // Tutorial text varies; find by role
  const startBtn = page.getByRole('button', { name: /开始|start/i }).first();
  if (await startBtn.isVisible().catch(() => false)) {
    await startBtn.click();
  }
}
