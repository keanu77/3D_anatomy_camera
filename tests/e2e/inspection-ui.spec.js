import { test, expect } from '@playwright/test';
import { rendered, watchErrors } from './helpers.js';

const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
  && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

async function assertStatusLayout(page) {
  // Exercise the real status node with a synthetic loading message; this checks
  // layout only and does not claim successful camera or inference operation.
  await page.locator('#live-status').evaluate(node => {
    node.textContent = '正在載入臉部與身體追蹤模型，請稍候…'; node.hidden = false;
  });
  const live = await page.locator('#live-status').boundingBox();
  const toggle = await page.locator('#inspection-toggle').boundingBox();
  expect(overlaps(live, toggle), 'model status and inspection toggle occupy separate cells').toBe(false);
  if (await page.locator('#inspection-help').isVisible()) {
    const help = await page.locator('#inspection-help').boundingBox();
    expect(overlaps(live, help), 'wrapped status stays above inspection instructions').toBe(false);
    expect(overlaps(toggle, help), 'instructions stay below the toggle').toBe(false);
  }
  return live;
}

test('inspection toggle is keyboard accessible outside the mirrored and masked stage', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?still#demo&bodyMuscles'); await rendered(page);
  const toggle = page.locator('#inspection-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#inspection-help')).not.toBeVisible();
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  await expect(page.locator('#stage .inspection-ui')).toHaveCount(0);
  await expect(page.locator('.stagecol > .inspection-ui')).toHaveCount(1);
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#inspection-help')).toBeVisible();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.inspection-status')).toContainText('肌肉或骨頭');
  await assertStatusLayout(page);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();
  await expect(page.locator('#inspection-help')).not.toBeVisible();
  await assertStatusLayout(page);
  expect(errors).toEqual([]);
});

test('inspection controls respect portrait, landscape and the settings modal', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?still#demo&bodyMuscles'); await rendered(page);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 320 }]) {
    await page.setViewportSize(viewport);
    const live = await assertStatusLayout(page);
    const toggle = await page.locator('#inspection-toggle').boundingBox();
    const help = await page.locator('#inspection-help').boundingBox();
    const controls = await page.locator('.mobile-controls').boundingBox();
    for (const box of [toggle, help, live]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(controls.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await page.locator('#settings-toggle').click();
    await expect(page.locator('.stagecol')).toHaveJSProperty('inert', true);
    await page.locator('#inspection-toggle').evaluate(node => node.focus());
    await expect(page.locator('#settings-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.stagecol')).toHaveJSProperty('inert', false);
    await expect(page.locator('#inspection-toggle')).toHaveAttribute('aria-pressed', 'true');
    await testInfo.attach(`inspection-controls-${viewport.width}x${viewport.height}`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});
