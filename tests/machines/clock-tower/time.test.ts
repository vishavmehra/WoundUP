// Hand angles and strike counts at known local times. Dates are built from local fields, so the tests hold in every time zone.

import { describe, expect, it } from 'vitest';
import { hourHandAngle, hourlyCamAngle, hourStartMs, minuteHandAngle, strikeCount } from '../../../src/machines/clock-tower';

const at = (h: number, m = 0, s = 0, ms = 0): Date => new Date(2026, 10, 13, h, m, s, ms);
const TAU = Math.PI * 2;

describe('hand angles, clockwise from 12', () => {
  it('both hands point up at 12:00 and at midnight', () => {
    for (const h of [0, 12]) {
      expect(hourHandAngle(at(h))).toBeCloseTo(0, 12);
      expect(minuteHandAngle(at(h))).toBeCloseTo(0, 12);
    }
  });

  it('3:00 puts the hour hand at a quarter turn and 15:00 is the same dial position', () => {
    expect(hourHandAngle(at(3))).toBeCloseTo(Math.PI / 2, 12);
    expect(hourHandAngle(at(15))).toBeCloseTo(Math.PI / 2, 12);
    expect(minuteHandAngle(at(3))).toBeCloseTo(0, 12);
  });

  it('6:30 puts the minute hand down and the hour hand half way between 6 and 7', () => {
    expect(minuteHandAngle(at(6, 30))).toBeCloseTo(Math.PI, 12);
    expect(hourHandAngle(at(6, 30))).toBeCloseTo((6.5 / 12) * TAU, 12);
  });

  it('9:15 puts the minute hand at 3 and the hour hand a quarter past 9', () => {
    expect(minuteHandAngle(at(9, 15))).toBeCloseTo(Math.PI / 2, 12);
    expect(hourHandAngle(at(9, 15))).toBeCloseTo((9.25 / 12) * TAU, 12);
  });

  it('sweeps with the seconds and the milliseconds, and never reaches a full turn', () => {
    expect(minuteHandAngle(at(1, 0, 30))).toBeCloseTo(TAU / 120, 12);
    expect(minuteHandAngle(at(1, 0, 0, 500))).toBeCloseTo(TAU / 7200, 12);
    expect(minuteHandAngle(at(23, 59, 59, 999))).toBeLessThan(TAU);
    expect(hourHandAngle(at(23, 59, 59, 999))).toBeLessThan(TAU);
  });

  it('the hourly cam turns with the minute hand: once an hour', () => {
    expect(hourlyCamAngle(at(5, 20))).toBe(minuteHandAngle(at(5, 20)));
  });
});

describe('strike count', () => {
  it('is the hour on a 12-hour dial: midnight and noon strike twelve', () => {
    const counts = Array.from({ length: 24 }, (_, h) => strikeCount(h));
    expect(counts).toEqual([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('hourStartMs', () => {
  it('is the same for every instant of one local hour and grows with the next', () => {
    const start = at(14).getTime();
    expect(hourStartMs(at(14))).toBe(start);
    expect(hourStartMs(at(14, 35, 12, 345))).toBe(start);
    expect(hourStartMs(at(14, 59, 59, 999))).toBe(start);
    expect(hourStartMs(at(15))).toBe(start + 3_600_000);
  });
});
