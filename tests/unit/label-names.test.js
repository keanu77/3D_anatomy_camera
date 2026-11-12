import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { labelText } from '../../src/label-names.js';

describe('stage label language', () => {
  test('English mode returns the published text untouched', () => {
    expect(labelText('Left Radius / ulna', 'en')).toBe('Left Radius / ulna');
  });

  test.each([
    ['Frontal bone', '額骨'], ['Pons (brainstem)', '橋腦'], ['Left Radius / ulna', '左橈骨／尺骨'],
    ['Right Femur / patella', '右股骨／髕骨'], ['Hip/gluteal R', '右髖臀肌群'], ['Achilles L', '左跟腱（阿基里斯腱）'],
    ['Optic tract R', '右視徑'], ['Carpal bones (wrist)', '腕骨'],
  ])('%s reads %s', (english, expected) => {
    expect(labelText(english)).toBe(expected);
    expect(labelText(english, 'both')).toBe(`${expected} ${english}`);
  });

  test('side letters are never swapped', () => {
    for (const english of ['Deltoid L', 'Left Humerus', 'Optic nerve L']) expect(labelText(english)).toMatch(/^左/);
    for (const english of ['Deltoid R', 'Right Humerus', 'Optic nerve R']) expect(labelText(english)).toMatch(/^右/);
  });

  test('unknown or malformed labels stay as published rather than being guessed', () => {
    for (const english of ['Left unknown thing', 'Mystery L', 'constructor', 'toString', '']) expect(labelText(english)).toBe(english);
    expect(labelText(undefined)).toBeUndefined();
  });

  test('every label published in the anatomy metadata has a Chinese reading', async () => {
    let checked = 0;
    for (const bundle of ['head', 'body', 'muscles', 'joints', 'nerves', 'peripheral']) {
      const meta = JSON.parse(await readFile(new URL(`../../public/anatomy/${bundle}.json`, import.meta.url), 'utf8'));
      for (const label of meta.labels) { expect(labelText(label.t), label.t).toMatch(/^[㐀-鿿（）／]+$/); checked++; }
    }
    expect(checked).toBe(92 + 18);
  });
});
