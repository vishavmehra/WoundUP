import { GazeSystem } from '@iwsdk/core';
import type { GazePointer, World, XROrigin } from '@iwsdk/core';
import { isGazeModeOn, setGazeModeFlag } from './gaze-state.js';

/**
 * Gaze-and-pinch on IWSDK's own gaze pointer (ADR-036). IWSDK's `GazeSystem` aims a cone from the headset's eye-tracking input
 * source and acts on either hand's pinch, through the same pointer events as a hand ray, so the grab handles and the UI's
 * `RayInteractable` plaques work with no further code. Quest 3 and 3S have no eye tracking (that input source never appears), so
 * the pointer is aimed from the head instead: where the head points, the cone looks. A real gaze pose, when a headset gives
 * one, still wins.
 *
 * Nothing is selected without a pinch, and the cone picks the nearest target in angle, not "whatever is near the middle of
 * the view" (INTERACTION_SPEC §14). The target under the cone is highlighted by the grab feedback and the plaques' own hover.
 */

const _eye = new Float32Array(16);

/**
 * Makes `pointer` use the head pose when the runtime gives no gaze pose. Wraps two public methods of the pointer: the pose
 * sample, which the input manager calls each frame before the pointer runs, and the "does gaze own far targeting" answer, which
 * keeps the hands' far rays from competing with it. Allocates nothing per frame.
 */
export function useHeadWhenNoEyes(pointer: GazePointer, origin: XROrigin): void {
  const sample = pointer.sampleGazePose.bind(pointer);
  pointer.sampleGazePose = (time, context) => {
    sample(time, context);
    if (origin.gazeOrigin === 'tracked') return;
    origin.head.updateMatrix();
    origin.head.matrix.toArray(_eye);
    origin.applyTrackedEyePose({ matrix: _eye } as unknown as XRRigidTransform);
  };
  const owns = pointer.ownsFarTargeting.bind(pointer);
  pointer.ownsFarTargeting = (time) => origin.gazeOrigin === 'tracked' || owns(time);
}

/**
 * Registers IWSDK's gaze system and the head fallback, with gaze off until `setGazeMode` turns it on (an unused gaze pipeline costs
 * nothing: the input manager skips it while `gazeEnabled` is false). Call once, from `installInteraction`.
 */
export function installGaze(world: World, on: boolean): void {
  // Diagnostics off: they would log "no eye tracking" at every session, which is the expected state on Quest 3.
  world.registerSystem(GazeSystem, { configData: { logDiagnostics: false } });
  useHeadWhenNoEyes(world.input.xr.gazePointer, world.player);
  setGazeMode(world, on);
}

/** Turns gaze-and-pinch on or off now: the pointer, and the grab components of every part (src/grab-mode.ts listens). */
export function setGazeMode(world: World, on: boolean): void {
  setGazeModeFlag(on);
  world.input.xr.gazeEnabled = isGazeModeOn();
}
