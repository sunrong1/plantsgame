import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    baseURL: 'http://localhost:5173',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'huawei-mate-50',
      testMatch: /cross-device\/.*\.spec\.ts/,
      use: { viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'huawei-tablet',
      testMatch: /cross-device\/.*\.spec\.ts/,
      use: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop-hd',
      testMatch: /cross-device\/.*\.spec\.ts/,
      use: { viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
