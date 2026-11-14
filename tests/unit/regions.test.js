import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { REGIONS, FOCUS_IDS, OPTIONAL_FOCUS_LAYERS, layerShown, regionById, regionIncludesMesh, regionPartSelector, focusLabels, carpalLabels, sourceKey } from '../../src/regions.js';
import { DEFAULTS, LAYERS, applyFocus, sanitizeSettings } from '../../src/settings.js';
import { filterPartRanges, partCentroids, validatePartRanges } from '../../src/picking.js';

const read = name => JSON.parse(readFileSync(new URL(`../../public/anatomy/${name}.json`, import.meta.url)));
const individual = read('individual-body'), individualHead = read('individual-head');
const rigs = ['body', 'muscles', 'joints', 'nerves', 'peripheral'].flatMap(name => read(name).meshes);
// Bones and muscles take their parts from the individual bundle; nerves publish theirs with the mesh.
const partsOf = mesh => individual.meshes.find(entry => entry.parent === mesh)?.parts || rigs.find(rig => rig.name === mesh)?.parts;
const keptNames = (region, mesh) => {
  const keep = regionPartSelector(regionById(region), mesh);
  return partsOf(mesh).filter(part => !keep || keep(part)).map(part => part.name);
};

describe('region membership against the published anatomy', () => {
  test('every listed mesh exists on both sides or the midline, in a layer the region switches on', () => {
    for (const region of REGIONS) {
      for (const base of Object.keys(region.meshes)) {
        const found = rigs.filter(rig => rig.name.replace(/_[LR]$/, '') === base);
        expect(found.length, `${region.id}: ${base}`).toBeGreaterThan(0);
        for (const rig of found) expect([...region.layers, ...OPTIONAL_FOCUS_LAYERS], `${region.id}: ${rig.name}`).toContain(rig.layer);
      }
      for (const layer of region.layers) expect(LAYERS).toContain(layer);
    }
  });
  test('every listed structure name matches a delivered part on each side', () => {
    for (const region of REGIONS) {
      for (const [base, tokens] of Object.entries(region.meshes)) {
        if (!Array.isArray(tokens)) continue;
        for (const mesh of rigs.filter(rig => rig.name.replace(/_[LR]$/, '') === base).map(rig => rig.name)) {
          const keys = partsOf(mesh).map(part => sourceKey(part.name));
          for (const token of tokens) {
            const hit = keys.some(key => token instanceof RegExp ? token.test(key) : key === token || key.endsWith(` of ${token}`));
            expect(hit, `${region.id}: ${mesh} has no "${token}"`).toBe(true);
          }
        }
      }
    }
  });
  test('a partial list never keeps a whole mesh and never empties it', () => {
    for (const region of REGIONS) for (const [base, tokens] of Object.entries(region.meshes)) {
      if (!Array.isArray(tokens)) continue;
      for (const rig of rigs.filter(value => value.name.replace(/_[LR]$/, '') === base)) {
        const kept = keptNames(region.id, rig.name).length;
        expect(kept, `${region.id}: ${rig.name}`).toBeGreaterThan(0);
        expect(kept, `${region.id}: ${rig.name}`).toBeLessThan(partsOf(rig.name).length);
      }
    }
  });
  test('shoulder keeps the rotator cuff and shoulder girdle, not the spinal extensors', () => {
    expect(keptNames('shoulder', 'muscle_scapular_L').sort()).toEqual(['left infraspinatus muscle', 'left subscapularis',
      'left supraspinatus', 'left teres major', 'left teres minor']);
    expect(keptNames('shoulder', 'muscle_back_R').sort()).toEqual(['ascending part of right trapezius', 'descending part of right trapezius',
      'right latissimus dorsi', 'right levator scapulae', 'right rhomboid major', 'right rhomboid minor', 'transverse part of right trapezius']);
    expect(keptNames('shoulder', 'muscle_upperarm_L').sort()).toEqual(['left coracobrachialis', 'long head of left biceps brachii',
      'long head of left triceps brachii', 'short head of left biceps brachii']);
    expect(keptNames('shoulder', 'torso_skel').sort()).toEqual(['left clavicle', 'left scapula', 'right clavicle', 'right scapula']);
    expect(regionIncludesMesh(regionById('shoulder'), 'muscle_thigh_L')).toBe(false);
    expect(regionIncludesMesh(regionById('shoulder'), 'organs_heart')).toBe(false);
  });
  test('elbow excludes forearm muscles that arise only from the radius, ulna or interosseous membrane', () => {
    const kept = keptNames('elbow', 'muscle_forearm_L');
    for (const name of ['left pronator quadratus', 'left flexor digitorum profundus', 'left flexor pollicis longus',
      'left abductor pollicis longus', 'left extensor pollicis brevis', 'left extensor pollicis longus', 'left extensor indicis']) expect(kept).not.toContain(name);
    expect(kept).toHaveLength(24 - 7);
  });
  test('hip keeps thigh muscles that cross the hip joint and drops the single-joint knee muscles', () => {
    const kept = keptNames('hip', 'muscle_thigh_R');
    for (const name of ['right vastus lateralis', 'right vastus medialis', 'right vastus intermedius', 'short head of right biceps femoris']) expect(kept).not.toContain(name);
    expect(kept).toContain('long head of right biceps femoris');
    expect(kept).toContain('right rectus femoris');
    expect(kept).toHaveLength(17 - 4);
    expect(keptNames('hip', 'leg_femur_L')).toEqual(['left femur']);
  });
  test('knee keeps only the calf muscles that cross the knee', () => {
    expect(keptNames('knee', 'muscle_shin_L').sort()).toEqual(['lateral head of left gastrocnemius', 'left plantaris', 'left popliteus', 'medial head of left gastrocnemius']);
  });
  test('rib and vertebra families select by level', () => {
    expect(keptNames('abdomen', 'torso_skel').filter(name => / rib$/.test(name))).toHaveLength(16);
    expect(keptNames('chest', 'torso_skel').filter(name => / rib$/.test(name))).toHaveLength(24);
    expect(keptNames('chest', 'torso_skel').filter(name => /thoracic vertebra$/.test(name))).toHaveLength(12);
    expect(keptNames('chest', 'torso_skel')).not.toContain('first lumbar vertebra');
  });
});

describe('one-sided focus', () => {
  const shoulder = regionById('shoulder');
  test('paired meshes are taken from the chosen side only; midline meshes stay', () => {
    expect(regionIncludesMesh(shoulder, 'muscle_deltoid_L', 'L')).toBe(true);
    expect(regionIncludesMesh(shoulder, 'muscle_deltoid_R', 'L')).toBe(false);
    expect(regionIncludesMesh(shoulder, 'torso_skel', 'R')).toBe(true);
    expect(regionIncludesMesh(regionById('back'), 'joint_lumbar_discs', 'L')).toBe(true);
  });
  test('a midline mesh keeps the chosen side of its paired parts and all unpaired parts', () => {
    const keep = side => partsOf('torso_skel').filter(regionPartSelector(regionById('chest'), 'torso_skel', side)).map(part => part.name);
    expect(keep('L').filter(name => / rib$/.test(name))).toHaveLength(12);
    expect(keep('L').every(name => !name.startsWith('right '))).toBe(true);
    expect(keep('L')).toEqual(expect.arrayContaining(['left clavicle', 'manubrium', 'body of sternum', 'first thoracic vertebra']));
    expect(keep('R')).toContain('right clavicle');
    expect(keep('R')).not.toContain('left clavicle');
  });
});

describe('nerves in a focused region', () => {
  test('a region lists a plexus by its parts and a nerve together with its branches', () => {
    const neck = keptNames('neck', 'pn_brachial_L');
    expect(neck).toEqual(expect.arrayContaining(['left roots of brachial plexus', 'left superior trunk of brachial plexus',
      'left posterior division of inferior trunk of brachial plexus', 'left posterior cord of brachial plexus', 'left suprascapular nerve']));
    expect(neck).not.toContain('left long thoracic nerve');
    expect(neck).not.toContain('left median nerve');
    expect(keptNames('chest', 'pn_brachial_R').sort()).toEqual(['right lateral pectoral nerve', 'right long thoracic nerve', 'right medial pectoral nerve']);
    const abdomen = keptNames('abdomen', 'pn_lumbosacral_L');
    expect(abdomen).toEqual(expect.arrayContaining(['left femoral nerve', 'left anterior cutaneous branches of femoral nerve',
      'left genital branch of genitofemoral nerve', 'left anterior branch of obturator nerve']));
    for (const name of ['left sciatic nerve', 'left pudendal nerve', 'left superior gluteal nerve']) expect(abdomen).not.toContain(name);
  });
  test('elbow shows the three long nerves on both sides of the joint', () => {
    for (const mesh of ['pn_upperarm_L', 'pn_forearm_L']) {
      expect(keptNames('elbow', mesh)).toEqual(expect.arrayContaining(['left median nerve', 'left ulnar nerve', 'left radial nerve']));
    }
    expect(regionIncludesMesh(regionById('elbow'), 'pn_thigh_L')).toBe(false);
  });
  test('each nerve is one label carrying its side, in the chosen language', () => {
    const anchors = partsOf('pn_forearm_R').map((part, i) => ({ part, point: [i, 0, 0], weight: part.count }));
    const zh = focusLabels(anchors, partsOf('pn_forearm_R')).map(label => label.text);
    expect(zh).toEqual(expect.arrayContaining(['右正中神經', '右尺神經', '右橈神經淺支', '右前臂後骨間神經']));
    expect(new Set(zh).size).toBe(zh.length);
    expect(focusLabels(anchors, partsOf('pn_forearm_R'), 'en')).toContainEqual(expect.objectContaining({ text: 'right median nerve' }));
  });
});

describe('focused part ranges', () => {
  test('filtered ranges stay contiguous and point at the original triangles', () => {
    const parts = partsOf('muscle_back_L'), index = Uint16Array.from({ length: parts.at(-1).start + parts.at(-1).count }, (_, i) => i % 65536);
    const keep = regionPartSelector(regionById('shoulder'), 'muscle_back_L');
    const filtered = filterPartRanges(parts, index, keep);
    expect(filtered.parts).toHaveLength(7);
    expect(() => validatePartRanges({ name: 'view', ni: filtered.index.length, parts: filtered.parts })).not.toThrow();
    for (const range of filtered.parts) {
      const source = parts.find(part => part.id === range.id);
      expect([...filtered.index.subarray(range.start, range.start + 3)]).toEqual([...index.subarray(source.start, source.start + 3)]);
    }
    expect(parts[0].start).toBe(0);
  });
  test('centroids average the vertices of each part', () => {
    const positions = Float32Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0, 10, 10, 10, 12, 10, 10, 10, 12, 10]);
    const result = partCentroids([{ id: 'a', start: 0, count: 3 }, { id: 'b', start: 3, count: 3 }], Uint16Array.from([0, 1, 2, 3, 4, 5]), positions);
    expect(result[0].point.map(value => +value.toFixed(3))).toEqual([0.667, 0.667, 0]);
    expect(result[1].point.map(value => +value.toFixed(3))).toEqual([10.667, 10.667, 10]);
    expect(result[1].weight).toBe(3);
  });
});

describe('what to show the camera', () => {
  test('every lower-limb region asks for the hips: the tracker finds no body in a picture of feet alone', () => {
    // Measured on the official pose photo: hips to feet in view, 25 parts drawn; ankles and feet alone, none,
    // also when the whole body was found first and the camera then closed in.
    for (const id of ['hip', 'knee', 'lowerleg', 'foot']) expect(regionById(id).frame, id).toContain('髖部');
    expect(regionById('foot').frame).toContain('只拍到腳時無法辨識');
    expect(regionById('lowerleg').frame).toContain('只拍到小腿與腳時可能無法辨識');
    for (const region of REGIONS) expect(region.frame, region.id).toMatch(/^請讓.+入鏡/);
  });
});

describe('focused labels', () => {
  const anchorsFor = (region, mesh) => {
    const keep = regionPartSelector(regionById(region), mesh);
    return partsOf(mesh).filter(part => !keep || keep(part)).map((part, i) => ({ part, point: [i, 0, 0], weight: part.count }));
  };
  const texts = (region, mesh, language) => focusLabels(anchorsFor(region, mesh), partsOf(mesh), language).map(label => label.text);
  test('a complete muscle gets one label; a lone division keeps its own name', () => {
    expect(texts('shoulder', 'muscle_deltoid_L')).toEqual(['左三角肌']);
    expect(texts('shoulder', 'muscle_upperarm_R').sort()).toEqual(['右喙肱肌', '右肱三頭肌・長頭', '右肱二頭肌'].sort());
    expect(texts('neck', 'muscle_back_L')).toContain('左斜方肌・下行部');
    expect(texts('shoulder', 'muscle_back_L')).toContain('左斜方肌');
  });
  test('numbered families collapse to one label per side and midline structures carry no side', () => {
    const chest = texts('chest', 'torso_skel');
    expect(chest.filter(text => text.includes('肋骨')).sort()).toEqual(['右肋骨', '左肋骨']);
    expect(chest).toContain('胸椎');
    expect(chest).toContain('胸骨柄');
    expect(texts('foot', 'foot_L')).toEqual(expect.arrayContaining(['左趾骨', '左距骨', '左跟骨']));
  });
  test('every bone of the foot but the toe bones is named by itself: seven tarsals and five metatarsals', () => {
    const foot = texts('foot', 'foot_L');
    expect(foot.filter(text => text.includes('蹠骨')).sort()).toEqual(['左第 1 蹠骨', '左第 2 蹠骨', '左第 3 蹠骨', '左第 4 蹠骨', '左第 5 蹠骨']);
    expect(foot.filter(text => text.includes('趾骨'))).toEqual(['左趾骨']);
    expect(foot).toEqual(expect.arrayContaining(['左距骨', '左跟骨', '左足舟狀骨', '左內側楔狀骨', '左中間楔狀骨', '左外側楔狀骨', '左骰骨']));
    expect(foot).toHaveLength(13);
    expect(texts('foot', 'foot_R', 'en')).toEqual(expect.arrayContaining(['right first metatarsal bone', 'right fifth metatarsal bone', 'right phalanges of foot']));
  });
  test('the eight carpal bones of a tracked hand are named one by one, on the hand that is shown', () => {
    const palm = individualHead.meshes.find(mesh => mesh.parent === 'hand_palm');
    const anchors = palm.parts.map((part, i) => ({ part, point: [i, 0, 0], weight: part.count }));
    const carpals = ['手舟狀骨', '月狀骨', '三角骨', '豌豆骨', '大多角骨', '小多角骨', '頭狀骨', '鉤狀骨'];
    expect(carpalLabels(anchors, palm.parts, 'R').map(label => label.text).sort()).toEqual(carpals.map(name => `右${name}`).sort());
    // The left hand is drawn from the mirrored right-hand bones and is named as a left hand.
    const left = carpalLabels(anchors, palm.parts, 'L');
    expect(left.map(label => label.text).sort()).toEqual(carpals.map(name => `左${name}`).sort());
    expect(left.find(label => label.text === '左月狀骨').point).toEqual(anchors.find(anchor => anchor.part.name === 'right lunate').point);
    expect(carpalLabels(anchors, palm.parts, 'L', 'en').map(label => label.text)).toEqual(expect.arrayContaining(['left scaphoid', 'left hamate']));
    // The metacarpals in the same mesh are not carpal bones.
    expect(carpalLabels(anchors, palm.parts, 'R').some(label => label.text.includes('掌骨'))).toBe(false);
  });
  test('language choice and untranslated source names', () => {
    expect(texts('shoulder', 'muscle_deltoid_L', 'en')).toEqual(['left deltoid']);
    expect(texts('shoulder', 'muscle_deltoid_L', 'both')).toEqual(['左三角肌 left deltoid']);
    expect(texts('foot', 'muscle_foot_L')).toContain('左小趾對蹠肌');
    // A source name without a listed translation is shown as published, never guessed.
    const unknown = { id: 'x', name: 'left unlisted structure', side: 'L', kind: 'muscle' };
    expect(focusLabels([{ part: unknown, point: [0, 0, 0], weight: 1 }], [unknown])).toEqual([{ text: 'left unlisted structure', point: [0, 0, 0] }]);
  });
  test('a merged label sits at the triangle-weighted centre of its parts', () => {
    const rib = (id, name, point, weight) => ({ part: { id, name, side: 'L' }, point, weight });
    const [label] = focusLabels([rib('a', 'left first rib', [0, 0, 0], 1), rib('b', 'left second rib', [4, 8, 0], 2), rib('c', 'left third rib', [4, 8, 0], 1)], []);
    expect(label).toEqual({ text: '左肋骨', point: [3, 6, 0] });
  });
  test('one or two members of a family keep their own names', () => {
    const neck = texts('neck', 'torso_skel');
    expect(neck).toEqual(expect.arrayContaining(['左第 1 肋骨', '左第 2 肋骨', '右第 1 肋骨', '右第 2 肋骨', '左鎖骨', '胸骨柄']));
    expect(neck).not.toContain('左肋骨');
  });
  test('every focused structure of every region has a Chinese label', () => {
    const untranslated = new Set();
    for (const region of REGIONS) for (const base of Object.keys(region.meshes)) {
      for (const rig of rigs.filter(value => value.name.replace(/_[LR]$/, '') === base)) {
        if (!partsOf(rig.name)) continue;
        for (const text of texts(region.id, rig.name)) if (!/[一-鿿]/.test(text)) untranslated.add(text.replace(/left |right /, ''));
      }
    }
    expect([...untranslated]).toEqual([]);
  });
});

describe('what a region draws', () => {
  // Reported on a phone: the foot region drew a hand while the camera looked at the feet.
  const viewer = { ...DEFAULTS, skull: true, eyes: true, outline: true, hands: true, legs: true, bodyMuscles: true, joints: true, peripheralNerves: true };
  test('a region draws its own layers only; the others stay chosen and come back on leaving', () => {
    for (const key of ['hands', 'skull', 'eyes', 'outline']) expect(layerShown({ ...viewer, focus: 'foot' }, key), key).toBe(false);
    for (const key of ['legs', 'bodyMuscles', 'joints', 'peripheralNerves']) expect(layerShown({ ...viewer, focus: 'foot' }, key), key).toBe(true);
    for (const key of ['hands', 'skull', 'legs']) expect(layerShown({ ...viewer, focus: 'none' }, key), key).toBe(true);
  });
  test('a region that lists a layer draws it, and nothing is drawn that the viewer switched off', () => {
    expect(layerShown({ ...viewer, focus: 'forearm' }, 'hands')).toBe(true);
    expect(layerShown({ ...viewer, focus: 'neck' }, 'skull')).toBe(true);
    expect(layerShown({ ...viewer, focus: 'neck' }, 'eyes')).toBe(false);
    expect(layerShown({ ...viewer, focus: 'forearm', hands: false }, 'hands')).toBe(false);
    expect(layerShown({ ...viewer, focus: 'not-a-region' }, 'hands')).toBe(true);
  });
});

describe('focus setting', () => {
  test('is validated like every other persisted enum', () => {
    expect(DEFAULTS.focus).toBe('none');
    expect(FOCUS_IDS).toEqual(['none', ...REGIONS.map(region => region.id)]);
    expect(sanitizeSettings({ focus: 'shoulder' }).focus).toBe('shoulder');
    expect(sanitizeSettings({ focus: 'spleen' }).focus).toBe('none');
    expect(sanitizeSettings({ focus: 3 }).focus).toBe('none');
  });
  test('choosing a region switches on its layers and its names, and switches off nothing the viewer chose', () => {
    const own = ['skull', 'eyes', 'outline', 'hands', 'organs'];
    const settings = { ...DEFAULTS, ...Object.fromEntries(LAYERS.map(key => [key, own.includes(key)])), labels: false };
    const shown = () => LAYERS.filter(key => settings[key]);
    applyFocus(settings, 'shoulder');
    expect(shown()).toEqual(['skull', 'eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'bodyMuscles']);
    expect(settings).toMatchObject({ focus: 'shoulder', labels: true });
    // The next region adds what it needs to what is already shown.
    applyFocus(settings, 'knee');
    expect(shown()).toEqual(['skull', 'eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs', 'bodyMuscles']);
    // A layer the viewer switches off stays off until a region that needs it is chosen.
    settings.bodyMuscles = false; settings.skull = false;
    applyFocus(settings, 'none');
    expect(settings.focus).toBe('none');
    expect(shown()).toEqual(['eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs']);
    applyFocus(settings, 'elbow');
    expect(shown()).toEqual(['eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs', 'bodyMuscles']);
    applyFocus(settings, 'not-a-region');
    expect(settings.focus).toBe('none');
    expect(shown()).toEqual(['eyes', 'outline', 'hands', 'spine', 'organs', 'arms', 'legs', 'bodyMuscles']);
  });
  test('nerves are never switched on by a region, and stay on once the viewer chose them', () => {
    const settings = { ...DEFAULTS, ...Object.fromEntries(LAYERS.map(key => [key, false])) };
    for (const region of REGIONS) { applyFocus(settings, region.id); expect(settings.peripheralNerves, region.id).toBe(false); expect(settings.nerves, region.id).toBe(false); }
    settings.peripheralNerves = true;
    applyFocus(settings, 'knee');
    expect(settings.peripheralNerves).toBe(true);
  });
});
