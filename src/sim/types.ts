// Mechanical solver contracts. Pure data: types only, nothing is executed.
// SOLVER = MECHANICAL_SOLVER_SPEC.md, DATA = DATA_AND_BLUEPRINT_SPEC.md, TECH = TECHNICAL_ARCHITECTURE.md.
//
// Units are the caller's (ADR-020: the solver is unit-agnostic). Angular velocity is rad/s, time is seconds, energy is
// arbitrary energy units; radius and gear module are only ever compared as ratios.
// Direction convention: every rotating axis is parallel to the machine's local Z (ADR-020), and omega > 0 is
// counter-clockwise seen from +Z. The power source defines the sign of its own output; a mesh reverses it.

import type { CONNECTION_TYPES, POWER_SOURCES } from './constants';

// ---- Output (SOLVER §4, §6; TECH §10.2) ----

export type SolveStatus = 'runs' | 'runs_wrong' | 'jams' | 'incomplete';

export type JamReason = 'module_mismatch' | 'velocity_contradiction';

export interface SolveResult {
  status: SolveStatus;
  /**
   * Speed of every installed socket while the machine runs, rad/s. A socket that is installed but not driven reads 0.
   * Empty when the machine cannot run (`incomplete`, `jams`): no valid operating result exists (SOLVER §11).
   */
  angularVelocity: Record<string, number>;
  /** Pose of every pin-driven follower at the supplied `nodeAngles` (profile units). Empty when the machine cannot run. */
  followerPose: Record<string, number>;
  /** How long the stored energy lasts, seconds. 0 when the machine cannot run. */
  runSeconds: number;
  /** `jams` only. A connection id for `module_mismatch`, a socket id for `velocity_contradiction`. */
  jamAt?: string;
  /** `jams` only (SOLVER §16). */
  jamReason?: JamReason;
  /** `runs_wrong` only. Node ids of missed speed or pose targets, plus `runSeconds` for a missed `minRunSeconds`. Sorted. */
  wrongTargets?: string[];
  /** `incomplete` only: required sockets (and the power-source socket) with no part. Sorted. */
  missingSockets?: string[];
  /** For every node that is the destination of a trigger connection: is it activated (SOLVER §8.5). Empty when the machine cannot run. */
  triggered: Record<string, boolean>;
  /** True when the machine runs on ambient power and never drains (`runSeconds` is then `CONTINUOUS_RUN_SECONDS`). */
  continuous: boolean;
}

// ---- Validation failures (SOLVER §14 step 1, §16) ----

export type SolverErrorCode =
  | 'duplicate_socket_id'
  | 'duplicate_connection_id'
  | 'unknown_connection_type'
  | 'unknown_connection_endpoint'
  | 'self_connection'
  | 'multiple_pin_drivers'
  | 'unknown_power_socket'
  | 'unknown_target_node'
  | 'missing_target_tolerance'
  | 'power_source_mismatch'
  | 'unknown_socket'
  | 'duplicate_installed_socket'
  | 'invalid_part_id'
  | 'unknown_part'
  | 'part_not_accepted'
  | 'missing_parameter'
  | 'invalid_parameter';

export interface SolverValidationError {
  code: SolverErrorCode;
  /** Where in the input, for example `connections[2].parameters.fromTeeth` or `power.windUnits`. */
  path: string;
  /** The offending socket, connection or part id when there is one. */
  id?: string;
}

/**
 * The chosen error contract (SOLVER §14 step 1): invalid input or an invalid blueprint is not a fifth status, because
 * renderers and the gift viewer switch over the four statuses. `solve` never throws on well-typed input.
 */
export type SolveOutcome =
  | { ok: true; result: SolveResult }
  | { ok: false; errors: SolverValidationError[] };

// ---- Blueprint subset the solver reads (DATA §5 to §8) ----

/** A full `SocketDefinition` is assignable. */
export interface SolverSocket {
  readonly id: string;
  readonly required: boolean;
  /** When set, only these part ids may be installed here (DATA §6). */
  readonly acceptedPartIds?: readonly string[];
}

/** Predefined follower profile: pose samples at equal cam angles over one revolution, periodic (SOLVER §8.4). */
export interface FollowerProfile {
  /** At least 2 samples. Sample i sits at angle 2*PI*i/n; the pose is linearly interpolated and wraps around. */
  readonly samples: readonly number[];
}

/** DATA §7 parameters, plus the follower `profile` a `pin` connection needs. */
export interface ConnectionParameters {
  readonly fromTeeth?: number;
  readonly toTeeth?: number;
  readonly fromRadius?: number;
  readonly toRadius?: number;
  readonly module?: number;
  /** Belt only, and mandatory there: 1 for an open belt (same sense), -1 for a crossed belt. Never inferred (SOLVER §8.3). */
  readonly direction?: number;
  /** Pin only, and mandatory there. */
  readonly profile?: FollowerProfile;
}

export type ConnectionType = (typeof CONNECTION_TYPES)[number];
export type PowerSource = (typeof POWER_SOURCES)[number];

/**
 * Connection endpoints are socket ids. Direction of the relationship:
 * - `shaft`, `mesh`, `belt`: symmetric, speed propagates either way.
 * - `pin`: `from` is the driving cam or crank, `to` is the follower.
 * - `trigger`: `from` activates `to`.
 */
export interface MechanicalConnection {
  readonly id: string;
  readonly type: ConnectionType;
  readonly from: string;
  readonly to: string;
  readonly parameters?: ConnectionParameters;
}

/**
 * Targets (DATA §8). `tolerance` is a fraction of the expected value (0.1 is plus or minus 10 percent), keyed by node id,
 * and is mandatory for every speed and pose target. Speed targets compare magnitudes: the sign is set by the gear train.
 */
export interface MachineTargets {
  readonly angularVelocity?: Readonly<Record<string, number>>;
  readonly followerPose?: Readonly<Record<string, number>>;
  readonly tolerance?: Readonly<Record<string, number>>;
  /**
   * Fully wound (`MAX_WIND_UNITS`), the machine must run at least this long (SIMULATION_SPEC §7: "runs for an
   * unexpectedly short duration" is `runs_wrong`). Checked against full-wind capacity, not the current wind, so a good
   * spring wound a little is not reported wrong. Absent means no run-time target, so a worn spring still `runs`.
   */
  readonly minRunSeconds?: number;
}

/**
 * Where the energy comes from. Added to the blueprint because the solver must know which socket is the source:
 * - `mainspring`: the spring part in `socketId` gives `angularVelocity` (its output speed), `energyPerUnit` and
 *   `drainRate`. The optional fields here are only fallbacks for a part that does not supply them.
 * - `ambient_wind`: the blueprint defines the wind-driven speed of the sails socket; no energy, no drain (SOLVER §12.2).
 */
export type PowerDefinition =
  | { readonly source: 'mainspring'; readonly socketId: string; readonly angularVelocity?: number; readonly drainRate?: number }
  | { readonly source: 'ambient_wind'; readonly socketId: string; readonly angularVelocity: number };

/** A full `MachineBlueprint` carrying `power` is assignable. */
export interface SolverBlueprint {
  readonly sockets: readonly SolverSocket[];
  readonly connections: readonly MechanicalConnection[];
  readonly targets: MachineTargets;
  readonly power: PowerDefinition;
}

// ---- Input (SOLVER §5) ----

/** The mechanical fields of a part (DATA §4 `PartDefinition.mechanical`). */
export type PartParameterName = 'toothCount' | 'module' | 'radius' | 'angularVelocity' | 'energyPerUnit' | 'drainRate';
export type PartMechanics = Readonly<Partial<Record<PartParameterName, number>>>;

/** A `Record<string, PartDefinition>` is assignable. */
export type PartCatalogue = Readonly<Record<string, { readonly mechanical?: PartMechanics }>>;

export interface InstalledPart {
  readonly socketId: string;
  readonly partId: string;
  /** Per-instance mechanical values. They win over the catalogue, which wins over the connection's authored fallback. */
  readonly parameters?: Readonly<Partial<Record<string, number>>>;
}

export interface PowerInput {
  readonly source: PowerSource;
  /** Wind units stored, 0 to `MAX_WIND_UNITS`. Required for `mainspring`; unused for `ambient_wind`. */
  readonly windUnits?: number;
}

export interface SolverInput {
  readonly blueprint: SolverBlueprint;
  readonly installedParts: readonly InstalledPart[];
  readonly power: PowerInput;
  /** When given, every installed part id must be in it and its `mechanical` data supplies parameters. */
  readonly partCatalogue?: PartCatalogue;
  /** Current angle in radians of rotating sockets, used only to evaluate pin followers. Missing means 0. */
  readonly nodeAngles?: Readonly<Record<string, number>>;
}
