#!/usr/bin/env node
// Builds public/anatomy/structure-info.json: the origin, insertion, action and supply of each
// shipped muscle, the source, branches and territory of each shipped nerve, and the articulations of
// each shipped bone, as stated in the infobox of its English Wikipedia article (CC BY-SA 4.0).
// A bone also gets the opening paragraph of its article.
//
//   node tools/build_structure_info.mjs            rebuild from the revisions already pinned in the output
//   node tools/build_structure_info.mjs --refresh  take the current revision of every article
//   node tools/build_structure_info.mjs --verify   fail unless a rebuild reproduces the committed file
//
// tools/structure-info/sources.json says which article describes which name, and lists every repair and omission. Fetched revisions are
// cached under tools/cache/wikipedia, so a pinned rebuild needs no network after the first run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { infoKeys } from '../src/structure-info.js';
import { infoboxParams, leadParagraph, plainText } from './structure-info/wikitext.mjs';

const OUTPUT = 'public/anatomy/structure-info.json', SOURCES = 'tools/structure-info/sources.json';
const CACHE = 'tools/cache/wikipedia', REPORT = 'tools/out/structure-info-table.md';
const API = 'https://en.wikipedia.org/w/api.php', AGENT = 'anatomy-structure-info-builder/1.0';
// Output field -> infobox parameter, per kind of structure.
const PARAMS = {
  muscle: { origin: 'origin', insertion: 'insertion', action: 'action', nerve: 'nerve', blood: 'blood' },
  nerve: { from: 'branchfrom', branches: 'branchto', supplies: 'innervates' },
  // The bone infobox also has Origins and Insertions, but only nine articles fill them and some misuse them.
  bone: { articulations: 'articulations' },
};
// Kinds that open with their article's first paragraph; for these an infobox is welcome but not required.
const LEAD = { bone: 'description' };
const KINDS = Object.keys(PARAMS);
const flags = new Set(process.argv.slice(2));
for (const flag of flags) if (!['--refresh', '--verify'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function shippedParts() {
  const parts = [];
  for (const file of ['individual-body', 'individual-head', 'peripheral']) {
    const data = await readJson(`public/anatomy/${file}.json`);
    for (const mesh of [...data.meshes, ...(data.existingParts || [])]) {
      for (const part of mesh.parts || []) if (KINDS.includes(part.kind)) parts.push(part);
    }
  }
  return parts;
}

/** Every shipped name must be decided in the sources file, and the file must not keep stale names. */
function checkSources(sources, parts) {
  const used = Object.fromEntries(KINDS.map(kind => [kind, new Set()])), unmapped = new Set();
  for (const part of parts) {
    const key = infoKeys(part).find(candidate => Object.hasOwn(sources[part.kind], candidate));
    if (key === undefined) unmapped.add(`${part.kind}: ${infoKeys(part).at(-1)}`);
    else used[part.kind].add(key);
  }
  if (unmapped.size) throw new Error(`Names missing from ${SOURCES} (add an article title or null):\n  ${[...unmapped].sort().join('\n  ')}`);
  const stale = KINDS.flatMap(kind => Object.keys(sources[kind]).filter(key => !used[kind].has(key)).map(key => `${kind}: ${key}`));
  if (stale.length) throw new Error(`Names in ${SOURCES} that no shipped structure uses:\n  ${stale.join('\n  ')}`);
  const kindOf = new Map();
  for (const kind of KINDS) {
    for (const title of Object.values(sources[kind])) {
      if (title === null) continue;
      if (kindOf.has(title) && kindOf.get(title) !== kind) throw new Error(`${title} is listed under both ${kindOf.get(title)} and ${kind}.`);
      kindOf.set(title, kind);
    }
  }
  return kindOf;
}

async function query(params) {
  const url = `${API}?${new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', format: 'json', formatversion: '2', maxlag: '5', ...params })}`;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
    if (response.ok) {
      const body = await response.json();
      if (!body.error) return body.query;
      if (body.error.code !== 'maxlag') throw new Error(`Wikipedia API: ${body.error.info}`);
    } else if (![429, 503].includes(response.status)) throw new Error(`Wikipedia API: HTTP ${response.status}`);
    const wait = Math.min(90, Number(response.headers.get('retry-after')) || attempt * 10);
    console.error(`  Wikipedia asked to slow down; waiting ${wait} s`);
    await sleep(wait * 1000);
  }
  throw new Error('Wikipedia API kept refusing requests.');
}

/** title -> { title, rev, text }, at the pinned revision when one is given. */
async function fetchArticles(titles, pinned) {
  await mkdir(CACHE, { recursive: true });
  const articles = new Map(), wanted = [];
  for (const title of titles) {
    const rev = pinned.get(title), path = `${CACHE}/${rev}.json`;
    if (rev && existsSync(path)) articles.set(title, await readJson(path));
    else wanted.push({ title, rev });
  }
  for (const [byRevision, group] of [[true, wanted.filter(item => item.rev)], [false, wanted.filter(item => !item.rev)]]) {
    for (let start = 0; start < group.length; start += 20) {
      const batch = group.slice(start, start + 20);
      const result = await query(byRevision ? { revids: batch.map(item => item.rev).join('|') } : { titles: batch.map(item => item.title).join('|') });
      if (result.normalized?.length) throw new Error(`Use Wikipedia's own spelling for: ${result.normalized.map(item => `${item.from} -> ${item.to}`).join(', ')}`);
      for (const { title, rev } of batch) {
        const page = result.pages.find(candidate => candidate.title === title);
        const revision = page?.revisions?.find(candidate => !rev || candidate.revid === rev);
        if (!revision) throw new Error(`No Wikipedia article ${rev ? `revision ${rev} of ` : 'named '}${title}`);
        const article = { title, rev: revision.revid, text: revision.slots.main.content };
        if (/^\s*#redirect/i.test(article.text)) throw new Error(`${title} is a redirect; list the article it points to.`);
        await writeFile(`${CACHE}/${article.rev}.json`, JSON.stringify(article));
        articles.set(title, article);
      }
      if (start + 20 < group.length) await sleep(1500);
    }
  }
  return articles;
}

/** Stray characters in an article's source are removed by an explicit, listed repair; a repair that no longer applies is an error. */
function repaired(article, repairs) {
  let text = article.text;
  for (const [from, to] of repairs[article.title] || []) {
    if (!text.includes(from)) throw new Error(`${article.title} no longer contains the repaired text ${JSON.stringify(from)}; remove the repair from ${SOURCES}.`);
    text = text.replace(from, to);
  }
  return text;
}

function extract(article, kind, { repairs, omit }) {
  const text = repaired(article, repairs), params = infoboxParams(text, kind);
  if (!params && !LEAD[kind]) throw new Error(`${article.title} has no Infobox ${kind}; set it to null in ${SOURCES} or choose another article.`);
  const entry = { rev: article.rev };
  const read = (label, convert) => {
    try { return convert(); }
    catch (error) { throw new Error(`${article.title}, ${label}: ${error.message}`); }
  };
  if (LEAD[kind]) entry[LEAD[kind]] = read('opening paragraph', () => leadParagraph(text));
  for (const [field, param] of Object.entries(PARAMS[kind])) {
    const value = read(param, () => plainText(params?.get(param) || ''));
    if (value) entry[field] = value;
  }
  for (const field of omit[article.title] || []) {
    if (!entry[field]) throw new Error(`${article.title} no longer states ${field}; remove it from the omit list in ${SOURCES}.`);
    delete entry[field];
  }
  if (Object.keys(entry).length === 1) throw new Error(`${article.title} states none of the wanted fields; set it to null in ${SOURCES}.`);
  return entry;
}

function report(output, sources, parts) {
  const rows = [], escape = text => (text || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const counts = {};
  for (const kind of KINDS) {
    const fields = [...(LEAD[kind] ? [LEAD[kind]] : []), ...Object.keys(PARAMS[kind])], names = Object.keys(sources[kind]).sort();
    const described = parts.filter(part => part.kind === kind && infoKeys(part).some(key => sources[kind][key]));
    counts[kind] = { names: names.length, withArticle: names.filter(name => sources[kind][name]).length,
      parts: parts.filter(part => part.kind === kind).length, partsDescribed: described.length,
      ...Object.fromEntries(fields.map(field => [field, names.filter(name => output.articles[sources[kind][name]]?.[field]).length])) };
    rows.push(`## ${kind}`, '', `| name in the model | Wikipedia article | ${fields.join(' | ')} |`, `|${' --- |'.repeat(fields.length + 2)}`);
    for (const name of names) {
      const title = sources[kind][name], article = output.articles[title];
      rows.push(`| ${name} | ${title ? `[${title}](https://en.wikipedia.org/w/index.php?oldid=${article.rev})` : '(none)'} | ${fields.map(field => escape(article?.[field])).join(' | ')} |`);
    }
    rows.push('');
  }
  return { text: `# Structure reference text, as shown in the app\n\n${rows.join('\n')}`, counts };
}

const sources = await readJson(SOURCES), parts = await shippedParts();
const kindOf = checkSources(sources, parts);
const previous = existsSync(OUTPUT) ? await readJson(OUTPUT) : null;
const pinned = new Map(flags.has('--refresh') || !previous ? [] : Object.entries(previous.articles).map(([title, article]) => [title, article.rev]));
const fetched = await fetchArticles([...kindOf.keys()].sort(), pinned);
for (const title of [...Object.keys(sources.repairs), ...Object.keys(sources.omit)]) if (!kindOf.has(title)) throw new Error(`Repair or omission for an article that is not used: ${title}`);
/** Reports every article that cannot be converted at once, not only the first. */
function extractAll() {
  const entries = [], problems = [];
  for (const [title, kind] of kindOf) {
    try { entries.push([title, extract(fetched.get(title), kind, sources)]); }
    catch (error) { problems.push(error.message); }
  }
  if (problems.length) throw new Error(`${problems.length} article(s) could not be converted:\n  ${problems.join('\n  ')}`);
  return entries;
}
const sorted = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const output = {
  schemaVersion: 1,
  source: 'English Wikipedia (en.wikipedia.org), infobox fields and opening paragraphs of the listed article revisions',
  license: 'CC-BY-SA-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Text by Wikipedia contributors. Each entry names its article and the exact revision. Markup, citations and pronunciations were removed and opening paragraphs end at a sentence; the few repaired stray characters and omitted fields are listed in tools/structure-info/sources.json.',
  articles: sorted(Object.fromEntries(extractAll())),
  ...Object.fromEntries(KINDS.map(kind => [kind, sorted(sources[kind])])),
};
const serialized = `${JSON.stringify(output, null, 1)}\n`;
const { text, counts } = report(output, sources, parts);
if (flags.has('--verify')) {
  if (!previous || serialized !== await readFile(OUTPUT, 'utf8')) throw new Error(`${OUTPUT} is not what the pinned revisions produce.`);
  console.log(`${OUTPUT} reproduces from the pinned revisions.`);
} else {
  await writeFile(OUTPUT, serialized);
  await mkdir('tools/out', { recursive: true });
  await writeFile(REPORT, text);
  console.log(`Wrote ${OUTPUT} (${serialized.length} bytes) and ${REPORT}.`);
}
console.log(JSON.stringify(counts, null, 1));
