import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { poseContradictsHands } from '../../src/basis.js';
import { createBodyRenderer } from '../../src/body.js';
import { DEFAULTS } from '../../src/settings.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/body.json', import.meta.url)));
const width = 876, height = 465;
afterEach(() => vi.unstubAllGlobals());

// A pose with every landmark confidently present: shoulders, elbows and wrists are placed, the rest is filler.
function pose({ shoulderL, elbowL, wristL, shoulderR, elbowR, wristR, visibility = 0.9 }) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility, presence: visibility }));
  const put = (index, [x, y]) => { landmarks[index] = { x: x / width, y: y / height, z: 0, visibility, presence: visibility }; };
  put(11, shoulderL); put(13, elbowL); put(15, wristL); put(12, shoulderR); put(14, elbowR); put(16, wristR);
  return landmarks;
}
// A hand from its wrist to the tip of the middle finger; `length` is in stage pixels.
function hand([x, y], length) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: x / width, y: y / height, z: 0 }));
  landmarks[12] = { x: x / width, y: (y - length) / height, z: 0 };
  return landmarks;
}
// Measured from the official hands close-up: forearms of 94 to 123 px and upper arms of about 150 px beside hands of 425 px.
const phantom = pose({ shoulderL: [470, 200], elbowL: [520, 340], wristL: [540, 450], shoulderR: [350, 200], elbowR: [320, 345], wristR: [300, 460] });
// Measured from the official portrait: forearms of about 300 px with a hand of 154 px.
const person = pose({ shoulderL: [580, 130], elbowL: [640, 380], wristL: [560, 660], shoulderR: [300, 130], elbowR: [240, 380], wristR: [320, 660] });

describe('a pose must agree with the hands that are tracked', () => {
  test('a small figure inferred from a close-up of hands contradicts those hands', () => {
    expect(poseContradictsHands(phantom, [hand([200, 440], 425), hand([680, 440], 425)], width, height)).toBe(true);
    expect(poseContradictsHands(phantom, [hand([200, 440], 425)], width, height)).toBe(true);
  });
  test('a person whose hand belongs to the arm does not', () => {
    expect(poseContradictsHands(person, [hand([560, 660], 154)], width, height)).toBe(false);
    // A hand brought well towards the camera is drawn larger than its forearm, and is still the same arm.
    expect(poseContradictsHands(person, [hand([560, 660], 420)], width, height)).toBe(false);
  });
  test('without a measured hand or a visible arm there is nothing to contradict', () => {
    expect(poseContradictsHands(phantom, [], width, height)).toBe(false);
    expect(poseContradictsHands(phantom, undefined, width, height)).toBe(false);
    expect(poseContradictsHands(phantom, [hand([200, 440], 0)], width, height)).toBe(false);
    expect(poseContradictsHands(phantom, [[{ x: NaN, y: 0, z: 0 }]], width, height)).toBe(false);
    const unseenArms = pose({ shoulderL: [470, 200], elbowL: [520, 340], wristL: [540, 450], shoulderR: [350, 200], elbowR: [320, 345], wristR: [300, 460], visibility: 0.2 });
    expect(poseContradictsHands(unseenArms, [hand([200, 440], 425)], width, height)).toBe(false);
    expect(poseContradictsHands(null, [hand([200, 440], 425)], width, height)).toBe(false);
    expect(poseContradictsHands(phantom.slice(0, 20), [hand([200, 440], 425)], width, height)).toBe(false);
  });
});

function material() {
  const uniforms = Object.fromEntries(['uBase', 'uOrtho', 'uMode', 'uGain', 'uOpacity', 'uFeather', 'uClipOn', 'uCutSoft'].map((key) => [key, { value: 0 }]));
  uniforms.uToHead = { value: new THREE.Matrix4() }; uniforms.uClip = { value: new THREE.Vector4() };
  return new THREE.ShaderMaterial({ uniforms });
}
test('the body is not drawn on a pose that the tracked hands contradict, and is drawn again when they agree', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(url.endsWith('.json') ? JSON.stringify(meta) : new ArrayBuffer(0))));
  const renderer = createBodyRenderer({ settings: { ...DEFAULTS, arms: true }, state: { mirror: true }, getSize: () => ({ width, height }),
    makeMaterial: material, asset: (path) => path, decodeGeometry: (data) => Object.fromEntries(data.meshes.map((entry) => {
      const geometry = new THREE.BufferGeometry(); geometry.name = entry.name; return [entry.name, geometry];
    })) });
  try {
    expect(await renderer.ensureLoaded()).toBe(true);
    const closeUp = { landmarks: [hand([200, 440], 425), hand([680, 440], 425)] };
    renderer.update({ now: 100, pose: { landmarks: [phantom] }, hands: closeUp, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ visibleParts: 0, poseFound: false, poseRejected: true });
    renderer.update({ now: 166, pose: { landmarks: [phantom] }, hands: { landmarks: [] }, instant: true });
    expect(renderer.getDiagnostics().visibleParts).toBeGreaterThan(0);
    expect(renderer.getDiagnostics().poseRejected).toBe(false);
  } finally { renderer.dispose(); }
});
