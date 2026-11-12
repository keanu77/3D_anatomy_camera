import { describe, expect, test } from 'vitest';
import { Matrix4, OrthographicCamera, PerspectiveCamera } from 'three';
import { decodeGeometry } from '../../src/geometry.js';
import { projectAnchor } from '../../src/labels.js';
import { demoHandLandmarks, demoBodyPose } from '../../src/demo-pose.js';
import { readFileSync } from 'node:fs';
const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/head.json', import.meta.url)));

describe('independent render coordinates', () => {
  test('decodes little-endian quantized coordinates and keeps shared indices valid', () => {
    const buffer = new ArrayBuffer(24), data = new DataView(buffer);
    [0, 65535, 32768, 65535, 0, 0, 0, 0, 65535, 0, 1, 2].forEach((n, i) => data.setUint16(i * 2, n, true));
    const result = decodeGeometry({ meshes: [{ name: 'sample', nv: 3, ni: 3, offV: 0, offI: 18, min: [-1, 2, 5], size: [2, 4, 6] }] }, buffer).sample;
    expect(Array.from(result.index.array)).toEqual([0, 1, 2]);
    expect(result.attributes.position.getX(0)).toBe(-1);
    expect(result.attributes.position.getY(0)).toBe(6);
    expect(result.attributes.position.getZ(0)).toBeCloseTo(8, 3);
    expect(result.attributes.normal.count).toBe(3);
    result.dispose();
  });
  test('orthographic anchors honor stage axes, reflection, and a hidden half-space', () => {
    const camera = new OrthographicCamera(0, 640, 480, 0, -1000, 1000);
    const args = { point: [120, 180, 0], matrix: new Matrix4(), camera, width: 640, height: 480 };
    expect(projectAnchor(args)).toEqual({ ax: 120, ay: 300 });
    expect(projectAnchor({ ...args, mirror: true })).toEqual({ ax: 520, ay: 300 });
    expect(projectAnchor({ ...args, plane: [1, 0, 0, 121] })).toBeNull();
    expect(projectAnchor({ ...args, lens: { x: 500, y: 100, r: 20 } })).toBeNull();
  });
  test('moving jaw anchors are clipped in head space after their pivot transform', () => {
    const camera = new OrthographicCamera(0, 640, 480, 0, -1000, 1000);
    expect(projectAnchor({ point: [20, 40, 0], matrix: new Matrix4(), camera, width: 640, height: 480,
      plane: [1, 0, 0, 10], planeMatrix: new Matrix4().makeTranslation(-15, 0, 0) })).toBeNull();
  });
  test('perspective anchors reject behind-camera or outside-stage positions', () => {
    const camera = new PerspectiveCamera(45, 4 / 3, .1, 1000);
    const args = { matrix: new Matrix4(), camera, width: 640, height: 480 };
    expect(projectAnchor({ ...args, point: [0, 0, -30] })).toEqual({ ax: 320, ay: 240 });
    expect(projectAnchor({ ...args, point: [0, 0, 30] })).toBeNull();
    expect(projectAnchor({ ...args, point: [100, 0, -30] })).toBeNull();
  });
  test.each([false, true])('atlas-derived demo hands keep their exact wrist and finite points, left=%s', left => {
    const wrist = { x: .3, y: .45, z: .02 };
    const points = demoHandLandmarks(meta.handReference, { wrist, left, width: 640, height: 480, length: 120, angle: .2 });
    expect(points).toHaveLength(21);
    expect(points[0]).toEqual(wrist);
    expect(points.every(p => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
    expect(Math.hypot((points[12].x - wrist.x) * 640, (points[12].y - wrist.y) * 480)).toBeCloseTo(120, 6);
  });
  test('new full-body pose preserves physical proportions on portrait and landscape stages', () => {
    const landscape = demoBodyPose(640, 480, 0, true).landmarks[0], portrait = demoBodyPose(390, 693, 0, true).landmarks[0];
    const ratio = (p, w, h) => Math.abs((p[11].x - p[12].x) * w / ((p[23].y - p[11].y) * h));
    expect(ratio(landscape, 640, 480)).toBeCloseTo(ratio(portrait, 390, 693), 12);
    expect(landscape.every(p => p.visibility === 1 && p.presence === 1)).toBe(true);
  });
});
