// Builds the solver's input from a blueprint and an assembly, so no caller hand-assembles `SolverInput` (SOLVER §5).
import { MAX_WIND_UNITS, solve } from '../../sim';
import type { SolveOutcome, SolverInput } from '../../sim';
import { SOLVER_CATALOGUE } from '../parts/catalogue';
import type { MachineBlueprint } from './types';

/** What the player has built: socket id to part id. A missing socket is an empty socket. */
export type Assembly = Readonly<Record<string, string>>;

/**
 * `windUnits` is the energy stored in a mainspring machine (0 to 8, default full) and is ignored by a wind-driven one.
 * `nodeAngles` are the rotating sockets' angles in radians, only needed for pin followers (the Carousel's horses).
 */
export function solverInput(
  blueprint: MachineBlueprint,
  assembly: Assembly,
  windUnits: number = MAX_WIND_UNITS,
  nodeAngles?: Readonly<Record<string, number>>,
): SolverInput {
  return {
    blueprint,
    installedParts: Object.entries(assembly).map(([socketId, partId]) => ({ socketId, partId })),
    power: blueprint.power.source === 'mainspring' ? { source: 'mainspring', windUnits } : { source: 'ambient_wind' },
    partCatalogue: SOLVER_CATALOGUE,
    ...(nodeAngles === undefined ? {} : { nodeAngles }),
  };
}

/** Run the solver on an assembly. Call it when the assembly or the wind changes, never per frame (SOLVER §18). */
export const solveAssembly = (
  blueprint: MachineBlueprint,
  assembly: Assembly,
  windUnits?: number,
  nodeAngles?: Readonly<Record<string, number>>,
): SolveOutcome => solve(solverInput(blueprint, assembly, windUnits, nodeAngles));
