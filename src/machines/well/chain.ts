// The Well's bucket chain (WELL_FOUNTAIN_BLUEPRINT §3.3, §6.2): ten buckets carried round the two chain pulleys, the open belt of the
// solver's graph made visible. Pure maths, no scene: `chainPoint` walks the loop, the water module (water.ts) places the buckets with it.
//
// The loop is two straight strands joined by two half-circles of the pulleys' groove radius, walked clockwise seen from the player
// (the way the solver turns both pulleys, ω < 0): up the left strand, over the top of the idle pulley, down the right strand, round
// the drive pulley. The chain's speed along it is the idle pulley's angular speed times that radius, so the bucket chain is exactly the
// belt the solver judged and cannot disagree with it.

export interface ChainGeometry {
  /** Pulley centres, metres in the chain's plane (x, y). */
  readonly drive: readonly [number, number];
  readonly idle: readonly [number, number];
  readonly radius: number;
  /** Centre distance, metres. */
  readonly span: number;
  /** Length of the whole loop, metres: two spans and the two half-circles. */
  readonly length: number;
  /** Unit vector from the drive to the idle pulley, and the unit normal to its left (counter-clockwise). */
  readonly ux: number;
  readonly uy: number;
  readonly nx: number;
  readonly ny: number;
  /** Direction angle of the left normal, radians. */
  readonly normalAngle: number;
  /** Distance along the loop at which a bucket is at the very top of the idle pulley (where it tips). */
  readonly topAt: number;
}

export function chainGeometry(drive: readonly [number, number], idle: readonly [number, number], radius: number): ChainGeometry {
  const dx = idle[0] - drive[0];
  const dy = idle[1] - drive[1];
  const span = Math.hypot(dx, dy);
  const ux = dx / span;
  const uy = dy / span;
  const nx = -uy;
  const ny = ux;
  const normalAngle = Math.atan2(ny, nx);
  // The top of the idle pulley is where the arc is at angle PI/2 (straight up); arc angle runs from normalAngle clockwise.
  const sweepToTop = (((normalAngle - Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { drive, idle, radius, span, length: 2 * span + 2 * Math.PI * radius, ux, uy, nx, ny, normalAngle, topAt: span + radius * sweepToTop };
}

export interface ChainPoint {
  x: number;
  y: number;
  /** Direction of travel, radians counter-clockwise from +X. */
  heading: number;
}

/** The point at distance `s` along the loop (any real: it wraps) and the way the chain is going there. `out` is overwritten and returned. */
export function chainPoint(g: ChainGeometry, s: number, out: ChainPoint = { x: 0, y: 0, heading: 0 }): ChainPoint {
  const { span, radius: r, length } = g;
  const t = ((s % length) + length) % length;
  const arc = Math.PI * r;
  if (t < span) {
    // left strand, drive to idle
    out.x = g.drive[0] + g.nx * r + g.ux * t;
    out.y = g.drive[1] + g.ny * r + g.uy * t;
    out.heading = Math.atan2(g.uy, g.ux);
  } else if (t < span + arc) {
    // over the top of the idle pulley, clockwise
    const a = g.normalAngle - (t - span) / r;
    out.x = g.idle[0] + r * Math.cos(a);
    out.y = g.idle[1] + r * Math.sin(a);
    out.heading = Math.atan2(-Math.cos(a), Math.sin(a));
  } else if (t < 2 * span + arc) {
    // right strand, idle to drive
    const d = t - span - arc;
    out.x = g.idle[0] - g.nx * r - g.ux * d;
    out.y = g.idle[1] - g.ny * r - g.uy * d;
    out.heading = Math.atan2(-g.uy, -g.ux);
  } else {
    // round the drive pulley
    const a = g.normalAngle - Math.PI - (t - 2 * span - arc) / r;
    out.x = g.drive[0] + r * Math.cos(a);
    out.y = g.drive[1] + r * Math.sin(a);
    out.heading = Math.atan2(-Math.cos(a), Math.sin(a));
  }
  return out;
}
