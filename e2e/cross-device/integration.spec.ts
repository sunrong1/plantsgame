import { test, expect } from '@playwright/test';
import { waitForGameReady, clickGridCell, dismissTutorial } from './helpers';

test.describe('@medium cross-device integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
  });

  test('resource bar visible at top, sunlight number is readable', async ({ page }) => {
    const bar = page.locator('.resource-bar');
    await expect(bar).toBeVisible();

    const sun = page.locator('.sun-value').first();
    await expect(sun).toBeVisible();
    const sunText = (await sun.textContent())?.trim() ?? '';
    expect(Number(sunText)).toBeGreaterThan(0);

    // Sun is part of the resource bar (any viewport: bar is centered or top-aligned,
    // sun is the first item inside the bar)
    const sunBox = await sun.boundingBox();
    const barBox = await bar.boundingBox();
    expect(sunBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect(sunBox.x).toBeGreaterThanOrEqual(barBox.x);
    expect(sunBox.x).toBeLessThan(barBox.x + barBox.width);
  });

  test('resource bar does not overlap the grid', async ({ page }) => {
    const canvas = page.locator('canvas');
    const bar = page.locator('.resource-bar');
    const canvasBox = await canvas.boundingBox();
    const barBox = await bar.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(barBox).not.toBeNull();

    // Internal grid starts at y = 440 in the 720x1280 game space
    const INTERNAL_GRID_Y = 440;
    const scale = canvasBox.width / 720;
    const gridCssY = canvasBox.y + INTERNAL_GRID_Y * scale;
    const barBottom = barBox.y + barBox.height;
    expect(barBottom).toBeLessThanOrEqual(gridCssY);
  });

  test('plant a peashooter end-to-end', async ({ page }) => {
    await dismissTutorial(page);

    // Click the first plant card (Peashooter, cost 100)
    const firstCard = page.locator('.plant-card').first();
    await firstCard.click();
    await expect(firstCard).toHaveClass(/selected/);

    // Read sunlight before planting
    const sun = page.locator('.sun-value').first();
    const before = Number((await sun.textContent())?.trim() ?? '0');

    // Click a grid cell in the middle
    await clickGridCell(page, 4, 2);
    await page.waitForTimeout(500);

    const after = Number((await sun.textContent())?.trim() ?? '0');
    expect(after).toBeLessThan(before);
  });

  test('rotate prompt visibility matches viewport rules', async ({ page }) => {
    const viewport = page.viewportSize();
    const prompt = page.locator('[data-testid="rotate-prompt"]');
    const isLandscape = viewport.width > viewport.height;
    const isMobileLike = viewport.width < 1024;
    if (isLandscape && isMobileLike) {
      await expect(prompt).toBeVisible();
    } else {
      await expect(prompt).toBeHidden();
    }
  });
});

test.describe('@medium rotate prompt on mobile landscape', () => {
  test.use({ viewport: { width: 851, height: 393 }, isMobile: true, hasTouch: true });

  test('shows on phone landscape', async ({ page }) => {
    await page.goto('/');
    const prompt = page.locator('[data-testid="rotate-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('请将设备旋转为竖屏');
  });
});
