import { createSystem, DistanceGrabbable, MovementMode, OneHandGrabbable, RayInteractable, Types } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { ReturnsToRest } from './returns-to-rest-component.js';

/**
 * Gives each part the one grab component that suits this browser (ADR-024). IWSDK allows exactly one per entity
 * and does not rebuild the grab handle when components are swapped, so the choice is made once, before first use:
 *  - `hands: true`  (WebXR-capable browser, i.e. Quest): near grab, `OneHandGrabbable`; IWSDK turns a pinch into the grab.
 *  - `hands: false` (desktop browser without WebXR): mouse ray, `RayInteractable` + `DistanceGrabbable`,
 *    because `OneHandGrabbable` denies ray pointers and so never answers to a mouse.
 * ponytail: the "ray interaction" accessibility setting (PRODUCT_SPEC §16) will need a runtime swap; do it by reloading the level, not by swapping here.
 */
export class GrabModeSystem extends createSystem(
  { parts: { required: [ReturnsToRest] } },
  { hands: { type: Types.Boolean, default: true } },
) {
  init(): void {
    this.queries.parts.subscribe('qualify', (entity) => this.apply(entity));
    this.queries.parts.entities.forEach((entity) => this.apply(entity)); // scene entities exist before systems register
  }

  private apply(entity: Entity): void {
    if (this.config.hands.peek()) {
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
