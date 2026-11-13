import { describe, expect, test } from 'vitest';
import { IDENTITY, zoomTarget, easeZoom, steadyZoom, zoomPoint, unzoomPoint, layerTransform, gestureZoom } from '../../src/focus-zoom.js';

const W = 640, H = 480;
describe('zoom onto a focused region', () => {
  test('no box, an invalid box or a box that already fills the stage leaves the picture alone', () => {
    expect(zoomTarget(null, W, H)).toBe(IDENTITY);
    expect(zoomTarget({ minX: NaN, maxX: 10, minY: 0, maxY: 10 }, W, H)).toBe(IDENTITY);
    expect(zoomTarget({ minX: 100, maxX: 540, minY: 40, maxY: 440 }, W, H)).toBe(IDENTITY);
  });
  test('a small box is centred and fitted inside the label margins', () => {
    const box = { minX: 280, maxX: 360, minY: 200, maxY: 260 }, zoom = zoomTarget(box, W, H);
    expect(zoom.z).toBe(4);
    expect(zoomPoint(zoom, 320, 230)).toEqual([W / 2, H / 2]);
    const wide = zoomTarget({ minX: 220, maxX: 420, minY: 220, maxY: 260 }, W, H);
    expect(wide.z).toBeCloseTo(0.62 * W / 200, 6);
  });
  test('the enlarged picture always covers the stage, even for a box in a corner', () => {
    for (const box of [{ minX: 0, maxX: 60, minY: 0, maxY: 60 }, { minX: 580, maxX: 640, minY: 420, maxY: 480 }, { minX: 300, maxX: 420, minY: 0, maxY: 90 }]) {
      const zoom = zoomTarget(box, W, H), [left, top] = zoomPoint(zoom, 0, 0), [right, bottom] = zoomPoint(zoom, W, H);
      expect(left).toBeLessThanOrEqual(1e-9); expect(top).toBeLessThanOrEqual(1e-9);
      expect(right).toBeGreaterThanOrEqual(W - 1e-9); expect(bottom).toBeGreaterThanOrEqual(H - 1e-9);
    }
  });
  test('display and view coordinates convert both ways', () => {
    const zoom = zoomTarget({ minX: 100, maxX: 200, minY: 300, maxY: 380 }, W, H);
    const [x, y] = unzoomPoint(zoom, ...zoomPoint(zoom, 123, 345));
    expect(x).toBeCloseTo(123, 9); expect(y).toBeCloseTo(345, 9);
    expect(unzoomPoint(IDENTITY, 5, 7)).toEqual([5, 7]);
  });
  test('easing approaches the target, lands on it and never leaves the stage uncovered on the way', () => {
    const target = zoomTarget({ minX: 560, maxX: 640, minY: 400, maxY: 480 }, W, H);
    let zoom = IDENTITY;
    for (let i = 0; i < 200 && zoom !== target; i++) {
      zoom = easeZoom(zoom, target, 16);
      expect(zoomPoint(zoom, 0, 0)[0]).toBeLessThanOrEqual(1e-6);
      expect(zoomPoint(zoom, W, H)[0]).toBeGreaterThanOrEqual(W - 1e-6);
    }
    expect(zoom).toBe(target);
    expect(easeZoom(target, IDENTITY, 0)).toEqual(target);
  });
  test('layer transforms: none at identity; the mirrored layer flips around the zoomed picture', () => {
    expect(layerTransform(IDENTITY, true, W, H, W, H)).toBe('');
    const zoom = { z: 2, bx: -100, by: -50 };
    expect(layerTransform(zoom, false, W, H, W, H)).toBe('matrix(2,0,0,2,-100,-50)');
    // Mirrored: element x maps to display W - x, then zooms. Element x = W lands at display 2*0 - 100.
    expect(layerTransform(zoom, true, W, H, W, H)).toBe('matrix(-2,0,0,2,1180,-50)');
    expect(layerTransform(zoom, false, W, H, W / 2, H / 2)).toBe('matrix(2,0,0,2,-50,-25)');
  });
});

describe('zoom by hand on a paused picture', () => {
  const close = (a, b) => { expect(a[0]).toBeCloseTo(b[0], 6); expect(a[1]).toBeCloseTo(b[1], 6); };
  test('spreading two fingers enlarges the picture about the point between them', () => {
    const zoom = gestureZoom(IDENTITY, [200, 150], [200, 150], 2, W, H);
    expect(zoom.z).toBe(2);
    close(zoomPoint(zoom, 200, 150), [200, 150]);
    const again = gestureZoom(zoom, [400, 300], [400, 300], 1.5, W, H);
    expect(again.z).toBe(3);
    close(zoomPoint(again, ...unzoomPoint(zoom, 400, 300)), [400, 300]);
  });
  test('moving both fingers carries the enlarged picture, but never past its edge', () => {
    const start = gestureZoom(IDENTITY, [320, 240], [320, 240], 2, W, H);
    const carried = gestureZoom(start, [320, 240], [360, 200], 1, W, H);
    expect(carried).toEqual({ z: 2, bx: start.bx + 40, by: start.by - 40 });
    const pushed = gestureZoom(start, [320, 240], [3000, -3000], 1, W, H);
    expect(pushed).toEqual({ z: 2, bx: 0, by: H - 2 * H });
  });
  test('pinching back to full size, or less, restores the whole picture exactly', () => {
    const start = gestureZoom(IDENTITY, [100, 100], [100, 100], 3, W, H);
    expect(gestureZoom(start, [100, 100], [100, 100], 1 / 3, W, H)).toBe(IDENTITY);
    expect(gestureZoom(start, [100, 100], [100, 100], 0.1, W, H)).toBe(IDENTITY);
  });
  test('enlargement stops at the limit and ignores a meaningless gesture', () => {
    expect(gestureZoom(IDENTITY, [320, 240], [320, 240], 50, W, H).z).toBe(6);
    expect(gestureZoom(IDENTITY, [320, 240], [320, 240], 50, W, H, { max: 3 }).z).toBe(3);
    const start = gestureZoom(IDENTITY, [320, 240], [320, 240], 2, W, H);
    expect(gestureZoom(start, [320, 240], [320, 240], NaN, W, H)).toBe(start);
    expect(gestureZoom(start, [320, 240], [NaN, 240], 2, W, H)).toBe(start);
    expect(gestureZoom(start, [320, 240], [320, 240], 0, W, H)).toBe(start);
  });
});

describe('an enlargement that does not follow tracker jitter', () => {
  const width = 640, height = 480;
  const about = (cx, cy, z) => ({ z, bx: width / 2 - z * cx, by: height / 2 - z * cy });
  test('small changes of size or place keep the enlargement that is already shown', () => {
    const shown = about(300, 200, 1.6);
    expect(steadyZoom(shown, about(300, 200, 1.66), width, height)).toBe(shown);
    expect(steadyZoom(shown, about(306, 203, 1.6), width, height)).toBe(shown);
    expect(steadyZoom(shown, about(304, 198, 1.55), width, height)).toBe(shown);
  });
  test('a real change of size or place is taken whole', () => {
    const shown = about(300, 200, 1.6), larger = about(300, 200, 1.9), moved = about(340, 200, 1.6);
    expect(steadyZoom(shown, larger, width, height)).toBe(larger);
    expect(steadyZoom(shown, moved, width, height)).toBe(moved);
  });
  test('starting and ending an enlargement are never treated as jitter', () => {
    const slight = about(320, 240, 1.06);
    expect(steadyZoom(IDENTITY, slight, width, height)).toBe(slight);
    expect(steadyZoom(slight, IDENTITY, width, height)).toBe(IDENTITY);
    expect(steadyZoom(IDENTITY, IDENTITY, width, height)).toBe(IDENTITY);
  });
});

