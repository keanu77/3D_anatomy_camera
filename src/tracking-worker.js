// Classic worker: pinned MediaPipe's WASM loader uses importScripts(). Dynamic
// imports also work in the dev server; production bundles them into this worker.
let core, copyMask, activeGeneration = 0, chain = Promise.resolve();
self.onmessage = ({ data }) => {
  chain = chain.then(async () => {
    activeGeneration = data.generation;
    try {
      let result;
      if (data.type === 'init') {
        const [{ createTrackerCore }, { copyTrackingMask }, vision] = await Promise.all([import('./tracking-core.js'), import('./tracking-mask.js'), import('@mediapipe/tasks-vision')]);
        copyMask = copyTrackingMask;
        core = createTrackerCore({ assetBase: data.base, loadVision: () => Promise.resolve(vision),
          createCanvas: () => new OffscreenCanvas(1, 1),
          onStatus: text => self.postMessage({ type: 'status', generation: activeGeneration, text }) });
        result = true;
      } else if (data.type === 'prepare') result = await core.prepare(data.needs);
      else if (data.type === 'reset') { core?.reset(); return; }
      else if (data.type === 'detect') {
        const began = performance.now();
        core.detect(data.frame, data.now, data.needs, tracking => {
          // Copy the callback-scoped mask before MediaPipe releases its storage.
          const copy = copyMask(tracking.mask);
          result = { tracking: { ...tracking, mask: copy }, durationMs: performance.now() - began };
        });
      }
      const transfers = result?.tracking?.mask ? [result.tracking.mask.data.buffer] : [];
      self.postMessage({ id: data.id, result, diagnostics: core.getDiagnostics() }, transfers);
    } catch (error) { self.postMessage({ id: data.id, error: error?.message || String(error) }); }
    finally { data.frame?.close?.(); }
  });
};
