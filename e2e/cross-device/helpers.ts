import { Page, Locator, expect } from '@playwright/test';

// Game constants matching src/config/game.ts
const GRID_OFFSET_X = 0;
const GRID_OFFSET_Y = 440;
const GRID_OFFSET_Y_BOTTOM = 840; // 440 + 5 rows * 80
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

/**
 * Assert that an element's bounding box does not vertically overlap the grid
 * (which occupies GRID_OFFSET_Y..GRID_OFFSET_Y_BOTTOM in 720x1280 space).
 * Accounts for canvas position + Phaser FIT scale.
 */
export async function assertNoVerticalOverlap(
  page: Page,
  element: Locator,
): Promise<void> {
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  const elBox = await element.boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(elBox).not.toBeNull();
  const scale = canvasBox!.width / INTERNAL_WIDTH;
  const gridTop = canvasBox!.y + GRID_OFFSET_Y * scale;
  const gridBottom = canvasBox!.y + GRID_OFFSET_Y_BOTTOM * scale;
  const elTop = elBox!.y;
  const elBottom = elBox!.y + elBox!.height;
  const overlaps = elBottom > gridTop && elTop < gridBottom;
  expect(
    overlaps,
    `Element overlaps grid band [${gridTop.toFixed(1)}, ${gridBottom.toFixed(1)}] (el: [${elTop.toFixed(1)}, ${elBottom.toFixed(1)}])`,
  ).toBe(false);
}
