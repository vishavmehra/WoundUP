import { Grabbed, World } from '@iwsdk/core';
import { Box3, Object3D, Scene, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { planBuild } from '../../src/build-plan';
import { CLOCK_TOWER, CLOCK_TOWER_DECOYS, CLOCK_TOWER_SOCKETS, getBlueprint, repairStart, solveAssembly } from '../../src/content/blueprints';
import { MODEL_PATHS, requirePart } from '../../src/content/parts';
import { REPAIRS } from '../../src/game/content';
import { SnapPart, SnappedTo, Socket, SocketSnapSystem, XRayTarget } from '../../src/interaction';
import { MaterialRegistry, parseLibrary } from '../../src/materials';
import { PartLoader } from '../../src/parts';
import type { ModelSource } from '../../src/parts';
import { ReturnsToRest } from '../../src/returns-to-rest-component';
import { assignSlots, placeTrayParts, TRAY_DIVIDER_RISE_M } from '../../src/tray-layout';

// Letter 6 on the real files (ADR-047): the Clock Tower's movement is seated by the game, because no GLB carries a socket for it, and the two
// decoys, the worn spring and the 12-tooth bevel gear, still lie in the tray. Every socket of the tower refuses them, so they stay loose.
// Like glb-contract.test.ts it points at another folder with WU_MODELS_DIR=<absolute path of a public/assets/models folder>.

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
  existsSync(path: string | URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));
const wanted = ['clock_tower_base', 'spring_worn', 'gear_bevel_12'];
const missing = wanted.filter((id) => !fs.existsSync(fileOf(MODEL_PATHS[id])));
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

function setup() {
  const world = new World();
  for (const c of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, XRayTarget]) world.registerComponent(c);
  const scene = new Scene();
  Object.assign(world, { scene });
  world.registerSystem(SocketSnapSystem, { priority: 10 });
  const registry = new MaterialRegistry(parseLibrary(libraryJson), { baseUrl: 'http://test/', loadTexture: async () => new Texture() });
  return { world, scene, loader: new PartLoader(world, registry, new GlbSource()) };
}

describe('Letter 6: the decoys of the Clock Tower (build plan)', () => {
  it('shows the tray with the two decoys although the game seats every part of the tower itself', () => {
    const plan = planBuild(CLOCK_TOWER, null, 0, () => false); // the base GLB has no socket for any of the 17 parts
    expect(plan.fixed).toEqual(CLOCK_TOWER.intended);
    expect(plan.trayIds).toEqual(CLOCK_TOWER_DECOYS);
    expect(plan.spawnIds).toEqual(CLOCK_TOWER_DECOYS);
    expect(plan.seatNow).toEqual([]);
    expect(plan.handBuilt).toBe(true);
    for (const id of plan.spawnIds) expect(requirePart(id).grab.enabled, id).toBe(true); // they can be pinched
  });

  it('shows no tray for a machine with nothing to place by hand and no decoy', () => {
    const noDecoys = { ...CLOCK_TOWER, tray: CLOCK_TOWER.tray.filter((t) => !t.decoy) };
    const plan = planBuild(noDecoys, null, 0, () => false);
    expect(plan.trayIds).toEqual([]);
    expect(plan.handBuilt).toBe(false);
  });

  it('is what it was for the machines a hand builds: the Music Box keeps its twelve parts; a repair starts from the machine as it stood', () => {
    const box = getBlueprint('music_box')!;
    const all = planBuild(box, null, 12, () => true);
    expect(all.fixed).toEqual({});
    expect(all.trayIds).toHaveLength(12);
    expect(all.handBuilt).toBe(true);
    expect(all.seatNow).toEqual([]);

    const start = repairStart(REPAIRS.worn_spring)!;
    const repair = planBuild(box, REPAIRS.worn_spring, 12, () => true);
    expect(repair.trayIds).toEqual(start.tray.map((t) => t.partId)); // the one standard spring
    expect(repair.seatNow.map(([id]) => id).sort()).toEqual(Object.keys(start.assembly).sort()); // the machine as it stood goes on the bench
    expect(repair.spawnIds).toHaveLength(start.tray.length + Object.keys(start.assembly).length);
    expect(repair.handBuilt).toBe(true);
  });

  it('lays the worn spring in the spring compartment and the bevel gear on the dividers, resting on them', async () => {
    const slots = assignSlots(CLOCK_TOWER_DECOYS.map((id) => requirePart(id).visual.assetId));
    expect(slots[0]).toBe(7); // the compartment of the Music Box's two springs
    expect(slots[1]).toBe(-1); // no compartment: on the dividers
    if (missing.length > 0) return;
    const source = new GlbSource();
    await source.load('gear_bevel_12');
    const parts = CLOCK_TOWER_DECOYS.map((id) => ({ assetId: requirePart(id).visual.assetId, family: requirePart(id).family }));
    const velvet = new Vector3(0, 0, 0);
    const laid = placeTrayParts(parts, [velvet], new Vector3());
    const bevel = source.clone('gear_bevel_12')!;
    bevel.position.set(...laid[1].position);
    bevel.quaternion.set(...laid[1].quaternion);
    bevel.updateMatrixWorld(true);
    expect(new Box3().setFromObject(bevel).min.y).toBeCloseTo(TRAY_DIVIDER_RISE_M, 5); // its underside on the divider tops, not floating over them
  });
});

describe.skipIf(missing.length > 0)('Letter 6: the decoys of the Clock Tower on the real base GLB', () => {
  it('has no socket a hand can reach, so every part of the tower is the game\'s and nothing in the tray can be placed', async () => {
    const { scene, loader } = setup();
    const machine = await loader.spawnMachine('clock_tower', { parent: scene });
    expect(machine.sockets.size).toBe(0);
    expect(machine.unbound().sort()).toEqual(CLOCK_TOWER_SOCKETS.map((s) => s.id).sort());
    const plan = planBuild(CLOCK_TOWER, null, machine.sockets.size, (id) => machine.sockets.has(id));
    expect(plan.trayIds).toEqual(CLOCK_TOWER_DECOYS);
    expect(plan.handBuilt).toBe(true);
  });

  it('spawns both decoys, and a hand that puts either one down by the tower leaves it loose: no socket takes it', async () => {
    const { world, scene, loader } = setup();
    const machine = await loader.spawnMachine('clock_tower', { parent: scene });
    for (const partId of CLOCK_TOWER_DECOYS) {
      const part = await loader.spawnPart(partId, { parent: scene, position: [0.01, 0.07, 0.04], machine });
      expect(part.warnings).toEqual([]);
      part.entity.addComponent(Grabbed);
      tick(world);
      part.entity.removeComponent(Grabbed);
      tick(world, 12);
      expect(part.entity.hasComponent(SnappedTo), partId).toBe(false);
    }
    expect(machine.assembly()).toEqual({});
  });

  it('is refused by every one of the 17 sockets, each decoy, before the solver runs', () => {
    for (const socket of CLOCK_TOWER_SOCKETS) {
      for (const decoy of CLOCK_TOWER_DECOYS) {
        const outcome = solveAssembly(CLOCK_TOWER, { ...CLOCK_TOWER.intended, [socket.id]: decoy });
        expect(outcome.ok, `${decoy} in ${socket.id}`).toBe(false);
        if (!outcome.ok) expect(outcome.errors.map((e) => e.code), `${decoy} in ${socket.id}`).toEqual(['part_not_accepted']);
      }
    }
  });
});
