import { describe, expect, it } from 'vitest';
import { COMFORT_ANGLE_DEG, COMFORT_REACH_M, eyeAt, reachFromChest, targetAngleDeg } from '../../src/ui/comfort';
import { BENCH, BUILD_ZONE, GIFT_SPOT, LENS_HINT_SPOT, LENS_SPOT, PANEL_SPOT, PAUSE_PANEL_BASE, PAUSE_PANEL_SCALE, PAUSE_PANEL_SPOT, PAUSE_SPOT, POKE_PRESS_M, benchZ, essentialAnchors } from '../../src/ui/layout';
import { PAUSE_PANELS, PAUSE_PLAQUES, placePanel } from './panel-geometry';

/** Eyes over the stand (55 cm ahead, 38 cm above) and the spread a real table gives (INTERACTION_SPEC ยง3). */
// The surface may be 20 to 60 cm below the eyes and its centre 40 to 60 cm ahead (placement.ts); it takes the candidate nearest the 55 cm aim
// point, so the extremes of both ranges are covered below except the nearest, lowest-eyed corner (under 50 cm ahead and 30 cm down),
// where a bench in front of the town cannot be within 35 degrees of the line of sight.
const EYES = [eyeAt(0.38, 0.55), eyeAt(0.3, 0.45), eyeAt(0.3, 0.6), eyeAt(0.45, 0.45), eyeAt(0.45, 0.6), eyeAt(0.2, 0.5), eyeAt(0.2, 0.6), eyeAt(0.6, 0.5), eyeAt(0.6, 0.6)];
const SCALES = [0.75, 0.875, 1];

describe('comfort geometry', () => {
  it('measures the angle from the line of sight and the reach from the chest', () => {
    const eye = eyeAt(0.4, 0.5);
    expect(targetAngleDeg(eye, { x: 0, y: 0, z: 0 })).toBeCloseTo(0, 6);
    expect(targetAngleDeg(eye, { x: 0.5, y: 0.4, z: 0.5 })).toBeCloseTo(90 - 0, 0); // straight right of the eyes, at the same height and distance
    expect(reachFromChest(eye, { x: 0, y: 0.1, z: 0.55 })).toBeCloseTo(0, 6);
  });
});

describe('flow UI layout against INTERACTION_SPEC ยง3', () => {
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

  it('keeps the lens and its hint reachable, beside the bench (on the side away from the parts tray) and clear of the town', () => {
    for (const eye of EYES) {
      expect(reachFromChest(eye, LENS_SPOT), `reach, eyes ${eye.y}/${eye.z}`).toBeLessThanOrEqual(COMFORT_REACH_M);
    }
    expect(targetAngleDeg(eyeAt(0.38, 0.55), LENS_SPOT)).toBeLessThanOrEqual(COMFORT_ANGLE_DEG + 10); // not essential: the palm gesture is the first way
    expect(LENS_SPOT.x).toBeGreaterThan(0.225 + 0.025); // the bench is 45 cm wide: the 5 cm medallion sits beside it, on the right, away from the parts tray (tests/ui/hot-zones.test.ts)
    expect(LENS_SPOT.z).toBeGreaterThan(0.15 + 0.025); // and in front of the town's front edge (z = +15 cm)
    expect(LENS_HINT_SPOT.x).toBe(LENS_SPOT.x);
    expect(LENS_HINT_SPOT.y).toBeGreaterThan(LENS_SPOT.y);
  });

  it('puts the bench against the town front edge and its zones in the order tray, build, blueprint', () => {
    expect(benchZ(1)).toBeCloseTo(0.275, 6);
    expect(benchZ(0.75)).toBeLessThan(benchZ(1));
    expect(BENCH.tray.x).toBeLessThan(BENCH.build.x);
    expect(BENCH.build.x).toBeLessThan(BENCH.blueprint.x);
    // The run sign stands at the back right of the bench, beyond the winding key that juts out of the Music Box's right wall (tests/ui/hot-zones.test.ts
    // keeps the key in view and clear of it): to the right of the build zone, behind its middle, over the blueprint's far edge.
    expect(BENCH.runSign.x).toBeGreaterThan(BENCH.build.x + BUILD_ZONE.halfX);
    expect(BENCH.runSign.x).toBeLessThan(0.225 + 0.025); // over the bench (it ends at x = +22.5 cm), not beyond it
    expect(BENCH.runSign.z).toBeLessThan(BENCH.build.z);
    expect(BENCH.runSign.z).toBeGreaterThan(-0.125); // and in front of the bench's back edge
  });
});

// The pause panel (five setting rows and Resume / Restart chapter) is the one panel taller than the space between the machine's lid and the table (38 cm at full
// size), so it has its own spot and size (layout.ts). Its centre is an essential anchor above; this holds every row to the reach, from every eye, not just the centre.
describe('the pause panel against INTERACTION_SPEC ง3 and UI_UX_SPEC ง23', () => {
  it('keeps every plaque, at its centre and at its four corners, within 60 cm of the chest from every eye, with five setting rows and with the Difficulty row (ADR-050)', () => {
    for (const panel of PAUSE_PANELS) {
      for (const eye of EYES) {
        for (const plaque of placePanel(eye, panel.plaques, panel.spot)) {
          for (const [i, point] of [plaque.centre, ...plaque.corners].entries()) {
            expect(reachFromChest(eye, point), `${panel.name}: ${plaque.name} ${i === 0 ? 'centre' : `corner ${i}`}, eyes ${eye.y}/${eye.z}`).toBeLessThanOrEqual(COMFORT_REACH_M);
          }
        }
      }
    }
  });

  it('shows the panel no larger in the view than the old one at its old distance (it must not fill the face), and no nearer than 28 cm', () => {
    const eye = eyeAt(0.38, 0.55);
    const viewDeg = (size: number, spot: { x: number; y: number; z: number }): number => (2 * Math.atan(size / 2 / Math.hypot(spot.x - eye.x, spot.y - eye.y, spot.z - eye.z)) * 180) / Math.PI;
    const old = { spot: { x: 0, y: PANEL_SPOT.y + 0.028, z: PANEL_SPOT.z }, height: PAUSE_PANEL_BASE.h, width: PAUSE_PANEL_BASE.w };
    expect(viewDeg(PAUSE_PANEL_BASE.h * PAUSE_PANEL_SCALE, PAUSE_PANEL_SPOT)).toBeLessThanOrEqual(viewDeg(old.height, old.spot) * 1.1);
    expect(viewDeg(PAUSE_PANEL_BASE.w * PAUSE_PANEL_SCALE, PAUSE_PANEL_SPOT)).toBeLessThanOrEqual(viewDeg(old.width, old.spot) * 1.1);
    expect(Math.hypot(PAUSE_PANEL_SPOT.x - eye.x, PAUSE_PANEL_SPOT.y - eye.y, PAUSE_PANEL_SPOT.z - eye.z)).toBeGreaterThanOrEqual(0.28);
  });

  it('keeps the plaques tall enough to press: a fingertip presses within 2 cm of a plaque, so none is shown shorter than that', () => {
    for (const plaque of PAUSE_PLAQUES) expect(plaque.h * PAUSE_PANEL_SCALE, plaque.name).toBeGreaterThanOrEqual(POKE_PRESS_M);
  });
});
