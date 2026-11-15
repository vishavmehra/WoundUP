/**
 * The intricate assembly of ADR-050 (stages, hardware, difficulty, the Helper). The one fallback switch of design §12.4: when false the
 * difficulty picker is hidden and the game ships in Relaxed with the hardware seated by the game at the start, which is the build before
 * ADR-050 plus invisible fasteners. No data is lost and no code is removed. Rules take it as an argument (`planStages`'s `intricate`), so the
 * pure layer never reads a global; `planBuild` passes this constant.
 */
export const INTRICATE_ASSEMBLY = true;

export * from './gift';
export * from './registry';
export * from './repair';
export * from './rules';
export * from './solve';
export * from './steps';
export * from './types';
export { MAX_HARDWARE_KINDS_PER_STAGE, validateMachineBlueprint } from './validate';
export { CAROUSEL, HORSE_TRAVEL_M } from './carousel';
export {
  CLOCK_TOWER,
  CLOCK_TOWER_CONNECTIONS,
  CLOCK_TOWER_DECOYS,
  CLOCK_TOWER_SLOTS,
  CLOCK_TOWER_SOCKETS,
  clockTowerBlueprint,
  clockTowerCorrectAssembly,
  ESCAPE_TARGET_TOLERANCE,
  socketsOfSlot,
  solveClockTower,
} from './clock-tower';
export type { ClockTowerBlueprintOptions, ClockTowerSlot, ClockTowerSocket } from './clock-tower';
export { GEAR_SPACING_EXTRA_M, MUSIC_BOX, MUSIC_BOX_MIN_RUN_SECONDS } from './music-box';
export { WINDMILL, WINDMILL_WIND_RAD_S } from './windmill';
