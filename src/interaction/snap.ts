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
/** Relaxed snap radius, 7 cm, and with Easy Snap 9 cm (INTRICATE_ASSEMBLY_DESIGN §5.2, ADR-050). */
export const RELAXED_SNAP_RADIUS_M = 0.07;
export const RELAXED_EASY_SNAP_RADIUS_M = 0.09;
/** A seated part comes out once pulled further than this, 3 cm (INTERACTION_SPEC §9). Smaller than the snap radius on purpose: it is the hysteresis that keeps tracking noise from detaching a part. */
export const UNSNAP_DISTANCE_M = 0.03;
/** A deliberate pull: the limit of a part inside a finished unit, so grabbing the carrier never pulls a gear out by mistake (design §5.3). */
export const FIRM_UNSNAP_DISTANCE_M = 0.06;
/** "Short tween" of a successful snap (INTERACTION_SPEC §16): the flight of the last stretch into the socket. */
export const SNAP_TWEEN_S = 0.12;
/** The settle that follows the flight: the part pushes 0.4 mm past home along its travel and eases back (design §5.2, §10.1). */
export const SETTLE_S = 0.09;
export const SETTLE_OVERSHOOT_M = 0.0004;
/** `SocketSample.occupant` value of an empty socket. */
export const NO_PART = -1;

/** The difficulty levels of ADR-050. Declared here so the interaction layer does not import the game layer; the strings are the same. */
export type SnapLevel = 'relaxed' | 'standard' | 'master';

/** Real centimetres from the socket to the part's origin (design §5.2 table). Relaxed behaves as if Easy Snap were on, and the toggle adds 2 cm more; Easy Snap is an accessibility setting, never a hint, so Master uses the player's own. */
export function snapRadius(easySnap: boolean, level: SnapLevel = 'standard'): number {
  if (level === 'relaxed') return easySnap ? RELAXED_EASY_SNAP_RADIUS_M : RELAXED_SNAP_RADIUS_M;
  return easySnap ? EASY_SNAP_RADIUS_M : SNAP_RADIUS_M;
}

/** `valid`: would snap. `family`: wrong part for this socket (red). `occupied`: another part sits there (red). `order`: the right part, but the socket is not armed yet, so the step before it is still open (red, ADR-050). */
export type SnapStatus = 'valid' | 'family' | 'occupied' | 'order';

/** Parts small enough that a hand opening the pinch moves them: the release assist (below) is for these. */
const TINY_FAMILIES: ReadonlySet<string> = new Set(['fastener']);
export const isTinyFamily = (family: string): boolean => TINY_FAMILIES.has(family);
/** A preview that was valid this recently still counts when the pinch opens: the fingers drift apart as they let go. */
export const ASSIST_WINDOW_S = 0.15;
/** ...as long as the part is still within this many snap radii of that socket. */
export const ASSIST_REACH = 1.5;

/** Release assist: should a tiny part released out of range still go home to the socket it previewed `ageS` seconds ago, `distanceM` away? */
export const assistedRelease = (ageS: number, distanceM: number, radiusM: number): boolean => ageS <= ASSIST_WINDOW_S && distanceM <= radiusM * ASSIST_REACH;

/** One socket as the picker sees it. The system keeps these in an array and rewrites x, y, z in place each frame. */
export interface SocketSample {
  x: number;
  y: number;
  z: number;
  /** Accepted part ids or families, from the GLB (`userData.wu.accepts`). */
  accepts: readonly string[];
  /** Key of the part seated here, or NO_PART. */
  occupant: number;
  /** False while the step before this one is still open: only armed sockets preview and snap (design §3.4). A machine with no stages has every socket armed. */
  armed: boolean;
  /** True while this socket is an empty of the held part itself (a carrier's child seat): a part is never a candidate for its own sockets. Written before each pick. */
  own?: boolean;
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

/** What would happen if `part` were released at `socket`: see `SnapStatus`. */
export function statusOf(socket: SocketSample, part: PartSample): SnapStatus {
  if (!isCompatible(socket.accepts, part.id, part.family)) return 'family';
  // A part counts as free to return to the socket it already occupies.
  if (socket.occupant !== NO_PART && socket.occupant !== part.key) return 'occupied';
  if (!socket.armed && socket.occupant !== part.key) return 'order';
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
    if (s.own === true) continue;
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

/** A seated part detaches once it is pulled more than 3 cm from its socket (INTERACTION_SPEC §9), or more than `limitM` where a socket asks for a firmer hold. */
export const shouldUnsnap = (distanceM: number, limitM: number = UNSNAP_DISTANCE_M): boolean => distanceM > limitM;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Shape of the settle, `u` in 0..1: 0 at both ends, 1 in the middle. Multiply by `SETTLE_OVERSHOOT_M` and the travel direction. */
export const settleBump = (u: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, u)));

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
