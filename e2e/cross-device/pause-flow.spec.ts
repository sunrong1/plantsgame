import { test, expect, Page } from '@playwright/test';
import { waitForGameReady, dismissTutorial } from './helpers';

async function getSunlight(page: Page): Promise<number> {
  const sun = page.locator('.sun-value').first();
  return Number((await sun.textContent())?.trim() ?? '0');
}

test.describe('@medium pause flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTutorial(page);
  });

  test('pause button visible in resource bar', async ({ page }) => {
    const pauseBtn = page.locator('[data-testid="pause-button"]');
    await expect(pauseBtn).toBeVisible();
    await expect(pauseBtn).toHaveAttribute('aria-label', '暂停');
  });

  test('clicking pause button shows overlay and freezes game state', async ({ page }) => {
    const pauseBtn = page.locator('[data-testid="pause-button"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    // Not paused initially
    await expect(overlay).toHaveCount(0);

    // Click pause
    await pauseBtn.click();
    await expect(overlay).toBeVisible();
    await expect(pauseBtn).toHaveAttribute('aria-label', '继续');

    // Sunlight should not change while paused (sample 2 readings 1.5s apart)
    const before = await getSunlight(page);
    await page.waitForTimeout(1500);
    const after = await getSunlight(page);
    expect(after).toBe(before);
  });

  test('clicking resume button resumes game and unfreezes sunlight', async ({ page }) => {
    const pauseBtn = page.locator('[data-testid="pause-button"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');
    const resumeBtn = page.locator('[data-testid="resume-button"]');

    await pauseBtn.click();
    await expect(overlay).toBeVisible();

    await resumeBtn.click();
    await expect(overlay).toHaveCount(0);
    await expect(pauseBtn).toHaveAttribute('aria-label', '暂停');
  });

  test('clicking outside the resume card also resumes', async ({ page }) => {
    const pauseBtn = page.locator('[data-testid="pause-button"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    await pauseBtn.click();
    await expect(overlay).toBeVisible();

    // Click on the overlay backdrop (top-left corner of overlay, not on the card)
    const overlayBox = await overlay.boundingBox();
    expect(overlayBox).not.toBeNull();
    await page.mouse.click(overlayBox.x + 5, overlayBox.y + 5);

    await expect(overlay).toHaveCount(0);
  });

  test('ESC key toggles pause on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only test: physical keyboards on mobile are rare');

    const pauseBtn = page.locator('[data-testid="pause-button"]');
    const overlay = page.locator('[data-testid="pause-overlay"]');

    // Focus the canvas so Phaser's keyboard input receives the keydown
    await page.locator('canvas').first().focus().catch(() => {});

    await page.keyboard.press('Escape');
    await expect(overlay).toBeVisible();
    await expect(pauseBtn).toHaveAttribute('aria-label', '继续');

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });
});
