import { test, expect, devices } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { LIVE_START, fixedStage, rendered, storeSettings, watchErrors, openAdvanced } from './helpers.js';

const off = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false,
  spine: false, organs: false, arms: false, legs: false, bodyMuscles: false, joints: false, nerves: false, showdata: false, performance: 'balanced' };
const diagnostics = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
const bundles = ['body', 'muscles', 'joints', 'nerves'];
const watchRequests = (page) => { const requests = []; page.on('request', (request) => requests.push(request.url())); return requests; };
const bundleRequests = (requests, bundle) => requests.filter((url) => new RegExp(`/anatomy/${bundle}\\.(json|bin)$`).test(url));

for (const layer of ['joints', 'nerves']) {
  test(`${layer} alone render and reload from cache without downloading other body systems`, async ({ page }, testInfo) => {
    const errors = watchErrors(page), requests = watchRequests(page);
    await storeSettings(page, { ...off, [layer]: true, labels: true });
    await page.goto('/?still#demo'); await rendered(page);
    await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers[layer]).toBeGreaterThan(0);
    const ready = await diagnostics(page);
    expect(ready.renderer[`${layer}Loaded`]).toBe(true);
    expect(ready.renderer[`${layer}Error`]).toBeFalsy();
    expect(ready.trackers.loaded).toEqual([]);
    for (const bundle of bundles) expect(bundleRequests(requests, bundle), bundle).toHaveLength(bundle === layer ? 2 : 0);
    for (const segment of ready.renderer[layer === 'joints' ? 'jointSegments' : 'nerveSegments']) {
      for (const [actual, expected] of [[segment.proximal, segment.expectedProximal], [segment.distal, segment.expectedDistal]]) {
        expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]), segment.name).toBeLessThanOrEqual(3);
      }
    }
    await page.locator(`[data-style="solid"]`).click();
    await testInfo.attach(`${layer}-solid`, { body: await page.locator('#stage').screenshot(), contentType: 'image/png' });
    await openAdvanced(page); await page.locator(`#L_${layer}`).uncheck();
    await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers[layer]).toBe(0);
    await openAdvanced(page); await page.locator(`#L_${layer}`).check();
    await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers[layer]).toBeGreaterThan(0);
    expect(bundleRequests(requests, layer)).toHaveLength(2);
    expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('three-system overview combines all requested layers and draws shared labels while organs remain off', async ({ page }, testInfo) => {
  const errors = watchErrors(page), requests = watchRequests(page);
  await fixedStage(page); await storeSettings(page, { labels: false });
  await page.goto('/?still#demo&systems'); await rendered(page);
  for (const layer of ['spine', 'arms', 'legs', 'bodyMuscles', 'joints', 'nerves']) {
    await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers[layer]).toBeGreaterThan(0);
  }
  expect((await diagnostics(page)).renderer.visibleLayers.organs).toBe(0);
  for (const bundle of bundles) expect(bundleRequests(requests, bundle), bundle).toHaveLength(2);
  for (const style of ['xray', 'solid']) {
    await page.locator(`[data-style="${style}"]`).click();
    await page.locator('#labels').uncheck();
    // A settings change redraws after asynchronous bundle reconciliation.
    // Checkbox state alone does not mean the label canvas has been repainted.
    await expect.poll(async () => (await diagnostics(page)).renderer.labelLayout.length).toBe(0);
    await expect(page.locator('#hud')).toBeHidden();
    const bare = PNG.sync.read(await page.locator('#stage').screenshot());
    const hudBefore = await page.locator('#hud').evaluate(canvas => canvas.toDataURL());
    await page.locator('#labels').check();
    await expect.poll(async () => (await diagnostics(page)).renderer.labelLayout.length).toBeGreaterThan(0);
    await expect(page.locator('#hud')).toBeVisible();
    const labeled = PNG.sync.read(await page.locator('#stage').screenshot());
    const hudAfter = await page.locator('#hud').evaluate(canvas => canvas.toDataURL());
    const changed = pixelmatch(bare.data, labeled.data, null, bare.width, bare.height, { threshold: 0.1, includeAA: false });
    await testInfo.attach(`systems-${style}-bare`, { body: PNG.sync.write(bare), contentType: 'image/png' });
    await testInfo.attach(`systems-${style}-labels`, { body: PNG.sync.write(labeled), contentType: 'image/png' });
    await testInfo.attach(`systems-${style}-hud-before`, { body: Buffer.from(hudBefore.split(',')[1], 'base64'), contentType: 'image/png' });
    await testInfo.attach(`systems-${style}-hud-after`, { body: Buffer.from(hudAfter.split(',')[1], 'base64'), contentType: 'image/png' });
    expect(changed, `${style} labels are visibly drawn`).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
});

test('three-system direct link fits mobile portrait and short landscape with shared labels', async ({ browser }, testInfo) => {
  const { defaultBrowserType: _browser, ...device } = devices['iPhone 13'];
  const context = await browser.newContext({ ...device, locale: 'zh-TW', ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173' });
  try {
    const page = await context.newPage(), errors = watchErrors(page);
    await storeSettings(page, { labels: true });
    await page.goto('/?still#demo&systems'); await rendered(page);
    for (const layer of ['bodyMuscles', 'joints', 'nerves']) await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers[layer]).toBeGreaterThan(0);
    for (const [orientation, viewport, ratio] of [['portrait', device.viewport, 9 / 16], ['landscape', { width: device.viewport.height, height: device.viewport.width }, 4 / 3]]) {
      await page.setViewportSize(viewport);
      await expect.poll(async () => { const { width, height } = (await diagnostics(page)).renderer; return Math.abs(width / height - ratio); }).toBeLessThan(0.02);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('#settings-toggle').click();
      await expect(page.locator('#settings-close')).toBeFocused();
      for (const layer of ['bodyMuscles', 'joints', 'nerves']) await expect(page.locator(`#L_${layer}`)).toBeChecked();
      await expect(page.locator('#L_organs')).not.toBeChecked();
      await page.locator('#settings-close').click();
      await testInfo.attach(`systems-mobile-${orientation}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('name labels are drawn at the display resolution of a phone, in the same place', async ({ browser }) => {
  const { defaultBrowserType: _browser, ...device } = devices['iPhone 13'];
  const context = await browser.newContext({ ...device, locale: 'zh-TW', ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173' });
  try {
    const page = await context.newPage(), errors = watchErrors(page);
    await storeSettings(page, { ...off, skull: true, brain: true, outline: true, labels: true });
    await page.goto('/?still#demo'); await rendered(page);
    await expect.poll(async () => (await diagnostics(page)).renderer.labelLayout.length).toBeGreaterThan(3);
    const density = await page.evaluate(() => devicePixelRatio);
    expect(density).toBe(3);
    const measured = await page.locator('#hud').evaluate((canvas) => {
      const box = canvas.getBoundingClientRect(), layout = window.__ANATOMY_DIAGNOSTICS__().renderer.labelLayout;
      const scale = canvas.width / box.width, context = canvas.getContext('2d');
      // Opaque pixels inside the first label's panel, and in a strip of the same size just above every label.
      const count = ({ x, y, width, height }) => { const data = context.getImageData(Math.round(x * scale), Math.round(y * scale), Math.round(width * scale), Math.round(height * scale)).data; let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 200) n++; return n / (data.length / 4); };
      const first = layout[0].bounds, top = Math.min(...layout.map((item) => item.bounds.y));
      return { scale, heightScale: canvas.height / box.height, inside: count(first), above: top > 20 ? count({ ...first, y: top - 18 }) : 0 };
    });
    expect(measured.scale).toBeCloseTo(density, 1);
    expect(measured.heightScale).toBeCloseTo(density, 1);
    expect(measured.inside, 'the panel is painted where the layout says it is').toBeGreaterThan(0.9);
    expect(measured.above).toBe(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('joints use Pose alone while head and body nerves use Face plus Pose without Hands', async ({ page }) => {
  // Two sequential model-start waits can each take 90s on software-rendered CI;
  // leave a separate 30s budget for the unchanged stop/resume lifecycle checks.
  test.setTimeout(210000);
  const requests = watchRequests(page), errors = watchErrors(page);
  await storeSettings(page, { ...off, joints: true });
  await page.goto('/'); await page.locator('#start').click(); await rendered(page, LIVE_START);
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose || 0, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  expect((await diagnostics(page)).trackers.loaded).toEqual(['pose']);
  expect((await diagnostics(page)).renderer.jointsLoaded).toBe(true);
  expect(bundleRequests(requests, 'nerves')).toEqual([]);
  await openAdvanced(page); await page.locator('#L_nerves').check();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.face || 0, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  expect((await diagnostics(page)).trackers.loaded.sort()).toEqual(['face', 'pose']);
  expect((await diagnostics(page)).renderer.nervesLoaded).toBe(true);
  expect(bundleRequests(requests, 'body')).toEqual([]);
  expect(bundleRequests(requests, 'muscles')).toEqual([]);
  await openAdvanced(page); await page.locator('#L_joints').uncheck();
  const first = (await diagnostics(page)).trackers.calls.pose;
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose).toBeGreaterThan(first);
  await openAdvanced(page); await page.locator('#L_nerves').uncheck();
  await expect.poll(async () => (await diagnostics(page)).trackers.inFlight, { timeout: 60000 }).toBe(false);
  const stopped = (await diagnostics(page)).trackers.calls;
  const videoTime = await page.locator('#video').evaluate((video) => video.currentTime);
  await expect.poll(() => page.locator('#video').evaluate((video) => video.currentTime)).toBeGreaterThan(videoTime + 0.5);
  expect((await diagnostics(page)).trackers.calls).toEqual(stopped);
  await openAdvanced(page); await page.locator('#L_joints').check();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose).toBeGreaterThan(stopped.pose);
  expect((await diagnostics(page)).trackers.calls.face).toBe(stopped.face);
  await page.locator('#camera-stop').click();
  expect((await diagnostics(page)).camera.liveTracks).toBe(0);
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
});

test('production nervous demo loads only its own optional anatomy under CSP', async ({ page }) => {
  const requests = watchRequests(page), errors = watchErrors(page), origin = 'http://127.0.0.1:4174';
  const response = await page.goto(`${origin}/?still#demo&nervous`);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#gl')).not.toHaveJSProperty('width', 300);
  expect(bundleRequests(requests, 'nerves')).toHaveLength(2);
  for (const bundle of ['body', 'muscles', 'joints']) expect(bundleRequests(requests, bundle), bundle).toHaveLength(0);
  expect(requests.some((url) => /\.(task|wasm)$/.test(url))).toBe(false);
  expect(requests.every((url) => new URL(url).origin === origin)).toBe(true);
  expect(errors).toEqual([]);
});
