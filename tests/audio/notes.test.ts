import { describe, expect, it } from 'vitest';
import { PLOT_IDS } from '../../src/game/content';
import { MELODY, midiToHz, notesBetween, STEPS_PER_TURN, WAKE_CHIMES } from '../../src/audio/notes';
import type { MelodyNote } from '../../src/audio/notes';

const count = (from: number, to: number): number => {
  let n = 0;
  notesBetween(from, to, () => n++);
  return n;
};

describe('the Music Box tune', () => {
  it('is sixteen bars of 3/4 laid on one cylinder turn, in order, inside the turn', () => {
    expect(STEPS_PER_TURN).toBe(16 * 6);
    expect(MELODY.length).toBeGreaterThan(40);
    for (let i = 0; i < MELODY.length; i++) {
      expect(MELODY[i].turn).toBeGreaterThanOrEqual(0);
      expect(MELODY[i].turn).toBeLessThan(1);
      if (i > 0) expect(MELODY[i].turn).toBeGreaterThanOrEqual(MELODY[i - 1].turn);
      expect(MELODY[i].velocity).toBeGreaterThan(0);
      expect(MELODY[i].velocity).toBeLessThanOrEqual(1);
      expect(Number.isInteger(MELODY[i].midi)).toBe(true);
    }
  });

  it('stays inside the range of a small comb (C3 to E6) and ends on its tonic, held', () => {
    const midis = MELODY.map((n) => n.midi);
    expect(Math.min(...midis)).toBeGreaterThanOrEqual(48);
    expect(Math.max(...midis)).toBeLessThanOrEqual(88 + 4);
    const last = MELODY.filter((n) => n.turn === 90 / STEPS_PER_TURN).map((n) => n.midi % 12);
    expect(last).toEqual([0, 0]); // C in the bass and C on top
  });

  it('puts the pins of the bar line on the cylinder: every sixth step has a bass note', () => {
    for (let bar = 0; bar < 16; bar++) {
      const at = (bar * 6) / STEPS_PER_TURN;
      expect(MELODY.some((n) => n.turn === at && n.velocity < 0.5)).toBe(true);
    }
  });
});

describe('notesBetween', () => {
  it('plays every pin once per turn, whatever the step', () => {
    expect(count(0, 1)).toBe(MELODY.length); // a pin at 0 passes at the end of the turn, turn 1
    expect(count(-1e-6, 1 - 1e-6)).toBe(MELODY.length);
    expect(count(3 - 1e-6, 4 - 1e-6)).toBe(MELODY.length);
    expect(count(0.25, 3.25)).toBe(MELODY.length * 3);
  });

  it('gives the same notes whether the cylinder moves in one step or many', () => {
    const whole: MelodyNote[] = [];
    notesBetween(-1e-6, 2.7, (n) => whole.push(n));
    const parts: MelodyNote[] = [];
    let at = -1e-6;
    for (let i = 1; i <= 270; i++) {
      const to = i * 0.01;
      notesBetween(at, to, (n) => parts.push(n));
      at = to;
    }
    expect(parts).toEqual(whole);
  });

  it('never plays backwards or standing still, and plays a pin only as it passes', () => {
    expect(count(1, 0.5)).toBe(0);
    expect(count(0.5, 0.5)).toBe(0);
    expect(count(Number.NaN, 1)).toBe(0);
    const bar = 6 / STEPS_PER_TURN;
    expect(count(bar - 1e-9, bar + 1e-9)).toBeGreaterThan(0);
    expect(count(bar, bar + 1e-9)).toBe(0); // a pin already at the comb has sounded
  });
});

describe('pitch', () => {
  it('is equal tempered from A4 = 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });

  it('gives every plot its own wake chime, drawn from C major so any mix is consonant', () => {
    const major = new Set([0, 2, 4, 5, 7, 9, 11]);
    expect(Object.keys(WAKE_CHIMES).sort()).toEqual([...PLOT_IDS].sort());
    const seen = new Set<string>();
    for (const plot of PLOT_IDS) {
      expect(WAKE_CHIMES[plot].length).toBeGreaterThanOrEqual(3);
      expect(WAKE_CHIMES[plot].every((m) => major.has(m % 12))).toBe(true);
      expect(WAKE_CHIMES[plot].every((m, i, a) => i === 0 || m > a[i - 1])).toBe(true); // rising
      seen.add(WAKE_CHIMES[plot].join());
    }
    expect(seen.size).toBe(PLOT_IDS.length);
  });
});
