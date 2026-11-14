// The playable Clock Tower (PRODUCT_SPEC §6.4, MACHINE_SLOT_MAPPINGS §5). See INTEGRATION.md. The blueprint is in src/content/blueprints/clock-tower.ts.
import type { World } from '@iwsdk/core';
import { ClockTowerSystem } from './system.js';

export * from './build.js';
export * from './constants.js';
export * from './rig.js';
export * from './runtime.js';
export * from './time.js';
export { ClockTowerRig as ClockTowerRigComponent } from './components.js';
export { ClockTowerSystem, clockTowerEvents, setClockTowerClock } from './system.js';

/** Registers the Clock Tower system. After the interaction systems (priority 10), so a part seated this frame is already in place. */
export function installClockTower(world: World): void {
  world.registerSystem(ClockTowerSystem, { priority: 20 });
}
