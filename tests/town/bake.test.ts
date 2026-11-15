import { BoxGeometry, Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { BELFRY, solveAssembly, WELL } from '../../src/content/blueprints';
import { BELFRY_BELL_NODE, buildBelfry } from '../../src/machines/belfry/build';
import { buildClockTower } from '../../src/machines/clock-tower/build';
import { buildWell, WELL_NODE } from '../../src/machines/well/build';
import { MAX_WIND_UNITS } from '../../src/sim';
import { ClockTowerNodes, CLOCK_TOWER_NODE, TheatreDoors } from '../../src/machines/clock-tower/rig';
import { readInteractionNodes } from '../../src/interaction/glb-reader';
import { bakeRig, bakeStatic, bakeTown, disposeBaked } from '../../src/town/bake';
import { buildCarousel, buildMachine, buildMusicBox, buildWindmill } from '../../src/town/machines';
import { createRig, createRotor, stepRig } from '../../src/town/motion';
import { loadTown } from '../../src/town/scene';
import { isXRayShell } from '../../src/town/xray-view';
import type { MachineRig } from '../../src/town/motion';
import { libraryRegistry } from './helpers';
import { modelsPresent, realSource } from './real-source';

/** What a draw of the scene would show, per material: triangles, world area and world box. Equal before and after a bake. */
interface Fingerprint {
  triangles: number;
  area: number;
  box: Box3;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _ab = new Vector3();
const _ac = new Vector3();

function triangleCount(geometry: BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function fingerprint(root: Object3D): { drawn: number; byMaterial: Map<string, Fingerprint> } {
  root.updateWorldMatrix(true, true);
  const byMaterial = new Map<string, Fingerprint>();
  let drawn = 0;
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    for (let n: Object3D | null = mesh; n; n = n.parent) if (!n.visible) return;
    const material = mesh.material as Material;
    if (!material.visible) return;
    drawn++;
    const entry = byMaterial.get(material.uuid) ?? { triangles: 0, area: 0, box: new Box3() };
    byMaterial.set(material.uuid, entry);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const triangles = triangleCount(geometry);
    entry.triangles += triangles;
    for (let t = 0; t < triangles; t++) {
      const at = (k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k);
      _a.fromBufferAttribute(position, at(0)).applyMatrix4(mesh.matrixWorld);
      _b.fromBufferAttribute(position, at(1)).applyMatrix4(mesh.matrixWorld);
      _c.fromBufferAttribute(position, at(2)).applyMatrix4(mesh.matrixWorld);
      entry.area += _ab.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)).length() / 2;
      entry.box.expandByPoint(_a).expandByPoint(_b).expandByPoint(_c);
    }
  });
  return { drawn, byMaterial };
}

function expectSamePicture(before: ReturnType<typeof fingerprint>, after: ReturnType<typeof fingerprint>): void {
  expect([...after.byMaterial.keys()].sort()).toEqual([...before.byMaterial.keys()].sort());
  for (const [key, a] of before.byMaterial) {
    const b = after.byMaterial.get(key) as Fingerprint;
    expect(b.triangles).toBe(a.triangles);
    // The merged vertices are float32 in the frame of their node. A material can have zero area (the ambience quads are
    // collapsed until the town wakes), so the tolerance has a floor.
    expect(Math.abs(b.area - a.area)).toBeLessThanOrEqual(Math.max(a.area * 1e-5, 1e-12));
    for (const corner of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) expect(b.box[corner][axis]).toBeCloseTo(a.box[corner][axis], 5);
  }
}

const brass = new MeshStandardMaterial({ name: 'Mat_AgedBrass' });
const walnut = new MeshStandardMaterial({ name: 'Mat_Walnut' });
const glass = new MeshStandardMaterial({ name: 'Mat_WarmGlass', transparent: true });
const teal = new MeshStandardMaterial({ name: 'Mat_Teal' });
const steel = new MeshStandardMaterial({ name: 'Mat_Steel' });
const box = (name: string, material: Material, x = 0, y = 0, z = 0): Mesh => {
  const geometry = new BoxGeometry(0.01, 0.01, 0.01);
  geometry.clearGroups(); // BoxGeometry draws six material groups; a GLB primitive has one material and no groups
  const m = new Mesh(geometry, material);
  m.name = name;
  m.position.set(x, y, z);
  return m;
};

/** A machine of two brass case meshes, a walnut one, a platform of two brass meshes and a walnut one, and a lone shaft. */
function makeMachine(): { root: Group; platform: Group; shaft: Mesh } {
  const root = new Group();
  root.name = 'Machine';
  root.position.set(0.3, 0.1, -0.2);
  root.rotation.y = 0.7;
  const shaft = box('Shaft', brass, 0.02, 0, 0);
  const platform = new Group();
  platform.name = 'Platform';
  platform.position.set(0, 0.03, 0);
  platform.add(box('PlatformBrassA', brass, 0.01, 0, 0), box('PlatformBrassB', brass, -0.01, 0, 0.01), box('PlatformWood', walnut, 0, 0.01, 0));
  root.add(box('CaseA', brass, 0, 0, 0), box('CaseB', brass, 0.03, 0, 0), box('CaseC', walnut, 0, 0, 0.03), box('Pane', glass, 0, 0.02, 0), shaft, platform);
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(box('HiddenA', brass), box('HiddenB', brass));
  root.add(hidden);
  const mirror = box('Mirrored', brass);
  mirror.scale.x = -1;
  root.add(mirror);
  return { root, platform, shaft };
}

describe('bakeStatic', () => {
  it('merges the static meshes of each moving node into one mesh per material, and leaves the moving nodes alone', () => {
    const { root, platform, shaft } = makeMachine();
    const before = fingerprint(root);
    const baked = bakeStatic(root, { moving: [shaft, platform] });
    const after = fingerprint(root);

    expect(baked.merged.map((m) => m.name).sort()).toEqual(['Baked_Machine_Mat_AgedBrass', 'Baked_Platform_Mat_AgedBrass']);
    expect(baked.sources).toBe(4); // CaseA and CaseB; PlatformBrassA and PlatformBrassB
    expect(baked.skipped).toBe(2); // the transparent pane and the mirrored mesh (the hidden group is not counted: it is not looked into)
    expect(after.drawn).toBe(before.drawn - 2);
    expect(root.getObjectByName('Baked_Machine_Mat_AgedBrass')?.userData.bakedFrom).toEqual(['CaseA', 'CaseB']);
    expect(platform.getObjectByName('Baked_Platform_Mat_AgedBrass')?.parent).toBe(platform);
    // The moving nodes are the same objects, in place; the walnut meshes were alone in their frame; the others are not mergeable.
    expect(shaft.parent).toBe(root);
    expect(platform.parent).toBe(root);
    for (const name of ['PlatformWood', 'CaseC', 'Pane', 'Mirrored', 'HiddenA', 'Shaft']) expect(root.getObjectByName(name), name).toBeDefined();
    expect(root.getObjectByName('CaseA')).toBeUndefined();
    expectSamePicture(before, after);

    baked.dispose();
    expect(root.getObjectByName('Baked_Machine_Mat_AgedBrass')).toBeUndefined();
    expect(baked.merged).toHaveLength(0);
  });

  it('the merged meshes follow their moving frame exactly as the loose meshes did', () => {
    const loose = makeMachine();
    const flat = makeMachine();
    bakeStatic(flat.root, { moving: [flat.shaft, flat.platform] });
    for (const m of [loose, flat]) {
      m.platform.rotation.y = 1.1;
      m.shaft.rotation.z = 0.4;
      m.root.position.x += 0.5;
      m.root.scale.setScalar(0.4); // the town scale: a machine on its plot is smaller than on the bench
    }
    expectSamePicture(fingerprint(loose.root), fingerprint(flat.root));
  });

  it('bakes a material the casing and the mechanism share twice (a combined mesh that draws, hidden split meshes for X-ray) and the others once', () => {
    const root = new Group();
    root.add(
      box('Case_A', brass, 0),
      box('Case_B', brass, 0.02),
      box('Case_C', walnut),
      box('Bearing', brass, 0.04),
      box('Bolt', brass, 0.05),
      box('Pin', walnut, 0.06),
      box('Case_D', teal, 0.07),
      box('Case_E', teal, 0.08),
      box('Gear_A', steel, 0.09),
      box('Gear_B', steel, 0.1),
    );
    const before = fingerprint(root);
    const baked = bakeStatic(root, { shell: ['Case_'] });
    const after = fingerprint(root);

    // What draws: one combined mesh for each shared material (brass, walnut), one flagged casing mesh of the teal only the casing wears, one steel mesh of the gears.
    expect(baked.merged.map((m) => m.name).sort()).toEqual(['Baked_root_Mat_AgedBrass', 'Baked_root_Mat_Steel', 'Baked_root_Mat_Teal_Shell', 'Baked_root_Mat_Walnut']);
    expect(after.drawn).toBe(4);
    expect(baked.split.map((m) => m.name).sort()).toEqual(['Baked_root_Mat_AgedBrass_Part', 'Baked_root_Mat_AgedBrass_Shell', 'Baked_root_Mat_Walnut_Part', 'Baked_root_Mat_Walnut_Shell']);
    expectSamePicture(before, after);

    const named = (list: readonly Mesh[], name: string): Mesh => list.find((m) => m.name === name) as Mesh;
    const combined = named(baked.merged, 'Baked_root_Mat_AgedBrass');
    expect(combined.userData.xrayCombined).toBe(true);
    expect(combined.userData.xrayShell).toBeUndefined();
    expect(combined.userData.bakedFrom).toEqual(['Case_A', 'Case_B', 'Bearing', 'Bolt']);
    const shell = named(baked.split, 'Baked_root_Mat_AgedBrass_Shell');
    const part = named(baked.split, 'Baked_root_Mat_AgedBrass_Part');
    expect(shell.userData.bakedFrom).toEqual(['Case_A', 'Case_B']);
    expect(part.userData.bakedFrom).toEqual(['Bearing', 'Bolt']);
    expect(shell.userData.xrayShell).toBe(true);
    expect(part.userData.xrayShell).toBeUndefined();
    for (const mesh of baked.split) {
      expect(mesh.userData.xraySplit, mesh.name).toBe(true);
      expect(mesh.visible, mesh.name).toBe(false);
      expect(mesh.material, mesh.name).toBe(mesh.name.includes('Walnut') ? walnut : brass); // the same shared material, never a copy
    }
    expect(named(baked.merged, 'Baked_root_Mat_Teal_Shell').userData.xrayShell).toBe(true); // only the casing wears it: one flagged mesh, drawn in both states
    expect(named(baked.merged, 'Baked_root_Mat_Teal_Shell').userData.xrayCombined).toBeUndefined();
    expect(named(baked.merged, 'Baked_root_Mat_Steel').userData.xrayShell).toBeUndefined();
    expect(isXRayShell(shell, ['Case_'])).toBe(true);
    expect(isXRayShell(part, ['Case_'])).toBe(false);
    expect(isXRayShell(combined, ['Case_'])).toBe(false);

    // The split is the same picture: swap what XRayShell swaps (it hides the combined meshes and shows the split ones).
    for (const mesh of baked.merged) if (mesh.userData.xrayCombined === true) mesh.visible = false;
    for (const mesh of baked.split) mesh.visible = true;
    const swapped = fingerprint(root);
    expect(swapped.drawn).toBe(after.drawn + 2); // two more draws while X-ray shows: the shared materials draw as two meshes each, minus the two combined ones
    expectSamePicture(before, swapped);

    // Without `shell` the casing and the mechanism merge together, once, as before.
    const plain = new Group();
    plain.add(box('Case_A', brass), box('Case_B', brass), box('Bearing', brass));
    const plainBaked = bakeStatic(plain);
    expect(plainBaked.merged).toHaveLength(1);
    expect(plainBaked.split).toHaveLength(0);

    baked.dispose(); // frees the hidden meshes too
    expect(root.getObjectByName('Baked_root_Mat_AgedBrass_Part')).toBeUndefined();
    expect(baked.split).toHaveLength(0);
  });

  it('keeps nodes named in keepNames as separate meshes', () => {
    const root = new Group();
    root.add(box('Roof', brass), box('Wall1', brass), box('Wall2', brass), box('Wall3', brass));
    const baked = bakeStatic(root, { keepNames: ['Roof'] });
    expect(baked.sources).toBe(3);
    expect(root.getObjectByName('Roof')).toBeDefined();
    expect(root.getObjectByName('Wall1')).toBeUndefined();
  });

  it('does not merge a lone mesh and never disposes a source geometry (the loader shares it between clones)', () => {
    const root = new Group();
    const lone = box('Lone', brass);
    const pair = [box('P1', walnut), box('P2', walnut)];
    let disposed = 0;
    for (const mesh of [lone, ...pair]) mesh.geometry.addEventListener('dispose', () => disposed++);
    root.add(lone, ...pair);
    const baked = bakeStatic(root);
    baked.dispose();
    expect(root.getObjectByName('Lone')).toBe(lone);
    expect(disposed).toBe(0);
  });

  it('a rig steps exactly as before: the merged mesh turns with its rotor', () => {
    const make = (): MachineRig => {
      const root = new Group();
      const wheel = new Group();
      wheel.add(box('W1', brass, 0.01, 0, 0), box('W2', brass, -0.01, 0, 0), box('W3', walnut, 0, 0.01, 0));
      root.add(wheel, box('S1', brass), box('S2', brass));
      const rig = createRig('windmill', root);
      rig.rotors.push(createRotor(wheel, 'sails', { axis: 'z' }));
      rig.result = { angularVelocity: { sails: 2.3 } };
      return rig;
    };
    const loose = make();
    const rig = make();
    const baked = bakeRig(rig);
    expect(baked.merged).toHaveLength(2); // the static case pair, and the wheel's brass pair
    expect(baked.merged.some((m) => m.parent === rig.rotors[0].node)).toBe(true);
    for (const r of [loose, rig]) for (let f = 1; f <= 8; f++) stepRig(r, 0.05, f * 0.05);
    expect(rig.rotors[0].node.quaternion.z).not.toBe(0);
    expectSamePicture(fingerprint(loose.root), fingerprint(rig.root));
    disposeBaked(rig);
    expect(baked.merged).toHaveLength(0);
  });
});

describe.skipIf(!modelsPresent)('the six finished machines, baked, from the real GLBs', () => {
  const registry = libraryRegistry();
  const builders: ReadonlyArray<readonly [string, () => Promise<MachineRig>, readonly string[]]> = [
    ['music_box', () => buildMusicBox(realSource, registry), []],
    ['carousel', () => buildCarousel(realSource, registry), []],
    ['windmill', () => buildWindmill(realSource, registry), []],
    ['clock_tower', () => buildClockTower(realSource, registry), Object.values(CLOCK_TOWER_NODE)],
    ['well', () => buildWell(realSource, registry), Object.values(WELL_NODE)],
    ['belfry', () => buildBelfry(realSource, registry), Object.values(BELFRY_BELL_NODE)],
  ];

  for (const [name, build, keep] of builders) {
    it(`${name}: fewer draws, the same triangles, area and box per material`, async () => {
      const rig = await build();
      const before = fingerprint(rig.root);
      const baked = bakeRig(rig, keep);
      const after = fingerprint(rig.root);
      expect(after.drawn).toBe(before.drawn - (baked.sources - baked.merged.length));
      // The Belfry has little to merge: its casing is one mesh per material already, and the trims it shares with the mechanism merge into combined meshes.
      if (name === 'belfry') expect(after.drawn).toBeLessThanOrEqual(before.drawn);
      else {
        expect(baked.sources, 'meshes merged away').toBeGreaterThan(baked.merged.length);
        expect(after.drawn).toBeLessThan(before.drawn);
      }
      expectSamePicture(before, after);
      // Every node the game moves is still in the scene, under the same parent, with its own name.
      for (const rotor of rig.rotors) expect(rig.root.getObjectById(rotor.node.id), `${name} rotor ${rotor.socketId}`).toBeDefined();
      for (const bobber of rig.bobbers) expect(rig.root.getObjectById(bobber.node.id)).toBeDefined();
      for (const pulser of rig.pulsers) expect(rig.root.getObjectById(pulser.node.id)).toBeDefined();
      if (rig.lid) expect(rig.root.getObjectById(rig.lid.pivot.id)).toBeDefined();
      console.info(`[bake] ${name}: ${before.drawn} -> ${after.drawn} meshes drawn, ${baked.skipped} left alone`);
    });
  }

  it('a baked machine and a loose one are in the same pose after the same frames', async () => {
    for (const id of ['music_box', 'carousel', 'windmill'] as const) {
      const loose = await { music_box: buildMusicBox, carousel: buildCarousel, windmill: buildWindmill }[id](realSource, registry);
      const baked = (await buildMachine(id, realSource, registry)) as MachineRig;
      expect(baked.rotors.map((r) => r.socketId)).toEqual(loose.rotors.map((r) => r.socketId));
      for (const rig of [loose, baked]) {
        rig.result = { angularVelocity: Object.fromEntries(rig.rotors.map((r, i) => [r.socketId, 1.1 + i * 0.37])) };
        rig.running = true;
        for (let f = 1; f <= 30; f++) stepRig(rig, 0.05, f * 0.05);
      }
      expectSamePicture(fingerprint(loose.root), fingerprint(baked.root));
      disposeBaked(baked);
    }
  });

  it('the Well and the Belfry still move after the bake (the pump rod, the pawl, the bell, the rotors), draw fewer meshes, and are in the pose the loose machine is in', async () => {
    for (const [id, build, blueprint, nodes] of [
      ['well', buildWell, WELL, ['Part_Follower', 'Part_Pawl']],
      ['belfry', buildBelfry, BELFRY, [BELFRY_BELL_NODE.bell, BELFRY_BELL_NODE.striker]],
    ] as const) {
      const outcome = solveAssembly(blueprint, blueprint.intended, MAX_WIND_UNITS);
      if (!outcome.ok) throw new Error(`the ${id} must solve`);
      const loose = await build(realSource, registry);
      const baked = (await buildMachine(id, realSource, registry)) as MachineRig;
      // The Belfry's static meshes are its casing, one mesh per material (nothing to merge), and two fittings, so its bake merges little.
      if (id === 'well') expect(fingerprint(baked.root).drawn, `${id} meshes drawn`).toBeLessThan(fingerprint(loose.root).drawn);
      else expect(fingerprint(baked.root).drawn, `${id} meshes drawn`).toBeLessThanOrEqual(fingerprint(loose.root).drawn);
      expect(baked.moving.map((n) => n.name).sort(), id).toEqual(loose.moving.map((n) => n.name).sort());
      const rest = nodes.map((name) => {
        const node = baked.root.getObjectByName(name);
        expect(node, `${id}: ${name} is still named and in the scene`).toBeDefined();
        return { name, position: node!.position.clone(), quaternion: node!.quaternion.clone() };
      });
      for (const rig of [loose, baked]) {
        rig.result = outcome.result;
        rig.running = true;
        rig.speed = 1;
        for (let f = 1; f <= 90; f++) stepRig(rig, 1 / 72, f / 72);
      }
      const moved = rest.filter(({ name, position, quaternion }) => {
        const node = baked.root.getObjectByName(name)!;
        return node.position.distanceTo(position) > 1e-6 || node.quaternion.angleTo(quaternion) > 1e-4;
      });
      expect(moved.length, `${id}: at least one of ${nodes.join(', ')} moved`).toBeGreaterThan(0);
      for (const name of nodes) {
        const a = baked.root.getObjectByName(name)!;
        const b = loose.root.getObjectByName(name)!;
        expect(a.position.distanceTo(b.position), `${id} ${name} position`).toBeLessThan(1e-9);
        expect(a.quaternion.angleTo(b.quaternion), `${id} ${name} rotation`).toBeLessThan(1e-5);
      }
      for (const [i, rotor] of baked.rotors.entries()) expect(rotor.theta, `${id} rotor ${rotor.socketId}`).toBe(loose.rotors[i].theta);
      disposeBaked(baked);
    }
  });

  it('the Clock Tower runtime still finds every node it looks for', async () => {
    const loose = await buildClockTower(realSource, registry);
    const baked = (await buildMachine('clock_tower', realSource, registry)) as MachineRig;
    expect(new ClockTowerNodes().resolve(baked.root)).toEqual(new ClockTowerNodes().resolve(loose.root));
    for (const name of Object.values(CLOCK_TOWER_NODE)) expect(Boolean(baked.root.getObjectByName(name)), name).toBe(Boolean(loose.root.getObjectByName(name)));
  });

  it('keeps the interaction empties of a machine: the handle collider and the sockets it exposes', async () => {
    const loose = await buildMusicBox(realSource, registry);
    const baked = (await buildMachine('music_box', realSource, registry)) as MachineRig;
    const empties = (root: Object3D): string[] => {
      const names: string[] = [];
      root.traverse((o) => void (/^(COL_|SOCKET_|PIV_)/.test(o.name) && names.push(o.name)));
      return names.sort();
    };
    expect(empties(baked.root)).toEqual(empties(loose.root));
    expect(empties(baked.root).length).toBeGreaterThan(0);
  });
});

describe.skipIf(!modelsPresent)('the town, baked, from the real GLBs', () => {
  const registry = libraryRegistry();

  it('draws fewer meshes with the same triangles, keeps the doors, the knead clip, the plot sockets and leaves other children of the town group alone', async () => {
    const town = await loadTown(realSource, registry, true);
    const stranger = new Group(); // a feature added later: a Well whose bucket the game moves
    stranger.name = 'Stranger';
    stranger.add(box('Bucket1', brass), box('Bucket2', brass));
    town.group.add(stranger);
    const socketsBefore = readInteractionNodes(town.ground).sockets.map((x) => x.id).sort();
    const before = fingerprint(town.group);
    const baked = bakeTown(town);
    const after = fingerprint(town.group);

    expect(after.drawn).toBeLessThan(before.drawn - 10);
    expectSamePicture(before, after);
    expect(readInteractionNodes(town.ground).sockets.map((x) => x.id).sort()).toEqual(socketsBefore);
    expect(socketsBefore.length).toBeGreaterThan(0);
    expect(stranger.children.map((c) => c.name)).toEqual(['Bucket1', 'Bucket2']); // untouched
    expect(new TheatreDoors().resolve(town.theatre)).toEqual([]);
    const forearms = town.otto.getObjectByName('Otto_Forearms') as Object3D;
    expect(forearms).toBeDefined();
    const rest = forearms.position.clone();
    const knead = town.knead as NonNullable<typeof town.knead>;
    knead.action.timeScale = 1;
    knead.mixer.update(0.25);
    expect(forearms.position.distanceTo(rest), 'the clip still moves the forearms of Otto').toBeGreaterThan(1e-5);
    console.info(`[bake] town: ${before.drawn} -> ${after.drawn} meshes drawn (dressing included), ${baked.sources} merged into ${baked.merged.length}`);
  });
});
