// Shared canvas layout for body/system overviews. The original head-only layout
// stays separate so close-up labels retain their original behavior.

const ROW = 16;
/** Fraction of the width an anchor must cross the middle by before its label changes column. */
export const SIDE_HOLD = 0.05;
/** Pixels two anchors must separate by before their labels trade rows. */
export const ORDER_HOLD = 8;

// The same name may be drawn twice (left and right structures): number repeats in input order.
function keyed(items) {
  const seen = new Map();
  return items.map(item => {
    const n = seen.get(item.text) ?? 0;
    seen.set(item.text, n + 1);
    return { item, key: `${item.text}\u0000${n}` };
  });
}

function sideOf(ax, width, previous) {
  const middle = width / 2, hold = width * SIDE_HOLD;
  if (previous === 'left' && ax < middle + hold) return 'left';
  if (previous === 'right' && ax > middle - hold) return 'right';
  return ax < middle ? 'left' : 'right';
}

// Top to bottom by anchor height. Labels seen last frame keep their order until
// their anchors are clearly apart; new labels go straight to their height.
function ordered(list, rank) {
  const start = [...list].sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
  const result = [];
  for (const entry of start) {
    let j = result.length;
    while (j > 0) {
      const above = result[j - 1];
      const hold = rank.has(entry.key) && rank.has(above.key) ? ORDER_HOLD : 0;
      if (above.item.ay - entry.item.ay > hold) j--; else break;
    }
    result.splice(j, 0, entry);
  }
  return result;
}

function sample(list, count) {
  if (count <= 0) return [];
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, i) => list[Math.round(i * (list.length - 1) / Math.max(1, count - 1))]);
}

// More labels than rows: show an even spread, but keep the ones already on screen.
function chosen(list, capacity, shown) {
  if (list.length <= capacity) return list;
  const pick = new Set(sample(list.filter(entry => shown.has(entry.key)), capacity));
  for (const entry of sample(list, capacity)) if (pick.size < capacity) pick.add(entry);
  for (const entry of sample(list.filter(entry => !pick.has(entry)), capacity - pick.size)) pick.add(entry);
  return list.filter(entry => pick.has(entry));
}

function place(visible, side, width, height, measureText) {
  let previous = -Infinity;
  const maxWidth = Math.max(20, width * 0.32 - 12);
  return visible.map(({ item }, index) => {
    const ceiling = height - 12 - (visible.length - 1 - index) * ROW;
    const y = Math.max(12, Math.min(item.ay, ceiling), previous + ROW); previous = y;
    let text = item.text;
    if (measureText(text) > maxWidth) {
      while (text.length && measureText(text + '…') > maxWidth) text = text.slice(0, -1);
      text += '…';
    }
    const textWidth = measureText(text);
    const x = side === 'left' ? 8 : width - 8;
    return { ...item, text, x, y, align: side,
      lineEnd: side === 'left' ? x + textWidth + 4 : x - textWidth - 4,
      bounds: { x: side === 'left' ? x : x - textWidth, y: y - 7, width: textWidth, height: 14 } };
  });
}

function layoutWith(memory, items, width, height, measureText) {
  const entries = keyed(items);
  const sides = new Map(entries.map(({ item, key }) => [key, sideOf(item.ax, width, memory.sides.get(key))]));
  const capacity = Math.max(1, Math.floor((height - 24) / ROW) + 1);
  const rank = new Map(), shown = new Set(), result = [];
  for (const side of ['left', 'right']) {
    const list = ordered(entries.filter(({ key }) => sides.get(key) === side), memory.rank);
    list.forEach(({ key }, index) => rank.set(key, index));
    const visible = chosen(list, capacity, memory.shown);
    for (const { key } of visible) shown.add(key);
    result.push(...place(visible, side, width, height, measureText));
  }
  return { result, memory: { sides, rank, shown } };
}

const EMPTY = Object.freeze({ sides: new Map(), rank: new Map(), shown: new Set() });

/** One frame, no memory of earlier frames. */
export function layoutOverview(items, width, height, measureText) {
  return layoutWith(EMPTY, items, width, height, measureText).result;
}

/** A layout that remembers the last frame, so labels keep their column, row and
 * place on screen while their anchors only waver. */
export function createOverviewLayout() {
  let memory = EMPTY;
  return {
    layout(items, width, height, measureText) {
      const next = layoutWith(memory, items, width, height, measureText);
      memory = next.memory;
      return next.result;
    },
    reset() { memory = EMPTY; },
  };
}
