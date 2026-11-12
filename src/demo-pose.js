/** Synthetic poses are authored here; only the neutral hand proportions come
 * from the independently reconstructed atlas. Coordinates are video-normalized. */
export function demoBodyPose(width, height, now, still = false) {
  const t = still ? 0 : now / 1000, sway = Math.sin(t * .45) * .008;
  const values = [
    [.5,.13,0], [.51,.12,0], [.52,.12,0], [.53,.12,0], [.49,.12,0], [.48,.12,0], [.47,.12,0],
    [.55,.135,.01], [.45,.135,.01], [.515,.155,0], [.485,.155,0],
    [.595,.245,0], [.405,.245,0], [.645,.405,-.015], [.355,.405,-.015],
    [.665,.56,-.035], [.335,.56,-.035], [.675,.60,-.035], [.325,.60,-.035],
    [.66,.61,-.04], [.34,.61,-.04], [.65,.58,-.04], [.35,.58,-.04],
    [.56,.52,.01], [.44,.52,.01], [.57,.715,-.005], [.43,.715,-.005],
    [.585,.895,0], [.415,.895,0], [.585,.92,.03], [.415,.92,.03],
    [.61,.945,-.045], [.39,.945,-.045],
  ];
  const aspectScale = (4 / 3) / (width / height);
  return { landmarks: [values.map(([x, y, z], index) => ({
    x: .5 + (x - .5 + sway) * aspectScale,
    y: y + (!still && [13,14,15,16].includes(index) ? Math.sin(t * .7 + index) * .006 : 0),
    z: z * aspectScale, visibility: 1, presence: 1,
  }))] };
}

export function demoHandLandmarks(reference, { wrist, left = false, width, height, length, angle = 0 }) {
  // Atlas wrist-to-middle-tip supplies a longitudinal axis. The knuckles supply
  // transverse orientation. Project these source dimensions into the demo plane.
  const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
  const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const unit = v => { const size = Math.hypot(...v); return v.map(x => x / size); };
  const origin = reference[0], along = unit(subtract(reference[12], origin));
  const across0 = subtract(reference[17], reference[5]);
  const across = unit(across0.map((v, i) => v - dot(across0, along) * along[i]));
  const normal = [along[1]*across[2]-along[2]*across[1], along[2]*across[0]-along[0]*across[2], along[0]*across[1]-along[1]*across[0]];
  const scale = length / Math.hypot(...subtract(reference[12], origin));
  const sin = Math.sin(angle), cos = Math.cos(angle);
  return reference.map(point => {
    const delta = subtract(point, origin), x = dot(delta, across) * scale * (left ? -1 : 1), y = dot(delta, along) * scale;
    return { x: wrist.x + (cos * x - sin * y) / width,
      y: wrist.y + (sin * x + cos * y) / height,
      z: wrist.z - dot(delta, normal) * scale / width * (left ? -1 : 1) };
  });
}
