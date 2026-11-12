import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { decodeGeometry } from '../../src/scene.js';

const read = (name) => readFileSync(new URL(`../../public/anatomy/${name}`, import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = read('individual-body.bin');
const metadataBytes = read('individual-body.json');
const meta = JSON.parse(metadataBytes);
const companions = { body: JSON.parse(read('body.json')), muscles: JSON.parse(read('muscles.json')) };
const allParts = meta.meshes.flatMap((mesh) => mesh.parts);

describe('exact individual skeletal and muscle source geometry', () => {
  test('is independently checksummed, smaller than 3 MB and tied to unchanged companion assets', () => {
    expect(meta.schemaVersion).toBe(1);
    expect(meta.binaryBytes).toBe(bytes.length);
    expect(meta.binarySha256).toBe(sha(bytes));
    expect(bytes.length + metadataBytes.length).toBeLessThanOrEqual(3_000_000);
    // The immutable body metadata records historical head/neural hashes as well.
    // Those bundles are independently rebuilt; only body-frame companions remain
    // dependencies here. rebuild-immutable.test.js pins the entire body metadata.
    for (const [name, digest] of Object.entries(meta.companionAssets)) {
      if (/^(body|muscles|joints)\./.test(name)) expect(sha(read(name)), name).toBe(digest);
    }
    expect(meta.license).toBe('CC-BY-SA-2.1-JP');
    expect(meta.source.downloads).toHaveLength(3);
    expect(meta.source.downloads.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });

  test('preserves every selected original parent frame and every source element exactly once', () => {
    const expected = Object.entries(companions).flatMap(([bundle, companion]) => companion.meshes
      .filter((mesh) => bundle === 'muscles' || ['spine', 'arms', 'legs'].includes(mesh.layer))
      .map((mesh) => ({ bundle, mesh })));
    expect(meta.meshes).toHaveLength(expected.length);
    expect(meta.meshes).toHaveLength(36);
    const names = new Set();
    for (const mesh of meta.meshes) {
      const parent = expected.find((item) => item.bundle === mesh.bundle && item.mesh.name === mesh.parent)?.mesh;
      expect(parent, mesh.name).toBeTruthy();
      expect(mesh.name).toBe(mesh.parent);
      expect(names.has(mesh.name)).toBe(false);
      names.add(mesh.name);
      for (const field of ['frame', 'landmarks', 'side', 'cervical', 'layer', 'sourceFrame']) expect(mesh[field], `${mesh.name}.${field}`).toEqual(parent[field]);
      expect(mesh.parts.map((part) => part.id).sort(), mesh.name).toEqual([...parent.sourceElements].sort());
      expect(mesh.ni / 3).toBeLessThanOrEqual(parent.triangleBudget);
      if (mesh.bundle === 'muscles') for (const part of mesh.parts) {
        expect(part.name).toBe(parent.sourceConcepts.find((concept) => concept.id === part.id).name);
      }
    }
    expect(allParts.filter((part) => part.kind === 'bone')).toHaveLength(122);
    expect(allParts.filter((part) => part.kind === 'muscle')).toHaveLength(276);
    expect(new Set(allParts.map((part) => part.id)).size).toBe(398);
    expect(allParts.map((part) => part.id).sort()).toEqual(meta.source.elementIds);
  });

  test('assigns every triangle to an exclusive source vertex range with no gaps, overlap or cross-source welding', () => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let byteCursor = 0;
    for (const mesh of meta.meshes) {
      expect(mesh.offV).toBe(byteCursor);
      expect(mesh.offI).toBe(mesh.offV + mesh.nv * 6);
      let indexCursor = 0, vertexCursor = 0;
      for (const part of mesh.parts) {
        expect(part.start, part.id).toBe(indexCursor);
        expect(part.start % 3, part.id).toBe(0);
        expect(part.count % 3, part.id).toBe(0);
        expect(part.count, part.id).toBeGreaterThan(0);
        expect(part.count / 3, part.id).toBeLessThanOrEqual(part.triangleBudget);
        expect(part.firstVertex, part.id).toBe(vertexCursor);
        expect(part.vertexCount, part.id).toBeGreaterThan(2);
        for (let i = part.start; i < part.start + part.count; i++) {
          const index = view.getUint16(mesh.offI + i * 2, true);
          if (index < part.firstVertex || index >= part.firstVertex + part.vertexCount) {
            throw new Error(`${part.id} triangle uses another source element's vertex`);
          }
        }
        indexCursor += part.count;
        vertexCursor += part.vertexCount;
      }
      expect(indexCursor).toBe(mesh.ni);
      expect(vertexCursor).toBe(mesh.nv);
      byteCursor = mesh.offI + mesh.ni * 2;
    }
    expect(byteCursor).toBe(bytes.length);
  });

  test('uses the real runtime decoder and produces finite positions and surface normals', () => {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const geometries = decodeGeometry(meta, buffer);
    expect(Object.keys(geometries)).toHaveLength(36);
    for (const mesh of meta.meshes) {
      const geometry = geometries[mesh.name];
      expect(geometry.index.count).toBe(mesh.ni);
      expect(geometry.attributes.position.count).toBe(mesh.nv);
      expect(geometry.attributes.normal.count).toBe(mesh.nv);
      expect(geometry.attributes.position.array.every((value) => Number.isFinite(value) && Math.abs(value) < 10), mesh.name).toBe(true);
      expect(geometry.attributes.normal.array.every(Number.isFinite), mesh.name).toBe(true);
      geometry.dispose();
    }
  });

  test('keeps exact source heads and explicitly marks indivisible source aggregates', () => {
    const byId = new Map(allParts.map((part) => [part.id, part]));
    expect(byId.get('FMA37685').name).toBe('short head of left biceps brachii');
    expect(byId.get('FMA37685').wholeMuscleName).toBe('biceps brachii');
    expect(byId.get('FMA37685').wholeMuscleId).toBe('FMA37670');
    expect(byId.get('FMA37685').wholeMuscleSide).toBe('L');
    expect(byId.get('FMA37685').identityScope).toBe('muscle-part');
    for (const id of ['BP44', 'BP45', 'BP46', 'BP47']) {
      expect(byId.get(id).identityScope).toBe('muscle-part');
      expect(byId.get(id).wholeMuscleId).toBeUndefined();
    }
    const aggregates = allParts.filter((part) => part.identityScope === 'source-aggregate');
    expect(aggregates.map((part) => part.id).sort()).toEqual(['FMA74140', 'FMA74141']);
    expect(aggregates.map((part) => part.name).sort()).toEqual(['set of dorsal interossei of left foot', 'set of dorsal interossei of right foot']);
    expect(aggregates.every((part) => !part.wholeMuscleId)).toBe(true);
    for (const part of allParts) {
      const expectedSide = part.name.split(' ').includes('left') ? 'L' : part.name.split(' ').includes('right') ? 'R' : null;
      expect(part.side, part.id).toBe(expectedSide);
    }
  });
});
