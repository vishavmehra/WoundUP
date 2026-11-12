import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { ENGRAVINGS, LETTERS } from '../../src/game/content';
import type { GiftError } from '../../src/game/gift';
import { modeState, type Mode, type ModeState } from '../../src/game/modes';
import { Progress, applyHinge, findHinge, hingeAngle, readPivot } from '../../src/ui/anim';
import { MACHINE_NAMES, SETTING_ROWS, describeResult, giftErrorText, windLabel } from '../../src/ui/copy';
import { fitText, wrapText } from '../../src/ui/text-layout';
import { freshLocal, viewFor, type LocalFlow } from '../../src/ui/view';

const ctx = { letter: LETTERS.letter_1, closing: null, giftAvailable: false };
const at = (mode: Mode, extra: Partial<ModeState> = {}): ModeState => ({ ...modeState(mode), ...extra });
const local = (over: Partial<LocalFlow> = {}): LocalFlow => ({ ...freshLocal(), ...over });

describe('viewFor: which props exist in which mode', () => {
  it('shows only the trunk in the introduction, with no letter and no bench', () => {
    const v = viewFor(at('intro'), local(), { ...ctx, letter: null });
    expect(v).toMatchObject({ trunk: true, envelope: 'hidden', bench: false, panel: 'none', pauseButton: true, giftButton: false });
  });

  it('keeps the trunk only while it opens and sinks, then shows the letter in the town', () => {
    expect(viewFor(at('town'), local({ trunk: 'withdrawing' }), ctx).trunk).toBe(true);
    const v = viewFor(at('town'), local({ trunk: 'gone' }), ctx);
    expect(v.trunk).toBe(false);
    expect(v.envelope).toBe('sealed');
    expect(viewFor(at('town'), local({ trunk: 'gone', envelope: 'open' }), ctx).envelope).toBe('open');
  });

  it('shows the closing card only when no letter is waiting', () => {
    const base = local({ trunk: 'gone' });
    expect(viewFor(at('town'), base, { letter: null, closing: 'x', giftAvailable: true })).toMatchObject({ closingCard: true, envelope: 'hidden', giftButton: true });
    expect(viewFor(at('town'), base, { letter: LETTERS.letter_2, closing: null, giftAvailable: false })).toMatchObject({ closingCard: false, giftButton: false });
  });

  it('shows the bench in Build, Wind and Place, with the parcel closed until it is opened', () => {
    for (const mode of ['build', 'wind', 'place'] as const) {
      const closed = viewFor(at(mode), local({ trunk: 'gone' }), ctx);
      expect(closed).toMatchObject({ bench: true, parcel: 'closed', tray: false, blueprint: false });
      const open = viewFor(at(mode), local({ trunk: 'gone', parcel: 'open' }), ctx);
      expect(open).toMatchObject({ parcel: 'open', tray: true, blueprint: true });
    }
    expect(viewFor(at('town'), local({ trunk: 'gone', parcel: 'open' }), ctx)).toMatchObject({ bench: false, parcel: 'hidden', tray: false });
  });

  it('shows Run only while winding, and the result label through Place', () => {
    const l = local({ trunk: 'gone', parcel: 'open' });
    expect(viewFor(at('wind'), l, ctx)).toMatchObject({ runSign: true, runControls: true, placeHint: false });
    expect(viewFor(at('build'), l, ctx)).toMatchObject({ runSign: false, runControls: false });
    const ran = { ...l, result: describeResult({ status: 'runs' }) };
    expect(viewFor(at('place'), ran, ctx)).toMatchObject({ runSign: true, runControls: false, placeHint: false });
    expect(viewFor(at('place'), l, ctx)).toMatchObject({ runSign: false, placeHint: true });
  });

  it('shows the panel for pause, restart and gift, over the view of the mode it returns to', () => {
    const l = local({ trunk: 'gone', parcel: 'open' });
    const paused = viewFor(at('pause', { resume: 'wind' }), l, ctx);
    expect(paused).toMatchObject({ panel: 'pause', bench: true, runSign: true, pauseButton: false });
    expect(viewFor(at('pause', { resume: 'wind', restartArmed: true }), l, ctx).panel).toBe('restart');
    expect(viewFor(at('gift'), local({ trunk: 'gone' }), ctx)).toMatchObject({ panel: 'gift', pauseButton: false, giftButton: false });
    expect(viewFor(at('pause', { resume: null }), local({ trunk: 'gone' }), ctx).bench).toBe(false); // an unknown return falls back to the town
  });

  it('is pure: the same inputs give the same view', () => {
    const l = local({ trunk: 'gone' });
    expect(viewFor(at('town'), l, ctx)).toEqual(viewFor(at('town'), l, ctx));
  });
});

describe('result labels (UI_UX_SPEC section 13)', () => {
  it('maps every solver status to a plain sentence and never a code name', () => {
    const cases = [
      describeResult({ status: 'runs' }),
      describeResult({ status: 'runs_wrong', wrongTargets: ['runSeconds'] }),
      describeResult({ status: 'runs_wrong' }, { speedRatio: 1.4 }),
      describeResult({ status: 'runs_wrong' }, { speedRatio: 0.5 }),
      describeResult({ status: 'runs_wrong' }),
      describeResult({ status: 'jams', jamReason: 'module_mismatch' }),
      describeResult({ status: 'jams', jamReason: 'velocity_contradiction' }),
      describeResult({ status: 'jams' }),
      describeResult({ status: 'incomplete', missingSockets: ['socket_gear_a'] }),
      describeResult({ status: 'incomplete', missingSockets: ['a', 'b', 'c'] }),
      describeResult({ status: 'incomplete' }),
    ];
    for (const r of cases) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.hint.length).toBeGreaterThan(0);
      expect(`${r.title} ${r.hint}`).not.toMatch(/socket_|module|velocity|node|rad|_/i);
    }
    expect(cases[0]).toMatchObject({ status: 'runs', tone: 'good', canContinue: true });
    expect(cases.slice(1).every((r) => !r.canContinue)).toBe(true);
    expect(cases[2].title).toMatch(/fast/);
    expect(cases[3].title).toMatch(/slow/);
    expect(cases[8].hint).toMatch(/One slot/);
    expect(cases[9].hint).toMatch(/3 slots/);
  });

  it('formats the wind counter and clamps it', () => {
    expect(windLabel(3, 8)).toBe('Wound 3 of 8');
    expect(windLabel(12, 8)).toBe('Wound 8 of 8');
    expect(windLabel(-1, 8)).toBe('Wound 0 of 8');
  });

  it('gives every gift error a plain card and never echoes a code name', () => {
    const errors: GiftError[] = ['not-a-gift', 'too-long', 'bad-encoding', 'unsupported', 'inflate-failed', 'too-big', 'bad-json', 'bad-version', 'bad-shape', 'unknown-blueprint', 'blueprint-version', 'unknown-part', 'unknown-engraving', 'bad-assembly', 'solver-rejected'];
    for (const e of errors) {
      const t = giftErrorText(e);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.body.length).toBeGreaterThan(3);
      expect(`${t.title}${t.body}`).not.toContain(e);
    }
    expect(new Set(errors.map((e) => giftErrorText(e).title)).size).toBeGreaterThan(3);
  });

  it('has a name for every machine and a row for each accessibility setting', () => {
    expect(Object.keys(MACHINE_NAMES).sort()).toEqual(['carousel', 'clock_tower', 'music_box', 'windmill']);
    expect(SETTING_ROWS.map((r) => r.key)).toEqual(['easySnap', 'gazeMode', 'xrayHint']);
    expect(ENGRAVINGS.length).toBe(8);
  });
});

describe('text layout', () => {
  const mono = (size: number) => (text: string) => text.length * size * 0.5;

  it('wraps on words and breaks a word that is wider than the line', () => {
    expect(wrapText(mono(10), 'one two three four', 60)).toEqual(['one two', 'three four']);
    const broken = wrapText(mono(10), 'abcdefghijklmnop', 30);
    expect(broken.every((l) => l.length * 5 <= 30)).toBe(true);
    expect(broken.join('')).toBe('abcdefghijklmnop');
    expect(wrapText(mono(10), '   ', 30)).toEqual([]);
  });

  it('picks the largest size that fits, and falls back to the minimum', () => {
    const fit = fitText(mono, 'the quick brown fox jumps over the lazy dog', 200, 60, 40, 14);
    expect(fit.size).toBeLessThanOrEqual(40);
    expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(60);
    expect(fitText(mono, 'x '.repeat(500), 100, 20, 40, 14).size).toBe(14);
    expect(fitText(mono, 'hi', 500, 60, 40, 14).size).toBe(40);
  });
});

describe('hinge animation', () => {
  it('reads a valid hinge and refuses a malformed one', () => {
    expect(readPivot({ type: 'pivot', kind: 'hinge', axis: '+X', closedDeg: 0, openDeg: -95 })).toMatchObject({ axis: 'x', sign: 1 });
    expect(readPivot({ type: 'pivot', kind: 'hinge', axis: '-z', closedDeg: 0, openDeg: 90 })).toMatchObject({ axis: 'z', sign: -1 });
    const bad = [null, 3, {}, { type: 'pivot', kind: 'slide', axis: 'x' }, { type: 'pivot', kind: 'hinge', axis: 'w', closedDeg: 0, openDeg: 1 }, { type: 'pivot', kind: 'hinge', axis: 'x', closedDeg: 0, openDeg: 400 }, { type: 'pivot', kind: 'hinge', axis: 'x', closedDeg: 'a', openDeg: 1 }];
    for (const b of bad) expect(readPivot(b)).toBeNull();
  });

  it('interpolates closed to open and clamps', () => {
    const p = readPivot({ type: 'pivot', kind: 'hinge', axis: '+X', closedDeg: 0, openDeg: -90 });
    expect(p).not.toBeNull();
    expect(hingeAngle(p!, 0)).toBeCloseTo(0);
    expect(hingeAngle(p!, 1)).toBeCloseTo(-Math.PI / 2);
    expect(hingeAngle(p!, 2)).toBeCloseTo(-Math.PI / 2);
    expect(hingeAngle(p!, 0.5)).toBeCloseTo(-Math.PI / 4);
  });

  it('finds a PIV_ node by name and turns it', () => {
    const root = new Object3D();
    const lid = new Object3D();
    lid.name = 'PIV_Lid';
    lid.userData.wu = { type: 'pivot', kind: 'hinge', axis: '+X', closedDeg: 0, openDeg: -95 };
    const other = new Object3D();
    other.name = 'PIV_Other';
    other.userData.wu = { type: 'pivot', kind: 'hinge', axis: '+Y', closedDeg: 0, openDeg: 10 };
    root.add(other, lid);
    expect(findHinge(root, 'PIV_Lid')?.node).toBe(lid);
    expect(findHinge(root)?.node).toBe(other);
    expect(findHinge(root, 'PIV_None')).toBeNull();
    applyHinge(lid, findHinge(root, 'PIV_Lid')!.pivot, 1);
    expect(lid.rotation.x).toBeCloseTo((-95 * Math.PI) / 180);
  });
});

describe('Progress', () => {
  it('runs to its target over its duration and eases', () => {
    const p = new Progress(1);
    expect(p.moving).toBe(false);
    p.go(1);
    p.step(0.25);
    expect(p.value).toBeCloseTo(0.25);
    expect(p.eased).toBeLessThan(0.25);
    p.step(2);
    expect(p.value).toBe(1);
    expect(p.moving).toBe(false);
    p.go(0);
    p.step(0.5);
    expect(p.value).toBeCloseTo(0.5);
  });

  it('waits out a delay and carries the leftover time', () => {
    const p = new Progress(1);
    p.go(1, 0.5);
    p.step(0.4);
    expect(p.value).toBe(0);
    p.step(0.3); // 0.2 s past the delay
    expect(p.value).toBeCloseTo(0.2, 6);
    p.jump(0);
    expect(p.moving).toBe(false);
  });
});
