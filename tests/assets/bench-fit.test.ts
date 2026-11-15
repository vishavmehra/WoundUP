import { Box3, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { BENCH, benchZ, CADDY_AT, CADDY_ZONE, FINGER_REACH_M, HELPER_SPOT, LENS_SPOT, MEDALLION_HOT_RADIUS_M, PAUSE_SPOT } from '../../src/ui/layout';

// The fastener caddy against the bench (INTRICATE_ASSEMBLY_DESIGN §3.3, ADR-050), read from the real GLBs: it stands inside its strip of the build zone, clear of the
// Music Box case and of the parts tray, its four bin mouths are 3.8 cm apart where the dispenser will put the live pieces, and no medallion is within a fingertip's
// reach of a bin. tests/ui/hot-zones.test.ts holds the same rule against the design's footprint; this holds it against the file. The shaft stand (design §3.3) is
// not built (the Music Box is built in place, ADR-050 P0), so it has no file to check. Like tray-fit.test.ts it points at another folder with
// WU_MODELS_DIR=<absolute path of a public/assets/models folder>.

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));

async function load(relative: string): Promise<Object3D> {
  const bytes = fs.readFileSync(fileOf(relative));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

/** The mesh box of a scene (colliders and empties are not geometry). */
const bounds = (scene: Object3D): Box3 => new Box3().setFromObject(scene, true);

const caddy = await load('tockton/workshop/fastener_caddy.glb');
const musicBox = await load('tockton/music_box/music_box_case.glb');
const caddyBox = bounds(caddy);
const caseBox = bounds(musicBox);
const EPS = 1e-4; // 0.1 mm

/** The caddy's box on the bench, bench-local metres: its origin goes to `CADDY_AT`. */
const placed = { lo: caddyBox.min.clone().add(new Vector3(CADDY_AT.x, CADDY_AT.y, CADDY_AT.z)), hi: caddyBox.max.clone().add(new Vector3(CADDY_AT.x, CADDY_AT.y, CADDY_AT.z)) };

describe('the fastener caddy on the bench (real GLB)', () => {
  it('fits the strip the design gives it, in width, depth and height', () => {
    expect(placed.hi.x - placed.lo.x).toBeLessThanOrEqual(2 * CADDY_ZONE.halfX + EPS);
    expect(placed.lo.z).toBeGreaterThanOrEqual(CADDY_ZONE.z0 - EPS);
    expect(placed.hi.z).toBeLessThanOrEqual(CADDY_ZONE.z1 + EPS);
    expect(placed.hi.y - CADDY_AT.y).toBeLessThanOrEqual(CADDY_ZONE.height);
  });

  it('stands on the bench top and inside its 25 cm depth', () => {
    expect(placed.lo.y).toBeGreaterThanOrEqual(BENCH.top - EPS);
    expect(placed.lo.y).toBeLessThanOrEqual(BENCH.top + EPS);
    expect(placed.hi.z).toBeLessThanOrEqual(0.125);
  });

  it('is clear of the Music Box case in front of it (the case stands at the build position, its origin on the bench top) by at least 5 mm', () => {
    const caseFront = caseBox.max.z; // the case's origin is the build position: bench-local z 0
    expect(placed.lo.z - caseFront).toBeGreaterThanOrEqual(0.005);
  });

  it('is clear of the parts tray (it ends at x = -9.25 cm) by at least 1 cm', () => {
    const trayRight = BENCH.tray.x + 0.0625; // the tray's compartments end 6.25 cm right of its centre
    expect(placed.lo.x - trayRight).toBeGreaterThanOrEqual(0.01);
  });

  it('has four bin mouths 3.8 cm apart, in a row across it, each a centimetre or more over the bench top', () => {
    const mouths = [1, 2, 3, 4].map((n) => {
      const node = caddy.getObjectByName(`SOCKET_Bin${n}`);
      expect(node, `SOCKET_Bin${n}`).toBeDefined();
      return (node as Object3D).getWorldPosition(new Vector3());
    });
    for (let i = 1; i < mouths.length; i++) expect(mouths[i].x - mouths[i - 1].x, `bin ${i} to ${i + 1}`).toBeCloseTo(0.038, 3);
    for (const m of mouths) {
      expect(m.y).toBeGreaterThanOrEqual(0.01);
      expect(m.x + CADDY_AT.x).toBeGreaterThanOrEqual(placed.lo.x);
      expect(m.x + CADDY_AT.x).toBeLessThanOrEqual(placed.hi.x);
    }
  });

  it('keeps every medallion that shows with the tray a fingertip beyond its press sphere from every bin mouth, at every town scale', () => {
    const mouths = [1, 2, 3, 4].map((n) => (caddy.getObjectByName(`SOCKET_Bin${n}`) as Object3D).getWorldPosition(new Vector3()).add(new Vector3(CADDY_AT.x, CADDY_AT.y, CADDY_AT.z)));
    for (const s of [0.75, 0.875, 1]) {
      for (const [name, spot] of Object.entries({ pause: PAUSE_SPOT, lens: LENS_SPOT, helper: HELPER_SPOT })) {
        for (const [i, m] of mouths.entries()) {
          const d = Math.hypot(spot.x - m.x, spot.y - m.y, spot.z - (m.z + benchZ(s)));
          expect(d, `${name} to bin ${i + 1} at scale ${s}`).toBeGreaterThanOrEqual(MEDALLION_HOT_RADIUS_M + FINGER_REACH_M);
        }
      }
    }
  });
});
