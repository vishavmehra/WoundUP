// The Clock Tower blueprint as solver data (MACHINE_SLOT_MAPPINGS §5, owner-approved 2026-11-12; PRODUCT_SPEC §6.4).
// Pure data and two helpers. Nothing here imports Three.js, IWSDK or a browser API.
//
// The integrator moves this file into src/content/blueprints/ (it is kept here only so two agents never edit one folder).
// Everything the mapping leaves open is marked "P" (proposal) and listed in INTEGRATION.md.

import { solve } from '../../sim';
import type {
  InstalledPart,
  MechanicalConnection,
  PartCatalogue,
  SolveOutcome,
  SolverBlueprint,
  SolverSocket,
} from '../../sim';
import { ESCAPE_WHEEL_RAD_PER_S } from './constants';

// ---- Slots (MACHINE_SLOT_MAPPINGS §5.4) ------------------------------------------------------------------------------

/** The library spur gears of the G0 tooth set that fit the 8.3 cm interior (TOCKTON_DIMENSIONS §6; 36T does not fit). */
const SPUR_TEETH = [10, 12, 16, 20, 24] as const;
export const SPUR_GEAR_IDS: readonly string[] = SPUR_TEETH.map((n) => `gear_spur_${n}_m1`);

export interface ClockTowerSlot {
  /** `T01` to `T32`, the mapping's slot ids. */
  readonly id: string;
  /** Socket id stem: one piece gives `role`, several give `role_1`, `role_2` ... */
  readonly role: string;
  /** The intended part of each piece, in order. Its length is the number of pieces the player places. */
  readonly intended: readonly string[];
  /** Part ids the sockets of this slot accept. A gear socket takes any spur gear so that a wrong size is allowed (PRODUCT_SPEC §9). */
  readonly accepts: readonly string[];
  /** Row of the 32-part board, or null for the two slots a specification adds (hands, winding key). Row 25 is merged into the bell, row 1 into the roof. */
  readonly boardRow: number | null;
  /** Assembly order: these slots must be built first (the mapping's "Depends on"). Not the solver graph. */
  readonly dependsOn: readonly string[];
}

const same = (id: string, n: number): string[] => Array.from({ length: n }, () => id);
const slot = (
  id: string,
  role: string,
  intended: readonly string[],
  boardRow: number | null,
  dependsOn: readonly string[],
  accepts: readonly string[] = [intended[0]],
): ClockTowerSlot => ({ id, role, intended, accepts, boardRow, dependsOn });

/** The 32 slots, base up. */
export const CLOCK_TOWER_SLOTS: readonly ClockTowerSlot[] = [
  slot('T01', 'base_platform', ['clock_tower_base_platform'], 15, []),
  slot('T02', 'step', same('clock_tower_step', 4), 16, ['T01']),
  slot('T03', 'corner_block', same('clock_tower_corner_block', 4), 31, ['T01']),
  slot('T04', 'wall_panel', same('clock_tower_wall_panel', 4), 30, ['T01']),
  slot('T05', 'entrance_arch', ['clock_tower_entrance_arch'], 28, ['T04']),
  slot('T06', 'side_arch', same('clock_tower_side_arch', 2), 29, ['T04']),
  slot('T07', 'capstone', ['clock_tower_capstone'], 32, ['T03', 'T04']),
  slot('T08', 'lower_ring', ['clock_tower_lower_ring'], 27, ['T07']),
  slot('T09', 'pillar', same('clock_tower_pillar', 4), 13, ['T08']),
  slot('T10', 'balcony_frame', same('clock_tower_balcony_frame', 4), 9, ['T09']),
  slot('T11', 'railing', same('clock_tower_railing', 8), 14, ['T10']),
  slot('T12', 'bracket', same('bracket_support', 2), 20, ['T08']),
  slot('T13', 'barrel', ['spring_barrel'], 17, ['T12']),
  slot('T14', 'spring', ['spring_standard'], 18, ['T13']),
  slot('T15', 'drive_shaft', ['shaft_long'], 19, ['T12']),
  slot('T16', 'large_gear', ['gear_spur_24_m1'], 10, ['T13'], SPUR_GEAR_IDS),
  slot('T17', 'inter_gear', ['gear_spur_10_m1', 'gear_spur_10_m1', 'gear_spur_24_m1'], 11, ['T16'], SPUR_GEAR_IDS),
  slot('T18', 'escape_wheel', ['escapement_wheel'], 12, ['T17']),
  slot('T19', 'anchor', ['escapement_anchor'], 21, ['T18']),
  slot('T20', 'pendulum_rod', ['pendulum_rod'], 22, ['T19']),
  slot('T21', 'pendulum_bob', ['pendulum_bob'], 23, ['T20']),
  slot('T22', 'hourly_cam', ['cam_hourly_chime'], 26, ['T15']),
  slot('T23', 'bell', ['clock_bell'], 24, ['T22']),
  slot('T24', 'middle_ring', ['clock_tower_middle_ring'], 8, ['T09']),
  slot('T25', 'window', same('clock_tower_window', 4), 7, ['T24']),
  slot('T26', 'clock_face', ['clock_face'], 6, ['T24', 'T15']),
  slot('T27', 'clock_hands', ['clock_hands'], null, ['T26']),
  slot('T28', 'upper_ring', ['clock_tower_upper_ring'], 5, ['T24']),
  slot('T29', 'roof_arch', ['clock_tower_roof_arch'], 4, ['T28']),
  slot('T30', 'roof', ['clock_tower_roof'], 3, ['T28']),
  slot('T31', 'spire', same('clock_tower_spire', 4), 2, ['T30']),
  slot('T32', 'winding_key', ['winding_key'], null, ['T14']),
];

/** One socket per piece the player places (DATA §6; MACHINE_SLOT_MAPPINGS §2 item 4), all required. */
export interface ClockTowerSocket extends SolverSocket {
  readonly slot: string;
  /** The part the correct assembly puts here. */
  readonly intendedPartId: string;
}

export const CLOCK_TOWER_SOCKETS: readonly ClockTowerSocket[] = CLOCK_TOWER_SLOTS.flatMap((s) =>
  s.intended.map((intendedPartId, i) => ({
    id: s.intended.length === 1 ? s.role : `${s.role}_${i + 1}`,
    required: true,
    acceptedPartIds: s.accepts,
    slot: s.id,
    intendedPartId,
  })),
);

/** The sockets of one slot, in piece order. */
export const socketsOfSlot = (slotId: string): readonly ClockTowerSocket[] => CLOCK_TOWER_SOCKETS.filter((s) => s.slot === slotId);

// ---- Mechanism (MACHINE_SLOT_MAPPINGS §5.3) -------------------------------------------------------------------------
//
//   spring ══ barrel ══ inter_gear_1 (10T) ──mesh──> large_gear (24T) ══ inter_gear_2 (10T) ──mesh──> inter_gear_3 (24T) ══ escape_wheel
//                 ╚══ drive_shaft ══ hourly_cam ··trigger··> bell            clock_hands <··trigger·· drive_shaft
//   escape_wheel ··trigger··> anchor ··trigger··> pendulum_rod ··trigger··> pendulum_bob
//
// `══` shaft (same speed), `──mesh──>` external mesh. The mapping leaves the train's tooth counts open (G-13); this is the one
// proposal that fits the library tooth set (P). 24T and 10T twice reduce the spring's 0.8 rad/s by 5.76 to 0.1389 rad/s, 6 percent
// above the 0.1309 rad/s at which the escape wheel steps in time with the pendulum (ESCAPE_WHEEL_RAD_PER_S): it is the only pair
// of two stages from {10, 12, 16, 20, 24} inside the optional target band below. The hands and the pendulum are NOT solver
// outputs: the hands follow the local time, the pendulum is a controlled animation (SIMULATION §9.6). The solver's job here is
// "complete, no jam, powered", and the trigger edges say which parts come alive.

const shaftEdge = (id: string, from: string, to: string): MechanicalConnection => ({ id, type: 'shaft', from, to });
const meshEdge = (id: string, from: string, to: string): MechanicalConnection => ({ id, type: 'mesh', from, to });
const triggerEdge = (id: string, from: string, to: string): MechanicalConnection => ({ id, type: 'trigger', from, to });

export const CLOCK_TOWER_CONNECTIONS: readonly MechanicalConnection[] = [
  shaftEdge('c_spring_barrel', 'spring', 'barrel'),
  shaftEdge('c_barrel_drive', 'barrel', 'drive_shaft'),
  shaftEdge('c_barrel_pinion', 'barrel', 'inter_gear_1'),
  meshEdge('c_stage1', 'inter_gear_1', 'large_gear'),
  shaftEdge('c_large_pinion', 'large_gear', 'inter_gear_2'),
  meshEdge('c_stage2', 'inter_gear_2', 'inter_gear_3'),
  shaftEdge('c_wheel_escape', 'inter_gear_3', 'escape_wheel'),
  shaftEdge('c_drive_cam', 'drive_shaft', 'hourly_cam'),
  triggerEdge('t_cam_bell', 'hourly_cam', 'bell'),
  triggerEdge('t_drive_hands', 'drive_shaft', 'clock_hands'),
  triggerEdge('t_escape_anchor', 'escape_wheel', 'anchor'),
  triggerEdge('t_anchor_rod', 'anchor', 'pendulum_rod'),
  triggerEdge('t_rod_bob', 'pendulum_rod', 'pendulum_bob'),
];

/** Band of the optional speed target: plus or minus 10 percent, as the Music Box and Carousel targets (MACHINE_TARGET_SPECS). P. */
export const ESCAPE_TARGET_TOLERANCE = 0.1;

export interface ClockTowerBlueprintOptions {
  /**
   * Off by default, as the approved mapping says (§5.3: "no angular-velocity target; the Clock Tower `runs` when every required
   * socket is filled and the solver finds no jam"). On, the escape wheel must turn at `ESCAPE_WHEEL_RAD_PER_S` plus or minus 10
   * percent, so a wrong gear gives `runs_wrong`. It is owner question Q11; this switch keeps both answers one flag apart.
   */
  readonly escapeTarget?: boolean;
}

export function clockTowerBlueprint(options: ClockTowerBlueprintOptions = {}): SolverBlueprint {
  return {
    sockets: CLOCK_TOWER_SOCKETS,
    connections: CLOCK_TOWER_CONNECTIONS,
    targets: options.escapeTarget
      ? { angularVelocity: { escape_wheel: ESCAPE_WHEEL_RAD_PER_S }, tolerance: { escape_wheel: ESCAPE_TARGET_TOLERANCE } }
      : {},
    power: { source: 'mainspring', socketId: 'spring' },
  };
}

export const CLOCK_TOWER_BLUEPRINT: SolverBlueprint = clockTowerBlueprint();

// ---- Parts the solver needs values for ------------------------------------------------------------------------------

/** `spring_standard`, as for the Music Box (MUSIC_BOX_BLUEPRINT §4.2): 0.8 rad/s, 0.1 J per unit, drain so that 8 units last 15.71 s. */
const SPRING_STANDARD = { angularVelocity: 0.8, energyPerUnit: 0.1, drainRate: (0.1 * 0.8) / (Math.PI / 2) };

/**
 * Mechanical values of every part the correct Clock Tower uses, plus the library gears it accepts. Gear module is the token
 * `m1` (2.5 mm): the solver compares modules, never millimetres. The integrator merges this into the part catalogue
 * (src/content/parts); a part with no mechanical value is `{}`.
 */
export const CLOCK_TOWER_PART_CATALOGUE: PartCatalogue = {
  ...Object.fromEntries(CLOCK_TOWER_SLOTS.flatMap((s) => s.intended).map((id) => [id, {}] as const)),
  spring_standard: { mechanical: SPRING_STANDARD },
  ...Object.fromEntries(SPUR_TEETH.map((n) => [`gear_spur_${n}_m1`, { mechanical: { toothCount: n, module: 1 } }] as const)),
  // The decoys, so that a decoy dropped on a socket is reported as `part_not_accepted` and nothing else.
  spring_worn: { mechanical: { ...SPRING_STANDARD, energyPerUnit: 0.015, drainRate: 0.08 } },
  gear_bevel_12: { mechanical: { toothCount: 12, module: 1 } },
};

/** The correct assembly: every socket holds its intended part. */
export const clockTowerCorrectAssembly = (): InstalledPart[] =>
  CLOCK_TOWER_SOCKETS.map((s) => ({ socketId: s.id, partId: s.intendedPartId }));

/**
 * The two decoys of Letter 6 (DATA §9.1). P: the worn spring (Letter 2's fault, so the player knows it) and a 12-tooth bevel
 * gear. Neither is accepted by any socket, so each goes back to the tray with the red outline and the soft bonk (PRODUCT_SPEC §9).
 * Which parts the owner wants is open (audit A-12).
 */
export const CLOCK_TOWER_DECOYS: readonly string[] = ['spring_worn', 'gear_bevel_12'];

/** Solves a Clock Tower assembly. A helper over `solve` so callers cannot forget the catalogue or the power input. */
export const solveClockTower = (
  installedParts: readonly InstalledPart[],
  windUnits = 8,
  blueprint: SolverBlueprint = CLOCK_TOWER_BLUEPRINT,
): SolveOutcome =>
  solve({ blueprint, installedParts, power: { source: 'mainspring', windUnits }, partCatalogue: CLOCK_TOWER_PART_CATALOGUE });
