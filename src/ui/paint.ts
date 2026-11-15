import type { LetterDef } from '../game/content.js';
import { DIAL, assemblyProgress, needleAngle, stageClosed, tickAngle, type AssemblyView } from './assembly.js';
import { DIFFICULTY_CARD, STEP_SHEET, type DifficultyCopy, type ResultView, type Tone } from './copy.js';
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

/** The small result or hint label: a title and, under it, a line or two (UI_UX_SPEC §13). Every line that fits is drawn; none is dropped. */
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
  ctx.textBaseline = 'middle';
  const t = fitText(measureWith(ctx, 700), title, w - 48, h * 0.34, Math.round(h * 0.26), 18, 1.1);
  ctx.fillStyle = c.title;
  ctx.font = font(700, t.size);
  drawCentered(ctx, t.lines, t.lineHeight, w / 2, hint ? h * 0.3 : h * 0.5);
  if (!hint) return;
  const s = fitText(measureWith(ctx, 400), hint, w - 48, h * 0.42, Math.round(h * 0.2), 16, 1.15);
  ctx.fillStyle = c.text;
  ctx.font = font(400, s.size);
  drawCentered(ctx, s.lines, s.lineHeight, w / 2, h * 0.73);
}

/** Lines of text centred on `y`, one `lineHeight` apart. */
function drawCentered(ctx: Ctx, lines: readonly string[], lineHeight: number, x: number, y: number): void {
  const top = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight));
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

export interface ChoiceFace {
  readonly copy: DifficultyCopy;
  /** The "Recommended" tag. */
  readonly recommended: boolean;
  /** Replaces the line when the level cannot be picked (Master while its test has not passed). */
  readonly note: string | null;
}

/** One answer on the difficulty card: a brass plaque with the level's name and time, one line under them, and an optional tag. */
export function paintChoice(ctx: Ctx, w: number, h: number, face: ChoiceFace, state: PlaqueState = 'idle'): void {
  ctx.clearRect(0, 0, w, h);
  const lit = state === 'hover' || state === 'on';
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, lit ? PALETTE.lamp : PALETTE.brassLit);
  g.addColorStop(0.55, lit ? PALETTE.brassLit : PALETTE.brass);
  g.addColorStop(1, PALETTE.brassDark);
  ctx.fillStyle = g;
  roundedRect(ctx, 0, 0, w, h, h * 0.16);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  roundedRect(ctx, 9, 9, w - 18, h - 18, h * 0.11);
  ctx.stroke();
  if (state === 'disabled') {
    ctx.fillStyle = 'rgba(42, 26, 15, 0.45)';
    roundedRect(ctx, 0, 0, w, h, h * 0.16);
    ctx.fill();
  }
  const tagged = face.recommended && state !== 'disabled';
  const nameY = tagged ? 0.27 : 0.33;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state === 'disabled' ? PALETTE.cream : PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.font = font(700, 44);
  ctx.fillText(face.copy.name, 38, h * nameY);
  ctx.textAlign = 'right';
  ctx.font = font(400, 28);
  ctx.fillText(face.copy.time, w - 38, h * nameY);
  ctx.textAlign = 'left';
  const fit = fitText(measureWith(ctx, 400), face.note ?? face.copy.line, w - 76, h * 0.3, 30, 24, 1.1);
  ctx.font = font(400, fit.size);
  const top = h * (tagged ? 0.55 : 0.66) - ((fit.lines.length - 1) * fit.lineHeight) / 2;
  fit.lines.forEach((line, i) => ctx.fillText(line, 38, top + i * fit.lineHeight));
  if (tagged) {
    ctx.font = font(700, 24);
    const tag = DIFFICULTY_CARD.recommended;
    const tw = ctx.measureText(tag).width + 36;
    ctx.fillStyle = PALETTE.teal;
    roundedRect(ctx, 34, h * 0.73, tw, 38, 19);
    ctx.fill();
    ctx.fillStyle = PALETTE.cream;
    ctx.fillText(tag, 52, h * 0.73 + 20);
  }
}

/** Row geometry of the step sheet, shared with its test: the top of the stage list and the smallest size the current step is drawn at. */
export const STEP_SHEET_TOP = 112;
const STEP_ROW_MAX = 44;
const STEP_ROW_TITLES = 40;
const STEP_LINE_H = 36;
/** 28 px at 4000 px per metre is a 5 mm cap height (design §7.4, TOCKTON_DIMENSIONS §5.2). */
export const STEP_TEXT_MIN_PX = 28;

/** Where the stage list ends: the row height, the height of the opened current row's steps, and the bottom edge, in pixels of an `h`-high sheet. */
export function stepSheetLayout(h: number, stages: number, shown: number, titlesOnly: boolean): { rowH: number; expandedH: number; bottom: number } {
  const expandedH = shown > 0 ? 18 + STEP_LINE_H * shown : 0;
  const rowH = titlesOnly ? STEP_ROW_TITLES : Math.min(STEP_ROW_MAX, (h - STEP_SHEET_TOP - 28 - expandedH) / Math.max(1, stages));
  return { rowH, expandedH, bottom: STEP_SHEET_TOP + rowH * stages + expandedH };
}

/**
 * The blueprint sheet of a build with stages (design §7.4): the machine's name and a progress dial in the header, one row per stage with a
 * pip for each placement, and under the current stage's row the step to do now in large type and the next two in small. `titlesOnly` is
 * Master: stage names and stamps, no pips, no steps. Painted once per change, never per frame.
 */
export function paintStepSheet(ctx: Ctx, w: number, h: number, title: string, view: AssemblyView, titlesOnly: boolean): void {
  ctx.clearRect(0, 0, w, h);
  const n = view.stages.length;
  const progress = assemblyProgress(view);

  // Header: the name, where the build stands, and the dial.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.teal;
  const t = fitText(measureWith(ctx, 400, FONT_DISPLAY), title, w - 60 - 112, 56, 40, 24, 1.1);
  ctx.font = font(400, t.size, FONT_DISPLAY);
  ctx.fillText(t.lines[0] ?? '', 30, 44);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = font(700, 22);
  ctx.fillText(view.current >= 0 ? `Stage ${view.current + 1} of ${n}` : 'All stages built', 30, 82);
  paintDial(ctx, w - 58, 56, 34, view, progress.fraction);
  ctx.strokeStyle = PALETTE.teal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 104);
  ctx.lineTo(w - 30, 104);
  ctx.stroke();

  // The stage list; the current stage's row opens to show its steps.
  const shown = view.current >= 0 && !titlesOnly ? view.upcoming.slice(0, 3) : [];
  const { rowH, expandedH } = stepSheetLayout(h, n, shown.length, titlesOnly);
  let y = STEP_SHEET_TOP;
  view.stages.forEach((stage, i) => {
    const closed = stageClosed(stage);
    const current = i === view.current;
    const cy = y + rowH / 2;
    if (current) {
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = PALETTE.lamp;
      roundedRect(ctx, 16, y, w - 32, rowH + expandedH, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(46, cy, rowH * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = closed ? PALETTE.teal : PALETTE.brass;
    ctx.fill();
    ctx.fillStyle = closed ? PALETTE.cream : PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.font = font(700, Math.round(rowH * 0.42));
    ctx.fillText(String(i + 1), 46, cy + 1);
    const pipsW = titlesOnly || closed ? 44 : stage.steps * 14 + 8;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.ink;
    const name = fitText(measureWith(ctx, current ? 700 : 400), stage.name, w - 80 - pipsW - 24, rowH, Math.round(rowH * 0.52), 16, 1.1);
    ctx.font = font(current ? 700 : 400, name.size);
    ctx.fillText(name.lines[0] ?? '', 80, cy + 1);
    if (closed) {
      ctx.strokeStyle = PALETTE.teal;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w - 74, cy);
      ctx.lineTo(w - 62, cy + 12);
      ctx.lineTo(w - 40, cy - 12);
      ctx.stroke();
    } else if (!titlesOnly) {
      for (let k = 0; k < stage.steps; k++) {
        const px = w - 30 - (stage.steps - k) * 14 + 7;
        ctx.beginPath();
        ctx.arc(px, cy, 4.5, 0, Math.PI * 2);
        if (k < stage.done) {
          ctx.fillStyle = PALETTE.teal;
          ctx.fill();
        } else {
          ctx.strokeStyle = PALETTE.brassDark;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    y += rowH;
    if (current && shown.length > 0) {
      shown.forEach((step, k) => {
        const line = `${step.n}. ${step.label}`;
        ctx.fillStyle = PALETTE.ink;
        ctx.textAlign = 'left';
        if (k === 0) {
          const big = fitText(measureWith(ctx, 700), line, w - 92, STEP_LINE_H, 32, STEP_TEXT_MIN_PX, 1.1);
          ctx.font = font(700, big.size);
          ctx.fillText(big.lines[0] ?? '', 46, y + 8 + STEP_LINE_H / 2);
        } else {
          ctx.globalAlpha = 0.7;
          ctx.font = font(400, 22);
          ctx.fillText(line, 46, y + 8 + k * STEP_LINE_H + STEP_LINE_H / 2);
          ctx.globalAlpha = 1;
        }
      });
      y += expandedH;
    }
  });

  ctx.textAlign = 'left';
  if (view.current < 0) {
    ctx.fillStyle = PALETTE.teal;
    ctx.font = font(700, 30);
    ctx.fillText(STEP_SHEET.done, 30, y + 30);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = font(400, 24);
    ctx.fillText(STEP_SHEET.doneHint, 30, y + 66);
  } else if (titlesOnly) {
    ctx.fillStyle = PALETTE.brassDark;
    ctx.font = font(400, 22);
    ctx.fillText(STEP_SHEET.masterNote, 30, y + 26);
  }
}

/** The progress dial: a brass arc, one tick per stage (lit when its stage is closed) and a needle at the share of placements done. */
function paintDial(ctx: Ctx, cx: number, cy: number, r: number, view: AssemblyView, fraction: number): void {
  const n = view.stages.length;
  ctx.strokeStyle = PALETTE.brassDark;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, DIAL.start, DIAL.start + DIAL.sweep);
  ctx.stroke();
  view.stages.forEach((stage, i) => {
    const a = tickAngle(i, n);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7, 0, Math.PI * 2);
    ctx.fillStyle = stageClosed(stage) ? PALETTE.lamp : PALETTE.cream;
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  const a = needleAngle(fraction);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.brass;
  ctx.fill();
}

/** A walnut panel with a cream title block and optional lines below it; the buttons are separate surfaces placed on it. `captions` are small lines at `y` metres from the panel's centre (up positive). */
export function paintPanel(ctx: Ctx, w: number, h: number, title: string, lines: readonly string[] = [], lineY = 0.2, captions: readonly { y: number; text: string }[] = []): void {
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
  ctx.font = font(400, 26);
  for (const c of captions) ctx.fillText(c.text, w / 2, h / 2 - c.y * PX_PER_M);
}

/**
 * A round brass medallion with a glyph and a word: the pause, gift, repair, lens and helper controls. `active` is a control that is on (the
 * lens while X-ray shows): lamp-lit, with a lit ring round the rim.
 */
export function paintMedallion(ctx: Ctx, size: number, glyph: 'pause' | 'gift' | 'repair' | 'lens' | 'helper', label: string, hover: boolean, active = false): void {
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c * 0.8, size * 0.05, c, c, c);
  g.addColorStop(0, hover || active ? PALETTE.lamp : PALETTE.brassLit);
  g.addColorStop(0.7, PALETTE.brass);
  g.addColorStop(1, PALETTE.brassDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  if (active) {
    ctx.strokeStyle = PALETTE.cream;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c, c, c - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  if (glyph === 'pause') {
    ctx.fillRect(c - 28, c - 52, 18, 58);
    ctx.fillRect(c + 10, c - 52, 18, 58);
  } else if (glyph === 'repair') {
    // A spanner: a handle and a round head with an open jaw, leaning 45 degrees.
    ctx.save();
    ctx.translate(c, c - 6);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -4, 14, 50);
    ctx.beginPath();
    ctx.arc(0, -16, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.brass;
    ctx.fillRect(-6, -40, 12, 22);
    ctx.restore();
  } else if (glyph === 'helper') {
    // A lamp held in a cupped hand (design §7.1): a glass globe with a flame, a stem and foot, and the palm as an arc beneath it.
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(c, c - 26, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(c - 5, c - 4, 10, 16);
    ctx.fillRect(c - 20, c + 10, 40, 8);
    ctx.beginPath();
    ctx.ellipse(c, c - 26, 6, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c + 2, 30, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (glyph === 'lens') {
    // A magnifying glass: a ring (filled with lamp glow while X-ray is on) and a handle.
    ctx.beginPath();
    ctx.arc(c - 8, c - 18, 26, 0, Math.PI * 2);
    if (active) {
      ctx.fillStyle = PALETTE.cream;
      ctx.fill();
      ctx.fillStyle = PALETTE.ink;
    }
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(c + 12, c + 2);
    ctx.lineTo(c + 36, c + 26);
    ctx.stroke();
    ctx.lineCap = 'butt';
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
