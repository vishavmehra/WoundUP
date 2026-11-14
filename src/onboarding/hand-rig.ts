import { Euler, Group, Quaternion, Vector3 } from 'three';
import type { Material, Object3D, SkinnedMesh } from 'three';

/**
 * A posable hand for the ghost demonstrations (PRODUCT_SPEC F15): the same generic hand model the game serves from its own origin for
 * the player's hands (`public/assets/xr/generic-hand`, ADR-025, WebXR Input Profiles, MIT), cloned, given a translucent material, and bent
 * by forward kinematics instead of tracked joints. No new asset, one skinned mesh (one draw call).
 *
 * The model's 25 joints are flat siblings under its armature, each with an absolute rest pose (fingers along -Y, palm facing -X, thumb on
 * the -Z side, for the right hand). `HandRig` re-frames that into the frame everything else here uses, with the hand's origin at its
 * grasp point (see `anchorOf`): fingers along -Z, palm down (-Y), thumb on the -X side. A finger is bent by turning each joint about the
 * armature's Z axis and moving the joints after it with it; the thumb turns freely about all three axes (`THUMB_PINCH`, solved so that
 * the tips meet when the index finger is in `INDEX_PINCH`; `tests/onboarding/hand-rig.test.ts` checks it against the real model).
 * Everything the per-frame `pose` does is allocation-free.
 */

const FINGERS = {
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
} as const;
const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'] as const;
const WRIST = 'wrist';

/** Joint angles (radians) that curl a finger: proximal, intermediate, distal. The metacarpal is rigid. */
type Curl = readonly [number, number, number];
/** A fist. */
export const FIST: Curl = [1.35, 1.65, 1.0];
/** The index finger when it pinches against the thumb. */
export const INDEX_PINCH: Curl = [0.873, 1.069, 0.534];
/** Euler XYZ angles (radians) of the thumb's metacarpal, proximal and distal joints at a full pinch, in the armature's frame. Solved offline. */
export const THUMB_PINCH: readonly (readonly [number, number, number])[] = [
  [-0.293, 0.563, -0.109],
  [-0.238, 0.23, 0.053],
  [-0.1, -0.018, 0.057],
];

/** How far each part of the hand is bent: the index finger (0 open, 1 the pinch shape, 2 a fist), the thumb (0 open, 1 pinching) and the other three fingers (0 open, 1 a fist). */
export interface HandShape {
  index: number;
  thumb: number;
  rest: number;
}

/** Where on the hand a target position is: the pinch, a pointing fingertip, or the palm. */
export type Anchor = 'pinch' | 'point' | 'palm';

const _q = new Quaternion();
const _r = new Quaternion();
const _e = new Euler();
const _o = new Vector3();
const _p = new Vector3();
const _axis = new Vector3(0, 0, -1); // a positive angle about -Z curls a finger towards the palm (-X in the armature's frame)

/** Rest pose of one joint, as the model has it. */
interface Rest {
  position: Vector3;
  quaternion: Quaternion;
}

/** The joint names a hand model must have. */
export const allJointNames = (): string[] => [WRIST, ...THUMB, ...Object.values(FINGERS).flat()];

export class HandRig {
  /** Place this: its origin is the hand's grasp point for the anchor in use (`anchorOf`). Add it to the scene. */
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly meshes: SkinnedMesh[] = [];
  private readonly bones = new Map<string, Object3D>();
  private readonly rest = new Map<string, Rest>();
  private readonly anchors: Record<Anchor, Vector3> = { pinch: new Vector3(), point: new Vector3(), palm: new Vector3() };
  /** Names of joints the model lacked. A rig with any missing is not usable. */
  readonly missing: string[] = [];

  /** `model` is a clone of the hand GLB's scene (skeleton-safe: IWSDK's `AssetManager.getGLTF` and `SkeletonUtils.clone` both give one). */
  constructor(model: Object3D) {
    this.model = model;
    // Armature frame -> hand frame: x -> y, y -> z, z -> x (a cyclic permutation: 120 degrees about (1, 1, 1)).
    model.quaternion.set(0.5, 0.5, 0.5, 0.5);
    this.root.add(model);
    model.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) {
        (node as SkinnedMesh).frustumCulled = false; // the bounding sphere is of the bind pose; the hand moves far from it
        this.meshes.push(node as SkinnedMesh);
      }
    });
    for (const name of allJointNames()) {
      const bone = model.getObjectByName(name);
      if (!bone) {
        this.missing.push(name);
        continue;
      }
      this.bones.set(name, bone);
      this.rest.set(name, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
    }
    if (this.missing.length === 0) this.measureAnchors();
  }

  /** Gives every mesh of the hand this material (shared, so the caller owns it). */
  setMaterial(material: Material): void {
    for (const mesh of this.meshes) mesh.material = material;
  }

  get ready(): boolean {
    return this.missing.length === 0;
  }

  /** Where the grasp point of `anchor` is, in the hand's own frame: put the hand's origin there with `root.position`. */
  anchorOf(anchor: Anchor): Vector3 {
    return this.anchors[anchor];
  }

  /** Bends the hand into `shape`. Allocation-free. */
  pose(shape: HandShape): void {
    const u = shape.index;
    if (u <= 1) this.finger(FINGERS.index, u * INDEX_PINCH[0], u * INDEX_PINCH[1], u * INDEX_PINCH[2]);
    else {
      const f = Math.min(u - 1, 1);
      this.finger(FINGERS.index, lerp(INDEX_PINCH[0], FIST[0], f), lerp(INDEX_PINCH[1], FIST[1], f), lerp(INDEX_PINCH[2], FIST[2], f));
    }
    for (const name of ['middle', 'ring', 'pinky'] as const) this.finger(FINGERS[name], FIST[0] * shape.rest, FIST[1] * shape.rest, FIST[2] * shape.rest);
    this.thumb(shape.thumb);
  }

  private finger(chain: readonly string[], prox: number, inter: number, dist: number): void {
    const angles = [0, prox, inter, dist, 0];
    _r.identity();
    let previous: Rest | undefined;
    for (let j = 0; j < chain.length; j++) {
      const rest = this.rest.get(chain[j]) as Rest;
      const bone = this.bones.get(chain[j]) as Object3D;
      if (j === 0) _p.copy(rest.position);
      else _p.add(_o.copy(rest.position).sub((previous as Rest).position).applyQuaternion(_r));
      _r.multiply(_q.setFromAxisAngle(_axis, angles[j]));
      bone.position.copy(_p);
      bone.quaternion.copy(_r).multiply(rest.quaternion);
      previous = rest;
    }
  }

  private thumb(t: number): void {
    _r.identity();
    let previous: Rest | undefined;
    for (let j = 0; j < THUMB.length; j++) {
      const rest = this.rest.get(THUMB[j]) as Rest;
      const bone = this.bones.get(THUMB[j]) as Object3D;
      if (j === 0) _p.copy(rest.position);
      else _p.add(_o.copy(rest.position).sub((previous as Rest).position).applyQuaternion(_r));
      const angles = THUMB_PINCH[Math.min(j, THUMB_PINCH.length - 1)];
      if (j < THUMB_PINCH.length) _r.multiply(_q.setFromEuler(_e.set(angles[0] * t, angles[1] * t, angles[2] * t)));
      bone.position.copy(_p);
      bone.quaternion.copy(_r).multiply(rest.quaternion);
      previous = rest;
    }
  }

  /** Reads the three grasp points off the model in the poses they belong to. The hand's own frame is the root's, so the root must be at the origin. */
  private measureAnchors(): void {
    this.root.updateMatrixWorld(true);
    const at = (name: string, out: Vector3): Vector3 => (this.bones.get(name) as Object3D).getWorldPosition(out);
    const a = new Vector3();
    const b = new Vector3();
    this.pose({ index: 1, thumb: 1, rest: 0.5 });
    this.root.updateMatrixWorld(true);
    this.anchors.pinch.copy(at('index-finger-tip', a)).add(at('thumb-tip', b)).multiplyScalar(0.5);
    this.pose({ index: 0, thumb: 0.5, rest: 1 });
    this.root.updateMatrixWorld(true);
    this.anchors.point.copy(at('index-finger-tip', a));
    this.pose({ index: 0, thumb: 0, rest: 0 });
    this.root.updateMatrixWorld(true);
    this.anchors.palm.copy(at(WRIST, a)).add(at('middle-finger-phalanx-proximal', b)).multiplyScalar(0.5);
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
