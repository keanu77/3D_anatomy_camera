import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { formatAnatomyName } from '../../src/anatomy-names.js';

describe('source element display names', () => {
  test('retains exact source English and separates anatomical side from screen position', () => {
    expect(formatAnatomyName({ id: 'FMA13323', name: 'left clavicle', kind: 'bone', side: 'L' }))
      .toEqual({ title: '鎖骨', english: 'left clavicle', kindLabel: '骨骼', sideLabel: '左側' });
    expect(formatAnatomyName({ name: 'RIGHT Femur', kind: 'bone', side: 'R' }))
      .toMatchObject({ title: '股骨', english: 'RIGHT Femur', sideLabel: '右側' });
  });

  test('preserves the specific muscle head even when its whole-muscle name is supplied', () => {
    expect(formatAnatomyName({ name: 'long head of left biceps brachii', kind: 'muscle', side: 'L', wholeMuscleName: 'left biceps brachii' }))
      .toEqual({ title: '肱二頭肌・長頭', english: 'long head of left biceps brachii',
        kindLabel: '肌肉', sideLabel: '左側', detail: '所屬肌肉：肱二頭肌' });
    expect(formatAnatomyName({ name: 'short head of left biceps brachii', kind: 'muscle' }).title).toBe('肱二頭肌・短頭');
  });

  test.each([
    ['acromial part of right deltoid', '三角肌・肩峰部'],
    ['sternocostal part of left pectoralis major', '胸大肌・胸肋部'],
    ['humeral head of left flexor carpi ulnaris', '尺側屈腕肌・肱骨頭'],
    ['left infraspinatus muscle', '棘下肌'],
    ['left second metatarsal bone', '第 2 蹠骨'],
    ['twelfth thoracic vertebra', '第 12 胸椎'],
    ['proximal phalanx of left big toe', '拇趾近節趾骨'],
    ['distal phalanx of right index finger', '食指遠節指骨'],
  ])('maps only recognized source terms: %s', (name, expected) => {
    expect(formatAnatomyName({ name }).title).toBe(expected);
    expect(formatAnatomyName({ name }).english).toBe(name);
  });

  test('does not collapse quadriceps components into a single muscle', () => {
    const titles = ['rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius']
      .map(name => formatAnatomyName({ name, kind: 'muscle' }).title);
    expect(new Set(titles).size).toBe(4);
    expect(titles).toEqual(['股直肌', '股外側肌', '股內側肌', '股中間肌']);
  });

  test('does not imply an unresolved source set is one individual muscle', () => {
    expect(formatAnatomyName({ name: 'set of dorsal interossei of left foot', kind: 'muscle' }))
      .toMatchObject({ title: '足背側骨間肌群', sideLabel: '左側' });
  });

  test('distinguishes anatomical side from mirrored source geometry for the left hand', () => {
    expect(formatAnatomyName({ id: 'FMA24436', name: 'left scaphoid', kind: 'bone', side: 'L',
      sourceId: 'FMA24435', sourceName: 'right scaphoid', sourceSide: 'R', mirrored: true }))
      .toEqual({ title: '手舟狀骨', english: 'left scaphoid', kindLabel: '骨骼', sideLabel: '左側',
        detail: '左手外觀使用右手參考模型鏡像' });
    expect(formatAnatomyName({ name: 'right scaphoid', kind: 'bone', side: 'R', sourceSide: 'R' }).detail).toBeUndefined();
  });

  test.each([['tooth', '牙齒'], ['gingiva', '牙齦'], ['aponeurosis', '腱膜']])('does not misclassify %s as bone or muscle', (kind, label) => {
    expect(formatAnatomyName({ name: 'source element', kind }).kindLabel).toBe(label);
  });

  test('unknown names and divisions remain the exact source text without guessed translations', () => {
    for (const name of ['left unlisted muscle', 'unexpected head of biceps brachii', 'constructor', '<script>source</script>']) {
      expect(formatAnatomyName({ name, kind: 'muscle' }).title).toBe(name);
    }
    expect(formatAnatomyName({ name: 'unlisted element', kind: 'other' }))
      .toEqual({ title: 'unlisted element', english: 'unlisted element', kindLabel: '構造', sideLabel: '來源未標示左右' });
    expect(formatAnatomyName()).toMatchObject({ title: '未命名構造', english: '' });
  });

  test.each([
    ['manubrium', '胸骨柄'], ['body of sternum', '胸骨體'], ['xiphoid process', '劍突'],
    ['aponeurosis of epicranius', '帽狀腱膜'], ['gingiva of lower jaw', '下牙齦'],
    ['right inferior nasal concha', '下鼻甲'], ['left flexor accessorius', '蹠方肌'], ['opponens digiti minimi of left foot', '小趾對蹠肌'], ['left latissimus dorsi', '闊背肌'], ['navicular bone of right foot', '足舟狀骨'],
    ['orbital part of right orbicularis oculi', '眼輪匝肌・眶部'], ['deep part of left masseter', '咬肌・深部'],
    ['upper head of right lateral pterygoid', '外翼肌・上頭'],
    ['right upper central secondary incisor tooth', '上顎正中門齒（恆齒）'],
    ['left lower secondary canine tooth', '下顎犬齒（恆齒）'],
    ['left lower second secondary premolar tooth', '下顎第二小臼齒（恆齒）'],
    ['right upper first secondary molar tooth', '上顎第一大臼齒（恆齒）'],
  ])('names the exact source spelling: %s', (name, expected) => {
    expect(formatAnatomyName({ name }).title).toBe(expected);
  });

  test('does not invent dentition the source does not describe', () => {
    for (const name of ['upper third secondary molar tooth', 'upper central primary incisor tooth', 'upper secondary incisor tooth']) {
      expect(formatAnatomyName({ name, kind: 'tooth' }).title).toBe(name);
    }
  });

  test('midline structures say so, while an unsided paired structure does not claim to be midline', () => {
    for (const name of ['seventh cervical vertebra', 'sacrum', 'mandible', 'vomer', 'body of sternum', 'orbicularis oris']) {
      expect(formatAnatomyName({ name }).sideLabel, name).toBe('正中（不分左右）');
    }
    expect(formatAnatomyName({ name: 'femur', kind: 'bone' }).sideLabel).toBe('來源未標示左右');
    expect(formatAnatomyName({ name: 'left parietal bone', side: 'L' }).sideLabel).toBe('左側');
  });

  test('every individually selectable source surface has a Chinese name', async () => {
    const unverified = new Set();
    let checked = 0;
    for (const bundle of ['individual-body', 'individual-head']) {
      const meta = JSON.parse(await readFile(new URL(`../../public/anatomy/${bundle}.json`, import.meta.url), 'utf8'));
      for (const part of [...meta.meshes, ...(meta.existingParts || [])].flatMap(entry => entry.parts)) {
        const formatted = formatAnatomyName(part); checked++;
        expect(formatted.english).toBe(part.name);
        if (unverified.has(part.name)) expect(formatted.title).toBe(part.name);
        else expect(formatted.title, part.name).toMatch(/[\u3400-\u9fff]/);
        if (!part.side) expect(formatted.sideLabel, part.name).toBe('正中（不分左右）');
      }
    }
    expect(checked).toBe(527);
  });

  test('all published body bone source concepts have a Chinese display name without changing English', async () => {
    const body = JSON.parse(await readFile(new URL('../../public/anatomy/body.json', import.meta.url), 'utf8'));
    const bones = body.meshes.filter(mesh => mesh.layer !== 'organs').flatMap(mesh => mesh.sourceConcepts || []);
    expect(bones.length).toBeGreaterThan(100);
    for (const part of bones) {
      const formatted = formatAnatomyName({ ...part, kind: 'bone' });
      expect(formatted.english).toBe(part.name);
      expect(formatted.title, part.name).toMatch(/[\u3400-\u9fff]/);
    }
  });
});
