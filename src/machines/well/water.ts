// The fountain of the Well (WELL_FOUNTAIN_BLUEPRINT §8.3, `well_base.glb`): the bucket chain, the water that fills the basin, the jet that
// pulses with the pump, the stream from the top of the chain to the basin and the water that spills over the lip once it is full.
// Presentation only: the speeds and the stroke come from the solver through the rig's rotors; nothing here decides whether the machine runs.
//
// Draw calls: the bucket template has two primitives (walnut and brass), so the buckets are two InstancedMeshes of ten; the water in the basin
// is the housing's own `Well_WaterLevel` disc, raised and given the water material; the droplets are one InstancedMesh of 32. Water and
// droplets share ONE runtime material in the palette's deep teal (#1F5C5C, 85 percent opaque, no texture): it is the only material of the
// game that is not a library entry besides the wake shader's (blueprint §8.3, open question Q5), because Mat_WarmGlass is warm and would
// fight the teal. Nothing allocates per frame.
import { InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Mesh, Object3D } from '@iwsdk/core';
import { chainOutward, chainPoint } from './chain';
import type { ChainGeometry, ChainPoint } from './chain';

export const WATER_COLOR = 0x1f5c5c;
export const BUCKET_COUNT = 10;
export const DROPLET_COUNT = 32;
/** Droplets of one burst of the jet, at the drop of each pump stroke. */
export const JET_BURST = 8;
/** The jet's peak above the nozzle, metres (§8.3: 3.5 cm; the housing says 3.4). */
export const JET_PEAK_M = 0.034;
/**
 * Gravity of the droplets in the machine's own metres: a tenth of g, so a 3.4 cm jet takes half a second instead of a fifth and the eye can
 * follow it (a miniature moves quickly at real gravity).
 */
export const DROPLET_GRAVITY = 1.2;
/** Seconds the basin takes to rise to full once the first bucket has tipped (§8.3: 0.8 cm in 8 s). */
export const FILL_SECONDS = 8;
/** The jet's droplets leave sideways at this speed, spread evenly round the nozzle, m/s. */
const JET_SPREAD_M_S = 0.02;
/** Seconds a droplet of the stream from the chain to the basin is in the air. */
const STREAM_SECONDS = 0.5;
const DROPLET_RADIUS_M = 0.0009;
/** How far a bucket tips its mouth towards the basin as it goes over the top of the idle pulley, radians, and over what stretch of the chain, metres. */
const TIP_RAD = 0.9;
const TIP_REACH_M = 0.014;
/** Seconds between two drops of the curtain that spills over the lip once the basin is full. */
const SPILL_EVERY_S = 0.18;

/** Where the water effects are anchored in the housing's frame, metres. */
export interface WaterAnchors {
  /** The jet's emitter (`PIV_Nozzle`): the jet leaves it and the stream lands under it, at the basin's surface. */
  readonly nozzle: Vector3;
  /** Where the stream leaves the top of the chain. */
  readonly spout: Vector3;
  /** The lip the full basin spills over (`PIV_Spout`) and the height of the pool's surface under it. */
  readonly lip: Vector3;
  readonly poolY: number;
}

/** The jet's lift off the nozzle `t` seconds after it left at `vy`, metres: a ballistic arc, exact. Exported for the tests. */
export const jetHeight = (vy: number, t: number): number => vy * t - 0.5 * DROPLET_GRAVITY * t * t;
/** Launch speed that peaks `height` metres up: v = sqrt(2 g h). */
export const jetSpeed = (height: number): number => Math.sqrt(2 * DROPLET_GRAVITY * height);
/** Seconds from launch to landing back at the nozzle's height. */
export const jetFlightSeconds = (vy: number): number => (2 * vy) / DROPLET_GRAVITY;

/** How far the bucket whose attachment point is at distance `s` along the chain has tipped, radians: a bump over the top of the idle pulley. Exported for the tests. */
export function bucketTip(chain: ChainGeometry, s: number): number {
  const length = chain.length;
  let d = (((s - chain.topAt) % length) + length) % length;
  if (d > length / 2) d -= length;
  const x = d / TIP_REACH_M;
  return TIP_RAD * Math.exp(-x * x);
}

/** The housing's bucket: the meshes of its template (each with its own material) and where the bucket's bottom centre is, in the housing's frame. */
export interface BucketTemplate {
  readonly meshes: readonly Mesh[];
  readonly origin: Vector3;
  /** Distance of that bottom centre outside the chain's line, metres: the bucket hangs off the chain by this much. */
  readonly offset: number;
}

export interface WellWater {
  readonly buckets: readonly InstancedMesh[];
  readonly droplets: InstancedMesh;
  /** The nodes the water moves that the baker must leave alone: the surface disc, which the housing owns. */
  readonly nodes: readonly Object3D[];
  /** 0 empty to 1 full. */
  readonly fill: number;
  /** A restored machine's basin is full from the first frame. */
  settle(): void;
  /**
   * One frame. `pose` is the pump rod's lift in metres (the follower pose), `travel` the distance the chain has moved since the rig was
   * built (positive the way the buckets rise), `running` whether the spring is driving it.
   */
  update(dt: number, pose: number, travel: number, running: boolean): void;
  dispose(): void;
}

const _matrix = new Matrix4();
const _bucket = new Matrix4();
const _to = new Matrix4();
const _from = new Matrix4();
const _position = new Vector3();
const _point: ChainPoint = { x: 0, y: 0, heading: 0 };

interface Droplet {
  /** Seconds in the air, or -1 when the droplet is free. */
  age: number;
  /** 0 the jet, 1 the stream from the chain, 2 the spill over the lip. */
  kind: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function createWellWater(args: {
  /** The housing, whose frame everything is in. */
  readonly base: Object3D;
  /** The housing's bucket template, or null when it has none: the chain is then left out, never invented. */
  readonly bucket: BucketTemplate | null;
  readonly chain: ChainGeometry;
  /** Z of the chain's plane, metres. */
  readonly chainZ: number;
  readonly anchors: WaterAnchors;
  /** The housing's water disc (`Well_WaterLevel`), or null: the basin then shows no surface. It is raised by `riseM` as the basin fills. */
  readonly surface: Mesh | null;
  readonly riseM: number;
  /** Pose of the rod at which the jet fires as the rod drops back (metres). */
  readonly dropAt: number;
}): WellWater {
  const { base, bucket, chain, chainZ, anchors, surface, riseM, dropAt } = args;
  const material = new MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0, depthWrite: false });

  const buckets: InstancedMesh[] = [];
  const meshLocals: Matrix4[] = []; // each template mesh in the housing's frame (identity when its node has no transform)
  if (bucket) {
    base.updateWorldMatrix(true, true);
    _to.copy(base.matrixWorld).invert();
    for (const mesh of bucket.meshes) {
      const instanced = new InstancedMesh(mesh.geometry, mesh.material, BUCKET_COUNT);
      instanced.name = `Well_Buckets_${buckets.length}`;
      instanced.frustumCulled = false;
      base.add(instanced);
      buckets.push(instanced);
      meshLocals.push(new Matrix4().multiplyMatrices(_to, mesh.matrixWorld));
      mesh.visible = false; // the template itself is never drawn
    }
  }
  const surfaceY = surface?.position.y ?? 0;
  if (surface) {
    surface.material = material;
    surface.visible = false; // hidden at rest: the basin is empty until the first bucket tips
  }

  const droplets = new InstancedMesh(new SphereGeometry(DROPLET_RADIUS_M, 6, 4), material, DROPLET_COUNT);
  droplets.name = 'Well_Droplets';
  droplets.frustumCulled = false;
  base.add(droplets);

  const drops: Droplet[] = Array.from({ length: DROPLET_COUNT }, () => ({ age: -1, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  const spacing = chain.length / BUCKET_COUNT;
  const prevPhase = new Float32Array(BUCKET_COUNT).fill(-1);
  const vy0 = jetSpeed(JET_PEAK_M);
  const waterTop = surfaceY + riseM;
  let fill = 0;
  let tipped = false;
  let armed = false; // the rod has to rise above `dropAt` before its drop can fire the jet
  let burstTurn = 0;
  let spillClock = 0;

  const free = (): Droplet | undefined => drops.find((d) => d.age < 0);

  const launchJet = (): void => {
    for (let k = 0; k < JET_BURST; k++) {
      const d = free();
      if (!d) return;
      const a = ((k + burstTurn * 0.5) / JET_BURST) * Math.PI * 2;
      d.age = 0;
      d.kind = 0;
      d.x = anchors.nozzle.x;
      d.y = anchors.nozzle.y;
      d.z = anchors.nozzle.z;
      d.vx = JET_SPREAD_M_S * Math.cos(a);
      d.vz = JET_SPREAD_M_S * Math.sin(a);
      d.vy = vy0 * (0.85 + 0.15 * ((k % 3) / 2));
    }
    burstTurn++;
  };

  const launch = (kind: 1 | 2): void => {
    const d = free();
    if (!d) return;
    const from = kind === 1 ? anchors.spout : anchors.lip;
    d.age = 0;
    d.kind = kind;
    d.x = from.x;
    d.y = from.y;
    d.z = from.z;
    d.vx = d.vy = d.vz = 0;
  };

  const placeDroplet = (i: number, d: Droplet): void => {
    if (d.age < 0) {
      _matrix.makeScale(0, 0, 0);
    } else {
      if (d.kind === 0) _position.set(d.x + d.vx * d.age, d.y + jetHeight(d.vy, d.age), d.z + d.vz * d.age);
      else if (d.kind === 1) {
        const t = Math.min(1, d.age / STREAM_SECONDS);
        _position.set(d.x + (anchors.nozzle.x - d.x) * t, d.y + (waterTop - d.y) * t * t, d.z + (anchors.nozzle.z - d.z) * t);
      } else _position.set(d.x, d.y - 0.5 * DROPLET_GRAVITY * d.age * d.age, d.z);
      _matrix.makeTranslation(_position.x, _position.y, _position.z);
    }
    droplets.setMatrixAt(i, _matrix);
  };

  return {
    buckets,
    droplets,
    nodes: surface ? [surface] : [],
    get fill() {
      return fill;
    },
    settle() {
      fill = 1;
      tipped = true;
      if (surface) {
        surface.position.y = surfaceY + riseM;
        surface.visible = true;
      }
    },
    update(dt, pose, travel, running) {
      // The chain: the buckets sit `spacing` apart and ride the loop with the belt, upright, and tip over the top.
      if (bucket && buckets.length > 0) {
        for (let i = 0; i < BUCKET_COUNT; i++) {
          const s = travel + i * spacing;
          chainPoint(chain, s, _point);
          const out = chainOutward(_point.heading);
          // bottom centre of the bucket -> its place on the chain, tipped about that point
          _from.makeTranslation(-bucket.origin.x, -bucket.origin.y, -bucket.origin.z);
          _to.makeRotationZ(bucketTip(chain, s));
          _bucket.makeTranslation(_point.x + out.x * bucket.offset, _point.y + out.y * bucket.offset, chainZ).multiply(_to).multiply(_from);
          for (let k = 0; k < buckets.length; k++) buckets[k].setMatrixAt(i, _matrix.multiplyMatrices(_bucket, meshLocals[k]));
          // A bucket reaching the top of the idle pulley tips its water down the chute.
          const phase = (((s - chain.topAt) % chain.length) + chain.length) % chain.length;
          if (running && prevPhase[i] >= 0 && phase < prevPhase[i]) launch(1);
          prevPhase[i] = phase;
        }
        for (let k = 0; k < buckets.length; k++) buckets[k].instanceMatrix.needsUpdate = true;
      }

      // The pump: the jet fires as the rod drops back from the top of its stroke.
      if (pose > dropAt) armed = true;
      else if (armed) {
        armed = false;
        if (running) launchJet();
      }

      // Once the basin is full it spills over the lip in a thin curtain, for as long as the buckets keep coming.
      if (running && fill >= 1) {
        spillClock += dt;
        if (spillClock >= SPILL_EVERY_S) {
          spillClock = 0;
          launch(2);
        }
      }

      for (let i = 0; i < DROPLET_COUNT; i++) {
        const d = drops[i];
        if (d.age >= 0) {
          d.age += dt;
          const over =
            d.kind === 0 ? d.age > jetFlightSeconds(d.vy) : d.kind === 1 ? d.age >= STREAM_SECONDS : d.y - 0.5 * DROPLET_GRAVITY * d.age * d.age <= anchors.poolY;
          if (over) {
            if (d.kind === 1) tipped = true; // the first drop of the stream has reached the basin
            d.age = -1;
          }
        }
        placeDroplet(i, d);
      }
      droplets.instanceMatrix.needsUpdate = true;

      // The basin rises once the first bucket has tipped, and stays full.
      if (tipped && fill < 1) {
        fill = Math.min(1, fill + dt / FILL_SECONDS);
        if (surface) surface.visible = true;
      }
      if (surface) surface.position.y = surfaceY + fill * riseM;
    },
    dispose() {
      droplets.geometry.dispose();
      material.dispose();
      for (const b of buckets) b.dispose(); // their geometry is the housing's
      droplets.dispose();
    },
  };
}
