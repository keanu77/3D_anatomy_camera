import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { LAYERS } from '../../src/settings.js';
import { storeSettings, watchErrors } from './helpers.js';

const onlyBody = { ...Object.fromEntries(LAYERS.map(key => [key, false])), bodyMuscles: true, performance: 'balanced', showdata: false };
const diagnostics = page => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());

for (const action of ['visibility', 'camera switch']) {
  test(`tracking resumes when ${action} invalidates pending worker bootstrap`, async ({ page }) => {
    test.setTimeout(150000);
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        postMessage(message, transfers) {
          if (message.type === 'init') window.__QA_RELEASE_INIT__ = () => super.postMessage(message, transfers);
          else super.postMessage(message, transfers);
        }
      };
    });
    await storeSettings(page, onlyBody);
    await page.goto('/'); await page.locator('#start').click();
    await expect.poll(() => page.evaluate(() => typeof window.__QA_RELEASE_INIT__)).toBe('function');
    if (action === 'visibility') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } else {
      await page.locator('#camera-switch').click();
      await expect.poll(async () => (await diagnostics(page)).camera.facing).toBe('environment');
    }
    await page.evaluate(() => window.__QA_RELEASE_INIT__());
    await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose || 0, { timeout: 90000 }).toBeGreaterThan(0);
    expect((await diagnostics(page)).trackers.execution).toBe('worker');
    expect((await diagnostics(page)).state.mode).toBe('live');
    await page.locator('#camera-stop').click();
    expect(errors).toEqual([]);
  });
}

test('background inference leaves Stop responsive and cannot redraw after camera stop', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  const errors = watchErrors(page);
  await storeSettings(page, onlyBody);
  await page.goto('/');
  await page.locator('#start').click();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose || 0, { timeout: 90000 }).toBeGreaterThan(0);
  expect((await diagnostics(page)).trackers.execution).toBe('worker');
  await expect.poll(async () => (await diagnostics(page)).trackers.inFlight).toBe(true);
  await page.evaluate(() => { window.__QA_TRACKS__ = document.querySelector('#video').srcObject.getTracks(); });
  const began = performance.now();
  await page.locator('#camera-stop').click();
  await expect(page.locator('#intro')).toBeVisible();
  const stopMs = performance.now() - began;
  expect(stopMs).toBeLessThan(2000);
  const stoppedFrames = (await diagnostics(page)).renderer.frameCount;
  await expect.poll(async () => (await diagnostics(page)).trackers.inFlight, { timeout: 60000 }).toBe(false);
  const after = await diagnostics(page);
  expect(after.state.mode).toBe('intro');
  expect(after.renderer.frameCount).toBe(stoppedFrames);
  expect(await page.evaluate(() => window.__QA_TRACKS__.every(track => track.readyState === 'ended'))).toBe(true);
  expect(await page.locator('#video').evaluate(video => video.srcObject)).toBeNull();
  expect(errors).toEqual([]);
  const receipt = testInfo.outputPath('background-stop-latency.json');
  await writeFile(receipt, JSON.stringify({ stopMs, execution: after.trackers.execution, droppedFrames: after.trackers.droppedFrames }));
  await testInfo.attach('background-stop-latency', { path: receipt, contentType: 'application/json' });
});

test('a browser that cannot start workers retains the main-thread compatibility path', async ({ page }) => {
  test.setTimeout(150000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Worker unavailable in test browser'); } }; });
  await storeSettings(page, { ...onlyBody, performance: 'lite' });
  await page.goto('/'); await page.locator('#start').click();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.pose || 0, { timeout: 90000 }).toBeGreaterThan(0);
  const tracking = (await diagnostics(page)).trackers;
  expect(tracking.execution).toBe('main');
  expect(tracking.fallbackReason).toContain('Worker unavailable');
  expect(tracking.loaded).toEqual(['pose']);
  await page.locator('#camera-stop').click();
  await expect(page.locator('#intro')).toBeVisible();
  expect(errors).toEqual([]);
});

test('dragging an appearance slider keeps accepting tracking results', async ({ page }) => {
  test.setTimeout(150000);
  const errors = watchErrors(page);
  await storeSettings(page, { ...onlyBody, bodyMuscles: false, skull: true });
  await page.goto('/'); await page.locator('#start').click();
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.face || 0, { timeout: 90000 }).toBeGreaterThan(2);
  // The frame rate is recomputed only when a tracking result is drawn; a redraw of the old frame leaves it alone.
  const accepted = drag => page.evaluate(async drag => {
    const slider = document.getElementById('bright'), rate = () => window.__ANATOMY_DIAGNOSTICS__().renderer.fps;
    let results = 0, previous = rate();
    const began = performance.now();
    await new Promise(resolve => requestAnimationFrame(function step(now) {
      if (drag) { slider.value = String(1 + .2 * Math.sin(now / 200)); slider.dispatchEvent(new Event('input', { bubbles: true })); }
      if (rate() !== previous) { results++; previous = rate(); }
      if (now - began >= 2000) resolve(); else requestAnimationFrame(step);
    }));
    return results;
  }, drag);
  const idle = await accepted(false), dragging = await accepted(true);
  expect(idle, 'tracking runs before the slider is touched').toBeGreaterThan(5);
  expect(dragging, 'tracking results drawn during two seconds of dragging').toBeGreaterThan(5);
  expect(await page.locator('#bright').inputValue()).not.toBe('1');
  await page.locator('#camera-stop').click();
  expect(errors).toEqual([]);
});
