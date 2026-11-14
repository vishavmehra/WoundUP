import { Mesh, Quaternion, Raycaster, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAROUSEL, MUSIC_BOX, solveAssembly, WINDMILL } from '../../src/content/blueprints';
import type { MachineBlueprint } from '../../src/content/blueprints';
import { Winding } from '../../src/debug/demo';
import { MAX_WIND_UNITS } from '../../src/sim';
import type { SolveResult } from '../../src/sim';
import { BLUEPRINT_SOCKET_IDS, buildMachine } from '../../src/town/machines';
import { createRig, createRotor, horseBob, horsePhase, stepRig } from '../../src/town/motion';
import type { MachineRig, Rotor } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import { loadTown } from '../../src/town/scene';
import { createWakeUniforms } from '../../src/town/wake-shader';
import { libraryRegistry } from './helpers';
import { modelsPresent, realSource } from './real-source';

/**
 * The finished machines in motion, on the real GLBs parsed in Node: for each machine, every part that should turn does turn,
 * about the shaft it sits on, at the speed the solver gives it, in the direction the solver gives it; meshing gears interlock
 * all the way round; what should be still is still; and it all stops when the spring is spent. Speeds are measured from the
 * orientation each node actually has after `stepRig`, not read back from the rig's own bookkeeping.
 */
const FRAME = 1 / 60;
const SLOW = 90_000; // parsing GLBs and ray casting gears

function solved(blueprint: MachineBlueprint, assembly: Readonly<Record<string, string>> = blueprint.intended, windUnits: number = MAX_WIND_UNITS, nodeAngles?: Record<string, number>): SolveResult {
  const outcome = solveAssembly(blueprint, assembly, windUnits, nodeAngles);
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.errors));
  return outcome.result;
}

const build = async (id: 'music_box' | 'carousel' | 'windmill'): Promise<MachineRig> => {
  const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
  if (!rig) throw new Error(`no ${id}`);
  return rig;
};

/** A rig already at full speed: the spin-up ease has its own test. One zero-length step poses the rest phases and the lid. */
function started(rig: MachineRig, result: SolveResult): MachineRig {
  rig.result = result;
  rig.running = true;
  rig.speed = 1;
  stepRig(rig, 0, 0);
  rig.root.updateMatrixWorld(true);
  return rig;
}

function frames(rig: MachineRig, seconds: number, from = 0): number {
  const n = Math.round(seconds / FRAME);
  for (let i = 1; i <= n; i++) stepRig(rig, FRAME, from + i * FRAME);
  rig.root.updateMatrixWorld(true);
  return from + n * FRAME;
}

/** Signed turn of `rotor.node` about its own axis since `before`, radians. */
const turned = (rotor: Rotor, before: Quaternion): number => {
  const d = before.clone().invert().multiply(rotor.node.quaternion);
  return 2 * Math.atan2(d[rotor.axis], d.w);
};

/** The angular velocity each rotor shows over the next frame, rad/s. */
function measure(rig: MachineRig, time: number): number[] {
  const before = rig.rotors.map((r) => r.node.quaternion.clone());
  stepRig(rig, FRAME, time + FRAME);
  rig.root.updateMatrixWorld(true);
  return rig.rotors.map((r, i) => turned(r, before[i]) / FRAME);
}

const worldAxis = (rotor: Rotor): Vector3 => {
  const local = new Vector3(rotor.axis === 'x' ? 1 : 0, rotor.axis === 'y' ? 1 : 0, rotor.axis === 'z' ? 1 : 0);
  return local.transformDirection(rotor.node.matrixWorld);
};
const worldPoint = (node: Object3D): Vector3 => new Vector3().setFromMatrixPosition(node.matrixWorld);

/** Outer radius of the part about its own origin, at `bins` angles round its axis (+X in the Music Box frame), by ray casting. */
function outline(node: Object3D, bins = 1440): { centre: Vector3; radius: Float64Array } {
  const centre = worldPoint(node);
  const meshes: Mesh[] = [];
  node.traverse((o) => void ((o as Mesh).isMesh && meshes.push(o as Mesh)));
  const caster = new Raycaster();
  const radius = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    const a = (k / bins) * 2 * Math.PI - Math.PI;
    const dir = new Vector3(0, Math.cos(a), Math.sin(a));
    caster.set(centre.clone().addScaledVector(dir, 0.1), dir.clone().negate());
    caster.far = 0.2;
    const hit = caster.intersectObjects(meshes, false)[0];
    radius[k] = hit ? 0.1 - hit.distance : 0;
  }
  return { centre, radius };
}

/** How far (metres) the outline of `b` cuts into the outline of `a`: 0 when the teeth interlock. */
function overlap(a: ReturnType<typeof outline>, b: ReturnType<typeof outline>): number {
  const bins = a.radius.length;
  let worst = 0;
  for (let k = 0; k < bins; k++) {
    const rb = b.radius[k];
    if (rb <= 0) continue;
    const angle = (k / bins) * 2 * Math.PI - Math.PI;
    const y = b.centre.y - a.centre.y + rb * Math.cos(angle);
    const z = b.centre.z - a.centre.z + rb * Math.sin(angle);
    const into = Math.floor(((((Math.atan2(z, y) + Math.PI) / (2 * Math.PI)) % 1) + 1) % 1 * bins) % bins;
    worst = Math.max(worst, a.radius[into] - Math.hypot(y, z));
  }
  return worst;
}

/** Every blueprint socket whose origin is within 1 mm of the rotor's node: the geometry says which solver node a part is. */
const socketsAt = (rotor: Rotor): string[] => {
  const at = worldPoint(rotor.node);
  return MUSIC_BOX.sockets.filter((s) => s.position && at.distanceTo(new Vector3(...s.position)) < 0.001).map((s) => s.id);
};

describe.skipIf(!modelsPresent)('the Music Box in motion', () => {
  const result = solved(MUSIC_BOX);
  let rig: MachineRig;
  beforeAll(async () => {
    rig = started(await build('music_box'), result);
  }, SLOW);

  it('is wound to eight units with the standard spring, and the solver is happy with it', () => {
    expect(result.status).toBe('runs');
    expect(result.runSeconds).toBeGreaterThan(MUSIC_BOX.targets.minRunSeconds ?? 0);
    expect(result.angularVelocity.main_spring).toBeCloseTo(0.8, 9);
    expect(result.angularVelocity.cylinder).toBeCloseTo(-0.4, 9);
  });

  it('turns every part that holds a solver node at that node\'s speed and sign, about the +X shaft, each in its own place', () => {
    const speeds = measure(rig, 0);
    const matched = new Map<string, number>();
    rig.rotors.forEach((rotor, i) => {
      const sockets = socketsAt(rotor);
      expect(sockets.length, `rotor ${rotor.socketId} sits on a blueprint socket`).toBeGreaterThan(0);
      for (const id of sockets) {
        // The key sits on the spring's arbor: it is not in the solver's graph (speed 0) and unwinds with the spring.
        const expected = id === 'winding_key' ? result.angularVelocity.main_spring : result.angularVelocity[id];
        expect(speeds[i], `${id} (rotor ${rotor.socketId})`).toBeCloseTo(expected, 6);
        matched.set(id, speeds[i]);
      }
      expect(Math.abs(worldAxis(rotor).x), `${rotor.socketId} axis`).toBeGreaterThan(1 - 1e-9);
    });
    expect([...matched.keys()].sort()).toEqual(
      ['arbor', 'cylinder', 'cylinder_wheel', 'governor', 'governor_pinion', 'governor_wheel', 'main_spring', 'spring_pinion', 'winding_key'].sort(),
    );
    // Not all zero and not all the same: this is a train of different speeds and both senses.
    expect(matched.get('main_spring')).toBeCloseTo(0.8, 6);
    expect(matched.get('cylinder')).toBeCloseTo(-0.4, 6);
    expect(matched.get('governor')).toBeCloseTo(0.5333333, 6);
    expect(matched.get('winding_key')).toBeCloseTo(0.8, 6); // the key unwinds, turning as the spring does
  });

  it('turns meshing gears opposite ways at the inverse of their tooth ratio', () => {
    const speed = (id: string): number => measure(rig, 1)[rig.rotors.findIndex((r) => r.socketId === id)];
    const [pinion, wheel] = [speed('spring_pinion'), speed('cylinder_wheel')];
    expect(Math.sign(pinion)).toBe(-Math.sign(wheel));
    expect(wheel).toBeCloseTo((-pinion * 10) / 20, 6); // 10T drives 20T
    const [governorWheel, governorPinion] = [speed('governor_wheel'), speed('governor_pinion')];
    expect(Math.sign(governorWheel)).toBe(-Math.sign(governorPinion));
    expect(governorPinion).toBeCloseTo((-governorWheel * 16) / 12, 6); // 16T drives 12T
  });

  it('turns each part about its own centre (a wobbling gear would swing its teeth about)', () => {
    for (const rotor of rig.rotors) {
      if (rotor.socketId === 'governor' || rotor.socketId === 'main_spring') continue; // a flyweight pair and a coil are not discs
      const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
      const inverse = rotor.node.matrixWorld.clone().invert();
      rotor.node.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox as { min: Vector3; max: Vector3 };
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const p = new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
          box.min.min(p);
          box.max.max(p);
        }
      });
      const across = Math.hypot((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2);
      expect(across, `${rotor.socketId} centre off its axis`).toBeLessThan(0.0002);
    }
  });

  it('moves only the turning parts and the lid; the case, brackets and comb stay put', () => {
    const nodes: Object3D[] = [];
    rig.root.traverse((o) => nodes.push(o));
    const before = nodes.map((o) => o.matrixWorld.clone());
    frames(rig, 0.5, 2);
    const moving = new Set<Object3D>();
    for (const root of [...rig.rotors.map((r) => r.node), rig.lid?.pivot as Object3D]) root.traverse((o) => moving.add(o));
    const strays = nodes.filter((o, i) => !moving.has(o) && !o.matrixWorld.equals(before[i])).map((o) => o.name);
    expect(strays).toEqual([]);
    expect(nodes.filter((o) => (o as Mesh).isMesh && !moving.has(o)).length).toBeGreaterThan(2); // the case, the brackets and the comb are there to be still
  });

  it('opens the lid clear of the mechanism while it runs, and shuts it when it stops', () => {
    const lid = rig.root.getObjectByName('MusicBoxCase_Lid') as Object3D;
    const hinge = rig.lid;
    if (!hinge) throw new Error('no lid');
    frames(rig, 3, 3);
    expect(hinge.angle).toBeGreaterThan(hinge.openRad * 0.99);
    const lidBox = new Box(lid);
    const mechanism = new Box(rig.rotors.find((r) => r.socketId === 'cylinder')?.node as Object3D);
    expect(lidBox.min.y, 'the open lid is above the cylinder').toBeGreaterThan(mechanism.max.y);
    expect(lidBox.max.z, 'and behind the hinge').toBeLessThan(hinge.pivot.position.z + 0.001);
    rig.running = false;
    frames(rig, 4, 6);
    expect(hinge.angle).toBeLessThan(hinge.openRad * 0.01);
    rig.running = true;
  });

  it('keeps every gear pair interlocked through the turn (the teeth never cut into each other)', () => {
    const at = (id: string): Object3D => rig.rotors.find((r) => r.socketId === id)?.node as Object3D;
    const pairs: ReadonlyArray<readonly [string, string]> = [['cylinder_wheel', 'spring_pinion'], ['governor_wheel', 'governor_pinion']];
    let time = 12;
    for (const sample of [0, 1, 2]) {
      for (const [driven, driver] of pairs) {
        expect(overlap(outline(at(driven)), outline(at(driver))) * 1000, `${driver} in ${driven}, sample ${sample}`).toBeLessThan(0.1); // mm
      }
      time = frames(rig, 2.37, time); // an odd stretch of time, so the teeth are in no special position
    }
    // The measure can fail: a pinion left half a tooth out of phase cuts in by more than a millimetre.
    const pinion = rig.rotors.find((r) => r.socketId === 'governor_pinion') as Rotor;
    pinion.theta += Math.PI / 12; // half the pitch of 12 teeth
    stepRig(rig, 0, time);
    rig.root.updateMatrixWorld(true);
    expect(overlap(outline(at('governor_wheel')), outline(at('governor_pinion'))) * 1000).toBeGreaterThan(1);
    pinion.theta -= Math.PI / 12;
  }, SLOW);
});

describe.skipIf(!modelsPresent)('a Music Box with a worn spring', () => {
  it('turns while the spring lasts (about 1.5 s), then runs down to a stop and is wound again', async () => {
    const worn = (MUSIC_BOX.sockets.find((s) => s.id === 'main_spring')?.acceptedPartIds ?? [])[1];
    const result = solved(MUSIC_BOX, { ...MUSIC_BOX.intended, main_spring: worn });
    expect(result.status).toBe('runs_wrong');
    expect(result.runSeconds).toBeCloseTo(1.5, 1);

    const rig = await build('music_box');
    rig.root.updateMatrixWorld(true);
    const key = rig.rotors.find((r) => worldPoint(r.node).x > 0.059) as Rotor; // the key is the part furthest to the right
    const winding = new Winding(rig, result);
    stepRig(rig, 0, 0);
    const thetas = (): number[] => rig.rotors.map((r) => r.theta);
    let time = 0;
    let stoppedAt = -1;
    let spentAt = -1;
    let keyTurnedWhileRunning = 0;
    for (let i = 0; i < 600 && winding.windings === 1; i++) {
      time += FRAME;
      const keyBefore = key.theta;
      winding.update(FRAME);
      stepRig(rig, FRAME, time);
      if (rig.running) keyTurnedWhileRunning = Math.max(keyTurnedWhileRunning, Math.abs(key.theta - keyBefore) / FRAME);
      if (spentAt < 0 && !rig.running) spentAt = time;
      if (stoppedAt < 0 && rig.speed < 0.02) stoppedAt = time;
    }
    expect(spentAt, 'the spring is spent after its 1.5 s').toBeGreaterThan(1.45);
    expect(spentAt).toBeLessThan(1.6);
    expect(keyTurnedWhileRunning, 'the key unwinds while the spring runs').toBeGreaterThan(0.3);
    expect(winding.windings, 'wound again once it stopped').toBe(2);
    expect(rig.running).toBe(true);

    // Run it down again and check nothing is still moving when it has stopped.
    for (let i = 0; i < 600 && rig.running; i++) {
      time += FRAME;
      winding.update(FRAME);
      stepRig(rig, FRAME, time);
    }
    for (let i = 0; i < 12 * 60; i++) {
      time += FRAME;
      stepRig(rig, FRAME, time); // not updating `winding`: it would wind it up again
    }
    const rest = thetas();
    stepRig(rig, FRAME, time + FRAME);
    const moved = thetas().map((t, i) => Math.abs(t - rest[i]) / FRAME);
    expect(Math.max(...moved), 'every rotor has stopped').toBeLessThan(1e-3);
    expect(rig.lid?.angle).toBeLessThan(0.01);
  }, SLOW);
});

describe.skipIf(!modelsPresent)('the Carousel in motion', () => {
  const result = solved(CAROUSEL);
  let rig: MachineRig;
  beforeAll(async () => {
    rig = started(await build('carousel'), result);
  }, SLOW);

  it('turns the platform flat, about +Y, at the solver\'s speed, with the horses and lamps riding on it', () => {
    expect(result.status).toBe('runs');
    const [platform] = rig.rotors;
    expect(platform.socketId).toBe('platform');
    const horse = rig.bobbers[0].node;
    const radius = (): number => Math.hypot(worldPoint(horse).x - worldPoint(platform.node).x, worldPoint(horse).z - worldPoint(platform.node).z);
    const r0 = radius();
    const angle0 = Math.atan2(worldPoint(horse).x, worldPoint(horse).z);
    const [speed] = measure(rig, 0);
    const turnedHorse = Math.atan2(worldPoint(horse).x, worldPoint(horse).z) - angle0;
    expect(speed).toBeCloseTo(result.angularVelocity.platform, 6);
    expect(Math.abs(speed)).toBeCloseTo(0.5, 6);
    expect(worldAxis(platform).y).toBeCloseTo(1, 9);
    expect(radius()).toBeCloseTo(r0, 9);
    expect(turnedHorse / FRAME, 'a horse is carried round at the platform\'s angular speed').toBeCloseTo(speed, 5); // atan2(x, z) grows with a turn about +Y
    expect(rig.pulsers).toHaveLength(6);
  });

  it('carries every horse head first: it faces the way the platform takes it (the horse model looks along +Z)', () => {
    rig.root.updateMatrixWorld(true);
    for (const [i, { node }] of rig.bobbers.entries()) {
      const before = worldPoint(node);
      const forward = new Vector3(0, 0, 1).transformDirection(node.matrixWorld);
      frames(rig, 0.1, 20 + i);
      const travelled = worldPoint(node).sub(before);
      travelled.y = 0;
      forward.y = 0;
      expect(travelled.length(), `horse_${i} moves`).toBeGreaterThan(0.001);
      expect(forward.normalize().dot(travelled.normalize()), `horse_${i} moves head first, not tail first`).toBeGreaterThan(0.9);
    }
  });

  it('bobs three horses 120 degrees apart, as the solver\'s followers do', () => {
    let time = 1;
    for (let k = 0; k < 24; k++) {
      time = frames(rig, 0.5, time);
      const theta = rig.rotors[0].theta;
      const pose = solved(CAROUSEL, CAROUSEL.intended, MAX_WIND_UNITS, { platform: theta }).followerPose;
      const offsets = rig.bobbers.map((b) => b.node.position.y - b.baseY);
      offsets.forEach((offset, i) => expect(offset, `horse_${i} at ${theta.toFixed(2)} rad`).toBeCloseTo(pose[`horse_${i}`], 3)); // the profile has 12 samples
      expect(offsets.reduce((a, b) => a + b, 0), 'three equal bobs a third of a turn apart cancel').toBeCloseTo(0, 9);
    }
    expect(rig.bobbers.map((b) => b.phase)).toEqual([0, 1, 2].map((i) => horsePhase(i, 3)));
    let top = 0;
    for (let k = 0; k < 800; k++) {
      time = frames(rig, FRAME, time);
      top = Math.max(top, ...rig.bobbers.map((b) => Math.abs(b.node.position.y - b.baseY)));
    }
    expect(top).toBeCloseTo(0.006, 5); // 6 mm each way
  });
});

describe.skipIf(!modelsPresent)('the Windmill in motion', () => {
  const result = solved(WINDMILL);
  let rig: MachineRig;
  beforeAll(async () => {
    rig = started(await build('windmill'), result);
  }, SLOW);

  it('turns the sails on a horizontal shaft at the wind\'s speed and the millstone flat at the gearing\'s', () => {
    expect(result.status).toBe('runs');
    expect(result.continuous).toBe(true);
    const speeds = measure(rig, 0);
    const sails = rig.rotors.findIndex((r) => r.socketId === 'rotor');
    const stone = rig.rotors.findIndex((r) => r.socketId === 'millstone');
    expect(speeds[sails]).toBeCloseTo(1.2, 6);
    expect(speeds[stone]).toBeCloseTo(0.6, 6);
    expect(speeds[stone]).toBeCloseTo(result.angularVelocity.millstone, 6);
    expect(Math.abs(worldAxis(rig.rotors[sails]).y), 'the sails turn on a horizontal shaft').toBeLessThan(1e-9);
    expect(Math.abs(worldAxis(rig.rotors[stone]).y), 'the millstone lies flat').toBeGreaterThan(1 - 1e-9);
    expect(worldPoint(rig.rotors[sails].node).y, 'the sails are up on the tower').toBeGreaterThan(worldPoint(rig.rotors[stone].node).y);
  });
});

describe.skipIf(!modelsPresent)('machines on their plots in the town', () => {
  it('turn at the solver\'s speed under the town runtime, run on while there is spring and stop, with the town no longer busy', async () => {
    const registry = libraryRegistry();
    const town = await loadTown(realSource, registry);
    const runtime = new TownRuntime(town, createWakeUniforms(), null);
    for (const [id, blueprint] of [['music_box', MUSIC_BOX], ['carousel', CAROUSEL], ['windmill', WINDMILL]] as const) {
      const rig = await build(id);
      const result = solved(blueprint);
      expect(runtime.placeRig(rig), `${id} has its plot`).toBe(true);
      rig.result = result;
      rig.running = true;
      runtime.update(FRAME, 0);
      for (let i = 1; i <= 240; i++) runtime.update(FRAME, i * FRAME); // spin up
      expect(rig.speed).toBeGreaterThan(0.99);
      const before = rig.rotors.map((r) => r.node.quaternion.clone());
      runtime.update(FRAME, 5);
      rig.root.updateMatrixWorld(true);
      rig.rotors.forEach((rotor, i) => {
        const omega = turned(rotor, before[i]) / FRAME;
        const expected = result.angularVelocity[rotor.socketId];
        expect(omega, `${id} ${rotor.socketId} on its plot`).toBeCloseTo(expected * rig.speed, 4);
      });
      expect(runtime.busy).toBe(true);
      rig.running = false;
    }
    for (let i = 0; i < 12 * 60; i++) runtime.update(FRAME, 10 + i * FRAME);
    expect(runtime.busy, 'everything has come to rest').toBe(false);
  }, SLOW);

  it('makes a plain rotor turn at the solver\'s speed (the arithmetic the machines rely on)', () => {
    const node = new Mesh();
    const rig = createRig('music_box', node);
    rig.rotors.push(createRotor(node, 'cylinder'));
    rig.result = { angularVelocity: { cylinder: -0.4 } };
    rig.speed = 1;
    for (let i = 0; i < 60; i++) stepRig(rig, FRAME, i * FRAME);
    expect(rig.rotors[0].theta).toBeCloseTo(-0.4, 9);
    expect(horseBob(0.5, 1, 0.006)).toBeCloseTo(0.006 * Math.sin(-0.5), 12);
  });
});

/** World-space box of an object's meshes, with the three numbers the lid test reads. */
class Box {
  readonly min = new Vector3(Infinity, Infinity, Infinity);
  readonly max = new Vector3(-Infinity, -Infinity, -Infinity);
  constructor(node: Object3D) {
    node.updateWorldMatrix(true, true);
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox as { min: Vector3; max: Vector3 };
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const p = new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
        this.min.min(p);
        this.max.max(p);
      }
    });
  }
}
