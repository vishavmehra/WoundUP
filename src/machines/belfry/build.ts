// The finished Tockton Belfry (BELFRY_BLUEPRINT.md; ADR-048): a `MachineRig` the town can carry, place, bake and gift.
//
// Everything that moves is driven by the solver's result: the spring (and its key), the 12T pinion and the 20T gear, bevel A, bevel B, the
// vertical shaft, the flywheel and the vane are rotors of their own sockets; the bell rocks by the profile of the blueprint's pin edge
// (`sampleFollowerProfile`, read at the shaft's own angle: six rocks to a turn) and tolls at each rock's right extreme.
//
// Tooth phase: seen from the front, the pinion has a tooth straight up at rest and the 20T above it must have a gap straight down, which is
// half a pitch (9 degrees) of turn; the two bevels meet along the generatrix that leaves the apex up and towards the player, a tooth of A
// against a gap of B, half a pitch (15 degrees) of turn on B. gen_gear_spur.py and gen_bevel_gear.py put tooth 0 on +X.
import { sampleFollowerProfile } from '../../sim';
import { BELFRY, BELFRY_BELL_PROFILE, BELFRY_ROCKS_PER_TURN } from '../../content/blueprints';
import type { MaterialRegistry } from '../../materials';
import { axisOfGlb, createHinge, createRotor, turnHinge } from '../../town/motion';
import type { MachineRig, Rotor } from '../../town/motion';
import type { ModelSource } from '../../town/scene';
import type { Object3D } from '@iwsdk/core';
import { assembleMachine, machineModelPaths } from '../assemble';

/** Nodes of `clock_bell.glb` the bell rocks about (the Clock Tower's own file): the body about `PIV_Swing`, the clapper about `PIV_Striker`. */
export const BELFRY_BELL_NODE = { bell: 'ClockBell_Bell', swing: 'PIV_Swing', striker: 'ClockBell_Striker', strikerPivot: 'PIV_Striker' } as const;

/** Half a tooth pitch of the 20T (360 / 20 / 2 degrees) and of bevel B (360 / 12 / 2): the rest turn that puts a gap where the neighbour's tooth comes. */
export const DRIVE_GEAR_PHASE_RAD = Math.PI / 20;
export const BEVEL_B_PHASE_RAD = Math.PI / 12;
/** The clapper swings against the bell, this many times as far. */
export const STRIKER_SWING_RATIO = -1.5;

/** Every file the finished Belfry loads, for a warm-up while the player reads the letter. */
export const BELFRY_MODEL_PATHS: readonly string[] = machineModelPaths(BELFRY);

const TAU = Math.PI * 2;

/** The rock number the bell is in when the shaft is at `shaftAngle`: it goes up by one at each right extreme (the profile peaks at a quarter of each rock). */
export const tollIndex = (shaftAngle: number): number => Math.floor((shaftAngle * BELFRY_ROCKS_PER_TURN - Math.PI / 2) / TAU);

export async function buildBelfry(source: ModelSource, registry: MaterialRegistry): Promise<MachineRig> {
  const { rig, base, parts } = await assembleMachine(BELFRY, 'belfry', source, registry);
  const turn = (socket: string, phase = 0, solverSocket: string = socket): Rotor => {
    const node: Object3D = parts.get(socket) as Object3D;
    const rotor = createRotor(node, solverSocket, { axis: axisOfGlb(node), phase });
    rig.rotors.push(rotor);
    return rotor;
  };
  turn('spring');
  turn('key', 0, 'spring'); // the key sits on the spring's arbor and unwinds with it
  turn('pinion');
  turn('drive_gear', DRIVE_GEAR_PHASE_RAD);
  turn('bevel_a');
  turn('bevel_b', BEVEL_B_PHASE_RAD);
  const shaft = turn('shaft');
  turn('flywheel');
  turn('vane');

  // The bell rocks about its gudgeon pins by the profile of the pin edge and tolls at each right extreme; the clapper swings against it.
  const bell = createHinge(base, BELFRY_BELL_NODE.bell, BELFRY_BELL_NODE.swing);
  const striker = createHinge(base, BELFRY_BELL_NODE.striker, BELFRY_BELL_NODE.strikerPivot);
  if (!bell) console.warn(`[wound-up] the Belfry's bell has no ${BELFRY_BELL_NODE.bell} or ${BELFRY_BELL_NODE.swing}; it will not rock.`);
  if (bell) rig.moving.push(bell.node);
  if (striker) rig.moving.push(striker.node);
  let toll = tollIndex(shaft.theta);
  rig.updaters.push((r) => {
    const swing = sampleFollowerProfile(BELFRY_BELL_PROFILE.samples, shaft.theta);
    if (bell) turnHinge(bell, swing);
    if (striker) turnHinge(striker, swing * STRIKER_SWING_RATIO);
    const index = tollIndex(shaft.theta);
    if (index > toll && r.speed > 0.2) r.audio?.toll?.();
    toll = index;
  });

  rig.bakeable = true;
  return rig;
}
