// Reference text about a picked muscle, nerve or bone, taken from English Wikipedia articles
// (see LICENSES/Wikipedia.md). The table is built by tools/build_structure_info.mjs.

export const FIELDS = Object.freeze({
  muscle: Object.freeze([
    { key: 'origin', label: 'Origin' }, { key: 'insertion', label: 'Insertion' }, { key: 'action', label: 'Action' },
    { key: 'nerve', label: 'Nerve supply' }, { key: 'blood', label: 'Blood supply' }]),
  nerve: Object.freeze([
    { key: 'from', label: 'Arises from' }, { key: 'branches', label: 'Branches' }, { key: 'supplies', label: 'Supplies' }]),
  bone: Object.freeze([
    { key: 'description', label: 'Description' }, { key: 'articulations', label: 'Articulations' }]),
});

const normalize = name => name.toLowerCase().replace(/\b(left|right)\b\s*/g, '').replace(/\s+/g, ' ').trim();

/** Names a part may be filed under, most specific first: itself, then the whole it is a division of. */
export function infoKeys(part = {}) {
  if (typeof part.name !== 'string' || !part.name) return [];
  const own = normalize(part.name);
  if (part.kind === 'nerve' || part.kind === 'bone') return [own];
  const keys = [own.replace(/ muscle$/, '')];
  const division = keys[0].match(/^.+ (?:head|part) of (.+)$/);
  if (division) keys.push(division[1]);
  if (typeof part.wholeMuscleName === 'string' && part.wholeMuscleName) keys.push(normalize(part.wholeMuscleName).replace(/ muscle$/, ''));
  const numbered = keys[0].match(/^(?:first|second|third|fourth|fifth) (.+ of (?:foot|hand))$/);
  if (numbered) keys.push(numbered[1]);
  return [...new Set(keys)];
}

/** The article describing a part, or null. A division of a muscle gets the whole muscle's article. */
export function findInfo(table, part = {}) {
  const index = Object.hasOwn(FIELDS, part.kind) ? table?.[part.kind] : null;
  if (!index) return null;
  for (const key of infoKeys(part)) {
    const title = Object.hasOwn(index, key) ? index[key] : null;
    if (title) return { title, kind: part.kind, ...table.articles[title] };
  }
  return null;
}

export function sourceUrl({ title, rev }) {
  return `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${rev}`;
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

/** Throws unless the downloaded table has the published shape; returns it otherwise. */
export function validateInfoTable(table) {
  if (!isRecord(table) || table.schemaVersion !== 1 || !isRecord(table.articles)) throw new Error('構造說明資料格式不符。');
  for (const [title, article] of Object.entries(table.articles)) {
    const { rev, ...fields } = isRecord(article) ? article : {};
    const texts = Object.values(fields);
    if (!Number.isInteger(rev) || rev <= 0 || !texts.length || texts.some(text => typeof text !== 'string' || !text)) {
      throw new Error(`構造說明資料格式不符：${title}`);
    }
  }
  for (const kind of Object.keys(FIELDS)) {
    if (!isRecord(table[kind])) throw new Error('構造說明資料格式不符。');
    for (const title of Object.values(table[kind])) {
      if (title !== null && !Object.hasOwn(table.articles, title)) throw new Error(`構造說明資料缺少條目：${title}`);
    }
  }
  return table;
}

/** Downloads the table once, on first use. A failed download may be retried by calling load again. */
export function createStructureInfo({ url, fetchImpl = (...args) => fetch(...args) }) {
  let table = null, pending = null, failed = false;
  async function load() {
    if (table) return true;
    pending ||= (async () => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        table = validateInfoTable(await response.json()); failed = false;
        return true;
      } catch (error) {
        failed = true; console.warn('Structure reference text could not be loaded:', error);
        return false;
      } finally { pending = null; }
    })();
    return pending;
  }
  return { load, find: part => findInfo(table, part), state: () => table ? 'ready' : failed && !pending ? 'error' : 'loading' };
}
