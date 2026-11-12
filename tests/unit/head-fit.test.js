import { describe, expect, test } from 'vitest';
import { fitScreenSimilarity, smoothingWeight } from '../../src/head-fit.js';

const source = [[-.4, -.1], [.35, -.3], [.05, .6], [-.2, .3]];
const corrected = (points, scale, x, y) => points.map(point => [scale * point[0] + x, scale * point[1] + y]);

describe('independent screen-plane head fitting', () => {
  test('recovers a known positive uniform scale and translation', () => {
    const fit = fitScreenSimilarity(source, corrected(source, 1.18, -.09, .16), 640 / 480);
    expect(fit.valid).toBe(true);
    expect(fit.count).toBe(4);
    expect(fit.scale).toBeCloseTo(1.18, 12);
    expect(fit.x).toBeCloseTo(-.09, 12);
    expect(fit.y).toBeCloseTo(.16, 12);
  });

  test('weights horizontal error in display pixels when the frame is not square', () => {
    const fit = fitScreenSimilarity([[-1, -1], [1, 1]], [[-2, -1], [2, 1]], 2);
    expect(fit.scale).toBeCloseTo(1.8, 12);
    expect(fit.x).toBe(0);
    expect(fit.y).toBe(0);
  });

  test('ignores missing and nonfinite pairs without moving the remaining correspondences', () => {
    const observed = corrected(source, .85, .12, -.07);
    observed[1] = undefined;
    const fit = fitScreenSimilarity([...source, [NaN, 0]], [...observed, [0, 0]]);
    expect(fit.valid).toBe(true);
    expect(fit.count).toBe(3);
    expect(fit.scale).toBeCloseTo(.85, 12);
    expect(fit.x).toBeCloseTo(.12, 12);
    expect(fit.y).toBeCloseTo(-.07, 12);
  });

  test.each([
    [[], []],
    [[[1, 2]], [[3, 4]]],
    [[[1, 1], [1, 1]], [[1, 2], [3, 4]]],
    [source, corrected(source, -1, 0, 0)],
  ])('returns a finite identity for an unsolvable fit %#', (points, targets) => {
    const fit = fitScreenSimilarity(points, targets);
    expect(fit.valid).toBe(false);
    expect([fit.scale, fit.x, fit.y]).toEqual([1, 0, 0]);
  });
});

describe('time-based head smoothing', () => {
  test('equal elapsed time has the same retention at different update rates', () => {
    const oneStep = 1 - smoothingWeight(40);
    const fourSteps = (1 - smoothingWeight(10)) ** 4;
    expect(oneStep).toBeCloseTo(fourSteps, 12);
    expect(smoothingWeight(40)).toBeGreaterThan(0);
    expect(smoothingWeight(40)).toBeLessThan(1);
  });

  test('zero or invalid elapsed time cannot overshoot', () => {
    expect(smoothingWeight(0)).toBe(0);
    expect(smoothingWeight(-2)).toBe(0);
    expect(smoothingWeight(NaN)).toBe(0);
    expect(smoothingWeight(100000)).toBe(1);
  });
});
