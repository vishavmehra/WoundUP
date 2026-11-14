/**
 * Does a picture of the machine show it moving? Two screenshots taken a moment apart are compared inside the screen rectangle that
 * the turning parts project to. The comparison runs in the page (canvas getImageData), so no image library is needed.
 */
import type { Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into the ?debug world handle */

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MotionPixels {
  /** Pixels in the region, and the share of them that changed by more than the threshold between the two screenshots. */
  pixels: number;
  changed: number;
  fraction: number;
}

/**
 * The rectangle (CSS pixels of the headset view) that holds every turning part of the machine, from the world boxes of the meshes under
 * its rotors.
 */
export const mechanismRegion = (page: Page, machine: string): Promise<Region> =>
  page.evaluate((machine) => {
    const w = (window as any).__world;
    const rig = (window as any).__wu.town.rigOf(machine);
    const V = w.camera.position.constructor;
    const xrCamera = w.renderer.xr.getCamera();
    const cam = xrCamera.cameras?.[0] ?? xrCamera;
    const canvas = w.renderer.domElement as HTMLCanvasElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const p = new V();
    for (const rotor of rig.rotors) {
      if (rotor.socketId === 'winding_key') continue;
      rotor.node.updateWorldMatrix(true, true);
      rotor.node.traverse((n: any) => {
        if (!n.isMesh || !n.geometry) return;
        if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
        const b = n.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          p.set(x, y, z).applyMatrix4(n.matrixWorld).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
          const px = ((p.x + 1) / 2) * width;
          const py = ((1 - p.y) / 2) * height;
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
        }
      });
    }
    return { x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)), x1: Math.min(width, Math.ceil(x1)), y1: Math.min(height, Math.ceil(y1)) };
  }, machine);

/** Compares two PNG screenshots inside `region`: the share of pixels whose colour moved by more than `threshold` (sum over R, G and B). */
type Png = Awaited<ReturnType<Page['screenshot']>>;

export const changedPixels = (page: Page, a: Png, b: Png, region: Region, threshold = 60): Promise<MotionPixels> =>
  page.evaluate(
    async ({ a, b, region, threshold }) => {
      const load = (data: string) =>
        new Promise<ImageData>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, img.width, img.height));
          };
          img.onerror = () => reject(new Error('screenshot did not decode'));
          img.src = `data:image/png;base64,${data}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      let pixels = 0;
      let changed = 0;
      for (let y = region.y0; y < Math.min(region.y1, ia.height); y++) {
        for (let x = region.x0; x < Math.min(region.x1, ia.width); x++) {
          const i = (y * ia.width + x) * 4;
          const d = Math.abs(ia.data[i] - ib.data[i]) + Math.abs(ia.data[i + 1] - ib.data[i + 1]) + Math.abs(ia.data[i + 2] - ib.data[i + 2]);
          pixels++;
          if (d > threshold) changed++;
        }
      }
      return { pixels, changed, fraction: pixels ? changed / pixels : 0 };
    },
    { a: a.toString('base64'), b: b.toString('base64'), region, threshold },
  );

export interface Visibility {
  /** Points sampled on the meshes of the turning parts, and how many of them have another mesh of the machine between them and the eye. */
  points: number;
  hidden: number;
  hiddenFraction: number;
  eye: [number, number, number];
}

/**
 * How much of the turning mechanism the eye can see? Samples vertices of every mesh under a rotor (the key excluded) and tests the
 * straight line from the eye to each against the triangles of every other mesh of the machine (the case, the open lid, the brackets,
 * the comb, the handle), world space, no back-face culling. A point with a triangle in the way is hidden. `eye` defaults to the head.
 * Geometry only: no pixels, no timing.
 */
export const mechanismVisibility = (page: Page, machine: string, eye?: [number, number, number], samples = 400): Promise<Visibility> =>
  page.evaluate(
    ({ machine, eye, samples }) => {
      const w = (window as any).__world;
      const rig = (window as any).__wu.town.rigOf(machine);
      const V = w.camera.position.constructor;
      const from = eye ? new V(eye[0], eye[1], eye[2]) : w.player.head.getWorldPosition(new V());
      rig.root.updateWorldMatrix(true, true);
      const moving = new Set<any>();
      for (const rotor of rig.rotors) {
        if (rotor.socketId === 'winding_key') continue;
        rotor.node.traverse((n: any) => {
          if (n.isMesh) moving.add(n);
        });
      }
      const targets: any[] = [];
      const triangles: number[] = [];
      const p = new V();
      rig.root.traverse((n: any) => {
        if (!n.isMesh || !n.geometry || !n.visible || n.name.startsWith('COL_')) return;
        const pos = n.geometry.attributes.position;
        const index = n.geometry.index;
        if (moving.has(n)) {
          const stride = Math.max(1, Math.floor(pos.count / Math.max(1, samples / moving.size)));
          for (let i = 0; i < pos.count; i += stride) targets.push(new V().fromBufferAttribute(pos, i).applyMatrix4(n.matrixWorld));
        } else {
          const count = index ? index.count : pos.count;
          for (let i = 0; i < count; i += 3) {
            for (let k = 0; k < 3; k++) {
              p.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(n.matrixWorld);
              triangles.push(p.x, p.y, p.z);
            }
          }
        }
      });
      // Moeller-Trumbore against the segment from the eye to the target.
      const hits = (t: any): boolean => {
        const dx = t.x - from.x, dy = t.y - from.y, dz = t.z - from.z;
        for (let i = 0; i < triangles.length; i += 9) {
          const ax = triangles[i], ay = triangles[i + 1], az = triangles[i + 2];
          const e1x = triangles[i + 3] - ax, e1y = triangles[i + 4] - ay, e1z = triangles[i + 5] - az;
          const e2x = triangles[i + 6] - ax, e2y = triangles[i + 7] - ay, e2z = triangles[i + 8] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const inv = 1 / det;
          const tx = from.x - ax, ty = from.y - ay, tz = from.z - az;
          const u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (dist > 0.001 && dist < 0.995) return true; // before the target, not at it
        }
        return false;
      };
      let hidden = 0;
      for (const t of targets) if (hits(t)) hidden++;
      return { points: targets.length, hidden, hiddenFraction: targets.length ? hidden / targets.length : 0, eye: [from.x, from.y, from.z] as [number, number, number] };
    },
    { machine, eye, samples },
  );

/* eslint-enable @typescript-eslint/no-explicit-any */
