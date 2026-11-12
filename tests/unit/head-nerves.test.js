import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { createBodyRenderer } from '../../src/body.js';
import { DEFAULTS } from '../../src/settings.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/nerves.json', import.meta.url)));
afterEach(() => vi.unstubAllGlobals());

test('five optical structures follow a tracked head while absent Pose keeps all cord regions hidden', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(url.endsWith('.json') ? JSON.stringify(meta) : new ArrayBuffer(0))));
  const group = new THREE.Group(), head = { found: true }, clipState = { on: 0, x: 1, y: 0, w: 0 };
  const settings = { ...DEFAULTS, skull: false, brain: false, muscles: false, eyes: false, outline: false, hands: false, nerves: true };
  const renderer = createBodyRenderer({ settings, state: { mirror: true }, getSize: () => ({ width: 640, height: 480 }),
    getHeadContext: () => ({ group, head, clipState, camera: new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000) }), asset: (path) => path,
    decodeGeometry: (data) => Object.fromEntries(data.meshes.map((entry) => [entry.name, new THREE.BufferGeometry()])),
    makeMaterial: () => {
      const uniforms = Object.fromEntries(['uBase', 'uOrtho', 'uMode', 'uGain', 'uOpacity', 'uFeather', 'uClipOn', 'uCutSoft'].map((key) => [key, { value: 0 }]));
      uniforms.uToHead = { value: new THREE.Matrix4() }; uniforms.uClip = { value: new THREE.Vector4() };
      return new THREE.ShaderMaterial({ uniforms });
    } });
  try {
    expect(await renderer.ensureLoaded()).toBe(true);
    renderer.update({ now: 16, pose: null, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ nerveHeadVisible: 5, nerveBodyVisible: 0, poseFound: false, visibleLayers: { nerves: 5 } });
    expect(group.children).toHaveLength(5);
    expect(renderer.scene.children).toHaveLength(1);
    expect(renderer.scene.children[0].children).toHaveLength(4);
    group.position.set(12, 23, -100); group.rotation.y = Math.PI / 4; group.updateMatrixWorld(true);
    for (const mesh of group.children) {
      expect(mesh.visible).toBe(true);
      expect(mesh.material.uniforms.uOrtho.value).toBe(0);
      expect(mesh.matrixWorld.elements).toEqual(group.matrixWorld.elements);
    }
    Object.assign(clipState, { on: 1, x: -1, y: 0, w: 2 }); renderer.syncHead();
    for (const mesh of group.children) {
      expect(mesh.material.uniforms.uClipOn.value).toBe(1);
      expect(mesh.material.uniforms.uClip.value.toArray()).toEqual([-1, 0, 0, 2]);
    }
    head.found = false;
    renderer.update({ now: 200, pose: null, instant: true });
    expect(renderer.getDiagnostics()).toMatchObject({ nerveHeadVisible: 0, nerveBodyVisible: 0, poseFound: false });
    expect(group.children.every((mesh) => !mesh.visible)).toBe(true);
  } finally { renderer.dispose(); }
});
