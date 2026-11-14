import { Grabbed, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { Object3D, Scene, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it } from 'vitest';
import { getBlueprint, repairStart, solveAssembly, unmetDependencies, WINDMILL } from '../../src/content/blueprints';
import { MODEL_PATHS, requirePart } from '../../src/content/parts';
import { REPAIRS } from '../../src/game/content';
import { SnapPart, SnappedTo, Socket, SocketSnapSystem, XRayTarget, interactionIntents } from '../../src/interaction';
import { MaterialRegistry, parseLibrary } from '../../src/materials';
import { PartLoader } from '../../src/parts';
import type { ModelSource } from '../../src/parts';
import { ReturnsToRest } from '../../src/returns-to-rest-component';

// Letter 5 on the real files: the Windmill base GLB carries the gear sockets (SOCKET_Pinion, SOCKET_Gear24), so a hand can swap the
// wrong gear. Like glb-contract.test.ts it points at another folder with WU_MODELS_DIR=<absolute path of a public/assets/models folder>.

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
  existsSync(path: string | URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));
const missing = Object.entries(MODEL_PATHS).filter(([, path]) => !fs.existsSync(fileOf(path))).map(([id]) => id);
const libraryJson = JSON.parse(new TextDecoder().decode(fs.readFileSync(new URL('../../public/assets/materials/library.json', import.meta.url))));

class GlbSource implements ModelSource {
  private readonly gltfs = new Map<string, GLTF>();
  async load(key: string): Promise<void> {
    if (this.gltfs.has(key)) return;
    const bytes = fs.readFileSync(fileOf(MODEL_PATHS[key]));
    this.gltfs.set(key, await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, ''));
  }
  shared = (key: string): Object3D | undefined => this.gltfs.get(key)?.scene;
  clone = (key: string): Object3D | undefined => this.gltfs.get(key)?.scene.clone(true);
  drop = (key: string): void => void this.gltfs.delete(key);
}

const FRAME = 1 / 72;
let clock = 0;
const tick = (world: World, frames = 1): void => {
  for (let i = 0; i < frames; i++) {
    clock += FRAME;
    world.update(FRAME, clock);
  }
};

const seen: string[] = [];
interactionIntents.subscribe((i) => void seen.push(i.type));
afterEach(() => (seen.length = 0));

function setup() {
  const world = new World();
  for (const c of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, XRayTarget]) world.registerComponent(c);
  const scene = new Scene();
  Object.assign(world, { scene });
  world.registerSystem(SocketSnapSystem, { priority: 10 });
  const registry = new MaterialRegistry(parseLibrary(libraryJson), { baseUrl: 'http://test/', loadTexture: async () => new Texture() });
  return { world, scene, loader: new PartLoader(world, registry, new GlbSource()) };
}

describe.skipIf(missing.length > 0)('Windmill gear sockets on the real GLBs (Letter 5)', () => {
  it('binds the pinion and the designated 24T, and leaves only the sockets inside the solid tower to the game', async () => {
    const { scene, loader } = setup();
    const machine = await loader.spawnMachine('windmill', { parent: scene });
    expect(machine.sockets.has('pinion')).toBe(true);
    expect(machine.sockets.has('gear_24')).toBe(true);
    expect(machine.unbound().sort()).toEqual(['bearing_deck', 'bearing_floor', 'bevel_hub', 'bevel_shaft', 'main_shaft', 'rotor']);
    const at = (id: string): Vector3 => (machine.sockets.get(id)!.getValue(Socket, 'node') as Object3D).getWorldPosition(new Vector3());
    // 12T and 24T mesh in one plane, 46.0 mm apart: 2.5 mm x (12 + 24) / 2 + 1.0 mm
    expect(at('gear_24').distanceTo(at('pinion'))).toBeCloseTo(0.046, 6);
    expect(at('gear_24').y).toBeCloseTo(at('pinion').y, 9);
    expect(at('gear_24').z).toBeCloseTo(at('millstone').z, 9); // the 24T and the millstone share a spindle
    expect(at('gear_24').y).toBeLessThan(at('millstone').y);
  });

  it('Letter 5: starts with the 12T in the 24T socket and runs wrong at 1.2 rad/s; the 24T swapped in by hand runs at 0.6 rad/s', async () => {
    const { world, scene, loader } = setup();
    const machine = await loader.spawnMachine('windmill', { parent: scene });
    const blueprint = getBlueprint('windmill')!;
    const start = repairStart(REPAIRS.wrong_gear)!;
    expect(start.assembly.gear_24).toBe('gear_spur_12_m1_brass');
    expect(start.tray).toEqual([{ partId: 'gear_spur_24_m1_brass', quantity: 1 }]);

    const socketAt = (id: string): number[] => (machine.sockets.get(id)!.getValue(Socket, 'node') as Object3D).getWorldPosition(new Vector3()).toArray();
    const seat = async (partId: string, socketId: string): Promise<{ entity: Entity; object: Object3D }> => {
      const part = await loader.spawnPart(partId, { parent: scene, position: socketAt(socketId) as [number, number, number], machine });
      part.entity.addComponent(Grabbed);
      tick(world);
      part.entity.removeComponent(Grabbed);
      tick(world, 12); // the snap tween
      return part;
    };
    // What the game does for this letter (Gameplay.startBuild): a part goes in by hand when its socket exists and the part can be grabbed; the rest is the game's.
    const fixed = Object.fromEntries(Object.entries(start.assembly).filter(([id, partId]) => !(machine.sockets.has(id) && requirePart(partId).grab.enabled)));
    expect(Object.keys(fixed).sort()).toEqual(['bearing_deck', 'bearing_floor', 'bevel_hub', 'bevel_shaft', 'main_shaft', 'rotor', 'tower']);
    const pinion = await seat(start.assembly.pinion, 'pinion');
    await seat(start.assembly.millstone, 'millstone');
    const wrong = await seat(start.assembly.gear_24, 'gear_24');
    expect(machine.assembly()).toEqual({ pinion: 'gear_spur_12_m1_brass', millstone: start.assembly.millstone, gear_24: 'gear_spur_12_m1_brass' });
    // seated flat, on the socket: the gear's axis (local +Z) points up
    expect(new Vector3(0, 0, 1).applyQuaternion(wrong.object.quaternion).toArray()).toEqual([0, 1, 0].map((v) => expect.closeTo(v, 6)));
    expect(wrong.object.position.toArray()).toEqual(socketAt('gear_24').map((v) => expect.closeTo(v, 6)));
    expect(pinion.object.position.y).toBeCloseTo(wrong.object.position.y, 9);

    const solve = (): { status: string; millstone: number } => {
      const outcome = solveAssembly(blueprint, { ...fixed, ...machine.assembly() });
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.errors));
      return { status: outcome.result.status, millstone: Math.abs(outcome.result.angularVelocity.millstone) };
    };
    const first = solve();
    expect(first.status).toBe('runs_wrong');
    expect(first.millstone).toBeCloseTo(1.2, 9);

    // The hand pulls the wrong gear out of its socket and seats the right one.
    wrong.entity.removeComponent(SnappedTo);
    tick(world);
    expect(machine.assembly().gear_24).toBeUndefined();
    expect(seen).toContain('unsnapped');
    await seat(start.tray[0].partId, 'gear_24');
    expect(machine.assembly().gear_24).toBe('gear_spur_24_m1_brass');
    const second = solve();
    expect(second.status).toBe('runs');
    expect(second.millstone).toBeCloseTo(0.6, 9);
  });

  it('keeps the dependencies the game enforces: the 24T needs the pinion and the millstone first', () => {
    expect(WINDMILL.sockets.find((s) => s.id === 'gear_24')?.dependencies).toEqual(['pinion', 'millstone']);
    expect(unmetDependencies(WINDMILL, {}, 'gear_24').sort()).toEqual(['millstone', 'pinion']);
  });
});

