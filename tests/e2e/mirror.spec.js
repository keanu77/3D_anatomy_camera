import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { writeFile } from 'node:fs/promises';
import { fixedStage, rendered, storeSettings } from './helpers.js';

for (const preset of ['', 'body', 'bodyMuscles']) {
  test(`front and rear ${preset || 'head and hand'} demos are horizontal reflections`, async ({ page }, testInfo) => {
    await fixedStage(page); await storeSettings(page, { labels: false, reveal: 'whole' });
    await page.goto(`/?still#demo${preset ? `&${preset}` : ''}`); await rendered(page);
    if (preset === 'body') await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.bodyLoaded)).toBe(true);
    if (preset) await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.musclesLoaded)).toBe(true);
    const before = PNG.sync.read(await page.locator('#stage').screenshot());
    await page.locator('#camera-switch').click();
    await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mirror)).toBe(false);
    const after = PNG.sync.read(await page.locator('#stage').screenshot());
    const reflected = new PNG({ width: before.width, height: before.height });
    for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
      const source = (y * before.width + x) * 4, dest = (y * before.width + before.width - 1 - x) * 4;
      before.data.copy(reflected.data, dest, source, source + 4);
    }
    const diff = new PNG({ width: before.width, height: before.height });
    const pixels = pixelmatch(reflected.data, after.data, diff.data, before.width, before.height, { threshold: 0.1, includeAA: false });
    const ratio = pixels / (before.width * before.height);
    await testInfo.attach('mirror-difference', { body: PNG.sync.write(diff), contentType: 'image/png' });
    const metricPath = testInfo.outputPath('mirror-pixel-result.json');
    await writeFile(metricPath, JSON.stringify({ changed: pixels, ratio }));
    await testInfo.attach('mirror-pixel-result', { path: metricPath, contentType: 'application/json' });
    expect(ratio).toBeLessThan(0.01);
  });
}
