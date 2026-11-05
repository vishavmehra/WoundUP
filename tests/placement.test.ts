import { describe, expect, it } from 'vitest';
import { STAND_AHEAD_M, STAND_BELOW_EYE_M, standPose } from '../src/placement';

describe('standPose (PRODUCT_SPEC §3.2 fallback stand)', () => {
  it('sits 55 cm ahead and 45 cm below the eyes when looking down -Z', () => {
    const p = standPose({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: -1 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1.2 - STAND_BELOW_EYE_M);
    expect(p.z).toBeCloseTo(-STAND_AHEAD_M);
    expect(Math.cos(p.yaw)).toBeCloseTo(1); // front (+Z) already faces the player
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
