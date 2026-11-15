// Assembles a finished machine from its housing GLB and the GLB of every part of its intended build, each seated at the pose its blueprint
// socket gives (ADR-020, metres in the machine frame). The Well and the Belfry use it (src/machines/well, src/machines/belfry): their
// blueprints carry a pose for every socket, so no `SOCKET_` empty has to be looked up, and the blueprint pose is the one the bench build
// uses too (`applyBlueprintSockets`). Three.js only (no ECS), so Vitest runs it on real files or on stand-ins.
import type { Object3D } from 'three';
import type { MachineBlueprint } from '../content/blueprints';
import { modelPath, requirePart } from '../content/parts';
import type { MachineId } from '../game/content';
import { applyLibraryMaterials } from '../materials';
import type { MaterialRegistry } from '../materials';
import { createRig } from '../town/motion';
import type { MachineRig } from '../town/motion';
import type { ModelSource } from '../town/scene';

/** The brass base handle every machine base carries (TOCKTON_DIMENSIONS §5.2). */
const HANDLE_PATH = 'shared/interaction/machine_base_handle.glb';

export interface Assembled {
  readonly rig: MachineRig;
  /** The housing, which is also the rig's root. */
  readonly base: Object3D;
  /** The part GLB seated at each blueprint socket, by socket id. */
  readonly parts: ReadonlyMap<string, Object3D>;
}

async function load(source: ModelSource, registry: MaterialRegistry, path: string): Promise<Object3D> {
  const model = await source(path);
  applyLibraryMaterials(model.scene, registry);
  return model.scene;
}

/** Every `assets/models/` path the finished machine loads: for a warm-up while the player reads the letter. */
export function machineModelPaths(blueprint: MachineBlueprint): string[] {
  const assets = [blueprint.housing.assetId, ...Object.values(blueprint.intended).map((id) => requirePart(id).visual.assetId)];
  const paths = assets.map((id) => {
    const path = modelPath(id);
    if (path === undefined) throw new Error(`asset "${id}" has no model path`);
    return path;
  });
  return [...new Set([...paths, HANDLE_PATH])];
}

/** Loads the machine of `blueprint` and seats every part of its intended build. Rejects when a file cannot be loaded or a socket has no pose. */
export async function assembleMachine(blueprint: MachineBlueprint, machineId: MachineId, source: ModelSource, registry: MaterialRegistry): Promise<Assembled> {
  const housingPath = modelPath(blueprint.housing.assetId);
  if (housingPath === undefined) throw new Error(`${blueprint.id}: housing "${blueprint.housing.assetId}" has no model path`);
  const [base, handle, ...loaded] = await Promise.all([
    load(source, registry, housingPath),
    load(source, registry, HANDLE_PATH),
    ...blueprint.sockets.map((s) => {
      const partPath = modelPath(requirePart(blueprint.intended[s.id]).visual.assetId);
      if (partPath === undefined) throw new Error(`${blueprint.id}.${s.id}: no model path`);
      return load(source, registry, partPath);
    }),
  ]);

  const parts = new Map<string, Object3D>();
  blueprint.sockets.forEach((s, i) => {
    const part = loaded[i];
    if (s.position === undefined) throw new Error(`${blueprint.id}.${s.id} has no pose`);
    part.name = s.node === undefined ? s.id : `Part_${s.node}`;
    part.position.set(...s.position);
    if (s.rotation !== undefined) part.quaternion.set(...s.rotation);
    base.add(part);
    parts.set(s.id, part);
  });

  const socket = base.getObjectByName('SOCKET_BaseHandle');
  if (socket) {
    handle.position.copy(socket.position);
    handle.quaternion.copy(socket.quaternion);
    (socket.parent ?? base).add(handle);
  } else {
    console.warn(`[wound-up] ${blueprint.id}'s housing has no SOCKET_BaseHandle; the machine has no handle.`);
  }
  return { rig: createRig(machineId, base), base, parts };
}
