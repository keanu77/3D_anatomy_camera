import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import * as THREE from 'three';
const mock = vi.hoisted(() => ({ callbacks: null, ui: null }));
vi.mock('../../src/inspection-ui.js', () => ({ createInspectionUI: callbacks => {
  mock.callbacks = callbacks;
  return mock.ui = Object.fromEntries(['setActive','setLoading','showSelection','setError','refreshInfo','dispose'].map(name => [name, vi.fn()]));
} }));
import { createInspection } from '../../src/inspection.js';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const descriptor = (bundle, parent) => ({ name: parent, parent, bundle, ni: 3,
  parts: [{ id: `${bundle}-source`, name: 'left exact bone', kind: 'bone', side: 'L', start: 0, count: 3 }] });
function fixture(both = false) {
  const stage = new EventTarget(); stage.classList = { toggle: vi.fn() }; stage.removeAttribute = vi.fn();
  stage.closest=()=>null;stage.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
  const originals = [], created = [], parent = new THREE.Group();
  const targets = (both ? ['head','body'] : ['body']).map(bundle => {
    const geometry = new THREE.BufferGeometry(); geometry.setIndex([0,1,2]); originals.push(geometry);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); parent.add(mesh);
    return { mesh, bundle, parent: `${bundle}-mesh`, instance: bundle, inspectable: true };
  });
  const decode = vi.fn(meta => Object.fromEntries(meta.meshes.map(entry => {
    const geometry = new THREE.BufferGeometry(); geometry.setIndex([0,1,2]); vi.spyOn(geometry, 'dispose'); created.push(geometry);
    return [entry.name, geometry];
  })));
  const app = createInspection({ stage, getTargets: () => targets, getView: () => ({ width: 100, height: 100 }),
    decodeGeometry: decode, asset: path => path, redraw: vi.fn() });
  return { app, stage, targets, originals, created, decode, ui: mock.ui, callbacks: mock.callbacks };
}
function response(path, override) {
  const bundle = path.includes('individual-head') ? 'head' : 'body';
  return { ok: true, json: async () => override || { schemaVersion: 1, meshes: [descriptor(bundle, `${bundle}-mesh`)] }, arrayBuffer: async () => new ArrayBuffer(6) };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(async path => response(path))));
afterEach(() => vi.unstubAllGlobals());

test('inspection is lazy, swaps exact geometry and restores originals without redownloading', async () => {
  const f = fixture(); expect(fetch).not.toHaveBeenCalled();
  await f.callbacks.onEnable(true);
  expect(fetch).toHaveBeenCalledTimes(2); expect(f.targets[0].mesh.geometry).toBe(f.created[0]);
  await f.callbacks.onEnable(false); expect(f.targets[0].mesh.geometry).toBe(f.originals[0]);
  await f.callbacks.onEnable(true); expect(fetch).toHaveBeenCalledTimes(2);
  f.app.dispose(); expect(f.targets[0].mesh.geometry).toBe(f.originals[0]); expect(f.created[0].dispose).toHaveBeenCalledOnce();
});

test('late data after cancellation cannot install geometry or overwrite a newer generation', async () => {
  const gate = deferred(); fetch.mockImplementationOnce(async path => { await gate.promise; return response(path); });
  const f = fixture(), old = f.callbacks.onEnable(true);
  await f.callbacks.onEnable(false); await f.callbacks.onEnable(true);
  const current = f.targets[0].mesh.geometry;
  gate.resolve(); await old;
  expect(f.targets[0].mesh.geometry).toBe(current); expect(f.decode).toHaveBeenCalledOnce();
  expect(f.app.getDiagnostics().active).toBe(true); f.app.dispose();
});

test('a failed bundle remains visible as an error when a concurrent successful bundle finishes', async () => {
  const gate = deferred();
  fetch.mockImplementation(async path => {
    if (path.includes('individual-head')) return { ok: false };
    await gate.promise; return response(path);
  });
  const f = fixture(true), loading = f.callbacks.onEnable(true);
  await vi.waitFor(() => expect(f.ui.setError).toHaveBeenCalledWith(expect.stringContaining('下載失敗')));
  gate.resolve(); await loading;
  expect(f.ui.setError).toHaveBeenLastCalledWith(expect.stringContaining('下載失敗'));
  expect(f.ui.setLoading).toHaveBeenLastCalledWith(false);
  fetch.mockImplementation(async path => response(path)); await f.callbacks.onEnable(true);
  expect(f.app.getDiagnostics().loaded.sort()).toEqual(['body','head']);
  expect(f.ui.setError).toHaveBeenLastCalledWith(''); f.app.dispose();
});

test('malformed source ranges fail before decoding or swapping any geometry', async () => {
  fetch.mockImplementation(async path => response(path, { schemaVersion: 1, meshes: [{ ...descriptor('body','body-mesh'), ni: 6 }] }));
  const f = fixture(); await f.callbacks.onEnable(true);
  expect(f.decode).not.toHaveBeenCalled(); expect(f.targets[0].mesh.geometry).toBe(f.originals[0]);
  expect(f.ui.setError).toHaveBeenLastCalledWith(expect.stringContaining('Incomplete source coverage'));
  f.app.dispose();
});

test('disposing while loading ignores all late results and terminates the UI lifecycle', async () => {
  const gate = deferred(); fetch.mockImplementation(async path => { await gate.promise; return response(path); });
  const f = fixture(), loading = f.callbacks.onEnable(true); f.app.dispose(); gate.resolve(); await loading;
  expect(f.decode).not.toHaveBeenCalled(); expect(f.ui.dispose).toHaveBeenCalledOnce();
  expect(f.targets[0].mesh.geometry).toBe(f.originals[0]);
});

test('clearing a pointer selection while its data loads invalidates the pending pick', async () => {
  const gate=deferred();fetch.mockImplementation(async path=>{await gate.promise;return response(path);});
  const f=fixture(),loading=f.callbacks.onEnable(true);
  for(const type of ['pointerdown','pointerup']) {
    const event=new Event(type);Object.assign(event,{button:0,pointerId:1,clientX:50,clientY:50});f.stage.dispatchEvent(event);
  }
  f.callbacks.onClear();gate.resolve();await loading;
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(f.app.getDiagnostics().selected).toBeNull();
  expect(f.ui.showSelection.mock.calls.every(([value])=>value===null)).toBe(true);
  f.app.dispose();
});
