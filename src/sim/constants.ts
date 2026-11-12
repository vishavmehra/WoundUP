// Named constants of the mechanical solver (D5: every epsilon and tolerance is named and documented).
// Spec references: SOLVER = MECHANICAL_SOLVER_SPEC.md, INTERACTION = INTERACTION_SPEC.md, PRODUCT = PRODUCT_SPEC.md.

/** Closed set of connection types (DATA §7, SOLVER §7). An unknown value is a validation error, never ignored. */
export const CONNECTION_TYPES = ['shaft', 'mesh', 'belt', 'pin', 'trigger'] as const;

/** Closed set of power sources (SOLVER §5, §12). */
export const POWER_SOURCES = ['mainspring', 'ambient_wind'] as const;

// ---- Winding (INTERACTION §10; TECHNICAL_ARCHITECTURE §14) ----

/** Gameplay maximum of wind units (SOLVER §12). */
export const MAX_WIND_UNITS = 8;
/** One wind unit per 90 degrees of wrist rotation, in radians (INTERACTION §10). */
export const WIND_UNIT_ANGLE = Math.PI / 2;
/** Absorbs float error in `angle / WIND_UNIT_ANGLE` so exactly 3 quarter turns count as 3 units. */
export const WIND_ANGLE_EPSILON = 1e-9;

// ---- Consistency and comparison thresholds ----

/** Two paths to one node may differ by at most this fraction before the mechanism jams (SOLVER §10). */
export const LOOP_TOLERANCE = 0.01;
/**
 * rad/s, about one turn per 72 days. The floor of the loop test's denominator, so two near-zero speeds are not
 * compared relative to each other (SOLVER §10), and the speed a trigger source must exceed to count as moving.
 */
export const OMEGA_EPSILON = 1e-6;
/** Relative slack on the inclusive target band, so a speed exactly on the edge is not failed by float noise. */
export const TARGET_EPSILON = 1e-9;
/** Relative difference below which two gear modules are the same module. Real modules (1, 1.5, 2 ...) differ by far more. */
export const MODULE_EPSILON = 1e-6;

// ---- Run time ----

/**
 * `runSeconds` of a machine on ambient power, which never drains. A finite sentinel rather than Infinity so the
 * result survives JSON.stringify (SOLVER §6: the result must be serialisable); `SolveResult.continuous` is the
 * authoritative signal.
 */
export const CONTINUOUS_RUN_SECONDS = Number.MAX_VALUE;

/** Id used in `SolveResult.wrongTargets` when `targets.minRunSeconds` is missed (SIMULATION_SPEC §7). */
export const RUN_SECONDS_TARGET_ID = 'runSeconds';

// ---- Reference energy constants (SOLVER §12.1) ----
// The part and blueprint data should use these (or consistent) values. The solver itself only evaluates
// E = W * Eu and T = E / D from whatever the data supplies; nothing here is a hard-coded timer.

/** Energy stored per wind unit by a standard (not worn) spring, in arbitrary energy units. */
export const REFERENCE_ENERGY_PER_UNIT = 1;
/** A worn spring stores about 15 percent of the normal energy per unit (SOLVER §12.1). */
export const WORN_SPRING_ENERGY_FRACTION = 0.15;
/** Energy per unit of the worn spring. */
export const WORN_ENERGY_PER_UNIT = REFERENCE_ENERGY_PER_UNIT * WORN_SPRING_ENERGY_FRACTION;
/**
 * Drain rate (energy units per second) chosen so that the intended eight-unit test configuration is exact:
 * standard spring 8 * 1 / 0.8 = 10 s, worn spring 8 * 0.15 / 0.8 = 1.5 s (SOLVER §12.1, PRODUCT §8).
 */
export const REFERENCE_DRAIN_RATE = 0.8;

// ---- Machine targets (PRODUCT §6; DATA §8) ----
// `angularVelocity` is a speed in rad/s. `tolerance` is a fraction of it (0.10 is plus or minus 10 percent).

export const MACHINE_TARGET_SPECS = {
  musicBoxCylinder: { angularVelocity: 0.4, tolerance: 0.1 },
  carouselPlatform: { angularVelocity: 0.5, tolerance: 0.1 },
  windmillMillstone: { angularVelocity: 0.6, tolerance: 0.15 },
} as const;
