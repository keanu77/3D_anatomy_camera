import { describe, expect, test } from 'vitest';
import { createPointFilter } from '../../src/one-euro.js';

const DT = 1 / 30;
// Deterministic pseudo-noise in [-1, 1].
const noise = seed => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 2147483648 - 1; }; };
const rms = values => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);

describe('tracked point smoothing', () => {
  test('the first sample and a reset pass through unchanged', () => {
    const filter = createPointFilter(1);
    expect(filter.filter([[3, 4, 5]], DT)).toEqual([[3, 4, 5]]);
    filter.filter([[9, 9, 9]], DT);
    filter.reset();
    expect(filter.filter([[7, 8, 9]], DT)).toEqual([[7, 8, 9]]);
    expect(() => filter.filter([[0, 0, 0], [1, 1, 1]], DT)).toThrow();
  });
  test('a still point with tracker noise trembles far less than the raw input and than the old 0.6 blend', () => {
    const random = noise(7), filter = createPointFilter(1), raw = [], smooth = [], blend = [];
    let old = null;
    for (let i = 0; i < 300; i++) {
      const p = [100 + 2 * random(), 200 + 2 * random(), 50 + 6 * random()];
      const out = filter.filter([p], DT)[0];
      old = old ? old.map((v, a) => v + (p[a] - v) * 0.6) : p;
      if (i > 60) { raw.push(p[0] - 100); smooth.push(out[0] - 100); blend.push(old[0] - 100); }
    }
    expect(rms(smooth)).toBeLessThan(rms(raw) * 0.4);
    expect(rms(smooth)).toBeLessThan(rms(blend) * 0.6);
  });
  test('depth is smoothed harder than the picture plane', () => {
    const random = noise(11), filter = createPointFilter(1), plane = [], depth = [];
    for (let i = 0; i < 300; i++) {
      const out = filter.filter([[4 * random(), 0, 4 * random()]], DT)[0];
      if (i > 60) { plane.push(out[0]); depth.push(out[2]); }
    }
    expect(rms(depth)).toBeLessThan(rms(plane) * 0.8);
  });
  test('a fast limb is followed closely: the lag at 600 px/s stays under a frame and a half of travel', () => {
    const filter = createPointFilter(1);
    let out;
    for (let i = 0; i < 60; i++) out = filter.filter([[i * 600 * DT, 0, 0]], DT)[0];
    expect(59 * 600 * DT - out[0]).toBeLessThan(600 * DT * 1.5);
  });
  test('after a move the point settles on the new place instead of creeping', () => {
    const filter = createPointFilter(1);
    for (let i = 0; i < 30; i++) filter.filter([[0, 0, 0]], DT);
    let out;
    for (let i = 0; i < 30; i++) out = filter.filter([[120, 0, 0]], DT)[0];
    expect(Math.abs(out[0] - 120)).toBeLessThan(1.5);
  });
  test('speeds scale with the stage, so a small stage is not over-smoothed', () => {
    const run = unit => { const filter = createPointFilter(1); let out; for (let i = 0; i < 20; i++) out = filter.filter([[i * 5, 0, 0]], DT, unit)[0]; return 19 * 5 - out[0]; };
    expect(run(4)).toBeLessThan(run(1));
  });
  test('inputs are not mutated and outputs are independent copies', () => {
    const filter = createPointFilter(1), input = [[1, 2, 3]];
    const first = filter.filter(input, DT); first[0][0] = 99;
    expect(input).toEqual([[1, 2, 3]]);
    expect(filter.filter([[1, 2, 3]], DT)[0][0]).toBeCloseTo(1, 6);
  });
});
