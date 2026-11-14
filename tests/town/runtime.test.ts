import { Group, Mesh, Object3D, Vector3 } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { MELODY, notesBetween, STEPS_PER_TURN } from '../../src/audio/notes';
import type { InteractionIntent } from '../../src/interaction/intents';
import { LAMP_LIGHT_CD } from '../../src/town/dressing';
import { MAX_WAKE_SOURCES, PLOTS, WAKE_SOURCES } from '../../src/town/layout';
import { createRig, createRotor } from '../../src/town/motion';
import type { MachineRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import type { TownEvents } from '../../src/town/runtime';
import { plotSocket } from '../../src/town/scene';
import { WAKE_RIPPLE_S } from '../../src/town/wake';
import { recorder, syntheticTown } from './helpers';

const FRAME = 1 / 72;

function boot(events: TownEvents = {}) {
  const { town, uniforms } = syntheticTown();
  const audio = recorder();
  const runtime = new TownRuntime(town, uniforms, audio, events);
  let clock = 0;
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += FRAME) {
      clock += FRAME;
      runtime.update(FRAME, clock);
    }
  };
  return { town, uniforms, audio, runtime, run };
}

const intent = (type: 'snapped' | 'unsnapped', socketName: string, node: Object3D | undefined): InteractionIntent =>
  ({ type, socketName, partId: 'x', part: { object3D: node } as unknown as Entity, socket: {} as Entity }) as InteractionIntent;

function rig(machine: MachineRig['machineId'], slot = 'platform'): MachineRig {
  const root = new Group();
  const turning = new Object3D();
  root.add(turning);
  const r = createRig(machine, root);
  const rotor = createRotor(turning, slot);
  r.rotors.push(rotor);
  r.melody = rotor;
  r.result = { angularVelocity: { [slot]: 0.4 } };
  return r;
}

describe('TownRuntime wake', () => {
  it('wakes the plot a machine is dropped on: chime, event, ripple, and the machine takes the town scale', () => {
    const woke: string[] = [];
    const placed: string[] = [];
    const { town, audio, runtime, run } = boot({
      woke: (p) => void woke.push(p),
      placed: (m, p) => void placed.push(`${m}@${p}`),
    });
    town.group.scale.setScalar(0.3);
    const node = new Object3D();
    runtime.handleIntent(intent('snapped', 'PlotWindmill', node));
    expect(woke).toEqual(['plot_windmill']);
    expect(placed).toEqual(['windmill@plot_windmill']);
    expect(audio.calls).toEqual([{ kind: 'chime', plot: 'plot_windmill' }]);
    expect(runtime.wake.isAwake('plot_windmill')).toBe(true);
    expect(runtime.wake.isSettled('plot_windmill')).toBe(false);
    run(2);
    expect(node.scale.x).toBeCloseTo(0.3, 6);
    run(WAKE_RIPPLE_S);
    expect(runtime.wake.isSettled('plot_windmill')).toBe(true);
  });

  it('wakes a plot once: a machine lifted for repair and put back wakes nothing twice', () => {
    const woke: string[] = [];
    const lifted: string[] = [];
    const { runtime, audio, run } = boot({ woke: (p) => void woke.push(p), lifted: (m) => void lifted.push(m) });
    const node = new Object3D();
    runtime.handleIntent(intent('snapped', 'PlotCarousel', node));
    run(0.5);
    runtime.handleIntent(intent('unsnapped', 'PlotCarousel', node));
    expect(lifted).toEqual(['carousel']);
    run(0.6);
    expect(node.scale.x).toBeCloseTo(1, 6); // back to bench size in hand
    runtime.handleIntent(intent('snapped', 'PlotCarousel', node));
    expect(woke).toEqual(['plot_carousel']);
    expect(audio.calls.filter((c) => c.kind === 'chime')).toHaveLength(1);
  });

  it('ignores other sockets, other intents and a part without a node', () => {
    const { runtime, audio } = boot();
    runtime.handleIntent(intent('snapped', 'Arbor', new Object3D()));
    runtime.handleIntent(intent('snapped', 'PlotWindmill', undefined));
    runtime.handleIntent({ type: 'xray', active: true });
    expect(runtime.wake.awakePlots()).toEqual([]);
    expect(audio.calls).toEqual([]);
  });

  it('restores a save: awake and settled at once, no chime, no event', () => {
    const woke: string[] = [];
    const { runtime, audio, uniforms, run } = boot({ woke: (p) => void woke.push(p) });
    runtime.restore(['plot_music_box', 'plot_windmill']);
    run(FRAME);
    expect(woke).toEqual([]);
    expect(audio.calls).toEqual([]);
    expect(runtime.wake.awakePlots()).toEqual(['plot_music_box', 'plot_windmill']);
    WAKE_SOURCES.forEach((s, i) => {
      const awake = s.plot === 'plot_music_box' || s.plot === 'plot_windmill';
      expect(uniforms.uWuWake.value[i].x).toBeCloseTo(awake ? s.radius : -1, 6);
    });
  });

  it('writes the ripple and the town matrix into the shared uniforms, and a reset freezes the town again', () => {
    const { town, uniforms, runtime, run } = boot();
    town.group.position.set(0.2, 0.9, -0.4);
    town.group.scale.setScalar(0.5);
    runtime.wakePlot('plot_clock_tower');
    run(0.4);
    const i = WAKE_SOURCES.findIndex((s) => s.plot === 'plot_clock_tower');
    const mid = uniforms.uWuWake.value[i];
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(WAKE_SOURCES[i].radius);
    expect(mid.y).toBeGreaterThan(0);
    // world -> town: a point on the town's origin goes to 0, one 10 cm along town +X (5 cm in the world) comes back as 0.1.
    const p = uniforms.uWuToTown.value;
    const e = p.elements;
    expect(e[12]).toBeCloseTo(-0.2 / 0.5, 6);
    expect(e[0]).toBeCloseTo(1 / 0.5, 6);
    runtime.reset();
    run(FRAME);
    for (let k = 0; k < MAX_WAKE_SOURCES; k++) expect(uniforms.uWuWake.value[k].x).toBe(-1);
  });
});

describe('TownRuntime machines', () => {
  it('places a finished machine on its plot socket under the town group (a saved machine reappearing)', () => {
    const { town, runtime } = boot();
    const r = rig('music_box', 'cylinder');
    expect(runtime.placeRig(r)).toBe(true);
    const socket = plotSocket(town, 'plot_music_box')!;
    expect(r.root.parent).toBe(town.group);
    expect(r.root.position.distanceTo(socket.position)).toBeLessThan(1e-9);
    expect(runtime.rigOf('music_box')).toBe(r);
    runtime.removeRig(r);
    expect(runtime.rigOf('music_box')).toBeUndefined();
    expect(PLOTS.plot_music_box.x).toBeCloseTo(socket.position.x, 6);
  });

  it('stands a placed machine under the stage root at the town scale, exactly on its plot in the world', () => {
    const { town, runtime, run } = boot();
    const stage = new Group();
    stage.position.set(1, 0.7, -2);
    stage.rotation.y = 0.8;
    stage.add(town.group);
    town.group.scale.setScalar(0.3);
    stage.updateMatrixWorld(true);
    const r = rig('windmill');
    expect(runtime.placeRig(r)).toBe(true);
    expect(r.root.parent).toBe(stage); // like a carried machine: its parent carries no scale
    expect(r.root.scale.x).toBeCloseTo(0.3, 9);
    stage.updateMatrixWorld(true);
    const socket = plotSocket(town, 'plot_windmill')!.getWorldPosition(new Vector3());
    expect(r.root.getWorldPosition(new Vector3()).distanceTo(socket)).toBeLessThan(1e-9);
    run(0.1);
    expect(r.root.getWorldPosition(new Vector3()).distanceTo(socket)).toBeLessThan(1e-9);
  });

  it('keeps a restored machine on its plot when the stage changes the town scale', () => {
    const { town, runtime, run } = boot();
    const stage = new Group();
    stage.position.set(0.4, 0.7, -1);
    stage.rotation.y = -0.6;
    stage.add(town.group);
    stage.updateMatrixWorld(true);
    const r = rig('carousel');
    expect(runtime.placeRig(r)).toBe(true);
    run(0.2);
    town.group.scale.setScalar(0.5); // stand to table: the plot moves with the scale
    run(0.5);
    stage.updateMatrixWorld(true);
    const socket = plotSocket(town, 'plot_carousel')!.getWorldPosition(new Vector3());
    expect(r.root.getWorldPosition(new Vector3()).distanceTo(socket)).toBeLessThan(1e-9);
    expect(r.root.scale.x).toBeCloseTo(0.5, 6);
  });

  it('sees a restored machine lifted off its plot (3 cm rule): bench size again, and the game layer is told once', () => {
    const lifted: string[] = [];
    const { town, runtime, run } = boot({ lifted: (m, p) => void lifted.push(`${m}@${p}`) });
    const stage = new Group();
    stage.add(town.group);
    town.group.scale.setScalar(0.5);
    stage.updateMatrixWorld(true);
    const r = rig('windmill');
    runtime.placeRig(r);
    run(0.3);
    r.root.position.x += 0.02; // a hand's wobble, inside 3 cm
    run(0.3);
    expect(lifted).toEqual([]);
    r.root.position.x += 0.02; // now 4 cm away
    run(0.3);
    expect(lifted).toEqual(['windmill@plot_windmill']);
    expect(r.root.scale.x).toBeGreaterThan(0.5);
    run(1);
    expect(r.root.scale.x).toBeCloseTo(1, 3);
    town.group.scale.setScalar(0.25); // the town changes size: a machine in the hand does not follow it
    run(1);
    expect(r.root.scale.x).toBeCloseTo(1, 3);
    expect(lifted).toHaveLength(1);
  });

  it('puts a restored machine back at the town scale when it is home again (released away from the plot, it eases back)', () => {
    const events: string[] = [];
    const { town, runtime, run } = boot({ lifted: (m) => void events.push(`lifted ${m}`), placed: (m) => void events.push(`placed ${m}`) });
    const stage = new Group();
    stage.add(town.group);
    town.group.scale.setScalar(0.5);
    stage.updateMatrixWorld(true);
    const r = rig('carousel');
    runtime.placeRig(r);
    run(0.1);
    const home = r.root.position.clone();
    r.root.position.y += 0.2;
    run(2);
    expect(events).toEqual(['lifted carousel']);
    expect(r.root.scale.x).toBeCloseTo(1, 3);
    run(0.2);
    expect(events).toEqual(['lifted carousel']);
    r.root.position.copy(home).y += 0.005; // eased home (GrabFeedbackSystem), 0.5 cm off
    run(2);
    expect(events).toEqual(['lifted carousel', 'placed carousel']);
    expect(r.root.scale.x).toBeCloseTo(0.5, 3);
    town.group.scale.setScalar(1); // watched again: it follows the plot
    run(0.2);
    stage.updateMatrixWorld(true);
    const socket = plotSocket(town, 'plot_carousel')!.getWorldPosition(new Vector3());
    expect(r.root.getWorldPosition(new Vector3()).distanceTo(socket)).toBeLessThan(1e-9);
  });

  it('hands a restored machine over to the snap system once it is dropped on its plot again', () => {
    const lifted: string[] = [];
    const placed: string[] = [];
    const { town, runtime, run } = boot({ lifted: (m) => void lifted.push(m), placed: (m) => void placed.push(m) });
    const stage = new Group();
    stage.add(town.group);
    stage.updateMatrixWorld(true);
    const r = rig('windmill');
    runtime.placeRig(r);
    runtime.handleIntent(intent('snapped', 'PlotWindmill', r.root));
    expect(placed).toEqual(['windmill']);
    r.root.position.x += 0.1; // SocketSnapSystem owns the seat: its `unsnapped` reports a lift, not this runtime
    run(0.5);
    expect(lifted).toEqual([]);
  });

  it('says it is busy only while something changes: a ripple, a running machine, Otto', () => {
    const { runtime, run } = boot();
    run(0.1);
    expect(runtime.busy).toBe(false);
    runtime.wakePlot('plot_carousel');
    expect(runtime.busy).toBe(true);
    run(WAKE_RIPPLE_S + 0.1);
    expect(runtime.busy).toBe(false);
    const r = rig('music_box', 'cylinder');
    runtime.addRig(r);
    expect(runtime.busy).toBe(true); // running
    r.running = false;
    run(8);
    expect(runtime.busy).toBe(false);
    runtime.wakePlot('plot_windmill'); // Otto starts kneading once the Bakery has settled
    run(WAKE_RIPPLE_S + 0.5);
    expect(runtime.busy).toBe(true);
    runtime.reset();
    run(8);
    expect(runtime.busy).toBe(false);
  });

  it('keeps the grab colliders of a machine at their 1.2 cm minimum when it takes the town scale', () => {
    const { town, runtime, run } = boot();
    town.group.scale.setScalar(0.5);
    const node = new Object3D();
    const col = new Object3D();
    col.scale.setScalar(0.01); // a 1 cm grab sphere
    const proxy = new Mesh();
    proxy.userData.wuProxy = { purpose: 'grab', shape: 'sphere' };
    col.add(proxy);
    node.add(col);
    runtime.handleIntent(intent('snapped', 'PlotMusicBox', node));
    run(2);
    expect(node.scale.x).toBeCloseTo(0.5, 3);
    expect(proxy.scale.x).toBeCloseTo(0.012 / 0.005, 3); // world radius 0.5 cm lifted to 1.2 cm
  });

  it('keeps seated machines in step when the stage changes the town scale (stand to table)', () => {
    const { town, runtime, run } = boot();
    town.group.scale.setScalar(1);
    const a = new Object3D();
    runtime.handleIntent(intent('snapped', 'PlotWindmill', a));
    run(1);
    expect(a.scale.x).toBeCloseTo(1, 3);
    town.group.scale.setScalar(0.25);
    run(2);
    expect(a.scale.x).toBeCloseTo(0.25, 3);
    runtime.handleIntent(intent('unsnapped', 'PlotWindmill', a));
    run(1);
    town.group.scale.setScalar(0.5);
    run(2);
    expect(a.scale.x).toBeCloseTo(1, 3); // lifted: bench size, whatever the town does
  });

  it('turns a rig from its solver velocity and plays the pins that pass the comb, exactly once', () => {
    const { runtime, audio, run } = boot();
    const r = rig('music_box', 'cylinder');
    runtime.addRig(r);
    runtime.addRig(r); // twice is once
    run(2);
    const turns = r.rotors[0].theta / (Math.PI * 2);
    expect(turns).toBeGreaterThan(0);
    let expected = 0;
    notesBetween(-1e-6, turns, () => expected++); // the pins at turn 0 sound too
    expect(expected).toBeGreaterThan(0);
    const plucks = audio.calls.filter((c) => c.kind === 'pluck');
    expect(plucks).toHaveLength(expected);
    expect(plucks.every((c) => c.level === 1)).toBe(true);
    // The first pin of the tune is the first note heard.
    expect(plucks[0].midi).toBe(MELODY[0].midi);
    const counted = plucks.length;
    r.running = false;
    run(3);
    const settled = audio.calls.filter((c) => c.kind === 'pluck').length;
    run(1);
    expect(audio.calls.filter((c) => c.kind === 'pluck')).toHaveLength(settled); // a stopped cylinder is silent
    expect(settled).toBeGreaterThanOrEqual(counted);
  });

  it('plays the Carousel\'s copy of the tune quieter than the Music Box\'s', () => {
    const { runtime, audio, run } = boot();
    runtime.addRig(rig('carousel'));
    run(2);
    const plucks = audio.calls.filter((c) => c.kind === 'pluck');
    expect(plucks.length).toBeGreaterThan(0);
    expect(plucks.every((c) => (c.level ?? 1) < 1)).toBe(true);
  });

  it('plays one whole turn of the tune per cylinder turn (96 steps of a waltz)', () => {
    const { runtime, audio, run } = boot();
    const r = rig('music_box', 'cylinder');
    r.result = { angularVelocity: { cylinder: Math.PI * 2 } }; // one turn per second at full speed
    r.speed = 1;
    runtime.addRig(r);
    run(1);
    const heard = audio.calls.filter((c) => c.kind === 'pluck').length;
    expect(STEPS_PER_TURN).toBe(96);
    expect(heard).toBeGreaterThan(MELODY.length * 0.6); // the spin-up has not quite finished a turn
    expect(heard).toBeLessThanOrEqual(MELODY.length);
  });
});

describe('Otto', () => {
  it('stays on the first frame while the Bakery is frozen, then kneads once the Windmill has woken it', () => {
    const { town, runtime, run } = boot();
    const knead = town.knead!;
    run(1);
    expect(knead.action.timeScale).toBe(0);
    expect(knead.action.time).toBe(0);
    runtime.wakePlot('plot_windmill');
    run(WAKE_RIPPLE_S - 0.1);
    expect(knead.action.timeScale).toBe(0); // the ripple has not reached the Bakery for good yet
    run(0.2);
    run(1.5);
    expect(knead.action.timeScale).toBeGreaterThan(0.8);
    expect(knead.action.time).toBeGreaterThan(0);
    runtime.reset();
    run(5);
    expect(knead.action.timeScale).toBe(0);
  });

  it('is fine without a clip', () => {
    const { town, uniforms } = (() => {
      const s = syntheticTown(false);
      return s;
    })();
    const runtime = new TownRuntime(town, uniforms, null);
    runtime.wakePlot('plot_windmill');
    expect(() => runtime.update(FRAME, 1)).not.toThrow();
  });
});

describe('the night', () => {
  it('eases the shader value and the town to the night and back, and is busy only while it moves', () => {
    const { runtime, uniforms, run } = boot();
    expect(runtime.night).toBe(0);
    expect(runtime.busy).toBe(false);
    runtime.setNight(true);
    expect(runtime.busy).toBe(true);
    run(0.5);
    expect(runtime.night).toBeGreaterThan(0.2);
    expect(runtime.night).toBeLessThan(0.9);
    expect(uniforms.uWuNight.value).toBe(runtime.night);
    run(6);
    expect(runtime.night).toBe(1);
    expect(uniforms.uWuNight.value).toBe(1);
    expect(runtime.busy).toBe(false);
    runtime.setNight(false);
    run(6);
    expect(runtime.night).toBe(0);
    expect(uniforms.uWuNight.value).toBe(0);
    expect(runtime.busy).toBe(false);
  });

  it('can start in the night at once (a saved game), with no fade', () => {
    const { runtime, uniforms } = boot();
    runtime.setNight(true, true);
    expect(runtime.night).toBe(1);
    expect(uniforms.uWuNight.value).toBe(1);
    expect(runtime.busy).toBe(false);
  });

  it('lights the lamp of a plot that wakes at night, and keeps the town drawing while the light comes up', () => {
    const { town, uniforms } = syntheticTown(true, true);
    const runtime = new TownRuntime(town, uniforms, recorder());
    let clock = 0;
    const frame = (): void => {
      clock += FRAME;
      runtime.update(FRAME, clock);
    };
    const lamp = town.dressing!.lamps[0];
    runtime.setNight(true, true);
    frame();
    expect(lamp.light.visible).toBe(true);
    expect(lamp.light.intensity).toBe(0); // frozen: dark
    runtime.wakePlot(lamp.plot);
    for (let i = 0; i < 30; i++) frame();
    expect(lamp.light.intensity).toBeGreaterThan(0);
    for (let i = 0; i < 72 * 6; i++) frame();
    expect(lamp.light.intensity).toBeCloseTo(LAMP_LIGHT_CD, 6);
    expect(runtime.busy).toBe(false);
  });
});
