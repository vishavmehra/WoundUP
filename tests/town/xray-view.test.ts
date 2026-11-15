import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import type { Material } from 'three';
import type { Entity } from '@iwsdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setXRayLens, writeXRayFlag } from '../../src/interaction/xray-state';
import { BLUEPRINT_SOCKET_IDS, buildMachine } from '../../src/town/machines';
import { createRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import { XRAY_FADE_S, XRAY_OPACITY, XRAY_SHELL, XRayShell, XRayView, xrayZoneOf } from '../../src/town/xray-view';
import { libraryRegistry, syntheticTown } from './helpers';
import { modelsPresent, realSource } from './real-source';

/**
 * X-ray as a picture (PRODUCT_SPEC section 12): the casing fades to about 15% opacity while the mechanism stays opaque, over 0.3 s,
 * for the palm gesture and the lens button, on the bench and on a plot. Pure Three.js; the real GLBs prove the casing lists.
 */

const FRAME = 1 / 72;
const MACHINES = ['music_box', 'carousel', 'windmill', 'clock_tower', 'well', 'belfry'] as const;

const standard = (name: string, color = 0x5b3a24): MeshStandardMaterial => new MeshStandardMaterial({ name, color });
const box = (name: string, material: MeshStandardMaterial): Mesh => {
  const m = new Mesh(new BoxGeometry(0.02, 0.02, 0.02), material);
  m.name = name;
  return m;
};
const flag = (active: boolean, root: Object3D | null = null): void => writeXRayFlag(active, root ? ({ object3D: root } as unknown as Entity) : null);
const run = (view: XRayView, seconds: number): void => {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) view.update(FRAME);
};

afterEach(() => {
  writeXRayFlag(false, null);
  setXRayLens(false);
});

/** A Music Box: shared wood and brass for the casing, a gear (another asset's mesh) seated inside as a child of the case. */
function musicBox() {
  const wood = standard('Mat_Walnut');
  const brass = standard('Mat_AgedBrass');
  const root = new Group();
  const body = new Group();
  body.name = 'MusicBoxCase_Body';
  const bodyMesh = box('MusicBoxCase_Body_1', wood);
  const lid = box('MusicBoxCase_Lid_1', wood);
  const gear = box('GearSpur20_M1', brass);
  body.add(bodyMesh, lid, gear); // the seated gear is a child of the case node: only the name says what is casing
  root.add(body);
  return { root, wood, brass, bodyMesh, lid, gear };
}

describe('XRayShell', () => {
  it('fades only the casing meshes, gives them their own materials, and leaves the shared ones untouched', () => {
    const { root, wood, brass, bodyMesh, lid, gear } = musicBox();
    const shell = new XRayShell(root, XRAY_SHELL.music_box);
    expect(shell.size).toBe(2);

    shell.setAmount(1);
    const ghost = bodyMesh.material as MeshStandardMaterial;
    expect(ghost).not.toBe(wood);
    expect(lid.material).toBe(ghost); // one copy per shared material, not per mesh
    expect(ghost.opacity).toBeCloseTo(XRAY_OPACITY, 6);
    expect(ghost.transparent).toBe(true);
    expect(ghost.depthWrite).toBe(false);
    expect(gear.material).toBe(brass); // the mechanism stays opaque and untouched
    expect(wood.opacity).toBe(1);
    expect(wood.transparent).toBe(false);
    expect(wood.depthWrite).toBe(true);
  });

  it('is cream-tinted and a little cool at the rim, and halfway at half the amount', () => {
    const { root, wood, bodyMesh } = musicBox();
    const shell = new XRayShell(root, XRAY_SHELL.music_box);
    shell.setAmount(0.5);
    const ghost = bodyMesh.material as MeshStandardMaterial;
    expect(ghost.opacity).toBeCloseTo((1 + XRAY_OPACITY) / 2, 6);
    shell.setAmount(1);
    expect(ghost.color.r).toBeGreaterThan(wood.color.r); // towards cream
    expect(ghost.emissive.b).toBeGreaterThan(wood.emissive.b); // a faint cool glow
    expect(ghost.emissive.b).toBeLessThan(0.2);
  });

  it('shows the cool tint on a carried machine too: GrabFeedbackSystem leaves its materials a warm colour at intensity 0, and X-ray does not turn that into a glow', () => {
    const { root, wood, bodyMesh } = musicBox();
    wood.emissive.set(0xffc66d); // what GrabFeedbackSystem's own copy of a material holds while its glow is off
    wood.emissiveIntensity = 0;
    const shell = new XRayShell(root, XRAY_SHELL.music_box);

    shell.setAmount(0.05);
    const ghost = bodyMesh.material as MeshStandardMaterial;
    const early = ghost.emissive.clone().multiplyScalar(ghost.emissiveIntensity);
    expect(early.r, 'no warm flash as the fade begins').toBeLessThan(0.02);

    shell.setAmount(1);
    const full = ghost.emissive.clone().multiplyScalar(ghost.emissiveIntensity);
    expect(full.b, 'the cool tint shows').toBeGreaterThan(0.02);
    expect(full.b).toBeGreaterThan(full.r);
    expect(wood.emissiveIntensity).toBe(0); // the machine's own material is untouched
  });

  it('gives the shared materials back at 0, makes its copies once, and disposes them with the machine', () => {
    const { root, wood, bodyMesh } = musicBox();
    const shell = new XRayShell(root, XRAY_SHELL.music_box);
    shell.setAmount(1);
    const ghost = bodyMesh.material as Material;
    const dispose = vi.spyOn(ghost, 'dispose');
    shell.setAmount(0);
    expect(bodyMesh.material).toBe(wood);
    expect(dispose).not.toHaveBeenCalled();

    shell.setAmount(1);
    expect(bodyMesh.material).toBe(ghost); // the same copy again: nothing is cloned per toggle

    shell.dispose();
    expect(bodyMesh.material).toBe(wood);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps what GrabFeedbackSystem gave a mesh (its own clone) and gives exactly that back', () => {
    const { root, bodyMesh } = musicBox();
    const own = standard('Mat_Walnut');
    bodyMesh.material = own; // as if GrabFeedbackSystem had cloned it for this machine
    const shell = new XRayShell(root, XRAY_SHELL.music_box);
    shell.setAmount(1);
    expect(bodyMesh.material).not.toBe(own);
    shell.setAmount(0);
    expect(bodyMesh.material).toBe(own);
  });

  it('matches by a mesh\'s own name, so a machine with no listed casing, or an unknown id, has nothing to fade', () => {
    const { root } = musicBox();
    expect(new XRayShell(root, []).size).toBe(0);
    expect(new XRayShell(root, ['NoSuchCasing_']).size).toBe(0);
    expect(XRAY_SHELL.no_such_machine).toBeUndefined();
  });
});

describe('XRayView', () => {
  it('fades in over 0.3 s for the palm over the machine and back out when the flag drops', () => {
    const { root, bodyMesh, wood } = musicBox();
    const view = new XRayView();
    view.add({ root, prefixes: XRAY_SHELL.music_box, lens: () => false });

    run(view, 0.2);
    expect(bodyMesh.material).toBe(wood); // not on

    flag(true, root);
    run(view, XRAY_FADE_S / 2);
    const ghost = bodyMesh.material as MeshStandardMaterial;
    expect(ghost.opacity).toBeGreaterThan(XRAY_OPACITY + 0.1); // still fading
    expect(ghost.opacity).toBeLessThan(0.9);
    expect(view.busy).toBe(true);
    run(view, XRAY_FADE_S);
    expect(ghost.opacity).toBeCloseTo(XRAY_OPACITY, 6);
    expect(view.busy).toBe(false);

    flag(false);
    run(view, XRAY_FADE_S / 2);
    expect(bodyMesh.material).toBe(ghost); // fading back, the copy is still on
    run(view, XRAY_FADE_S);
    expect(bodyMesh.material).toBe(wood);
    expect(view.busy).toBe(false);
  });

  it('opens the palm\'s machine only, and the lens\' machine (the one being built or carried) only while the lens is on', () => {
    const a = musicBox();
    const b = musicBox();
    let carried = true;
    const view = new XRayView();
    view.add({ root: a.root, prefixes: XRAY_SHELL.music_box, lens: () => true });
    view.add({ root: b.root, prefixes: XRAY_SHELL.music_box, lens: () => !carried });

    flag(true, b.root); // the palm is over b
    run(view, 1);
    expect(a.bodyMesh.material).toBe(a.wood);
    expect(b.bodyMesh.material).not.toBe(b.wood);

    flag(false);
    run(view, 1);
    setXRayLens(true);
    flag(true); // the lens: no palm target
    run(view, 1);
    expect(a.bodyMesh.material).not.toBe(a.wood); // the machine on the bench
    expect(b.bodyMesh.material).toBe(b.wood); // standing on its plot: the lens is not for it
    carried = false;
    run(view, 1);
    expect(b.bodyMesh.material).not.toBe(b.wood);
  });

  it('does nothing and allocates nothing while X-ray is off, and unregistering restores and disposes', () => {
    const { root, bodyMesh, wood } = musicBox();
    const view = new XRayView();
    const remove = view.add({ root, prefixes: XRAY_SHELL.music_box, lens: () => true });
    run(view, 1);
    expect(bodyMesh.material).toBe(wood);

    flag(true, root);
    run(view, 1);
    const dispose = vi.spyOn(bodyMesh.material as Material, 'dispose');
    remove();
    expect(bodyMesh.material).toBe(wood);
    expect(dispose).toHaveBeenCalledTimes(1);
    remove(); // twice is harmless
    expect(() => run(view, 0.1)).not.toThrow();
  });
});

describe('TownRuntime and X-ray', () => {
  it('registers every rig with its casing, fades it from the flag, and drops it with the rig', () => {
    const { town, uniforms } = syntheticTown();
    const runtime = new TownRuntime(town, uniforms);
    const { root, bodyMesh, wood } = musicBox();
    const rig = createRig('music_box', root);
    runtime.addRig(rig);

    flag(true, root);
    for (let i = 0; i < 40; i++) runtime.update(FRAME, i * FRAME);
    expect((bodyMesh.material as MeshStandardMaterial).opacity).toBeCloseTo(XRAY_OPACITY, 6);
    expect(runtime.xray.busy).toBe(false);

    runtime.removeRig(rig);
    expect(bodyMesh.material).toBe(wood);
  });

  it('opens a carried machine from the lens but not one standing on its plot', () => {
    const { town, uniforms } = syntheticTown();
    const runtime = new TownRuntime(town, uniforms);
    const carried = musicBox();
    const standing = musicBox();
    runtime.addRig(createRig('music_box', carried.root));
    runtime.addRig(createRig('music_box', standing.root));
    (runtime as unknown as { seated: Object3D[] }).seated.push(standing.root);

    setXRayLens(true);
    flag(true);
    for (let i = 0; i < 40; i++) runtime.update(FRAME, i * FRAME);
    expect(carried.bodyMesh.material).not.toBe(carried.wood);
    expect(standing.bodyMesh.material).toBe(standing.wood);
  });
});

describe('xrayZoneOf', () => {
  it('measures the top and the reach of a machine from its meshes, in its own units', () => {
    const root = new Group();
    const tall = new Mesh(new BoxGeometry(0.1, 0.2, 0.06));
    tall.position.y = 0.1; // stands on the origin
    root.add(tall);
    const zone = xrayZoneOf(root);
    expect(zone.top).toBeCloseTo(0.2, 6);
    expect(zone.radius).toBeCloseTo(Math.hypot(0.05, 0.03), 6);

    root.scale.setScalar(0.5);
    const scaled = xrayZoneOf(root);
    expect(scaled.top).toBeCloseTo(0.2, 6); // XRaySystem multiplies by the world scale, so the zone stays in the machine's own units
  });
});

describe.skipIf(!modelsPresent)('the casing of the six machines, on the real GLBs', () => {
  for (const id of MACHINES) {
    it(`${id}: the casing fades and every other mesh (the mechanism, the figures, the handle) stays opaque`, async () => {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const prefixes = XRAY_SHELL[id];
      const all: Mesh[] = [];
      rig.root.traverse((n) => {
        if ((n as Mesh).isMesh) all.push(n as Mesh);
      });
      const casing = all.filter((m) => prefixes.some((p) => m.name.startsWith(p)));
      const rest = all.filter((m) => !casing.includes(m));
      expect(casing.length, `${id} casing meshes`).toBeGreaterThan(0);
      expect(rest.length, `${id} mechanism meshes`).toBeGreaterThan(0);

      const before = new Map(all.map((m) => [m, m.material]));
      const shell = new XRayShell(rig.root, prefixes);
      expect(shell.size).toBe(casing.length);
      shell.setAmount(1);
      for (const m of casing) {
        const material = m.material as MeshStandardMaterial;
        expect(material, m.name).not.toBe(before.get(m));
        expect(material.opacity, m.name).toBeCloseTo(XRAY_OPACITY, 6);
        expect(material.depthWrite, m.name).toBe(false);
      }
      for (const m of rest) expect(m.material, m.name).toBe(before.get(m));

      shell.setAmount(0);
      for (const m of all) expect(m.material, m.name).toBe(before.get(m));
      shell.dispose();
    });
  }

  // The older four keep the merge for the draw-call budget (machines.ts `KEEP_CASING`): their X-ray fades the casing meshes the batching left.
  for (const id of ['well', 'belfry'] as const) {
    it(`${id}: the batching merges no casing mesh into the mechanism's brass (X-ray finds the casing by name)`, async () => {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const merged: string[] = [];
      rig.root.traverse((n) => {
        const from = n.userData.bakedFrom as string[] | undefined;
        if (from) merged.push(...from.filter((name) => XRAY_SHELL[id].some((p) => name.startsWith(p))));
      });
      expect(merged, `${id}: casing meshes merged away`).toEqual([]);
    });
  }

  it('the moving parts of the Music Box, the Carousel, the Windmill, the Well and the Belfry are never casing', async () => {
    for (const id of ['music_box', 'carousel', 'windmill', 'well', 'belfry'] as const) {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      expect(rig.rotors.length).toBeGreaterThan(0);
      for (const rotor of rig.rotors) {
        // The meshes of the rotor's own GLB (the Carousel's platform carries its canopy, column and horses as nested nodes).
        for (const n of rotor.node.children) {
          if ((n as Mesh).isMesh) expect(XRAY_SHELL[id].some((p) => n.name.startsWith(p)), `${id}: ${n.name}`).toBe(false);
        }
      }
    }
  });

  it('a finished machine\'s X-ray zone reaches its real top, not its housing\'s (the Clock Tower is far taller than its base)', async () => {
    const rig = await buildMachine('clock_tower', realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
    if (!rig) throw new Error('no clock tower');
    expect(xrayZoneOf(rig.root).top).toBeGreaterThan(0.15);
  });
});
