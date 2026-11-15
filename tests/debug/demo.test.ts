import { Object3D, Vector3 } from '@iwsdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoRequest, orbitPosition, Winding } from '../../src/debug/demo';
import type { SolveResult } from '../../src/sim';
import { createRig, createRotor, stepRig } from '../../src/town/motion';

const FRAME = 1 / 60;

afterEach(() => vi.restoreAllMocks());

describe('demoRequest', () => {
  it('asks for a demo only with ?debug and a machine the build has', () => {
    expect(demoRequest('?debug&demo=music_box')).toBe('music_box');
    expect(demoRequest('?demo=carousel&debug')).toBe('carousel');
    expect(demoRequest('?debug=1&demo=windmill')).toBe('windmill');
    expect(demoRequest('?debug&demo=well')).toBe('well'); // ADR-048
    expect(demoRequest('?debug&demo=belfry')).toBe('belfry');
    expect(demoRequest('?debug&demo=clock_tower')).toBe('clock_tower');
  });

  it("shows the whole town with ?debug&demo=town, which is how the awake town's draw calls are measured", () => {
    expect(demoRequest('?debug&demo=town')).toBe('town');
    expect(demoRequest('?demo=town')).toBeNull(); // never without ?debug
  });

  it('never starts without ?debug', () => {
    expect(demoRequest('?demo=music_box')).toBeNull();
    expect(demoRequest('')).toBeNull();
    expect(demoRequest('#demo=music_box')).toBeNull();
  });

  it('starts the game when there is no machine to show, and says why for one that is not a machine', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(demoRequest('?debug')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(demoRequest('?debug&demo=bakery')).toBeNull();
    expect(demoRequest('?debug&demo=')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

function fixture(result: Partial<SolveResult>) {
  const node = new Object3D();
  const rig = createRig('music_box', node);
  rig.rotors.push(createRotor(node, 'cylinder'));
  const full: SolveResult = { status: 'runs', angularVelocity: { cylinder: 0.4 }, followerPose: {}, runSeconds: 2, triggered: {}, continuous: false, ...result };
  return { rig, winding: new Winding(rig, full) };
}

/** What the town runtime does each frame, then what the demo does. */
function tick(rig: ReturnType<typeof fixture>['rig'], winding: Winding, frames: number): void {
  for (let i = 0; i < frames; i++) {
    stepRig(rig, FRAME, i * FRAME);
    winding.update(FRAME);
  }
}

describe('Winding', () => {
  it('starts the machine wound, driven by the solver result', () => {
    const { rig, winding } = fixture({});
    expect(rig.running).toBe(true);
    expect(rig.result?.angularVelocity.cylinder).toBe(0.4);
    expect(winding.left).toBe(2);
    expect(winding.windings).toBe(1);
  });

  it('runs for the spring\'s run time, lets it ease to a stop, then winds it again', () => {
    const { rig, winding } = fixture({ runSeconds: 1.5 });
    tick(rig, winding, 85); // 1.42 s
    expect(rig.running).toBe(true);
    tick(rig, winding, 10); // past 1.5 s
    expect(rig.running).toBe(false);
    expect(winding.windings).toBe(1); // still easing down: not yet wound again
    expect(rig.speed).toBeGreaterThan(0.02);
    for (let i = 0; i < 600 && winding.windings === 1; i++) tick(rig, winding, 1);
    expect(winding.windings).toBe(2);
    expect(rig.running).toBe(true);
    expect(winding.left).toBe(1.5);
  });

  it('never runs a wind-driven machine down', () => {
    const { rig, winding } = fixture({ continuous: true, runSeconds: 1e9 });
    expect(winding.left).toBe(Infinity);
    tick(rig, winding, 60 * 60);
    expect(rig.running).toBe(true);
    expect(winding.windings).toBe(1);
  });
});

describe('orbitPosition', () => {
  it('puts the camera the given distance from the target, in front of it at azimuth 0', () => {
    const target = new Vector3(1, 2, -3);
    const front = orbitPosition(new Vector3(), target, 0.5, 0, 0);
    expect(front.toArray()).toEqual([1, 2, -2.5]);
    const above = orbitPosition(new Vector3(), target, 0.5, 1.2, Math.PI / 2);
    expect(above.x).toBeCloseTo(1, 12);
    expect(above.y).toBeCloseTo(2.5, 12);
    expect(above.z).toBeCloseTo(-3, 12);
    for (const [azimuth, elevation] of [[0.4, 0.3], [2.5, 1.1], [-1, 0.05]]) {
      expect(orbitPosition(new Vector3(), target, 0.8, azimuth, elevation).distanceTo(target)).toBeCloseTo(0.8, 12);
    }
  });
});
