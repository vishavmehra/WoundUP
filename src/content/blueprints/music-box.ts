// The Music Box blueprint (MUSIC_BOX_BLUEPRINT.md, proposed by the lead, awaiting owner approval): 12 required sockets, a
// two-stage train, the mainspring as the power source. Section numbers below are that document's.
//
//   main_spring == spring_pinion 10T --mesh--> cylinder_wheel 20T == arbor == cylinder          (stage 1: 0.8 to -0.4 rad/s)
//                                                                       \== governor_wheel 16T --mesh--> governor_pinion 12T == governor (stage 2)
//
// Choices where the document leaves a value open (also in the gaps list of the hand-over):
//  - Spring constants: option B of §4.2 (drain on the spring part), see content/parts/catalogue.ts. src/sim's REFERENCE_* constants
//    are option A (one drain rate, 10 s at full wind); both give the worn spring 1.5 s.
//  - `minRunSeconds`: §4.4, half of the 15.708 s a full wind plays, so the worn spring is `runs_wrong` and the standard one `runs`.
//  - Gear spacing: +1.0 mm on both gear pairs (straight-flank teeth, measured at Gate F), see `positioned`.

import { MACHINE_TARGET_SPECS } from '../../sim';
import type { MechanicalConnection } from '../../sim';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

/** §4.4: at least this long at eight wind units, seconds. Half of one cylinder turn at 0.4 rad/s (2 pi / 0.4 = 15.708 s). */
export const MUSIC_BOX_MIN_RUN_SECONDS = 7.854;

/** Gate F: straight-flank teeth need more room than the pitch distance, metres added to the centre distance of each gear pair. */
export const GEAR_SPACING_EXTRA_M = 0.001;

type Vec3 = readonly [number, number, number];

/** Music Box frame, §7.1 as written: metres, +X right, +Y up, +Z towards the player. */
const DOC_POSITION: Readonly<Record<string, Vec3>> = {
  bracket_left: [-0.0388, 0.035, -0.0105],
  bracket_right: [0.0278, 0.035, -0.0105],
  arbor: [-0.0055, 0.035, -0.0105],
  cylinder: [-0.0055, 0.035, -0.0105],
  comb: [-0.0055, 0.035, 0.006],
  cylinder_wheel: [0.0394, 0.035, -0.0105],
  governor_wheel: [-0.0504, 0.035, -0.0105],
  main_spring: [0.053, 0.0532, 0.0223],
  spring_pinion: [0.0394, 0.0532, 0.0223],
  governor: [-0.0358, 0.0514, 0.0204],
  governor_pinion: [-0.0504, 0.0514, 0.0204],
  winding_key: [0.06, 0.0532, 0.0223],
};

/** The driving axes move away from the cylinder arbor along each line of centres; the arbor, its brackets and its gears stay. */
const SPRING_AXIS_GROUP = ['main_spring', 'spring_pinion', 'winding_key'] as const;
const GOVERNOR_AXIS_GROUP = ['governor', 'governor_pinion'] as const;
const CYLINDER_AXIS_YZ = [DOC_POSITION.arbor[1], DOC_POSITION.arbor[2]] as const;

const round7 = (v: number): number => Math.round(v * 1e7) / 1e7;

/** Socket positions with `GEAR_SPACING_EXTRA_M` added to both centre distances (10T-20T: 37.51 to 38.51 mm; 16T-12T: 34.98 to 35.98 mm). */
function positioned(): Record<string, Vec3> {
  const out: Record<string, Vec3> = { ...DOC_POSITION };
  const shift = (group: readonly string[], pinion: string): void => {
    const [, py, pz] = DOC_POSITION[pinion];
    const dy = py - CYLINDER_AXIS_YZ[0];
    const dz = pz - CYLINDER_AXIS_YZ[1];
    const length = Math.hypot(dy, dz);
    for (const id of group) {
      const [x, y, z] = DOC_POSITION[id];
      out[id] = [x, round7(y + (dy / length) * GEAR_SPACING_EXTRA_M), round7(z + (dz / length) * GEAR_SPACING_EXTRA_M)];
    }
  };
  shift(SPRING_AXIS_GROUP, 'spring_pinion');
  shift(GOVERNOR_AXIS_GROUP, 'governor_pinion');
  return out;
}
const POSITION = positioned();

/** `R_X` of §1: turns a part's local +Z onto the Music Box +X, the axis every moving part here spins about. */
const R_X = [0, 0.7071068, 0, 0.7071068] as const;
const IDENTITY = [0, 0, 0, 1] as const;

const socket = (
  id: string,
  family: SocketDefinition['family'],
  node: string,
  accepts: readonly string[],
  dependencies: readonly string[] = [],
  rotation: SocketDefinition['rotation'] = R_X,
): SocketDefinition => ({ id, family, node, required: true, acceptedPartIds: accepts, dependencies, position: POSITION[id], rotation });

const BRACKET = partId('bracket_support');
const STANDARD_SPRING = partId('spring_standard');
const WORN_SPRING = partId('spring_worn');

// §7.1, in slot order.
const sockets: readonly SocketDefinition[] = [
  socket('bracket_left', 'structural', 'BracketL', [BRACKET]),
  socket('bracket_right', 'structural', 'BracketR', [BRACKET]),
  socket('arbor', 'shaft', 'Arbor', [partId('shaft_short')], ['bracket_left', 'bracket_right']),
  socket('cylinder', 'cylinder', 'Cylinder', [partId('cylinder_music_box')], ['arbor']),
  socket('comb', 'comb', 'Comb', [partId('comb_music_box')], [], IDENTITY),
  socket('cylinder_wheel', 'spur_gear', 'GearB', SPUR_GEAR_IDS, ['arbor']),
  socket('governor_wheel', 'spur_gear', 'GearC', SPUR_GEAR_IDS, ['arbor']),
  socket('main_spring', 'spring', 'Spring', [STANDARD_SPRING, WORN_SPRING]),
  socket('spring_pinion', 'spur_gear', 'GearA', SPUR_GEAR_IDS, ['main_spring']),
  socket('governor', 'governor', 'Governor', [partId('governor_standard')]),
  socket('governor_pinion', 'spur_gear', 'GearD', SPUR_GEAR_IDS, ['governor']),
  socket('winding_key', 'winding_key', 'Key', [partId('winding_key')], ['main_spring']),
];

// §3.1. Teeth and module are read from the installed parts, so a wrong gear runs wrong instead of being ignored.
const connections: readonly MechanicalConnection[] = [
  { id: 'c_spring_pinion', type: 'shaft', from: 'main_spring', to: 'spring_pinion' },
  { id: 'c_stage1', type: 'mesh', from: 'spring_pinion', to: 'cylinder_wheel' },
  { id: 'c_wheel_arbor', type: 'shaft', from: 'cylinder_wheel', to: 'arbor' },
  { id: 'c_arbor_cylinder', type: 'shaft', from: 'arbor', to: 'cylinder' },
  { id: 'c_arbor_govwheel', type: 'shaft', from: 'arbor', to: 'governor_wheel' },
  { id: 'c_stage2', type: 'mesh', from: 'governor_wheel', to: 'governor_pinion' },
  { id: 'c_govpinion_governor', type: 'shaft', from: 'governor_pinion', to: 'governor' },
];

/** §3.2: the correct build. The governor gears are 16T on the arbor driving 12T on the governor. */
const intended: Readonly<Record<string, string>> = {
  bracket_left: BRACKET,
  bracket_right: BRACKET,
  arbor: partId('shaft_short'),
  cylinder: partId('cylinder_music_box'),
  comb: partId('comb_music_box'),
  cylinder_wheel: partId('gear_spur_20_m1'),
  governor_wheel: partId('gear_spur_16_m1'),
  main_spring: STANDARD_SPRING,
  spring_pinion: partId('gear_spur_10_m1'),
  governor: partId('governor_standard'),
  governor_pinion: partId('gear_spur_12_m1'),
  winding_key: partId('winding_key'),
};

export const MUSIC_BOX: MachineBlueprint = {
  id: 'music_box',
  name: 'Music Box',
  version: 1,
  sockets,
  connections,
  power: { source: 'mainspring', socketId: 'main_spring' },
  targets: {
    angularVelocity: { cylinder: MACHINE_TARGET_SPECS.musicBoxCylinder.angularVelocity },
    tolerance: { cylinder: MACHINE_TARGET_SPECS.musicBoxCylinder.tolerance },
    minRunSeconds: MUSIC_BOX_MIN_RUN_SECONDS,
  },
  housing: { assetId: 'music_box_case', xray: { radius: 0.065, top: 0.1 } },
  intended,
  tray: trayOf(intended), // §9.1: Letter 1, no decoys
};
