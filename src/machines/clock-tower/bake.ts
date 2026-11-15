// Draws the tower's still parts in fewer draw calls. The shell is 27 meshes and the base 13, but nothing in them moves, so the
// meshes that share a library material (ADR-032) are merged into one, in the space of the group that holds them: seven materials
// make 7 draw calls for the shell, three make 3 for the base. The awake town's budget is 200 draw calls (ADR-034) and the tower
// alone was 53 of them. The meshes of the files stay where they are, hidden, so a node of the GLB still has its box and its name; a
// hidden mesh costs no draw call. Three.js only, so Vitest runs it on the real files.
import { Matrix4, Mesh } from 'three';
import type { Material, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _relative = new Matrix4();
const _inverse = new Matrix4();

/** Is `node` `ancestor` or something under it? */
export function isUnder(node: Object3D, ancestor: Object3D): boolean {
  for (let n: Object3D | null = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

/**
 * Merges the visible meshes under `root` that `accept` takes into one mesh per material, named `<name>_<material>`, child of `root`.
 * A material used by one mesh only is left as it is. Returns the merged meshes. Meshes whose vertex data do not fit together
 * (`mergeGeometries` needs the same attributes) are left as they are too.
 */
export function bakeStatic(root: Object3D, accept: (mesh: Mesh) => boolean, name: string): Mesh[] {
  root.updateWorldMatrix(true, true);
  _inverse.copy(root.matrixWorld).invert();
  const byMaterial = new Map<Material, Mesh[]>();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.visible || Array.isArray(mesh.material) || !accept(mesh)) return;
    const list = byMaterial.get(mesh.material);
    if (list) list.push(mesh);
    else byMaterial.set(mesh.material, [mesh]);
  });
  const baked: Mesh[] = [];
  for (const [material, meshes] of byMaterial) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(_relative.multiplyMatrices(_inverse, mesh.matrixWorld)));
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.name = `${name}_${material.name}`;
    root.add(mesh);
    for (const original of meshes) original.visible = false;
    baked.push(mesh);
  }
  return baked;
}
