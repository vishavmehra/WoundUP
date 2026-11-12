import { Grabbed, World } from '@iwsdk/core';
import { Group, Mesh, Object3D, Scene, Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { BLUEPRINTS } from '../../src/content/blueprints';
import { MODEL_PATHS, PART_DEFINITIONS } from '../../src/content/parts';
import { SnapPart, SnappedTo, Socket, XRayTarget } from '../../src/interaction';
import { MaterialRegistry, parseLibrary } from '../../src/materials';
import { PartLoader } from '../../src/parts';
import type { ModelSource } from '../../src/parts';
import { ReturnsToRest } from '../../src/returns-to-rest-component';

// The loader on the real GLB files, parsed with three's GLTFLoader (no textures in them, so Node can). Like glb-contract.test.ts it
// runs only when every file named in MODEL_PATHS is present; point it at another checkout with WU_MODELS_DIR=<absolute path of public/assets/models>.

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
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    this.gltfs.set(key, await new GLTFLoader().parseAsync(buffer, ''));
  }
  shared = (key: string): Object3D | undefined => this.gltfs.get(key)?.scene;
  clone = (key: string): Object3D | undefined => this.gltfs.get(key)?.scene.clone(true);
  drop = (key: string): void => void this.gltfs.delete(key);
}

function setup() {
  const world = new World();
  for (const c of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, XRayTarget]) world.registerComponent(c);
  const scene = new Scene();
  Object.assign(world, { scene });
  const registry = new MaterialRegistry(parseLibrary(libraryJson), { baseUrl: 'http://test/', loadTexture: async () => new Texture() });
  return { scene, registry, loader: new PartLoader(world, registry, new GlbSource()) };
}

describe.skipIf(missing.length > 0)('PartLoader on the real GLBs', () => {
  it('spawns every catalogue part with the library material, a grab collider exactly when the definition says so, and no reader warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { scene, registry, loader } = setup();
    for (const def of PART_DEFINITIONS) {
      const part = await loader.spawnPart(def.id, { parent: scene });
      expect(part.warnings, def.id).toEqual([]);
      expect(part.object.getObjectByName('COL_Grab_proxy') !== undefined, def.id).toBe(def.grab.enabled);
      expect(part.entity.hasComponent(ReturnsToRest), def.id).toBe(def.grab.enabled);
      part.object.traverse((node) => {
        const mesh = node as Mesh;
        if (mesh.isMesh && !node.name.endsWith('_proxy')) expect(registry.owns(mesh.material as never), `${def.id}/${node.name}`).toBe(true);
      });
    }
    expect(warn).not.toHaveBeenCalled(); // no material outside the library, no texture failure
    warn.mockRestore();
  });

  it('binds every blueprint socket that names a GLB empty, in the housing or in the part that carries it', async () => {
    const { scene, loader } = setup();
    for (const bp of BLUEPRINTS) {
      const machine = await loader.spawnMachine(bp.id, { parent: scene });
      // Sockets nested in parts: spawn the parts of the intended build that carry SOCKET_ empties (canopy, tower).
      for (const partId of new Set(Object.values(bp.intended))) {
        const asset = PART_DEFINITIONS.find((p) => p.id === partId)!.visual.assetId;
        if (asset === 'carousel_canopy' || asset === 'windmill_tower') await loader.spawnPart(partId, { parent: scene, machine });
      }
      const withNode = bp.sockets.filter((s) => s.node !== undefined).map((s) => s.id);
      expect(withNode.filter((id) => !machine.sockets.has(id)), `${bp.id}: sockets whose empty was not found`).toEqual([]);
      for (const [id, entity] of machine.sockets) {
        expect(entity.getValue(Socket, 'accepts'), `${bp.id}/${id}`).toEqual(bp.sockets.find((s) => s.id === id)!.acceptedPartIds);
      }
      if (bp.id === 'music_box') expect(machine.unbound()).toEqual([]);
      machine.dispose();
    }
  });

  it('puts the Music Box sockets at the blueprint poses, +1.0 mm gear spacing included', async () => {
    const { scene, loader } = setup();
    const machine = await loader.spawnMachine('music_box', { parent: scene });
    const group = new Group();
    for (const s of BLUEPRINTS[0].sockets) {
      const node = machine.sockets.get(s.id)!.getValue(Socket, 'node') as Object3D;
      expect(node.getWorldPosition(group.position).toArray(), s.id).toEqual(s.position!.map((v) => expect.closeTo(v, 9)));
    }
  });
});
