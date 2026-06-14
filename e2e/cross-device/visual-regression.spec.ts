import { test, expect } from '@playwright/test';
import { waitForGameReady, dismissTutorial } from './helpers';

const INTERNAL_GRID_Y = 440;
const INTERNAL_GRID_HEIGHT = 400;
const INTERNAL_WIDTH = 720;

test.describe('@slow visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTutorial(page);
    // Drain any intro animation / sunlight pop-in
    await page.waitForTimeout(500);
  });

  test('canvas full screenshot', async ({ page }) => {
    await expect(page.locator('canvas')).toHaveScreenshot('canvas.png');
  });

  test('resource bar screenshot', async ({ page }) => {
    await expect(page.locator('.resource-bar')).toHaveScreenshot('resource-bar.png');
  });

  test('grid screenshot (first 3 rows)', async ({ page }) => {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const scale = box.width / INTERNAL_WIDTH;
    await expect(page.locator('canvas')).toHaveScreenshot('grid-top.png', {
      clip: {
        x: box.x,
        y: box.y + INTERNAL_GRID_Y * scale,
        width: box.width,
        height: (INTERNAL_GRID_HEIGHT / 5) * 3 * scale,
      },
    });
  });
});
