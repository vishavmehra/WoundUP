import { Group, PerspectiveCamera, PointLight, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { precompileNight } from '../../src/town/night';
import type { ShaderCompiler } from '../../src/town/night';

/**
 * The night's shader programs are compiled while it is still day: the lamp lights (and whatever hides them) are visible for the one
 * `compileAsync` call (three reads the lights that are visible when it is called) and hidden again before anything is drawn.
 */

const lamps = (n: number): PointLight[] =>
  Array.from({ length: n }, () => {
    const light = new PointLight(0xffc66d, 0);
    light.visible = false;
    return light;
  });

const NOTHING: ShaderCompiler = { compileAsync: () => Promise.resolve() };

describe('precompileNight', () => {
  it('compiles the scene, with the lamps shown for that call only and hidden again before anything can draw', async () => {
    const lights = lamps(4);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const seen: boolean[][] = [];
    const renderer: ShaderCompiler = {
      compileAsync: vi.fn((s, c) => {
        expect(s).toBe(scene);
        expect(c).toBe(camera);
        seen.push(lights.map((l) => l.visible));
        return Promise.resolve();
      }),
    };

    const done = precompileNight(renderer, scene, camera, lights);
    expect(lights.map((l) => l.visible), 'hidden again as soon as the call returns, not when the programs are ready').toEqual([false, false, false, false]);
    expect(seen).toEqual([[true, true, true, true]]);
    await done;
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(lights.every((l) => !l.visible)).toBe(true);
  });

  it('leaves each light as it was (a town that loads at night has them on)', async () => {
    const lights = lamps(3);
    lights[1].visible = true;
    await precompileNight(NOTHING, new Scene(), new PerspectiveCamera(), lights);
    expect(lights.map((l) => l.visible)).toEqual([false, true, false]);
  });

  it('also shows what hides them for the call: a light under a hidden stage is not counted by three, and the stage is hidden again after', async () => {
    const scene = new Scene();
    const stage = new Group();
    const town = new Group();
    stage.visible = false;
    scene.add(stage);
    stage.add(town);
    const lights = lamps(2);
    town.add(...lights);
    let during: boolean[] = [];
    await precompileNight(
      {
        compileAsync: () => {
          during = [stage.visible, town.visible, ...lights.map((l) => l.visible)];
          return Promise.resolve();
        },
      },
      scene,
      new PerspectiveCamera(),
      lights,
    );
    expect(during).toEqual([true, true, true, true]);
    expect([stage.visible, town.visible, ...lights.map((l) => l.visible)]).toEqual([false, true, false, false]);
  });

  it('puts everything back and passes the error on when the compile call throws, and waits for the programs otherwise', async () => {
    const lights = lamps(2);
    const failing: ShaderCompiler = {
      compileAsync: () => {
        throw new Error('no context');
      },
    };
    expect(() => precompileNight(failing, new Scene(), new PerspectiveCamera(), lights)).toThrow('no context');
    expect(lights.every((l) => !l.visible)).toBe(true);

    let ready = false;
    const slow: ShaderCompiler = { compileAsync: () => new Promise((resolve) => setTimeout(() => ((ready = true), resolve(undefined)), 5)) };
    await precompileNight(slow, new Scene(), new PerspectiveCamera(), lights);
    expect(ready).toBe(true);
  });

  it('does nothing for a town without lamps (the gift page and the demo have none)', async () => {
    const compileAsync = vi.fn(() => Promise.resolve());
    await precompileNight({ compileAsync }, new Scene(), new PerspectiveCamera(), []);
    expect(compileAsync).not.toHaveBeenCalled();
  });
});
