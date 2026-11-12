import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test, expect } from 'vitest';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = JSON.parse(read('tests/fixtures/rebuild-immutable.json'));

test('independent rebuild preserves approved Chinese terms and body assets byte for byte', () => {
  for (const [path, hash] of Object.entries(baseline.files)) {
    expect(digest(read(path)), path).toBe(hash);
  }
});

test('non-head/hand nerves preserve quantized geometry and its coordinate bounds', () => {
  for (const [bundle, expected] of Object.entries(baseline.meshes)) {
    const meta = JSON.parse(read(`public/anatomy/${bundle}.json`));
    const bytes = read(`public/anatomy/${bundle}.bin`);
    const retained = meta.meshes.filter(mesh => !['head', 'hand'].includes(mesh.frame));
    expect(retained.map(mesh => mesh.name).sort()).toEqual(expected.map(mesh => mesh.name).sort());
    for (const old of expected) {
      const mesh = retained.find(item => item.name === old.name);
      for (const key of ['frame', 'nv', 'ni', 'min', 'size']) expect(mesh[key], `${bundle}/${old.name}/${key}`).toEqual(old[key]);
      expect(digest(bytes.subarray(mesh.offV, mesh.offV + mesh.nv * 6)), old.name).toBe(old.vertexBytesSHA256);
      expect(digest(bytes.subarray(mesh.offI, mesh.offI + mesh.ni * 2)), old.name).toBe(old.indexBytesSHA256);
    }
  }
});
