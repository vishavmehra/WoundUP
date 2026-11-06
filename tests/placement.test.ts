import { describe, expect, it } from 'vitest';
import { STAND_AHEAD_M, standPose } from '../src/placement';

describe('standPose (PRODUCT_SPEC §3.2 fallback stand)', () => {
  it('sits 55 cm ahead and 38 cm below the eyes when looking down -Z', () => {
    const p = standPose({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: -1 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1.2 - 0.38);
    expect(p.z).toBeCloseTo(-0.55);
    expect(Math.cos(p.yaw)).toBeCloseTo(1); // front (+Z) already faces the player
  });

  it('stays inside the 35° comfort cone of INTERACTION_SPEC §3', () => {
    const p = standPose({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: -1 });
    const degreesBelowForward = (Math.atan2(1.2 - p.y, -p.z) * 180) / Math.PI;
    expect(degreesBelowForward).toBeLessThanOrEqual(35);
  });

  it('is measured from the eyes, so every eye height gets the same view', () => {
    for (const eyeY of [0.9, 1.05, 1.2, 1.45, 1.8]) {
      const p = standPose({ x: 0, y: eyeY, z: 0 }, { x: 0, y: 0, z: -1 });
      expect(eyeY - p.y).toBeCloseTo(0.38);
      expect(p.z).toBeCloseTo(-0.55);
    }
  });

  it('works when the reference space has no floor and the eyes sit at the origin', () => {
    const p = standPose({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    expect(p.y).toBeCloseTo(-0.38);
  });

  it('follows the head position and yaw, ignoring pitch', () => {
    // standing at (1, 1.4, 2) and looking along +X, tilted 30° downwards
    const p = standPose({ x: 1, y: 1.4, z: 2 }, { x: Math.cos(0.52), y: -Math.sin(0.52), z: 0 });
    expect(p.x).toBeCloseTo(1 + STAND_AHEAD_M);
    expect(p.z).toBeCloseTo(2);
    // local +Z rotated by yaw must point back at the player (-X)
    expect(Math.sin(p.yaw)).toBeCloseTo(-1);
    expect(Math.cos(p.yaw)).toBeCloseTo(0);
  });

  it('keeps the stand ahead along -Z when looking straight down', () => {
    const p = standPose({ x: 0, y: 1.3, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(p.z).toBeCloseTo(-STAND_AHEAD_M);
    expect(Number.isFinite(p.yaw)).toBe(true);
  });
});
