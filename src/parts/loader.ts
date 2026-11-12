// Runtime part and machine loader (TECHNICAL_ARCHITECTURE: content layer to scene). Loads GLBs on demand, never at startup:
// the part and machine models are not critical, only the stand is. One cached scene per asset id; every spawn is a clone that
// shares its geometry and the shared library materials (ADR-030, ADR-032), so a second gear costs no GPU memory.
import { applyLibraryMaterials } from '../materials';
import type { MaterialRegistry } from '../materials';
import { Socket, SnapPart, XRayTarget, setupGlbInteraction } from '../interaction';
import type { GlbInteraction } from '../interaction';
import { ReturnsToRest } from '../returns-to-rest-component';
import { getBlueprint, socketIdOfNode } from '../content/blueprints';
import type { Assembly, MachineBlueprint } from '../content/blueprints';
import { modelUrl, requirePart } from '../content/parts';
import { iwsdkModelSource } from './model-source';
import type { ModelSource } from './model-source';
import { applyBlueprintSockets } from './sockets';
import type { Entity, Mesh, Object3D, World } from '@iwsdk/core';

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

export interface SpawnOptions {
  /** Where the model goes in the scene (a tray, the workbench, the town node). Default: IWSDK's level root. Added before the colliders are sized. */
  parent?: Object3D;
  /** Pose in the parent's space, metres. Set before the part is made grabbable, because that is the pose it eases back to when let go. */
  position?: Vec3;
  quaternion?: Quat;
}

export interface PartSpawnOptions extends SpawnOptions {
  /**
   * The machine this part is built into. Required for a part that carries sockets of its own (the Carousel canopy's lamps, the
   * Windmill tower's rotor): its sockets are bound to the machine's blueprint and join `machine.sockets`.
   */
  machine?: MachineInstance;
}

export interface PartInstance {
  readonly partId: string;
  readonly entity: Entity;
  readonly object: Object3D;
  /** Problems the GLB reader found (malformed `SOCKET_` or `COL_` empties). Log them. */
  readonly warnings: readonly string[];
  /** Destroys the entity, its colliders and its own sockets. Geometry and materials are shared and stay. Safe to call twice. */
  dispose(): void;
}

/**
 * A machine housing in the scene, with its sockets. Parts are built into it by the player (SocketSnapSystem); the game layer
 * reads what stands in it with `assembly()` and hands that to `solveAssembly`.
 */
export class MachineInstance {
  /** Blueprint socket id to the socket entity. Only sockets whose GLB empty exists appear (see `unbound`). */
  readonly sockets = new Map<string, Entity>();
  private readonly parts = new Map<PartInstance, readonly string[]>();
  private disposed = false;

  constructor(
    readonly blueprint: MachineBlueprint,
    readonly entity: Entity,
    readonly object: Object3D,
    private readonly housing: GlbInteraction,
    private readonly onDispose: () => void,
  ) {}

  /** What is seated in each socket right now: socket id to part id. An empty socket is absent. Read on a `snapped` or `unsnapped` intent, never per frame. */
  assembly(): Assembly {
    const out: Record<string, string> = {};
    this.sockets.forEach((socket, id) => {
      const occupant = socket.getValue(Socket, 'occupant') as Entity | null;
      if (occupant) out[id] = occupant.getValue(SnapPart, 'partId') as string;
    });
    return out;
  }

  /** Blueprint sockets that no GLB empty carries yet, so the player cannot place into them by hand (asset gap, listed in the hand-over). */
  unbound(): string[] {
    return this.blueprint.sockets.filter((s) => !this.sockets.has(s.id)).map((s) => s.id);
  }

  /** @internal Called by the loader when a part with sockets is built into this machine. */
  adopt(part: PartInstance, bound: ReadonlyMap<string, Entity>): void {
    this.parts.set(part, [...bound.keys()]);
    bound.forEach((socket, id) => this.sockets.set(id, socket));
  }

  /** @internal Called by a part that is disposed: its sockets leave the machine with it. */
  forget(part: PartInstance): void {
    for (const id of this.parts.get(part) ?? []) this.sockets.delete(id);
    this.parts.delete(part);
  }

  /**
   * Removes the housing, its sockets and every part adopted by it. Parts the player seated in it are NOT removed unless they were
   * spawned with this machine: dispose those yourself. Destroying a seated part makes SocketSnapSystem emit `unsnapped` for it.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of [...this.parts.keys()]) part.dispose();
    this.sockets.clear();
    this.housing.dispose();
    this.entity.destroy();
    this.onDispose();
  }
}

export class PartLoader {
  private readonly loading = new Map<string, Promise<void>>();
  private readonly live = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly materials: MaterialRegistry,
    private readonly source: ModelSource = iwsdkModelSource,
  ) {}

  /**
   * Loads one GLB (once, however many callers ask) and swaps its Mat_* proxies for the shared library materials on the cached
   * scene, so every clone inherits them. Textures the scene needs are fetched first so nothing pops; if one fails the part still
   * appears with the library constants and a warning. Rejects when the file cannot be loaded; a later call tries again.
   */
  load(assetId: string): Promise<void> {
    let pending = this.loading.get(assetId);
    if (!pending) {
      pending = this.fetch(assetId);
      this.loading.set(assetId, pending);
      pending.catch(() => this.loading.delete(assetId));
    }
    return pending;
  }

  /** Starts loading several assets in the background, for example every part of a letter while the player reads it. Never rejects. */
  preload(assetIds: Iterable<string>): void {
    for (const id of assetIds) this.load(id).catch((e: unknown) => console.warn(`[wound-up] could not preload "${id}":`, e));
  }

  /** Spawns one part as an entity: a grabbable one (ReturnsToRest, SnapPart) when its GLB has a grab collider, otherwise placed by the game. */
  async spawnPart(partId: string, options: PartSpawnOptions = {}): Promise<PartInstance> {
    const def = requirePart(partId);
    const assetId = def.visual.assetId;
    const root = await this.instantiate(assetId);
    root.name = partId;
    if (def.visual.scale !== 1) root.scale.setScalar(def.visual.scale);
    const machine = options.machine;
    if (machine) applyBlueprintSockets(machine.blueprint, root, false); // blueprint poses are in the housing's frame, not a part's
    const entity = this.place(root, options);
    const interaction = setupGlbInteraction(this.world, root);

    let disposed = false;
    const part: PartInstance = {
      partId,
      entity,
      object: root,
      warnings: interaction.warnings,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        machine?.forget(part);
        interaction.dispose();
        entity.destroy();
        this.release(assetId);
      },
    };
    if (machine && interaction.sockets.length > 0) machine.adopt(part, socketsById(machine.blueprint, interaction.sockets));

    // Order matters: ReturnsToRest records the pose it sees when it qualifies, so the pose is final by now.
    entity.addComponent(SnapPart, { partId, family: def.family });
    if (def.grab.enabled) entity.addComponent(ReturnsToRest, {});
    return part;
  }

  /**
   * Spawns a machine housing: its static GLB, the sockets and colliders of that GLB (bound to the blueprint), and the X-ray zone.
   * Spawn it where it will stand and at its final scale (under the town node), because the grab colliders are sized against the
   * world scale; call `refreshColliderFloor(machine.object)` if the scale changes afterwards.
   */
  async spawnMachine(blueprintId: string, options: SpawnOptions = {}): Promise<MachineInstance> {
    const blueprint = getBlueprint(blueprintId);
    if (!blueprint) throw new Error(`unknown blueprint "${blueprintId}"`);
    const assetId = blueprint.housing.assetId;
    const root = await this.instantiate(assetId);
    root.name = blueprint.id;
    applyBlueprintSockets(blueprint, root);
    const entity = this.place(root, options);
    const interaction = setupGlbInteraction(this.world, root);
    const { radius, top } = blueprint.housing.xray;
    entity.addComponent(XRayTarget, { radius, top });

    const machine = new MachineInstance(blueprint, entity, root, interaction, () => this.release(assetId));
    socketsById(blueprint, interaction.sockets).forEach((socket, id) => machine.sockets.set(id, socket));
    return machine;
  }

  /**
   * Drops an asset's cached file and disposes its geometry, but only when no spawned instance uses it any more. The library
   * materials are never disposed (they are shared by everything). Returns whether it was evicted. Call it when a machine
   * is done for good, for example after it was placed in the town and its parts are not needed on the workbench.
   */
  evict(assetId: string): boolean {
    if ((this.live.get(assetId) ?? 0) > 0) return false;
    const scene = this.source.shared(assetId);
    scene?.traverse((node) => (node as Mesh).geometry?.dispose());
    this.source.drop(assetId);
    this.loading.delete(assetId);
    return true;
  }

  /** How many spawned instances currently use this asset. */
  instances(assetId: string): number {
    return this.live.get(assetId) ?? 0;
  }

  private async fetch(assetId: string): Promise<void> {
    const url = modelUrl(assetId);
    if (url === undefined) throw new Error(`no model path for asset "${assetId}"`);
    await this.source.load(assetId, url);
    const scene = this.source.shared(assetId);
    if (!scene) throw new Error(`asset "${assetId}" loaded but is not in the cache`);
    const names = new Set<string>();
    scene.traverse((node) => {
      const material = (node as Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) if (this.materials.has(m.name)) names.add(m.name);
    });
    try {
      await this.materials.loadTextures(names);
    } catch (e) {
      console.warn(`[wound-up] library textures for "${assetId}" did not load, showing plain materials:`, e);
    }
    const report = applyLibraryMaterials(scene, this.materials);
    if (report.unknown.length > 0) console.warn(`[wound-up] "${assetId}" uses materials that are not in the library:`, report.unknown);
  }

  private async instantiate(assetId: string): Promise<Object3D> {
    await this.load(assetId);
    const root = this.source.clone(assetId);
    if (!root) throw new Error(`asset "${assetId}" is not in the cache`);
    this.live.set(assetId, (this.live.get(assetId) ?? 0) + 1);
    return root;
  }

  private release(assetId: string): void {
    this.live.set(assetId, Math.max(0, (this.live.get(assetId) ?? 0) - 1));
  }

  /** Gives the model an entity and puts it in the scene at its pose. The parent is attached first: collider sizes are read in world scale. */
  private place(root: Object3D, options: SpawnOptions): Entity {
    if (options.position) root.position.set(...options.position);
    if (options.quaternion) root.quaternion.set(...options.quaternion);
    const entity = this.world.createTransformEntity(root);
    options.parent?.add(root);
    return entity;
  }
}

/** Socket entities of a model by blueprint socket id. An entity whose empty no blueprint socket names (the base handle) is left out. */
function socketsById(blueprint: MachineBlueprint, entities: readonly Entity[]): Map<string, Entity> {
  const out = new Map<string, Entity>();
  for (const entity of entities) {
    const id = socketIdOfNode(blueprint, entity.getValue(Socket, 'name') as string);
    if (id !== undefined) out.set(id, entity);
  }
  return out;
}
