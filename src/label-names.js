// Chinese text for the labels drawn on the stage. Keys are the exact English label
// strings published in the anatomy metadata; anything unlisted stays in English
// instead of receiving a guessed translation.
const SINGLE = new Map(Object.entries({
  'Frontal bone': '額骨', 'Parietal bone': '頂骨', 'Temporal bone': '顳骨', 'Occipital bone': '枕骨',
  'Nasal bone': '鼻骨', 'Zygomatic bone (cheekbone)': '顴骨', 'Maxilla (upper jaw)': '上頜骨',
  Teeth: '牙齒', 'Mandible (lower jaw)': '下頜骨', Eyeball: '眼球',
  'Frontal lobe': '額葉', 'Parietal lobe': '頂葉', 'Temporal lobe': '顳葉', 'Occipital lobe': '枕葉',
  Cerebellum: '小腦', 'Pons (brainstem)': '橋腦', 'Medulla oblongata': '延腦',
  Frontalis: '額肌', Temporalis: '顳肌', 'Orbicularis oculi': '眼輪匝肌', Nasalis: '鼻肌',
  'Zygomaticus major': '顴大肌', Masseter: '咬肌', 'Orbicularis oris': '口輪匝肌',
  'Depressor anguli oris': '降口角肌', Mentalis: '頦肌',
  'Torso skeleton': '軀幹骨架', 'Cervical spine': '頸椎', Heart: '心臟', Lungs: '肺', Liver: '肝臟',
  Stomach: '胃', Intestines: '腸', Kidneys: '腎臟',
  'Cerv discs': '頸椎椎間盤', 'Thor discs': '胸椎椎間盤', 'Lumbar discs': '腰椎椎間盤',
  'Cervical cord': '頸段脊髓', 'Thoracic cord': '胸段脊髓', 'Lumbar cord': '腰段脊髓', 'Sacral cord': '薦段脊髓',
  'Optic chiasm': '視交叉',
  Skull: '頭骨', Brain: '腦', 'Head muscles': '頭部肌肉', Eyes: '眼球', 'Hand bones': '手骨',
  'Distal phalanx': '遠節指骨', 'Middle phalanx': '中節指骨', 'Proximal phalanx': '近節指骨',
  Metacarpal: '掌骨', 'Carpal bones (wrist)': '腕骨',
}));
// Labels published once per side, either as "Left X" or as "X L".
const SIDED = new Map(Object.entries({
  Humerus: '肱骨', 'Radius / ulna': '橈骨／尺骨', 'Femur / patella': '股骨／髕骨',
  'Tibia / fibula': '脛骨／腓骨', 'foot bones': '足骨',
  Neck: '頸部肌群', Pectorals: '胸肌', Back: '背肌', Abdominals: '腹肌', Scapular: '肩胛肌群',
  Deltoid: '三角肌', 'Upper arm': '上臂肌群', Forearm: '前臂肌群', 'Hip/gluteal': '髖臀肌群',
  Thigh: '大腿肌群', 'Lower leg': '小腿肌群', Foot: '足部肌群',
  Costal: '肋軟骨', 'Inguinal lig': '腹股溝韌帶', 'Forearm mem': '前臂骨間膜',
  'Leg membrane': '小腿骨間膜', Achilles: '跟腱（阿基里斯腱）', 'Plantar lig': '足底長韌帶',
  'Optic nerve': '視神經', 'Optic tract': '視徑',
  'Trunk nerves': '軀幹神經', 'Cranial nerves': '腦神經', 'Brachial plexus': '臂神經叢', 'Arm nerves': '上臂神經', 'Forearm nerves': '前臂神經',
  'Lumbosacral plexus': '腰薦神經叢', 'Thigh nerves': '大腿神經', 'Leg nerves': '小腿神經', 'Foot nerves': '足部神經',
}));
export const LABEL_LANGUAGES = ['zh', 'both', 'en'];

function chinese(english) {
  if (SINGLE.has(english)) return SINGLE.get(english);
  const leading = english.match(/^(Left|Right) (.+)$/), trailing = english.match(/^(.+) ([LR])$/);
  const side = leading ? leading[1][0] : trailing?.[2], name = SIDED.get(leading ? leading[2] : trailing?.[1]);
  return side && name ? `${side === 'L' ? '左' : '右'}${name}` : null;
}

/** Text for one stage label in the chosen language. English remains the fallback. */
export function labelText(english, language = 'zh') {
  if (typeof english !== 'string' || language === 'en') return english;
  const translated = chinese(english);
  if (!translated) return english;
  return language === 'both' ? `${translated} ${english}` : translated;
}
