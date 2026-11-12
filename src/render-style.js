/** Appearance controls for every anatomy layer. Colors are separated by system;
 * low additive gains keep overlapping surfaces readable. Change this module to
 * tune the rendering without touching tracking, source geometry or shader code. */
export const PALETTE = Object.freeze({
  skull: 0x9bd2e8, hands: 0xb0d9e6, brain: 0xdba1ca, muscles: 0xee827d,
  eyes: 0xa3d8c6, outline: 0x75abc2, spine: 0x91bdd5, arms: 0xa3cfe1,
  legs: 0xa3cfe1, organs: 0xe29bb7, bodyMuscles: 0xe97872,
  joints: 0x58c5b5, nerves: 0xffdb67, peripheralNerves: 0xffc34d,
});
export const ORGAN_COLORS = Object.freeze({ organs_heart: 0xf27a7c, organs_lungs: 0x86bfd7,
  organs_liver: 0xb78261, organs_stomach: 0xe6aa85, organs_intestine: 0xd8ae91, organs_kidneys: 0xc180a0 });
export const SOLID = Object.freeze({ skull: 0xe6dec6, hands: 0xe6dec6, brain: 0xc28ba8,
  muscles: 0xb74f4b, eyes: 0xc0dfcf, outline: 0x597f8c });
export const GAINS = Object.freeze({ skull: .64, hands: .8, brain: .5, muscles: .48,
  eyes: .46, outline: .08, bodyMuscles: .6, organs: .4, nerves: .55, peripheralNerves: .4, body: .9 });
export const BASE_LIGHT = Object.freeze({ skull: .025, hands: .16, body: .07, bodyMuscles: .055, nerves: .35, peripheralNerves: .5 });
export const SURFACE = Object.freeze({ rimPower: 2.4, rimStrength: .66, diffuseFloor: .035,
  xrayAlpha: .7, softEdge: .28, ambient: .32, diffuse: .58, specular: .1,
  mask: 0x07101b, maskCss: '#07101b', maskRgb: [7, 16, 27], labelText: '#e5f0f4', labelPanel: '#07101be8' });
export const solidGain = brightness => Math.min(1.25, .6 + .4 * brightness);

export const HIGHLIGHT = Object.freeze({ color: 0x68ffdc, gain: 1.25, opacity: .88 });
