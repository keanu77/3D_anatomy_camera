import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { rendered, storeSettings, watchErrors } from './helpers.js';

const body = JSON.parse(readFileSync(new URL('../../public/anatomy/individual-body.json', import.meta.url)));
const exact = (name) => {
  const part = body.meshes.flatMap((mesh) => mesh.parts).find((item) => item.name === name);
  if (!part) throw new Error(`Expected source part is missing from delivered assets: ${name}`);
  return part;
};
const off = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false, spine: false, organs: false,
  arms: false, legs: false, bodyMuscles: false, joints: false, nerves: false, showdata: false, labels: false, style: 'xray', reveal: 'whole', performance: 'balanced' };
// Structures a left-shoulder focus draws, straight from the delivered parts.
const kept = new Set(body.meshes.flatMap((mesh) => mesh.parts).filter((part) => part.side !== 'R' && (
  /(deltoid|supraspinatus|infraspinatus|subscapularis|teres (major|minor)|pectoralis (major|minor)|subclavius|serratus anterior|trapezius|levator scapulae|rhomboid (major|minor)|latissimus dorsi|coracobrachialis|biceps brachii)/.test(part.name)
  || ['left clavicle', 'left scapula', 'left humerus', 'long head of left triceps brachii'].includes(part.name))).map((part) => part.id));
const renderer = async (page) => (await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__())).renderer;
const probe = (page, query) => page.evaluate((value) => window.__ANATOMY_APP__.inspectionProbe(value), query);

async function open(page, hash, settings = {}) {
  await storeSettings(page, { ...off, ...settings });
  await page.goto(`/?still#demo${hash}`); await rendered(page);
}
async function focused(page, key) {
  await expect.poll(async () => (await renderer(page)).inspection.filter).toBe(key);
  await expect.poll(async () => (await renderer(page)).inspection.loaded).toContain('body');
}
async function clickStage(page, point) {
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const rect = await page.locator('#stage').boundingBox(), { width, height } = await renderer(page);
  await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
}

test('a shoulder link isolates the shoulder girdle, names it and zooms in', async ({ page }) => {
  const errors = watchErrors(page), requests = [];
  page.on('request', (request) => { const path = new URL(request.url()).pathname; if (/individual-/.test(path)) requests.push(path); });
  await open(page, '&focus=shoulder');
  await focused(page, 'shoulder:both');
  await expect.poll(async () => (await renderer(page)).visibleLayers).toEqual({ spine: 1, organs: 0, arms: 2, legs: 0, bodyMuscles: 10, joints: 0, nerves: 0, peripheralNerves: 0 });
  const state = await renderer(page);
  expect(state.focus).toBe('shoulder');
  // Clavicles and scapulae from the torso skeleton, plus part of each back and upper-arm mesh.
  expect(state.inspection.filteredMeshes).toBe(5);
  expect(state.inspection.active).toBe(false);
  expect(state.zoom.z).toBeGreaterThan(1.5);
  expect(requests.some((path) => path.endsWith('individual-body.bin'))).toBe(true);
  expect(requests.some((path) => path.includes('individual-head'))).toBe(false);
  await expect(page.locator('#focus [data-focus=shoulder]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#focus-note')).toContainText('旋轉肌袖');
  await expect(page.locator('#L_bodyMuscles')).toBeChecked();
  await expect(page.locator('#L_organs')).not.toBeChecked();
  await expect(page.locator('#labels')).toBeChecked();
  expect(await page.locator('#gl').evaluate((node) => node.style.transform)).toMatch(/^matrix\(-/);
  expect(errors).toEqual([]);
});

test('picking in a zoomed, one-sided focus reaches only the focused structures', async ({ page }) => {
  await open(page, '&focus=shoulder', { focusSide: 'L' });
  await focused(page, 'shoulder:L');
  await expect.poll(async () => (await renderer(page)).visibleLayers.bodyMuscles).toBe(5);
  expect((await renderer(page)).visibleLayers.arms).toBe(1);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  for (const name of ['left supraspinatus', 'left scapula', 'long head of left triceps brachii']) {
    const expected = exact(name), point = await probe(page, { id: expected.id });
    expect(point, `${name} is on screen`).not.toBeNull();
    await clickStage(page, point);
    await expect.poll(async () => (await renderer(page)).inspection.candidateIds).toContain(expected.id);
    const shown = (await renderer(page)).inspection;
    expect(shown.candidateIds.every((id) => kept.has(id)), `only focused structures under ${name}`).toBe(true);
    if (shown.selected.id === expected.id) expect(shown.highlightedIndices).toBe(expected.count);
    await page.keyboard.press('Escape');
  }
  // Same meshes, structures outside the region or on the other side: not drawn, so not pickable.
  for (const name of ['left multifidus', 'medial head of left triceps brachii', 'right scapula', 'right supraspinatus', 'left first rib']) {
    expect(await probe(page, { id: exact(name).id }), name).toBeNull();
  }
});

test('leaving focus restores whole meshes; presets and the zoom switch behave', async ({ page }) => {
  await open(page, '&focus=shoulder');
  await focused(page, 'shoulder:both');
  await page.locator('#focusZoom').uncheck();
  await expect.poll(async () => (await renderer(page)).zoom.z).toBe(1);
  expect(await page.locator('#gl').evaluate((node) => node.style.transform)).toBe('');
  await page.locator('#focus [data-focus=none]').click();
  await expect.poll(async () => (await renderer(page)).focus).toBeNull();
  await expect.poll(async () => (await renderer(page)).visibleLayers.bodyMuscles).toBe(24);
  expect((await renderer(page)).inspection).toMatchObject({ filter: null, filteredMeshes: 0 });
  await expect(page.locator('#focusSide button').first()).toBeDisabled();
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  expect(await probe(page, { id: exact('left multifidus').id })).not.toBeNull();
  await page.locator('#inspection-toggle').click();
  await page.locator('#focus [data-focus=knee]').click();
  await focused(page, 'knee:both');
  await page.locator('[data-preset=skeletal]').click();
  await expect.poll(async () => (await renderer(page)).focus).toBeNull();
  await expect(page.locator('#focus [data-focus=none]')).toHaveAttribute('aria-pressed', 'true');
});

test('mobile bar chooses a region and a side without overflowing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '&bodyMuscles');
  await expect(page.locator('#preset-cycle')).toBeVisible();
  await expect(page.locator('#focus-side-mobile')).toBeHidden();
  await page.locator('#focus-mobile').selectOption('knee');
  await focused(page, 'knee:both');
  await expect(page.locator('#focus-side-mobile')).toBeVisible();
  await expect(page.locator('#preset-cycle')).toBeHidden();
  await page.locator('#focus-side-mobile').selectOption('R');
  await focused(page, 'knee:R');
  await expect.poll(async () => (await renderer(page)).visibleLayers).toMatchObject({ legs: 2, bodyMuscles: 2 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const bar = await page.locator('.mobile-controls').boundingBox();
  for (const selector of ['#focus-mobile', '#focus-side-mobile', '#style-toggle', '#settings-toggle']) {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44); expect(box.y).toBeGreaterThanOrEqual(bar.y);
  }
  await page.locator('#focus-mobile').selectOption('none');
  await expect.poll(async () => (await renderer(page)).focus).toBeNull();
  await expect(page.locator('#preset-cycle')).toBeVisible();
});
