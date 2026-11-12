import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';

const rootRead = (name) => readFileSync(new URL(`../../${name}`, import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateMeshBuffer(meta, data) {
  const spans = [];
  expect(meta.meshes.length).toBeGreaterThan(0);
  const names = new Set();
  for (const mesh of meta.meshes) {
    expect(names.has(mesh.name), mesh.name).toBe(false);
    names.add(mesh.name);
    expect(Number.isInteger(mesh.nv), mesh.name).toBe(true);
    expect(mesh.nv, mesh.name).toBeGreaterThan(0);
    expect(mesh.nv, mesh.name).toBeLessThanOrEqual(65535);
    expect(mesh.ni % 3, mesh.name).toBe(0);
    expect(mesh.offV % 2, mesh.name).toBe(0);
    expect(mesh.offI % 2, mesh.name).toBe(0);
    expect(mesh.min.length).toBe(3);
    expect(mesh.size.length).toBe(3);
    for (const x of [...mesh.min, ...mesh.size]) expect(Number.isFinite(x), mesh.name).toBe(true);
    for (const x of mesh.size) expect(x, mesh.name).toBeGreaterThanOrEqual(0);
    expect(mesh.offV + mesh.nv * 6, mesh.name).toBeLessThanOrEqual(data.byteLength);
    expect(mesh.offI + mesh.ni * 2, mesh.name).toBeLessThanOrEqual(data.byteLength);
    spans.push([mesh.offV, mesh.offV + mesh.nv * 6], [mesh.offI, mesh.offI + mesh.ni * 2]);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < mesh.ni; i++) {
      const index = view.getUint16(mesh.offI + i * 2, true);
      if (index >= mesh.nv) throw new Error(`${mesh.name}: index ${index} exceeds ${mesh.nv}`);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
  expect(spans.at(-1)[1]).toBe(data.byteLength);
}

describe('head binary contract', () => {
  test('head geometry stays inside aligned Uint16 buffers', () => {
    validateMeshBuffer(JSON.parse(rootRead('public/anatomy/head.json')), rootRead('public/anatomy/head.bin'));
  });
});

describe('body binary contract', () => {
  test('all body geometry stays in bounds and under the 6 MB budget', () => {
    const data = rootRead('public/anatomy/body.bin');
    const meta = JSON.parse(rootRead('public/anatomy/body.json'));
    expect(data.length).toBeLessThanOrEqual(6_000_000);
    validateMeshBuffer(meta, data);
    const allNames = meta.meshes.map((m) => m.name).join(' ');
    for (const part of ['torso', 'heart', 'lungs', 'liver', 'stomach', 'intestine', 'kidney', 'humerus', 'forearm', 'femur', 'shin', 'foot']) {
      expect(allNames).toContain(part);
    }
    expect(meta.meshes.some((m) => /cervical|neck/.test(m.name))).toBe(true);
    expect(meta.demoPose).toHaveLength(33);
  });
});

describe('independent body-muscle asset contract', () => {
  test('muscle geometry is valid, checksummed and inside the 6 MB budget', () => {
    const data = rootRead('public/anatomy/muscles.bin');
    const meta = JSON.parse(rootRead('public/anatomy/muscles.json'));
    validateMeshBuffer(meta, data);
    expect(data.length).toBeLessThanOrEqual(6_000_000);
    expect(meta.binaryBytes).toBe(data.length);
    expect(meta.binarySha256).toBe(sha(data));
    expect(meta.demoPose).toHaveLength(33);
    expect(meta.meshes.every((mesh) => mesh.layer === 'bodyMuscles')).toBe(true);
    expect(meta.meshes.some((mesh) => mesh.frame === 'torso')).toBe(true);
    for (const side of ['L', 'R']) {
      expect(meta.meshes.some((mesh) => mesh.side === side && mesh.frame === 'bone'), `${side} articulated muscles`).toBe(true);
    }
    for (const mesh of meta.meshes) {
      expect(['torso', 'bone', 'foot'], mesh.name).toContain(mesh.frame);
      expect(mesh.ni / 3, mesh.name).toBeLessThanOrEqual(mesh.triangleBudget);
      expect(mesh.sourceElements.length, mesh.name).toBeGreaterThan(0);
      expect(mesh.sourceConcepts.length, mesh.name).toBeGreaterThan(0);
      if (mesh.frame !== 'torso') {
        expect(mesh.landmarks.length).toBeGreaterThanOrEqual(2);
        for (const id of mesh.landmarks) expect(Number.isInteger(id) && id >= 0 && id < 33, mesh.name).toBe(true);
      }
    }
  });
  test('muscle labels reference their own frames and include source attribution', () => {
    const meta = JSON.parse(rootRead('public/anatomy/muscles.json'));
    const names = new Set(meta.meshes.map((mesh) => mesh.name));
    expect(meta.labels.length).toBeGreaterThan(0);
    for (const label of meta.labels) {
      expect(label.layer).toBe('bodyMuscles');
      expect(names.has(label.mesh), label.t).toBe(true);
      expect(label.pts.length, label.t).toBeGreaterThan(0);
      for (const point of label.pts) expect(point.length === 3 && point.every(Number.isFinite), label.t).toBe(true);
    }
    expect(JSON.stringify(meta.source)).toMatch(/bodyparts|BP3D/i);
    expect(meta.attribution).toMatch(/DBCLS|Database Center/i);
    expect(meta.license).toBeTruthy();
    expect(meta.licenseUrl).toMatch(/^https?:\/\//);
  });
});

describe('selected joint and connective-tissue asset contract', () => {
  test('independent joint geometry is checksummed and uses the existing body reference frames', () => {
    const data = rootRead('public/anatomy/joints.bin');
    const meta = JSON.parse(rootRead('public/anatomy/joints.json'));
    const body = JSON.parse(rootRead('public/anatomy/body.json'));
    validateMeshBuffer(meta, data);
    expect(data.length).toBeLessThanOrEqual(6_000_000);
    expect(meta.binaryBytes).toBe(data.length);
    expect(meta.binarySha256).toBe(sha(data));
    for (const key of ['demoPose', 'demoAspect', 'referencePoseCm', 'torsoReferencePoseCm']) expect(meta[key], key).toEqual(body[key]);
    const names = new Set(meta.meshes.map((mesh) => mesh.name));
    for (const mesh of meta.meshes) {
      expect(mesh.layer).toBe('joints');
      expect(['torso', 'bone', 'foot']).toContain(mesh.frame);
      expect(mesh.ni / 3, mesh.name).toBeLessThanOrEqual(mesh.triangleBudget);
      expect(mesh.sourceElements.length, mesh.name).toBeGreaterThan(0);
      expect(mesh.sourceConcepts.length, mesh.name).toBeGreaterThan(0);
      if (mesh.frame !== 'torso') for (const id of mesh.landmarks) expect(Number.isInteger(id) && id >= 0 && id < 33).toBe(true);
    }
    expect(meta.labels.length).toBeGreaterThan(0);
    for (const label of meta.labels) {
      expect(label.layer).toBe('joints');
      expect(names.has(label.mesh), label.t).toBe(true);
      for (const point of label.pts) expect(point.length === 3 && point.every(Number.isFinite), label.t).toBe(true);
    }
  });
  test('coverage preserves all 49 distinct source components and explicitly bounds the selected joint scope', () => {
    const meta = JSON.parse(rootRead('public/anatomy/joints.json'));
    const elements = meta.meshes.flatMap((mesh) => mesh.sourceElements);
    expect(elements).toHaveLength(49);
    expect(new Set(elements).size).toBe(elements.length);
    expect([...elements].sort()).toEqual([...meta.source.elementIds].sort());
    expect(meta.source.elementCount).toBe(49);
    expect(meta.coverage.sourceComponents).toBe(49);
    expect(meta.coverage.regionCount).toBe(meta.meshes.length);
    for (const region of ['cervical_discs', 'thoracic_discs', 'lumbar_discs', 'costal_cartilage', 'inguinal_ligament', 'forearm_membrane', 'leg_membrane', 'achilles_tendon', 'plantar_ligament']) {
      expect(meta.coverage.regions).toContain(region);
      expect(meta.meshes.some((mesh) => mesh.region === region)).toBe(true);
    }
    expect(meta.coverage.scope).toMatch(/selected|not complete/i);
    expect(meta.coverage.excluded.join(' ')).toMatch(/menisci.*cruciate|cruciate.*menisci/i);
    expect(meta.license).toBeTruthy();
    expect(meta.licenseUrl).toMatch(/^https?:\/\//);
  });
});

describe('registered spinal cord and optic structure asset contract', () => {
  test('nine valid meshes retain 35 independently identified source components and per-source licenses', () => {
    const data = rootRead('public/anatomy/nerves.bin');
    const meta = JSON.parse(rootRead('public/anatomy/nerves.json'));
    validateMeshBuffer(meta, data);
    expect(data.length).toBeLessThanOrEqual(6_000_000);
    expect(meta.binaryBytes).toBe(data.length);
    expect(meta.binarySha256).toBe(sha(data));
    expect(meta.meshes).toHaveLength(9);
    expect(meta.meshes.filter((mesh) => mesh.frame === 'torso')).toHaveLength(4);
    expect(meta.meshes.filter((mesh) => mesh.frame === 'head')).toHaveLength(5);
    const elements = meta.meshes.flatMap((mesh) => mesh.sourceElements);
    expect(elements).toHaveLength(35);
    expect(new Set(elements).size).toBe(35);
    expect([...elements].sort()).toEqual([...meta.source.elementIds].sort());
    expect(meta.source.elementCount).toBe(35);
    const names = new Set(meta.meshes.map((mesh) => mesh.name));
    for (const mesh of meta.meshes) {
      expect(mesh.layer).toBe('nerves');
      expect(mesh.ni / 3, mesh.name).toBeLessThanOrEqual(mesh.triangleBudget);
      expect(mesh.sourceConcepts.length, mesh.name).toBeGreaterThan(0);
      expect(mesh.license).toBe(mesh.frame === 'head' ? 'CC-BY-SA-2.1-JP' : 'CC-BY-4.0');
    }
    for (const label of meta.labels) {
      expect(label.layer).toBe('nerves');
      expect(names.has(label.mesh), label.t).toBe(true);
      for (const point of label.pts) expect(point.length === 3 && point.every(Number.isFinite), label.t).toBe(true);
    }
  });
  test('decoded cord spans the full registered physical length using all 30 HRA segments, not a short canal alias', () => {
    const data = rootRead('public/anatomy/nerves.bin');
    const meta = JSON.parse(rootRead('public/anatomy/nerves.json'));
    const cord = meta.meshes.filter((mesh) => mesh.frame === 'torso');
    const ids = cord.flatMap((mesh) => mesh.sourceElements);
    expect(ids).toHaveLength(30);
    expect(ids.every((id) => id.startsWith('hra:'))).toBe(true);
    expect(JSON.stringify(cord.flatMap((mesh) => mesh.sourceConcepts))).not.toMatch(/central.?canal/i);
    const source = meta.source.datasets.find((item) => item.name === 'Human Reference Atlas');
    expect(source.sha256).toBe('a7858d88c2237aa7d559c4c1d638923d213d2a9f46c575dea03d6ba67a9975c0');
    expect(source.componentCount).toBe(30);
    expect(meta.registration.cord.sourceLengthCm).toBeGreaterThan(46);
    expect(meta.registration.cord.sourceLengthCm).toBeLessThan(47);
    const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (const mesh of cord) for (let i = 0; i < mesh.nv; i++) {
      const local = [0, 1, 2].map((axis) => mesh.min[axis] + view.getUint16(mesh.offV + i * 6 + axis * 2, true) / 65535 * mesh.size[axis]);
      const point = mesh.sourceFrame.originCm.map((origin, axis) => origin + local.reduce((sum, n, column) => sum + n * mesh.sourceFrame.basisColumnsCm[column][axis], 0));
      for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], point[axis]); bounds[1][axis] = Math.max(bounds[1][axis], point[axis]); }
    }
    const actualLength = bounds[1][1] - bounds[0][1];
    expect(actualLength).toBeGreaterThan(40);
    expect(actualLength).toBeLessThan(43);
    expect(Math.abs(actualLength - meta.registration.cord.targetLengthCm)).toBeLessThan(0.01);
    for (let side = 0; side < 2; side++) for (let axis = 0; axis < 3; axis++) expect(Math.abs(bounds[side][axis] - meta.registration.cord.targetBoundsCm[side][axis])).toBeLessThan(0.01);
    expect(meta.registration.cord.sectionChecks.length).toBeGreaterThanOrEqual(19);
    for (const section of meta.registration.cord.sectionChecks) {
      expect(section.insideCount, section.vertebra).toBe(section.pointCount);
      expect(section.minimumClearanceCm, section.vertebra).toBeGreaterThan(0);
    }
  });
  test('optical structures use canonical head coordinates and disclose bounded nervous-system coverage', () => {
    const meta = JSON.parse(rootRead('public/anatomy/nerves.json'));
    const registration = meta.registration.head;
    expect(registration.targetHeadBinarySha256).toBe(sha(rootRead('public/anatomy/head.bin')));
    expect(registration.targetHeadMetadataSha256).toBe(sha(rootRead('public/anatomy/head.json')));
    expect(registration.scale).toBeGreaterThan(0.8);
    expect(registration.scale).toBeLessThan(1.2);
    for (const part of ['eyes', 'cerebrum', 'hindbrain']) {
      expect(registration.fitMetricsCm[part].p95, part).toBeLessThan(0.3);
      expect(registration.fitMetricsCm[part].rms, part).toBeLessThan(0.2);
    }
    const head = meta.meshes.filter((mesh) => mesh.frame === 'head');
    for (const mesh of head) expect(mesh.sourceFrame).toEqual({ originCm: [0, 0, 0], basisColumnsCm: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    expect(head.find((mesh) => mesh.name === 'optic_nerve_L').min[0]).toBeGreaterThan(0);
    const right = head.find((mesh) => mesh.name === 'optic_nerve_R');
    expect(right.min[0] + right.size[0]).toBeLessThan(0);
    expect(meta.coverage.cordSegments).toBe(30);
    expect(meta.coverage.opticComponents).toBe(5);
    expect(meta.coverage.excluded.join(' ')).toMatch(/peripheral.*cauda equina.*auditory/i);
  });
});
