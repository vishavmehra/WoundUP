import { BoxGeometry, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import type { Object3D } from 'three';

/**
 * Reads the interaction empties a Blender asset carries (BLENDER_PRODUCTION_GUIDELINES §9, ADR-033): `SOCKET_<Name>`
 * with `userData.wu = {type:'socket', accepts:[...]}` and `COL_<Purpose>` with `{type:'collider', shape, purpose}`.
 * No IWSDK imports: it works on a loaded glTF scene graph, so Vitest can run it in node.
 */

export const SOCKET_PREFIX = 'SOCKET_';
export const COLLIDER_PREFIX = 'COL_';
/** Smallest grab collider, a 1.2 cm radius, so tiny parts stay selectable (INTERACTION_SPEC §7.2). */
export const MIN_GRAB_RADIUS_M = 0.012;

export interface SocketDef {
  /** Node name without the `SOCKET_` prefix. */
  id: string;
  node: Object3D;
  /** Accepted part ids or families. */
  accepts: string[];
  /** `wu.orient === 'axis'`: only the mating +Z is fixed on snap, the roll stays as the player left it. Default is the exact socket orientation. */
  axisOnly: boolean;
}

export interface ColliderDef {
  /** Node name without the `COL_` prefix. */
  id: string;
  node: Object3D;
  shape: 'box' | 'sphere';
  /** What the collider is for, for example `grab`. */
  purpose: string;
}

export interface InteractionNodes {
  sockets: SocketDef[];
  colliders: ColliderDef[];
  /** Nodes that carry the prefix but a malformed or mismatched `wu`. They are skipped, never half-read. */
  warnings: string[];
}

export type WuData =
  | { type: 'socket'; accepts: string[]; axisOnly: boolean }
  | { type: 'collider'; shape: 'box' | 'sphere'; purpose: string };

const MAX_ACCEPTS = 64;
const MAX_TEXT = 64;

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT;

/** Validates `userData.wu` of one node. Returns the data, or a message saying what is wrong. */
export function parseWu(raw: unknown): { data: WuData } | { error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: 'userData.wu is missing or not an object' };
  const wu = raw as Record<string, unknown>;
  if (wu.type === 'socket') {
    const accepts = wu.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0 || accepts.length > MAX_ACCEPTS || !accepts.every(isText)) {
      return { error: `socket "accepts" must be a list of 1 to ${MAX_ACCEPTS} non-empty part ids or families` };
    }
    return { data: { type: 'socket', accepts: [...accepts], axisOnly: wu.orient === 'axis' } };
  }
  if (wu.type === 'collider') {
    if (wu.shape !== 'box' && wu.shape !== 'sphere') return { error: 'collider "shape" must be "box" or "sphere"' };
    if (!isText(wu.purpose)) return { error: 'collider "purpose" must be a non-empty string' };
    return { data: { type: 'collider', shape: wu.shape, purpose: wu.purpose } };
  }
  return { error: `unknown wu.type "${String(wu.type)}"` };
}

/** Finds every `SOCKET_` and `COL_` node under `root`. A node whose name and `wu.type` disagree is reported and skipped. */
export function readInteractionNodes(root: Object3D): InteractionNodes {
  const out: InteractionNodes = { sockets: [], colliders: [], warnings: [] };
  root.traverse((node) => {
    const isSocket = node.name.startsWith(SOCKET_PREFIX);
    const isCollider = node.name.startsWith(COLLIDER_PREFIX);
    if (!isSocket && !isCollider) return;
    const parsed = parseWu(node.userData.wu);
    if ('error' in parsed) {
      out.warnings.push(`${node.name}: ${parsed.error}`);
      return;
    }
    const { data } = parsed;
    if (isSocket && data.type === 'socket') {
      out.sockets.push({ id: node.name.slice(SOCKET_PREFIX.length), node, accepts: data.accepts, axisOnly: data.axisOnly });
    } else if (isCollider && data.type === 'collider') {
      out.colliders.push({ id: node.name.slice(COLLIDER_PREFIX.length), node, shape: data.shape, purpose: data.purpose });
    } else {
      out.warnings.push(`${node.name}: name says ${isSocket ? 'socket' : 'collider'} but wu.type is "${data.type}"`);
    }
  });
  return out;
}

const _scale = new Vector3();

/**
 * Extra scale that lifts a collider whose world half-extents fall below `min`, per axis for a box and uniformly for a
 * sphere (INTERACTION_SPEC §7.2: enlarge the invisible collider, never the visible mesh). 1 where nothing is needed.
 * `world` holds the collider node's world scale, which carries its half-extents in metres.
 */
export function colliderBoost(world: Vector3, shape: 'box' | 'sphere', min: number, out: Vector3): Vector3 {
  const x = Math.max(Math.abs(world.x), 1e-6);
  const y = Math.max(Math.abs(world.y), 1e-6);
  const z = Math.max(Math.abs(world.z), 1e-6);
  if (shape === 'sphere') return out.setScalar(Math.max(1, min / Math.max(x, y, z)));
  return out.set(Math.max(1, min / x), Math.max(1, min / y), Math.max(1, min / z));
}

// Shared by every proxy: the empty's own scale carries the half-extents, so one unit shape spanning -1..+1 fits all.
let unitBox: BoxGeometry | undefined;
let unitSphere: SphereGeometry | undefined;
let hiddenMaterial: MeshBasicMaterial | undefined;

function hidden(): MeshBasicMaterial {
  if (!hiddenMaterial) {
    hiddenMaterial = new MeshBasicMaterial();
    // Never `visible = false` on the node: IWSDK ignores an object whose ancestor is hidden (BLENDER_PRODUCTION_GUIDELINES §9).
    // A material that is not visible is skipped by the renderer but still answers to pointer rays.
    hiddenMaterial.visible = false;
  }
  return hiddenMaterial;
}

interface ProxyMark {
  purpose: string;
}

function lift(proxy: Mesh, shape: 'box' | 'sphere', purpose: string): void {
  proxy.scale.setScalar(1);
  if (purpose !== 'grab') return;
  const node = proxy.parent;
  if (!node) return;
  node.updateWorldMatrix(true, false);
  node.getWorldScale(_scale);
  colliderBoost(_scale, shape, MIN_GRAB_RADIUS_M, proxy.scale);
}

/**
 * Gives each collider empty an invisible mesh child so IWSDK's pointer rays can hit it. Grab colliders are lifted to
 * at least 1.2 cm (measured in the world, so a scaled town does not shrink them). Returns the proxies it added.
 */
export function attachColliderProxies(colliders: readonly ColliderDef[]): Mesh[] {
  unitBox ??= new BoxGeometry(2, 2, 2);
  unitSphere ??= new SphereGeometry(1, 12, 8);
  const proxies: Mesh[] = [];
  for (const def of colliders) {
    const proxy = new Mesh(def.shape === 'box' ? unitBox : unitSphere, hidden());
    proxy.name = `${def.node.name}_proxy`;
    proxy.userData.wuProxy = { purpose: def.purpose, shape: def.shape } satisfies ProxyMark & { shape: string };
    def.node.add(proxy);
    lift(proxy, def.shape, def.purpose);
    proxies.push(proxy);
  }
  return proxies;
}

/** Recomputes the minimum size of every grab proxy under `root`. Call it after the root's scale changes, for example when a machine takes the town's scale. */
export function refreshColliderFloor(root: Object3D): void {
  root.traverse((node) => {
    const mark = node.userData.wuProxy as (ProxyMark & { shape: 'box' | 'sphere' }) | undefined;
    if (mark && (node as Mesh).isMesh) lift(node as Mesh, mark.shape, mark.purpose);
  });
}

/** Removes the proxies `attachColliderProxies` added. Their geometry and material are shared, so nothing is disposed. */
export function detachColliderProxies(proxies: readonly Mesh[]): void {
  for (const proxy of proxies) proxy.removeFromParent();
}
