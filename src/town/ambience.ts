/**
 * The town's small life once it is awake (owner-approved polish, 2026-11-14; PRODUCT_SPEC §6.3 "Chimney smoke appears ... Oven glows"):
 * chimney smoke on the Bakery and two houses, the Bakery oven glowing warmly, and pennants that flutter on the theatre and the Bakery.
 * Three draw calls in all, one material each, and nothing allocates per frame: `update` writes numbers into the arrays built here.
 *
 *  - Smoke: soft billboard quads in ONE mesh (a custom material that turns each quad to the eye, so it is right in both eyes of the
 *    headset; `gl_PointSize` is not, because three sizes points from the page's height). Each chimney has a few puffs that rise, grow and
 *    fade on a fixed loop, a pure function of the clock.
 *  - Oven glow: one additive mesh of three soft quads over the Bakery's oven mouth and its two lit windows, pulsing a little. (The oven
 *    stands behind the Carousel as the player sits; the windows are what shows.)
 *  - Pennants: poles and pennants merged into one mesh whose vertices sway in the vertex shader (no bones, no clips). A pennant is raised
 *    from its pole when its plot settles and takes itself in again if the plot is reset.
 *
 * A frozen town draws none of it: an empty draw range costs no work, yet three still sets the three programs up with the rest of the town, so
 * nothing compiles in the middle of a wake ripple. Everything is gated by the town's own state, never by a flag of its own: a chimney smokes once its plot's ripple has settled (the Bakery's,
 * only while the Windmill is turning: PRODUCT_SPEC "When the Windmill operates"), a pennant flies once its plot has settled, and all of it
 * eases out again when the town is frozen. The night dims and cools the smoke and warms the glow; the pennants are lit by the room lights,
 * which the night already dims (night.ts).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
} from '@iwsdk/core';
import type { Object3D, WebGLProgramParametersWithUniforms } from '@iwsdk/core';
import type { PlotId } from '../game/content';
import { DRESSING, type DressingItem, type DressingNodeName } from './dressing-table';
import { BAKERY_AT, DRESS_Y_M, THEATRE_AT } from './layout';
import { approach } from './motion';
import type { WakeField } from './wake';

const CM = 0.01;

// ---- Where things are (town space at scale 1, metres; the town group applies the scale) ----------------------------------------

/** The Bakery's chimney mouth in the Bakery's own frame (bakery_building.glb `SOCKET_Smoke`); used when the model lacks the empty. */
const BAKERY_CHIMNEY: readonly [number, number, number] = [0.04, 0.19, -0.0275];
/**
 * The warm patches of the Bakery, in its own frame: the oven's arched mouth (bakery_building.glb: the `Mat_WarmEmissive` block at x 26 to 50 mm,
 * y 11 to 45 mm, recessed behind the 46 mm front face) and the two lit windows above it (x 23 to 43 mm either side, y 81 to 114 mm, behind
 * their 47 mm frames). Each is one quad of the glow, a little larger than what it lights, standing just in front of the frames. `strength` is
 * how much of the glow's colour it takes: the oven is the hearth, the windows only catch its light. The oven stands behind the Carousel's
 * plot as the player sits, so the windows are what is most often seen.
 */
export const GLOW_QUADS: ReadonlyArray<{ x: number; y: number; z: number; w: number; h: number; strength: number }> = [
  { x: 0.038, y: 0.029, z: 0.0475, w: 0.05, h: 0.058, strength: 1 },
  { x: -0.033, y: 0.0975, z: 0.0485, w: 0.042, h: 0.054, strength: 0.4 },
  { x: 0.033, y: 0.0975, z: 0.0485, w: 0.042, h: 0.054, strength: 0.4 },
];

/**
 * Where each house's chimney mouth is, from its floor-contact centre at yaw 0 (the highest vertices of each house in town_houses.glb, the
 * cap of the stack; tests/town/ambience.test.ts compares them with the real file). Not every node has one worth smoking.
 */
export const CHIMNEY_MOUTH: Partial<Record<DressingNodeName, readonly [number, number, number]>> = {
  TownHouse_Tall: [0, 0.1894, -0.015],
  TownHouse_Corner: [0, 0.153, -0.015],
  TownHouse_Cottage: [0.022, 0.1409, 0],
  TownHouse_Jetty: [0, 0.1506, -0.014],
};

/** The two houses that smoke (rows of the dressing table, so a house moved there takes its smoke with it): one the Windmill wakes, one the Clock Tower. */
export const SMOKING_HOUSES: readonly string[] = ['house_cottage', 'house_tall'];

export interface Chimney {
  readonly id: string;
  /** Town space, metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The plot that has to be settled for it to smoke. */
  readonly plot: PlotId;
  /** True for the Bakery's: it smokes only while the Windmill is turning. */
  readonly needsWindmill: boolean;
}

/** A house's chimney mouth in town space: the dressing places a piece with a translation, then a turn about +Y, then the piece's own offset. */
export function houseChimney(item: DressingItem): Chimney | null {
  const mouth = CHIMNEY_MOUTH[item.node];
  if (!mouth) return null;
  const yaw = (item.yawDeg * Math.PI) / 180;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    id: item.id,
    x: item.x * CM + c * mouth[0] + s * mouth[2],
    y: DRESS_Y_M + mouth[1],
    z: item.z * CM - s * mouth[0] + c * mouth[2],
    plot: item.wakes,
    needsWindmill: false,
  };
}

export interface FlagDef {
  readonly id: string;
  /** Foot of the pole, town space metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly plot: PlotId;
  /** sRGB hex of the pennant (the palette). */
  readonly color: number;
}

const POLE_M = 0.016;
const POLE_WIDTH_M = 0.0007;
const PENNANT_LENGTH_M = 0.021;
const PENNANT_HEIGHT_M = 0.009;
const PENNANT_SEGMENTS = 6;
const POLE_COLOR = 0xc9a227; // aged brass

/**
 * The pennants: on the brass finials at the two top corners of the theatre facade (96.2 mm either side of its centre, 177.2 mm up, 12.8 mm
 * forward) and on the
 * Bakery's right roof end (its left end is 5 mm from the theatre's right finial, so a flag there would crowd it). All stream the same way,
 * the wind of the town (+X). The tests compare the positions with the real GLBs.
 */
export const FLAGS: readonly FlagDef[] = [
  { id: 'flag_theatre_left', x: THEATRE_AT.x - 0.0962, y: 0.1772, z: THEATRE_AT.z + 0.013, plot: 'plot_clock_tower', color: 0x1f5c5c },
  { id: 'flag_theatre_right', x: THEATRE_AT.x + 0.0962, y: 0.1772, z: THEATRE_AT.z + 0.013, plot: 'plot_clock_tower', color: 0xc9a227 },
  { id: 'flag_bakery', x: BAKERY_AT.x + 0.0595, y: 0.1839, z: BAKERY_AT.z, plot: 'plot_windmill', color: 0xf2e6cf },
];

// ---- Numbers of the look --------------------------------------------------------------------------------------------------------

/** Puffs per chimney, and how long one takes from the chimney to gone, seconds. */
export const PUFFS_PER_CHIMNEY = 5;
export const PUFF_LIFE_S = 3.6;
const PUFF_RISE_M = 0.065;
const PUFF_DRIFT_M = 0.02;
const PUFF_SWAY_M = 0.003;
const PUFF_SIZE_M = [0.006, 0.022] as const;
const PUFF_ALPHA = 0.8;
/** A warm grey by day (dark enough to read against a pale wall and light enough against the rug), a bluer and darker one at night (linear RGB). */
const SMOKE_DAY = [0.36, 0.33, 0.3] as const;
const SMOKE_NIGHT = [0.07, 0.09, 0.17] as const;
/** Time constants of a chimney, the glow and a pennant coming on and going off, seconds. */
const SMOKE_EASE_S = 1.2;
const GLOW_EASE_S = 0.9;
const FLAG_EASE_S = 0.7;
/** Below this a level counts as off (nothing is drawn, nothing is busy). */
const OFF = 1e-3;
/** The wind of the pennants: speed of the ripple along them, radians a second, and how far they stand out of their plane, metres. */
const FLUTTER_RAD_S = 6;
const FLUTTER_M = 0.0018;
const FLUTTER_LIFT_M = 0.0006;
/** The windmill counts as turning above this fraction of its run speed. */
const WINDMILL_TURNING = 0.05;
const OVEN_GLOW = '#ffa24a';

// ---- The soft round sprite ------------------------------------------------------------------------------------------------------

/** The fraction of a sprite's radius that is full strength before it softens to nothing. */
const SOFT_CORE = 0.3;

/** A white disc whose alpha falls off smoothly to nothing at the edge: the one texture of the smoke and the glow. Built once, in memory. */
export function createSoftTexture(size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (i + 0.5) / size - 0.5;
      const dy = (j + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const t = Math.min(1, (1 - r) / (1 - SOFT_CORE)); // 1 inside the core, easing to exactly 0 at the edge
      const falloff = t * t * (3 - 2 * t);
      const at = (j * size + i) * 4;
      data[at] = data[at + 1] = data[at + 2] = 255;
      data[at + 3] = Math.round(255 * falloff);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// ---- Smoke ----------------------------------------------------------------------------------------------------------------------

const SMOKE_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute float aSize;
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
	vUv = aCorner * 0.5 + 0.5;
	vAlpha = aAlpha;
	vec4 world = modelMatrix * vec4( position, 1.0 );
	float townScale = length( modelMatrix[ 0 ].xyz );
	vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
	vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
	world.xyz += ( right * aCorner.x + up * aCorner.y ) * ( 0.5 * aSize * townScale );
	gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SMOKE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
varying vec2 vUv;
varying float vAlpha;
void main() {
	float a = texture2D( uMap, vUv ).a * vAlpha;
	if ( a < 0.004 ) discard;
	gl_FragColor = vec4( uTint, a );
	#include <colorspace_fragment>
}`;

/**
 * Shows or hides a mesh without ever making it invisible: an empty draw range draws nothing and costs no draw call, but three still sets
 * the program up for it, so the three shaders are compiled with the rest of the town when it first appears, not in the middle of the wake
 * ripple (a compile is a frame or two on a headset).
 */
function show(mesh: Mesh, on: boolean): void {
  mesh.geometry.setDrawRange(0, on ? Infinity : 0);
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

// ---- Pennants -------------------------------------------------------------------------------------------------------------------

/** The flutter in the vertex shader: the free end of a pennant sways out of its plane, the more the nearer the tip; `aLevel` raises it from its foot. */
const FLAG_ATTRIBUTES = 'attribute float aSway;\nattribute float aPhase;\nattribute float aLevel;\nattribute vec3 aBase;\nuniform float uTime;';
const FLAG_VERTEX = `
	transformed = aBase + ( transformed - aBase ) * aLevel;
	float wuSway = aSway * aLevel;
	transformed.z += wuSway * sin( uTime * ${FLUTTER_RAD_S.toFixed(1)} + aPhase + aSway * 5.0 ) * ${FLUTTER_M.toFixed(5)};
	transformed.y += wuSway * sin( uTime * ${(FLUTTER_RAD_S * 1.4).toFixed(1)} + aPhase * 1.7 + aSway * 3.0 ) * ${FLUTTER_LIFT_M.toFixed(5)};`;
export const FLAG_PROGRAM_KEY = 'wu-flags-1';

interface FlagBuild {
  readonly geometry: BufferGeometry;
  /** Index of the first vertex of each flag, and how many vertices it has. */
  readonly first: number[];
  readonly count: number;
}

/** Appends one flag (a box for the pole, a pointed pennant of PENNANT_SEGMENTS strips) to the buffers. */
function buildFlags(flags: readonly FlagDef[]): FlagBuild {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const sway: number[] = [];
  const phase: number[] = [];
  const base: number[] = [];
  const index: number[] = [];
  const first: number[] = [];
  const pole = new Color(POLE_COLOR);
  const push = (p: readonly [number, number, number], n: readonly [number, number, number], c: Color, s: number, ph: number, foot: FlagDef): void => {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    colors.push(c.r, c.g, c.b);
    sway.push(s);
    phase.push(ph);
    base.push(foot.x, foot.y, foot.z);
  };
  flags.forEach((flag, f) => {
    first.push(positions.length / 3);
    const ph = f * 1.9;
    const w = POLE_WIDTH_M / 2;
    const top = flag.y + POLE_M;
    // Pole: a box, four sides.
    const o = positions.length / 3;
    const corners: ReadonlyArray<readonly [number, number]> = [[-w, -w], [w, -w], [w, w], [-w, w]];
    const sideNormals: ReadonlyArray<readonly [number, number, number]> = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
    for (let k = 0; k < 4; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % 4];
      push([flag.x + a[0], flag.y, flag.z + a[1]], sideNormals[k], pole, 0, ph, flag);
      push([flag.x + b[0], flag.y, flag.z + b[1]], sideNormals[k], pole, 0, ph, flag);
      push([flag.x + b[0], top, flag.z + b[1]], sideNormals[k], pole, 0, ph, flag);
      push([flag.x + a[0], top, flag.z + a[1]], sideNormals[k], pole, 0, ph, flag);
      const v = o + k * 4;
      index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    // Pennant: a triangle from the pole to a point, top edge level, lower edge rising to meet it.
    const colour = new Color(flag.color);
    const p0 = positions.length / 3;
    const topEdge = top - 0.0006;
    for (let k = 0; k <= PENNANT_SEGMENTS; k++) {
      const t = k / PENNANT_SEGMENTS;
      const x = flag.x + w + PENNANT_LENGTH_M * t;
      push([x, topEdge, flag.z], [0, 0, 1], colour, t, ph, flag);
      push([x, topEdge - PENNANT_HEIGHT_M * (1 - t), flag.z], [0, 0, 1], colour, t, ph, flag);
    }
    for (let k = 0; k < PENNANT_SEGMENTS; k++) {
      const a = p0 + k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('aSway', new BufferAttribute(new Float32Array(sway), 1));
  geometry.setAttribute('aPhase', new BufferAttribute(new Float32Array(phase), 1));
  geometry.setAttribute('aBase', new BufferAttribute(new Float32Array(base), 3));
  geometry.setAttribute('aLevel', new BufferAttribute(new Float32Array(positions.length / 3), 1).setUsage(DynamicDrawUsage));
  geometry.setIndex(new BufferAttribute(new Uint16Array(index), 1));
  return { geometry, first, count: positions.length / 3 };
}

// ---- The ambience ---------------------------------------------------------------------------------------------------------------

export interface Ambience {
  readonly group: Group;
  /** The smoke, the glow and the pennants: the draw calls this adds to the town (three, whatever is awake, none while frozen: `drawn`). */
  readonly meshes: readonly Mesh[];
  readonly chimneys: readonly Chimney[];
  readonly flags: readonly FlagDef[];
  /**
   * One frame. `windmillSpeed` is the Windmill rig's eased run factor (0 when it is not in the town or not turning). Returns true while any
   * of it is showing, so the caller keeps the picture redrawing. Allocation-free.
   */
  update(dt: number, time: number, wake: WakeField, night: number, windmillSpeed: number): boolean;
  /** 0 to 1: how much each chimney (in `chimneys` order) is smoking now. */
  readonly smokeLevel: readonly number[];
  /** 0 to 1: how far the oven glow has come up. */
  readonly ovenLevel: number;
  /** 0 to 1: how far each pennant (in `flags` order) is raised. */
  readonly flagLevel: readonly number[];
}

/** True when a mesh of the ambience is being drawn (its draw range is not empty). */
export const drawn = (mesh: Mesh): boolean => mesh.geometry.drawRange.count !== 0;

export interface AmbienceOptions {
  /** The Bakery model, for its `SOCKET_Smoke` empty. */
  readonly bakery?: Object3D;
  /** False when the houses are not in the scene (the town was built without its dressing): then there is no smoke from them. */
  readonly withHouses?: boolean;
  /** The dressing table, `DRESSING` unless a test passes another. */
  readonly items?: readonly DressingItem[];
}

export function buildAmbience(options: AmbienceOptions = {}): Ambience {
  const group = new Group();
  group.name = 'Ambience';

  // ---- chimneys
  const socket = options.bakery?.getObjectByName('SOCKET_Smoke');
  const mouth = socket ? [socket.position.x, socket.position.y, socket.position.z] : BAKERY_CHIMNEY;
  const chimneys: Chimney[] = [
    { id: 'bakery', x: BAKERY_AT.x + mouth[0], y: mouth[1], z: BAKERY_AT.z + mouth[2], plot: 'plot_windmill', needsWindmill: true },
  ];
  if (options.withHouses ?? true) {
    for (const id of SMOKING_HOUSES) {
      const item = (options.items ?? DRESSING).find((i) => i.id === id);
      const chimney = item ? houseChimney(item) : null;
      if (chimney) chimneys.push(chimney);
    }
  }

  const texture = createSoftTexture();

  // ---- smoke
  const puffs = chimneys.length * PUFFS_PER_CHIMNEY;
  const centre = new Float32Array(puffs * 4 * 3);
  const corner = new Float32Array(puffs * 4 * 2);
  const size = new Float32Array(puffs * 4);
  const alpha = new Float32Array(puffs * 4);
  const quad: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const indices = new Uint16Array(puffs * 6);
  for (let p = 0; p < puffs; p++) {
    for (let k = 0; k < 4; k++) corner.set(quad[k], (p * 4 + k) * 2);
    indices.set([p * 4, p * 4 + 1, p * 4 + 2, p * 4, p * 4 + 2, p * 4 + 3], p * 6);
  }
  const smokeGeometry = new BufferGeometry();
  const centreAttribute = new BufferAttribute(centre, 3).setUsage(DynamicDrawUsage);
  const sizeAttribute = new BufferAttribute(size, 1).setUsage(DynamicDrawUsage);
  const alphaAttribute = new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage);
  smokeGeometry.setAttribute('position', centreAttribute);
  smokeGeometry.setAttribute('aCorner', new BufferAttribute(corner, 2));
  smokeGeometry.setAttribute('aSize', sizeAttribute);
  smokeGeometry.setAttribute('aAlpha', alphaAttribute);
  smokeGeometry.setIndex(new BufferAttribute(indices, 1));
  const tint = new Color();
  const smokeMaterial = new ShaderMaterial({
    name: 'Ambience_Smoke',
    uniforms: { uMap: { value: texture }, uTint: { value: tint } },
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const smoke = new Mesh(smokeGeometry, smokeMaterial);
  smoke.name = 'Ambience_Smoke';
  smoke.frustumCulled = false; // the bounds of a moving cloud are not worth tracking: it is a few quads
  smoke.renderOrder = 2;
  show(smoke, false);

  // ---- oven glow
  const glowGeometry = new BufferGeometry();
  const glowPosition: number[] = [];
  const glowUv: number[] = [];
  const glowColor: number[] = [];
  const glowIndex: number[] = [];
  GLOW_QUADS.forEach((q, i) => {
    for (const [cx, cy] of quad) {
      glowPosition.push(BAKERY_AT.x + q.x + (cx * q.w) / 2, q.y + (cy * q.h) / 2, BAKERY_AT.z + q.z);
      glowUv.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
      glowColor.push(q.strength, q.strength, q.strength);
    }
    glowIndex.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  glowGeometry.setAttribute('position', new BufferAttribute(new Float32Array(glowPosition), 3));
  glowGeometry.setAttribute('uv', new BufferAttribute(new Float32Array(glowUv), 2));
  glowGeometry.setAttribute('color', new BufferAttribute(new Float32Array(glowColor), 3));
  glowGeometry.setIndex(new BufferAttribute(new Uint16Array(glowIndex), 1));
  const glowMaterial = new MeshBasicMaterial({
    name: 'Ambience_OvenGlow',
    map: texture,
    color: new Color(OVEN_GLOW),
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glow = new Mesh(glowGeometry, glowMaterial);
  glow.name = 'Ambience_OvenGlow';
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  show(glow, false);

  // ---- pennants
  const flagBuild = buildFlags(FLAGS);
  const uTime = { value: 0 };
  const flagMaterial = new MeshStandardMaterial({ name: 'Ambience_Pennants', vertexColors: true, roughness: 0.85, metalness: 0, side: DoubleSide });
  flagMaterial.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLAG_ATTRIBUTES}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${FLAG_VERTEX}`);
  };
  flagMaterial.customProgramCacheKey = () => FLAG_PROGRAM_KEY;
  const flagMesh = new Mesh(flagBuild.geometry, flagMaterial);
  flagMesh.name = 'Ambience_Pennants';
  flagMesh.frustumCulled = false;
  show(flagMesh, false);
  const levelAttribute = flagBuild.geometry.getAttribute('aLevel') as BufferAttribute;
  const flagEnds = FLAGS.map((_, f) => (f + 1 < FLAGS.length ? flagBuild.first[f + 1] : flagBuild.count));

  group.add(smoke, glow, flagMesh);

  const smokeLevel = chimneys.map(() => 0);
  const flagLevel = FLAGS.map(() => 0);
  let ovenLevel = 0;

  const ambience: Ambience = {
    group,
    meshes: [smoke, glow, flagMesh],
    chimneys,
    flags: FLAGS,
    smokeLevel,
    flagLevel,
    get ovenLevel() {
      return ovenLevel;
    },
    update(dt, time, wake, night, windmillSpeed) {
      const turning = windmillSpeed > WINDMILL_TURNING;

      // Smoke
      let smoking = false;
      for (let c = 0; c < chimneys.length; c++) {
        const chimney = chimneys[c];
        const target = wake.isSettled(chimney.plot) && (!chimney.needsWindmill || turning) ? 1 : 0;
        let level = smokeLevel[c];
        if (level !== target) level = Math.abs(target - level) < OFF ? target : approach(level, target, dt, SMOKE_EASE_S);
        smokeLevel[c] = level;
        if (level === 0) {
          alpha.fill(0, c * PUFFS_PER_CHIMNEY * 4, (c + 1) * PUFFS_PER_CHIMNEY * 4); // a chimney that is off leaves no puff behind
          continue;
        }
        smoking = true;
        for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
          const puff = c * PUFFS_PER_CHIMNEY + k;
          // Each puff has its own place in the loop: evenly spaced, and a little different for each chimney so two never puff together.
          const age = (((time / PUFF_LIFE_S + k / PUFFS_PER_CHIMNEY + c * 0.37) % 1) + 1) % 1;
          const x = chimney.x + PUFF_DRIFT_M * age + PUFF_SWAY_M * age * Math.sin(time * 0.9 + puff * 2.1);
          const y = chimney.y + PUFF_RISE_M * age;
          const z = chimney.z + PUFF_SWAY_M * 0.5 * age * Math.sin(time * 0.7 + puff * 1.3);
          const s = PUFF_SIZE_M[0] + (PUFF_SIZE_M[1] - PUFF_SIZE_M[0]) * Math.sqrt(age);
          const a = PUFF_ALPHA * level * smoothstep(0, 0.1, age) * (1 - age);
          for (let v = 0; v < 4; v++) {
            const at = (puff * 4 + v) * 3;
            centre[at] = x;
            centre[at + 1] = y;
            centre[at + 2] = z;
            size[puff * 4 + v] = s;
            alpha[puff * 4 + v] = a;
          }
        }
      }
      if (smoking) {
        const t = night;
        tint.setRGB(SMOKE_DAY[0] + (SMOKE_NIGHT[0] - SMOKE_DAY[0]) * t, SMOKE_DAY[1] + (SMOKE_NIGHT[1] - SMOKE_DAY[1]) * t, SMOKE_DAY[2] + (SMOKE_NIGHT[2] - SMOKE_DAY[2]) * t);
        centreAttribute.needsUpdate = true;
        sizeAttribute.needsUpdate = true;
        alphaAttribute.needsUpdate = true;
      }
      show(smoke, smoking);

      // Oven glow: warm and slowly breathing while the Windmill turns, a little brighter in the dark.
      const ovenTarget = wake.isSettled('plot_windmill') && turning ? 1 : 0;
      if (ovenLevel !== ovenTarget) ovenLevel = Math.abs(ovenTarget - ovenLevel) < OFF ? ovenTarget : approach(ovenLevel, ovenTarget, dt, GLOW_EASE_S);
      const glowing = ovenLevel > 0;
      show(glow, glowing);
      if (glowing) {
        const breath = 0.78 + 0.16 * Math.sin(time * 2.1) + 0.06 * Math.sin(time * 5.3 + 1);
        glowMaterial.opacity = ovenLevel * breath * (0.5 + 0.4 * night);
      }

      // Pennants
      let flying = false;
      let changed = false;
      for (let f = 0; f < FLAGS.length; f++) {
        const target = wake.isSettled(FLAGS[f].plot) ? 1 : 0;
        let level = flagLevel[f];
        if (level !== target) {
          level = Math.abs(target - level) < OFF ? target : approach(level, target, dt, FLAG_EASE_S);
          flagLevel[f] = level;
          const a = levelAttribute.array as Float32Array;
          a.fill(level, flagBuild.first[f], flagEnds[f]);
          changed = true;
        }
        if (level > 0) flying = true;
      }
      if (changed) levelAttribute.needsUpdate = true;
      show(flagMesh, flying);
      if (flying) uTime.value = time;

      return smoking || glowing || flying;
    },
  };
  return ambience;
}
