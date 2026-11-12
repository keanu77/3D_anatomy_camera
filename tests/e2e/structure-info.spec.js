import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { rendered, storeSettings, watchErrors } from './helpers.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../../public/anatomy/${file}.json`, import.meta.url)));
const table = read('structure-info');
const allParts = ['individual-body', 'peripheral'].flatMap((file) => read(file).meshes.flatMap((mesh) => mesh.parts));
const part = (name) => {
  const found = allParts.find((entry) => entry.name === name);
  if (!found) throw new Error(`Expected structure is missing from delivered assets: ${name}`);
  return found;
};
const off = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false, spine: false, organs: false, arms: false, legs: false,
  bodyMuscles: false, joints: false, nerves: false, peripheralNerves: false, showdata: false, labels: false, style: 'xray', reveal: 'whole', performance: 'balanced' };
const renderer = async (page) => (await page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__())).renderer;
const infoRequests = (page) => { const seen = []; page.on('request', (request) => { if (request.url().endsWith('/anatomy/structure-info.json')) seen.push(request.url()); }); return seen; };

async function open(page, settings, loaded) {
  await storeSettings(page, { ...off, ...settings });
  await page.goto('/?still#demo'); await rendered(page);
  await expect.poll(async () => (await renderer(page))[loaded]).toBeTruthy();
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
}

async function pick(page, name) {
  if (await page.locator('#inspection-card').isVisible()) await page.locator('.inspection-clear').click();
  const expected = part(name);
  const point = await page.evaluate((id) => window.__ANATOMY_APP__.inspectionProbe({ id }), expected.id);
  expect(point, `${name} is on screen`).not.toBeNull();
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const rect = await page.locator('#stage').boundingBox(), { width, height } = await renderer(page);
  await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
  await expect.poll(async () => (await renderer(page)).inspection.candidateIds).toContain(expected.id);
  const candidates = (await renderer(page)).inspection.candidateIds;
  if (candidates[0] !== expected.id) await page.locator('#inspection-candidates').selectOption(String(candidates.indexOf(expected.id)));
  await expect.poll(async () => (await renderer(page)).inspection.selected?.id).toBe(expected.id);
}

const fields = (page) => page.locator('.inspection-info-list').evaluate((list) => Object.fromEntries(
  [...list.querySelectorAll('dt')].map((term) => [term.textContent, term.nextElementSibling.textContent])));

test('a picked muscle head shows the origin, insertion, action and supply of its muscle, with the source', async ({ page }, testInfo) => {
  const errors = watchErrors(page), requests = infoRequests(page), article = table.articles.Triceps;
  await open(page, { bodyMuscles: true, arms: true }, 'musclesLoaded');
  expect(requests, 'reference text is not downloaded before a structure is picked').toEqual([]);
  await pick(page, 'lateral head of left triceps brachii');
  await expect(page.locator('.inspection-info-list')).toBeVisible();
  expect(await fields(page)).toEqual({ Origin: article.origin, Insertion: article.insertion, Action: article.action,
    'Nerve supply': article.nerve, 'Blood supply': article.blood });
  await expect(page.locator('.inspection-info-list')).toHaveAttribute('lang', 'en');
  const link = page.locator('.inspection-info-source a');
  await expect(link).toHaveText('Wikipedia: Triceps');
  await expect(link).toHaveAttribute('href', `https://en.wikipedia.org/w/index.php?title=Triceps&oldid=${article.rev}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.inspection-info-source')).toContainText('CC BY-SA 4.0');
  await testInfo.attach('muscle-reference-text', { body: await page.screenshot(), contentType: 'image/png' });
  await pick(page, 'left brachioradialis');
  expect((await fields(page)).Origin).toBe(table.articles[table.muscle.brachioradialis].origin);
  expect(requests, 'one download serves every later selection').toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a picked nerve shows where it arises and what it supplies; a failed download says so and recovers', async ({ page }) => {
  const errors = watchErrors(page);
  let fail = true;
  await page.route('**/anatomy/structure-info.json', (route) => (fail ? route.abort() : route.continue()));
  await open(page, { peripheralNerves: true }, 'peripheralLoaded');
  await pick(page, 'left sciatic nerve');
  await expect(page.locator('.inspection-info-note')).toHaveText('構造說明載入失敗，請再點選一次重試。');
  await expect(page.locator('.inspection-name')).toHaveText('坐骨神經');
  fail = false;
  await pick(page, 'left sciatic nerve');
  const article = table.articles[table.nerve['sciatic nerve']];
  await expect(page.locator('.inspection-info-list')).toBeVisible();
  expect(await fields(page)).toEqual({ 'Arises from': article.from, Branches: article.branches, Supplies: article.supplies });
  expect(errors).toEqual([]);
});

test('a bone shows the opening of its article and its articulations, and a long card stays inside a phone screen', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { arms: true, legs: true }, 'bodyLoaded');
  await pick(page, 'left femur');
  const femur = table.articles[table.bone.femur];
  await expect(page.locator('.inspection-info-list')).toBeVisible();
  expect(await fields(page)).toEqual({ Description: femur.description, Articulations: femur.articulations });
  await expect(page.locator('.inspection-info-source a')).toHaveText('Wikipedia: Femur');
  await pick(page, 'left humerus');
  expect(await fields(page)).toEqual({ Description: table.articles[table.bone.humerus].description });
  await page.locator('#inspection-toggle').click();
  await storeSettings(page, { ...off, bodyMuscles: true, arms: true });
  await page.reload(); await rendered(page);
  await expect.poll(async () => (await renderer(page)).musclesLoaded).toBeTruthy();
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  await pick(page, 'acromial part of left deltoid');
  await expect(page.locator('.inspection-info-list')).toBeVisible();
  const card = await page.locator('#inspection-card').boundingBox(), controls = await page.locator('.mobile-controls').boundingBox();
  expect(card.x).toBeGreaterThanOrEqual(0); expect(card.x + card.width).toBeLessThanOrEqual(390);
  expect(card.y).toBeGreaterThanOrEqual(0); expect(card.y + card.height).toBeLessThanOrEqual(controls.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('.inspection-info-source a').scrollIntoViewIfNeeded();
  await expect(page.locator('.inspection-info-source a')).toBeInViewport();
  await testInfo.attach('reference-text-phone', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
