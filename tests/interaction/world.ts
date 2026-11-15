import { DistanceGrabbable, Grabbed, OneHandGrabbable, RayInteractable, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from 'three';
import { ReturnsToRest } from '../../src/returns-to-rest-component.js';
import { SnapPart, SnappedTo, Socket, WindKey, XRayTarget } from '../../src/interaction/components.js';
import { setupGlbInteraction } from '../../src/interaction/glb-interaction.js';
import { interactionIntents, settleIntents } from '../../src/interaction/intents.js';
import type { InteractionIntent } from '../../src/interaction/intents.js';

/** Headless IWSDK World helpers for the intricate-assembly tests (see systems.test.ts: components are module singletons, one World per test). */

export const FRAME = 1 / 72;
let clock = 0;
export const tick = (world: World, seconds = FRAME): void => {
  clock += seconds;
  world.update(seconds, clock);
};
export const run = (world: World, frames: number): void => {
  for (let i = 0; i < frames; i++) tick(world);
};

export function boot(): { world: World; scene: Scene } {
  const world = new World();
  for (const component of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, WindKey, XRayTarget, OneHandGrabbable, DistanceGrabbable, RayInteractable]) {
    world.registerComponent(component);
  }
  const scene = new Scene();
  Object.assign(world, { scene });
  return { world, scene };
}

/** Records every intent of both buses until `stop()`. */
export function record(): { intents: InteractionIntent[]; settled: InteractionIntent[]; stop: () => void } {
  const intents: InteractionIntent[] = [];
  const settled: InteractionIntent[] = [];
  const a = interactionIntents.subscribe((i) => intents.push(i));
  const b = settleIntents.subscribe((i) => settled.push(i));
  return {
    intents,
    settled,
    stop: () => {
      a();
      b();
    },
  };
}

/** A root with `SOCKET_<name>` empties at the given positions, each accepting `accepts`, in `scene`, and the world's Socket entities for them. */
export function housing(
  world: World,
  scene: Scene | Object3D,
  sockets: ReadonlyArray<{ name: string; x: number; y?: number; z?: number; accepts: string[] }>,
  at: [number, number, number] = [0, 0, 0],
): { root: Object3D; nodes: Record<string, Object3D>; entities: Record<string, Entity> } {
  const root = new Object3D();
  root.position.set(...at);
  const nodes: Record<string, Object3D> = {};
  for (const s of sockets) {
    const node = new Object3D();
    node.name = `SOCKET_${s.name}`;
    node.position.set(s.x, s.y ?? 0, s.z ?? 0);
    node.userData.wu = { type: 'socket', accepts: s.accepts };
    root.add(node);
    nodes[s.name] = node;
  }
  scene.add(root);
  root.updateMatrixWorld(true);
  const glb = setupGlbInteraction(world, root);
  const entities: Record<string, Entity> = {};
  for (const entity of glb.sockets) entities[entity.getValue(Socket, 'name') as string] = entity;
  return { root, nodes, entities };
}

export function part(world: World, scene: Scene | Object3D, id: string, family: string, x: number, y = 0): Entity {
  const mesh = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshBasicMaterial());
  mesh.position.set(x, y, 0);
  scene.add(mesh);
  const entity = world.createEntity();
  entity.object3D = mesh;
  entity.addComponent(SnapPart, { partId: id, family });
  return entity;
}

export const grab = (e: Entity): void => void e.addComponent(Grabbed);
export const letGo = (e: Entity): void => void e.removeComponent(Grabbed);
