import { test, expect } from '@playwright/test';
import { storeSettings, watchErrors } from './helpers.js';

const PROD = 'http://127.0.0.1:4174';

test('production sends security headers and ignores dynamic import override', async ({ page }) => {
  const errors = watchErrors(page), requests = [], delivered = new Map();
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (reply) => delivered.set(new URL(reply.url()).pathname, reply.headers()));
  await page.route('https://attacker.invalid/**', (route) => route.abort());
  const response = await page.goto(`${PROD}/?still&dump&three=https://attacker.invalid/payload.js#demo`);
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#gl')).not.toHaveJSProperty('width', 300);
  expect(requests.every((url) => new URL(url).origin === PROD)).toBe(true);
  expect(requests.some((url) => /\/anatomy\/head.bin$/.test(url))).toBe(true);
  // Hashed bundles may be cached forever; geometry needs a type the CDN will compress.
  const hashed = [...delivered].filter(([path]) => path.startsWith('/assets/'));
  expect(hashed.length).toBeGreaterThan(0);
  for (const [path, sent] of hashed) expect(sent['cache-control'], path).toContain('immutable');
  expect(delivered.get('/anatomy/head.bin')['content-type']).toBe('application/x-protobuf');
  expect(delivered.get('/anatomy/head.json')['cache-control']).not.toContain('immutable');
  expect(await page.evaluate(() => typeof window.__ANATOMY_DIAGNOSTICS__)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.__ANATOMY_APP__)).toBe('undefined');
  expect(await page.locator('body > img').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('production runs face, hand and pose inference under CSP using synthetic video', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const errors = watchErrors(page), requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await storeSettings(page, { spine: true, arms: true, legs: true, organs: true, showdata: true, performance: 'balanced' });
  await page.goto(`${PROD}/`);
  await page.locator('#start').click();
  await expect(page.locator('#data')).toContainText('frames/s', { timeout: 150000 });
  for (const filename of ['face_landmarker.task', 'hand_landmarker.task', 'pose_landmarker_lite.task']) {
    expect(requests.filter((url) => url.endsWith(`/models/${filename}`)), filename).toHaveLength(1);
  }
  expect(requests.some((url) => /\.wasm$/.test(url))).toBe(true);
  expect(requests.every((url) => new URL(url).origin === PROD)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('#video').srcObject.getTracks().every((track) => track.readyState === 'live'))).toBe(true);
  await testInfo.attach('synthetic-inference-status', { body: await page.locator('#data').textContent(), contentType: 'text/plain' });
  await page.locator('#camera-stop').click();
  expect(await page.evaluate(() => document.querySelector('#video').srcObject)).toBeNull();
  expect(errors).toEqual([]);
});
