import { DistanceGrabbable, Grabbed, OneHandGrabbable, RayInteractable, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { ComponentRegistry } from 'elics';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { GrabModeSystem } from '../../src/grab-mode.js';
import { ReturnsToRest } from '../../src/returns-to-rest-component.js';
import { SnapPart, SnappedTo, Socket, WindKey } from '../../src/interaction/components.js';
import { GAZE_REMOVE_HOLD_S, GAZE_TAP_MAX_M, isGazeModeOn, isWindTap, mayRemoveSeated, onGazeModeChange, setGazeModeFlag } from '../../src/interaction/gaze-state.js';
import { useHeadWhenNoEyes } from '../../src/interaction/gaze-mode.js';
import { setupGlbInteraction } from '../../src/interaction/glb-interaction.js';
import { interactionIntents } from '../../src/interaction/intents.js';
import type { InteractionIntent } from '../../src/interaction/intents.js';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system.js';
import { WindSystem } from '../../src/interaction/wind-system.js';

/**
 * Gaze-and-pinch (INTERACTION_SPEC §14, ADR-036), headless like systems.test.ts: the pure rules, the head-pose wrapper on a
 * stand-in for IWSDK's gaze pointer, the grab-component swap, the pinch-and-hold removal and the one-unit wind tap. What these
 * cannot show is the pointer itself on a headset; that is emulator and hardware work.
 */

const intents: InteractionIntent[] = [];
interactionIntents.subscribe((i) => intents.push(i));
afterEach(() => {
  intents.length = 0;
  setGazeModeFlag(false);
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
  // Components are module singletons: register them all, in one fixed order, so every test World has the same ids (systems.test.ts).
  const components = [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, WindKey, OneHandGrabbable, DistanceGrabbable, RayInteractable];
  for (const component of components) world.registerComponent(component);
  if (Handle) world.registerComponent(Handle);
  const scene = new Scene();
  Object.assign(world, { scene });
  return { world, scene };
}

describe('the gaze rules', () => {
  it('asks for the hold only in gaze mode, and counts a short still pinch as a tap', () => {
    expect(mayRemoveSeated(false, 0)).toBe(true); // hands never wait
    expect(mayRemoveSeated(true, GAZE_REMOVE_HOLD_S - 0.01)).toBe(false);
    expect(mayRemoveSeated(true, GAZE_REMOVE_HOLD_S)).toBe(true);
    expect(isWindTap(0.2, 0.005)).toBe(true);
    expect(isWindTap(0.2, GAZE_TAP_MAX_M + 0.001)).toBe(false); // the key moved: the pinch is pulling it out
    expect(isWindTap(GAZE_REMOVE_HOLD_S, 0)).toBe(false); // held: that is the start of a removal, not a tap
  });

  it('keeps one flag and tells its listeners once per change', () => {
    const seen: boolean[] = [];
    const off = onGazeModeChange((on) => seen.push(on));
    setGazeModeFlag(true);
    setGazeModeFlag(true);
    expect(isGazeModeOn()).toBe(true);
    setGazeModeFlag(false);
    off();
    setGazeModeFlag(true);
    expect(seen).toEqual([true, false]);
  });
});

describe('useHeadWhenNoEyes', () => {
  /** What the wrapper touches of IWSDK's GazePointer and XROrigin. */
  function fakes() {
    const calls = { sample: 0 };
    const origin = {
      head: new Group(),
      gazeOrigin: 'none' as 'none' | 'tracked',
      applied: [] as number[][],
      applyTrackedEyePose(transform: { matrix: Float32Array }) {
        this.applied.push([...transform.matrix]);
        this.gazeOrigin = 'tracked';
      },
    };
    const pointer = {
      sampleGazePose: (_time: number, _context: unknown): void => void calls.sample++,
      ownsFarTargeting: (_time: number): boolean => false,
    };
    return { calls, origin, pointer };
  }

  it('aims the pointer from the head when the runtime gives no gaze pose', () => {
    const { calls, origin, pointer } = fakes();
    useHeadWhenNoEyes(pointer as never, origin as never);
    origin.head.position.set(0.1, 1.2, -0.3);
    origin.head.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    pointer.sampleGazePose(0, {} as never);
    expect(calls.sample).toBe(1); // the original sample still runs first
    expect(origin.gazeOrigin).toBe('tracked');
    const m = origin.applied[0];
    expect(m.slice(12, 15).map((v) => +v.toFixed(4))).toEqual([0.1, 1.2, -0.3]); // translation column
    expect(pointer.ownsFarTargeting(0)).toBe(true); // the hands' far rays stand down
  });

  it('keeps a real gaze pose when the runtime has one, and leaves far rays alone without any pose', () => {
    const real = fakes();
    useHeadWhenNoEyes(real.pointer as never, real.origin as never);
    real.origin.gazeOrigin = 'tracked'; // eye tracking gave a pose in the original sample
    real.pointer.sampleGazePose(0, {} as never);
    expect(real.origin.applied).toHaveLength(0);

    const none = fakes();
    useHeadWhenNoEyes(none.pointer as never, none.origin as never);
    expect(none.pointer.ownsFarTargeting(0)).toBe(false); // before the first sample there is no pose to own anything
  });
});

describe('GrabModeSystem in gaze mode', () => {
  const bare = (world: World, scene: Scene): Entity => {
    const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshBasicMaterial());
    scene.add(mesh);
    const entity = world.createEntity();
    entity.object3D = mesh;
    entity.addComponent(ReturnsToRest, {});
    return entity;
  };
  const kind = (e: Entity): string => (e.hasComponent(OneHandGrabbable) ? 'near' : e.hasComponent(DistanceGrabbable) && e.hasComponent(RayInteractable) ? 'ray' : 'none');

  it('swaps near grabs for ray grabs and back, for parts that exist and parts that come later', () => {
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: true } });
    const early = bare(world, scene);
    expect(kind(early)).toBe('near');

    setGazeModeFlag(true);
    expect(kind(early)).toBe('ray');
    expect(early.hasComponent(OneHandGrabbable)).toBe(false);
    const late = bare(world, scene);
    expect(kind(late)).toBe('ray'); // a part made while the mode is on is born with the ray grab

    setGazeModeFlag(false);
    expect(kind(early)).toBe('near');
    expect(kind(late)).toBe('near');
    expect(early.hasComponent(RayInteractable)).toBe(false);
  });

  it('cancels, unbinds and removes the old grab handle, which IWSDK never rebuilds', () => {
    if (!Handle) throw new Error('IWSDK has no Handle component');
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: true } });
    const part = bare(world, scene);
    const log: string[] = [];
    const store = { bind: (target: Object3D) => (log.push(`bind ${target === part.object3D}`), () => log.push('unbind')) };
    part.addComponent(Handle, { instance: store });

    setGazeModeFlag(true);
    expect(log).toEqual(['bind true', 'unbind']); // bound again only to get the unbind that releases the listeners
    expect(part.hasComponent(Handle)).toBe(false);
    expect(kind(part)).toBe('ray');
  });

  it('leaves a part alone whose grab component the game took away, like a machine standing on its plot', () => {
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: true } });
    const placed = bare(world, scene);
    placed.removeComponent(OneHandGrabbable);
    setGazeModeFlag(true);
    expect(kind(placed)).toBe('none');
    setGazeModeFlag(false);
    expect(kind(placed)).toBe('none');
  });

  it('keeps the ray grab of a desktop browser (no hands) in both modes', () => {
    const { world, scene } = boot();
    world.registerSystem(GrabModeSystem, { configData: { hands: false } });
    const part = bare(world, scene);
    expect(kind(part)).toBe('ray');
    setGazeModeFlag(true);
    expect(kind(part)).toBe('ray');
    setGazeModeFlag(false);
    expect(kind(part)).toBe('ray');
  });
});

// ---- Pinch-and-hold removal ---------------------------------------------------------------------------------------

function housing(world: World, scene: Scene, accepts: string[]) {
  const root = new Object3D();
  const socket = new Object3D();
  socket.name = 'SOCKET_Pin';
  socket.userData.wu = { type: 'socket', accepts };
  root.add(socket);
  scene.add(root);
  root.updateMatrixWorld(true);
  return setupGlbInteraction(world, root);
}

function part(world: World, scene: Scene, id: string, family: string, x: number): Entity {
  const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshBasicMaterial());
  mesh.position.set(x, 0, 0);
  scene.add(mesh);
  const entity = world.createEntity();
  entity.object3D = mesh;
  entity.addComponent(SnapPart, { partId: id, family });
  return entity;
}

describe('SocketSnapSystem: pinch-and-hold removal in gaze mode (INTERACTION_SPEC §9)', () => {
  function seated() {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, ['gear_spur']);
    const gear = part(world, scene, 'g', 'gear_spur', 0.01);
    gear.addComponent(Grabbed);
    tick(world);
    gear.removeComponent(Grabbed);
    for (let i = 0; i < 12; i++) tick(world);
    intents.length = 0;
    return { world, gear };
  }

  it('holds a seated part against a quick pull, and lets it out once the pinch has been held half a second', () => {
    setGazeModeFlag(true);
    const { world, gear } = seated();
    gear.addComponent(Grabbed);
    gear.object3D!.position.x = 0.06; // far past the 3 cm hold
    tick(world, 0.2);
    expect(types()).toEqual([]); // a slip or a tap does not remove the part
    expect(gear.hasComponent(SnappedTo)).toBe(true);
    tick(world, 0.2);
    expect(types()).toEqual([]);
    tick(world, 0.2); // 0.6 s held
    expect(types()).toEqual(['unsnapped']);
    expect(gear.hasComponent(SnappedTo)).toBe(false);
  });

  it('starts the count again with every pinch, and lets go of a part that was never held long enough back into its socket', () => {
    setGazeModeFlag(true);
    const { world, gear } = seated();
    gear.addComponent(Grabbed);
    gear.object3D!.position.x = 0.05;
    tick(world, 0.4);
    gear.removeComponent(Grabbed); // released at 0.4 s: still seated
    expect(types()).toEqual([]);
    gear.addComponent(Grabbed); // a new pinch: the clock is at zero
    gear.object3D!.position.x = 0.05;
    tick(world, 0.3);
    expect(types()).toEqual([]);
  });

  it('does not wait with hands: one pull over 3 cm frees the part at once', () => {
    const { world, gear } = seated();
    gear.addComponent(Grabbed);
    gear.object3D!.position.x = 0.06;
    tick(world);
    expect(types()).toEqual(['unsnapped']);
  });
});

// ---- Pinch-tap winding --------------------------------------------------------------------------------------------

describe('WindSystem: a tap winds one unit in gaze mode (INTERACTION_SPEC §10)', () => {
  function key(units = 0, maxUnits = 8) {
    const { world, scene } = boot();
    // No hands in this test: the twist path (which gaze mode skips) only needs an input that reports no pinch.
    Object.assign(world, {
      player: Object.assign(new Object3D(), { gripSpaces: { left: new Object3D(), right: new Object3D() }, indexTipSpaces: { left: new Object3D(), right: new Object3D() } }),
      input: { xr: { getSelectState: () => ({ start: false, end: false, active: false }), getPrimaryInputSource: () => undefined } },
      renderer: { xr: { getFrame: () => null, getReferenceSpace: () => null } },
    });
    world.registerSystem(WindSystem, { priority: 10 });
    const object = new Object3D();
    scene.add(object);
    const entity = world.createEntity();
    entity.object3D = object;
    entity.addComponent(WindKey, { axis: [0, 0, 1], units, maxUnits });
    return { world, entity, object };
  }
  const pinch = (world: World, entity: Entity, held: number, move = 0): void => {
    entity.addComponent(Grabbed);
    entity.object3D!.position.x += move;
    tick(world, held);
    entity.removeComponent(Grabbed);
  };

  it('adds one unit per short, still pinch, and reports it like the twist does', () => {
    setGazeModeFlag(true);
    const { world, entity } = key();
    pinch(world, entity, 0.2);
    expect(entity.getValue(WindKey, 'units')).toBe(1);
    expect(types()).toEqual(['wind', 'windEnd']);
    expect(intents[0]).toMatchObject({ type: 'wind', units: 1, gained: 1 });
    expect(intents[1]).toMatchObject({ type: 'windEnd', units: 1, gained: 1 });
    pinch(world, entity, 0.1);
    pinch(world, entity, 0.1);
    expect(entity.getValue(WindKey, 'units')).toBe(3);
  });

  it('stops at the maximum', () => {
    setGazeModeFlag(true);
    const { world, entity } = key(7, 8);
    pinch(world, entity, 0.1);
    pinch(world, entity, 0.1);
    expect(entity.getValue(WindKey, 'units')).toBe(8);
    expect(types()).toEqual(['wind', 'windEnd']); // the second pinch found a full key
  });

  it('does not count a held pinch, or one that pulled the key away', () => {
    setGazeModeFlag(true);
    const { world, entity } = key();
    pinch(world, entity, GAZE_REMOVE_HOLD_S + 0.1); // pinch-and-hold is removal, not winding
    pinch(world, entity, 0.2, GAZE_TAP_MAX_M + 0.01);
    expect(entity.getValue(WindKey, 'units')).toBe(0);
    expect(types()).toEqual([]);
  });

  it('winds nothing from a grab outside gaze mode: hands wind with the wrist', () => {
    const { world, entity } = key();
    pinch(world, entity, 0.2);
    expect(entity.getValue(WindKey, 'units')).toBe(0);
    expect(types()).toEqual([]);
  });

  it('winds nothing for a key that was destroyed during the pinch', () => {
    setGazeModeFlag(true);
    const { world, entity } = key();
    entity.addComponent(Grabbed);
    tick(world, 0.1);
    entity.destroy();
    expect(types()).toEqual([]);
  });
});

