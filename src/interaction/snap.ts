import { Quaternion, Vector3 } from 'three';

/**
 * Socket snapping maths (INTERACTION_SPEC §7.3, §8, §9; GAMEPLAY_SYSTEMS §7 and §8). Pure functions: no IWSDK, no DOM.
 * Preview and commit both go through `pickSocket`, so "a visual valid state never disagrees with the actual placement
 * result" (TECHNICAL_ARCHITECTURE §13). All distances are real metres in world space, so a scaled town (INTERACTION_SPEC §3)
 * does not shrink the radii.
 */

/** Standard snap radius, 4 cm (INTERACTION_SPEC §8). */
export const SNAP_RADIUS_M = 0.04;
/** Easy Snap radius, 7 cm (INTERACTION_SPEC §8). */
export const EASY_SNAP_RADIUS_M = 0.07;
/** A seated part comes out once pulled further than this, 3 cm (INTERACTION_SPEC §9). Smaller than the snap radius on purpose: it is the hysteresis that keeps tracking noise from detaching a part. */
export const UNSNAP_DISTANCE_M = 0.03;
/** "Short tween" of a successful snap (INTERACTION_SPEC §16). */
export const SNAP_TWEEN_S = 0.12;
/** `SocketSample.occupant` value of an empty socket. */
export const NO_PART = -1;

export const snapRadius = (easySnap: boolean): number => (easySnap ? EASY_SNAP_RADIUS_M : SNAP_RADIUS_M);

/** `valid`: would snap. `family`: wrong part for this socket (red). `occupied`: another part sits there (red). */
export type SnapStatus = 'valid' | 'family' | 'occupied';

/** One socket as the picker sees it. The system keeps these in an array and rewrites x, y, z in place each frame. */
export interface SocketSample {
  x: number;
  y: number;
  z: number;
  /** Accepted part ids or families, from the GLB (`userData.wu.accepts`). */
  accepts: readonly string[];
  /** Key of the part seated here, or NO_PART. */
  occupant: number;
}

/** The held part as the picker sees it. `key` identifies it against `SocketSample.occupant`. */
export interface PartSample {
  x: number;
  y: number;
  z: number;
  id: string;
  family: string;
  key: number;
}

/** Result of `pickSocket`, reused between calls. `index` is -1 when no socket is within the radius. */
export interface SocketPick {
  index: number;
  distance: number;
  status: SnapStatus;
}

export const createPick = (): SocketPick => ({ index: -1, distance: Infinity, status: 'valid' });

/** Compatibility is explicit data, never inferred from how a part looks (DATA_AND_BLUEPRINT_SPEC §6). `accepts` mixes part ids and families. */
export function isCompatible(accepts: readonly string[], partId: string, family: string): boolean {
  return accepts.includes(partId) || (family !== '' && accepts.includes(family));
}

function statusOf(socket: SocketSample, part: PartSample): SnapStatus {
  if (!isCompatible(socket.accepts, part.id, part.family)) return 'family';
  // A part counts as free to return to the socket it already occupies.
  if (socket.occupant !== NO_PART && socket.occupant !== part.key) return 'occupied';
  return 'valid';
}

/**
 * Chooses the socket for a part (INTERACTION_SPEC §7.3): the nearest socket the part could actually go into, within
 * `radius`. If none qualifies, the nearest socket that rejects it, so the preview can go red (§8). Returns false and
 * leaves `out.index = -1` when no socket is in range.
 */
export function pickSocket(part: PartSample, sockets: readonly SocketSample[], radius: number, out: SocketPick): boolean {
  out.index = -1;
  out.distance = Infinity;
  out.status = 'valid';
  const r2 = radius * radius;
  let bestRank = 2;
  let bestD2 = Infinity;
  for (let i = 0; i < sockets.length; i++) {
    const s = sockets[i];
    const dx = s.x - part.x;
    const dy = s.y - part.y;
    const dz = s.z - part.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    const status = statusOf(s, part);
    const rank = status === 'valid' ? 0 : 1;
    if (rank < bestRank || (rank === bestRank && d2 < bestD2)) {
      bestRank = rank;
      bestD2 = d2;
      out.index = i;
      out.status = status;
    }
  }
  if (out.index >= 0) out.distance = Math.sqrt(bestD2);
  return out.index >= 0;
}

/** A seated part detaches once it is pulled more than 3 cm from its socket (INTERACTION_SPEC §9). */
export const shouldUnsnap = (distanceM: number): boolean => distanceM > UNSNAP_DISTANCE_M;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const _from = new Vector3();
const _swing = new Quaternion();
const _axis = new Vector3();
const _aligned = new Quaternion();

/**
 * `out` = `q` turned by the shortest rotation that carries its local +Z onto `axis` (a unit vector, same space as `q`).
 * Rotating parts spin about local +Z (BLENDER_PRODUCTION_GUIDELINES §5), so this is the alignment a socket's mating
 * axis asks for; the roll the player held the part at is kept. `out` may be `q`.
 */
export function swingZToAxis(q: Quaternion, axis: Vector3, out: Quaternion): Quaternion {
  _from.set(0, 0, 1).applyQuaternion(q);
  _swing.setFromUnitVectors(_from, axis);
  return out.copy(q).premultiply(_swing);
}

/**
 * Orientation a part takes in its socket, written as the part's world orientation expressed in the socket's frame
 * (`world = socketWorld * out`). Storing it relative keeps the part right when the housing is later moved or rotated.
 *  - exact (default): the socket's own orientation, "the exact blueprint transform" (GAMEPLAY_SYSTEMS §8).
 *  - axisOnly: only the mating axis (+Z) is fixed, the roll stays as the player left it. For parts that spin about +Z.
 */
export function seatedRelative(partWorld: Quaternion, socketWorld: Quaternion, axisOnly: boolean, out: Quaternion): Quaternion {
  if (!axisOnly) return out.identity();
  _axis.set(0, 0, 1).applyQuaternion(socketWorld);
  swingZToAxis(partWorld, _axis, _aligned);
  return out.copy(socketWorld).invert().multiply(_aligned);
}
