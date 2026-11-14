import { Group, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import {
  advance,
  applyRotor,
  approach,
  axisOfGlb,
  createHinge,
  createRig,
  createRotor,
  horseBob,
  horsePhase,
  SCALE_EASE_S,
  stepRig,
  stepScaler,
  turnHinge,
  twinkle,
  wuField,
} from '../../src/town/motion';

const FRAME = 1 / 72;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const turn = (axis: Vector3, angle: number): Quaternion => new Quaternion().setFromAxisAngle(axis, angle);

describe('motion maths', () => {
  it('integrates the solver speed: theta += omega * dt', () => {
    expect(advance(1, 0.5, 2)).toBe(2);
    let theta = 0;
    for (let i = 0; i < 72; i++) theta = advance(theta, 0.4, FRAME);
    expect(theta).toBeCloseTo(0.4, 10); // one second at 0.4 rad/s
  });

  it('approaches a target exponentially and independently of the frame time', () => {
    const coarse = approach(0, 1, 1, 0.6);
    let fine = 0;
    for (let i = 0; i < 100; i++) fine = approach(fine, 1, 0.01, 0.6);
    expect(coarse).toBeCloseTo(1 - Math.exp(-1 / 0.6), 10);
    expect(fine).toBeCloseTo(coarse, 6);
    expect(approach(0.5, 0.5, 1, 0.6)).toBe(0.5);
  });

  it('spaces the horses a third of a turn apart and bobs one cycle per platform turn', () => {
    expect([0, 1, 2].map((i) => horsePhase(i, 3))).toEqual([0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]);
    expect(horseBob(0, 0, 0.006)).toBeCloseTo(0, 10);
    expect(horseBob(Math.PI / 2, 0, 0.006)).toBeCloseTo(0.006, 10);
    expect(horseBob(2 * Math.PI, 1, 0.006)).toBeCloseTo(horseBob(0, 1, 0.006), 10);
  });

  it('twinkles around 1', () => {
    expect(twinkle(0, 0, 5, 0.2)).toBe(1);
    expect(twinkle(1, 0.3, 5, 0)).toBe(1);
    for (let t = 0; t < 3; t += 0.1) expect(Math.abs(twinkle(t, 1, 5.5, 0.18) - 1)).toBeLessThanOrEqual(0.18 + 1e-9);
  });

  it('reads the rotation axis a GLB states, default +Z', () => {
    const node = (axis: unknown): Object3D => Object.assign(new Object3D(), { userData: { wu: { rotationAxis: axis } } });
    expect(axisOfGlb(node('+Y'))).toBe('y');
    expect(axisOfGlb(node('-X'))).toBe('x');
    expect(axisOfGlb(node('+Z'))).toBe('z');
    expect(axisOfGlb(node('diagonal'))).toBe('z');
    expect(axisOfGlb(node(7))).toBe('z');
    expect(axisOfGlb(new Object3D())).toBe('z');
  });

  it('finds the axis on the root node of the file, one level under the scene group GLTFLoader returns (the carousel platform turns about +Y)', () => {
    const scene = new Group();
    const root = Object.assign(new Object3D(), { userData: { wu: { id: 'carousel_platform', rotationAxis: '+Y' } } });
    scene.add(root);
    expect(axisOfGlb(scene)).toBe('y');
    expect(wuField(scene, 'id')).toBe('carousel_platform');
    expect(wuField(scene, 'missing')).toBeUndefined();
    const deeper = new Group();
    deeper.add(new Group().add(root.clone()));
    expect(axisOfGlb(deeper)).toBe('z'); // only the node and its direct children are read
  });
});

describe('stepRig', () => {
  it('turns a rotor by the solver angular velocity, eased up from rest, never by a baked clip', () => {
    const node = new Object3D();
    const rig = createRig('windmill', new Group());
    const rotor = createRotor(node, 'sails');
    rig.rotors.push(rotor);
    rig.result = { angularVelocity: { sails: 0.5 } };
    stepRig(rig, FRAME, 0);
    expect(rig.speed).toBeGreaterThan(0);
    expect(rotor.theta).toBeGreaterThan(0);
    expect(rotor.theta).toBeLessThan(0.5 * FRAME);
    for (let i = 0; i < 72 * 5; i++) stepRig(rig, FRAME, i * FRAME);
    expect(rig.speed).toBeCloseTo(1, 3);
    const before = rotor.theta;
    for (let i = 0; i < 72; i++) stepRig(rig, FRAME, 0);
    expect(rotor.theta - before).toBeCloseTo(0.5, 2); // one second at 0.5 rad/s
    expect(node.quaternion.angleTo(turn(Z, rotor.theta))).toBeLessThan(1e-6);
  });

  it('turns about the GLB axis, from the rest pose, and reads each socket separately', () => {
    const platform = new Object3D();
    platform.quaternion.copy(turn(X, -Math.PI / 2));
    const rig = createRig('carousel', new Group());
    rig.speed = 1;
    rig.rotors.push(createRotor(platform, 'platform', { axis: 'y' }), createRotor(new Object3D(), 'other'));
    rig.result = { angularVelocity: { platform: 1, other: 0 } };
    stepRig(rig, 0.5, 0);
    const expected = turn(X, -Math.PI / 2).multiply(turn(Y, 0.5));
    expect(platform.quaternion.angleTo(expected)).toBeLessThan(1e-6);
    expect(rig.rotors[1].theta).toBe(0);
  });

  it('overlays the angle on a pose another system wrote this frame', () => {
    const node = new Object3D();
    const rotor = createRotor(node, 'x', { mode: 'overlay' });
    rotor.theta = 0.3;
    node.quaternion.copy(turn(X, 0.2));
    applyRotor(rotor);
    expect(node.quaternion.angleTo(turn(X, 0.2).multiply(turn(Z, 0.3)))).toBeLessThan(1e-6);
  });

  it('stops when the machine stops, and does not move without a solver result', () => {
    const rig = createRig('music_box', new Group());
    rig.speed = 1;
    const rotor = createRotor(new Object3D(), 'cylinder');
    rig.rotors.push(rotor);
    stepRig(rig, 0.5, 0);
    expect(rotor.theta).toBe(0);
    rig.result = { angularVelocity: { cylinder: 0.4 } };
    rig.running = false;
    for (let i = 0; i < 72 * 6; i++) stepRig(rig, FRAME, 0);
    expect(rig.speed).toBe(0);
    const stopped = rotor.theta;
    stepRig(rig, 1, 0);
    expect(rotor.theta).toBe(stopped);
  });

  it('bobs the horses with the platform, opens and closes the lid, and twinkles the lamps', () => {
    const rig = createRig('carousel', new Group());
    rig.speed = 1;
    const platform = createRotor(new Object3D(), 'platform');
    platform.theta = Math.PI / 2;
    rig.rotors.push(platform);
    const horse = new Object3D();
    rig.bobbers.push({ node: horse, driver: platform, baseY: 0.006, phase: 0, amplitude: 0.006 });
    const lamp = new Object3D();
    rig.pulsers.push({ node: lamp, phase: 0, amplitude: 0.2, speed: 5, baseScale: 1 });
    const pivot = new Object3D();
    const lid = { pivot, rest: pivot.quaternion.clone(), openRad: 1.5, angle: 0 };
    rig.lid = lid;
    rig.result = { angularVelocity: { platform: 0 } };
    stepRig(rig, 0.1, 0.3);
    expect(horse.position.y).toBeCloseTo(0.012, 6);
    expect(lamp.scale.x).not.toBe(1);
    expect(lid.angle).toBeGreaterThan(0);
    for (let i = 0; i < 72 * 4; i++) stepRig(rig, FRAME, 0);
    expect(lid.angle).toBeCloseTo(1.5, 2);
    rig.running = false;
    for (let i = 0; i < 72 * 4; i++) stepRig(rig, FRAME, 0);
    expect(lid.angle).toBeCloseTo(0, 2);
  });
});

describe('stepScaler', () => {
  it('eases a node to the town scale, then reports arrival and lands exactly', () => {
    const node = new Object3D();
    const scaler = { node, target: 0.75 };
    expect(stepScaler(scaler, FRAME)).toBe(false);
    expect(node.scale.x).toBeLessThan(1);
    expect(node.scale.x).toBeGreaterThan(0.75);
    let frames = 0;
    while (!stepScaler(scaler, FRAME) && frames++ < 72 * 5);
    expect(node.scale.toArray()).toEqual([0.75, 0.75, 0.75]);
    expect(frames / 72).toBeLessThan(SCALE_EASE_S * 12);
  });

  it('goes back to 1:1 when the machine is lifted', () => {
    const node = new Object3D();
    node.scale.setScalar(0.75);
    const scaler = { node, target: 1 };
    while (!stepScaler(scaler, FRAME));
    expect(node.scale.toArray()).toEqual([1, 1, 1]);
  });
});

describe('rig updaters (ADR-048)', () => {
  it('runs each updater once a frame after the rotors have turned, in order, with the frame time', () => {
    const rig = createRig('well', new Group());
    const node = new Object3D();
    rig.root.add(node);
    const rotor = createRotor(node, 'cam');
    rig.rotors.push(rotor);
    rig.result = { angularVelocity: { cam: -2 } };
    rig.speed = 1;
    const seen: Array<[string, number, number]> = [];
    rig.updaters.push((r, dt) => void seen.push(['a', dt, r.rotors[0].theta]));
    rig.updaters.push((_r, _dt, time) => void seen.push(['b', time, 0]));
    stepRig(rig, 0.5, 7);
    expect(seen[0][0]).toBe('a');
    expect(seen[0][1]).toBe(0.5);
    expect(seen[0][2]).toBeCloseTo(-1, 6); // the rotor had already advanced by omega * dt (the spin-up ease is a hair under 1)
    expect(seen[1]).toEqual(['b', 7, 0]);
  });

  it('starts every rig not bakeable, not restored, with no audio and nothing moving', () => {
    const rig = createRig('belfry', new Group());
    expect(rig).toMatchObject({ bakeable: false, restored: false, audio: null, updaters: [], moving: [] });
  });
});

describe('hinges', () => {
  /** A bell-like node: its origin at the top, a pivot empty a little below it. */
  function bell(): { root: Group; node: Object3D } {
    const root = new Group();
    const node = new Object3D();
    node.name = 'Bell';
    node.position.set(0.02, 0.27, 0);
    const pivot = new Object3D();
    pivot.name = 'PIV_Swing';
    pivot.position.set(0, -0.0015, 0); // 1.5 mm below the node's origin, in its own frame
    node.add(pivot);
    root.add(node);
    return { root, node };
  }

  it('turns a node about its own origin when no pivot is named, from the pose it was found in', () => {
    const { root, node } = bell();
    node.quaternion.copy(turn(Z, 0.3));
    const hinge = createHinge(root, 'Bell')!;
    turnHinge(hinge, 0.1);
    expect(node.quaternion.angleTo(turn(Z, 0.4))).toBeLessThan(1e-6);
    expect(node.position.toArray()).toEqual([0.02, 0.27, 0]);
    turnHinge(hinge, 0);
    expect(node.quaternion.angleTo(turn(Z, 0.3))).toBeLessThan(1e-6);
  });

  it('swings a node about the pivot empty: the origin moves along the arc and comes back at zero', () => {
    const { root, node } = bell();
    const hinge = createHinge(root, 'Bell', 'PIV_Swing')!;
    turnHinge(hinge, 0.12);
    // the pivot is 1.5 mm under the node's origin (the empty is turned with the node; the node is not): the origin swings round it by 0.12 rad
    const r = 0.0015;
    expect(Math.hypot(node.position.x - 0.02, node.position.y - 0.27)).toBeCloseTo(2 * r * Math.sin(0.06), 9); // the chord of a 0.12 rad arc
    expect(node.quaternion.angleTo(turn(Z, 0.12))).toBeLessThan(1e-6);
    turnHinge(hinge, 0);
    expect(node.position.distanceTo(new Vector3(0.02, 0.27, 0))).toBeLessThan(1e-12);
  });

  it('answers null for a node or a pivot that is not there, so a missing empty is reported rather than guessed', () => {
    const { root } = bell();
    expect(createHinge(root, 'Nope')).toBeNull();
    expect(createHinge(root, 'Bell', 'PIV_Nope')).toBeNull();
    expect(createHinge(root, 'Bell', 'PIV_Swing')).not.toBeNull();
  });
});
