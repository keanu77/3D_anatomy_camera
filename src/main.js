import { loadSettings, BODY_LAYERS, applyFocus, applyPreset } from './settings.js';
import { regionById } from './regions.js';
import { createCamera } from './camera.js';
import { createTrackers } from './trackers.js';
import { bindUI } from './ui.js';

const settings = loadSettings();
const hash = new URLSearchParams(location.hash.slice(1)), query = new URLSearchParams(location.search);
const has = key => hash.has(key) || query.has(key);
const state = { paused: false, mirror: !has('rear'), performance: settings.performance === 'auto' ? (matchMedia('(max-width:900px)').matches ? 'balanced' : 'high') : settings.performance, mode: 'intro' };
const $ = id => document.getElementById(id), video = $('video');
let scene, scenePromise, raf = 0, operation = 0, lastVideoTime = -1, preparing = false, pendingChange = false, changeTask = null, trackingWarning = '';
let autoAt = 0, lowChecks = 0, lastFrameAt = 0;
const ui = bindUI({ settings, onChange: changed, onStart: start, onDemo: demo, onSwitch: switchCamera, onStop: stop });
const trackers = createTrackers({ onStatus: text => ui.status(text, '', true) });
const camera = createCamera({ video, onChange: value => {
  state.mirror = value.mirror;
  $('stage').classList.toggle('mirrored', state.mirror);
  if (value.running && value.width && value.height) $('stage').style.setProperty('--ar', String(value.width / value.height));
  lastVideoTime = -1; trackers.reset(); scene?.resize();
} });

function bodyOn() { return BODY_LAYERS.some(key => settings[key]); }
function syncDemoAspect() {
  if (state.mode !== 'demo') return;
  const portraitBody = bodyOn() && matchMedia('(max-width:600px) and (orientation:portrait)').matches;
  $('stage').style.setProperty('--ar', String(portraitBody ? 9 / 16 : 4 / 3));
  scene?.resize();
}
function needs() {
  let hand = settings.hands || settings.reveal === 'lens' || settings.showdata;
  let pose = bodyOn();
  if (state.performance === 'lite' && hand && pose) {
    if (settings.reveal === 'lens') pose = false; else hand = false;
  }
  return { face: ['skull', 'brain', 'muscles', 'eyes', 'outline', 'nerves'].some(key => settings[key]) || settings.showdata,
    hands: hand, pose, mask: pose && state.performance !== 'lite', performance: state.performance };
}
async function getScene() {
  if (!scenePromise) scenePromise = import('./scene.js').then(({ createScene }) => createScene({ settings, state, onStats: autoPerformance })).then(result => scene = result).catch(error => { scenePromise = null; throw error; });
  return scenePromise;
}
function autoPerformance(stats) {
  const sampledAt = performance.now();
  if (state.mode !== 'live' || settings.performance !== 'auto' || sampledAt - autoAt < 2000) return;
  autoAt = sampledAt;
  lowChecks = stats.fps < 18 ? lowChecks + 1 : 0;
  if (lowChecks >= 2 && state.performance !== 'lite') {
    state.performance = state.performance === 'high' ? 'balanced' : 'lite'; lowChecks = 0;
    camera.setProfile(state.performance).catch(() => {});
    changed();
  }
}
// Pausing freezes the picture so a structure can be picked at leisure. In live mode one more
// inference runs on the frozen video frame (freezeFrame), so the anatomy matches what is shown.
let freezeFrame = false;
function setPaused(value) {
  const paused = !!value && state.mode !== 'intro';
  if (paused === state.paused) return;
  state.paused = paused;
  const button = $('pause-toggle');
  if (button) { button.setAttribute('aria-pressed', String(paused)); button.textContent = paused ? '繼續' : '暫停'; button.setAttribute('aria-label', paused ? '繼續畫面' : '暫停畫面'); }
  $('stage').classList.toggle('paused', paused);
  scene?.setFrozen(paused);
  if (state.mode === 'live') {
    if (paused) { video.pause(); freezeFrame = true; lastVideoTime = -1; }
    else { freezeFrame = false; lastVideoTime = -1; video.play().catch(() => {}); }
  }
  if (paused) ui.status('畫面已暫停：拖曳可旋轉，雙指或滾輪可縮放，點一下可點選構造，雙擊還原；按「繼續」恢復。', 'ok', true);
  schedule();
}
function schedule() { if (!raf && !document.hidden && state.mode !== 'intro' && (!state.paused || freezeFrame)) raf = requestAnimationFrame(tick); }
function tick(now) {
  raf = 0;
  if (document.hidden || state.mode === 'intro' || !scene || (state.paused && !freezeFrame)) return;
  try {
    if (state.mode === 'demo') {
      scene.demo(now, { still: has('still'), body: bodyOn() });
      if (!has('still')) schedule();
      return;
    }
    schedule();
    if (preparing || video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const wanted = needs();
    const current = operation;
    const freezing = freezeFrame;
    const accepted = trackers.detect(video, now, wanted, result => {
      if (current !== operation || state.mode !== 'live' || document.hidden || preparing || (state.paused && !freezing)) return;
      if (freezing) freezeFrame = false;
      scene.update({ now: performance.now(), ...result });
    }, error => { if (current === operation && state.mode === 'live') { stop(); showError(error); } });
    // The tracker takes one frame at a time; a refused freeze frame must be offered again.
    if (accepted === false && freezing) lastVideoTime = -1;
    if (now - lastFrameAt > 1000 && !state.paused) {
      lastFrameAt = now;
      const d = scene.getDiagnostics();
      const msg = wanted.pose && !d.poseFound ? regionById(settings.focus)?.frame || '往後退，讓肩膀、臀部與四肢入鏡。' : d.headFound || d.poseFound ? '追蹤中，影像只在這部裝置處理。' : wanted.face ? '請面向鏡頭，讓臉部保持在光線充足的位置。' : '追蹤中。';
      ui.status(`${msg} ${state.performance === 'lite' ? '輕量模式。' : ''}${trackingWarning}`, d.headFound || d.poseFound ? 'ok' : '', true);
    }
  } catch (error) { cancelAnimationFrame(raf); raf = 0; stop(); showError(error); }
}
async function changed({ throwOnError = false } = {}) {
  scene?.reconcileLoads();
  trackers.reset();
  if (freezeFrame) lastVideoTime = -1;
  pendingChange = true;
  const current = operation;
  if (!changeTask) {
    preparing = true;
    changeTask = (async () => {
      while (pendingChange) {
        pendingChange = false;
        if (settings.performance !== 'auto' && settings.performance !== state.performance) {
          state.performance = settings.performance;
          await camera.setProfile(state.performance).catch(() => {});
        }
        if (scene && bodyOn()) {
          try { await scene.ensureBody(); } catch (error) { if (bodyOn()) throw error; }
        }
        if (state.mode === 'live') {
          const wanted = needs(), prepared = await trackers.prepare(wanted);
          trackingWarning = prepared.failures.map(({ name }) => `${{ face: '臉部', hands: '手部', pose: '身體' }[name]}追蹤暫停。`).join('');
          if (prepared.failures.length && !prepared.loaded.some(name => wanted[name])) throw new Error('所需追蹤模型無法載入，請確認網路後重試');
        }
      }
    })();
  }
  const task = changeTask;
  try {
    await task;
    syncDemoAspect();
    if (state.paused) scene?.refresh();
    else if (state.mode === 'demo') scene?.demo(performance.now(), { still: has('still'), body: bodyOn() });
    schedule();
    return true;
  } catch (error) { if (current === operation) showError(error); if (throwOnError) throw error; return false; }
  finally { if (changeTask === task) { preparing = false; changeTask = null; } }
}
async function start() {
  setPaused(false);
  if (!isSecureContext) { ui.status('需要 HTTPS 才能使用攝影機，請使用安全連線開啟此網站。', 'bad'); return; }
  const current = ++operation;
  cancelAnimationFrame(raf); raf = 0;
  $('start').disabled = true; $('demo-start').disabled = true;
  ui.status('正在啟動攝影機…');
  try {
    const running = await camera.start('user', state.performance);
    if (!running || current !== operation) return;
    await getScene();
    if (current !== operation) return;
    state.mode = 'live'; $('intro').hidden = true;
    await changed({ throwOnError: true });
    if (current === operation) schedule();
  } catch (error) { if (current === operation) { camera.stop(); state.mode = 'intro'; $('intro').hidden = false; showError(error); } }
  finally { if (current === operation) { $('start').disabled = false; $('demo-start').disabled = false; } }
}
async function demo() {
  setPaused(false);
  const current = ++operation;
  camera.stop(); cancelAnimationFrame(raf); raf = 0;
  state.mirror = !has('rear'); state.mode = 'demo';
  syncDemoAspect();
  $('demo-start').disabled = true;
  try {
    await getScene();
    if (current !== operation) return;
    if (bodyOn()) await scene.ensureBody();
    if (current !== operation) return;
    $('intro').hidden = true;
    ui.status('示範模式，沒有使用攝影機。', 'ok');
    scene.resize(); schedule();
  } catch (error) { if (current === operation) { state.mode = 'intro'; $('intro').hidden = false; showError(error); } }
  finally { if (current === operation) $('demo-start').disabled = false; }
}
async function switchCamera() {
  setPaused(false);
  if (state.mode === 'demo') { state.mirror = !state.mirror; scene?.demo(performance.now(), { still: has('still'), body: bodyOn() }); return; }
  if (state.mode !== 'live') { ui.status('請先啟動鏡頭，再切換前後鏡頭。'); return; }
  const current = operation;
  $('camera-switch').disabled = $('camera-switch-mobile').disabled = true;
  try {
    await camera.switch();
    if (current === operation && state.mode === 'live' && camera.getDiagnostics().running) { scene?.resize(); await changed(); }
  }
  catch (error) {
    if (current === operation) {
      if (state.mode === 'live' && camera.getDiagnostics().running) await changed();
      showError(error);
    }
  }
  finally { $('camera-switch').disabled = $('camera-switch-mobile').disabled = false; }
}
function stop() {
  setPaused(false);
  operation++; state.mode = 'intro'; camera.stop(); cancelAnimationFrame(raf); raf = 0;
  scene?.clear();
  $('start').disabled = false; $('demo-start').disabled = false;
  $('intro').hidden = false; ui.status('鏡頭已停止。你可以重新啟動或觀看示範。');
}
function showError(error) {
  const text = error?.name === 'NotAllowedError' ? '攝影機權限未開啟。請在瀏覽器允許相機，再按啟動鏡頭。' : error?.name === 'NotFoundError' ? '找不到可用的攝影機，仍可使用示範模式。' : `無法完成操作：${error?.message || error}。可重新嘗試。`;
  ui.status(text, 'bad', true);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; trackers.reset(); }
  else {
    lastVideoTime = -1; autoAt = performance.now(); lowChecks = 0;
    if (state.mode === 'live') changed(); else { trackers.reset(); schedule(); }
  }
});
window.addEventListener('pagehide', () => { stop(); trackers.dispose(); scene?.dispose(); });
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
video.addEventListener('resize', () => {
  if (video.videoWidth && video.videoHeight) $('stage').style.setProperty('--ar', String(video.videoWidth / video.videoHeight));
  scene?.resize();
});
window.addEventListener('resize', syncDemoAspect);
$('stage').addEventListener('pausetoggle', () => setPaused(!state.paused));
if (import.meta.env.DEV) {
  window.__ANATOMY_DIAGNOSTICS__ = () => ({ state: { ...state }, renderer: scene?.getDiagnostics() || null, camera: camera.getDiagnostics(), trackers: trackers.getDiagnostics(), inferenceMeanMs: trackers.getDiagnostics().inferenceMeanMs });
  window.__ANATOMY_APP__ = { demo, start, stop, switchCamera, setPaused, settings, changed, inspectionProbe:query=>scene?.inspectionProbe(query) };
}
if (has('body')) { applyPreset(settings, 'full'); ui.sync(); }
if (has('bodyMuscles')) { applyPreset(settings, 'bodyMuscles'); ui.sync(); }
if (has('nervous')) { applyPreset(settings, 'nervous'); ui.sync(); }
if (has('systems')) { applyPreset(settings, 'systems'); ui.sync(); }
if (has('focus')) { applyFocus(settings, hash.get('focus') || query.get('focus')); ui.sync(); }
if (has('peripheral')) { settings.peripheralNerves = true; ui.sync(); }
if (has('demo')) demo();
