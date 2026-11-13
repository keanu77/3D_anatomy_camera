import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { rendered, storeSettings, watchErrors } from './helpers.js';

const body = JSON.parse(readFileSync(new URL('../../public/anatomy/individual-body.json', import.meta.url)));
const part = (name) => body.meshes.flatMap((mesh) => mesh.parts).find((item) => item.name === name);
const diagnostics = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());

// Every text and spoken label in the page, shown or not, that still contains Chinese.
// The author's name is not romanized, and the language button names Chinese in Chinese.
const chineseLeft = (page) => page.evaluate(() => {
  const found = [], chinese = /[一-鿿]/, clean = (text) => text.replaceAll('吳易澄', '');
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement;
    if (['SCRIPT', 'STYLE'].includes(owner?.tagName) || owner?.closest('#language-toggle')) continue;
    if (chinese.test(clean(node.nodeValue))) found.push(node.nodeValue.trim());
  }
  for (const element of document.querySelectorAll('[aria-label], [title], meta[name=description], meta[property="og:description"]')) {
    if (element.closest('#language-toggle')) continue;
    for (const name of ['aria-label', 'title', 'content']) if (chinese.test(clean(element.getAttribute(name) || ''))) found.push(`${name}=${element.getAttribute(name)}`);
  }
  return found;
});

test.describe('an English browser', () => {
  test.use({ locale: 'en-US' });

  test('gets the whole interface in English, through the demo, a region, a pause and a picked structure', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/Interactive 3D anatomy/);
    await expect(page.locator('#start')).toHaveText('Start camera');
    await expect(page.locator('#demo-start')).toHaveText('Watch the demo');
    await expect(page.locator('#language-toggle')).toHaveText('中文');
    await expect(page.locator('#language-toggle')).toHaveAttribute('lang', 'zh-Hant');
    expect(await chineseLeft(page)).toEqual([]);
    // Stage labels follow the interface until the viewer chooses otherwise.
    await expect(page.locator('#labelLanguage')).toHaveValue('en');

    await page.locator('#demo-start').click(); await rendered(page);
    await expect(page.locator('#status')).toHaveText('Demo mode. The camera is not in use.');
    await page.locator('#focus [data-focus=shoulder]').click();
    await expect(page.locator('#focus [data-focus=shoulder]')).toHaveText('Shoulder');
    await expect(page.locator('#focus-note')).toContainText('rotator cuff');
    await expect(page.locator('#focus-note')).toContainText('Keep your shoulders down to your hips in view, with your elbows visible. Choose the left or right side');
    await expect.poll(async () => (await diagnostics(page)).renderer.inspection.loaded).toContain('body');
    await expect.poll(async () => (await diagnostics(page)).renderer.labelLayout.length).toBeGreaterThan(0);
    const labels = (await diagnostics(page)).renderer.labelLayout.map((item) => item.text);
    expect(labels.filter((text) => /[一-鿿]/.test(text))).toEqual([]);

    await page.locator('#pause-toggle').click();
    await expect(page.locator('#pause-toggle')).toHaveText('Resume');
    await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-label', 'Resume the picture');
    await expect(page.locator('#status')).toContainText('Paused: drag to turn');

    await page.locator('#inspection-toggle').click();
    await expect(page.locator('#inspection-toggle')).toHaveText('Pick a structure');
    await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.inspection-status')).toHaveText('Tap a muscle or bone to see its name; tap an empty spot to clear.');
    const humerus = part('left humerus');
    const point = await page.evaluate((id) => window.__ANATOMY_APP__.inspectionProbe({ id }), humerus.id);
    expect(point).not.toBeNull();
    const rect = await page.locator('#stage').boundingBox(), { width, height } = (await diagnostics(page)).renderer;
    await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
    await expect.poll(async () => (await diagnostics(page)).renderer.inspection.candidateIds).toContain(humerus.id);
    await expect(page.locator('#inspection-card')).toBeVisible();
    await expect(page.locator('.inspection-source')).toContainText('Anatomy ID: ');
    // The card names the structure by the source's own English name.
    const titles = await page.locator('#inspection-candidates option').allTextContents();
    expect(titles.some((text) => text === 'left humerus · Left')).toBe(true);
    expect(await chineseLeft(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('is told in English when the camera is refused, and can change to Chinese for good', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied for test', 'NotAllowedError'); } });
    });
    await page.goto('/'); await page.locator('#start').click();
    await expect(page.locator('#intro-note')).toHaveText('Camera permission is off. Allow the camera in your browser, then press Start camera.');
    expect(await chineseLeft(page)).toEqual([]);

    await page.locator('#language-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
    await expect(page.locator('#start')).toHaveText('啟動鏡頭');
    await expect(page.locator('#language-toggle')).toHaveText('English');
    await expect(page.locator('#labelLanguage')).toHaveValue('zh');
    // The choice outlives the page and outranks the browser language.
    await page.reload();
    await expect(page.locator('#start')).toHaveText('啟動鏡頭');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('xr_settings')).language)).toBe('zh');
  });
});

test('a Chinese browser keeps the Chinese interface, and a link can ask for English', async ({ page }) => {
  await storeSettings(page, { labels: true });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('#start')).toHaveText('啟動鏡頭');
  await expect(page.locator('#language-toggle')).toHaveText('English');
  await expect(page.locator('#labelLanguage')).toHaveValue('zh');
  // The scan used above does see Chinese when it is there.
  expect((await chineseLeft(page)).length).toBeGreaterThan(50);

  await page.goto('/?lang=en&still#demo'); await rendered(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#camera-stop')).toHaveText('Stop camera');
  expect(await chineseLeft(page)).toEqual([]);
  // Choosing Chinese drops the link's request instead of being overruled by it.
  await page.locator('#language-toggle').click();
  await expect(page.locator('#start')).toHaveText('啟動鏡頭');
  expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
  expect(new URL(page.url()).searchParams.has('still')).toBe(true);
});
