import { AnimationClip, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, VectorKeyframeTrack } from '@iwsdk/core';
import type { TownAudio } from '../../src/audio/engine';
import type { PlotId } from '../../src/game/content';
import { MaterialRegistry, parseLibrary } from '../../src/materials';
import { MACHINE_SNAP_PART, machineOfPlot, PLOTS } from '../../src/town/layout';
import type { ModelSource, TownModel } from '../../src/town/scene';
import { buildTown } from '../../src/town/scene';
import { createWakeUniforms } from '../../src/town/wake-shader';

// @types/node is not installed (tsconfig lists no node types) but Vitest runs in Node: reach fs through a typed shim.
interface NodeFs {
  readFileSync(path: URL): Uint8Array<ArrayBuffer>;
  existsSync(path: URL): boolean;
}
export const fs = (await import('node:fs' as string)) as NodeFs;
export const repoUrl = (p: string): URL => new URL(`../../${p}`, import.meta.url);

/** The real shared material library with no textures loaded: constants only, enough to build and patch the materials. */
export function libraryRegistry(): MaterialRegistry {
  const json: unknown = JSON.parse(new TextDecoder().decode(fs.readFileSync(repoUrl('public/assets/materials/library.json'))));
  return new MaterialRegistry(parseLibrary(json), { baseUrl: 'http://localhost/assets/materials/', loadTexture: () => Promise.reject(new Error('no textures in tests')) });
}

/** A mesh with a proxy material of the given library name. */
export function mesh(name: string, material = 'Mat_AgedBrass'): Mesh {
  const m = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshStandardMaterial({ name: material }));
  m.name = name;
  return m;
}

/** A `SOCKET_<name>` empty with the `wu` data the interaction reader expects. */
export function socket(name: string, x: number, y: number, z: number, accepts: string[], extra: Record<string, unknown> = {}): Object3D {
  const node = new Object3D();
  node.name = `SOCKET_${name}`;
  node.position.set(x, y, z);
  node.userData.wu = { type: 'socket', accepts, ...extra };
  return node;
}

export function group(name: string, ...children: Object3D[]): Group {
  const g = new Group();
  g.name = name;
  g.add(...children);
  return g;
}

export function kneadClip(): AnimationClip {
  return new AnimationClip('Otto_Knead', 1, [new VectorKeyframeTrack('Otto_Forearms.position', [0, 0.5, 1], [0, 0, 0, 0, 0.002, 0, 0, 0, 0])]);
}

export function townModels(withClip = true): Record<'ground' | 'bakery' | 'theatre' | 'otto' | 'mira', TownModel> {
  const ground = group('TownGround', mesh('TownGround_Slab'));
  for (const plot of Object.values(PLOTS)) {
    ground.add(socket(plot.socket, plot.x, 0.006, plot.z, [MACHINE_SNAP_PART[machineOfPlot(plot.id)]]));
  }
  const bakery = group('Bakery', mesh('Bakery_Shell'), socket('Baker', -0.045, 0.004, 0.0275, ['figure_otto']));
  const otto = group('Otto', mesh('Otto_Body'), mesh('Otto_Forearms'));
  return {
    ground: { scene: ground, animations: [] },
    bakery: { scene: bakery, animations: [] },
    theatre: { scene: group('Theatre', mesh('TheatreFacade_Shell')), animations: [] },
    otto: { scene: otto, animations: withClip ? [kneadClip()] : [] },
    mira: { scene: group('Mira', mesh('Mira_Body')), animations: [] },
  };
}

export function syntheticTown(withClip = true) {
  const registry = libraryRegistry();
  const town = buildTown(townModels(withClip), registry);
  const uniforms = createWakeUniforms();
  return { town, uniforms, registry };
}

/** A `ModelSource` that hands out the scene of `models[path]` (a function building a fresh one each call). */
export function sourceOf(models: Record<string, () => TownModel>): ModelSource {
  return (path) => {
    const make = models[path];
    if (!make) return Promise.reject(new Error(`unexpected model ${path}`));
    return Promise.resolve(make());
  };
}

export interface AudioCall {
  kind: 'pluck' | 'chime';
  midi?: number;
  velocity?: number;
  level?: number;
  plot?: PlotId;
}

export function recorder(): TownAudio & { calls: AudioCall[] } {
  const calls: AudioCall[] = [];
  return {
    calls,
    pluck: (midi, velocity, level) => void calls.push({ kind: 'pluck', midi, velocity, level }),
    chime: (plot) => void calls.push({ kind: 'chime', plot }),
  };
}
