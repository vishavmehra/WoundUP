// The finished Tockton Well (WELL_FOUNTAIN_BLUEPRINT.md; ADR-048): a `MachineRig` the town can carry, place, bake and gift.
//
// Everything that moves is driven by the solver's result, never by a clip:
//  - the spring (with its key), both gears, the cam, the ratchet and both pulleys are rotors of their own sockets (`rig.result.angularVelocity`),
//  - the follower's rod lifts by the pump profile the blueprint's pin edge carries, read at the cam's own angle (`sampleFollowerProfile`, the
//    same function the solver evaluates),
//  - the pawl rocks once for each tooth the ratchet passes and clicks,
//  - the buckets ride the loop of the two pulleys at the idle pulley's speed, tip their water at the top, the basin fills and the jet fires as
//    the rod drops (water.ts).
// The gears need no tooth phase: the 20T has a tooth straight up at rest and the 10T a gap straight down, the way gen_gear_spur.py makes them.
import { sampleFollowerProfile } from '../../sim';
import { WELL, WELL_BELT_RADIUS_M, WELL_PROFILE, WELL_STROKE_M } from '../../content/blueprints';
import type { MaterialRegistry } from '../../materials';
import { axisOfGlb, createHinge, createRotor, turnHinge } from '../../town/motion';
import type { MachineRig, Rotor } from '../../town/motion';
import type { ModelSource } from '../../town/scene';
import { Vector3 } from '@iwsdk/core';
import type { Mesh, Object3D } from '@iwsdk/core';
import { assembleMachine, machineModelPaths } from '../assemble';
import { chainGeometry } from './chain';
import { createWellWater } from './water';
import type { WaterAnchors } from './water';

/** Nodes of `well_base.glb` the fountain is anchored to (BLUEPRINT §8.1). */
export const WELL_NODE = { bucket: 'Bucket_Template', nozzle: 'Well_Nozzle', water: 'Well_WaterLevel' } as const;

/** Where the anchors are when the housing does not carry them (the blueprint's numbers: basin centre (-0.4, -0.3) cm, rim 17.5, jet from 17.6). Warned about. */
const FALLBACK_WATER = new Vector3(-0.004, 0.157, -0.003);
const FALLBACK_NOZZLE = new Vector3(-0.004, 0.176, -0.003);

/** Teeth of `ratchet_wheel` (`wu.teeth`), how far the pawl lifts over one, and the share of a tooth it spends riding up the slope. */
export const RATCHET_TEETH = 16;
export const PAWL_LIFT_RAD = 0.1;
export const PAWL_RAMP = 0.85;

/** The pawl's lift over one tooth, 0 to 1: a slow ride up the ramp, a quick drop into the gap. `f` is the progress through the tooth, 0 to 1. */
export const pawlLift = (f: number): number => (f < PAWL_RAMP ? f / PAWL_RAMP : (1 - f) / (1 - PAWL_RAMP));

/** Every file the finished Well loads, for a warm-up while the player reads the letter. */
export const WELL_MODEL_PATHS: readonly string[] = machineModelPaths(WELL);

const TAU = Math.PI * 2;

/** The node itself or the first mesh under it, or null. */
function firstMesh(node: Object3D | undefined): Mesh | null {
  let found: Mesh | null = null;
  node?.traverse((o) => {
    if (found === null && (o as Mesh).isMesh === true) found = o as Mesh;
  });
  return found;
}

/** The position of a named node of the housing in the housing's own frame, or `fallback` (with a warning) when it has none. */
function anchor(base: Object3D, name: string, fallback: Vector3): Vector3 {
  const node = base.getObjectByName(name);
  if (!node) {
    console.warn(`[wound-up] well_base has no ${name}; its water effect uses the blueprint's position.`);
    return fallback.clone();
  }
  base.updateWorldMatrix(true, true);
  return base.worldToLocal(node.getWorldPosition(new Vector3()));
}

export async function buildWell(source: ModelSource, registry: MaterialRegistry): Promise<MachineRig> {
  const { rig, base, parts } = await assembleMachine(WELL, 'well', source, registry);
  const part = (socket: string): Object3D => parts.get(socket) as Object3D;
  const turn = (socket: string, solverSocket: string = socket): Rotor => {
    const node = part(socket);
    const rotor = createRotor(node, solverSocket, { axis: axisOfGlb(node) });
    rig.rotors.push(rotor);
    return rotor;
  };
  turn('spring');
  turn('key', 'spring'); // the key sits on the spring's arbor and unwinds with it
  turn('drive_gear');
  turn('cam_gear');
  const cam = turn('cam');
  const ratchet = turn('ratchet');
  turn('pulley_drive');
  const idle = turn('pulley_idle');

  // The pump: the follower's rod lifts by the profile of the pin edge at the cam's angle.
  const follower = part('follower');
  const restY = follower.position.y;
  let pose = 0;
  rig.moving.push(follower);
  rig.updaters.push(() => {
    pose = sampleFollowerProfile(WELL_PROFILE.samples, cam.theta);
    follower.position.y = restY + pose;
  });

  // The pawl rocks about its stud once a tooth and clicks as it drops into the next gap.
  const pawl = createHinge(base, 'Part_Pawl');
  if (pawl) {
    rig.moving.push(pawl.node);
    let tooth = 0;
    rig.updaters.push((r) => {
      const progress = (-ratchet.theta * RATCHET_TEETH) / TAU; // teeth passed, counted the way the ratchet turns (clockwise)
      const whole = Math.floor(progress);
      turnHinge(pawl, -PAWL_LIFT_RAD * pawlLift(progress - whole)); // a positive turn would push the hook into the ratchet
      if (whole > tooth && r.speed > 0.3) r.audio?.tick?.((whole & 1) as 0 | 1);
      tooth = whole;
    });
  }

  // The fountain.
  const bucketMesh = firstMesh(base.getObjectByName(WELL_NODE.bucket));
  if (!bucketMesh) console.warn(`[wound-up] well_base has no ${WELL_NODE.bucket}; the bucket chain is left out.`);
  const driveAt = WELL.sockets.find((s) => s.id === 'pulley_drive')?.position as readonly [number, number, number];
  const idleAt = WELL.sockets.find((s) => s.id === 'pulley_idle')?.position as readonly [number, number, number];
  const chain = chainGeometry([driveAt[0], driveAt[1]], [idleAt[0], idleAt[1]], WELL_BELT_RADIUS_M);
  const anchors: WaterAnchors = {
    water: anchor(base, WELL_NODE.water, FALLBACK_WATER),
    nozzle: anchor(base, WELL_NODE.nozzle, FALLBACK_NOZZLE),
    spout: new Vector3(idleAt[0], idleAt[1] + WELL_BELT_RADIUS_M, idleAt[2]),
  };
  const water = createWellWater({ base, bucket: bucketMesh ?? null, chain, chainZ: driveAt[2], anchors, dropAt: 0.8 * WELL_STROKE_M });
  rig.moving.push(...water.nodes);
  let started = false;
  rig.updaters.push((r, dt) => {
    if (!started) {
      started = true;
      if (r.restored) water.settle(); // a saved Well stands there with its basin full
    }
    water.update(dt, pose, -idle.theta * WELL_BELT_RADIUS_M, r.running && r.speed > 0.05);
  });

  rig.bakeable = true;
  return rig;
}
