import { Quaternion } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readInteractionNodes } from '../../src/interaction/glb-reader';
import { buildMachine, buildMusicBox, buildWindmill } from '../../src/town/machines';
import { MACHINE_SNAP_PART, machineOfPlot, PLOTS } from '../../src/town/layout';
import { loadTown, plotSocket } from '../../src/town/scene';
import type { ModelSource } from '../../src/town/scene';
import { fs, libraryRegistry, repoUrl } from './helpers';

/**
 * The town and the machines built from the real GLBs, parsed in Node. It guards the names and frames machines.ts and scene.ts
 * rely on (SOCKET_ empties, Otto_Knead, the rotation axes). Set WU_MODELS_DIR to a models folder to run it against another
 * checkout; it is skipped when the Tockton GLBs are not in the working tree (they are produced by the asset agents).
 */
const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');
const present = fs.existsSync(new URL('tockton/environment/town_ground.glb', dir)) && fs.existsSync(new URL('tockton/windmill/windmill_base.glb', dir));

const source: ModelSource = async (path) => {
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};

describe.skipIf(!present)('Tockton from the real GLBs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('assembles the town without a warning: every plot socket takes its own machine base, Otto has his socket and his clip', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const town = await loadTown(source, libraryRegistry());
    expect(warn).not.toHaveBeenCalled(); // town_ground.glb carries the pads and sockets of all six plots (ADR-048), so the town makes none of its own
    expect(town.knead).not.toBeNull();
    const sockets = readInteractionNodes(town.ground).sockets;
    for (const plot of Object.values(PLOTS)) {
      const node = plotSocket(town, plot.id);
      expect(node, plot.id).not.toBeNull();
      const def = sockets.find((s) => s.node === node);
      expect(def?.accepts, plot.id).toEqual([MACHINE_SNAP_PART[machineOfPlot(plot.id)]]);
      expect(node?.position.x).toBeCloseTo(plot.x, 3);
      expect(node?.position.z).toBeCloseTo(plot.z, 3);
      // The file tips these sockets (Z-up frame); a Y-up machine base seated on one must stand upright.
      expect(node?.quaternion.angleTo(new Quaternion()), plot.id).toBeLessThan(1e-6);
    }
  });

  it('builds the Windmill, the Carousel and the Music Box with every part seated and the right nodes turning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registry = libraryRegistry();
    const windmill = await buildWindmill(source, registry);
    expect(windmill.rotors.map((r) => r.socketId).sort()).toEqual(['millstone', 'sails']);
    const carousel = await buildMachine('carousel', source, registry);
    expect(carousel?.rotors.map((r) => r.socketId)).toEqual(['platform']);
    expect(carousel?.rotors[0].axis).toBe('y'); // carousel_platform.glb is Y-up: its wu block says +Y on the root node
    expect(carousel?.bobbers).toHaveLength(3);
    expect(carousel?.pulsers).toHaveLength(6);
    expect(carousel?.melody).toBe(carousel?.rotors[0]);
    const box = await buildMusicBox(source, registry);
    expect(box.melody?.socketId).toBe('cylinder');
    expect(box.rotors.length).toBeGreaterThanOrEqual(8);
    expect(box.lid).not.toBeNull();
    expect(box.rotors.find((r) => r.socketId === 'governor')?.node.name).toBe('Governor_Weights'); // the frame stays still
    for (const r of [...windmill.rotors, ...box.rotors]) expect(r.axis, r.socketId).toBe('z');
    expect(warn).not.toHaveBeenCalled();
  });
});
