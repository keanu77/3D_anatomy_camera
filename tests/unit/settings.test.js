import { describe, expect, test } from 'vitest';
import { DEFAULTS, sanitizeSettings, applyPreset, BODY_LAYERS, LAYERS } from '../../src/settings.js';

describe('untrusted persisted settings', () => {
  test.each([null, undefined, [], '', 12, true])('rejects a non-record input: %s', (value) => {
    expect(sanitizeSettings(value)).toEqual(DEFAULTS);
  });
  test('accepts only known keys and returns independent data', () => {
    const input = { ...DEFAULTS, skull: false, unexpected: 'https://attacker.invalid/x.js' };
    const value = sanitizeSettings(input);
    expect(value.skull).toBe(false);
    expect(Object.keys(value).sort()).toEqual(Object.keys(DEFAULTS).sort());
    expect(value).not.toBe(input);
    expect(value).not.toBe(DEFAULTS);
  });
  test('does not coerce string booleans or slider values', () => {
    const value = sanitizeSettings({ skull: 'false', bright: '2', real: false, labels: 1 });
    expect(value.skull).toBe(DEFAULTS.skull);
    expect(value.bright).toBe(DEFAULTS.bright);
    expect(value.real).toBe(DEFAULTS.real);
    expect(value.labels).toBe(DEFAULTS.labels);
  });
  test('clamps valid numeric input at the actual control bounds', () => {
    const value = sanitizeSettings({ bright: 100, real: -2, fs: 2, fw: -1, fx: 100, fy: -100, fz: 100 });
    expect(value).toMatchObject({ bright: 2.2, real: 0, fs: 1.4, fw: 0.8, fx: 3, fy: -4, fz: 4 });
  });
  test('rejects nonfinite values before saving or sending shader uniforms', () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(sanitizeSettings({ bright: value }).bright).toBe(DEFAULTS.bright);
  });
  test('validates style, reveal and performance enums', () => {
    expect(sanitizeSettings({ style: 'solid', reveal: 'lens', performance: 'lite' }))
      .toMatchObject({ style: 'solid', reveal: 'lens', performance: 'lite' });
    const bad = sanitizeSettings({ style: '<script>', reveal: 'javascript:', performance: 'turbo' });
    for (const key of ['style', 'reveal', 'performance']) expect(bad[key]).toBe(DEFAULTS[key]);
  });
  test('ignores prototype and inherited settings', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"constructor":{},"hands":false}');
    expect(sanitizeSettings(input).hands).toBe(false);
    expect({}.polluted).toBeUndefined();
    expect(Object.hasOwn(sanitizeSettings(input), '__proto__')).toBe(false);
    const inherited = Object.create({ skull: false });
    expect(sanitizeSettings(inherited).skull).toBe(DEFAULTS.skull);
  });
  test('body muscles are opt-in and independently validated from original head muscles', () => {
    expect(DEFAULTS.bodyMuscles).toBe(false);
    expect(sanitizeSettings({ bodyMuscles: true, muscles: false })).toMatchObject({ bodyMuscles: true, muscles: false });
    expect(sanitizeSettings({ bodyMuscles: 'true' }).bodyMuscles).toBe(false);
    expect(BODY_LAYERS).toContain('bodyMuscles');
  });
  test('body-muscle preset activates only the independent body bundle', () => {
    const settings = { ...DEFAULTS, spine: true, organs: true, arms: true, legs: true, hands: true };
    applyPreset(settings, 'bodyMuscles');
    expect(settings).toMatchObject({ bodyMuscles: true, muscles: true, eyes: true, outline: true,
      spine: false, organs: false, arms: false, legs: false, hands: false });
    applyPreset(settings, 'muscles');
    expect(settings.muscles).toBe(true);
    expect(settings.bodyMuscles).toBe(false);
    expect(settings.hands).toBe(true);
    applyPreset(settings, 'full');
    expect(settings.bodyMuscles).toBe(true);
  });
  test.each(['joints', 'nerves', 'peripheralNerves'])('%s remains opt-in with strict persisted boolean validation', (layer) => {
    expect(DEFAULTS[layer]).toBe(false);
    expect(sanitizeSettings({ [layer]: true })[layer]).toBe(true);
    expect(sanitizeSettings({ [layer]: 'true' })[layer]).toBe(false);
    expect(BODY_LAYERS).toContain(layer);
  });
  test('system presets include their intended layers and exclude unrelated anatomy', () => {
    const settings = { ...DEFAULTS };
    for (const [preset, expected] of [
      ['musculoskeletal', ['skull', 'eyes', 'outline', 'hands', 'spine', 'arms', 'legs', 'muscles', 'bodyMuscles', 'joints']],
      ['nervous', ['brain', 'eyes', 'outline', 'nerves', 'peripheralNerves']],
      ['systems', LAYERS.filter((layer) => layer !== 'organs')],
      ['full', LAYERS],
    ]) {
      applyPreset(settings, preset);
      expect(LAYERS.filter((layer) => settings[layer]).sort(), preset).toEqual([...expected].sort());
    }
    applyPreset(settings, 'bodyMuscles');
    expect(settings).toMatchObject({ bodyMuscles: true, joints: false, nerves: false, peripheralNerves: false });
  });
});
