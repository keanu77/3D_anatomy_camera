import { NERVE_NAMES } from './nerve-names.js';

// Display names only: the original source name and identifier remain authoritative.
// Unlisted terminology stays in English instead of receiving a guessed translation.
const NAMES = new Map(Object.entries({
  sternocleidomastoid: '胸鎖乳突肌', 'scalenus anterior': '前斜角肌',
  'scalenus medius': '中斜角肌', 'scalenus posterior': '後斜角肌',
  trapezius: '斜方肌', 'levator scapulae': '提肩胛肌', 'rhomboid major': '大菱形肌',
  'rhomboid minor': '小菱形肌', 'latissimus dorsi': '闊背肌',
  'serratus anterior': '前鋸肌', 'serratus posterior superior': '上後鋸肌',
  'serratus posterior inferior': '下後鋸肌', 'pectoralis major': '胸大肌',
  'pectoralis minor': '胸小肌', subclavius: '鎖骨下肌', deltoid: '三角肌',
  supraspinatus: '棘上肌', infraspinatus: '棘下肌', subscapularis: '肩胛下肌',
  'teres major': '大圓肌', 'teres minor': '小圓肌',
  'biceps brachii': '肱二頭肌', 'triceps brachii': '肱三頭肌',
  brachialis: '肱肌', brachioradialis: '肱橈肌', coracobrachialis: '喙肱肌', anconeus: '肘肌',
  'pronator teres': '旋前圓肌', 'pronator quadratus': '旋前方肌', supinator: '旋後肌',
  'flexor carpi radialis': '橈側屈腕肌', 'flexor carpi ulnaris': '尺側屈腕肌',
  'palmaris longus': '掌長肌', 'flexor digitorum superficialis': '屈指淺肌',
  'flexor digitorum profundus': '屈指深肌', 'flexor pollicis longus': '屈拇長肌',
  'extensor carpi radialis longus': '橈側伸腕長肌',
  'extensor carpi radialis brevis': '橈側伸腕短肌', 'extensor carpi ulnaris': '尺側伸腕肌',
  'extensor digitorum': '伸指肌', 'extensor digiti minimi': '伸小指肌',
  'extensor indicis': '伸食指肌', 'extensor pollicis longus': '伸拇長肌',
  'extensor pollicis brevis': '伸拇短肌', 'abductor pollicis longus': '外展拇長肌',
  'rectus abdominis': '腹直肌', 'external oblique': '腹外斜肌',
  'internal oblique': '腹內斜肌', 'transversus abdominis': '腹橫肌',
  'quadratus lumborum': '腰方肌', 'psoas major': '腰大肌', iliacus: '髂肌',
  'splenius capitis': '頭夾肌', 'splenius cervicis': '頸夾肌',
  'semispinalis capitis': '頭半棘肌', 'semispinalis cervicis': '頸半棘肌',
  'semispinalis thoracis': '胸半棘肌', multifidus: '多裂肌',
  'iliocostalis cervicis': '頸髂肋肌', 'iliocostalis thoracis': '胸髂肋肌',
  'iliocostalis lumborum': '腰髂肋肌', 'longissimus capitis': '頭最長肌',
  'longissimus cervicis': '頸最長肌', 'longissimus thoracis': '胸最長肌',
  'spinalis cervicis': '頸棘肌', 'spinalis thoracis': '胸棘肌',
  'gluteus maximus': '臀大肌', 'gluteus medius': '臀中肌', 'gluteus minimus': '臀小肌',
  'tensor fasciae latae': '闊筋膜張肌', piriformis: '梨狀肌',
  'obturator internus': '閉孔內肌', 'obturator externus': '閉孔外肌',
  'gemellus superior': '上孖肌', 'gemellus inferior': '下孖肌', 'quadratus femoris': '股方肌',
  'adductor longus': '內收長肌', 'adductor brevis': '內收短肌', 'adductor magnus': '內收大肌',
  gracilis: '股薄肌', pectineus: '恥骨肌', sartorius: '縫匠肌',
  'rectus femoris': '股直肌', 'vastus lateralis': '股外側肌',
  'vastus medialis': '股內側肌', 'vastus intermedius': '股中間肌',
  'biceps femoris': '股二頭肌', semitendinosus: '半腱肌', semimembranosus: '半膜肌',
  gastrocnemius: '腓腸肌', soleus: '比目魚肌', plantaris: '蹠肌', popliteus: '膕肌',
  'tibialis anterior': '脛前肌', 'tibialis posterior': '脛後肌',
  'fibularis longus': '腓骨長肌', 'fibularis brevis': '腓骨短肌', 'fibularis tertius': '第三腓骨肌',
  'extensor digitorum longus': '伸趾長肌', 'extensor digitorum brevis': '伸趾短肌',
  'extensor hallucis longus': '伸拇趾長肌', 'extensor hallucis brevis': '伸拇趾短肌',
  'flexor digitorum longus': '屈趾長肌', 'flexor digitorum brevis': '屈趾短肌',
  'flexor hallucis longus': '屈拇趾長肌', 'flexor hallucis brevis': '屈拇趾短肌',
  'abductor hallucis': '外展拇趾肌', 'adductor hallucis': '內收拇趾肌',
  'abductor digiti minimi of foot': '外展小趾肌',
  'flexor digiti minimi brevis of foot': '屈小趾短肌',
  'set of dorsal interossei of foot': '足背側骨間肌群',
  frontalis: '額肌', temporalis: '顳肌', masseter: '咬肌', buccinator: '頰肌',
  'orbicularis oculi': '眼輪匝肌', 'orbicularis oris': '口輪匝肌',
  'zygomaticus major': '顴大肌', 'zygomaticus minor': '顴小肌',
  'medial pterygoid': '內翼肌', 'lateral pterygoid': '外翼肌',
  clavicle: '鎖骨', scapula: '肩胛骨', humerus: '肱骨', radius: '橈骨', ulna: '尺骨',
  sternum: '胸骨', sacrum: '薦骨', coccyx: '尾骨', 'hip bone': '髖骨',
  femur: '股骨', patella: '髕骨', tibia: '脛骨', fibula: '腓骨',
  talus: '距骨', calcaneus: '跟骨', 'cuboid bone': '骰骨', 'navicular bone of foot': '足舟狀骨',
  'medial cuneiform bone': '內側楔狀骨', 'intermediate cuneiform bone': '中間楔狀骨',
  'lateral cuneiform bone': '外側楔狀骨', scaphoid: '手舟狀骨', 'scaphoid bone': '手舟狀骨',
  lunate: '月狀骨', triquetral: '三角骨', pisiform: '豌豆骨', capitate: '頭狀骨', hamate: '鉤狀骨',
  'lunate bone': '月狀骨', 'triquetral bone': '三角骨', 'pisiform bone': '豌豆骨',
  trapezium: '大多角骨', 'trapezium bone': '大多角骨',
  trapezoid: '小多角骨', 'trapezoid bone': '小多角骨', 'capitate bone': '頭狀骨', 'hamate bone': '鉤狀骨',
  'frontal bone': '額骨', 'parietal bone': '頂骨', 'temporal bone': '顳骨',
  'occipital bone': '枕骨', 'nasal bone': '鼻骨', 'zygomatic bone': '顴骨',
  maxilla: '上頜骨', mandible: '下頜骨', 'sphenoid bone': '蝶骨', 'ethmoid bone': '篩骨',
  ethmoid: '篩骨', 'lacrimal bone': '淚骨', 'palatine bone': '腭骨', vomer: '犁骨', 'hyoid bone': '舌骨',
  'epicranial aponeurosis': '帽狀腱膜', 'upper gingiva': '上牙齦', 'lower gingiva': '下牙齦',
  // Exact BodyParts3D source spellings for the individually selectable surfaces.
  'aponeurosis of epicranius': '帽狀腱膜', 'gingiva of upper jaw': '上牙齦', 'gingiva of lower jaw': '下牙齦',
  manubrium: '胸骨柄', 'body of sternum': '胸骨體', 'xiphoid process': '劍突',
  'inferior nasal concha': '下鼻甲', 'adductor minimus': '內收小肌', 'flexor accessorius': '蹠方肌',
  // Not in the national term list; formed like its hand counterpart 小指對掌肌 (opponens digiti minimi).
  'opponens digiti minimi of foot': '小趾對蹠肌',
  occipitalis: '枕肌', temporoparietalis: '顳頂肌', 'corrugator supercilii': '皺眉肌',
  'levator labii superioris alaeque nasi': '提上唇鼻翼肌', 'levator labii superioris': '提上唇肌',
  'depressor labii inferioris': '降下唇肌', 'levator anguli oris': '提口角肌',
  'depressor anguli oris': '降口角肌', mentalis: '頦肌', risorius: '笑肌', nasalis: '鼻肌', procerus: '降眉間肌',
  atlas: '第一頸椎（寰椎）', axis: '第二頸椎（樞椎）',
  ...NERVE_NAMES,
}));

const ORDINALS = new Map(['first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'].map((word, i) => [word, i + 1]));
const HEADS = new Map(Object.entries({ long: '長頭', short: '短頭', medial: '內側頭',
  lateral: '外側頭', humeral: '肱骨頭', ulnar: '尺骨頭', radial: '橈骨頭',
  humeroulnar: '肱尺頭', oblique: '斜頭', transverse: '橫頭', upper: '上頭', lower: '下頭' }));
const PARTS = new Map(Object.entries({ clavicular: '鎖骨部', acromial: '肩峰部',
  spinal: '肩胛棘部', abdominal: '腹部', sternocostal: '胸肋部',
  ascending: '上行部', descending: '下行部', transverse: '橫部',
  orbital: '眶部', palpebral: '瞼部', superficial: '淺部', deep: '深部' }));
const TEETH = new Map(Object.entries({ 'central incisor': '正中門齒', 'lateral incisor': '側門齒', canine: '犬齒',
  'first premolar': '第一小臼齒', 'second premolar': '第二小臼齒', 'first molar': '第一大臼齒', 'second molar': '第二大臼齒' }));
// Single midline structures. Anything else without a side stays "source did not state a side".
const UNPAIRED = /^(?:\w+ (?:cervical|thoracic|lumbar) vertebra|atlas|axis|sacrum|coccyx|sternum|manubrium|body of sternum|xiphoid process|frontal bone|occipital bone|sphenoid bone|ethmoid(?: bone)?|vomer|mandible|hyoid bone|orbicularis oris|aponeurosis of epicranius|epicranial aponeurosis|gingiva of (?:upper|lower) jaw)$/;
const DIGITS = new Map(Object.entries({ 'big toe': '拇趾', 'little toe': '小趾',
  'second toe': '第二趾', 'third toe': '第三趾', 'fourth toe': '第四趾',
  thumb: '拇指', 'index finger': '食指', 'middle finger': '中指', 'ring finger': '無名指', 'little finger': '小指' }));
const KINDS = new Map(Object.entries({ muscle: '肌肉', bone: '骨骼', tooth: '牙齒', gingiva: '牙齦', aponeurosis: '腱膜', nerve: '神經' }));

function normalize(name) {
  return name.toLowerCase().replace(/\b(left|right)\b\s*/g, '').replace(/\s+/g, ' ').trim();
}

function translate(name) {
  const key = normalize(name);
  const known = NAMES.get(key) || NAMES.get(key.replace(/ muscle$/, ''));  // nerves "to … muscle" are listed whole
  if (known) return known;
  const division = key.match(/^(.+) (head|part) of (.+)$/);
  if (division) {
    const base = NAMES.get(division[3]);
    const detail = (division[2] === 'head' ? HEADS : PARTS).get(division[1]);
    if (base && detail) return `${base}・${detail}`;
  }
  const numbered = key.match(/^(\w+) (cervical vertebra|thoracic vertebra|lumbar vertebra|rib|metatarsal bone|metacarpal bone|lumbrical of foot|plantar interosseous of foot)$/);
  if (numbered && ORDINALS.has(numbered[1])) {
    const number = ORDINALS.get(numbered[1]);
    const family = { 'cervical vertebra': '頸椎', 'thoracic vertebra': '胸椎',
      'lumbar vertebra': '腰椎', rib: '肋骨', 'metatarsal bone': '蹠骨',
      'metacarpal bone': '掌骨', 'lumbrical of foot': '足蚓狀肌',
      'plantar interosseous of foot': '足底骨間肌' }[numbered[2]];
    return `第 ${number} ${family}`;
  }
  // "Secondary" is the source's term for the permanent dentition.
  const tooth = key.match(/^(upper|lower) (?:(central|lateral|first|second) )?secondary (incisor|canine|premolar|molar) tooth$/);
  if (tooth) {
    const kind = TEETH.get([tooth[2], tooth[3]].filter(Boolean).join(' '));
    if (kind) return `${tooth[1] === 'upper' ? '上顎' : '下顎'}${kind}（恆齒）`;
  }
  const phalanx = key.match(/^(proximal|middle|distal) phalanx of (.+)$/);
  if (phalanx && DIGITS.has(phalanx[2])) {
    const segment = { proximal: '近節', middle: '中節', distal: '遠節' }[phalanx[1]];
    return `${DIGITS.get(phalanx[2])}${segment}${phalanx[2].includes('toe') ? '趾' : '指'}骨`;
  }
  return null;
}

/** Format one source element; never merge distinct source elements or infer anatomy from geometry. */
export function formatAnatomyName(part = {}) {
  const english = typeof part.name === 'string' ? part.name : '';
  const explicitSide = { L: '左側', R: '右側' }[part.side];
  const sourceSide = english.match(/\b(left|right)\b/i)?.[1].toLowerCase();
  const sideLabel = explicitSide || ({ left: '左側', right: '右側' }[sourceSide]) || (UNPAIRED.test(normalize(english)) ? '正中（不分左右）' : '來源未標示左右');
  const title = translate(english) || english || '未命名構造';
  const result = { title, english, sideLabel, kindLabel: KINDS.get(part.kind) || '構造' };
  const details = [];
  if (typeof part.wholeMuscleName === 'string' && part.wholeMuscleName && normalize(part.wholeMuscleName) !== normalize(english)) {
    details.push(`所屬肌肉：${translate(part.wholeMuscleName) || part.wholeMuscleName}`);
  }
  if (part.mirrored) {
    const originalSide = part.sourceSide || (typeof part.sourceName === 'string' ? part.sourceName.match(/\b(left|right)\b/i)?.[1].toLowerCase() : null);
    const sourceHand = { L: '左手', R: '右手', left: '左手', right: '右手' }[originalSide];
    const shownHand = { L: '左手', R: '右手' }[part.side];
    details.push(sourceHand && shownHand ? `${shownHand}外觀使用${sourceHand}參考模型鏡像` : '外觀使用來源參考模型的鏡像');
  }
  if (details.length) result.detail = details.join('。');
  return result;
}
