# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gameplay.spec.ts >> Screen Adaptation >> no right-side clipping at any viewport size
- Location: e2e/gameplay.spec.ts:159:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 984.25
```

# Test source

```ts
  77  | });
  78  | 
  79  | test.describe('Game UI', () => {
  80  |   test.beforeEach(async ({ page }) => {
  81  |     await page.goto('/');
  82  |     await page.waitForSelector('canvas', { timeout: 10000 });
  83  | 
  84  |     // Dismiss tutorial
  85  |     const startButton = page.getByText('开始游戏');
  86  |     if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
  87  |       await startButton.click();
  88  |     }
  89  |     await page.waitForTimeout(500);
  90  |   });
  91  | 
  92  |   test('game continues running after dismiss', async ({ page }) => {
  93  |     // Let game run for a few seconds
  94  |     await page.waitForTimeout(3000);
  95  | 
  96  |     // Canvas should still be present and stable
  97  |     const canvas = page.locator('canvas');
  98  |     await expect(canvas).toBeVisible();
  99  |   });
  100 | 
  101 |   test('game does not crash on rapid viewport changes', async ({ page }) => {
  102 |     const canvas = page.locator('canvas');
  103 | 
  104 |     for (let i = 0; i < 5; i++) {
  105 |       await page.setViewportSize({ width: 1920, height: 1080 });
  106 |       await page.waitForTimeout(100);
  107 |       await expect(canvas).toBeVisible();
  108 | 
  109 |       await page.setViewportSize({ width: 375, height: 667 });
  110 |       await page.waitForTimeout(100);
  111 |       await expect(canvas).toBeVisible();
  112 |     }
  113 |   });
  114 | });
  115 | 
  116 | test.describe('Screen Adaptation', () => {
  117 |   test('canvas fills entire screen in landscape mode', async ({ page }) => {
  118 |     await page.setViewportSize({ width: 1024, height: 768 });
  119 |     await page.goto('/');
  120 |     await page.waitForSelector('canvas', { timeout: 10000 });
  121 |     await page.waitForTimeout(1000);
  122 | 
  123 |     const canvas = page.locator('canvas');
  124 |     const box = await canvas.boundingBox();
  125 |     
  126 |     // Canvas should fill the entire viewport in landscape
  127 |     expect(box?.width).toBe(1024);
  128 |     expect(box?.height).toBe(768);
  129 |   });
  130 | 
  131 |   test('canvas fills entire screen in portrait mode', async ({ page }) => {
  132 |     await page.setViewportSize({ width: 768, height: 1024 });
  133 |     await page.goto('/');
  134 |     await page.waitForSelector('canvas', { timeout: 10000 });
  135 |     await page.waitForTimeout(1000);
  136 | 
  137 |     const canvas = page.locator('canvas');
  138 |     const box = await canvas.boundingBox();
  139 |     
  140 |     // Canvas should fill the entire viewport in portrait
  141 |     expect(box?.width).toBe(768);
  142 |     expect(box?.height).toBe(1024);
  143 |   });
  144 | 
  145 |   test('canvas fills entire screen on desktop', async ({ page }) => {
  146 |     await page.setViewportSize({ width: 1920, height: 1080 });
  147 |     await page.goto('/');
  148 |     await page.waitForSelector('canvas', { timeout: 10000 });
  149 |     await page.waitForTimeout(1000);
  150 | 
  151 |     const canvas = page.locator('canvas');
  152 |     const box = await canvas.boundingBox();
  153 |     
  154 |     // Canvas should fill the entire viewport on desktop
  155 |     expect(box?.width).toBe(1920);
  156 |     expect(box?.height).toBe(1080);
  157 |   });
  158 | 
  159 |   test('no right-side clipping at any viewport size', async ({ page }) => {
  160 |     const viewports = [
  161 |       { width: 1920, height: 1080 },
  162 |       { width: 1024, height: 768 },
  163 |       { width: 768, height: 1024 },
  164 |       { width: 375, height: 667 },
  165 |     ];
  166 | 
  167 |     for (const vp of viewports) {
  168 |       await page.setViewportSize({ width: vp.width, height: vp.height });
  169 |       await page.goto('/');
  170 |       await page.waitForSelector('canvas', { timeout: 10000 });
  171 |       await page.waitForTimeout(1000);
  172 | 
  173 |       const canvas = page.locator('canvas');
  174 |       const box = await canvas.boundingBox();
  175 |       
  176 |       // Canvas should not overflow or clip on the right side
> 177 |       expect(box?.x).toBe(0);
      |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  178 |       expect(box?.width).toBe(vp.width);
  179 |     }
  180 |   });
  181 | 
  182 |   test('game runs without errors during gameplay', async ({ page }) => {
  183 |     const errors: string[] = [];
  184 |     page.on('pageerror', err => errors.push(err.message));
  185 |     page.on('console', msg => {
  186 |       if (msg.type() === 'error') errors.push(msg.text());
  187 |     });
  188 | 
  189 |     await page.setViewportSize({ width: 1024, height: 768 });
  190 |     await page.goto('/');
  191 |     await page.waitForSelector('canvas', { timeout: 10000 });
  192 |     await page.waitForTimeout(2000);
  193 | 
  194 |     // Dismiss tutorial if shown
  195 |     const startButton = page.getByText('开始游戏');
  196 |     if (await startButton.isVisible({ timeout: 500 }).catch(() => false)) {
  197 |       await startButton.click();
  198 |     }
  199 | 
  200 |     // Let game run for a few seconds
  201 |     await page.waitForTimeout(5000);
  202 |     
  203 |     expect(errors).toHaveLength(0);
  204 |   });
  205 | });
  206 | 
```