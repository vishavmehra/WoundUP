import { Grabbed, GrabSystem, World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { BoxGeometry, Euler, Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { GrabFeedbackSystem } from '../../src/grab-feedback.js';
import { ReturnsToRest } from '../../src/returns-to-rest-component.js';
import { SnapPart, SnappedTo, Socket, WindKey, XRayTarget } from '../../src/interaction/components.js';
import { setupGlbInteraction } from '../../src/interaction/glb-interaction.js';
import { interactionIntents } from '../../src/interaction/intents.js';
import type { InteractionIntent } from '../../src/interaction/intents.js';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system.js';
import { WindSystem } from '../../src/interaction/wind-system.js';
import { setXRayLens, xrayFlag } from '../../src/interaction/xray-state.js';
import { XRaySystem } from '../../src/interaction/xray-system.js';

/**
 * Headless runs of the three ECS systems against a real IWSDK World (no renderer, no session). The XR input is a small
 * fake. What they prove is the wiring: queries, component data, intents, the order of events. The numbers are in the
 * pure-module tests.
 * One World per test: components are module singletons, so an old world must not be touched once a new one exists.
 */

const intents: InteractionIntent[] = [];
const unsubscribe = interactionIntents.subscribe((i) => intents.push(i));
afterEach(() => {
  intents.length = 0;
  setXRayLens(false);
});
void unsubscribe;

const FRAME = 1 / 72;
let clock = 0;
const tick = (world: World, seconds = FRAME): void => {
  clock += seconds;
  world.update(seconds, clock);
};
const types = (): string[] => intents.map((i) => i.type);
const deg = (d: number): number => (d * Math.PI) / 180;

function boot(): { world: World; scene: Scene } {
  const world = new World();
  // Components are module singletons and a component first used in another World keeps that World's type id, which can
  // collide here. Registering them all up front, in one fixed order, gives every test World its own consistent ids.
  for (const component of [Grabbed, ReturnsToRest, SnapPart, Socket, SnappedTo, WindKey, XRayTarget]) {
    world.registerComponent(component);
  }
  const scene = new Scene();
  Object.assign(world, { scene });
  return { world, scene };
}

// ---- Socket snapping ----------------------------------------------------------------------------------------------

function housing(world: World, scene: Scene, accepts: string[], extraWu: object = {}, rotation?: Euler) {
  const root = new Object3D();
  const socket = new Object3D();
  socket.name = 'SOCKET_Pin';
  socket.userData.wu = { type: 'socket', accepts, ...extraWu };
  if (rotation) socket.rotation.copy(rotation);
  root.add(socket);
  scene.add(root);
  root.updateMatrixWorld(true);
  return { socket, glb: setupGlbInteraction(world, root) };
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

const grab = (e: Entity): void => void e.addComponent(Grabbed);
const letGo = (e: Entity): void => void e.removeComponent(Grabbed);

describe('SocketSnapSystem', () => {
  it('previews while held, seats on release, eases in and follows the socket', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const { socket, glb } = housing(world, scene, ['gear_spur']);
    expect(glb.sockets).toHaveLength(1);
    const gear = part(world, scene, 'gear_spur_20_m1', 'gear_spur', 0.03);
    const before = scene.children.length;

    grab(gear);
    tick(world);
    expect(scene.children.length).toBe(before + 1); // the ghost
    expect(types()).toEqual([]); // a preview is not an event

    letGo(gear);
    expect(types()).toEqual(['snapped']);
    expect(intents[0]).toMatchObject({ socketName: 'Pin', partId: 'gear_spur_20_m1' });
    expect(gear.hasComponent(SnappedTo)).toBe(true);
    expect(glb.sockets[0].getValue(Socket, 'occupant')).toBe(gear);
    expect(scene.children.length).toBe(before); // the ghost is gone

    for (let i = 0; i < 12; i++) tick(world); // 0.12 s tween at 72 Hz
    expect(gear.object3D!.position.length()).toBeLessThan(1e-6);

    // The housing moves: the seated part goes with it.
    socket.parent!.position.set(0.5, 0.2, 0);
    tick(world);
    expect(gear.object3D!.position.distanceTo(new Vector3(0.5, 0.2, 0))).toBeLessThan(1e-6);
  });

  it('has hysteresis: a pull under 3 cm keeps the part, over 3 cm frees the socket, and it can go back within 4 cm', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const { glb } = housing(world, scene, ['gear_spur']);
    const gear = part(world, scene, 'g', 'gear_spur', 0.01);
    grab(gear);
    tick(world);
    letGo(gear);
    for (let i = 0; i < 12; i++) tick(world);
    intents.length = 0;

    grab(gear);
    gear.object3D!.position.x = 0.029;
    tick(world);
    expect(types()).toEqual([]);
    expect(gear.hasComponent(SnappedTo)).toBe(true);

    gear.object3D!.position.x = 0.031;
    tick(world);
    expect(types()).toEqual(['unsnapped']);
    expect(gear.hasComponent(SnappedTo)).toBe(false);
    expect(glb.sockets[0].getValue(Socket, 'occupant')).toBeNull();

    gear.object3D!.position.x = 0.035; // out of the hold, still inside the 4 cm snap radius
    tick(world);
    letGo(gear);
    expect(types()).toEqual(['unsnapped', 'snapped']);

    grab(gear);
    gear.object3D!.position.x = 0.05;
    tick(world);
    letGo(gear);
    expect(types()).toEqual(['unsnapped', 'snapped', 'unsnapped']); // beyond 4 cm: nothing to snap to
    expect(gear.hasComponent(SnappedTo)).toBe(false);
  });

  it('rejects a wrong family and an occupied socket, and Easy Snap reaches 7 cm', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, ['gear_spur']);

    const shaft = part(world, scene, 'shaft_30', 'shaft', 0.02);
    grab(shaft);
    tick(world);
    letGo(shaft);
    expect(intents).toMatchObject([{ type: 'rejected', reason: 'family' }]);

    const far = part(world, scene, 'g1', 'gear_spur', 0.06);
    grab(far);
    tick(world);
    letGo(far);
    expect(types()).toEqual(['rejected']); // 6 cm: not near enough, so no new event
    const system = world.getSystem(SocketSnapSystem)!;
    system.config.easySnap.value = true;
    grab(far);
    tick(world);
    letGo(far);
    expect(types()).toEqual(['rejected', 'snapped']);

    const second = part(world, scene, 'g2', 'gear_spur', 0.01);
    grab(second);
    tick(world);
    letGo(second);
    expect(intents[2]).toMatchObject({ type: 'rejected', reason: 'occupied' });
  });

  it('seats with the socket orientation, or only the +Z axis when the socket asks for it', () => {
    const tilt = new Euler(Math.PI / 2, 0, 0);
    const a = boot();
    a.world.registerSystem(SocketSnapSystem, { priority: 10 });
    const exact = housing(a.world, a.scene, ['gear_spur'], {}, tilt);
    const p = part(a.world, a.scene, 'g', 'gear_spur', 0.01);
    p.object3D!.rotation.set(0.3, 0.2, 0.1);
    grab(p);
    tick(a.world);
    letGo(p);
    for (let i = 0; i < 12; i++) tick(a.world);
    const socketQuat = exact.socket.getWorldQuaternion(new Quaternion());
    expect(p.object3D!.quaternion.angleTo(socketQuat)).toBeLessThan(1e-6);

    const b = boot();
    b.world.registerSystem(SocketSnapSystem, { priority: 10 });
    const axis = housing(b.world, b.scene, ['gear_spur'], { orient: 'axis' }, tilt);
    const q = part(b.world, b.scene, 'g', 'gear_spur', 0.01);
    q.object3D!.rotation.set(0.3, 0.2, 0.1);
    grab(q);
    tick(b.world);
    letGo(q);
    for (let i = 0; i < 12; i++) tick(b.world);
    const partZ = new Vector3(0, 0, 1).applyQuaternion(q.object3D!.quaternion);
    const socketZ = new Vector3(0, 0, 1).applyQuaternion(axis.socket.getWorldQuaternion(new Quaternion()));
    expect(partZ.distanceTo(socketZ)).toBeLessThan(1e-6);
    expect(q.object3D!.quaternion.angleTo(axis.socket.getWorldQuaternion(new Quaternion()))).toBeGreaterThan(0.01); // roll kept
  });
});

describe('SocketSnapSystem with GrabFeedbackSystem (the order that installInteraction relies on)', () => {
  const REST = new Vector3(0.5, 0, 0);
  function bootWithFeedback(accepts: string[]) {
    const { world, scene } = boot();
    world.registerSystem(GrabFeedbackSystem).registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, accepts);
    const gear = part(world, scene, 'gear_spur_16_m1', 'gear_spur', REST.x);
    gear.addComponent(ReturnsToRest); // its rest pose is taken here: the tray
    gear.object3D!.position.x = 0.03; // the hand carried it next to the socket
    return { world, gear };
  }

  it('a seated part stays in the socket although the return-to-tray ease starts at the same release', () => {
    const { world, gear } = bootWithFeedback(['gear_spur']);
    grab(gear);
    tick(world);
    letGo(gear);
    // Inside the 0.35 s return-to-tray ease: the pose the frame ends with must already be the socket's. If the feedback
    // system ran after the snap system it would win these frames and the part would drift towards the tray.
    for (let i = 0; i < 20; i++) {
      tick(world);
      if (i >= 9) expect(gear.object3D!.position.length(), `frame ${i}`).toBeLessThan(1e-6); // tween (0.12 s) is done
    }
    for (let i = 0; i < 40; i++) tick(world); // well past the ease
    expect(types()).toEqual(['snapped']);
    expect(gear.object3D!.position.length()).toBeLessThan(1e-6);
  });

  it('a rejected part ends up back at its tray position', () => {
    const { world, gear } = bootWithFeedback(['shaft']);
    grab(gear);
    tick(world);
    letGo(gear);
    for (let i = 0; i < 40; i++) tick(world);
    expect(types()).toEqual(['rejected']);
    expect(gear.hasComponent(SnappedTo)).toBe(false);
    expect(gear.object3D!.position.distanceTo(REST)).toBeLessThan(1e-6);
  });
});

describe('socket preview', () => {
  const fillColor = (ghost: Group): number => ((ghost.children[0] as Mesh).material as MeshBasicMaterial).color.getHex();

  it('is warm for a part that fits, red for one that does not, hidden out of range, and gone on release', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, ['gear_spur']);
    const gear = part(world, scene, 'g', 'gear_spur', 0.03);
    grab(gear);
    tick(world);
    const ghost = scene.children[scene.children.length - 1] as Group;
    expect(ghost.visible).toBe(true);
    const warm = fillColor(ghost);
    expect(warm).toBe(0xffc66d);
    expect(ghost.position.length()).toBeLessThan(1e-9); // at the socket

    gear.object3D!.position.x = 0.1; // out of range
    tick(world);
    expect(ghost.visible).toBe(false);
    letGo(gear);
    expect(scene.children).not.toContain(ghost);

    const shaft = part(world, scene, 's', 'shaft', 0.03);
    grab(shaft);
    tick(world);
    const red = scene.children[scene.children.length - 1] as Group;
    expect(red.visible).toBe(true);
    expect(fillColor(red)).not.toBe(warm);
  });
});

// ---- Fake XR input for the hand systems ---------------------------------------------------------------------------

type Hand = 'left' | 'right';
interface FakeHand {
  select: { start: boolean; end: boolean; active: boolean };
  position: Vector3;
  quaternion: Quaternion;
}

function bootXR(controllers = false): {
  world: World;
  scene: Scene;
  hands: Record<Hand, FakeHand>;
  tip: Record<Hand, Object3D>;
  player: Object3D & { gripSpaces: Record<Hand, Object3D> };
} {
  const { world, scene } = boot();
  const make = (): FakeHand => ({
    select: { start: false, end: false, active: false },
    position: new Vector3(),
    quaternion: new Quaternion(),
  });
  const hands = { left: make(), right: make() };
  const joints = { left: { hand: 'left' }, right: { hand: 'right' } };
  const frame = {
    getPose: (joint: { hand: Hand }) => {
      const h = hands[joint.hand];
      const { x, y, z } = h.position;
      const q = h.quaternion;
      return { transform: { position: { x, y, z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w } } };
    },
  };
  const tip = { left: new Object3D(), right: new Object3D() };
  const player = Object.assign(new Object3D(), {
    gripSpaces: { left: new Object3D(), right: new Object3D() },
    indexTipSpaces: tip,
  });
  const input = {
    xr: {
      getSelectState: (hand: Hand) => hands[hand].select,
      // A controller has no `hand` joints.
      getPrimaryInputSource: (hand: Hand) =>
        controllers ? {} : { hand: { get: (name: string) => (name === 'wrist' ? joints[hand] : undefined) } },
    },
  };
  Object.assign(world, {
    player,
    input,
    renderer: { xr: { getFrame: () => frame, getReferenceSpace: () => ({}) } },
  });
  return { world, scene, hands, tip, player };
}

/** One frame in which `hand` is pinching: `start` only on the first. */
function pinch(world: World, hand: FakeHand, first: boolean): void {
  hand.select.start = first;
  hand.select.active = true;
  tick(world);
  hand.select.start = false;
}

function release(world: World, hand: FakeHand): void {
  hand.select.end = true;
  hand.select.active = false;
  tick(world);
  hand.select.end = false;
}

const aboutY = (degrees: number): Quaternion => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), deg(degrees));

describe('WindSystem', () => {
  function bootKey(units = 0): ReturnType<typeof bootXR> & { key: Entity } {
    const rig = bootXR();
    rig.world.registerSystem(WindSystem, { priority: 10 });
    const key = rig.world.createEntity();
    key.object3D = new Object3D();
    rig.scene.add(key.object3D);
    key.addComponent(WindKey, { axis: [0, 1, 0], units });
    rig.tip.right.position.set(0, 0.005, 0); // 5 mm from the key origin
    return { ...rig, key };
  }

  it('a pinch near the key and a wrist twist add one unit per 90 degrees, and the key turns', () => {
    const { world, hands, key } = bootKey();
    pinch(world, hands.right, true);
    for (let a = 10; a <= 190; a += 10) {
      hands.right.quaternion.copy(aboutY(a));
      pinch(world, hands.right, false);
    }
    expect(intents.map((i) => i.type)).toEqual(['wind', 'wind']);
    expect(intents[1]).toMatchObject({ type: 'wind', units: 2, gained: 1, hand: 'right' });
    expect(key.getValue(WindKey, 'units')).toBe(2);
    expect(key.object3D!.quaternion.angleTo(new Quaternion())).toBeGreaterThan(deg(170)); // the key follows the wrist

    release(world, hands.right);
    expect(intents[2]).toMatchObject({ type: 'windEnd', units: 2, gained: 2 });
  });

  it('twisting back gains nothing, a far or empty pinch takes no key, and a full key cannot be wound', () => {
    const { world, hands, key, tip } = bootKey();
    pinch(world, hands.right, true);
    for (let a = 10; a <= 90; a += 10) {
      hands.right.quaternion.copy(aboutY(a));
      pinch(world, hands.right, false);
    }
    for (let a = 80; a >= -90; a -= 10) {
      hands.right.quaternion.copy(aboutY(a));
      pinch(world, hands.right, false);
    }
    release(world, hands.right);
    expect(intents.filter((i) => i.type === 'wind')).toHaveLength(1);
    expect(key.getValue(WindKey, 'units')).toBe(1);
    intents.length = 0;

    tip.left.position.set(0.1, 0, 0); // the left fingertip is 10 cm away: no key
    pinch(world, hands.left, true);
    hands.left.quaternion.copy(aboutY(100));
    pinch(world, hands.left, false);
    release(world, hands.left);
    expect(intents).toEqual([]);

    key.setValue(WindKey, 'units', 8);
    hands.right.quaternion.identity();
    pinch(world, hands.right, true);
    hands.right.quaternion.copy(aboutY(60));
    pinch(world, hands.right, false);
    release(world, hands.right);
    expect(intents).toEqual([]); // at the maximum there is nothing to start
  });
});

describe('WindSystem and a held part (INTERACTION_SPEC §18: an active grab wins)', () => {
  function bootHeld(holder: Hand): ReturnType<typeof bootXR> & { key: Entity } {
    const rig = bootXR();
    rig.world.registerSystem(WindSystem, { priority: 10 });
    const key = rig.world.createEntity();
    key.object3D = new Object3D();
    rig.scene.add(key.object3D);
    key.addComponent(WindKey, { axis: [0, 1, 0] });
    rig.tip.right.position.set(0, 0.005, 0);
    // GrabSystem needs a live pointer stack; a stub that answers `getHolderHand` is all WindSystem asks of it.
    const part = rig.world.createEntity();
    part.object3D = new Object3D();
    rig.scene.add(part.object3D);
    grab(part);
    Object.assign(rig.world, { getSystem: (type: unknown) => (type === GrabSystem ? { getHolderHand: () => holder } : undefined) });
    return { ...rig, key };
  }
  const twist = (rig: ReturnType<typeof bootXR>): void => {
    pinch(rig.world, rig.hands.right, true);
    for (let a = 10; a <= 100; a += 10) {
      rig.hands.right.quaternion.copy(aboutY(a));
      pinch(rig.world, rig.hands.right, false);
    }
    release(rig.world, rig.hands.right);
  };

  it('a pinch by the hand that holds a part does not start winding', () => {
    const rig = bootHeld('right');
    twist(rig);
    expect(intents).toEqual([]);
    expect(rig.key.getValue(WindKey, 'units')).toBe(0);
  });

  it('the other hand can still wind while this one holds a part', () => {
    const rig = bootHeld('left');
    twist(rig);
    expect(types()).toEqual(['wind', 'windEnd']);
  });
});

describe('XRaySystem', () => {
  function bootTarget(controllers = false): ReturnType<typeof bootXR> & { machine: Entity } {
    const rig = bootXR(controllers);
    rig.world.registerSystem(XRaySystem, { priority: 10 });
    const machine = rig.world.createEntity();
    machine.object3D = new Object3D();
    rig.scene.add(machine.object3D);
    machine.addComponent(XRayTarget, { radius: 0.15, top: 0.1 });
    return { ...rig, machine };
  }

  it('an open palm facing down 5-20 cm above the machine switches X-ray on after 0.4 s and off after it leaves', () => {
    const { world, hands, machine } = bootTarget();
    // Identity wrist: the back of the hand points up, the fingers along -Z. Palm centre = wrist + (0, 0, -7 cm).
    hands.right.position.set(0, 0.2, 0.07);
    for (let i = 0; i < 20; i++) tick(world); // 0.28 s
    expect(xrayFlag.active).toBe(false);
    for (let i = 0; i < 12; i++) tick(world); // past 0.4 s
    expect(xrayFlag.active).toBe(true);
    expect(xrayFlag.target).toBe(machine);
    expect(intents).toMatchObject([{ type: 'xray', active: true }]);

    hands.right.position.set(0, 0.6, 0.07); // lifted away
    for (let i = 0; i < 20; i++) tick(world);
    expect(xrayFlag.active).toBe(false);
    expect(intents.map((i) => i.type)).toEqual(['xray', 'xray']);
  });

  it('a pinching hand does not count, and the lens button is the alternative', () => {
    const { world, hands } = bootTarget();
    hands.right.position.set(0, 0.2, 0.07);
    hands.right.select.active = true;
    for (let i = 0; i < 40; i++) tick(world);
    expect(xrayFlag.active).toBe(false);

    setXRayLens(true);
    tick(world);
    expect(xrayFlag.active).toBe(true);
    expect(xrayFlag.target).toBeNull();
    setXRayLens(false);
    tick(world);
    expect(xrayFlag.active).toBe(false);
  });

  it('an active grab blocks it, and it can start only after the grab ends', () => {
    const { world, hands, scene } = bootTarget();
    hands.right.position.set(0, 0.2, 0.07);
    const held = world.createEntity();
    held.object3D = new Object3D();
    scene.add(held.object3D);
    grab(held);
    for (let i = 0; i < 40; i++) tick(world);
    expect(xrayFlag.active).toBe(false);
    letGo(held);
    for (let i = 0; i < 20; i++) tick(world); // 0.28 s: it must dwell again
    expect(xrayFlag.active).toBe(false);
    for (let i = 0; i < 12; i++) tick(world);
    expect(xrayFlag.active).toBe(true);
  });

  it('a controller never triggers it: its grip axes are not a hand', () => {
    const { world, player } = bootTarget(true);
    player.gripSpaces.right.position.set(0, 0.2, 0.07); // identity grip: "palm down" if it were read as a wrist
    for (let i = 0; i < 60; i++) tick(world);
    expect(xrayFlag.active).toBe(false);
  });
});
