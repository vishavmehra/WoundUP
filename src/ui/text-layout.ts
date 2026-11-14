/** Pure text wrapping and fitting. `measure` is the width of a string at the size in question, so a canvas or a test can supply it. */
export type Measure = (text: string) => number;

/** Greedy word wrap. A word wider than the line is broken by characters so nothing ever overflows. */
export function wrapText(measure: Measure, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (): void => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    push();
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    for (const ch of word) {
      if (line && measure(line + ch) > maxWidth) push();
      line += ch;
    }
  }
  push();
  return lines;
}

export interface Fitted {
  size: number;
  lines: string[];
  lineHeight: number;
}

/**
 * The largest font size from `maxSize` down to `minSize` at which `text` wraps to fit a box. `measureAt(size)` gives the measure
 * for that size. If even `minSize` overflows, the minimum is returned: the caller decides what to do (the content is authored, so
 * this means the box is too small, which a test catches).
 */
export function fitText(measureAt: (size: number) => Measure, text: string, boxW: number, boxH: number, maxSize: number, minSize: number, leading = 1.32): Fitted {
  let size = maxSize;
  for (;;) {
    const lines = wrapText(measureAt(size), text, boxW);
    const lineHeight = size * leading;
    if (lines.length * lineHeight <= boxH || size <= minSize) return { size, lines, lineHeight };
    size = Math.max(minSize, size - 2);
  }
}
