// ClockTowerNodes: binds the runtime's angles to named glTF nodes. A hand-built scene graph stands in for the loaded GLBs.

import { describe, expect, it } from 'vitest';
import { Group, Object3D, Quaternion, Vector3 } from 'three';
import {
  CLOCK_TOWER_NODE,
  ClockTowerNodes,
  ClockTowerRuntime,
  MOVEMENT_PARTS,
  movementNodeName,
  THEATRE_DOOR_NODE,
  THEATRE_DOOR_OPEN_RAD,
  TheatreDoors,
  trainRatios,
} from '../../../src/machines/clock-tower';
import type { TrainSocket } from '../../../src/machines/clock-tower';

const node = (name: string, parent: Object3D, x = 0, y = 0, z = 0): Object3D => {
  const o = new Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
};

/**
 * A tower with every driven node, the striker 3 cm to the right of its pivot, and the pendulum bob under the rod. As in
 * `clock_hands.glb` (`gen_clock_tower.py`: "the hour hand (root) and the minute hand"), the minute hand is a CHILD of the hour hand.
 */
function tower(minuteUnderHour = true) {
  const root = new Group();
  const n = CLOCK_TOWER_NODE;
  const hourHand = node(n.hourHand, root, 0, 0.2, 0.05);
  const parts = {
    pendulum: node(n.pendulum, root, 0, 0.1, 0.02),
    anchor: node(n.anchor, root, 0, 0.1, 0.02),
    escapeWheel: node(n.escapeWheel, root, 0, 0.08, 0),
    cam: node(n.cam, root, 0.02, 0.12, 0),
    hourHand,
    minuteHand: minuteUnderHour ? node(n.minuteHand, hourHand) : node(n.minuteHand, root, 0, 0.2, 0.05),
    bell: node(n.bell, root, 0, 0.3, 0),
    striker: node(n.striker, root, 0.03, 0.28, 0),
  };
  node(n.strikerPivot, root, 0, 0.28, 0);
  // The going train: one node per part, named by its solver socket (the hourly cam is `parts.cam`, which follows the hour).
  const train = Object.fromEntries(
    MOVEMENT_PARTS.filter((p) => p.socket !== 'hourly_cam').map((p) => [p.socket, node(movementNodeName(p.socket), root)] as const),
  ) as Record<TrainSocket, Object3D>;
  return { root, parts, train };
}

const rotationOf = (o: Object3D): number => 2 * Math.atan2(o.quaternion.z, o.quaternion.w);
const worldQ = new Quaternion();
/** `a` as an angle in (-PI, PI], so a quaternion's angle can be compared with a turn of more than half a revolution. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Rotation about +Z of a node in world space (the node's own turn and every parent's), in (-PI, PI]. */
const worldRotationOf = (o: Object3D): number => {
  o.getWorldQuaternion(worldQ);
  return wrap(2 * Math.atan2(worldQ.z, worldQ.w));
};

describe('ClockTowerNodes', () => {
  it('finds every node of a whole tower', () => {
    const { root } = tower();
    expect(new ClockTowerNodes().resolve(root)).toEqual([]);
  });

  it('names what is missing and keeps working without it', () => {
    const { root, parts } = tower();
    parts.bell.removeFromParent();
    const nodes = new ClockTowerNodes();
    expect(nodes.resolve(root)).toEqual([CLOCK_TOWER_NODE.bell]);
    const rt = new ClockTowerRuntime(() => new Date(2026, 10, 13, 3, 0, 0).getTime());
    rt.powered = true;
    rt.update();
    expect(() => nodes.apply(rt)).not.toThrow();
    expect(rotationOf(parts.hourHand)).toBeCloseTo(rt.hourHandZ, 9);
  });

  it('reports a striker pivot that is not there', () => {
    const { root } = tower();
    root.getObjectByName(CLOCK_TOWER_NODE.strikerPivot)?.removeFromParent();
    expect(new ClockTowerNodes().resolve(root)).toEqual([CLOCK_TOWER_NODE.strikerPivot]);
  });

  it('turns each node about +Z by the runtime angle, the pendulum and the anchor together', () => {
    const { root, parts } = tower();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => new Date(2026, 10, 13, 14, 20, 0).getTime());
    rt.powered = true;
    rt.update();
    rt.pendulumZ = 0.1;
    rt.escapeWheelZ = -0.7;
    nodes.apply(rt);
    expect(rotationOf(parts.pendulum)).toBeCloseTo(0.1, 9);
    expect(rotationOf(parts.anchor)).toBeCloseTo(0.1, 9);
    expect(rotationOf(parts.escapeWheel)).toBeCloseTo(-0.7, 9);
    expect(rotationOf(parts.hourHand)).toBeCloseTo(rt.hourHandZ, 9);
    expect(worldRotationOf(parts.minuteHand)).toBeCloseTo(wrap(rt.minuteHandZ), 9);
    expect(worldRotationOf(parts.minuteHand)).toBeCloseTo(-(2 * Math.PI) / 3, 9);
    expect(rotationOf(parts.cam)).toBeCloseTo(rt.hourlyCamZ, 9);
    // Nodes turning about their own origin do not move.
    expect(parts.hourHand.position.toArray()).toEqual([0, 0.2, 0.05]);
  });

  it('turns the going train with the escape wheel by the ratios of the solver: the barrel 5.76 times as far, the meshes reversing', () => {
    const { root, train } = tower();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => 0);
    rt.escapeWheelZ = -0.2;
    nodes.apply(rt);
    const turn = (socket: TrainSocket): number => rotationOf(train[socket]);
    const sign = (socket: TrainSocket): number => MOVEMENT_PARTS.find((p) => p.socket === socket)?.sign ?? 1;
    expect(turn('inter_gear_3')).toBeCloseTo(-0.2, 9); // on the wheel's axle
    expect(turn('inter_gear_2')).toBeCloseTo(0.2 * (24 / 10), 9); // the mesh reverses and the 10T runs 2.4 times as far
    expect(turn('large_gear')).toBeCloseTo(0.2 * (24 / 10), 9); // on inter_gear_2's axle
    expect(turn('inter_gear_1')).toBeCloseTo(-0.2 * (24 / 10) ** 2, 9);
    expect(turn('barrel')).toBeCloseTo(-0.2 * 5.76, 9);
    expect(sign('spring')).toBe(-1); // the spring is turned about: its +Z points to the back, so the world turn is the solver's
    expect(turn('spring')).toBeCloseTo(0.2 * 5.76, 9);
    expect(turn('drive_shaft')).toBeCloseTo(-0.2 * 5.76, 9);
    // They are the solver's ratios, not numbers of this file.
    const ratios = trainRatios();
    for (const socket of Object.keys(ratios) as TrainSocket[]) expect(turn(socket)).toBeCloseTo(-0.2 * ratios[socket] * sign(socket), 9);
  });

  it('holds the train still while the escape wheel is still, and puts it back at rest when resolved again', () => {
    const { root, train } = tower();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => 0);
    nodes.apply(rt);
    for (const node of Object.values(train)) expect(rotationOf(node)).toBe(0);
    rt.escapeWheelZ = -1.3;
    nodes.apply(rt);
    expect(rotationOf(train.barrel)).not.toBe(0);
    expect(nodes.resolve(root)).toEqual([]);
    for (const node of Object.values(train)) expect(rotationOf(node)).toBeCloseTo(0, 9);
  });

  it('names a part of the train that is missing and keeps turning the rest', () => {
    const { root, train } = tower();
    train.large_gear.removeFromParent();
    const nodes = new ClockTowerNodes();
    expect(nodes.resolve(root)).toEqual([movementNodeName('large_gear')]);
    const rt = new ClockTowerRuntime(() => 0);
    rt.escapeWheelZ = -0.5;
    expect(() => nodes.apply(rt)).not.toThrow();
    expect(rotationOf(train.barrel)).not.toBe(0);
  });

  it('shows the minute hand at its own angle although it is a child of the hour hand (the GLB hierarchy)', () => {
    for (const [h, m] of [[14, 20], [3, 0], [9, 45], [6, 30], [0, 5]] as const) {
      const { root, parts } = tower();
      const nodes = new ClockTowerNodes();
      nodes.resolve(root);
      const rt = new ClockTowerRuntime(() => new Date(2026, 10, 13, h, m, 0).getTime());
      rt.powered = true;
      rt.update();
      nodes.apply(rt);
      expect(worldRotationOf(parts.hourHand), `hour hand at ${h}:${m}`).toBeCloseTo(wrap(rt.hourHandZ), 9);
      expect(worldRotationOf(parts.minuteHand), `minute hand at ${h}:${m}`).toBeCloseTo(wrap(rt.minuteHandZ), 9);
    }
  });

  it('turns a minute hand that is a sibling of the hour hand by its own angle too', () => {
    const { root, parts } = tower(false);
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => new Date(2026, 10, 13, 14, 20, 0).getTime());
    rt.powered = true;
    rt.update();
    nodes.apply(rt);
    expect(worldRotationOf(parts.minuteHand)).toBeCloseTo(wrap(rt.minuteHandZ), 9);
    expect(worldRotationOf(parts.hourHand)).toBeCloseTo(wrap(rt.hourHandZ), 9);
  });

  it('starts from the rest pose again when resolved a second time (the clock stopped and was restarted)', () => {
    const { root, parts } = tower();
    parts.hourHand.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.3); // a rest pose that is not identity
    const hourRest = parts.hourHand.quaternion.clone();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => 0);
    rt.hourHandZ = -1;
    rt.minuteHandZ = -2;
    rt.strikerZ = 0.4;
    rt.pendulumZ = 0.1;
    nodes.apply(rt); // the first run leaves the nodes turned
    expect(nodes.resolve(root)).toEqual([]); // the second run looks them up again
    rt.hourHandZ = 0;
    rt.minuteHandZ = 0;
    rt.strikerZ = 0;
    rt.pendulumZ = 0;
    nodes.apply(rt);
    expect(parts.hourHand.quaternion.angleTo(hourRest)).toBeLessThan(1e-6);
    expect(parts.minuteHand.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(parts.pendulum.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(parts.striker.position.distanceTo(new Vector3(0.03, 0.28, 0))).toBeLessThan(1e-9);
    // And a turn on the second run is the turn asked for, not added to the first.
    rt.hourHandZ = -1;
    nodes.apply(rt);
    expect(rotationOf(parts.hourHand)).toBeCloseTo(0.3 - 1, 9);
  });

  it('swings the striker about PIV_Striker, not about its own origin', () => {
    const { root, parts } = tower();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => 0);
    rt.strikerZ = Math.PI / 2;
    nodes.apply(rt);
    // 3 cm right of the pivot, a quarter turn counter-clockwise: 3 cm above it.
    expect(parts.striker.position.x).toBeCloseTo(0, 9);
    expect(parts.striker.position.y).toBeCloseTo(0.28 + 0.03, 9);
    expect(parts.striker.position.z).toBe(0);
    expect(rotationOf(parts.striker)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('returns every node to its rest pose when all angles are zero', () => {
    const { root, parts } = tower();
    parts.hourHand.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.3); // a rest pose that is not identity
    const rest = parts.hourHand.quaternion.clone();
    const nodes = new ClockTowerNodes();
    nodes.resolve(root);
    const rt = new ClockTowerRuntime(() => 0);
    rt.strikerZ = 0.4;
    rt.hourHandZ = 1;
    nodes.apply(rt);
    rt.strikerZ = 0;
    rt.hourHandZ = 0;
    nodes.apply(rt);
    expect(parts.hourHand.quaternion.angleTo(rest)).toBeLessThan(1e-6);
    expect(parts.striker.position.distanceTo(new Vector3(0.03, 0.28, 0))).toBeLessThan(1e-9);
    expect(parts.striker.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });
});

describe('TheatreDoors', () => {
  const facade = () => {
    const root = new Group();
    const left = node(THEATRE_DOOR_NODE.left, root, 0.05, 0.006, 0.015);
    const right = node(THEATRE_DOOR_NODE.right, root, 0.095, 0.006, 0.015);
    return { root, left, right };
  };
  const yaw = (o: Object3D): number => 2 * Math.atan2(o.quaternion.y, o.quaternion.w);

  it('opens the left leaf +100 degrees and the right -100 degrees about Y, in proportion to the amount', () => {
    const { root, left, right } = facade();
    const doors = new TheatreDoors();
    expect(doors.resolve(root)).toEqual([]);
    doors.apply(1);
    expect(yaw(left)).toBeCloseTo(THEATRE_DOOR_OPEN_RAD, 9);
    expect(yaw(right)).toBeCloseTo(-THEATRE_DOOR_OPEN_RAD, 9);
    expect(THEATRE_DOOR_OPEN_RAD).toBeCloseTo((100 * Math.PI) / 180, 12);
    doors.apply(0.5);
    expect(yaw(left)).toBeCloseTo(THEATRE_DOOR_OPEN_RAD / 2, 9);
    doors.apply(0);
    expect(left.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(left.position.toArray()).toEqual([0.05, 0.006, 0.015]);
  });

  it('follows the runtime through the 30 seconds and ends shut', () => {
    const { root, left } = facade();
    const doors = new TheatreDoors();
    doors.resolve(root);
    let now = new Date(2026, 10, 13, 14, 59, 59).getTime();
    const rt = new ClockTowerRuntime(() => now);
    rt.powered = true;
    rt.update();
    let widest = 0;
    for (let i = 0; i < 40 * 20; i++) {
      now += 50;
      rt.update();
      doors.apply(rt.doorsAmount);
      widest = Math.max(widest, yaw(left));
    }
    expect(widest).toBeCloseTo(THEATRE_DOOR_OPEN_RAD, 6);
    expect(yaw(left)).toBe(0);
  });

  it('starts from the shut pose again when resolved a second time', () => {
    const { root, left, right } = facade();
    const doors = new TheatreDoors();
    doors.resolve(root);
    doors.apply(1);
    expect(doors.resolve(root)).toEqual([]);
    doors.apply(0);
    expect(left.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    expect(right.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
  });

  it('names a missing pivot and skips it', () => {
    const { root, right } = facade();
    right.removeFromParent();
    const doors = new TheatreDoors();
    expect(doors.resolve(root)).toEqual([THEATRE_DOOR_NODE.right]);
    expect(() => doors.apply(1)).not.toThrow();
  });
});
