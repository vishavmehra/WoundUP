/**
 * Tockton's dressing in the scene: the houses, street props and lamp posts of `DRESSING` (dressing-table.ts), built as static
 * meshes under one `Dressing` group of the town. Every placement of every piece is baked into ONE merged geometry per library
 * material, so the whole dressing is at most seven draw calls however many pieces the table holds (the same pieces as separate
 * instanced meshes were 36, which pushed the awake town with four machines past the 200 draw-call ceiling, ASSET_OPTIMISATION_
 * BUDGET). A piece is still a placement of the file's own mesh, never an authored copy (ADR-030 item 3); the merge happens once,
 * when the town loads. Pure scene-graph work on loaded models, so Node tests run it on the real GLBs.
 *
 * Colour: the pieces wear the shared library materials like everything else, so the frozen and awake looks, the ripple and the
 * lit windows (`Mat_WarmEmissive` is dark while frozen) come from the one wake shader (wake-shader.ts); which plot wakes a
 * piece is the table's `wakes`, rasterised into the shader's grid. Nothing here shades.
 *
 * Night: the first lamp of each plot also carries a warm point light (at most four in the town, CLAUDE.md §8). The lights exist
 * only while the night is on (an unlit light still costs a pass in every lit material), glow while their plot is awake, and
 * stay in the scene across the wake so no shader ever recompiles when a machine is placed.
 */
import { BufferAttribute, BufferGeometry, Group, Matrix3, Matrix4, Mesh, PointLight, Vector3 } from '@iwsdk/core';
import type { Material, Object3D } from '@iwsdk/core';
import { PLOT_IDS } from '../game/content';
import type { PlotId } from '../game/content';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import { DRESSING, DRESSING_MODEL_PATHS, DRESSING_NODES, MAX_PROP_INSTANCES } from './dressing-table';
import type { DressingFile, DressingItem, DressingNodeName } from './dressing-table';
import { DRESS_Y_M } from './layout';
import { approach } from './motion';
import type { ModelSource, TownModel } from './scene';
import type { WakeField } from './wake';

export type DressingModels = Record<DressingFile, TownModel>;

/** The glTF node whose meshes make each table node (the table's names are the nodes', except the lamp post's). */
const GLB_NODE: Partial<Record<DressingNodeName, string>> = { LampPost: 'LampPost_Housing' };

/** Candela of a lit lamp's point light at full night, its reach in metres (world, town scale 1) and how fast it comes on. */
export const LAMP_LIGHT_CD = 0.01;
export const LAMP_LIGHT_REACH_M = 0.14;
const LAMP_LIGHT_EASE_S = 0.4;
/** The lamp bulb's centre above the post's base (lamp_post.glb: bulb 47.8 to 54.4 mm), where the light hangs. */
const LAMP_BULB_Y_M = 0.052;
/** Switching a light on or off is a shader change: only across this much night. */
const LIGHT_VISIBLE_AT = 0.002;
const WARM_LAMP = 0xffc66d;

export interface LampLight {
  readonly plot: PlotId;
  readonly light: PointLight;
  /** 0 to 1: how far the lamp's own plot has woken the light. */
  level: number;
}

export interface Dressing {
  readonly group: Group;
  /** One merged mesh per library material: the dressing's draw calls. */
  readonly meshes: readonly Mesh[];
  readonly lamps: readonly LampLight[];
  /** Night light easing, once a frame. True while a light is still changing (the picture moves). Allocation-free. */
  update(dt: number, night: number, wake: WakeField): boolean;
}

/** Loads the three dressing files (a fresh instance each). Rejects when one fails. */
export async function loadDressingModels(source: ModelSource): Promise<DressingModels> {
  const files = Object.keys(DRESSING_MODEL_PATHS) as DressingFile[];
  const models = await Promise.all(files.map((file) => source(DRESSING_MODEL_PATHS[file])));
  return Object.fromEntries(files.map((file, i) => [file, models[i]])) as DressingModels;
}

/** The meshes of a table node: its own primitives and everything under it that is not another table node (the files nest them). */
function meshesOf(root: Object3D, glbName: string, others: ReadonlySet<string>): { node: Object3D; meshes: Mesh[] } | null {
  const node = root.getObjectByName(glbName);
  if (!node) return null;
  const meshes: Mesh[] = [];
  const walk = (o: Object3D, top: boolean): void => {
    if (!top && others.has(o.name)) return;
    if ((o as Mesh).isMesh === true) meshes.push(o as Mesh);
    for (const child of o.children) walk(child, false);
  };
  walk(node, true);
  return { node, meshes };
}

const CM = 0.01;
const _place = new Matrix4();
const _yaw = new Matrix4();
const _origin = new Matrix4();
const _v = new Vector3();
const _normalMatrix = new Matrix3();

interface Piece {
  readonly geometry: BufferGeometry;
  readonly matrix: Matrix4;
}

/** The attributes the merged geometry keeps: those every piece has. Library materials need no others (no tangents, no second uv set). */
const KEPT = ['position', 'normal', 'uv', 'color'] as const;

/** One geometry from many placements: each piece's vertices and normals moved by its matrix, indices offset. Runs once at load. */
function mergePieces(pieces: readonly Piece[]): BufferGeometry {
  const names = KEPT.filter((n) => pieces.every((p) => p.geometry.hasAttribute(n)));
  let vertices = 0;
  let indices = 0;
  for (const { geometry } of pieces) {
    const count = geometry.getAttribute('position').count;
    vertices += count;
    indices += geometry.index ? geometry.index.count : count;
  }
  const first = pieces[0].geometry;
  const arrays = names.map((n) => new Float32Array(vertices * first.getAttribute(n).itemSize));
  const index = new Uint32Array(indices);
  let at = 0;
  let ia = 0;
  for (const { geometry, matrix } of pieces) {
    const count = geometry.getAttribute('position').count;
    _normalMatrix.getNormalMatrix(matrix);
    names.forEach((n, k) => {
      const src = geometry.getAttribute(n);
      const dst = arrays[k];
      for (let i = 0; i < count; i++) {
        if (n === 'position' || n === 'normal') {
          _v.fromBufferAttribute(src, i);
          if (n === 'position') _v.applyMatrix4(matrix);
          else _v.applyMatrix3(_normalMatrix).normalize();
          dst[(at + i) * 3] = _v.x;
          dst[(at + i) * 3 + 1] = _v.y;
          dst[(at + i) * 3 + 2] = _v.z;
        } else {
          for (let c = 0; c < src.itemSize; c++) dst[(at + i) * src.itemSize + c] = src.getComponent(i, c);
        }
      }
    });
    const n = geometry.index ? geometry.index.count : count;
    for (let j = 0; j < n; j++) index[ia + j] = (geometry.index ? geometry.index.getX(j) : j) + at;
    at += count;
    ia += n;
  }
  const merged = new BufferGeometry();
  names.forEach((n, k) => merged.setAttribute(n, new BufferAttribute(arrays[k], first.getAttribute(n).itemSize)));
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/**
 * Builds the dressing. `items` is `DRESSING` unless a test passes another table. A node a file lacks is skipped with a warning,
 * so a missing house never takes the town down.
 */
export function buildDressing(models: DressingModels, registry: MaterialRegistry, items: readonly DressingItem[] = DRESSING): Dressing {
  const props = items.filter((i) => DRESSING_NODES[i.node].kind === 'prop').length;
  if (props > MAX_PROP_INSTANCES) throw new Error(`the dressing table has ${props} prop instances; the budget is ${MAX_PROP_INSTANCES} (ADR-034)`);
  const group = new Group();
  group.name = 'Dressing';
  const byMaterial = new Map<Material, Piece[]>();
  let hasLamp = false;

  for (const file of Object.keys(DRESSING_MODEL_PATHS) as DressingFile[]) {
    const model = models[file];
    applyLibraryMaterials(model.scene, registry);
    model.scene.updateMatrixWorld(true);
    const names = (Object.keys(DRESSING_NODES) as DressingNodeName[]).filter((n) => DRESSING_NODES[n].file === file);
    for (const name of names) {
      const rows = items.filter((i) => i.node === name);
      if (rows.length === 0) continue;
      const glbName = GLB_NODE[name] ?? name;
      const others = new Set(names.map((n) => GLB_NODE[n] ?? n).filter((n) => n !== glbName));
      const found = meshesOf(model.scene, glbName, others);
      if (!found || found.meshes.length === 0) {
        console.warn(`[wound-up] ${DRESSING_MODEL_PATHS[file]} has no node ${glbName}; its ${rows.length} piece(s) are left out.`);
        continue;
      }
      hasLamp ||= DRESSING_NODES[name].kind === 'lamp';
      // The sets bake their layout into the vertices: each node carries the floor-contact centre of its piece (`originM`).
      const origin = (found.node.userData.wu as { originM?: readonly number[] } | undefined)?.originM ?? [0, 0, 0];
      _origin.makeTranslation(-origin[0], -origin[1], -origin[2]);
      for (const mesh of found.meshes) {
        const material = mesh.material as Material;
        const pieces = byMaterial.get(material) ?? [];
        byMaterial.set(material, pieces);
        for (const item of rows) {
          _yaw.makeRotationY((item.yawDeg * Math.PI) / 180);
          _place.makeTranslation(item.x * CM, DRESS_Y_M, item.z * CM).multiply(_yaw).multiply(_origin).multiply(mesh.matrixWorld);
          pieces.push({ geometry: mesh.geometry, matrix: _place.clone() });
        }
      }
    }
  }

  const meshes: Mesh[] = [];
  for (const [material, pieces] of byMaterial) {
    const mesh = new Mesh(mergePieces(pieces), material);
    mesh.name = `Dressing_${material.name}`;
    group.add(mesh);
    meshes.push(mesh);
  }

  // One night light per plot, on the plot's first lamp in table order (so the lead moves a light by moving or re-ordering a lamp row).
  const lamps: LampLight[] = [];
  for (const plot of PLOT_IDS) {
    const lamp = items.find((i) => i.node === 'LampPost' && i.wakes === plot);
    if (!lamp || !hasLamp) continue;
    const light = new PointLight(WARM_LAMP, 0, LAMP_LIGHT_REACH_M, 2);
    light.position.set(lamp.x * CM, DRESS_Y_M + LAMP_BULB_Y_M, lamp.z * CM);
    light.visible = false;
    group.add(light);
    lamps.push({ plot, light, level: 0 });
  }

  const update = (dt: number, night: number, wake: WakeField): boolean => {
    let changed = false;
    for (let i = 0; i < lamps.length; i++) {
      const lamp = lamps[i];
      const target = wake.isAwake(lamp.plot) ? night : 0;
      const next = Math.abs(target - lamp.level) < 1e-3 ? target : approach(lamp.level, target, dt, LAMP_LIGHT_EASE_S);
      if (next !== lamp.level) {
        lamp.level = next;
        lamp.light.intensity = LAMP_LIGHT_CD * next;
        changed = true;
      }
      lamp.light.visible = night > LIGHT_VISIBLE_AT || lamp.level > LIGHT_VISIBLE_AT;
    }
    return changed;
  };
  return { group, meshes, lamps, update };
}
