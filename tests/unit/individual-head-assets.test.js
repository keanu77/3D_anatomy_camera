import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { decodeGeometry } from '../../src/scene.js';

const read = (name) => readFileSync(new URL(`../../public/anatomy/${name}`, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = read('individual-head.bin');
const metadata = read('individual-head.json');
const meta = JSON.parse(metadata);
const original = JSON.parse(read('head.json'));
const allParts = meta.meshes.flatMap((mesh) => mesh.parts);

describe('source-identified head and hand surfaces', () => {
  test('pins sources and immutable registration targets within the additive size budget', () => {
    expect(meta.schemaVersion).toBe(1);
    expect(meta.binaryBytes).toBe(bytes.length);
    expect(meta.binarySha256).toBe(hash(bytes));
    expect(bytes.length + metadata.length).toBeLessThan(2_000_000);
    expect(meta.license).toBe('CC-BY-SA-2.1-JP');
    expect(meta.source.downloads).toHaveLength(3);
    for (const [name, digest] of Object.entries(meta.registration.targetHashes)) expect(hash(read(name)), name).toBe(digest);
    expect(original.source.canonicalFace.sha256).toBe('8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618');
  });

  test('covers the exact muscles, skull bones, teeth, gingiva and palm bones without identity aliases', () => {
    expect(meta.meshes.map((mesh) => mesh.parent)).toEqual(['muscles', 'cranium', 'jaw', 'hand_palm']);
    expect(allParts).toHaveLength(114);
    expect(new Set(allParts.map((part) => part.id)).size).toBe(114);
    expect(allParts.map((part) => part.id).sort()).toEqual(meta.source.elementIds);
    expect(allParts.filter((part) => part.kind === 'bone')).toHaveLength(34);
    expect(allParts.filter((part) => part.kind === 'muscle')).toHaveLength(49);
    expect(allParts.filter((part) => part.kind === 'tooth')).toHaveLength(28);
    expect(allParts.filter((part) => part.kind === 'gingiva')).toHaveLength(2);
    expect(allParts.find((part) => part.id === 'FMA46768')).toMatchObject({ name: 'aponeurosis of epicranius', kind: 'aponeurosis' });
    expect(allParts.find((part) => part.id === 'FMA49005').name).toBe('deep part of left masseter');
    expect(allParts.find((part) => part.id === 'FMA49025').name).toBe('upper head of left lateral pterygoid');
    expect(allParts.find((part) => part.id === 'FMA46783').name).toBe('orbital part of left orbicularis oculi');
    expect(allParts.find((part) => part.id === 'FMA46786').name).toBe('palpebral part of left orbicularis oculi');
  });

  test('assigns every triangle to one exclusive source vertex range without inter-source welding', () => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let byteCursor = 0;
    for (const mesh of meta.meshes) {
      expect(mesh.name).toBe(mesh.parent);
      expect(mesh.bundle).toBe('head');
      expect(mesh.nv).toBeLessThanOrEqual(65535);
      expect(mesh.offV).toBe(byteCursor);
      expect(mesh.offI).toBe(mesh.offV + mesh.nv * 6);
      let indexCursor = 0, vertexCursor = 0;
      for (const part of mesh.parts) {
        expect(part.start, part.id).toBe(indexCursor);
        expect(part.start % 3).toBe(0);
        expect(part.count % 3).toBe(0);
        expect(part.count).toBeGreaterThan(0);
        expect(part.vertexStart, part.id).toBe(vertexCursor);
        expect(part.retainedTriangleFraction).toBeGreaterThan(0);
        expect(part.retainedTriangleFraction).toBeLessThanOrEqual(1);
        for (let index = part.start; index < part.start + part.count; index++) {
          const vertex = view.getUint16(mesh.offI + index * 2, true);
          if (vertex < part.vertexStart || vertex >= part.vertexStart + part.vertexCount) throw new Error(`${part.id} references another source part`);
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

  test('retains every existing individual finger mesh and identifies the thumb metacarpal correctly', () => {
    expect(meta.existingParts).toHaveLength(15);
    const ids = new Set(allParts.map((part) => part.id));
    for (const entry of meta.existingParts) {
      const source = original.meshes.find((mesh) => mesh.name === entry.parent);
      expect(source).toBeTruthy();
      expect(entry.parts).toHaveLength(1);
      const part = entry.parts[0];
      expect(part.start).toBe(0);
      expect(part.count).toBe(source.ni);
      expect(part.kind).toBe('bone');
      expect(ids.has(part.id)).toBe(false);
      ids.add(part.id);
      expect(part.registrationMetrics.rms).toBeLessThan(.04);
      expect(part.registrationMetrics.p95).toBeLessThan(.07);
    }
    const thumb = meta.existingParts.find((part) => part.parent === 'hand_b_1_2').parts[0];
    expect(thumb.name).toBe('right first metacarpal bone');
    expect(thumb.id).toBe('FMA24464');
    expect(meta.meshes.find((mesh) => mesh.parent === 'hand_palm').parts.some((part) => /first metacarpal/.test(part.name))).toBe(false);
    expect(ids.size).toBe(129);
  });

  test('discloses right-source reflection and measured registration rather than claiming left-source geometry', () => {
    const hand = [...meta.meshes.find((mesh) => mesh.parent === 'hand_palm').parts, ...meta.existingParts.flatMap((entry) => entry.parts)];
    for (const part of hand) {
      expect(part.side).toBe('R');
      expect(part.sourceSide).toBe('R');
      expect(part.mirroredForLeft).toBe(true);
      expect(part.pairedId).not.toBe(part.id);
      expect(part.pairedName).toBe(part.name.replace('right', 'left'));
    }
    for (const [parent, metrics] of Object.entries(meta.registration.metrics)) {
      expect(metrics.sourceToOriginal.rms).toBeLessThan(parent === 'hand_palm' ? .02 : .2);
      expect(metrics.originalToSource.p95).toBeLessThan(parent === 'hand_palm' ? .05 : .4);
    }
    expect(meta.registration.hand.units).toBe('normalized hand rig units');
    expect(meta.registration.head.units).toBe('cm');
    expect(meta.limitations.join(' ')).toMatch(/not clinical accuracy/);
  });

  test('decodes with the production Uint16 loader into finite mesh positions and normals', () => {
    const geometries = decodeGeometry(meta, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    for (const mesh of meta.meshes) {
      const geometry = geometries[mesh.name];
      expect(geometry.index.count).toBe(mesh.ni);
      expect(geometry.attributes.position.count).toBe(mesh.nv);
      expect(geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
      expect(geometry.attributes.normal.array.every(Number.isFinite)).toBe(true);
      expect(mesh.maxQuantizationError).toBeLessThan(mesh.parent === 'hand_palm' ? .00003 : .0004);
      geometry.dispose();
    }
  });
});
