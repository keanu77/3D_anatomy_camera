import { test, expect } from 'vitest';
import { FIELDS, findInfo, infoKeys, sourceUrl, validateInfoTable } from '../../src/structure-info.js';

const TABLE = { schemaVersion: 1,
  articles: {
    Triceps: { rev: 11, origin: 'Scapula and humerus', insertion: 'Olecranon', action: 'Extends forearm', nerve: 'Radial nerve' },
    'Lumbricals of the foot': { rev: 12, action: 'Flex toes' },
    'Median nerve': { rev: 13, from: 'Lateral cord and medial cord', supplies: 'Forearm flexors' },
    'Thoracic vertebrae': { rev: 14, description: 'The thoracic vertebrae compose the middle segment of the vertebral column.' },
  },
  bone: { 'ninth thoracic vertebra': 'Thoracic vertebrae' },
  muscle: { 'triceps brachii': 'Triceps', 'lumbrical of foot': 'Lumbricals of the foot', 'opponens digiti minimi of foot': null },
  nerve: { 'median nerve': 'Median nerve', 'muscular branches of median nerve': 'Median nerve' } };

test('names the keys a part may be filed under, most specific first', () => {
  expect(infoKeys({ name: 'left infraspinatus muscle' })).toEqual(['infraspinatus']);
  expect(infoKeys({ name: 'medial head of right triceps brachii', wholeMuscleName: 'right triceps brachii' }))
    .toEqual(['medial head of triceps brachii', 'triceps brachii']);
  expect(infoKeys({ name: 'humeral head of left extensor carpi ulnaris' })).toEqual(['humeral head of extensor carpi ulnaris', 'extensor carpi ulnaris']);
  expect(infoKeys({ name: 'second lumbrical of left foot' })).toEqual(['second lumbrical of foot', 'lumbrical of foot']);
  expect(infoKeys({ name: 'right nerve to piriformis muscle', kind: 'nerve' })).toEqual(['nerve to piriformis muscle']);
  expect(infoKeys({ name: 'proximal phalanx of left big toe', kind: 'bone' })).toEqual(['proximal phalanx of big toe']);
  expect(infoKeys({})).toEqual([]);
});

test('finds the article for a part of the right kind', () => {
  const triceps = findInfo(TABLE, { kind: 'muscle', name: 'long head of left triceps brachii', wholeMuscleName: 'left triceps brachii' });
  expect(triceps).toEqual({ title: 'Triceps', kind: 'muscle', ...TABLE.articles.Triceps });
  expect(findInfo(TABLE, { kind: 'muscle', name: 'third lumbrical of right foot' }).title).toBe('Lumbricals of the foot');
  expect(findInfo(TABLE, { kind: 'nerve', name: 'left muscular branches of median nerve' }).title).toBe('Median nerve');
  expect(findInfo(TABLE, { kind: 'muscle', name: 'left opponens digiti minimi of foot' })).toBeNull();
  expect(findInfo(TABLE, { kind: 'bone', name: 'ninth thoracic vertebra' }).description).toMatch(/middle segment/);
  expect(findInfo(TABLE, { kind: 'bone', name: 'left humerus' })).toBeNull();
  expect(findInfo(TABLE, { kind: 'tooth', name: 'upper canine' })).toBeNull();
  expect(findInfo(TABLE, { kind: 'nerve', name: 'triceps brachii' })).toBeNull();
  expect(findInfo(null, { kind: 'muscle', name: 'triceps brachii' })).toBeNull();
});

test('links to the exact revision the text was taken from', () => {
  expect(sourceUrl({ title: 'Lumbricals of the foot', rev: 12 })).toBe('https://en.wikipedia.org/w/index.php?title=Lumbricals_of_the_foot&oldid=12');
});

test('lists the fields shown for each kind', () => {
  expect(FIELDS.muscle.map(field => field.key)).toEqual(['origin', 'insertion', 'action', 'nerve', 'blood']);
  expect(FIELDS.nerve.map(field => field.key)).toEqual(['from', 'branches', 'supplies']);
  expect(FIELDS.bone.map(field => field.key)).toEqual(['description', 'articulations']);
});

test('rejects a table that is not the published shape', () => {
  expect(validateInfoTable(TABLE)).toBe(TABLE);
  expect(() => validateInfoTable({ ...TABLE, schemaVersion: 2 })).toThrow();
  expect(() => validateInfoTable({ ...TABLE, muscle: { x: 'Missing article' } })).toThrow(/Missing article/);
  expect(() => validateInfoTable({ ...TABLE, articles: { Triceps: { rev: 'x', origin: 'a' } } })).toThrow();
  expect(() => validateInfoTable({ ...TABLE, articles: { ...TABLE.articles, Triceps: { rev: 1, origin: 5 } } })).toThrow();
  expect(() => validateInfoTable(null)).toThrow();
});

test('loads the table once, reports a failed download and lets it be retried', async () => {
  const { createStructureInfo } = await import('../../src/structure-info.js');
  const warn = (await import('vitest')).vi.spyOn(console, 'warn').mockImplementation(() => {});
  let calls = 0, ok = false;
  const info = createStructureInfo({ url: 'x.json', fetchImpl: async () => { calls++; return { ok, status: 503, json: async () => TABLE }; } });
  expect(info.state()).toBe('loading');
  expect(info.find({ kind: 'muscle', name: 'triceps brachii' })).toBeNull();
  expect(await info.load()).toBe(false);
  expect(info.state()).toBe('error'); expect(warn).toHaveBeenCalledOnce();
  ok = true;
  expect(await Promise.all([info.load(), info.load()])).toEqual([true, true]);
  expect(calls).toBe(2); expect(info.state()).toBe('ready');
  expect(info.find({ kind: 'muscle', name: 'triceps brachii' }).title).toBe('Triceps');
  await info.load(); expect(calls).toBe(2);
  warn.mockRestore();
});
