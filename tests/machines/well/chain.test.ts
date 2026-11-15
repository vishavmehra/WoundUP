import { describe, expect, it } from 'vitest';
import { WELL, WELL_BELT_RADIUS_M } from '../../../src/content/blueprints';
import { chainGeometry, chainOutward, chainPoint, distanceToChain } from '../../../src/machines/well/chain';
import type { ChainPoint } from '../../../src/machines/well/chain';
import { BUCKET_COUNT, bucketTip, DROPLET_GRAVITY, JET_PEAK_M, jetFlightSeconds, jetHeight, jetSpeed } from '../../../src/machines/well/water';

const at = (id: string): readonly [number, number] => {
  const p = WELL.sockets.find((s) => s.id === id)!.position!;
  return [p[0], p[1]];
};
const g = chainGeometry(at('pulley_drive'), at('pulley_idle'), WELL_BELT_RADIUS_M);

describe('the Well bucket chain (WELL_FOUNTAIN_BLUEPRINT §6.3)', () => {
  it('runs round the two pulleys: 12.23 cm between their axles and a loop of 31.9 cm, ten buckets about 3.2 cm apart', () => {
    expect(g.span).toBeCloseTo(0.1223, 4);
    expect(g.length).toBeCloseTo(2 * g.span + 2 * Math.PI * 0.0118, 12);
    expect(g.length).toBeCloseTo(0.319, 3);
    expect(g.length / BUCKET_COUNT).toBeCloseTo(0.0319, 4);
  });

  it('is one closed loop: a lap later is the same point, and the way it goes changes smoothly', () => {
    const a: ChainPoint = { x: 0, y: 0, heading: 0 };
    const b: ChainPoint = { x: 0, y: 0, heading: 0 };
    chainPoint(g, 0.0123, a);
    chainPoint(g, 0.0123 + g.length, b);
    expect(b.x).toBeCloseTo(a.x, 12);
    expect(b.y).toBeCloseTo(a.y, 12);
    chainPoint(g, -0.01, a); // before the start wraps round
    chainPoint(g, g.length - 0.01, b);
    expect(b.x).toBeCloseTo(a.x, 12);
    const step = 0.0002;
    let previous = chainPoint(g, 0, { x: 0, y: 0, heading: 0 });
    for (let s = step; s <= g.length + 1e-9; s += step) {
      const now = chainPoint(g, s, { x: 0, y: 0, heading: 0 });
      expect(Math.hypot(now.x - previous.x, now.y - previous.y)).toBeLessThan(step * 1.0001); // it never jumps
      let turn = Math.abs(now.heading - previous.heading);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      expect(turn, `heading at ${s.toFixed(4)}`).toBeLessThan(0.05); // 0.2 mm of a 11.8 mm radius is 1 degree
      previous = now;
    }
  });

  it('goes up the left strand, over the top of the idle pulley heading right, and down the right strand: the way the clockwise pulleys carry it', () => {
    const p: ChainPoint = { x: 0, y: 0, heading: 0 };
    chainPoint(g, g.span / 2, p); // middle of the left strand
    expect(Math.sin(p.heading)).toBeGreaterThan(0.9); // heading up
    expect(p.x).toBeLessThan((g.drive[0] + g.idle[0]) / 2); // left of the axles' line
    chainPoint(g, g.topAt, p);
    expect(p.y).toBeCloseTo(g.idle[1] + g.radius, 9); // the very top of the idle pulley
    expect(p.x).toBeCloseTo(g.idle[0], 9);
    expect(Math.abs(p.heading)).toBeLessThan(1e-9); // heading +X: the top of a clockwise wheel moves to the right
    chainPoint(g, g.span + Math.PI * g.radius + g.span / 2, p); // middle of the right strand
    expect(Math.sin(p.heading)).toBeLessThan(-0.9); // heading down
    expect(p.x).toBeGreaterThan((g.drive[0] + g.idle[0]) / 2);
  });

  it('has an outward normal that points away from the loop, and the bucket of the template hangs about 1.4 mm outside its line', () => {
    const p: ChainPoint = { x: 0, y: 0, heading: 0 };
    chainPoint(g, g.span + Math.PI * g.radius + 0.06, p); // on the right strand
    const out = chainOutward(p.heading);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 12);
    expect(out.x).toBeGreaterThan(0.9); // out of the loop is to the right there
    // `Bucket_Template` stands with its bottom centre at (15.9, 112) mm: 1.4 mm outside the right strand (gen_well.py)
    expect(distanceToChain(g, 0.0159, 0.112)).toBeCloseTo(0.0014, 4);
  });

  it('tips each bucket over the top of the idle pulley and nowhere else', () => {
    expect(bucketTip(g, g.topAt)).toBeCloseTo(0.9, 12); // the most, at the top
    expect(bucketTip(g, g.topAt + g.length)).toBeCloseTo(0.9, 12);
    expect(bucketTip(g, g.topAt + 0.014)).toBeLessThan(0.4);
    expect(bucketTip(g, g.topAt - 0.014)).toBeLessThan(0.4);
    expect(bucketTip(g, g.topAt + g.length / 2)).toBeLessThan(1e-9); // the far side of the loop is upright
    expect(bucketTip(g, 0)).toBeLessThan(1e-9); // and so is the bottom
  });
});

describe('the jet of the Well (§8.3)', () => {
  it('peaks 3.4 cm above the nozzle, is back at it after the flight time, and takes half a second at the machine\'s own gravity', () => {
    const vy = jetSpeed(JET_PEAK_M);
    expect(jetHeight(vy, vy / DROPLET_GRAVITY)).toBeCloseTo(JET_PEAK_M, 12);
    expect(jetHeight(vy, jetFlightSeconds(vy))).toBeCloseTo(0, 12);
    expect(jetFlightSeconds(vy)).toBeGreaterThan(0.4);
    expect(jetFlightSeconds(vy)).toBeLessThan(0.7);
  });
});
