// The Carousel blueprint (MACHINE_SLOT_MAPPINGS.md §3, proposed by the lead, awaiting owner approval).
//
//   spring == bevel_arbor <--mesh 12:12--> bevel_key == key                                  (the winding path)
//   spring == drive_pinion 10T --mesh--> drive_gear 16T == central_shaft == platform          (0.8 to 0.5 rad/s)
//   platform --pin (profile)--> horse_0, horse_1, horse_2                                    (rise and fall, 120 degrees apart)
//
// Only the sockets whose parts exist (catalogue and GLB) are here: 24 sockets for the document's slots C04 to C11, C13, C14,
// C17, C18 and C20. Slots C01 to C03, C12, C15, C16 and C19 (base ring, feet, base panels, poles, upper ring, frieze ring,
// finial) are K1 pieces with no GLB and no part id yet, so they have no socket (gap). No socket has a position: §8 defers them
// until after the Music Box milestone. Lamps and horses are one socket per piece (§2 consequence 4, question Q3).

import { MACHINE_TARGET_SPECS } from '../../sim';
import type { FollowerProfile, MechanicalConnection } from '../../sim';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

/** §3.5: horses travel +-0.6 cm (TOCKTON §11), one rise and fall per platform turn, metres. */
export const HORSE_TRAVEL_M = 0.006;
const HORSE_PROFILE_SAMPLES = 12;
const HORSE_COUNT = 3;
const LAMP_COUNT = 6;

const BEARING = partId('bearing_pillow_block');
const BRACKET = partId('bracket_support');
const BEVEL = partId('gear_bevel_12');
const SPRING_IDS = [partId('spring_standard'), partId('spring_worn')];
const KEY = partId('winding_key');
const HORSE = partId('carousel_horse');
const LAMP = partId('carousel_lamp');

const socket = (
  id: string,
  family: SocketDefinition['family'],
  accepts: readonly string[],
  dependencies: readonly string[] = [],
  node?: string,
): SocketDefinition => ({ id, family, required: true, acceptedPartIds: accepts, dependencies, ...(node === undefined ? {} : { node }) });

const indexed = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

const sockets: readonly SocketDefinition[] = [
  socket('bearing_floor', 'structural', [BEARING]), // C04
  socket('bearing_deck', 'structural', [BEARING]),
  socket('bracket_left', 'structural', [BRACKET]), // C05
  socket('bracket_right', 'structural', [BRACKET]),
  socket('spring', 'spring', SPRING_IDS, ['bracket_left', 'bracket_right']), // C06
  socket('bevel_arbor', 'bevel_gear', [BEVEL], ['spring']), // C07, the pair that turns the key onto the arbor
  socket('bevel_key', 'bevel_gear', [BEVEL], ['spring']),
  socket('drive_pinion', 'spur_gear', SPUR_GEAR_IDS, ['spring']), // C08, 10T intended
  socket('central_shaft', 'shaft', [partId('shaft_short')], ['bearing_floor', 'bearing_deck']), // C09
  socket('drive_gear', 'spur_gear', SPUR_GEAR_IDS, ['drive_pinion', 'central_shaft']), // C10, the 16T position
  socket('platform', 'structural', [partId('carousel_platform')], ['central_shaft']), // C11
  ...indexed(HORSE_COUNT).map((i) => socket(`horse_${i}`, 'follower', [HORSE], ['platform'])), // C13
  socket('column', 'structural', [partId('carousel_column')], ['platform']), // C14
  socket('canopy', 'structural', [partId('carousel_canopy')], ['column']), // C18
  ...indexed(LAMP_COUNT).map((i) => socket(`lamp_${i}`, 'structural', [LAMP], ['canopy'], `Lamp${i}`)), // C17: SOCKET_Lamp0..5 of the canopy GLB
  socket('key', 'winding_key', [KEY], ['bevel_key']), // C20
];

/** One rise and fall per cam turn, `phase` radians late: the profile of a pin-driven follower (SOLVER §8.4). */
function horseProfile(phase: number): FollowerProfile {
  return {
    samples: Array.from({ length: HORSE_PROFILE_SAMPLES }, (_, k) => HORSE_TRAVEL_M * Math.sin((2 * Math.PI * k) / HORSE_PROFILE_SAMPLES - phase)),
  };
}

const connections: readonly MechanicalConnection[] = [
  { id: 'c_spring_pinion', type: 'shaft', from: 'spring', to: 'drive_pinion' },
  { id: 'c_spring_bevel', type: 'shaft', from: 'spring', to: 'bevel_arbor' },
  { id: 'c_bevel', type: 'mesh', from: 'bevel_arbor', to: 'bevel_key' },
  { id: 'c_bevel_key', type: 'shaft', from: 'bevel_key', to: 'key' },
  { id: 'c_stage', type: 'mesh', from: 'drive_pinion', to: 'drive_gear' },
  { id: 'c_drive_shaft', type: 'shaft', from: 'drive_gear', to: 'central_shaft' },
  { id: 'c_shaft_platform', type: 'shaft', from: 'central_shaft', to: 'platform' },
  ...indexed(HORSE_COUNT).map(
    (i): MechanicalConnection => ({
      id: `c_horse_${i}`,
      type: 'pin',
      from: 'platform',
      to: `horse_${i}`,
      parameters: { profile: horseProfile((2 * Math.PI * i) / HORSE_COUNT) },
    }),
  ),
];

/** §3.5: 10T on the spring arbor drives the 16T on the central shaft, 0.8 x 10/16 = 0.5 rad/s. */
const intended: Readonly<Record<string, string>> = {
  bearing_floor: BEARING,
  bearing_deck: BEARING,
  bracket_left: BRACKET,
  bracket_right: BRACKET,
  spring: partId('spring_standard'),
  bevel_arbor: BEVEL,
  bevel_key: BEVEL,
  drive_pinion: partId('gear_spur_10_m1'),
  central_shaft: partId('shaft_short'),
  drive_gear: partId('gear_spur_16_m1'),
  platform: partId('carousel_platform'),
  ...Object.fromEntries(indexed(HORSE_COUNT).map((i) => [`horse_${i}`, HORSE] as const)),
  column: partId('carousel_column'),
  canopy: partId('carousel_canopy'),
  ...Object.fromEntries(indexed(LAMP_COUNT).map((i) => [`lamp_${i}`, LAMP] as const)),
  key: KEY,
};

export const CAROUSEL: MachineBlueprint = {
  id: 'carousel',
  name: 'Carousel',
  version: 1,
  sockets,
  connections,
  power: { source: 'mainspring', socketId: 'spring' },
  targets: {
    angularVelocity: { platform: MACHINE_TARGET_SPECS.carouselPlatform.angularVelocity },
    tolerance: { platform: MACHINE_TARGET_SPECS.carouselPlatform.tolerance },
  },
  // COL_Case of the canopy: the machine is 13.5 cm wide and 18 cm tall (TOCKTON_DIMENSIONS §11).
  housing: { assetId: 'carousel_base', xray: { radius: 0.0675, top: 0.18 } },
  intended,
  // Letter 3, two decoys (DATA §9.1; MACHINE_SLOT_MAPPINGS §6): in the 16T position they give 0.667 and 0.400 rad/s, both `runs_wrong`.
  tray: trayOf(intended, [partId('gear_spur_12_m1'), partId('gear_spur_20_m1')]),
};
