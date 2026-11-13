import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { rendered, storeSettings, watchErrors } from './helpers.js';

const body = JSON.parse(readFileSync(new URL('../../public/anatomy/individual-body.json', import.meta.url)));
const head = JSON.parse(readFileSync(new URL('../../public/anatomy/individual-head.json', import.meta.url)));
const sourceParts = [...body.meshes, ...head.meshes, ...head.existingParts].flatMap((mesh) => mesh.parts);
const displayedParts = sourceParts.flatMap((part) => part.pairedId
  ? [part, { ...part, id: part.pairedId, name: part.pairedName, side: 'L' }] : [part]);
const exact = (name) => {
  const part = displayedParts.find((item) => item.name === name);
  if (!part) throw new Error(`Expected exact source label is missing from delivered assets: ${name}`);
  return part;
};
const baseSettings = { skull: false, brain: false, muscles: false, eyes: false, outline: false,
  hands: false, spine: false, organs: false, arms: false, legs: false, bodyMuscles: false,
  joints: false, nerves: false, showdata: false, labels: false, style: 'xray', reveal: 'whole', performance: 'balanced' };
const diagnostic = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
const inspection = async (page) => (await diagnostic(page)).renderer.inspection;
const individualPattern = /\/anatomy\/individual-(body|head)\.(json|bin)$/;

function requestsFor(page) {
  const paths = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (individualPattern.test(path)) paths.push(path);
  });
  return paths;
}

async function openDemo(page, settings, { enable = true } = {}) {
  await storeSettings(page, { ...baseSettings, ...settings });
  await page.goto('/?still#demo'); await rendered(page);
  if (settings.arms || settings.legs || settings.spine) await expect.poll(async () => (await diagnostic(page)).renderer.bodyLoaded).toBe(true);
  if (settings.bodyMuscles) await expect.poll(async () => (await diagnostic(page)).renderer.musclesLoaded).toBe(true);
  if (enable) {
    await page.locator('#inspection-toggle').click();
    for (const bundle of [
      ...(settings.skull || settings.muscles || settings.hands ? ['head'] : []),
      ...(settings.arms || settings.legs || settings.spine || settings.bodyMuscles ? ['body'] : []),
    ]) await expect.poll(async () => (await inspection(page)).loaded).toContain(bundle);
    await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  }
}

async function clearCard(page) {
  if (await page.locator('#inspection-card').isVisible()) await page.locator('.inspection-clear').click();
  await expect(page.locator('#inspection-card')).not.toBeVisible();
}

async function probeSource(page, expected, instance) {
  const point = await page.evaluate((query) => window.__ANATOMY_APP__.inspectionProbe(query), { id: expected.id, instance });
  expect(point, `${expected.name} has a displayed source triangle`).not.toBeNull();
  expect(point.id).toBe(expected.id);
  expect(point.name).toBe(expected.name);
  return point;
}

async function clickPoint(page, point, touch = false) {
  // Sidebar controls may scroll the document; never click a projected point
  // while its stage is outside the physical viewport.
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const rect = await page.locator('#stage').boundingBox();
  const { width, height } = (await diagnostic(page)).renderer;
  const x = rect.x + point.x * rect.width / width, y = rect.y + point.y * rect.height / height;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function setReveal(page, reveal, cut) {
  let frames = (await diagnostic(page)).renderer.frameCount;
  await page.locator('#reveal').selectOption(reveal);
  await expect.poll(async () => (await diagnostic(page)).renderer.frameCount).toBeGreaterThan(frames);
  if (cut !== undefined) {
    frames = (await diagnostic(page)).renderer.frameCount;
    await page.locator('#cut').focus(); await page.keyboard.press(cut === 0 ? 'Home' : 'End');
    await expect(page.locator('#cut')).toHaveValue(String(cut));
    await expect.poll(async () => (await diagnostic(page)).renderer.frameCount).toBeGreaterThan(frames);
  }
}

async function assertSelected(page, expected) {
  await expect.poll(async () => (await inspection(page)).selected?.id).toBe(expected.id);
  const result = await inspection(page);
  expect(result.selected.name).toBe(expected.name);
  expect(result.selected.side).toBe(expected.side);
  expect(result.highlightedIndices).toBe(expected.count);
  await expect(page.locator('#inspection-card')).toBeVisible();
  await expect(page.locator('#inspection-card')).toContainText(expected.name);
  await expect(page.locator('.inspection-source')).toContainText(expected.id);
  await expect(page.locator('.inspection-name')).not.toBeEmpty();
  return result;
}

async function clickSource(page, expected, instance, touch = false) {
  // Card dismissal is a real UI action, keeping the next source triangle exposed.
  await clearCard(page);
  const point = await probeSource(page, expected, instance);
  await clickPoint(page, point, touch);
  await expect.poll(async () => (await inspection(page)).candidateIds).toContain(expected.id);
  const candidates = (await inspection(page)).candidateIds;
  const index = candidates.indexOf(expected.id);
  if (index !== 0) {
    await expect(page.locator('#inspection-candidates')).toBeVisible();
    await page.locator('#inspection-candidates').selectOption(String(index));
  }
  await assertSelected(page, expected);
  return { point, candidates };
}

test('individual source assets stay lazy through intro and ordinary demo, then load once on demand', async ({ page }) => {
  const requests = requestsFor(page), errors = watchErrors(page);
  await storeSettings(page, { ...baseSettings, skull: true, hands: true });
  await page.goto('/?still');
  await expect(page.locator('#demo-start')).toBeVisible();
  expect(requests).toEqual([]);
  await page.locator('#demo-start').click(); await rendered(page);
  expect(requests).toEqual([]);
  expect((await diagnostic(page)).trackers.loaded).toEqual([]);
  await page.locator('#inspection-toggle').click();
  await expect.poll(async () => (await inspection(page)).loaded).toEqual(['head']);
  expect(requests.sort()).toEqual(['/anatomy/individual-head.bin', '/anatomy/individual-head.json']);
  await page.locator('#inspection-toggle').click();
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  expect(requests).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('adjacent forearm, knee and lower-leg bones retain different exact identities', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await openDemo(page, { arms: true, legs: true });
  const names = ['left radius', 'left ulna', 'left femur', 'left patella', 'left tibia', 'left fibula'];
  const selected = [];
  for (const name of names) {
    const part = exact(name);
    await clickSource(page, part); selected.push(part.id);
  }
  expect(new Set(selected).size).toBe(names.length);
  await testInfo.attach('individual-adjacent-bones', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('muscle heads and neighboring muscles remain exact and overlapping structures can be switched', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await openDemo(page, { bodyMuscles: true });
  const names = ['short head of left biceps brachii', 'long head of left biceps brachii',
    'lateral head of left triceps brachii', 'clavicular part of left pectoralis major', 'clavicular part of left deltoid'];
  let switchedOverlap = false;
  for (const name of names) {
    const expected = exact(name), { candidates } = await clickSource(page, expected);
    expect((await inspection(page)).selected.identityScope).toBe('muscle-part');
    if (!switchedOverlap && candidates.length > 1) {
      const alternateIndex = candidates.findIndex((id) => id !== expected.id);
      const alternate = displayedParts.find((part) => part.id === candidates[alternateIndex]);
      expect(alternate).toBeTruthy();
      await expect(page.locator('.inspection-candidate-label')).toContainText(String(candidates.length));
      await page.locator('#inspection-candidates').selectOption(String(alternateIndex));
      await assertSelected(page, alternate); switchedOverlap = true;
    }
  }
  expect(switchedOverlap, 'real source surfaces overlap and the UI changes the highlighted identity').toBe(true);
  await testInfo.attach('individual-muscle-head', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('individual skull, carpal and finger surfaces use source labels with desktop clicks and mobile touch', async ({ page, browser }, testInfo) => {
  const errors = watchErrors(page);
  await openDemo(page, { skull: true, hands: true });
  for (const name of ['frontal bone', 'right parietal bone', 'mandible']) await clickSource(page, exact(name), 'head:');
  await clickSource(page, exact('right scaphoid'), 'hand:0:');
  await clickSource(page, exact('proximal phalanx of right index finger'), 'hand:0:');
  await testInfo.attach('individual-hand-finger', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('[data-style="solid"]').click();
  await clickSource(page, exact('frontal bone'), 'head:');
  expect((await inspection(page)).candidateIds).toHaveLength(1);
  expect(errors).toEqual([]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-TW',
    deviceScaleFactor: 1, ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:4173' });
  try {
    const mobile = await context.newPage(), mobileErrors = watchErrors(mobile);
    await openDemo(mobile, { skull: true, hands: true });
    await clickSource(mobile, exact('frontal bone'), 'head:', true);
    const card = await mobile.locator('#inspection-card').boundingBox();
    const controls = await mobile.locator('.mobile-controls').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(390);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(controls.y);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await testInfo.attach('individual-mobile-touch', { body: await mobile.screenshot(), contentType: 'image/png' });
    expect(mobileErrors).toEqual([]);
  } finally { await context.close(); }
});

test('display mirroring preserves anatomical side, including the paired left-hand source identity', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, { arms: true, hands: true });
  const left = exact('left radius'), right = exact('right radius');
  const beforeLeft = (await clickSource(page, left)).point;
  const beforeRight = (await clickSource(page, right)).point;
  await page.locator('#camera-switch').click();
  await expect.poll(async () => (await diagnostic(page)).state.mirror).toBe(false);
  const afterLeft = (await clickSource(page, left)).point;
  const afterRight = (await clickSource(page, right)).point;
  expect(Math.sign(beforeLeft.x - beforeRight.x)).toBe(-Math.sign(afterLeft.x - afterRight.x));
  const width = (await diagnostic(page)).renderer.width;
  expect(Math.abs(beforeLeft.x + afterLeft.x - width)).toBeLessThan(2);
  await clickSource(page, exact('left scaphoid'), 'hand:1:');
  const paired = (await inspection(page)).selected;
  expect(paired.sourceId).toBe(exact('right scaphoid').id);
  expect(paired.mirrored).toBe(true);
  await expect(page.locator('.inspection-classification')).toContainText('左');
  expect(errors).toEqual([]);
});

test('clear, hidden layers, disable and Stop remove the selected surface and highlight', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, { arms: true });
  const expected = exact('left radius');
  const { point } = await clickSource(page, expected);
  await page.locator('.inspection-clear').click();
  expect((await inspection(page)).selected).toBeNull();
  expect((await inspection(page)).highlightedIndices).toBe(0);
  await clickSource(page, expected);
  await page.locator('#L_arms').uncheck();
  await expect.poll(async () => (await diagnostic(page)).renderer.visibleLayers.arms).toBe(0);
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  await clickPoint(page, point);
  expect((await inspection(page)).selected).toBeNull();
  await page.locator('#L_arms').check();
  await expect.poll(async () => (await diagnostic(page)).renderer.visibleLayers.arms).toBeGreaterThan(0);
  await clickSource(page, expected);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect((await inspection(page)).highlightedIndices).toBe(0);
  await clickPoint(page, point);
  expect((await inspection(page)).selected).toBeNull();
  await page.locator('#inspection-toggle').click();
  await clickSource(page, expected);
  await page.locator('#camera-stop').click();
  await expect(page.locator('#intro')).toBeVisible();
  const stopped = await diagnostic(page);
  expect(stopped.state.mode).toBe('intro');
  expect(stopped.renderer.inspection.active).toBe(false);
  expect(stopped.renderer.inspection.selected).toBeNull();
  expect(stopped.renderer.inspection.highlightedIndices).toBe(0);
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('blank, clipped and outside-lens clicks do not select hidden anatomy', async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, { skull: true });
  const frontal = exact('frontal bone'), parietal = exact('right parietal bone');
  const { point: frontalPoint } = await clickSource(page, frontal, 'head:');
  await clearCard(page);
  const { width, height } = (await diagnostic(page)).renderer;
  await clickPoint(page, { x: width - 4, y: height - 4 });
  expect((await inspection(page)).selected).toBeNull();
  const { point: parietalPoint } = await clickSource(page, parietal, 'head:');
  await setReveal(page, 'left', 1);
  await clickPoint(page, parietalPoint);
  expect((await inspection(page)).candidateIds).not.toContain(parietal.id);
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  await setReveal(page, 'whole');
  await clickSource(page, frontal, 'head:');
  await setReveal(page, 'lens', 0);
  await expect(page.locator('#gl')).toHaveCSS('mask-image', /radial-gradient/);
  await clickPoint(page, frontalPoint);
  await expect.poll(async () => (await inspection(page)).selected).toBeNull();
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('cancelled detailed-asset requests cannot install over the next active generation', async ({ page }) => {
  const errors = watchErrors(page), counts = {}, aborted = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  page.on('requestfailed', (request) => { if (/\/individual-body\./.test(request.url())) aborted.push(request.url()); });
  await page.route(/\/anatomy\/individual-body\.(json|bin)$/, async (route) => {
    const name = new URL(route.request().url()).pathname;
    counts[name] = (counts[name] || 0) + 1;
    if (counts[name] === 1) await gate;
    try { await route.continue(); } catch { /* Deliberately cancelled first generation. */ }
  });
  try {
    await openDemo(page, { arms: true }, { enable: false });
    await page.locator('#inspection-toggle').click();
    await expect.poll(() => Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(2);
    await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'true');
    await page.locator('#inspection-toggle').click();
    await expect.poll(() => aborted.length).toBeGreaterThan(0);
    expect((await inspection(page)).loaded).toEqual([]);
    await page.locator('#inspection-toggle').click();
    await expect.poll(async () => (await inspection(page)).loaded).toEqual(['body']);
    release();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
    expect(Object.values(counts)).toEqual([2, 2]);
    await clickSource(page, exact('left ulna'));
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('a body-detail failure remains retryable after head detail has loaded successfully', async ({ page }) => {
  const requests = requestsFor(page), errors = watchErrors(page), counts = {};
  await page.route(/\/anatomy\/individual-body\.(json|bin)$/, async (route) => {
    const name = new URL(route.request().url()).pathname;
    counts[name] = (counts[name] || 0) + 1;
    if (counts[name] === 1) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'deliberate detailed-asset failure' });
    else await route.continue();
  });
  await openDemo(page, { skull: true, arms: true }, { enable: false });
  await page.locator('#inspection-toggle').click();
  await expect.poll(async () => (await inspection(page)).loaded).toEqual(['head']);
  await expect(page.locator('.inspection-status')).toContainText('失敗');
  await expect(page.locator('.inspection-retry')).toBeVisible();
  await expect(page.locator('#inspection-card')).not.toBeVisible();
  await page.locator('.inspection-retry').click();
  await expect.poll(async () => [...(await inspection(page)).loaded].sort()).toEqual(['body', 'head']);
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.inspection-retry')).not.toBeVisible();
  expect(requests.filter((path) => path.includes('individual-head'))).toHaveLength(2);
  expect(requests.filter((path) => path.includes('individual-body'))).toHaveLength(4);
  await clickSource(page, exact('left radius'));
  expect(errors).toEqual([]);
});
