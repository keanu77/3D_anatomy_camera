// Shared canvas layout for body/system overviews. The original head-only layout
// stays separate so close-up labels retain their original behavior.
export function layoutOverview(items, width, height, measureText) {
  const result = [];
  for (const side of ['left', 'right']) {
    const list = items.filter(item => (item.ax < width / 2 ? 'left' : 'right') === side).sort((a, b) => a.ay - b.ay);
    const capacity = Math.max(1, Math.floor((height - 24) / 16) + 1);
    const visible = list.length <= capacity ? list : Array.from({ length: capacity }, (_, i) => list[Math.round(i * (list.length - 1) / Math.max(1, capacity - 1))]);
    let previous = -Infinity;
    const positioned = visible.map((item, index) => {
      const ceiling = height - 12 - (visible.length - 1 - index) * 16;
      const y = Math.max(12, Math.min(item.ay, ceiling), previous + 16); previous = y;
      return { ...item, y };
    });
    const maxWidth = Math.max(20, width * 0.32 - 12);
    for (const item of positioned) {
      let text = item.text;
      if (measureText(text) > maxWidth) {
        while (text.length && measureText(text + '…') > maxWidth) text = text.slice(0, -1);
        text += '…';
      }
      const textWidth = measureText(text), y = item.y;
      const x = side === 'left' ? 8 : width - 8;
      result.push({ ...item, text, x, y, align: side,
        lineEnd: side === 'left' ? x + textWidth + 4 : x - textWidth - 4,
        bounds: { x: side === 'left' ? x : x - textWidth, y: y - 7, width: textWidth, height: 14 } });
    }
  }
  return result;
}
