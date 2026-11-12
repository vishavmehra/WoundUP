import { createSystem } from '@iwsdk/core';
import { interactionIntents, setupGlbInteraction } from '../interaction';
import type { GlbInteraction } from '../interaction';
import type { TownRuntime } from './runtime';

/** A frame longer than this (a hidden tab, a hitch) is cut, so the melody and the ripple never leap. */
const MAX_FRAME_S = 0.1;

/**
 * The town's one ECS system, thin on purpose: it binds a `TownRuntime`, gives the town ground's `SOCKET_Plot...` empties to the
 * interaction layer (so SocketSnapSystem seats a machine on its own plot, INTERACTION_SPEC §12), routes the `snapped` and
 * `unsnapped` intents to the runtime, and steps it every frame. IWSDK has no animation system, so Otto's mixer runs here too.
 *
 * Register it with priority 11 (after the interaction systems at 10, which write the seated machine's pose). `installTown`
 * in index.ts does all of this.
 */
export class TownSystem extends createSystem({}) {
  private runtime: TownRuntime | null = null;
  private plots: GlbInteraction | null = null;

  bind(runtime: TownRuntime): void {
    if (this.runtime) throw new Error('TownSystem is already bound to a town.');
    this.runtime = runtime;
    this.plots = setupGlbInteraction(this.world, runtime.town.ground);
    for (const warning of this.plots.warnings) console.warn(`[wound-up] town ground: ${warning}`);
    this.cleanupFuncs.push(
      interactionIntents.subscribe((intent) => runtime.handleIntent(intent)),
      () => this.plots?.dispose(),
    );
  }

  update(delta: number, time: number): void {
    this.runtime?.update(delta < MAX_FRAME_S ? delta : MAX_FRAME_S, time);
  }
}
