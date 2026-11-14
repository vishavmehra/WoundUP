import { Group, Mesh, Object3D } from '@iwsdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCarousel, buildMachine, buildMusicBox, buildWindmill } from '../../src/town/machines';
import type { ModelSource } from '../../src/town/scene';
import { libraryRegistry, mesh, socket } from './helpers';

/**
 * Wiring of the machine assembly on stand-in GLBs: every path gets a group with all the `SOCKET_` empties the assembly looks
 * for. The real GLBs are checked in real-glb.test.ts (when they are in the checkout).
 */
const SOCKETS = [
  'Tower', 'Rotor', 'Millstone', 'BaseHandle',
  'Lamp0', 'Lamp1', 'Lamp2', 'Lamp3', 'Lamp4', 'Lamp5',
  'Arbor', 'BracketL', 'BracketR', 'Comb', 'Cylinder', 'GearA', 'GearB', 'GearC', 'GearD', 'Governor', 'Key', 'Spring',
];

function standIn(path: string, withSockets: readonly string[] = SOCKETS): Object3D {
  const g = new Group();
  g.name = path;
  g.add(mesh(`${path}_mesh`));
  withSockets.forEach((name, i) => g.add(socket(name, i * 0.01, 0.01, 0, [], name === 'Cylinder' ? { slot: 'cylinder' } : { slot: name.toLowerCase() })));
  if (path.includes('music_box_case')) {
    const pivot = new Object3D();
    pivot.name = 'PIV_Lid';
    pivot.userData.wu = { type: 'pivot', openDeg: 90 };
    const lid = new Mesh();
    lid.name = 'MusicBoxCase_Lid';
    g.add(pivot, lid);
  }
  // The wu block of a real GLB is on its root node, under the scene group.
  const root = g.children[0];
  if (path.includes('windmill_sails')) root.userData.wu = { rotationAxis: '+Z' };
  if (path.includes('carousel_platform')) root.userData.wu = { rotationAxis: '+Y' };
  if (path.includes('governor')) {
    root.userData.wu = { rotationAxis: '+Z', movingNode: 'Governor_Weights' };
    const weights = new Group();
    weights.name = 'Governor_Weights';
    weights.userData.wu = { role: 'moving', rotationAxis: '+Z' };
    g.add(weights);
  }
  return g;
}

const loaded: string[] = [];
const source: ModelSource = (path) => {
  loaded.push(path);
  return Promise.resolve({ scene: standIn(path), animations: [] });
};

afterEach(() => {
  loaded.length = 0;
  vi.restoreAllMocks();
});

describe('machine assembly', () => {
  it('turns the Windmill sails and millstone with their own solver sockets', async () => {
    const rig = await buildWindmill(source, libraryRegistry());
    expect(rig.machineId).toBe('windmill');
    expect(rig.rotors.map((r) => r.socketId)).toEqual(['sails', 'millstone']);
    expect(rig.rotors.every((r) => r.node.parent !== null)).toBe(true);
    expect(loaded.some((p) => p.endsWith('machine_base_handle.glb'))).toBe(true); // every base carries its handle
  });

  it('lets the Windmill take other solver socket ids', async () => {
    const rig = await buildWindmill(source, libraryRegistry(), { sails: 'blades', millstone: 'stone', platform: 'platform' });
    expect(rig.rotors.map((r) => r.socketId)).toEqual(['blades', 'stone']);
  });

  it('turns the whole Carousel with its platform, rides three horses a third of a turn apart and twinkles six lamps', async () => {
    const rig = await buildCarousel(source, libraryRegistry());
    expect(rig.rotors).toHaveLength(1);
    expect(rig.rotors[0].socketId).toBe('platform');
    expect(rig.rotors[0].axis).toBe('y'); // the platform GLB is Y-up: it turns flat, not like a wheel
    expect(rig.melody).toBe(rig.rotors[0]);
    expect(rig.bobbers).toHaveLength(3);
    const phases = rig.bobbers.map((b) => b.phase);
    expect(phases[1] - phases[0]).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect(phases[2] - phases[1]).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect(rig.bobbers.every((b) => b.driver === rig.rotors[0])).toBe(true);
    expect(rig.pulsers).toHaveLength(6);
    expect(new Set(rig.pulsers.map((p) => p.phase)).size).toBe(6); // out of step with one another
  });

  it('turns the Music Box cylinder, arbor, gears, governor, spring and key, and swings the lid on its hinge', async () => {
    const rig = await buildMusicBox(source, libraryRegistry());
    expect(rig.machineId).toBe('music_box');
    expect(rig.melody?.socketId).toBe('cylinder');
    const slots = rig.rotors.map((r) => r.socketId).sort();
    // The key is not a node of the solver's graph: it turns with the spring it is fitted to, so it takes the spring's slot.
    expect(slots).toEqual(['arbor', 'geara', 'gearb', 'gearc', 'geard', 'governor', 'cylinder', 'spring', 'spring'].sort());
    const governor = rig.rotors.find((r) => r.socketId === 'governor');
    expect(governor?.node.name).toBe('Governor_Weights'); // the frame stays still, the weights turn
    expect(rig.lid?.openRad).toBeCloseTo(Math.PI / 2, 9);
    expect(rig.lid?.pivot.name).toBe('PIV_Lid');
    expect(rig.lid?.pivot.children.some((c) => c.name === 'MusicBoxCase_Lid')).toBe(true);
  });

  it('builds each machine by id, and nothing for the Clock Tower (cut first)', async () => {
    const registry = libraryRegistry();
    expect((await buildMachine('windmill', source, registry))?.machineId).toBe('windmill');
    expect((await buildMachine('carousel', source, registry))?.machineId).toBe('carousel');
    expect((await buildMachine('music_box', source, registry))?.machineId).toBe('music_box');
    expect(await buildMachine('clock_tower', source, registry)).toBeNull();
  });

  it('warns and goes on when a model lacks a socket, instead of leaving a machine in pieces silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bare: ModelSource = (path) => Promise.resolve({ scene: standIn(path, ['BaseHandle']), animations: [] });
    const rig = await buildWindmill(bare, libraryRegistry());
    expect(rig.rotors).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('SOCKET_Tower'))).toBe(true);
  });
});
