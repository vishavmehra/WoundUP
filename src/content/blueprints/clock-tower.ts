// The Clock Tower blueprint (MACHINE_SLOT_MAPPINGS §5, owner-approved 2026-11-12; PRODUCT_SPEC §6.4; ADR-047).
//
// The board has 32 slots (T01 to T32). Fifteen of them are structural pieces (steps, pillars, rings, windows, spire ...) that the
// asset agents modelled as meshes of two files, `clock_tower_base.glb` and `clock_tower_shell.glb`, not as a GLB per piece, so they
// have no part id and no socket: they are the housing, as the Windmill's tower and the Carousel's base are (gap, listed in
// docs/blueprints/MACHINE_SLOT_MAPPINGS.md §9). The 17 sockets here are the slots whose part exists as a GLB: the movement and the
// dial. No GLB carries a `SOCKET_` empty for them, so the game seats them (gameplay.ts, the Carousel's way) and the solver still
// judges the whole assembly.
//
// Everything the mapping leaves open is a proposal; INTEGRATION.md lists them and `src/machines/clock-tower/constants.ts` holds the numbers.
//
//   spring ══ barrel ══ inter_gear_1 (10T) ──mesh──> large_gear (24T) ══ inter_gear_2 (10T) ──mesh──> inter_gear_3 (24T) ══ escape_wheel
//                 ╚══ drive_shaft ══ hourly_cam ··trigger··> bell            clock_hands <··trigger·· drive_shaft
//   escape_wheel ··trigger··> anchor ··trigger··> pendulum
//
// `══` shaft (same speed), `──mesh──>` external mesh. The mapping leaves the train's tooth counts open (G-13); this is the one
// proposal that fits the library tooth set: 24T and 10T twice reduce the spring's 0.8 rad/s by 5.76 to 0.1389 rad/s, 6 percent above
// the 0.1309 rad/s at which the escape wheel steps in time with the pendulum (ESCAPE_WHEEL_RAD_PER_S), the only two-stage pair of
// {10, 12, 16, 20, 24} inside the optional target band. The hands and the pendulum are NOT solver outputs: the hands follow the local
// time, the pendulum is a controlled animation (SIMULATION §9.6). The solver's job here is "complete, no jam, powered", and the
// trigger edges say which parts come alive.

import { ESCAPE_WHEEL_RAD_PER_S } from '../../machines/clock-tower/constants';
import { solve } from '../../sim';
import type { InstalledPart, MechanicalConnection, SolveOutcome } from '../../sim';
import { SOLVER_CATALOGUE } from '../parts/catalogue';
import type { PartFamily } from '../parts/types';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

// ---- Slots (MACHINE_SLOT_MAPPINGS §5.4) ------------------------------------------------------------------------------

export interface ClockTowerSlot {
  /** `T01` to `T32`, the mapping's slot ids. */
  readonly id: string;
  /** Socket id stem: one piece gives `role`, several give `role_1`, `role_2` ... */
  readonly role: string;
  /** Pieces on the board (the structural slots count here although they have no socket). */
  readonly pieces: number;
  /** Asset id of each piece the game seats, in order: empty for a piece that is a mesh of the base or shell GLB. */
  readonly assets: readonly string[];
  readonly family: PartFamily | null;
  /** Part ids a socket of this slot accepts. A gear socket takes any spur gear so that a wrong size is allowed (PRODUCT_SPEC §9). */
  readonly accepts: readonly string[];
  /** Row of the 32-part board, or null for the two slots a specification adds (hands, winding key). Row 25 is merged into the bell, row 1 into the roof, row 23 into the pendulum. */
  readonly boardRow: number | null;
  /** Assembly order: these slots must be built first (the mapping's "Depends on"). Not the solver graph. */
  readonly dependsOn: readonly string[];
}

/** A structural slot: pieces of the base or shell GLB, no part id, no socket. */
const housing = (id: string, role: string, pieces: number, boardRow: number, dependsOn: readonly string[]): ClockTowerSlot => ({
  id,
  role,
  pieces,
  assets: [],
  family: null,
  accepts: [],
  boardRow,
  dependsOn,
});

/** A slot whose pieces are GLB parts. `accepts` defaults to the intended part, so a decoy is refused by every socket. */
const seated = (
  id: string,
  role: string,
  family: PartFamily,
  boardRow: number | null,
  dependsOn: readonly string[],
  assets: readonly string[],
  accepts?: readonly string[],
): ClockTowerSlot => ({ id, role, pieces: assets.length, assets, family, accepts: accepts ?? [partId(assets[0])], boardRow, dependsOn });

/** The 32 slots, base up. */
export const CLOCK_TOWER_SLOTS: readonly ClockTowerSlot[] = [
  housing('T01', 'base_platform', 1, 15, []),
  housing('T02', 'step', 4, 16, ['T01']),
  housing('T03', 'corner_block', 4, 31, ['T01']),
  housing('T04', 'wall_panel', 4, 30, ['T01']),
  housing('T05', 'entrance_arch', 1, 28, ['T04']),
  housing('T06', 'side_arch', 2, 29, ['T04']),
  housing('T07', 'capstone', 1, 32, ['T03', 'T04']),
  housing('T08', 'lower_ring', 1, 27, ['T07']),
  housing('T09', 'pillar', 4, 13, ['T08']),
  housing('T10', 'balcony_frame', 4, 9, ['T09']),
  housing('T11', 'railing', 8, 14, ['T10']),
  seated('T12', 'bracket', 'structural', 20, ['T08'], ['bracket_support', 'bracket_support']),
  seated('T13', 'barrel', 'structural', 17, ['T12'], ['spring_barrel']),
  seated('T14', 'spring', 'spring', 18, ['T13'], ['spring_standard']),
  seated('T15', 'drive_shaft', 'shaft', 19, ['T12'], ['shaft_long']),
  seated('T16', 'large_gear', 'spur_gear', 10, ['T13'], ['gear_spur_24_m1'], SPUR_GEAR_IDS),
  seated('T17', 'inter_gear', 'spur_gear', 11, ['T16'], ['gear_spur_10_m1', 'gear_spur_10_m1', 'gear_spur_24_m1'], SPUR_GEAR_IDS),
  seated('T18', 'escape_wheel', 'escapement', 12, ['T17'], ['escapement_wheel']),
  seated('T19', 'anchor', 'escapement', 21, ['T18'], ['escapement_anchor']),
  seated('T20', 'pendulum', 'pendulum', 22, ['T19'], ['pendulum_clock']), // rod (row 22) and bob (row 23) are one swinging file
  housing('T21', 'pendulum_bob', 0, 23, ['T20']), // merged into T20: there is no GLB of the bob alone, so no pieces of its own
  seated('T22', 'hourly_cam', 'cam', 26, ['T15'], ['cam_hourly_chime']),
  seated('T23', 'bell', 'structural', 24, ['T22'], ['clock_bell']),
  housing('T24', 'middle_ring', 1, 8, ['T09']),
  housing('T25', 'window', 4, 7, ['T24']),
  seated('T26', 'clock_face', 'structural', 6, ['T24', 'T15'], ['clock_face']),
  seated('T27', 'clock_hands', 'structural', null, ['T26'], ['clock_hands']),
  housing('T28', 'upper_ring', 1, 5, ['T24']),
  housing('T29', 'roof_arch', 1, 4, ['T28']),
  housing('T30', 'roof', 1, 3, ['T28']),
  housing('T31', 'spire', 4, 2, ['T30']),
  seated('T32', 'winding_key', 'winding_key', null, ['T14'], ['winding_key']),
];

/** Socket ids of one slot: the role for one piece, `role_1`, `role_2` ... for several. */
const socketIdsOf = (slot: ClockTowerSlot): string[] => slot.assets.map((_, i) => (slot.assets.length === 1 ? slot.role : `${slot.role}_${i + 1}`));

const slotById = new Map(CLOCK_TOWER_SLOTS.map((s) => [s.id, s] as const));

/** The sockets of one slot, in piece order. Empty for a structural slot. */
export const socketsOfSlot = (slotId: string): readonly SocketDefinition[] => CLOCK_TOWER_SOCKETS.filter((s) => s.slot === slotId);

export interface ClockTowerSocket extends SocketDefinition {
  readonly slot: string;
}

/** One required socket per piece the game seats (DATA §6; MACHINE_SLOT_MAPPINGS §2 item 4). Structural pieces have none. */
export const CLOCK_TOWER_SOCKETS: readonly ClockTowerSocket[] = CLOCK_TOWER_SLOTS.flatMap((slot) => {
  const ids = socketIdsOf(slot);
  return slot.assets.map(
    (_, i): ClockTowerSocket => ({
      id: ids[i],
      slot: slot.id,
      family: slot.family as PartFamily,
      required: true,
      acceptedPartIds: slot.accepts,
      // Slots build on earlier slots; a slot with no socket (the structural ones) is always there.
      dependencies: slot.dependsOn.flatMap((d) => socketIdsOf(slotById.get(d) as ClockTowerSlot)),
    }),
  );
});

// ---- Mechanism (MACHINE_SLOT_MAPPINGS §5.3) -------------------------------------------------------------------------

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
  triggerEdge('t_anchor_pendulum', 'anchor', 'pendulum'),
];

/** Band of the optional speed target: plus or minus 10 percent, as the Music Box and Carousel targets (MACHINE_TARGET_SPECS). */
export const ESCAPE_TARGET_TOLERANCE = 0.1;

export interface ClockTowerBlueprintOptions {
  /**
   * Off by default, as the approved mapping says (§5.3: "no angular-velocity target; the Clock Tower `runs` when every required
   * socket is filled and the solver finds no jam"). On, the escape wheel must turn at `ESCAPE_WHEEL_RAD_PER_S` plus or minus 10
   * percent, so a wrong gear gives `runs_wrong`. It is owner question Q11; this switch keeps both answers one flag apart.
   */
  readonly escapeTarget?: boolean;
}

/** The correct build: every socket holds its intended part. */
const intended: Readonly<Record<string, string>> = Object.fromEntries(
  CLOCK_TOWER_SLOTS.flatMap((slot) => {
    const ids = socketIdsOf(slot);
    return slot.assets.map((asset, i) => [ids[i], partId(asset)] as const);
  }),
);

/**
 * The two decoys of Letter 6 (DATA §9.1). The worn spring (Letter 2's fault, so the player knows it) and a 12-tooth bevel gear. No
 * socket accepts either, so each goes back to the tray with the red outline and the soft bonk (PRODUCT_SPEC §9). Which parts the owner
 * wants is open (audit A-12). They only show once a socket can be reached by hand: the decoy parts are the second feature cut (ADR-047).
 */
export const CLOCK_TOWER_DECOYS: readonly string[] = [partId('spring_worn'), partId('gear_bevel_12')];

export function clockTowerBlueprint(options: ClockTowerBlueprintOptions = {}): MachineBlueprint {
  return {
    id: 'clock_tower',
    name: 'Clock Tower',
    version: 1,
    sockets: CLOCK_TOWER_SOCKETS,
    connections: CLOCK_TOWER_CONNECTIONS,
    power: { source: 'mainspring', socketId: 'spring' },
    // No speed target by default: the mapping's smallest option, so a wrong gear still runs (owner question Q11).
    targets: options.escapeTarget
      ? { angularVelocity: { escape_wheel: ESCAPE_WHEEL_RAD_PER_S }, tolerance: { escape_wheel: ESCAPE_TARGET_TOLERANCE } }
      : {},
    // COL_Case of clock_tower_base: the base is 9.5 cm wide and 6 cm tall; the shell stands on it when the machine is finished.
    housing: { assetId: 'clock_tower_base', xray: { radius: 0.0475, top: 0.06 } },
    intended,
    tray: trayOf(intended, CLOCK_TOWER_DECOYS),
  };
}

export const CLOCK_TOWER: MachineBlueprint = clockTowerBlueprint();

/** The correct assembly as the solver takes it. */
export const clockTowerCorrectAssembly = (): InstalledPart[] => Object.entries(intended).map(([socketId, id]) => ({ socketId, partId: id }));

/** Solves a Clock Tower assembly. A helper over `solve` so callers cannot forget the catalogue or the power input. */
export const solveClockTower = (installedParts: readonly InstalledPart[], windUnits = 8, blueprint: MachineBlueprint = CLOCK_TOWER): SolveOutcome =>
  solve({ blueprint, installedParts, power: { source: 'mainspring', windUnits }, partCatalogue: SOLVER_CATALOGUE });
