import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GESTURE_SECONDS } from '../../src/onboarding/lessons';
import type { Gesture } from '../../src/onboarding/lessons';
import { makeSample, sampleScript } from '../../src/onboarding/scripts';
import type { Sample, Targets, Variant } from '../../src/onboarding/scripts';

/** The demonstrations as functions of time (PRODUCT_SPEC F15, §15): what the hand does at which second. */

const targets = (): Targets => ({
  from: new Vector3(-0.1, 1.0, -0.4),
  to: new Vector3(0.05, 1.03, -0.45),
  axis: new Vector3(0, 0, 1).normalize(),
  head: new Vector3(0, 1.44, 0),
});
const at = (variant: Variant, gesture: Gesture, t: number, tg = targets()): Sample => sampleScript(variant, gesture, t, tg, makeSample());
const GESTURES: Gesture[] = ['poke', 'carry', 'twist', 'palm'];
const VARIANTS: Variant[] = ['hands', 'gaze', 'ray'];
const close = (a: Vector3, b: Vector3, metres: number): boolean => a.distanceTo(b) <= metres;

describe('every script', () => {
  it.each(GESTURES.flatMap((g) => VARIANTS.map((v) => [v, g] as const)))('%s %s: starts and ends with no hand, shows it in between, and is finite throughout', (variant, gesture) => {
    const length = GESTURE_SECONDS[gesture];
    expect(at(variant, gesture, 0).alpha).toBe(0);
    expect(at(variant, gesture, length).alpha).toBe(0);
    expect(at(variant, gesture, -1).alpha).toBe(0);
    expect(at(variant, gesture, length + 5).alpha).toBe(0);
    expect(at(variant, gesture, length / 2).alpha).toBe(1);
    const sample = makeSample();
    for (let t = 0; t < length; t += 0.05) {
      sampleScript(variant, gesture, t, targets(), sample);
      expect(sample.alpha).toBeGreaterThanOrEqual(0);
      expect(sample.alpha).toBeLessThanOrEqual(1);
      for (const v of [sample.hand, sample.carried, sample.focus]) expect(v.toArray().every(Number.isFinite)).toBe(true);
      expect(sample.quat.toArray().every(Number.isFinite)).toBe(true);
      expect(Math.abs(sample.quat.length() - 1)).toBeLessThan(1e-6);
      for (const s of [sample.shape.index, sample.shape.thumb, sample.shape.rest]) expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('never writes to the targets: the part, the socket and the head stay where the player left them', () => {
    const tg = targets();
    const before = [tg.from, tg.to, tg.axis, tg.head].map((v) => v.clone());
    for (const g of GESTURES) for (const v of VARIANTS) for (let t = 0; t < 5.2; t += 0.1) sampleScript(v, g, t, tg, makeSample());
    [tg.from, tg.to, tg.axis, tg.head].forEach((v, i) => expect(v.equals(before[i])).toBe(true));
  });
});

describe('hands: carry a part to its socket (pinch, move, release)', () => {
  it('opens, goes to the part, pinches it, carries it to the socket, releases and leaves', () => {
    const tg = targets();
    expect(at('hands', 'carry', 0.6).shape.index).toBeLessThan(0.3); // open on the way in
    const grip = at('hands', 'carry', 1.4);
    expect(close(grip.hand, tg.from, 0.002)).toBe(true); // the pinch point is on the part when the fingers close
    expect(grip.anchor).toBe('pinch');
    expect(at('hands', 'carry', 1.8).shape.index).toBeGreaterThan(0.95); // closed
    expect(at('hands', 'carry', 2.6).shape.index).toBeGreaterThan(0.95);
    const arrived = at('hands', 'carry', 3.5);
    expect(close(arrived.hand, tg.to, 0.002)).toBe(true); // at the socket while still pinching
    expect(arrived.shape.index).toBeGreaterThan(0.95);
    expect(at('hands', 'carry', 4.3).shape.index).toBeLessThan(0.3); // released
    expect(close(at('hands', 'carry', 4.3).hand, tg.to, 0.05)).toBe(true); // the open hand is still at the socket when it lets go
    expect(at('hands', 'carry', 4.9).hand.distanceTo(tg.to)).toBeGreaterThan(0.05); // then it lifts away
  });

  it('carries a ghost of the part with the pinch, from the part to the socket, and only while pinching', () => {
    const tg = targets();
    expect(at('hands', 'carry', 1.0).carrying).toBe(false);
    const start = at('hands', 'carry', 1.75);
    expect(start.carrying).toBe(true);
    expect(close(start.carried, tg.from, 0.003)).toBe(true);
    const mid = at('hands', 'carry', 2.6);
    expect(mid.carrying).toBe(true);
    expect(mid.carried.y).toBeGreaterThan(Math.max(tg.from.y, tg.to.y) + 0.01); // lifted over the table on the way
    expect(close(at('hands', 'carry', 3.5).carried, tg.to, 0.003)).toBe(true);
    expect(at('hands', 'carry', 4.5).carrying).toBe(false);
  });

  it('pulses the part before it is taken and the socket it goes to, from the moment it is lifted until it is released', () => {
    expect(at('hands', 'carry', 1.3).pulseFrom).toBeGreaterThan(0.4);
    expect(at('hands', 'carry', 1.3).pulseTo).toBe(0);
    expect(at('hands', 'carry', 3.0).pulseTo).toBeGreaterThan(0.4);
    expect(at('hands', 'carry', 3.0).pulseFrom).toBe(0);
    expect(at('hands', 'carry', 5.0).pulseTo).toBeLessThan(0.1);
  });
});

describe('hands: turn the key', () => {
  it('pinches the key and turns the wrist a full turn about the key\'s axis, with the pinch fixed on the key', () => {
    const tg = targets();
    const q0 = at('hands', 'twist', 1.65).quat;
    expect(close(at('hands', 'twist', 1.65).hand, tg.from, 0.002)).toBe(true);
    const half = at('hands', 'twist', 2.6);
    const full = at('hands', 'twist', 3.55);
    expect(close(half.hand, tg.from, 0.002)).toBe(true); // the hand turns about the pinch, it does not travel
    expect(q0.angleTo(half.quat)).toBeGreaterThan(Math.PI * 0.85);
    expect(q0.angleTo(full.quat)).toBeLessThan(0.25); // a whole turn is back where it began
    // The turn really is about the key's axis: undo it and the orientation matches the start.
    const undo = new Quaternion().setFromAxisAngle(tg.axis, -Math.PI);
    expect(undo.multiply(half.quat).angleTo(q0)).toBeLessThan(0.15);
    expect(at('hands', 'twist', 2.6).shape.index).toBeGreaterThan(0.95); // pinching throughout
  });

  it('lets go and lifts away at the end', () => {
    expect(at('hands', 'twist', 4.3).shape.index).toBeLessThan(0.3);
    expect(at('hands', 'twist', 4.8).hand.distanceTo(targets().from)).toBeGreaterThan(0.05);
  });
});

describe('hands: palm-down X-ray', () => {
  it('holds a flat, open hand palm down 5 to 20 cm above the machine, long enough to count (0.4 s)', () => {
    const tg = targets();
    const palmDown = new Vector3(0, -1, 0);
    let held = 0;
    const sample = makeSample();
    for (let t = 0; t < GESTURE_SECONDS.palm; t += 0.02) {
      sampleScript('hands', 'palm', t, tg, sample);
      const height = sample.hand.y - tg.from.y;
      if (height >= 0.05 && height <= 0.2 && sample.alpha > 0.9) {
        held += 0.02;
        expect(Math.hypot(sample.hand.x - tg.from.x, sample.hand.z - tg.from.z)).toBeLessThan(0.05); // over it, not beside it
        expect(palmDown.clone().applyQuaternion(sample.quat).y).toBeLessThan(-0.99); // the palm faces the table
        expect(sample.shape).toEqual({ index: 0, thumb: 0, rest: 0 }); // open, not pinching
        expect(sample.anchor).toBe('palm');
      }
    }
    expect(held).toBeGreaterThan(1.2);
  });
});

describe('hands: poke (the latch, the letter, the parcel, Run)', () => {
  it('points with the index finger, touches the target twice and lifts away', () => {
    const tg = targets();
    expect(at('hands', 'poke', 1.55).anchor).toBe('point');
    expect(close(at('hands', 'poke', 1.55).hand, tg.from, 0.003)).toBe(true);
    expect(close(at('hands', 'poke', 2.2).hand, tg.from, 0.003)).toBe(true);
    expect(at('hands', 'poke', 1.9).hand.distanceTo(tg.from)).toBeGreaterThan(0.015); // between the two touches the finger backs off
    expect(at('hands', 'poke', 3.3).hand.distanceTo(tg.from)).toBeGreaterThan(0.06);
    expect(at('hands', 'poke', 1.55).shape.rest).toBe(1); // the other fingers are curled
    expect(at('hands', 'poke', 1.5).pulseFrom).toBeGreaterThan(0.4);
  });
});

describe('gaze and ray: the player does not reach', () => {
  it.each(['gaze', 'ray'] as const)('%s: the hand stays by the lap, away from the table, whatever the gesture', (variant) => {
    const tg = targets();
    for (const gesture of GESTURES) {
      const rest = at(variant, gesture, 0.7, tg).hand.clone();
      for (let t = 0.6; t < GESTURE_SECONDS[gesture] - 1; t += 0.2) {
        const s = at(variant, gesture, t, tg);
        expect(close(s.hand, rest, 1e-9), `${gesture} t=${t}`).toBe(true);
        expect(s.hand.distanceTo(tg.from)).toBeGreaterThan(0.15); // a hand's length from the thing it is about, not on it
        expect(s.hand.y).toBeLessThan(tg.head.y - 0.2);
      }
    }
  });

  it('lights the target (gaze) and pinches: two taps for a poke, three for the key, one held pinch for a carry', () => {
    const closedAt = (gesture: Gesture, ts: number[]): boolean[] => ts.map((t) => at('gaze', gesture, t).shape.index > 0.9);
    expect(closedAt('poke', [1.55, 1.9, 2.25])).toEqual([true, false, true]);
    expect(closedAt('twist', [1.55, 1.9, 2.3, 2.7, 3.05])).toEqual([true, false, true, false, true]);
    expect(closedAt('carry', [1.8, 2.5, 3.5, 4.3])).toEqual([true, true, true, false]);
    expect(at('gaze', 'poke', 1.2).pulseFrom).toBeGreaterThan(0.4);
    expect(at('gaze', 'poke', 1.2).beam).toBe(false);
  });

  it('ray: a beam runs from the hand and lands on the target', () => {
    const tg = targets();
    expect(at('ray', 'poke', 1.5).beam).toBe(true);
    expect(close(at('ray', 'poke', 1.5).focus, tg.from, 0.001)).toBe(true);
    expect(at('ray', 'poke', 0.1).beam).toBe(false); // nothing before the hand is there
    expect(at('gaze', 'poke', 1.5).beam).toBe(false);
  });

  it('carry: the ghost part travels from the part to the socket by itself, the focus with it', () => {
    const tg = targets();
    expect(close(at('ray', 'carry', 1.75).carried, tg.from, 0.003)).toBe(true);
    expect(close(at('ray', 'carry', 3.5).carried, tg.to, 0.003)).toBe(true);
    expect(close(at('ray', 'carry', 2.6).focus, at('ray', 'carry', 2.6).carried, 1e-9)).toBe(true);
    expect(at('gaze', 'carry', 3.0).pulseTo).toBeGreaterThan(0.4);
  });
});

describe('the head directly over the target (no horizontal direction to face)', () => {
  it('still gives a finite, unit orientation', () => {
    const tg = targets();
    tg.head.set(tg.from.x, 1.6, tg.from.z);
    for (const v of VARIANTS) for (const g of GESTURES) {
      const s = at(v, g, 2.0, tg);
      expect(Math.abs(s.quat.length() - 1)).toBeLessThan(1e-6);
      expect(s.hand.toArray().every(Number.isFinite)).toBe(true);
    }
  });
});
