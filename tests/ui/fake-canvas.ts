/** A recording stand-in for a canvas 2D context, so the painters run in Node. Text width is `length * size * emWidth`. */
export interface TextCall {
  text: string;
  /** Size in pixels, read from the font string in force when the text was drawn. */
  size: number;
  weight: number;
  family: string;
}

export interface FakeCanvas {
  width: number;
  height: number;
  calls: TextCall[];
  getContext(kind: string): unknown;
}

const FONT = /^(\d+)\s+(\d+(?:\.\d+)?)px\s+(.*)$/;

export function fakeCanvas(width: number, height: number, emWidth = 0.55): FakeCanvas {
  const state: Record<string, unknown> = { font: '400 10px sans-serif' };
  const calls: TextCall[] = [];
  const parse = (): { weight: number; size: number; family: string } => {
    const m = FONT.exec(String(state.font));
    return m ? { weight: Number(m[1]), size: Number(m[2]), family: m[3] } : { weight: 400, size: 10, family: '' };
  };
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key === 'measureText') return (text: string) => ({ width: text.length * parse().size * emWidth });
      if (key === 'fillText') return (text: string) => void calls.push({ text, ...parse() });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { width, height, calls, getContext: () => ctx };
}

/** A `CanvasFactory` that remembers every canvas it made, in creation order. */
export function canvasFactory(): { make: (w: number, h: number) => HTMLCanvasElement; made: FakeCanvas[] } {
  const made: FakeCanvas[] = [];
  return {
    made,
    make: (w, h) => {
      const c = fakeCanvas(w, h);
      made.push(c);
      return c as unknown as HTMLCanvasElement;
    },
  };
}
