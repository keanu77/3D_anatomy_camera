import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { LIVE_START, rendered, storeSettings, watchErrors } from './helpers.js';

const body = JSON.parse(readFileSync(new URL('../../public/anatomy/individual-body.json', import.meta.url)));
const part = (name) => body.meshes.flatMap((mesh) => mesh.parts).find((item) => item.name === name);
const off = { skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false, spine: false, organs: false, arms: false, legs: false,
  bodyMuscles: false, joints: false, nerves: false, peripheralNerves: false, showdata: false, labels: false, style: 'xray', reveal: 'whole', performance: 'balanced' };
const diagnostics = (page) => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__());
const frames = async (page) => (await diagnostics(page)).renderer.frameCount;
async function settled(page) {
  // No new frame for half a second.
  await expect.poll(async () => { const before = await frames(page); await page.waitForTimeout(500); return (await frames(page)) - before; }).toBe(0);
}

test('pausing the animated demo freezes the picture, still allows picking and region changes, and resumes', async ({ page }) => {
  const errors = watchErrors(page);
  await storeSettings(page, { ...off, bodyMuscles: true, arms: true });
  await page.goto('/#demo'); await rendered(page);
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  const pause = page.locator('#pause-toggle');
  await expect(pause).toHaveText('暫停');
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  const moving = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(moving + 3);

  await pause.click();
  await expect(pause).toHaveText('繼續');
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stage')).toHaveClass(/\bpaused\b/);
  await expect(page.locator('#status')).toContainText('畫面已暫停');
  expect((await diagnostics(page)).state.paused).toBe(true);
  await settled(page);

  // Picking works on the frozen frame.
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  const expected = part('left humerus');
  const point = await page.evaluate((id) => window.__ANATOMY_APP__.inspectionProbe({ id }), expected.id);
  expect(point).not.toBeNull();
  const rect = await page.locator('#stage').boundingBox(), { width, height } = (await diagnostics(page)).renderer;
  await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
  await expect.poll(async () => (await diagnostics(page)).renderer.inspection.candidateIds).toContain(expected.id);
  await page.keyboard.press('Escape');
  await settled(page);

  // A setting changed while paused redraws the same frozen frame; it does not restart the animation.
  await page.locator('#focus [data-focus=elbow]').click();
  await expect.poll(async () => (await diagnostics(page)).renderer.focus).toBe('elbow');
  await expect.poll(async () => (await diagnostics(page)).renderer.visibleLayers.bodyMuscles).toBe(6);
  expect((await diagnostics(page)).renderer.frozen).toBe(true);
  await settled(page);

  await pause.click();
  await expect(pause).toHaveText('暫停');
  const resumed = await frames(page);
  await expect.poll(() => frames(page)).toBeGreaterThan(resumed + 3);
  expect((await diagnostics(page)).renderer.frozen).toBe(false);
  expect(errors).toEqual([]);
});

test('pausing the camera stops the video and tracking; stop and resume both clear the pause', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await storeSettings(page, { ...off, skull: true, outline: true });
  await page.goto('/'); await page.locator('#start').click(); await rendered(page, LIVE_START);
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.face || 0, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  const pause = page.locator('#pause-toggle'), paused = () => page.locator('#video').evaluate((video) => video.paused);
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await paused()).toBe(true);
  // One more inference may run on the frozen frame; after that nothing moves.
  await expect.poll(async () => { const before = (await diagnostics(page)).trackers.calls.face; await page.waitForTimeout(700); return (await diagnostics(page)).trackers.calls.face - before; }).toBe(0);
  await settled(page);
  const time = await page.locator('#video').evaluate((video) => video.currentTime);
  await page.waitForTimeout(400);
  expect(await page.locator('#video').evaluate((video) => video.currentTime)).toBe(time);

  // Changing a layer while paused keeps the camera frame frozen.
  await page.locator('#L_brain').check();
  await expect(page.locator('#L_brain')).toBeChecked();
  expect(await paused()).toBe(true);
  expect((await diagnostics(page)).state.paused).toBe(true);

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(paused).toBe(false);
  const calls = (await diagnostics(page)).trackers.calls.face;
  await expect.poll(async () => (await diagnostics(page)).trackers.calls.face, { timeout: 30000 }).toBeGreaterThan(calls);

  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#camera-stop').click();
  expect((await diagnostics(page)).state.paused).toBe(false);
  expect((await diagnostics(page)).camera.liveTracks).toBe(0);
  await expect(page.locator('#intro')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a paused view can be dragged round, picked from the side, and levelled again', async ({ page }) => {
  const errors = watchErrors(page);
  await storeSettings(page, { ...off, bodyMuscles: true, arms: true, legs: true, labels: true });
  await page.goto('/#demo'); await rendered(page);
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  const stage = page.locator('#stage'), rect = await stage.boundingBox();
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const drag = async (dx, dy) => { await page.mouse.move(centre.x, centre.y); await page.mouse.down(); await page.mouse.move(centre.x + dx, centre.y + dy, { steps: 6 }); await page.mouse.up(); };
  const orbit = async () => (await diagnostics(page)).renderer.orbit;

  // Not paused: dragging does nothing.
  await drag(150, 0);
  expect(await orbit()).toEqual({ yaw: 0, pitch: 0 });

  await page.locator('#pause-toggle').click();
  await expect(page.locator('#status')).toContainText('拖曳可旋轉');
  await settled(page);
  // A WebGL canvas cannot be read back after it is presented; compare what is on screen instead.
  const picture = async () => PNG.sync.read(await stage.screenshot());
  const changed = (a, b) => pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) / (a.width * a.height);
  // Redraw the frozen frame a few times first, so the head's own smoothing has settled.
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__ANATOMY_APP__.changed());
  await settled(page);
  const before = await picture();
  await drag(rect.width * 0.25, 0);
  // The demo picture is mirrored, so a drag to the right is a negative yaw: 0.25 width x 216 degrees = 54 degrees.
  await expect.poll(async () => (await orbit()).yaw).toBeCloseTo(-0.3 * Math.PI, 2);
  expect((await orbit()).pitch).toBeCloseTo(0, 6);
  expect(changed(await picture(), before), 'the turned view looks different').toBeGreaterThan(0.01);
  // A rotated frozen model no longer covers the person's silhouette: dim the whole video plane.
  expect(await page.locator('#shade').evaluate(canvas => canvas.getContext('2d').getImageData(1, 1, 1, 1).data[3])).toBeGreaterThan(200);
  await drag(0, rect.height);
  await expect.poll(async () => (await orbit()).pitch).toBeCloseTo(75 * Math.PI / 180, 3);

  // Picking still works from the turned view and reaches a structure that is drawn there.
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');
  const expected = part('left femur');
  const point = await page.evaluate((id) => window.__ANATOMY_APP__.inspectionProbe({ id }), expected.id);
  expect(point).not.toBeNull();
  const { width, height } = (await diagnostics(page)).renderer;
  await page.mouse.click(rect.x + point.x * rect.width / width, rect.y + point.y * rect.height / height);
  await expect.poll(async () => (await diagnostics(page)).renderer.inspection.candidateIds).toContain(expected.id);
  // A tap does not turn the view.
  expect((await orbit()).pitch).toBeCloseTo(75 * Math.PI / 180, 3);
  await page.keyboard.press('Escape');
  await page.locator('#inspection-toggle').click();   // picking off again, so its hint is not in the picture

  await page.mouse.dblclick(rect.x + 20, rect.y + rect.height - 20);
  await expect.poll(orbit).toEqual({ yaw: 0, pitch: 0 });
  // Levelled, the frozen picture is exactly what it was before turning.
  await expect.poll(async () => changed(await picture(), before)).toBeLessThan(0.001);
  await drag(-80, 30);
  expect((await orbit()).yaw).not.toBe(0);
  await page.locator('#pause-toggle').click();
  await expect.poll(orbit).toEqual({ yaw: 0, pitch: 0 });
  expect(errors).toEqual([]);
});

test('a paused view is enlarged with the wheel or two fingers, stays pickable, and is restored by double-click or resume', async ({ page }) => {
  const errors = watchErrors(page);
  await storeSettings(page, { ...off, bodyMuscles: true, arms: true, legs: true });
  await page.goto('/#demo'); await rendered(page);
  await expect.poll(async () => (await diagnostics(page)).renderer.musclesLoaded).toBe(true);
  const stage = page.locator('#stage'), rect = await stage.boundingBox();
  const { width, height } = (await diagnostics(page)).renderer;
  const zoom = async () => (await diagnostics(page)).renderer.zoom;
  const whole = { z: 1, bx: 0, by: 0 };
  // Display position of a stage point, in page pixels, and back.
  const toPage = (x, y) => [rect.x + x * rect.width / width, rect.y + y * rect.height / height];
  const finger = (type, id, x, y) => stage.evaluate((node, a) => node.dispatchEvent(new PointerEvent(a.type, { pointerId: a.id, clientX: a.x, clientY: a.y,
    button: 0, buttons: 1, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: a.id === 1 })), { type, id, x, y });

  // Not paused: the wheel leaves the picture alone.
  await page.mouse.move(...toPage(width / 2, height / 2));
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(200);
  expect(await zoom()).toEqual(whole);

  await page.locator('#pause-toggle').click();
  await expect(page.locator('#status')).toContainText('雙指或滾輪可縮放');
  await settled(page);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');

  // Wheel: enlarges about the cursor, here placed on the left humerus.
  const humerus = part('left humerus');
  const probe = () => page.evaluate((id) => window.__ANATOMY_APP__.inspectionProbe({ id }), humerus.id);
  const before = await probe();
  expect(before).not.toBeNull();
  await page.mouse.move(...toPage(before.x, before.y));
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await zoom()).z).toBeCloseTo(Math.exp(0.8), 2);
  const wheeled = await zoom();
  // The mouse lands on a whole page pixel, so the fixed point is within a stage pixel or two of the probe.
  expect(Math.abs(wheeled.z * before.x + wheeled.bx - before.x)).toBeLessThan(2);
  expect(Math.abs(wheeled.z * before.y + wheeled.by - before.y)).toBeLessThan(2);
  await expect(page.locator('#gl')).toHaveAttribute('style', /matrix\(/);
  expect((await diagnostics(page)).renderer.orbit).toEqual({ yaw: 0, pitch: 0 });
  // The enlarged picture is still picked where it is drawn.
  const enlarged = await probe();
  expect(enlarged).not.toBeNull();
  await page.mouse.click(...toPage(enlarged.x, enlarged.y));
  await expect.poll(async () => (await diagnostics(page)).renderer.inspection.candidateIds).toContain(humerus.id);
  await page.keyboard.press('Escape');
  await page.locator('#inspection-toggle').click();
  // Double-click restores the whole picture.
  await page.mouse.dblclick(rect.x + 20, rect.y + rect.height - 20);
  await expect.poll(zoom).toEqual(whole);
  await page.locator('#inspection-toggle').click();
  await expect(page.locator('#inspection-help')).toHaveAttribute('aria-busy', 'false');

  // Two fingers 100 px apart spread to 200 px: twice the size, about the point between them.
  const [cx, cy] = toPage(width / 2, height / 2);
  await finger('pointerdown', 1, cx - 50, cy); await finger('pointerdown', 2, cx + 50, cy);
  await finger('pointermove', 1, cx - 100, cy); await finger('pointermove', 2, cx + 100, cy);
  await expect.poll(async () => (await zoom()).z).toBeCloseTo(2, 3);
  const pinched = await zoom();
  expect(pinched.bx).toBeCloseTo(-width / 2, 0); expect(pinched.by).toBeCloseTo(-height / 2, 0);
  // Both fingers moving together carry the picture.
  await finger('pointermove', 1, cx - 70, cy + 20); await finger('pointermove', 2, cx + 130, cy + 20);
  await expect.poll(async () => (await zoom()).bx).toBeCloseTo(pinched.bx + 30 * width / rect.width, 0);
  expect((await zoom()).by).toBeCloseTo(pinched.by + 20 * height / rect.height, 0);
  // Lifting one finger ends the pinch: the other neither turns the view nor picks a structure.
  await finger('pointerup', 2, cx + 130, cy + 20);
  await finger('pointermove', 1, cx + 60, cy + 90); await finger('pointerup', 1, cx + 60, cy + 90);
  await page.waitForTimeout(200);
  expect((await diagnostics(page)).renderer.orbit).toEqual({ yaw: 0, pitch: 0 });
  expect((await diagnostics(page)).renderer.inspection.candidateIds).toEqual([]);
  expect((await zoom()).z).toBeCloseTo(2, 3);
  // A pinch that never moved does not pick either.
  await finger('pointerdown', 1, cx - 50, cy); await finger('pointerdown', 2, cx + 50, cy);
  await finger('pointerup', 2, cx + 50, cy); await finger('pointerup', 1, cx - 50, cy);
  await page.waitForTimeout(200);
  expect((await diagnostics(page)).renderer.inspection.candidateIds).toEqual([]);
  // Pinching in past full size gives back the whole picture.
  await finger('pointerdown', 1, cx - 100, cy); await finger('pointerdown', 2, cx + 100, cy);
  await finger('pointermove', 1, cx - 10, cy); await finger('pointermove', 2, cx + 10, cy);
  await expect.poll(zoom).toEqual(whole);
  await finger('pointerup', 1, cx - 10, cy); await finger('pointerup', 2, cx + 10, cy);

  // Resuming restores the whole picture too.
  await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await zoom()).z).toBeGreaterThan(1.5);
  await page.locator('#pause-toggle').click();
  await expect.poll(zoom).toEqual(whole);
  expect(errors).toEqual([]);
});

test('every pause tracks the frozen frame with each tracker in use, whatever the throttle', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  // Lite mode runs the hand tracker at most every 125 ms: a frozen frame that waits its turn keeps a stale hand.
  await storeSettings(page, { ...off, skull: true, hands: true, performance: 'lite' });
  await page.goto('/'); await page.locator('#start').click(); await rendered(page, LIVE_START);
  const calls = async () => (await diagnostics(page)).trackers.calls;
  await expect.poll(async () => (await calls()).hands || 0, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
  const pause = page.locator('#pause-toggle');
  for (let round = 0; round < 6; round++) {
    // Press pause at an instant when no frame is in flight, so the only inference that follows is the frozen frame's.
    // The gap is the moment between one result arriving and the next animation frame offering another.
    const before = await page.evaluate(() => new Promise((resolve) => (function wait() {
      const tracking = window.__ANATOMY_DIAGNOSTICS__().trackers;
      if (tracking.inFlight) { setTimeout(wait, 0); return; }
      document.getElementById('pause-toggle').click(); resolve({ ...tracking.calls });
    })()));
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    // Software-rendered inference can take longer than the half second that counts as settled: wait for the result itself.
    await expect.poll(async () => (await calls()).hands - before.hands, { timeout: 30000, message: `round ${round}: hands inferred from the frozen frame` }).toBe(1);
    await expect.poll(async () => { const earlier = await calls(); await page.waitForTimeout(700); const later = await calls(); return later.face - earlier.face + later.hands - earlier.hands; }).toBe(0);
    await settled(page);
    const after = await calls();
    expect(after.face - before.face, `round ${round}: face inferred once from the frozen frame`).toBe(1);
    expect(after.hands - before.hands, `round ${round}: hands inferred once from the frozen frame`).toBe(1);
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await calls()).face, { timeout: 30000 }).toBeGreaterThan(after.face);
  }
  await page.locator('#camera-stop').click();
  expect(errors).toEqual([]);
});

test('redrawing a paused picture reaches no verdict about performance', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  // Software-rendered Pose is far below the 18 results a second the automatic mode asks for.
  await storeSettings(page, { ...off, spine: true, arms: true, legs: true, performance: 'auto' });
  await page.goto('/'); await page.locator('#start').click();
  // Pause on the first tracked frame, before two seconds of slow results can step the mode down.
  await page.evaluate(() => new Promise((resolve) => (function wait() {
    if (!window.__ANATOMY_DIAGNOSTICS__().renderer?.frameCount) { setTimeout(wait, 20); return; }
    document.getElementById('pause-toggle').click(); resolve();
  })()));
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect((await diagnostics(page)).state.performance).toBe('high');
  // Turning the frozen view redraws it for five seconds: two verdict intervals and more.
  const rect = await page.locator('#stage').boundingBox(), drawn = await frames(page);
  await page.mouse.move(rect.x + 200, rect.y + 200); await page.mouse.down();
  for (let step = 0; step < 50; step++) { await page.mouse.move(rect.x + 200 + (step % 2 ? 8 : -8), rect.y + 200); await page.waitForTimeout(100); }
  await page.mouse.up();
  expect(await frames(page)).toBeGreaterThan(drawn + 20);
  expect((await diagnostics(page)).state, 'no step down while paused').toMatchObject({ paused: true, performance: 'high' });
  // Running again, the slow tracker is measured afresh and the automatic mode still steps down.
  await page.locator('#pause-toggle').click();
  await expect.poll(async () => (await diagnostics(page)).state.performance, { timeout: 60000 }).not.toBe('high');
  await page.locator('#camera-stop').click();
  expect(errors).toEqual([]);
});
