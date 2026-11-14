import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Anchor, HandShape } from './hand-rig';
import { GESTURE_SECONDS } from './lessons';
import type { Gesture } from './lessons';

/**
 * The ghost-hand demonstrations as pure functions of time (PRODUCT_SPEC F15, §15): `sampleScript(variant, gesture, t, targets, out)` writes where
 * the hand is, how it is bent, whether it carries a ghost of the part, and which targets pulse, at second `t` of a showing. No scene, no
 * allocation after the module loads, so it runs every frame and tests can read any instant of it.
 *
 *  - `hands`: the hand itself goes to the thing (poke it, pinch it and carry it, pinch it and turn the wrist, hold a flat palm over it).
 *  - `gaze` and `ray`: the player does not reach (INTERACTION_SPEC §14; PRODUCT_SPEC §16). The hand stays in the air by the lap and only
 *    pinches; the target pulses (gaze: "look at it") or a ray runs from the hand to it (ray mode), and a carried part travels on its own.
 *
 * Every script is exactly `GESTURE_SECONDS[gesture]` long and ends with the hand faded out.
 */

export type Variant = 'hands' | 'gaze' | 'ray';

export interface Targets {
  /** The thing the gesture is about: the part to take, the key, the plaque, the machine (its top, for the palm). World space. */
  readonly from: Vector3;
  /** Where a carry ends (a socket, a plot). The same point as `from` for the other gestures. */
  readonly to: Vector3;
  /** The turning axis of the key, unit length, world space. */
  readonly axis: Vector3;
  /** The player's head, world space: the hand is turned to face away from it. */
  readonly head: Vector3;
}

export interface Sample {
  /** Opacity of the hand, 0 to 1. Zero means: do not draw it. */
  alpha: number;
  /** The point of the hand that goes to `hand`: see `anchor`. */
  hand: Vector3;
  quat: Quaternion;
  shape: HandShape;
  anchor: Anchor;
  /** A ghost of the part (or machine) travels with the pinch at `carried`. */
  carrying: boolean;
  carried: Vector3;
  /** How bright the pulse at `from` and at `to` is, 0 to 1. */
  pulseFrom: number;
  pulseTo: number;
  /** Ray mode: a beam from `hand` to `focus`. */
  beam: boolean;
  focus: Vector3;
}

export const makeSample = (): Sample => ({
  alpha: 0,
  hand: new Vector3(),
  quat: new Quaternion(),
  shape: { index: 0, thumb: 0, rest: 0 },
  anchor: 'pinch',
  carrying: false,
  carried: new Vector3(),
  pulseFrom: 0,
  pulseTo: 0,
  beam: false,
  focus: new Vector3(),
});

const UP = new Vector3(0, 1, 0);
const _fwd = new Vector3();
const _right = new Vector3();
const _back = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
const _spin = new Quaternion();
const _base = new Quaternion();

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** 0 before `a`, 1 after `b`, smooth between. */
const ramp = (t: number, a: number, b: number): number => smooth((t - a) / (b - a));
/** A pulse that breathes between 0.55 and 1 while `on` is 1. */
const breathe = (t: number, on: number): number => on * (0.775 + 0.225 * Math.sin(t * 7));

/** Unit vector from the head to `target`, flattened to the table, falling back to straight ahead (-Z) when they are above each other. */
function facing(out: Vector3, head: Vector3, target: Vector3): Vector3 {
  out.set(target.x - head.x, 0, target.z - head.z);
  return out.lengthSq() < 1e-8 ? out.set(0, 0, -1) : out.normalize();
}

/**
 * Turns the hand so its fingers point along `fwd` tilted `pitch` radians downward, with the palm facing down turned `roll` radians about the
 * fingers. The hand's frame: fingers -Z, palm -Y (hand-rig.ts).
 */
function aim(out: Quaternion, fwd: Vector3, pitch: number, roll: number): Quaternion {
  _a.copy(fwd).multiplyScalar(Math.cos(pitch)).addScaledVector(UP, -Math.sin(pitch)); // finger direction
  _z.copy(_a).negate();
  _b.copy(UP).applyAxisAngle(_a, roll);
  _x.crossVectors(_b, _z).normalize();
  _y.crossVectors(_z, _x);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

/** Where the hand waits in the air for the gaze and ray demonstrations: low and to the right of where the player looks, by the lap. */
function restPoint(out: Vector3, head: Vector3, fwd: Vector3): Vector3 {
  _right.crossVectors(fwd, UP);
  return out.copy(head).addScaledVector(fwd, 0.34).addScaledVector(_right, 0.17).addScaledVector(UP, -0.3);
}

/** Fade in over the first 0.5 s, out over the last 0.9 s. */
const fade = (t: number, length: number): number => ramp(t, 0, 0.5) * (1 - ramp(t, length - 0.9, length - 0.1));

const PINCH_SHAPE = { index: 1, thumb: 1, rest: 0.5 } as const;
const set = (s: HandShape, index: number, thumb: number, rest: number): void => {
  s.index = index;
  s.thumb = thumb;
  s.rest = rest;
};
/** A pinch that is open (0) or closed (1): the hand is always a little curled, like a relaxed one. */
const pinchShape = (s: HandShape, closed: number): void => set(s, 0.15 + (PINCH_SHAPE.index - 0.15) * closed, 0.12 + (PINCH_SHAPE.thumb - 0.12) * closed, PINCH_SHAPE.rest);

/** Writes the sample of second `t` of the demonstration of `gesture`. `t` outside the script gives a hidden hand. */
export function sampleScript(variant: Variant, gesture: Gesture, t: number, targets: Targets, out: Sample): Sample {
  const length = GESTURE_SECONDS[gesture];
  out.alpha = t < 0 || t >= length ? 0 : fade(t, length);
  out.carrying = false;
  out.pulseFrom = 0;
  out.pulseTo = 0;
  out.beam = false;
  if (out.alpha <= 0) return out;
  facing(_fwd, targets.head, targets.from);
  return variant === 'hands' ? reach(gesture, t, targets, out) : pointer(variant, gesture, t, targets, out);
}

/** The hand goes to the target. */
function reach(gesture: Gesture, t: number, targets: Targets, out: Sample): Sample {
  const { from, to } = targets;
  _back.copy(_fwd).negate(); // from the target towards the player
  switch (gesture) {
    case 'poke': {
      // Hover short of the target, touch it twice, hold, lift away. The index finger points; the others are curled.
      out.anchor = 'point';
      set(out.shape, 0, 0.5, 1);
      aim(out.quat, _fwd, 0.5, 0);
      const press = Math.max(smooth(1 - Math.abs(t - 1.55) / 0.2), smooth(1 - Math.abs(t - 2.2) / 0.2)); // two touches
      const arrive = ramp(t, 0.4, 1.3);
      const leave = ramp(t, 2.7, 3.4);
      out.hand.copy(from).addScaledVector(_back, 0.1 * (1 - arrive) + 0.03 * (1 - press) + 0.1 * leave).addScaledVector(UP, 0.07 * (1 - arrive) + 0.03 * (1 - press) + 0.06 * leave);
      out.pulseFrom = breathe(t, ramp(t, 0.9, 1.3) * (1 - ramp(t, 2.7, 3.2)));
      return out;
    }
    case 'carry': {
      out.anchor = 'pinch';
      aim(out.quat, _fwd, 0.45, 0);
      const closed = ramp(t, 1.4, 1.8) * (1 - ramp(t, 3.7, 4.1));
      pinchShape(out.shape, closed);
      const arrive = ramp(t, 0.5, 1.4);
      const carry = ramp(t, 1.8, 3.4);
      const leave = ramp(t, 4.1, 5.1);
      // From behind and above the part to the part, along an arc to the socket, then away again.
      _b.lerpVectors(from, to, carry).addScaledVector(UP, 0.04 * Math.sin(Math.PI * carry));
      out.hand.copy(_b).addScaledVector(_back, 0.11 * (1 - arrive) + 0.1 * leave).addScaledVector(UP, 0.08 * (1 - arrive) + 0.08 * leave);
      out.carrying = t >= 1.7 && t < 3.9;
      out.carried.copy(_b);
      out.pulseFrom = breathe(t, ramp(t, 0.8, 1.2) * (1 - ramp(t, 1.8, 2.0)));
      out.pulseTo = breathe(t, ramp(t, 1.9, 2.6) * (1 - ramp(t, 4.2, 4.9)));
      return out;
    }
    case 'twist': {
      // Pinch the key, turn the wrist a full turn about its axis, let go.
      out.anchor = 'pinch';
      aim(_base, _fwd, 0.45, 0);
      pinchShape(out.shape, ramp(t, 1.3, 1.6) * (1 - ramp(t, 3.6, 4.0)));
      const arrive = ramp(t, 0.5, 1.3);
      const leave = ramp(t, 4.0, 4.9);
      out.hand.copy(from).addScaledVector(_back, 0.11 * (1 - arrive) + 0.1 * leave).addScaledVector(UP, 0.08 * (1 - arrive) + 0.08 * leave);
      _spin.setFromAxisAngle(targets.axis, 2 * Math.PI * ramp(t, 1.7, 3.5));
      out.quat.copy(_spin).multiply(_base);
      out.pulseFrom = breathe(t, ramp(t, 0.8, 1.2) * (1 - ramp(t, 3.8, 4.4)));
      return out;
    }
    case 'palm': {
      // A flat hand, palm down, comes to rest a hand's breadth over the machine, holds, and goes.
      out.anchor = 'palm';
      set(out.shape, 0, 0, 0);
      aim(out.quat, _fwd, 0, 0);
      const arrive = ramp(t, 0.2, 1.4);
      const leave = ramp(t, 3.2, 4.0);
      out.hand.copy(from).addScaledVector(UP, 0.12 + 0.12 * (1 - arrive) + 0.1 * leave + 0.004 * Math.sin(t * 5)).addScaledVector(_back, 0.02);
      out.pulseFrom = breathe(t, ramp(t, 1.2, 1.7) * (1 - ramp(t, 3.2, 3.8)));
      return out;
    }
  }
}

/** The hand stays by the lap and pinches; the target is lit, or a ray runs to it. */
function pointer(variant: Variant, gesture: Gesture, t: number, targets: Targets, out: Sample): Sample {
  const { from, to } = targets;
  out.anchor = 'pinch';
  aim(out.quat, _fwd, 0.5, 0);
  restPoint(out.hand, targets.head, _fwd);
  // The ray starts straight ahead of the hand and swings onto the target.
  const aimed = ramp(t, 0.5, 1.3);
  _a.copy(out.hand).addScaledVector(_fwd, 0.5);
  out.focus.lerpVectors(_a, from, aimed);
  out.beam = variant === 'ray' && t > 0.4;
  switch (gesture) {
    case 'carry': {
      const carry = ramp(t, 1.8, 3.4);
      pinchShape(out.shape, ramp(t, 1.4, 1.7) * (1 - ramp(t, 3.7, 4.1)));
      _b.lerpVectors(from, to, carry).addScaledVector(UP, 0.04 * Math.sin(Math.PI * carry));
      if (carry > 0) out.focus.copy(_b);
      out.carrying = t >= 1.7 && t < 3.9;
      out.carried.copy(_b);
      out.pulseFrom = breathe(t, ramp(t, 0.6, 1.0) * (1 - ramp(t, 1.8, 2.0)));
      out.pulseTo = breathe(t, ramp(t, 1.9, 2.6) * (1 - ramp(t, 4.2, 4.9)));
      return out;
    }
    case 'twist': {
      // A tap winds one unit in these modes (no wrist turn is asked for): three taps.
      const tap = Math.max(smooth(1 - Math.abs(t - 1.55) / 0.25), smooth(1 - Math.abs(t - 2.3) / 0.25), smooth(1 - Math.abs(t - 3.05) / 0.25));
      pinchShape(out.shape, tap);
      out.pulseFrom = breathe(t, ramp(t, 0.6, 1.0) * (1 - ramp(t, 3.6, 4.3)));
      return out;
    }
    default: {
      // poke and palm: look at it (or point the ray at it) and pinch twice.
      const tap = Math.max(smooth(1 - Math.abs(t - 1.55) / 0.25), smooth(1 - Math.abs(t - 2.25) / 0.25));
      pinchShape(out.shape, tap);
      out.pulseFrom = breathe(t, ramp(t, 0.6, 1.0) * (1 - ramp(t, 2.8, 3.3)));
      return out;
    }
  }
}
