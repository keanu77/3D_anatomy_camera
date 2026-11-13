import { describe, expect, test } from 'vitest';
import { demoStageAspect, demoHeadLayout } from '../../src/demo-pose.js';

describe('demo stage shape and head composition', () => {
  test('a wide stage stays 4:3 with or without the body', () => {
    expect(demoStageAspect({ portrait: false, body: false })).toBe(4 / 3);
    expect(demoStageAspect({ portrait: false, body: true })).toBe(4 / 3);
  });
  test('a portrait phone stands the head 3:4 and the whole body 9:16', () => {
    expect(demoStageAspect({ portrait: true, body: false })).toBe(3 / 4);
    expect(demoStageAspect({ portrait: true, body: true })).toBe(9 / 16);
  });
  test('a wide stage keeps the reviewed head distance and hand placement exactly', () => {
    expect(demoHeadLayout(640, 480)).toEqual({ depth: 48, wristX: [.22, .78], handLength: 480 * .34 });
    expect(demoHeadLayout(1280, 720)).toEqual({ depth: 48, wristX: [.22, .78], handLength: 720 * .34 });
  });
  test('an upright stage moves the head back and the hands out, so the hands stand clear of the skull', () => {
    const wide = demoHeadLayout(640, 480), tall = demoHeadLayout(375, 500);
    expect(tall.depth).toBeGreaterThan(wide.depth);
    expect(tall.wristX[0]).toBeLessThan(wide.wristX[0]);
    expect(tall.wristX[0] + tall.wristX[1]).toBeCloseTo(1, 12);
    // The skull is drawn by the vertical field of view, so its width in the frame grows as the frame narrows.
    // A hand is about 0.45 of its length across; the hand's inner edge must stay outside the skull's outer edge.
    const skullHalfWidth = (wide.depth / tall.depth) * .145 * (4 / 3) / (375 / 500);
    const handHalfWidth = tall.handLength * .45 / 2 / 375;
    expect(tall.wristX[0] + handHalfWidth).toBeLessThan(.5 - skullHalfWidth);
    // And it stays a hand next to a head, not a speck: at least half the wide stage's hand-to-head proportion.
    expect(tall.handLength / 500 * tall.depth).toBeGreaterThan(.5 * .34 * wide.depth);
  });
});
