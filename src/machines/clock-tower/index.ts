// The playable Clock Tower (PRODUCT_SPEC §6.4, MACHINE_SLOT_MAPPINGS §5). See INTEGRATION.md. The blueprint is in src/content/blueprints/clock-tower.ts.
import type { Entity, World } from '@iwsdk/core';
import type { MachineRig } from '../../town/motion';
import { ClockTowerRig } from './components.js';
import { ClockTowerSystem } from './system.js';

export * from './build.js';
export * from './constants.js';
export * from './movement.js';
export * from './rig.js';
export * from './runtime.js';
export * from './time.js';
export { ClockTowerRig as ClockTowerRigComponent } from './components.js';
export { ClockTowerSystem, clockTowerEvents, setClockTowerClock } from './system.js';

/** Registers the Clock Tower system. After the interaction systems (priority 10), so a part seated this frame is already in place. */
export function installClockTower(world: World): void {
  world.registerSystem(ClockTowerSystem, { priority: 20 });
}

/**
 * Makes a finished tower (`buildClockTower`, already in the scene) keep time: an entity that owns its root, with the component set to
 * running, and the system registered if the world has none. For a tower that is only shown, a gift on the stand or the debug demo;
 * the game runs its tower itself (`Gameplay.attachTower`). `strikeOnStart` rings the hour once at the start. Destroy the entity
 * (and remove `rig.root`) to take the tower away again.
 */
export function startClockTower(world: World, rig: MachineRig, options: { strikeOnStart?: boolean } = {}): Entity {
  if (!world.getSystem(ClockTowerSystem)) installClockTower(world);
  const entity = world.createEntity();
  entity.object3D = rig.root;
  entity.addComponent(ClockTowerRig, { powered: true, strikeOnStart: options.strikeOnStart === true });
  return entity;
}
