import { FOCUS_IDS, FOCUS_SIDES, regionById } from './regions.js';
export const DEFAULTS = Object.freeze({
  skull: true, brain: false, muscles: false, eyes: true, outline: true, hands: true,
  spine: false, organs: false, arms: false, legs: false, bodyMuscles: false, joints: false, nerves: false, peripheralNerves: false,
  style: 'xray', bright: 1, real: 0.12, feather: 0.2, reveal: 'whole', cut: 0.5,
  showdata: false, fs: 1, fw: 1, fh: 1, fd: 1, fx: 0, fy: 0, fz: 0, labels: false, labelLanguage: 'zh',
  performance: 'auto', focus: 'none', focusSide: 'both', focusZoom: true, language: 'auto',
});
export const RANGES = Object.freeze({ bright: [0.3, 2.2], real: [0, 1], feather: [0, 1], cut: [0, 1],
  fs: [0.7, 1.4], fw: [0.8, 1.25], fh: [0.8, 1.25], fd: [0.8, 1.25], fx: [-3, 3], fy: [-4, 4], fz: [-4, 4] });
export const LAYERS = ['skull', 'brain', 'muscles', 'eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs', 'bodyMuscles', 'joints', 'nerves', 'peripheralNerves'];
export const BODY_LAYERS = ['spine', 'organs', 'arms', 'legs', 'bodyMuscles', 'joints', 'nerves', 'peripheralNerves'];
export const ENUMS = { style: ['xray', 'solid'], reveal: ['whole', 'left', 'right', 'top', 'bottom', 'lens'], performance: ['auto', 'high', 'balanced', 'lite'], labelLanguage: ['zh', 'both', 'en'], focus: FOCUS_IDS, focusSide: FOCUS_SIDES, language: ['auto', 'zh', 'en'] };
export function sanitizeSettings(input) {
  const result = { ...DEFAULTS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const [key, initial] of Object.entries(DEFAULTS)) {
    if (!Object.hasOwn(input, key) || typeof input[key] !== typeof initial) continue;
    const value = input[key];
    if (typeof value === 'number') {
      if (Number.isFinite(value)) result[key] = Math.min(RANGES[key][1], Math.max(RANGES[key][0], value));
    } else if (ENUMS[key]) { if (ENUMS[key].includes(value)) result[key] = value; }
    else result[key] = value;
  }
  return result;
}
export function loadSettings(storage) {
  try { return sanitizeSettings(JSON.parse((storage || globalThis.localStorage).getItem('xr_settings') || '{}')); }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(settings, storage) {
  try { (storage || globalThis.localStorage).setItem('xr_settings', JSON.stringify(sanitizeSettings(settings))); } catch {}
}
export function applyPreset(settings, preset) {
  const sets = {
    skull: ['skull', 'eyes', 'outline', 'hands'], brain: ['brain', 'outline', 'hands'],
    muscles: ['muscles', 'eyes', 'outline', 'hands'], all: ['skull', 'brain', 'muscles', 'eyes', 'outline', 'hands'],
    bodyMuscles: ['muscles', 'bodyMuscles', 'eyes', 'outline'],
    skeletal: ['skull', 'eyes', 'outline', 'hands', 'spine', 'arms', 'legs', 'joints'],
    musculoskeletal: ['skull', 'eyes', 'outline', 'hands', 'spine', 'arms', 'legs', 'joints', 'muscles', 'bodyMuscles'],
    nervous: ['brain', 'eyes', 'outline', 'nerves', 'peripheralNerves'],
    systems: LAYERS.filter(key => key !== 'organs'),
    upper: ['skull', 'eyes', 'outline', 'spine', 'arms', 'hands'], full: LAYERS,
  };
  if (!sets[preset]) return;
  for (const key of LAYERS) settings[key] = sets[preset].includes(key);
}
/** Isolate one body region: switch on the layers it needs and name its structures. Nothing the viewer
 * chose is switched off, on entering a region, changing it or leaving it. */
export function applyFocus(settings, id) {
  const region = regionById(id);
  settings.focus = region ? region.id : 'none';
  if (!region) return;
  for (const key of region.layers) settings[key] = true;
  settings.labels = true;
}
