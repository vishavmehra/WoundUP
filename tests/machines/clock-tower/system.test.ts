// ClockTowerSystem in a real IWSDK world (no browser): it drives the tower an entity owns, it follows a tower that replaces another (a gift shown
// again: entities are pooled, so the new tower can come back on the entity of the old one), and `startClockTower` makes a shown tower run.

import { World } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { Group, Object3D, Scene } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { ClockTowerRigComponent, ClockTowerSystem, clockTowerEvents, setClockTowerClock, startClockTower } from '../../../src/machines/clock-tower';
import { createRig } from '../../../src/town/motion';

let now = new Date(2026, 10, 15, 3, 0, 0).getTime();
const FRAME = 1 / 72;
let t = 0;
/** One frame: the clock moves by one frame too. */
function step(world: World, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    now += FRAME * 1000;
    t += FRAME;
    world.update(FRAME, t);
  }
}

/** A tower with only its pendulum, a node the system turns. */
function tower(): { root: Group; pendulum: Object3D } {
  const root = new Group();
  const pendulum = new Object3D();
  pendulum.name = 'Pendulum_Rod';
  root.add(pendulum);
  return { root, pendulum };
}
const swing = (o: Object3D): number => 2 * Math.atan2(o.quaternion.z, o.quaternion.w);

function setup(): World {
  const world = new World();
  Object.assign(world, { scene: new Scene() });
  world.registerComponent(ClockTowerRigComponent);
  world.registerSystem(ClockTowerSystem, { priority: 20 });
  return world;
}

const unsubscribe: Array<() => void> = [];
afterEach(() => {
  while (unsubscribe.length) unsubscribe.pop()?.();
  setClockTowerClock(Date.now);
});

describe('ClockTowerSystem', () => {
  it('swings the pendulum of the tower an entity owns, once it is powered, and holds it still before', () => {
    now = new Date(2026, 10, 15, 3, 0, 0).getTime();
    setClockTowerClock(() => now);
    const world = setup();
    const { root, pendulum } = tower();
    const entity = world.createEntity();
    entity.object3D = root;
    entity.addComponent(ClockTowerRigComponent, { powered: false });
    step(world, 80);
    expect(swing(pendulum)).toBe(0);
    entity.setValue(ClockTowerRigComponent, 'powered', true);
    let widest = 0;
    for (let i = 0; i < 200; i++) {
      step(world);
      widest = Math.max(widest, Math.abs(swing(pendulum)));
    }
    expect(widest).toBeGreaterThan(0.1);
  });

  it('drives a tower that replaces another, also when the entity of the old one is handed to the new one', () => {
    now = new Date(2026, 10, 15, 3, 0, 0).getTime();
    setClockTowerClock(() => now);
    const world = setup();
    const first = tower();
    const a = world.createEntity();
    a.object3D = first.root;
    a.addComponent(ClockTowerRigComponent, { powered: true });
    step(world, 120);
    expect(Math.abs(swing(first.pendulum))).toBeGreaterThan(0);

    a.destroy();
    const second = tower();
    const b: Entity = world.createEntity();
    b.object3D = second.root;
    b.addComponent(ClockTowerRigComponent, { powered: true });
    const before = swing(first.pendulum);
    let widest = 0;
    for (let i = 0; i < 200; i++) {
      step(world);
      widest = Math.max(widest, Math.abs(swing(second.pendulum)));
    }
    expect(widest).toBeGreaterThan(0.1); // the new tower swings
    expect(swing(first.pendulum)).toBe(before); // the old one is left as it was
  });

  it('startClockTower registers the system when the world has none, runs the tower and rings the hour once at the start', () => {
    now = new Date(2026, 10, 15, 3, 0, 0).getTime(); // three o'clock
    setClockTowerClock(() => now);
    const world = new World();
    Object.assign(world, { scene: new Scene() });
    world.registerComponent(ClockTowerRigComponent);
    expect(world.getSystem(ClockTowerSystem)).toBeUndefined();
    const strikes: Array<[number, number]> = [];
    unsubscribe.push(clockTowerEvents.subscribe({ strike: (index, total) => strikes.push([index, total]) }));

    const { root, pendulum } = tower();
    const rig = createRig('clock_tower', root);
    const entity = startClockTower(world, rig, { strikeOnStart: true });
    expect(world.getSystem(ClockTowerSystem)).toBeDefined();
    expect(entity.object3D).toBe(root);
    expect(entity.getValue(ClockTowerRigComponent, 'powered')).toBe(true);
    step(world, 5 * 72); // five seconds: strikes at 0 s, 2 s, 4 s
    expect(strikes).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(Math.abs(swing(pendulum))).toBeGreaterThan(0);

    startClockTower(world, createRig('clock_tower', tower().root)); // a second call keeps the one system
    expect(world.getSystem(ClockTowerSystem)).toBeDefined();
  });

  it('does not ring at the start unless asked', () => {
    now = new Date(2026, 10, 15, 3, 0, 0).getTime();
    setClockTowerClock(() => now);
    const world = new World();
    Object.assign(world, { scene: new Scene() });
    world.registerComponent(ClockTowerRigComponent);
    const strikes: number[] = [];
    unsubscribe.push(clockTowerEvents.subscribe({ strike: (index) => strikes.push(index) }));
    startClockTower(world, createRig('clock_tower', tower().root));
    step(world, 5 * 72);
    expect(strikes).toEqual([]);
  });
});
