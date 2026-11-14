// The fountain of the Well (WELL_FOUNTAIN_BLUEPRINT §8.3): the bucket chain, the water that fills the basin, the jet that pulses with the
// pump and the stream from the top of the chain to the basin. Presentation only: the speeds and the stroke come from the solver through
// the rig's rotors; nothing here decides whether the machine runs.
//
// Three draw calls: one InstancedMesh of buckets (the housing's own `Bucket_Template` mesh, so the bucket is as modelled), one disc for the
// water in the basin, and one InstancedMesh of 24 droplets. Water and droplets share ONE runtime material in the palette's deep teal
// (#1F5C5C, 85 percent opaque, no texture): it is the only material of the game that is not a library entry besides the wake shader's
// (blueprint §8.3, open question Q5), because Mat_WarmGlass is warm and would fight the teal. Nothing allocates per frame.
import { CircleGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, Quaternion, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { chainPoint } from './chain';
import type { ChainGeometry, ChainPoint } from './chain';

export const WATER_COLOR = 0x1f5c5c;
export const BUCKET_COUNT = 10;
export const DROPLET_COUNT = 24;
/** Droplets of one burst of the jet, at the drop of each pump stroke. */
export const JET_BURST = 8;
/** The jet's peak above the nozzle, metres (§8.3: 3.5 cm). */
export const JET_PEAK_M = 0.035;
/**
 * Gravity of the droplets in the machine's own metres: a tenth of g, so a 3.5 cm jet takes half a second instead of a fifth and the eye can
 * follow it (a miniature moves quickly at real gravity).
 */
export const DROPLET_GRAVITY = 1.2;
/** Seconds the basin takes to rise to full once the first bucket has tipped (§8.3: 0.8 cm in 8 s), and how far it rises, metres. */
export const FILL_SECONDS = 8;
export const FILL_RISE_M = 0.008;
/** Radius of the water's surface in the basin, metres (the basin ring is 3.2 cm across). */
export const WATER_RADIUS_M = 0.013;
/** The jet's droplets leave sideways at this speed, spread evenly round the nozzle, m/s. */
const JET_SPREAD_M_S = 0.02;
/** Seconds a droplet of the stream from the chain to the basin is in the air. */
const STREAM_SECONDS = 0.5;
const DROPLET_RADIUS_M = 0.0009;

/** Where the water effects are anchored in the housing's frame, metres. Read from the housing's own nodes when it has them. */
export interface WaterAnchors {
  /** Surface of the empty basin (`Well_WaterLevel`). */
  readonly water: Vector3;
  /** The jet's emitter (`Well_Nozzle`). */
  readonly nozzle: Vector3;
  /** Where the stream leaves the top of the chain. */
  readonly spout: Vector3;
}

/** The jet's lift off the nozzle `t` seconds after it left at `vy`, metres: a ballistic arc, exact. Exported for the tests. */
export const jetHeight = (vy: number, t: number): number => vy * t - 0.5 * DROPLET_GRAVITY * t * t;
/** Launch speed that peaks `height` metres up: v = sqrt(2 g h). */
export const jetSpeed = (height: number): number => Math.sqrt(2 * DROPLET_GRAVITY * height);

/** Seconds from launch to landing back at the nozzle's height. */
export const jetFlightSeconds = (vy: number): number => (2 * vy) / DROPLET_GRAVITY;

export interface WellWater {
  readonly buckets: InstancedMesh | null;
  readonly surface: Mesh;
  readonly droplets: InstancedMesh;
  /** The nodes the water adds that move: the baker must leave them alone. */
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
const _quat = new Quaternion();
const _scale = new Vector3();
const _position = new Vector3();
const _z = new Vector3(0, 0, 1);
const _point: ChainPoint = { x: 0, y: 0, heading: 0 };

interface Droplet {
  /** Seconds in the air, or -1 when the droplet is free. */
  age: number;
  kind: 0 | 1;
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
  /** The housing's bucket mesh (`Bucket_Template`), or null when it has none: the chain is then left out, never invented. */
  readonly bucket: Mesh | null;
  readonly chain: ChainGeometry;
  /** Z of the chain's plane, metres. */
  readonly chainZ: number;
  readonly anchors: WaterAnchors;
  /** Pose of the rod at which the jet fires as the rod drops back (a fraction of the stroke, in metres). */
  readonly dropAt: number;
}): WellWater {
  const { base, bucket, chain, chainZ, anchors, dropAt } = args;
  const material = new MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0, depthWrite: false });

  let buckets: InstancedMesh | null = null;
  if (bucket) {
    buckets = new InstancedMesh(bucket.geometry, bucket.material as Mesh['material'], BUCKET_COUNT);
    buckets.name = 'Well_Buckets';
    buckets.frustumCulled = false;
    base.add(buckets);
    bucket.visible = false;
  }

  const surface = new Mesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), material);
  surface.name = 'Well_Water';
  surface.position.copy(anchors.water);
  surface.scale.setScalar(WATER_RADIUS_M);
  surface.visible = false;
  base.add(surface);

  const droplets = new InstancedMesh(new SphereGeometry(DROPLET_RADIUS_M, 6, 4), material, DROPLET_COUNT);
  droplets.name = 'Well_Droplets';
  droplets.frustumCulled = false;
  base.add(droplets);

  const drops: Droplet[] = Array.from({ length: DROPLET_COUNT }, () => ({ age: -1, kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  const spacing = chain.length / BUCKET_COUNT;
  const prevPhase = new Float32Array(BUCKET_COUNT).fill(-1);
  const vy0 = jetSpeed(JET_PEAK_M);
  let fill = 0;
  let tipped = false;
  let armed = false; // the rod has to rise above `dropAt` before its drop can fire the jet
  let burstTurn = 0;

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

  const launchStream = (): void => {
    const d = free();
    if (!d) return;
    d.age = 0;
    d.kind = 1;
    d.x = anchors.spout.x;
    d.y = anchors.spout.y;
    d.z = anchors.spout.z;
  };

  const placeDroplet = (i: number, d: Droplet): void => {
    if (d.age < 0) {
      _matrix.makeScale(0, 0, 0);
    } else {
      if (d.kind === 0) _position.set(d.x + d.vx * d.age, d.y + jetHeight(d.vy, d.age), d.z + d.vz * d.age);
      else {
        const t = Math.min(1, d.age / STREAM_SECONDS);
        _position.set(d.x + (anchors.water.x - d.x) * t, d.y + (anchors.water.y - d.y) * t * t, d.z + (anchors.water.z - d.z) * t);
      }
      _matrix.makeTranslation(_position.x, _position.y, _position.z);
    }
    droplets.setMatrixAt(i, _matrix);
  };

  return {
    buckets,
    surface,
    droplets,
    nodes: [surface],
    get fill() {
      return fill;
    },
    settle() {
      fill = 1;
      tipped = true;
      surface.position.y = anchors.water.y + FILL_RISE_M;
      surface.visible = true;
    },
    update(dt, pose, travel, running) {
      // The chain: the buckets sit `spacing` apart and ride the loop with the belt.
      if (buckets) {
        for (let i = 0; i < BUCKET_COUNT; i++) {
          const s = travel + i * spacing;
          chainPoint(chain, s, _point);
          _quat.setFromAxisAngle(_z, _point.heading);
          _matrix.compose(_position.set(_point.x, _point.y, chainZ), _quat, _scale.set(1, 1, 1));
          buckets.setMatrixAt(i, _matrix);
          // A bucket reaching the top of the idle pulley tips its water down the chute.
          const phase = (((s - chain.topAt) % chain.length) + chain.length) % chain.length;
          if (running && prevPhase[i] >= 0 && phase < prevPhase[i]) launchStream();
          prevPhase[i] = phase;
        }
        buckets.instanceMatrix.needsUpdate = true;
      }

      // The pump: the jet fires as the rod drops back from the top of its stroke.
      if (pose > dropAt) armed = true;
      else if (armed) {
        armed = false;
        if (running) launchJet();
      }

      for (let i = 0; i < DROPLET_COUNT; i++) {
        const d = drops[i];
        if (d.age >= 0) {
          d.age += dt;
          if (d.kind === 0 ? d.age > jetFlightSeconds(d.vy) : d.age >= STREAM_SECONDS) {
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
        surface.visible = true;
      }
      surface.position.y = anchors.water.y + fill * FILL_RISE_M;
    },
    dispose() {
      surface.geometry.dispose();
      droplets.geometry.dispose();
      material.dispose();
      buckets?.dispose();
      droplets.dispose();
    },
  };
}
