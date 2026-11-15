import type { Entity } from '@iwsdk/core';
import { Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyArming, applyFirmness, armedIds } from '../../src/interaction/arming.js';
import { SnapPart, SnappedTo, Socket } from '../../src/interaction/components.js';
import { setupGlbInteraction } from '../../src/interaction/glb-interaction.js';
import { attachColliderProxies, GRIP_POINTER_ORDER, readInteractionNodes } from '../../src/interaction/glb-reader.js';
import { seatNow } from '../../src/interaction/seat-now.js';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system.js';
import { boot, grab, housing, letGo, part, record, run, tick } from './world.js';

/**
 * The interaction layer of the intricate assembly (INTRICATE_ASSEMBLY_DESIGN §3.4, §5, ADR-050): armed sockets, seatNow, carriers, the settle,
 * the release assist and the difficulty radius. Headless runs against a real IWSDK World, like systems.test.ts.
 */

let rec = record();
beforeEach(() => {
  rec = record();
});
afterEach(() => rec.stop());
const types = (): string[] => rec.intents.map((i) => i.type);

/** A part with child `SOCKET_` empties (a gear with its pin seat): the carrier of §3.1. */
function carrier(world: ReturnType<typeof boot>['world'], scene: Group | ReturnType<typeof boot>['scene'], id: string, family: string, x: number, children: Array<{ name: string; x: number; accepts: string[] }>): { entity: Entity; sockets: Record<string, Entity> } {
  const root = new Object3D();
  root.add(new Mesh(undefined, new MeshBasicMaterial()));
  root.position.set(x, 0, 0);
  for (const c of children) {
    const node = new Object3D();
    node.name = `SOCKET_${c.name}`;
    node.position.set(c.x, 0, 0);
    node.userData.wu = { type: 'socket', accepts: c.accepts };
    root.add(node);
  }
  scene.add(root);
  root.updateMatrixWorld(true);
  const sockets: Record<string, Entity> = {};
  for (const s of setupGlbInteraction(world, root).sockets) sockets[s.getValue(Socket, 'name') as string] = s;
  const entity = world.createEntity();
  entity.object3D = root;
  entity.addComponent(SnapPart, { partId: id, family });
  return { entity, sockets };
}

/** Holds `entity`, lets go, and runs the flight and the settle. */
function place(world: ReturnType<typeof boot>['world'], entity: Entity): void {
  grab(entity);
  tick(world);
  letGo(entity);
  run(world, 16);
}

describe('armed sockets (design §3.4)', () => {
  it('rejects the right part at an unarmed socket with reason order, and seats it once the socket is armed', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'Washer', x: 0, accepts: ['washer_plain_8_brass'] }]);
    const sockets = new Map([['washer_a', h.entities.Washer]]);
    expect(applyArming(sockets, [])).toBe(1); // armed by default, disarmed by the game
    expect(armedIds(sockets)).toEqual([]);

    const washer = part(world, scene, 'washer_plain_8_brass', 'fastener', 0.01);
    grab(washer);
    tick(world);
    letGo(washer);
    expect(rec.intents).toMatchObject([{ type: 'rejected', reason: 'order', socketName: 'Washer', partId: 'washer_plain_8_brass' }]);
    expect(washer.hasComponent(SnappedTo)).toBe(false);
    expect(h.entities.Washer.getValue(Socket, 'occupant')).toBeNull();

    expect(applyArming(sockets, ['washer_a'])).toBe(1);
    expect(applyArming(sockets, ['washer_a'])).toBe(0); // nothing to write twice
    expect(armedIds(sockets)).toEqual(['washer_a']);
    grab(washer);
    tick(world);
    letGo(washer);
    expect(types()).toEqual(['rejected', 'snapped']);
    expect(washer.hasComponent(SnappedTo)).toBe(true);
  });

  it('a wrong part still says family first, and a null arming arms every socket again', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'Screw', x: 0, accepts: ['screw_slot_m3_polished_brass'] }]);
    const sockets = new Map([['screw', h.entities.Screw]]);
    applyArming(sockets, []);
    const washer = part(world, scene, 'washer_plain_8_brass', 'fastener', 0.01);
    grab(washer);
    tick(world);
    letGo(washer);
    expect(rec.intents[0]).toMatchObject({ type: 'rejected', reason: 'family' });

    expect(applyArming(sockets, null)).toBe(1);
    expect(armedIds(sockets)).toEqual(['screw']);
  });

  it('with two washer sockets close together only the armed one takes the washer, however near the other is', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [
      { name: 'WasherL1', x: 0, accepts: ['washer'] },
      { name: 'WasherL2', x: 0.007, accepts: ['washer'] }, // 7 mm along the arbor
    ]);
    const sockets = new Map([
      ['washer_l1', h.entities.WasherL1],
      ['washer_l2', h.entities.WasherL2],
    ]);
    applyArming(sockets, ['washer_l2']);
    const washer = part(world, scene, 'washer', 'washer', 0.001); // right on top of L1
    grab(washer);
    tick(world);
    letGo(washer);
    expect(rec.intents).toMatchObject([{ type: 'snapped', socketName: 'WasherL2' }]);
    expect(h.entities.WasherL1.getValue(Socket, 'occupant')).toBeNull();
  });
});

describe('seatNow: the game places a part exactly as a hand does (design §7.5)', () => {
  /** One gear and one socket; `viaHand` releases it by hand, otherwise the game seats it. Returns what was observed each frame. */
  function observe(viaHand: boolean) {
    const r = record();
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'Pin', x: 0.1, y: 0.05, accepts: ['gear_spur'] }]);
    const gear = part(world, scene, 'gear_spur_20_m1', 'gear_spur', 0.13, 0.05);
    gear.object3D!.rotation.set(0.3, 0.2, 0.1);
    if (viaHand) {
      grab(gear);
      tick(world);
      letGo(gear);
    } else {
      expect(seatNow(world, gear, h.entities.Pin)).toBe(true);
    }
    const poses: Array<[number, number, number, number, number, number, number]> = [];
    for (let i = 0; i < 18; i++) {
      tick(world);
      const o = gear.object3D!;
      poses.push([o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w]);
    }
    const out = {
      intents: r.intents.map((i) => ({ ...i, part: undefined, socket: undefined })),
      settled: r.settled.map((i) => i.type),
      seated: gear.hasComponent(SnappedTo),
      occupant: h.entities.Pin.getValue(Socket, 'occupant') === gear,
      poses,
    };
    r.stop();
    return out;
  }

  it('gives the same intent, the same components and the same flight and settle, frame for frame', () => {
    const hand = observe(true);
    const game = observe(false);
    expect(game.intents).toEqual(hand.intents);
    expect(game.intents).toEqual([{ type: 'snapped', socketName: 'Pin', partId: 'gear_spur_20_m1', part: undefined, socket: undefined }]);
    expect(game.settled).toEqual(['settled']);
    expect(hand.settled).toEqual(['settled']);
    expect([game.seated, game.occupant]).toEqual([true, true]);
    expect([hand.seated, hand.occupant]).toEqual([true, true]);
    for (let i = 0; i < hand.poses.length; i++) {
      for (let k = 0; k < 7; k++) expect(game.poses[i][k], `frame ${i} component ${k}`).toBeCloseTo(hand.poses[i][k], 9);
    }
  });

  it('seats at an unarmed socket (the game places what the player is not asked for) but refuses a wrong part, an occupied socket, a held or seated part and a stranger', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [
      { name: 'A', x: 0, accepts: ['gear_spur'] },
      { name: 'B', x: 0.2, accepts: ['gear_spur'] },
    ]);
    applyArming(new Map([['a', h.entities.A]]), []);
    const gear = part(world, scene, 'g1', 'gear_spur', 0.03);
    const wrong = part(world, scene, 'shaft', 'shaft', 0.03);
    const other = part(world, scene, 'g2', 'gear_spur', 0.03);
    const plain = world.createEntity();
    plain.object3D = new Object3D();
    scene.add(plain.object3D);
    const stranger = world.createEntity();
    stranger.object3D = new Object3D();

    expect(seatNow(world, wrong, h.entities.A)).toBe(false);
    expect(seatNow(world, plain, h.entities.A)).toBe(false); // not a SnapPart
    expect(rec.intents).toEqual([]); // a refusal is silent
    expect(seatNow(world, gear, stranger)).toBe(false); // not a socket

    expect(seatNow(world, gear, h.entities.A)).toBe(true);
    expect(types()).toEqual(['snapped']);
    expect(seatNow(world, gear, h.entities.B)).toBe(false); // already seated
    expect(seatNow(world, other, h.entities.A)).toBe(false); // occupied
    other.object3D!.position.x = 0.1; // away from the occupied socket A, so letting go below is a plain drop
    grab(other);
    expect(seatNow(world, other, h.entities.B)).toBe(false); // in a hand
    letGo(other);
    expect(seatNow(world, other, h.entities.B)).toBe(true);
    expect(types()).toEqual(['snapped', 'snapped']);
  });

  it('is a seat like any other: a hand can pull it out again and the socket frees', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'A', x: 0, accepts: ['gear_spur'] }]);
    const gear = part(world, scene, 'g1', 'gear_spur', 0.03);
    seatNow(world, gear, h.entities.A);
    run(world, 16);
    grab(gear);
    gear.object3D!.position.x = 0.05;
    tick(world);
    expect(types()).toEqual(['snapped', 'unsnapped']);
    expect(h.entities.A.getValue(Socket, 'occupant')).toBeNull();
  });
});

describe('the settle (design §5.2, §10.1)', () => {
  it('flies for 0.12 s, announces the arrival once on settleIntents only, pushes 0.4 mm past home and eases back', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'Pin', x: 0, accepts: ['gear_spur'] }]);
    const gear = part(world, scene, 'g', 'gear_spur', 0.03);
    grab(gear);
    tick(world);
    letGo(gear);
    expect(rec.settled).toEqual([]);
    const xs: number[] = [];
    for (let i = 0; i < 22; i++) {
      tick(world);
      xs.push(gear.object3D!.position.x);
      if (i === 8) expect(rec.settled).toHaveLength(1); // 9 frames = 0.125 s: the flight is over
    }
    expect(rec.settled).toMatchObject([{ type: 'settled', socketName: 'Pin', partId: 'g' }]);
    expect(types()).toEqual(['snapped']); // the counted bus is untouched
    expect(Math.min(...xs)).toBeLessThan(-0.00035); // coming from +x, it passes home and goes on...
    expect(Math.min(...xs)).toBeGreaterThan(-0.00041); // ...by no more than 0.4 mm
    expect(xs[xs.length - 1]).toBeCloseTo(0, 9); // and settles exactly
    expect(h.root.position.length()).toBe(0);
  });

  it('does not push a part that was already home', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, [{ name: 'Pin', x: 0, accepts: ['gear_spur'] }]);
    const gear = part(world, scene, 'g', 'gear_spur', 0);
    grab(gear);
    tick(world);
    letGo(gear);
    for (let i = 0; i < 20; i++) {
      tick(world);
      expect(gear.object3D!.position.length()).toBeLessThan(1e-9);
    }
    expect(rec.settled).toHaveLength(1);
  });
});

describe('carriers (design §3.1, §5.3)', () => {
  it('keeps a seated child on its carrier when the carrier is pulled out and carried', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [{ name: 'Arbor', x: 0, accepts: ['arbor'] }]);
    const arbor = carrier(world, scene, 'arbor', 'arbor', 0.2, [{ name: 'Wheel', x: 0.03, accepts: ['gear_spur'] }]);
    const wheel = part(world, scene, 'gear_16', 'gear_spur', 0.5);
    place(world, wheel); // not near anything: nothing happens
    wheel.object3D!.position.set(0.23, 0, 0); // by the arbor's wheel seat
    place(world, wheel);
    expect(wheel.hasComponent(SnappedTo)).toBe(true);
    expect(wheel.object3D!.position.x).toBeCloseTo(0.23, 9);

    arbor.entity.object3D!.position.set(0.02, 0, 0); // the arbor goes to the case
    place(world, arbor.entity);
    expect(arbor.entity.hasComponent(SnappedTo)).toBe(true);
    expect(arbor.entity.getValue(SnapPart, 'partId')).toBe('arbor');
    expect(h.entities.Arbor.getValue(Socket, 'occupant')).toBe(arbor.entity);
    expect(wheel.object3D!.position.x).toBeCloseTo(0.03, 9); // the wheel came along

    // Pulled out of the case and carried away (a hand, past 3 cm): the wheel stays on it.
    rec.intents.length = 0;
    grab(arbor.entity);
    arbor.entity.object3D!.position.set(0.4, 0.1, 0);
    tick(world);
    expect(types()).toEqual(['unsnapped']);
    expect(rec.intents[0]).toMatchObject({ partId: 'arbor' });
    expect(wheel.hasComponent(SnappedTo)).toBe(true);
    expect(arbor.sockets.Wheel.getValue(Socket, 'occupant')).toBe(wheel);
    expect(wheel.object3D!.position.distanceTo(new Vector3(0.43, 0.1, 0))).toBeLessThan(1e-9);
    arbor.entity.object3D!.position.set(-0.3, 0.2, 0.1);
    tick(world);
    expect(wheel.object3D!.position.distanceTo(new Vector3(-0.27, 0.2, 0.1))).toBeLessThan(1e-9);
    expect(types()).toEqual(['unsnapped']); // the wheel never came loose
  });

  it('locks a carrier before what it carries, however late it was seated: no child trails it while it flies home', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    housing(world, scene, [{ name: 'Case', x: 0, accepts: ['arbor'] }]);
    // a chain three deep: the arbor carries a gear, the gear carries a pin
    const arbor = carrier(world, scene, 'arbor', 'arbor', 0.3, [{ name: 'Wheel', x: 0.02, accepts: ['gear'] }]);
    const gear = carrier(world, scene, 'gear', 'gear', 0.32, [{ name: 'Pin', x: 0.004, accepts: ['pin'] }]);
    const pin = part(world, scene, 'pin', 'pin', 0.324);
    seatNow(world, gear.entity, arbor.sockets.Wheel);
    seatNow(world, pin, gear.sockets.Pin);
    run(world, 16);
    expect(types()).toEqual(['snapped', 'snapped']);

    arbor.entity.object3D!.position.set(0.03, 0, 0);
    grab(arbor.entity);
    tick(world);
    letGo(arbor.entity); // the arbor is seated last of the three
    for (let i = 0; i < 18; i++) {
      tick(world);
      const a = arbor.entity.object3D!.position.x;
      expect(gear.entity.object3D!.position.x, `frame ${i} gear`).toBeCloseTo(a + 0.02, 9);
      expect(pin.object3D!.position.x, `frame ${i} pin`).toBeCloseTo(a + 0.024, 9);
    }
    expect(arbor.entity.object3D!.position.x).toBeCloseTo(0, 9);
  });

  it('never previews, snaps or rejects a carrier at its own child seats, and the game cannot seat it there', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const arbor = carrier(world, scene, 'arbor', 'gear_spur', 0.3, [{ name: 'Wheel', x: 0.02, accepts: ['gear_spur'] }]); // same family: it would fit
    const before = scene.children.length;
    grab(arbor.entity);
    tick(world);
    expect(scene.children.length).toBe(before); // no ghost: the only socket in range is its own
    letGo(arbor.entity);
    expect(rec.intents).toEqual([]); // dropped on the table: no snap and no bonk
    expect(seatNow(world, arbor.entity, arbor.sockets.Wheel)).toBe(false);
    expect(arbor.sockets.Wheel.getValue(Socket, 'occupant')).toBeNull();
  });

  it('asks 6 cm of a part in a firm socket and 3 cm of the others', () => {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const h = housing(world, scene, [
      { name: 'Firm', x: 0, accepts: ['gear_spur'] },
      { name: 'Loose', x: 0.3, accepts: ['gear_spur'] },
    ]);
    const sockets = new Map([
      ['firm', h.entities.Firm],
      ['loose', h.entities.Loose],
    ]);
    expect(applyFirmness(sockets, ['firm'])).toBe(1);
    expect(h.entities.Firm.getValue(Socket, 'unsnapM')).toBe(0.06);
    expect(h.entities.Loose.getValue(Socket, 'unsnapM')).toBe(0.03);
    const a = part(world, scene, 'a', 'gear_spur', 0.0);
    const b = part(world, scene, 'b', 'gear_spur', 0.3);
    seatNow(world, a, h.entities.Firm);
    seatNow(world, b, h.entities.Loose);
    run(world, 16);
    rec.intents.length = 0;

    for (const [entity, home] of [[a, 0], [b, 0.3]] as const) {
      grab(entity);
      entity.object3D!.position.x = home + 0.05;
      tick(world);
    }
    expect(rec.intents).toMatchObject([{ type: 'unsnapped', partId: 'b' }]); // 5 cm: out of the loose one only
    a.object3D!.position.x = 0.061;
    tick(world);
    expect(types()).toEqual(['unsnapped', 'unsnapped']);
    expect(applyFirmness(sockets, [])).toBe(1); // a stage reopened: back to 3 cm
  });

  it('gives a carrier\'s COL_Grip the pointer before any other collider, and every other collider the default order', () => {
    const root = new Object3D();
    const mk = (name: string, purpose: string): void => {
      const node = new Object3D();
      node.name = name;
      node.userData.wu = { type: 'collider', shape: 'sphere', purpose };
      root.add(node);
    };
    mk('COL_Grip', 'grip');
    mk('COL_Grab', 'grab');
    const proxies = attachColliderProxies(readInteractionNodes(root).colliders);
    const byName = Object.fromEntries(proxies.map((p) => [p.name, p]));
    expect(byName.COL_Grip_proxy.pointerEventsOrder).toBe(GRIP_POINTER_ORDER);
    expect(GRIP_POINTER_ORDER).toBeGreaterThan(0);
    expect(byName.COL_Grab_proxy.pointerEventsOrder).toBeUndefined();
  });
});

describe('the release assist and the difficulty radius (design §5.2)', () => {
  function bench(level?: 'relaxed' | 'standard' | 'master', easy = false) {
    const { world, scene } = boot();
    world.registerSystem(SocketSnapSystem, { priority: 10 });
    const system = world.getSystem(SocketSnapSystem)!;
    if (level) system.config.level.value = level;
    system.config.easySnap.value = easy;
    const h = housing(world, scene, [{ name: 'Pin', x: 0, accepts: ['pin', 'fastener', 'gear_spur'] }]);
    return { world, scene, h };
  }

  it('lets a tiny part whose pinch opens after a valid preview still go home, if the hand drifted at most 1.5 radii and within 0.15 s', () => {
    const { world, scene, h } = bench();
    const pin = part(world, scene, 'pin_taper_2_polished_brass', 'fastener', 0.03);
    pin.object3D!.position.set(0.03, 0, 0);
    grab(pin);
    tick(world); // valid preview at 3 cm
    pin.object3D!.position.x = 0.055; // the fingers open: 5.5 cm, out of the 4 cm radius
    run(world, 3);
    letGo(pin);
    expect(types()).toEqual(['snapped']);
    expect(h.entities.Pin.getValue(Socket, 'occupant')).toBe(pin);
  });

  it('does not rescue a part that is not tiny, a hand that drifted too far, or a preview that is too old', () => {
    const big = bench();
    const gear = part(big.world, big.scene, 'g', 'gear_spur', 0.03);
    grab(gear);
    tick(big.world);
    gear.object3D!.position.x = 0.055;
    tick(big.world);
    letGo(gear);
    expect(types()).toEqual([]); // 5.5 cm of nothing: no socket in range, no event

    const far = bench();
    const pinFar = part(far.world, far.scene, 'pin', 'fastener', 0.03);
    grab(pinFar);
    tick(far.world);
    pinFar.object3D!.position.x = 0.07; // beyond 1.5 radii (6 cm)
    tick(far.world);
    letGo(pinFar);
    expect(types()).toEqual([]);

    const old = bench();
    const pinOld = part(old.world, old.scene, 'pin', 'fastener', 0.03);
    grab(pinOld);
    tick(old.world);
    pinOld.object3D!.position.x = 0.055;
    run(old.world, 12); // 0.167 s: the preview has gone stale
    letGo(pinOld);
    expect(types()).toEqual([]);
  });

  it('takes the radius from the level: Relaxed reaches 7 cm (9 with Easy Snap), Standard and Master 4 (7)', () => {
    const reaches = (level: 'relaxed' | 'standard' | 'master', easy: boolean, cm: number): boolean => {
      const b = bench(level, easy);
      const r = record();
      const g = part(b.world, b.scene, 'g', 'gear_spur', cm / 100);
      grab(g);
      tick(b.world);
      letGo(g);
      const snapped = r.intents.some((i) => i.type === 'snapped');
      r.stop();
      return snapped;
    };
    expect(reaches('standard', false, 5)).toBe(false);
    expect(reaches('standard', true, 6)).toBe(true);
    expect(reaches('master', false, 5)).toBe(false);
    expect(reaches('master', true, 6)).toBe(true);
    expect(reaches('relaxed', false, 6)).toBe(true);
    expect(reaches('relaxed', false, 8)).toBe(false);
    expect(reaches('relaxed', true, 8)).toBe(true);
    expect(reaches('relaxed', true, 10)).toBe(false);
  });

  it('falls back to Standard for a level it does not know', () => {
    const b = bench();
    (b.world.getSystem(SocketSnapSystem)!.config.level as { value: string }).value = 'nightmare';
    const g = part(b.world, b.scene, 'g', 'gear_spur', 0.05);
    grab(g);
    tick(b.world);
    letGo(g);
    expect(types()).toEqual([]);
  });
});
