import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { rendered, storeSettings, watchErrors } from './helpers.js';

const nerves = JSON.parse(readFileSync(new URL('../../public/anatomy/peripheral.json', import.meta.url)));
const part = (mesh, name) => {
  const found = nerves.meshes.find((entry) => entry.name === mesh)?.parts.find((entry) => entry.name === name);
  if (!found) throw new Error(`Expected nerve is missing from delivered assets: ${mesh} ${name}`);
  return found;
};
const off = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false, spine: false, organs: false, arms: false, legs: false,
  bodyMuscles: false, joints: false, nerves: false, peripheralNerves: false, showdata: false, labels: false, style: 'xray', reveal: 'whole', performance: 'balanced' };
const renderer = async (page) => (await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__())).renderer;
const probe = (page, query) => page.evaluate((value) => window.__ANATOMY_APP__.inspectionProbe(value), query);
const anatomyRequests = (page) => { const paths = []; page.on('request', (request) => { const path = new URL(request.url()).pathname; if (path.includes('/anatomy/')) paths.push(path.split('/').pop()); }); return paths; };
async function clickStage(page, point) {
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const rect = await page.locator('#stage').boundingBox(), { width, height } = await renderer(page);
  await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
}

test('peripheral nerves alone load only their own bundle and follow the limb segments', async ({ page }) => {
  const errors = watchErrors(page), requests = anatomyRequests(page);
  await storeSettings(page, { ...off, peripheralNerves: true, labels: true });
  await page.goto('/?still#demo'); await rendered(page);
  // Sixteen limb and trunk meshes and the two head meshes; hand nerves need the hand layer and a tracked hand.
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(18);
  const state = await renderer(page);
  expect(state).toMatchObject({ peripheralLoaded: true, peripheralError: null, peripheralMeshCount: 16 + 2 + 32 });
  expect(requests.filter((name) => name !== 'head.json' && name !== 'head.bin').sort()).toEqual(['peripheral.bin', 'peripheral.json']);
  expect(state.peripheralSegments).toHaveLength(8);
  for (const segment of state.peripheralSegments) {
    for (const [actual, expected] of [[segment.proximal, segment.expectedProximal], [segment.distal, segment.expectedDistal]]) {
      expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]), segment.name).toBeLessThanOrEqual(3);
    }
  }
  await page.locator('#L_peripheralNerves').uncheck();
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(0);
  await page.locator('[data-preset=nervous]').click();
  await expect(page.locator('#L_peripheralNerves')).toBeChecked();
  await expect.poll(async () => (await renderer(page)).visibleLayers).toMatchObject({ peripheralNerves: 18, nerves: 9 });
  expect(requests.filter((name) => name.startsWith('peripheral'))).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('a nerve is picked by name from its own ranges, without the detailed bone and muscle bundle', async ({ page }) => {
  const requests = anatomyRequests(page);
  await storeSettings(page, { ...off, peripheralNerves: true });
  await page.goto('/?still#demo'); await rendered(page);
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(18);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  for (const [mesh, name, title] of [['pn_thigh_L', 'left sciatic nerve', '坐骨神經'], ['pn_forearm_R', 'right ulnar nerve', '尺神經'], ['pn_shin_L', 'left tibial nerve', '脛神經']]) {
    const expected = part(mesh, name), point = await probe(page, { id: expected.id, instance: `body:${mesh}` });
    expect(point, `${name} is on screen`).not.toBeNull();
    await clickStage(page, point);
    await expect.poll(async () => (await renderer(page)).inspection.candidateIds).toContain(expected.id);
    const candidates = (await renderer(page)).inspection.candidateIds;
    // Crossing courses overlap in X-ray; the card's own selector switches between them.
    if (candidates[0] !== expected.id) await page.locator('#inspection-candidates').selectOption(String(candidates.indexOf(expected.id)));
    await expect.poll(async () => (await renderer(page)).inspection.selected?.id).toBe(expected.id);
    expect((await renderer(page)).inspection.highlightedIndices).toBe(expected.count);
    await expect(page.locator('.inspection-name')).toHaveText(title);
    await expect(page.locator('.inspection-classification')).toHaveText(`神經 · ${name.startsWith('left') ? '左側' : '右側'}`);
    await expect(page.locator('.inspection-english')).toHaveText(name);
    await expect(page.locator('.inspection-source')).toContainText(expected.id);
    await page.keyboard.press('Escape');
  }
  expect(requests.some((name) => name.startsWith('individual-'))).toBe(false);
});

test('a focused elbow adds its nerves only when the viewer asks, and only those at the elbow', async ({ page }) => {
  await storeSettings(page, off);
  await page.goto('/?still#demo&focus=elbow'); await rendered(page);
  await expect.poll(async () => (await renderer(page)).inspection.loaded).toContain('body');
  await expect.poll(async () => (await renderer(page)).visibleLayers).toMatchObject({ arms: 4, peripheralNerves: 0 });
  await expect(page.locator('#L_peripheralNerves')).not.toBeChecked();
  await expect(page.locator('#focus-note')).toContainText('周邊神經');
  await page.locator('#L_peripheralNerves').check();
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(4);
  await page.goto('/?still#demo&focus=forearm&peripheral'); await page.reload(); await rendered(page);
  await expect(page.locator('#L_peripheralNerves')).toBeChecked();
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(2);
  await page.goto('/?still#demo&focus=elbow&peripheral'); await page.reload(); await rendered(page);
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(4);
  await page.locator('#focus [data-focus=knee]').click();
  await expect(page.locator('#L_peripheralNerves')).toBeChecked();
  await expect.poll(async () => (await renderer(page)).visibleLayers).toMatchObject({ arms: 0, legs: 4, peripheralNerves: 4 });
  await page.locator('#focusSide [data-side=L]').click();
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(2);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  expect(await probe(page, { id: part('pn_shin_L', 'left common fibular nerve').id, instance: 'body:pn_shin_L' })).not.toBeNull();
  expect(await probe(page, { id: part('pn_shin_R', 'right common fibular nerve').id })).toBeNull();
  expect(await probe(page, { id: part('pn_forearm_L', 'left median nerve').id })).toBeNull();
});

test('cranial, intercostal and hand nerves follow the head, torso and both hands, and are picked by name', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await storeSettings(page, { ...off, skull: true, hands: true, arms: true, peripheralNerves: true });
  await page.goto('/#demo'); await rendered(page);
  await expect.poll(async () => (await renderer(page)).peripheralLoaded).toBe(true);
  await page.locator('#pause-toggle').click();
  // Sixteen limb and trunk meshes, two head meshes, and sixteen hand meshes on each of the two hands.
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(16 + 2 + 32);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  const pick = async (query, id) => {
    if (await page.locator('#inspection-card').isVisible()) await page.locator('.inspection-clear').click();
    const point = await probe(page, query);
    expect(point, `${JSON.stringify(query)} is on screen`).not.toBeNull();
    await clickStage(page, point);
    await expect.poll(async () => (await renderer(page)).inspection.candidateIds).toContain(id);
    const candidates = (await renderer(page)).inspection.candidateIds;
    if (candidates[0] !== id) await page.locator('#inspection-candidates').selectOption(String(candidates.indexOf(id)));
    await expect.poll(async () => (await renderer(page)).inspection.selected?.id).toBe(id);
    return (await renderer(page)).inspection.selected;
  };

  await pick({ id: part('pn_head_L', 'left mental nerve').id, instance: 'body:pn_head_L' }, 'Z-Anatomy:Mental nerve.l');
  await expect(page.locator('.inspection-name')).toHaveText('頦神經');
  await expect(page.locator('.inspection-classification')).toHaveText('神經 · 左側');
  await expect(page.locator('.inspection-info-source a')).toHaveText('Wikipedia: Mental nerve');

  await pick({ id: part('pn_trunk_R', 'right intercostal nerves').id, instance: 'body:pn_trunk_R' }, 'Z-Anatomy:Intercostal nerves.r');
  await expect(page.locator('.inspection-name')).toHaveText('肋間神經');
  await expect(page.locator('.inspection-info-list')).toContainText('Arises from');

  // The same right-hand course is drawn on both hands; on the left hand it carries the left identity.
  const digital = 'Z-Anatomy:Proper palmar digital branches of median nerve.';
  const sides = [];
  for (const hand of [0, 1]) {
    const point = await probe(page, { name: 'proper palmar digital branches of median nerve', instance: `hand:${hand}:` });
    expect(point, `hand ${hand} shows the digital nerves`).not.toBeNull();
    const side = point.id.endsWith('.l') ? 'L' : 'R';
    const selected = await pick({ id: point.id, instance: point.instance }, `${digital}${side === 'L' ? 'l' : 'r'}`);
    expect(selected.side).toBe(side); expect(!!selected.mirrored).toBe(side === 'L');
    await expect(page.locator('.inspection-name')).toHaveText('正中神經指掌側固有神經');
    await expect(page.locator('.inspection-classification')).toHaveText(`神經 · ${side === 'L' ? '左側' : '右側'}`);
    if (side === 'L') await expect(page.locator('.inspection-detail')).toContainText('鏡像');
    sides.push(side);
  }
  expect(sides.sort()).toEqual(['L', 'R']);

  // Without the hand layer the hand nerves go with the hand bones.
  await page.locator('#inspection-toggle').click();
  await page.locator('#L_hands').uncheck();
  await expect.poll(async () => (await renderer(page)).visibleLayers.peripheralNerves).toBe(16 + 2);
  expect(errors).toEqual([]);
});
