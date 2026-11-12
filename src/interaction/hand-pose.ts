import { Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { XRInputManager } from '@iwsdk/core';

export type Hand = 'left' | 'right';
export const HANDS: readonly Hand[] = ['left', 'right'];

const _originQuat = new Quaternion();

/**
 * World pose of the wrist, which the winding twist and the X-ray palm test are measured from.
 * Hand tracking: the standard WebXR `wrist` joint, read from the current XRFrame. Controllers have no joints, so their
 * grip pose (kept by IWSDK in `player.gripSpaces`) stands in. Returns false when the hand has no pose this frame.
 * `origin` is `world.player`: poses are in reference-space coordinates, which that group places in the world.
 */
export function readWristPose(
  input: XRInputManager,
  frame: XRFrame | null,
  space: XRReferenceSpace | null,
  origin: Object3D & { gripSpaces: Record<Hand, Object3D> },
  hand: Hand,
  outPosition: Vector3,
  outQuaternion: Quaternion,
): boolean {
  const source = input.getPrimaryInputSource(hand);
  if (!source || !frame || !space) return false;
  const wrist = source.hand?.get('wrist');
  if (wrist) {
    const pose = frame.getPose(wrist, space);
    if (!pose) return false;
    const { position: p, orientation: o } = pose.transform;
    outPosition.set(p.x, p.y, p.z).applyMatrix4(origin.matrixWorld);
    origin.getWorldQuaternion(_originQuat);
    outQuaternion.set(o.x, o.y, o.z, o.w).premultiply(_originQuat);
    return true;
  }
  const grip = origin.gripSpaces[hand];
  grip.getWorldPosition(outPosition);
  grip.getWorldQuaternion(outQuaternion);
  return true;
}
