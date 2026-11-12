import { footprintFitsOutline, type Footprint, type Point2 } from './table/geometry.js';

export type { Footprint, Point2 } from './table/geometry.js';

/**
 * PRODUCT_SPEC §3.2 fallback "velvet stand": ~55 cm ahead of the player and ~38 cm below their eyes, which is about 35°
 * below head-forward (INTERACTION_SPEC §3). Both are measured from the eyes, never from the floor.
 * These two numbers are the tuning knob once a Quest tester reports on comfort.
 */
export const STAND_AHEAD_M = 0.55;
export const STAND_BELOW_EYE_M = 0.38;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface StandPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about +Y (radians) that turns the stand's local +Z (its front) towards the player. */
  yaw: number;
}

/** The horizontal part of a gaze direction as a unit vector. Looking straight up or down means "ahead along -Z". */
function levelFacing(forward: Vec3Like): Point2 {
  const len = Math.hypot(forward.x, forward.z);
  return len > 1e-4 ? { x: forward.x / len, z: forward.z / len } : { x: 0, z: -1 };
}

/**
 * Where the fallback stand goes for a given head position and gaze direction (both world space).
 * Only the horizontal part of the gaze matters; looking straight down keeps the stand ahead along -Z.
 * Pure maths, no engine types, so it is unit-tested without WebGL.
 */
export function standPose(head: Vec3Like, forward: Vec3Like): StandPose {
  const f = levelFacing(forward);
  return {
    x: head.x + f.x * STAND_AHEAD_M,
    y: head.y - STAND_BELOW_EYE_M,
    z: head.z + f.z * STAND_AHEAD_M,
    yaw: Math.atan2(-f.x, -f.z),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Table placement: which real surface the town stands on, and how big it is there.
// PRODUCT_SPEC §3.2 "Table placement", ADR-026, SPATIAL_WORLD_SYSTEM §5, TECHNICAL_ARCHITECTURE §6.4.
// Pure functions of surface data and head pose: no engine types, no randomness, no report order (ACCEPTANCE TBL-01..04).
// The numbers are PS §3.2's starting values, to be tuned on a real Quest.
// ---------------------------------------------------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** PS §3.2: the surface is "about 20 to 60 cm below the player's eyes". Measured at the town's centre. */
export const TABLE_BELOW_EYE_MIN_M = 0.2;
export const TABLE_BELOW_EYE_MAX_M = 0.6;
/** PS §3.2: the town's centre is "about 40 to 60 cm horizontally from the eyes, within about 35° either side". */
export const REACH_MIN_M = 0.4;
export const REACH_MAX_M = 0.6;
export const REACH_HALF_ANGLE_RAD = 35 * DEG;
/** PS §3.2: the aim point is "about 55 cm straight ahead, the same distance as the stand". */
export const AIM_AHEAD_M = STAND_AHEAD_M;
/** PS §3.2: "level, facing up". No spec gives a tolerance; SPATIAL §5.2 leaves it to a named constant. Tune on a Quest. */
export const LEVEL_TOLERANCE_RAD = 5 * DEG;
/** PS §3.2: "scaled down evenly to no less than 75%" and "never grows above full size". */
export const TOWN_SCALE_MIN = 0.75;
export const TOWN_SCALE_MAX = 1;
/** PS §3.2 / IS §3: the town footprint is 60 x 40 cm, centred on the stage origin, front (+Z) towards the player. */
export const TOWN_FOOTPRINT: Footprint = { xMin: -0.3, xMax: 0.3, zMin: -0.2, zMax: 0.2 };
/** PS §3.2: "prefer one the platform labels as a table or desk". Compared case-insensitively. */
export const PREFERRED_LABELS: ReadonlyArray<string> = ['table', 'desk'];

/** Candidate centres: radius every 1 cm, bearing every 2.5° (35° / 14). The aim point itself is one of them. */
const REACH_STEP_M = 0.01;
const REACH_BEARING_STEPS = 14;
const SCALE_STEP_PERCENT = 1;

/** One horizontal-or-not surface the headset reports, in reference-space metres. Built by `surfaceFromPlane`. */
export interface SurfaceInfo {
  /** XRPlane.orientation. Some runtimes leave it out; the normal below is what decides levelness. */
  orientation?: 'horizontal' | 'vertical' | undefined;
  /** XRPlane.semanticLabel, platform-defined (for example 'table', 'desk', 'floor'). */
  label?: string | undefined;
  /** A point on the surface (the plane's origin). */
  origin: Vec3Like;
  /** Unit normal. +Y means level and facing up. */
  normal: Vec3Like;
  /** The surface outline projected onto the XZ plane. */
  outline: ReadonlyArray<Point2>;
}

/** Where the town goes: the stage root's pose and the town scale. `y` is the surface height under the centre. */
export interface TableChoice {
  x: number;
  y: number;
  z: number;
  /** Rotation about +Y that turns the stage's local +Z towards the eyes. */
  yaw: number;
  /** Town scale, 0.75 to 1 in 1% steps. Applies to the town group only (IS §3). */
  scale: number;
  /** The surface carried a preferred label (table or desk). */
  preferred: boolean;
}

interface Candidate {
  x: number;
  z: number;
  yaw: number;
  /** Rounded keys so that float noise never decides an order. Millimetres for distance, 0.1 mm for coordinates. */
  distKey: number;
  xKey: number;
  zKey: number;
}

interface Ranked {
  candidate: Candidate;
  y: number;
  percent: number;
  preferred: boolean;
}

/** Height of the surface plane at (x, z). Only called for surfaces already known to be level (normal.y > 0). */
function heightAt(surface: SurfaceInfo, x: number, z: number): number {
  const n = surface.normal;
  return surface.origin.y - (n.x * (x - surface.origin.x) + n.z * (z - surface.origin.z)) / n.y;
}

/**
 * Every allowed town centre for this head, best first: nearest the aim point, then smaller x, then smaller z.
 * It depends on the head only, so it is built once per choice and shared by all surfaces.
 */
function reachCandidates(head: Vec3Like, facing: Point2): Candidate[] {
  const rightX = -facing.z; // right-hand side of the facing direction (facing -Z has +X on the right)
  const rightZ = facing.x;
  const aimX = head.x + facing.x * AIM_AHEAD_M;
  const aimZ = head.z + facing.z * AIM_AHEAD_M;
  const radii = Math.round((REACH_MAX_M - REACH_MIN_M) / REACH_STEP_M);
  const bearingStep = REACH_HALF_ANGLE_RAD / REACH_BEARING_STEPS;
  const out: Candidate[] = [];
  for (let ri = 0; ri <= radii; ri++) {
    const r = REACH_MIN_M + ri * REACH_STEP_M;
    for (let bi = -REACH_BEARING_STEPS; bi <= REACH_BEARING_STEPS; bi++) {
      const ahead = r * Math.cos(bi * bearingStep);
      const side = r * Math.sin(bi * bearingStep);
      const x = head.x + facing.x * ahead + rightX * side;
      const z = head.z + facing.z * ahead + rightZ * side;
      out.push({
        x,
        z,
        yaw: Math.atan2(head.x - x, head.z - z),
        distKey: Math.round(Math.hypot(x - aimX, z - aimZ) * 1000),
        xKey: Math.round(x * 1e4),
        zKey: Math.round(z * 1e4),
      });
    }
  }
  return out.sort((a, b) => a.distKey - b.distKey || a.xKey - b.xKey || a.zKey - b.zKey);
}

/** The best town placement on one surface, or null when the surface is unsuitable. */
function bestOnSurface(surface: SurfaceInfo, head: Vec3Like, candidates: ReadonlyArray<Candidate>, footprint: Footprint): Ranked | null {
  if (surface.orientation === 'vertical') return null;
  if (!(surface.normal.y >= Math.cos(LEVEL_TOLERANCE_RAD))) return null; // not level, facing down, or not a number
  const label = surface.label?.trim().toLowerCase();
  if (label === 'floor') return null; // PS §3.2 "not the floor"; the height band also rejects it
  if (surface.outline.length < 3) return null;

  const atTableHeight = candidates.filter((c) => {
    const below = head.y - heightAt(surface, c.x, c.z);
    return below >= TABLE_BELOW_EYE_MIN_M && below <= TABLE_BELOW_EYE_MAX_M;
  });
  // Index of the best allowed centre where the footprint fits at this scale, or -1.
  const firstFit = (percent: number): number =>
    atTableHeight.findIndex((c) => footprintFitsOutline(surface.outline, c.x, c.z, c.yaw, percent / 100, footprint));

  // Scale first, then position (SPATIAL §5.3): the largest town that fits anywhere allowed beats a closer, smaller one.
  // A footprint that contains the origin shrinks about it, so "fits somewhere at s" never turns back on as s grows.
  // That makes a binary search over the 26 whole-percent scales exact.
  const minPercent = Math.round(TOWN_SCALE_MIN * 100);
  if (firstFit(minPercent) < 0) return null;
  let lo = minPercent;
  let hi = Math.round(TOWN_SCALE_MAX * 100);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (firstFit(mid) >= 0) lo = mid;
    else hi = mid - SCALE_STEP_PERCENT;
  }
  const candidate = atTableHeight[firstFit(lo)]!;
  return { candidate, y: heightAt(surface, candidate.x, candidate.z), percent: lo, preferred: label !== undefined && PREFERRED_LABELS.includes(label) };
}

/** Negative when `a` is the better placement. The keys end in coordinates, so the same surfaces always give the same choice. */
function compareRanked(a: Ranked, b: Ranked): number {
  return (
    Number(b.preferred) - Number(a.preferred) ||
    a.candidate.distKey - b.candidate.distKey ||
    b.percent - a.percent ||
    a.candidate.xKey - b.candidate.xKey ||
    a.candidate.zKey - b.candidate.zKey ||
    Math.round(a.y * 1000) - Math.round(b.y * 1000)
  );
}

/**
 * Chooses the surface the town stands on, or null when none is suitable (then the stand is used).
 *
 * A surface is suitable when it is level and facing up, not the floor, 20 to 60 cm below the eyes at the town's centre,
 * and the whole footprint fits on it at some allowed centre (40 to 60 cm away, within 35° of the facing direction) at a
 * scale from 75% to 100%. Among suitable surfaces: a table or desk label first, then the centre nearest the aim point,
 * then the larger town. Report order, plane identity and timing never enter the decision.
 *
 * `head` is the eye position and `forward` the gaze, both in the same reference space as the surfaces.
 * `footprint` defaults to Tockton's 60 x 40 cm and must contain the origin.
 */
export function chooseSurface(
  surfaces: ReadonlyArray<SurfaceInfo>,
  head: Vec3Like,
  forward: Vec3Like,
  footprint: Footprint = TOWN_FOOTPRINT,
): TableChoice | null {
  const candidates = reachCandidates(head, levelFacing(forward));
  let best: Ranked | null = null;
  for (const surface of surfaces) {
    const ranked = bestOnSurface(surface, head, candidates, footprint);
    if (ranked && (!best || compareRanked(ranked, best) < 0)) best = ranked;
  }
  if (!best) return null;
  const c = best.candidate;
  return { x: c.x, y: best.y, z: c.z, yaw: c.yaw, scale: best.percent / 100, preferred: best.preferred };
}
