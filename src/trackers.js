import { createTrackerCore } from './tracking-core.js';
import { copyTrackingMask } from './tracking-mask.js';

const emptyDiagnostics = () => ({ loaded: [], loading: [], calls: {}, delegates: {}, errors: {} });
const defaultFactory = () => new Worker(new URL('./tracking-worker.js', import.meta.url));
const workerSupported = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

export function createTrackers({ onStatus = () => {}, workerFactory = workerSupported() ? defaultFactory : null,
  captureFrame = frame => createImageBitmap(frame), assetBase = new URL(import.meta.env.BASE_URL, globalThis.location?.href || 'http://localhost/').href } = {}) {
  let worker, boot, core, disposed = false, generation = 0, nextId = 0, inFlight = null, droppedFrames = 0, idle = false;
  let execution = workerFactory ? 'worker' : 'main', diagnostics = emptyDiagnostics(), fallbackReason = '', fallbackFailure = null;
  const pending = new Map(), timings = [];
  const makeCore = () => core ||= createTrackerCore({ onStatus, assetBase, loadVision: () => import('@mediapipe/tasks-vision') });
  const remember = ms => { if (Number.isFinite(ms)) { timings.push(ms); if (timings.length > 120) timings.shift(); } };
  function closeWorker(error) {
    worker?.terminate(); worker = null;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  }
  function fallback(error) {
    fallbackFailure = error;
    fallbackReason = error?.message || 'Background tracking unavailable';
    closeWorker(error); execution = 'main'; diagnostics = emptyDiagnostics();
  }
  function request(type, payload = {}, transfer = []) {
    if (disposed || !worker) return Promise.reject(new Error('Tracking has stopped'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const error = new Error('背景追蹤逾時，請重新啟動鏡頭。');
        reject(error); fallback(error);
      }, type === 'init' ? 30000 : 180000);
      pending.set(id, { resolve, reject, timer, generation });
      try { worker.postMessage({ id, type, generation, ...payload }, transfer); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  async function startWorker() {
    if (boot) return boot;
    boot = (async () => {
      try {
        worker = workerFactory();
        worker.onmessage = ({ data }) => {
          if (data.type === 'status') {
            if (!disposed && data.generation === generation) onStatus(data.text);
            return;
          }
          const entry = pending.get(data.id);
          if (!entry) return;
          pending.delete(data.id); clearTimeout(entry.timer);
          if (!disposed && data.diagnostics) {
            if (entry.generation === generation) diagnostics = data.diagnostics;
            else {
              // A cancelled frame can finish locally. Count that work honestly,
              // without reviving its loaded/error state or rendering its result.
              const calls = { ...diagnostics.calls };
              for (const name of ['face', 'hands', 'pose']) {
                const value = data.diagnostics.calls?.[name];
                if (Number.isFinite(value) && value > (calls[name] || 0)) calls[name] = value;
              }
              diagnostics = { ...diagnostics, calls };
            }
          }
          if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
        };
        worker.onerror = event => { event.preventDefault?.(); fallback(new Error(event.message || '背景追蹤無法啟動。')); };
        worker.onmessageerror = () => fallback(new Error('背景追蹤資料無法讀取。'));
        await request('init', { base: assetBase });
      } catch (error) { if (!disposed) fallback(error); }
    })();
    return boot;
  }
  async function prepare(needs) {
    const current = generation;
    if (disposed) return { failures: [], loaded: [] };
    if (!['face', 'hands', 'pose'].some(name => needs[name])) return { failures: [], loaded: getDiagnostics().loaded };
    idle = false;
    if (execution === 'worker') {
      await startWorker();
      if (disposed || current !== generation) return { failures: [], loaded: [] };
      if (execution === 'worker') {
        try { return await request('prepare', { needs }); }
        catch (error) { if (disposed || current !== generation) return { failures: [], loaded: [] }; fallback(error); }
      }
    }
    const result = await makeCore().prepare(needs);
    if (!disposed && current === generation) fallbackFailure = null;
    return result;
  }
  function detect(video, now, needs, callback, onError = () => {}) {
    if (disposed) return false;
    if (!['face', 'hands', 'pose'].some(name => needs[name])) {
      if (!idle) { reset(); idle = true; }
      callback({ face: null, hands: null, pose: null, mask: null });
      return true;
    }
    idle = false;
    if (fallbackFailure) { onError(fallbackFailure); return false; }
    if (inFlight) { droppedFrames++; return false; }
    if (execution === 'main') {
      const start = performance.now();
      makeCore().detect(video, now, needs, result => callback({ ...result, mask: copyTrackingMask(result.mask) }));
      remember(performance.now() - start);
      return true;
    }
    if (!worker) return false;
    // Capture plus inference share one slot. Never queue old camera frames.
    const token = { generation }; inFlight = token;
    (async () => {
      let frame;
      try {
        frame = await captureFrame(video);
        if (disposed || token.generation !== generation) return;
        const result = await request('detect', { frame, now, needs }, [frame]);
        if (disposed || token.generation !== generation) return;
        remember(result.durationMs); callback(result.tracking);
      } catch (error) { if (!disposed && token.generation === generation) onError(error); }
      finally { frame?.close?.(); if (inFlight === token) inFlight = null; }
    })();
    return true;
  }
  function reset() {
    generation++; core?.reset();
    // A busy worker finishes at most its current frame; its reply is ignored.
    worker?.postMessage({ type: 'reset', generation });
  }
  function dispose() {
    if (disposed) return;
    disposed = true; generation++; core?.dispose(); closeWorker(new Error('Tracking has stopped'));
  }
  function getDiagnostics() {
    return { ...(core ? core.getDiagnostics() : diagnostics), execution, inFlight: !!inFlight, droppedFrames, fallbackReason,
      inferenceMeanMs: timings.reduce((sum, n) => sum + n, 0) / (timings.length || 1) };
  }
  return { prepare, detect, reset, dispose, getDiagnostics };
}
