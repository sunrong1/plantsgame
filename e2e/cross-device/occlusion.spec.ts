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
  });
});
