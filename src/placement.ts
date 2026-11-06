/**
 * PRODUCT_SPEC §3.2 fallback "velvet stand": ~55 cm ahead of the player and ~38 cm below their eyes, which is about 35°
 * below head-forward (INTERACTION_SPEC §3). Both are measured from the eyes, never from the floor.
 * These two numbers are the tuning knob once a Quest tester reports on comfort.
 */
export const STAND_AHEAD_M = 0.55;
export const STAND_BELOW_EYE_M = 0.38;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface StandPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about +Y (radians) that turns the stand's local +Z (its front) towards the player. */
  yaw: number;
}

/**
 * Where the fallback stand goes for a given head position and gaze direction (both world space).
 * Only the horizontal part of the gaze matters; looking straight down keeps the stand ahead along -Z.
 * Pure maths, no engine types, so it is unit-tested without WebGL.
 */
export function standPose(head: Vec3Like, forward: Vec3Like): StandPose {
  const len = Math.hypot(forward.x, forward.z);
  const fx = len > 1e-4 ? forward.x / len : 0;
  const fz = len > 1e-4 ? forward.z / len : -1;
  return {
    x: head.x + fx * STAND_AHEAD_M,
    y: head.y - STAND_BELOW_EYE_M,
    z: head.z + fz * STAND_AHEAD_M,
    yaw: Math.atan2(-fx, -fz),
  };
}
