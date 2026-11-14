import type { World } from '@iwsdk/core';
import { setGazeMode } from './gaze-mode.js';
import { setRayModeFlag } from './gaze-state.js';

/**
 * Ray interaction mode (PRODUCT_SPEC §16, F17): the accessibility option for a player who cannot, or would rather not, reach into the scene.
 * IWSDK already gives each hand a far ray (`MultiPointer`: touch, then near grab, then ray) and a pinch acts on what the ray hovers, so this
 * needs no pointer of its own: it only has to make every part answer to rays, which `GrabModeSystem` does when it hears the pointer-mode flag
 * change (a part holds one grab component, and \`OneHandGrabbable\` denies ray pointers, ADR-024). From there the gaze-mode rules apply unchanged
 * because they hang on the flag, not on the pointer: a held pinch takes a seated part out, a tap on the key winds one unit (no twist is needed),
 * the carried machine is dragged to its plot, and the UI plaques and the lens are ray targets already.
 */

/** Turns ray mode on or off now. `gazeAlso` is whether gaze-and-pinch is on too; gaze wins, because its pointer would fight the hands' rays. */
export function setRayMode(on: boolean, gazeAlso = false): void {
  setRayModeFlag(on && !gazeAlso);
}

/** Applies the two saved pointer settings together: at most one of gaze-and-pinch and ray mode is ever on (gaze wins). */
export function setPointerModes(world: World, settings: { readonly gazeMode: boolean; readonly rayMode: boolean }): void {
  // The mode turning on is set first, so a switch from one pointer mode to the other never passes through "none" (which would swap every
  // part's grab component twice).
  if (settings.rayMode && !settings.gazeMode) {
    setRayMode(true);
    setGazeMode(world, false);
  } else {
    setGazeMode(world, settings.gazeMode);
    setRayMode(false);
  }
}
