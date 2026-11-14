// Assembles the finished Clock Tower from its GLBs, the way src/town/machines.ts assembles the other three: a `MachineRig` the town
// can carry, place and gift. Three.js only (no ECS), so Vitest runs it on the real files. The nodes `ClockTowerNodes` turns
// (rig.ts) live inside it; the game puts a `ClockTowerRig` component on the entity that owns `rig.root`.
//
// Mounts. The tower GLBs carry few of them: the shell has `SOCKET_Face` and `SOCKET_Bell`, the face has `SOCKET_Hands`, the base has
// `SOCKET_BaseHandle`, and that is all (checked against the files, 2026-11-14). The movement has no mount, so its place is
// `movement.ts`, measured from the files: the escapement (wheel, anchor, pendulum) in the capstone's opening and the belfry, the
// going train (three gears, the barrel and the spring) behind it in the base, the drive shaft and the cam on a rod in the front left
// corner. Every movement part is inside the tower and touches no part of its shell (tests/machines/clock-tower/clearance.test.ts).
//
// Node names, for the X-ray effect and the rig. Children of the root `ClockTowerBase`:
//   `ClockTowerShell`    the tower above the base: roof, rings, windows, pillars, balcony. Everything under it is shell, so it can be faded whole.
//   `ClockTowerDial`     the face with the hands under it. `ClockTowerBell` the bell. Both stand where the shell mounts them but are not under it.
//   `ClockTowerMovement` everything that moves and stays inside: the escapement, the train, the rod. Never faded.
//   `ClockTowerBaseWalls_<material>` the walls of the base (steps up the arch, capstone, corner blocks); its floor and step are the
//   meshes `ClockTowerBase_Platform` and `ClockTowerBase_Step`, and the base handle is the brass model beside `SOCKET_BaseHandle`.
// The still parts are baked (bake.ts): one mesh per material, so the tower is about 33 draw calls and not 53.
import { Group } from 'three';
import type { Mesh, Object3D } from 'three';
import { applyLibraryMaterials } from '../../materials';
import type { MaterialRegistry } from '../../materials';
import { createRig } from '../../town/motion';
import type { MachineRig } from '../../town/motion';
import type { ModelSource } from '../../town/scene';
import { bakeStatic, isUnder } from './bake';
import { MOVEMENT, MOVEMENT_PARTS, MOVEMENT_SCALE, movementNodeName, trainRatios } from './movement';

const TOCKTON = 'tockton/clock_tower/';
const SHARED = 'shared/';
export const CLOCK_TOWER_MODEL = {
  base: `${TOCKTON}clock_tower_base.glb`,
  shell: `${TOCKTON}clock_tower_shell.glb`,
  face: `${TOCKTON}clock_face.glb`,
  hands: `${TOCKTON}clock_hands.glb`,
  bell: `${TOCKTON}clock_bell.glb`,
  handle: `${SHARED}interaction/machine_base_handle.glb`,
  anchor: `${SHARED}escapement/escapement_anchor.glb`,
  wheel: `${SHARED}escapement/escapement_wheel.glb`,
  pendulum: `${SHARED}pendulum/pendulum_clock.glb`,
  gear24: `${SHARED}spur_gear/gear_spur_24_m1.glb`,
  gear10: `${SHARED}spur_gear/gear_spur_10_m1.glb`,
  barrel: `${SHARED}spring/spring_barrel.glb`,
  spring: `${SHARED}spring/spring_standard.glb`,
  shaft: `${SHARED}shaft/shaft_long.glb`,
  cam: `${SHARED}cam/cam_hourly_chime.glb`,
} as const;
/** Every file the finished tower loads, for a warm-up while the player reads the letter. */
export const CLOCK_TOWER_MODEL_PATHS: readonly string[] = Object.values(CLOCK_TOWER_MODEL);

/** Names of the groups the X-ray effect and the rig look for (see the note at the top). */
export const CLOCK_TOWER_NODE_NAMES = {
  base: 'ClockTowerBase',
  shell: 'ClockTowerShell',
  dial: 'ClockTowerDial',
  bell: 'ClockTowerBell',
  movement: 'ClockTowerMovement',
  /** Prefix of the baked meshes of the base's walls (`ClockTowerBaseWalls_Mat_Stone` ...). */
  baseWalls: 'ClockTowerBaseWalls',
} as const;

/** Height of the base (`ClockTowerBase_Capstone` top, 60 mm): the shell stands on it, its origin on the floor-contact centre. */
export const CLOCK_TOWER_BASE_HEIGHT_M = 0.06;

type ModelKey = keyof typeof CLOCK_TOWER_MODEL;

async function load(source: ModelSource, registry: MaterialRegistry, path: string): Promise<Object3D> {
  const model = await source(path);
  applyLibraryMaterials(model.scene, registry);
  return model.scene;
}

/** Puts `part` at `host`'s `SOCKET_<name>` (position, and orientation unless `upright`). Returns false, with a warning, when the host has none. */
function seat(host: Object3D, name: string, part: Object3D, orient: 'socket' | 'upright' = 'socket'): boolean {
  const socket = host.getObjectByName(`SOCKET_${name}`);
  if (!socket) {
    console.warn(`[wound-up] ${host.name || 'a Clock Tower piece'} has no SOCKET_${name}; ${part.name || 'the part'} not seated.`);
    return false;
  }
  part.position.copy(socket.position);
  if (orient === 'socket') part.quaternion.copy(socket.quaternion);
  (socket.parent ?? socket).add(part);
  return true;
}

/**
 * The movement parts, each on a mount (position, orientation, scale) that holds the part's own scene: the scene is the node that
 * turns, named `Movement_<socket>`, so its rest pose is the tooth phase and its +Z is the part's axle. A file used twice (the
 * 24T and 10T gears) is loaded once and cloned: the clone shares its geometry and materials.
 */
function buildMovement(models: Readonly<Record<ModelKey, Object3D>>): Group {
  const movement = new Group();
  movement.name = CLOCK_TOWER_NODE_NAMES.movement;
  const used = new Set<ModelKey>();
  for (const part of MOVEMENT_PARTS) {
    const scene = used.has(part.model) ? models[part.model].clone(true) : models[part.model];
    used.add(part.model);
    scene.name = movementNodeName(part.socket);
    scene.rotation.set(0, 0, part.phase);
    const mount = new Group();
    mount.name = `${scene.name}_Mount`;
    mount.position.set(...part.position);
    mount.quaternion.set(...part.quaternion);
    mount.scale.setScalar(MOVEMENT_SCALE);
    mount.add(scene);
    movement.add(mount);
  }
  return movement;
}

/** The finished Clock Tower, standing on the workbench scale, before it is placed. `machineId` is `clock_tower`. */
export async function buildClockTower(source: ModelSource, registry: MaterialRegistry): Promise<MachineRig> {
  const keys = Object.keys(CLOCK_TOWER_MODEL) as ModelKey[];
  const loaded = await Promise.all(keys.map((key) => load(source, registry, CLOCK_TOWER_MODEL[key])));
  const models = Object.fromEntries(keys.map((key, i) => [key, loaded[i]])) as Record<ModelKey, Object3D>;
  const { base, shell, face, hands, bell, handle, anchor, wheel, pendulum } = models;
  base.name = CLOCK_TOWER_NODE_NAMES.base;
  shell.name = CLOCK_TOWER_NODE_NAMES.shell;
  face.name = CLOCK_TOWER_NODE_NAMES.dial;
  bell.name = CLOCK_TOWER_NODE_NAMES.bell;
  shell.position.set(0, CLOCK_TOWER_BASE_HEIGHT_M, 0);
  base.add(shell);
  seat(shell, 'Face', face);
  seat(face, 'Hands', hands);
  seat(shell, 'Bell', bell, 'upright'); // the bell's own up is world up: the shell's socket frame is tipped
  seat(base, 'BaseHandle', handle);
  base.updateMatrixWorld(true);
  base.attach(face); // the dial and the bell stand where the shell mounts them, but the shell is the part the X-ray effect fades
  base.attach(bell);

  const movement = buildMovement(models);
  anchor.position.set(0, MOVEMENT.arborY, MOVEMENT.escapementZ);
  wheel.position.set(0, MOVEMENT.arborY - MOVEMENT.arborToWheel, MOVEMENT.escapementZ);
  pendulum.position.set(0, MOVEMENT.arborY, MOVEMENT.escapementZ + MOVEMENT.pendulumZ);
  movement.add(anchor, wheel, pendulum);
  base.add(movement);
  bakeStatic(shell, () => true, CLOCK_TOWER_NODE_NAMES.shell);
  const floor = (mesh: Mesh): boolean => mesh.name === 'ClockTowerBase_Platform' || mesh.name === 'ClockTowerBase_Step';
  bakeStatic(base, (mesh) => !floor(mesh) && ![shell, face, bell, handle, movement].some((part) => isUnder(mesh, part)), CLOCK_TOWER_NODE_NAMES.baseWalls);
  trainRatios(); // solve the train now, with the rest of the build, not on the first frame it runs
  return createRig('clock_tower', base);
}
