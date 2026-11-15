import { Group, Mesh, Object3D } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileBehindLanding, installRenderGate, visibleMeshesRoot } from '../src/render-gate';

function fakeWorld(presenting = false) {
  const drawn: string[] = [];
  const renderer = {
    xr: { isPresenting: presenting },
    render: (scene: string): void => void drawn.push(scene),
  };
  return { world: { renderer } as unknown as World, renderer, drawn };
}

describe('installRenderGate', () => {
  it('holds every 2D draw until it is opened, then lets them through', () => {
    const { world, renderer, drawn } = fakeWorld();
    const gate = installRenderGate(world);
    const render = renderer.render as unknown as (scene: string, camera: string) => void;
    render('first', 'camera');
    render('second', 'camera');
    expect(drawn).toEqual([]);
    gate.open();
    render('third', 'camera');
    expect(drawn).toEqual(['third']);
  });

  it('never holds an immersive frame', () => {
    const { world, renderer, drawn } = fakeWorld(true);
    installRenderGate(world);
    (renderer.render as unknown as (scene: string, camera: string) => void)('xr', 'camera');
    expect(drawn).toEqual(['xr']);
  });

  it('sits under the render budget: a wrapper installed afterwards still reaches the held draw', () => {
    const { world, renderer, drawn } = fakeWorld();
    const gate = installRenderGate(world);
    const gated = renderer.render.bind(renderer) as unknown as (scene: string, camera: string) => void;
    renderer.render = ((scene: string) => gated(scene, 'camera')) as typeof renderer.render; // what render-budget.ts does
    (renderer.render as unknown as (scene: string) => void)('held');
    gate.open();
    (renderer.render as unknown as (scene: string) => void)('shown');
    expect(drawn).toEqual(['shown']);
  });
});

describe('compileBehindLanding', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves when the shaders are built', async () => {
    const compileAsync = vi.fn(() => Promise.resolve('done'));
    await compileBehindLanding({ compileAsync }, {} as never, {} as never);
    expect(compileAsync).toHaveBeenCalledOnce();
  });

  it('never rejects: a failed compile is a warning and the first frame builds the program instead', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(compileBehindLanding({ compileAsync: () => Promise.reject(new Error('no')) }, {} as never, {} as never)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('gives up after the time allowed, so a hidden tab or a silent driver cannot hold the page back for good', async () => {
    vi.useFakeTimers();
    let settled = false;
    const done = compileBehindLanding({ compileAsync: () => new Promise(() => undefined) }, {} as never, {} as never, { giveUpMs: 5000 }).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await done;
    expect(settled).toBe(true);
  });
});

describe('visibleMeshesRoot', () => {
  it('lists the meshes that are shown, hidden ones and everything under a hidden group left out, without moving anything', () => {
    const scene = new Object3D();
    const stand = new Mesh();
    const trunk = new Group();
    const lid = new Mesh();
    trunk.add(lid);
    const town = new Group();
    const house = new Mesh();
    town.add(house);
    town.visible = false;
    const hiddenMesh = new Mesh();
    hiddenMesh.visible = false;
    scene.add(stand, trunk, town, hiddenMesh);

    const root = visibleMeshesRoot(scene);
    expect(root.children).toEqual([stand, lid]);
    expect(lid.parent).toBe(trunk);
    expect(stand.parent).toBe(scene);
  });

  it('is what compileAsync gets on a gift page: the stand-in root, with the real scene as the lights', async () => {
    const scene = new Object3D();
    scene.add(new Mesh());
    const calls: Array<[Object3D, unknown]> = [];
    await compileBehindLanding({ compileAsync: (root, _camera, target) => (calls.push([root, target]), Promise.resolve()) }, scene, {} as never, { visibleOnly: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).not.toBe(scene);
    expect(calls[0][0].children).toHaveLength(1);
    expect(calls[0][1]).toBe(scene);
  });
});
