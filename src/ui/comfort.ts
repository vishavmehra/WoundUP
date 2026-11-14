import { REACH_MAX_M } from '../placement.js';

/** Comfort checks of INTERACTION_SPEC §3 and TOCKTON_DIMENSIONS §1: pure geometry, in stage-local metres (+Y up, +Z towards the player). */
export interface V3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const CHEST_BELOW_EYE_M = 0.3;
export const CHEST_BEHIND_EYE_M = 0.05;
export const COMFORT_REACH_M = REACH_MAX_M;
export const COMFORT_ANGLE_DEG = 35;

/** Eyes `below` metres above the surface and `ahead` metres in front of the town centre (the stage origin), facing it. */
export const eyeAt = (below: number, ahead: number): V3 => ({ x: 0, y: below, z: ahead });

/** Angle in degrees between the line of sight (eyes to the stage origin) and the line from the eyes to `target`. */
export function targetAngleDeg(eye: V3, target: V3): number {
  const ax = -eye.x;
  const ay = -eye.y;
  const az = -eye.z;
  const tx = target.x - eye.x;
  const ty = target.y - eye.y;
  const tz = target.z - eye.z;
  const dot = ax * tx + ay * ty + az * tz;
  const cos = dot / (Math.hypot(ax, ay, az) * Math.hypot(tx, ty, tz));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Distance from the chest point (30 cm below and 5 cm behind the eyes) to `target`. */
export function reachFromChest(eye: V3, target: V3): number {
  return Math.hypot(target.x - eye.x, target.y - (eye.y - CHEST_BELOW_EYE_M), target.z - (eye.z + CHEST_BEHIND_EYE_M));
}
