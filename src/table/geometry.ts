/**
 * 2D geometry for the table fit test (PRODUCT_SPEC §3.2 "Large enough"; SPATIAL_WORLD_SYSTEM §5.3 step 1).
 * Pure maths, no engine types. Coordinates are reference-space metres on the XZ plane.
 */

export interface Point2 {
  x: number;
  z: number;
}

/** The town footprint box in the stage's local frame at scale 1: +X right, +Z towards the player, origin = stage origin. */
export interface Footprint {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

/**
 * Edges may touch the footprint without counting as a collision: the box is shrunk by 1 micrometre first, so a surface
 * that is exactly as big as the footprint still fits and float noise cannot reject it.
 */
const TOUCH_EPSILON_M = 1e-6;

/** Does the segment a-b touch the closed box [x0, x1] x [z0, z1]? Liang-Barsky clipping. */
export function segmentTouchesBox(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  // Each side of the box gives "p * t <= q". No arrays here: the fit search calls this thousands of times.
  for (let side = 0; side < 4; side++) {
    const p = side === 0 ? -dx : side === 1 ? dx : side === 2 ? -dz : dz;
    const q = side === 0 ? ax - x0 : side === 1 ? x1 - ax : side === 2 ? az - z0 : z1 - az;
    if (p === 0) {
      if (q < 0) return false; // parallel to this side and outside it
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Does the footprint, scaled by `scale` about the stage origin, turned by `yaw` and standing at (cx, cz), lie wholly
 * inside `outline`?
 *
 * Exact for a simple polygon of any shape, convex or not: the footprint is inside iff no polygon edge touches its
 * interior and its centre is inside (the interior is connected, so it is then all inside or all outside). That is why the
 * test uses the polygon and not its bounding box, which would accept an L-shaped table that is too small (SPATIAL §5.3).
 * `yaw` is the rotation about +Y that takes the stage's local +Z to the world direction (sin yaw, cos yaw).
 */
export function footprintFitsOutline(
  outline: ReadonlyArray<Point2>,
  cx: number,
  cz: number,
  yaw: number,
  scale: number,
  footprint: Footprint,
): boolean {
  const n = outline.length;
  if (n < 3) return false;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x0 = footprint.xMin * scale + TOUCH_EPSILON_M;
  const x1 = footprint.xMax * scale - TOUCH_EPSILON_M;
  const z0 = footprint.zMin * scale + TOUCH_EPSILON_M;
  const z1 = footprint.zMax * scale - TOUCH_EPSILON_M;
  if (x0 > x1 || z0 > z1) return false;
  // The probe point for the "inside" test is the footprint's centre, in the same local frame as the polygon below.
  const probeX = (x0 + x1) / 2;
  const probeZ = (z0 + z1) / 2;

  const last = outline[n - 1]!;
  let ax = (last.x - cx) * c - (last.z - cz) * s; // world offset -> local frame: the inverse of the yaw rotation
  let az = (last.x - cx) * s + (last.z - cz) * c;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const v = outline[i]!;
    const bx = (v.x - cx) * c - (v.z - cz) * s;
    const bz = (v.x - cx) * s + (v.z - cz) * c;
    if (segmentTouchesBox(ax, az, bx, bz, x0, x1, z0, z1)) return false;
    if (az > probeZ !== bz > probeZ && probeX < ((bx - ax) * (probeZ - az)) / (bz - az) + ax) inside = !inside;
    ax = bx;
    az = bz;
  }
  return inside;
}
