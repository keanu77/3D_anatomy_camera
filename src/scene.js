import * as THREE from 'three';
import { createHeadTracker } from './head.js';
import { createHandUpdater, HAND_SEGMENTS } from './hands.js';
import { createBodyRenderer } from './body.js';
import { createInspection } from './inspection.js';
import { createLabels } from './labels.js';
import { decodeGeometry } from './geometry.js';
export { decodeGeometry } from './geometry.js';
import { makeMaterial, setMaterialMode } from './anatomy-material.js';
import { PALETTE, SOLID, GAINS, BASE_LIGHT, SURFACE, solidGain } from './render-style.js';
import { demoBodyPose, demoHandLandmarks } from './demo-pose.js';
import { regionById, regionIncludesMesh, regionPartSelector, focusLabels } from './regions.js';
import { IDENTITY, zoomTarget, gestureZoom, layerTransform } from './focus-zoom.js';
import { LEVEL, isLevel, dragOrbit, orbitElements } from './orbit.js';

/** Rendering owns display transforms, while tracking owns measurement transforms.
 * The retained frame is reused for static views, asynchronous detail arrival and
 * frozen interaction. No render callback starts a second animation loop. */
export async function createScene({ settings, state, onStats = () => {} }) {
  const asset = path => `${import.meta.env.BASE_URL}${path}`;
  const downloads = await Promise.all(['json', 'bin'].map(extension => fetch(asset(`anatomy/head.${extension}`))));
  if (downloads.some(response => !response.ok)) throw new Error('頭手模型下載失敗，請重試');
  const [metadata, bytes] = await Promise.all([downloads[0].json(), downloads[1].arrayBuffer()]);
  const geometry = decodeGeometry(metadata, bytes);
  const byId = id => document.getElementById(id);
  const stage = byId('stage'), video = byId('video'), gl = byId('gl'), shade = byId('shade'), hud = byId('hud');
  const veilContext = shade.getContext('2d'), labelContext = hud.getContext('2d');
  const renderer = new THREE.WebGLRenderer({ canvas: gl, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.setClearAlpha(0);
  const portraitScene = new THREE.Scene(), handScene = new THREE.Scene();
  const perspective = new THREE.PerspectiveCamera(45, 4 / 3, .1, 2000);
  const orthographic = new THREE.OrthographicCamera(0, 640, 480, 0, -2000, 2000);
  const baseProjection = perspective.projectionMatrix.clone();
  const headGroup = new THREE.Group(), jawPivot = new THREE.Group();
  headGroup.matrixAutoUpdate = false;
  headGroup.visible = false;
  portraitScene.add(headGroup);
  jawPivot.position.fromArray(metadata.jawPivot);
  headGroup.add(jawPivot);
  const headMeshes = new Map();
  const layerFor = { eyes: 'eyes', cerebrum: 'brain', hindbrain: 'brain', muscles: 'muscles', cranium: 'skull', jaw: 'skull', skin: 'outline' };
  for (const [name, layer] of Object.entries(layerFor)) {
    const mesh = new THREE.Mesh(geometry[name], makeMaterial(PALETTE[layer], SOLID[layer]));
    mesh.frustumCulled = false;
    mesh.renderOrder = name === 'skin' ? 5 : layer === 'brain' ? 3 : layer === 'muscles' ? 2 : 1;
    if (name === 'jaw') {
      mesh.position.fromArray(metadata.jawPivot).multiplyScalar(-1);
      jawPivot.add(mesh);
    } else headGroup.add(mesh);
    headMeshes.set(name, mesh);
  }
  const skinMask = new THREE.Mesh(geometry.skin, makeMaterial(PALETTE.outline));
  setMaterialMode(skinMask.material, 2);
  skinMask.frustumCulled = false;
  skinMask.renderOrder = -1;
  headGroup.add(skinMask);
  const rigs = Array.from({ length: 2 }, (_, hand) => {
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.visible = false; handScene.add(group);
    const create = name => {
      const mesh = new THREE.Mesh(geometry[name], makeMaterial(PALETTE.hands, SOLID.hands));
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
      mesh.material.uniforms.uOrtho.value = 1;
      group.add(mesh); return mesh;
    };
    return { group, palm: create('hand_palm'), bones: HAND_SEGMENTS.map(([a, b]) => create(`hand_b_${a}_${b}`)),
      pts: null, anatomicalSide: hand ? 'L' : 'R' };
  });
  let width = 640, height = 480, pixelRatio = 1;
  let disposed = false, frozen = false, queued = 0, drawing = false, frameCount = 0, fps = 0, frameTime = null;
  let previousFrame = null, previousDemo = null, focus = null, orbit = { ...LEVEL }, zoom = { ...IDENTITY }, manualZoom = false;
  let lens = null, cursor = null;
  const getSize = () => ({ width, height });
  const clipState = { on: 0, x: 0, y: 0, w: 0 };
  const headTracker = createHeadTracker({ settings, meta: metadata, camera: perspective, group: headGroup, jawPivot,
    getBaseProjection: () => baseProjection });
  const hands = createHandUpdater({ settings, getSize });
  let inspection;
  const targetForRig = rig => ({ mesh: rig.mesh, parent: rig.entry.name, bundle: rig.bundle, frame: rig.entry.frame });
  const focusedBody = () => focus ? {
    includes: rig => regionIncludesMesh(focus, rig.entry.name, settings.focusSide) && inspection.filterReady(targetForRig(rig)),
    labels: rig => {
      const anchors = inspection.partAnchors(targetForRig(rig));
      return anchors ? focusLabels(anchors.anchors, anchors.allParts, settings.labelLanguage) : null;
    },
  } : null;
  const body = createBodyRenderer({ settings, state, getSize, makeMaterial, decodeGeometry, asset,
    getHeadContext: () => ({ group: headGroup, head: headTracker.state, camera: perspective, clipState }),
    getHandContext: () => ({ rigs, bones: HAND_SEGMENTS }), getFocus: focusedBody });
  const targets = () => {
    const list = [];
    for (const [parent, mesh] of headMeshes) if (parent !== 'skin') list.push({ mesh, parent, bundle: 'head',
      instance: `head:${parent}`, layer: layerFor[parent], camera: perspective, pass: 1,
      inspectable: ['cranium', 'jaw', 'muscles'].includes(parent) });
    rigs.forEach((rig, hand) => [rig.palm, ...rig.bones].forEach((mesh, index) => {
      const parent = index ? `hand_b_${HAND_SEGMENTS[index - 1].join('_')}` : 'hand_palm';
      list.push({ mesh, parent, bundle: 'head', layer: 'hands', instance: `hand:${hand}:${parent}`,
        side: rig.anatomicalSide, camera: orthographic, pass: 2, inspectable: true });
    }));
    for (const target of body.inspectionTargets()) list.push({ ...target,
      camera: target.frame === 'head' ? perspective : orthographic,
      pass: target.frame === 'head' ? 1 : target.frame === 'hand' ? 2 : 0 });
    return list;
  };
  const requestRefresh = () => {
    if (disposed || queued || drawing || !previousFrame || state.mode === 'intro') return;
    queued = requestAnimationFrame(() => { queued = 0; refresh(); });
  };
  inspection = createInspection({ stage, getTargets: targets, getView: () => ({ width, height, mirror: state.mirror,
    solid: settings.style === 'solid', lens, zoom }), decodeGeometry, asset,
    redraw: requestRefresh, onLoaded: requestRefresh });
  const labels = createLabels({ settings, state, metadata, getSize, headGroup, jawMesh: headMeshes.get('jaw'),
    headCamera: perspective, handCamera: orthographic, rigs, getBodyLabels: value => body.labels(value),
    getLens: () => lens, getZoom: () => zoom, getClip: () => clipState });

  function syncFocus() {
    focus = regionById(settings.focus);
    inspection.setPartFilter(focus ? { key: `${focus.id}:${settings.focusSide}`,
      select: target => regionPartSelector(focus, target.parent, settings.focusSide) } : null);
  }
  function headReveal() {
    const bounds = metadata.meshes.find(mesh => mesh.name === 'skin');
    Object.assign(clipState, { on: 0, x: 0, y: 0, w: 0 });
    const c = settings.cut, mode = settings.reveal;
    if (mode === 'left' || mode === 'right') {
      clipState.on = 1;
      clipState.x = (mode === 'left' ? 1 : -1) * (state.mirror ? 1 : -1);
      clipState.w = clipState.x > 0 ? bounds.min[0] + c * bounds.size[0] : -bounds.min[0] - (1 - c) * bounds.size[0];
    } else if (mode === 'top' || mode === 'bottom') {
      clipState.on = 1; clipState.y = mode === 'top' ? 1 : -1;
      clipState.w = clipState.y > 0 ? bounds.min[1] + (1 - c) * bounds.size[1] : -bounds.min[1] - c * bounds.size[1];
    }
    jawPivot.updateMatrix(); headMeshes.get('jaw').updateMatrix();
    for (const [name, mesh] of [...headMeshes, ['mask', skinMask]]) {
      const material = mesh.material, u = material.uniforms, layer = layerFor[name];
      const mask = name === 'mask', outline = name === 'skin';
      mesh.visible = mask ? (settings.real < 1) : !!settings[layer];
      setMaterialMode(material, mask ? 2 : outline ? 0 : settings.style === 'solid' ? 1 : 0);
      u.uOpacity.value = mask ? 1 - settings.real : 1;
      u.uFeather.value = settings.feather * .75;
      u.uBase.value = BASE_LIGHT[layer] || 0;
      u.uGain.value = settings.style === 'solid' && !outline ? solidGain(settings.bright) : settings.bright * (GAINS[layer] || 0);
      u.uClipOn.value = clipState.on;
      u.uClip.value.set(clipState.x, clipState.y, 0, clipState.w);
      u.uCutSoft.value = settings.feather * 5;
      u.uToHead.value.identity();
      if (name === 'jaw') u.uToHead.value.multiplyMatrices(jawPivot.matrix, mesh.matrix);
    }
    for (const rig of rigs) for (const mesh of [rig.palm, ...rig.bones]) {
      setMaterialMode(mesh.material, settings.style === 'solid' ? 1 : 0);
      const u = mesh.material.uniforms;
      u.uGain.value = settings.style === 'solid' ? solidGain(settings.bright) : GAINS.hands * settings.bright;
      u.uBase.value = BASE_LIGHT.hands;
      u.uFeather.value = settings.feather * .75;
    }
  }
  function syncLens() {
    lens = null;
    if (settings.reveal === 'lens') {
      const tracked = rigs.find(rig => rig.pts)?.pts?.[8];
      const center = tracked ? { x: state.mirror ? width - tracked.x : tracked.x, y: height - tracked.y } : cursor || { x: width * .78, y: height * .55 };
      lens = { ...center, r: Math.min(width, height) * (.055 + .38 * settings.cut) };
    }
    for (const canvas of [gl, shade]) {
      if (!lens) { canvas.style.maskImage = ''; continue; }
      const rawX = state.mirror ? width - lens.x : lens.x;
      const edge = Math.max(1, lens.r * settings.feather * .25);
      canvas.style.maskImage = `radial-gradient(circle at ${rawX / width * 100}% ${lens.y / height * 100}%, black ${Math.max(0, lens.r - edge)}px, transparent ${lens.r}px)`;
    }
  }
  function applyOrbit() {
    const bodyPivot = body.orbitPivot();
    body.setOrbit(new THREE.Matrix4().fromArray(orbitElements(orbit, bodyPivot?.toArray() || [width / 2, height / 2, 0])));
    for (const rig of rigs) {
      const pivot = bodyPivot || rig.pts?.[0] || new THREE.Vector3(width / 2, height / 2, 0);
      rig.group.matrix.fromArray(orbitElements(orbit, pivot.toArray()));
      rig.group.matrixWorldNeedsUpdate = true;
    }
    const pivot = headTracker.state.pos.clone();
    if (bodyPivot && headTracker.state.found) {
      const projected = pivot.clone().project(perspective);
      pivot.set(bodyPivot.x / width * 2 - 1, bodyPivot.y / height * 2 - 1, projected.z).unproject(perspective);
    }
    headGroup.matrix.premultiply(new THREE.Matrix4().fromArray(orbitElements(orbit, pivot.toArray())));
    headGroup.matrixWorldNeedsUpdate = true;
  }
  function syncZoom() {
    if (!manualZoom) zoom = focus && settings.focusZoom ? zoomTarget(body.focusBounds(), width, height) : { ...IDENTITY };
    const rect = stage.getBoundingClientRect();
    const transform = layerTransform(zoom, state.mirror, width, height, rect.width, rect.height);
    for (const layer of [video, gl, shade]) {
      layer.style.transform = transform;
      layer.style.transformOrigin = transform ? '0 0' : '';
    }
  }
  function draw(frame, { hold = false, instant = false } = {}) {
    if (disposed || drawing || state.mode === 'intro') return;
    drawing = true;
    try {
      syncFocus();
      stage.classList.toggle('mirrored', state.mirror);
      const face = frame.face;
      const blend = face?.faceBlendshapes?.[0]?.categories?.find(value => value.categoryName === 'jawOpen')?.score || 0;
      headTracker.update(face?.facialTransformationMatrixes?.[0]?.data, face?.faceLandmarks?.[0], blend);
      const handNames = [];
      rigs.forEach((rig, index) => {
        const name = frame.hands?.handedness?.[index]?.[0]?.categoryName || (index ? 'Left' : 'Right');
        rig.anatomicalSide = /^r/i.test(name) ? 'R' : 'L';
        hands.update(rig, frame.hands?.landmarks?.[index], rig.anatomicalSide === 'R');
        if (rig.pts) handNames.push(name.toLowerCase());
        rig.group.visible &&= settings.hands;
      });
      headReveal();
      body.update({ ...frame, instant, hold });
      body.syncHead();
      applyOrbit();
      inspection.sync();
      syncZoom(); syncLens();
      veilContext.clearRect(0, 0, width, height);
      if (frozen && !isLevel(orbit)) {
        veilContext.save();
        veilContext.globalAlpha = 1 - settings.real;
        veilContext.fillStyle = SURFACE.maskCss;
        veilContext.fillRect(0, 0, width, height);
        veilContext.restore();
      } else {
        body.drawVeil(veilContext, frame.mask);
        if (settings.hands) for (const landmarks of frame.hands?.landmarks || []) hands.drawVeil(veilContext, landmarks, 1 - settings.real);
      }
      renderer.clear(true, true, true);
      renderer.render(body.scene, orthographic);
      renderer.clearDepth(); renderer.render(portraitScene, perspective);
      renderer.clearDepth(); renderer.render(handScene, orthographic);
      labels.draw(labelContext);
      // A disabled label layer must not retain a composited canvas surface.
      hud.hidden = !settings.labels;
      frameCount++;
      if (frameTime !== null && frame.now > frameTime) fps = fps ? .9 * fps + .1 * 1000 / (frame.now - frameTime) : 1000 / (frame.now - frameTime);
      frameTime = frame.now;
      byId('data').hidden = !settings.showdata;
      byId('data').textContent = `face ${headTracker.state.found ? 'tracked' : 'not found'}\nhands ${handNames.join(' + ') || 'not found'}\nbody parts ${body.getDiagnostics().visibleParts}\nfit ${headTracker.state.fitS.toFixed(3)}\n${Math.round(fps)} frames/s`;
      onStats({ fps, frameCount });
    } finally { drawing = false; }
  }
  function update(frame) {
    previousDemo = null;
    previousFrame = { ...frame, mask: null };
    draw(frame, { hold: frozen });
  }
  function demo(now, options = {}) {
    previousDemo = { now, options: { ...options } };
    const still = !!options.still, full = !!options.body;
    const pose = full ? demoBodyPose(width, height, now, still) : null;
    const t = still ? 0 : now / 1000;
    const depth = full ? 215 : 48;
    const center = full ? pose.landmarks[0][0] : { x: .5, y: .52 };
    const focal = baseProjection.elements[5];
    const position = new THREE.Vector3((center.x * 2 - 1) * depth / focal * perspective.aspect, (1 - center.y * 2) * depth / focal - (full ? 0 : 3), -depth);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(still ? -.035 : Math.sin(t * .6) * .05,
      still ? -.12 : Math.sin(t * .45) * .18, still ? .015 : Math.sin(t * .3) * .025));
    const matrix = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
    const landmarks = Array.from({ length: 468 }, () => ({ x: center.x, y: center.y, z: 0 }));
    for (const [id, point] of Object.entries(metadata.fit)) {
      const p = new THREE.Vector3(...point).applyMatrix4(matrix).applyMatrix4(baseProjection);
      landmarks[Number(id)] = { x: (p.x + 1) / 2, y: (1 - p.y) / 2, z: 0 };
    }
    const handLandmarks = rigs.map((_, index) => {
      const wrist = full ? pose.landmarks[0][index ? 15 : 16] : { x: index ? .78 : .22, y: .72, z: 0 };
      return demoHandLandmarks(metadata.handReference, { wrist: { x: wrist.x, y: wrist.y, z: wrist.z },
        left: index === 1, width, height, length: height * (full ? .115 : .34),
        angle: full ? (index ? -.1 : .1) : Math.PI + (index ? -.18 : .18) + (still ? 0 : Math.sin(t * .65) * .12) });
    });
    const frame = { now, pose, hands: { landmarks: handLandmarks, handedness: [[{ categoryName: 'Right' }], [{ categoryName: 'Left' }]] },
      face: { facialTransformationMatrixes: [{ data: matrix.elements }], faceLandmarks: [landmarks],
        faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: still ? .12 : .15 + .12 * Math.sin(t * .8) }] }] } };
    previousFrame = frame;
    // Deterministic demo redraws use the current synthetic pose immediately.
    if (still) headTracker.update(null);
    draw(frame, { instant: true, hold: frozen });
  }
  function refresh() {
    if (!previousFrame || disposed || state.mode === 'intro') return;
    draw({ ...previousFrame, mask: null }, { hold: true, instant: state.mode === 'demo' });
  }
  function resize() {
    if (disposed) return;
    const rect = stage.getBoundingClientRect(), nextWidth = Math.max(1, Math.round(rect.width)), nextHeight = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(devicePixelRatio || 1, state.performance === 'high' ? 2 : 1);
    if (width === nextWidth && height === nextHeight && pixelRatio === ratio && gl.width === Math.round(width * ratio)) return;
    width = nextWidth; height = nextHeight; pixelRatio = ratio;
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    shade.width = hud.width = width; shade.height = hud.height = height;
    perspective.aspect = width / height; perspective.updateProjectionMatrix(); baseProjection.copy(perspective.projectionMatrix);
    Object.assign(orthographic, { left: 0, right: width, top: height, bottom: 0 }); orthographic.updateProjectionMatrix();
    body.reset(); headTracker.update(null);
    if (previousDemo) demo(previousDemo.now, previousDemo.options); else refresh();
  }
  function reconcileLoads() {
    body.reconcileLoads(); syncFocus(); inspection.reconcile(); requestRefresh();
  }
  async function ensureBody() {
    const loaded = await body.ensureLoaded();
    if (!loaded && body.getDiagnostics().anatomyError) throw new Error(body.getDiagnostics().anatomyError);
    return loaded;
  }
  function resetView() {
    orbit = { ...LEVEL }; manualZoom = false; zoom = { ...IDENTITY };
  }
  function setFrozen(value) {
    frozen = !!value;
    if (!frozen) resetView();
    refresh();
  }
  const pointers = new Map();
  let drag = null, pinch = null, gestureEnded = false;
  const displayPoint = event => {
    const rect = stage.getBoundingClientRect();
    return [(event.clientX - rect.left) * width / rect.width, (event.clientY - rect.top) * height / rect.height];
  };
  const pair = () => {
    const [a, b] = [...pointers.values()];
    return { center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], distance: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  };
  const down = event => {
    if (!frozen || event.button !== 0 || event.target.closest('button,a,input,select')) return;
    if (event.isPrimary) { pointers.clear(); gestureEnded = false; }
    const point = displayPoint(event); pointers.set(event.pointerId, point);
    if (pointers.size === 1) drag = { point, orbit: { ...orbit } };
    else if (pointers.size === 2) { pinch = { ...pair(), zoom: { ...zoom } }; drag = null; }
    try { stage.setPointerCapture(event.pointerId); } catch { /* Synthetic test pointers have no native capture. */ }
  };
  const move = event => {
    const point = displayPoint(event);
    if (!frozen) {
      if (settings.reveal === 'lens') { cursor = { x: point[0], y: point[1] }; requestRefresh(); }
      return;
    }
    if (!pointers.has(event.pointerId) || gestureEnded) return;
    pointers.set(event.pointerId, point);
    if (pinch && pointers.size === 2) {
      const next = pair();
      zoom = gestureZoom(pinch.zoom, pinch.center, next.center, next.distance / pinch.distance, width, height);
      manualZoom = true;
    } else if (drag) orbit = dragOrbit(drag.orbit, point[0] - drag.point[0], point[1] - drag.point[1], width, state.mirror);
    refresh();
  };
  const up = event => {
    if (pinch) gestureEnded = true;
    pointers.delete(event.pointerId); drag = null; pinch = null;
    if (!pointers.size) gestureEnded = false;
  };
  const wheel = event => {
    if (!frozen || event.target.closest('button,a,input,select')) return;
    event.preventDefault();
    const at = displayPoint(event);
    zoom = gestureZoom(zoom, at, at, Math.exp(-event.deltaY * .002), width, height);
    manualZoom = true; refresh();
  };
  const doubleClick = event => {
    if (frozen && !event.target.closest('button,a,input,select')) { resetView(); refresh(); }
  };
  const listeners = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['dblclick', doubleClick], ['wheel', wheel]];
  for (const [event, handler] of listeners) stage.addEventListener(event, handler, event === 'wheel' ? { passive: false } : undefined);
  const observer = new ResizeObserver(resize); observer.observe(stage);
  function clear() {
    previousFrame = previousDemo = null;
    cancelAnimationFrame(queued); queued = 0;
    body.reconcileLoads({ cancelAll: true }); body.reset();
    headTracker.update(null);
    for (const rig of rigs) hands.update(rig, null, true);
    void inspection.clear();
    frozen = false; resetView();
    renderer.clear(true, true, true);
    veilContext.clearRect(0, 0, width, height); labelContext.clearRect(0, 0, width, height);
    for (const layer of [video, gl, shade]) { layer.style.transform = ''; layer.style.transformOrigin = ''; layer.style.maskImage = ''; }
  }
  function dispose() {
    if (disposed) return;
    clear(); disposed = true; observer.disconnect();
    for (const [event, handler] of listeners) stage.removeEventListener(event, handler);
    inspection.dispose(); body.dispose();
    for (const scene of [portraitScene, handScene]) scene.traverse(object => object.material?.dispose());
    for (const mesh of Object.values(geometry)) mesh.dispose();
    renderer.dispose();
  }
  function getDiagnostics() {
    return { width, height, pixelRatio, frameCount, fps, headFound: headTracker.state.found, frozen,
      focus: focus?.id || null, orbit: { ...orbit }, zoom: { ...zoom },
      labelLayout: labels.getLayout(), inspection: inspection.getDiagnostics(), ...body.getDiagnostics() };
  }
  resize();
  return { resize, reconcileLoads, ensureBody, demo, update, setFrozen, refresh, clear, dispose,
    getDiagnostics, inspectionProbe: query => inspection.probe(query) };
}
