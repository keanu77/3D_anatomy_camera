import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Group, Mesh, Vector3, OrthographicCamera } from 'three';
import { createHandUpdater } from '../../src/hands.js';

const pairs = [[1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]];
const reference = JSON.parse(readFileSync(new URL('../../public/anatomy/head.json', import.meta.url))).handReference;
const landmarks = reference.map(([x, y, z]) => ({ x: .5 + (x + 260) * .003, y: .55 - (z - 780) * .003, z: (y + 130) * .001 }));
function rig() {
  const group = new Group(), palm = new Mesh(), bones = pairs.map(() => new Mesh());
  group.add(palm, ...bones);
  return { group, palm, bones, pts: null };
}

test('all 15 right and reflected-left finger endpoints project within 2 pixels of input landmarks', () => {
  const updater = createHandUpdater({ settings: { feather: .2 }, getSize: () => ({ width: 640, height: 480 }) });
  const camera = new OrthographicCamera(0, 640, 480, 0, -2000, 2000);
  camera.updateMatrixWorld(true);
  for (const right of [true, false]) {
    const hand = rig(), input = landmarks.map(p => ({ ...p, x: right ? p.x : 1 - p.x }));
    updater.update(hand, input, right);
    hand.group.updateMatrixWorld(true);
    let maximum = 0;
    pairs.forEach(([a, b], index) => {
      for (const [local, landmark] of [[0, a], [1, b]]) {
        const projected = new Vector3(local, 0, 0).applyMatrix4(hand.bones[index].matrixWorld).project(camera);
        const x = (projected.x + 1) * 320, y = (1 - projected.y) * 240;
        maximum = Math.max(maximum, Math.hypot(x - input[landmark].x * 640, y - input[landmark].y * 480));
      }
    });
    expect(maximum).toBeLessThan(2);
    expect(hand.palm.matrix.determinant() > 0).toBe(right);
  }
});

test('bad or missing tracking cannot retain visible geometry, and reacquisition snaps into place', () => {
  const hand = rig();
  const updater = createHandUpdater({ settings: {}, getSize: () => ({ width: 640, height: 480 }) });
  updater.update(hand, landmarks, true);
  for (const invalid of [null, [], landmarks.map(p => ({ ...p, x: NaN })), Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }))]) {
    updater.update(hand, invalid, true);
    expect(hand.group.visible).toBe(false);
    const shifted = landmarks.map(p => ({ ...p, x: p.x + .1 }));
    updater.update(hand, shifted, true);
    expect(hand.group.visible).toBe(true);
    expect(hand.pts[5].x).toBeCloseTo(shifted[5].x * 640, 8);
  }
});

test('hand mask uses opacity and feather settings while balancing canvas state', () => {
  const events = [], context = new Proxy({}, { get: (object, key) => key in object ? object[key] : (...args) => events.push([key, ...args]), set: (object, key, value) => { events.push([key, value]); object[key] = value; return true; } });
  const settings = { feather: .75 };
  createHandUpdater({ settings, getSize: () => ({ width: 640, height: 480 }) }).drawVeil(context, landmarks, .7);
  expect(events[0][0]).toBe('save');
  expect(events.at(-1)[0]).toBe('restore');
  expect(events).toContainEqual(['globalAlpha', .7]);
  expect(events.some(([key, value]) => key === 'filter' && /blur\([1-9]/.test(value))).toBe(true);
  expect(events.some(([key]) => key === 'fill')).toBe(true);
});
