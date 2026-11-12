// The Windmill blueprint (MACHINE_SLOT_MAPPINGS.md §4, option W-a: ambient wind only, no spring and no key).
//
//   rotor (wind, 1.2 rad/s) == bevel_hub <--mesh 12:12--> bevel_shaft == main_shaft == pinion 12T --mesh 12:24--> gear_24 == millstone
//
// `gear_24` is "the designated 24-tooth position" of the Letter 5 repair (PRODUCT_SPEC §8): a 12T gear there turns the
// millstone twice as fast (1.2 rad/s) and the solver says `runs_wrong`.
//
// Only the sockets whose parts exist are here: 11 sockets for the document's slots W05 to W09, W21 (the sails GLB holds the hub,
// the blades and the cap: W21, W23, W24) and W22. The tower is one pre-built GLB, so W10 to W20 (a K1 set of 15 piece kinds with no
// GLB and no part id yet) have no socket (gap). No socket has a position: §8 defers them until after the Music Box milestone.

import { MACHINE_TARGET_SPECS } from '../../sim';
import type { MechanicalConnection } from '../../sim';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

/** §4.5: the deterministic, blueprint-defined wind input of the sails (SOLVER §12.2), rad/s. One turn every 5.24 s. */
export const WINDMILL_WIND_RAD_S = 1.2;

const BEARING = partId('bearing_pillow_block');
const BEVEL = partId('gear_bevel_12');

const socket = (
  id: string,
  family: SocketDefinition['family'],
  accepts: readonly string[],
  dependencies: readonly string[] = [],
  node?: string,
): SocketDefinition => ({ id, family, required: true, acceptedPartIds: accepts, dependencies, ...(node === undefined ? {} : { node }) });

const sockets: readonly SocketDefinition[] = [
  socket('tower', 'structural', [partId('windmill_tower')], [], 'Tower'), // SOCKET_Tower of the base
  socket('bearing_floor', 'structural', [BEARING]), // W05
  socket('bearing_deck', 'structural', [BEARING]),
  socket('main_shaft', 'shaft', [partId('shaft_long')], ['bearing_floor', 'bearing_deck']), // W06
  socket('pinion', 'spur_gear', SPUR_GEAR_IDS, ['main_shaft']), // W07, 12T intended
  socket('millstone', 'structural', [partId('windmill_millstone')], [], 'Millstone'), // W08
  socket('gear_24', 'spur_gear', SPUR_GEAR_IDS, ['pinion', 'millstone']), // W09, the designated 24T position
  socket('bevel_shaft', 'bevel_gear', [BEVEL], ['main_shaft']), // W22, on top of the main shaft
  socket('rotor', 'structural', [partId('windmill_sails')], ['tower'], 'Rotor'), // W21: SOCKET_Rotor of the tower; the wind drives it
  socket('bevel_hub', 'bevel_gear', [BEVEL], ['rotor', 'bevel_shaft']), // W22, on the hub's axle
];

const connections: readonly MechanicalConnection[] = [
  { id: 'c_rotor_bevel', type: 'shaft', from: 'rotor', to: 'bevel_hub' },
  { id: 'c_bevel', type: 'mesh', from: 'bevel_hub', to: 'bevel_shaft' },
  { id: 'c_bevel_shaft', type: 'shaft', from: 'bevel_shaft', to: 'main_shaft' },
  { id: 'c_main_pinion', type: 'shaft', from: 'main_shaft', to: 'pinion' },
  { id: 'c_stage', type: 'mesh', from: 'pinion', to: 'gear_24' },
  { id: 'c_gear_millstone', type: 'shaft', from: 'gear_24', to: 'millstone' },
];

/** §4.5: 1.2 x 12/12 x 12/24 = 0.6 rad/s. */
const intended: Readonly<Record<string, string>> = {
  tower: partId('windmill_tower'),
  bearing_floor: BEARING,
  bearing_deck: BEARING,
  main_shaft: partId('shaft_long'),
  pinion: partId('gear_spur_12_m1'),
  millstone: partId('windmill_millstone'),
  gear_24: partId('gear_spur_24_m1'),
  bevel_shaft: BEVEL,
  rotor: partId('windmill_sails'),
  bevel_hub: BEVEL,
};

export const WINDMILL: MachineBlueprint = {
  id: 'windmill',
  name: 'Windmill',
  version: 1,
  sockets,
  connections,
  power: { source: 'ambient_wind', socketId: 'rotor', angularVelocity: WINDMILL_WIND_RAD_S },
  targets: {
    angularVelocity: { millstone: MACHINE_TARGET_SPECS.windmillMillstone.angularVelocity },
    tolerance: { millstone: MACHINE_TARGET_SPECS.windmillMillstone.tolerance },
  },
  // COL_Case of the tower (origin on the deck, 3.5 cm up) and the base: 9.5 cm wide, about 23 cm tall.
  housing: { assetId: 'windmill_base', xray: { radius: 0.0475, top: 0.23 } },
  intended,
  // Letter 4, two decoys (MACHINE_SLOT_MAPPINGS §6): in the 24T position they give 0.900 and 0.720 rad/s, both `runs_wrong`.
  tray: trayOf(intended, [partId('gear_spur_16_m1'), partId('gear_spur_20_m1')]),
};
