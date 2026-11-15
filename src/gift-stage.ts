// The machine of a gift link on the stand (UI_UX_SPEC §18): the finished machine the link describes, turning, with its tune.
// The link was validated by the codec and the solver before this is called (`mountGiftViewer`); the machine is made from the
// content layer's blueprint, never from anything the link says about itself.
import type { Entity, World } from '@iwsdk/core';
import { Box3, Matrix4, Quaternion, Vector3, type Mesh, type Object3D } from 'three';
import { bindClockTowerAudio } from './audio';
import type { AudioEngine } from './audio';
import { getBlueprint, solveAssembly, withImplied } from './content/blueprints';
import type { MachineId } from './game/content';
import type { Gift } from './game/gift';
import { clockTowerEvents, startClockTower } from './machines/clock-tower';
import type { MaterialRegistry } from './materials';
import { MAX_WIND_UNITS } from './sim';
import { STAGE_NODE_ID } from './stage';
import type { StageBox } from './stage-framing';
import { BLUEPRINT_SOCKET_IDS, buildMachine, loadModel } from './town';
import type { MachineRig, TownRuntime } from './town';

/** Where a machine's base stands on the velvet stand, stage-local metres: on the velvet top (the stage root), at the plinth's centre (TOCKTON_DIMENSIONS §9). */
const STAND_CENTRE_Z_M = 0.125;
const shown = new WeakMap<TownRuntime, { rig: MachineRig; tower: Entity | null }>();
/** Worlds whose Clock Tower already plays its tick and its bell (the binding lives as long as the page). */
const towerSounds = new WeakSet<World>();
const _box = new Box3();
const _inverse = new Matrix4();
const _spin = new Quaternion();
const _z = new Vector3(0, 0, 1);

/**
 * The machine's box in stage-local metres, from what is drawn (colliders and other hidden helpers do not count), with the Music
 * Box lid swung open: it opens as soon as the box runs, and the page must frame the machine as it will be, not as it is built.
 */
function visibleBox(rig: MachineRig, stage: Object3D): StageBox {
  const { root, lid } = rig;
  if (lid) lid.pivot.quaternion.copy(lid.rest).multiply(_spin.setFromAxisAngle(_z, lid.openRad));
  stage.updateWorldMatrix(true, false);
  root.updateWorldMatrix(true, true);
  _inverse.copy(stage.matrixWorld).invert();
  const box = new Box3();
  root.traverseVisible((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox as Box3).applyMatrix4(mesh.matrixWorld).applyMatrix4(_inverse);
    box.union(_box);
  });
  if (lid) lid.pivot.quaternion.copy(lid.rest); // the lid is closed until the machine's own motion opens it
  return { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] };
}

/**
 * Puts the gift's machine on the stand at its own size and starts it, fully wound; "Show it again" replaces it. Returns the
 * machine's box on the stage, which the page frames (src/stage-framing.ts), or null when nothing could be shown.
 *
 * A Clock Tower keeps time: its pendulum swings, the escapement steps the train, the hands show the time of the viewer's clock, and the
 * hour rings once as it appears (ClockTowerSystem, which this page does not otherwise have, is registered for it). Pass `audio` and
 * the tick of the pendulum and the bell of the hour are heard once the page has had a click, as the Music Box's tune is.
 */
export async function showGiftMachine(world: World, town: TownRuntime, materials: MaterialRegistry, gift: Gift, audio?: AudioEngine): Promise<StageBox | null> {
  const blueprint = getBlueprint(gift.blueprintId);
  const stage = world.getSceneObject(STAGE_NODE_ID);
  if (!blueprint || !stage) return null;
  const rig = await buildMachine(blueprint.id as MachineId, loadModel, materials, BLUEPRINT_SOCKET_IDS);
  if (!rig) return null;
  const previous = shown.get(town);
  if (previous) {
    town.removeRig(previous.rig);
    previous.rig.root.removeFromParent();
    previous.tower?.destroy();
  }
  const outcome = solveAssembly(blueprint, withImplied(blueprint, Object.fromEntries(gift.placements.map((p) => [p.socketId, p.partId]))), MAX_WIND_UNITS); // hardware is implied (ADR-050)
  rig.result = outcome.ok ? outcome.result : null;
  rig.running = true;
  rig.root.position.set(0, 0, STAND_CENTRE_Z_M);
  stage.add(rig.root);
  town.addRig(rig);
  let tower: Entity | null = null;
  if (rig.machineId === 'clock_tower') {
    if (audio && !towerSounds.has(world)) {
      towerSounds.add(world);
      bindClockTowerAudio(audio, clockTowerEvents);
    }
    tower = startClockTower(world, rig, { strikeOnStart: true });
  }
  shown.set(town, { rig, tower });
  return visibleBox(rig, stage);
}
