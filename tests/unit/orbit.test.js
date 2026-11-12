import { describe, expect, test } from 'vitest';
import { LEVEL, dragOrbit, isLevel, orbitElements } from '../../src/orbit.js';
import { transformPoint } from '../../src/basis.js';

const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe('orbiting a frozen view', () => {
  test('level is the identity and leaves every point where it was', () => {
    expect(isLevel(LEVEL)).toBe(true);
    close(orbitElements(LEVEL, [5, 6, 7]), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
  test('the pivot never moves', () => {
    const pivot = [120, 300, -40];
    close(transformPoint(orbitElements({ yaw: 1.1, pitch: -0.6 }, pivot), pivot), pivot);
  });
  test('a positive yaw brings the surface facing the viewer to the right; a positive pitch brings it down', () => {
    const front = [0, 0, 10];
    expect(transformPoint(orbitElements({ yaw: 0.5, pitch: 0 }), front)[0]).toBeGreaterThan(0);
    expect(transformPoint(orbitElements({ yaw: 0, pitch: 0.5 }), front)[1]).toBeLessThan(0);
  });
  test('a quarter turn shows the side: left-right extent becomes depth', () => {
    close(transformPoint(orbitElements({ yaw: Math.PI / 2, pitch: 0 }, [0, 0, 0]), [10, 5, 0]), [0, 5, -10]);
  });
  test('distances are preserved', () => {
    const m = orbitElements({ yaw: 2.3, pitch: 0.9 }, [3, 4, 5]), a = transformPoint(m, [1, 2, 3]), b = transformPoint(m, [7, -2, 9]);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(Math.hypot(6, 4, 6), 9);
  });
  test('dragging right turns towards the finger, also in the mirrored picture; dragging down tilts down', () => {
    expect(dragOrbit(LEVEL, 100, 0, 640).yaw).toBeGreaterThan(0);
    expect(dragOrbit(LEVEL, 100, 0, 640, true).yaw).toBeLessThan(0);
    expect(dragOrbit(LEVEL, 0, 80, 640).pitch).toBeGreaterThan(0);
    expect(dragOrbit(LEVEL, 640, 0, 640).yaw).toBeCloseTo(Math.atan2(Math.sin(1.2 * Math.PI), Math.cos(1.2 * Math.PI)), 9);
  });
  test('pitch stops at 75 degrees and yaw wraps instead of growing without bound', () => {
    expect(dragOrbit(LEVEL, 0, 5000, 640).pitch).toBeCloseTo(75 * Math.PI / 180, 9);
    expect(dragOrbit(LEVEL, 0, -5000, 640).pitch).toBeCloseTo(-75 * Math.PI / 180, 9);
    const far = dragOrbit(LEVEL, 100000, 0, 640);
    expect(Math.abs(far.yaw)).toBeLessThanOrEqual(Math.PI);
  });
  test('a drag continues from where the previous one ended', () => {
    const first = dragOrbit(LEVEL, 50, 20, 640), second = dragOrbit(first, 50, 20, 640), whole = dragOrbit(LEVEL, 100, 40, 640);
    expect(second.yaw).toBeCloseTo(whole.yaw, 9); expect(second.pitch).toBeCloseTo(whole.pitch, 9);
  });
});
