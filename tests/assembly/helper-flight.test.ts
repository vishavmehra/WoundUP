import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { Points } from 'three';
import { describe, expect, it } from 'vitest';
import type { HelperTarget } from '../../src/assembly/helper';
import { breath, CUE_PERIOD_S, HelperCues, SceneHelper } from '../../src/assembly/helper-cues';
import type { HelperWorld } from '../../src/assembly/helper-cues';
import {
  arcPoint,
  FLIGHT_LIFT_M,
  FLIGHT_LIFT_PER_M,
  FLIGHT_S,
  flightEase,
  flightLift,
  HelperFlight,
  TRAIL_LIFE_S,
  TRAIL_PEAK,
  trailBrightness,
} from '../../src/assembly/helper-flight';

// The Helper's flight and its cues (design §7.2): the arc, the landing, the trail, and the scene the ladder speaks to. Real Three.js objects, no renderer.

const FRAME = 1 / 72;
const TARGET: HelperTarget = { kind: 'place', socketId: 'bracket_left', partId: 'bracket_support_brass', label: 'left bracket', hardware: false };
const HARDWARE: HelperTarget = { kind: 'place', socketId: 'bush_left', partId: 'bush_split_8_brass', label: 'left bracket bush', hardware: true };

const mesh = (): Mesh => new Mesh(new BoxGeometry(0.02, 0.02, 0.02), new MeshBasicMaterial());
const worldPosition = (o: Object3D): Vector3 => o.getWorldPosition(new Vector3());
const worldQuaternion = (o: Object3D): Quaternion => o.getWorldQuaternion(new Quaternion());

/** A scene with a tilted, scaled stage root (the bench never scales, the town does), a part lying in it, and a socket node elsewhere. */
function rig() {
  const scene = new Object3D();
  const stage = new Group();
  stage.position.set(0.3, 0.1, -0.2);
  stage.rotation.set(0, 0.6, 0);
  stage.scale.setScalar(0.5);
  scene.add(stage);
  const part = mesh();
  part.position.set(-0.2, 0.05, 0.1);
  part.rotation.set(0.4, 0.1, 0);
  stage.add(part);
  const node = new Object3D();
  node.position.set(0.35, 0.2, 0.1);
  node.rotation.set(0, 1.2, 0.3);
  scene.add(node);
  scene.updateMatrixWorld(true);
  return { scene, stage, part, node };
}

/** Runs frames until `done` or `limit` seconds; returns how long it took. */
function fly(f: HelperFlight, scene: Object3D, limit = 3, done: () => boolean = () => !f.active): number {
  let t = 0;
  while (!done() && t < limit) {
    f.update(FRAME);
    scene.updateMatrixWorld(true);
    t += FRAME;
  }
  return t;
}

describe('the arc', () => {
  it('eases in and out and stays inside 0 to 1', () => {
    expect(flightEase(-1)).toBe(0);
    expect(flightEase(0)).toBe(0);
    expect(flightEase(0.5)).toBeCloseTo(0.5, 10);
    expect(flightEase(1)).toBe(1);
    expect(flightEase(2)).toBe(1);
    let last = 0;
    for (let u = 0; u <= 1; u += 0.05) {
      expect(flightEase(u)).toBeGreaterThanOrEqual(last);
      last = flightEase(u);
    }
  });

  it('starts at the part, ends at the socket and peaks `lift` above the straight line halfway', () => {
    const from = new Vector3(0, 0, 0);
    const to = new Vector3(0.2, 0.1, -0.1);
    const out = new Vector3();
    expect(arcPoint(from, to, 0.05, 0, out).toArray()).toEqual([0, 0, 0]);
    expect(arcPoint(from, to, 0.05, 1, out).toArray()).toEqual([0.2, 0.1, -0.1]);
    arcPoint(from, to, 0.05, 0.5, out);
    expect(out.x).toBeCloseTo(0.1, 10);
    expect(out.z).toBeCloseTo(-0.05, 10);
    expect(out.y).toBeCloseTo(0.05 + 0.05, 10);
  });

  it('lifts higher for a longer carry, from a base of 4 cm', () => {
    expect(flightLift(0)).toBe(FLIGHT_LIFT_M);
    expect(flightLift(0.4)).toBeCloseTo(FLIGHT_LIFT_M + FLIGHT_LIFT_PER_M * 0.4, 10);
    expect(flightLift(0.4)).toBeGreaterThan(flightLift(0.1));
  });

  it('has a trail that fades out and never exceeds 0.6', () => {
    expect(trailBrightness(0)).toBe(TRAIL_PEAK);
    expect(TRAIL_PEAK).toBeLessThanOrEqual(0.6);
    expect(trailBrightness(TRAIL_LIFE_S / 2)).toBeLessThan(TRAIL_PEAK);
    expect(trailBrightness(TRAIL_LIFE_S)).toBe(0);
    expect(trailBrightness(Infinity)).toBe(0);
    expect(trailBrightness(-1)).toBe(0);
  });
});

describe('HelperFlight', () => {
  it('lifts a part from where it lies and lands it exactly on the socket, once, after about 0.9 s', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    let landed = 0;
    let at = new Vector3();
    flight.start(part, node, () => {
      landed++;
      at = worldPosition(part);
    });
    expect(flight.active).toBe(true);
    const took = fly(flight, scene);
    expect(landed).toBe(1);
    expect(flight.active).toBe(false);
    expect(took).toBeGreaterThan(FLIGHT_S - FRAME * 2);
    expect(took).toBeLessThan(FLIGHT_S + FRAME * 2);
    expect(at.distanceTo(worldPosition(node))).toBeLessThan(1e-6);
    // The part arrives upright to the socket, in the world, whatever the stage's tilt and scale.
    expect(worldQuaternion(part).angleTo(worldQuaternion(node))).toBeLessThan(1e-5);
    flight.update(1);
    expect(landed).toBe(1);
  });

  it('flies an arc: it rises above both ends, and never jumps more than a few centimetres in a frame', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    const start = worldPosition(part);
    const end = worldPosition(node);
    flight.start(part, node, () => {});
    const lift = flightLift(start.distanceTo(end));
    let peak = -Infinity;
    let last = start.clone();
    let biggest = 0;
    while (flight.active) {
      flight.update(FRAME);
      scene.updateMatrixWorld(true);
      const p = worldPosition(part);
      peak = Math.max(peak, p.y - (start.y + end.y) / 2);
      biggest = Math.max(biggest, p.distanceTo(last));
      last = p;
    }
    expect(peak).toBeGreaterThan(lift * 0.9);
    expect(peak).toBeLessThan(lift * 1.05);
    expect(biggest).toBeLessThan(0.03);
  });

  it('follows a socket that moves while the part is in the air', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    flight.start(part, node, () => {});
    fly(flight, scene, 0.4, () => false);
    node.position.x += 0.1;
    scene.updateMatrixWorld(true);
    fly(flight, scene);
    expect(worldPosition(part).distanceTo(worldPosition(node))).toBeLessThan(1e-6);
  });

  it('lands in one frame after a long hitch, on the socket', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    let landed = 0;
    flight.start(part, node, () => landed++);
    flight.update(5);
    expect(landed).toBe(1);
    expect(worldPosition(part).distanceTo(worldPosition(node))).toBeLessThan(1e-6);
  });

  it('gives way to a hand: when `abort` says so the flight ends where it is and never lands', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    let landed = 0;
    let taken = false;
    flight.start(part, node, () => landed++, () => taken);
    fly(flight, scene, 0.3, () => false);
    const where = worldPosition(part);
    taken = true;
    flight.update(FRAME);
    expect(flight.active).toBe(false);
    expect(landed).toBe(0);
    expect(worldPosition(part).distanceTo(where)).toBeLessThan(1e-9); // it did not move on
  });

  it('cancels a flight in the air when a new one starts, and when asked', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    let first = 0;
    let second = 0;
    flight.start(part, node, () => first++);
    fly(flight, scene, 0.2, () => false);
    flight.start(part, node, () => second++);
    fly(flight, scene);
    expect(first).toBe(0);
    expect(second).toBe(1);
    flight.start(part, node, () => second++);
    flight.cancel();
    flight.update(2);
    expect(second).toBe(1);
  });

  it('draws a trail only while one is alive: one draw call in the air, none before and after', () => {
    const { scene, part, node } = rig();
    const flight = new HelperFlight(scene);
    const trail = scene.getObjectByName('HelperTrail') as Points;
    expect(trail.visible).toBe(false);
    flight.start(part, node, () => {});
    fly(flight, scene, 0.3, () => false);
    expect(trail.visible).toBe(true);
    const colors = trail.geometry.getAttribute('color').array as Float32Array;
    expect(Math.max(...colors)).toBeLessThanOrEqual(TRAIL_PEAK + 1e-6);
    expect(Math.max(...colors)).toBeGreaterThan(0.1);
    fly(flight, scene);
    flight.update(TRAIL_LIFE_S + 0.1);
    expect(trail.visible).toBe(false);
  });

  it('removes its trail on dispose', () => {
    const { scene } = rig();
    const flight = new HelperFlight(scene);
    expect(scene.getObjectByName('HelperTrail')).toBeDefined();
    flight.dispose();
    expect(scene.getObjectByName('HelperTrail')).toBeUndefined();
  });
});

describe('HelperCues', () => {
  it('breathes once per period', () => {
    expect(breath(0)).toBeCloseTo(0, 10);
    expect(breath(CUE_PERIOD_S / 2)).toBeCloseTo(1, 10);
    expect(breath(CUE_PERIOD_S)).toBeCloseTo(0, 10);
  });

  it('glows a part with its own meshes beside it in the scene, never inside it, so the ghost of a held part does not pick it up', () => {
    const { scene, part } = rig();
    const cues = new HelperCues(scene);
    const before = part.children.length;
    cues.glow(part);
    expect(part.children).toHaveLength(before);
    const glow = scene.getObjectByName('HelperGlow') as Object3D;
    expect(glow.visible).toBe(true);
    expect(glow.children).toHaveLength(2); // one mesh: its fill and its outline
    // It stands where the part stands, and follows it.
    cues.update(FRAME);
    expect(worldPosition(glow).distanceTo(worldPosition(part))).toBeLessThan(1e-9);
    part.position.x += 0.05;
    scene.updateMatrixWorld(true);
    cues.update(FRAME);
    expect(worldPosition(glow).distanceTo(worldPosition(part))).toBeLessThan(1e-9);
    cues.glow(null);
    expect(glow.visible).toBe(false);
    expect(glow.children).toHaveLength(0);
  });

  it('pulses the socket in lamp light, on its empty, and puts the pulse out', () => {
    const { scene, node } = rig();
    const cues = new HelperCues(scene);
    const pulse = scene.getObjectByName('HelperPulse') as Mesh;
    expect(pulse.visible).toBe(false);
    cues.pulse(node, 0.012);
    cues.update(CUE_PERIOD_S / 2);
    expect(pulse.visible).toBe(true);
    expect(worldPosition(pulse).distanceTo(worldPosition(node))).toBeLessThan(1e-9);
    expect(pulse.scale.x).toBeCloseTo(0.012 * 1.15, 10);
    expect((pulse.material as MeshBasicMaterial).opacity).toBeLessThanOrEqual(0.5 + 1e-9);
    cues.pulse(null);
    expect(pulse.visible).toBe(false);
  });

  it('takes glow, pulse and ghost all away on clear, and every object on dispose', () => {
    const { scene, part, node } = rig();
    const cues = new HelperCues(scene);
    const roots = scene.children.length;
    cues.glow(part);
    cues.pulse(node);
    cues.showGhost(part, node);
    expect(scene.children.length).toBeGreaterThan(roots);
    cues.clear();
    expect((scene.getObjectByName('HelperGlow') as Object3D).children).toHaveLength(0);
    expect((scene.getObjectByName('HelperPulse') as Object3D).visible).toBe(false);
    expect(scene.children.length).toBe(roots); // the ghost's root is gone
    cues.dispose();
    expect(scene.getObjectByName('HelperGlow')).toBeUndefined();
    expect(scene.getObjectByName('HelperPulse')).toBeUndefined();
  });
});

describe('SceneHelper', () => {
  function world(over: Partial<HelperWorld> = {}) {
    const r = rig();
    const log: string[] = [];
    let held = false;
    const w: HelperWorld = {
      part: () => r.part,
      socket: () => r.node,
      free: () => true,
      seat: (t, p) => {
        log.push(`seat:${t.socketId}:${p === r.part}`);
        return true;
      },
      held: () => held,
      chime: () => log.push('chime'),
      ...over,
    };
    return { ...r, w, log, hold: (on: boolean) => (held = on), helper: new SceneHelper(r.scene, w) };
  }

  it('flies the part and seats it once on landing, as a hand would', () => {
    const { helper, log, scene } = world();
    expect(helper.fly(TARGET)).toBe(true);
    for (let t = 0; t < 1.2; t += FRAME) {
      helper.update(FRAME);
      scene.updateMatrixWorld(true);
    }
    expect(log).toEqual(['seat:bracket_left:true']);
  });

  it('flies one part at a time, and never the wind step', () => {
    const { helper } = world();
    expect(helper.fly(TARGET)).toBe(true);
    expect(helper.fly(TARGET)).toBe(false);
    expect(helper.fly({ ...TARGET, kind: 'wind' })).toBe(false);
  });

  it('has nothing to fly when there is no live part, no socket or the socket cannot take it now', () => {
    expect(world({ part: () => null }).helper.fly(TARGET)).toBe(false);
    expect(world({ socket: () => null }).helper.fly(TARGET)).toBe(false);
    expect(world({ free: () => false }).helper.fly(TARGET)).toBe(false);
  });

  it('gives way when a hand takes the part in the air: nothing is seated', () => {
    const { helper, hold, log, scene } = world();
    helper.fly(TARGET);
    for (let t = 0; t < 0.3; t += FRAME) helper.update(FRAME);
    hold(true);
    for (let t = 0; t < 1.5; t += FRAME) {
      helper.update(FRAME);
      scene.updateMatrixWorld(true);
    }
    expect(log).toEqual([]);
    expect(helper.flight.active).toBe(false);
  });

  it('leaves a flight in the air to land when the cues are cleared (a seating clears them first)', () => {
    const { helper, log } = world();
    helper.fly(TARGET);
    helper.clear();
    expect(helper.flight.active).toBe(true);
    helper.update(2);
    expect(log).toEqual(['seat:bracket_left:true']);
  });

  it('sizes the pulse for the piece: small for hardware, larger for a big part', () => {
    const { helper, scene } = world();
    const pulse = scene.getObjectByName('HelperPulse') as Mesh;
    helper.pulseSocket(HARDWARE);
    helper.update(CUE_PERIOD_S / 2);
    const small = pulse.scale.x;
    helper.pulseSocket(TARGET);
    helper.update(CUE_PERIOD_S); // a whole breath on: the same phase
    expect(pulse.scale.x).toBeGreaterThan(small * 2);
    helper.pulseSocket(null);
    expect(pulse.visible).toBe(false);
  });

  it('asks the world to chime, and frees everything on dispose', () => {
    const { helper, log, scene } = world();
    helper.chime();
    expect(log).toEqual(['chime']);
    helper.dispose();
    expect(scene.getObjectByName('HelperTrail')).toBeUndefined();
    expect(scene.getObjectByName('HelperPulse')).toBeUndefined();
  });
});
