/**
 * Tockton in the scene: the frozen town with the Bakery, the theatre facade, Mira and Otto, the awake look and the wake ripple
 * done once in the shared library materials, the finished machines' motion, and the town's audio hooks.
 *
 * Wiring (src/index.ts), after the material registry, the stage and `installInteraction`:
 *
 *   const audio = new AudioEngine(); audio.installGestureUnlock(); bindInteractionAudio(audio);
 *   const town = await installTown(world, { registry: materials, audio, events: { placed, woke } });
 *   town.restore(save.machines.filter((m) => m.placed).map((m) => m.plotId));   // a saved game: awake, no ripple
 *   const rig = await buildMachine('windmill', loadModel, materials);            // a saved machine reappears
 *   if (rig) town.placeRig(rig);
 */
import type { World } from '@iwsdk/core';
import type { TownAudio } from '../audio/engine';
import type { MaterialRegistry } from '../materials';
import { STAGE_NODE_ID, StageSystem } from '../stage';
import { TownRuntime } from './runtime';
import type { TownEvents } from './runtime';
import { loadModel, loadTown } from './scene';
import type { ModelSource } from './scene';
import { TownSystem } from './system';
import { createWakeUniforms, installWakeShading } from './wake-shader';

export { makeCarriable } from './carry';
export { MACHINE_SNAP_PART, PLOTS, WAKE_GROUP, WAKE_SOURCES } from './layout';
export { buildMachine } from './machines';
export { createRig, createRotor } from './motion';
export type { MachineRig, Rotor } from './motion';
export { TownRuntime } from './runtime';
export type { TownEvents } from './runtime';
export { buildTown, loadModel, loadTown, plotSocket } from './scene';
export type { ModelSource, Town } from './scene';
export { TownSystem } from './system';
export { WAKE_RIPPLE_S, WakeField } from './wake';

export interface InstallTownOptions {
  /** The shared library materials (ADR-032): patched once for the frozen and awake looks, then used for every town model. */
  registry: MaterialRegistry;
  audio?: TownAudio | null;
  events?: TownEvents;
  /** Defaults to `loadModel` (IWSDK's AssetManager). Tests pass their own. */
  source?: ModelSource;
}

/**
 * Loads Tockton, puts its `town` group under the stage root (StageSystem scales it with the table placement), registers
 * `TownSystem` and returns the runtime the game layer drives. Throws when the stage root is missing from the scene.
 */
export async function installTown(world: World, options: InstallTownOptions): Promise<TownRuntime> {
  const stage = world.getSceneObject(STAGE_NODE_ID);
  if (!stage) throw new Error(`Scene node "${STAGE_NODE_ID}" is missing; the town has nothing to stand on.`);
  const uniforms = createWakeUniforms();
  installWakeShading(options.registry, uniforms);
  const town = await loadTown(options.source ?? loadModel, options.registry);
  stage.add(town.group);
  const placement = world.getSystem(StageSystem);
  if (placement && placement.placement !== 'idle') town.group.scale.setScalar(placement.townScale); // the choice was made while the town loaded
  const runtime = new TownRuntime(town, uniforms, options.audio ?? null, options.events);
  world.registerSystem(TownSystem, { priority: 11 });
  world.getSystem(TownSystem)?.bind(runtime);
  return runtime;
}
