// The finished Belfry built from the real GLBs, parsed in Node: every part lands at its blueprint pose, every moving part is driven by the solver, the
// bell rocks by the pin profile and tolls, and baking keeps the picture. Set WU_MODELS_DIR to a models folder to run it against another checkout; it is
// skipped when the Belfry's GLBs are not in the tree.
import { Box3, Quaternion } from 'three';
import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BELFRY, BELFRY_BELL_PROFILE, solveAssembly } from '../../../src/content/blueprints';
import type { TownAudio } from '../../../src/audio/engine';
import { BELFRY_MODEL_PATHS, buildBelfry, tollIndex } from '../../../src/machines/belfry';
import { MAX_WIND_UNITS } from '../../../src/sim';
import { bakeRig } from '../../../src/town/bake';
import { buildMachine } from '../../../src/town/machines';
import { applyRotor, stepRig } from '../../../src/town/motion';
import type { MachineRig } from '../../../src/town/motion';
import type { ModelSource } from '../../../src/town/scene';
import { fs, libraryRegistry, repoUrl } from '../../town/helpers';
import { clearance, collectTriangles, surfaceCrossings } from '../clock-tower/intersect';

const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');
const present = BELFRY_MODEL_PATHS.every((path) => fs.existsSync(new URL(path, dir)));
if (!present) console.warn(`[belfry] skipped, files missing here: ${BELFRY_MODEL_PATHS.filter((p) => !fs.existsSync(new URL(p, dir))).join(', ')}`);

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

async function runningBelfry(): Promise<MachineRig> {
  const rig = await buildBelfry(source, libraryRegistry());
  const outcome = solveAssembly(BELFRY, BELFRY.intended, MAX_WIND_UNITS);
  if (!outcome.ok) throw new Error('the Belfry must solve');
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

function drawn(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverseVisible((n) => {
    const m = n as Mesh;
    if (m.isMesh && !Array.isArray(m.material) && m.material.visible !== false) out.push(m);
  });
  return out;
}

describe.skipIf(!present)('the finished Belfry from the real GLBs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loaded.length = 0;
  });

  it('is built without a warning from the files the catalogue and the town know, every part at the pose its blueprint socket gives', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rig = await buildBelfry(source, libraryRegistry());
    expect(warn).not.toHaveBeenCalled();
    expect(rig.machineId).toBe('belfry');
    expect([...new Set(loaded)].sort()).toEqual([...BELFRY_MODEL_PATHS].sort());
    for (const s of BELFRY.sockets) {
      const part = find(rig, `Part_${s.node}`);
      expect(part, s.id).toBeDefined();
      part.position.toArray().forEach((v, k) => expect(v, `${s.id} position ${k}`).toBeCloseTo(s.position![k], 9));
      expect(Math.abs(part.quaternion.dot(new Quaternion(...s.rotation!))), `${s.id} rotation`).toBeGreaterThan(1 - 1e-9);
    }
    expect(rig.root.getObjectByName('SOCKET_BaseHandle')?.parent?.children.length).toBeGreaterThan(1);
    expect((await buildMachine('belfry', source, libraryRegistry()))?.machineId).toBe('belfry');
  });

  it('agrees with the housing: every socket empty of belfry_base is where the blueprint puts the part, to 0.1 mm and a thousandth of a turn', async () => {
    const rig = await buildBelfry(source, libraryRegistry());
    for (const s of BELFRY.sockets) {
      const empty = find(rig, `SOCKET_${s.node}`);
      expect(empty, s.id).toBeDefined();
      const part = find(rig, `Part_${s.node}`);
      expect(part.position.distanceTo(empty.position), s.id).toBeLessThan(1e-4);
      expect(Math.abs(part.quaternion.dot(empty.quaternion)), s.id).toBeGreaterThan(1 - 1e-6);
    }
    // 12T and 20T are 41.0 mm apart, 2.5 mm x (12 + 20) / 2 plus the 1.0 mm that straight-flank teeth need
    expect(find(rig, 'Part_GearPinion').position.distanceTo(find(rig, 'Part_GearDrive').position)).toBeCloseTo(0.041, 6);
  });

  it('turns nine rotors by the solver: the reduction, both bevels, the vertical shaft, the flywheel and the vane, the spring and its key', async () => {
    const rig = await buildBelfry(source, libraryRegistry());
    expect(rig.rotors.map((r) => r.socketId).sort()).toEqual(['bevel_a', 'bevel_b', 'drive_gear', 'flywheel', 'pinion', 'shaft', 'spring', 'spring', 'vane']);
    for (const r of rig.rotors) expect(r.axis, r.socketId).toBe('z'); // every part turns about its own +Z; the sockets stand the vertical ones on end
    expect(rig.moving.map((n) => n.name).sort()).toEqual(['ClockBell_Bell', 'ClockBell_Striker']); // what the bell's updater moves besides the rotors: the baker keeps them whole
  });

  it('runs at the solver\'s speeds: the vane at +0.48 rad/s, the reduction the other way at -0.48, a turn of the vane in 13.1 s', async () => {
    const rig = await runningBelfry();
    step(rig, 2);
    expect(rotor(rig, 'spring').theta).toBeCloseTo(1.6, 3);
    expect(rotor(rig, 'pinion').theta).toBeCloseTo(1.6, 3);
    expect(rotor(rig, 'drive_gear').theta).toBeCloseTo(-0.96, 3);
    expect(rotor(rig, 'bevel_a').theta).toBeCloseTo(-0.96, 3);
    for (const id of ['bevel_b', 'shaft', 'flywheel', 'vane']) expect(rotor(rig, id).theta, id).toBeCloseTo(0.96, 3);
  });

  it('keeps the vane\'s finial pointing up: a part seated with Rx(+90) has its local -Z, where the finial is, straight up', async () => {
    const rig = await buildBelfry(source, libraryRegistry());
    const vane = find(rig, 'Part_Vane');
    const finial = new Box3().setFromObject(vane.getObjectByName('Belfry_Vane') ?? vane, true);
    const hub = vane.position.y;
    expect(finial.max.y).toBeGreaterThan(hub + 0.002); // the ball finial stands above the hub
    expect(finial.max.y - hub).toBeGreaterThan(hub - finial.min.y); // and more of the vane is above the hub than below it
  });

  it('rocks the bell by the pin profile about its gudgeon pins and tolls at each right extreme: six to a turn of the shaft', async () => {
    const rig = await runningBelfry();
    const tolls: number[] = [];
    rig.audio = { pluck: () => undefined, chime: () => undefined, toll: () => void tolls.push(rotor(rig, 'shaft').theta) } as TownAudio;
    const bell = find(rig, 'ClockBell_Bell');
    const rest = bell.quaternion.clone();
    let widest = 0;
    step(rig, TAU / 0.48, 0, () => (widest = Math.max(widest, bell.quaternion.angleTo(rest))));
    expect(widest).toBeCloseTo(0.12, 2); // 0.12 rad each side
    expect(tolls.length).toBeGreaterThanOrEqual(5);
    expect(tolls.length).toBeLessThanOrEqual(7); // six to a turn
    // every toll is at a shaft angle where the profile peaks: 15, 75, 135 ... degrees
    for (const theta of tolls) {
      const deg = ((theta * 180) / Math.PI) % 60;
      expect(Math.abs(deg - 15) < 3 || Math.abs(deg - 15 + 60) < 3 || deg > 57, `toll at ${((theta * 180) / Math.PI).toFixed(1)} degrees`).toBe(true);
    }
    expect(Math.max(...BELFRY_BELL_PROFILE.samples)).toBeCloseTo(0.12, 12);
    expect(tollIndex(Math.PI / 12 - 1e-6)).toBe(-1);
    expect(tollIndex(Math.PI / 12 + 1e-6)).toBe(0); // the first toll is at 15 degrees
    expect(tollIndex(Math.PI / 12 + Math.PI / 3 + 1e-6)).toBe(1); // the next 60 degrees later
  });

  it('keeps quiet and still while stopped', async () => {
    const rig = await runningBelfry();
    const tolls: number[] = [];
    rig.audio = { pluck: () => undefined, chime: () => undefined, toll: () => void tolls.push(1) } as TownAudio;
    rig.running = false;
    rig.speed = 0;
    step(rig, 3);
    expect(tolls).toEqual([]);
    expect(rotor(rig, 'shaft').theta).toBe(0);
  });

  it('turns the bevel pair through a whole tooth pitch without the gears crossing: the sockets sit the pair out from the apex because gear_bevel_12 digs 0.95 mm into its partner at the apex', async () => {
    const rig = await buildBelfry(source, libraryRegistry());
    const a = rotor(rig, 'bevel_a');
    const b = rotor(rig, 'bevel_b');
    const pitch = TAU / 12;
    const SAMPLES = 12;
    let tightest = Infinity;
    for (let k = 0; k < SAMPLES; k++) {
      a.theta = (-pitch * k) / SAMPLES; // the solver's signs: A at -0.48 rad/s, B at +0.48, each about its own +Z
      b.theta = (pitch * k) / SAMPLES;
      applyRotor(a);
      applyRotor(b);
      const ta = collectTriangles(a.node);
      const tb = collectTriangles(b.node);
      expect(ta.length, 'bevel A is drawn').toBeGreaterThan(0);
      expect(surfaceCrossings(ta, tb), `crossings at ${k}/${SAMPLES} of a pitch`).toBe(0);
      tightest = Math.min(tightest, clearance(ta, tb, 0.003), clearance(tb, ta, 0.003));
    }
    expect(tightest).toBeGreaterThan(0.0003); // the real GLBs measure 0.38 mm (blender/previews/belfry/fit_check.txt); the town renders no teeth through each other
  }, 60000);

  it('bakes the housing and the still parts and leaves the moving ones alone, with the same picture', async () => {
    const rig = await runningBelfry();
    step(rig, 1);
    rig.root.updateWorldMatrix(true, true);
    const before = new Box3().setFromObject(rig.root, true);
    const meshesBefore = drawn(rig.root).length;
    const baked = bakeRig(rig);
    expect(baked.merged.length).toBeGreaterThan(0);
    expect(baked.sources).toBeGreaterThan(baked.merged.length); // the brass of the plinth, the handle and the bearing: fewer draws
    expect(drawn(rig.root).length).toBeLessThan(meshesBefore);
    for (const merged of baked.merged) expect(merged.userData.bakedFrom as string[], merged.name).not.toContain('ClockBell_Bell'); // the bell is never merged away
    rig.root.updateWorldMatrix(true, true);
    const after = new Box3().setFromObject(rig.root, true);
    for (const k of ['x', 'y', 'z'] as const) {
      expect(after.min[k]).toBeCloseTo(before.min[k], 5);
      expect(after.max[k]).toBeCloseTo(before.max[k], 5);
    }
    const theta = rotor(rig, 'vane').theta;
    step(rig, 0.5, 1);
    expect(rotor(rig, 'vane').theta).toBeGreaterThan(theta); // still turns
    expect(find(rig, 'ClockBell_Bell').parent).not.toBeNull(); // and the bell is still in the scene
  });
});
