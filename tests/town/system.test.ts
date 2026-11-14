import { Grabbed, TransformSystem, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { Group, Object3D, Quaternion, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapPart, SnappedTo, Socket, WindKey, XRayTarget } from '../../src/interaction/components';
import { interactionIntents } from '../../src/interaction/intents';
import type { InteractionIntent } from '../../src/interaction/intents';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system';
import { ReturnsToRest } from '../../src/returns-to-rest-component';
import { STAGE_NODE_ID, TOWN_NODE_ID } from '../../src/stage';
import { installTown } from '../../src/town';
import { makeCarriable } from '../../src/town/carry';
import { MACHINE_SNAP_PART } from '../../src/town/layout';
import type { PlotId } from '../../src/game/content';
import { plotSocket } from '../../src/town/scene';
import { createRig, createRotor } from '../../src/town/motion';
import type { MachineRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import type { TownEvents } from '../../src/town/runtime';
import { TownSystem } from '../../src/town/system';
import { DRESSING_MODEL_PATHS } from '../../src/town/dressing-table';
import { dressingModels, libraryRegistry, recorder, socket as socketEmpty, sourceOf, townModels } from './helpers';

/**
 * The town in a real IWSDK World, headless (no renderer, no session): installTown, TownSystem, the interaction layer's
 * SocketSnapSystem and a carried machine. It proves the wiring; the numbers are in the pure-module tests.
 * One World per test: components are module singletons (see tests/interaction/systems.test.ts).
 */
const FRAME = 1 / 72;
let clock = 0;
const tick = (world: World, seconds = FRAME): void => {
  clock += seconds;
  world.update(seconds, clock);
};

const intents: InteractionIntent[] = [];
interactionIntents.subscribe((i) => intents.push(i));
afterEach(() => {
  intents.length = 0;
  vi.restoreAllMocks();
});

function boot() {
  const world = new World();
  for (const component of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, WindKey, XRayTarget]) world.registerComponent(component);
  const scene = new Scene();
  Object.assign(world, { scene });
  const level = world.createEntity();
  const levelRoot = new Group();
  level.object3D = levelRoot;
  scene.add(levelRoot);
  Object.assign(world, { activeLevel: { value: level }, activeLevelId: 'test' });
  const stage = new Group();
  stage.userData.iwsdkSceneNodeId = STAGE_NODE_ID;
  levelRoot.add(stage);
  return { world, scene, levelRoot, stage };
}

const models = {
  'tockton/environment/town_ground.glb': () => townModels().ground,
  'tockton/bakery/bakery_building.glb': () => townModels().bakery,
  'tockton/theatre/theatre_facade.glb': () => townModels().theatre,
  'tockton/characters/figure_otto.glb': () => townModels().otto,
  'tockton/characters/figure_mira.glb': () => townModels().mira,
  [DRESSING_MODEL_PATHS.houses]: () => dressingModels().houses,
  [DRESSING_MODEL_PATHS.props]: () => dressingModels().props,
  [DRESSING_MODEL_PATHS.lamp]: () => dressingModels().lamp,
};

async function bootTown(events: TownEvents = {}, keepAwake?: () => void) {
  const b = boot();
  b.world.registerSystem(SocketSnapSystem, { priority: 10 });
  const audio = recorder();
  const runtime = await installTown(b.world, { registry: libraryRegistry(), audio, events, keepAwake, source: sourceOf(models) });
  return { ...b, audio, runtime };
}

function windmill(parent: Object3D): MachineRig {
  const root = new Group();
  root.name = 'windmill';
  const sails = new Object3D();
  root.add(sails);
  const rig = createRig('windmill', root);
  rig.rotors.push(createRotor(sails, 'sails'));
  rig.result = { angularVelocity: { sails: 1 } };
  parent.add(root);
  return rig;
}

/** Where a plot's socket is in the world (the stage has no transform in these tests), `dx` metres to its right. */
function overPlot(runtime: TownRuntime, plot: PlotId, dx = 0): Vector3 {
  runtime.town.group.updateWorldMatrix(true, true);
  return plotSocket(runtime.town, plot)!.getWorldPosition(new Vector3()).add(new Vector3(dx, 0, 0));
}

describe('installTown', () => {
  it('puts the town group under the stage root, registers TownSystem and returns a bound runtime', async () => {
    const { world, stage, runtime } = await bootTown();
    expect(runtime).toBeInstanceOf(TownRuntime);
    expect(runtime.town.group.parent).toBe(stage);
    expect(world.getSceneObject(TOWN_NODE_ID)).toBe(runtime.town.group);
    expect(world.getSystem(TownSystem)).toBeDefined();
    expect(() => tick(world)).not.toThrow();
  });

  it('calls keepAwake every frame while the town is changing, and stops once it has settled', async () => {
    const awake = vi.fn();
    const { world, runtime } = await bootTown({}, awake);
    tick(world);
    expect(awake).not.toHaveBeenCalled(); // a frozen town needs no frames
    runtime.wakePlot('plot_carousel');
    tick(world);
    expect(awake).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 72 * 2; i++) tick(world); // the 1.5 s ripple
    const during = awake.mock.calls.length;
    expect(during).toBeGreaterThan(100);
    tick(world);
    tick(world);
    expect(awake.mock.calls.length).toBe(during);
  });

  it('refuses to build on a missing stage', async () => {
    const world = new World();
    Object.assign(world, { scene: new Scene() });
    await expect(installTown(world, { registry: libraryRegistry(), source: sourceOf(models) })).rejects.toThrow(/stage/);
  });
});

describe('a machine carried to its plot', () => {
  it('snaps onto its own plot, wakes it, and takes the town scale; the other plots refuse it', async () => {
    const placed: string[] = [];
    const { world, stage, audio, runtime } = await bootTown({ placed: (m, p) => void placed.push(`${m}@${p}`) });
    runtime.town.group.scale.setScalar(0.3);
    const rig = windmill(stage);
    const entity = makeCarriable(world, rig);
    expect(entity.getValue(SnapPart, 'partId')).toBe(MACHINE_SNAP_PART.windmill);
    expect(entity.hasComponent(ReturnsToRest)).toBe(true);
    expect(rig.root.parent).toBe(stage); // carrying it must not move it out from under the stage root
    runtime.addRig(rig);

    // Dropped on the Music Box plot: refused, nothing wakes.
    rig.root.position.copy(overPlot(runtime, 'plot_music_box'));
    stage.updateMatrixWorld(true);
    entity.addComponent(Grabbed);
    tick(world);
    entity.removeComponent(Grabbed);
    expect(intents.map((i) => i.type)).toEqual(['rejected']);
    expect(runtime.wake.awakePlots()).toEqual([]);

    // Dropped on its own plot: seated, woken, scaled.
    const own = overPlot(runtime, 'plot_windmill');
    rig.root.position.copy(own).add(new Vector3(0.01, 0, 0));
    entity.addComponent(Grabbed);
    tick(world);
    entity.removeComponent(Grabbed);
    expect(intents.map((i) => i.type)).toEqual(['rejected', 'snapped']);
    expect(placed).toEqual(['windmill@plot_windmill']);
    expect(runtime.wake.awakePlots()).toEqual(['plot_windmill']);
    expect(audio.calls.filter((c) => c.kind === 'chime')).toHaveLength(1);
    for (let i = 0; i < 90; i++) tick(world);
    expect(rig.root.scale.x).toBeCloseTo(0.3, 3);
    expect(rig.root.position.distanceTo(own)).toBeLessThan(1e-4); // on the socket, whatever the town scale
    expect(rig.rotors[0].theta).toBeGreaterThan(0); // and it turns from the solver's omega
    // Upright, facing the way it stood on the bench: the plot socket of town_ground.glb is a Z-up frame, which must not tip a
    // Y-up machine base onto its back.
    expect(rig.root.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-4);
  });

  it('turns the grab colliders of the machine on but not its own sockets, so carrying it is never a rejection', async () => {
    const { world, stage, runtime } = await bootTown();
    const rig = windmill(stage);
    // The seated parts of a finished machine carry SOCKET_ empties 1.5 and 3.5 cm from its origin, always within snap range
    // of the machine itself. They must not become sockets of the interaction layer.
    rig.root.add(socketEmpty('Tower', 0, 0.035, 0, ['windmill_tower']));
    const collider = new Object3D();
    collider.name = 'COL_Case';
    collider.userData.wu = { type: 'collider', shape: 'box', purpose: 'case' };
    rig.root.add(collider);
    const entity = makeCarriable(world, rig);
    runtime.addRig(rig);
    expect(collider.getObjectByName('COL_Case_proxy')).toBeDefined();

    rig.root.position.set(0.1, 0.4, 0.9); // far from every plot
    stage.updateMatrixWorld(true);
    entity.addComponent(Grabbed);
    tick(world);
    entity.removeComponent(Grabbed);
    tick(world);
    expect(intents).toEqual([]);
  });

  it('gives the machine its bench size back when it is lifted off, and does not wake the plot again when it returns', async () => {
    const lifted: string[] = [];
    const { world, stage, runtime, audio } = await bootTown({ lifted: (m) => void lifted.push(m) });
    runtime.town.group.scale.setScalar(0.3);
    const rig = windmill(stage);
    const entity = makeCarriable(world, rig);
    runtime.addRig(rig);
    const own = overPlot(runtime, 'plot_windmill');
    rig.root.position.copy(own);
    entity.addComponent(Grabbed);
    tick(world);
    entity.removeComponent(Grabbed);
    for (let i = 0; i < 40; i++) tick(world);

    entity.addComponent(Grabbed); // lift it 10 cm
    rig.root.position.y += 0.1;
    tick(world);
    expect(lifted).toEqual(['windmill']);
    for (let i = 0; i < 90; i++) tick(world);
    expect(rig.root.scale.x).toBeCloseTo(1, 3);

    rig.root.position.copy(own); // and put back
    tick(world);
    entity.removeComponent(Grabbed);
    for (let i = 0; i < 5; i++) tick(world);
    expect(audio.calls.filter((c) => c.kind === 'chime')).toHaveLength(1);
  });

  it('keeps a machine under an authored (entity) stage root, with the IWSDK TransformSystem running', async () => {
    const { world, levelRoot, stage, runtime } = await bootTown();
    world.registerSystem(TransformSystem);
    const levelEntity = (world as unknown as { activeLevel: { value: Entity } }).activeLevel.value;
    levelRoot.remove(stage); // the authored stage node: an entity of the level
    const stageEntity = world.createTransformEntity(stage, { parent: levelEntity });
    runtime.town.group.removeFromParent();
    stage.add(runtime.town.group);
    const rig = windmill(stage);
    rig.root.position.set(0.1, 0.2, 0.3);
    const entity = makeCarriable(world, rig);
    for (let i = 0; i < 3; i++) tick(world);
    expect(stageEntity.object3D).toBe(stage);
    expect(rig.root.parent).toBe(stage);
    expect(rig.root.position.distanceTo(new Vector3(0.1, 0.2, 0.3))).toBeLessThan(1e-6);
    expect(entity.object3D).toBe(rig.root);
  });
});
