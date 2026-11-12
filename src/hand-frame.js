import { Matrix4 } from 'three';

const minus = (a, b) => a.map((value, i) => value - b[i]);
const magnitude = vector => Math.hypot(...vector);
const scaled = (vector, amount) => vector.map(value => value * amount);
const inner = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalized(vector) {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error('Degenerate hand frame axis');
  return scaled(vector, 1 / length);
}

// Same explicit column convention as tools/hand_frame.py. The palm is affine:
// wrist=(0,0,0), index MCP=(1,0,0), little MCP=(0,1,0).
export function palmBasis(points) {
  const radial = minus(points[5], points[0]);
  const ulnar = minus(points[17], points[0]);
  const depth = Math.sqrt(magnitude(radial) * magnitude(ulnar));
  return [radial, ulnar, scaled(normalized(cross(radial, ulnar)), depth)];
}

// A finger's proximal and distal landmarks are x=0 and x=1. Across-knuckle
// direction determines roll; all columns have the bone's tracked length.
export function fingerBasis(start, end, across) {
  const delta = minus(end, start);
  const longitudinal = normalized(delta);
  const lateral = normalized(minus(across, scaled(longitudinal, inner(longitudinal, across))));
  return [longitudinal, lateral, cross(longitudinal, lateral)].map(axis => scaled(axis, magnitude(delta)));
}

export function matrixFromBasis(origin, columns, mirrorDepth = false) {
  const [a, b, c] = columns;
  const depth = mirrorDepth ? scaled(c, -1) : c;
  return new Matrix4().fromArray([
    ...a, 0, ...b, 0, ...depth, 0, ...origin, 1,
  ]);
}
