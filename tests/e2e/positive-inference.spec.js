import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { storeSettings, watchErrors } from './helpers.js';

const provenance = JSON.parse(await readFile(new URL('../fixtures/provenance.json', import.meta.url), 'utf8'));
const cache = process.env.ANATOMY_FIXTURE_DIR || join(tmpdir(), 'anatomy-mirror-fixtures');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(name) {
  const entry = provenance.fixtures[name]; await mkdir(cache, { recursive: true });
  const path = join(cache, name);
  let data;
  try { data = await readFile(path); } catch { /* Download first use only. */ }
  if (!data) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Official test fixture unavailable: ${response.status} ${name}`);
    data = Buffer.from(await response.arrayBuffer());
    if (sha(data) !== entry.sha256) throw new Error(`Official test fixture changed: ${name}`);
    await writeFile(path, data);
  }
  expect(sha(data), name).toBe(entry.sha256); return data;
}

// Do not store identifiable official sample photos in screenshots or traces.
test.use({ screenshot: 'off', trace: 'off' });
test.describe('positive detections from official image-derived streams', () => {
  for (const [name, file, settings, match] of [
    ['face', 'portrait.jpg', { skull: true, eyes: true, outline: true, hands: false }, /face\s+tracked/],
    ['hands', 'right_hands.jpg', { skull: false, eyes: false, outline: false, hands: true }, /hands\s+(right|left)/],
    ['pose', 'pose.jpg', { skull: false, eyes: false, outline: false, hands: false, spine: true, arms: true, legs: true }, /body parts\s+[1-9]/],
    ['body muscles', 'pose.jpg', { skull: false, eyes: false, outline: false, hands: false, bodyMuscles: true }, /body parts\s+[1-9]/],
    ['head nerves', 'portrait.jpg', { skull: false, eyes: false, outline: false, hands: false, nerves: true }, /face\s+tracked/],
  ]) {
    test(`detects ${name} using the actual installed model`, async ({ page }, testInfo) => {
      test.setTimeout(150000);
      const errors = watchErrors(page), source = await fixture(file);
      await storeSettings(page, { ...settings, showdata: true, performance: 'balanced' });
      await page.route(`**/__qa-fixture/${file}`, (route) => route.fulfill({ body: source, contentType: 'image/jpeg' }));
      await page.addInitScript((filename) => {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
          const image = new Image(); image.src = `/__qa-fixture/${filename}`; await image.decode();
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
          const context = canvas.getContext('2d');
          const draw = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
          draw(); const stream = canvas.captureStream(8); const timer = setInterval(draw, 125);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
          }
          return stream;
        } });
      }, file);
      await page.goto(name === 'head nerves' ? 'https://127.0.0.1:4173/' : 'http://127.0.0.1:4174/');
      await page.locator('#start').click();
      await expect(page.locator('#data')).toContainText(match, { timeout: 120000 });
      if (name === 'pose' || name === 'body muscles') {
        // A detected body is not enough: GPU readback must produce a real veil.
        // Keep only a numeric count; never save the human fixture as an image.
        const maskPixels = await page.locator('#shade').evaluate(canvas => {
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
          return visible;
        });
        expect(maskPixels).toBeGreaterThan(100);
        await testInfo.attach('body-veil-pixels', { body: JSON.stringify({ maskPixels }), contentType: 'application/json' });
      }
      if (name === 'hands') {
        // The upstream fixture depicts two anatomical right hands. Display reflection
        // must not relabel them as left or change their anatomical rig handedness.
        await expect(page.locator('#data')).toContainText(/hands\s+right \+ right/);
        await page.locator('#camera-switch').click();
        await expect(page.locator('#stage')).not.toHaveClass(/mirrored/);
        await expect.poll(() => page.evaluate(() => document.querySelector('#video').currentTime)).toBeGreaterThan(0.5);
        await expect(page.locator('#data')).toContainText(/hands\s+right \+ right/);
      }
      if (name === 'head nerves') {
        await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.nerveHeadVisible), { timeout: 30000 }).toBe(5);
        // The official portrait also produces a valid Pose result on this model;
        // head-without-Pose independence is tested separately with an explicit absent Pose.
        const diagnostic = await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer);
        expect(diagnostic.headFound).toBe(true);
        await testInfo.attach('head-nerve-diagnostics', { body: JSON.stringify({ headFound: diagnostic.headFound, poseFound: diagnostic.poseFound,
          nerveHeadVisible: diagnostic.nerveHeadVisible, nerveBodyVisible: diagnostic.nerveBodyVisible }), contentType: 'application/json' });
      }
      const status = await page.locator('#data').textContent();
      const statusPath = testInfo.outputPath('positive-detection-status.json');
      await writeFile(statusPath, JSON.stringify({ fixture: file, sourceSha256: sha(source), status }, null, 2));
      await testInfo.attach('positive-detection-status', { path: statusPath, contentType: 'application/json' });
      expect(errors).toEqual([]);
      await page.locator('#camera-stop').click();
    });
  }
});

test('with a region enlarged and no hand in view, the lens stays under the cursor', async ({ page }) => {
  test.setTimeout(150000);
  const source = await fixture('pose.jpg');
  await storeSettings(page, { skull: false, eyes: false, outline: false, hands: false, spine: true, arms: true, bodyMuscles: true,
    focus: 'shoulder', focusZoom: true, reveal: 'lens', cut: 0.3, showdata: true, performance: 'balanced' });
  await page.route('**/__qa-fixture/pose.jpg', (route) => route.fulfill({ body: source, contentType: 'image/jpeg' }));
  // No hand tracker: the lens then follows the pointer, as it does whenever no fingertip is found.
  await page.route('**/models/hand_landmarker.task', (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const image = new Image(); image.src = '/__qa-fixture/pose.jpg'; await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext('2d');
      const draw = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      draw(); const stream = canvas.captureStream(8); const timer = setInterval(draw, 125);
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; }
      return stream;
    } });
  });
  await page.goto('https://127.0.0.1:4173/');
  await page.locator('#start').click();
  await expect(page.locator('#data')).toContainText(/body parts\s+[1-9]/, { timeout: 120000 });
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__().renderer.zoom.z), { timeout: 30000 }).toBeGreaterThan(1.5);
  const rect = await page.locator('#stage').boundingBox();
  for (const [fx, fy] of [[0.3, 0.4], [0.62, 0.55]]) {
    const target = { x: rect.x + rect.width * fx, y: rect.y + rect.height * fy };
    await page.mouse.move(target.x - 4, target.y - 4); await page.mouse.move(target.x, target.y);
    // Where the lens is shown: its centre in the layer, through that layer's own mirror and zoom.
    const shown = () => page.evaluate(() => {
      const { renderer, state } = window.__ANATOMY_DIAGNOSTICS__(), { z, bx, by } = renderer.zoom;
      const centre = document.getElementById('gl').style.maskImage.match(/circle at ([\d.]+)% ([\d.]+)%/);
      if (!centre) return null;
      const x = centre[1] / 100 * renderer.width, y = centre[2] / 100 * renderer.height;
      return { x: z * (state.mirror ? renderer.width - x : x) + bx, y: z * y + by, width: renderer.width, height: renderer.height };
    });
    await expect.poll(async () => { const lens = await shown(); return lens ? Math.hypot(lens.x - fx * lens.width, lens.y - fy * lens.height) : Infinity; },
      { message: `lens centre under the pointer at ${fx}, ${fy}` }).toBeLessThan(2);
  }
  await page.locator('#camera-stop').click();
});
