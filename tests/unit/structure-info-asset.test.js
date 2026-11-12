import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import { FIELDS, findInfo, infoKeys, validateInfoTable } from '../../src/structure-info.js';

const read = path => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url)));
const table = read('public/anatomy/structure-info.json'), sources = read('tools/structure-info/sources.json');
const KNOWN = Object.values(FIELDS).flat();
const parts = ['individual-body', 'individual-head', 'peripheral'].flatMap(file => {
  const data = read(`public/anatomy/${file}.json`);
  return [...data.meshes, ...(data.existingParts || [])].flatMap(mesh => mesh.parts || []);
}).filter(part => Object.hasOwn(FIELDS, part.kind));

test('the published reference text is valid, licensed and free of wiki markup', () => {
  expect(validateInfoTable(table)).toBe(table);
  expect(table.license).toBe('CC-BY-SA-4.0');
  for (const [title, { rev, ...fields }] of Object.entries(table.articles)) {
    expect(Number.isInteger(rev), title).toBe(true);
    for (const [field, text] of Object.entries(fields)) {
      expect(KNOWN.some(known => known.key === field), `${title} ${field}`).toBe(true);
      expect(text, `${title} ${field}`).not.toMatch(/\[\[|\]\]|\{\{|\}\}|[<>]|'''?|&\w+;|https?:/);
      expect(text.length, `${title} ${field}`).toBeLessThan(520);
      expect(text, `${title} ${field}`).toBe(text.trim());
    }
  }
});

test('the published index is exactly the reviewed source list, and every article is used', () => {
  expect(table.muscle).toEqual(sources.muscle);
  expect(table.nerve).toEqual(sources.nerve);
  expect(table.bone).toEqual(sources.bone);
  const used = new Set(Object.keys(FIELDS).flatMap(kind => Object.values(table[kind])).filter(Boolean));
  expect(Object.keys(table.articles).sort()).toEqual([...used].sort());
  // An article describes one kind of structure: its fields belong to that kind alone.
  for (const kind of Object.keys(FIELDS)) {
    const keys = new Set(FIELDS[kind].map(field => field.key));
    for (const title of new Set(Object.values(table[kind]).filter(Boolean))) {
      const { rev, ...fields } = table.articles[title];
      expect(Object.keys(fields).every(field => keys.has(field)), `${kind} ${title}`).toBe(true);
    }
  }
});

test('every shipped muscle, nerve and bone has a reviewed decision, and most have text', () => {
  const described = { muscle: 0, nerve: 0, bone: 0 }, total = { muscle: 0, nerve: 0, bone: 0 };
  for (const part of parts) {
    total[part.kind]++;
    expect(infoKeys(part).some(key => Object.hasOwn(table[part.kind], key)), `${part.kind} ${part.name} is undecided`).toBe(true);
    if (findInfo(table, part)) described[part.kind]++;
  }
  expect(total.muscle).toBeGreaterThan(300); expect(total.nerve).toBeGreaterThan(200);
  expect(described.muscle / total.muscle).toBeGreaterThan(0.95);
  expect(described.nerve / total.nerve).toBeGreaterThan(0.85);
  expect(total.bone).toBeGreaterThan(150); expect(described.bone).toBe(total.bone);
  // Every bone opens with a sentence from its article.
  for (const title of new Set(Object.values(table.bone))) expect(table.articles[title].description, title).toMatch(/^[A-Z].{30,}/s);
});

test('a division shows its whole muscle and a named branch shows its own article', () => {
  const part = name => parts.find(candidate => candidate.name === name) || (() => { throw new Error(`missing ${name}`); })();
  const triceps = findInfo(table, part('medial head of left triceps brachii'));
  expect(triceps.title).toBe('Triceps'); expect(triceps.nerve).toMatch(/radial nerve/i);
  expect(findInfo(table, part('left median nerve')).from).toMatch(/lateral cord and medial cord/i);
  expect(findInfo(table, part('right gluteus medius')).nerve).toMatch(/superior gluteal nerve/i);
  const femur = findInfo(table, part('left femur'));
  expect(femur.description).toMatch(/^The femur \(pl\.: femurs or femora\), or thigh bone is the only bone in the thigh/);
  expect(femur.articulations).toMatch(/acetabulum/);
  expect(findInfo(table, part('seventh thoracic vertebra')).title).toBe('Thoracic vertebrae');
});
