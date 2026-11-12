import { describe, expect, it } from 'vitest';
import { COMFORT_ANGLE_DEG, COMFORT_REACH_M, eyeAt, reachFromChest, targetAngleDeg } from '../../src/ui/comfort';
import { BENCH, GIFT_SPOT, PAUSE_SPOT, benchZ, essentialAnchors } from '../../src/ui/layout';

/** Eyes over the stand (55 cm ahead, 38 cm above) and the spread a real table gives (INTERACTION_SPEC §3). */
const EYES = [eyeAt(0.38, 0.55), eyeAt(0.3, 0.45), eyeAt(0.3, 0.6), eyeAt(0.45, 0.45), eyeAt(0.45, 0.6)];
const SCALES = [0.75, 0.875, 1];

describe('comfort geometry', () => {
  it('measures the angle from the line of sight and the reach from the chest', () => {
    const eye = eyeAt(0.4, 0.5);
    expect(targetAngleDeg(eye, { x: 0, y: 0, z: 0 })).toBeCloseTo(0, 6);
    expect(targetAngleDeg(eye, { x: 0.5, y: 0.4, z: 0.5 })).toBeCloseTo(90 - 0, 0); // straight right of the eyes, at the same height and distance
    expect(reachFromChest(eye, { x: 0, y: 0.1, z: 0.55 })).toBeCloseTo(0, 6);
  });
});

describe('flow UI layout against INTERACTION_SPEC §3', () => {
  for (const scale of SCALES) {
    for (const eye of EYES) {
      it(`keeps every essential target within ${COMFORT_ANGLE_DEG} degrees and ${COMFORT_REACH_M * 100} cm (town scale ${scale}, eyes ${eye.y}/${eye.z})`, () => {
        for (const [name, at] of Object.entries(essentialAnchors(scale))) {
          expect(targetAngleDeg(eye, at), `${name} angle`).toBeLessThanOrEqual(COMFORT_ANGLE_DEG);
          expect(reachFromChest(eye, at), `${name} reach`).toBeLessThanOrEqual(COMFORT_REACH_M);
        }
      });
    }
  }

  it('keeps the pause and gift buttons reachable', () => {
    const eye = eyeAt(0.38, 0.55);
    for (const spot of [PAUSE_SPOT, GIFT_SPOT]) {
      expect(targetAngleDeg(eye, spot)).toBeLessThanOrEqual(COMFORT_ANGLE_DEG + 10); // not essential to the task, but never out of sight
      expect(reachFromChest(eye, spot)).toBeLessThanOrEqual(COMFORT_REACH_M);
    }
  });

  it('puts the bench against the town front edge and its zones in the order tray, build, blueprint', () => {
    expect(benchZ(1)).toBeCloseTo(0.275, 6);
    expect(benchZ(0.75)).toBeLessThan(benchZ(1));
    expect(BENCH.tray.x).toBeLessThan(BENCH.build.x);
    expect(BENCH.build.x).toBeLessThan(BENCH.blueprint.x);
    // The run sign stands between the build and blueprint zones and in front, so it hides neither.
    expect(BENCH.runSign.x).toBeGreaterThan(BENCH.build.x);
    expect(BENCH.runSign.x).toBeLessThan(BENCH.blueprint.x);
    expect(BENCH.runSign.z).toBeGreaterThan(0);
  });
});
