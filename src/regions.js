// Region focus: which published structures are drawn when one body region is isolated.
// Membership is listed by exact source name. A region never invents a structure: every
// entry must match a part delivered in the individual anatomy bundle (see the unit test).
import { formatAnatomyName } from './anatomy-names.js';
import { displayedPart } from './displayed-part.js';

const ALL = '*';
const RIBS = /^\w+ rib$/, LOWER_RIBS = /^(fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) rib$/;
const THORACIC = / thoracic vertebra$/, LUMBAR = / lumbar vertebra$/;

export const REGIONS = Object.freeze([
  { id: 'neck', label: '頸部', layers: ['skull', 'outline', 'spine', 'bodyMuscles', 'joints'],
    note: '胸鎖乳突肌、斜角肌與頸後肌群，以及第 3 到第 7 頸椎與椎間盤。',
    frame: '請讓頭部、雙肩與髖部入鏡。',
    meshes: { pn_brachial: ['brachial plexus', 'dorsal scapular nerve', 'suprascapular nerve', 'subclavian nerve'], cervical_skel: ALL, muscle_neck: ALL, joint_cervical_discs: ALL,
      torso_skel: ['clavicle', 'manubrium', 'first rib', 'second rib'],
      muscle_back: ['splenius capitis', 'splenius cervicis', 'semispinalis capitis', 'semispinalis cervicis',
        'longissimus capitis', 'longissimus cervicis', 'iliocostalis cervicis', 'spinalis cervicis',
        'levator scapulae', 'descending part of trapezius'] } },
  { id: 'shoulder', label: '肩膀', layers: ['spine', 'arms', 'bodyMuscles'],
    note: '旋轉肌袖、三角肌、胸肌、斜方肌等肩帶肌群，以及鎖骨、肩胛骨與肱骨。本版不含關節囊、盂唇與韌帶。',
    frame: '請讓雙肩到髖部入鏡，手肘也要看得到。',
    meshes: { pn_brachial: ALL, pn_upperarm: ALL, arm_humerus: ALL, muscle_deltoid: ALL, muscle_scapular: ALL, muscle_chest: ALL,
      torso_skel: ['clavicle', 'scapula'],
      muscle_back: ['trapezius', 'levator scapulae', 'rhomboid major', 'rhomboid minor', 'latissimus dorsi'],
      muscle_upperarm: ['coracobrachialis', 'biceps brachii', 'long head of triceps brachii'] } },
  { id: 'elbow', label: '上臂手肘', layers: ['arms', 'bodyMuscles'],
    note: '上臂肌群與三角肌，加上跨過肘關節或起自肱骨內外上髁的前臂肌，以及肱骨、橈骨與尺骨。',
    frame: '請讓肩膀、手肘與手腕入鏡。',
    meshes: { pn_upperarm: ALL, pn_forearm: ALL, arm_humerus: ALL, arm_forearm: ALL, muscle_upperarm: ALL, muscle_deltoid: ALL,
      muscle_forearm: ['anconeus', 'brachioradialis', 'pronator teres', 'supinator',
        'extensor carpi radialis longus', 'extensor carpi radialis brevis', 'extensor digitorum',
        'extensor digiti minimi', 'extensor carpi ulnaris', 'flexor carpi radialis', 'palmaris longus',
        'flexor carpi ulnaris', 'flexor digitorum superficialis'] } },
  { id: 'forearm', label: '前臂手腕', layers: ['arms', 'hands', 'bodyMuscles', 'joints'],
    note: '前臂屈肌群與伸肌群、前臂骨間膜、橈骨、尺骨與手骨。本版不含手掌內在肌。',
    frame: '請讓手肘、手腕與手掌入鏡。',
    meshes: { pn_forearm: ALL, arm_forearm: ALL, muscle_forearm: ALL, joint_forearm_membrane: ALL } },
  { id: 'chest', label: '胸部', layers: ['spine', 'bodyMuscles', 'joints'],
    note: '胸大肌、胸小肌、前鋸肌與鎖骨下肌，以及胸骨、肋骨、肋軟骨、鎖骨與胸椎。本版不含肋間肌。',
    frame: '請讓雙肩到髖部入鏡。',
    meshes: { pn_trunk: ALL, pn_brachial: ['long thoracic nerve', 'lateral pectoral nerve', 'medial pectoral nerve'], muscle_chest: ALL, joint_costal_cartilage: ALL,
      torso_skel: ['clavicle', 'manubrium', 'body of sternum', 'xiphoid process', RIBS, THORACIC] } },
  { id: 'abdomen', label: '腹部', layers: ['spine', 'bodyMuscles', 'joints'],
    note: '腹直肌、腹外斜肌、腹內斜肌、腹橫肌、腰方肌與髂腰肌，以及第 5 到第 12 肋骨、腰椎、骨盆與腹股溝韌帶。',
    frame: '請讓雙肩到髖部入鏡。',
    meshes: { pn_lumbosacral: ['iliohypogastric nerve', 'ilio-inguinal nerve', 'genitofemoral nerve', 'lateral femoral cutaneous nerve', 'femoral nerve', 'obturator nerve'], muscle_abdomen: ALL, joint_inguinal_ligament: ALL, joint_lumbar_discs: ALL,
      torso_skel: ['xiphoid process', LOWER_RIBS, LUMBAR, 'sacrum', 'hip bone'],
      muscle_hip: ['psoas major', 'iliacus'] } },
  { id: 'back', label: '背部腰部', layers: ['spine', 'bodyMuscles', 'joints'],
    note: '斜方肌、闊背肌、菱形肌、豎脊肌群與多裂肌等背肌，加上腰方肌，以及脊椎、椎間盤、肋骨、肩胛骨與骨盆。',
    frame: '請讓雙肩到髖部入鏡。',
    meshes: { pn_trunk: ALL, pn_brachial: ['dorsal scapular nerve', 'thoracodorsal nerve'], muscle_back: ALL, cervical_skel: ALL, joint_cervical_discs: ALL, joint_thoracic_discs: ALL, joint_lumbar_discs: ALL,
      torso_skel: [THORACIC, LUMBAR, 'sacrum', 'hip bone', 'scapula', RIBS],
      muscle_abdomen: ['quadratus lumborum'] } },
  { id: 'hip', label: '髖部臀部', layers: ['spine', 'legs', 'bodyMuscles', 'joints'],
    note: '臀肌、深層外旋肌群、髂腰肌，加上跨過髖關節的大腿肌，以及骨盆、薦骨、腰椎與股骨。本版不含髖關節囊、髖臼唇與髖關節韌帶。',
    frame: '請讓雙肩、髖部與膝蓋入鏡。',
    meshes: { pn_lumbosacral: ALL, pn_thigh: ALL, muscle_hip: ALL, joint_inguinal_ligament: ALL,
      torso_skel: ['hip bone', 'sacrum', LUMBAR], leg_femur: ['femur'],
      muscle_thigh: ['obturator externus', 'sartorius', 'tensor fasciae latae', 'pectineus', 'adductor brevis',
        'adductor longus', 'adductor magnus', 'adductor minimus', 'gracilis', 'rectus femoris',
        'semitendinosus', 'semimembranosus', 'long head of biceps femoris'] } },
  { id: 'knee', label: '大腿膝蓋', layers: ['legs', 'bodyMuscles'],
    note: '股四頭肌、膕旁肌、內收肌群，加上跨過膝關節的腓腸肌、蹠肌與膕肌，以及股骨、髕骨、脛骨與腓骨。本版不含半月板與十字韌帶。',
    frame: '請讓髖部、膝蓋與腳踝入鏡。',
    meshes: { pn_thigh: ALL, pn_shin: ALL, leg_femur: ALL, leg_shin: ALL, muscle_thigh: ALL,
      muscle_shin: ['gastrocnemius', 'plantaris', 'popliteus'] } },
  { id: 'lowerleg', label: '小腿腳踝', layers: ['legs', 'bodyMuscles', 'joints'],
    note: '小腿前側、外側與後側肌群、跟腱（阿基里斯腱）、小腿骨間膜，以及脛骨、腓骨與足骨。本版不含踝關節韌帶。',
    frame: '請讓膝蓋、腳踝與腳掌入鏡。',
    meshes: { pn_shin: ALL, pn_foot: ALL, leg_shin: ALL, foot: ALL, muscle_shin: ALL, joint_leg_membrane: ALL, joint_achilles_tendon: ALL } },
  { id: 'foot', label: '足部', layers: ['legs', 'bodyMuscles', 'joints'],
    note: '足底與足背的內在肌、足底長韌帶、跟腱（阿基里斯腱）與 26 塊足骨。',
    frame: '請讓腳踝、腳跟與腳尖入鏡。',
    meshes: { pn_foot: ALL, foot: ALL, muscle_foot: ALL, joint_plantar_ligament: ALL, joint_achilles_tendon: ALL } },
]);
export const FOCUS_IDS = Object.freeze(['none', ...REGIONS.map(region => region.id)]);
// Layers a region can show but does not switch on by itself: its nerves would crowd out the muscle names.
export const OPTIONAL_FOCUS_LAYERS = Object.freeze(['peripheralNerves']);
// 'L' and 'R' are the viewer's own anatomical sides, as in the source data.
export const FOCUS_SIDES = Object.freeze(['both', 'L', 'R']);

export const regionById = id => REGIONS.find(region => region.id === id) || null;
const meshBase = name => name.replace(/_[LR]$/, '');
/** Source name without its side word, so one list serves both sides. */
export const sourceKey = name => name.toLowerCase().replace(/\b(left|right)\b\s*/g, '').replace(/\s+/g, ' ').trim().replace(/ muscle$/, '');
const matches = (token, key) => token instanceof RegExp ? token.test(key) : key === token || key.endsWith(` of ${token}`);

const meshSide = name => name.match(/_([LR])$/)?.[1] || null;
const onSide = (own, side) => side === 'both' || !own || own === side;

export function regionIncludesMesh(region, meshName, side = 'both') {
  return !!region && Object.hasOwn(region.meshes, meshBase(meshName)) && onSide(meshSide(meshName), side);
}
/** Null when the mesh is drawn whole (or not at all); otherwise a test for its kept parts. */
export function regionPartSelector(region, meshName, side = 'both') {
  const tokens = region?.meshes[meshBase(meshName)];
  if (!Array.isArray(tokens)) return null;
  // Midline meshes carry both sides' parts, so one side is chosen part by part; unpaired parts stay.
  return part => { const key = sourceKey(part.name); return onSide(part.side, side) && tokens.some(token => matches(token, key)); };
}

// Numbered families collapse into one label per side; forty rib and toe labels would bury the rest.
// The five metatarsals are not such a family: each is a bone one looks for by itself.
const FAMILIES = [
  [RIBS, '肋骨', 'ribs'], [/ cervical vertebra$/, '頸椎', 'cervical vertebrae'], [THORACIC, '胸椎', 'thoracic vertebrae'],
  [LUMBAR, '腰椎', 'lumbar vertebrae'], [/ phalanx of .+ toe$/, '趾骨', 'phalanges of foot'],
  [/ lumbrical of foot$/, '足蚓狀肌', 'lumbricals of foot'], [/ plantar interosseous of foot$/, '足底骨間肌', 'plantar interossei of foot'],
];
const SIDE_ZH = { L: '左', R: '右' }, SIDE_EN = { L: 'left ', R: 'right ' };
// One or two members of a family are named individually: "ribs" would hide that only the first two are shown.
const siblings = (anchors, pattern, side) => anchors.filter(({ part }) => (part.side || '') === side && pattern.test(sourceKey(part.name))).length;

/**
 * Labels for the kept parts of one mesh. `anchors` holds { part, point, weight } for the kept
 * parts; `allParts` is every part of that mesh, used to tell a whole muscle from a lone division.
 */
export function focusLabels(anchors, allParts, language = 'zh') {
  const groups = new Map();
  for (const anchor of anchors) {
    const { part } = anchor, key = sourceKey(part.name), side = part.side || '';
    const family = FAMILIES.find(([pattern]) => pattern.test(key) && siblings(anchors, pattern, side) > 2);
    const whole = !family && part.kind === 'muscle' && part.wholeMuscleName ? part.wholeMuscleName : null;
    const id = family ? `family:${family[2]}:${side}` : whole ? `muscle:${whole}:${side}` : `part:${part.id}`;
    if (!groups.has(id)) groups.set(id, { family, whole, side, members: [] });
    groups.get(id).members.push(anchor);
  }
  const labels = [];
  for (const { family, whole, side, members } of groups.values()) {
    let zh, english;
    const divisions = whole ? allParts.filter(part => part.wholeMuscleName === whole && (part.side || '') === side).length : 0;
    if (family) { zh = family[1]; english = `${SIDE_EN[side] || ''}${family[2]}`; }
    else if (whole && members.length > 1 && members.length === divisions) {
      english = `${SIDE_EN[side] || ''}${whole}`; zh = formatAnatomyName({ name: english }).title;
    } else {
      // A lone division keeps its own name: the long head of triceps is not "the triceps".
      for (const member of members) labels.push(label(formatAnatomyName(member.part).title, member.part.name, side, [member], language));
      continue;
    }
    labels.push(label(zh, english, side, members, language));
  }
  return labels;
}
/**
 * Labels for the eight carpal bones of one tracked hand. `anchors` and `allParts` are those of the palm
 * mesh, which also holds four metacarpals. The left hand is drawn from the mirrored right-hand bones,
 * so its parts are renamed for the hand that is shown.
 */
export function carpalLabels(anchors, allParts, side, language = 'zh') {
  const carpals = anchors.filter(({ part }) => !/metacarpal/.test(part.name)).map(anchor => ({ ...anchor, part: displayedPart(anchor.part, side) }));
  return focusLabels(carpals, allParts, language);
}
function label(zh, english, side, members, language) {
  const translated = zh !== english, total = members.reduce((sum, member) => sum + member.weight, 0) || 1;
  const point = [0, 1, 2].map(axis => members.reduce((sum, member) => sum + member.point[axis] * member.weight, 0) / total);
  const local = translated ? `${SIDE_ZH[side] || ''}${zh}` : english;
  return { text: language === 'en' || !translated ? english : language === 'both' ? `${local} ${english}` : local, point };
}
