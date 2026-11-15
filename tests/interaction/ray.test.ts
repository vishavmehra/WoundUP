import { DistanceGrabbable, Grabbed, OneHandGrabbable, RayInteractable, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { ComponentRegistry } from 'elics';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { GrabModeSystem } from '../../src/grab-mode.js';
import { ReturnsToRest } from '../../src/returns-to-rest-component.js';
import { SnapPart, SnappedTo, Socket, WindKey } from '../../src/interaction/components.js';
import { isGazeAiming, isGazeModeOn, isRayModeOn, onGazeModeChange, setGazeModeFlag, setRayModeFlag } from '../../src/interaction/gaze-state.js';
import { setupGlbInteraction } from '../../src/interaction/glb-interaction.js';
import { interactionIntents } from '../../src/interaction/intents.js';
import type { InteractionIntent } from '../../src/interaction/intents.js';
import { setPointerModes, setRayMode } from '../../src/interaction/ray-mode.js';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system.js';
import { WindSystem } from '../../src/interaction/wind-system.js';

/**
 * Ray interaction mode (PRODUCT_SPEC F17 and §16), headless like gaze.test.ts: the pointer-mode flag, the setting pair, the grab
 * component swap, and the two gaze rules that ray mode shares because they hang on the pointer-mode flag: the held pinch that takes a seated
 * part out, and the tap that winds one unit. What this cannot show is the hand's ray on a headset (that is emulator and hardware work).
 */

const intents: InteractionIntent[] = [];
interactionIntents.subscribe((i) => intents.push(i));
afterEach(() => {
  intents.length = 0;
  setGazeModeFlag(false);
  setRayModeFlag(false);
});

const FRAME = 1 / 72;
let clock = 0;
const tick = (world: World, seconds = FRAME): void => {
  clock += seconds;
  world.update(seconds, clock);
};
const types = (): string[] => intents.map((i) => i.type);
const Handle = ComponentRegistry.getById('Handle');

function boot(): { world: World; scene: Scene } {
  const world = new World();
  const components = [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, WindKey, OneHandGrabbable, DistanceGrabbable, RayInteractable];
  for (const component of components) world.registerComponent(component);
  if (Handle) world.registerComponent(Handle);
  const scene = new Scene();
  Object.assign(world, { scene });
  return { world, scene };
}

const kind = (e: Entity): string => (e.hasComponent(OneHandGrabbable) ? 'near' : e.hasComponent(DistanceGrabbable) && e.hasComponent(RayInteractable) ? 'ray' : 'none');

describe('the pointer-mode flag', () => {
  it('is on for gaze and for ray, and only gaze is "aiming" with the head', () => {
    expect(isGazeModeOn()).toBe(false);
    setRayModeFlag(true);
    expect(isGazeModeOn()).toBe(true);
    expect(isRayModeOn()).toBe(true);
    expect(isGazeAiming()).toBe(false);
    setRayModeFlag(false);
    setGazeModeFlag(true);
    expect(isGazeModeOn()).toBe(true);
    expect(isRayModeOn()).toBe(false);
    expect(isGazeAiming()).toBe(true);
  });

  it('tells its listeners once per change of the answer, not once per setter', () => {
    const seen: boolean[] = [];
    const off = onGazeModeChange((on) => seen.push(on));
    setRayModeFlag(true);
    setRayModeFlag(true);
    setGazeModeFlag(true); // already a pointer mode: the answer did not change
    setRayModeFlag(false); // gaze still on
    setGazeModeFlag(false);
    off();
    expect(seen).toEqual([true, false]);
  });
});

describe('setPointerModes: the two saved settings', () => {
  const fake = (): World => ({ input: { xr: { gazeEnabled: false } } }) as unknown as World;
  const gazePointerOn = (w: World): boolean => (w as unknown as { input: { xr: { gazeEnabled: boolean } } }).input.xr.gazeEnabled;

  it('ray mode turns the hands\' rays on and leaves the head-aimed gaze pointer off', () => {
    const world = fake();
    setPointerModes(world, { gazeMode: false, rayMode: true });
    expect(isRayModeOn()).toBe(true);
    expect(isGazeModeOn()).toBe(true);
    expect(gazePointerOn(world)).toBe(false);
  });

  it('gaze mode turns the gaze pointer on and ray mode off', () => {
    const world = fake();
    setPointerModes(world, { gazeMode: true, rayMode: false });
    expect(gazePointerOn(world)).toBe(true);
    expect(isRayModeOn()).toBe(false);
  });

  it('with both saved on (a hand-edited save), gaze wins: the two pointers would fight', () => {
    const world = fake();
    setPointerModes(world, { gazeMode: true, rayMode: true });
    expect(gazePointerOn(world)).toBe(true);
    expect(isRayModeOn()).toBe(false);
    expect(isGazeModeOn()).toBe(true);
  });

  it('switching from ray to gaze and back never passes through "no pointer mode"', () => {
    const world = fake();
    const seen: boolean[] = [];
    setPointerModes(world, { gazeMode: false, rayMode: true });
    const off = onGazeModeChange((on) => seen.push(on));
    setPointerModes(world, { gazeMode: true, rayMode: false });
    setPointerModes(world, { gazeMode: false, rayMode: true });
    setPointerModes(world, { gazeMode: false, rayMode: false });
    off();
    expect(seen).toEqual([false]);
  });

  it('setRayMode on its own respects gaze', () => {
    setRayMode(true, true);
    expect(isRayModeOn()).toBe(false);
    setRayMode(true);
    expect(isRayModeOn()).toBe(true);
  });
});

describe('GrabModeSystem in ray mode', () => {
  const bare = (world: World, scene: Scene): Entity => {
    const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshBasicMaterial());
    scene.add(mesh);
    const entity = world.createEntity();
    entity.object3D = mesh;
    entity.addComponent(ReturnsToRest, {});
    return entity;
  };

  it('gives every part, those that exist and those that come later, the ray grab, and takes it away again', () => {
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: true } });
    const early = bare(world, scene);
    expect(kind(early)).toBe('near');
    setRayModeFlag(true);
    expect(kind(early)).toBe('ray');
    expect(kind(bare(world, scene))).toBe('ray');
    setRayModeFlag(false);
    expect(kind(early)).toBe('near');
  });

  it('leaves a machine standing on its plot alone (the game took its grab component away)', () => {
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: true } });
    const placed = bare(world, scene);
    placed.removeComponent(OneHandGrabbable);
    setRayModeFlag(true);
    expect(kind(placed)).toBe('none');
  });
});

describe('ray mode shares the gaze rules for a seated part and the key', () => {
  function housing(world: World, scene: Scene): void {
    const root = new Object3D();
    const socket = new Object3D();
    socket.name = 'SOCKET_Pin';
    socket.userData.wu = { type: 'socket', accepts: ['gear_spur'] };
    root.add(socket);
    scene.add(root);
    root.updateMatrixWorld(true);
    setupGlbInteraction(world, root);
  }
  function gearIn(world: World, scene: Scene): Entity {
    const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshBasicMaterial());
    mesh.position.x = 0.01;
    scene.add(mesh);
    const gear = world.createEntity();
    gear.object3D = mesh;
    gear.addComponent(SnapPart, { partId: 'g', family: 'gear_spur' });
    gear.addComponent(Grabbed);
    tick(world);
    gear.removeComponent(Grabbed);
    for (let i = 0; i < 12; i++) tick(world);
    intents.length = 0;
    return gear;
  }

  it('a quick ray pinch does not pull a seated part out; a held one does', () => {
    setRayModeFlag(true);
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene);
    const gear = gearIn(world, scene);
    gear.addComponent(Grabbed);
    gear.object3D!.position.x = 0.06;
    tick(world, 0.2);
    expect(types()).toEqual([]);
    expect(gear.hasComponent(SnappedTo)).toBe(true);
    tick(world, 0.4);
    expect(types()).toEqual(['unsnapped']);
  });

  it('a tap on the key winds one unit with no wrist twist, as the pause menu promises', () => {
    setRayModeFlag(true);
    const { world, scene } = boot();
    Object.assign(world, {
      player: Object.assign(new Object3D(), { gripSpaces: { left: new Object3D(), right: new Object3D() }, indexTipSpaces: { left: new Object3D(), right: new Object3D() } }),
      input: { xr: { getSelectState: () => ({ start: false, end: false, active: false }), getPrimaryInputSource: () => undefined } },
      renderer: { xr: { getFrame: () => null, getReferenceSpace: () => null } },
    });
    world.registerSystem(WindSystem, { priority: 10 });
    const object = new Object3D();
    scene.add(object);
    const key = world.createEntity();
    key.object3D = object;
    key.addComponent(WindKey, { axis: [0, 0, 1], units: 0, maxUnits: 8 });
    key.addComponent(Grabbed);
    tick(world, 0.2);
    key.removeComponent(Grabbed);
    expect(key.getValue(WindKey, 'units')).toBe(1);
    expect(types()).toEqual(['wind', 'windEnd']);
  });
});
