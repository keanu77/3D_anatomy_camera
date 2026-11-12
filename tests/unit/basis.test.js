import { describe, expect, test } from 'vitest';
import { boneBasis, footBasis, torsoBasis, transformPoint, landmarkToPoint, segmentVisible, palmNormal } from '../../src/basis.js';

function close(actual, expected) {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 8));
}

describe('anatomical reference frames', () => {
  test('projects landmarks into the same pixel coordinates used by the hand renderer', () => {
    close(landmarkToPoint({ x: 0.25, y: 0.75, z: -0.1 }, 640, 480), [160, 120, 64]);
  });
  test.each([
    [[10, 20, 30], [40, 70, -20], [0, 0, 1]],
    [[0, 0, 0], [0, 0, 20], [0, 0, 1]],
    [[-10, 5, 0], [20, 5, 0], [1, 0, 0]],
    [[0, 0, 0], [0, -20, 0], [0, -1, 0]],
  ])('pins local bone endpoints to both observed joints (%s -> %s)', (start, end, roll) => {
    const basis = boneBasis(start, end, roll);
    expect(basis.every(Number.isFinite)).toBe(true);
    close(transformPoint(basis, [0, 0, 0]), start);
    close(transformPoint(basis, [1, 0, 0]), end);
    const x = basis.slice(0, 3), y = basis.slice(4, 7), z = basis.slice(8, 11);
    const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    expect(dot(x, y)).toBeCloseTo(0, 8);
    expect(dot(x, z)).toBeCloseTo(0, 8);
    expect(dot(y, z)).toBeCloseTo(0, 8);
    expect(Math.hypot(...y)).toBeCloseTo(Math.hypot(...x), 8);
  });
  test('rejects collapsed or nonfinite bones', () => {
    expect(boneBasis([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(boneBasis([0, 0, 0], [NaN, 1, 1])).toBeNull();
  });
  test('places torso origin midway between hips and its vertical axis at shoulder midpoint', () => {
    const points = [];
    points[11] = [150, 200, 0]; points[12] = [50, 200, 0];
    points[23] = [130, 50, 0]; points[24] = [70, 50, 0];
    const basis = torsoBasis(points);
    close(transformPoint(basis, [0, 0, 0]), [100, 50, 0]);
    close(transformPoint(basis, [0, 1, 0]), [100, 200, 0]);
    close(transformPoint(basis, [0.5, 1, 0]), points[11]);
    close(transformPoint(basis, [-0.5, 1, 0]), points[12]);
  });
  test('rejects torso frames with missing or collinear reference points', () => {
    expect(torsoBasis([])).toBeNull();
    const points = Array.from({ length: 33 }, () => [0, 0, 0]);
    expect(torsoBasis(points)).toBeNull();
  });
  test('foot reference points agree with heel origin, toe x axis, ankle y axis', () => {
    const heel = [3, 4, 5], toe = [20, 4, 6], ankle = [5, 25, 7];
    const basis = footBasis(ankle, heel, toe);
    close(transformPoint(basis, [0, 0, 0]), heel);
    close(transformPoint(basis, [1, 0, 0]), toe);
    close(transformPoint(basis, [0, 1, 0]), ankle);
    expect(footBasis(heel, heel, toe)).toBeNull();
  });
  test('hides segments when any endpoint is missing, unobservable or nonfinite', () => {
    const good = { x: 0.2, y: 0.3, z: 0, visibility: 0.9, presence: 0.9 };
    expect(segmentVisible([good, good], [0, 1])).toBe(true);
    for (const bad of [undefined, { ...good, visibility: 0.49 }, { ...good, presence: 0.49 }, { ...good, x: Infinity }]) {
      expect(segmentVisible([good, bad], [0, 1])).toBe(false);
    }
  });
  test.each(['L', 'R'])('%s palm normal tracks axial pronation independently of display mirroring', (side) => {
    const radial = side === 'L' ? 1 : -1;
    close(palmNormal([0, 0, 0], [radial, -1, 0], [-radial, -1, 0], side), [0, 0, 1]);
    close(palmNormal([0, 0, 0], [0, -1, -radial], [0, -1, radial], side), [1, 0, 0]);
  });
  test('unusable hand planes return null so forearm roll can retain the torso fallback', () => {
    expect(palmNormal([0, 0, 0], [0, 1, 0], [0, 2, 0], 'L')).toBeNull();
    expect(palmNormal([0, 0, 0], [NaN, 1, 0], [1, 0, 0], 'R')).toBeNull();
    expect(palmNormal([0, 0, 0], [0, 1, 0], [1, 0, 0], 'unknown')).toBeNull();
  });
});
