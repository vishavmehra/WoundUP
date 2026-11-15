import type { World } from '@iwsdk/core';
import { installGaze } from './gaze-mode.js';
import type { SnapLevel } from './snap.js';
import { SocketSnapSystem } from './socket-snap-system.js';
import { WindSystem } from './wind-system.js';
import { XRaySystem } from './xray-system.js';

export { SnapPart, Socket, SnappedTo, WindKey, XRayTarget } from './components.js';
export { setupGlbInteraction } from './glb-interaction.js';
export type { GlbInteraction } from './glb-interaction.js';
export { refreshColliderFloor } from './glb-reader.js';
export { interactionIntents, settleIntents } from './intents.js';
export type { InteractionIntent, IntentListener } from './intents.js';
export { SocketSnapSystem } from './socket-snap-system.js';
export { applyArming, applyFirmness, armedIds } from './arming.js';
export { Dispenser, ROLL_DROP_M, ROLL_S } from './dispenser.js';
export type { BinSpec, DispenserOptions } from './dispenser.js';
export { seatNow, TAP_RING_RADIUS_M, TapToFasten } from './seat-now.js';
export { FIRM_UNSNAP_DISTANCE_M, snapRadius } from './snap.js';
export type { SnapLevel } from './snap.js';
export { WindSystem } from './wind-system.js';
export { XRaySystem } from './xray-system.js';
export { installGaze, setGazeMode, useHeadWhenNoEyes } from './gaze-mode.js';
export { GAZE_REMOVE_HOLD_S, isGazeModeOn } from './gaze-state.js';
export { isXRayLensOn, setXRayLens, xrayFlag } from './xray-state.js';
export type { XRayFlag } from './xray-state.js';

/**
 * Registers the interaction systems. Call it once, after the grab systems exist and after GrabFeedbackSystem.
 * Priority 10 puts them after IWSDK's grab (-3) and after the M0 grab feedback (0), which matters: a seated part is
 * positioned by SocketSnapSystem and must win over GrabFeedbackSystem's return-to-tray ease.
 * `easySnap` is the accessibility setting that widens the snap radius from 4 cm to 7 cm (INTERACTION_SPEC §8); it can also be
 * changed later through `world.getSystem(SocketSnapSystem)?.config.easySnap.value`.
 * `gazeMode` starts gaze-and-pinch (ADR-036); `setGazeMode(world, on)` changes it later (the pause menu does).
 * `level` is the difficulty (ADR-050), which sets the snap radius (design §5.2); change it later with `world.getSystem(SocketSnapSystem)!.config.level.value = 'relaxed' | 'standard' | 'master'`.
 */
export function installInteraction(world: World, options: { easySnap?: boolean; gazeMode?: boolean; level?: SnapLevel } = {}): void {
  world
    .registerSystem(SocketSnapSystem, { priority: 10, configData: { easySnap: options.easySnap ?? false, level: options.level ?? 'standard' } })
    .registerSystem(WindSystem, { priority: 10 })
    .registerSystem(XRaySystem, { priority: 10 });
  installGaze(world, options.gazeMode ?? false);
}
