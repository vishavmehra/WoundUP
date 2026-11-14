// The Tockton Well and Fountain blueprint (WELL_FOUNTAIN_BLUEPRINT.md §2, §3, §7; ADR-048): 11 sockets, a two-to-one speed-up, a cam and
// roller follower for the pump, a pulley and belt for the bucket chain, a ratchet and pawl that click while it turns.
//
//   spring == drive_gear 20T --mesh 20:10--> cam_gear 10T == cam ..pin..> follower        (the pump stroke)
//                                                   |== ratchet ..trigger..> pawl         (click while turning)
//                                                   '== pulley_drive --belt, open--> pulley_idle   (the bucket chain)
//
// `==` shaft, `..pin..>` cam to follower with the profile below, `..trigger..>` activation. Every rotating part turns about an axis
// parallel to Z (towards the player), so every socket pose is the identity except the pawl's. The solver judges the whole thing with the
// five edge types it already has; the one-way action of the ratchet and the jet and water of the fountain are presentation
// (src/machines/well). The positions and the data of every socket are §7.1 of the blueprint document, metres in the machine frame.

import { MACHINE_TARGET_SPECS } from '../../sim';
import type { FollowerProfile, MechanicalConnection } from '../../sim';
import { PULLEY_GROOVE_RADIUS_M } from '../parts/catalogue';
import { partId, SPUR_GEAR_IDS, trayOf } from './shared';
import type { MachineBlueprint, SocketDefinition } from './types';

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];
const IDENTITY: Quat = [0, 0, 0, 1];
/** 230 degrees about +Z (§7.1): the pawl's hook tip lands on the ratchet's 18.5 mm circle at its 100 degree tooth. */
const PAWL_ROTATION: Quat = [0, 0, 0.9063, -0.4226];

const BEARING = partId('bearing_pillow_block');
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

/** §7.1, in assembly order (§10.4): the order the sheet lists the slots in. */
const sockets: readonly SocketDefinition[] = [
  socket('bearing_top', 'structural', 'BearingTop', [BEARING], [0.017, 0.195, 0.0064]),
  socket('drive_gear', 'spur_gear', 'GearDrive', SPUR_GEAR_IDS, [-0.004, 0.036, -0.0114]),
  socket('spring', 'spring', 'Spring', SPRING_IDS, [-0.004, 0.036, 0.0022], ['drive_gear']), // its arbor passes the drive gear's bore
  socket('key', 'winding_key', 'Key', [KEY], [-0.004, 0.036, 0.0092], ['spring']),
  socket('cam_gear', 'spur_gear', 'GearCam', SPUR_GEAR_IDS, [-0.004, 0.0745, -0.0114], ['drive_gear']),
  socket('cam', 'cam', 'Cam', [partId('cam_eccentric')], [-0.004, 0.0745, 0.0012], ['cam_gear']),
  socket('follower', 'follower', 'Follower', [partId('follower_roller')], [-0.004, 0.09, 0.0012], ['cam']),
  socket('ratchet', 'ratchet', 'Ratchet', [partId('ratchet_wheel')], [-0.004, 0.0745, 0.0093], ['cam']),
  socket('pawl', 'pawl', 'Pawl', [partId('pawl_standard')], [0.0149, 0.1081, 0.0093], ['ratchet'], PAWL_ROTATION),
  socket('pulley_drive', 'pulley', 'PulleyDrive', [partId('pulley_standard')], [-0.004, 0.0745, 0.0184], ['ratchet']),
  socket('pulley_idle', 'pulley', 'PulleyIdle', [partId('pulley_standard')], [0.017, 0.195, 0.0184], ['bearing_top', 'pulley_drive']),
];

// ---- The pump stroke (§3.2) -----------------------------------------------------------------------------------------------------

/** The cam's snail (`blender/scripts/gen_cam.py`, `cam_eccentric`): base circle, nose and the angles of its four phases, millimetres and degrees. */
const CAM = { base: 9.5, nose: 15, holdNose: 10, fall: 70, holdBase: 80, rise: 190 } as const;
/** How far the follower's rod lifts at the nose: nose radius minus base radius, 5.5 mm. */
export const WELL_STROKE_M = (CAM.nose - CAM.base) / 1000;
export const WELL_PROFILE_SAMPLES = 72;

/** Radius of the cam from its bore at `deg` (nose on 0): dwell on the nose, fall, dwell on the base circle, slow harmonic rise. */
function snailRadius(deg: number): number {
  const t = ((deg % 360) + 360) % 360;
  const { base, nose, holdNose, fall, holdBase, rise } = CAM;
  if (t <= holdNose || t >= 360 - holdNose) return nose;
  if (t < holdNose + fall) return base + (nose - base) * 0.5 * (1 + Math.cos((Math.PI * (t - holdNose)) / fall));
  if (t <= holdNose + fall + holdBase) return base;
  return base + (nose - base) * 0.5 * (1 - Math.cos((Math.PI * (t - (holdNose + fall + holdBase))) / rise));
}

/**
 * The follower's lift above rest, metres, at the cam's angle (sample i at 360 i / 72 degrees, counter-clockwise positive, so the
 * clockwise-turning cam of the Well reads it backwards). The roller rides on top of the cam, where the contact angle on the cam is 90
 * degrees minus the cam's angle. The cam turns clockwise: the slow 190 degree rise comes first, the rod lifts for about two seconds, holds,
 * and drops in under one (§3.2).
 */
export const WELL_PROFILE: FollowerProfile = {
  samples: Array.from({ length: WELL_PROFILE_SAMPLES }, (_, i) => (snailRadius(90 - (360 * i) / WELL_PROFILE_SAMPLES) - CAM.base) / 1000),
};

// ---- Mechanism (§3.1) ---------------------------------------------------------------------------------------------------------------

const connections: readonly MechanicalConnection[] = [
  { id: 'c_spring_drive', type: 'shaft', from: 'spring', to: 'drive_gear' },
  { id: 'c_stage', type: 'mesh', from: 'drive_gear', to: 'cam_gear' }, // teeth and module are read from the installed parts
  { id: 'c_gear_cam', type: 'shaft', from: 'cam_gear', to: 'cam' },
  { id: 'c_gear_ratchet', type: 'shaft', from: 'cam_gear', to: 'ratchet' },
  { id: 'c_gear_pulley', type: 'shaft', from: 'cam_gear', to: 'pulley_drive' },
  // Open belt (same sense); both radii are the catalogue's groove radius, so the chain runs 1:1.
  { id: 'c_belt', type: 'belt', from: 'pulley_drive', to: 'pulley_idle', parameters: { direction: 1 } },
  { id: 'p_follower', type: 'pin', from: 'cam', to: 'follower', parameters: { profile: WELL_PROFILE } },
  { id: 't_pawl', type: 'trigger', from: 'ratchet', to: 'pawl' },
];

/** §3.2: 0.8 rad/s times 20/10 = 1.6 rad/s at the cam, the ratchet and both pulleys, clockwise seen from the player. */
const intended: Readonly<Record<string, string>> = {
  bearing_top: BEARING,
  drive_gear: partId('gear_spur_20_m1'),
  spring: partId('spring_standard'),
  key: KEY,
  cam_gear: partId('gear_spur_10_m1'),
  cam: partId('cam_eccentric'),
  follower: partId('follower_roller'),
  ratchet: partId('ratchet_wheel'),
  pawl: partId('pawl_standard'),
  pulley_drive: partId('pulley_standard'),
  pulley_idle: partId('pulley_standard'),
};

/** Groove radius of both pulleys, metres (their belt ratio is 1): the bucket chain runs round it. Exported for the chain's path. */
export const WELL_BELT_RADIUS_M = PULLEY_GROOVE_RADIUS_M;

export const WELL: MachineBlueprint = {
  id: 'well',
  name: 'Well and Fountain',
  version: 1,
  sockets,
  connections,
  power: { source: 'mainspring', socketId: 'spring' },
  // §3.2: the cam at 1.6 rad/s plus or minus 10 percent. No `minRunSeconds`: the worn spring runs, so the Well's repair is a gear (§10.3).
  targets: {
    angularVelocity: { cam: MACHINE_TARGET_SPECS.wellCam.angularVelocity },
    tolerance: { cam: MACHINE_TARGET_SPECS.wellCam.tolerance },
  },
  // COL_Case of the housing (§7.2): 6.6 x 23.0 x 5.2 cm.
  housing: { assetId: 'well_base', xray: { radius: 0.033, top: 0.23 } },
  intended,
  // Letter 7, two decoys (§10.2): 16T and 12T give 1.000 and 1.333 rad/s in the cam gear socket, all `runs_wrong`.
  tray: trayOf(intended, [partId('gear_spur_16_m1'), partId('gear_spur_12_m1')]),
};

/**
 * Nodes of `well_base.glb` that cover the works from above and at the corners (BLUEPRINT §8.1): the generic X-ray fade lifts them while
 * the palm is over the machine. The plate behind, the slab, the basin, the pool and the chute are not shell: the front is open, and the
 * water is what the machine is for.
 */
export const WELL_SHELL_NODES: readonly string[] = ['Well_Roof', 'Well_Posts'];
