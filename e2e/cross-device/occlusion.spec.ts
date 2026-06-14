import { test, expect, Page } from '@playwright/test';
import {
  waitForGameReady,
  dismissTutorial,
  assertNoVerticalOverlap,
} from './helpers';

function isMobileLandscape(page: Page): boolean {
  const v = page.viewportSize();
  return !!v && v.width > v.height && v.width < 1024;
}

test.describe('@medium cross-device occlusion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
  });

  test('plant cards do not occlude the grid', async ({ page }) => {
    if (isMobileLandscape(page)) {
      // Game is not playable in mobile landscape; rotate prompt handles it.
      await expect(page.locator('[data-testid="rotate-prompt"]')).toBeVisible();
      return;
    }
    await dismissTutorial(page);
    const bar = page.locator('[data-testid="resource-bar"]');
    await expect(bar).toBeVisible();
    await assertNoVerticalOverlap(page, bar);

    // Require a minimum visual breathing room between the bar and the grid's
    // top row — at scale ~0.5 (FHD+ portrait), a 4 internal-px buffer renders
    // to ~2 CSS px and the bar's gradient visually merges with the grid.
    const canvas = page.locator('canvas');
    const canvasBox = await canvas.boundingBox();
    const barBox = await bar.boundingBox();
    const scale = canvasBox!.width / 720;
    const gridTop = canvasBox!.y + 440 * scale;
    const gap = gridTop - (barBox!.y + barBox!.height);
    expect(
      gap,
      `resource bar sits only ${gap.toFixed(1)} CSS px above the grid; needs >= 8 for clear visual separation`,
    ).toBeGreaterThanOrEqual(8);
  });

  test('speech overlay does not occlude the grid', async ({ page }) => {
    if (isMobileLandscape(page)) {
      await expect(page.locator('[data-testid="rotate-prompt"]')).toBeVisible();
      return;
    }
    await dismissTutorial(page);
    // Trigger SPEECH_LEARN by clicking a plant card
    const firstCard = page.locator('.plant-card').first();
    await firstCard.click();
    const overlay = page.locator('[data-testid="speech-overlay"]');
    await expect(overlay).toBeVisible({ timeout: 3000 });
    await assertNoVerticalOverlap(page, overlay);

    // Require a minimum visual breathing room between the speech bubble and the
    // grid's last row — a non-overlap assertion alone lets 8 CSS px gaps pass
    // (which on tablet looks like the bubble is sitting on the grid).
    const canvas = page.locator('canvas');
    const canvasBox = await canvas.boundingBox();
    const overlayBox = await overlay.boundingBox();
    const scale = canvasBox!.width / 720;
    const gridBottom = canvasBox!.y + 840 * scale;
    const gap = overlayBox!.y - gridBottom;
    expect(
      gap,
      `speech overlay sits only ${gap.toFixed(1)} CSS px below the grid; needs >= 20 for clear visual separation`,
    ).toBeGreaterThanOrEqual(20);
  });
});
