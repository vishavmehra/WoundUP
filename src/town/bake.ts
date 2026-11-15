/**
 * Static batching: merges the meshes of a loaded model group that never move relative to one another into one mesh per library
 * material, so a machine that arrives as 25 to 45 separate GLB meshes is drawn with a fraction of the draw calls (ASSET_OPTIMISATION_
 * BUDGET section 4: draw calls per frame, 150 target, 200 ceiling, and Quest is CPU-bound on draw submission first).
 *
 * What is merged. A node is MOVING when code moves it after the build: a rotor, a bobbing horse, a pulsing lamp, a hinge, or any node the
 * caller names (`moving`, `keepNames`). Every other node is static relative to its parent, so every mesh whose nearest moving ancestor
 * is the same node (the root when none is) can be baked into the frame of that node. The meshes of one frame are merged per library
 * material; the merged mesh is added to that frame's node and the source meshes leave the graph. Because every merge stays inside one
 * moving node's frame, a spinning platform keeps its column, canopy and poles as ONE mesh that spins with it, a horse keeps bobbing as
 * one, and the rotors themselves are never touched: `rotor.node`, `bobber.node`, `pulser.node`, `lid.pivot` are the same objects with
 * the same names, parents, rest poses and children as before.
 *
 * What is left alone (and counted in `skipped`): the moving nodes themselves; anything invisible, and everything under it; meshes
 * with a material array, a non-visible material (the collider proxies) or a transparent one; skinned, instanced and morphed
 * meshes; meshes whose geometry has an attribute the merge does not carry (tangent, a second uv set); meshes placed with a mirror
 * (negative determinant, whose winding a merge would flip); meshes that differ in render order or layers; and groups of one.
 *
 * Casing and mechanism stay apart. `shell` names the prefixes of the casing meshes (`XRAY_SHELL`, xray-view.ts): the casing meshes of a frame
 * merge per material among themselves, into meshes flagged `userData.xrayShell = true` (named `..._Shell`), and the other meshes of the
 * frame merge into their own, so X-ray fades the casing by that flag and the mechanism stays solid even when a trim shares its material
 * with a bearing. The cost is one draw call per material the casing and the mechanism of one frame have in common.
 *
 * What changes for callers. The names of merged-away meshes that carried nothing are gone from the scene graph (`getObjectByName` no
 * longer finds them): the merged mesh lists them in `userData.bakedFrom`. A merged-away mesh that carried other nodes (sockets,
 * colliders, a rotor hung on it) leaves an empty group of the same name, transform and data in its place, with those nodes under it.
 * Anything that looks a mesh up by name, or changes one mesh's material or visibility later (an X-ray shell, a tinted roof, a wake effect
 * on one house), must name it in `keepNames` (or hand its node in `moving`), and then it stays a separate, addressable mesh. `SOCKET_`,
 * `COL_` and `PIV_` empties are not meshes and keep their place. The source geometries belong to the loader's cache and are shared
 * between clones of a model, so they are never disposed.
 *
 * Draw calls only: the triangles, the materials and the picture are the same. Runs once when a machine is built (no per-frame work,
 * no allocation afterwards). A merged geometry is the baked group's own: `dispose()` frees it, `disposeBaked(rig)` for a machine's.
 *
 * Reuse for another group (a house, a new feature):
 *   bakeStatic(root, { moving: [nodes the game animates], keepNames: [names it looks up], leave: [anything it is unsure of] })
 */
import { Group, Matrix4, Mesh } from '@iwsdk/core';
import type { BufferGeometry, Material, Object3D } from '@iwsdk/core';
import { THEATRE_DOOR_NODE } from '../machines/clock-tower/rig';
import { mergePieces } from './dressing';
import type { MachineRig } from './motion';
import type { Town } from './scene';
import { isXRayShell, XRAY_SHELL } from './xray-view';

export interface BakeOptions {
  /** Nodes the game moves after the bake: each stays as it is and anchors the merge of everything static under it. */
  moving?: Iterable<Object3D>;
  /** Nodes left exactly as they are, with everything under them (an animated feature, or anything the caller does not know the rules of). */
  leave?: Iterable<Object3D>;
  /** Names of nodes that code finds with `getObjectByName` or whose material or visibility it changes: they stay separate meshes (and anchor their children). */
  keepNames?: Iterable<string>;
  /** Name prefixes of the casing meshes (`XRAY_SHELL`): they merge only with each other, into meshes flagged `userData.xrayShell`. None: nothing is casing. */
  shell?: readonly string[];
}

export interface Baked {
  /** The merged meshes this bake added, each a child of the node whose frame it is in. */
  readonly merged: readonly Mesh[];
  /** How many source meshes were merged away, and how many meshes were left alone although they were not moving nodes (see the header). */
  readonly sources: number;
  readonly skipped: number;
  /** Takes the merged meshes out of the scene and frees their geometries. The merged-away sources are not put back. */
  dispose(): void;
}

/** The attributes a merge carries (dressing.ts `KEPT`): a mesh with any other is left alone rather than losing it. */
const CARRIED = new Set(['position', 'normal', 'uv', 'color']);
const _rel = new Matrix4();
const _anchorInverse = new Matrix4();

/** True when `mesh` sits mirrored relative to `anchor` (negative determinant): a merge would turn its faces inside out. */
const mirrored = (mesh: Object3D, anchor: Object3D): boolean => mesh.matrixWorld.determinant() * anchor.matrixWorld.determinant() < 0;

/** Whether a mesh can be merged, and under which key meshes may share one merged mesh (casing and mechanism never do). Null when it cannot. */
function mergeKey(mesh: Mesh, casing: boolean): { material: Material; key: string } | null {
  const material = mesh.material;
  if (Array.isArray(material) || !material.visible || material.transparent) return null;
  const flags = mesh as Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
  if (flags.isSkinnedMesh || flags.isInstancedMesh) return null;
  const geometry: BufferGeometry = mesh.geometry;
  if (geometry.groups.length > 1 || Object.keys(geometry.morphAttributes).length > 0) return null;
  const names = Object.keys(geometry.attributes).sort();
  if (!geometry.hasAttribute('position') || names.some((n) => !CARRIED.has(n))) return null;
  const wu = mesh.userData.wu as { type?: unknown } | undefined;
  if (wu?.type === 'collider' || wu?.type === 'socket') return null; // interaction data stays where it is
  const shape = names.map((n) => `${n}${geometry.getAttribute(n).itemSize}`).join(',');
  const key = `${material.uuid}|${shape}|${mesh.renderOrder}|${mesh.layers.mask}|${mesh.frustumCulled ? 1 : 0}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${casing ? 'shell' : 'part'}`;
  return { material, key };
}

/**
 * Takes a merged-away mesh out of the graph. A mesh that carries other nodes (the sockets and colliders of a GLB's root mesh, a rotor hung
 * on a tower) is replaced by an empty group with the same name, transform and data, so everything under it stays exactly where it was.
 */
function retire(mesh: Mesh): void {
  const parent = mesh.parent;
  if (!parent) return;
  if (mesh.children.length > 0) {
    const stand = new Group();
    stand.name = mesh.name;
    stand.userData = mesh.userData;
    stand.position.copy(mesh.position);
    stand.quaternion.copy(mesh.quaternion);
    stand.scale.copy(mesh.scale);
    stand.add(...mesh.children);
    parent.add(stand);
  }
  parent.remove(mesh);
}

/**
 * Bakes the static meshes of `root`'s subtree (see the file header). Call it once the model group is assembled and its sockets, rotors
 * and hinges exist; it does not move anything. Returns what it did, for tests and for a later `dispose`.
 */
export function bakeStatic(root: Object3D, options: BakeOptions = {}): Baked {
  const moving = new Set<Object3D>(options.moving ?? []);
  const kept = new Set<string>(options.keepNames ?? []);
  const left = new Set<Object3D>(options.leave ?? []);
  const shell = options.shell ?? [];
  root.updateWorldMatrix(true, true);

  /** Static meshes by the node whose frame they are merged into, then by merge key. */
  const frames = new Map<Object3D, Map<string, { material: Material; casing: boolean; meshes: Mesh[] }>>();
  let skipped = 0;

  const walk = (node: Object3D, anchor: Object3D): void => {
    if (!node.visible || left.has(node)) return; // hidden now and shown later by someone, or named as theirs: the subtree stays as it is
    const isMoving = node !== root && (moving.has(node) || (node.name !== '' && kept.has(node.name)));
    const here = isMoving ? node : anchor;
    if (!isMoving && node !== root && (node as Mesh).isMesh === true) {
      const mesh = node as Mesh;
      const casing = isXRayShell(mesh, shell);
      const found = mergeKey(mesh, casing);
      if (!found || mirrored(mesh, anchor)) skipped++;
      else {
        const groups = frames.get(anchor) ?? new Map<string, { material: Material; casing: boolean; meshes: Mesh[] }>();
        frames.set(anchor, groups);
        const group = groups.get(found.key) ?? { material: found.material, casing, meshes: [] };
        groups.set(found.key, group);
        group.meshes.push(mesh);
      }
    }
    for (const child of node.children) walk(child, here);
  };
  walk(root, root);

  const merged: Mesh[] = [];
  let sources = 0;
  for (const [anchor, groups] of frames) {
    _anchorInverse.copy(anchor.matrixWorld).invert();
    for (const { material, casing, meshes } of groups.values()) {
      if (meshes.length < 2) continue; // nothing to gain
      const pieces = meshes.map((mesh) => ({ geometry: mesh.geometry, matrix: _rel.multiplyMatrices(_anchorInverse, mesh.matrixWorld).clone() }));
      const first = meshes[0];
      const batch = new Mesh(mergePieces(pieces), material);
      batch.name = `Baked_${anchor.name || 'root'}_${material.name || 'material'}${casing ? '_Shell' : ''}`;
      batch.userData.bakedFrom = meshes.map((m) => m.name);
      if (casing) batch.userData.xrayShell = true; // xray-view.ts fades it by this flag
      batch.renderOrder = first.renderOrder;
      batch.layers.mask = first.layers.mask;
      batch.frustumCulled = first.frustumCulled;
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      for (const mesh of meshes) retire(mesh);
      anchor.add(batch);
      merged.push(batch);
      sources += meshes.length;
    }
  }
  return {
    merged,
    sources,
    skipped,
    dispose() {
      for (const mesh of merged) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      merged.length = 0;
    },
  };
}

const bakes = new WeakMap<MachineRig, Baked>();

/**
 * Bakes a finished machine: every rotor, bobber, pulser and the lid pivot of the rig is a moving node, and so is every node its own
 * updaters move (`rig.moving`: the Well's pump rod, pawl and water disc, the Belfry's bell and clapper). `keepNames` adds the nodes a
 * machine's own runtime finds by name (the Clock Tower's hands, pendulum and bell). The machine's casing (`XRAY_SHELL`) merges apart from its
 * mechanism, into meshes X-ray fades by flag. Whatever is hidden when the bake runs (the Well's
 * bucket template and its water disc, which an updater shows later) is never merged: the walk skips a hidden node and everything under
 * it. Returns the bake, which is also remembered for `disposeBaked`.
 */
export function bakeRig(rig: MachineRig, keepNames: Iterable<string> = []): Baked {
  const moving: Object3D[] = [...rig.moving];
  for (const rotor of rig.rotors) moving.push(rotor.node);
  for (const bobber of rig.bobbers) moving.push(bobber.node);
  for (const pulser of rig.pulsers) moving.push(pulser.node);
  if (rig.lid) moving.push(rig.lid.pivot);
  const baked = bakeStatic(rig.root, { moving, keepNames, shell: XRAY_SHELL[rig.machineId] });
  bakes.set(rig, baked);
  return baked;
}

/** Frees the merged geometries of a machine `bakeRig` baked (the machine is gone for good). Safe for a rig that was never baked. */
export function disposeBaked(rig: MachineRig): void {
  bakes.get(rig)?.dispose();
  bakes.delete(rig);
}

/**
 * Bakes the town's own models (the ground, the Bakery with Otto, the theatre facade, Mira) across one another, one mesh per library
 * material. Everything else under the town group (the dressing, which is already merged, and anything a later feature adds there) is
 * left exactly as it is, so a new feature's animated node can never be baked into the street by accident. The nodes the
 * town animates by name stay: the theatre's door pivots (`TheatreDoors`) and whatever Otto's knead clip animates.
 */
export function bakeTown(town: Town): Baked {
  const own = new Set<Object3D>([town.ground, town.bakery, town.theatre, town.mira]);
  const leave = town.group.children.filter((child) => !own.has(child));
  const keepNames: string[] = Object.values(THEATRE_DOOR_NODE);
  for (const track of town.knead?.action.getClip().tracks ?? []) keepNames.push(track.name.split('.')[0]);
  return bakeStatic(town.group, { leave, keepNames });
}
