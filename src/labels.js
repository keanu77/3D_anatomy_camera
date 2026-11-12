import { Color, Matrix4, Vector3 } from 'three';
import { layoutOverview } from './label-layout.js';
import { labelText } from './label-names.js';
import { zoomPoint } from './focus-zoom.js';
import { PALETTE, SURFACE } from './render-style.js';

/** Shared projection used by head and hand labels. A plane is in the same local
 * coordinates as the supplied point, before its tracked/world transformation. */
export function projectAnchor({ point, matrix, camera, width, height, mirror = false, plane = null, planeMatrix = null, lens = null }) {
  const cutPoint = new Vector3(...point);
  if (planeMatrix) cutPoint.applyMatrix4(planeMatrix);
  if (plane && cutPoint.x * plane[0] + cutPoint.y * plane[1] + cutPoint.z * plane[2] < plane[3]) return null;
  const p = new Vector3(...point).applyMatrix4(matrix).project(camera);
  if (![p.x, p.y, p.z].every(Number.isFinite) || p.z < -1 || p.z > 1) return null;
  const ax = (1 + (mirror ? -p.x : p.x)) * width / 2, ay = (1 - p.y) * height / 2;
  if (ax < 0 || ay < 0 || ax > width || ay > height || lens && Math.hypot(ax - lens.x, ay - lens.y) > lens.r) return null;
  return { ax, ay };
}

export function createLabels({ settings, state, metadata, getSize, headGroup, jawMesh, headCamera,
  handCamera, rigs, getBodyLabels, getLens, getZoom, getClip }) {
  let lastLayout = [];
  function draw(context) {
    const { width, height } = getSize();
    context.clearRect(0, 0, width, height);
    lastLayout = [];
    if (!settings.labels) return;
    const lens = getLens(), items = getBodyLabels(lens), clip = getClip();
    const color = layer => `#${new Color(PALETTE[layer]).getHexString()}`;
    if (headGroup.visible) {
      headGroup.updateWorldMatrix(true, true);
      for (const label of metadata.labels) {
        if (!settings[label.layer]) continue;
        // One entry per source label, choosing the anchor facing its text column.
        const projected = label.pts.map(point => projectAnchor({ point,
          matrix: label.jaw ? jawMesh.matrixWorld : headGroup.matrixWorld, camera: headCamera,
          width, height, mirror: state.mirror, lens,
          planeMatrix: label.jaw ? jawMesh.material.uniforms.uToHead.value : null,
          plane: clip.on ? [clip.x, clip.y, 0, clip.w] : null })).filter(Boolean);
        if (!projected.length) continue;
        const anchor = projected.reduce((best, next) => Math.abs(next.ax - width / 2) > Math.abs(best.ax - width / 2) ? next : best);
        items.push({ ...anchor, text: label.t, color: color(label.layer) });
      }
    }
    if (settings.hands) for (const rig of rigs) {
      if (!rig.group.visible || !rig.pts) continue;
      rig.group.updateWorldMatrix(true, true);
      const anchors = [
        ['Carpal bones (wrist)', rig.pts[0]], ['Metacarpal', rig.pts[9].clone().lerp(rig.pts[0], .45)],
        ['Proximal phalanx', rig.pts[9].clone().lerp(rig.pts[10], .5)],
        ['Middle phalanx', rig.pts[10].clone().lerp(rig.pts[11], .5)],
        ['Distal phalanx', rig.pts[11].clone().lerp(rig.pts[12], .5)],
      ];
      for (const [text, point] of anchors) {
        const anchor = projectAnchor({ point: point.toArray(), matrix: rig.group.matrixWorld || new Matrix4(),
          camera: handCamera, width, height, mirror: state.mirror, lens });
        if (anchor) items.push({ ...anchor, text, color: color('hands') });
      }
    }
    const zoom = getZoom();
    const visible = items.map(item => {
      const [ax, ay] = zoomPoint(zoom, item.ax, item.ay);
      return { ...item, ax, ay, text: item.localized ? item.text : labelText(item.text, settings.labelLanguage) };
    }).filter(item => item.ax >= 0 && item.ax <= width && item.ay >= 0 && item.ay <= height);
    context.save();
    context.font = '12px "PingFang TC", "Noto Sans TC", sans-serif';
    context.textBaseline = 'middle';
    lastLayout = layoutOverview(visible, width, height, text => context.measureText(text).width);
    for (const item of lastLayout) {
      context.strokeStyle = item.color;
      context.globalAlpha = .6;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(item.ax, item.ay);
      context.lineTo(item.lineEnd + (item.align === 'left' ? 8 : -8), item.y);
      context.lineTo(item.lineEnd, item.y);
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = SURFACE.labelPanel;
      context.fillRect(item.bounds.x - 3, item.bounds.y - 1, item.bounds.width + 6, item.bounds.height + 2);
      context.textAlign = item.align;
      context.fillStyle = SURFACE.labelText;
      context.fillText(item.text, item.x, item.y);
      context.fillStyle = item.color;
      context.beginPath(); context.arc(item.ax, item.ay, 1.8, 0, 2 * Math.PI); context.fill();
    }
    context.restore();
  }
  return { draw, getLayout: () => lastLayout.map(({ text, bounds }) => ({ text, bounds })) };
}
