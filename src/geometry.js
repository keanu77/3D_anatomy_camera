import { BufferAttribute, BufferGeometry } from 'three';

/** Decode the published Uint16 format. DataView makes byte order explicit and
 * avoids alignment assumptions about a caller's ArrayBuffer. */
export function decodeGeometry(metadata, buffer) {
  const view = new DataView(buffer), result = {};
  for (const item of metadata.meshes) {
    const coordinates = new Float32Array(item.nv * 3);
    for (let component = 0; component < coordinates.length; component++) {
      const axis = component % 3;
      coordinates[component] = item.min[axis] + item.size[axis] * view.getUint16(item.offV + component * 2, true) / 65535;
    }
    const indices = new Uint16Array(item.ni);
    for (let offset = 0; offset < item.ni; offset++) indices[offset] = view.getUint16(item.offI + offset * 2, true);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(coordinates, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    result[item.name] = geometry;
  }
  return result;
}
