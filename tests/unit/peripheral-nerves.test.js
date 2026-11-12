import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { formatAnatomyName } from '../../src/anatomy-names.js';
import { validatePartRanges } from '../../src/picking.js';

// Decodes the published buffers back into the atlas reference pose (cm: x = subject's left,
// y = up, z = anterior) and checks the nerves against the bones they were registered to.
const load = name => {
  const url = extension => new URL(`../../public/anatomy/${name}.${extension}`, import.meta.url);
  const meta = JSON.parse(readFileSync(url('json'), 'utf8')), file = readFileSync(url('bin'));
  return { meta, file, buffer: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) };
};
function points(bundle, meshName, partName) {
  const mesh = bundle.meta.meshes.find(entry => entry.name === meshName), part = mesh.parts.find(entry => entry.name === partName);
  if (!part) return [];
  const quantized = new Uint16Array(bundle.buffer, mesh.offV, mesh.nv * 3), indices = new Uint16Array(bundle.buffer, mesh.offI, mesh.ni);
  const { originCm: origin, basisColumnsCm: basis } = mesh.sourceFrame;
  return [...new Set(indices.subarray(part.start, part.start + part.count))].map(vertex => {
    const local = [0, 1, 2].map(axis => mesh.min[axis] + quantized[vertex * 3 + axis] / 65535 * mesh.size[axis]);
    return [0, 1, 2].map(axis => origin[axis] + basis[0][axis] * local[0] + basis[1][axis] * local[1] + basis[2][axis] * local[2]);
  });
}
const nerves = load('peripheral'), bones = load('individual-body');
const nerve = (segment, name, side = 'L') => points(nerves, `pn_${segment}_${side}`, `${side === 'L' ? 'left' : 'right'} ${name}`);
const bone = (mesh, name) => points(bones, mesh, name);
const gap = (a, b) => { let best = Infinity; for (const p of a) for (const q of b) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); return best; };
const mean = (list, axis) => list.reduce((sum, p) => sum + p[axis], 0) / list.length;
const near = (list, y, span = 1.5) => list.filter(p => Math.abs(p[1] - y) <= span);
const joint = index => nerves.meta.referencePoseCm[index];

describe('peripheral nerve asset contract', () => {
  test('checksummed limb, trunk, head and hand meshes with contiguous, sided nerve ranges under the size budget', () => {
    const { meta, file } = nerves;
    expect(meta.binarySha256).toBe(createHash('sha256').update(file).digest('hex'));
    expect(meta.binaryBytes).toBe(file.byteLength);
    expect(file.byteLength + readFileSync(new URL('../../public/anatomy/peripheral.json', import.meta.url)).byteLength).toBeLessThan(1_400_000);
    const hand = ['hand_palm', ...[[1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]].map(([a, b]) => `hand_b_${a}_${b}`)];
    expect(meta.meshes.map(mesh => mesh.name).sort()).toEqual([...['brachial', 'foot', 'forearm', 'head', 'lumbosacral', 'shin', 'thigh', 'trunk', 'upperarm']
      .flatMap(key => ['L', 'R'].map(side => `pn_${key}_${side}`)), ...hand.map(parent => `pn_${parent}`)].sort());
    // The hand rig shows the left hand as the mirrored right hand, so hand meshes exist once, with both identities.
    for (const mesh of meta.meshes.filter(entry => entry.frame === 'hand')) {
      expect(mesh).toMatchObject({ side: 'R', handParent: mesh.name.slice(3) });
      for (const part of mesh.parts) {
        expect(part).toMatchObject({ sourceSide: 'R', mirroredForLeft: true, pairedId: part.id.replace(/\.r$/, '.l'), pairedName: part.name.replace(/^right /, 'left ') });
      }
    }
    expect(meta.meshes.filter(entry => entry.frame === 'head').map(entry => entry.name)).toEqual(['pn_head_L', 'pn_head_R']);
    for (const mesh of meta.meshes) {
      expect(mesh.layer).toBe('peripheralNerves');
      expect(() => validatePartRanges(mesh)).not.toThrow();
      for (const part of mesh.parts) {
        expect(part).toMatchObject({ kind: 'nerve', side: mesh.side });
        expect(part.name.startsWith(mesh.side === 'L' ? 'left ' : 'right ')).toBe(true);
        expect(part.id).toBe(`Z-Anatomy:${part.sourceObject}`);
      }
    }
    expect(meta.companionBodyBinarySha256).toBe(load('body').meta.binarySha256);
  });
  test('the source, its licence and the limits of the data are stated in the file', () => {
    const { meta } = nerves;
    expect(meta.license).toBe('CC-BY-SA-4.0');
    expect(meta.attribution).toMatch(/Z-Anatomy.*CC BY-SA 4\.0.*BodyParts3D/);
    expect(meta.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(meta.source.downloads[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.limitations.join(' ')).toMatch(/not segmented from imaging/);
    expect(meta.limitations.join(' ')).toMatch(/exaggerated/);
    expect(meta.coverage.excluded.join(' ')).toMatch(/contradicts its name/);
  });
  test('registration to the BodyParts3D skeleton stays within a few millimetres', () => {
    const fits = Object.values(nerves.meta.source.registration.fits);
    // Arm, leg and rib cage on each side, the skull once, the right hand once.
    expect(Object.keys(nerves.meta.source.registration.fits).sort()).toEqual(['hand_R', 'head', 'lower_L', 'lower_R', 'trunk_L', 'trunk_R', 'upper_L', 'upper_R']);
    for (const fit of fits) {
      expect(fit.bones.length).toBeGreaterThanOrEqual(5);
      expect(fit.meanAbsResidualCm).toBeLessThan(0.1);
      expect(fit.maxAbsResidualCm).toBeLessThan(0.45);
    }
  });
  test('every published nerve has a Chinese name and is classed as a nerve', () => {
    const names = new Set(nerves.meta.meshes.flatMap(mesh => mesh.parts.map(part => part.name.replace(/^(left|right) /, ''))));
    expect(names.size).toBe(111);
    for (const mesh of nerves.meta.meshes) for (const part of mesh.parts) {
      const shown = formatAnatomyName(part);
      expect(shown.title, part.name).toMatch(/^[一-鿿・]+$/);
      expect(shown.kindLabel).toBe('神經');
      expect(shown.sideLabel).toBe(mesh.side === 'L' ? '左側' : '右側');
    }
  });
});

describe('nerve courses against the skeleton in the reference pose', () => {
  test('left nerves lie on the +x side and right nerves on the -x side', () => {
    for (const mesh of nerves.meta.meshes) for (const part of mesh.parts) {
      const x = mean(points(nerves, mesh.name, part.name), 0);
      // Cranial nerves leave the brainstem beside the midline; everything else is well to its side.
      const margin = mesh.frame === 'head' ? 0.1 : 0.5;
      if (mesh.side === 'L') expect(x, part.name).toBeGreaterThan(margin); else expect(x, part.name).toBeLessThan(-margin);
    }
  });
  test('a nerve cut at a joint continues without a gap on the other side', () => {
    for (const side of ['L', 'R']) {
      for (const [name, a, b] of [['median nerve', 'upperarm', 'forearm'], ['ulnar nerve', 'upperarm', 'forearm'], ['radial nerve', 'brachial', 'upperarm'],
        ['sciatic nerve', 'lumbosacral', 'thigh'], ['tibial nerve', 'thigh', 'shin'], ['tibial nerve', 'shin', 'foot'], ['saphenous nerve', 'thigh', 'shin']]) {
        expect(gap(nerve(a, name, side), nerve(b, name, side)), `${side} ${name} ${a}/${b}`).toBeLessThan(0.05);
      }
      expect(gap(nerve('thigh', 'sciatic nerve', side), nerve('thigh', 'tibial nerve', side)), `${side} sciatic to tibial`).toBeLessThan(1.2);
      expect(gap(nerve('thigh', 'sciatic nerve', side), nerve('thigh', 'common fibular nerve', side)), `${side} sciatic to common fibular`).toBeLessThan(1.2);
    }
  });
  test('at the elbow the ulnar nerve is medial and posterior, the radial nerve lateral, the median between them', () => {
    const elbow = joint(13), at = name => near([...nerve('upperarm', name), ...nerve('forearm', name)], elbow[1], 2);
    const ulnar = at('ulnar nerve'), median = at('median nerve'), radial = [...at('radial nerve'), ...at('deep branch of radial nerve'), ...at('superficial branch of radial nerve')];
    for (const list of [ulnar, median, radial]) expect(list.length).toBeGreaterThan(0);
    expect(mean(ulnar, 0)).toBeLessThan(mean(median, 0));
    expect(mean(median, 0)).toBeLessThan(mean(radial, 0));
    expect(mean(ulnar, 2)).toBeLessThan(mean(median, 2));
    expect(gap(ulnar, bone('arm_humerus_L', 'left humerus'))).toBeLessThan(1.5);
  });
  test('in the forearm the ulnar nerve runs with the ulna and the superficial radial branch with the radius', () => {
    const ulnar = nerve('forearm', 'ulnar nerve'), radial = nerve('forearm', 'superficial branch of radial nerve');
    const ulna = bone('arm_forearm_L', 'left ulna'), radius = bone('arm_forearm_L', 'left radius');
    const half = list => list.filter(p => p[1] < (joint(13)[1] + joint(15)[1]) / 2);
    expect(gap(half(ulnar), ulna)).toBeLessThan(gap(half(ulnar), radius));
    expect(gap(half(radial), radius)).toBeLessThan(gap(half(radial), ulna));
  });
  test('the sciatic nerve runs behind the femur and divides above the knee', () => {
    const sciatic = nerve('thigh', 'sciatic nerve'), femur = bone('leg_femur_L', 'left femur'), knee = joint(25);
    const level = mean(sciatic, 1);
    expect(mean(near(sciatic, level, 3), 2)).toBeLessThan(mean(near(femur, level, 3), 2));
    const lowest = Math.min(...sciatic.map(p => p[1]));
    expect(lowest).toBeGreaterThan(knee[1] + 3);
    expect(lowest).toBeLessThan(knee[1] + 20);
  });
  test('the common fibular nerve winds round the fibular neck, lateral to the tibial nerve', () => {
    const fibular = [...nerve('thigh', 'common fibular nerve'), ...nerve('shin', 'common fibular nerve')];
    const fibula = bone('leg_shin_L', 'left fibula'), top = Math.max(...fibula.map(p => p[1]));
    expect(gap(fibular, fibula.filter(p => p[1] > top - 5))).toBeLessThan(1.2);
    const tibial = nerve('shin', 'tibial nerve');
    expect(mean(near(fibular, top, 4), 0)).toBeGreaterThan(mean(near(tibial, top, 4), 0));
  });
  test('the tibial nerve stays behind the tibia and the femoral nerve in front of the hip bone', () => {
    const tibial = nerve('shin', 'tibial nerve'), tibia = bone('leg_shin_L', 'left tibia'), level = (joint(25)[1] + joint(27)[1]) / 2;
    expect(mean(near(tibial, level, 5), 2)).toBeLessThan(mean(near(tibia, level, 5), 2));
    const femoral = nerve('lumbosacral', 'femoral nerve'), hip = bone('torso_skel', 'left hip bone'), groin = joint(23)[1];
    expect(mean(near(femoral, groin, 3), 2)).toBeGreaterThan(mean(near(hip, groin, 3), 2));
  });
  test('the brachial plexus starts beside the cervical spine and reaches the arm below the clavicle', () => {
    const roots = nerve('brachial', 'roots of brachial plexus'), clavicle = bone('torso_skel', 'left clavicle');
    const vertebra = bone('cervical_skel', 'sixth cervical vertebra');
    expect(gap(roots, vertebra)).toBeLessThan(1.5);
    const cord = nerve('brachial', 'posterior cord of brachial plexus');
    expect(mean(cord, 1)).toBeLessThan(mean(clavicle, 1));
    expect(mean(cord, 0)).toBeGreaterThan(Math.max(...vertebra.map(p => p[0])));
  });
  test('the intercostal nerves run round the chest wall beside the ribs', () => {
    for (const side of ['L', 'R']) {
      const word = side === 'L' ? 'left' : 'right', intercostal = nerve('trunk', 'intercostal nerves', side);
      expect(intercostal.length).toBeGreaterThan(500);
      const heights = intercostal.map(p => p[1]), reach = intercostal.map(p => Math.abs(p[0]));
      expect(Math.min(...heights)).toBeGreaterThan(92); expect(Math.max(...heights)).toBeLessThan(147);
      // From beside the spine round to the front of the chest.
      expect(Math.min(...reach)).toBeLessThan(2.5); expect(Math.max(...reach)).toBeGreaterThan(10);
      for (const rib of ['third', 'sixth', 'ninth']) expect(gap(intercostal, bone('torso_skel', `${word} ${rib} rib`)), `${side} ${rib} rib`).toBeLessThan(1);
    }
  });
  test('the cranial nerves sit inside the head, with the facial branches outermost and the mental nerve at the chin', () => {
    const head = (name, side = 'L') => nerve('head', name, side);
    for (const mesh of nerves.meta.meshes.filter(entry => entry.frame === 'head')) for (const part of mesh.parts) {
      for (const p of points(nerves, mesh.name, part.name)) {
        expect(p[1], part.name).toBeGreaterThan(135); expect(p[1], part.name).toBeLessThan(166); expect(Math.abs(p[0]), part.name).toBeLessThan(9);
      }
    }
    const widest = list => Math.max(...list.map(p => Math.abs(p[0])));
    expect(widest(head('facial nerve (VII)'))).toBeGreaterThan(widest(head('trigeminal nerve (V)')) + 2);
    expect(mean(head('mental nerve'), 1)).toBeLessThan(mean(head('inferior alveolar nerve'), 1));
    expect(mean(head('mental nerve'), 2)).toBeGreaterThan(mean(head('inferior alveolar nerve'), 2));
    expect(mean(head('ophthalmic nerve'), 1)).toBeGreaterThan(mean(head('maxillary nerve'), 1));
    expect(mean(head('maxillary nerve'), 1)).toBeGreaterThan(mean(head('lingual nerve'), 1));
    // Left and right are mirror images to within the registration.
    expect(mean(head('facial nerve (VII)', 'L'), 0)).toBeCloseTo(-mean(head('facial nerve (VII)', 'R'), 0), 0);
  });
  test('hand nerves lie beside the bone they ride on and continue from the palm into each finger', () => {
    const local = (meshName) => {
      const mesh = nerves.meta.meshes.find(entry => entry.name === meshName), quantized = new Uint16Array(nerves.buffer, mesh.offV, mesh.nv * 3);
      return Array.from({ length: mesh.nv }, (_, vertex) => [0, 1, 2].map(axis => mesh.min[axis] + quantized[vertex * 3 + axis] / 65535 * mesh.size[axis]));
    };
    // A finger bone runs from 0 to 1 along its own x axis; a nerve beside it stays within a bone's width.
    for (const mesh of nerves.meta.meshes.filter(entry => entry.frame === 'hand' && entry.handParent !== 'hand_palm')) {
      for (const p of local(mesh.name)) {
        expect(p[0], mesh.name).toBeGreaterThan(-0.45); expect(p[0], mesh.name).toBeLessThan(1.45);
        expect(Math.hypot(p[1], p[2]), mesh.name).toBeLessThan(0.75);
      }
    }
    const piece = (parent, name) => points(nerves, `pn_${parent}`, `right ${name}`);
    for (const [name, chain] of [['proper palmar digital branches of median nerve', ['hand_b_5_6', 'hand_b_6_7', 'hand_b_7_8']],
      ['proper palmar digital branches of ulnar nerve', ['hand_b_17_18', 'hand_b_18_19', 'hand_b_19_20']]]) {
      for (let i = 1; i < chain.length; i++) expect(gap(piece(chain[i - 1], name), piece(chain[i], name)), `${name} ${chain[i]}`).toBeLessThan(0.05);
    }
    // The right hand is on the subject's right, and the median nerve arrives in the palm from the forearm.
    expect(mean(piece('hand_palm', 'median nerve'), 0)).toBeLessThan(-20);
    expect(gap(piece('hand_palm', 'median nerve'), nerve('forearm', 'median nerve', 'R'))).toBeLessThan(0.05);
  });
});
