import type { Object3D } from 'three';

/** Easing: slow in, slow out. */
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * A 0..1 value that eases toward 1 (`go(1)`) or 0 (`go(0)`) over `seconds`, with an optional start delay. No allocation in `step`.
 * `value` is the linear progress, `eased` the smoothed one a pose should use.
 */
export class Progress {
  value = 0;
  private target = 0;
  private wait = 0;
  constructor(readonly seconds: number) {}
  get eased(): number {
    return smooth(this.value);
  }
  get moving(): boolean {
    return this.value !== this.target;
  }
  go(target: 0 | 1, delay = 0): void {
    this.target = target;
    this.wait = delay;
  }
  jump(value: 0 | 1): void {
    this.value = value;
    this.target = value;
    this.wait = 0;
  }
  step(dt: number): void {
    if (!this.moving) return;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait > 0) return;
      dt = -this.wait;
      this.wait = 0;
    }
    const d = dt / this.seconds;
    this.value = this.target > this.value ? Math.min(this.target, this.value + d) : Math.max(this.target, this.value - d);
  }
}

// ---- Hinge pivots (BLENDER_PRODUCTION_GUIDELINES §9: `PIV_` empties with userData.wu = { type: 'pivot', kind: 'hinge', ... }) ----

export interface Pivot {
  axis: 'x' | 'y' | 'z';
  /** +1 when the axis is written +X/+Y/+Z, -1 for -X/-Y/-Z: the angles below are about the signed axis. */
  sign: 1 | -1;
  closedRad: number;
  openRad: number;
}

const RAD = Math.PI / 180;

/** Validates a node's `userData.wu`. Null for anything that is not a well-formed hinge, so a bad file never half-animates. */
export function readPivot(wu: unknown): Pivot | null {
  if (typeof wu !== 'object' || wu === null) return null;
  const o = wu as Record<string, unknown>;
  if (o.type !== 'pivot' || o.kind !== 'hinge' || typeof o.axis !== 'string') return null;
  const m = /^([+-]?)([XYZxyz])$/.exec(o.axis);
  if (!m) return null;
  const { closedDeg, openDeg } = o;
  if (typeof closedDeg !== 'number' || typeof openDeg !== 'number' || !Number.isFinite(closedDeg) || !Number.isFinite(openDeg)) return null;
  if (Math.abs(closedDeg) > 180 || Math.abs(openDeg) > 180) return null;
  return { axis: m[2].toLowerCase() as Pivot['axis'], sign: m[1] === '-' ? -1 : 1, closedRad: closedDeg * RAD, openRad: openDeg * RAD };
}

/** Euler angle of the node for hinge progress `t` (0 closed, 1 open). */
export function hingeAngle(p: Pivot, t: number): number {
  return p.sign * (p.closedRad + (p.openRad - p.closedRad) * clamp01(t));
}

export function applyHinge(node: Object3D, p: Pivot, t: number): void {
  node.rotation[p.axis] = hingeAngle(p, t);
}

/** The first `PIV_` node under `root` with a valid hinge. */
export function findHinge(root: Object3D, name?: string): { node: Object3D; pivot: Pivot } | null {
  let found: { node: Object3D; pivot: Pivot } | null = null;
  root.traverse((node) => {
    if (found || !node.name.startsWith('PIV_') || (name && node.name !== name)) return;
    const pivot = readPivot(node.userData.wu);
    if (pivot) found = { node, pivot };
  });
  return found;
}
