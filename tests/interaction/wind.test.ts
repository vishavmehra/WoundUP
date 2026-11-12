import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  MAX_WIND_UNITS,
  twistAbout,
  WIND_JUMP_RAD,
  WIND_LOCK_RAD,
  WIND_UNIT_RAD,
  WindTracker,
  wrapPi,
} from '../../src/interaction/wind';

const deg = (d: number): number => (d * Math.PI) / 180;
const Y = new Vector3(0, 1, 0);

/** Feeds a path of twist readings in `step`-degree frames and returns the units gained. */
function drive(tracker: WindTracker, fromDeg: number, toDeg: number, stepDeg = 5): number {
  let gained = 0;
  const sign = Math.sign(toDeg - fromDeg);
  for (let a = fromDeg + sign * stepDeg; sign > 0 ? a <= toDeg + 1e-9 : a >= toDeg - 1e-9; a += sign * stepDeg) {
    gained += tracker.update(deg(a));
  }
  return gained;
}

describe('wrapPi', () => {
  it('keeps angles within [-PI, PI]', () => {
    expect(wrapPi(0)).toBe(0);
    expect(wrapPi(deg(190))).toBeCloseTo(deg(-170));
    expect(wrapPi(deg(-190))).toBeCloseTo(deg(170));
    expect(wrapPi(deg(720 + 30))).toBeCloseTo(deg(30));
  });
});

describe('twistAbout (swing-twist)', () => {
  const rot = (axis: Vector3, angle: number): Quaternion => new Quaternion().setFromAxisAngle(axis.clone().normalize(), angle);

  it('recovers a pure twist, either direction', () => {
    for (const d of [-170, -90, -30, 0, 10, 45, 90, 179]) {
      expect(twistAbout(rot(Y, deg(d)), Y)).toBeCloseTo(deg(d), 6);
    }
  });

  it('ignores a swing about a perpendicular axis', () => {
    expect(twistAbout(rot(new Vector3(1, 0, 0), deg(40)), Y)).toBeCloseTo(0, 6);
    expect(twistAbout(rot(new Vector3(0, 0, 1), deg(-65)), Y)).toBeCloseTo(0, 6);
  });

  it('recovers the twist of a swing followed by a twist', () => {
    // q = swing * twist, the order of the decomposition (twist first, then swing).
    const q = rot(new Vector3(1, 0, 1), deg(30)).multiply(rot(Y, deg(55)));
    expect(twistAbout(q, Y)).toBeCloseTo(deg(55), 6);
  });

  it('gives the same answer for q and -q', () => {
    const q = rot(Y, deg(100));
    const neg = new Quaternion(-q.x, -q.y, -q.z, -q.w);
    expect(twistAbout(neg, Y)).toBeCloseTo(twistAbout(q, Y), 9);
  });

  it('is undefined (NaN) when the rotation is a half turn away from the axis', () => {
    expect(twistAbout(rot(new Vector3(1, 0, 0), Math.PI), Y)).toBeNaN();
  });
});

describe('WindTracker (INTERACTION_SPEC §10)', () => {
  it('earns what the solver credits for the same angle (windUnitsFromAngle in src/sim/power.ts, same rule)', () => {
    const solver = (angle: number): number => (angle > 0 ? Math.min(8, Math.floor(angle / (Math.PI / 2) + 1e-9)) : 0);
    for (let a = 5; a <= 800; a += 5) {
      const t = new WindTracker(0);
      drive(t, 0, a);
      expect(t.gained, `${a} degrees`).toBe(solver(deg(a)));
    }
  });

  it('every 90 degrees adds one unit', () => {
    const t = new WindTracker(0);
    expect(drive(t, 0, 80)).toBe(0);
    expect(drive(t, 80, 95)).toBe(1);
    expect(t.units).toBe(1);
    expect(drive(t, 95, 270)).toBe(2);
    expect(t.units).toBe(3);
  });

  it('works for either wrist direction', () => {
    const left = new WindTracker(0);
    expect(drive(left, 0, -180)).toBe(2);
    expect(left.direction).toBe(-1);
    const right = new WindTracker(0);
    expect(drive(right, 0, 180)).toBe(2);
    expect(right.direction).toBe(1);
  });

  it('tremor before the lock-in angle does not fix a direction or add anything', () => {
    const t = new WindTracker(0);
    for (let i = 0; i < 40; i++) t.update(deg(i % 2 === 0 ? 6 : -6));
    expect(t.direction).toBe(0);
    expect(t.gained).toBe(0);
  });

  it('stops at the maximum of eight', () => {
    const t = new WindTracker(0);
    expect(MAX_WIND_UNITS).toBe(8);
    // A comfortable wrist turns about 180 degrees, so a full wind takes several grabs; here one long unwrapped twist.
    let total = 0;
    for (let a = 5; a <= 1440; a += 5) total += t.update(wrapPi(deg(a)));
    expect(total).toBe(8);
    expect(t.units).toBe(8);
    expect(t.full).toBe(true);
    expect(t.update(wrapPi(deg(1445)))).toBe(0);
    expect(t.keyAngle).toBeCloseTo(8 * WIND_UNIT_RAD);
  });

  it('honours units banked before this grab', () => {
    const t = new WindTracker(6);
    expect(t.capacity).toBe(2);
    let total = 0;
    for (let a = 5; a <= 720; a += 5) total += t.update(wrapPi(deg(a)));
    expect(total).toBe(2);
    expect(t.units).toBe(8);
    expect(new WindTracker(8).capacity).toBe(0);
    expect(new WindTracker(9).capacity).toBe(0);
  });

  it('never allows more than eight, whatever maxUnits or banked units say', () => {
    expect(new WindTracker(0, 127).capacity).toBe(8);
    expect(new WindTracker(3, 127).capacity).toBe(5);
    expect(new WindTracker(-4).capacity).toBe(8); // a negative bank is nonsense, not extra room
    expect(new WindTracker(Number.NaN).capacity).toBe(8);
    const t = new WindTracker(0, 127);
    let total = 0;
    for (let a = 5; a <= 1800; a += 5) total += t.update(wrapPi(deg(a)));
    expect(total).toBe(8);
    expect(t.units).toBe(8);
  });

  it('twisting back and forth does not count the same rotation twice', () => {
    const t = new WindTracker(0);
    let total = 0;
    for (let cycle = 0; cycle < 20; cycle++) {
      total += drive(t, 0, 80);
      total += drive(t, 80, 0);
    }
    expect(total).toBe(0);
  });

  it('turning back loses nothing, and turning forward again over the same span earns nothing', () => {
    const t = new WindTracker(0);
    expect(drive(t, 0, 100)).toBe(1);
    expect(drive(t, 100, -60)).toBe(0); // all the way back, past the start
    expect(t.units).toBe(1);
    for (let i = 0; i < 20; i++) {
      expect(drive(t, -60, 100)).toBe(0); // the same span again and again
      expect(drive(t, 100, -60)).toBe(0);
    }
    expect(t.units).toBe(1);
    // Only turning further than ever before earns the next unit: 180 degrees from the pinch, not 90 from the last reversal.
    expect(drive(t, -60, 175)).toBe(0);
    expect(drive(t, 175, 185)).toBe(1);
    expect(t.units).toBe(2);
  });

  it('the same wrist span never counts twice, whatever path it took', () => {
    const t = new WindTracker(0);
    // Zig-zag with growing then shrinking swings, never beyond 170 degrees from the pinch.
    for (const peak of [60, 120, 170, 100, 170, 30, 170]) {
      drive(t, 0, peak);
      drive(t, peak, 0);
    }
    expect(t.gained).toBe(1); // floor(170 / 90)
  });

  it('unwraps across the +-PI boundary without losing or double counting', () => {
    const t = new WindTracker(0);
    let total = 0;
    for (let a = 5; a <= 360; a += 5) total += t.update(wrapPi(deg(a)));
    expect(total).toBe(4);
  });

  it('ignores a tracking jump and carries on from the new reading', () => {
    const t = new WindTracker(0);
    drive(t, 0, 40);
    expect(t.update(deg(40) + WIND_JUMP_RAD + 0.05)).toBe(0); // jump: dropped
    expect(t.keyAngle).toBeCloseTo(deg(40), 6);
    expect(t.update(deg(40) + WIND_JUMP_RAD + 0.05 + deg(5))).toBe(0); // resumes from the new reading
    expect(t.keyAngle).toBeCloseTo(deg(45), 6);
  });

  it('a jump cannot push the wind over a unit boundary', () => {
    const t = new WindTracker(0);
    drive(t, 0, 80);
    expect(t.update(deg(80) + WIND_JUMP_RAD + 0.2)).toBe(0); // would be 140 degrees if believed
    expect(t.gained).toBe(0);
    expect(t.update(deg(80) + WIND_JUMP_RAD + 0.2 + deg(5))).toBe(0); // still only about 85 on the wrist's own motion
    expect(t.gained).toBe(0);
  });

  it('a jump of any size adds at most nothing, never several units', () => {
    const t = new WindTracker(0);
    drive(t, 0, 30);
    expect(t.update(deg(170))).toBe(0);
    expect(t.update(deg(-100))).toBe(0);
    expect(t.gained).toBe(0);
  });

  it('gains at most one unit per frame', () => {
    expect(WIND_JUMP_RAD).toBeLessThan(WIND_UNIT_RAD);
    const t = new WindTracker(0);
    let worst = 0;
    for (let a = 0; a <= 720; a += deg(59) * (180 / Math.PI)) worst = Math.max(worst, t.update(wrapPi(deg(a))));
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('skips undefined (NaN) readings', () => {
    const t = new WindTracker(0);
    drive(t, 0, 50);
    expect(t.update(NaN)).toBe(0);
    expect(drive(t, 50, 95)).toBe(1);
  });

  it('exposes a signed key angle that follows the wrist up to the limits', () => {
    const t = new WindTracker(0);
    drive(t, 0, -50);
    expect(t.keyAngle).toBeCloseTo(-deg(50), 6);
    drive(t, -50, 20); // back past the start: the key does not turn the other way
    expect(t.keyAngle).toBe(0);
    expect(WIND_LOCK_RAD).toBeLessThan(WIND_UNIT_RAD);
  });
});
