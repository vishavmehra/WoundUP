import { Grabbed, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Scene, Texture, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLUEPRINTS, getBlueprint, MUSIC_BOX } from '../../src/content/blueprints';
import { PART_DEFINITIONS, requirePart } from '../../src/content/parts';
import { SnapPart, SnappedTo, Socket, SocketSnapSystem, XRayTarget, interactionIntents } from '../../src/interaction';
import type { InteractionIntent } from '../../src/interaction';
import { MaterialRegistry, parseLibrary } from '../../src/materials';
import { PartLoader, machineAssetIds } from '../../src/parts';
import type { ModelSource } from '../../src/parts';
import { ReturnsToRest } from '../../src/returns-to-rest-component';

// The loader against a real IWSDK World without a renderer, with a fake model source that builds scenes shaped like the GLBs
// (same node names, `wu` data and Mat_* proxies). The real files are covered by tests/parts/loader-glb.test.ts.

interface NodeFs {
  readFileSync(path: URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const libraryJson = JSON.parse(new TextDecoder().decode(fs.readFileSync(new URL('../../public/assets/materials/library.json', import.meta.url))));

const FRAME = 1 / 72;
let clock = 0;
const tick = (world: World, seconds = FRAME): void => {
  clock += seconds;
  world.update(seconds, clock);
};

function boot(): { world: World; scene: Scene } {
  const world = new World();
  for (const c of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, XRayTarget]) world.registerComponent(c);
  const scene = new Scene();
  Object.assign(world, { scene });
  return { world, scene };
}

/** Sockets that live in a part GLB rather than in the housing (the real files: canopy lamps, tower rotor). */
const NESTED: Readonly<Record<string, string>> = {
  Lamp0: 'carousel_canopy', Lamp1: 'carousel_canopy', Lamp2: 'carousel_canopy', Lamp3: 'carousel_canopy', Lamp4: 'carousel_canopy', Lamp5: 'carousel_canopy',
  Rotor: 'windmill_tower',
};

function socketEmpty(node: string, accepts: string[]): Object3D {
  const o = new Object3D();
  o.name = `SOCKET_${node}`;
  o.userData.wu = { type: 'socket', accepts };
  return o;
}

/** A scene shaped like the GLB of `assetId`: one mesh with the finish's proxy material, a grab collider, the socket empties. */
function fakeScene(assetId: string): Object3D {
  const part = PART_DEFINITIONS.find((p) => p.visual.assetId === assetId);
  const housing = BLUEPRINTS.find((b) => b.housing.assetId === assetId);
  const material = new MeshStandardMaterial();
  material.name = part?.visual.finish ?? 'Mat_Walnut';
  const body = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), material);
  body.name = assetId;
  if (part?.grab.enabled) {
    const grab = new Object3D();
    grab.name = 'COL_Grab';
    grab.scale.setScalar(part.grab.colliderRadius);
    grab.userData.wu = { type: 'collider', shape: 'sphere', purpose: 'grab' };
    body.add(grab);
  }
  const sockets = BLUEPRINTS.flatMap((b) => b.sockets).filter((s) => s.node !== undefined && (housing ? NESTED[s.node!] === undefined : NESTED[s.node!] === assetId));
  const seen = new Set<string>();
  for (const s of sockets) {
    if (seen.has(s.node!)) continue; // bracket_left of both machines would not share a node, but be safe
    seen.add(s.node!);
    // The real GLBs name an asset id or a family here, never a part id.
    body.add(socketEmpty(s.node!, [requirePart(s.acceptedPartIds![0]).visual.assetId]));
  }
  if (housing) body.add(socketEmpty('BaseHandle', ['machine_base_handle']));
  const scene = new Group();
  scene.add(body);
  return scene;
}

class FakeSource implements ModelSource {
  readonly scenes = new Map<string, Object3D>();
  readonly dropped: string[] = [];
  loads = 0;
  failNext = false;
  async load(key: string): Promise<void> {
    this.loads++;
    await Promise.resolve();
    if (this.failNext) {
      this.failNext = false;
      throw new Error(`404 ${key}`);
    }
    if (!this.scenes.has(key)) this.scenes.set(key, fakeScene(key));
  }
  shared = (key: string): Object3D | undefined => this.scenes.get(key);
  clone = (key: string): Object3D | undefined => this.scenes.get(key)?.clone(true);
  drop = (key: string): void => void (this.dropped.push(key), this.scenes.delete(key));
}

function setup(): { world: World; scene: Scene; source: FakeSource; registry: MaterialRegistry; loader: PartLoader } {
  const { world, scene } = boot();
  const source = new FakeSource();
  const registry = new MaterialRegistry(parseLibrary(libraryJson), { baseUrl: 'http://test/', loadTexture: async () => new Texture() });
  return { world, scene, source, registry, loader: new PartLoader(world, registry, source) };
}

const idOf = (assetId: string): string => PART_DEFINITIONS.find((p) => p.visual.assetId === assetId)!.id;
const intents: InteractionIntent[] = [];
interactionIntents.subscribe((i) => intents.push(i));
afterEach(() => {
  intents.length = 0;
  vi.restoreAllMocks();
});

describe('PartLoader.load', () => {
  it('fetches a GLB once however many ask, and swaps its proxies for the shared library materials on the cached scene', async () => {
    const { source, registry, loader } = setup();
    await Promise.all([loader.load('gear_spur_10_m1'), loader.load('gear_spur_10_m1')]);
    await loader.load('gear_spur_10_m1');
    expect(source.loads).toBe(1);
    const mesh = source.scenes.get('gear_spur_10_m1')!.getObjectByName('gear_spur_10_m1') as Mesh;
    expect(registry.owns(mesh.material as MeshStandardMaterial)).toBe(true);
    expect(mesh.material).toBe(registry.get('Mat_AgedBrass'));
  });

  it('can be tried again after a failed fetch', async () => {
    const { source, loader } = setup();
    source.failNext = true;
    await expect(loader.load('gear_spur_10_m1')).rejects.toThrow('404');
    await expect(loader.load('gear_spur_10_m1')).resolves.toBeUndefined();
    expect(source.loads).toBe(2);
  });

  it('refuses an asset id that has no model path', async () => {
    await expect(setup().loader.load('no_such_asset')).rejects.toThrow('no model path');
  });

  it('still shows the part, with a warning, when the library textures do not load', async () => {
    const { source, world } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = new MaterialRegistry(parseLibrary(libraryJson), {
      baseUrl: 'http://test/',
      loadTexture: async () => {
        throw new Error('404 texture');
      },
    });
    await new PartLoader(world, registry, source).load('gear_spur_10_m1');
    expect(warn).toHaveBeenCalled();
    const mesh = source.scenes.get('gear_spur_10_m1')!.getObjectByName('gear_spur_10_m1') as Mesh;
    expect(registry.owns(mesh.material as MeshStandardMaterial)).toBe(true);
  });

  it('preload never rejects', async () => {
    const { loader, source } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    source.failNext = true;
    loader.preload(['gear_spur_10_m1', 'gear_spur_12_m1']);
    await new Promise((r) => setTimeout(r, 5));
    expect(source.loads).toBe(2);
  });
});

describe('PartLoader.spawnPart', () => {
  it('makes a grabbable part: entity, SnapPart, ReturnsToRest, collider proxy, placed in its parent at its pose', async () => {
    const { world, scene, loader } = setup();
    const parent = new Group();
    parent.position.set(1, 0, 0);
    scene.add(parent);
    const part = await loader.spawnPart(idOf('gear_spur_12_m1'), { parent, position: [0.1, 0.02, 0] });
    expect(part.entity.getValue(SnapPart, 'partId')).toBe('gear_spur_12_m1_brass');
    expect(part.entity.getValue(SnapPart, 'family')).toBe('spur_gear');
    expect(part.entity.hasComponent(ReturnsToRest)).toBe(true);
    expect(part.object.parent).toBe(parent);
    expect(part.object.getWorldPosition(new Vector3()).x).toBeCloseTo(1.1, 9);
    expect(part.object.getObjectByName('COL_Grab_proxy')).toBeDefined();
    expect(part.warnings).toEqual([]);
    tick(world);
  });

  it('shares geometry and the library material between spawns of one asset', async () => {
    const { loader, registry } = setup();
    const a = await loader.spawnPart(idOf('gear_spur_16_m1'));
    const b = await loader.spawnPart(idOf('gear_spur_16_m1'));
    const meshOf = (o: Object3D): Mesh => o.getObjectByName('gear_spur_16_m1') as Mesh;
    expect(meshOf(a.object)).not.toBe(meshOf(b.object));
    expect(meshOf(a.object).geometry).toBe(meshOf(b.object).geometry);
    expect(meshOf(a.object).material).toBe(registry.get('Mat_AgedBrass'));
    expect(meshOf(b.object).material).toBe(meshOf(a.object).material);
    expect(loader.instances('gear_spur_16_m1')).toBe(2);
  });

  it('does not make a part grabbable when its GLB has no grab collider: the game places it', async () => {
    const { loader } = setup();
    const part = await loader.spawnPart(idOf('carousel_platform'));
    expect(requirePart(part.partId).grab.enabled).toBe(false);
    expect(part.entity.hasComponent(ReturnsToRest)).toBe(false);
    expect(part.entity.hasComponent(SnapPart)).toBe(true);
  });

  it('removes everything it made when disposed, twice over without harm, and frees the asset for eviction', async () => {
    const { loader, source } = setup();
    const part = await loader.spawnPart(idOf('gear_spur_10_m1'));
    const grab = part.object.getObjectByName('COL_Grab')!;
    expect(loader.evict('gear_spur_10_m1')).toBe(false); // in use
    part.dispose();
    part.dispose();
    expect(grab.getObjectByName('COL_Grab_proxy')).toBeUndefined();
    expect(part.object.parent).toBeNull();
    expect(loader.instances('gear_spur_10_m1')).toBe(0);
    const spy = vi.spyOn((source.scenes.get('gear_spur_10_m1')!.getObjectByName('gear_spur_10_m1') as Mesh).geometry, 'dispose');
    expect(loader.evict('gear_spur_10_m1')).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(source.dropped).toEqual(['gear_spur_10_m1']);
    await loader.spawnPart(idOf('gear_spur_10_m1')); // loads again after an eviction
    expect(source.loads).toBe(2);
  });

  it('rejects a part id that is not in the catalogue', async () => {
    await expect(setup().loader.spawnPart('gear_spur_99_m1_brass')).rejects.toThrow('unknown part id');
  });
});

describe('PartLoader.spawnMachine', () => {
  it('binds all 12 Music Box sockets by blueprint id, accepting catalogue ids (not the asset names of the GLB empties), and adds the X-ray zone', async () => {
    const { world, loader } = setup();
    const machine = await loader.spawnMachine('music_box');
    expect([...machine.sockets.keys()].sort()).toEqual(MUSIC_BOX.sockets.map((s) => s.id).sort());
    expect(machine.unbound()).toEqual([]);
    const accepts = (id: string): string[] => machine.sockets.get(id)!.getValue(Socket, 'accepts') as string[];
    expect(accepts('cylinder_wheel')).toEqual(MUSIC_BOX.sockets.find((s) => s.id === 'cylinder_wheel')!.acceptedPartIds);
    expect(accepts('cylinder_wheel')).toContain('gear_spur_12_m1_brass');
    expect(accepts('arbor')).toEqual(['shaft_short_brass']);
    expect(accepts('main_spring')).toEqual(['spring_standard_brass', 'spring_worn_brass']);
    expect(machine.entity.getValue(XRayTarget, 'radius')).toBeCloseTo(0.065, 6);
    expect(machine.entity.getValue(XRayTarget, 'top')).toBeCloseTo(0.1, 6);
    expect(machine.object.getObjectByName('COL_Case')).toBeUndefined(); // the fake housing has no case collider: nothing to proxy
    tick(world);
  });

  it('moves the sockets to the blueprint poses, so the +1.0 mm gear spacing reaches the scene (housing frame, whatever the scale above it)', async () => {
    const { scene, loader } = setup();
    const town = new Group();
    town.scale.setScalar(0.75);
    town.position.set(2, 1, 0);
    scene.add(town);
    const machine = await loader.spawnMachine('music_box', { parent: town });
    const world = new Vector3();
    for (const s of MUSIC_BOX.sockets) {
      const node = machine.sockets.get(s.id)!.getValue(Socket, 'node') as Object3D;
      node.getWorldPosition(world);
      const expected = new Vector3(...s.position!).multiplyScalar(0.75).add(town.position);
      expect(world.distanceTo(expected), s.id).toBeLessThan(1e-9);
    }
  });

  it('binds sockets that live in a part GLB when the part is built into the machine, and unbinds them when the part goes', async () => {
    const { loader } = setup();
    const machine = await loader.spawnMachine('carousel');
    expect(machine.sockets.has('lamp_0')).toBe(false);
    expect(machine.unbound()).toContain('lamp_0');
    const canopy = await loader.spawnPart(idOf('carousel_canopy'), { machine });
    for (let i = 0; i < 6; i++) {
      expect(machine.sockets.get(`lamp_${i}`)?.getValue(Socket, 'accepts')).toEqual(['carousel_lamp_polished_brass']);
    }
    canopy.dispose();
    expect(machine.sockets.has('lamp_0')).toBe(false);
  });

  it('reports the blueprint sockets no GLB carries yet instead of hiding them', async () => {
    const machine = await setup().loader.spawnMachine('windmill');
    expect(machine.unbound()).toContain('main_shaft');
    expect(machine.sockets.has('millstone')).toBe(true);
    expect(machine.sockets.has('tower')).toBe(true);
  });

  it('rejects an unknown blueprint', async () => {
    await expect(setup().loader.spawnMachine('tram')).rejects.toThrow('unknown blueprint');
  });

  it('reads the assembly from what is seated, and hands it to the solver as a socket-to-part map', async () => {
    const { world, scene, loader } = setup();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const machine = await loader.spawnMachine('music_box', { parent: scene });
    expect(machine.assembly()).toEqual({});

    const socketPosition = (id: string): Vector3 => (machine.sockets.get(id)!.getValue(Socket, 'node') as Object3D).getWorldPosition(new Vector3());
    const grabAndRelease = (part: Entity): void => {
      part.addComponent(Grabbed);
      tick(world);
      part.removeComponent(Grabbed);
    };

    const bracket = await loader.spawnPart(idOf('bracket_support'), { parent: scene, position: socketPosition('bracket_left').toArray() });
    grabAndRelease(bracket.entity);
    expect(intents).toMatchObject([{ type: 'snapped', socketName: 'BracketL', partId: 'bracket_support_brass' }]);
    expect(machine.assembly()).toEqual({ bracket_left: 'bracket_support_brass' });

    // A gear next to the arbor socket is the wrong family for it: nothing is seated.
    const gear = await loader.spawnPart(idOf('gear_spur_20_m1'), { parent: scene, position: socketPosition('arbor').toArray() });
    grabAndRelease(gear.entity);
    expect(intents[1]).toMatchObject({ type: 'rejected', reason: 'family' });
    expect(machine.assembly()).toEqual({ bracket_left: 'bracket_support_brass' });

    // The right gear in a gear socket seats; a wrong-size gear seats as well (it is the solver that says it runs wrong).
    const wheel = await loader.spawnPart(idOf('gear_spur_12_m1'), { parent: scene, position: socketPosition('cylinder_wheel').toArray() });
    grabAndRelease(wheel.entity);
    expect(machine.assembly()).toEqual({ bracket_left: 'bracket_support_brass', cylinder_wheel: 'gear_spur_12_m1_brass' });
  });

  it('removes the housing, its sockets and the parts built into it when disposed', async () => {
    const { loader } = setup();
    const machine = await loader.spawnMachine('carousel');
    const canopy = await loader.spawnPart(idOf('carousel_canopy'), { machine });
    const sockets = [...machine.sockets.values()];
    machine.dispose();
    machine.dispose();
    expect(machine.sockets.size).toBe(0);
    expect(canopy.object.parent).toBeNull();
    expect(machine.object.parent).toBeNull();
    expect(sockets.every((s) => !s.active)).toBe(true);
    expect(loader.instances('carousel_base')).toBe(0);
    expect(loader.instances('carousel_canopy')).toBe(0);
  });
});

describe('machineAssetIds', () => {
  it('lists the housing first, then each GLB the build can use once, decoys and repair parts included', () => {
    const music = machineAssetIds(MUSIC_BOX, ['spring_worn_brass']);
    expect(music[0]).toBe('music_box_case');
    expect(new Set(music).size).toBe(music.length);
    expect(music).toContain('spring_worn');
    const carousel = machineAssetIds(getBlueprint('carousel')!);
    expect(carousel).toEqual(expect.arrayContaining(['carousel_base', 'gear_spur_12_m1', 'gear_spur_20_m1', 'carousel_lamp', 'winding_key']));
  });
});
