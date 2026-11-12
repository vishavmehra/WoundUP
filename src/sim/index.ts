// Public interface of the mechanical solver (Agent 1). Pure TypeScript: nothing here may import Three.js, IWSDK or a
// browser API (ADR-008). The content layer builds a `SolverInput`; the renderer and simulation controller read `SolveResult`.

export * from './constants';
export type * from './types';
export { solve } from './solve';
export { validateBlueprint, validateInput, isValidParameter } from './validate';
export { sampleFollowerProfile } from './follower';
export { windUnitsFromAngle, springRunSeconds } from './power';
