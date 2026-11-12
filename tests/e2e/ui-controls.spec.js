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
