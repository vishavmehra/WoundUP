import { createSystem, DistanceGrabbable, MovementMode, OneHandGrabbable, RayInteractable, Types } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { isGazeModeOn, onGazeModeChange } from './interaction/gaze-state.js';
import { ReturnsToRest } from './returns-to-rest-component.js';

/**
 * Gives each part the one grab component that suits this browser (ADR-024). IWSDK allows exactly one per entity
 * and does not rebuild the grab handle when components are swapped, so the choice is made once, before first use:
 *  - `hands: true`  (WebXR-capable browser, i.e. Quest): near grab, `OneHandGrabbable`; IWSDK turns a pinch into the grab.
 *  - `hands: false` (desktop browser without WebXR): mouse ray, `RayInteractable` + `DistanceGrabbable`,
 *    because `OneHandGrabbable` denies ray pointers and so never answers to a mouse.
 *  - gaze mode (ADR-036): the same ray components, because the gaze pointer is a ray pointer and `OneHandGrabbable` denies those.
 *    Turning the mode on or off swaps the components of every part that has one, on the spot (`refresh`).
 */
export class GrabModeSystem extends createSystem(
  { parts: { required: [ReturnsToRest] } },
  { hands: { type: Types.Boolean, default: true } },
) {
  init(): void {
    this.queries.parts.subscribe('qualify', (entity) => this.apply(entity));
    this.queries.parts.entities.forEach((entity) => this.apply(entity)); // scene entities exist before systems register
    this.cleanupFuncs.push(onGazeModeChange(() => this.refresh()));
  }

  /**
   * Swaps the grab component of every part that has one. A part without one is left alone: a machine that stands on its plot
   * had its component taken away by the game on purpose. IWSDK builds one grab handle per entity and never rebuilds it, so the
   * old handle is cancelled, unbound from the object and removed first. `Handle` is not exported by IWSDK: it is found by its id.
   */
  private refresh(): void {
    this.queries.parts.entities.forEach((entity) => {
      const grabbable = [OneHandGrabbable, DistanceGrabbable].some((c) => entity.hasComponent(c));
      if (!grabbable) return;
      const handle = entity.getComponents().find((c) => c.id === 'Handle');
      const store = handle ? (entity.getValue(handle, 'instance') as { bind(target: unknown): () => void } | null) : null;
      if (handle && entity.object3D) {
        store?.bind(entity.object3D)(); // binding again returns the unbind for the listeners GrabSystem added; it cancels a grab in progress
        entity.removeComponent(handle);
      }
      for (const c of [OneHandGrabbable, DistanceGrabbable, RayInteractable]) entity.removeComponent(c);
      this.apply(entity);
    });
  }

  private apply(entity: Entity): void {
    if (this.config.hands.peek() && !isGazeModeOn()) {
      if (!entity.hasComponent(OneHandGrabbable)) entity.addComponent(OneHandGrabbable, {});
      return;
    }
    if (!entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable, {});
    // rotate: false keeps the part flat on the table while the mouse drags it.
    if (!entity.hasComponent(DistanceGrabbable)) {
      entity.addComponent(DistanceGrabbable, { movementMode: MovementMode.MoveFromTarget, rotate: false });
    }
  }
}
