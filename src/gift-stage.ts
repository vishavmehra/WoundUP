// The machine of a gift link on the stand (UI_UX_SPEC §18): the finished machine the link describes, turning, with its tune.
// The link was validated by the codec and the solver before this is called (`mountGiftViewer`); the machine is made from the
// content layer's blueprint, never from anything the link says about itself.
import type { World } from '@iwsdk/core';
import { getBlueprint, solveAssembly } from './content/blueprints';
import type { MachineId } from './game/content';
import type { Gift } from './game/gift';
import type { MaterialRegistry } from './materials';
import { MAX_WIND_UNITS } from './sim';
import { STAGE_NODE_ID } from './stage';
import { BLUEPRINT_SOCKET_IDS, buildMachine, loadModel } from './town';
import type { MachineRig, TownRuntime } from './town';

/** Where a machine's base stands on the velvet stand, stage-local metres. */
const STAND_TOP_M = 0.002;
/** The gift machine is shown larger than life and towards the back of the stand, clear of the card that covers the lower part of the page. */
const GIFT_SCALE = 1.5;
const GIFT_BACK_M = -0.07;
const shown = new WeakMap<TownRuntime, MachineRig>();

/** Puts the gift's machine on the stand and starts it, fully wound; "Show it again" replaces it. */
export async function showGiftMachine(world: World, town: TownRuntime, materials: MaterialRegistry, gift: Gift): Promise<void> {
  const blueprint = getBlueprint(gift.blueprintId);
  const stage = world.getSceneObject(STAGE_NODE_ID);
  if (!blueprint || !stage) return;
  const rig = await buildMachine(blueprint.id as MachineId, loadModel, materials, BLUEPRINT_SOCKET_IDS);
  if (!rig) return;
  const previous = shown.get(town);
  if (previous) {
    town.removeRig(previous);
    previous.root.removeFromParent();
  }
  const outcome = solveAssembly(blueprint, Object.fromEntries(gift.placements.map((p) => [p.socketId, p.partId])), MAX_WIND_UNITS);
  rig.result = outcome.ok ? outcome.result : null;
  rig.running = true;
  rig.root.position.set(0, STAND_TOP_M, GIFT_BACK_M);
  rig.root.scale.setScalar(GIFT_SCALE); // the card covers the lower part of the page: bigger, and towards the back of the stand
  stage.add(rig.root);
  town.addRig(rig);
  shown.set(town, rig);
}
