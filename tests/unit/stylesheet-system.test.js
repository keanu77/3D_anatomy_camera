import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const directory = new URL('../../src/', import.meta.url);
const sheets = readdirSync(directory).filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(new URL(name, directory), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

describe('one visual system across the stylesheets', () => {
  test('no text is set below 13px', () => {
    const small = [];
    for (const { name, css } of sheets) {
      for (const [, value, unit] of css.matchAll(/font(?:-size)?\s*:[^;{}]*?(\d*\.?\d+)(px|em|rem)\b/g)) {
        const px = unit === 'px' ? Number(value) : Number(value) * 14;
        if (px < 13) small.push(`${name}: ${value}${unit}`);
      }
    }
    expect(small).toEqual([]);
  });
  test('corners come from the radius tokens, never from a one-off value', () => {
    const loose = [];
    for (const { name, css } of sheets) {
      for (const [declaration, value] of css.matchAll(/border-radius\s*:\s*([^;}]+)/g)) {
        if (!/^(var\(--r-(sm|md)\)|0|50%)$/.test(value.trim())) loose.push(`${name}: ${declaration.trim()}`);
      }
    }
    expect(loose).toEqual([]);
  });
  test('colours are named once on :root and used by name', () => {
    const loose = [];
    for (const { name, css } of sheets) {
      const body = css.replace(/:root\s*\{[\s\S]*?\}/, '');
      for (const [colour] of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) loose.push(`${name}: ${colour}`);
    }
    expect(loose).toEqual([]);
  });
  test('interface motion uses the shared timing tokens', () => {
    const loose = [];
    for (const { name, css } of sheets) {
      for (const [declaration, value] of css.matchAll(/(?:transition|animation)(?:-duration)?\s*:\s*([^;}]+)/g)) {
        if (/\d(ms|s)\b/.test(value) && !/none/.test(value)) loose.push(`${name}: ${declaration.trim()}`);
      }
    }
    expect(loose).toEqual([]);
  });
});
