import type { World } from '@iwsdk/core';
import { SocketSnapSystem } from './socket-snap-system.js';
import { WindSystem } from './wind-system.js';
import { XRaySystem } from './xray-system.js';

export { SnapPart, Socket, SnappedTo, WindKey, XRayTarget } from './components.js';
export { setupGlbInteraction } from './glb-interaction.js';
export type { GlbInteraction } from './glb-interaction.js';
export { refreshColliderFloor } from './glb-reader.js';
export { interactionIntents } from './intents.js';
export type { InteractionIntent, IntentListener } from './intents.js';
export { SocketSnapSystem } from './socket-snap-system.js';
export { WindSystem } from './wind-system.js';
export { XRaySystem } from './xray-system.js';
export { isXRayLensOn, setXRayLens, xrayFlag } from './xray-state.js';
export type { XRayFlag } from './xray-state.js';

/**
 * Registers the interaction systems. Call it once, after the grab systems exist and after GrabFeedbackSystem.
 * Priority 10 puts them after IWSDK's grab (-3) and after the M0 grab feedback (0), which matters: a seated part is
 * positioned by SocketSnapSystem and must win over GrabFeedbackSystem's return-to-tray ease.
 * `easySnap` is the accessibility setting that widens the snap radius from 4 cm to 7 cm (INTERACTION_SPEC §8); it can also be
 * changed later through `world.getSystem(SocketSnapSystem)?.config.easySnap.value`.
 */
export function installInteraction(world: World, options: { easySnap?: boolean } = {}): void {
  world
    .registerSystem(SocketSnapSystem, { priority: 10, configData: { easySnap: options.easySnap ?? false } })
    .registerSystem(WindSystem, { priority: 10 })
    .registerSystem(XRaySystem, { priority: 10 });
}
