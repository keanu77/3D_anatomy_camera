import { Vector3 } from 'three';
import { SURFACE } from './render-style.js';
import { landmarkToPoint } from './basis.js';
import { palmBasis, fingerBasis, matrixFromBasis } from './hand-frame.js';

export const HAND_SEGMENTS = Object.freeze([
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
]);
const contours = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const usable = input => Array.isArray(input) && input.length === 21 && input.every(point => point && [point.x, point.y, point.z].every(Number.isFinite));

export function createHandUpdater({ settings, getSize }) {
  function update(rig, landmarks, isRight) {
    const hide = () => {
      rig.group.visible = false;
      rig.pts = null;
      return false;
    };
    const { width, height } = getSize();
    if (!usable(landmarks) || !(width > 0 && height > 0)) return hide();
    const points = landmarks.map(point => landmarkToPoint(point, width, height));
    const across = points[17].map((value, axis) => value - points[5][axis]);
    const reflected = typeof isRight === 'boolean' ? !isRight : !/^r/i.test(String(isRight));
    let matrices;
    try {
      matrices = [matrixFromBasis(points[0], palmBasis(points), reflected),
        ...HAND_SEGMENTS.map(([a, b]) => matrixFromBasis(points[a], fingerBasis(points[a], points[b], across), reflected))];
    } catch {
      return hide();
    }
    // Install a complete frame together. Every bone's local X=0 and X=1 are
    // the two measured landmarks, including terminal bones and first detection.
    [rig.palm, ...rig.bones].forEach((mesh, index) => {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrices[index]);
      mesh.matrixWorldNeedsUpdate = true;
    });
    rig.pts = points.map(point => new Vector3(...point));
    rig.group.visible = true;
    return true;
  }

  function drawVeil(context, landmarks, opacity) {
    if (!usable(landmarks) || !Number.isFinite(opacity) || opacity <= 0) return;
    const { width, height } = getSize();
    const pixels = landmarks.map(point => [point.x * width, point.y * height]);
    const palmWidth = Math.hypot(pixels[17][0] - pixels[5][0], pixels[17][1] - pixels[5][1]);
    const softness = Math.max(0, Math.min(1, Number(settings.feather) || 0));
    context.save();
    context.globalAlpha = Math.min(1, opacity);
    context.fillStyle = SURFACE.maskCss;
    context.strokeStyle = SURFACE.maskCss;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.filter = `blur(${softness * (8 + palmWidth * .03)}px)`;
    context.beginPath();
    for (const [index, landmark] of [0, 1, 5, 9, 13, 17].entries()) {
      context[index ? 'lineTo' : 'moveTo'](...pixels[landmark]);
    }
    context.closePath();
    context.fill();
    context.lineWidth = Math.max(3, palmWidth * .18);
    context.beginPath();
    for (const chain of contours) chain.forEach((landmark, index) => context[index ? 'lineTo' : 'moveTo'](...pixels[landmark]));
    context.stroke();
    context.restore();
  }

  return { update, drawVeil };
}
