import type { Entity, World } from '@iwsdk/core';
import { SnapPart, setupGlbInteraction } from '../interaction';
import { ReturnsToRest } from '../returns-to-rest-component';
import { MACHINE_SNAP_PART } from './layout';
import type { MachineRig } from './motion';

/**
 * Makes a finished machine something the hand can carry by its base handle and drop on its own plot. Call it once per machine,
 * with the rig already parented where it was built (the workbench's build zone, under the stage root, which carries no scale).
 *  - `SnapPart` gives it the part id the plot socket of town_ground.glb accepts (`MACHINE_SNAP_PART`), so only its own plot
 *    takes it (TOCKTON_DIMENSIONS §3.4) and the other three plots refuse it with the bonk.
 *  - `ReturnsToRest` makes GrabModeSystem add the grab component and GrabFeedbackSystem return it to where it stood on the
 *    bench when it is let go away from a plot.
 *  - `setupGlbInteraction` turns its `COL_` empties (the handle's grab sphere, the case) into colliders.
 * Dropped on its plot, SocketSnapSystem seats it, TownRuntime eases it to the town scale and wakes the plot.
 * Returns the entity; the `GlbInteraction` is destroyed with it.
 */
export function makeCarriable(world: World, rig: MachineRig): Entity {
  const entity = world.createTransformEntity(rig.root);
  entity.addComponent(SnapPart, { partId: MACHINE_SNAP_PART[rig.machineId], family: '' });
  entity.addComponent(ReturnsToRest, {});
  setupGlbInteraction(world, rig.root);
  return entity;
}
