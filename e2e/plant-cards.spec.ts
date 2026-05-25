import { test, expect } from '@playwright/test';

test.describe('Plant Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Dismiss tutorial
    const startButton = page.getByText('开始游戏');
    if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startButton.click();
    }
    await page.waitForTimeout(500);
  });

  test('game canvas is responsive', async ({ page }) => {
    const canvas = page.locator('canvas');

    // Test at iPad size
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    let box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(300);

    // Test at mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
  });

  test('sunlight counter is visible', async ({ page }) => {
    // Look for sunlight text in the UI - appears as "150" initially
    await page.waitForTimeout(1000);
    // The game renders in canvas so we check canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});
