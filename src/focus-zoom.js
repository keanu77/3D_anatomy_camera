// Digital zoom onto a focused body region. Tracking still sees the whole camera frame; only the
// picture is enlarged, so every display coordinate maps through one scale and offset.
export const IDENTITY = Object.freeze({ z: 1, bx: 0, by: 0 });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Zoom that fits a display-space box into the middle of the stage, leaving the sides for labels. */
export function zoomTarget(box, width, height, { fillX = 0.62, fillY = 0.8, max = 4 } = {}) {
  if (!box || ![box.minX, box.maxX, box.minY, box.maxY, width, height].every(Number.isFinite)) return IDENTITY;
  const z = clamp(Math.min(fillX * width / Math.max(box.maxX - box.minX, 1), fillY * height / Math.max(box.maxY - box.minY, 1)), 1, max);
  if (z < 1.05) return IDENTITY;
  // Keep the enlarged picture covering the whole stage: never pan past an edge.
  const cx = clamp((box.minX + box.maxX) / 2, width / (2 * z), width - width / (2 * z));
  const cy = clamp((box.minY + box.maxY) / 2, height / (2 * z), height - height / (2 * z));
  return { z, bx: width / 2 - z * cx, by: height / 2 - z * cy };
}

/**
 * Zoom after a two-finger gesture (or one wheel step) that began at `start`: the picture point that was
 * under display point `from` is now under `to`, enlarged by `factor`. The picture always covers the stage.
 */
export function gestureZoom(start, from, to, factor, width, height, { max = 6 } = {}) {
  if (![...from, ...to, factor].every(Number.isFinite) || factor <= 0) return start;
  const z = clamp(start.z * factor, 1, max);
  if (z < 1.02) return IDENTITY;
  const [px, py] = unzoomPoint(start, from[0], from[1]);
  return { z, bx: clamp(to[0] - z * px, width - z * width, 0), by: clamp(to[1] - z * py, height - z * height, 0) };
}

/**
 * The enlargement to aim for, given the one shown and the one the tracked region asks for now.
 * Landmarks tremble and parts come and go at the edge of the picture; an enlargement that followed
 * every such change made the whole picture pulse. A change is taken only when it would be seen as one.
 */
export function steadyZoom(shown, wanted, width, height, { scale = 0.1, shift = 0.05 } = {}) {
  if (shown.z === 1 || wanted.z === 1) return shown.z === 1 && wanted.z === 1 ? shown : wanted;
  const centre = zoom => [(width / 2 - zoom.bx) / zoom.z, (height / 2 - zoom.by) / zoom.z];
  const [ax, ay] = centre(shown), [bx, by] = centre(wanted);
  const moved = Math.hypot(ax - bx, ay - by) * shown.z > shift * Math.min(width, height);
  return moved || Math.abs(wanted.z / shown.z - 1) > scale ? wanted : shown;
}

export function easeZoom(current, target, elapsedMs, tau = 220) {
  const k = 1 - Math.exp(-Math.max(0, elapsedMs) / tau);
  const next = { z: current.z + (target.z - current.z) * k, bx: current.bx + (target.bx - current.bx) * k, by: current.by + (target.by - current.by) * k };
  return Math.abs(next.z - target.z) < 0.002 && Math.abs(next.bx - target.bx) < 0.3 && Math.abs(next.by - target.by) < 0.3 ? target : next;
}

export const zoomPoint = (zoom, x, y) => [zoom.z * x + zoom.bx, zoom.z * y + zoom.by];
export const unzoomPoint = (zoom, x, y) => [(x - zoom.bx) / zoom.z, (y - zoom.by) / zoom.z];

/** CSS transform (origin 0 0) for a stage layer; empty when the stylesheet's own rule applies. */
export function layerTransform(zoom, mirror, width, height, cssWidth, cssHeight) {
  if (zoom.z === 1 && !zoom.bx && !zoom.by) return '';
  const kx = cssWidth / width, ky = cssHeight / height, f = value => +value.toFixed(3);
  return mirror ? `matrix(${f(-zoom.z)},0,0,${f(zoom.z)},${f(kx * (zoom.z * width + zoom.bx))},${f(ky * zoom.by)})`
    : `matrix(${f(zoom.z)},0,0,${f(zoom.z)},${f(kx * zoom.bx)},${f(ky * zoom.by)})`;
}
