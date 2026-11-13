import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers.js';

test('mobile preset cycling follows direct links, selected presets and custom layers', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?still#demo&nervous');
  await page.waitForFunction(() => window.__ANATOMY_DIAGNOSTICS__?.().renderer?.frameCount > 0);
  await expect(page.locator('[data-preset="nervous"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#preset-cycle').click();
  await expect(page.locator('[data-preset="systems"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#preset-cycle').click();
  await expect(page.locator('[data-preset="skull"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-toggle').click();
  await page.locator('[data-preset="bodyMuscles"]').click();
  await page.locator('#settings-close').click();
  await page.locator('#preset-cycle').click();
  await expect(page.locator('[data-preset="nervous"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-toggle').click();
  await page.locator('#L_eyes').uncheck();
  await expect(page.locator('[data-preset][aria-pressed="true"]')).toHaveCount(0);
  await page.locator('#settings-close').click();
  await page.locator('#preset-cycle').click();
  await expect(page.locator('[data-preset="skull"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('style selection stays accessible across desktop and mobile controls', async ({ page }) => {
  await page.goto('/');
  const xray = page.getByRole('button', { name: 'X 光透視', exact: true });
  const solid = page.getByRole('button', { name: '實體', exact: true });
  await expect(xray).toHaveAttribute('aria-pressed', 'true');
  await expect(solid).toHaveAttribute('aria-pressed', 'false');
  await solid.click();
  await expect(solid).toHaveAttribute('aria-pressed', 'true');
  await expect(xray).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#style-toggle')).toHaveText('實體 → X 光');
  await page.locator('#style-toggle').click();
  await page.locator('#settings-toggle').click();
  await expect(xray).toHaveAttribute('aria-pressed', 'true');
  await expect(solid).toHaveAttribute('aria-pressed', 'false');
});

test('mobile settings behave as a modal and reconcile focus across responsive layouts', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const drawer = page.locator('#drawer'), toggle = page.locator('#settings-toggle'), close = page.locator('#settings-close');
  await toggle.click();
  await expect(close).toBeFocused();
  await expect(page.getByRole('dialog', { name: '3D anatomy camera 設定' })).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.stagecol')).toHaveJSProperty('inert', true);
  await expect(page.locator('.mobile-controls')).toHaveJSProperty('inert', true);
  await page.locator('#start').evaluate(button => button.focus());
  await expect(close).toBeFocused();
  const last = drawer.getByRole('link', { name: '模型與軟體授權' });
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '啟動鏡頭', exact: true })).toBeVisible();

  await toggle.click(); await expect(close).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(drawer).not.toHaveClass(/\bopen\b/);
  await expect(drawer).not.toHaveAttribute('aria-modal');
  await expect(drawer).not.toHaveAttribute('role');
  // The first control of the settings panel; region focus now comes before the system presets.
  await expect(page.locator('#focus [data-focus="none"]')).toBeFocused();
  await expect(page.locator('.stagecol')).toHaveJSProperty('inert', false);
  await expect(drawer).toHaveJSProperty('inert', false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer).toHaveJSProperty('inert', true);
  await expect(toggle).toBeFocused();
  await expect(drawer).not.toBeVisible();
  await toggle.click(); await expect(close).toBeFocused();
  await page.locator('#drawer-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('a button over the picture goes back to the start screen, from the demo and from the camera, on every screen size', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const box = async (selector) => { const rect = await page.locator(selector).boundingBox(); return { ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height }; };
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#intro')).toBeVisible();
    await page.locator('#demo-start').click();
    await page.waitForFunction(() => window.__ANATOMY_DIAGNOSTICS__?.().renderer?.frameCount > 0);
    const home = page.locator('#home-button');
    await expect(home, `${viewport.width}`).toBeVisible();
    await expect(home).toHaveText('回到首頁');
    // In view without opening the settings, a full touch target, and clear of the two other controls.
    const [mine, pause, pick] = [await box('#home-button'), await box('#pause-toggle'), await box('#inspection-toggle')];
    expect(mine.x, `${viewport.width}: left edge`).toBeGreaterThanOrEqual(0);
    expect(mine.bottom, `${viewport.width}: in view`).toBeLessThanOrEqual(viewport.height);
    expect(mine.height, `${viewport.width}: touch height`).toBeGreaterThanOrEqual(40);
    for (const other of [pause, pick]) expect(mine.right <= other.x || other.right <= mine.x || mine.bottom <= other.y || other.bottom <= mine.y, `${viewport.width}: no overlap`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${viewport.width}: no sideways scroll`).toBe(viewport.width);
    await home.click();
    await expect(page.locator('#intro')).toBeVisible();
    await expect(page.locator('#start')).toBeEnabled();
    expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mode)).toBe('intro');
    // The demo used no camera: the message does not speak of one.
    await expect(page.locator('#status')).toHaveText('已回到首頁。你可以啟動鏡頭，或再看一次示範。');
  }
  // From the camera it also releases the camera.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#intro')).toBeHidden({ timeout: 90000 });
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.running)).toBe(true);
  await page.locator('#home-button').click();
  await expect(page.locator('#intro')).toBeVisible();
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.running)).toBe(false);
  await expect(page.locator('#status')).toHaveText('鏡頭已停止。你可以重新啟動或觀看示範。');
  // In English the two other controls are wider: the button keeps clear of them down to the narrowest phone,
  // where its arrow stands alone and its name is still read out.
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?lang=en&still#demo');
    await page.waitForFunction(() => window.__ANATOMY_DIAGNOSTICS__?.().renderer?.frameCount > 0);
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
    const [mine, pause, pick] = [await box('#home-button'), await box('#pause-toggle'), await box('#inspection-toggle')];
    for (const other of [pause, pick]) expect(mine.right <= other.x || other.right <= mine.x || mine.bottom <= other.y || other.bottom <= mine.y, `English ${width}: no overlap`).toBe(true);
    expect(mine.width, `English ${width}: touch width`).toBeGreaterThanOrEqual(40);
    expect(mine.x, `English ${width}: left edge`).toBeGreaterThanOrEqual(0);
  }
  await page.locator('#home-button').click();
  await expect(page.locator('#status')).toHaveText('Back at the start. You can start the camera or watch the demo again.');
  expect(errors).toEqual([]);
});
