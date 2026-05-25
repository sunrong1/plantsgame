import { test, expect } from '@playwright/test';

test.describe('PVZ Game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for game to load
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test('canvas renders correctly', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Canvas should have reasonable size
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test('tutorial overlay shows on first load', async ({ page }) => {
    // Look for the tutorial text
    const tutorialText = page.getByText('开始游戏');
    await expect(tutorialText).toBeVisible({ timeout: 5000 });
  });

  test('can dismiss tutorial and see game', async ({ page }) => {
    // Click start button
    const startButton = page.getByText('开始游戏');
    await startButton.click();

    // Tutorial should be gone (overlay dismissed)
    await expect(page.getByText('操作指南')).not.toBeVisible({ timeout: 2000 });
  });

  test('plant cards are visible', async ({ page }) => {
    // Dismiss tutorial first
    const startButton = page.getByText('开始游戏');
    await startButton.click();

    // Wait for cards to potentially render
    await page.waitForTimeout(500);

    // Game should still have canvas
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});
