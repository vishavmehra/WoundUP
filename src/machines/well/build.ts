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
import { axisOfGlb, createHinge, createRotor, turnHinge, wuField } from '../../town/motion';
import type { MachineRig, Rotor } from '../../town/motion';
import type { ModelSource } from '../../town/scene';
import { Vector3 } from '@iwsdk/core';
import type { Mesh, Object3D } from '@iwsdk/core';
import { assembleMachine, machineModelPaths } from '../assemble';
import { chainGeometry, distanceToChain } from './chain';
import { createWellWater } from './water';
import type { BucketTemplate, WaterAnchors } from './water';

/**
 * Nodes of `well_base.glb` the fountain is anchored to (`gen_well.py`): the bucket template (a group of two primitives, whose `wu.originMm` is
 * its bottom centre in the housing's frame), the water disc (`wu.baseYMm` and `maxYMm` give the rise), the jet's emitter, the lip the full
 * basin spills over, and the two chain pulleys' centres.
 */
export const WELL_NODE = {
  bucket: 'Bucket_Template',
  water: 'Well_WaterLevel',
  nozzle: 'PIV_Nozzle',
  lip: 'PIV_Spout',
  chainDrive: 'PIV_ChainDrive',
  chainIdle: 'PIV_ChainIdle',
} as const;

/** Where a pivot is when the housing does not carry it: the blueprint's numbers (basin centre (-0.4, -0.3) cm, jet from y 17.6, lip y 16.6 at z 1.36). Warned about. */
const FALLBACK = {
  [WELL_NODE.nozzle]: new Vector3(-0.004, 0.176, -0.003),
  [WELL_NODE.lip]: new Vector3(-0.004, 0.166, 0.0136),
} as const;
/** How far the basin's water rises when the housing does not say (`wu.maxYMm - wu.baseYMm`), metres, and the pool's surface height (`wu.pool.trayMm`, 58 mm). */
const FALLBACK_RISE_M = 0.0078;
const POOL_Y_M = 0.058;

/** Teeth of `ratchet_wheel` (`wu.teeth`), how far the pawl lifts over one, and the share of a tooth it spends riding up the slope. */
export const RATCHET_TEETH = 16;
export const PAWL_LIFT_RAD = 0.1;
export const PAWL_RAMP = 0.85;

/** The pawl's lift over one tooth, 0 to 1: a slow ride up the ramp, a quick drop into the gap. `f` is the progress through the tooth, 0 to 1. */
export const pawlLift = (f: number): number => (f < PAWL_RAMP ? f / PAWL_RAMP : (1 - f) / (1 - PAWL_RAMP));

/** Every file the finished Well loads, for a warm-up while the player reads the letter. */
export const WELL_MODEL_PATHS: readonly string[] = machineModelPaths(WELL);

const TAU = Math.PI * 2;

/** Every mesh under `node` (the node itself when it is one): a glTF mesh with two primitives arrives as a group of two meshes. */
function meshesUnder(node: Object3D | undefined): Mesh[] {
  const found: Mesh[] = [];
  node?.traverse((o) => {
    if ((o as Mesh).isMesh === true) found.push(o as Mesh);
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

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

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

  // The fountain: the chain of the two pulleys, the buckets of the template riding it, the water disc, the jet, the stream and the spill.
  const socketAt = (id: string): Vector3 => new Vector3(...(WELL.sockets.find((s) => s.id === id)?.position as readonly [number, number, number]));
  const driveAt = anchor(base, WELL_NODE.chainDrive, socketAt('pulley_drive'));
  const idleAt = anchor(base, WELL_NODE.chainIdle, socketAt('pulley_idle'));
  const nozzle = anchor(base, WELL_NODE.nozzle, FALLBACK[WELL_NODE.nozzle]);
  const lip = anchor(base, WELL_NODE.lip, FALLBACK[WELL_NODE.lip]);
  const chain = chainGeometry([driveAt.x, driveAt.y], [idleAt.x, idleAt.y], WELL_BELT_RADIUS_M);
  const chainZ = driveAt.z;

  const bucketNode = base.getObjectByName(WELL_NODE.bucket);
  const origin = wuField(bucketNode ?? base, 'originMm') as readonly number[] | undefined;
  const bucketMeshes = meshesUnder(bucketNode);
  let bucket: BucketTemplate | null = null;
  if (bucketMeshes.length === 0 || !origin || origin.length < 3) console.warn(`[wound-up] well_base has no ${WELL_NODE.bucket} with an originMm; the bucket chain is left out.`);
  else {
    const at = new Vector3(origin[0] / 1000, origin[1] / 1000, origin[2] / 1000);
    bucket = { meshes: bucketMeshes, origin: at, offset: distanceToChain(chain, at.x, at.y) };
  }

  const surfaceNode = base.getObjectByName(WELL_NODE.water);
  const surfaces = meshesUnder(surfaceNode);
  if (surfaces.length === 0) console.warn(`[wound-up] well_base has no ${WELL_NODE.water}; the basin shows no water.`);
  const baseY = num(wuField(surfaceNode ?? base, 'baseYMm'));
  const maxY = num(wuField(surfaceNode ?? base, 'maxYMm'));
  const riseM = baseY !== undefined && maxY !== undefined && maxY > baseY ? (maxY - baseY) / 1000 : FALLBACK_RISE_M;
  const anchors: WaterAnchors = {
    nozzle,
    spout: new Vector3(idleAt.x, idleAt.y + WELL_BELT_RADIUS_M, chainZ),
    lip,
    poolY: POOL_Y_M,
  };
  const water = createWellWater({ base, bucket, chain, chainZ, anchors, surface: surfaces[0] ?? null, riseM, dropAt: 0.8 * WELL_STROKE_M });
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
