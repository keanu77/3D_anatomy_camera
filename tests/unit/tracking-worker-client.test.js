import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const fallback = vi.hoisted(() => ({ create: vi.fn(), instances: [] }));
vi.mock('../../src/tracking-core.js', () => ({ createTrackerCore: fallback.create }));
import { createTrackers } from '../../src/trackers.js';

const needs = { face: false, hands: false, pose: true, mask: true, performance: 'balanced' };
const noNeeds = { face: false, hands: false, pose: false, mask: false, performance: 'balanced' };
const emptyTracking = { face: null, hands: null, pose: null, mask: null };
const initial = () => ({ loaded: ['pose'], loading: [], calls: {}, delegates: { pose: 'GPU' }, errors: {} });
const clients = [];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const bitmap = () => ({ close: vi.fn() });

class FakeWorker {
  messages = [];
  terminate = vi.fn();
  postMessage(message, transfer = []) { this.messages.push({ message, transfer }); }
  requests(type) { return this.messages.filter((entry) => entry.message.type === type); }
  latest(type) { return this.requests(type).at(-1)?.message; }
  emit(data) { this.onmessage?.({ data }); }
  reply(request, result, diagnostics) { this.emit({ id: request.id, result, diagnostics }); }
}

function create(options = {}) {
  const worker = options.worker || new FakeWorker();
  const captureFrame = options.captureFrame || vi.fn(async () => bitmap());
  const onStatus = options.onStatus || vi.fn();
  const workerFactory = options.workerFactory === undefined ? vi.fn(() => worker) : options.workerFactory;
  const client = createTrackers({ workerFactory, captureFrame, onStatus, assetBase: 'https://example.test/' });
  clients.push(client);
  return { client, worker, captureFrame, workerFactory, onStatus };
}
async function ready(client, worker) {
  const result = client.prepare(needs);
  expect(worker.latest('init')).toMatchObject({ type: 'init', base: 'https://example.test/', generation: 0 });
  worker.reply(worker.latest('init'), true);
  await vi.waitFor(() => expect(worker.latest('prepare')).toBeDefined(), { interval: 1 });
  worker.reply(worker.latest('prepare'), { failures: [], loaded: ['pose'] }, initial());
  await expect(result).resolves.toEqual({ failures: [], loaded: ['pose'] });
}
async function detection(worker, count = 1) {
  await vi.waitFor(() => expect(worker.requests('detect')).toHaveLength(count), { interval: 1 });
  return worker.latest('detect');
}
async function idle(client) {
  await vi.waitFor(() => expect(client.getDiagnostics().inFlight).toBe(false), { interval: 1 });
}

beforeEach(() => {
  fallback.create.mockReset(); fallback.instances.length = 0;
  fallback.create.mockImplementation((options) => {
    const core = {
      prepare: vi.fn(async () => ({ failures: [], loaded: ['pose'] })),
      detect: vi.fn((_video, _now, _needs, callback) => callback({ pose: { landmarks: [] }, mask: null })),
      reset: vi.fn(), dispose: vi.fn(), getDiagnostics: vi.fn(initial),
    };
    fallback.instances.push({ core, options }); return core;
  });
});
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); });

describe('background tracking client ownership and lifecycle', () => {
  test('stays lazy when every tracking layer is off', async () => {
    const { client, workerFactory, captureFrame } = create();
    await expect(client.prepare({ face: false, hands: false, pose: false })).resolves.toEqual({ failures: [], loaded: [] });
    expect(workerFactory).not.toHaveBeenCalled();
    expect(captureFrame).not.toHaveBeenCalled();
    expect(fallback.create).not.toHaveBeenCalled();
  });

  test.each(['worker', 'main'])('all layers off still render empty tracking without creating the %s engine', async (execution) => {
    const { client, workerFactory, captureFrame } = create({ workerFactory: execution === 'main' ? null : undefined });
    await client.prepare(noNeeds);
    const callback = vi.fn(), onError = vi.fn();
    for (const now of [100, 200, 300]) expect(client.detect({}, now, noNeeds, callback, onError)).toBe(true);
    expect(callback).toHaveBeenCalledTimes(3);
    for (const [result] of callback.mock.calls) expect(result).toEqual(emptyTracking);
    if (workerFactory) expect(workerFactory).not.toHaveBeenCalled();
    expect(captureFrame).not.toHaveBeenCalled();
    expect(fallback.create).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('disabling all layers drops a pending result and resets once per transition, not per empty frame', async () => {
    const { client, worker, captureFrame } = create();
    await ready(client, worker);
    const oldCallback = vi.fn(), emptyCallback = vi.fn(), freshCallback = vi.fn();
    expect(client.detect({}, 100, needs, oldCallback)).toBe(true);
    const oldRequest = await detection(worker);
    for (const now of [101, 102, 103]) expect(client.detect({}, now, noNeeds, emptyCallback)).toBe(true);
    expect(emptyCallback).toHaveBeenCalledTimes(3);
    for (const [result] of emptyCallback.mock.calls) expect(result).toEqual(emptyTracking);
    expect(worker.requests('reset')).toHaveLength(1);
    expect(worker.latest('reset').generation).toBe(oldRequest.generation + 1);
    expect(captureFrame).toHaveBeenCalledOnce();
    worker.reply(oldRequest, { tracking: { pose: { marker: 'stale pose' }, mask: null }, durationMs: 99 });
    await idle(client);
    expect(oldCallback).not.toHaveBeenCalled();
    expect(client.detect({}, 104, noNeeds, emptyCallback)).toBe(true);
    expect(worker.requests('reset')).toHaveLength(1);

    expect(client.detect({}, 200, needs, freshCallback)).toBe(true);
    const freshRequest = await detection(worker, 2);
    expect(freshRequest.generation).toBe(oldRequest.generation + 1);
    worker.reply(freshRequest, { tracking: { pose: { marker: 'fresh pose' }, mask: null }, durationMs: 5 });
    await idle(client);
    expect(freshCallback).toHaveBeenCalledExactlyOnceWith({ pose: { marker: 'fresh pose' }, mask: null });
    for (const now of [201, 202]) expect(client.detect({}, now, noNeeds, emptyCallback)).toBe(true);
    expect(worker.requests('reset')).toHaveLength(2);
    expect(captureFrame).toHaveBeenCalledTimes(2);
  });

  test('allows one capture or inference at a time and transfers usable typed mask data', async () => {
    const capture = deferred(), frame = bitmap(), callback = vi.fn();
    const { client, worker, captureFrame } = create({ captureFrame: vi.fn(() => capture.promise) });
    await ready(client, worker);
    expect(client.detect({ video: true }, 100, needs, callback)).toBe(true);
    expect(client.detect({}, 101, needs, callback)).toBe(false);
    expect(captureFrame).toHaveBeenCalledOnce();
    expect(worker.requests('detect')).toHaveLength(0);
    capture.resolve(frame);
    const request = await detection(worker);
    expect(request).toMatchObject({ generation: 0, now: 100, needs, frame });
    expect(worker.requests('detect')[0].transfer).toEqual([frame]);
    expect(client.detect({}, 102, needs, callback)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    const mask = { width: 2, height: 2, data: new Float32Array([0, 0.25, 0.75, 1]) };
    worker.reply(request, { tracking: { pose: { landmarks: [[{ x: 0.5 }]] }, mask }, durationMs: 12 }, { ...initial(), calls: { pose: 1 } });
    await idle(client);
    expect(callback).toHaveBeenCalledOnce();
    const result = callback.mock.calls[0][0];
    expect(result.mask.data).toBeInstanceOf(Float32Array);
    expect([...result.mask.data]).toEqual([0, 0.25, 0.75, 1]);
    expect(result.mask).not.toHaveProperty('getAsFloat32Array');
    expect(frame.close).toHaveBeenCalledOnce();
    expect(client.getDiagnostics()).toMatchObject({ execution: 'worker', inFlight: false, droppedFrames: 2, inferenceMeanMs: 12, calls: { pose: 1 } });
  });

  test('reset closes a stale captured bitmap without sending it and holds backpressure until it finishes', async () => {
    const capture = deferred(), stale = bitmap(), fresh = bitmap(), callback = vi.fn();
    const { client, worker, captureFrame } = create({ captureFrame: vi.fn().mockReturnValueOnce(capture.promise).mockResolvedValueOnce(fresh) });
    await ready(client, worker);
    expect(client.detect({}, 100, needs, callback)).toBe(true);
    client.reset();
    expect(worker.latest('reset')).toMatchObject({ generation: 1 });
    expect(client.detect({}, 101, needs, callback)).toBe(false);
    capture.resolve(stale); await idle(client);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(worker.requests('detect')).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
    expect(client.detect({}, 102, needs, callback)).toBe(true);
    const request = await detection(worker);
    expect(request.generation).toBe(1);
    worker.reply(request, { tracking: { marker: 'fresh' }, durationMs: 8 });
    await idle(client);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ marker: 'fresh' });
    expect(captureFrame).toHaveBeenCalledTimes(2);
  });

  test('old-generation replies preserve session state and report only monotonic cumulative call counts', async () => {
    const callback = vi.fn(), onError = vi.fn();
    const { client, worker, onStatus } = create();
    await ready(client, worker);
    client.detect({}, 100, needs, callback, onError); const old = await detection(worker);
    client.reset();
    worker.emit({ type: 'status', generation: old.generation, text: 'old camera' });
    worker.emit({ type: 'status', generation: old.generation + 1, text: 'current camera' });
    const staleDiagnostics = { loaded: ['hands'], loading: ['face'], calls: { pose: 9, hands: 2 },
      delegates: { pose: 'CPU' }, errors: { pose: 'stale model error' } };
    worker.reply(old, { tracking: { marker: 'stale' }, durationMs: 999 }, staleDiagnostics);
    await idle(client);
    expect(callback).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledExactlyOnceWith('current camera');
    expect(client.getDiagnostics()).toMatchObject({ ...initial(), calls: { pose: 9, hands: 2 }, inferenceMeanMs: 0 });
    expect(client.detect({}, 200, needs, callback, onError)).toBe(true);
    const current = await detection(worker, 2);
    worker.reply(current, { tracking: { marker: 'current' }, durationMs: 10 }, { ...initial(), calls: { pose: 10, hands: 2 } });
    await idle(client);
    worker.reply(old, { tracking: { marker: 'duplicate old result' }, durationMs: 999 }, { ...initial(), calls: { pose: 999 } });
    expect(callback).toHaveBeenCalledExactlyOnceWith({ marker: 'current' });
    expect(client.getDiagnostics()).toMatchObject({ ...initial(), calls: { pose: 10, hands: 2 }, inferenceMeanMs: 10 });

    // An older count must not move the cumulative counters backward either.
    expect(client.detect({}, 300, needs, callback, onError)).toBe(true);
    const laterStale = await detection(worker, 3);
    client.reset();
    worker.reply(laterStale, { tracking: { marker: 'another stale result' }, durationMs: 999 },
      { ...staleDiagnostics, calls: { pose: 6, hands: 1 } });
    await idle(client);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ marker: 'current' });
    expect(onError).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledExactlyOnceWith('current camera');
    expect(client.getDiagnostics()).toMatchObject({ ...initial(), calls: { pose: 10, hands: 2 }, inferenceMeanMs: 10 });
  });

  test('a reset suppresses an old inference error but still releases its frame slot', async () => {
    const callback = vi.fn(), onError = vi.fn(), frame = bitmap();
    const { client, worker } = create({ captureFrame: vi.fn(async () => frame) });
    await ready(client, worker);
    client.detect({}, 100, needs, callback, onError); const request = await detection(worker);
    client.reset(); worker.emit({ id: request.id, error: 'old camera failed' });
    await idle(client);
    expect(frame.close).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });

  test.each(['capture', 'inference'])('%s failure reports once and permits a subsequent frame', async (failure) => {
    const frame = bitmap(), callback = vi.fn(), onError = vi.fn();
    const captureFrame = vi.fn(async () => frame);
    if (failure === 'capture') captureFrame.mockRejectedValueOnce(new Error('capture failed'));
    const { client, worker } = create({ captureFrame });
    await ready(client, worker);
    client.detect({}, 100, needs, callback, onError);
    if (failure === 'inference') worker.emit({ id: (await detection(worker)).id, error: 'inference failed' });
    await idle(client);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain(`${failure} failed`);
    expect(callback).not.toHaveBeenCalled();
    expect(client.detect({}, 200, needs, callback, onError)).toBe(true);
    const request = await detection(worker, failure === 'capture' ? 1 : 2);
    worker.reply(request, { tracking: { marker: 'recovered' }, durationMs: 5 }); await idle(client);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ marker: 'recovered' });
    expect(onError).toHaveBeenCalledOnce();
  });

  test('disposal during capture terminates once and closes the bitmap when capture settles', async () => {
    const capture = deferred(), frame = bitmap(), callback = vi.fn(), onError = vi.fn();
    const { client, worker, onStatus } = create({ captureFrame: vi.fn(() => capture.promise) });
    await ready(client, worker);
    client.detect({}, 100, needs, callback, onError);
    client.dispose(); client.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    capture.resolve(frame); await idle(client);
    worker.emit({ type: 'status', generation: 1, text: 'late disposed status' });
    expect(frame.close).toHaveBeenCalledOnce();
    expect(worker.requests('detect')).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(onStatus).not.toHaveBeenCalled();
    expect(client.detect({}, 200, needs, callback)).toBe(false);
    await expect(client.prepare(needs)).resolves.toEqual({ failures: [], loaded: [] });
    expect(fallback.create).not.toHaveBeenCalled();
  });

  test.each(['init', 'prepare'])('disposal rejects a pending %s RPC without creating a fallback', async (stage) => {
    const { client, worker } = create();
    const preparation = client.prepare(needs);
    if (stage === 'prepare') {
      worker.reply(worker.latest('init'), true);
      await vi.waitFor(() => expect(worker.latest('prepare')).toBeDefined(), { interval: 1 });
    }
    const pending = worker.latest(stage);
    client.dispose();
    await expect(preparation).resolves.toEqual({ failures: [], loaded: [] });
    worker.reply(pending, { failures: [], loaded: ['pose'] }, initial());
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(fallback.create).not.toHaveBeenCalled();
    expect(client.getDiagnostics().loaded).toEqual([]);
  });

  test('reset during bootstrap never submits old model needs under the new generation', async () => {
    const worker = new FakeWorker(), submitted = deferred();
    const postMessage = worker.postMessage.bind(worker);
    worker.postMessage = (message, transfer) => {
      postMessage(message, transfer);
      if (message.type === 'prepare') submitted.resolve(message);
    };
    const { client, onStatus } = create({ worker });
    const stalePreparation = client.prepare(needs);
    const initialization = worker.latest('init');
    client.reset();
    worker.reply(initialization, true);
    const outcome = await Promise.race([
      stalePreparation.then((result) => ({ kind: 'settled', result })),
      submitted.promise.then((request) => ({ kind: 'submitted', request })),
    ]);
    expect(outcome).toEqual({ kind: 'settled', result: { failures: [], loaded: [] } });
    expect(worker.requests('prepare')).toHaveLength(0);
    expect(fallback.create).not.toHaveBeenCalled();
    worker.emit({ type: 'status', generation: initialization.generation, text: 'stale loading' });
    expect(onStatus).not.toHaveBeenCalled();

    const freshNeeds = { face: true, hands: false, pose: false, mask: false, performance: 'balanced' };
    const freshPreparation = client.prepare(freshNeeds);
    await vi.waitFor(() => expect(worker.requests('prepare')).toHaveLength(1), { interval: 1 });
    const request = worker.latest('prepare');
    expect(request).toMatchObject({ generation: initialization.generation + 1, needs: freshNeeds });
    expect(worker.requests('init')).toHaveLength(1);
    worker.reply(request, { failures: [], loaded: ['face'] }, { ...initial(), loaded: ['face'] });
    await expect(freshPreparation).resolves.toEqual({ failures: [], loaded: ['face'] });
  });

  test('reset suppresses a stale model-prepare error without terminating the worker or starting fallback', async () => {
    const { client, worker } = create();
    const stalePreparation = client.prepare(needs);
    worker.reply(worker.latest('init'), true);
    await vi.waitFor(() => expect(worker.latest('prepare')).toBeDefined(), { interval: 1 });
    const staleRequest = worker.latest('prepare');
    client.reset();
    worker.emit({ id: staleRequest.id, error: 'old generation model failed' });
    await expect(stalePreparation).resolves.toEqual({ failures: [], loaded: [] });
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(fallback.create).not.toHaveBeenCalled();
    expect(client.getDiagnostics().execution).toBe('worker');
    const freshPreparation = client.prepare(needs);
    await vi.waitFor(() => expect(worker.requests('prepare')).toHaveLength(2), { interval: 1 });
    expect(worker.latest('prepare').generation).toBe(staleRequest.generation + 1);
    worker.reply(worker.latest('prepare'), { failures: [], loaded: ['pose'] }, initial());
    await expect(freshPreparation).resolves.toEqual({ failures: [], loaded: ['pose'] });
  });

  test('disposal rejects active inference without delivering its result or an application error', async () => {
    const frame = bitmap(), callback = vi.fn(), onError = vi.fn();
    const { client, worker } = create({ captureFrame: vi.fn(async () => frame) });
    await ready(client, worker);
    client.detect({}, 100, needs, callback, onError); const request = await detection(worker);
    client.dispose(); await idle(client);
    worker.reply(request, { tracking: { marker: 'too late' }, durationMs: 5 });
    expect(frame.close).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  test('an idle worker crash rejects detection until explicit fallback preparation succeeds', async () => {
    const { client, worker } = create();
    await ready(client, worker);
    const preventDefault = vi.fn(), callback = vi.fn(), onError = vi.fn();
    worker.onerror({ message: 'worker crashed while idle', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.getDiagnostics().execution).toBe('main');
    expect(client.detect({}, 100, needs, callback, onError)).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain('worker crashed while idle');
    expect(callback).not.toHaveBeenCalled();
    expect(fallback.create).not.toHaveBeenCalled();

    await expect(client.prepare(needs)).resolves.toEqual({ failures: [], loaded: ['pose'] });
    expect(fallback.create).toHaveBeenCalledOnce();
    expect(fallback.instances[0].core.prepare).toHaveBeenCalledExactlyOnceWith(needs);
    expect(client.detect({}, 200, needs, callback, onError)).toBe(true);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ pose: { landmarks: [] }, mask: null });
    expect(onError).toHaveBeenCalledOnce();
  });

  test('a fallback preparation invalidated by reset cannot clear the transport failure', async () => {
    const { client, worker } = create();
    await ready(client, worker);
    worker.onerror({ message: 'idle transport failure', preventDefault() {} });
    const pending = deferred(), factory = fallback.create.getMockImplementation();
    fallback.create.mockImplementationOnce((options) => {
      const core = factory(options); core.prepare.mockReturnValueOnce(pending.promise); return core;
    });
    const stalePreparation = client.prepare(needs);
    client.reset();
    pending.resolve({ failures: [], loaded: ['pose'] });
    await stalePreparation;
    const callback = vi.fn(), onError = vi.fn();
    expect(client.detect({}, 100, needs, callback, onError)).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
    await client.prepare(needs);
    expect(client.detect({}, 200, needs, callback, onError)).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  test.each(['factory', 'bootstrap'])('%s failure falls back to one synchronous core with the same assets and lifecycle', async (stage) => {
    const worker = new FakeWorker();
    const workerFactory = vi.fn(() => { if (stage === 'factory') throw new Error('worker unavailable'); return worker; });
    const { client, onStatus } = create({ worker, workerFactory });
    const preparation = client.prepare(needs);
    if (stage === 'bootstrap') worker.emit({ id: worker.latest('init').id, error: 'worker unavailable' });
    await expect(preparation).resolves.toEqual({ failures: [], loaded: ['pose'] });
    expect(fallback.create).toHaveBeenCalledOnce();
    expect(fallback.instances[0].options).toMatchObject({ assetBase: 'https://example.test/', onStatus });
    expect(client.getDiagnostics()).toMatchObject({ execution: 'main', fallbackReason: 'worker unavailable', loaded: ['pose'] });
    const callback = vi.fn();
    expect(client.detect({}, 100, needs, callback)).toBe(true);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ pose: { landmarks: [] }, mask: null });
    client.reset(); client.dispose();
    expect(fallback.instances[0].core.reset).toHaveBeenCalledOnce();
    expect(fallback.instances[0].core.dispose).toHaveBeenCalledOnce();
    expect(workerFactory).toHaveBeenCalledOnce();
  });
});
