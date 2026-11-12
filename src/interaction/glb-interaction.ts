import type { Entity, Object3D, World } from '@iwsdk/core';
import { Socket } from './components.js';
import { attachColliderProxies, detachColliderProxies, readInteractionNodes } from './glb-reader.js';

export interface GlbInteraction {
  /** One entity per `SOCKET_` empty, carrying a `Socket` component. */
  sockets: Entity[];
  /** Problems found while reading, one string each. Log them; the offending empties were skipped. */
  warnings: string[];
  /** Removes the collider proxies and destroys the socket entities. */
  dispose(): void;
}

/**
 * Turns the `SOCKET_` and `COL_` empties of a loaded GLB into interaction data (BLENDER_PRODUCTION_GUIDELINES §9):
 * an invisible collider proxy under every `COL_` node, and a `Socket` entity for every `SOCKET_` node.
 * Call it once per loaded model instance, after the model is in the scene and scaled to its final size, with the model's
 * root object (a part, a housing or a whole machine). Socket entities are plain data entities: they do not move the empties.
 */
export function setupGlbInteraction(world: World, root: Object3D): GlbInteraction {
  const nodes = readInteractionNodes(root);
  const proxies = attachColliderProxies(nodes.colliders);
  const sockets = nodes.sockets.map((def) => {
    const entity = world.createEntity();
    entity.addComponent(Socket, { name: def.id, accepts: [...def.accepts], node: def.node, axisOnly: def.axisOnly });
    return entity;
  });
  return {
    sockets,
    warnings: nodes.warnings,
    dispose() {
      detachColliderProxies(proxies);
      for (const entity of sockets) entity.destroy();
    },
  };
}
