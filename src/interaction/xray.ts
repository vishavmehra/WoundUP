import type { Quaternion } from 'three';

/**
 * X-ray gesture maths (INTERACTION_SPEC §11; GAMEPLAY_SYSTEMS §15): open palm facing down, 5-20 cm above the machine,
 * held for about 0.4 s. Pure functions and a dwell timer, no IWSDK.
 */

/** Hold time before X-ray switches on, about 0.4 s (INTERACTION_SPEC §11). */
export const XRAY_HOLD_S = 0.4;
/** The pose may break for this long without ending X-ray, so one noisy tracking frame does not flicker it. Tuning value, not in the spec. */
export const XRAY_RELEASE_GRACE_S = 0.15;
/** The palm must be 5 to 20 cm above the machine (INTERACTION_SPEC §11). */
export const XRAY_MIN_ABOVE_M = 0.05;
export const XRAY_MAX_ABOVE_M = 0.2;
/** How far the back of the hand may tilt from straight up and still count as "palm facing down". Tuning value, not in the spec. */
export const PALM_DOWN_TOLERANCE_RAD = (35 * Math.PI) / 180;
/** The WebXR wrist joint sits at the wrist; the palm centre is roughly this far along the fingers (local -Z). Tuning value, not in the spec. */
export const PALM_OFFSET_M = 0.07;

const PALM_DOWN_COS = Math.cos(PALM_DOWN_TOLERANCE_RAD);

/** World-space Y of the joint's local +Y axis. */
export const backOfHandUp = (q: Quaternion): number => 1 - 2 * (q.x * q.x + q.z * q.z);

/**
 * True when the palm faces down. Assumes the WebXR hand-joint convention, in which the wrist joint's local +Y points out
 * of the back of the hand (so it points up when the palm faces down) and local -Z points along the fingers.
 * UNVERIFIED on a headset; if a Quest shows the opposite, flip the sign here.
 */
export const palmFacesDown = (wristWorld: Quaternion): boolean => backOfHandUp(wristWorld) >= PALM_DOWN_COS;

/**
 * Is the palm in the X-ray volume above a machine? `relX`, `relY`, `relZ` are the palm centre minus the machine's
 * origin in world space; `top` is the height of the machine's top above its origin and `radius` the horizontal reach,
 * both already in world metres (scaled with the town).
 */
export function hoversAbove(relX: number, relY: number, relZ: number, top: number, radius: number): boolean {
  const above = relY - top;
  return above >= XRAY_MIN_ABOVE_M && above <= XRAY_MAX_ABOVE_M && Math.hypot(relX, relZ) <= radius;
}

/**
 * Turns "the gesture pose is held" into the X-ray flag: on after 0.4 s of continuous pose, off once the pose has been
 * gone for the grace period. An active grab wins over X-ray (INTERACTION_SPEC §11: "prioritise the active grab").
 */
export class XRayDwell {
  active = false;
  private held = 0;
  private lost = 0;

  update(poseHeld: boolean, delta: number, grabbing: boolean): boolean {
    if (grabbing) {
      this.held = 0;
      this.lost = 0;
      this.active = false;
      return false;
    }
    if (poseHeld) {
      this.lost = 0;
      this.held += delta;
      if (this.held >= XRAY_HOLD_S) this.active = true;
    } else if (this.active) {
      this.lost += delta;
      if (this.lost >= XRAY_RELEASE_GRACE_S) {
        this.active = false;
        this.held = 0;
        this.lost = 0;
      }
    } else {
      this.held = 0; // the hold must be continuous
    }
    return this.active;
  }
}
