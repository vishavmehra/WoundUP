// Builders for small synthetic assemblies. These are not Music Box, Carousel or Windmill parts (those blueprints are
// drafted elsewhere); they only exercise the solver with the machines' target numbers.

import { solve } from '../../src/sim';
import type {
  InstalledPart,
  MechanicalConnection,
  PowerDefinition,
  SolveResult,
  SolverBlueprint,
  SolverInput,
  SolverSocket,
  SolverValidationError,
} from '../../src/sim';

export const socket = (id: string, required = true, acceptedPartIds?: string[]): SolverSocket =>
  acceptedPartIds === undefined ? { id, required } : { id, required, acceptedPartIds };

export const sockets = (...ids: string[]): SolverSocket[] => ids.map((id) => socket(id));

export const shaft = (id: string, from: string, to: string): MechanicalConnection => ({ id, type: 'shaft', from, to });

export const mesh = (id: string, from: string, to: string, parameters?: MechanicalConnection['parameters']): MechanicalConnection =>
  parameters === undefined ? { id, type: 'mesh', from, to } : { id, type: 'mesh', from, to, parameters };

export const belt = (id: string, from: string, to: string, parameters?: MechanicalConnection['parameters']): MechanicalConnection =>
  parameters === undefined ? { id, type: 'belt', from, to } : { id, type: 'belt', from, to, parameters };

export const pin = (id: string, from: string, to: string, samples: number[]): MechanicalConnection => ({
  id,
  type: 'pin',
  from,
  to,
  parameters: { profile: { samples } },
});

export const trigger = (id: string, from: string, to: string): MechanicalConnection => ({ id, type: 'trigger', from, to });

export const gear = (socketId: string, toothCount: number, module = 1): InstalledPart => ({
  socketId,
  partId: `gear_${toothCount}`,
  parameters: { toothCount, module },
});

export const pulley = (socketId: string, radius: number): InstalledPart => ({ socketId, partId: 'pulley', parameters: { radius } });

export const spring = (socketId = 'spring', angularVelocity = 1, energyPerUnit = 1, drainRate = 1): InstalledPart => ({
  socketId,
  partId: 'spring',
  parameters: { angularVelocity, energyPerUnit, drainRate },
});

/** A part with no mechanical values of its own (shaft, cylinder, follower ...). */
export const plain = (socketId: string, partId = 'part'): InstalledPart => ({ socketId, partId });

export const mainspring = (socketId = 'spring'): PowerDefinition => ({ source: 'mainspring', socketId });

export function blueprint(
  socketList: readonly SolverSocket[],
  connections: readonly MechanicalConnection[],
  rest: Partial<SolverBlueprint> = {},
): SolverBlueprint {
  return { sockets: socketList, connections, targets: {}, power: mainspring(), ...rest };
}

export function input(bp: SolverBlueprint, installedParts: InstalledPart[], windUnits = 8, extra: Partial<SolverInput> = {}): SolverInput {
  return { blueprint: bp, installedParts, power: { source: bp.power.source, windUnits }, ...extra };
}

/** Solves and fails the test with the validation errors if the input was rejected. */
export function run(i: SolverInput): SolveResult {
  const out = solve(i);
  if (!out.ok) throw new Error(`validation failed: ${JSON.stringify(out.errors)}`);
  return out.result;
}

export function errorsOf(i: SolverInput): SolverValidationError[] {
  const out = solve(i);
  if (out.ok) throw new Error(`expected a validation failure, got status ${out.result.status}`);
  return out.errors;
}
