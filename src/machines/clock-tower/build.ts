// Assembles the finished Clock Tower from its GLBs, the way src/town/machines.ts assembles the other three: a `MachineRig` the town
// can carry, place and gift. Three.js only (no ECS), so Vitest runs it on the real files. The nodes `ClockTowerNodes` turns
// (rig.ts) live inside it; the game puts a `ClockTowerRig` component on the entity that owns `rig.root`.
//
// Mounts. The tower GLBs carry few of them: the shell has `SOCKET_Face` and `SOCKET_Bell`, the face has `SOCKET_Hands`, the base has
// `SOCKET_BaseHandle`, and that is all (checked against the files, 2026-11-14). The movement parts (escape wheel, anchor, pendulum)
// have no mount, so their place is `MOVEMENT` below, measured from the files: the pendulum hangs from the anchor's arbor down the
// entrance arch, the wheel under the arbor, both in the plane through the middle of the tower.
//
// Not drawn: the spring, barrel, gear train, drive shaft, brackets, key and the hourly cam. They are in the blueprint and the solver
// judges them, but no GLB gives them a mount and no layout of the 8.3 cm interior is specified (gap G-13), so a guessed one would be
// invented geometry. The visible movement is the escapement, which is the part the pendulum and the strikes belong to.
import type { Object3D } from 'three';
import { applyLibraryMaterials } from '../../materials';
import type { MaterialRegistry } from '../../materials';
import { createRig } from '../../town/motion';
import type { MachineRig } from '../../town/motion';
import type { ModelSource } from '../../town/scene';

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
} as const;
/** Every file the finished tower loads, for a warm-up while the player reads the letter. */
export const CLOCK_TOWER_MODEL_PATHS: readonly string[] = Object.values(CLOCK_TOWER_MODEL);

/** Height of the base (`ClockTowerBase_Capstone` top, 60 mm): the shell stands on it, its origin on the floor-contact centre. */
export const CLOCK_TOWER_BASE_HEIGHT_M = 0.06;

/**
 * Where the movement sits in the base frame (origin at the floor-contact centre of the base, +Y up, +Z to the viewer), metres.
 *  - `arbor`: the anchor's arbor, which is also the pendulum's suspension point (both turn about the same +Z axis, `pendulumZ`). 75 mm
 *    puts the bob's lowest point 8 mm above the floor (platform top 4.6 mm; the rod ends 70 mm under the arbor) and the swing of 8 degrees
 *    moves it 8 mm, well inside the 32 mm entrance arch.
 *  - the wheel's centre is `arborToWheel` under the arbor (manifest: 20.6 mm); it rises through the 54 mm capstone opening.
 *  - `pendulumZ`: the rod hangs 5 mm in front of the wheel and anchor plane, whose parts are 4 mm thick, so nothing touches.
 */
export const MOVEMENT = { arborY: 0.075, arborToWheel: 0.0206, pendulumZ: 0.005 } as const;

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

/** The finished Clock Tower, standing on the workbench scale, before it is placed. `machineId` is `clock_tower`. */
export async function buildClockTower(source: ModelSource, registry: MaterialRegistry): Promise<MachineRig> {
  const [base, shell, face, hands, bell, handle, anchor, wheel, pendulum] = await Promise.all(
    Object.values(CLOCK_TOWER_MODEL).map((path) => load(source, registry, path)),
  );
  shell.position.set(0, CLOCK_TOWER_BASE_HEIGHT_M, 0);
  base.add(shell);
  seat(shell, 'Face', face);
  seat(face, 'Hands', hands);
  seat(shell, 'Bell', bell, 'upright'); // the bell's own up is world up: the shell's socket frame is tipped
  seat(base, 'BaseHandle', handle);

  anchor.position.set(0, MOVEMENT.arborY, 0);
  wheel.position.set(0, MOVEMENT.arborY - MOVEMENT.arborToWheel, 0);
  pendulum.position.set(0, MOVEMENT.arborY, MOVEMENT.pendulumZ);
  base.add(anchor, wheel, pendulum);
  return createRig('clock_tower', base);
}
