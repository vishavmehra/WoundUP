// The Tockton Belfry blueprint (BELFRY_BLUEPRINT.md §2, §3, §7; ADR-048): 11 sockets, a 0.6 reduction, a right-angle bevel drive and an
// 18 cm vertical shaft that carries the motion up the tower to a flywheel, a weathervane and a rocking bell.
//
//   spring == pinion 12T --mesh 12:20--> drive_gear 20T == bevel_a --mesh 12:12 (90 degrees)--> bevel_b == shaft == flywheel
//                                                                                                          |== vane   (output)
//                                                                                                          '..pin (profile)..> bell
//
// Sign rule (§1): the solver's speed of a socket is about the part's own local +Z, so the sockets joined by a shaft edge share one axis
// direction. The reduction train turns about Z, towards the player; the axes of the bevel pair cross at the apex of the rule (-0.5, 10.0, 1.17)
// cm, and each gear sits out from it along its own axis (A 1.0 mm back, B 2.4 mm up) because the library `gear_bevel_12` digs 0.95 mm into its
// partner's root at every phase when both cones touch (blender/scripts/bevel_fit.py: clear over a whole tooth pitch with 0.42 mm to spare out
// there); the vertical shaft, bevel B, the flywheel and the vane turn about -Y, which is a local +Z turned by `RX_PLUS` below. The shaft is the
// bell's cam: the pin's profile is 0.12 rad times sin(6 times the shaft angle), six rocks to a turn.

import { MACHINE_TARGET_SPECS } from '../../sim';
import type { FollowerProfile, MechanicalConnection } from '../../sim';
import { MUSIC_BOX_MIN_RUN_SECONDS } from './music-box';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];
const IDENTITY: Quat = [0, 0, 0, 1];
/** Rx(+90 degrees) (§7.1): turns a part's local +Z onto -Y, the axis of the vertical shaft. */
const RX_PLUS: Quat = [0.7071068, 0, 0, 0.7071068];

const BEARING = partId('bearing_pillow_block');
const BEVEL = partId('gear_bevel_12');
const SPRING_IDS = [partId('spring_standard'), partId('spring_worn')];
const KEY = partId('winding_key');

const socket = (
  id: string,
  family: SocketDefinition['family'],
  node: string,
  accepts: readonly string[],
  position: Vec3,
  dependencies: readonly string[] = [],
  rotation: Quat = IDENTITY,
): SocketDefinition => ({ id, family, node, required: true, acceptedPartIds: accepts, dependencies, position, rotation });

/** §7.1, in assembly order (§10.4). */
const sockets: readonly SocketDefinition[] = [
  socket('pinion', 'spur_gear', 'GearPinion', SPUR_GEAR_IDS, [-0.005, 0.059, -0.0144]),
  socket('spring', 'spring', 'Spring', SPRING_IDS, [-0.005, 0.059, -0.0008], ['pinion']),
  socket('key', 'winding_key', 'Key', [KEY], [-0.005, 0.059, 0.0062], ['spring']),
  socket('drive_gear', 'spur_gear', 'GearDrive', SPUR_GEAR_IDS, [-0.005, 0.1, -0.0144], ['pinion']),
  socket('bevel_b', 'bevel_gear', 'BevelB', [BEVEL], [-0.005, 0.1124, 0.0117], [], RX_PLUS), // 2.4 mm up the axis from the apex (10.0 cm)
  socket('bevel_a', 'bevel_gear', 'BevelA', [BEVEL], [-0.005, 0.1, 0.0007], ['drive_gear', 'bevel_b']), // 1.0 mm back along -Z from the apex (z 1.17 cm)
  socket('bearing_foot', 'structural', 'BearingFoot', [BEARING], [-0.005, 0.128, 0.0117], [], RX_PLUS),
  socket('flywheel', 'flywheel', 'Flywheel', [partId('flywheel_standard')], [-0.005, 0.175, 0.0117], [], RX_PLUS),
  // The shaft goes in from above through the cap, the flywheel, the bearing and bevel B's bore, so it waits for all three.
  socket('shaft', 'shaft', 'Shaft', [partId('shaft_long')], [-0.005, 0.194, 0.0117], ['bevel_b', 'bearing_foot', 'flywheel'], RX_PLUS),
  socket('vane', 'vane', 'Vane', [partId('belfry_vane')], [-0.005, 0.28, 0.0117], ['shaft'], RX_PLUS),
  socket('bell', 'structural', 'Bell', [partId('clock_bell')], [0.02, 0.27, 0.0]),
];

// ---- The bell (§3.1) ------------------------------------------------------------------------------------------------------------------

/** Rocks of the bell to one turn of the shaft, and how far it swings each side of vertical, radians (§3.1). */
export const BELFRY_ROCKS_PER_TURN = 6;
export const BELFRY_BELL_SWING_RAD = 0.12;
const BELL_PROFILE_SAMPLES = 72;

/** 0.12 rad times sin(6 times the shaft angle), 72 samples: the pose the solver gives the bell, which the housing's rocker follows. */
export const BELFRY_BELL_PROFILE: FollowerProfile = {
  samples: Array.from({ length: BELL_PROFILE_SAMPLES }, (_, i) => BELFRY_BELL_SWING_RAD * Math.sin((2 * Math.PI * BELFRY_ROCKS_PER_TURN * i) / BELL_PROFILE_SAMPLES)),
};

const connections: readonly MechanicalConnection[] = [
  { id: 'c_spring_pinion', type: 'shaft', from: 'spring', to: 'pinion' },
  { id: 'c_stage', type: 'mesh', from: 'pinion', to: 'drive_gear' },
  { id: 'c_gear_bevel', type: 'shaft', from: 'drive_gear', to: 'bevel_a' },
  { id: 'c_bevel', type: 'mesh', from: 'bevel_a', to: 'bevel_b' }, // both 12 teeth, one module token: 1:1, and it reverses
  { id: 'c_bevel_shaft', type: 'shaft', from: 'bevel_b', to: 'shaft' },
  { id: 'c_shaft_flywheel', type: 'shaft', from: 'shaft', to: 'flywheel' },
  { id: 'c_shaft_vane', type: 'shaft', from: 'shaft', to: 'vane' },
  { id: 'p_bell', type: 'pin', from: 'shaft', to: 'bell', parameters: { profile: BELFRY_BELL_PROFILE } },
];

/** §3.2: 0.8 rad/s times 12/20 is 0.48 rad/s at the vane (13.1 s a turn). */
const intended: Readonly<Record<string, string>> = {
  pinion: partId('gear_spur_12_m1'),
  spring: partId('spring_standard'),
  key: KEY,
  drive_gear: partId('gear_spur_20_m1'),
  bevel_b: BEVEL,
  bevel_a: BEVEL,
  bearing_foot: BEARING,
  flywheel: partId('flywheel_standard'),
  shaft: partId('shaft_long'),
  vane: partId('belfry_vane'),
  bell: partId('clock_bell'),
};

export const BELFRY: MachineBlueprint = {
  id: 'belfry',
  name: 'Belfry',
  version: 1,
  sockets,
  connections,
  power: { source: 'mainspring', socketId: 'spring' },
  // §3.2: the vane at 0.48 rad/s plus or minus 10 percent, and at least half a cylinder turn's worth of spring (the Music Box's rule), so
  // the worn spring is `runs_wrong` with `runSeconds` (Letter 2's lesson in a new machine, §10.3).
  targets: {
    angularVelocity: { vane: MACHINE_TARGET_SPECS.belfryVane.angularVelocity },
    tolerance: { vane: MACHINE_TARGET_SPECS.belfryVane.tolerance },
    minRunSeconds: MUSIC_BOX_MIN_RUN_SECONDS,
  },
  // COL_Case of the housing (§7.2): 7.6 x 27.6 x 5.8 cm (the vane and the flywheel overhang it as parts).
  housing: { assetId: 'belfry_base', xray: { radius: 0.038, top: 0.276 } },
  intended,
  // Letter 8, two decoys (§10.2): 16T and 24T; the best wrong pair, 16T to 24T, gives 0.533 rad/s, 11.1 percent too fast.
  tray: trayOf(intended, [partId('gear_spur_16_m1'), partId('gear_spur_24_m1')]),
};

/**
 * What of `belfry_base.glb` the blueprint calls the shell, kept as the contract test's check that the body mesh has the cap's and the arcade's
 * primitives. The X-ray fade does not read it: it fades by mesh-name prefix (`XRAY_SHELL` in town/xray-view.ts, `Belfry_Plinth_`), so every
 * primitive of the body mesh fades (plinth, plate, posts, beam, arcade, cap) and the train, the shaft, the flywheel, the vane and the bell stay
 * solid. The file has one body mesh, `Belfry_Plinth`, with one primitive per library material; the teal one is the cap, the painted-wood one
 * the arcade.
 */
export const BELFRY_SHELL = { node: 'Belfry_Plinth', materials: ['Mat_TealPaint', 'Mat_PaintedWood'] } as const;
