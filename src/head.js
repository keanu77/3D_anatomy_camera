import { Matrix4, Quaternion, Vector3, Vector4 } from 'three';
import { fitScreenSimilarity, smoothingWeight } from './head-fit.js';

const MAX_JAW_ANGLE = .35;
const finiteMatrix = matrix => matrix?.elements?.length === 16 && matrix.elements.every(Number.isFinite);

/** The atlas already uses canonical-face centimetres, so the detector pose is
 * directly usable. Screen registration is a separate projection transform:
 * group matrices remain ordinary TRS matrices for orbit controls and picking.
 */
export function createHeadTracker({ settings, meta, camera, group, jawPivot, getBaseProjection }) {
  const fitIds = Object.keys(meta.fit).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  const state = {
    found: false,
    pos: new Vector3(), quat: new Quaternion(), scl: new Vector3(1, 1, 1),
    fitS: 1, fitX: 0, fitY: 0, jaw: 0, lms: null,
  };
  const inputPose = new Matrix4(), clipPose = new Matrix4(), screenCorrection = new Matrix4();
  const incomingPosition = new Vector3(), incomingRotation = new Quaternion(), incomingScale = new Vector3();
  const filteredPosition = new Vector3(), filteredRotation = new Quaternion(), filteredScale = new Vector3(1, 1, 1);
  const clip = new Vector4();
  let lastUpdate = null;

  function markLost() {
    state.found = false;
    state.lms = null;
    group.visible = false;
    lastUpdate = null;
  }

  function readPose(data) {
    if (data?.length !== 16 || !Array.from(data).every(Number.isFinite)) return false;
    inputPose.fromArray(data);
    // A facial pose is affine and nonsingular; perspective matrices are not poses.
    if ([3, 7, 11].some(index => Math.abs(data[index]) > 1e-6) || Math.abs(data[15] - 1) > 1e-6) return false;
    if (inputPose.determinant() < 1e-12) return false;
    inputPose.decompose(incomingPosition, incomingRotation, incomingScale);
    return [...incomingPosition, ...incomingRotation, ...incomingScale].every(Number.isFinite)
      && Math.min(incomingScale.x, incomingScale.y, incomingScale.z) > 1e-6;
  }

  function screenFit(landmarks, base) {
    const projected = [], observed = [];
    clipPose.multiplyMatrices(base, inputPose);
    for (const id of fitIds) {
      const p = meta.fit[id], landmark = landmarks?.[id];
      if (!p || !landmark) continue;
      clip.set(p[0], p[1], p[2], 1).applyMatrix4(clipPose);
      if (!(clip.w > 1e-8)) continue;
      projected.push([clip.x / clip.w, clip.y / clip.w]);
      observed.push([2 * landmark.x - 1, 1 - 2 * landmark.y]);
    }
    return fitScreenSimilarity(projected, observed, camera.aspect);
  }

  function setting(key, fallback) {
    return Number.isFinite(settings[key]) ? settings[key] : fallback;
  }

  function scaleSetting(key) {
    const value = setting(key, 1);
    return value > 0 ? value : 1;
  }

  function update(matrixDataColumnMajor, faceLmsNormalized, jawScalar) {
    if (!readPose(matrixDataColumnMajor)) {
      markLost();
      return;
    }
    const now = performance.now(), acquired = !state.found;
    const blend = acquired ? 1 : smoothingWeight(now - lastUpdate);
    lastUpdate = now;
    const base = getBaseProjection();
    const usableProjection = finiteMatrix(base) && Math.abs(base.determinant()) > 1e-12;
    const fit = usableProjection ? screenFit(faceLmsNormalized, base) : { valid: false };

    if (acquired) {
      filteredPosition.copy(incomingPosition);
      filteredRotation.copy(incomingRotation).normalize();
      filteredScale.copy(incomingScale);
      state.fitS = fit.valid ? fit.scale : 1;
      state.fitX = fit.valid ? fit.x : 0;
      state.fitY = fit.valid ? fit.y : 0;
    } else {
      filteredPosition.lerp(incomingPosition, blend);
      filteredRotation.slerp(incomingRotation, blend).normalize();
      filteredScale.lerp(incomingScale, blend);
      if (fit.valid) {
        state.fitS += blend * (fit.scale - state.fitS);
        state.fitX += blend * (fit.x - state.fitX);
        state.fitY += blend * (fit.y - state.fitY);
      }
    }
    const jawTarget = Number.isFinite(jawScalar) ? MAX_JAW_ANGLE * Math.min(1, Math.max(0, jawScalar)) : 0;
    state.jaw = acquired ? jawTarget : state.jaw + blend * (jawTarget - state.jaw);

    // Apply user calibration after estimating the automatic correction, otherwise
    // fitting would silently undo width, size, and positional adjustments.
    state.pos.copy(filteredPosition).add(new Vector3(setting('fx', 0), setting('fy', 0), setting('fz', 0)));
    state.quat.copy(filteredRotation);
    const uniform = scaleSetting('fs');
    state.scl.copy(filteredScale).multiply(new Vector3(scaleSetting('fw'), scaleSetting('fh'), scaleSetting('fd'))).multiplyScalar(uniform);
    group.position.copy(state.pos);
    group.quaternion.copy(state.quat);
    group.scale.copy(state.scl);
    group.visible = true;
    group.updateMatrix();
    if (jawPivot) {
      jawPivot.rotation.x = state.jaw;
      jawPivot.updateMatrix();
    }

    if (usableProjection) {
      // Left multiplication adds translation in clip units times w. Depth and w
      // stay intact, including perspective-correct occlusion and ray unprojection.
      screenCorrection.set(
        state.fitS, 0, 0, state.fitX,
        0, state.fitS, 0, state.fitY,
        0, 0, 1, 0,
        0, 0, 0, 1,
      );
      camera.projectionMatrix.multiplyMatrices(screenCorrection, base);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    state.found = true;
    state.lms = faceLmsNormalized || null;
  }

  return { state, update, fitIds };
}
