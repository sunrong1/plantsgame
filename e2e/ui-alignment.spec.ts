import { test, expect } from '@playwright/test';

test.describe('UI Alignment', () => {
  test('UI elements align with game canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const canvas = await page.$('#game-container canvas');
    const gameUI = await page.$('.game-ui');

    if (canvas && gameUI) {
      const canvasBox = await canvas.boundingBox();
      const gameUIBox = await gameUI.boundingBox();

      console.log('Canvas position:', canvasBox);
      console.log('Game UI position:', gameUIBox);

      // Game UI should be positioned over the canvas
      expect(gameUIBox?.x).toBe(canvasBox?.x);
      expect(gameUIBox?.y).toBe(canvasBox?.y);
    }
  });

  test('TopBar aligns at top of game canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Skip tutorial
    const startButton = page.getByText('开始游戏');
    if (await startButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await startButton.click();
    }

    const topBar = await page.$('.top-bar');
    const canvas = await page.$('#game-container canvas');

    if (topBar && canvas) {
      const topBarBox = await topBar.boundingBox();
      const canvasBox = await canvas.boundingBox();

      console.log('TopBar position:', topBarBox);
      console.log('Canvas position:', canvasBox);

      // TopBar should be at the top of the canvas
      expect(topBarBox?.y).toBe(canvasBox?.y);
      // TopBar should span the full width of the canvas
      expect(topBarBox?.x).toBe(canvasBox?.x);
      expect(topBarBox?.width).toBe(canvasBox?.width);
    }
  });

  test('PlantCards align at bottom of game canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const plantCards = await page.$('.plant-cards');
    const canvas = await page.$('#game-container canvas');

    if (plantCards && canvas) {
      const cardsBox = await plantCards.boundingBox();
      const canvasBox = await canvas.boundingBox();

      console.log('PlantCards position:', cardsBox);
      console.log('Canvas position:', canvasBox);

      // PlantCards should be horizontally centered over the canvas
      const canvasCenter = canvasBox!.x + canvasBox!.width / 2;
      const cardsCenter = cardsBox!.x + cardsBox!.width / 2;
      expect(Math.abs(canvasCenter - cardsCenter)).toBeLessThan(5);

      // PlantCards bottom should align with canvas bottom (within game area)
      // But they should be above the very bottom
      expect(cardsBox!.y + cardsBox!.height).toBeLessThan(canvasBox!.y + canvasBox!.height);
    }
  });
});