import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { createBodyRenderer } from '../../src/body.js';
import { DEFAULTS } from '../../src/settings.js';
import { landmarkToPoint, torsoBasis, normalize, sub, scale, dot, cross, add } from '../../src/basis.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/body.json', import.meta.url)));
const width = 640, height = 480;
afterEach(() => vi.unstubAllGlobals());

function material() {
  const uniforms = Object.fromEntries(['uBase', 'uOrtho', 'uMode', 'uGain', 'uOpacity', 'uFeather', 'uClipOn', 'uCutSoft'].map((key) => [key, { value: 0 }]));
  uniforms.uToHead = { value: new THREE.Matrix4() };
  uniforms.uClip = { value: new THREE.Vector4() };
  return new THREE.ShaderMaterial({ uniforms });
}

for (const side of ['L', 'R']) {
  test(`${side} palm-forward hand preserves the source forearm anterior axis instead of rolling it 90 degrees`, async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(url.endsWith('.json') ? JSON.stringify(meta) : new ArrayBuffer(0))));
    const settings = { ...DEFAULTS, arms: true, hands: true };
    // Empty geometry deliberately isolates the actual rig transform from WebGL.
    const renderer = createBodyRenderer({ settings, state: { mirror: true }, getSize: () => ({ width, height }),
      makeMaterial: material, asset: (path) => path, decodeGeometry: (data) => Object.fromEntries(data.meshes.map((entry) => {
        const geometry = new THREE.BufferGeometry(); geometry.name = entry.name; return [entry.name, geometry];
      })) });
    try {
      expect(await renderer.ensureLoaded()).toBe(true);
      const points = meta.demoPose.map((point) => landmarkToPoint(point, width, height));
      const entry = meta.meshes.find((mesh) => mesh.name === `arm_forearm_${side}`);
      const [elbow, wrist] = entry.landmarks.map((id) => points[id]);
      const distal = normalize(sub(wrist, elbow)), torso = torsoBasis(points);
      const referenceAnterior = [torso[8], torso[9], torso[10]];
      const anterior = normalize(sub(referenceAnterior, scale(distal, dot(referenceAnterior, distal))));
      const lateral = normalize(cross(anterior, distal));
      const handPoints = Array.from({ length: 21 }, () => [...wrist]);
      const radial = side === 'L' ? 1 : -1;
      handPoints[5] = add(add(wrist, scale(distal, 15)), scale(lateral, radial * 7));
      handPoints[17] = add(add(wrist, scale(distal, 15)), scale(lateral, -radial * 7));
      const hand = handPoints.map((point) => ({ x: point[0] / width, y: 1 - point[1] / height, z: -point[2] / width }));
      renderer.update({ now: 16, pose: { landmarks: [meta.demoPose] }, hands: { landmarks: [hand],
        handedness: [[{ categoryName: side === 'L' ? 'Left' : 'Right', score: 1 }]] }, instant: true });
      const mesh = renderer.scene.children[0].children.find((item) => item.geometry.name === entry.name);
      expect(mesh.visible).toBe(true);
      const actualAnterior = normalize(mesh.matrix.elements.slice(4, 7));
      expect(dot(actualAnterior, anterior), 'source anterior axis must follow the palm normal, not the cross-knuckle direction').toBeGreaterThan(0.999);
      expect(mesh.matrix.elements.slice(12, 15)).toEqual(elbow);
    } finally { renderer.dispose(); }
  });
}
