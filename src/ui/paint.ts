import type { LetterDef } from '../game/content.js';
import type { ResultView, Tone } from './copy.js';
import { FONT_BODY, FONT_DISPLAY, PALETTE } from './palette.js';
import { fitText } from './text-layout.js';

/**
 * Canvas painters for the flow UI's paper, plaques and labels. They draw into a canvas that becomes a texture, once per
 * state change, never per frame. Sizes are pixels; `PX_PER_M` is about one Quest 3 pixel per texel at arm's length.
 * Only `ctx` methods that every browser has are used, so a recording fake can stand in for it in tests.
 */
export type Ctx = CanvasRenderingContext2D;

/** Texels per metre for every surface (about 25 pixels per degree at 37 cm). */
export const PX_PER_M = 4000;

const font = (weight: number, px: number, family = FONT_BODY): string => `${weight} ${px}px ${family}`;

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const measureWith =
  (ctx: Ctx, weight: number, family = FONT_BODY) =>
  (size: number) =>
  (text: string): number => {
    ctx.font = font(weight, size, family);
    return ctx.measureText(text).width;
  };

/** Cream paper with a brass rule inset from the edge: an instruction card (UI_UX_SPEC §3). */
export function paintPaper(ctx: Ctx, w: number, h: number, rule = true): void {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PALETTE.cream);
  g.addColorStop(1, '#E9DABA');
  ctx.fillStyle = g;
  roundedRect(ctx, 0, 0, w, h, 14);
  ctx.fill();
  if (!rule) return;
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 3;
  roundedRect(ctx, 16, 16, w - 32, h - 32, 8);
  ctx.stroke();
  ctx.lineWidth = 1;
  roundedRect(ctx, 24, 24, w - 48, h - 48, 4);
  ctx.stroke();
}

/** The letter: header, message in the body face, signature in the story face (DESIGN.md: Elsie is never for what must be read to act). */
export function paintLetter(ctx: Ctx, w: number, h: number, letter: Pick<LetterDef, 'sender' | 'message'>): void {
  paintPaper(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.brassDark;
  ctx.font = font(700, 24);
  ctx.fillText('A LETTER FOR YOU', w / 2, 66);
  const box = { x: 64, y: 104, w: w - 128, h: h - 104 - 130 };
  const fit = fitText(measureWith(ctx, 400), letter.message, box.w, box.h, 40, 26);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = font(400, fit.size);
  fit.lines.forEach((line, i) => ctx.fillText(line, box.x, box.y + i * fit.lineHeight));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.walnut;
  ctx.font = font(400, 44, FONT_DISPLAY);
  ctx.fillText(`— ${letter.sender}`, w - 72, h - 62);
}

/** The closing card, shown when every letter is done (no sender: TOCKTON_CHARACTERS §2). */
export function paintClosing(ctx: Ctx, w: number, h: number, text: string): void {
  paintPaper(ctx, w, h);
  const fit = fitText(measureWith(ctx, 400, FONT_DISPLAY), text, w - 160, h - 160, 52, 30, 1.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.walnut;
  ctx.font = font(400, fit.size, FONT_DISPLAY);
  const top = (h - fit.lines.length * fit.lineHeight) / 2;
  fit.lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * fit.lineHeight));
}

export type PlaqueState = 'idle' | 'hover' | 'disabled' | 'on';

/** A brass plaque with an ink inset rule (DESIGN.md "button-brass"). `on` is a lit toggle, `disabled` is dimmed but still legible. */
export function paintPlaque(ctx: Ctx, w: number, h: number, label: string, state: PlaqueState = 'idle'): void {
  ctx.clearRect(0, 0, w, h);
  const lit = state === 'hover' || state === 'on';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, lit ? PALETTE.lamp : PALETTE.brassLit);
  g.addColorStop(0.55, lit ? PALETTE.brassLit : PALETTE.brass);
  g.addColorStop(1, PALETTE.brassDark);
  ctx.fillStyle = g;
  roundedRect(ctx, 0, 0, w, h, h * 0.22);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  roundedRect(ctx, 9, 9, w - 18, h - 18, h * 0.15);
  ctx.stroke();
  if (state === 'disabled') {
    ctx.fillStyle = 'rgba(42, 26, 15, 0.45)';
    roundedRect(ctx, 0, 0, w, h, h * 0.22);
    ctx.fill();
  }
  const fit = fitText(measureWith(ctx, 700), label, w - 44, h - 30, Math.round(h * 0.42), 18, 1.1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state === 'disabled' ? PALETTE.cream : PALETTE.ink;
  ctx.font = font(700, fit.size);
  const top = h / 2 - ((fit.lines.length - 1) * fit.lineHeight) / 2;
  fit.lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * fit.lineHeight));
}

const SLIP: Record<Tone, { bg: string; title: string; text: string }> = {
  good: { bg: PALETTE.cream, title: PALETTE.teal, text: PALETTE.ink },
  warn: { bg: PALETTE.lamp, title: PALETTE.ink, text: PALETTE.ink },
  bad: { bg: PALETTE.walnut, title: PALETTE.lamp, text: PALETTE.cream },
};

/** The small result or hint label: a title and one line (UI_UX_SPEC §13). */
export function paintSlip(ctx: Ctx, w: number, h: number, title: string, hint: string, tone: Tone): void {
  ctx.clearRect(0, 0, w, h);
  const c = SLIP[tone];
  ctx.fillStyle = c.bg;
  roundedRect(ctx, 0, 0, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 3;
  roundedRect(ctx, 6, 6, w - 12, h - 12, 8);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const t = fitText(measureWith(ctx, 700), title, w - 48, h * 0.4, Math.round(h * 0.3), 18, 1.1);
  ctx.fillStyle = c.title;
  ctx.font = font(700, t.size);
  ctx.fillText(t.lines[0] ?? '', w / 2, hint ? h * 0.44 : h * 0.6);
  if (!hint) return;
  const s = fitText(measureWith(ctx, 400), hint, w - 48, h * 0.3, Math.round(h * 0.22), 16, 1.1);
  ctx.fillStyle = c.text;
  ctx.font = font(400, s.size);
  ctx.fillText(s.lines[0] ?? '', w / 2, h * 0.78);
}

export interface BlueprintSlot {
  id: string;
  label: string;
}

/** The blueprint sheet's face: the machine's name and one numbered row per slot, ticked as each is filled. No dense manual (UI_UX_SPEC §9). */
export function paintBlueprint(ctx: Ctx, w: number, h: number, title: string, slots: readonly BlueprintSlot[], filled: ReadonlySet<string>): void {
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.teal;
  const t = fitText(measureWith(ctx, 400, FONT_DISPLAY), title, w - 60, 56, 40, 24, 1.1);
  ctx.font = font(400, t.size, FONT_DISPLAY);
  ctx.fillText(t.lines[0] ?? '', w / 2, 44);
  ctx.strokeStyle = PALETTE.teal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 82);
  ctx.lineTo(w - 30, 82);
  ctx.stroke();
  const top = 96;
  const rowH = Math.min(64, (h - top - 24) / Math.max(1, slots.length));
  const size = Math.round(rowH * 0.46);
  slots.forEach((slot, i) => {
    const y = top + rowH * (i + 0.5);
    const done = filled.has(slot.id);
    ctx.beginPath();
    ctx.arc(46, y, rowH * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = done ? PALETTE.teal : PALETTE.brass;
    ctx.fill();
    ctx.fillStyle = done ? PALETTE.cream : PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.font = font(700, Math.round(size * 0.9));
    ctx.fillText(String(i + 1), 46, y + 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.ink;
    ctx.font = font(400, size);
    ctx.fillText(slot.label, 86, y + 1);
    if (done) {
      ctx.strokeStyle = PALETTE.teal;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w - 74, y);
      ctx.lineTo(w - 62, y + 12);
      ctx.lineTo(w - 40, y - 12);
      ctx.stroke();
    }
  });
}

/** A walnut panel with a cream title block and optional lines below it; the buttons are separate surfaces placed on it. */
export function paintPanel(ctx: Ctx, w: number, h: number, title: string, lines: readonly string[] = [], lineY = 0.2): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.walnut;
  roundedRect(ctx, 0, 0, w, h, 22);
  ctx.fill();
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 4;
  roundedRect(ctx, 14, 14, w - 28, h - 28, 14);
  ctx.stroke();
  ctx.fillStyle = PALETTE.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const t = fitText(measureWith(ctx, 700), title, w - 120, 70, 52, 28, 1.1);
  ctx.font = font(700, t.size);
  ctx.fillText(t.lines[0] ?? '', w / 2, 62);
  ctx.fillStyle = PALETTE.frost;
  ctx.font = font(400, 30);
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h * lineY + i * 40));
}

/** A round brass medallion with a glyph and a word: the pause and gift controls. */
export function paintMedallion(ctx: Ctx, size: number, glyph: 'pause' | 'gift', label: string, hover: boolean): void {
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c * 0.8, size * 0.05, c, c, c);
  g.addColorStop(0, hover ? PALETTE.lamp : PALETTE.brassLit);
  g.addColorStop(0.7, PALETTE.brass);
  g.addColorStop(1, PALETTE.brassDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, c - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  if (glyph === 'pause') {
    ctx.fillRect(c - 28, c - 52, 18, 58);
    ctx.fillRect(c + 10, c - 52, 18, 58);
  } else {
    ctx.fillRect(c - 36, c - 30, 72, 44);
    ctx.fillStyle = PALETTE.brassLit;
    ctx.fillRect(c - 7, c - 30, 14, 44);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(c - 18, c - 40, 18, 10, -0.5, 0, Math.PI * 2);
    ctx.ellipse(c + 18, c - 40, 18, 10, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(700, Math.round(size * 0.16));
  ctx.fillText(label, c, c + size * 0.28);
}

export const resultSlip = (ctx: Ctx, w: number, h: number, r: ResultView): void => paintSlip(ctx, w, h, r.title, r.hint, r.tone);
