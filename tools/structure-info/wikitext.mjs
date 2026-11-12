// Reads one infobox out of MediaWiki source and turns its values into plain text.
// Anything it does not recognise is an error: silently dropping markup could drop anatomy.

const DROPPED = /^(?:cite .+|citation|citation needed|cn|fact|sfnp?|efn|refn|rp?|dubious|better source needed|page needed|full citation needed|verify source|failed verification|when|which)$/;
const WRAPPERS = new Set(['nowrap', 'nobr', 'small', 'smaller', 'abbr', 'citation needed span']);
const LISTS = new Set(['plainlist', 'plain list', 'unbulleted list', 'ubl', 'flatlist', 'hlist', 'bulleted list']);
const TAGS = new Set(['sub', 'sup', 'small', 'span', 'i', 'b', 'nowiki']);
const ENTITIES = { nbsp: ' ', ndash: '–', mdash: '—', amp: '&', times: '×', deg: '°', minus: '−', thinsp: ' ' };
const withoutComments = text => text.replace(/<!--[\s\S]*?-->/g, '');

/** Parameters of the first `{{Infobox <box>}}`, keyed by lower-case name; null when the page has none. */
export function infoboxParams(wikitext, box) {
  const text = withoutComments(wikitext);
  const start = text.search(new RegExp(`\\{\\{\\s*Infobox[ _]+${box}\\b`, 'i'));
  if (start < 0) return null;
  const pieces = [];
  let braces = 0, links = 0, from = start + 2;
  for (let i = start; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') { braces++; i++; }
    else if (pair === '}}') {
      braces--; i++;
      if (!braces) { pieces.push(text.slice(from, i - 1)); break; }
    } else if (pair === '[[') { links++; i++; }
    else if (pair === ']]') { links = Math.max(0, links - 1); i++; }
    else if (text[i] === '|' && braces === 1 && !links) { pieces.push(text.slice(from, i)); from = i + 1; }
  }
  if (braces) throw new Error(`Unclosed Infobox ${box}`);
  const params = new Map();
  for (const piece of pieces.slice(1)) {
    const equals = piece.indexOf('=');
    if (equals > 0) params.set(piece.slice(0, equals).trim().toLowerCase(), piece.slice(equals + 1).trim());
  }
  return params;
}

// Templates that only occur in running prose. A pronunciation leaves a marker so that the
// punctuation around it can be removed with it.
const SILENT = '\u0000';
const LANGUAGES = { la: 'Latin', grc: 'Ancient Greek', el: 'Greek', fr: 'French', de: 'German' };
function expandProseTemplate(name, positional) {
  if (/^(?:ipa\b.*|ipac-\w+|respell|pronunciation|audio)$/.test(name)) return SILENT;
  if (name === 'plural form') return 'pl.';
  if (name === 'singular' || name === 'singular abbr') return positional[0] ? `sg.: ${positional[0]}` : 'sg.';
  if (name === 'lang' || name === 'wikt-lang') return positional[1] ?? '';
  if (name === 'langx') {
    const language = LANGUAGES[positional[0]];
    if (!language) throw new Error(`Unhandled language code: ${positional[0]}`);
    return `${language}: ${positional[1] ?? ''}`;
  }
  if (name === 'gloss') return `'${positional[0] ?? ''}'`;
  if (name === 'convert') return `${positional[0]} ${positional[1]}`;
  if (name === 'snd' || name === 'spaced ndash') return ' – ';
  if (name === 'ndash') return '–';
  return null;
}

function expandTemplate(body, prose) {
  const [rawName, ...args] = body.split('|');
  const name = rawName.trim().toLowerCase().replace(/_/g, ' ');
  const positional = args.filter(arg => !/^\s*[\w ]+=/.test(arg)).map(arg => arg.trim());
  const named = key => args.find(arg => new RegExp(`^\\s*${key}\\s*=`).test(arg))?.replace(/^[^=]*=/, '').trim();
  if (DROPPED.test(name)) return '';
  const inProse = prose ? expandProseTemplate(name, positional) : null;
  if (inProse !== null) return inProse;
  if (name === 'frac') {
    if (positional.length === 3) return `${positional[0]} ${positional[1]}/${positional[2]}`;
    return positional.length === 2 ? `${positional[0]}/${positional[1]}` : `1/${positional[0]}`;
  }
  if (name === 'clarify') return named('text') ?? '';
  if (WRAPPERS.has(name)) return named('text') ?? positional[0] ?? '';
  if (LISTS.has(name)) return `\n${positional.join('\n')}\n`;
  throw new Error(`Unhandled template: ${name}`);
}

/** One infobox value as plain text, one item per line. `prose` also accepts the templates of running text. */
export function plainText(value, { prose = false } = {}) {
  let text = withoutComments(value).replace(/<ref\b[^>]*\/>/gi, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
  for (let before; before !== text;) {
    before = text;
    text = text.replace(/\[\[([^[\]]*)\]\]/g, (_, link) => {
      if (/^\s*(?:file|image|category)\s*:/i.test(link)) throw new Error(`Unsupported markup: ${link.slice(0, 40)}`);
      return link.slice(link.lastIndexOf('|') + 1);
    });
  }
  for (let before; before !== text;) {
    before = text;
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, body) => expandTemplate(body, prose));
  }
  text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name) => {
    if (!TAGS.has(name.toLowerCase())) throw new Error(`Unsupported tag: ${name}`);
    return '';
  });
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]\s]+\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&(#\d+|\w+);/g, (entity, code) => {
      if (code[0] === '#') return String.fromCodePoint(Number(code.slice(1)));
      if (!(code in ENTITIES)) throw new Error(`Unsupported entity: ${entity}`);
      return ENTITIES[code];
    });
  const lines = text.split('\n').map(line => line.replace(/^\s*[*#:;]+\s*/, '').replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim()).filter(Boolean);
  const result = lines.join('\n');
  if (/\[\[|\]\]|\{\{|\}\}|[<>]|\{\||\|\}/.test(result)) throw new Error(`Unsupported markup left in: ${result.slice(0, 80)}`);
  return result;
}

/** Removes templates and file links that stand on lines of their own: infoboxes, hatnotes, images. */
function withoutBlocks(text) {
  const spans = [];
  for (const [open, close, wanted] of [['{{', '}}', () => true], ['[[', ']]', inner => /^\s*(?:file|image)\s*:/i.test(inner)]]) {
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const pair = text.slice(i, i + 2);
      if (pair === open) { if (!depth++) start = i; i++; }
      else if (pair === close && depth) {
        i++;
        if (--depth) continue;
        const lineStart = text.lastIndexOf('\n', start) + 1, lineEnd = text.indexOf('\n', i + 1);
        const alone = !text.slice(lineStart, start).trim() && !text.slice(i + 1, lineEnd < 0 ? text.length : lineEnd).trim();
        if (alone && wanted(text.slice(start + 2, i - 1))) spans.push([start, i + 1]);
      }
    }
  }
  return spans.sort((a, b) => b[0] - a[0]).reduce((rest, [from, to]) => rest.slice(0, from) + rest.slice(to), text);
}

/**
 * The opening paragraph of an article as plain text: whole sentences from its start, up to `limit`
 * characters (always at least one). Pronunciations are left out. A list the paragraph introduces is kept.
 */
export function leadParagraph(wikitext, { limit = 420 } = {}) {
  const body = withoutBlocks(withoutComments(wikitext).replace(/<ref\b[^>]*\/>/gi, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ''));
  const paragraphs = body.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
  const isProse = paragraph => /^['"A-Za-z]/.test(paragraph);
  const index = paragraphs.findIndex(paragraph => isProse(paragraph) && paragraph.includes("'''"));
  if (index < 0 || /^=/m.test(paragraphs.slice(0, index).join('\n'))) throw new Error('No readable opening paragraph');
  // A list may follow its introducing sentence directly or after a blank line.
  const following = paragraphs[index + 1]?.startsWith('*') ? `\n${paragraphs[index + 1]}` : '';
  const [opening, ...items] = `${paragraphs[index]}${following}`.split(/\n(?=\*)/);
  const clean = text => plainText(text, { prose: true })
    .replace(new RegExp(`\\s*${SILENT}\\s*[;,]?\\s*`, 'g'), ' ').replace(/\(\s*[;,:]\s*/g, '(').replace(/\s*[;,]\s*\)/g, ')')
    .replace(/\s*\((?:\s|\bor\b|\band\b|[;,])*\)/g, '').replace(/ +([,.;:)])/g, '$1').replace(/\( +/g, '(').replace(/ {2,}/g, ' ').trim();
  const text = clean(opening.replace(/\n/g, ' '));
  if (!text) throw new Error('No readable opening paragraph');
  if (text.endsWith(':') && items.length) return [text, ...items.map(clean)].join('\n');
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  let kept = sentences[0];
  for (const sentence of sentences.slice(1)) {
    if (kept.length + 1 + sentence.length > limit) break;
    kept += ` ${sentence}`;
  }
  return kept;
}
