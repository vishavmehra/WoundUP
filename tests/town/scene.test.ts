import { Mesh } from '@iwsdk/core';
import { describe, expect, it, vi } from 'vitest';
import { TOWN_NODE_ID } from '../../src/stage';
import { BAKERY_AT, MIRA_AT, PLOTS, THEATRE_AT } from '../../src/town/layout';
import { buildTown, KNEAD_CLIP, plotSocket } from '../../src/town/scene';
import { libraryRegistry, syntheticTown, townModels } from './helpers';

describe('buildTown', () => {
  it('builds one town group under the stage node id, with the ground, Bakery, theatre and Mira', () => {
    const { town } = syntheticTown();
    expect(town.group.userData.iwsdkSceneNodeId).toBe(TOWN_NODE_ID);
    expect(town.group.children).toEqual(expect.arrayContaining([town.ground, town.bakery, town.theatre, town.mira]));
    expect(town.group.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('stands the buildings and Mira where the dimensions table puts them', () => {
    const { town } = syntheticTown();
    expect([town.bakery.position.x, town.bakery.position.z]).toEqual([BAKERY_AT.x, BAKERY_AT.z]);
    expect([town.theatre.position.x, town.theatre.position.z]).toEqual([THEATRE_AT.x, THEATRE_AT.z]);
    expect(town.mira.position.toArray()).toEqual([MIRA_AT.x, MIRA_AT.y, MIRA_AT.z]);
  });

  it("puts Otto at the Bakery's SOCKET_Baker, inside the Bakery's own frame", () => {
    const { town } = syntheticTown();
    expect(town.otto.parent).toBe(town.bakery);
    const baker = town.bakery.getObjectByName('SOCKET_Baker')!;
    expect(town.otto.position.toArray()).toEqual(baker.position.toArray());
    // In town space: 2 cm behind the Bakery's front face, as in TOCKTON_DIMENSIONS §7.
    town.group.updateWorldMatrix(true, true);
    const world = town.otto.getWorldPosition(town.otto.position.clone());
    expect(world.x).toBeCloseTo(0.025, 6);
    expect(world.z).toBeCloseTo(-0.065, 6);
  });

  it("still stands Otto in the Bakery, with a warning, when the socket is missing", () => {
    const models = townModels();
    models.bakery.scene.getObjectByName('SOCKET_Baker')?.removeFromParent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const town = buildTown(models, libraryRegistry());
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(town.otto.parent).toBe(town.bakery);
    expect(town.otto.position.toArray()).toEqual([-0.045, 0.004, 0.0275]);
  });

  it('holds Otto on the first frame of his kneading clip, ready for the Windmill to wake the Bakery', () => {
    const { town } = syntheticTown();
    expect(town.knead).not.toBeNull();
    expect(town.knead!.action.getClip().name).toBe(KNEAD_CLIP);
    expect(town.knead!.action.timeScale).toBe(0);
    expect(town.knead!.action.paused).toBe(false); // played, not paused: only its speed is 0
    expect(syntheticTown(false).town.knead).toBeNull();
  });

  it('replaces every proxy material with the shared library instance (one material per name, never cloned)', () => {
    const { town, registry } = syntheticTown();
    const seen = new Set<unknown>();
    town.group.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      expect(registry.owns(mesh.material as never)).toBe(true);
      seen.add(mesh.material);
    });
    expect(seen.size).toBe(1); // every synthetic mesh is brass: one instance for all of them
    expect(libraryRegistry().owns(registry.get('Mat_AgedBrass'))).toBe(false);
  });

  it('finds the socket of every plot in the ground, at the pad centre', () => {
    const { town } = syntheticTown();
    for (const plot of Object.values(PLOTS)) {
      const socket = plotSocket(town, plot.id);
      expect(socket, plot.id).not.toBeNull();
      expect([socket!.position.x, socket!.position.z]).toEqual([plot.x, plot.z]);
    }
  });
});
