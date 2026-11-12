// Turning the frozen anatomy around to look at it from the side. Angles are radians: yaw about the
// vertical axis, then pitch about the screen's horizontal axis, both around one pivot point.
export const LEVEL = Object.freeze({ yaw: 0, pitch: 0 });
const PITCH_LIMIT = 75 * Math.PI / 180;

/** Angles after a drag of (dx, dy) display pixels that began at `start`. A full-width drag is 216 degrees. */
export function dragOrbit(start, dx, dy, width, mirror = false) {
  const k = 1.2 * Math.PI / Math.max(1, width);
  // The picture layer is flipped when mirrored, so the surface facing the viewer must still follow the finger.
  const yaw = start.yaw + (mirror ? -dx : dx) * k, pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, start.pitch + dy * k));
  return { yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch };
}
export const isLevel = orbit => Math.abs(orbit.yaw) < 1e-6 && Math.abs(orbit.pitch) < 1e-6;

/** Column-major 4x4 for "rotate about `pivot`": Rx(pitch) * Ry(yaw), in a space with x right, y up, z towards the viewer. */
export function orbitElements({ yaw, pitch }, pivot = [0, 0, 0]) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const r = [[c, 0, s], [sp * s, cp, -sp * c], [-cp * s, sp, cp * c]];
  const t = r.map((row, i) => pivot[i] - (row[0] * pivot[0] + row[1] * pivot[1] + row[2] * pivot[2]));
  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, t[0], t[1], t[2], 1];
}
