import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { validatePartRanges, partAtFace, pickAnatomy, displayedPart } from '../../src/picking.js';

const parts = [{ id: 'left-bone', name: 'left bone', start: 0, count: 6 }, { id: 'right-bone', name: 'right bone', start: 6, count: 6 }];
function target(z = 0, pass = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-2,-1,z, 0,-1,z, 0,1,z, -2,1,z, 0,-1,z, 2,-1,z, 2,1,z, 0,1,z], 3));
  geometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.uniforms = { uClipOn: { value: 0 }, uClip: { value: new THREE.Vector4() }, uToHead: { value: new THREE.Matrix4() }, uOpacity: { value: 1 } };
  const mesh = new THREE.Mesh(geometry, material), group = new THREE.Group(); group.add(mesh);
  const camera = new THREE.OrthographicCamera(-2,2,1,-1,0.1,100); camera.position.z = 10; camera.updateMatrixWorld();
  return { mesh, camera, pass, parts, instance: `test-${pass}-${z}` };
}
const pick = (targets, overrides = {}) => pickAnatomy({ targets, x: 25, y: 50, width: 100, height: 100, mirror: false, solid: false, ...overrides });

describe('triangle identity and source ownership', () => {
  test('every triangle belongs to exactly one contiguous source range', () => {
    expect(() => validatePartRanges({ name: 'test', ni: 12, parts })).not.toThrow();
    expect(partAtFace(parts, 1).id).toBe('left-bone');
    expect(partAtFace(parts, 2).id).toBe('right-bone');
    expect(partAtFace(parts, -1)).toBeNull();
    expect(partAtFace(parts, 4)).toBeNull();
    for (const invalid of [[{ ...parts[0], count: 3 }, parts[1]], [parts[0], { ...parts[1], start: 3 }], [{ ...parts[0], count: 12.5 }], [{ ...parts[0], id: '' }]]) {
      expect(() => validatePartRanges({ name: 'bad', ni: 12, parts: invalid })).toThrow();
    }
  });
  test('mirrored hand identity preserves geometry provenance and uses actual paired identifiers', () => {
    const original = { id: 'R-id', name: 'right scaphoid', side: 'R', pairedId: 'L-id', pairedName: 'left scaphoid', sourceSide: 'R' };
    expect(displayedPart(original, 'L')).toMatchObject({ id: 'L-id', name: 'left scaphoid', side: 'L', sourceId: 'R-id', sourceName: 'right scaphoid', mirrored: true });
    expect(original.id).toBe('R-id');
  });
});

describe('picking rendered surfaces', () => {
  test('adjacent faces return their actual source identity, including display reflection', () => {
    const t = target();
    expect(pick([t])[0].part.id).toBe('left-bone');
    expect(pick([t], { x: 75 })[0].part.id).toBe('right-bone');
    expect(pick([t], { mirror: true })[0].part.id).toBe('right-bone');
    expect(pick([t], { x: 110 })).toEqual([]);
  });
  test('X-ray exposes overlapping identities; Solid respects depth and nonselectable occluders', () => {
    const back = target(0), front = target(2);
    expect(pick([back, front]).map(hit => hit.target)).toEqual([front, back]);
    expect(pick([back, front], { solid: true }).map(hit => hit.target)).toEqual([front]);
    front.parts = [];
    expect(pick([back, front], { solid: true })).toEqual([]);
    expect(pick([back, front]).map(hit => hit.target)).toEqual([back]);
  });
  test('render passes outrank incomparable camera depths', () => {
    const body = target(5, 0), hand = target(0, 2);
    expect(pick([body, hand], { solid: true })[0].target).toBe(hand);
  });
  test('orthographic negative near planes include surfaces in front of the camera origin', () => {
    const t=target(20);
    t.camera.near=-5000;t.camera.far=5000;t.camera.updateProjectionMatrix();
    expect(pick([t])[0]?.part.id).toBe('left-bone');
    t.camera.far=5;t.camera.near=0.1;t.camera.updateProjectionMatrix();
    expect(pick([t])).toEqual([]);
  });
  test('invisible ancestors, disabled opacity, reveal planes and lens exterior cannot be picked', () => {
    const t = target();
    t.mesh.parent.visible = false; expect(pick([t])).toEqual([]); t.mesh.parent.visible = true;
    t.mesh.material.uniforms.uOpacity.value = 0; expect(pick([t])).toEqual([]); t.mesh.material.uniforms.uOpacity.value = 1;
    t.mesh.material.uniforms.uClipOn.value = 1; t.mesh.material.uniforms.uClip.value.set(1,0,0,0);
    expect(pick([t])).toEqual([]); expect(pick([t], { x: 75 })).toHaveLength(1);
    t.mesh.material.uniforms.uClipOn.value = 0;
    expect(pick([t], { lens: { x: 75, y: 50, r: 10 } })).toEqual([]);
    expect(pick([t], { lens: { x: 25, y: 50, r: 10 } })).toHaveLength(1);
  });
  test('shader clipping is evaluated in the shader coordinate frame', () => {
    const t = target(); const u = t.mesh.material.uniforms;
    u.uClipOn.value = 1; u.uClip.value.set(1,0,0,0); u.uToHead.value.makeTranslation(2,0,0);
    expect(pick([t])).toHaveLength(1);
  });
});
