import { describe, expect, it } from 'vitest';
import { footprintFitsOutline, segmentTouchesBox, type Footprint, type Point2 } from '../../src/table/geometry';

const FOOT: Footprint = { xMin: -0.3, xMax: 0.3, zMin: -0.2, zMax: 0.2 }; // 60 x 40 cm

const rect = (cx: number, cz: number, w: number, d: number): Point2[] => [
  { x: cx - w / 2, z: cz - d / 2 },
  { x: cx + w / 2, z: cz - d / 2 },
  { x: cx + w / 2, z: cz + d / 2 },
  { x: cx - w / 2, z: cz + d / 2 },
];

describe('segmentTouchesBox', () => {
  const box = [-1, 1, -1, 1] as const;
  it('detects segments inside, crossing and ending in the box', () => {
    expect(segmentTouchesBox(-0.5, 0, 0.5, 0, ...box)).toBe(true); // inside
    expect(segmentTouchesBox(-2, 0, 2, 0, ...box)).toBe(true); // straight through
    expect(segmentTouchesBox(0, 0, 5, 5, ...box)).toBe(true); // starts inside
    expect(segmentTouchesBox(-2, 1.5, 1.5, -2, ...box)).toBe(true); // clips a corner
  });
  it('rejects segments that miss the box', () => {
    expect(segmentTouchesBox(-2, 2, 2, 2, ...box)).toBe(false); // parallel, outside
    expect(segmentTouchesBox(2, -5, 2, 5, ...box)).toBe(false); // vertical, outside
    expect(segmentTouchesBox(-3, 1.2, -1.2, 3, ...box)).toBe(false); // diagonal past the corner
    expect(segmentTouchesBox(1.5, 1.5, 3, 3, ...box)).toBe(false);
  });
  it('treats a zero-length segment as a point', () => {
    expect(segmentTouchesBox(0.2, 0.2, 0.2, 0.2, ...box)).toBe(true);
    expect(segmentTouchesBox(4, 4, 4, 4, ...box)).toBe(false);
  });
});

describe('footprintFitsOutline', () => {
  it('accepts a footprint well inside a rectangle and rejects one that sticks out', () => {
    expect(footprintFitsOutline(rect(0, 0, 1, 1), 0, 0, 0, 1, FOOT)).toBe(true);
    expect(footprintFitsOutline(rect(0, 0, 1, 1), 0.5, 0, 0, 1, FOOT)).toBe(false); // 20 cm over the +X edge
    expect(footprintFitsOutline(rect(0, 0, 1, 1), 0, 10, 0, 1, FOOT)).toBe(false); // nowhere near it
  });

  it('accepts a surface exactly as big as the footprint, from either winding direction', () => {
    const exact = rect(0, 0, 0.6, 0.4);
    expect(footprintFitsOutline(exact, 0, 0, 0, 1, FOOT)).toBe(true);
    expect(footprintFitsOutline([...exact].reverse(), 0, 0, 0, 1, FOOT)).toBe(true);
    expect(footprintFitsOutline(exact, 0.001, 0, 0, 1, FOOT)).toBe(false); // 1 mm off is over the edge
  });

  it('scales the footprint about the stage origin', () => {
    const small = rect(0, 0, 0.45, 0.3);
    expect(footprintFitsOutline(small, 0, 0, 0, 1, FOOT)).toBe(false);
    expect(footprintFitsOutline(small, 0, 0, 0, 0.75, FOOT)).toBe(true);
    expect(footprintFitsOutline(small, 0, 0, 0, 0.76, FOOT)).toBe(false);
  });

  it('turns the footprint by yaw: local +Z goes to (sin yaw, cos yaw)', () => {
    const wideInX = rect(0, 0, 0.6, 0.4);
    expect(footprintFitsOutline(wideInX, 0, 0, Math.PI / 2, 1, FOOT)).toBe(false); // now 40 wide, 60 deep
    expect(footprintFitsOutline(rect(0, 0, 0.4, 0.6), 0, 0, Math.PI / 2, 1, FOOT)).toBe(true);
    expect(footprintFitsOutline(wideInX, 0, 0, Math.PI, 1, FOOT)).toBe(true); // half a turn leaves the box in place
  });

  it('respects an off-centre footprint such as town plus workbench', () => {
    const stage: Footprint = { xMin: -0.3, xMax: 0.3, zMin: -0.15, zMax: 0.4 };
    expect(footprintFitsOutline(rect(0, 0.125, 0.6, 0.55), 0, 0, 0, 1, stage)).toBe(true);
    expect(footprintFitsOutline(rect(0, 0, 0.6, 0.4), 0, 0, 0, 1, stage)).toBe(false);
  });

  it('uses the outline, not its bounding box: an L-shaped surface that is too thin is rejected', () => {
    // Arms are 25 cm thick, the footprint's short side is 30 cm at best 22.5 cm at 75%; its long side cannot fit either.
    const thinL: Point2[] = [
      { x: -0.45, z: -0.5 },
      { x: -0.2, z: -0.5 },
      { x: -0.2, z: -0.1 },
      { x: 0.45, z: -0.1 },
      { x: 0.45, z: 0.15 },
      { x: -0.45, z: 0.15 },
    ];
    // Bounding box is 90 x 65 cm, which would hold the footprint many times over.
    expect(footprintFitsOutline(thinL, 0, 0, 0, 0.75, FOOT)).toBe(false);
    expect(footprintFitsOutline(thinL, -0.1, -0.1, 0, 0.75, FOOT)).toBe(false);
    // A hole or notch between the footprint and the polygon's far corner counts too.
    const notched: Point2[] = [
      { x: -0.5, z: -0.5 },
      { x: 0.5, z: -0.5 },
      { x: 0.5, z: 0.5 },
      { x: 0.05, z: 0.5 },
      { x: 0.05, z: -0.05 }, // a slit running into the middle of the surface
      { x: -0.05, z: -0.05 },
      { x: -0.05, z: 0.5 },
      { x: -0.5, z: 0.5 },
    ];
    expect(footprintFitsOutline(notched, 0, 0, 0, 0.75, FOOT)).toBe(false);
    expect(footprintFitsOutline(notched, 0, -0.3, 0, 0.75, FOOT)).toBe(true); // clear of the slit, on the solid part
  });

  it('needs at least three points', () => {
    expect(footprintFitsOutline([], 0, 0, 0, 1, FOOT)).toBe(false);
    expect(footprintFitsOutline(rect(0, 0, 1, 1).slice(0, 2), 0, 0, 0, 1, FOOT)).toBe(false);
  });
});
