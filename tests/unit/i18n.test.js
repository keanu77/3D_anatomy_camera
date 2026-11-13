import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { createTranslator, resolveLanguage, setLanguage, getLanguage, t } from '../../src/i18n.js';
import { REGIONS } from '../../src/regions.js';
import { DEFAULTS, sanitizeSettings } from '../../src/settings.js';

const english = createTranslator('en'), chinese = createTranslator('zh');
const hasChinese = (text) => /[\u4e00-\u9fff]/.test(text);
// The author's name is not romanized anywhere in the project.
const withoutName = (text) => text.replaceAll('吳易澄', '');
afterEach(() => setLanguage('zh'));

describe('interface language', () => {
  test('the URL wins, then the stored choice, then the browser; Chinese browsers and unknown ones get Chinese', () => {
    expect(resolveLanguage({ requested: 'en', stored: 'zh', preferred: ['zh-TW'] })).toBe('en');
    expect(resolveLanguage({ requested: 'fr', stored: 'en', preferred: ['zh-TW'] })).toBe('en');
    expect(resolveLanguage({ stored: 'auto', preferred: ['zh-TW', 'en'] })).toBe('zh');
    expect(resolveLanguage({ stored: 'auto', preferred: ['zh-Hans-CN'] })).toBe('zh');
    expect(resolveLanguage({ stored: 'auto', preferred: ['en-US', 'zh-TW'] })).toBe('en');
    expect(resolveLanguage({ stored: 'auto', preferred: ['ja'] })).toBe('en');
    expect(resolveLanguage({ stored: 'auto', preferred: [] })).toBe('zh');
    expect(resolveLanguage()).toBe('zh');
  });
  test('the stored language is one of three values and defaults to following the browser', () => {
    expect(DEFAULTS.language).toBe('auto');
    expect(sanitizeSettings({ language: 'en' }).language).toBe('en');
    expect(sanitizeSettings({ language: 'https://attacker.invalid/' }).language).toBe('auto');
  });
  test('Chinese is returned untouched and an unknown text is never dropped', () => {
    expect(chinese('啟動鏡頭')).toBe('啟動鏡頭');
    expect(english('啟動鏡頭')).toBe('Start camera');
    expect(english('沒有收錄的句子')).toBe('沒有收錄的句子');
    expect(english('constructor')).toBe('constructor');
    expect(english(undefined)).toBeUndefined();
    setLanguage('en'); expect(getLanguage()).toBe('en'); expect(t('暫停')).toBe('Pause');
    setLanguage('nonsense'); expect(getLanguage()).toBe('zh'); expect(t('暫停')).toBe('暫停');
  });
  test('every region label, description and framing hint has English without Chinese left in it', () => {
    for (const region of REGIONS) for (const key of ['label', 'note', 'frame']) {
      const translated = english(region[key]);
      expect(translated, `${region.id}.${key}`).not.toBe(region[key]);
      expect(hasChinese(translated), `${region.id}.${key}: ${translated}`).toBe(false);
    }
  });
  test('every Chinese text and label in the page has English', () => {
    const html = readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const texts = [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].replace(/\s+/g, ' ').trim());
    const labels = [...html.matchAll(/(?:aria-label|title|content|alt)="([^"]*)"/g)].map((match) => match[1]);
    const untranslated = [...new Set([...texts, ...labels])].filter((text) => hasChinese(withoutName(text)) && hasChinese(withoutName(english(text))));
    expect(untranslated).toEqual([]);
  });
  test('every Chinese message written by the application code has English', () => {
    const directory = new URL('../../src/', import.meta.url);
    // Name tables are data, shown in Chinese only when Chinese is asked for; this file is the dictionary itself.
    // regions.js and tracking-core.js have their own cases here: their texts are data and joined sentences.
    const skipped = ['anatomy-names.js', 'nerve-names.js', 'label-names.js', 'i18n.js', 'regions.js', 'tracking-core.js'];
    const untranslated = [];
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.js') && !skipped.includes(name))) {
      const code = readFileSync(new URL(file, directory), 'utf8').replace(/\/\/.*$/gm, '');
      for (const [, , literal] of code.matchAll(/(['`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
        if (!hasChinese(literal)) continue;
        // A template is checked by its fixed pieces.
        for (const piece of literal.split(/\$\{[^}]*\}/).filter(hasChinese)) {
          if (hasChinese(english(piece)) && !/^(此處重疊 | 個構造，切換查看|將介面切換為中文|中文|構造說明資料格式不符：|構造說明資料缺少條目：)$/.test(piece)) untranslated.push(`${file}: ${piece}`);
        }
      }
    }
    expect(untranslated).toEqual([]);
  });
  test('each tracker has its own whole sentences, because English orders the words differently', () => {
    for (const name of ['臉部', '手部', '身體']) for (const sentence of [`${name}追蹤暫停。`, `正在載入${name}追蹤模型…`, `${name}追蹤暫時無法使用；保留其他可用圖層。`]) {
      expect(hasChinese(english(sentence)), sentence).toBe(false);
    }
  });
});
