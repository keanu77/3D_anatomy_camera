import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createHeadTracker } from '../../src/head.js';
import { DEFAULTS } from '../../src/settings.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/head.json', import.meta.url)));
const pose = (x = 1.5, yaw = -.18) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, -.8, -55),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(.12, yaw, .03)),
  new THREE.Vector3(1.04, 1.04, 1.04),
);

function setup(overrides = {}) {
  let elapsed = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const camera = new THREE.PerspectiveCamera(48, 640 / 480, .1, 2000);
  const base = camera.projectionMatrix.clone();
  const group = new THREE.Group(), jawPivot = new THREE.Group();
  group.add(jawPivot);
  const settings = { ...DEFAULTS, ...overrides };
  const tracker = createHeadTracker({ settings, meta, camera, group, jawPivot, getBaseProjection: () => base });
  return { tracker, settings, camera, group, jawPivot, base, advance: ms => { elapsed += ms; } };
}

function landmarks(matrix, projection, scale = 1, x = 0, y = 0) {
  const result = Array(468);
  for (const [id, point] of Object.entries(meta.fit)) {
    const p = new THREE.Vector3(...point).applyMatrix4(matrix).applyMatrix4(projection);
    result[id] = { x: (scale * p.x + x + 1) / 2, y: (1 - scale * p.y - y) / 2, z: 0 };
  }
  return result;
}

function meanErrorPixels({ group, camera }, lms) {
  group.updateMatrixWorld(true);
  const distances = Object.entries(meta.fit).map(([id, point]) => {
    const p = new THREE.Vector3(...point).applyMatrix4(group.matrixWorld).project(camera);
    return Math.hypot(320 * (p.x - (2 * lms[id].x - 1)), 240 * (p.y - (1 - 2 * lms[id].y)));
  });
  return distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

afterEach(() => vi.restoreAllMocks());

describe('independent canonical-face head tracker', () => {
  test('snaps the first detection to the supplied pose and fits all 14 points below 3 pixels', () => {
    const scene = setup();
    const matrix = pose(), lms = landmarks(matrix, scene.base, 1.12, .035, -.025);
    scene.group.position.set(50, 50, 50);
    scene.tracker.update(matrix.elements, lms, .5);
    expect(scene.tracker.state.found).toBe(true);
    expect(scene.tracker.fitIds).toHaveLength(14);
    expect(scene.tracker.fitIds.every(Number.isInteger)).toBe(true);
    expect(scene.group.position.toArray()).toEqual([1.5, -.8, -55]);
    expect(scene.tracker.state.fitS).toBeCloseTo(1.12, 10);
    expect(scene.tracker.state.fitX).toBeCloseTo(.035, 10);
    expect(scene.tracker.state.fitY).toBeCloseTo(-.025, 10);
    expect(meanErrorPixels(scene, lms)).toBeLessThan(3);
    expect(scene.jawPivot.rotation.x).toBeCloseTo(.175, 10);
  });

  test('repeated static detections do not accumulate projection correction or change the base projection', () => {
    const scene = setup(), matrix = pose();
    const originalBase = scene.base.elements.slice();
    const lms = landmarks(matrix, scene.base, 1.12, .035, -.025);
    for (let i = 0; i < 80; i++) {
      scene.advance(16);
      scene.tracker.update(matrix.elements, lms, 0);
    }
    expect(meanErrorPixels(scene, lms)).toBeLessThan(1e-8);
    expect(scene.base.elements).toEqual(originalBase);
    const identity = scene.camera.projectionMatrix.clone().multiply(scene.camera.projectionMatrixInverse);
    identity.elements.forEach((value, i) => expect(value).toBeCloseTo(new THREE.Matrix4().elements[i], 10));
  });

  test('subsequent poses and jaw movement smooth while converging to the requested values', () => {
    const scene = setup(), first = pose(-3, -.2), second = pose(4, .3);
    scene.tracker.update(first.elements, landmarks(first, scene.base), 0);
    scene.advance(16);
    scene.tracker.update(second.elements, landmarks(second, scene.base), 1);
    expect(scene.group.position.x).toBeGreaterThan(-3);
    expect(scene.group.position.x).toBeLessThan(4);
    expect(scene.jawPivot.rotation.x).toBeGreaterThan(0);
    expect(scene.jawPivot.rotation.x).toBeLessThan(.35);
    const expectedRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(second));
    expect(scene.group.quaternion.angleTo(expectedRotation)).toBeGreaterThan(.01);
    for (let i = 0; i < 60; i++) {
      scene.advance(16);
      scene.tracker.update(second.elements, landmarks(second, scene.base), 1);
    }
    expect(scene.group.position.x).toBeCloseTo(4, 3);
    expect(scene.group.quaternion.angleTo(expectedRotation)).toBeLessThan(1e-4);
    expect(scene.jawPivot.rotation.x).toBeCloseTo(.35, 4);
  });

  test('loss marks the detection absent and reacquisition snaps without carrying the previous smoothing delay', () => {
    const scene = setup(), first = pose(-3), second = pose(4);
    scene.tracker.update(first.elements, landmarks(first, scene.base), .3);
    scene.tracker.update(null, null, 0);
    expect(scene.tracker.state.found).toBe(false);
    expect(scene.tracker.state.lms).toBeNull();
    expect(scene.group.visible).toBe(false);
    scene.advance(10);
    scene.tracker.update(second.elements, landmarks(second, scene.base, .92, -.02, .04), .9);
    expect(scene.tracker.state.found).toBe(true);
    expect(scene.group.visible).toBe(true);
    expect(scene.group.position.x).toBe(4);
    expect(scene.tracker.state.fitS).toBeCloseTo(.92, 10);
    expect(scene.jawPivot.rotation.x).toBeCloseTo(.315, 10);
  });

  test('manual calibration remains visible after fitting and state matches the final group transform', () => {
    const scene = setup({ fs: 1.1, fw: 1.2, fh: .9, fd: 1.05, fx: 1, fy: -2, fz: 3 });
    const matrix = pose();
    scene.tracker.update(matrix.elements, landmarks(matrix, scene.base, 1.08, .02, -.01), 0);
    expect(scene.tracker.state.fitS).toBeCloseTo(1.08, 10);
    expect(scene.group.position.toArray()).toEqual([2.5, -2.8, -52]);
    [1.04 * 1.1 * 1.2, 1.04 * 1.1 * .9, 1.04 * 1.1 * 1.05].forEach((value, i) => {
      expect(scene.group.scale.getComponent(i)).toBeCloseTo(value, 10);
    });
    expect(scene.tracker.state.pos.toArray()).toEqual(scene.group.position.toArray());
    expect(scene.tracker.state.quat.toArray()).toEqual(scene.group.quaternion.toArray());
    expect(scene.tracker.state.scl.toArray()).toEqual(scene.group.scale.toArray());
    expect(meanErrorPixels(scene, landmarks(matrix, scene.base, 1.08, .02, -.01))).toBeGreaterThan(3);
  });

  test('a missing landmark fit retains the last finite correction', () => {
    const scene = setup(), matrix = pose();
    scene.tracker.update(matrix.elements, landmarks(matrix, scene.base, 1.1, .04, .02), .4);
    scene.advance(20);
    scene.tracker.update(matrix.elements, Array(468).fill({ x: NaN, y: Infinity }), NaN);
    expect(scene.tracker.state.found).toBe(true);
    expect(scene.tracker.state.fitS).toBeCloseTo(1.1, 10);
    expect(scene.tracker.state.fitX).toBeCloseTo(.04, 10);
    expect(scene.tracker.state.fitY).toBeCloseTo(.02, 10);
    expect(scene.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(scene.tracker.state.jaw)).toBe(true);
  });

  test('invalid or singular pose input cannot poison transforms', () => {
    const scene = setup(), matrix = pose();
    scene.tracker.update(matrix.elements, landmarks(matrix, scene.base), 0);
    expect(scene.tracker.state.found).toBe(true);
    const before = scene.group.position.toArray();
    for (const input of [[], Array(16).fill(0), Array(16).fill(NaN)]) {
      scene.tracker.update(input, [], 0);
      expect(scene.tracker.state.found).toBe(false);
      expect(scene.group.position.toArray()).toEqual(before);
      expect(scene.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    }
  });

  test('jaw animation clamps blendshape input and does not change the pivot location', () => {
    const scene = setup(), matrix = pose();
    scene.jawPivot.position.fromArray(meta.jawPivot);
    scene.tracker.update(matrix.elements, landmarks(matrix, scene.base), 8);
    expect(scene.jawPivot.rotation.x).toBeCloseTo(.35, 10);
    expect(scene.jawPivot.position.toArray()).toEqual(meta.jawPivot);
    scene.tracker.update(null, null, 0);
    scene.tracker.update(matrix.elements, landmarks(matrix, scene.base), -4);
    expect(scene.jawPivot.rotation.x).toBe(0);
  });
});
