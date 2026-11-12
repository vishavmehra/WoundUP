import { describe, expect, it } from 'vitest';
import { CLOSING_CARD, ENGRAVINGS, LETTERS, MACHINE_IDS } from '../../src/game/content';
import { MACHINE_NAMES, SETTING_ROWS, describeResult, windLabel } from '../../src/ui/copy';
import { PX_PER_M, paintBlueprint, paintClosing, paintLetter, paintPlaque, paintSlip, resultSlip } from '../../src/ui/paint';
import { FONT_DISPLAY } from '../../src/ui/palette';
import { fakeCanvas } from './fake-canvas';

const px = (m: number): number => Math.round(m * PX_PER_M);

describe('paper and plaque painters', () => {
  it('sets every letter in the body face at a size that reads at arm length, inside the card', () => {
    const w = px(0.22);
    const h = px(0.15);
    for (const letter of Object.values(LETTERS)) {
      const c = fakeCanvas(w, h);
      paintLetter(c.getContext('2d') as CanvasRenderingContext2D, w, h, letter);
      const body = c.calls.filter((t) => t.weight === 400 && !t.family.startsWith('Elsie'));
      expect(body.map((t) => t.text).join(' ')).toBe(letter.message); // nothing dropped, nothing invented
      const size = body[0].size;
      expect(size, letter.id).toBeGreaterThanOrEqual(30); // 7.5 mm: about 1 degree at 40 cm
      expect(body.length * size * 1.32, letter.id).toBeLessThanOrEqual(h - 104 - 130);
      for (const line of body) expect(line.text.length * line.size * 0.55).toBeLessThanOrEqual(w - 128);
      const sender = c.calls.find((t) => t.family.startsWith('Elsie'));
      expect(sender?.text).toBe(`— ${letter.sender}`);
    }
  });

  it('sets the closing card in the story face inside the card', () => {
    const w = px(0.22);
    const h = px(0.12);
    const c = fakeCanvas(w, h);
    paintClosing(c.getContext('2d') as CanvasRenderingContext2D, w, h, CLOSING_CARD);
    expect(c.calls.map((t) => t.text).join(' ')).toBe(CLOSING_CARD);
    expect(c.calls.every((t) => t.family === FONT_DISPLAY && t.size >= 30)).toBe(true);
  });

  it('fits every plaque label of the flow at a readable size', () => {
    const rows: Array<[string, number, number]> = [
      ['Accept', 0.09, 0.034],
      ['Run again', 0.075, 0.032],
      ['Adjust', 0.075, 0.032],
      ...SETTING_ROWS.flatMap((r): Array<[string, number, number]> => [`${r.label}: On`, `${r.label}: Off`].map((l) => [l, 0.21, 0.032] as [string, number, number])),
      ['Resume', 0.115, 0.034],
      ['Restart chapter', 0.115, 0.034],
      ['Keep playing', 0.115, 0.034],
      ['Make link', 0.115, 0.034],
      ['Making link…', 0.115, 0.034],
      ...MACHINE_IDS.map((id): [string, number, number] => [`Machine: ${MACHINE_NAMES[id]}`, 0.21, 0.032]),
      ...ENGRAVINGS.map((e): [string, number, number] => [e.text, 0.122, 0.03]),
    ];
    for (const [label, wm, hm] of rows) {
      const c = fakeCanvas(px(wm), px(hm));
      paintPlaque(c.getContext('2d') as CanvasRenderingContext2D, px(wm), px(hm), label, 'idle');
      expect(c.calls.map((t) => t.text).join(' '), label).toBe(label);
      expect(c.calls[0].size, label).toBeGreaterThanOrEqual(24);
    }
  });

  it('paints a result and a wind counter as a title and one line', () => {
    const w = px(0.15);
    const h = px(0.056);
    for (const r of [describeResult({ status: 'runs' }), describeResult({ status: 'jams', jamReason: 'module_mismatch' }), describeResult({ status: 'incomplete', missingSockets: ['a', 'b', 'c'] })]) {
      const c = fakeCanvas(w, h);
      resultSlip(c.getContext('2d') as CanvasRenderingContext2D, w, h, r);
      expect(c.calls[0].text).toBe(r.title);
      expect(c.calls.slice(1).map((t) => t.text).join(' ')).toBe(r.hint); // the hint may wrap to two lines, but is never cut
      expect(c.calls.length).toBeLessThanOrEqual(3);
      expect(Math.min(...c.calls.map((t) => t.size))).toBeGreaterThanOrEqual(20);
    }
    const c = fakeCanvas(w, h);
    paintSlip(c.getContext('2d') as CanvasRenderingContext2D, w, h, windLabel(3, 8), 'Press Run', 'good');
    expect(c.calls.map((t) => t.text).join('|')).toBe('Wound 3 of 8|Press Run');
  });

  it('numbers the blueprint rows and ticks the filled ones', () => {
    const w = px(0.108);
    const h = px(0.188);
    const slots = ['Case', 'Cylinder', 'Comb', 'Governor', 'Spring', 'Barrel', 'Gear A', 'Gear B', 'Key'].map((label, i) => ({ id: `s${i}`, label }));
    const c = fakeCanvas(w, h);
    paintBlueprint(c.getContext('2d') as CanvasRenderingContext2D, w, h, 'Music Box', slots, new Set(['s0']));
    const texts = c.calls.map((t) => t.text);
    expect(texts).toContain('Music Box');
    for (let i = 1; i <= slots.length; i++) expect(texts).toContain(String(i));
    for (const s of slots) expect(texts).toContain(s.label);
    expect(Math.min(...c.calls.map((t) => t.size))).toBeGreaterThanOrEqual(20);
  });
});
