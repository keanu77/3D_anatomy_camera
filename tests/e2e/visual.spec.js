import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { fixedStage, rendered, storeSettings, watchErrors } from './helpers.js';

// R4's independently authored renderer, reviewed at 640x480 with SwiftShader.
// These are project-owned outputs. Update only after reviewing changed anatomy
// and retaining the numerical source/pose tests; do not regenerate to hide a bug.
const cases = [
  ['01-default-xray', {}],
  ['02-solid-skull-hand', { style: 'solid', real: .5 }],
  ['03-brain-labels', { skull: false, brain: true, eyes: false, labels: true, labelLanguage: 'en' }],
  ['04-muscles-half', { muscles: true, reveal: 'left', cut: .5 }],
  ['05-fingertip-lens', { reveal: 'lens', cut: .65 }],
  ['06-full-body', { skull: true, hands: true, spine: true, arms: true, legs: true, bodyMuscles: true, peripheralNerves: true }],
];
for (const [name, settings] of cases) test(`independent visual snapshot: ${name}`, async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await fixedStage(page); await storeSettings(page, settings);
  await page.goto('/?still#demo'); await rendered(page);
  const actual = PNG.sync.read(await page.locator('#stage').screenshot({ animations: 'disabled' }));
  const expected = PNG.sync.read(await readFile(new URL(`./snapshots/${name}.png`, import.meta.url)));
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changed = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: .1, includeAA: false });
  const ratio = changed / (actual.width * actual.height);
  await testInfo.attach('snapshot-result', { body: JSON.stringify({ changed, ratio, reference: name }), contentType: 'application/json' });
  if (ratio >= .01) await testInfo.attach('snapshot-difference', { body: PNG.sync.write(diff), contentType: 'image/png' });
  expect(ratio).toBeLessThan(.01);
  expect(errors).toEqual([]);
});
