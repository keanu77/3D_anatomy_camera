import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { palmBasis, fingerBasis, matrixFromBasis } from '../../src/hand-frame.js';

const head = JSON.parse(readFileSync(new URL('../../public/anatomy/head.json', import.meta.url)));
const close = (actual, expected) => actual.flat().forEach((value, index) => expect(Math.abs(value - expected.flat()[index])).toBeLessThan(1e-8));
const difference = (a, b) => a.map((value, i) => value - b[i]);

test('runtime palm and all 15 finger axes agree with the Python build specification', () => {
  const p = head.handReference;
  close(palmBasis(p), head.handFrame.palmBasisColumns);
  const across = difference(p[17], p[5]);
  for (const [name, columns] of Object.entries(head.handFrame.fingerBasisColumns)) {
    const [, , a, b] = name.split('_');
    close(fingerBasis(p[Number(a)], p[Number(b)], across), columns);
  }
  expect(head).not.toHaveProperty('demoHand');
});

test('finger matrix maps both unit endpoints exactly and reflects a right-source surface for the left hand', () => {
  const a = [2, 3, 4], b = [5, 8, 6], across = [4, -2, 1];
  const matrix = matrixFromBasis(a, fingerBasis(a, b, across));
  close(new Vector3().applyMatrix4(matrix).toArray(), a);
  close(new Vector3(1, 0, 0).applyMatrix4(matrix).toArray(), b);
  const reflect = v => [-v[0], v[1], v[2]];
  const left = matrixFromBasis(reflect(a), fingerBasis(reflect(a), reflect(b), reflect(across)), true);
  close(new Vector3(.4, .2, .1).applyMatrix4(left).toArray(), reflect(new Vector3(.4, .2, .1).applyMatrix4(matrix).toArray()));
});

test('degenerate hand axes are rejected explicitly', () => {
  expect(() => palmBasis(Array.from({ length: 21 }, () => [0, 0, 0]))).toThrow();
  expect(() => fingerBasis([0, 0, 0], [0, 0, 0], [1, 0, 0])).toThrow();
});
