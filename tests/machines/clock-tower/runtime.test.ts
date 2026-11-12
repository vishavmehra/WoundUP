// ClockTowerRuntime with an injected clock: the pendulum and the escapement in step, the hands, the hourly strike, the 30 s doors.

import { describe, expect, it } from 'vitest';
import {
  BEAT_SECONDS,
  BELL_RECOIL_RAD,
  ClockTowerRuntime,
  DOORS_OPEN_SECONDS,
  ESCAPE_STEP_RAD,
  PENDULUM_AMPLITUDE_RAD,
  STRIKER_SWING_RAD,
  STRIKE_INTERVAL_SECONDS,
  hourHandAngle,
  minuteHandAngle,
} from '../../../src/machines/clock-tower';
import type { ClockTowerListener } from '../../../src/machines/clock-tower';

const TAU = Math.PI * 2;
const local = (h: number, m = 0, s = 0, ms = 0): number => new Date(2026, 10, 13, h, m, s, ms).getTime();

/** A runtime on a clock the test winds by hand, and a log of every event with the time it fired. */
function rig(start: number, powered = true) {
  let now = start;
  const rt = new ClockTowerRuntime(() => now);
  rt.powered = powered;
  const log: { type: string; at: number; args: number[] }[] = [];
  const listener: ClockTowerListener = {
    tick: (p) => log.push({ type: 'tick', at: now, args: [p] }),
    hour: (n) => log.push({ type: 'hour', at: now, args: [n] }),
    strike: (i, n) => log.push({ type: 'strike', at: now, args: [i, n] }),
    doorsOpen: () => log.push({ type: 'doorsOpen', at: now, args: [] }),
    doorsClose: () => log.push({ type: 'doorsClose', at: now, args: [] }),
  };
  rt.events.subscribe(listener);
  /** Advances `seconds` in `step` second frames, calling `each` after every update. */
  const run = (seconds: number, step = 0.05, each?: () => void): void => {
    const frames = Math.round(seconds / step);
    for (let i = 0; i < frames; i++) {
      now += step * 1000;
      rt.update();
      each?.();
    }
  };
  rt.update(); // the first frame
  return { rt, log, run, now: () => now, setNow: (t: number) => void (now = t) };
}
const of = (log: { type: string }[], type: string) => log.filter((e) => e.type === type);

describe('pendulum and escapement', () => {
  it('beats once a second, tick then tock, and the wheel advances half a tooth on each beat, in step', () => {
    const { rt, log, run } = rig(local(10));
    const wheelAtTick: number[] = [];
    const pendulumAtTick: number[] = [];
    let ticks = 0;
    run(60.5, 0.05, () => {
      if (of(log, 'tick').length > ticks) {
        ticks = of(log, 'tick').length;
        wheelAtTick.push(rt.escapeWheelZ);
        pendulumAtTick.push(rt.pendulumZ);
      }
    });
    const tickEvents = of(log, 'tick');
    expect(tickEvents).toHaveLength(60); // one per second of a 60.5 s run: the first at 1 s
    expect(tickEvents.map((e) => e.args[0])).toEqual(Array.from({ length: 60 }, (_, i) => i % 2));
    expect(tickEvents[1].at - tickEvents[0].at).toBe(BEAT_SECONDS * 1000);
    // The wheel only starts moving at a tick: just before it, it is still on the previous step.
    expect(wheelAtTick[10]).toBeGreaterThan(-(11 * ESCAPE_STEP_RAD));
    expect(rt.escapeWheelZ).toBeCloseTo(-60 * ESCAPE_STEP_RAD, 10);
    // At each tick the pendulum is at an extreme (the drop), on alternating sides.
    for (let i = 10; i < pendulumAtTick.length; i++) {
      expect(Math.abs(pendulumAtTick[i])).toBeGreaterThan(0.97 * PENDULUM_AMPLITUDE_RAD);
      expect(Math.sign(pendulumAtTick[i])).toBe(-Math.sign(pendulumAtTick[i - 1]));
    }
  });

  it('swings a full period in two seconds and never beyond its amplitude', () => {
    const { rt, run } = rig(local(10));
    let max = 0;
    run(20, 0.05, () => void (max = Math.max(max, Math.abs(rt.pendulumZ))));
    expect(max).toBeLessThanOrEqual(PENDULUM_AMPLITUDE_RAD);
    expect(max).toBeGreaterThan(0.99 * PENDULUM_AMPLITUDE_RAD);
    const a = rt.pendulumZ; // t = 20 s: an extreme
    run(1);
    expect(rt.pendulumZ).toBeCloseTo(-a, 6); // half a period later: the other extreme
    run(1);
    expect(rt.pendulumZ).toBeCloseTo(a, 6);
  });

  it('turns the escape wheel clockwise once in 48 seconds (24 teeth, a tooth per swing there and back)', () => {
    const { rt, run } = rig(local(10));
    run(48.5);
    expect(rt.escapeWheelZ).toBeCloseTo(-TAU, 10);
  });

  it('starts and stops softly: the swing builds up from rest and dies away, and the wheel keeps its place', () => {
    const { rt, log, run } = rig(local(10));
    run(0.1);
    expect(Math.abs(rt.pendulumZ)).toBeLessThan(0.3 * PENDULUM_AMPLITUDE_RAD);
    run(10);
    const wheel = rt.escapeWheelZ;
    const ticks = of(log, 'tick').length;
    rt.powered = false;
    run(10);
    expect(Math.abs(rt.pendulumZ)).toBeLessThan(1e-3);
    expect(of(log, 'tick')).toHaveLength(ticks);
    expect(rt.escapeWheelZ).toBe(wheel);
  });

  it('does nothing at all while unpowered', () => {
    const { rt, log, run } = rig(local(10), false);
    run(30);
    expect([rt.pendulumZ, rt.escapeWheelZ, rt.hourHandZ, rt.minuteHandZ, rt.hourlyCamZ]).toEqual([0, 0, 0, 0, 0]);
    expect(log).toEqual([]);
  });

  it('ignores a long pause: it is not a frame', () => {
    const { rt, run, setNow, now } = rig(local(10));
    run(10);
    const beat = rt.pendulumZ;
    setNow(now() + 3_600_000);
    rt.update();
    // One hour later the pendulum has moved by at most one capped step, not by 3600 beats.
    expect(Math.abs(rt.pendulumZ - beat)).toBeLessThan(PENDULUM_AMPLITUDE_RAD * Math.PI * 0.25 + 1e-9);
  });
});

describe('hands', () => {
  it('show the local time while powered: clockwise, so a negative turn about +Z', () => {
    const { rt } = rig(local(14, 20));
    const d = new Date(local(14, 20));
    expect(rt.minuteHandZ).toBeCloseTo(-minuteHandAngle(d), 12);
    expect(rt.minuteHandZ).toBeCloseTo(-TAU / 3, 12);
    expect(rt.hourHandZ).toBeCloseTo(-hourHandAngle(d), 12);
    expect(rt.hourHandZ).toBeCloseTo(-((2 + 1 / 3) / 12) * TAU, 12);
    expect(rt.hourlyCamZ).toBeCloseTo(rt.minuteHandZ, 12);
  });

  it('move with the clock and freeze when the clock stops', () => {
    const { rt, run } = rig(local(14, 20));
    const before = rt.minuteHandZ;
    run(60);
    expect(rt.minuteHandZ).toBeCloseTo(before - TAU / 60, 6);
    rt.powered = false;
    const frozen = rt.minuteHandZ;
    run(60);
    expect(rt.minuteHandZ).toBe(frozen);
  });
});

describe('hourly strike and the theatre doors', () => {
  it('strikes the hour at the hour: 3 strikes at 15:00, two seconds apart, with the doors opening at once', () => {
    const start = local(14, 59, 50);
    const { rt, log, run } = rig(start);
    run(9.9);
    expect(log.filter((e) => e.type !== 'tick')).toEqual([]);
    run(40);
    const hour = local(15);
    expect(of(log, 'hour')).toEqual([{ type: 'hour', at: expect.any(Number), args: [3], }]);
    const strikes = of(log, 'strike');
    expect(strikes.map((e) => e.args)).toEqual([[1, 3], [2, 3], [3, 3]]);
    strikes.forEach((e, i) => {
      const due = hour + i * STRIKE_INTERVAL_SECONDS * 1000;
      expect(e.at).toBeGreaterThanOrEqual(due);
      expect(e.at - due).toBeLessThan(50); // fires within one frame of its time
    });
    const open = of(log, 'doorsOpen');
    expect(open).toHaveLength(1);
    expect(open[0].at - hour).toBeLessThan(50);
    expect(rt.doorsOpen).toBe(false);
  });

  it('opens the doors for 30 seconds, easing open and shut, and tells the town when they are done', () => {
    const { rt, log, run } = rig(local(14, 59, 59));
    const amounts: number[] = [];
    run(1.2); // just past the hour
    expect(rt.doorsOpen).toBe(true);
    run(14, 0.5, () => amounts.push(rt.doorsAmount));
    expect(amounts.at(-1)).toBe(1); // fully open in the middle of the 30 seconds
    expect(amounts[0]).toBeGreaterThan(0);
    run(13);
    expect(rt.doorsOpen).toBe(true); // at about 28.2 s after the hour
    expect(rt.doorsAmount).toBeLessThan(1);
    run(3);
    expect(rt.doorsOpen).toBe(false);
    expect(rt.doorsAmount).toBe(0);
    const close = of(log, 'doorsClose');
    expect(close).toHaveLength(1);
    const hour = local(15);
    expect(close[0].at - hour).toBeGreaterThanOrEqual(DOORS_OPEN_SECONDS * 1000);
    expect(close[0].at - hour).toBeLessThan(DOORS_OPEN_SECONDS * 1000 + 50);
  });

  it('strikes the number on a 12-hour dial: midnight 12, one o clock 1, noon 12, eleven pm 11', () => {
    for (const [hour, expected] of [[0, 12], [1, 1], [11, 11], [12, 12], [13, 1], [23, 11]] as const) {
      const { log, run } = rig(local(hour, 0, 0, 0) - 500);
      run(35);
      expect(of(log, 'hour').map((e) => e.args[0]), `hour ${hour}`).toEqual([expected]);
      expect(of(log, 'strike')).toHaveLength(expected);
      expect(of(log, 'strike').at(-1)?.args, `hour ${hour}`).toEqual([expected, expected]);
    }
  });

  it('twelve strikes still end before the doors close', () => {
    const { log, run } = rig(local(11, 59, 59, 500));
    run(35);
    const last = of(log, 'strike').at(-1);
    const close = of(log, 'doorsClose')[0];
    expect(last?.args).toEqual([12, 12]);
    expect(last?.at).toBeLessThan(close.at);
  });

  it('does not strike while the clock is stopped, and a clock started after the hour does not strike late', () => {
    const stopped = rig(local(14, 59, 55), false);
    stopped.run(10);
    expect(stopped.log).toEqual([]);
    const late = rig(local(14, 59, 55), false);
    late.run(10); // the hour goes by unpowered
    late.rt.powered = true;
    late.run(10);
    expect(of(late.log, 'strike')).toEqual([]);
  });

  it('does not strike an hour that went by during a pause (sleep, headset off)', () => {
    const { rt, log, setNow, run } = rig(local(14, 59, 59));
    setNow(local(15, 0, 10)); // 11 s in one jump
    rt.update();
    run(5);
    expect(of(log, 'hour')).toEqual([]);
  });

  it('strikes again an hour later', () => {
    const { log, run } = rig(local(14, 59, 59, 500));
    run(3600 + 5, 0.5);
    expect(of(log, 'hour').map((e) => e.args[0])).toEqual([3, 4]);
  });

  it('rings on demand for the demo, with the hour on the dial by default, and not twice at once', () => {
    const { rt, log, run } = rig(local(16, 20));
    expect(rt.triggerStrikes()).toBe(true);
    expect(rt.triggerStrikes(5)).toBe(false);
    run(10);
    expect(of(log, 'hour').map((e) => e.args[0])).toEqual([4]);
    expect(of(log, 'strike')).toHaveLength(4);
    run(25);
    expect(rt.doorsOpen).toBe(false);
    expect(rt.triggerStrikes(99)).toBe(true); // capped at twelve
    run(1);
    expect(of(log, 'hour').map((e) => e.args[0])).toEqual([4, 12]);
  });

  it('swings the striker out and back on each strike, and the bell trembles then settles', () => {
    const { rt, run } = rig(local(15) - 100);
    run(0.1); // the first strike falls in this frame
    expect(rt.strikerZ).toBeGreaterThanOrEqual(0);
    let peak = 0;
    let bell = 0;
    run(0.5, 0.01, () => {
      peak = Math.max(peak, rt.strikerZ);
      bell = Math.max(bell, Math.abs(rt.bellZ));
    });
    expect(peak).toBeGreaterThan(0.95 * STRIKER_SWING_RAD);
    expect(peak).toBeLessThanOrEqual(STRIKER_SWING_RAD);
    expect(bell).toBeGreaterThan(0);
    expect(bell).toBeLessThanOrEqual(BELL_RECOIL_RAD);
    expect(rt.strikerZ).toBe(0); // 0.6 s after the strike, and the next is 2 s away
    run(1.3);
    expect(rt.bellZ).toBe(0); // by 3 s after the last strike it has settled; here the next strike has not yet come
  });

  it('stops delivering events to a listener that unsubscribed', () => {
    const { rt, log, run } = rig(local(10));
    const calls: number[] = [];
    const off = rt.events.subscribe({ tick: () => calls.push(1) });
    run(3);
    expect(calls).toHaveLength(3);
    off();
    run(3);
    expect(calls).toHaveLength(3);
    expect(of(log, 'tick')).toHaveLength(6);
  });
});
