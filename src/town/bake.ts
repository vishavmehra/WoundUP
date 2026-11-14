/**
 * Baking the static parts of a placed machine (ADR-048: the awake town must stay under 200 draw calls with six machines). Every mesh of
 * the rig that never moves, the housing, the bearings and the studs, is merged into one mesh per library material, in the rig root's own
 * frame, and the originals are taken out of the scene. The moving parts keep their meshes: the rotors, the bobbers and the pulsers of
 * the rig, the lid, and whatever the rig's updaters move (`rig.moving`). Geometry and materials are the cache's and stay (the merged
 * geometry is new and belongs to the machine).
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

/**
 * Merges the static meshes of `rig` per material. Returns how many meshes it took out and how many it made, so the caller (and the
 * tests) can say what the draw calls came to. A rig that is not bakeable, or already baked, gives zeros.
 */
export function bakeStatic(rig: MachineRig): { removed: number; made: number } {
  if (!rig.bakeable) return { removed: 0, made: 0 };
  const root = rig.root;
  root.updateWorldMatrix(true, true);
  _inverse.copy(root.matrixWorld).invert();
  const moving = movingNodes(rig);

  const groups = new Map<string, { material: Material; pieces: Piece[]; meshes: Mesh[] }>();
  const visit = (node: Object3D): void => {
    if (moving.has(node) || !node.visible) return;
    const mesh = node as Mesh;
    // A hidden material is a collider proxy (glb-reader.ts): it is not drawn and is never merged.
    if (mesh.isMesh === true && !(mesh as { isInstancedMesh?: boolean }).isInstancedMesh && !Array.isArray(mesh.material) && mesh.material.visible !== false) {
      const key = keyOf(mesh.material);
      const group = groups.get(key) ?? { material: mesh.material, pieces: [], meshes: [] };
      groups.set(key, group);
      group.pieces.push({ geometry: mesh.geometry as BufferGeometry, matrix: _inverse.clone().multiply(mesh.matrixWorld) });
      group.meshes.push(mesh);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);

  let removed = 0;
  let made = 0;
  for (const [key, group] of groups) {
    for (const mesh of group.meshes) mesh.removeFromParent();
    removed += group.meshes.length;
    const baked = new Mesh(mergePieces(group.pieces), group.material);
    baked.name = `Baked_${key.split('|')[0]}`;
    root.add(baked);
    made++;
  }
  rig.bakeable = false; // baked once: a second call has nothing left to merge
  return { removed, made };
}
