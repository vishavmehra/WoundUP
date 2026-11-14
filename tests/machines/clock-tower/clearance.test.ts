// The Clock Tower's movement against the real GLBs, in Node: nothing the movement draws crosses the shell, the base, the bell, the
// dial or another part, at rest and while it moves (the pendulum at both ends of its swing, the escape wheel and the train at
// other angles); every part keeps a clear gap from the shell; and the two gear pairs mesh without their teeth crossing at any angle.
// Set WU_MODELS_DIR to a models folder to run it against another checkout; skipped when the files are not in the tree.

import type { Mesh, Object3D } from 'three';
import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildClockTower,
  CLOCK_TOWER_MODEL_PATHS,
  CLOCK_TOWER_NODE_NAMES,
  ClockTowerNodes,
  ClockTowerRuntime,
  MESHES,
  MOVEMENT_PARTS,
  movementNodeName,
  PENDULUM_AMPLITUDE_RAD,
  trainRatios,
} from '../../../src/machines/clock-tower';
import type { ModelSource } from '../../../src/town/scene';
import { fs, libraryRegistry, repoUrl } from '../../town/helpers';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { boundsOf, clearance, collectTriangles, surfaceCrossings } from './intersect';
import type { Triangles } from './intersect';

const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : repoUrl('public/assets/models/');
const present = CLOCK_TOWER_MODEL_PATHS.every((path) => fs.existsSync(new URL(path, dir)));

const source: ModelSource = async (path) => {
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};

const MM = 0.001;
/** A part of the movement keeps at least this far from the shell, the base, the bell and the dial: a visible gap, not a touch. */
const MIN_GAP = 0.3 * MM;
/** Two teeth that mesh keep at least this far apart. */
const MIN_TOOTH_GAP = 0.1 * MM;

const underNamed = (node: Object3D, name: string): boolean => {
  for (let n: Object3D | null = node; n; n = n.parent) if (n.name === name) return true;
  return false;
};

describe.skipIf(!present)('the Clock Tower movement against the real GLBs', () => {
  let root: Object3D;
  let nodes: ClockTowerNodes;
  let runtime: ClockTowerRuntime;
  let statics: Triangles;
  let node: (name: string) => Object3D;
  const tris = (name: string): Triangles => collectTriangles(node(name));

  /** A pose: the pendulum, the escape wheel and everything the wheel turns, at those angles. */
  const pose = (pendulum: number, wheel: number): void => {
    runtime.pendulumZ = pendulum;
    runtime.escapeWheelZ = wheel;
    nodes.apply(runtime);
    root.updateMatrixWorld(true);
  };

  beforeAll(async () => {
    const rig = await buildClockTower(source, libraryRegistry());
    root = rig.root;
    nodes = new ClockTowerNodes();
    expect(nodes.resolve(root)).toEqual([]);
    runtime = new ClockTowerRuntime(() => 0);
    root.updateMatrixWorld(true);
    statics = collectTriangles(root, (mesh: Mesh) => !underNamed(mesh, CLOCK_TOWER_NODE_NAMES.movement));
    node = (name) => root.getObjectByName(name) as Object3D;
  });

  const solid = ['spring', 'barrel', 'inter_gear_1', 'large_gear', 'inter_gear_2', 'inter_gear_3', 'drive_shaft', 'hourly_cam'].map(movementNodeName);
  const escapement = ['EscapeWheel', 'EscapementAnchor', 'Pendulum_Rod'];

  it('has every part of the movement as a named node of its own, and as many parts as it should', () => {
    expect(MOVEMENT_PARTS).toHaveLength(8);
    for (const name of [...solid, ...escapement, CLOCK_TOWER_NODE_NAMES.movement, CLOCK_TOWER_NODE_NAMES.shell, CLOCK_TOWER_NODE_NAMES.dial, CLOCK_TOWER_NODE_NAMES.bell]) {
      expect(root.getObjectByName(name), name).toBeDefined();
    }
    expect(root.name).toBe(CLOCK_TOWER_NODE_NAMES.base);
    expect(underNamed(node('ClockTower_Pillar'), CLOCK_TOWER_NODE_NAMES.shell)).toBe(true); // the shell's meshes are under the shell, for the X-ray effect
    expect(underNamed(node(movementNodeName('large_gear')), CLOCK_TOWER_NODE_NAMES.shell)).toBe(false); // and the movement is not
    expect(underNamed(node(movementNodeName('large_gear')), CLOCK_TOWER_NODE_NAMES.movement)).toBe(true);
  });

  it('keeps every part of the movement clear of the shell, the base, the bell and the dial at rest, with a gap to spare', () => {
    pose(0, 0);
    for (const name of [...solid, ...escapement]) {
      const part = tris(name);
      expect(part.length, name).toBeGreaterThan(0);
      expect(surfaceCrossings(part, statics), `${name} crosses the tower`).toBe(0);
      expect(clearance(part, statics, 3 * MM), `${name} too close to the tower`).toBeGreaterThanOrEqual(MIN_GAP);
    }
  });

  it('keeps clear of the tower while it moves: the pendulum at both ends of its swing, the wheel and the train at other angles, the cam turned', () => {
    for (const [swing, wheel, cam] of [
      [PENDULUM_AMPLITUDE_RAD, -0.4, 1.1],
      [-PENDULUM_AMPLITUDE_RAD, -1.9, 2.6],
      [0.07, -3.3, 4.4],
    ] as const) {
      runtime.hourlyCamZ = cam;
      pose(swing, wheel);
      for (const name of [...solid, ...escapement]) {
        const part = tris(name);
        expect(surfaceCrossings(part, statics), `${name} at swing ${swing}, wheel ${wheel}`).toBe(0);
        expect(clearance(part, statics, 3 * MM), `${name} at swing ${swing}, wheel ${wheel}`).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
    runtime.hourlyCamZ = 0;
  });

  it('lets no part of the movement cross another, except where the escapement itself works and where the two gears of a mesh turn into each other', () => {
    const inEscapement = new Set(escapement);
    const meshing = new Set(MESHES.map(([a, b]) => [a, b].map(movementNodeName).sort().join('|')));
    pose(0, 0);
    const all = [...solid, ...escapement];
    const parts = new Map(all.map((name) => [name, tris(name)] as const));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (inEscapement.has(all[i]) && inEscapement.has(all[j])) continue;
        if (meshing.has([all[i], all[j]].sort().join('|'))) continue; // tested tooth by tooth below
        expect(surfaceCrossings(parts.get(all[i]) as Triangles, parts.get(all[j]) as Triangles), `${all[i]} against ${all[j]}`).toBe(0);
      }
    }
  });

  it('meshes inter_gear_3 with inter_gear_2 and the large gear with inter_gear_1: the teeth never cross, at any angle, driven as the rig drives them', () => {
    const ratios = trainRatios();
    for (const [driver, driven] of MESHES) {
      for (let step = 0; step < 24; step++) {
        pose(0, -0.37 * step); // wheel angles through several teeth of every gear of the train
        const a = tris(movementNodeName(driver));
        const b = tris(movementNodeName(driven));
        expect(surfaceCrossings(a, b), `${driver} and ${driven} at ${step}`).toBe(0);
        expect(clearance(a, b, 2 * MM), `${driver} and ${driven} at ${step}`).toBeGreaterThanOrEqual(MIN_TOOTH_GAP);
      }
    }
    expect(Math.abs(ratios.inter_gear_2 / ratios.inter_gear_3)).toBeCloseTo(24 / 10, 12);
  });

  it('lies where the plan says: in the tower, and the gears on the plan\'s centres', () => {
    pose(0, 0);
    const tower = boundsOf(statics);
    for (const name of [...solid, ...escapement]) {
      const box = boundsOf(tris(name));
      expect(box.min.y, name).toBeGreaterThan(0.0046); // above the base floor
      expect(box.max.y, name).toBeLessThan(tower.max.y);
      expect(Math.max(box.max.x, -box.min.x), name).toBeLessThan(0.0475);
      expect(Math.max(box.max.z, -box.min.z), name).toBeLessThan(0.0475);
    }
    const distance = (a: string, b: string): number => node(a).getWorldPosition(new Vector3()).distanceTo(node(b).getWorldPosition(new Vector3()));
    for (const [driver, driven] of MESHES) {
      expect(distance(movementNodeName(driver), movementNodeName(driven))).toBeCloseTo(0.65 * (2.5 * 17 + 1.0) * MM, 6);
    }
  });
});
