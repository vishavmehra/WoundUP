/**
 * The Helper's flight (INTRICATE_ASSEMBLY_DESIGN §7.2, press 3): one part lifts from where it lies, flies an arc to its socket in about 0.9 s behind a short
 * warm trail, and lands. What happens at the landing is the caller's `onLand`, which seats the part exactly as a hand's release would (`seatNow` of the
 * interaction layer), so a part the Helper placed is indistinguishable from one the player placed, for gameplay, audio and the completeness check.
 *
 * One flight at a time (the Helper is inert for 1.2 s after a press, longer than the flight is in the air). It places one part and never anything else: it does
 * not wind and does not run. Presentation and one callback; it decides nothing.
 *
 * Cost: the part itself, plus one `Points` of 10 additive sprites (one draw call, only while a trail is alive; a warm lamp glow that never exceeds 0.6).
 * `update` allocates nothing: every scratch object is module-level and the trail's buffers are fixed.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, Points, PointsMaterial, Quaternion, RGBAFormat, UnsignedByteType, Vector3 } from 'three';
import type { Object3D } from 'three';

/** Seconds in the air. */
export const FLIGHT_S = 0.9;
/** The arc's peak above the straight line: a base, plus a share of the distance so a long carry lifts higher, metres. */
export const FLIGHT_LIFT_M = 0.04;
export const FLIGHT_LIFT_PER_M = 0.25;
/** The trail: sprites in the pool, seconds between two of them, how long one lives, its size and its peak brightness (design §10: never above 0.6). */
export const TRAIL_POINTS = 10;
export const TRAIL_STEP_S = 0.035;
export const TRAIL_LIFE_S = 0.35;
export const TRAIL_SIZE_M = 0.012;
export const TRAIL_PEAK = 0.6;

const LAMP = new Color(0xffc66d); // warm lamp glow, CLAUDE.md §8

/** 0 to 1 and back to 0 to 1 smoothly: the part leaves gently and arrives gently. */
export const flightEase = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** How high the arc peaks for a flight of `distance` metres. */
export const flightLift = (distance: number): number => FLIGHT_LIFT_M + FLIGHT_LIFT_PER_M * distance;

/** A point on the arc at `u` (0 to 1): the straight line from `from` to `to` with a parabola added on +Y that peaks at `lift` halfway. Written into `out`. */
export function arcPoint(from: Vector3, to: Vector3, lift: number, u: number, out: Vector3): Vector3 {
  out.lerpVectors(from, to, u);
  out.y += 4 * lift * u * (1 - u);
  return out;
}

/** The brightness of a trail sprite `age` seconds old: it fades out quickly and never exceeds `TRAIL_PEAK`. */
export function trailBrightness(age: number): number {
  if (!(age >= 0) || age >= TRAIL_LIFE_S) return 0;
  const left = 1 - age / TRAIL_LIFE_S;
  return TRAIL_PEAK * left * left;
}

const _to = new Vector3();
const _here = new Vector3();
const _local = new Vector3();
const _qTo = new Quaternion();
const _qNow = new Quaternion();
const _qParent = new Quaternion();

/** A soft round sprite for the trail, built once: no file to load. */
function sprite(): DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 2;
      data.set([255, 255, 255, Math.round(255 * a)], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class HelperFlight {
  private part: Object3D | null = null;
  private node: Object3D | null = null;
  private onLand: (() => void) | null = null;
  private abort: (() => boolean) | null = null;
  private elapsed = 0;
  private lift = 0;
  private readonly from = new Vector3();
  private readonly qFrom = new Quaternion();

  private readonly positions = new Float32Array(TRAIL_POINTS * 3);
  private readonly colors = new Float32Array(TRAIL_POINTS * 3);
  private readonly ages = new Float32Array(TRAIL_POINTS).fill(Infinity);
  private slot = 0;
  private sinceStep = 0;
  private trailLit = false;
  private readonly geometry = new BufferGeometry();
  private readonly texture = sprite();
  private readonly material: PointsMaterial;
  private readonly points: Points;

  constructor(private readonly scene: Object3D) {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.material = new PointsMaterial({
      map: this.texture,
      size: TRAIL_SIZE_M,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending, // black is invisible: the fade is in the vertex colours
      toneMapped: false,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = 'HelperTrail';
    this.points.frustumCulled = false; // its buffers move every frame; the bounding sphere would be stale
    this.points.renderOrder = 11;
    this.points.raycast = () => {}; // a trail is never a pointer target
    this.points.visible = false;
    scene.add(this.points);
  }

  /** A part is in the air. */
  get active(): boolean {
    return this.part !== null;
  }

  /**
   * Lifts `part` from where it is and flies it to `node` (a socket's empty, followed every frame). `onLand` runs once when it arrives. `abort` is asked every frame:
   * when it says true (a hand took the part) the flight ends where it is and `onLand` does not run. A second `start` while one is in the air cancels the first.
   */
  start(part: Object3D, node: Object3D, onLand: () => void, abort?: () => boolean): void {
    this.cancel();
    part.getWorldPosition(this.from);
    part.getWorldQuaternion(this.qFrom);
    node.getWorldPosition(_to);
    this.lift = flightLift(this.from.distanceTo(_to));
    this.part = part;
    this.node = node;
    this.onLand = onLand;
    this.abort = abort ?? null;
    this.elapsed = 0;
  }

  /** Ends a flight where it is, without landing. The trail fades by itself. */
  cancel(): void {
    this.part = null;
    this.node = null;
    this.onLand = null;
    this.abort = null;
  }

  update(dt: number): void {
    const part = this.part;
    const node = this.node;
    if (part === null || node === null) {
      if (this.trailLit) this.stepTrail(dt, null);
      return;
    }
    if (this.abort?.() === true) {
      this.cancel();
      this.stepTrail(dt, null);
      return;
    }
    this.elapsed += dt;
    const u = Math.min(1, this.elapsed / FLIGHT_S);
    const e = flightEase(u);
    node.getWorldPosition(_to);
    node.getWorldQuaternion(_qTo);
    arcPoint(this.from, _to, this.lift, e, _here);
    _qNow.slerpQuaternions(this.qFrom, _qTo, e);

    const parent = part.parent;
    _local.copy(_here);
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(_local);
      parent.getWorldQuaternion(_qParent).invert();
      _qNow.premultiply(_qParent);
    }
    part.position.copy(_local);
    part.quaternion.copy(_qNow);
    this.stepTrail(dt, _here);

    if (u >= 1) {
      const land = this.onLand;
      this.cancel();
      land?.();
    }
  }

  dispose(): void {
    this.cancel();
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }

  /** Ages the sprites, drops a new one at `head` every `TRAIL_STEP_S`, and writes the fade into the colours. Dark when idle: nothing is drawn. */
  private stepTrail(dt: number, head: Vector3 | null): void {
    for (let i = 0; i < TRAIL_POINTS; i++) if (this.ages[i] < TRAIL_LIFE_S) this.ages[i] += dt;
    if (head !== null) {
      this.sinceStep += dt;
      if (this.sinceStep >= TRAIL_STEP_S) {
        this.sinceStep = 0;
        this.slot = (this.slot + 1) % TRAIL_POINTS;
        this.positions[this.slot * 3] = head.x;
        this.positions[this.slot * 3 + 1] = head.y;
        this.positions[this.slot * 3 + 2] = head.z;
        this.ages[this.slot] = 0;
      }
    }
    let lit = false;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const f = trailBrightness(this.ages[i]);
      this.colors[i * 3] = LAMP.r * f;
      this.colors[i * 3 + 1] = LAMP.g * f;
      this.colors[i * 3 + 2] = LAMP.b * f;
      if (f > 0) lit = true;
    }
    if (lit || this.trailLit) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
    this.trailLit = lit;
    this.points.visible = lit;
  }
}
