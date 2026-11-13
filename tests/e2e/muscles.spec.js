import { test, expect, devices } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { LIVE_START, fixedStage, rendered, storeSettings, watchErrors } from './helpers.js';

const muscleOnly = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false,
  spine: false, organs: false, arms: false, legs: false, bodyMuscles: true, joints: false, nerves: false, showdata: false, performance: 'balanced' };
const diagnostics = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
const watchRequests = (page) => { const requests = []; page.on('request', (request) => requests.push(request.url())); return requests; };
const muscleRequests = (requests) => requests.filter((url) => /\/anatomy\/muscles\.(json|bin)$/.test(url));
const oldBodyRequests = (requests) => requests.filter((url) => /\/anatomy\/body\.(json|bin)$/.test(url));

test('direct muscle demo works in mobile portrait and landscape without skeleton downloads', async ({ browser }, testInfo) => {
  // Chromium touch/layout emulation, not physical iOS or Safari evidence.
  const { defaultBrowserType: _browser, ...device } = devices['iPhone 13'];
  const context = await browser.newContext({ ...device, locale: 'zh-TW', ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173' });
  try {
    const page = await context.newPage(), requests = watchRequests(page), errors = watchErrors(page);
    await page.goto('/?still#demo&bodyMuscles'); await rendered(page);
    await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBe(24);
    expect((await diagnostics(page)).renderer.bodyLoaded).toBe(false);
    expect(oldBodyRequests(requests)).toEqual([]);
    await expect.poll(async () => { const { width, height } = (await diagnostics(page)).renderer; return Math.abs(width / height - 9 / 16); }).toBeLessThan(0.02);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#settings-close')).toBeFocused();
    await expect(page.locator('#L_bodyMuscles')).toBeChecked();
    for (const key of ['spine', 'organs', 'arms', 'legs', 'hands']) await expect(page.locator(`#L_${key}`)).not.toBeChecked();
    await page.locator('#settings-close').click();
    await page.locator('#camera-switch-mobile').click();
    await expect.poll(async () => (await diagnostics(page)).state.mirror).toBe(false);
    await testInfo.attach('muscles-mobile-portrait', { body: await page.screenshot(), contentType: 'image/png' });
    await page.setViewportSize({ width: device.viewport.height, height: device.viewport.width });
    await expect.poll(async () => { const { width, height } = (await diagnostics(page)).renderer; return Math.abs(width / height - 4 / 3); }).toBeLessThan(0.02);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#settings-toggle').click(); await expect(page.locator('#settings-close')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'false');
    await testInfo.attach('muscles-mobile-landscape', { body: await page.screenshot(), contentType: 'image/png' });
    expect(muscleRequests(requests)).toHaveLength(2);
    expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('body-muscle preset loads its own bundle and toggles without redownloading it', async ({ page }, testInfo) => {
  const requests = watchRequests(page), errors = watchErrors(page);
  await page.goto('/?still#demo'); await rendered(page);
  expect(muscleRequests(requests)).toEqual([]);
  await page.locator('[data-preset="bodyMuscles"]').click();
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBeGreaterThan(0);
  const ready = await diagnostics(page);
  expect(ready.renderer.bodyLoaded).toBe(false);
  expect(ready.renderer.muscleMeshCount).toBeGreaterThan(0);
  expect(ready.renderer.musclesError).toBeFalsy();
  expect(ready.trackers.loaded).toEqual([]);
  expect(oldBodyRequests(requests)).toEqual([]);
  expect(muscleRequests(requests)).toHaveLength(2);
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await testInfo.attach('muscle-only-demo', { body: await page.locator('#stage').screenshot(), contentType: 'image/png' });
  await page.locator('#L_bodyMuscles').uncheck();
  await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBe(0);
  await page.locator('#L_bodyMuscles').check();
  await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBeGreaterThan(0);
  expect(muscleRequests(requests)).toHaveLength(2);
  expect(oldBodyRequests(requests)).toEqual([]);
  expect(errors).toEqual([]);
});

test('muscle-only demo uses articulated mesh anchors without needing the skeleton bundle', async ({ page }) => {
  const requests = watchRequests(page), errors = watchErrors(page);
  await storeSettings(page, muscleOnly);
  await page.goto('/?still#demo'); await rendered(page);
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  const { renderer } = await diagnostics(page);
  expect(renderer.muscleSegments.length).toBeGreaterThanOrEqual(8);
  for (const segment of renderer.muscleSegments) {
    for (const [actual, expected] of [[segment.proximal, segment.expectedProximal], [segment.distal, segment.expectedDistal]]) {
      expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]), segment.name).toBeLessThanOrEqual(3);
    }
  }
  expect(renderer.visibleLayers.bodyMuscles).toBeGreaterThan(0);
  expect(oldBodyRequests(requests)).toEqual([]);
  expect(errors).toEqual([]);
});

test('body muscles alone enable Pose and stop inference when switched off', async ({ page }) => {
  test.setTimeout(240000);
  const requests = watchRequests(page), errors = watchErrors(page);
  await storeSettings(page, muscleOnly);
  await page.goto('/'); await page.locator('#start').click(); await rendered(page, LIVE_START);
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose || 0, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  const ready = await diagnostics(page);
  expect(ready.trackers.loaded).toEqual(['pose']);
  expect(ready.renderer.musclesLoaded).toBe(true);
  expect(ready.renderer.bodyLoaded).toBe(false);
  expect(oldBodyRequests(requests)).toEqual([]);
  expect(requests.some((url) => /\/(face_landmarker|hand_landmarker)\.task$/.test(url))).toBe(false);
  expect(requests.some((url) => url.endsWith('/models/pose_landmarker_lite.task'))).toBe(true);
  await page.locator('#L_bodyMuscles').uncheck();
  // One already-submitted worker frame may finish; no subsequent frame may run.
  await expect.poll(async () => (await diagnostics(page)).trackers.inFlight, { timeout: 60000 }).toBe(false);
  const calls = (await diagnostics(page)).trackers.calls.pose;
  const time = await page.locator('#video').evaluate((video) => video.currentTime);
  await expect.poll(() => page.locator('#video').evaluate((video) => video.currentTime)).toBeGreaterThan(time + 0.5);
  expect((await diagnostics(page)).trackers.calls.pose).toBe(calls);
  await page.locator('#L_bodyMuscles').check();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose).toBeGreaterThan(calls);
  expect(muscleRequests(requests)).toHaveLength(2);
  await page.locator('#camera-stop').click();
  expect((await diagnostics(page)).camera.liveTracks).toBe(0);
  expect(errors).toEqual([]);
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test('combined muscle and skeleton layers support both styles, labels and every reveal', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await fixedStage(page);
  await storeSettings(page, { ...muscleOnly, spine: true, organs: true, arms: true, legs: true, labels: true });
  await page.goto('/?still#demo'); await rendered(page);
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  await expect.poll(async () => (await diagnostics(page)).renderer.bodyLoaded).toBe(true);
  for (const style of ['xray', 'solid']) {
    await page.locator(`[data-style="${style}"]`).click();
    await page.locator('#reveal').selectOption('whole');
    const whole = PNG.sync.read(await page.locator('#stage').screenshot());
    let visible = 0;
    for (let i = 0; i < whole.data.length; i += 4) if (whole.data[i] + whole.data[i + 1] + whole.data[i + 2] > 180) visible++;
    expect(visible, `${style} visible anatomy`).toBeGreaterThan(500);
    for (const reveal of ['left', 'right', 'top', 'bottom', 'lens']) {
      await page.locator('#reveal').selectOption(reveal);
      const cut = PNG.sync.read(await page.locator('#stage').screenshot());
      expect([cut.width, cut.height]).toEqual([whole.width, whole.height]);
      const changed = pixelmatch(whole.data, cut.data, null, whole.width, whole.height, { threshold: 0.1, includeAA: false });
      expect(changed, `${style} ${reveal} actually changes the displayed region`).toBeGreaterThan(100);
      expect((await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBeGreaterThan(0);
    }
    await page.locator('#reveal').selectOption('whole');
    await testInfo.attach(`combined-muscles-${style}`, { body: await page.locator('#stage').screenshot(), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});

test('cancelled muscle fetch cannot install or clear a newer muscle load', async ({ page }) => {
  const errors = watchErrors(page), requestCounts = {}, aborted = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  page.on('requestfailed', (request) => { if (/\/anatomy\/muscles\./.test(request.url())) aborted.push(request.url()); });
  await page.route(/\/anatomy\/muscles\.(json|bin)$/, async (route) => {
    const name = new URL(route.request().url()).pathname;
    requestCounts[name] = (requestCounts[name] || 0) + 1;
    if (requestCounts[name] === 1) await gate;
    try { await route.continue(); } catch { /* The first generation is deliberately aborted. */ }
  });
  try {
    await page.goto('/?still#demo'); await rendered(page);
    await page.locator('#L_bodyMuscles').check();
    await expect.poll(() => Object.values(requestCounts).reduce((sum, count) => sum + count, 0)).toBe(2);
    await page.locator('#L_bodyMuscles').uncheck();
    await expect.poll(() => aborted.length).toBeGreaterThan(0);
    expect((await diagnostics(page)).renderer.musclesLoaded).toBe(false);
    await page.locator('#L_bodyMuscles').check();
    await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
    release();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const { renderer } = await diagnostics(page);
    expect(renderer.musclesLoaded).toBe(true);
    expect(renderer.musclesLoading).toBe(false);
    expect(renderer.musclesError).toBeFalsy();
    expect(renderer.visibleLayers.bodyMuscles).toBeGreaterThan(0);
    expect(Object.values(requestCounts)).toEqual([2, 2]);
    expect(errors).toEqual([]);
  } finally { release(); }
});
