// One Euro filter (Casiez, Roussel and Vogel, 2012) for tracked 3D points: a low-pass whose cutoff
// rises with speed. A still pose is smoothed hard, so the anatomy stops trembling; a moving limb is
// smoothed little, so the anatomy does not trail behind it.
const smoothing = (cutoffHz, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dt));

/**
 * `filter(points, dt, unit)` takes [x, y, z] points and the seconds since the previous call, and returns
 * new smoothed points. Speeds are multiplied by `unit` before they raise the cutoff, so one tuning
 * serves every stage size. Depth (z) is the noisiest tracker output and gets its own, lower cutoff.
 */
export function createPointFilter(count, { minCutoff = 0.5, beta = 0.03, depthMinCutoff = 0.25, depthBeta = 0.01, derivativeCutoff = 1 } = {}) {
  let value = null, rate = null;
  return {
    reset() { value = null; rate = null; },
    filter(points, dt, unit = 1) {
      if (points.length !== count) throw new Error(`Expected ${count} points`);
      if (!value || !(dt > 0)) {
        value = points.map(p => [...p]); rate = points.map(() => [0, 0, 0]);
        return value.map(p => [...p]);
      }
      const d = smoothing(derivativeCutoff, dt);
      value = points.map((p, i) => {
        const previous = value[i], speed = rate[i] = rate[i].map((r, a) => r + d * ((p[a] - previous[a]) / dt - r));
        const planar = Math.hypot(speed[0], speed[1]) * unit, depth = Math.abs(speed[2]) * unit;
        const k = smoothing(minCutoff + beta * planar, dt), kz = smoothing(depthMinCutoff + depthBeta * depth, dt);
        return [previous[0] + k * (p[0] - previous[0]), previous[1] + k * (p[1] - previous[1]), previous[2] + kz * (p[2] - previous[2])];
      });
      return value.map(p => [...p]);
    },
  };
}
