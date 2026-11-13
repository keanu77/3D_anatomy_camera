const MODEL = { face: 'face_landmarker.task', hands: 'hand_landmarker.task', pose: 'pose_landmarker_lite.task' };
const INTERVALS = { high: { face: 0, hands: 0, pose: 0 }, balanced: { face: 33, hands: 67, pose: 67 }, lite: { face: 67, hands: 125, pose: 125 } };
// Lite mode beside a body: the hands are followed four times a second. That draws them and, above all,
// gives the pose something to be checked against; without them a close hand is drawn as a small body.
const LITE_HANDS_BESIDE_POSE_MS = 250;
export function createTrackerCore({ onStatus = () => {}, loadVision, assetBase, createCanvas } = {}) {
  const instances = {}, loading = {}, results = {}, last = {}, counts = {}, errors = {}, delegates = {}, retryAt = {};
  let visionPromise, filesPromise, disposed = false, maskEnabled = false;
  const api = () => visionPromise ||= loadVision();
  const files = () => filesPromise ||= api().then(v => v.FilesetResolver.forVisionTasks(`${assetBase}mediapipe/wasm`));
  async function ensure(name, mask = false) {
    if (disposed) return null;
    if (instances[name]) {
      if (name === 'pose' && maskEnabled !== mask) {
        await instances.pose.setOptions({ outputSegmentationMasks: mask }); maskEnabled = mask;
      }
      return instances[name];
    }
    if (loading[name]) return loading[name];
    if (errors[name] && performance.now() < retryAt[name]) throw new Error(errors[name]);
    loading[name] = (async () => {
      onStatus(`正在載入${{ face: '臉部', hands: '手部', pose: '身體' }[name]}追蹤模型…`);
      const vision = await api(), resolver = await files();
      const options = { runningMode: 'VIDEO', baseOptions: { modelAssetPath: `${assetBase}models/${MODEL[name]}`, delegate: 'GPU' } };
      let Type;
      if (name === 'face') { Type = vision.FaceLandmarker; Object.assign(options, { numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true }); }
      if (name === 'hands') { Type = vision.HandLandmarker; options.numHands = 2; }
      if (name === 'pose') { Type = vision.PoseLandmarker; Object.assign(options, { numPoses: 1, outputSegmentationMasks: mask }); }
      let tracker;
      try { if (createCanvas) options.canvas = createCanvas(); tracker = await Type.createFromOptions(resolver, options); delegates[name] = 'GPU'; }
      catch { options.baseOptions.delegate = 'CPU'; if (createCanvas) options.canvas = createCanvas(); tracker = await Type.createFromOptions(resolver, options); delegates[name] = 'CPU'; }
      if (disposed) { tracker.close(); return null; }
      instances[name] = tracker; errors[name] = null;
      if (name === 'pose') maskEnabled = mask;
      return tracker;
    })().catch(error => { errors[name] = error.message; retryAt[name] = performance.now() + 10000; throw error; }).finally(() => { delete loading[name]; });
    return loading[name];
  }
  async function prepare(needs) {
    // Serial creation avoids competing WebGL initialization and fallback churn on mobile.
    const failures = [];
    for (const name of ['face', 'hands', 'pose']) if (needs[name]) {
      try { await ensure(name, needs.mask); }
      catch (error) {
        failures.push({ name, message: error.message });
        onStatus(`${{ face: '臉部', hands: '手部', pose: '身體' }[name]}追蹤暫時無法使用；保留其他可用圖層。`);
      }
    }
    return { failures, loaded: Object.keys(instances) };
  }
  function detect(video, now, needs, callback) {
    const profile = INTERVALS[needs.performance] || INTERVALS.balanced;
    const periods = needs.performance === 'lite' && needs.pose ? { ...profile, hands: LITE_HANDS_BESIDE_POSE_MS } : profile;
    const due = name => needs[name] && instances[name] && now - (last[name] ?? -Infinity) >= periods[name];
    const mark = name => { last[name] = now; counts[name] = (counts[name] || 0) + 1; };
    for (const name of ['face', 'hands']) {
      if (!needs[name]) { results[name] = null; continue; }
      if (due(name)) { results[name] = instances[name].detectForVideo(video, now); mark(name); }
    }
    if (!needs.pose) results.pose = null;
    if (due('pose')) {
      mark('pose');
      instances.pose.detectForVideo(video, now, result => {
        // Retain only landmarks. MPMask is consumed inside this callback, never kept alive.
        results.pose = { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks };
        callback({ ...results, mask: result.segmentationMasks?.[0] || null });
      });
    } else callback({ ...results, mask: null });
  }
  function reset() { for (const key of Object.keys(results)) delete results[key]; for (const key of Object.keys(last)) delete last[key]; }
  function dispose() { disposed = true; for (const tracker of Object.values(instances)) tracker.close(); reset(); }
  return { prepare, detect, reset, dispose, getDiagnostics: () => ({ loaded: Object.keys(instances), loading: Object.keys(loading), calls: { ...counts }, delegates: { ...delegates }, errors: { ...errors } }) };
}
