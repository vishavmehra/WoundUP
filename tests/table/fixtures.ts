import type { SurfaceInfo, Vec3Like } from '../../src/placement';

/** A seated player: eyes 1.2 m up at the origin, looking along -Z. */
export const HEAD: Vec3Like = { x: 0, y: 1.2, z: 0 };
export const FORWARD: Vec3Like = { x: 0, y: 0, z: -1 };

export interface RectOptions {
  /** Centre on the XZ plane. */
  cx: number;
  cz: number;
  /** Size along X and Z. */
  width: number;
  depth: number;
  /** Surface height (reference-space y). */
  y: number;
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  /** Defaults to level and facing up. */
  normal?: Vec3Like;
}

/** A rectangular horizontal surface; the origin is its centre, like an XRPlane's planeSpace. */
export function rectSurface(o: RectOptions): SurfaceInfo {
  const hx = o.width / 2;
  const hz = o.depth / 2;
  return {
    orientation: o.orientation ?? 'horizontal',
    label: o.label,
    origin: { x: o.cx, y: o.y, z: o.cz },
    normal: o.normal ?? { x: 0, y: 1, z: 0 },
    outline: [
      { x: o.cx - hx, z: o.cz - hz },
      { x: o.cx + hx, z: o.cz - hz },
      { x: o.cx + hx, z: o.cz + hz },
      { x: o.cx - hx, z: o.cz + hz },
    ],
  };
}

/** A table straight ahead of the default head, comfortably big, 40 cm below the eyes. */
export function goodTable(overrides: Partial<RectOptions> = {}): SurfaceInfo {
  return rectSurface({ cx: 0, cz: -0.55, width: 1.2, depth: 0.9, y: 0.8, ...overrides });
}
