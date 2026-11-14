/**
 * Gaze-and-pinch mode (INTERACTION_SPEC §14, ADR-036): the one flag the interaction systems read, and the rules that depend on
 * it. Pure, like xray-state.ts. `setGazeMode(world, on)` in gaze-mode.ts is the setter the game calls.
 */

/** Seconds a pinch must be held on a seated part before it can come out, in gaze mode: "pinch-and-hold removal" (INTERACTION_SPEC §9). */
export const GAZE_REMOVE_HOLD_S = 0.5;
/** A pinch on the winding key that moves less than this (metres) and ends before the hold is a tap: one wind unit (INTERACTION_SPEC §10). */
export const GAZE_TAP_MAX_M = 0.02;

let on = false;
const listeners = new Set<(on: boolean) => void>();

export const isGazeModeOn = (): boolean => on;

/** Sets the flag and tells the listeners, once per change. */
export function setGazeModeFlag(value: boolean): void {
  if (value === on) return;
  on = value;
  for (const listener of [...listeners]) listener(on);
}

/** Calls `listener` whenever the mode changes. Returns the unsubscribe. */
export function onGazeModeChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Has this pinch been held long enough to take a seated part out? Hands never wait: only gaze mode asks for the hold. */
export const mayRemoveSeated = (gazeOn: boolean, heldSeconds: number): boolean => !gazeOn || heldSeconds >= GAZE_REMOVE_HOLD_S;

/** Is this pinch on the winding key a tap that winds one unit, and not the start of pulling the key out? */
export const isWindTap = (heldSeconds: number, movedMetres: number): boolean => heldSeconds < GAZE_REMOVE_HOLD_S && movedMetres <= GAZE_TAP_MAX_M;
