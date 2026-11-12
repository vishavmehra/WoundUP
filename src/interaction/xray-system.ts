import { createSystem, Grabbed, Quaternion, Vector3 } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { XRayTarget } from './components.js';
import { HANDS, readWristPose } from './hand-pose.js';
import { interactionIntents } from './intents.js';
import { hoversAbove, PALM_OFFSET_M, palmFacesDown, XRayDwell } from './xray.js';
import { isXRayLensOn, writeXRayFlag, xrayFlag } from './xray-state.js';

const _wristPos = new Vector3();
const _wristQuat = new Quaternion();
const _palm = new Vector3();
const _origin = new Vector3();
const _scale = new Vector3();

/**
 * The X-ray gesture (INTERACTION_SPEC §11): an open palm facing down, 5-20 cm above a machine, held about 0.4 s.
 * Thin: the pose tests and the dwell timer are in xray.ts. It only sets the flag in xray-state.ts and emits `xray`.
 *  - "Open" is approximated by "not pinching"; finger extension is not measured.
 *  - Any active grab switches X-ray off and blocks it (INTERACTION_SPEC §11: the grab wins).
 *  - The lens button (setXRayLens) turns it on too, which is the accessible alternative.
 * Hand tracking only; the palm test needs the wrist joint (controllers never trigger the gesture).
 */
export class XRaySystem extends createSystem({
  targets: { required: [XRayTarget] },
  held: { required: [Grabbed] },
}) {
  private readonly dwell = new XRayDwell();
  private found: Entity | null = null;
  private target: Entity | null = null;
  private readonly scan = (entity: Entity): void => {
    if (this.found) return;
    const object = entity.object3D;
    if (!object) return;
    object.getWorldPosition(_origin);
    object.getWorldScale(_scale);
    const top = (entity.getValue(XRayTarget, 'top') ?? 0) * _scale.y;
    const radius = (entity.getValue(XRayTarget, 'radius') ?? 0) * _scale.x;
    if (hoversAbove(_palm.x - _origin.x, _palm.y - _origin.y, _palm.z - _origin.z, top, radius)) this.found = entity;
  };

  init(): void {
    this.cleanupFuncs.push(() => writeXRayFlag(false, null));
  }

  update(delta: number): void {
    const grabbing = this.queries.held.entities.size > 0;
    const found = !grabbing && this.queries.targets.entities.size > 0 ? this.findPalmTarget() : null;

    const gesture = this.dwell.update(found !== null, delta, grabbing);
    if (found) this.target = found;
    else if (!gesture) this.target = null; // keep the target through the release grace period

    const active = gesture || isXRayLensOn();
    const target = gesture ? this.target : null;
    if (active === xrayFlag.active && target === xrayFlag.target) return;
    const changed = active !== xrayFlag.active;
    writeXRayFlag(active, target);
    if (changed) interactionIntents.emit({ type: 'xray', active });
  }

  /** The machine a palm-down open hand is hovering above, if any. */
  private findPalmTarget(): Entity | null {
    this.found = null;
    const frame = this.xrFrame as XRFrame | null; // typed non-null, but null outside an XR frame
    const space = this.xrManager.getReferenceSpace();
    for (let i = 0; i < HANDS.length; i++) {
      const hand = HANDS[i];
      if (this.input.xr.getSelectState(hand).active) continue; // pinching is not an open hand
      if (!readWristPose(this.input.xr, frame, space, this.player, hand, _wristPos, _wristQuat)) continue;
      if (!palmFacesDown(_wristQuat)) continue;
      // The wrist joint sits at the wrist; the palm centre is a hand-length further along the fingers (-Z).
      _palm.set(0, 0, -PALM_OFFSET_M).applyQuaternion(_wristQuat).add(_wristPos);
      this.queries.targets.entities.forEach(this.scan);
      if (this.found) break;
    }
    return this.found as Entity | null; // set by `scan`, which TypeScript cannot see
  }
}
