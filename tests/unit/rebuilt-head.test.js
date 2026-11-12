import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test, expect } from 'vitest';

const read = name => readFileSync(new URL(`../../public/anatomy/${name}`, import.meta.url));
const meta = JSON.parse(read('head.json'));

test('head reconstruction pins independent public sources and reports the unchanged registration gate', () => {
  expect(meta.source.canonicalFace.commit).toBe('c85dfbc2506b65ebc9a76340dc1234513b18c215');
  expect(meta.source.canonicalFace.sha256).toBe('8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618');
  expect(meta.binarySha256).toBe(createHash('sha256').update(read('head.bin')).digest('hex'));
  const gate = meta.registration.frontalSurface;
  expect(gate.uncoveredRayCount).toBe(0);
  expect(gate.rmsCm).toBeLessThan(.35);
  expect(gate.p95Cm).toBeLessThan(.7);
  expect(Object.keys(meta.fit)).toHaveLength(14);
  for (const point of Object.values(meta.fit)) expect(point).toHaveLength(3);
  for (const name of ['eyes', 'cerebrum', 'hindbrain', 'muscles', 'cranium', 'jaw', 'skin']) {
    expect(meta.meshes.find(mesh => mesh.name === name).sourceElements.length, name).toBeGreaterThan(0);
  }
});
