import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { layoutOverview } from '../../src/label-layout.js';
import { landmarkToPoint, torsoBasis, boneBasis, footBasis, transformPoint } from '../../src/basis.js';

const metadata = ['body', 'muscles', 'joints', 'nerves'].map((name) => JSON.parse(readFileSync(new URL(`../../public/anatomy/${name}.json`, import.meta.url))));
const measure = (text) => [...text].length * 6;
function assertReadable(entries, width, height) {
  for (const entry of entries) {
    const box = entry.bounds;
    expect([box.x, box.y, box.width, box.height].every(Number.isFinite), entry.text).toBe(true);
    expect(box.x, entry.text).toBeGreaterThanOrEqual(0);
    expect(box.y, entry.text).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, entry.text).toBeLessThanOrEqual(width);
    expect(box.y + box.height, entry.text).toBeLessThanOrEqual(height);
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i].bounds, b = entries[j].bounds;
    const intersect = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(intersect, `${entries[i].text} intersects ${entries[j].text}`).toBe(false);
  }
}
function actualProjectedLabels(width, height) {
  const result = [];
  for (const meta of metadata) {
    const scale = meta.demoAspect / (width / height);
    const points = meta.demoPose.map((p) => landmarkToPoint({ ...p, x: 0.5 + (p.x - 0.5) * scale, z: p.z * scale }, width, height));
    const torso = torsoBasis(points);
    for (const label of meta.labels) {
      const mesh = meta.meshes.find((item) => item.name === label.mesh);
      // Cranial optics use the separate perspective face transform, exercised
      // in the actual-model portrait browser test rather than this torso projection.
      if (mesh.frame === 'head') continue;
      const ids = mesh.landmarks;
      const matrix = mesh.frame === 'torso' ? torso : mesh.frame === 'foot' ? footBasis(...ids.map((id) => points[id])) : boneBasis(points[ids[0]], points[ids[1]], [torso[8], torso[9], torso[10]]);
      const p = transformPoint(matrix, label.pts[0]);
      const ax = width - p[0], ay = height - p[1];
      if (ax >= 0 && ax <= width && ay >= 0 && ay <= height) result.push({ text: label.t, ax, ay, color: '#ffffff' });
    }
  }
  return result;
}

describe('combined system label layout', () => {
  test.each([[640, 480], [390, 693], [760, 160]])('actual atlas labels fit without collisions at %i by %i', (width, height) => {
    const items = actualProjectedLabels(width, height), original = structuredClone(items);
    expect(items.length).toBeGreaterThan(20);
    const layout = layoutOverview(items, width, height, measure);
    expect(layout.length).toBeGreaterThan(0);
    assertReadable(layout, width, height);
    expect(items).toEqual(original);
  });
  test('retains bounded labels when many anchors crowd one edge and another anchor is at the opposite edge', () => {
    const width = 390, height = 160;
    const items = Array.from({ length: 60 }, (_, i) => ({ key: i, text: `Anatomical structure ${i}`, ax: i % 2 ? 50 : 340, ay: i < 2 ? 0 : 155 }));
    const layout = layoutOverview(items, width, height, measure);
    expect(new Set(layout.map((item) => item.key)).size).toBe(layout.length);
    assertReadable(layout, width, height);
  });
  test('long anatomical names stay within their columns and remain visibly truncated', () => {
    const items = [{ text: 'Very long anatomical structure including ligament and tendon', ax: 50, ay: 100 }, { text: 'Right thoracolumbar intervertebral joint connective tissue', ax: 250, ay: 100 }];
    const layout = layoutOverview(items, 320, 200, measure);
    expect(layout).toHaveLength(2);
    for (const entry of layout) expect(entry.text.endsWith('…')).toBe(true);
    assertReadable(layout, 320, 200);
  });
});
