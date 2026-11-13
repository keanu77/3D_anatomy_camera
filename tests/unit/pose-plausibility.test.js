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
  test('the depth of an imagined figure is noise and cannot lengthen its arm', () => {
    // Recorded on CI (876 x 465 stage, official hands close-up): shoulders, elbows and wrists as x, y, z, visibility.
    // The left forearm is 90 px long in the picture; the depth the model gave its two ends differs by 204 px.
    const recorded = Array.from({ length: 33 }, () => ({ x: 0.3, y: 0.5, z: 0.5, visibility: 0.9, presence: 0.9 }));
    [[0.1897, 0.4689, 0.5251, 0.9998], [0.3336, 0.3471, 0.5574, 0.9997], [0.2043, 0.6648, 0.571, 0.8569],
      [0.4131, 0.4126, 0.6072, 0.7017], [0.2393, 0.8476, 0.804, 0.7243], [0.396, 0.51, 0.7346, 0.4148]]
      .forEach(([x, y, z, visibility], index) => { recorded[11 + index] = { x, y, z, visibility, presence: visibility }; });
    const tracked = [[[0.8085, 0.9427, 0], [0.7356, 0.0683, -0.1101]], [[0.1913, 0.0737, 0], [0.2596, 0.9503, -0.1112]]].map(([wrist, tip]) => {
      const landmarks = Array.from({ length: 21 }, () => ({ x: wrist[0], y: wrist[1], z: wrist[2] }));
      landmarks[12] = { x: tip[0], y: tip[1], z: tip[2] };
      return landmarks;
    });
    expect(poseContradictsHands(recorded, tracked, width, height)).toBe(true);
  });
  test('a hand pointing at the camera is still measured by its real length', () => {
    // 100 px long in the picture and 413 px deep: the hand is as large as before, only turned.
    const turned = hand([200, 440], 100); turned[12].z = -413 / width;
    expect(poseContradictsHands(phantom, [turned], width, height)).toBe(true);
    expect(poseContradictsHands(person, [turned], width, height)).toBe(false);
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
async function bodyRenderer() {
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(url.endsWith('.json') ? JSON.stringify(meta) : new ArrayBuffer(0))));
  const renderer = createBodyRenderer({ settings: { ...DEFAULTS, arms: true }, state: { mirror: true }, getSize: () => ({ width, height }),
    makeMaterial: material, asset: (path) => path, decodeGeometry: (data) => Object.fromEntries(data.meshes.map((entry) => {
      const geometry = new THREE.BufferGeometry(); geometry.name = entry.name; return [entry.name, geometry];
    })) });
  expect(await renderer.ensureLoaded()).toBe(true);
  return renderer;
}
const closeUp = { landmarks: [hand([200, 440], 425), hand([680, 440], 425)] }, noHands = { landmarks: [] };
const ownHand = { landmarks: [hand([560, 660], 154)] };
const imagined = { landmarks: [phantom] }, real = { landmarks: [person] };

test('a pose the tracked hands contradict is not drawn, and stays refused when the hand tracker misses a frame', async () => {
  const renderer = await bodyRenderer();
  try {
    renderer.update({ now: 100, pose: imagined, hands: closeUp, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ visibleParts: 0, poseFound: false, poseRejected: true });
    // A hand held close is the hardest for its own tracker: one missed result must not draw the figure.
    renderer.update({ now: 166, pose: imagined, hands: noHands, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ visibleParts: 0, poseRejected: true });
    renderer.update({ now: 232, pose: imagined, hands: closeUp, instant: true });
    // The doubt lasts a second from the last contradiction, not from the first.
    renderer.update({ now: 1150, pose: imagined, hands: noHands, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ visibleParts: 0, poseRejected: true });
    // With nothing contradicting it for a second, a pose is drawn again.
    renderer.update({ now: 1300, pose: real, hands: ownHand, instant: true });
    expect(renderer.getDiagnostics().poseRejected).toBe(false);
    expect(renderer.getDiagnostics().visibleParts).toBeGreaterThan(0);
  } finally { renderer.dispose(); }
});
test('a person who was never doubted is drawn at once, with or without hands', async () => {
  const renderer = await bodyRenderer();
  try {
    renderer.update({ now: 100, pose: real, hands: noHands, instant: true });
    expect(renderer.getDiagnostics().visibleParts).toBeGreaterThan(0);
    renderer.update({ now: 166, pose: real, hands: ownHand, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ poseRejected: false, poseFound: true });
  } finally { renderer.dispose(); }
});
test('a frozen picture keeps the verdict of its own frame however long it is shown', async () => {
  const renderer = await bodyRenderer();
  try {
    renderer.update({ now: 100, pose: imagined, hands: closeUp, instant: true });
    renderer.update({ now: 166, pose: imagined, hands: noHands, settle: true, instant: true });
    for (const later of [400, 2000, 60000]) {
      renderer.update({ now: later, pose: imagined, hands: noHands, hold: true, instant: true });
      expect(renderer.getDiagnostics(), `redrawn at ${later}`).toMatchObject({ visibleParts: 0, poseRejected: true });
    }
    // Starting again clears the doubt with everything else.
    renderer.reset();
    renderer.update({ now: 60100, pose: real, hands: noHands, instant: true });
    expect(renderer.getDiagnostics().visibleParts).toBeGreaterThan(0);
  } finally { renderer.dispose(); }
});
