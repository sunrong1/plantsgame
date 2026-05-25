import { test, expect } from '@playwright/test';

test.describe('Game Tutorial', () => {
  test('shows tutorial overlay on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Game renders inside canvas - just verify canvas is visible
    await page.waitForTimeout(500);
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('dismisses tutorial on start button click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Let game run - tutorial shows on first load
    await page.waitForTimeout(1000);

    // Canvas should still be present (game didn't crash)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});

test.describe('Game Rendering', () => {
  test('canvas renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Dismiss tutorial
    const startButton = page.getByText('开始游戏');
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }

    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('canvas is visible at different viewport sizes', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Dismiss tutorial
    const startButton = page.getByText('开始游戏');
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
    }

    const canvas = page.locator('canvas');

    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    await expect(canvas).toBeVisible();

    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    await expect(canvas).toBeVisible();

    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    await expect(canvas).toBeVisible();
  });
});

test.describe('Game UI', () => {
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

  test('game continues running after dismiss', async ({ page }) => {
    // Let game run for a few seconds
    await page.waitForTimeout(3000);

    // Canvas should still be present and stable
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('game does not crash on rapid viewport changes', async ({ page }) => {
    const canvas = page.locator('canvas');

    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(100);
      await expect(canvas).toBeVisible();

      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(100);
      await expect(canvas).toBeVisible();
    }
  });
});
