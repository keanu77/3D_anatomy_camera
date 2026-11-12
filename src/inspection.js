import * as THREE from 'three';
import { HIGHLIGHT } from './render-style.js';
import { createInspectionUI } from './inspection-ui.js';
import { effectivelyVisible, filterPartRanges, partCentroids, pickAnatomy, validatePartRanges } from './picking.js';
import { unzoomPoint, zoomPoint } from './focus-zoom.js';
import { createStructureInfo } from './structure-info.js';

export function createInspection({ stage, getTargets, getView, decodeGeometry, asset, redraw, onLoaded = () => {} }) {
  const bundles = new Map(), entries = new Map(), originals = new Map(), views = new Map();
  // Region focus: { key, select(target) -> null | part => boolean }. Independent of picking being on.
  let partFilter = null;
  let active = false, disposed = false, generation = 0, pickRevision = 0, candidates = [], selectedIndex = -1, highlight = null, down = null;
  const keyFor = target => `${target.bundle}:${target.parent}`;
  // Pointer positions arrive in display pixels; picking works in the unzoomed view.
  const toView = (view, x, y) => view.zoom ? unzoomPoint(view.zoom, x, y) : [x, y];
  const toDisplay = (view, x, y) => view.zoom ? zoomPoint(view.zoom, x, y) : [x, y];
  // Reference text is downloaded on the first selection, never before someone asks for a structure.
  const info = createStructureInfo({ url: asset('anatomy/structure-info.json') });
  const ui = createInspectionUI({ stage, onEnable: enable, onChoose: choose, onClear: clearSelection,
    getInfo: part => ({ state: info.state(), entry: info.find(part) }) });
  function loadInfo() {
    if (info.state() !== 'ready') void info.load().then(() => { if (!disposed) ui.refreshInfo(); });
  }

  /** Part ranges for a target: from the individual bundle, or published with the mesh itself. */
  function entryFor(target) {
    const key = keyFor(target);
    if (!entries.has(key) && target.ownParts) {
      validatePartRanges({ name: target.parent, ni: target.mesh.geometry.index.count, parts: target.ownParts });
      entries.set(key, { parts: target.ownParts, geometry: target.mesh.geometry, own: true });
    }
    return entries.get(key);
  }
  /** The entry as drawn: the published one, or a derived one holding only the focused parts. */
  function viewFor(target) {
    const key = keyFor(target), entry = entryFor(target), keep = entry?.geometry && partFilter?.select(target);
    if (!keep) return entry;
    if (!views.has(key)) {
      const source = entry.geometry, { index, parts } = filterPartRanges(entry.parts, source.index.array, keep);
      let view = entry;
      if (parts.length !== entry.parts.length) {
        // Fresh attribute objects over the same arrays: disposing a view must not free the source's buffers.
        const geometry = new THREE.BufferGeometry();
        for (const name of ['position', 'normal']) geometry.setAttribute(name, new THREE.BufferAttribute(source.attributes[name].array, 3));
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        // Bounds of the kept parts only; the shared vertex array still holds the rest of the mesh.
        geometry.boundingBox = new THREE.Box3().setFromPoints(Array.from(new Set(index), vertex => new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, vertex)));
        view = { parts, geometry };
      }
      views.set(key, view);
    }
    return views.get(key);
  }
  function targets() {
    return getTargets().map(target => ({ ...target, parts: active ? viewFor(target)?.parts || [] : [] }));
  }
  function restore() {
    for (const [mesh, geometry] of originals) mesh.geometry = geometry;
    originals.clear();
  }
  function removeHighlight() {
    if (!highlight) return;
    highlight.removeFromParent(); highlight.geometry.dispose(); highlight.material.dispose(); highlight = null;
  }
  function clearSelection() {
    pickRevision++;
    removeHighlight(); candidates = []; selectedIndex = -1; ui.showSelection(null);
    if (!disposed) redraw();
  }
  function choose(index) {
    if (!Number.isInteger(index) || !candidates[index]) return;
    removeHighlight(); selectedIndex = index;
    const hit = candidates[index], source = hit.target.mesh;
    const geometry = source.geometry.clone(); geometry.setDrawRange(hit.sourcePart.start, hit.sourcePart.count);
    highlight = new THREE.Mesh(geometry, source.material.clone());
    highlight.matrixAutoUpdate = false; highlight.frustumCulled = false; highlight.renderOrder = 1000;
    highlight.material.depthTest = false; highlight.material.depthWrite = false; highlight.material.blending = THREE.NormalBlending;
    source.parent.add(highlight); syncHighlight(); loadInfo();
    ui.showSelection({ parts: candidates.map(value => value.part), selectedIndex }); redraw();
  }
  function syncHighlight() {
    if (!highlight) return;
    const hit = candidates[selectedIndex], current = getTargets().find(target => target.instance === hit.target.instance);
    if (!active || !current || !effectivelyVisible(current.mesh) || current.side !== hit.target.side) { clearSelection(); return; }
    highlight.matrix.copy(current.mesh.matrix); highlight.matrixWorldNeedsUpdate = true;
    const source = current.mesh.material.uniforms, output = highlight.material.uniforms;
    for (const [name, uniform] of Object.entries(source)) {
      if (output[name]?.value?.copy) output[name].value.copy(uniform.value);
      else if (output[name]) output[name].value = uniform.value;
    }
    output.uColor.value.set(HIGHLIGHT.color); output.uSolidColor.value.set(HIGHLIGHT.color);
    output.uGain.value = HIGHLIGHT.gain; output.uMode.value = 1; output.uOpacity.value = HIGHLIGHT.opacity;
  }
  function applyGeometry() {
    for (const target of getTargets()) {
      const entry = entryFor(target);
      if (!entry || !target.inspectable) continue;
      if (!entry.geometry) {
        validatePartRanges({ name: target.parent, ni: target.mesh.geometry.index.count, parts: entry.parts });
        continue;
      }
      const view = viewFor(target);
      if (active || view !== entry) {
        if (!originals.has(target.mesh)) originals.set(target.mesh, target.mesh.geometry);
        target.mesh.geometry = view.geometry;
      } else if (originals.has(target.mesh)) {
        target.mesh.geometry = originals.get(target.mesh); originals.delete(target.mesh);
      }
    }
  }
  function disposeViews() {
    for (const [key, view] of views) if (view !== entries.get(key)) view.geometry.dispose();
    views.clear();
  }
  function setPartFilter(next) {
    if (disposed || (next?.key ?? null) === (partFilter?.key ?? null)) return;
    clearSelection(); restore();
    disposeViews(); partFilter = next || null;
    if (active || partFilter) { applyGeometry(); void ensure(); }
  }
  /** False while a mesh still shows every part because its focused geometry has not arrived. */
  function filterReady(target) {
    return !partFilter?.select(target) || !!entryFor(target)?.geometry || !!bundles.get('body')?.error;
  }
  function partAnchors(target) {
    const entry = entryFor(target);
    if (!entry?.geometry) return null;
    const view = viewFor(target);
    view.anchors ||= partCentroids(view.parts, view.geometry.index.array, view.geometry.attributes.position.array);
    return { anchors: view.anchors, allParts: entry.parts };
  }
  function requiredBundles() {
    const visible = active ? getTargets().filter(target => target.inspectable && !target.ownParts && effectivelyVisible(target.mesh))
      .map(target => target.bundle === 'head' ? 'head' : 'body') : [];
    // Focused meshes stay hidden until their parts arrive, so visibility cannot be what requests them.
    return [...new Set([...visible, ...(partFilter ? ['body'] : [])])];
  }
  async function loadBundle(name) {
    const prior = bundles.get(name);
    if (prior?.ready) return true;
    if (prior?.promise) return prior.promise;
    if (prior?.error) return false;
    const controller = new AbortController(), token = generation, record = { controller };
    bundles.set(name, record); ui.setLoading(true);
    record.promise = (async () => {
      let geometries;
      try {
        const responses = await Promise.all(['json','bin'].map(extension => fetch(asset(`anatomy/individual-${name}.${extension}`), { signal: controller.signal })));
        if (responses.some(response => !response.ok)) throw new Error('個別構造資料下載失敗，請重試。');
        const [metadata, buffer] = await Promise.all([responses[0].json(), responses[1].arrayBuffer()]);
        if (disposed || token !== generation) return false;
        if (metadata.schemaVersion !== 1 || !Array.isArray(metadata.meshes)) throw new Error('個別構造資料格式不符。');
        const unique = new Set();
        for (const entry of metadata.meshes) {
          const key = keyFor(entry);
          if (!entry.parent || !['head','body','muscles'].includes(entry.bundle) || unique.has(key)) throw new Error('個別構造來源重複或不完整。');
          unique.add(key); validatePartRanges(entry);
        }
        for (const entry of metadata.existingParts || []) {
          const target = getTargets().find(target => target.bundle === 'head' && target.parent === entry.parent);
          if (!target) throw new Error('找不到個別構造的模型參考。');
          validatePartRanges({ name: entry.parent, ni: target.mesh.geometry.index.count, parts: entry.parts });
        }
        geometries = decodeGeometry(metadata, buffer);
        for (const entry of metadata.meshes) entries.set(keyFor(entry), { parts: entry.parts, geometry: geometries[entry.name] });
        for (const entry of metadata.existingParts || []) entries.set(`head:${entry.parent}`, { parts: entry.parts });
        record.ready = true; applyGeometry(); redraw(); onLoaded(); return true;
      } catch (error) {
        if (geometries) for (const geometry of Object.values(geometries)) geometry.dispose();
        if (!disposed && token === generation && error.name !== 'AbortError') { record.error = error.message; ui.setError(error.message); }
        return false;
      } finally {
        record.promise = null;
        if (!disposed) {
          const loading = [...bundles.values()].some(value => !!value.promise);
          ui.setLoading(loading);
          if (!loading) ui.setError([...bundles.values()].find(value => value.error)?.error || '');
        }
      }
    })();
    return record.promise;
  }
  async function ensure() { return Promise.all(requiredBundles().map(loadBundle)); }
  async function enable(value) {
    if (disposed) return;
    active = !!value; generation++;
    for (const [name, record] of bundles) {
      if (!record.ready) { record.controller?.abort(); bundles.delete(name); }
    }
    clearSelection(); ui.setActive(active); stage.classList.toggle('inspectable', active);
    if (active) {
      stage.tabIndex = 0; applyGeometry(); await ensure();
    } else {
      stage.removeAttribute('tabindex'); restore(); ui.setLoading(false);
      // Frames request the focused parts again when they resume; a stopped camera should not download them.
      if (partFilter) applyGeometry();
    }
    redraw();
  }
  async function pickAt(x, y) {
    if (disposed || !active) return;
    const token = generation, revision = ++pickRevision;
    await ensure();
    if (disposed || !active || token !== generation || revision !== pickRevision) return;
    applyGeometry();
    candidates = pickAnatomy({ ...getView(), targets: targets(), x, y });
    if (candidates.length) choose(0); else clearSelection();
  }
  // Dev-only caller uses projected source triangles to drive real pointer tests;
  // this does not select anything or bypass raycasting/occlusion.
  function probe({ id, name, instance } = {}) {
    if (!active) return null;
    const view = getView(), all = targets(), wanted = name?.toLowerCase();
    for (const target of all) {
      if (!effectivelyVisible(target.mesh) || (instance && !target.instance.includes(instance))) continue;
      for (const part of target.parts) {
        if ((id && part.id !== id && part.pairedId !== id) || (wanted && !part.name.toLowerCase().includes(wanted))) continue;
        const geometry = target.mesh.geometry, vertices = geometry.attributes.position, indices = geometry.index;
        target.mesh.updateWorldMatrix(true, false); target.camera.updateWorldMatrix(true, false);
        const samples = [], count = part.count / 3, stride = Math.max(1, Math.floor(count / 48));
        for (let face = 0; face < count; face += stride) {
          const projected = [0,1,2].map(offset => new THREE.Vector3().fromBufferAttribute(vertices, indices.getX(part.start + face * 3 + offset))
            .applyMatrix4(target.mesh.matrixWorld).project(target.camera));
          const center = projected[0].clone().add(projected[1]).add(projected[2]).multiplyScalar(1/3);
          if (center.z < -1 || center.z > 1) continue;
          const area = Math.abs((projected[1].x-projected[0].x)*(projected[2].y-projected[0].y)-(projected[2].x-projected[0].x)*(projected[1].y-projected[0].y));
          samples.push({ x: (view.mirror ? 1-center.x : center.x+1)/2*view.width, y: (1-center.y)/2*view.height, area });
        }
        let backup;
        for (const point of samples.sort((a,b)=>b.area-a.area).slice(0,16)) {
          const hits = pickAnatomy({ ...view, ...point, targets: all }), index = hits.findIndex(hit=>hit.target.instance===target.instance&&hit.sourcePart.id===part.id);
          if (index < 0) continue;
          const [x, y] = toDisplay(view, point.x, point.y);
          if (x < 0 || y < 0 || x > view.width || y > view.height) continue;
          const result = { x,y,id:hits[index].part.id,name:hits[index].part.name,instance:target.instance,candidateIds:hits.map(hit=>hit.part.id) };
          if (index === 0) return result;
          backup ||= result;
        }
        if (backup) return backup;
      }
    }
    return null;
  }
  // Pointers currently down: a second finger makes the gesture a pinch, which must not pick anything.
  const touching = new Set();
  const pointerDown = event => {
    if (event.isPrimary) touching.clear();
    touching.add(event.pointerId);
    if (touching.size > 1) { down = null; return; }
    if (event.button !== 0 || event.target.closest('button,a,input,select')) return;
    down = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const pointerUp = event => {
    touching.delete(event.pointerId);
    const start = down; down = null;
    if (!active || !start || start.id !== event.pointerId || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 6) return;
    const rect = stage.getBoundingClientRect(), view = getView();
    void pickAt(...toView(view, (event.clientX - rect.left) / rect.width * view.width, (event.clientY - rect.top) / rect.height * view.height));
  };
  const cancelPointer = event => { touching.delete(event.pointerId); down = null; };
  const keyDown = event => {
    if (!active || event.target !== stage) return;
    if (event.key === 'Escape') clearSelection();
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const view = getView(); void pickAt(...toView(view, view.width / 2, view.height / 2)); }
  };
  stage.addEventListener('pointerdown', pointerDown); stage.addEventListener('pointerup', pointerUp);
  stage.addEventListener('pointercancel', cancelPointer); stage.addEventListener('keydown', keyDown);
  function sync() {
    if (disposed || (!active && !partFilter)) return;
    applyGeometry(); void ensure();
    if (active) syncHighlight();
  }
  function reconcile() { clearSelection(); if (active || partFilter) { applyGeometry(); void ensure(); } }
  function dispose() {
    if (disposed) return;
    disposed = true; active = false; generation++;
    for (const record of bundles.values()) record.controller?.abort();
    removeHighlight(); restore();
    disposeViews();
    for (const entry of entries.values()) if (!entry.own) entry.geometry?.dispose();
    entries.clear();
    stage.removeEventListener('pointerdown', pointerDown); stage.removeEventListener('pointerup', pointerUp);
    stage.removeEventListener('pointercancel', cancelPointer); stage.removeEventListener('keydown', keyDown); ui.dispose();
  }
  return { sync, reconcile, clear: () => enable(false), dispose, probe, setPartFilter, filterReady, partAnchors, getDiagnostics: () => ({ active, filter: partFilter?.key ?? null, filteredMeshes: [...views].filter(([key, view]) => view !== entries.get(key)).length, loaded: [...bundles].filter(([,r]) => r.ready).map(([name]) => name),
    selected: candidates[selectedIndex]?.part || null, candidateIds: candidates.map(hit => hit.part.id), highlightedIndices: highlight?.geometry.drawRange.count || 0 }) };
}
