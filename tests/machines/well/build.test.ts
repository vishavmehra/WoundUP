// The finished Well built from the real GLBs, parsed in Node: every part lands at its blueprint pose, every moving part is driven by the solver,
// the pump rod follows the pin profile, the pawl clicks, the buckets and the water move, and baking keeps the picture. Set WU_MODELS_DIR to a
// models folder to run it against another checkout; it is skipped when the Well's GLBs are not in the tree.
import { Box3, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { solveAssembly, WELL, WELL_PROFILE, WELL_STROKE_M } from '../../../src/content/blueprints';
import type { TownAudio } from '../../../src/audio/engine';
import { buildWell, pawlLift, WELL_MODEL_PATHS } from '../../../src/machines/well';
import { MAX_WIND_UNITS } from '../../../src/sim';
import { bakeStatic } from '../../../src/town/bake';
import { buildMachine } from '../../../src/town/machines';
import { stepRig } from '../../../src/town/motion';
import type { MachineRig } from '../../../src/town/motion';
import type { ModelSource } from '../../../src/town/scene';
import { fs, libraryRegistry, repoUrl } from '../../town/helpers';

const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');
const present = WELL_MODEL_PATHS.every((path) => fs.existsSync(new URL(path, dir)));
if (!present) console.warn(`[well] skipped, files missing here: ${WELL_MODEL_PATHS.filter((p) => !fs.existsSync(new URL(p, dir))).join(', ')}`);

const loaded: string[] = [];
const source: ModelSource = async (path) => {
  loaded.push(path);
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};

const FRAME = 1 / 72;
const TAU = Math.PI * 2;

/** A rig that has been solved at eight wind units and is at full speed: the spin-up ease has its own test. */
async function runningWell(): Promise<MachineRig> {
  const rig = await buildWell(source, libraryRegistry());
  const outcome = solveAssembly(WELL, WELL.intended, MAX_WIND_UNITS);
  if (!outcome.ok) throw new Error('the Well must solve');
  rig.result = outcome.result;
  rig.running = true;
  rig.speed = 1;
  return rig;
}

function step(rig: MachineRig, seconds: number, from = 0, each?: (t: number) => void): number {
  let t = from;
  for (let i = 0; i < Math.round(seconds / FRAME); i++) {
    t += FRAME;
    stepRig(rig, FRAME, t);
    each?.(t);
  }
  return t;
}

const find = (rig: MachineRig, name: string): Object3D => rig.root.getObjectByName(name) as Object3D;
const rotor = (rig: MachineRig, socket: string) => rig.rotors.find((r) => r.socketId === socket)!;

/** Meshes the renderer would draw: visible all the way up, with a material that is not hidden. */
function drawn(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverseVisible((n) => {
    const m = n as Mesh;
    if (m.isMesh && !Array.isArray(m.material) && m.material.visible !== false) out.push(m);
  });
  return out;
}

describe.skipIf(!present)('the finished Well from the real GLBs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loaded.length = 0;
  });

  it('is built without a warning from the files the catalogue and the town know, every part at the pose its blueprint socket gives', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rig = await buildWell(source, libraryRegistry());
    expect(warn).not.toHaveBeenCalled();
    expect(rig.machineId).toBe('well');
    expect([...new Set(loaded)].sort()).toEqual([...WELL_MODEL_PATHS].sort());
    for (const s of WELL.sockets) {
      const part = find(rig, `Part_${s.node}`);
      expect(part, s.id).toBeDefined();
      part.position.toArray().forEach((v, k) => expect(v, `${s.id} position ${k}`).toBeCloseTo(s.position![k], 9));
      expect(Math.abs(part.quaternion.dot(new Quaternion(...s.rotation!))), `${s.id} rotation`).toBeGreaterThan(1 - 1e-9);
    }
    expect(rig.root.getObjectByName('SOCKET_BaseHandle')?.parent?.children.length).toBeGreaterThan(1); // the handle sits on its socket
    expect((await buildMachine('well', source, libraryRegistry()))?.machineId).toBe('well'); // what the game, the restore and the gift viewer call
  });

  it('turns eight rotors by the solver and nothing else: both gears, the cam, the ratchet, both pulleys, the spring and its key', async () => {
    const rig = await buildWell(source, libraryRegistry());
    expect(rig.rotors.map((r) => r.socketId).sort()).toEqual(['cam', 'cam_gear', 'drive_gear', 'pulley_drive', 'pulley_idle', 'ratchet', 'spring', 'spring']);
    for (const r of rig.rotors) expect(r.axis, r.socketId).toBe('z');
    expect(rig.bakeable).toBe(true);
    expect(rig.updaters).toHaveLength(3); // the pump, the pawl, the water
  });

  it('runs at the solver\'s speeds: the cam at 1.6 rad/s clockwise, a turn in 3.93 s, the key with the spring, the 10T twice the 20T the other way', async () => {
    const rig = await runningWell();
    step(rig, 1);
    expect(rotor(rig, 'cam').theta).toBeCloseTo(-1.6, 3);
    expect(rotor(rig, 'cam_gear').theta).toBeCloseTo(-1.6, 3);
    expect(rotor(rig, 'drive_gear').theta).toBeCloseTo(0.8, 3);
    expect(rotor(rig, 'spring').theta).toBeCloseTo(0.8, 3);
    expect(rotor(rig, 'pulley_idle').theta).toBeCloseTo(-1.6, 3);
    const keys = rig.rotors.filter((r) => r.socketId === 'spring');
    expect(keys[0].theta).toBeCloseTo(keys[1].theta, 12); // spring and key turn as one
    step(rig, 2.927, 1);
    expect(rotor(rig, 'cam').theta).toBeCloseTo(-TAU, 1); // one full turn of the cam (the loop steps whole frames)
  });

  it('lifts the pump rod by the pin profile, 5.5 mm at the top, and drops it back, once a turn of the cam', async () => {
    const rig = await runningWell();
    const rod = find(rig, 'Part_Follower');
    const rest = WELL.sockets.find((s) => s.id === 'follower')!.position![1];
    expect(rod.position.y).toBeCloseTo(rest, 12);
    let top = -Infinity;
    let low = Infinity;
    step(rig, 3.93, 0, () => {
      const lift = rod.position.y - rest;
      top = Math.max(top, lift);
      low = Math.min(low, lift);
    });
    expect(top).toBeCloseTo(WELL_STROKE_M, 4);
    expect(low).toBeGreaterThanOrEqual(-1e-12);
    // At every moment it is exactly the profile at the cam's own angle: the rig and the solver read one function.
    const cam = rotor(rig, 'cam');
    const expected = WELL_PROFILE.samples.length; // 72 samples
    expect(expected).toBe(72);
    step(rig, 0.5, 4);
    const outcome = solveAssembly(WELL, WELL.intended, MAX_WIND_UNITS, { cam: cam.theta });
    expect(outcome.ok && (rod.position.y - rest)).toBeCloseTo(outcome.ok ? outcome.result.followerPose.follower : NaN, 12);
  });

  it('clicks the pawl once for each of the 16 teeth the ratchet passes, rocking it a few degrees and putting it back on the tooth', async () => {
    const rig = await runningWell();
    const ticks: Array<0 | 1> = [];
    rig.audio = { pluck: () => undefined, chime: () => undefined, tick: (p) => void ticks.push(p) } as TownAudio;
    const pawl = find(rig, 'Part_Pawl');
    const rest = pawl.quaternion.clone();
    let widest = 0;
    step(rig, 3.93, 0, () => (widest = Math.max(widest, pawl.quaternion.angleTo(rest))));
    expect(ticks.length).toBeGreaterThanOrEqual(15);
    expect(ticks.length).toBeLessThanOrEqual(17); // 16 teeth to a turn of the ratchet
    expect(ticks.slice(0, 4).every((p, i, all) => i === 0 || p !== all[i - 1])).toBe(true); // tick, tock, tick, tock
    expect(widest).toBeGreaterThan(0.08); // lifts about 0.1 rad
    expect(widest).toBeLessThan(0.11);
    expect(pawlLift(0)).toBe(0);
    expect(pawlLift(0.85)).toBeCloseTo(1, 12);
    expect(pawlLift(0.999)).toBeLessThan(0.01); // and drops back into the gap
  });

  it('keeps quiet and still while stopped: nothing ticks, the rod stays where it is', async () => {
    const rig = await runningWell();
    const ticks: number[] = [];
    rig.audio = { pluck: () => undefined, chime: () => undefined, tick: (p) => void ticks.push(p) } as TownAudio;
    rig.running = false;
    rig.speed = 0;
    step(rig, 2);
    expect(ticks).toEqual([]);
    expect(rotor(rig, 'cam').theta).toBe(0);
  });

  it('rides the buckets round the loop: ten of them, two draws, moving with the chain, and tips water into the basin until it is full', async () => {
    const rig = await runningWell();
    const buckets = rig.root.children.filter((c) => (c as InstancedMesh).isInstancedMesh && c.name.startsWith('Well_Buckets_')) as InstancedMesh[];
    expect(buckets).toHaveLength(2); // the template is walnut and brass: one InstancedMesh each
    for (const b of buckets) expect(b.count).toBe(10);
    expect(find(rig, 'Bucket_Template').visible).toBe(true); // the group itself is the housing's; its meshes are what is hidden
    const water = find(rig, 'Well_WaterLevel') as Mesh;
    expect(water.visible).toBe(false); // an empty basin shows no water
    const base = water.position.y;
    const first = new Matrix4();
    buckets[0].getMatrixAt(0, first);
    step(rig, 0.5);
    const later = new Matrix4();
    buckets[0].getMatrixAt(0, later);
    expect(later.elements.some((v, i) => Math.abs(v - first.elements[i]) > 1e-7)).toBe(true); // the chain moved
    step(rig, 8, 0.5);
    expect(water.visible).toBe(true);
    const half = water.position.y - base;
    expect(half).toBeGreaterThan(0);
    step(rig, 10, 8.5); // 8 s after the first bucket tipped the basin is full, and it stays full
    expect(water.position.y - base).toBeCloseTo(0.0078, 4); // wu.maxYMm - wu.baseYMm
    const full = water.position.y;
    step(rig, 5, 18.5);
    expect(water.position.y).toBe(full);
    // the water of the basin, the droplets and the jet share one material, which is not a library one
    const droplets = rig.root.getObjectByName('Well_Droplets') as InstancedMesh;
    expect(droplets.material).toBe(water.material);
  });

  it('fires the jet as the rod drops, and nothing is launched while stopped', async () => {
    const rig = await runningWell();
    const droplets = rig.root.getObjectByName('Well_Droplets') as InstancedMesh;
    const alive = (): number => {
      const m = new Matrix4();
      let n = 0;
      for (let i = 0; i < droplets.count; i++) {
        droplets.getMatrixAt(i, m);
        if (m.elements[0] !== 0) n++;
      }
      return n;
    };
    let peak = 0;
    step(rig, 3.93, 0, () => (peak = Math.max(peak, alive())));
    expect(peak).toBeGreaterThanOrEqual(8); // a burst of eight at the drop
    rig.running = false;
    rig.speed = 0;
    step(rig, 4, 5);
    expect(alive()).toBe(0); // everything that was in the air has landed, nothing new was launched
  });

  it('settles a restored Well with the basin already full (a saved town)', async () => {
    const rig = await buildWell(source, libraryRegistry());
    rig.restored = true;
    rig.running = false;
    step(rig, 0.1);
    const water = find(rig, 'Well_WaterLevel') as Mesh;
    expect(water.visible).toBe(true);
    expect(water.position.y).toBeCloseTo(0.0078, 4);
  });

  it('bakes the housing and the still parts into one mesh per material and leaves the moving parts alone, with the same picture', async () => {
    const rig = await runningWell();
    step(rig, 1);
    rig.root.updateWorldMatrix(true, true);
    const before = new Box3().setFromObject(rig.root, true);
    const meshesBefore = drawn(rig.root).length;
    const movers = [...rig.rotors.map((r) => r.node), find(rig, 'Part_Follower'), find(rig, 'Part_Pawl')];
    const result = bakeStatic(rig);
    expect(result.removed).toBeGreaterThan(5);
    expect(result.made).toBeGreaterThan(0);
    expect(result.made).toBeLessThanOrEqual(6); // one per library material of the housing and the still parts
    expect(rig.bakeable).toBe(false);
    expect(bakeStatic(rig)).toEqual({ removed: 0, made: 0 }); // once
    const meshesAfter = drawn(rig.root).length;
    expect(meshesAfter).toBeLessThan(meshesBefore);
    for (const node of movers) expect(node.parent, node.name).not.toBeNull(); // still in the scene
    rig.root.updateWorldMatrix(true, true);
    const after = new Box3().setFromObject(rig.root, true);
    for (const k of ['x', 'y', 'z'] as const) {
      expect(after.min[k]).toBeCloseTo(before.min[k], 5);
      expect(after.max[k]).toBeCloseTo(before.max[k], 5);
    }
    // the machine still runs after it
    const theta = rotor(rig, 'cam').theta;
    step(rig, 0.5, 1);
    expect(rotor(rig, 'cam').theta).toBeLessThan(theta);
    expect(find(rig, 'Part_Follower').position.y).toBeGreaterThanOrEqual(WELL.sockets.find((s) => s.id === 'follower')!.position![1]);
  });

  it('puts the parts where the housing\'s own empties say, so the blueprint and the file agree to 0.1 mm', async () => {
    const rig = await buildWell(source, libraryRegistry());
    for (const s of WELL.sockets) {
      const empty = rig.root.getObjectByName(`SOCKET_${s.node}`) as Object3D;
      expect(empty, s.id).toBeDefined();
      const part = find(rig, `Part_${s.node}`);
      expect(part.position.distanceTo(empty.position), s.id).toBeLessThan(1e-4);
      expect(Math.abs(part.quaternion.dot(empty.quaternion)), s.id).toBeGreaterThan(1 - 1e-6);
    }
    // the 20T and the 10T are 38.5 mm apart, 2.5 mm x (20 + 10) / 2 plus the 1.0 mm that straight-flank teeth need
    expect(find(rig, 'Part_GearDrive').position.distanceTo(find(rig, 'Part_GearCam').position)).toBeCloseTo(0.0385, 6);
    expect(new Vector3(...WELL.sockets[0].position!).y).toBeCloseTo(0.195, 9);
  });
});
