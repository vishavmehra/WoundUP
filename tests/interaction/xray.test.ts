import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  backOfHandUp,
  hoversAbove,
  PALM_OFFSET_M,
  palmFacesDown,
  XRAY_HOLD_S,
  XRAY_RELEASE_GRACE_S,
  XRayDwell,
} from '../../src/interaction/xray';

const deg = (d: number): number => (d * Math.PI) / 180;
const rot = (axis: [number, number, number], angle: number): Quaternion =>
  new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), angle);

describe('palm facing down (WebXR joint convention: +Y out of the back of the hand)', () => {
  it('the back of the hand up is a palm facing down', () => {
    expect(backOfHandUp(new Quaternion())).toBeCloseTo(1);
    expect(palmFacesDown(new Quaternion())).toBe(true);
  });

  it('agrees with rotating the axis directly', () => {
    const q = rot([1, 0, 1], 0.9);
    expect(backOfHandUp(q)).toBeCloseTo(new Vector3(0, 1, 0).applyQuaternion(q).y, 9);
  });

  it('tolerates a tilt under 35 degrees and rejects more', () => {
    expect(palmFacesDown(rot([1, 0, 0], deg(30)))).toBe(true);
    expect(palmFacesDown(rot([0, 0, 1], deg(-30)))).toBe(true);
    expect(palmFacesDown(rot([1, 0, 0], deg(40)))).toBe(false);
  });

  it('rejects a palm facing up or sideways', () => {
    expect(palmFacesDown(rot([1, 0, 0], Math.PI))).toBe(false);
    expect(palmFacesDown(rot([0, 0, 1], Math.PI / 2))).toBe(false);
  });

  it('turning about the vertical axis does not matter', () => {
    expect(palmFacesDown(rot([0, 1, 0], deg(120)))).toBe(true);
  });

  it('puts the palm centre a hand-length along the fingers', () => {
    const palm = new Vector3(0, 0, -PALM_OFFSET_M).applyQuaternion(rot([0, 1, 0], Math.PI / 2));
    expect(palm.x).toBeCloseTo(-PALM_OFFSET_M);
  });
});

describe('hoversAbove (5-20 cm above the machine)', () => {
  const top = 0.1;
  const radius = 0.15;
  it('accepts 5 to 20 cm above the top and inside the reach', () => {
    expect(hoversAbove(0, top + 0.05, 0, top, radius)).toBe(true);
    expect(hoversAbove(0.05, top + 0.12, -0.05, top, radius)).toBe(true);
    expect(hoversAbove(0, top + 0.19, 0, top, radius)).toBe(true);
  });

  it('rejects too low, too high and too far to the side', () => {
    expect(hoversAbove(0, top + 0.04, 0, top, radius)).toBe(false);
    expect(hoversAbove(0, top + 0.21, 0, top, radius)).toBe(false);
    expect(hoversAbove(0.16, top + 0.1, 0, top, radius)).toBe(false);
    expect(hoversAbove(0, top - 0.1, 0, top, radius)).toBe(false); // below the machine
  });
});

describe('XRayDwell (hold about 0.4 s)', () => {
  it('switches on after the hold time and not before', () => {
    const d = new XRayDwell();
    expect(XRAY_HOLD_S).toBeCloseTo(0.4);
    for (let i = 0; i < 28; i++) expect(d.update(true, 1 / 72, false)).toBe(false); // 0.389 s
    expect(d.update(true, 1 / 72, false)).toBe(true); // 0.403 s
  });

  it('the hold must be continuous', () => {
    const d = new XRayDwell();
    for (let i = 0; i < 20; i++) d.update(true, 1 / 72, false);
    d.update(false, 1 / 72, false); // pose broken before it switched on
    for (let i = 0; i < 20; i++) expect(d.update(true, 1 / 72, false)).toBe(false);
  });

  it('stays on through a brief pose loss and ends after the grace period', () => {
    const d = new XRayDwell();
    d.update(true, 0.5, false);
    expect(d.active).toBe(true);
    expect(d.update(false, XRAY_RELEASE_GRACE_S * 0.5, false)).toBe(true);
    expect(d.update(true, 1 / 72, false)).toBe(true); // came back: grace restarts
    expect(d.update(false, XRAY_RELEASE_GRACE_S * 0.6, false)).toBe(true);
    expect(d.update(false, XRAY_RELEASE_GRACE_S * 0.6, false)).toBe(false);
  });

  it('after it ends the hold starts over', () => {
    const d = new XRayDwell();
    d.update(true, 0.5, false);
    d.update(false, 1, false);
    expect(d.update(true, 0.2, false)).toBe(false);
  });

  it('an active grab blocks X-ray and switches it off at once', () => {
    const d = new XRayDwell();
    d.update(true, 0.5, false);
    expect(d.update(true, 1 / 72, true)).toBe(false);
    expect(d.active).toBe(false);
    // Grab ends while the palm is still over the machine: it must dwell again.
    expect(d.update(true, 0.2, false)).toBe(false);
    expect(d.update(true, 0.25, false)).toBe(true);
  });
});
