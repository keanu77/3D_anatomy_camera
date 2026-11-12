import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ face: [], hands: [], pose: [], fallback: false, failNames: [], files: vi.fn(async () => ({})) }));
vi.mock('@mediapipe/tasks-vision', () => {
  function type(name) {
    return { createFromOptions: vi.fn(async (_files, options) => {
      if (mocks.failNames.includes(name)) throw new Error(`${name} model unavailable`);
      if (mocks.fallback && options.baseOptions.delegate === 'GPU') throw new Error('GPU unavailable');
      const tracker = {
        options: structuredClone(options), close: vi.fn(), setOptions: vi.fn(async () => {}),
        detectForVideo: vi.fn((_video, now, callback) => {
          let active = true;
          const mask = { width: 1, height: 1, hasFloat32Array: () => true, getAsFloat32Array: () => {
            if (!active) throw new Error('Mask used outside callback');
            return new Float32Array([0.75]);
          } };
          const result = name === 'pose' ? { landmarks: [[{ x: now }]], worldLandmarks: [[]], segmentationMasks: [mask] } : { landmarks: [], faceLandmarks: [] };
          if (callback) callback(result);
          active = false;
          return result;
        }),
      };
      mocks[name].push(tracker); return tracker;
    }) };
  }
  return { FilesetResolver: { forVisionTasks: mocks.files }, FaceLandmarker: type('face'), HandLandmarker: type('hands'), PoseLandmarker: type('pose') };
});
import { createTrackers } from '../../src/trackers.js';

beforeEach(() => { mocks.face.length = mocks.hands.length = mocks.pose.length = 0; mocks.failNames.length = 0; mocks.fallback = false; mocks.files.mockClear(); });

describe('lazy tracking lifecycle and scheduling', () => {
  test('does not create or resolve models while no layer needs tracking', async () => {
    const tracker = createTrackers();
    await tracker.prepare({ face: false, hands: false, pose: false });
    expect(tracker.getDiagnostics().loaded).toEqual([]);
    expect(mocks.files).not.toHaveBeenCalled();
  });
  test('creates only requested trackers and shares pending initialization', async () => {
    const tracker = createTrackers();
    await Promise.all([tracker.prepare({ face: true }), tracker.prepare({ face: true })]);
    expect(mocks.face).toHaveLength(1);
    expect(mocks.hands).toHaveLength(0);
    expect(mocks.pose).toHaveLength(0);
    expect(mocks.face[0].options).toMatchObject({ runningMode: 'VIDEO', numFaces: 1 });
  });
  test('falls back from GPU to CPU without disabling the feature', async () => {
    mocks.fallback = true;
    const tracker = createTrackers(); await tracker.prepare({ pose: true, mask: false });
    expect(tracker.getDiagnostics().delegates.pose).toBe('CPU');
    expect(mocks.pose[0].options.outputSegmentationMasks).toBe(false);
  });
  test('continues available face and pose tracking when the optional hand model fails', async () => {
    mocks.failNames.push('hands');
    const tracker = createTrackers();
    await tracker.prepare({ face: true, hands: true, pose: true, mask: false });
    expect(tracker.getDiagnostics().loaded.sort()).toEqual(['face', 'pose']);
    expect(tracker.getDiagnostics().errors.hands).toContain('unavailable');
    const callback = vi.fn();
    tracker.detect({}, 100, { face: true, hands: true, pose: true, performance: 'balanced' }, callback);
    expect(mocks.face[0].detectForVideo).toHaveBeenCalledOnce();
    expect(mocks.pose[0].detectForVideo).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });
  test('throttles balanced hand tracking and immediately stops disabled layers', async () => {
    const tracker = createTrackers(); await tracker.prepare({ face: true, hands: true });
    const needs = { face: true, hands: true, pose: false, performance: 'balanced' }, callback = vi.fn();
    for (const now of [0, 16, 34, 50, 68]) tracker.detect({}, now, needs, callback);
    expect(mocks.face[0].detectForVideo).toHaveBeenCalledTimes(3);
    expect(mocks.hands[0].detectForVideo).toHaveBeenCalledTimes(2);
    tracker.detect({}, 1000, { ...needs, face: false, hands: false }, callback);
    expect(mocks.face[0].detectForVideo).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ face: null, hands: null }));
  });
  test('consumes pose masks within the inference callback and retains only landmarks', async () => {
    const tracker = createTrackers(); await tracker.prepare({ pose: true, mask: true });
    const results = [];
    tracker.detect({}, 100, { pose: true, mask: true, performance: 'balanced' }, (result) => results.push(result));
    tracker.detect({}, 110, { pose: true, mask: true, performance: 'balanced' }, (result) => results.push(result));
    expect(results[0].mask).toEqual({ width: 1, height: 1, data: new Float32Array([0.75]) });
    expect(results[1].mask).toBeNull();
    expect(results[1].pose).not.toHaveProperty('segmentationMasks');
    await tracker.prepare({ pose: true, mask: false });
    expect(mocks.pose[0].setOptions).toHaveBeenCalledWith({ outputSegmentationMasks: false });
    tracker.dispose();
    expect(mocks.pose[0].close).toHaveBeenCalledOnce();
    await tracker.prepare({ hands: true });
    expect(mocks.hands).toHaveLength(0);
  });
});
