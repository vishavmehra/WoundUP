import { createSystem } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { FlowUi, type FlowUiOptions } from './flow-ui.js';

export { FlowUi } from './flow-ui.js';
export type { BlueprintView, FlowEvent, FlowUiOptions } from './flow-ui.js';
export { browserShareEnv, createGiftLink, resolveGift } from './gift-flow.js';
export type { GiftHost, GiftModel, LinkOutcome, ShareEnv } from './gift-flow.js';
export { mountGiftViewer } from './gift-viewer.js';
export type { GiftViewer, GiftViewerOptions } from './gift-viewer.js';
export type { ResultHints, ResultView } from './copy.js';
export type { View } from './view.js';

const running = new WeakMap<World, FlowUi>();

/** Steps the flow UI's animations every frame. Registered by `installFlowUi`; it holds no state of its own. */
export class FlowUiSystem extends createSystem({}) {
  update(dt: number): void {
    running.get(this.world)?.update(dt);
  }
}

/**
 * Builds the flow UI, loads its props and registers the system that animates it. Call it once, after the stage exists
 * (the scene node `stage`, see `FlowUiOptions.stage`). Returns the UI the integrator drives (`onModeChange`, `setWind`,
 * `showResult`, `showBlueprint`, `revealParts`; see `FlowUi`).
 */
export async function installFlowUi(world: World, options: FlowUiOptions): Promise<FlowUi> {
  const ui = new FlowUi(world, options);
  await ui.init();
  running.set(world, ui);
  world.registerSystem(FlowUiSystem, { priority: 20 });
  return ui;
}
