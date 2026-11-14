import type { Entity, Object3D, World } from '@iwsdk/core';
import { SnapPart, setupGlbInteraction } from '../interaction';
import { ReturnsToRest } from '../returns-to-rest-component';
import { MACHINE_SNAP_PART } from './layout';
import type { MachineRig } from './motion';

/** The entity that owns `object`: IWSDK keeps the entity index on the objects of authored nodes and of its entities. */
function entityOf(world: World, object: Object3D | null): Entity | undefined {
  const index = (object as (Object3D & { entityIdx?: number }) | null)?.entityIdx;
  return typeof index === 'number' ? (world.entityManager.getEntityByIndex(index) ?? undefined) : undefined;
}

/**
 * Makes a finished machine something the hand can carry by its base handle and drop on its own plot. Call it once per machine,
 * with the rig already parented where it was built (the workbench's build zone, under the stage root, which carries no scale).
 *  - `SnapPart` gives it the part id the plot socket of town_ground.glb accepts (`MACHINE_SNAP_PART`), so only its own plot
 *    takes it (TOCKTON_DIMENSIONS §3.4) and the other three plots refuse it with the bonk.
 *  - `ReturnsToRest` makes GrabModeSystem add the grab component and GrabFeedbackSystem return it to where it stood on the
 *    bench when it is let go away from a plot.
 *  - `setupGlbInteraction` turns its `COL_` empties (the handle's grab sphere, the case) into colliders.
 * Dropped on its plot, SocketSnapSystem seats it, TownRuntime eases it to the town scale and wakes the plot.
 *
 * The rig stays under the parent it has. IWSDK's `createTransformEntity(object)` would move it to the level root, and its
 * TransformSystem would keep it there, so a machine built under the stage root would jump away from the table. The parent is
 * named when it is an entity (the authored stage node is); a plain Group parent cannot be named, so the machine then gets a
 * plain entity with no Transform component, which TransformSystem leaves alone.
 * Returns the entity.
 */
export function makeCarriable(world: World, rig: MachineRig): Entity {
  const parent = entityOf(world, rig.root.parent);
  let entity: Entity;
  if (parent) {
    entity = world.createTransformEntity(rig.root, { parent });
  } else {
    entity = world.createEntity();
    entity.object3D = rig.root;
  }
  entity.addComponent(SnapPart, { partId: MACHINE_SNAP_PART[rig.machineId], family: '' });
  entity.addComponent(ReturnsToRest, {});
  setupGlbInteraction(world, rig.root);
  return entity;
}
