import { Mesh, ShaderChunk, ShaderLib, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import type { BufferAttribute, ShaderMaterial } from 'three';
import {
  buildAmbience,
  CHIMNEY_MOUTH,
  drawn,
  FLAGS,
  GLOW_QUADS,
  houseChimney,
  PUFF_LIFE_S,
  PUFFS_PER_CHIMNEY,
  SMOKING_HOUSES,
} from '../../src/town/ambience';
import { buildDressing, loadDressingModels } from '../../src/town/dressing';
import { DRESSING, DRESSING_NODES, type DressingItem } from '../../src/town/dressing-table';
import { BAKERY_AT, DRESS_Y_M, THEATRE_AT } from '../../src/town/layout';
import { createRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import { WAKE_RIPPLE_S, WakeField } from '../../src/town/wake';
import { libraryRegistry, recorder, syntheticTown } from './helpers';
import { modelsPresent, realSource } from './real-source';

const FRAME = 1 / 72;

/** Steps an ambience for `seconds` at the headset's frame rate; returns what the last frame said. */
function stepper() {
  const wake = new WakeField();
  const ambience = buildAmbience();
  let time = 0;
  const step = (seconds: number, windmillSpeed = 1, night = 0): boolean => {
    let showing = false;
    for (let t = 0; t < seconds - 1e-9; t += FRAME) {
      time += FRAME;
      wake.update(FRAME);
      showing = ambience.update(FRAME, time, wake, night, windmillSpeed);
    }
    return showing;
  };
  return { wake, ambience, step, now: () => time };
}

const attr = (a: ReturnType<typeof buildAmbience>, mesh: number, name: string): Float32Array => (a.meshes[mesh].geometry.getAttribute(name) as BufferAttribute).array as Float32Array;
const smokeTint = (a: ReturnType<typeof buildAmbience>): number[] => ((a.meshes[0].material as ShaderMaterial).uniforms.uTint.value as { toArray(): number[] }).toArray();
const glowOpacity = (a: ReturnType<typeof buildAmbience>): number => (a.meshes[1].material as { opacity: number }).opacity;

describe('the ambience: what it is and what it costs', () => {
  it('is three draw calls with one material each, however much is awake, and none while it is frozen', () => {
    const a = buildAmbience();
    expect(a.meshes).toHaveLength(3);
    expect(new Set(a.meshes.map((m) => m.material)).size).toBe(3);
    expect(a.group.children).toEqual(a.meshes);
    expect(a.meshes.every((m) => !drawn(m))).toBe(true); // frozen until a plot wakes: nothing drawn, no draw call
    expect(a.meshes.every((m) => m.visible)).toBe(true); // but present, so three sets the programs up with the rest of the town
  });

  it('smokes the Bakery and the two houses of the table (one the Windmill wakes, one the Clock Tower), and only the Bakery without the houses', () => {
    const a = buildAmbience();
    expect(a.chimneys.map((c) => c.id)).toEqual(['bakery', ...SMOKING_HOUSES]);
    expect(a.chimneys.map((c) => c.plot)).toEqual(['plot_windmill', 'plot_windmill', 'plot_clock_tower']);
    expect(a.chimneys.map((c) => c.needsWindmill)).toEqual([true, false, false]);
    expect(buildAmbience({ withHouses: false }).chimneys.map((c) => c.id)).toEqual(['bakery']);
    for (const id of SMOKING_HOUSES) {
      const item = DRESSING.find((i) => i.id === id);
      expect(item, id).toBeDefined();
      expect(CHIMNEY_MOUTH[item!.node], `${id} has no chimney mouth`).toBeDefined();
    }
  });

  it('puts the Bakery chimney at its SOCKET_Smoke when the model has one, and at the known mouth when it does not', () => {
    const socket = { name: 'SOCKET_Smoke', position: new Vector3(0.1, 0.2, -0.3) } as unknown as Object3D;
    const bakery = { getObjectByName: (n: string) => (n === 'SOCKET_Smoke' ? socket : undefined) } as unknown as Object3D;
    const at = buildAmbience({ bakery }).chimneys[0];
    expect([at.x, at.y, at.z]).toEqual([BAKERY_AT.x + 0.1, 0.2, BAKERY_AT.z - 0.3]);
    const fallback = buildAmbience().chimneys[0];
    expect([fallback.x, fallback.y, fallback.z]).toEqual([BAKERY_AT.x + 0.04, 0.19, BAKERY_AT.z - 0.0275]);
  });

  it('turns a house\'s chimney with the house and moves it with its row', () => {
    const base: DressingItem = { id: 'h', node: 'TownHouse_Cottage', x: 10, z: -10, yawDeg: 0, wakes: 'plot_windmill' };
    const [mx, my, mz] = CHIMNEY_MOUTH.TownHouse_Cottage!;
    const flat = houseChimney(base)!;
    expect([flat.x, flat.y, flat.z]).toEqual([0.1 + mx, DRESS_Y_M + my, -0.1 + mz]);
    const turned = houseChimney({ ...base, yawDeg: 90 })!; // a quarter turn about +Y: +X goes to -Z and +Z to +X
    expect(turned.x).toBeCloseTo(0.1 + mz, 12);
    expect(turned.z).toBeCloseTo(-0.1 - mx, 12);
    const moved = houseChimney({ ...base, x: 20, z: -5 })!;
    expect([moved.x - flat.x, moved.z - flat.z].map((v) => +v.toFixed(12))).toEqual([0.1, 0.05]);
    expect(houseChimney({ ...base, node: 'TownProp_Bench' })).toBeNull();
    expect(flat.plot).toBe('plot_windmill');
  });

  it('hooks into three\'s own shader sources (a three upgrade that moves an anchor fails here, not in the headset)', () => {
    expect(ShaderLib.standard.vertexShader).toContain('#include <common>');
    expect(ShaderLib.standard.vertexShader).toContain('#include <begin_vertex>');
    expect(ShaderChunk.colorspace_fragment).toBeDefined();
    const a = buildAmbience();
    const patched = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: '', uniforms: {} as Record<string, unknown> };
    (a.meshes[2].material as unknown as { onBeforeCompile: (s: typeof patched) => void }).onBeforeCompile(patched);
    expect(patched.vertexShader).toContain('attribute float aSway;');
    expect(patched.vertexShader).toContain('transformed = aBase + ( transformed - aBase ) * aLevel;');
    expect(patched.uniforms.uTime).toBeDefined();
    const smoke = a.meshes[0].material as ShaderMaterial;
    expect(smoke.fragmentShader).toContain('#include <colorspace_fragment>');
    expect(smoke.vertexShader).toContain('viewMatrix'); // a billboard of the eye it is drawn for, so both eyes of the headset are right
  });
});

describe('the ambience while the town is frozen and when it wakes', () => {
  it('shows nothing, asks for no redraw and writes nothing while every plot is frozen', () => {
    const { ambience, step } = stepper();
    expect(step(2)).toBe(false);
    expect(ambience.meshes.every((m) => !drawn(m))).toBe(true);
    expect(ambience.smokeLevel.every((l) => l === 0)).toBe(true);
    expect(ambience.flagLevel.every((l) => l === 0)).toBe(true);
    expect(ambience.ovenLevel).toBe(0);
    expect(Math.max(...attr(ambience, 0, 'aAlpha'))).toBe(0);
  });

  it('waits for the ripple to settle: nothing starts while a plot is still waking', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill');
    expect(step(WAKE_RIPPLE_S - 0.2)).toBe(false);
    expect(ambience.smokeLevel[0]).toBe(0);
    expect(step(0.6)).toBe(true); // settled: the chimneys start
    expect(ambience.smokeLevel[0]).toBeGreaterThan(0);
  });

  it('smokes the Bakery and the Windmill\'s house, glows the oven and raises the Bakery\'s pennant once the Windmill is awake and turning', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    expect(step(15, 1)).toBe(true);
    expect(ambience.smokeLevel).toEqual([1, 1, 0]); // the Clock Tower's house waits for the Clock Tower
    expect(ambience.ovenLevel).toBe(1);
    expect(ambience.flags.map((f, i) => [f.id, ambience.flagLevel[i]])).toEqual([['flag_theatre_left', 0], ['flag_theatre_right', 0], ['flag_bakery', 1]]);
    expect(ambience.meshes.map(drawn)).toEqual([true, true, true]);
    wake.wake('plot_clock_tower', true);
    step(15, 1);
    expect(ambience.smokeLevel).toEqual([1, 1, 1]);
    expect(ambience.flagLevel).toEqual([1, 1, 1]);
  });

  it('keeps the Bakery cold while the Windmill is not turning (on the bench, or stopped), but not the houses or the pennants', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    step(15, 0);
    expect(ambience.smokeLevel).toEqual([0, 1, 0]);
    expect(ambience.ovenLevel).toBe(0);
    expect(ambience.flagLevel[2]).toBe(1);
    step(15, 1);
    expect(ambience.smokeLevel[0]).toBe(1);
    expect(ambience.ovenLevel).toBe(1);
    step(10, 0.02); // not yet turning: the Windmill's own spin-up and spin-down
    expect(ambience.smokeLevel[0]).toBe(0);
    expect(ambience.ovenLevel).toBe(0);
  });

  it('eases off when the town is frozen again, then shows nothing and stops asking for redraws', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    wake.wake('plot_clock_tower', true);
    expect(step(6, 1)).toBe(true);
    wake.reset();
    expect(step(0.3, 1)).toBe(true); // still easing out, not a pop
    expect(ambience.smokeLevel[0]).toBeLessThan(1);
    expect(ambience.smokeLevel[0]).toBeGreaterThan(0);
    expect(step(10, 1)).toBe(false);
    expect(ambience.meshes.every((m) => !drawn(m))).toBe(true);
    expect(Math.max(...attr(ambience, 0, 'aAlpha'))).toBe(0);
    expect(Math.max(...attr(ambience, 2, 'aLevel'))).toBe(0);
  });

  it('leaves no stale puff behind when only one chimney goes out', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    wake.wake('plot_clock_tower', true);
    step(6, 1);
    step(10, 0); // the Bakery goes cold, the houses go on smoking
    const alpha = attr(ambience, 0, 'aAlpha');
    expect(Math.max(...alpha.slice(0, PUFFS_PER_CHIMNEY * 4))).toBe(0);
    expect(Math.max(...alpha.slice(PUFFS_PER_CHIMNEY * 4))).toBeGreaterThan(0);
  });
});

describe('the smoke', () => {
  it('rises from its chimney in evenly spaced puffs that grow and fade, and each loop is the same length', () => {
    const { wake, ambience, step, now } = stepper();
    wake.wake('plot_windmill', true);
    step(15, 1);
    const chimney = ambience.chimneys[0];
    const alpha = attr(ambience, 0, 'aAlpha');
    const size = attr(ambience, 0, 'aSize');
    const position = attr(ambience, 0, 'position');
    const ys: number[] = [];
    for (let k = 0; k < PUFFS_PER_CHIMNEY; k++) {
      const v = k * 4;
      ys.push(position[v * 3 + 1]);
      expect(alpha[v]).toBeGreaterThanOrEqual(0);
      expect(alpha[v]).toBeLessThanOrEqual(0.8);
      expect(size[v]).toBeGreaterThanOrEqual(0.006 - 1e-9);
      expect(size[v]).toBeLessThanOrEqual(0.022 + 1e-9);
      expect(position[v * 3 + 1], 'a puff never starts below its chimney').toBeGreaterThanOrEqual(chimney.y - 1e-9);
      expect(position[v * 3 + 1], 'nor rises past the column').toBeLessThanOrEqual(chimney.y + 0.07);
      expect(Math.abs(position[v * 3] - chimney.x), 'drifts sideways only a little').toBeLessThan(0.03);
      for (let c = 1; c < 4; c++) expect(position[(v + c) * 3 + 1]).toBeCloseTo(position[v * 3 + 1], 6); // the four corners share one centre
    }
    const sorted = [...ys].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k] - sorted[k - 1], 'puffs are spread over the column').toBeGreaterThan(0.005);
    const before = Array.from(alpha.slice(0, PUFFS_PER_CHIMNEY * 4));
    const sizes = Array.from(size.slice(0, PUFFS_PER_CHIMNEY * 4));
    // One loop later every puff is where it was in height, size and strength (the sideways sway has its own, slower beat).
    ambience.update(FRAME, now() + PUFF_LIFE_S, wake, 0, 1);
    Array.from(alpha.slice(0, PUFFS_PER_CHIMNEY * 4)).forEach((v, i) => expect(v).toBeCloseTo(before[i], 5));
    Array.from(size.slice(0, PUFFS_PER_CHIMNEY * 4)).forEach((v, i) => expect(v).toBeCloseTo(sizes[i], 6));
    ys.forEach((y, k) => expect(position[k * 4 * 3 + 1]).toBeCloseTo(y, 6));
  });

  it('is a pure function of the clock: the same time gives the same cloud, and two chimneys never puff in step', () => {
    const a = stepper();
    const b = stepper();
    for (const s of [a, b]) {
      s.wake.wake('plot_windmill', true);
      s.wake.wake('plot_clock_tower', true);
      s.step(6, 1);
    }
    expect(Array.from(attr(a.ambience, 0, 'position'))).toEqual(Array.from(attr(b.ambience, 0, 'position')));
    expect(Array.from(attr(a.ambience, 0, 'aAlpha'))).toEqual(Array.from(attr(b.ambience, 0, 'aAlpha')));
    const position = attr(a.ambience, 0, 'position');
    const heightAbove = (chimney: number, puff: number): number => position[((chimney * PUFFS_PER_CHIMNEY + puff) * 4) * 3 + 1] - a.ambience.chimneys[chimney].y;
    expect(heightAbove(0, 0)).not.toBeCloseTo(heightAbove(1, 0), 3);
  });

  it('turns grey-blue and dark at night, and is a warm grey by day', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    step(2, 1, 0);
    const day = smokeTint(ambience);
    step(2, 1, 1);
    const night = smokeTint(ambience);
    expect(day[0]).toBeGreaterThan(day[2]); // warm
    expect(night[2]).toBeGreaterThan(night[0]); // cool
    expect(night[0] + night[1] + night[2]).toBeLessThan((day[0] + day[1] + day[2]) / 2);
  });

  it('does not replace a buffer or a level array in a frame (nothing is allocated per frame)', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    wake.wake('plot_clock_tower', true);
    step(1, 1);
    const buffers = ['position', 'aAlpha', 'aSize'].map((n) => ambience.meshes[0].geometry.getAttribute(n).array);
    const levels = [ambience.smokeLevel, ambience.flagLevel];
    const flagLevel = ambience.meshes[2].geometry.getAttribute('aLevel').array;
    step(30, 1);
    step(5, 0);
    expect(['position', 'aAlpha', 'aSize'].map((n) => ambience.meshes[0].geometry.getAttribute(n).array)).toEqual(buffers);
    ['position', 'aAlpha', 'aSize'].forEach((n, i) => expect(ambience.meshes[0].geometry.getAttribute(n).array).toBe(buffers[i]));
    expect([ambience.smokeLevel, ambience.flagLevel]).toEqual(levels);
    expect(ambience.smokeLevel).toBe(levels[0]);
    expect(ambience.meshes[2].geometry.getAttribute('aLevel').array).toBe(flagLevel);
  });
});

describe('the oven glow', () => {
  it('breathes while the Windmill turns, stronger at night, and never overshoots', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    step(4, 1, 0);
    const day: number[] = [];
    for (let i = 0; i < 144; i++) {
      step(FRAME, 1, 0);
      day.push(glowOpacity(ambience));
    }
    expect(Math.max(...day) - Math.min(...day), 'it pulses').toBeGreaterThan(0.05);
    expect(Math.min(...day)).toBeGreaterThan(0.2);
    expect(Math.max(...day)).toBeLessThan(1);
    step(4, 1, 1);
    const night: number[] = [];
    for (let i = 0; i < 144; i++) {
      step(FRAME, 1, 1);
      night.push(glowOpacity(ambience));
    }
    expect(Math.max(...night)).toBeGreaterThan(Math.max(...day));
    expect(Math.max(...night)).toBeLessThanOrEqual(1);
  });

  it('is off while frozen and while the Windmill is not turning, and then does not draw', () => {
    const { wake, ambience, step } = stepper();
    step(1, 1);
    expect(drawn(ambience.meshes[1])).toBe(false);
    wake.wake('plot_windmill', true);
    step(1, 0);
    expect(drawn(ambience.meshes[1])).toBe(false);
    step(2, 1);
    expect(drawn(ambience.meshes[1])).toBe(true);
  });

  it('has three warm patches: the oven and the two lit windows above it, the windows the fainter', () => {
    expect(GLOW_QUADS).toHaveLength(3);
    const [oven, left, right] = GLOW_QUADS;
    expect(oven.strength).toBe(1);
    expect(left.strength).toBeLessThan(oven.strength);
    expect(left.strength).toBe(right.strength);
    expect(left.x).toBeCloseTo(-right.x, 12);
    const colors = buildAmbience().meshes[1].geometry.getAttribute('color').array as Float32Array;
    expect(colors[0]).toBe(1);
    expect(colors[12]).toBeCloseTo(left.strength, 6);
  });
});

describe('the pennants', () => {
  it('stand on the theatre\'s top corners and the Bakery\'s right roof end, in the town\'s palette, all streaming the same way', () => {
    expect(FLAGS.map((f) => f.plot)).toEqual(['plot_clock_tower', 'plot_clock_tower', 'plot_windmill']);
    expect(FLAGS[0].x).toBeCloseTo(THEATRE_AT.x - 0.0962, 12);
    expect(FLAGS[1].x).toBeCloseTo(THEATRE_AT.x + 0.0962, 12);
    expect(FLAGS[2].x).toBeCloseTo(BAKERY_AT.x + 0.0595, 12);
    expect(new Set(FLAGS.map((f) => f.color)).size).toBeGreaterThan(1);
    expect(FLAGS.map((f) => f.color).every((c) => [0x1f5c5c, 0xc9a227, 0xf2e6cf].includes(c))).toBe(true);
  });

  it('raise from their pole when their plot settles: the raise level is per pennant, so the theatre\'s wait for the Clock Tower', () => {
    const { wake, ambience, step } = stepper();
    wake.wake('plot_windmill', true);
    step(0.5, 1);
    const level = attr(ambience, 2, 'aLevel');
    const sway = attr(ambience, 2, 'aSway');
    expect(level.length).toBe(sway.length);
    const third = level.length;
    expect(Math.max(...level.slice(0, Math.floor(third * 0.6)))).toBe(0);
    expect(level[level.length - 1]).toBeGreaterThan(0); // the Bakery's pennant is rising
    expect(level[level.length - 1]).toBeLessThan(1);
    step(8, 1);
    expect(level[level.length - 1]).toBe(1);
    expect(Math.max(...level.slice(0, 20))).toBe(0);
  });

  it('flutter only at the free end: the pole and the pennant\'s fixed edge do not move', () => {
    const sway = attr(buildAmbience(), 2, 'aSway');
    expect(Math.min(...sway)).toBe(0);
    expect(Math.max(...sway)).toBe(1);
    const poleVertices = 16; // four sides of four corners
    for (let i = 0; i < poleVertices; i++) expect(sway[i]).toBe(0);
  });
});

describe('the town runtime with the ambience', () => {
  function boot() {
    const { town, uniforms } = syntheticTown();
    const runtime = new TownRuntime(town, uniforms, recorder(), {});
    let clock = 0;
    const run = (seconds: number): void => {
      for (let t = 0; t < seconds - 1e-9; t += FRAME) {
        clock += FRAME;
        runtime.update(FRAME, clock);
      }
    };
    return { town, runtime, run };
  }
  const windmill = () => {
    const rig = createRig('windmill', new Mesh());
    rig.running = true;
    return rig;
  };

  it('is part of every town, hidden, and the town is not busy because of it while everything is frozen', () => {
    const { town, runtime, run } = boot();
    expect(town.ambience.group.parent).toBe(town.group);
    run(1);
    expect(runtime.busy).toBe(false);
    expect(town.ambience.meshes.every((m) => !drawn(m))).toBe(true);
  });

  it('is busy for as long as a pennant flies or smoke rises (the page must keep drawing it), and not after a reset', () => {
    const { runtime, run } = boot();
    runtime.restore(['plot_windmill']); // a saved game: awake with no ripple
    run(2);
    expect(runtime.busy).toBe(true); // the Bakery's pennant flutters
    runtime.reset();
    run(10);
    expect(runtime.busy).toBe(false);
  });

  it('lights the oven and smokes the Bakery only while a Windmill rig is turning in the town', () => {
    const { town, runtime, run } = boot();
    runtime.restore(['plot_windmill']);
    run(8);
    expect(town.ambience.smokeLevel[0]).toBe(0); // no Windmill in the town: it is on the bench
    expect(town.ambience.ovenLevel).toBe(0);
    const rig = windmill();
    runtime.addRig(rig);
    run(10);
    expect(rig.speed).toBeGreaterThan(0.99);
    expect(town.ambience.smokeLevel[0]).toBe(1);
    expect(town.ambience.ovenLevel).toBe(1);
    rig.running = false; // the Windmill stops: the Bakery cools
    run(12);
    expect(town.ambience.smokeLevel[0]).toBe(0);
    expect(town.ambience.ovenLevel).toBe(0);
    runtime.removeRig(rig);
  });

  it('follows the night the runtime eases to', () => {
    const { town, runtime, run } = boot();
    runtime.restore(['plot_windmill']);
    runtime.addRig(windmill());
    run(8);
    const day = (town.ambience.meshes[0].material as ShaderMaterial).uniforms.uTint.value as { toArray(): number[] };
    const dayTint = day.toArray();
    runtime.setNight(true, true);
    run(2);
    expect(day.toArray()[2]).toBeGreaterThan(day.toArray()[0]);
    expect(day.toArray()[0]).toBeLessThan(dayTint[0]);
  });
});

describe.skipIf(!modelsPresent)('the ambience against the real GLBs', () => {
  const vertices = (root: Object3D, keep: (v: Vector3, mesh: Mesh) => boolean): Vector3[] => {
    root.updateMatrixWorld(true);
    const out: Vector3[] = [];
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const v = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        if (keep(v, mesh)) out.push(v);
      }
    });
    return out;
  };
  const materialOf = (mesh: Mesh): string => (mesh.material as { name: string }).name;

  it('finds the Bakery\'s SOCKET_Smoke where the table says its chimney mouth is', async () => {
    const bakery = (await realSource('tockton/bakery/bakery_building.glb')).scene;
    const socket = bakery.getObjectByName('SOCKET_Smoke');
    expect(socket).toBeDefined();
    const withSocket = buildAmbience({ bakery }).chimneys[0];
    const fallback = buildAmbience().chimneys[0];
    expect(withSocket.x).toBeCloseTo(fallback.x, 5);
    expect(withSocket.y).toBeCloseTo(fallback.y, 5);
    expect(withSocket.z).toBeCloseTo(fallback.z, 5);
  });

  it('puts each house\'s chimney on the cap of its stack, at any yaw (the highest vertices of the real file)', async () => {
    for (const [name, mouth] of Object.entries(CHIMNEY_MOUTH)) {
      expect(DRESSING_NODES[name as keyof typeof DRESSING_NODES].kind).toBe('house');
      for (const yawDeg of [0, 90, 200]) {
        const item: DressingItem = { id: 't', node: name as DressingItem['node'], x: 5, z: -3, yawDeg, wakes: 'plot_music_box' };
        const dressing = buildDressing(await loadDressingModels(realSource), libraryRegistry(), [item]);
        const all = vertices(dressing.group, () => true);
        const top = Math.max(...all.map((v) => v.y));
        const cap = all.filter((v) => v.y > top - 0.0015);
        const centre = cap.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / cap.length);
        const chimney = houseChimney(item)!;
        expect(centre.x, `${name} yaw ${yawDeg} x`).toBeCloseTo(chimney.x, 3);
        expect(centre.z, `${name} yaw ${yawDeg} z`).toBeCloseTo(chimney.z, 3);
        expect(top, `${name} height`).toBeCloseTo(chimney.y, 3);
        expect(mouth[1]).toBeGreaterThan(0.1);
      }
    }
  });

  it('puts the three pennants on the brass finials of the real theatre and Bakery', async () => {
    const theatre = (await realSource('tockton/theatre/theatre_facade.glb')).scene;
    const bakery = (await realSource('tockton/bakery/bakery_building.glb')).scene;
    const corners = vertices(theatre, (v, m) => materialOf(m) === 'Mat_PolishedBrass' && Math.abs(v.x) > 0.09 && v.y > 0.15);
    expect(corners.length).toBeGreaterThan(0);
    const topOf = (side: number, set: Vector3[]): Vector3 => set.filter((v) => Math.sign(v.x) === side).reduce((a, v) => (v.y > a.y ? v : a));
    for (const [flag, side] of [[FLAGS[0], -1], [FLAGS[1], 1]] as const) {
      const finial = topOf(side, corners);
      expect(flag.y, flag.id).toBeCloseTo(finial.y, 3); // within half a millimetre of the top of the ball
      expect(flag.x - THEATRE_AT.x, flag.id).toBeCloseTo(side * 0.0962, 3);
      expect(flag.z - THEATRE_AT.z, flag.id).toBeCloseTo(finial.z, 3);
    }
    const roofEnd = vertices(bakery, (v, m) => materialOf(m) === 'Mat_AgedBrass' && v.x > 0.05 && v.y > 0.15);
    const top = roofEnd.reduce((a, v) => (v.y > a.y ? v : a));
    expect(FLAGS[2].y).toBeCloseTo(top.y, 3);
    expect(FLAGS[2].x - BAKERY_AT.x).toBeCloseTo(top.x, 3);
  });

  it('puts the glow on the Bakery\'s oven mouth and two lit windows, in front of their frames', async () => {
    const bakery = (await realSource('tockton/bakery/bakery_building.glb')).scene;
    const lit = vertices(bakery, (_v, m) => materialOf(m) === 'Mat_WarmEmissive');
    const inside = (q: (typeof GLOW_QUADS)[number]): Vector3[] => lit.filter((v) => Math.abs(v.x - q.x) < 0.012 && Math.abs(v.y - q.y) < 0.02);
    for (const q of GLOW_QUADS) {
      expect(inside(q).length, `an emissive surface under the quad at ${q.x}, ${q.y}`).toBeGreaterThan(0);
      expect(q.z, 'in front of the 47 mm frames').toBeGreaterThan(0.047);
      expect(q.z, 'and not floating off the wall').toBeLessThan(0.052);
    }
  });

  it('sits beside the other buildings: the town with its dressing and ambience builds without a warning', async () => {
    const warnings: unknown[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args);
    try {
      const { loadTown } = await import('../../src/town/scene');
      const town = await loadTown(realSource, libraryRegistry());
      expect(town.ambience.chimneys.map((c) => c.id)).toEqual(['bakery', ...SMOKING_HOUSES]);
    } finally {
      console.warn = original;
    }
    expect(warnings).toEqual([]);
  });
});
