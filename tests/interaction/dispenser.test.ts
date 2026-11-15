import type { Entity } from '@iwsdk/core';
import { DistanceGrabbable, OneHandGrabbable, RayInteractable } from '@iwsdk/core';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SnapPart, SnappedTo, Socket } from '../../src/interaction/components.js';
import { applyArming } from '../../src/interaction/arming.js';
import { Dispenser, ROLL_DROP_M, ROLL_S } from '../../src/interaction/dispenser.js';
import { setGazeModeFlag } from '../../src/interaction/gaze-state.js';
import { seatNow, TAP_RING_RADIUS_M, TapToFasten } from '../../src/interaction/seat-now.js';
import { SocketSnapSystem } from '../../src/interaction/socket-snap-system.js';
import { ReturnsToRest } from '../../src/returns-to-rest-component.js';
import { boot, grab, housing, letGo, record, run, tick } from './world.js';

/**
 * The caddy's dispenser and tap-to-fasten (INTRICATE_ASSEMBLY_DESIGN §3.5, §5.1, §5.5, ADR-050): one live piece a bin, rolled to the mouth in 0.25 s,
 * grabbable only there, grab lost for good when seated, and a pinch on an armed socket's ring seating the live piece in gaze mode.
 */

let rec = record();
beforeEach(() => {
  rec = record();
  setGazeModeFlag(false);
});
afterEach(() => {
  rec.stop();
  setGazeModeFlag(false);
});
const types = (): string[] => rec.intents.map((i) => i.type);

const ROLL_FRAMES = Math.ceil(ROLL_S * 72) + 1;

function caddy(bins: Array<{ id: string; partId: string; stock: number; x: number }>) {
  const { world, scene } = boot();
  world.registerSystem(SocketSnapSystem, { priority: 10 });
  const spawned: Entity[] = [];
  const discarded: Entity[] = [];
  const lamps: Record<string, boolean[]> = {};
  const dispenser = new Dispenser({
    spawn: (partId) => {
      const mesh = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshBasicMaterial());
      scene.add(mesh);
      const entity = world.createEntity();
      entity.object3D = mesh;
      entity.addComponent(SnapPart, { partId, family: 'fastener' });
      spawned.push(entity);
      return entity;
    },
    discard: (entity) => {
      discarded.push(entity);
      entity.object3D?.removeFromParent();
    },
  });
  const mouths: Record<string, Object3D> = {};
  for (const b of bins) {
    const mouth = new Object3D();
    mouth.position.set(b.x, 0.1, 0);
    scene.add(mouth);
    mouth.updateMatrixWorld(true);
    mouths[b.id] = mouth;
    lamps[b.id] = [];
    dispenser.addBin({ id: b.id, mouth, partId: b.partId, stock: b.stock, lamp: (on) => lamps[b.id].push(on) });
  }
  return { world, scene, dispenser, spawned, discarded, mouths, lamps };
}

describe('Dispenser: one live piece a bin (design §3.5)', () => {
  it('makes nothing until a bin is wanted, then rolls exactly one piece to the mouth in 0.25 s and makes it grabbable there', () => {
    const c = caddy([
      { id: 'bin1', partId: 'pin_taper_2_polished_brass', stock: 4, x: 0.2 },
      { id: 'bin2', partId: 'screw_slot_m3_polished_brass', stock: 6, x: 0.25 },
    ]);
    expect(c.spawned).toHaveLength(0);
    run(c.world, 5);
    expect(c.spawned).toHaveLength(0);

    c.dispenser.setWanted(['bin1']);
    expect(c.spawned).toHaveLength(1);
    expect(c.dispenser.isRolling('bin1')).toBe(true);
    expect(c.dispenser.liveOf('bin1')).toBeNull(); // not takeable while it rolls
    const piece = c.spawned[0];
    expect(piece.hasComponent(ReturnsToRest)).toBe(false);
    expect(piece.object3D!.position.distanceTo(new Vector3(0.2, 0.1 - ROLL_DROP_M, 0))).toBeLessThan(1e-9);

    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect(c.dispenser.isRolling('bin1')).toBe(false);
    expect(c.dispenser.liveOf('bin1')).toBe(piece);
    expect(piece.hasComponent(ReturnsToRest)).toBe(true);
    expect(piece.object3D!.position.distanceTo(new Vector3(0.2, 0.1, 0))).toBeLessThan(1e-9);
    for (let i = 0; i < 30; i++) c.dispenser.update(1 / 72);
    expect(c.spawned).toHaveLength(1); // one live piece, however long it waits
    expect(c.dispenser.stockOf('bin1')).toBe(4);
  });

  it('rolls the next piece when the live one is seated, and a seated piece can never be grabbed again', () => {
    const c = caddy([{ id: 'bin1', partId: 'pin_taper_2_polished_brass', stock: 2, x: 0.2 }]);
    const h = housing(c.world, c.scene, [{ name: 'Pin', x: 0.05, accepts: ['pin_taper_2_polished_brass'] }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const first = c.dispenser.liveOf('bin1')!;
    first.addComponent(OneHandGrabbable, {}); // GrabModeSystem would have added it
    first.object3D!.position.set(0.05, 0, 0);
    grab(first);
    tick(c.world);
    letGo(first);

    expect(types()).toEqual(['snapped']);
    expect(c.dispenser.stockOf('bin1')).toBe(1);
    expect(c.dispenser.liveOf('bin1')).toBeNull();
    expect(c.dispenser.isRolling('bin1')).toBe(true); // the next one is already on its way
    expect(c.spawned).toHaveLength(2);
    for (const component of [ReturnsToRest, OneHandGrabbable, DistanceGrabbable, RayInteractable]) expect(first.hasComponent(component)).toBe(false);
    expect(first.hasComponent(SnappedTo)).toBe(true);
    expect(h.entities.Pin.getValue(Socket, 'occupant')).toBe(first);

    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect(c.dispenser.liveOf('bin1')).toBe(c.spawned[1]);
  });

  it('stops making pieces when the bin is empty', () => {
    const c = caddy([{ id: 'bin1', partId: 'washer', stock: 1, x: 0.2 }]);
    const h = housing(c.world, c.scene, [{ name: 'W', x: 0.05, accepts: ['washer'] }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect(seatNow(c.world, c.dispenser.liveOf('bin1')!, h.entities.W)).toBe(true);
    expect(c.dispenser.stockOf('bin1')).toBe(0);
    for (let i = 0; i < 40; i++) c.dispenser.update(1 / 72);
    expect(c.spawned).toHaveLength(1);
    expect(c.dispenser.liveOf('bin1')).toBeNull();
  });

  it('leaves a piece that is dropped or rejected live at the mouth (ReturnsToRest sends it home), not consumed', () => {
    const c = caddy([{ id: 'bin1', partId: 'washer', stock: 3, x: 0.2 }]);
    housing(c.world, c.scene, [{ name: 'S', x: 0.05, accepts: ['screw'] }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const piece = c.dispenser.liveOf('bin1')!;
    piece.object3D!.position.set(0.06, 0, 0);
    grab(piece);
    tick(c.world);
    letGo(piece); // a washer at a screw socket: rejected
    expect(types()).toEqual(['rejected']);
    c.dispenser.update(1 / 72);
    expect(c.dispenser.liveOf('bin1')).toBe(piece);
    expect(c.dispenser.stockOf('bin1')).toBe(3);
    expect(piece.hasComponent(ReturnsToRest)).toBe(true);
    expect(c.spawned).toHaveLength(1);
  });

  it('wants one bin at a time, or all of them (Master), and lights the lamp of a bin that is wanted', () => {
    const c = caddy([
      { id: 'bin1', partId: 'a', stock: 2, x: 0.2 },
      { id: 'bin2', partId: 'b', stock: 2, x: 0.24 },
      { id: 'bin3', partId: 'c', stock: 2, x: 0.28 },
    ]);
    c.dispenser.setWanted(['bin2']);
    expect(c.lamps).toEqual({ bin1: [], bin2: [true], bin3: [] });
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect([c.dispenser.liveOf('bin1'), c.dispenser.liveOf('bin3')]).toEqual([null, null]);
    expect(c.dispenser.liveOf('bin2')).not.toBeNull();

    c.dispenser.setWanted('all');
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect([1, 2, 3].map((n) => c.dispenser.liveOf(`bin${n}`) !== null)).toEqual([true, true, true]);
    expect(c.spawned).toHaveLength(3);
    expect(c.lamps.bin1).toEqual([true]);

    c.dispenser.setWanted([]);
    expect(c.lamps).toEqual({ bin1: [true, false], bin2: [true, false], bin3: [true, false] });
  });

  it('withdraws the live piece of a bin that is no longer wanted, but not while a hand holds it', () => {
    const c = caddy([{ id: 'bin1', partId: 'a', stock: 2, x: 0.2 }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const piece = c.dispenser.liveOf('bin1')!;
    grab(piece);
    c.dispenser.setWanted([]);
    c.dispenser.update(1 / 72);
    expect(c.discarded).toEqual([]); // in a hand
    expect(c.dispenser.liveOf('bin1')).toBe(piece);

    letGo(piece);
    c.dispenser.update(1 / 72);
    expect(c.discarded).toEqual([piece]);
    expect(c.dispenser.liveOf('bin1')).toBeNull();
    expect(c.dispenser.stockOf('bin1')).toBe(2); // nothing was used
  });

  it('puts a seated piece back in its bin when its part comes out, and rolls it again', () => {
    const c = caddy([{ id: 'bin1', partId: 'washer', stock: 2, x: 0.2 }]);
    const h = housing(c.world, c.scene, [{ name: 'W', x: 0.05, accepts: ['washer'] }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const first = c.dispenser.liveOf('bin1')!;
    seatNow(c.world, first, h.entities.W);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect(c.dispenser.stockOf('bin1')).toBe(1);

    first.removeComponent(SnappedTo); // its part was pulled out: the hardware comes loose with it
    expect(types()).toEqual(['snapped', 'unsnapped']);
    expect(c.discarded).toEqual([first]);
    expect(c.dispenser.stockOf('bin1')).toBe(2);
  });

  it('puts the next bag in a bin with load, withdrawing a piece of the old part', () => {
    const c = caddy([{ id: 'bin1', partId: 'bush', stock: 2, x: 0.2 }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const bush = c.dispenser.liveOf('bin1')!;
    c.dispenser.load('bin1', 'washer', 5);
    expect(c.discarded).toEqual([bush]);
    expect(c.dispenser.stockOf('bin1')).toBe(5);
    expect(c.spawned).toHaveLength(2);
    expect(c.spawned[1].getValue(SnapPart, 'partId')).toBe('washer');
  });

  it('finds the live piece a socket could take, and nothing for another part', () => {
    const c = caddy([
      { id: 'bin1', partId: 'pin', stock: 1, x: 0.2 },
      { id: 'bin2', partId: 'screw', stock: 1, x: 0.24 },
    ]);
    c.dispenser.setWanted('all');
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    expect(c.dispenser.liveFor(['screw'])).toBe(c.dispenser.liveOf('bin2'));
    expect(c.dispenser.liveFor(['pin', 'screw'])).toBe(c.dispenser.liveOf('bin1'));
    expect(c.dispenser.liveFor(['washer'])).toBeUndefined();
  });

  it('stops listening and discards what waits at dispose', () => {
    const c = caddy([{ id: 'bin1', partId: 'pin', stock: 2, x: 0.2 }]);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const piece = c.dispenser.liveOf('bin1')!;
    c.dispenser.dispose();
    expect(c.discarded).toEqual([piece]);
    c.dispenser.setWanted(['bin1']); // nothing left to wake
    expect(c.spawned).toHaveLength(1);
  });
});

describe('TapToFasten (design §5.5)', () => {
  function bench() {
    const c = caddy([{ id: 'bin1', partId: 'washer_plain_8_brass', stock: 3, x: 0.2 }]);
    const h = housing(c.world, c.scene, [
      { name: 'WasherL1', x: 0, accepts: ['washer_plain_8_brass'] },
      { name: 'WasherL2', x: 0.007, accepts: ['washer_plain_8_brass'] },
      { name: 'Screw', x: 0.1, accepts: ['screw_slot_m3_polished_brass'] },
    ]);
    const sockets = new Map([
      ['washer_l1', h.entities.WasherL1],
      ['washer_l2', h.entities.WasherL2],
      ['screw', h.entities.Screw],
    ]);
    applyArming(sockets, ['washer_l1', 'washer_l2']);
    c.dispenser.setWanted(['bin1']);
    for (let i = 0; i < ROLL_FRAMES; i++) c.dispenser.update(1 / 72);
    const tap = new TapToFasten(c.world, c.dispenser);
    return { ...c, h, sockets, tap };
  }
  const rings = (node: Object3D): Object3D[] => node.children.filter((o) => o.name === 'TapRing');

  it('has no ring while gaze mode is off, rings on exactly the armed hardware sockets while it is on, and drops them when it ends', () => {
    const b = bench();
    b.tap.sync(b.sockets, ['washer_l1', 'washer_l2']);
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(0); // hands do not get tap-to-fasten

    setGazeModeFlag(true); // the mode change re-syncs by itself
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(1);
    expect(rings(b.h.nodes.WasherL2)).toHaveLength(1);
    expect(rings(b.h.nodes.Screw)).toHaveLength(0);
    b.tap.sync(b.sockets, ['washer_l2']); // L1 was filled: its ring goes, L2's stays
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(0);
    expect(rings(b.h.nodes.WasherL2)).toHaveLength(1);

    setGazeModeFlag(false);
    expect(rings(b.h.nodes.WasherL2)).toHaveLength(0);
    b.tap.dispose();
  });

  it('makes the ring 1.5 cm across at any scale and answers to the gaze pointer', () => {
    const b = bench();
    b.h.root.scale.setScalar(2); // a housing at twice the size: the collider is still 1.5 cm in the world
    b.h.root.updateMatrixWorld(true);
    setGazeModeFlag(true);
    b.tap.sync(b.sockets, ['washer_l1']);
    const ring = rings(b.h.nodes.WasherL1)[0] as Mesh;
    ring.updateMatrixWorld(true);
    expect(ring.getWorldScale(new Vector3()).x).toBeCloseTo(TAP_RING_RADIUS_M, 9);
    expect(TAP_RING_RADIUS_M).toBe(0.015);
    expect((ring.material as MeshBasicMaterial).visible).toBe(false); // invisible, still hit by rays
    b.tap.dispose();
  });

  it('seats the live piece in one pinch on the ring, and the next piece rolls up', () => {
    const b = bench();
    setGazeModeFlag(true);
    b.tap.sync(b.sockets, ['washer_l1', 'washer_l2']);
    const piece = b.dispenser.liveOf('bin1')!;
    (rings(b.h.nodes.WasherL2)[0] as Object3D).dispatchEvent({ type: 'click' } as never);
    expect(rec.intents).toMatchObject([{ type: 'snapped', socketName: 'WasherL2', partId: 'washer_plain_8_brass' }]);
    expect(piece.hasComponent(SnappedTo)).toBe(true);
    expect(b.h.entities.WasherL2.getValue(Socket, 'occupant')).toBe(piece);
    expect(b.dispenser.isRolling('bin1')).toBe(true);
    b.tap.dispose();
  });

  it('refuses a socket that is not armed, is taken, or wants a piece the caddy has not got live, and does nothing with gaze off', () => {
    const b = bench();
    setGazeModeFlag(true);
    expect(b.tap.fasten(b.h.entities.Screw)).toBe(false); // unarmed, and no screw is live
    expect(b.tap.fasten(b.h.entities.WasherL1)).toBe(true);
    expect(b.tap.fasten(b.h.entities.WasherL1)).toBe(false); // occupied now
    for (let i = 0; i < ROLL_FRAMES; i++) b.dispenser.update(1 / 72);
    applyArming(b.sockets, ['screw']);
    expect(b.tap.fasten(b.h.entities.Screw)).toBe(false); // armed, but the bin holds washers
    applyArming(b.sockets, ['washer_l2']);
    setGazeModeFlag(false);
    expect(b.tap.fasten(b.h.entities.WasherL2)).toBe(false);
    expect(types()).toEqual(['snapped']);
    b.tap.dispose();
  });

  it('uses a predicate of its own for the ray mode when the game passes one', () => {
    const b = bench();
    let ray = false;
    const tap = new TapToFasten(b.world, b.dispenser, () => ray);
    tap.sync(b.sockets, ['washer_l1']);
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(0);
    ray = true;
    tap.sync(b.sockets, ['washer_l1']);
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(1);
    tap.dispose();
    b.tap.dispose();
    expect(rings(b.h.nodes.WasherL1)).toHaveLength(0);
  });
});
