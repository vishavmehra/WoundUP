/**
 * Gaze-and-pinch mode (INTERACTION_SPEC §14, ADR-036): the one flag the interaction systems read, and the rules that depend on
 * it. Pure, like xray-state.ts. `setGazeMode(world, on)` in gaze-mode.ts is the setter the game calls.
 */

/** Seconds a pinch must be held on a seated part before it can come out, in gaze mode: "pinch-and-hold removal" (INTERACTION_SPEC §9). */
export const GAZE_REMOVE_HOLD_S = 0.5;
/** A pinch on the winding key that moves less than this (metres) and ends before the hold is a tap: one wind unit (INTERACTION_SPEC §10). */
export const GAZE_TAP_MAX_M = 0.02;

let on = false;
let ray = false;
const listeners = new Set<(on: boolean) => void>();

/**
 * Is a pointer, not a near pinch, taking things? True in gaze-and-pinch and in ray mode (PRODUCT_SPEC §16): both aim a ray at a target and act on a
 * pinch, so parts carry ray-capable grab components, a seated part comes out on a held pinch and the key winds on a tap. They differ only in whose ray
 * it is (`isGazeAiming`). The name stays: the grab, snap, wind and feedback code all ask this one question.
 */
export const isGazeModeOn = (): boolean => on || ray;
/** Gaze-and-pinch itself: the head-aimed pointer is on and the hands' far rays stand back. */
export const isGazeAiming = (): boolean => on;
/** Ray interaction mode: the hands' own rays aim. */
export const isRayModeOn = (): boolean => ray;

/** Sets the gaze flag and tells the listeners when the pointer-mode answer changed. */
export function setGazeModeFlag(value: boolean): void {
  const before = isGazeModeOn();
  on = value;
  if (isGazeModeOn() !== before) for (const listener of [...listeners]) listener(isGazeModeOn());
}

/** Sets the ray-mode flag (ray-mode.ts calls it) and tells the listeners when the pointer-mode answer changed. */
export function setRayModeFlag(value: boolean): void {
  const before = isGazeModeOn();
  ray = value;
  if (isGazeModeOn() !== before) for (const listener of [...listeners]) listener(isGazeModeOn());
}

/** Calls `listener` whenever the pointer-mode answer changes (gaze or ray mode turning on or off). Returns the unsubscribe. */
export function onGazeModeChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Has this pinch been held long enough to take a seated part out? Hands never wait: only gaze mode asks for the hold. */
export const mayRemoveSeated = (gazeOn: boolean, heldSeconds: number): boolean => !gazeOn || heldSeconds >= GAZE_REMOVE_HOLD_S;

/** Is this pinch on the winding key a tap that winds one unit, and not the start of pulling the key out? */
export const isWindTap = (heldSeconds: number, movedMetres: number): boolean => heldSeconds < GAZE_REMOVE_HOLD_S && movedMetres <= GAZE_TAP_MAX_M;
