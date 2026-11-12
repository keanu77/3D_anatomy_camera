import * as THREE from 'three';

export function validatePartRanges(entry) {
  let end = 0;
  if (!Array.isArray(entry.parts) || !entry.parts.length) throw new Error(`Missing source identities: ${entry.name}`);
  for (const part of entry.parts) {
    if (typeof part.id !== 'string' || !part.id || typeof part.name !== 'string' || !part.name ||
        !Number.isSafeInteger(part.start) || part.start !== end || !Number.isSafeInteger(part.count) || part.count < 3 || part.count % 3) {
      throw new Error(`Invalid source range: ${entry.name}`);
    }
    end += part.count;
  }
  if (end !== entry.ni) throw new Error(`Incomplete source coverage: ${entry.name}`);
}

/** Index buffer and contiguous part ranges holding only the parts that pass `keep`. */
export function filterPartRanges(parts, index, keep) {
  const kept = parts.filter(keep), filtered = new index.constructor(kept.reduce((sum, part) => sum + part.count, 0));
  let offset = 0;
  const ranges = kept.map(part => {
    filtered.set(index.subarray(part.start, part.start + part.count), offset);
    const range = { ...part, start: offset }; offset += part.count; return range;
  });
  return { index: filtered, parts: ranges };
}

/** Mean vertex position of each part, weighted later by its triangle count. */
export function partCentroids(parts, index, positions) {
  return parts.map(part => {
    const point = [0, 0, 0];
    for (let i = part.start; i < part.start + part.count; i++) for (let axis = 0; axis < 3; axis++) point[axis] += positions[index[i] * 3 + axis];
    return { part, point: point.map(value => value / part.count), weight: part.count };
  });
}

export function partAtFace(parts, faceIndex) {
  if (!Number.isInteger(faceIndex) || faceIndex < 0) return null;
  const index = faceIndex * 3;
  let lo = 0, hi = parts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, part = parts[mid];
    if (index < part.start) hi = mid - 1;
    else if (index >= part.start + part.count) lo = mid + 1;
    else return part;
  }
  return null;
}

export function displayedPart(part, side) {
  if (!side || !part.sourceSide || side === part.sourceSide) return { ...part };
  // Left-hand display mirrors the original right-hand geometry; source provenance
  // must remain distinct from the paired anatomical identifier shown to the user.
  return { ...part, id: part.pairedId || part.id, name: part.pairedName || part.name.replace(/\bright\b/i, 'left'),
    side, sourceId: part.id, sourceName: part.name, mirrored: true };
}

export function effectivelyVisible(mesh) {
  for (let object = mesh; object; object = object.parent) if (!object.visible) return false;
  return (mesh.material.uniforms?.uOpacity?.value ?? mesh.material.opacity ?? 1) > 0.001;
}

export function pickAnatomy({ targets, x, y, width, height, mirror = false, solid = false, lens = null }) {
  if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) return [];
  if (lens && Math.hypot(x - lens.x, y - lens.y) > lens.r) return [];
  const pointer = new THREE.Vector2((mirror ? 1 - x / width : x / width) * 2 - 1, 1 - y / height * 2);
  const raycaster = new THREE.Raycaster(), hits = [], local = new THREE.Vector3();
  for (const target of targets) {
    const { mesh, camera } = target;
    if (!effectivelyVisible(mesh)) continue;
    mesh.updateWorldMatrix(true, false); camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(pointer, camera);
    if (camera.isOrthographicCamera) {
      // Body/hand rendering uses a negative near plane. Three's default ray
      // starts at the camera plane and would miss visible anterior surfaces.
      raycaster.ray.origin.set(pointer.x, pointer.y, -1).unproject(camera);
      raycaster.near = 0; raycaster.far = camera.far - camera.near;
    } else { raycaster.near = camera.near; raycaster.far = camera.far; }
    for (const hit of raycaster.intersectObject(mesh, false)) {
      const u = mesh.material.uniforms;
      if (u?.uClipOn?.value > 0.5) {
        mesh.worldToLocal(local.copy(hit.point));
        if (u.uToHead) local.applyMatrix4(u.uToHead.value);
        const plane = u.uClip.value;
        if (local.x * plane.x + local.y * plane.y + local.z * plane.z < plane.w) continue;
      }
      const part = partAtFace(target.parts || [], hit.faceIndex);
      hits.push({ target, part: part ? displayedPart(part, target.side) : null, sourcePart: part, distance: hit.distance, point: hit.point });
    }
  }
  hits.sort((a,b) => b.target.pass - a.target.pass || a.distance - b.distance);
  if (solid) return hits[0]?.part ? [hits[0]] : [];
  const seen = new Set();
  return hits.filter(hit => {
    if (!hit.part) return false;
    const key = `${hit.target.instance}:${hit.part.id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
