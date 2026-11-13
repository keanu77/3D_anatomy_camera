import { test, expect } from '@playwright/test';
import { rendered, watchErrors } from './helpers.js';

const diagnostics = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
const box = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
});
// The smallest computed size among elements that draw text of their own.
const smallestText = (page) => page.evaluate(() => {
  let smallest = { size: Infinity, where: '' };
  for (const el of document.body.querySelectorAll('*')) {
    if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
    const text = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.nodeValue.trim()).join('');
    if (!text) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < smallest.size) smallest = { size, where: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${text.slice(0, 24)}"` };
  }
  return smallest;
});
async function expectReadable(page, where) {
  const smallest = await smallestText(page);
  expect(smallest.size, `${where}: ${smallest.where}`).toBeGreaterThanOrEqual(13);
}

test('start screen fills the stage column, shows the model and names what the site is', async ({ page }) => {
  const errors = watchErrors(page);
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 640 }]) {
    const at = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport); await page.goto('/');
    await page.locator('#intro').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    const intro = await box(page, '#intro'), column = await box(page, '.stagecol');
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(intro[key] - column[key]), `${at} ${key}`).toBeLessThanOrEqual(1);
    // Three pictures of the model share the frame; one is on show.
    await expect(page.locator('.intro-picture.current')).toHaveCount(1);
    await expect(page.locator('.intro-picture.current')).toBeVisible();
    // The head and hands are a wide picture; the standing figures are upright ones.
    await expect.poll(() => page.locator('.intro-picture').evaluateAll((imgs) => imgs.map((img) => (img.complete ? `${img.naturalWidth}x${img.naturalHeight}` : '')))).toEqual(['900x600', '600x900', '600x900']);
    const words = await box(page, '#intro h2'), art = await box(page, '.intro-picture.current');
    expect(art.height, `${at} picture height`).toBeGreaterThanOrEqual(viewport.height < 500 ? 120 : 160);
    // Words, picture and both actions stay inside the start screen; the words never lie on the picture.
    expect(words.bottom <= art.y + 1 || art.bottom <= words.y + 1 || words.right <= art.x + 1 || art.right <= words.x + 1, `${at} words clear of picture`).toBe(true);
    for (const selector of ['#intro h2', '#start', '#demo-start', '#intro-note', '.intro-picture.current', '.intro-picture-choice']) {
      const item = await box(page, selector);
      expect(item.y, `${at} ${selector} top`).toBeGreaterThanOrEqual(intro.y - 1);
      expect(item.bottom, `${at} ${selector} bottom`).toBeLessThanOrEqual(intro.bottom + 1);
      expect(item.x, `${at} ${selector} left`).toBeGreaterThanOrEqual(0);
      expect(item.right, `${at} ${selector} right`).toBeLessThanOrEqual(viewport.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), at).toBe(viewport.width);
  }
  // The product name stands once, in the header; the start screen says what the thing is.
  await expect(page.locator('h1')).toHaveText('3D anatomy camera');
  await expect(page.locator('#intro h2')).not.toHaveText('3D anatomy camera');
  await expect(page.locator('#intro h2')).toContainText('解剖');
  expect(errors).toEqual([]);
});

test('each picture of the model is filled by the model, and a standing figure is shown tall', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/');
  await page.locator('#intro').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  // How much of each picture the model spans: the box of every pixel that is not the picture's ground.
  const spans = await page.locator('.intro-picture').evaluateAll(async (imgs) => Promise.all(imgs.map(async (img) => {
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height), ground = [data[0], data[1], data[2]];
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(data[i] - ground[0]) + Math.abs(data[i + 1] - ground[1]) + Math.abs(data[i + 2] - ground[2]) < 60) continue;
      if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
    }
    return { wide: (right - left + 1) / width, tall: (bottom - top + 1) / height };
  })));
  for (const [index, name] of ['bones', 'muscles', 'nerves'].entries()) {
    expect(spans[index].tall, `${name}: height of the picture used`).toBeGreaterThan(0.8);
    expect(spans[index].wide, `${name}: width of the picture used`).toBeGreaterThan(0.55);
  }
  // On a desktop the standing figure is shown at more than half the height of the start screen.
  const intro = await box(page, '#intro');
  for (const index of [1, 2]) {
    await page.locator('.intro-picture-choice button').nth(index).click();
    await expect(page.locator('.intro-picture').nth(index)).toHaveClass(/current/);
    const art = await box(page, '.intro-picture.current');
    expect(art.height * spans[index].tall, `picture ${index}: figure height on screen`).toBeGreaterThan(intro.height * 0.5);
  }
  // The wide picture still sits level with the words, not at the top of the taller frame.
  await page.locator('.intro-picture-choice button').nth(0).click();
  await expect(page.locator('.intro-picture').nth(0)).toHaveClass(/current/);
  const [wide, words] = [await box(page, '.intro-picture.current'), await box(page, '.intro-content')];
  expect(Math.abs((wide.y + wide.bottom) / 2 - (words.y + words.bottom) / 2), 'wide picture centred on the words').toBeLessThan(60);
});

test('the header keeps the whole name on a 320px screen', async ({ page }) => {
  for (const language of ['zh', 'en']) {
    await page.setViewportSize({ width: 320, height: 640 }); await page.goto(`/?lang=${language}`);
    const header = await box(page, '.workspace-brand'), name = await box(page, 'h1'), toggle = await box(page, '#language-toggle');
    expect(name.y, language).toBeGreaterThanOrEqual(header.y);
    expect(name.bottom, language).toBeLessThanOrEqual(header.bottom);
    expect(name.right, language).toBeLessThanOrEqual(toggle.x);
    expect(await page.locator('h1').evaluate((el) => el.scrollWidth <= el.clientWidth), language).toBe(true);
    expect(toggle.right, language).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), language).toBe(320);
  }
});

test('no interface text is drawn below 13px', async ({ page }) => {
  await page.goto('/');
  await expectReadable(page, 'start screen');
  await page.goto('/?still#demo&focus=shoulder'); await rendered(page);
  await page.locator('#inspection-toggle').click();
  await expectReadable(page, 'desktop demo with picking help');
  await page.setViewportSize({ width: 390, height: 844 });
  await expectReadable(page, 'phone demo');
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#settings-close')).toBeFocused();
  await expectReadable(page, 'phone settings');
});

test('a portrait phone stands the head demo upright and uses most of the height', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?still#demo'); await rendered(page);
  await expect.poll(async () => { const { width, height } = (await diagnostics(page)).renderer; return Math.abs(width / height - 3 / 4); }).toBeLessThan(0.02);
  const stage = await box(page, '#stage'), column = await box(page, '.stagecol');
  expect(stage.height / column.height).toBeGreaterThan(.7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // Turned on its side the same demo goes back to the reviewed 4:3 picture.
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => { const { width, height } = (await diagnostics(page)).renderer; return Math.abs(width / height - 4 / 3); }).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

test('every control has one shape, one focus ring and answers a press', async ({ page }) => {
  await page.goto('/?still#demo&focus=shoulder'); await rendered(page);
  const controls = ['#start', '#demo-start', '.intro-picture-choice button', '#language-toggle', '#focus button', '#focusSide button', '.system-presets button', '#style button',
    '#camera-stop', '#fitreset', '#reveal', '#pause-toggle', '#inspection-toggle'];
  const style = (selector, property) => page.locator(selector).first().evaluate((el, name) => getComputedStyle(el)[name], property);
  const radii = {}; for (const selector of controls) radii[selector] = await style(selector, 'borderTopLeftRadius');
  expect(new Set(Object.values(radii)).size, JSON.stringify(radii)).toBe(1);
  for (const selector of ['#language-toggle', '#focus button', '#pause-toggle', '#inspection-toggle']) {
    expect(await style(selector, 'transitionDuration'), selector).not.toMatch(/^0s$/);
    expect(await style(selector, 'transitionProperty'), selector).toContain('transform');
  }
  // Keyboard focus draws the same ring on a drawer control and on a control over the picture.
  await page.keyboard.press('Tab');
  const rings = [];
  for (const selector of ['#language-toggle', '#focus button', '#inspection-toggle', '#pause-toggle']) {
    await page.locator(selector).first().focus();
    rings.push(await page.locator(selector).first().evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`; }));
  }
  expect(rings[0]).toMatch(/^solid 2px /);
  expect(new Set(rings).size, rings.join(' | ')).toBe(1);
});

test('reduced motion leaves the start screen standing and controls without travel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  for (const selector of ['#intro h2', '.intro-description', '#start', '.intro-picture.current']) {
    expect(await page.locator(selector).evaluate((el) => { const s = getComputedStyle(el); return `${s.opacity} ${s.transform} ${s.animationName}`; }), selector).toBe('1 none none');
  }
  expect(await page.locator('#start').evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s$/);
  // Nothing turns by itself; the viewer can still choose a picture, and it changes without a fade.
  await page.clock.fastForward(60000);
  await expect(page.locator('.intro-picture.current')).toHaveAttribute('alt', /頭骨/);
  await page.locator('.intro-picture-choice button').nth(2).click();
  await expect(page.locator('.intro-picture.current')).toHaveAttribute('alt', /神經/);
  expect(await page.locator('.intro-picture.current').evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s$/);
});

test('the start screen turns its three pictures over and stops when the viewer chooses one', async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.install();
  await page.goto('/');
  const current = page.locator('.intro-picture.current'), choice = page.locator('.intro-picture-choice button');
  const pressed = () => choice.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-pressed')));
  await expect(choice).toHaveText(['骨骼', '肌肉', '神經']);
  await expect(current).toHaveAttribute('alt', /頭骨/);
  expect(await pressed()).toEqual(['true', 'false', 'false']);
  await expect.poll(() => page.locator('.intro-picture').evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  // Bones, muscles, nerves, and round to bones again.
  for (const [alt, state] of [[/肌肉/, ['false', 'true', 'false']], [/神經/, ['false', 'false', 'true']], [/頭骨/, ['true', 'false', 'false']]]) {
    await page.clock.fastForward(5000);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('alt', alt);
    expect(await pressed()).toEqual(state);
    // Only the picture on show is read out.
    expect(await page.locator('.intro-picture').evaluateAll((imgs) => imgs.filter((img) => img.getAttribute('aria-hidden') !== 'true').length)).toBe(1);
  }
  // The picture on show fades in over the one before it.
  expect(await current.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('opacity');
  await choice.nth(1).click();
  await expect(current).toHaveAttribute('alt', /肌肉/);
  expect(await pressed()).toEqual(['false', 'true', 'false']);
  await page.clock.fastForward(60000);
  await expect(current).toHaveAttribute('alt', /肌肉/);
  // A session and back: the chosen picture is still the one on show.
  await page.locator('#demo-start').click();
  await expect(page.locator('#intro')).toBeHidden();
  await page.evaluate(() => window.__ANATOMY_APP__.stop());
  await expect(page.locator('#intro')).toBeVisible();
  await page.clock.fastForward(60000);
  await expect(current).toHaveAttribute('alt', /肌肉/);
  expect(errors).toEqual([]);
});

test('the side choice and the enlarge option appear only with a region in focus', async ({ page }) => {
  await page.goto('/?still#demo'); await rendered(page);
  await expect(page.locator('#focusSide')).toBeHidden();
  await expect(page.locator('#focus-zoom-row')).toBeHidden();
  await page.locator('#focus [data-focus=shoulder]').click();
  await expect(page.locator('#focusSide')).toBeVisible();
  await expect(page.locator('#focus-zoom-row')).toBeVisible();
  await page.locator('#focus [data-focus=none]').click();
  await expect(page.locator('#focusSide')).toBeHidden();
});
