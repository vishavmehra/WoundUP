import { Box3, Raycaster, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { BELFRY, MUSIC_BOX, WELL } from '../../src/content/blueprints';
import type { MachineBlueprint } from '../../src/content/blueprints';
import { MODEL_PATHS, PART_DEFINITIONS, requirePart } from '../../src/content/parts';
import { assignSlots, placeTrayParts, TRAY_DIVIDER_RISE_M, TRAY_POSE, TRAY_SLOTS, trayQuaternion } from '../../src/tray-layout';

// The parts tray against the real files: parts_tray.glb has twelve compartments, one for each loose part of the Music Box, and every part
// lies fully inside its own compartment, in the pose the game gives it, with at least 3 mm to every wall. The proof reads the real part GLBs
// and the real tray mesh (rays down onto the tray from above: the velvet inside a compartment, a divider everywhere between them) and places
// the parts with the same function the game uses (src/tray-layout.ts). Like glb-contract.test.ts it points at another folder with
// WU_MODELS_DIR=<absolute path of a public/assets/models folder>. WU_TRAY_PLACEMENTS=<file> also writes the placements, for the render
// (blender/scripts/render_tray_fit.py).

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
  writeFileSync(path: string, data: string): void;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));

const TRAY_PATH = 'tockton/workshop/parts_tray.glb';
const MIN_CLEARANCE_M = 0.003;
const EPS = 1e-5; // 0.01 mm: the GLB stores float32 positions

async function load(relative: string): Promise<Object3D> {
  const bytes = fs.readFileSync(fileOf(relative));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}
const modelCache = new Map<string, Promise<Object3D>>();
const partScene = async (assetId: string): Promise<Object3D> => {
  let p = modelCache.get(assetId);
  if (!p) modelCache.set(assetId, (p = load(MODEL_PATHS[assetId])));
  return (await p).clone(true);
};

const tray = await load(TRAY_PATH);
tray.updateMatrixWorld(true);

interface Compartment {
  readonly slot: number;
  readonly centre: Vector3;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly wu: { slot: number; partAssets: string[]; innerMm: [number, number]; yawDeg: number };
}
const compartments: Compartment[] = [];
const meshes: Mesh[] = [];
let rootWu: { floorTopMm: number; dividerTopMm: number; interiorMm: [number, number]; clearanceMm: number; compartments: number } | undefined;
tray.traverse((node) => {
  const mesh = node as Mesh;
  if (mesh.isMesh) meshes.push(mesh);
  const wu = node.userData.wu as Record<string, unknown> | undefined;
  if (wu?.compartments !== undefined) rootWu = wu as unknown as typeof rootWu;
  if (!/^SOCKET_Slot\d+$/.test(node.name)) return;
  const c = node.getWorldPosition(new Vector3());
  const [w, d] = (wu as unknown as Compartment['wu']).innerMm.map((v) => v / 1000);
  compartments.push({ slot: Number(node.name.slice(11)), centre: c, x0: c.x - w / 2, x1: c.x + w / 2, z0: c.z - d / 2, z1: c.z + d / 2, wu: wu as unknown as Compartment['wu'] });
});
compartments.sort((a, b) => a.slot - b.slot);
const floorY = (rootWu?.floorTopMm ?? 0) / 1000;

/** The loose parts of the first Music Box build, in tray order: asset id and family. */
const boxParts = MUSIC_BOX.tray.flatMap((e) => Array.from({ length: e.quantity }, () => e.partId)).map((id) => ({ id, assetId: requirePart(id).visual.assetId, family: requirePart(id).family }));

/** `assetId` posed like a placement says, as its bounding box in the tray's frame. */
async function boxOf(assetId: string, position: readonly number[], quaternion: readonly number[]): Promise<Box3> {
  const object = await partScene(assetId);
  object.position.set(position[0], position[1], position[2]);
  object.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
}

describe('parts_tray.glb: twelve compartments for the Music Box parts', () => {
  it('has the twelve slot empties in the order of the Music Box tray, and the table in src/tray-layout.ts says the same', () => {
    expect(compartments.map((c) => c.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rootWu?.compartments).toBe(12);
    compartments.forEach((c, i) => {
      expect(c.wu.partAssets, `slot ${c.slot}`).toEqual([...TRAY_SLOTS[i]]);
      expect(c.wu.yawDeg, `slot ${c.slot}`).toBe(TRAY_POSE[TRAY_SLOTS[i][0]].yawDeg);
    });
    expect(boxParts.map((p) => p.assetId)).toEqual(TRAY_SLOTS.map((a) => a[0])); // part i of the first build belongs in compartment i
  });

  it('keeps every compartment inside the tray with its own gap to the next: no two overlap', () => {
    const [ix, iz] = (rootWu?.interiorMm ?? [0, 0]).map((v) => v / 2000);
    for (const c of compartments) {
      expect(c.x0, `slot ${c.slot}`).toBeGreaterThanOrEqual(-ix - EPS);
      expect(c.x1, `slot ${c.slot}`).toBeLessThanOrEqual(ix + EPS);
      expect(c.z0, `slot ${c.slot}`).toBeGreaterThanOrEqual(-iz - EPS);
      expect(c.z1, `slot ${c.slot}`).toBeLessThanOrEqual(iz + EPS);
    }
    for (const a of compartments) {
      for (const b of compartments) {
        if (a.slot >= b.slot) continue;
        const gap = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.z0 - a.z1, a.z0 - b.z1); // positive: apart along x or z
        expect(gap, `slots ${a.slot} and ${b.slot}`).toBeGreaterThanOrEqual(0.0021); // a divider (2.2 mm) fits between
      }
    }
  });

  it('puts every part, in the pose the game gives it, fully inside its own compartment with at least 3 mm to every wall', async () => {
    const slots = compartments.map((c) => c.centre);
    const lies = placeTrayParts(boxParts, slots, new Vector3());
    // the twelve parts of the first build, and the worn spring, which shares the spring's compartment
    const worn = placeTrayParts([{ assetId: 'spring_worn', family: 'spring' }], slots, new Vector3())[0];
    const jobs = [...boxParts.map((p, i) => ({ asset: p.assetId, slot: i, lie: lies[i] })), { asset: 'spring_worn', slot: 7, lie: worn }];
    const report: Array<Record<string, unknown>> = [];
    for (const { asset, slot, lie } of jobs) {
      expect(lie.slot, asset).toBe(slot);
      const c = compartments[slot];
      const box = await boxOf(asset, lie.position, lie.quaternion);
      const clearance = Math.min(box.min.x - c.x0, c.x1 - box.max.x, box.min.z - c.z0, c.z1 - box.max.z);
      expect(clearance, `${asset} in slot ${c.slot}`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - EPS);
      expect(box.min.y, `${asset} rests on the velvet`).toBeCloseTo(floorY, 4);
      report.push({
        slot: c.slot,
        asset,
        partMm: [box.max.x - box.min.x, box.max.z - box.min.z].map((v) => +(v * 1000).toFixed(2)),
        compartmentMm: [c.x1 - c.x0, c.z1 - c.z0].map((v) => +(v * 1000).toFixed(2)),
        clearanceMm: +(clearance * 1000).toFixed(2),
      });
    }
    expect(report).toHaveLength(13); // twelve parts and the worn spring
    if (env.WU_TRAY_PLACEMENTS) {
      const parts = jobs.slice(0, 12).map(({ asset, lie }) => ({ asset, position: lie.position, quaternion: lie.quaternion }));
      fs.writeFileSync(env.WU_TRAY_PLACEMENTS, JSON.stringify({ tray: TRAY_PATH, parts, report }, null, 1));
    }
    // the smallest clearance of any part to any wall, for the record
    expect(Math.min(...report.map((r) => r.clearanceMm as number))).toBeGreaterThanOrEqual(3);
  });

  it('holds the offsets in src/tray-layout.ts to the real part files: the middle of the box over the slot, the underside on the velvet', async () => {
    for (const [assetId, pose] of Object.entries(TRAY_POSE)) {
      const family = PART_DEFINITIONS.find((p) => p.visual.assetId === assetId)?.family ?? '';
      const object = await partScene(assetId);
      object.quaternion.set(...trayQuaternion(family, pose.yawDeg));
      object.updateMatrixWorld(true);
      const box = new Box3().setFromObject(object);
      const want = [-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2];
      pose.offset.forEach((v, k) => expect(v, `${assetId} axis ${k}`).toBeCloseTo(want[k], 4)); // within 0.05 mm
    }
  });

  it('has no divider inside a compartment and a divider everywhere between them (rays down onto the tray mesh)', () => {
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const top = (x: number, z: number): number => {
      ray.set(new Vector3(x, 0.1, z), down);
      const hit = ray.intersectObjects(meshes, false)[0];
      return hit ? hit.point.y : -Infinity;
    };
    const step = 0.002;
    const [ix, iz] = (rootWu?.interiorMm ?? [0, 0]).map((v) => v / 2000);
    const dividerTop = (rootWu?.dividerTopMm ?? 0) / 1000;
    let inside = 0;
    let between = 0;
    for (let x = -ix + 0.0005; x < ix; x += step) {
      for (let z = -iz + 0.0005; z < iz; z += step) {
        const c = compartments.find((k) => x > k.x0 + 0.0002 && x < k.x1 - 0.0002 && z > k.z0 + 0.0002 && z < k.z1 - 0.0002);
        const y = top(x, z);
        if (c) {
          inside++;
          // the velvet, risen at most by the 1.2 mm fillet where it meets the wall
          if (y < floorY - 0.0003 || y > floorY + 0.0015) throw new Error(`slot ${c.slot}: the tray surface is at ${(y * 1000).toFixed(2)} mm at x ${(x * 1000).toFixed(1)} z ${(z * 1000).toFixed(1)}`);
        } else if (!compartments.some((k) => x > k.x0 - 0.0002 && x < k.x1 + 0.0002 && z > k.z0 - 0.0002 && z < k.z1 + 0.0002)) {
          between++;
          if (y < dividerTop - 0.0008) throw new Error(`open velvet between compartments at x ${(x * 1000).toFixed(1)} z ${(z * 1000).toFixed(1)} (${(y * 1000).toFixed(2)} mm)`);
        }
      }
    }
    expect(inside).toBeGreaterThan(4000);
    expect(between).toBeGreaterThan(100);
  });
});

describe('parts that are not in the tray', () => {
  it('puts a repair part in its own compartment, whatever its place in the list (the repair tray holds one part)', async () => {
    const slots = compartments.map((c) => c.centre);
    const spring = requirePart('spring_standard_brass');
    const [lie] = placeTrayParts([{ assetId: spring.visual.assetId, family: spring.family }], slots, new Vector3());
    expect(lie.slot).toBe(7);
    expect(assignSlots(['gear_spur_12_m1', 'gear_spur_12_m1', 'winding_key'])).toEqual([10, -1, 11]); // one compartment for each asset
  });

  it('copes with a tray that has fewer compartments, or none: the parts without one lie on top, or at the fallback', () => {
    const slots = compartments.map((c) => c.centre);
    const parts = boxParts.map((p) => ({ assetId: p.assetId, family: p.family }));
    const few = placeTrayParts(parts, slots.slice(0, 8), new Vector3());
    expect(few.map((l) => l.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, -1, -1, -1, -1]);
    const none = placeTrayParts(parts, [], new Vector3(1, 2, 3));
    expect(none.every((l) => l.slot === -1 && l.position[0] === 1 && l.position[2] === 3)).toBe(true);
    // a pile of parts with no compartment is spread along the tray, 5 cm apart at most, and stays inside it
    const pile = placeTrayParts(Array.from({ length: 5 }, () => ({ assetId: 'gear_spur_24_m1', family: 'spur_gear' })), slots, new Vector3());
    const zs = pile.map((l) => l.position[2]);
    expect(new Set(zs).size).toBe(5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThanOrEqual(0.15 + 1e-9);
    zs.slice(1).forEach((z, i) => expect(z - zs[i]).toBeLessThanOrEqual(0.05 + 1e-9));
  });

  it('lets the Windmill 24T gear (no compartment) lie on the dividers, in the middle of the tray, inside it', async () => {
    const slots = compartments.map((c) => c.centre);
    const [lie] = placeTrayParts([{ assetId: 'gear_spur_24_m1', family: 'spur_gear' }], slots, new Vector3());
    expect(lie.slot).toBe(-1);
    const box = await boxOf('gear_spur_24_m1', lie.position, lie.quaternion);
    expect(box.min.y).toBeCloseTo(floorY + TRAY_DIVIDER_RISE_M, 4);
    expect(box.min.y).toBeCloseTo((rootWu?.dividerTopMm ?? 0) / 1000, 3);
    const [ix, iz] = (rootWu?.interiorMm ?? [0, 0]).map((v) => v / 2000);
    expect(box.min.x).toBeGreaterThan(-ix);
    expect(box.max.x).toBeLessThan(ix);
    expect(box.min.z).toBeGreaterThan(-iz);
    expect(box.max.z).toBeLessThan(iz);
  });
});

describe("the Well's and the Belfry's trays (ADR-048)", () => {
  /** What a first build puts in the tray: every part of the tray list that a hand can take (the Belfry's bell is seated by the game). */
  const trayParts = (bp: MachineBlueprint) =>
    bp.tray
      .flatMap((e) => Array.from({ length: e.quantity }, () => e.partId))
      .map((id) => requirePart(id))
      .filter((p) => p.grab.enabled)
      .map((p) => ({ id: p.id, assetId: p.visual.assetId, family: p.family }));

  it.each([WELL, BELFRY].map((bp) => [bp.id, bp] as const))('%s: every part lies on the velvet or the dividers inside the tray, and no two parts overlap', async (_id, bp) => {
    const slots = compartments.map((c) => c.centre);
    const parts = trayParts(bp);
    const lies = placeTrayParts(parts, slots, new Vector3());
    const [ix, iz] = (rootWu?.interiorMm ?? [0, 0]).map((v) => v / 2000);
    const boxes: Array<{ id: string; slot: number; box: Box3 }> = [];
    for (let i = 0; i < parts.length; i++) {
      const lie = lies[i];
      const box = await boxOf(parts[i].assetId, lie.position, lie.quaternion);
      boxes.push({ id: parts[i].id, slot: lie.slot, box });
      // resting on the velvet of its compartment, or on the dividers
      expect(box.min.y, `${parts[i].id} rests`).toBeCloseTo(lie.slot >= 0 ? floorY : floorY + TRAY_DIVIDER_RISE_M, 3);
      expect(box.min.x, `${parts[i].id} inside the tray (left)`).toBeGreaterThan(-ix);
      expect(box.max.x, `${parts[i].id} inside the tray (right)`).toBeLessThan(ix);
      expect(box.min.z, `${parts[i].id} inside the tray (back)`).toBeGreaterThan(-iz);
      expect(box.max.z, `${parts[i].id} inside the tray (front)`).toBeLessThan(iz);
      if (lie.slot >= 0) {
        const c = compartments[lie.slot];
        expect(Math.min(box.min.x - c.x0, c.x1 - box.max.x, box.min.z - c.z0, c.z1 - box.max.z), `${parts[i].id} in slot ${c.slot}`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - EPS);
      }
    }
    const overlaps: string[] = [];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a].box;
        const B = boxes[b].box;
        // Overlap in plan (less a millimetre of slack for the rounded rims) AND in height by more than 2 mm: a part on the dividers rests 20 mm up, and a
        // flat gear in a compartment below it reaches 21.2 mm, so the boxes of the two touch by 1.2 mm without the parts meeting.
        const planOverlap = A.min.x < B.max.x - 0.001 && B.min.x < A.max.x - 0.001 && A.min.z < B.max.z - 0.001 && B.min.z < A.max.z - 0.001;
        const high = Math.min(A.max.y, B.max.y) - Math.max(A.min.y, B.min.y);
        if (planOverlap && high > 0.002) overlaps.push(`${boxes[a].id} and ${boxes[b].id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('lies the weathervane finial up and the long shaft down the middle', async () => {
    const slots = compartments.map((c) => c.centre);
    const lies = placeTrayParts(trayParts(BELFRY), slots, new Vector3());
    const parts = trayParts(BELFRY);
    const vane = lies[parts.findIndex((p) => p.assetId === 'belfry_vane')];
    const vaneBox = await boxOf('belfry_vane', vane.position, vane.quaternion);
    expect(vaneBox.max.y - vaneBox.min.y).toBeCloseTo(0.031, 3); // 31 mm tall: the finial stands up, not 16 mm across the velvet
    const shaft = lies[parts.findIndex((p) => p.assetId === 'shaft_long')];
    const shaftBox = await boxOf('shaft_long', shaft.position, shaft.quaternion);
    expect(shaftBox.max.z - shaftBox.min.z).toBeCloseTo(0.18, 3);
    const [ix, iz] = (rootWu?.interiorMm ?? [0, 0]).map((v) => v / 2000);
    expect(shaftBox.min.x).toBeGreaterThan(-ix); // against the left wall, inside it, and inside the 20 cm length
    expect(shaftBox.max.x).toBeLessThan(-ix + 0.012);
    expect(shaftBox.min.z).toBeGreaterThan(-iz);
    expect(shaftBox.max.z).toBeLessThan(iz);
  });
});
