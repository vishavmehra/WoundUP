import { MAX_WIND_UNITS, WIND_ANGLE_EPSILON, WIND_UNIT_ANGLE } from './constants';

/**
 * Wind units earned by a total wrist rotation in radians: one per 90 degrees, at most 8 (INTERACTION §10).
 * The single definition of the rate, so the interaction layer and the solver cannot disagree. Negative, NaN or
 * partial rotation earns nothing.
 */
export function windUnitsFromAngle(angle: number): number {
  if (!(angle > 0)) return 0;
  return Math.min(MAX_WIND_UNITS, Math.floor(angle / WIND_UNIT_ANGLE + WIND_ANGLE_EPSILON));
}

/**
 * Seconds a mainspring runs (SOLVER §12): stored energy E = W * Eu, run time T = E / D.
 * Inputs are validated by the caller (`solve`): W in 0..8, Eu >= 0, D > 0.
 */
export function springRunSeconds(windUnits: number, energyPerUnit: number, drainRate: number): number {
  return (windUnits * energyPerUnit) / drainRate;
}
