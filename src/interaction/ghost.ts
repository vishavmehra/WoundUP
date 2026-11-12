import { BackSide, Color, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';

/**
 * Socket preview: a ghost of the held part at the socket, about 50% opaque with an outline, warm when the part fits and
 * red when it does not (INTERACTION_SPEC §8; GAMEPLAY_SYSTEMS §7.4). Built from the part's own meshes (no new geometry),
 * created when a grab starts and dropped when it ends, so nothing is allocated per frame.
 */

const WARM = 0xffc66d; // warm lamp glow, CLAUDE.md §8
const RED = 0xc4452f; // brick red that sits in the palette; the spec only says "red outline"
const FILL_OPACITY = 0.5;
const HULL_SCALE = 1.05;

interface GhostMaterials {
  fill: MeshBasicMaterial;
  hull: MeshBasicMaterial;
}

let shared: { valid: GhostMaterials; invalid: GhostMaterials } | undefined;

function materials(): NonNullable<typeof shared> {
  if (!shared) {
    const make = (hex: number): GhostMaterials => ({
      fill: new MeshBasicMaterial({ color: new Color(hex), transparent: true, opacity: FILL_OPACITY, depthWrite: false }),
      // An inverted hull slightly larger than the fill reads as an outline.
      hull: new MeshBasicMaterial({ color: new Color(hex), side: BackSide, transparent: true, opacity: 0.85, depthWrite: false }),
    });
    shared = { valid: make(WARM), invalid: make(RED) };
  }
  return shared;
}

/** Frees the shared ghost materials. Only needed when the whole interaction layer shuts down. */
export function disposeGhostMaterials(): void {
  if (!shared) return;
  for (const set of [shared.valid, shared.invalid]) {
    set.fill.dispose();
    set.hull.dispose();
  }
  shared = undefined;
}

const _inverse = new Matrix4();
const _relative = new Matrix4();
const _scale = new Vector3();

export class GhostPreview {
  private readonly root = new Group();
  private readonly fills: Mesh[] = [];
  private readonly hulls: Mesh[] = [];
  private valid = true;

  constructor(
    source: Object3D,
    private readonly scene: Object3D,
  ) {
    source.updateWorldMatrix(true, true);
    _inverse.copy(source.matrixWorld).invert();
    const { valid } = materials();
    source.traverse((node) => {
      const mesh = node as Mesh;
      // Skip the invisible collider proxies and anything hidden.
      if (!mesh.isMesh || node.userData.wuProxy || !node.visible) return;
      _relative.multiplyMatrices(_inverse, mesh.matrixWorld);
      const fill = new Mesh(mesh.geometry, valid.fill);
      const hull = new Mesh(mesh.geometry, valid.hull);
      for (const ghost of [fill, hull]) {
        _relative.decompose(ghost.position, ghost.quaternion, ghost.scale);
        ghost.raycast = () => {}; // a preview is never a pointer target
        ghost.renderOrder = 10;
        this.root.add(ghost);
      }
      hull.scale.multiplyScalar(HULL_SCALE);
      this.fills.push(fill);
      this.hulls.push(hull);
    });
    // Same size as the part itself (a machine part on a scaled town plot is scaled with it).
    source.getWorldScale(_scale);
    this.root.scale.copy(_scale);
    this.root.visible = false;
    scene.add(this.root);
  }

  /** Puts the ghost at a world pose, warm when `valid` and red when not. */
  show(position: Vector3, quaternion: Quaternion, valid: boolean): void {
    if (valid !== this.valid) {
      this.valid = valid;
      const set = valid ? materials().valid : materials().invalid;
      for (const mesh of this.fills) mesh.material = set.fill;
      for (const mesh of this.hulls) mesh.material = set.hull;
    }
    this.root.position.copy(position);
    this.root.quaternion.copy(quaternion);
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  /** Removes the ghost from the scene. Geometries belong to the part and the materials are shared, so nothing else is freed. */
  dispose(): void {
    this.scene.remove(this.root);
  }
}
