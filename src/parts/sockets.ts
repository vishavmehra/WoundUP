// Gives the socket empties of a freshly cloned model the data of the blueprint, before the interaction layer reads them.
// Pure Three.js (no ECS, no IWSDK), so it runs in Node tests. DATA_AND_BLUEPRINT_SPEC §6, MUSIC_BOX_BLUEPRINT §7.1.
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { SOCKET_PREFIX } from '../interaction/glb-reader';
import type { MachineBlueprint, SocketDefinition } from '../content/blueprints/types';

const _pose = new Matrix4();
const _rootToParent = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _unitScale = new Vector3(1, 1, 1);
const _discard = new Vector3();

/**
 * Moves `node` so that it sits at `position` / `rotation` in the frame of `root` (the machine frame, metres), whatever transforms
 * lie between them. The node's own scale is left alone. `rotation` is `[x, y, z, w]`, identity when absent.
 */
export function placeInFrame(
  node: Object3D,
  root: Object3D,
  position: readonly [number, number, number],
  rotation?: readonly [number, number, number, number],
): void {
  const parent = node.parent;
  if (!parent) return;
  root.updateWorldMatrix(true, true);
  // P = parent space -> root space; its inverse brings the wanted root-space pose into the parent's space
  _rootToParent.copy(root.matrixWorld).invert().multiply(parent.matrixWorld).invert();
  _quaternion.set(...(rotation ?? [0, 0, 0, 1]));
  _pose.compose(_position.set(...position), _quaternion, _unitScale).premultiply(_rootToParent);
  _pose.decompose(node.position, node.quaternion, _discard);
}

/**
 * Rewrites every `SOCKET_<node>` empty under `root` that a socket of `blueprint` names (`SocketDefinition.node`):
 *  - `wu.accepts` becomes the blueprint's accepted part ids. The GLB empties name asset ids and families (`shaft_short`, `spur_gear`),
 *    but a part is identified by its catalogue id (`shaft_short_brass`), so without this nothing would ever snap.
 *  - The pose becomes the blueprint's, when it has one and `withPoses` is true (it wins over the GLB, SocketDefinition.position).
 *    Blueprint poses are in the housing's frame, so pass false for a part that is not the housing.
 * Run it on a clone, never on the cached scene. Returns the blueprint socket ids it bound.
 */
export function applyBlueprintSockets(blueprint: MachineBlueprint, root: Object3D, withPoses = true): string[] {
  const byNode = new Map<string, SocketDefinition>();
  for (const s of blueprint.sockets) if (s.node !== undefined) byNode.set(s.node, s);
  const bound: string[] = [];
  root.traverse((node) => {
    if (!node.name.startsWith(SOCKET_PREFIX)) return;
    const def = byNode.get(node.name.slice(SOCKET_PREFIX.length));
    if (!def) return;
    node.userData.wu = { ...(node.userData.wu as object | undefined), type: 'socket', accepts: [...(def.acceptedPartIds ?? [])] };
    if (withPoses && def.position !== undefined) placeInFrame(node, root, def.position, def.rotation);
    bound.push(def.id);
  });
  return bound;
}
