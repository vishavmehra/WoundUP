import { describe, expect, it } from 'vitest';
import { modeState } from '../../src/game/modes';
import {
  HELPER_BREATH_S,
  HELPER_COOLDOWN_S,
  HELPER_HOLD_S,
  HELPER_PERIOD_S,
  STEP_REVEAL_S,
  assemblyKey,
  assemblyProgress,
  needleAngle,
  offerGlow,
  tickAngle,
  DIAL,
  type AssemblyView,
} from '../../src/ui/assembly';
import {
  DIFFICULTY_CARD,
  DIFFICULTY_COPY,
  DIFFICULTY_ORDER,
  DIFFICULTY_ROW,
  HELPER_COPY,
  RECOMMENDED_DIFFICULTY,
  STEP_SHEET,
  difficultyRowLabel,
  nextDifficulty,
} from '../../src/ui/copy';
import { MEDALLION_SIZE_M, SHEET_PAPER, STEP_HELP } from '../../src/ui/layout';
import { PX_PER_M, STEP_SHEET_TOP, STEP_TEXT_MIN_PX, paintChoice, paintMedallion, paintStepSheet, stepSheetLayout } from '../../src/ui/paint';
import { freshLocal, viewFor, type ViewContext } from '../../src/ui/view';
import { STAGES, viewAt } from './assembly-fixtures';
import { fakeCanvas } from './fake-canvas';

const px = (m: number): number => Math.round(m * PX_PER_M);
const ctxOf = (c: ReturnType<typeof fakeCanvas>): CanvasRenderingContext2D => c.getContext('2d') as CanvasRenderingContext2D;

describe('the step list the director gives the UI (ADR-050)', () => {
  it('counts placements done and total, and clamps a stage that reports more done than it has steps', () => {
    expect(assemblyProgress(viewAt(0))).toEqual({ done: 0, total: 34, fraction: 0 });
    expect(assemblyProgress(viewAt(17)).done).toBe(17);
    expect(assemblyProgress(viewAt(34)).fraction).toBe(1);
    const over: AssemblyView = { stages: [{ id: 'a', name: 'A', steps: 2, done: 5 }], current: -1, upcoming: [] };
    expect(assemblyProgress(over)).toEqual({ done: 2, total: 2, fraction: 1 });
    expect(assemblyProgress({ stages: [], current: -1, upcoming: [] }).fraction).toBe(0);
  });

  it('keys the sheet by what it shows: a placement, the next step or Master hiding the steps repaints; the same view does not', () => {
    const a = assemblyKey(viewAt(3), false);
    expect(assemblyKey(viewAt(3), false)).toBe(a);
    expect(assemblyKey(viewAt(4), false)).not.toBe(a);
    expect(assemblyKey(viewAt(3), true)).not.toBe(a);
  });

  it('puts every tick on the dial inside its arc and the needle at the share done', () => {
    for (let i = 0; i < 7; i++) {
      const t = tickAngle(i, 7);
      expect(t).toBeGreaterThan(DIAL.start);
      expect(t).toBeLessThan(DIAL.start + DIAL.sweep);
    }
    expect(needleAngle(0)).toBe(DIAL.start);
    expect(needleAngle(1)).toBe(DIAL.start + DIAL.sweep);
    expect(needleAngle(-3)).toBe(DIAL.start);
    expect(needleAngle(9)).toBe(DIAL.start + DIAL.sweep);
    expect(tickAngle(0, 1)).toBeCloseTo(DIAL.start + DIAL.sweep / 2, 9);
  });
});

describe('the Helper offer glow (design §7.1)', () => {
  it('breathes with a 2 s period for 12 s, never goes dark, and then settles to a dim steady glow', () => {
    expect(HELPER_PERIOD_S).toBe(2);
    expect(HELPER_BREATH_S).toBe(12);
    expect(offerGlow(0)).toBeCloseTo(0.3, 9);
    expect(offerGlow(HELPER_PERIOD_S / 2)).toBeCloseTo(1, 9);
    expect(offerGlow(HELPER_PERIOD_S)).toBeCloseTo(0.3, 9);
    for (let t = 0; t < HELPER_BREATH_S; t += 0.1) {
      expect(offerGlow(t)).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(offerGlow(t)).toBeLessThanOrEqual(1 + 1e-9);
    }
    for (const t of [HELPER_BREATH_S, HELPER_BREATH_S + 0.7, 600]) expect(offerGlow(t)).toBe(0.3);
  });

  it('has the timings the design names', () => {
    expect(HELPER_COOLDOWN_S).toBe(1.2);
    expect(HELPER_HOLD_S).toBe(0.8);
    expect(STEP_REVEAL_S).toBe(8);
  });
});

describe('difficulty and Helper words', () => {
  it('has the design\'s one line per level, honest times, and Standard recommended', () => {
    expect(DIFFICULTY_COPY.relaxed.line).toBe('Pieces come ready-made. Quick.');
    expect(DIFFICULTY_COPY.standard.line).toBe('The full workshop. Every pin and washer.');
    expect(DIFFICULTY_COPY.master.line).toBe('No hints unless you ask.');
    expect(DIFFICULTY_COPY.relaxed.time).toBe('about 2 minutes');
    expect(DIFFICULTY_COPY.standard.time).toBe('about 5 minutes');
    expect(RECOMMENDED_DIFFICULTY).toBe('standard');
    expect(DIFFICULTY_ORDER).toEqual(['relaxed', 'standard', 'master']);
  });

  it('cycles the Pause row relaxed, standard, master, round, and skips Master while it is not available', () => {
    expect(nextDifficulty('relaxed', true)).toBe('standard');
    expect(nextDifficulty('standard', true)).toBe('master');
    expect(nextDifficulty('master', true)).toBe('relaxed');
    expect(nextDifficulty('standard', false)).toBe('relaxed');
    expect(nextDifficulty('relaxed', false)).toBe('standard');
    expect(nextDifficulty('master', false)).toBe('relaxed'); // a saved Master while it is off
    expect(difficultyRowLabel('standard')).toBe('Difficulty: Standard');
  });

  it('gives the Helper one line per rung, in plain words with no counts or scores', () => {
    expect(HELPER_COPY.offer).toBe('Need a hand?');
    expect(HELPER_COPY.next('the left bracket')).toBe('Next: the left bracket');
    for (const line of [HELPER_COPY.offer, HELPER_COPY.demo, HELPER_COPY.place, HELPER_COPY.wind, DIFFICULTY_ROW.hint, DIFFICULTY_CARD.note, STEP_SHEET.done]) {
      expect(line).not.toMatch(/\d|score|point|hint\(s\)/i);
      expect(line.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('the view: where the Helper and the difficulty card exist', () => {
  const ctx = (over: Partial<ViewContext> = {}): ViewContext => ({ letter: null, closing: null, giftAvailable: false, xrayHint: false, ...over });
  const at = (mode: 'build' | 'wind' | 'place' | 'town' | 'intro', parcel: 'open' | 'closed', over: Partial<ViewContext> = {}) =>
    viewFor(modeState(mode), { ...freshLocal(), parcel }, ctx(over));

  it('shows the Helper with the tray while a build with stages is built or wound, and nowhere else', () => {
    expect(at('build', 'open', { helper: true }).helperButton).toBe(true);
    expect(at('wind', 'open', { helper: true }).helperButton).toBe(true);
    expect(at('place', 'open', { helper: true }).helperButton).toBe(false); // placing is not building
    expect(at('town', 'open', { helper: true }).helperButton).toBe(false);
    expect(at('build', 'closed', { helper: true }).helperButton).toBe(false); // the parcel is still shut: nothing to help with
    expect(at('build', 'open').helperButton).toBe(false); // a machine without stages has none
    expect(at('build', 'open', { helper: false }).helperButton).toBe(false);
    const paused = viewFor({ ...modeState('pause'), resume: 'build' }, { ...freshLocal(), parcel: 'open' }, ctx({ helper: true }));
    expect(paused.helperButton).toBe(false);
    expect(paused.tray).toBe(true); // the tray stays under the panel; the Helper does not
  });

  it('asks the first-build question over the closed parcel, before the tray exists, and only when it is due', () => {
    expect(at('build', 'closed', { chooseDifficulty: true }).panel).toBe('difficulty');
    expect(at('build', 'open', { chooseDifficulty: true }).panel).toBe('none'); // answered by then: the parcel was opened
    expect(at('build', 'closed').panel).toBe('none');
    expect(at('town', 'closed', { chooseDifficulty: true }).panel).toBe('none');
    expect(at('wind', 'closed', { chooseDifficulty: true }).panel).toBe('none');
    const paused = viewFor({ ...modeState('pause'), resume: 'build' }, freshLocal(), ctx({ chooseDifficulty: true }));
    expect(paused.panel).toBe('pause'); // a paused game shows Pause, not the card
  });
});

describe('Music Box sheet geometry', () => {
  const w = px(SHEET_PAPER.w);
  const h = px(SHEET_PAPER.h);

  it('fits seven stages, the opened current row and its three steps on the paper, with Master\'s shorter list clear of the "?" corner', () => {
    const full = stepSheetLayout(h, 7, 3, false);
    expect(full.bottom).toBeLessThanOrEqual(h - 24);
    expect(full.rowH).toBeGreaterThanOrEqual(36);
    const titles = stepSheetLayout(h, 7, 0, true);
    const qTop = h / 2 - STEP_HELP.y * PX_PER_M - (STEP_HELP.size * PX_PER_M) / 2;
    expect(titles.bottom).toBeLessThanOrEqual(qTop);
    expect(STEP_SHEET_TOP + 7 * 40).toBe(titles.bottom);
  });

  it('keeps the "?" corner inside the paper and 4 cm square (design §6.1)', () => {
    expect(STEP_HELP.size).toBe(0.04);
    expect(STEP_HELP.x + STEP_HELP.size / 2).toBeLessThanOrEqual(SHEET_PAPER.w / 2);
    expect(STEP_HELP.y - STEP_HELP.size / 2).toBeGreaterThanOrEqual(-SHEET_PAPER.h / 2);
  });

  it('paints the machine, every stage name, the current step large and the next two small', () => {
    const c = fakeCanvas(w, h);
    paintStepSheet(ctxOf(c), w, h, 'Music Box', viewAt(3), false);
    const text = c.calls.map((t) => t.text);
    expect(text).toContain('Music Box');
    for (const [, name] of STAGES) expect(text, name).toContain(name);
    expect(text).toContain('Stage 1 of 7');
    const now = c.calls.find((t) => t.text === '4. Right bracket');
    expect(now?.weight).toBe(700);
    expect(now?.size).toBeGreaterThanOrEqual(STEP_TEXT_MIN_PX); // 5 mm cap height at 4000 px per metre
    expect(now!.size / PX_PER_M).toBeGreaterThanOrEqual(0.007); // an em of 7 mm: the cap height of 5 mm
    const next = c.calls.filter((t) => t.text === '5. Bush' || t.text === '6. Screw');
    expect(next).toHaveLength(2);
    for (const t of next) expect(t.size).toBeLessThan(now!.size);
  });

  it('keeps every line inside the paper', () => {
    for (const done of [0, 3, 6, 11, 18, 22, 27, 33, 34]) {
      for (const titlesOnly of [false, true]) {
        const c = fakeCanvas(w, h);
        paintStepSheet(ctxOf(c), w, h, 'Music Box', viewAt(done), titlesOnly);
        for (const t of c.calls) expect(t.text.length * t.size * 0.55, `${done} ${titlesOnly} ${t.text}`).toBeLessThanOrEqual(w - 30);
      }
    }
  });

  it('draws stage names at a size that reads (20 px or more for names up to 20 characters)', () => {
    const c = fakeCanvas(w, h);
    paintStepSheet(ctxOf(c), w, h, 'Music Box', viewAt(0), false);
    for (const [, name] of STAGES) expect(c.calls.find((t) => t.text === name)!.size, name).toBeGreaterThanOrEqual(20);
  });

  it('Master shows stage names only: no step lines, a note, and no pips to count', () => {
    const c = fakeCanvas(w, h);
    paintStepSheet(ctxOf(c), w, h, 'Music Box', viewAt(3), true);
    const text = c.calls.map((t) => t.text);
    expect(text).not.toContain('4. Right bracket');
    expect(text.some((t) => /^\d+\. /.test(t))).toBe(false);
    for (const [, name] of STAGES) expect(text).toContain(name);
    expect(text).toContain(STEP_SHEET.masterNote);
  });

  it('closes the build: every stage closed says so and offers the next move', () => {
    const c = fakeCanvas(w, h);
    paintStepSheet(ctxOf(c), w, h, 'Music Box', viewAt(34), false);
    const text = c.calls.map((t) => t.text);
    expect(text).toContain('All stages built');
    expect(text).toContain(STEP_SHEET.done);
    expect(text).toContain(STEP_SHEET.doneHint);
    expect(text.some((t) => /^\d+\. /.test(t))).toBe(false);
  });
});

describe('the difficulty card and the Helper medallion paint', () => {
  const w = px(0.23);
  const h = px(0.07);

  it('sets a choice with its name, time and one line, and the Recommended tag only on the level that carries it', () => {
    for (const d of DIFFICULTY_ORDER) {
      const c = fakeCanvas(w, h);
      paintChoice(ctxOf(c), w, h, { copy: DIFFICULTY_COPY[d], recommended: d === RECOMMENDED_DIFFICULTY, note: null }, d === RECOMMENDED_DIFFICULTY ? 'on' : 'idle');
      const text = c.calls.map((t) => t.text);
      expect(text, d).toContain(DIFFICULTY_COPY[d].name);
      expect(text, d).toContain(DIFFICULTY_COPY[d].time);
      expect(text.join(' '), d).toContain(DIFFICULTY_COPY[d].line);
      expect(text.includes(DIFFICULTY_CARD.recommended), d).toBe(d === RECOMMENDED_DIFFICULTY);
      for (const t of c.calls) expect(t.size, `${d} ${t.text}`).toBeGreaterThanOrEqual(24); // 6 mm em: readable at arm's length
      for (const t of c.calls) expect(t.text.length * t.size * 0.55, `${d} ${t.text}`).toBeLessThanOrEqual(w - 70);
    }
  });

  it('greys Master out with its note in place of the line, and drops the tag from a disabled level', () => {
    const c = fakeCanvas(w, h);
    paintChoice(ctxOf(c), w, h, { copy: DIFFICULTY_COPY.master, recommended: false, note: DIFFICULTY_CARD.masterUnavailable }, 'disabled');
    const text = c.calls.map((t) => t.text).join(' ');
    expect(text).toContain(DIFFICULTY_CARD.masterUnavailable);
    expect(text).not.toContain(DIFFICULTY_COPY.master.line);
    const d = fakeCanvas(w, h);
    paintChoice(ctxOf(d), w, h, { copy: DIFFICULTY_COPY.standard, recommended: true, note: null }, 'disabled');
    expect(d.calls.map((t) => t.text)).not.toContain(DIFFICULTY_CARD.recommended);
  });

  it('labels the Helper medallion "Help" in the same type size as the other medallions', () => {
    const size = px(MEDALLION_SIZE_M);
    const help = fakeCanvas(size, size);
    paintMedallion(ctxOf(help), size, 'helper', HELPER_COPY.label, false);
    const pause = fakeCanvas(size, size);
    paintMedallion(ctxOf(pause), size, 'pause', 'Pause', false);
    expect(help.calls.map((t) => t.text)).toEqual([HELPER_COPY.label]);
    expect(help.calls[0].size).toBe(pause.calls[0].size);
  });
});
