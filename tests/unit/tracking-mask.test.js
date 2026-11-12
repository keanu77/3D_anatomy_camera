import { describe, expect, test, vi } from 'vitest';
import { copyTrackingMask } from '../../src/tracking-mask.js';

function gpuMask({ failure, emptyState = false, format = 'RGBA', type = 'UNSIGNED_BYTE' } = {}) {
  const previousFramebuffer = emptyState ? null : { name: 'upstream framebuffer' };
  const previousPackBuffer = emptyState ? null : { name: 'upstream pack buffer' };
  const framebuffer = { name: 'temporary framebuffer' }, texture = { name: 'mask texture' };
  const previousPacking = { [0x0d05]: 8, [0x0d02]: 11, [0x0d03]: 2, [0x0d04]: 3 };
  const state = { framebuffer: previousFramebuffer, packBuffer: previousPackBuffer, packing: { ...previousPacking } };
  const red = type === 'UNSIGNED_BYTE' ? [0, 64, 128, 255] : [0, 0.25, 0.75, 1];
  const channels = format === 'RGBA' ? 4 : 1;
  const ArrayType = type === 'FLOAT' ? Float32Array : Uint8Array;
  const pixels = new ArrayType(red.flatMap((value, i) => channels === 4 ? [value, 10 + i, 20 + i, 30 + i] : [value]));
  let readback;
  const gl = {
    READ_FRAMEBUFFER_BINDING: 0x8caa, PIXEL_PACK_BUFFER_BINDING: 0x88ed,
    READ_FRAMEBUFFER: 0x8ca8, PIXEL_PACK_BUFFER: 0x88eb,
    COLOR_ATTACHMENT0: 0x8ce0, TEXTURE_2D: 0x0de1, FRAMEBUFFER_COMPLETE: 0x8cd5,
    RED: 0x1903, RGB: 0x1907, RGBA: 0x1908, FLOAT: 0x1406, UNSIGNED_BYTE: 0x1401, UNSIGNED_SHORT: 0x1403,
    IMPLEMENTATION_COLOR_READ_FORMAT: 0x8b9b, IMPLEMENTATION_COLOR_READ_TYPE: 0x8b9a,
    PACK_ALIGNMENT: 0x0d05, PACK_ROW_LENGTH: 0x0d02, PACK_SKIP_ROWS: 0x0d03, PACK_SKIP_PIXELS: 0x0d04,
    getParameter: vi.fn((name) => {
      if (name === gl.READ_FRAMEBUFFER_BINDING) return state.framebuffer;
      if (name === gl.PIXEL_PACK_BUFFER_BINDING) return state.packBuffer;
      if (Object.hasOwn(state.packing, name)) return state.packing[name];
      // Read compatibility must be queried after attaching this mask's texture.
      expect(state.framebuffer).toBe(framebuffer);
      expect(gl.framebufferTexture2D).toHaveBeenCalledExactlyOnceWith(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (name === gl.IMPLEMENTATION_COLOR_READ_FORMAT) return gl[format];
      if (name === gl.IMPLEMENTATION_COLOR_READ_TYPE) return gl[type];
      throw new Error(`Unexpected GL parameter ${name}`);
    }),
    createFramebuffer: vi.fn(() => framebuffer),
    bindFramebuffer: vi.fn((target, value) => { expect(target).toBe(gl.READ_FRAMEBUFFER); state.framebuffer = value; }),
    bindBuffer: vi.fn((target, value) => { expect(target).toBe(gl.PIXEL_PACK_BUFFER); state.packBuffer = value; }),
    pixelStorei: vi.fn((key, value) => { expect(Object.hasOwn(state.packing, key)).toBe(true); state.packing[key] = value; }),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => failure === 'incomplete' ? 0x8cd6 : gl.FRAMEBUFFER_COMPLETE),
    readPixels: vi.fn((x, y, width, height, readFormat, readType, data) => {
      expect([x, y, width, height, readFormat, readType]).toEqual([0, 0, 2, 2, gl[format], gl[type]]);
      expect(data).toBeInstanceOf(ArrayType);
      expect(data).toHaveLength(4 * channels);
      expect(state).toEqual({ framebuffer, packBuffer: null,
        packing: { [gl.PACK_ALIGNMENT]: 1, [gl.PACK_ROW_LENGTH]: 0, [gl.PACK_SKIP_ROWS]: 0, [gl.PACK_SKIP_PIXELS]: 0 } });
      if (failure === 'read') throw new Error('readPixels failed');
      readback = data; data.set(pixels);
    }),
    deleteFramebuffer: vi.fn(),
  };
  const mask = {
    width: 2, height: 2, close: vi.fn(),
    hasFloat32Array: vi.fn(() => false), hasUint8Array: vi.fn(() => false),
    getAsFloat32Array: vi.fn(() => { throw new Error('worker-unsafe native GPU conversion must not run'); }),
    getAsUint8Array: vi.fn(() => { throw new Error('GPU mask has no Uint8 data'); }),
    getAsWebGLTexture: vi.fn(() => { if (failure === 'texture') throw new Error('texture unavailable'); return texture; }),
    canvas: { getContext: vi.fn(() => gl) },
  };
  return { mask, gl, state, previousFramebuffer, previousPackBuffer, previousPacking, framebuffer, texture, pixels, readback: () => readback };
}

function expectRestored(fixture) {
  const { gl, state, previousFramebuffer, previousPackBuffer, previousPacking, framebuffer, mask } = fixture;
  expect(state).toEqual({ framebuffer: previousFramebuffer, packBuffer: previousPackBuffer, packing: previousPacking });
  for (const [key, value] of Object.entries(previousPacking)) {
    expect(gl.pixelStorei.mock.calls.filter(([parameter]) => parameter === Number(key)).at(-1)).toEqual([Number(key), value]);
  }
  expect(gl.bindBuffer).toHaveBeenLastCalledWith(gl.PIXEL_PACK_BUFFER, previousPackBuffer);
  expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.READ_FRAMEBUFFER, previousFramebuffer);
  expect(gl.deleteFramebuffer).toHaveBeenCalledExactlyOnceWith(framebuffer);
  expect(gl.deleteFramebuffer.mock.invocationCallOrder[0]).toBeGreaterThan(gl.bindFramebuffer.mock.invocationCallOrder.at(-1));
  expect(mask.close).not.toHaveBeenCalled();
}

describe('copied tracking mask ownership', () => {
  test.each([null, undefined])('missing mask %s remains null', (mask) => {
    expect(copyTrackingMask(mask)).toBeNull();
  });

  test('Float32 data is copied from a view without retaining callback-owned storage', () => {
    const backing = new Float32Array([99, 0, 0.25, 0.75, 1, 99]);
    const source = backing.subarray(1, 5);
    const mask = { width: 2, height: 2, hasFloat32Array: () => true, getAsFloat32Array: () => source,
      hasUint8Array: vi.fn(), canvas: { getContext: vi.fn() }, close: vi.fn() };
    const result = copyTrackingMask(mask);
    expect(result).toMatchObject({ width: 2, height: 2 });
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.buffer).not.toBe(source.buffer);
    expect([...result.data]).toEqual([0, 0.25, 0.75, 1]);
    source.fill(0.5);
    expect([...result.data]).toEqual([0, 0.25, 0.75, 1]);
    result.data[0] = 1;
    expect(source[0]).toBe(0.5);
    expect(mask.hasUint8Array).not.toHaveBeenCalled();
    expect(mask.canvas.getContext).not.toHaveBeenCalled();
    expect(mask.close).not.toHaveBeenCalled();
  });

  test('Uint8 values become independent normalized Float32 confidence data', () => {
    const source = new Uint8Array([0, 64, 128, 255]);
    const mask = { width: 2, height: 2, hasFloat32Array: () => false, hasUint8Array: () => true,
      getAsUint8Array: () => source, canvas: { getContext: vi.fn() }, close: vi.fn() };
    const result = copyTrackingMask(mask);
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.buffer).not.toBe(source.buffer);
    [0, 64 / 255, 128 / 255, 1].forEach((value, i) => expect(result.data[i]).toBeCloseTo(value, 7));
    source.fill(0);
    expect(result.data[3]).toBe(1);
    result.data[1] = 1;
    expect(source[1]).toBe(0);
    expect(mask.canvas.getContext).not.toHaveBeenCalled();
    expect(mask.close).not.toHaveBeenCalled();
  });

  test.each([['RED', 'FLOAT'], ['RGBA', 'FLOAT'], ['RED', 'UNSIGNED_BYTE'], ['RGBA', 'UNSIGNED_BYTE']])('GPU %s/%s readback copies red confidence values and restores nondefault packing state', (format, type) => {
    const fixture = gpuMask({ format, type }), { mask, gl, texture } = fixture;
    const result = copyTrackingMask(mask);
    expect(mask.canvas.getContext).toHaveBeenCalledExactlyOnceWith('webgl2');
    expect(gl.framebufferTexture2D).toHaveBeenCalledExactlyOnceWith(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    expect(gl.readPixels).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ width: 2, height: 2 });
    expect(result.data).toBeInstanceOf(Float32Array);
    const expected = type === 'UNSIGNED_BYTE' ? [0, 64 / 255, 128 / 255, 1] : [0, 0.25, 0.75, 1];
    expected.forEach((value, i) => expect(result.data[i]).toBeCloseTo(value, 7));
    expect(result.data.buffer).not.toBe(fixture.readback().buffer);
    fixture.readback().fill(0);
    expected.forEach((value, i) => expect(result.data[i]).toBeCloseTo(value, 7));
    expect(mask.getAsFloat32Array).not.toHaveBeenCalled();
    expect(mask.getAsUint8Array).not.toHaveBeenCalled();
    expectRestored(fixture);
  });

  test('a previously unbound framebuffer and pack buffer remain unbound after reading', () => {
    const fixture = gpuMask({ emptyState: true });
    expect(copyTrackingMask(fixture.mask).data[3]).toBe(1);
    expectRestored(fixture);
  });

  test.each(['read', 'incomplete', 'texture'])('%s failure restores both bindings and deletes the temporary framebuffer', (failure) => {
    const fixture = gpuMask({ failure });
    expect(() => copyTrackingMask(fixture.mask)).toThrow();
    if (failure === 'read') expect(fixture.gl.readPixels).toHaveBeenCalledOnce();
    else expect(fixture.gl.readPixels).not.toHaveBeenCalled();
    expectRestored(fixture);
    expect(fixture.mask.getAsFloat32Array).not.toHaveBeenCalled();
  });

  test.each([['RGB', 'FLOAT'], ['RGBA', 'UNSIGNED_SHORT']])('unsupported GPU %s/%s fails before readback and restores all state', (format, type) => {
    const fixture = gpuMask({ format, type });
    expect(() => copyTrackingMask(fixture.mask)).toThrow(/格式/);
    expect(fixture.gl.readPixels).not.toHaveBeenCalled();
    expect(fixture.mask.getAsFloat32Array).not.toHaveBeenCalled();
    expectRestored(fixture);
  });

  test('missing WebGL context fails explicitly without disposing the borrowed mask', () => {
    const close = vi.fn();
    const mask = { width: 2, height: 2, hasFloat32Array: () => false, hasUint8Array: () => false,
      canvas: { getContext: () => null }, close };
    expect(() => copyTrackingMask(mask)).toThrow(/遮罩/);
    expect(close).not.toHaveBeenCalled();
  });
});
