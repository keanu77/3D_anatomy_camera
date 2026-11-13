import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { createBodyRenderer } from '../../src/body.js';
import { DEFAULTS } from '../../src/settings.js';
import { landmarkToPoint } from '../../src/basis.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/body.json', import.meta.url)));
const width = 640, height = 480;
afterEach(() => vi.unstubAllGlobals());

function material() {
  const uniforms = Object.fromEntries(['uBase', 'uOrtho', 'uMode', 'uGain', 'uOpacity', 'uFeather', 'uClipOn', 'uCutSoft'].map((key) => [key, { value: 0 }]));
  uniforms.uToHead = { value: new THREE.Matrix4() };
  uniforms.uClip = { value: new THREE.Vector4() };
  return new THREE.ShaderMaterial({ uniforms });
}
async function loaded() {
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(url.endsWith('.json') ? JSON.stringify(meta) : new ArrayBuffer(0))));
  const renderer = createBodyRenderer({ settings: { ...DEFAULTS, arms: true }, state: { mirror: true }, getSize: () => ({ width, height }),
    makeMaterial: material, asset: (path) => path, decodeGeometry: (data) => Object.fromEntries(data.meshes.map((entry) => {
      const geometry = new THREE.BufferGeometry(); geometry.name = entry.name; return [entry.name, geometry];
    })) });
  expect(await renderer.ensureLoaded()).toBe(true);
  return renderer;
}
// The whole body 60 stage pixels to the side: a person who was moving when the picture froze.
const shifted = meta.demoPose.map((point) => ({ ...point, x: point.x + 60 / width }));
const pose = (landmarks) => ({ landmarks: [landmarks] });
const humerus = (renderer) => renderer.getDiagnostics().bodySegments.find((segment) => segment.name === 'arm_humerus_L');
const expected = (landmarks, id) => landmarkToPoint(landmarks[id], width, height);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the frame inferred after the picture freezes replaces the trailing smoothed pose', async () => {
  const renderer = await loaded();
  try {
    for (let frame = 0; frame < 5; frame++) renderer.update({ now: 100 + frame * 66, pose: pose(meta.demoPose) });
    const [shoulder, elbow] = humerus(renderer).landmarks;
    expect(distance(humerus(renderer).proximal, expected(meta.demoPose, shoulder))).toBeLessThan(1e-6);

    renderer.update({ now: 100 + 5 * 66, pose: pose(shifted), settle: true });
    const frozen = humerus(renderer);
    expect(distance(frozen.proximal, expected(shifted, shoulder)), 'shoulder matches the frozen picture').toBeLessThan(1e-6);
    expect(distance(frozen.distal, expected(shifted, elbow)), 'elbow matches the frozen picture').toBeLessThan(1e-6);

    // Redrawing the frozen frame, however often and whenever, leaves the settled pose alone.
    for (let redraw = 0; redraw < 4; redraw++) renderer.update({ now: 100 + 5 * 66, pose: pose(shifted), hold: true });
    expect(humerus(renderer).proximal).toEqual(frozen.proximal);
    expect(humerus(renderer).distal).toEqual(frozen.distal);
  } finally { renderer.dispose(); }
});

test('a moving pose is still smoothed between ordinary frames', async () => {
  const renderer = await loaded();
  try {
    for (let frame = 0; frame < 5; frame++) renderer.update({ now: 100 + frame * 66, pose: pose(meta.demoPose) });
    const [shoulder] = humerus(renderer).landmarks;
    renderer.update({ now: 100 + 5 * 66, pose: pose(shifted) });
    const trailing = distance(humerus(renderer).proximal, expected(shifted, shoulder));
    expect(trailing, 'the filter has not jumped to the raw landmark').toBeGreaterThan(0.5);
    expect(trailing).toBeLessThan(60);
  } finally { renderer.dispose(); }
});
