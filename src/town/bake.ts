/**
 * Baking a placed machine (ADR-048: the awake town must stay under 200 draw calls with six machines). Every mesh of the rig that never
 * moves, the housing, the bearings and the studs, is merged into one mesh per library material, in the rig root's own frame, and the
 * originals are taken out of the scene. The moving parts keep a node each: the rotors, the bobbers and the pulsers of the rig, the lid, and
 * whatever the rig's updaters move (`rig.moving`). Inside such a node the meshes that move with it and with nothing else (the Carousel's
 * platform, column and canopy turn as one) are merged too, per material, in that node's own frame; a node under another moving node (a
 * horse on the platform, a lamp on the canopy) is left whole. Geometry and materials are the cache's and stay (merged geometry is new and
 * belongs to the machine).
 *
 * Only a rig that says it can be baked (`rig.bakeable`) is touched: a machine driven from outside the rig (the Clock Tower's own system
 * turns nodes it found by name) would lose them. Pure scene-graph work, so Node tests run it. Runs once, when the machine is placed or
 * restored; never per frame.
 */
import { Matrix4, Mesh } from '@iwsdk/core';
import type { BufferGeometry, Material, Object3D } from '@iwsdk/core';
import { mergePieces } from './dressing';
import type { Piece } from './dressing';
import type { MachineRig } from './motion';

const _inverse = new Matrix4();

/** Nodes whose subtrees move: they and everything under them stay as they are. */
function movingNodes(rig: MachineRig): Set<Object3D> {
  const out = new Set<Object3D>(rig.moving);
  for (const r of rig.rotors) out.add(r.node);
  for (const b of rig.bobbers) out.add(b.node);
  for (const p of rig.pulsers) out.add(p.node);
  if (rig.lid) out.add(rig.lid.pivot);
  return out;
}

/** Library clones of one material (GrabFeedbackSystem gives each mesh its own) merge together: the key is what looks different. */
const keyOf = (m: Material): string => `${m.name}|${(m as { vertexColors?: boolean }).vertexColors === true}`;

/** A mesh the baker may merge: a plain mesh with one material that is drawn (a hidden material is a collider proxy, glb-reader.ts). */
const mergeable = (node: Object3D): node is Mesh => {
  const mesh = node as Mesh;
  return mesh.isMesh === true && !(mesh as { isInstancedMesh?: boolean }).isInstancedMesh && !Array.isArray(mesh.material) && mesh.material.visible !== false;
};

/**
 * Merges the meshes below `top` (`top` itself stays whatever it is) per material, in `top`'s own frame, leaving out hidden nodes and everything
 * under a node of `stop`. Returns how many it took out and how many it made. A material with a single mesh is left alone unless `mergeOneToo`
 * (under a moving node there is nothing to gain by it; under the root it keeps one mesh per material in the root's frame).
 */
function mergeUnder(top: Object3D, stop: ReadonlySet<Object3D>, mergeOneToo: boolean): { removed: number; made: number } {
  top.updateWorldMatrix(true, true);
  _inverse.copy(top.matrixWorld).invert();
  const groups = new Map<string, { material: Material; pieces: Piece[]; meshes: Mesh[] }>();
  const visit = (node: Object3D): void => {
    if ((node !== top && stop.has(node)) || !node.visible) return;
    if (node !== top && mergeable(node)) {
      const key = keyOf(node.material as Material);
      const group = groups.get(key) ?? { material: node.material as Material, pieces: [], meshes: [] };
      groups.set(key, group);
      group.pieces.push({ geometry: node.geometry as BufferGeometry, matrix: _inverse.clone().multiply(node.matrixWorld) });
      group.meshes.push(node);
    }
    for (const child of node.children) visit(child);
  };
  visit(top);
  let removed = 0;
  let made = 0;
  for (const [key, group] of groups) {
    if (group.meshes.length < 2 && !mergeOneToo) continue;
    for (const mesh of group.meshes) mesh.removeFromParent();
    removed += group.meshes.length;
    const baked = new Mesh(mergePieces(group.pieces), group.material);
    baked.name = `Baked_${key.split('|')[0]}`;
    top.add(baked);
    made++;
  }
  return { removed, made };
}

/**
 * Bakes `rig` (see the file's comment). Returns how many meshes it took out and how many it made, so the caller (and the tests) can say
 * what the draw calls came to. A rig that is not bakeable, or already baked, gives zeros.
 */
export function bakeStatic(rig: MachineRig): { removed: number; made: number } {
  if (!rig.bakeable) return { removed: 0, made: 0 };
  const moving = movingNodes(rig);
  // The still parts first: they are meshes of the root, outside every moving node. Moving nodes are taken first so that nothing of theirs is merged out.
  const still = mergeUnder(rig.root, moving, true);
  let { removed, made } = still;
  // Then inside each moving node, what moves with it and with nothing else.
  for (const node of moving) {
    const inside = mergeUnder(node, moving, false);
    removed += inside.removed;
    made += inside.made;
  }
  rig.bakeable = false; // baked once: a second call has nothing left to merge
  return { removed, made };
}
