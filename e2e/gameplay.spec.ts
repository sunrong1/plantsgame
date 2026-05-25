import { test, expect } from '@playwright/test';

test.describe('Game Tutorial', () => {
  test('shows tutorial overlay on first load', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Tutorial should show title
    await expect(page.getByText('PVZ 像素版')).toBeVisible({ timeout: 5000 });

    // Tutorial should show start button
    await expect(page.getByText('开始游戏')).toBeVisible();

    // Tutorial should show instructions
    await expect(page.getByText('操作指南')).toBeVisible();
  });

  test('dismisses tutorial on start button click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for tutorial to load
    await page.waitForSelector('text=开始游戏', { timeout: 5000 });
    await page.getByText('开始游戏').click();

    // Tutorial elements should be gone
    await expect(page.getByText('PVZ 像素版')).not.toBeVisible({ timeout: 2000 });
    await expect(page.getByText('操作指南')).not.toBeVisible({ timeout: 2000 });
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
