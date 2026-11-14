import { BoxGeometry, Box3, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3 } from '@iwsdk/core';
import { describe, expect, it } from 'vitest';
import { bakeStatic } from '../../src/town/bake';
import { createRig, createRotor } from '../../src/town/motion';
import type { MachineRig } from '../../src/town/motion';

/** A library-looking material: the name is what the baker groups by. */
const material = (name: string, vertexColors = false): MeshStandardMaterial => Object.assign(new MeshStandardMaterial(), { name, vertexColors });

function box(name: string, mat: MeshStandardMaterial, x: number, y = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), mat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}

/** A small rig: a housing with static meshes of two materials, a turning gear and a sliding rod, a hidden template and a collider proxy. */
function fixture(): { rig: MachineRig; brass: MeshStandardMaterial; walnut: MeshStandardMaterial; gear: Object3D; rod: Mesh } {
  const brass = material('Mat_AgedBrass');
  const walnut = material('Mat_Walnut');
  const root = new Group();
  root.add(box('Post_L', walnut, -0.02), box('Post_R', walnut, 0.02), box('Plate', walnut, 0, 0.03), box('Stud', brass, 0, 0.01));
  const gear = new Group();
  gear.add(box('Gear_Disc', brass, 0));
  gear.position.set(0.05, 0.05, 0);
  root.add(gear);
  const rod = box('Rod', brass, -0.05, 0.05);
  root.add(rod);
  const template = new Group();
  template.visible = false;
  template.add(box('Bucket', brass, 0.07));
  root.add(template);
  const proxy = new Mesh(new BoxGeometry(1, 1, 1), Object.assign(new MeshBasicMaterial(), { visible: false }));
  proxy.name = 'COL_Grab_proxy';
  root.add(proxy);
  const rig = createRig('well', root);
  rig.rotors.push(createRotor(gear, 'cam'));
  rig.moving.push(rod);
  rig.bakeable = true;
  return { rig, brass, walnut, gear, rod };
}

const drawn = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverseVisible((n) => {
    const m = n as Mesh;
    if (m.isMesh && !Array.isArray(m.material) && m.material.visible !== false) out.push(m);
  });
  return out;
};

describe('bakeStatic (ADR-048: the awake town stays under 200 draw calls)', () => {
  it('merges the static meshes into one mesh per material, and leaves the turning and sliding parts, the hidden template and the proxy alone', () => {
    const { rig, brass, walnut, gear, rod } = fixture();
    expect(drawn(rig.root)).toHaveLength(6); // 3 walnut + stud + gear disc + rod
    const result = bakeStatic(rig);
    expect(result).toEqual({ removed: 4, made: 2 }); // posts and plate (walnut), the stud (brass)
    const names = drawn(rig.root).map((m) => m.name).sort();
    expect(names).toEqual(['Baked_Mat_AgedBrass', 'Baked_Mat_Walnut', 'Gear_Disc', 'Rod']);
    expect(rig.root.getObjectByName('Baked_Mat_Walnut')).toMatchObject({ material: walnut });
    expect(rig.root.getObjectByName('Baked_Mat_AgedBrass')).toMatchObject({ material: brass });
    expect(gear.parent).toBe(rig.root);
    expect(rod.parent).toBe(rig.root);
    expect(rig.root.getObjectByName('Bucket')?.visible).toBe(true); // the template group is hidden, not its mesh: it was never drawn and is not baked
    expect(drawn(rig.root).some((m) => m.name === 'Bucket')).toBe(false);
    expect(rig.root.getObjectByName('COL_Grab_proxy')).toBeDefined(); // the collider proxy is not drawn and not touched
    expect(rig.bakeable).toBe(false);
  });

  it('keeps every vertex where it was: the baked mesh covers exactly the boxes it replaced, whatever the root\'s own transform', () => {
    const { rig } = fixture();
    rig.root.position.set(0.3, 0.1, -0.2);
    rig.root.scale.setScalar(0.25);
    rig.root.rotation.y = 0.7;
    rig.root.updateWorldMatrix(true, true);
    const staticBefore = new Box3();
    for (const m of drawn(rig.root).filter((x) => ['Post_L', 'Post_R', 'Plate', 'Stud'].includes(x.name))) staticBefore.union(new Box3().setFromObject(m, true));
    bakeStatic(rig);
    rig.root.updateWorldMatrix(true, true);
    const staticAfter = new Box3();
    for (const m of drawn(rig.root).filter((x) => x.name.startsWith('Baked_'))) staticAfter.union(new Box3().setFromObject(m, true));
    for (const k of ['x', 'y', 'z'] as const) {
      expect(staticAfter.min[k]).toBeCloseTo(staticBefore.min[k], 6);
      expect(staticAfter.max[k]).toBeCloseTo(staticBefore.max[k], 6);
    }
    const baked = rig.root.getObjectByName('Baked_Mat_Walnut') as Mesh;
    expect(baked.position.toArray()).toEqual([0, 0, 0]); // in the root's own frame: it moves and scales with the machine
  });

  it("merges, inside a moving node, what moves with it and with nothing else: a carousel's platform, column and canopy, but not its horses or lamps", () => {
    const brass = material('Mat_AgedBrass');
    const paint = material('Mat_PaintedWood');
    const root = new Group();
    const platform = new Group();
    platform.position.set(0, 0.03, 0);
    platform.add(box('Deck', paint, 0), box('Column', paint, 0, 0.02), box('Canopy', brass, 0, 0.05));
    const horse = new Group();
    horse.add(box('Horse_Body', paint, 0.03), box('Horse_Mane', paint, 0.03, 0.01));
    const lamp = box('Lamp', brass, -0.03);
    platform.add(horse, lamp);
    root.add(platform, box('Base', brass, 0));
    const rig = createRig('carousel', root);
    rig.rotors.push(createRotor(platform, 'platform'));
    rig.bobbers.push({ node: horse, driver: rig.rotors[0], baseY: 0, phase: 0, amplitude: 0.006 });
    rig.pulsers.push({ node: lamp, phase: 0, amplitude: 0.1, speed: 5, baseScale: 1 });
    rig.bakeable = true;
    platform.rotation.y = 0.4; // turned when it is baked: the merge is in the platform's own frame, so the turn does not matter
    root.updateWorldMatrix(true, true);
    const before = new Box3();
    for (const m of drawn(root).filter((x) => ['Deck', 'Column', 'Canopy'].includes(x.name))) before.union(new Box3().setFromObject(m, true));
    const result = bakeStatic(rig);
    // the base on its own (root frame); the deck and the column into one mesh of the platform; the horse's body and mane into one mesh of the horse
    expect(result).toEqual({ removed: 5, made: 3 });
    expect(drawn(root).map((m) => m.name).sort()).toEqual(['Baked_Mat_AgedBrass', 'Baked_Mat_PaintedWood', 'Baked_Mat_PaintedWood', 'Canopy', 'Lamp']);
    expect(horse.parent).toBe(platform); // the horse is still its own node on the platform, and the lamp is untouched
    expect(horse.children.map((c) => c.name)).toEqual(['Baked_Mat_PaintedWood']);
    expect(lamp.parent).toBe(platform);
    expect(platform.children.filter((c) => c.name.startsWith('Baked_'))).toHaveLength(1); // Deck and Column are one mesh now
    root.updateWorldMatrix(true, true);
    const after = new Box3();
    for (const m of platform.children.filter((c) => c.name.startsWith('Baked_') || c.name === 'Canopy') as Mesh[]) after.union(new Box3().setFromObject(m, true));
    expect(after.min.y).toBeCloseTo(before.min.y, 6);
    expect(after.max.y).toBeCloseTo(before.max.y, 6);
    platform.rotation.y = 1.5; // and it still turns with everything on it
    root.updateWorldMatrix(true, true);
    expect(new Box3().setFromObject(platform, true).getSize(new Vector3()).y).toBeGreaterThan(0);
  });

  it('merges clones of one library material (each mesh of a carried machine has its own) and keeps vertex-colour variants apart', () => {
    const root = new Group();
    const a = material('Mat_AgedBrass');
    const b = a.clone();
    const c = material('Mat_AgedBrass', true);
    root.add(box('A', a, 0), box('B', b, 0.02), box('C', c, 0.04));
    const rig = createRig('belfry', root);
    rig.bakeable = true;
    expect(bakeStatic(rig)).toEqual({ removed: 3, made: 2 });
    expect(drawn(root).map((m) => m.name).sort()).toEqual(['Baked_Mat_AgedBrass', 'Baked_Mat_AgedBrass']);
    expect(drawn(root).map((m) => (m.material as MeshStandardMaterial).vertexColors).sort()).toEqual([false, true]);
  });

  it('never touches a rig that is not bakeable (the Clock Tower is driven from outside its rig), or an instanced mesh', () => {
    const { rig } = fixture();
    rig.bakeable = false;
    expect(bakeStatic(rig)).toEqual({ removed: 0, made: 0 });
    expect(drawn(rig.root)).toHaveLength(6);
    const root = new Group();
    const instanced = new InstancedMesh(new BoxGeometry(0.01, 0.01, 0.01), material('Mat_Walnut'), 3);
    instanced.setMatrixAt(0, new Matrix4());
    root.add(instanced, box('Plate', material('Mat_Walnut'), 0));
    const other = createRig('belfry', root);
    other.bakeable = true;
    expect(bakeStatic(other)).toEqual({ removed: 1, made: 1 });
    expect(root.children).toContain(instanced);
  });

  it('bakes nothing from a rig with nothing static, and a second call finds nothing left to do', () => {
    const root = new Group();
    const gear = new Group();
    gear.add(box('Disc', material('Mat_AgedBrass'), 0));
    root.add(gear);
    const rig = createRig('well', root);
    rig.rotors.push(createRotor(gear, 'cam'));
    rig.bakeable = true;
    expect(bakeStatic(rig)).toEqual({ removed: 0, made: 0 });
    const { rig: other } = fixture();
    bakeStatic(other);
    expect(bakeStatic(other)).toEqual({ removed: 0, made: 0 });
  });
});
