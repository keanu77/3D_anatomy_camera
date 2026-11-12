import { test, expect, devices } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { LIVE_START, rendered, storeSettings, watchErrors } from './helpers.js';

test('intro and head demo keep body and tracking models lazy', async ({ page }) => {
  const requested = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('#start')).toBeVisible();
  expect(requested.some((path) => /\.(bin|task|wasm)$/.test(path))).toBe(false);
  await page.locator('#demo-start').click(); await rendered(page);
  expect(requested.filter((path) => path.endsWith('/anatomy/head.bin'))).toHaveLength(1);
  expect(requested.some((path) => /(?:body|muscles|joints|nerves)\.(json|bin)|\.(task|wasm)$/.test(path))).toBe(false);
  expect(errors).toEqual([]);
});

test('body demo loads anatomy only on demand and pins limb endpoints', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto('/?still#demo&body'); await rendered(page);
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.bodyLoaded)).toBe(true);
  const diagnostics = await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
  expect(diagnostics.trackers.loaded).toEqual([]);
  expect(diagnostics.renderer.bodyError).toBeFalsy();
  const segments = diagnostics.renderer.bodySegments;
  expect(segments.length).toBeGreaterThanOrEqual(8);
  for (const segment of segments) {
    for (const [actual, expected] of [[segment.proximal, segment.expectedProximal], [segment.distal, segment.expectedDistal]]) {
      expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]), segment.name).toBeLessThanOrEqual(3);
    }
  }
  await testInfo.attach('body-demo', { body: await page.locator('#stage').screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('turning body layers off before lazy loading avoids downloading body data', async ({ page }) => {
  await storeSettings(page, { spine: false, organs: false, arms: false, legs: false, bodyMuscles: false, joints: false, nerves: false });
  const bodyRequests = [];
  page.on('request', (request) => { if (/\/anatomy\/(?:body|muscles|joints|nerves)\./.test(request.url())) bodyRequests.push(request.url()); });
  await page.goto('/?still#demo'); await rendered(page);
  await page.locator('[data-preset="all"]').click();
  expect(bodyRequests).toEqual([]);
});

for (const deviceName of ['iPhone 13', 'Pixel 7']) {
  test(`mobile layout and controls: ${deviceName}`, async ({ browser }, testInfo) => {
    // Chromium emulates layout/touch. This does not claim iOS Safari hardware validation.
    const { defaultBrowserType: _browser, ...device } = devices[deviceName];
    const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173' });
    const page = await context.newPage(); const errors = watchErrors(page);
    await page.goto('/?still#demo'); await rendered(page);
    await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['#settings-toggle', '#preset-cycle', '#style-toggle', '#camera-switch-mobile']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#settings-close')).toBeFocused();
    await page.locator('#settings-close').click();
    await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'false');
    const mirror = await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mirror);
    await page.locator('#camera-switch-mobile').click();
    await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mirror)).toBe(!mirror);
    await expect(page.locator('#stage')).not.toHaveClass(/mirrored/);
    await testInfo.attach('portrait', { body: await page.screenshot(), contentType: 'image/png' });
    await page.setViewportSize({ width: device.viewport.height, height: device.viewport.width });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => {
      const { width, height } = window.__ANATOMY_DIAGNOSTICS__().renderer;
      return Math.abs(width / height - 4 / 3);
    })).toBeLessThan(0.02);
    await page.locator('#settings-toggle').click();
    await expect(page.locator('#settings-close')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('camera permission rejection leaves retry and demo usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied for test', 'NotAllowedError'); } });
  });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('權限');
  await expect(page.locator('#intro-note')).toContainText('權限');
  await expect(page.locator('#intro-note')).toBeVisible();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#demo-start')).toBeEnabled();
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.running)).toBe(false);
  await page.locator('#demo-start').click(); await rendered(page);
});

test('requested camera switching and stopping release synthetic media tracks', async ({ page }) => {
  test.setTimeout(240000);
  // Disable tracking layers here to isolate media lifecycle, without requesting a physical camera.
  await storeSettings(page, { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false });
  await page.goto('/'); await page.locator('#start').click(); await rendered(page, LIVE_START);
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.liveTracks)).toBe(1);
  await page.locator('#camera-switch').click();
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.facing)).toBe('environment');
  await page.locator('#camera-stop').click();
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.liveTracks)).toBe(0);
  await expect(page.locator('#intro')).toBeVisible();
});

test('a stale failed body demo cannot replace a newer live-camera session', async ({ page }) => {
  await page.route(/\/scene\.js(?:\?.*)?$/, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `export async function createScene() {
      let count = 0, frames = 0;
      return { resize() {}, clear() {}, dispose() {}, reconcileLoads() {}, update() { frames++; }, demo() { frames++; },
        ensureBody() { if (++count === 1) return new Promise((resolve, reject) => window.__REJECT_OLD_DEMO__ = () => reject(new Error('Delayed body failure'))); return Promise.resolve(true); },
        getDiagnostics() { return { width:640, height:480, frameCount:frames, fps:30, bodyLoaded:false }; }
      };
    }`,
  }));
  await page.goto('/#demo&body');
  await page.waitForFunction(() => typeof window.__REJECT_OLD_DEMO__ === 'function');
  await page.evaluate(async () => {
    const app = window.__ANATOMY_APP__;
    for (const key of ['skull', 'brain', 'muscles', 'eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs', 'bodyMuscles', 'joints', 'nerves', 'showdata']) app.settings[key] = false;
    await app.start();
  });
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mode)).toBe('live');
  await page.evaluate(async () => { window.__REJECT_OLD_DEMO__(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mode)).toBe('live');
  expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().camera.running)).toBe(true);
  await expect(page.locator('#intro')).toBeHidden();
  await page.locator('#camera-stop').click();
});

test('switching demo mirror while anatomy is loading remains safe', async ({ page }) => {
  const errors = watchErrors(page);
  let release, intercepted = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/anatomy/head.bin', async (route) => { intercepted = true; await gate; await route.continue(); });
  try {
    await page.goto('/?still#demo');
    await expect.poll(() => intercepted).toBe(true);
    await page.locator('#camera-switch').click();
    expect(await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().state.mirror)).toBe(false);
    release(); await rendered(page);
    await expect(page.locator('#stage')).not.toHaveClass(/mirrored/);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('body demo reports a 30-second rendering sample', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.goto('/#demo&body'); await rendered(page);
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.bodyLoaded)).toBe(true);
  const sample = await page.evaluate(async () => {
    const intervals = []; let previous = performance.now(); const start = previous;
    await new Promise((resolve) => {
      function tick(now) { intervals.push(now - previous); previous = now; if (now - start >= 30000) resolve(); else requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    });
    intervals.sort((a, b) => a - b);
    return { durationMs: previous - start, samples: intervals.length, averageFrameMs: intervals.reduce((sum, n) => sum + n, 0) / intervals.length, p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], userAgent: navigator.userAgent, renderer: window.__ANATOMY_DIAGNOSTICS__().renderer };
  });
  const samplePath = testInfo.outputPath('performance-reference.json');
  await writeFile(samplePath, JSON.stringify(sample, null, 2));
  await testInfo.attach('performance-reference', { path: samplePath, contentType: 'application/json' });
  expect(sample.durationMs).toBeGreaterThanOrEqual(30000);
  expect(sample.samples).toBeGreaterThan(0);
});
