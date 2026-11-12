// The playable Clock Tower (PRODUCT_SPEC §6.4, MACHINE_SLOT_MAPPINGS §5). See INTEGRATION.md.
import type { World } from '@iwsdk/core';
import { ClockTowerSystem } from './system.js';

export * from './blueprint';
export * from './constants';
export * from './rig';
export * from './runtime';
export * from './time';
export { ClockTowerRig as ClockTowerRigComponent } from './components.js';
export { ClockTowerSystem, clockTowerEvents, setClockTowerClock } from './system.js';

/** Registers the Clock Tower system. After the interaction systems (priority 10), so a part seated this frame is already in place. */
export function installClockTower(world: World): void {
  world.registerSystem(ClockTowerSystem, { priority: 20 });
}
