// Interface language. Traditional Chinese is the source text everywhere in the app; English is
// looked up by that text, so a missing entry shows the Chinese original instead of nothing.
// Anatomical names are not translated here: the data's own English source names are shown as they are.
const EN = Object.freeze({
  // Document and start screen
  '3D anatomy camera｜互動 3D 解剖相機': '3D anatomy camera | Interactive 3D anatomy in your camera',
  '3D anatomy camera：透過鏡頭即時追蹤頭部、手部與身體，探索互動 3D 解剖模型。影像只在裝置上處理。': '3D anatomy camera: track your head, hands and body through the camera and explore an interactive 3D anatomy model. Video is processed on this device only.',
  '透過鏡頭探索互動 3D 解剖模型，影像只在裝置上處理。': 'Explore an interactive 3D anatomy model through your camera. Video is processed on this device only.',
  '3D anatomy camera 畫面': '3D anatomy camera view',
  '透過鏡頭，讓 3D 解剖模型跟隨你的動作，探索骨骼關節、肌肉、腦與神經。': 'Let a 3D anatomy model follow your movement through the camera, and explore bones and joints, muscles, the brain and nerves.',
  '啟動鏡頭': 'Start camera',
  '先看示範': 'Watch the demo',
  '影像只在這部裝置處理，不會上傳。': 'Video is processed on this device only and is never uploaded.',
  '製作：運動醫學科 吳易澄醫師': 'Made by Dr. 吳易澄, sports medicine',
  '製作：運動醫學科 吳易澄醫師（': 'Made by Dr. 吳易澄, sports medicine (',
  '）': ')',

  // Settings drawer
  '3D anatomy camera 設定': '3D anatomy camera settings',
  '關閉設定': 'Close settings',
  '關閉 ✕': 'Close ✕',
  '點選啟動鏡頭，或先看不需相機的示範。': 'Start the camera, or watch the demo, which needs no camera.',
  '部位聚焦': 'Region focus',
  '聚焦側別': 'Side in focus',
  '兩側': 'Both',
  '左側': 'Left',
  '右側': 'Right',
  '自動放大聚焦部位': 'Enlarge the focused region',
  '探索三大系統': 'Three systems',
  '骨骼與關節': 'Bones and joints',
  '肌肉＋骨骼': 'Muscles + bones',
  '神經與感覺器官': 'Nerves and sense organs',
  '三系統一起看': 'All three together',
  '圖層': 'Layers',
  '頭骨': 'Skull',
  '腦': 'Brain',
  '頭部肌肉': 'Head muscles',
  '身體肌肉': 'Body muscles',
  '頭部＋手': 'Head + hands',
  '上半身': 'Upper body',
  '全身': 'Whole body',
  '關節／韌帶肌腱': 'Joints, ligaments, tendons',
  '脊髓與視神經': 'Spinal cord and optic nerve',
  '周邊神經': 'Peripheral nerves',
  '眼球': 'Eyeballs',
  '頭部輪廓': 'Head outline',
  '手骨': 'Hand bones',
  '軀幹骨架': 'Trunk skeleton',
  '內臟': 'Organs',
  '上肢骨': 'Arm bones',
  '下肢骨': 'Leg bones',
  '顯示名稱標籤': 'Show name labels',
  '標籤語言': 'Label language',
  '中文': 'Chinese',
  '中文＋English': 'Chinese + English',
  '本版收錄範圍': 'What this version includes',
  '骨骼與關節：頭骨、軀幹及四肢骨架、椎間盤、肋軟骨、骨間膜、腹股溝韌帶、足底長韌帶與跟腱（阿基里斯腱）。尚未包含半月板、十字韌帶與完整關節囊。': 'Bones and joints: skull, trunk and limb skeleton, intervertebral discs, costal cartilages, interosseous membranes, inguinal ligament, long plantar ligament and the Achilles tendon. Menisci, cruciate ligaments and complete joint capsules are not included yet.',
  '肌肉：頸部、胸背腹、肩臂、臀腿及足部肌群。手掌內在肌與骨盆底肌不在本版範圍內。': 'Muscles: neck, chest, back and abdomen, shoulder and arm, hip and leg, and foot. Intrinsic hand muscles and pelvic floor muscles are outside this version.',
  '神經與感覺器官：腦、脊髓、眼球與視覺神經結構，以及臂神經叢、腰薦神經叢與四肢周邊神經到手腕與足部為止。周邊神經是圖譜繪製的走向，粗細經放大以便觀看；不含腦神經分支、肋間神經、手指神經。': 'Nerves and sense organs: brain, spinal cord, eyeballs and the visual pathway, plus the brachial plexus, the lumbosacral plexus and the peripheral nerves of the limbs as far as the wrist and the foot. Peripheral nerves follow courses drawn in an atlas and are thickened so they can be seen; cranial nerve branches, intercostal nerves and digital nerves of the hand are not included.',
  '外觀': 'Appearance',
  'X 光透視': 'X-ray',
  '實體': 'Solid',
  '亮度': 'Brightness',
  '混合實境': 'Mixed reality',
  '透出真實影像': 'Show the real picture',
  '邊緣柔化': 'Edge softening',
  '顯示範圍': 'Reveal',
  '完整顯示': 'Everything',
  '只顯示左半': 'Left half only',
  '只顯示右半': 'Right half only',
  '只顯示上半': 'Upper half only',
  '只顯示下半': 'Lower half only',
  '透視鏡（跟隨指尖）': 'Lens (follows your fingertip)',
  '切面位置': 'Cut position',
  '透視鏡大小': 'Lens size',
  '顯示追蹤資料': 'Show tracking data',
  '貼合我的頭型': 'Fit my head',
  '整體大小': 'Overall size',
  '寬度': 'Width',
  '高度': 'Height',
  '深度': 'Depth',
  '左右': 'Left–right',
  '上下': 'Up–down',
  '前後': 'Forward–back',
  '重設貼合': 'Reset fit',
  '提示：選「實體」外觀，並把「透出真實影像」調到一半左右，再把頭骨對齊自己的臉。': 'Tip: choose the Solid appearance, set “Show the real picture” to about half, then line the skull up with your face.',
  '鏡頭與效能': 'Camera and performance',
  '效能模式': 'Performance',
  '自動調整': 'Automatic',
  '高畫質': 'High quality',
  '平衡': 'Balanced',
  '輕量': 'Lite',
  '輕量模式以身體追蹤為主，手部更新較慢；使用手指 lens 時只追蹤手部。': 'Lite mode follows the body first and updates the hands more slowly; with the fingertip lens it tracks the hands only.',
  '切換鏡頭': 'Switch camera',
  '停止鏡頭': 'Stop camera',
  '製作與資料來源': 'Credits and data sources',
  '構想受 Hashem Al-Ghaili 的 X-Ray Mirror 啟發，本專案的程式與資料為獨立製作（': 'The idea was inspired by Hashem Al-Ghaili’s X-Ray Mirror; the code and data of this project were made independently (',
  '2026 年 11 月 10 日 X 貼文': 'post on X, 10 November 2026',
  '骨骼、肌肉、關節韌帶、內臟、腦與視覺路徑：BodyParts3D，日本生命科學資料庫中心（DBCLS），CC BY-SA 2.1 Japan': 'Bones, muscles, joints and ligaments, organs, brain and visual pathway: BodyParts3D, Database Center for Life Science (DBCLS), Japan, CC BY-SA 2.1 Japan',
  '脊髓：Human Reference Atlas 脊髓參考模型，Browne 與 Schlehlein，HuBMAP，CC BY 4.0': 'Spinal cord: Human Reference Atlas spinal cord reference model, Browne and Schlehlein, HuBMAP, CC BY 4.0',
  '周邊神經走向：Z-Anatomy，Gauthier Kervyn 與貢獻者，CC BY-SA 4.0': 'Peripheral nerve courses: Z-Anatomy, Gauthier Kervyn and contributors, CC BY-SA 4.0',
  '臉部、手部與身體追蹤：Google MediaPipe Tasks Vision，Apache License 2.0': 'Face, hand and body tracking: Google MediaPipe Tasks Vision, Apache License 2.0',
  '三維繪圖：three.js，MIT License': '3D rendering: three.js, MIT License',
  '模型來自參考成人解剖資料，依追蹤點縮放顯示。肌肉依身體區段跟隨動作，並未模擬收縮或跨關節形變。這不是你的掃描影像，也不代表個人的器官位置；僅供解剖學習，不用於診斷。': 'The models come from reference adult anatomy and are scaled to the tracked points. Muscles follow body segments; contraction and deformation across joints are not simulated. This is not a scan of you and does not show where your own organs are. It is for learning anatomy only, not for diagnosis.',
  '模型與軟體授權': 'Model and software licenses',
  '常用操作': 'Common actions',
  '切換前後鏡頭': 'Switch between front and rear camera',
  '切換圖層': 'Next layer set',
  'X 光 / 實體': 'X-ray / Solid',
  'X 光 → 實體': 'X-ray → Solid',
  '實體 → X 光': 'Solid → X-ray',
  '設定': 'Settings',
  '部位：全身': 'Region: whole body',
  '選一個部位，只顯示該處的肌肉與骨骼並標出名稱。': 'Choose a region to show only its muscles and bones, with their names.',
  '選左側或右側可以放得更大；勾選「周邊神經」可加上此處的神經。': 'Choose the left or right side to enlarge it further; tick “Peripheral nerves” to add the nerves of this region.',

  // Regions: label, what is drawn, how to stand
  '頸部': 'Neck',
  '肩膀': 'Shoulder',
  '上臂手肘': 'Upper arm and elbow',
  '前臂手腕': 'Forearm and wrist',
  '胸部': 'Chest',
  '腹部': 'Abdomen',
  '背部腰部': 'Back and loin',
  '髖部臀部': 'Hip and buttock',
  '大腿膝蓋': 'Thigh and knee',
  '小腿腳踝': 'Lower leg and ankle',
  '足部': 'Foot',
  '胸鎖乳突肌、斜角肌與頸後肌群，以及第 3 到第 7 頸椎與椎間盤。': 'Sternocleidomastoid, the scalene muscles and the posterior neck muscles, with cervical vertebrae 3 to 7 and their discs.',
  '旋轉肌袖、三角肌、胸肌、斜方肌等肩帶肌群，以及鎖骨、肩胛骨與肱骨。本版不含關節囊、盂唇與韌帶。': 'Shoulder girdle muscles including the rotator cuff, deltoid, pectoral muscles and trapezius, with the clavicle, scapula and humerus. This version has no joint capsule, labrum or ligaments.',
  '上臂肌群與三角肌，加上跨過肘關節或起自肱骨內外上髁的前臂肌，以及肱骨、橈骨與尺骨。': 'Upper arm muscles and the deltoid, plus the forearm muscles that cross the elbow or arise from the medial and lateral epicondyles of the humerus, with the humerus, radius and ulna.',
  '前臂屈肌群與伸肌群、前臂骨間膜、橈骨、尺骨與手骨。本版不含手掌內在肌。': 'Forearm flexors and extensors, the interosseous membrane of the forearm, the radius, ulna and hand bones. This version has no intrinsic hand muscles.',
  '胸大肌、胸小肌、前鋸肌與鎖骨下肌，以及胸骨、肋骨、肋軟骨、鎖骨與胸椎。本版不含肋間肌。': 'Pectoralis major, pectoralis minor, serratus anterior and subclavius, with the sternum, ribs, costal cartilages, clavicle and thoracic vertebrae. This version has no intercostal muscles.',
  '腹直肌、腹外斜肌、腹內斜肌、腹橫肌、腰方肌與髂腰肌，以及第 5 到第 12 肋骨、腰椎、骨盆與腹股溝韌帶。': 'Rectus abdominis, external oblique, internal oblique, transversus abdominis, quadratus lumborum and iliopsoas, with ribs 5 to 12, the lumbar vertebrae, the pelvis and the inguinal ligament.',
  '斜方肌、闊背肌、菱形肌、豎脊肌群與多裂肌等背肌，加上腰方肌，以及脊椎、椎間盤、肋骨、肩胛骨與骨盆。': 'Back muscles including trapezius, latissimus dorsi, the rhomboids, the erector spinae and multifidus, plus quadratus lumborum, with the vertebral column, intervertebral discs, ribs, scapula and pelvis.',
  '臀肌、深層外旋肌群、髂腰肌，加上跨過髖關節的大腿肌，以及骨盆、薦骨、腰椎與股骨。本版不含髖關節囊、髖臼唇與髖關節韌帶。': 'Gluteal muscles, the deep external rotators and iliopsoas, plus the thigh muscles that cross the hip, with the pelvis, sacrum, lumbar vertebrae and femur. This version has no hip joint capsule, acetabular labrum or hip ligaments.',
  '股四頭肌、膕旁肌、內收肌群，加上跨過膝關節的腓腸肌、蹠肌與膕肌，以及股骨、髕骨、脛骨與腓骨。本版不含半月板與十字韌帶。': 'Quadriceps, hamstrings and the adductors, plus gastrocnemius, plantaris and popliteus, which cross the knee, with the femur, patella, tibia and fibula. This version has no menisci or cruciate ligaments.',
  '小腿前側、外側與後側肌群、跟腱（阿基里斯腱）、小腿骨間膜，以及脛骨、腓骨與足骨。本版不含踝關節韌帶。': 'Anterior, lateral and posterior muscles of the leg, the Achilles tendon and the interosseous membrane of the leg, with the tibia, fibula and foot bones. This version has no ankle ligaments.',
  '足底與足背的內在肌、足底長韌帶、跟腱（阿基里斯腱）與 26 塊足骨。': 'Intrinsic muscles of the sole and the dorsum of the foot, the long plantar ligament, the Achilles tendon and the 26 bones of the foot.',
  '請讓頭部、雙肩與髖部入鏡。': 'Keep your head, both shoulders and your hips in view.',
  '請讓雙肩到髖部入鏡，手肘也要看得到。': 'Keep your shoulders down to your hips in view, with your elbows visible.',
  '請讓肩膀、手肘與手腕入鏡。': 'Keep your shoulder, elbow and wrist in view.',
  '請讓手肘、手腕與手掌入鏡。': 'Keep your elbow, wrist and hand in view.',
  '請讓雙肩到髖部入鏡。': 'Keep your shoulders down to your hips in view.',
  '請讓雙肩、髖部與膝蓋入鏡。': 'Keep your shoulders, hips and knees in view.',
  '請讓髖部、膝蓋與腳踝入鏡。': 'Keep your hips, knees and ankles in view.',
  '請讓膝蓋、腳踝與腳掌入鏡。': 'Keep your knees, ankles and feet in view.',
  '請讓腳踝、腳跟與腳尖入鏡。': 'Keep your ankles, heels and toes in view.',

  // Session status
  '暫停': 'Pause',
  '繼續': 'Resume',
  '暫停畫面': 'Pause the picture',
  '繼續畫面': 'Resume the picture',
  '畫面已暫停：拖曳可旋轉，雙指或滾輪可縮放，點一下可點選構造，雙擊還原；按「繼續」恢復。': 'Paused: drag to turn, pinch or use the wheel to zoom, tap to pick a structure, double-tap to reset; press Resume to continue.',
  '往後退，讓肩膀、臀部與四肢入鏡。': 'Step back so that your shoulders, hips and limbs are in view.',
  '追蹤中，影像只在這部裝置處理。': 'Tracking. Video is processed on this device only.',
  '請面向鏡頭，讓臉部保持在光線充足的位置。': 'Face the camera and keep your face well lit.',
  '追蹤中。': 'Tracking.',
  '輕量模式。': 'Lite mode.',
  '臉部追蹤暫停。': 'Face tracking is paused.',
  '手部追蹤暫停。': 'Hand tracking is paused.',
  '身體追蹤暫停。': 'Body tracking is paused.',
  '正在載入臉部追蹤模型…': 'Loading the face tracking model…',
  '正在載入手部追蹤模型…': 'Loading the hand tracking model…',
  '正在載入身體追蹤模型…': 'Loading the body tracking model…',
  '臉部追蹤暫時無法使用；保留其他可用圖層。': 'Face tracking is unavailable for now; the other layers stay on.',
  '手部追蹤暫時無法使用；保留其他可用圖層。': 'Hand tracking is unavailable for now; the other layers stay on.',
  '身體追蹤暫時無法使用；保留其他可用圖層。': 'Body tracking is unavailable for now; the other layers stay on.',
  '需要 HTTPS 才能使用攝影機，請使用安全連線開啟此網站。': 'The camera needs HTTPS. Open this site over a secure connection.',
  '正在啟動攝影機…': 'Starting the camera…',
  '示範模式，沒有使用攝影機。': 'Demo mode. The camera is not in use.',
  '請先啟動鏡頭，再切換前後鏡頭。': 'Start the camera before switching between front and rear.',
  '鏡頭已停止。你可以重新啟動或觀看示範。': 'The camera has stopped. You can start it again or watch the demo.',
  '攝影機連線已中斷，請重新啟動鏡頭，或先看示範。': 'The camera was disconnected. Start it again, or watch the demo.',
  '攝影機權限未開啟。請在瀏覽器允許相機，再按啟動鏡頭。': 'Camera permission is off. Allow the camera in your browser, then press Start camera.',
  '找不到可用的攝影機，仍可使用示範模式。': 'No camera was found. The demo still works.',
  '無法完成操作：': 'Something went wrong: ',
  '。可重新嘗試。': '. You can try again.',
  '所需追蹤模型無法載入，請確認網路後重試': 'The tracking models could not be loaded. Check your connection and try again',
  '需要 HTTPS 與支援攝影機的瀏覽器。': 'This needs HTTPS and a browser with camera support.',
  '背景追蹤逾時，請重新啟動鏡頭。': 'Background tracking timed out. Start the camera again.',
  '背景追蹤無法啟動。': 'Background tracking could not start.',
  '背景追蹤資料無法讀取。': 'Background tracking data could not be read.',
  '頭手模型下載失敗，請重試': 'The head and hand model could not be downloaded. Try again',
  '無法讀取身體遮罩。': 'The body mask could not be read.',
  '身體遮罩尚未準備完成。': 'The body mask is not ready yet.',
  '瀏覽器不支援此身體遮罩格式。': 'This browser does not support the body mask format.',

  // Picking a structure
  '構造點選': 'Structure picking',
  '點選構造': 'Pick a structure',
  '重新載入': 'Reload',
  '已選構造': 'Selected structure',
  '清除': 'Clear',
  '清除選取': 'Clear the selection',
  '構造說明': 'About this structure',
  '正在載入可點選的肌肉與骨骼…': 'Loading the muscles and bones that can be picked…',
  '點一下肌肉或骨頭查看名稱；點空白處清除。': 'Tap a muscle or bone to see its name; tap an empty spot to clear.',
  '正在載入構造說明…': 'Loading the description…',
  '構造說明載入失敗，請再點選一次重試。': 'The description could not be loaded. Pick the structure again to retry.',
  '這個構造目前沒有說明資料。': 'There is no description for this structure yet.',
  '來源：': 'Source: ',
  '（CC BY-SA 4.0）': ' (CC BY-SA 4.0)',
  '解剖 ID：': 'Anatomy ID: ',
  '未提供': 'not given',
  ' · 參考模型 ID：': ' · Reference model ID: ',
  '個別構造資料下載失敗，請重試。': 'The individual structures could not be downloaded. Try again.',
  '個別構造資料格式不符。': 'The individual structure data has an unexpected format.',
  '個別構造來源重複或不完整。': 'The individual structure data is duplicated or incomplete.',
  '找不到個別構造的模型參考。': 'The model reference of an individual structure is missing.',
  '構造說明資料格式不符。': 'The description data has an unexpected format.',
  // Kind and side of a picked structure
  '肌肉': 'Muscle', '骨骼': 'Bone', '牙齒': 'Tooth', '牙齦': 'Gingiva', '腱膜': 'Aponeurosis', '神經': 'Nerve', '構造': 'Structure',
  '正中（不分左右）': 'Midline (unpaired)',
  '來源未標示左右': 'Side not given by the source',
  '未命名構造': 'Unnamed structure',
});

export const LANGUAGES = Object.freeze(['zh', 'en']);

/** URL choice, then the stored choice, then the first browser language that is Chinese or anything else. */
export function resolveLanguage({ requested = null, stored = 'auto', preferred = [] } = {}) {
  if (LANGUAGES.includes(requested)) return requested;
  if (LANGUAGES.includes(stored)) return stored;
  const first = preferred.find(tag => typeof tag === 'string' && tag);
  return !first || /^zh\b/i.test(first) ? 'zh' : 'en';
}

export function createTranslator(language) {
  return text => language === 'en' && typeof text === 'string' && Object.hasOwn(EN, text) ? EN[text] : text;
}

let current = 'zh', translate = createTranslator(current);
export const getLanguage = () => current;
export function setLanguage(language) {
  current = LANGUAGES.includes(language) ? language : 'zh';
  translate = createTranslator(current);
}
/** The interface text for a Chinese source string, in the current language. */
export const t = text => translate(text);

const ATTRIBUTES = ['aria-label', 'title', 'content'];
/** Put the static page into the current language. Dynamic text is written through t() by its owner. */
export function translateDocument(root) {
  root.lang = current === 'en' ? 'en' : 'zh-Hant';
  if (current !== 'en') return;
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
    const source = node.nodeValue.replace(/\s+/g, ' ').trim(), translated = translate(source);
    if (source && translated !== source) node.nodeValue = node.nodeValue.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, before, after) => `${before}${translated}${after}`);
  }
  for (const name of ATTRIBUTES) for (const element of root.querySelectorAll(`[${name}]`)) {
    const translated = translate(element.getAttribute(name));
    if (translated !== element.getAttribute(name)) element.setAttribute(name, translated);
  }
}
