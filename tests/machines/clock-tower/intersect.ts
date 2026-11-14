// Exact surface tests between meshes in world space, for the Clock Tower's clearance and meshing tests. Three.js only; Node.
//
// Two closed surfaces that overlap cross: some edge of one pierces a triangle of the other. `crossings` counts those piercings, in both
// directions, so 0 means the surfaces do not cross. (A part lying completely inside a solid would not cross, so the tests also bound
// the parts by the cavity.) `clearance` is the smallest distance from the vertices of one mesh to the triangles of the other: how much
// room there is, not only whether there is any.

import { Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';

/** Triangles as a flat list of nine floats each (a, b, c), world space, metres. */
export type Triangles = Float32Array;

const isShown = (node: Object3D): boolean => {
  for (let n: Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
};

/** World-space triangles of the meshes under `root` that are drawn (the tower's baked originals are hidden) and for which `accept` holds (default: all). */
export function collectTriangles(root: Object3D, accept: (mesh: Mesh) => boolean = () => true): Triangles {
  root.updateWorldMatrix(true, true);
  const out: number[] = [];
  const v = new Vector3();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !isShown(mesh) || !accept(mesh)) return;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return Float32Array.from(out);
}

export interface Bounds {
  readonly min: Vector3;
  readonly max: Vector3;
}

export function boundsOf(triangles: Triangles): Bounds {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < triangles.length; i += 3) {
    min.set(Math.min(min.x, triangles[i]), Math.min(min.y, triangles[i + 1]), Math.min(min.z, triangles[i + 2]));
    max.set(Math.max(max.x, triangles[i]), Math.max(max.y, triangles[i + 1]), Math.max(max.z, triangles[i + 2]));
  }
  return { min, max };
}

/** The triangles of `triangles` whose box overlaps `box` grown by `margin`. */
export function triangleSubset(triangles: Triangles, box: Bounds, margin: number): Triangles {
  const out: number[] = [];
  for (let t = 0; t < triangles.length; t += 9) {
    let overlaps = true;
    for (let axis = 0; axis < 3 && overlaps; axis++) {
      const lo = Math.min(triangles[t + axis], triangles[t + 3 + axis], triangles[t + 6 + axis]);
      const hi = Math.max(triangles[t + axis], triangles[t + 3 + axis], triangles[t + 6 + axis]);
      const min = axis === 0 ? box.min.x : axis === 1 ? box.min.y : box.min.z;
      const max = axis === 0 ? box.max.x : axis === 1 ? box.max.y : box.max.z;
      if (hi < min - margin || lo > max + margin) overlaps = false;
    }
    if (overlaps) for (let k = 0; k < 9; k++) out.push(triangles[t + k]);
  }
  return Float32Array.from(out);
}

const CELL = 0.004;
const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Triangles hashed into a grid of 4 mm cells, so a short edge only meets the few triangles near it. */
export class TriangleGrid {
  private readonly cells = new Map<string, number[]>();

  constructor(readonly triangles: Triangles) {
    for (let t = 0; t < triangles.length / 9; t++) {
      const o = t * 9;
      const lo = [0, 1, 2].map((a) => Math.floor(Math.min(triangles[o + a], triangles[o + 3 + a], triangles[o + 6 + a]) / CELL));
      const hi = [0, 1, 2].map((a) => Math.floor(Math.max(triangles[o + a], triangles[o + 3 + a], triangles[o + 6 + a]) / CELL));
      for (let x = lo[0]; x <= hi[0]; x++) {
        for (let y = lo[1]; y <= hi[1]; y++) {
          for (let z = lo[2]; z <= hi[2]; z++) {
            const k = key(x, y, z);
            const list = this.cells.get(k);
            if (list) list.push(t);
            else this.cells.set(k, [t]);
          }
        }
      }
    }
  }

  /** Triangle numbers whose cells the box touches, each once. */
  near(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Set<number> {
    const found = new Set<number>();
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
      for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y++) {
        for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
          const list = this.cells.get(key(x, y, z));
          if (list) for (const t of list) found.add(t);
        }
      }
    }
    return found;
  }
}

/** Does the segment p to q pierce triangle `o` of `tris` (Moeller-Trumbore, the ends excluded)? */
function pierces(tris: Triangles, o: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number): boolean {
  const e1x = tris[o + 3] - tris[o];
  const e1y = tris[o + 4] - tris[o + 1];
  const e1z = tris[o + 5] - tris[o + 2];
  const e2x = tris[o + 6] - tris[o];
  const e2y = tris[o + 7] - tris[o + 1];
  const e2z = tris[o + 8] - tris[o + 2];
  const dx = qx - px;
  const dy = qy - py;
  const dz = qz - pz;
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-18) return false; // the edge lies in the triangle's plane
  const f = 1 / det;
  const sx = px - tris[o];
  const sy = py - tris[o + 1];
  const sz = pz - tris[o + 2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;
  const rx = sy * e1z - sz * e1y;
  const ry = sz * e1x - sx * e1z;
  const rz = sx * e1y - sy * e1x;
  const v = f * (dx * rx + dy * ry + dz * rz);
  if (v < 0 || u + v > 1) return false;
  const t = f * (e2x * rx + e2y * ry + e2z * rz);
  return t > 1e-6 && t < 1 - 1e-6;
}

/** How many edges of `query` pierce a triangle of `grid`. */
export function crossings(query: Triangles, grid: TriangleGrid): number {
  const t = grid.triangles;
  let count = 0;
  for (let q = 0; q < query.length; q += 9) {
    for (let e = 0; e < 3; e++) {
      const a = q + e * 3;
      const b = q + ((e + 1) % 3) * 3;
      const near = grid.near(
        Math.min(query[a], query[b]), Math.min(query[a + 1], query[b + 1]), Math.min(query[a + 2], query[b + 2]),
        Math.max(query[a], query[b]), Math.max(query[a + 1], query[b + 1]), Math.max(query[a + 2], query[b + 2]),
      );
      for (const tri of near) if (pierces(t, tri * 9, query[a], query[a + 1], query[a + 2], query[b], query[b + 1], query[b + 2])) count++;
    }
  }
  return count;
}

/** Number of places where the two surfaces cross, in both directions. */
export function surfaceCrossings(a: Triangles, b: Triangles): number {
  if (a.length === 0 || b.length === 0) return 0;
  const nearB = triangleSubset(b, boundsOf(a), 0.0005); // only the part of b that is anywhere near a
  if (nearB.length === 0) return 0;
  return crossings(a, new TriangleGrid(nearB)) + crossings(nearB, new TriangleGrid(a));
}

const _p = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _ab = new Vector3();
const _ac = new Vector3();
const _ap = new Vector3();

/** Squared distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
function distanceSquared(p: Vector3, tris: Triangles, o: number): number {
  _a.set(tris[o], tris[o + 1], tris[o + 2]);
  _b.set(tris[o + 3], tris[o + 4], tris[o + 5]);
  _c.set(tris[o + 6], tris[o + 7], tris[o + 8]);
  _ab.subVectors(_b, _a);
  _ac.subVectors(_c, _a);
  _ap.subVectors(p, _a);
  const d1 = _ab.dot(_ap);
  const d2 = _ac.dot(_ap);
  const closest = new Vector3();
  if (d1 <= 0 && d2 <= 0) return p.distanceToSquared(_a);
  const bp = new Vector3().subVectors(p, _b);
  const d3 = _ab.dot(bp);
  const d4 = _ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return p.distanceToSquared(_b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return p.distanceToSquared(closest.copy(_a).addScaledVector(_ab, d1 / (d1 - d3)));
  const cp = new Vector3().subVectors(p, _c);
  const d5 = _ab.dot(cp);
  const d6 = _ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return p.distanceToSquared(_c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return p.distanceToSquared(closest.copy(_a).addScaledVector(_ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return p.distanceToSquared(closest.copy(_b).addScaledVector(_c.clone().sub(_b), w));
  }
  const denom = 1 / (va + vb + vc);
  return p.distanceToSquared(closest.copy(_a).addScaledVector(_ab, vb * denom).addScaledVector(_ac, vc * denom));
}

/** Smallest distance from a vertex of `a` to a triangle of `b`, or `limit` when none is closer. */
export function clearance(a: Triangles, b: Triangles, limit: number): number {
  const grid = new TriangleGrid(triangleSubset(b, boundsOf(a), limit));
  let best = limit * limit;
  for (let i = 0; i < a.length; i += 3) {
    _p.set(a[i], a[i + 1], a[i + 2]);
    for (const tri of grid.near(_p.x - limit, _p.y - limit, _p.z - limit, _p.x + limit, _p.y + limit, _p.z + limit)) {
      best = Math.min(best, distanceSquared(_p, grid.triangles, tri * 9));
    }
  }
  return Math.sqrt(best);
}
