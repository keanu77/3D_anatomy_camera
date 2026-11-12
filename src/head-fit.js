/** Fit q = scale * p + translation in normalized device coordinates.
 * The horizontal weight converts NDC distances to the frame's pixel aspect.
 * Invalid correspondences are omitted; a collapsed or reflected fit is rejected.
 */
export function fitScreenSimilarity(projected, observed, aspect = 1) {
  const pairs = [];
  for (let i = 0; i < projected.length; i++) {
    const p = projected[i], q = observed[i];
    if (p && q && [p[0], p[1], q[0], q[1]].every(Number.isFinite)) pairs.push([p, q]);
  }
  const identity = { valid: false, scale: 1, x: 0, y: 0, count: pairs.length };
  if (pairs.length < 2) return identity;

  const means = [0, 0, 0, 0];
  for (const [p, q] of pairs) {
    means[0] += p[0]; means[1] += p[1]; means[2] += q[0]; means[3] += q[1];
  }
  for (let i = 0; i < means.length; i++) means[i] /= pairs.length;
  const weightX = Number.isFinite(aspect) && aspect > 0 ? aspect ** 2 : 1;
  let variance = 0, covariance = 0;
  for (const [p, q] of pairs) {
    const px = p[0] - means[0], py = p[1] - means[1];
    variance += weightX * px ** 2 + py ** 2;
    covariance += weightX * px * (q[0] - means[2]) + py * (q[1] - means[3]);
  }
  if (variance < 1e-12) return identity;
  const scale = covariance / variance;
  const x = means[2] - scale * means[0], y = means[3] - scale * means[1];
  if (scale <= 0 || ![scale, x, y].every(Number.isFinite)) return identity;
  return { valid: true, scale, x, y, count: pairs.length };
}

/** Exponential interpolation: the same elapsed time yields the same retention. */
export function smoothingWeight(elapsedMs) {
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? -Math.expm1(-elapsedMs / 75) : 0;
}
