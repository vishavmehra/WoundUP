import type { Quaternion, Vector3 } from 'three';

/**
 * Winding maths (INTERACTION_SPEC §10; GAMEPLAY_SYSTEMS §10.1): pinch the key, twist the wrist, every 90 degrees adds
 * one wind unit, at most eight. Pure functions and one small state machine, no IWSDK.
 * The rate is the solver's: `floor(angle / 90 degrees + 1e-9)`, capped at 8, as `windUnitsFromAngle` in src/sim/power.ts
 * (tests/interaction/wind.test.ts keeps the two equal). It is restated here because src/sim is on another branch;
 * once the branches meet, `WindTracker.update` can use `Math.min(windUnitsFromAngle(this.peak), this.capacity)` instead.
 */

/** One wind unit per 90 degrees of wrist twist (INTERACTION_SPEC §10). */
export const WIND_UNIT_RAD = Math.PI / 2;
/** Maximum wind units (INTERACTION_SPEC §10). */
export const MAX_WIND_UNITS = 8;
/** Twist needed after the pinch before the winding direction is fixed for that grab. Keeps hand tremor from choosing it. Tuning value, not in the spec. */
export const WIND_LOCK_RAD = (15 * Math.PI) / 180;
/**
 * A single-frame change larger than this is a tracking jump, not a wrist (60 degrees per frame is over 4000 degrees per
 * second at 72 Hz). It is dropped and the next frame starts from the new reading, so a jump never adds a unit
 * (INTERACTION_SPEC §10: "prevent sudden tracking jumps from adding multiple units"). It must stay below WIND_UNIT_RAD:
 * that guarantees at most one unit per frame. Tuning value, not in the spec.
 */
export const WIND_JUMP_RAD = Math.PI / 3;

const TAU = Math.PI * 2;

/** Wraps an angle into [-PI, PI]. */
export const wrapPi = (angle: number): number => angle - TAU * Math.round(angle / TAU);

/**
 * Twist of rotation `q` about the unit `axis`, in radians within [-PI, PI] (swing-twist decomposition). It does not
 * depend on which way the hand's own axes point, which is why winding can use the wrist without knowing its convention.
 * Returns NaN when the rotation is a half turn away from the axis, where the twist is undefined.
 */
export function twistAbout(q: Quaternion, axis: Vector3): number {
  const dot = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  if (Math.hypot(dot, q.w) < 1e-6) return NaN;
  // q and -q are the same rotation: pick the sign with w >= 0 so the angle lands in [-PI, PI].
  const sign = q.w < 0 ? -1 : 1;
  return 2 * Math.atan2(sign * dot, sign * q.w);
}

/**
 * Turns successive twist readings (radians, each relative to the pinch moment) into wind units for one grab.
 * Units depend only on how far the wrist has turned, never on how it got there:
 *  - `total` is the wrist's twist since the pinch, unwrapped frame by frame across +-PI.
 *  - Direction is not imposed: the first 15 degrees after the pinch fix it for this grab, so either wrist direction works.
 *  - Units are `floor(peak / 90 degrees)`, where `peak` is the furthest the wrist has turned in that direction. Turning back
 *    loses nothing and, turning forward again over the same span, earns nothing: the same rotation is never counted twice,
 *    and twisting back and forth cannot wind (INTERACTION_SPEC §10: "avoid counting the same rotation repeatedly").
 *  - Capacity is `maxUnits - startUnits`; at the top it stops (INTERACTION_SPEC §10: "Stop at the maximum").
 *  - A tracking jump is dropped (WIND_JUMP_RAD), so it can never add a unit.
 * Winding past one wrist's range means letting go, turning back and pinching again, as with a real key.
 */
export class WindTracker {
  /** Units this grab may still add. */
  readonly capacity: number;
  /** Units added since the pinch. */
  gained = 0;
  /** 0 until the direction is fixed, then +1 or -1 (the sign of the twist reading). */
  direction: -1 | 0 | 1 = 0;
  private total = 0;
  private peak = 0;
  private previous = 0;

  constructor(
    readonly startUnits: number,
    maxUnits: number = MAX_WIND_UNITS,
  ) {
    this.capacity = Math.max(0, maxUnits - startUnits);
  }

  /** Units wound in total, counting those banked before this grab. */
  get units(): number {
    return this.startUnits + this.gained;
  }

  get full(): boolean {
    return this.gained >= this.capacity;
  }

  /** Signed angle for turning the key's mesh: follows the wrist in the winding direction, from 0 up to the capacity. */
  get keyAngle(): number {
    if (this.direction === 0) return 0;
    const forward = Math.min(Math.max(this.direction * this.total, 0), this.capacity * WIND_UNIT_RAD);
    return forward === 0 ? 0 : this.direction * forward;
  }

  /** Feeds one twist reading; returns the units gained by it (0 or 1). NaN readings are skipped. */
  update(twist: number): number {
    if (Number.isNaN(twist)) return 0;
    const delta = wrapPi(twist - this.previous);
    this.previous = twist;
    if (Math.abs(delta) > WIND_JUMP_RAD) return 0;
    this.total += delta;

    if (this.direction === 0) {
      if (Math.abs(this.total) < WIND_LOCK_RAD) return 0;
      this.direction = this.total > 0 ? 1 : -1;
    }
    this.peak = Math.max(this.peak, this.direction * this.total);

    const earned = Math.min(Math.floor(this.peak / WIND_UNIT_RAD + 1e-9), this.capacity) - this.gained;
    if (earned <= 0) return 0;
    this.gained += earned;
    return earned;
  }
}
