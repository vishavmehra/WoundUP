import { Group } from '@iwsdk/core';
import { describe, expect, it, vi } from 'vitest';
import { bakeTown } from '../../src/town/bake';
import { BAKER_SOCKET } from '../../src/town/layout';
import { createRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import { loadTown, TOWN_MODEL_PATHS } from '../../src/town/scene';
import { emptyTownSource } from '../../src/town/stand-in';
import { createWakeUniforms } from '../../src/town/wake-shader';
import { libraryRegistry } from './helpers';

describe('emptyTownSource (the gift page never downloads the town)', () => {
  it('answers every town model with a fresh empty group, and the Bakery with its baker socket', async () => {
    const [a, b] = await Promise.all([emptyTownSource(TOWN_MODEL_PATHS.ground), emptyTownSource(TOWN_MODEL_PATHS.ground)]);
    expect(a.scene).not.toBe(b.scene);
    expect(a.scene.children).toHaveLength(0);
    expect(a.animations).toEqual([]);
    const bakery = await emptyTownSource(TOWN_MODEL_PATHS.bakery);
    expect(bakery.scene.getObjectByName(BAKER_SOCKET)).toBeDefined();
  });

  it('builds, bakes and steps a town that has nothing in it, without a warning, and still steps a machine', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const town = await loadTown(emptyTownSource, libraryRegistry(), false);
      expect(town.dressing).toBeNull();
      expect(town.knead).toBeNull();
      bakeTown(town);
      const runtime = new TownRuntime(town, createWakeUniforms());
      const rig = createRig('music_box', new Group());
      runtime.addRig(rig);
      for (let i = 0; i < 3; i++) runtime.update(0.016, i * 0.016);
      runtime.removeRig(rig);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
