import type { Entity } from '@iwsdk/core';

/**
 * The X-ray flag the town and presentation layer reads (INTERACTION_SPEC §11, GAMEPLAY_SYSTEMS §15). Read `xrayFlag.active`
 * each frame, or listen for the `xray` intent. X-ray is inspection only: nothing here changes assembly or machine state.
 */
export interface XRayFlag {
  /** True while X-ray is on, from the gesture or the lens button. */
  readonly active: boolean;
  /** The machine under the palm, or null when X-ray came from the lens button (the layer that owns the lens decides what it opens). */
  readonly target: Entity | null;
}

const state: { active: boolean; target: Entity | null } = { active: false, target: null };
let lens = false;

export const xrayFlag: XRayFlag = state;

/**
 * The lens icon alternative to the gesture (INTERACTION_SPEC §11). The lens button calls this; X-ray is on while either
 * the gesture or the lens asks for it. This is a UI input, not machine state.
 */
export function setXRayLens(on: boolean): void {
  lens = on;
}

export const isXRayLensOn = (): boolean => lens;

/** For XRaySystem only. */
export function writeXRayFlag(active: boolean, target: Entity | null): void {
  state.active = active;
  state.target = target;
}
