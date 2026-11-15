import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import type { Material } from 'three';
import type { Entity } from '@iwsdk/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setXRayLens, writeXRayFlag } from '../../src/interaction/xray-state';
import { BELFRY_BELL_NODE, buildBelfry } from '../../src/machines/belfry/build';
import { buildClockTower } from '../../src/machines/clock-tower/build';
import { CLOCK_TOWER_NODE } from '../../src/machines/clock-tower/rig';
import { buildWell, WELL_NODE } from '../../src/machines/well/build';
import { bakeRig } from '../../src/town/bake';
import { BLUEPRINT_SOCKET_IDS, buildCarousel, buildMachine, buildMusicBox, buildWindmill } from '../../src/town/machines';
import { createRig, createRotor } from '../../src/town/motion';
import type { MachineRig } from '../../src/town/motion';
import { TownRuntime } from '../../src/town/runtime';
import { isXRayShell, XRAY_FADE_S, XRAY_GLOW, XRAY_OPACITY, XRAY_SHELL, XRayShell, XRayView, xrayMovers, xrayZoneOf } from '../../src/town/xray-view';
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

/** The meshes of `root` a frame would draw: visible, with every ancestor visible and a visible material (the colliders' proxies are not). */
const drawnMeshes = (root: Object3D): Mesh[] => {
  const found: Mesh[] = [];
  root.traverseVisible((n) => {
    const mesh = n as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.visible) found.push(mesh);
  });
  return found;
};

const nodesOf = (root: Object3D): number => {
  let n = 0;
  root.traverse(() => n++);
  return n;
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


describe('XRayShell glow (the moving mechanism)', () => {
  /** The case node with its casing and its gear, as one mover: a rotor's node can carry casing too (the Carousel's platform carries its canopy). */
  const moversOf = (m: ReturnType<typeof musicBox>) => () => [m.gear.parent as Object3D];
  const shown = (mesh: Mesh): Color => (mesh.material as MeshStandardMaterial).emissive.clone().multiplyScalar((mesh.material as MeshStandardMaterial).emissiveIntensity);

  it('gives the moving parts a warm glow on their own copy, and neither the casing nor the shared material is the glow', () => {
    const m = musicBox();
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, moversOf(m));
    shell.setAmount(1);
    const glow = m.gear.material as MeshStandardMaterial;
    expect(glow).not.toBe(m.brass);
    expect(glow.opacity).toBe(1); // not see-through: the mechanism stays solid
    expect(glow.transparent).toBe(false);
    expect(glow.depthWrite).toBe(true);
    const lit = shown(m.gear);
    expect(lit.r).toBeGreaterThan(lit.g);
    expect(lit.g).toBeGreaterThan(lit.b); // warm, the palette's lamp glow (#FFC66D)
    expect(lit.r).toBeCloseTo(XRAY_GLOW, 2);
    expect(lit.r).toBeLessThan(0.5); // gentle
    expect((m.bodyMesh.material as MeshStandardMaterial).opacity).toBeCloseTo(XRAY_OPACITY, 6); // the casing under the same mover is the see-through copy
    expect(m.bodyMesh.material).not.toBe(glow);
    expect(m.brass.emissive.getHex()).toBe(0x000000); // the shared materials are never touched
    expect(m.brass.emissiveIntensity).toBe(1);
  });

  it('eases in with the fade, and adds to what a part already glows instead of replacing it', () => {
    const m = musicBox();
    const lamp = standard('Mat_Lamp');
    lamp.emissive.set(0xff3300);
    lamp.emissiveIntensity = 0.8;
    const before = lamp.emissive.clone().multiplyScalar(0.8);
    m.gear.material = lamp;
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, moversOf(m));
    shell.setAmount(0.5);
    const half = shown(m.gear);
    shell.setAmount(1);
    const full = shown(m.gear);
    expect(half.g - before.g).toBeCloseTo((full.g - before.g) / 2, 5);
    expect(full.r).toBeGreaterThan(before.r); // never dimmer than the part was
    expect(full.g).toBeGreaterThan(before.g);
  });

  it("starts from what a carried machine's materials show (warm colour at intensity 0), with no flash as the fade begins", () => {
    const m = musicBox();
    m.brass.emissive.set(0xffc66d);
    m.brass.emissiveIntensity = 0;
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, moversOf(m));
    shell.setAmount(0.02);
    expect(shown(m.gear).r).toBeLessThan(0.01);
    shell.setAmount(1);
    expect(shown(m.gear).r).toBeCloseTo(XRAY_GLOW, 2);
    expect(m.brass.emissiveIntensity).toBe(0);
  });

  it('gives the shared materials back at 0, keeps its copies for the next toggle and disposes them with the machine', () => {
    const m = musicBox();
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, moversOf(m));
    shell.setAmount(1);
    const glow = m.gear.material as Material;
    const dispose = vi.spyOn(glow, 'dispose');
    shell.setAmount(0);
    expect(m.gear.material).toBe(m.brass);
    expect(dispose).not.toHaveBeenCalled();
    shell.setAmount(1);
    expect(m.gear.material).toBe(glow); // the same copy: nothing is cloned per toggle
    shell.dispose();
    expect(m.gear.material).toBe(m.brass);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('takes the wake shading of the shared material with it, so X-ray compiles no new shader program for the mechanism', () => {
    const m = musicBox();
    m.brass.onBeforeCompile = () => undefined;
    m.brass.customProgramCacheKey = () => 'wu-wake-test';
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, moversOf(m));
    shell.setAmount(1);
    const glow = m.gear.material as MeshStandardMaterial;
    expect(glow.onBeforeCompile).toBe(m.brass.onBeforeCompile);
    expect(glow.customProgramCacheKey()).toBe('wu-wake-test');
  });

  it('lights each mesh once however many movers reach it, and leaves hidden meshes and the invisible collider proxies alone', () => {
    const m = musicBox();
    const hidden = box('GearHidden', m.brass);
    hidden.visible = false;
    const proxy = box('COL_Grab', new MeshStandardMaterial({ visible: false }));
    m.gear.parent?.add(hidden, proxy);
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, () => [m.gear.parent as Object3D, m.gear, m.gear.parent as Object3D]);
    shell.setAmount(1);
    shell.setAmount(0);
    expect(m.gear.material).toBe(m.brass); // swapped once, so restored to the real original, not to the copy
    shell.setAmount(1);
    expect(hidden.material).toBe(m.brass);
    expect((proxy.material as MeshStandardMaterial).visible).toBe(false);
    expect((proxy.material as MeshStandardMaterial).emissive.getHex()).toBe(0x000000);
  });

  it('asks which parts move each time it turns on: a part seated later glows the next time', () => {
    const m = musicBox();
    const late = box('ShaftShort', m.brass);
    m.root.add(late);
    const seated: Object3D[] = [];
    const shell = new XRayShell(m.root, XRAY_SHELL.music_box, () => seated);
    shell.setAmount(1);
    expect(late.material).toBe(m.brass);
    shell.setAmount(0);
    seated.push(late);
    shell.setAmount(1);
    expect(late.material).not.toBe(m.brass);
    expect(shown(late).r).toBeCloseTo(XRAY_GLOW, 2);
  });

  it('has nothing to glow for a subject that names no moving parts', () => {
    const m = musicBox();
    new XRayShell(m.root, XRAY_SHELL.music_box).setAmount(1);
    expect(m.gear.material).toBe(m.brass);
  });
});

describe('xrayMovers', () => {
  it('reads the moving mechanism from the rig: every rotor and every bobbing horse, so a new machine needs no line', () => {
    const root = new Group();
    const gear = new Group();
    const horse = new Group();
    const idle = new Group();
    root.add(gear, horse, idle);
    const rig = createRig('carousel', root);
    rig.rotors.push(createRotor(gear, 'platform'));
    rig.bobbers.push({ node: horse, driver: rig.rotors[0], baseY: 0, phase: 0, amplitude: 0.01 });
    expect(xrayMovers(rig)).toEqual([gear, horse]);
  });

  it('adds the named mechanism of a machine moved by its own runtime (the Clock Tower), when the node is there', () => {
    const root = new Group();
    const movement = new Group();
    movement.name = 'ClockTowerMovement';
    root.add(movement);
    expect(xrayMovers(createRig('clock_tower', root))).toEqual([movement]);
    expect(xrayMovers(createRig('clock_tower', new Group()))).toEqual([]);
    expect(xrayMovers(createRig('music_box', root))).toEqual([]);
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

  it('fades the glow of the mechanism in and out with the casing, over the same 0.3 s', () => {
    const m = musicBox();
    const view = new XRayView();
    view.add({ root: m.root, prefixes: XRAY_SHELL.music_box, lens: () => false, moving: () => [m.gear] });
    flag(true, m.root);
    run(view, XRAY_FADE_S / 2);
    const glow = m.gear.material as MeshStandardMaterial;
    expect(glow.emissive.r).toBeGreaterThan(0.05);
    expect(glow.emissive.r).toBeLessThan(XRAY_GLOW - 0.05); // still rising
    run(view, XRAY_FADE_S);
    expect(glow.emissive.r).toBeCloseTo(XRAY_GLOW, 2);
    expect(view.busy).toBe(false);
    flag(false);
    run(view, XRAY_FADE_S * 2);
    expect(m.gear.material).toBe(m.brass);
  });

  it("opens the palm's machine only, and the lens' machine (the one being built or carried) only while the lens is on", () => {
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

  it('lights the mechanism of every rig from its rotors, with nothing listed per machine', () => {
    const { town, uniforms } = syntheticTown();
    const runtime = new TownRuntime(town, uniforms);
    const { root, wood, brass, gear, bodyMesh } = musicBox();
    const rig = createRig('music_box', root);
    rig.rotors.push(createRotor(gear, 'cylinder'));
    runtime.addRig(rig);

    flag(true, root);
    for (let i = 0; i < 40; i++) runtime.update(FRAME, i * FRAME);
    expect(gear.material).not.toBe(brass);
    expect((gear.material as MeshStandardMaterial).emissive.r).toBeCloseTo(XRAY_GLOW, 2);
    expect((bodyMesh.material as MeshStandardMaterial).emissive.r).toBeLessThan(0.1); // the casing gets the cool tint, not the glow

    runtime.removeRig(rig);
    expect(gear.material).toBe(brass);
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
      const casing = all.filter((m) => isXRayShell(m, prefixes));
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

  // While X-ray shows, the batching's split meshes draw: no drawn mesh has casing and mechanism sources, and the casing's are flagged or named.
  for (const id of MACHINES) {
    it(`${id}: while X-ray shows, every drawn mesh is all casing (flagged or named) or all mechanism, whatever the batching merged into it`, async () => {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const prefixes = XRAY_SHELL[id];
      const shell = new XRayShell(rig.root, prefixes);
      shell.setAmount(1);
      const named = (name: string): boolean => prefixes.some((p) => name.startsWith(p));
      let casing = 0;
      let flagged = 0;
      for (const mesh of drawnMeshes(rig.root)) {
        const sources = (mesh.userData.bakedFrom as string[] | undefined) ?? [mesh.name];
        const fromCasing = sources.filter(named).length;
        expect(fromCasing === 0 || fromCasing === sources.length, `${id}: ${mesh.name} merges ${sources.join(', ')}`).toBe(true);
        expect(isXRayShell(mesh, prefixes), `${id}: ${mesh.name}`).toBe(fromCasing > 0);
        expect(mesh.userData.xrayCombined, `${id}: ${mesh.name} is the combined bake, which is hidden while X-ray shows`).toBeUndefined();
        if (fromCasing > 0) casing++;
        if (mesh.userData.xrayShell === true) flagged++;
      }
      expect(casing, `${id}: casing meshes drawn`).toBeGreaterThan(0);
      if (id !== 'music_box' && id !== 'well' && id !== 'belfry') expect(flagged, `${id}: merged casing meshes`).toBeGreaterThan(0);
      shell.dispose();
    });
  }

  it('the Clock Tower fades its walls and its shell, not only the flag and the window', async () => {
    const rig = await buildMachine('clock_tower', realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
    if (!rig) throw new Error('no clock tower');
    const shell = new XRayShell(rig.root, XRAY_SHELL.clock_tower, () => xrayMovers(rig));
    shell.setAmount(1);
    const faded: string[] = [];
    rig.root.traverse((n) => {
      const mesh = n as Mesh;
      if (!mesh.isMesh) return;
      for (let up: Object3D | null = mesh; up; up = up.parent) if (!up.visible) return;
      const sources = (mesh.userData.bakedFrom as string[] | undefined) ?? [mesh.name];
      if (!sources.some((name) => name.startsWith('ClockTowerShell_') || name.startsWith('ClockTowerBaseWalls_'))) return;
      expect((mesh.material as MeshStandardMaterial).opacity, mesh.name).toBeCloseTo(XRAY_OPACITY, 6);
      faded.push(mesh.name);
    });
    expect(faded.length, `faded meshes made of the shell and the walls: ${faded.join(', ')}`).toBeGreaterThanOrEqual(5);
    shell.dispose();
  });

  it('the Carousel canopy fades like the rest of the casing and does not glow with the platform that carries it', async () => {
    const rig = await buildMachine('carousel', realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
    if (!rig) throw new Error('no carousel');
    const platform = rig.rotors.map((r) => r.node).find((node) => node.name === 'Scene');
    if (!platform) throw new Error('no platform rotor');
    const fromCanopy: Mesh[] = []; // every mesh under the rotor with canopy sources: the combined ones that draw now, and the split ones
    platform.traverse((n) => {
      const mesh = n as Mesh;
      const from = mesh.userData.bakedFrom as string[] | undefined;
      if (mesh.isMesh && from?.some((name) => name.startsWith('CarouselCanopy_'))) fromCanopy.push(mesh);
    });
    const canopy = fromCanopy.filter((m) => m.userData.xrayShell === true);
    expect(canopy.length, 'merged casing meshes with canopy sources, under the rotor').toBeGreaterThan(0);
    for (const mesh of fromCanopy) expect(mesh.userData.xrayShell === true || mesh.userData.xrayCombined === true, `${mesh.name}: flagged casing, or the combined bake`).toBe(true);

    const before = new Map(canopy.map((m) => [m, m.material]));
    const shell = new XRayShell(rig.root, XRAY_SHELL.carousel, () => xrayMovers(rig));
    shell.setAmount(1);
    for (const mesh of canopy) {
      expect(mesh.visible, `${mesh.name} draws while X-ray shows`).toBe(true);
      const material = mesh.material as MeshStandardMaterial;
      expect(material, mesh.name).not.toBe(before.get(mesh));
      expect(material.transparent, mesh.name).toBe(true);
      expect(material.opacity, mesh.name).toBeCloseTo(XRAY_OPACITY, 6);
      expect(material.emissive.r * material.emissiveIntensity, `${mesh.name} does not glow warm`).toBeLessThan(XRAY_GLOW);
    }
    shell.setAmount(0);
    for (const mesh of canopy) expect(mesh.material, mesh.name).toBe(before.get(mesh));
    shell.dispose();
  });

  for (const id of MACHINES) {
    it(`${id}: the moving mechanism glows warm and solid, the casing does not, and everything is given back`, async () => {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const prefixes = XRAY_SHELL[id];
      const movers = xrayMovers(rig);
      expect(movers.length, `${id} moving nodes`).toBeGreaterThan(0);
      const all: Mesh[] = [];
      rig.root.traverse((n) => {
        if ((n as Mesh).isMesh) all.push(n as Mesh);
      });
      const before = new Map(all.map((m) => [m, m.material]));
      const shell = new XRayShell(rig.root, prefixes, () => movers);
      shell.setAmount(1);
      // What glows is what draws while X-ray shows (the split meshes, not the combined ones) under a moving node and is not casing.
      const expected = new Set<Mesh>();
      for (const node of movers) {
        node.traverse((n) => {
          const mesh = n as Mesh;
          if (mesh.isMesh && mesh.visible && !Array.isArray(mesh.material) && mesh.material.visible && !isXRayShell(mesh, prefixes)) expected.add(mesh);
        });
      }
      expect(expected.size, `${id} meshes that glow`).toBeGreaterThan(0);
      for (const mesh of expected) {
        const material = mesh.material as MeshStandardMaterial;
        expect(material, mesh.name).not.toBe(before.get(mesh));
        expect(material.transparent, mesh.name).toBe(false);
        expect(material.emissive.r * material.emissiveIntensity, mesh.name).toBeGreaterThanOrEqual(XRAY_GLOW - 1e-6);
      }
      for (const m of all) if (!expected.has(m) && !isXRayShell(m, prefixes)) expect(m.material, m.name).toBe(before.get(m)); // the rest is untouched
      shell.setAmount(0);
      for (const m of all) expect(m.material, m.name).toBe(before.get(m));
      shell.dispose();
    });
  }

  it('the pump rod and pawl of the Well and the bell and clapper of the Belfry are moving mechanism too (rig.moving), not only the rotors', async () => {
    for (const [id, names] of [['well', ['Part_Follower', 'Part_Pawl']], ['belfry', ['ClockBell_Bell', 'ClockBell_Striker']]] as const) {
      const rig = await buildMachine(id, realSource, libraryRegistry(), BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const movers = xrayMovers(rig).map((n) => n.name);
      for (const name of names) expect(movers, `${id}: ${name}`).toContain(name);
    }
  });

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

describe.skipIf(!modelsPresent)('the two bakes of a finished machine, on the real GLBs: combined in normal play, split while X-ray shows', () => {
  const registry = libraryRegistry();
  /** Each machine as its builder returns it (unbaked), with the names its own runtime keeps (`KEEP_BY_NAME`, town/machines.ts). */
  const LOOSE: Record<(typeof MACHINES)[number], readonly [() => Promise<MachineRig>, readonly string[]]> = {
    music_box: [() => buildMusicBox(realSource, registry), []],
    carousel: [() => buildCarousel(realSource, registry), []],
    windmill: [() => buildWindmill(realSource, registry), []],
    clock_tower: [() => buildClockTower(realSource, registry), Object.values(CLOCK_TOWER_NODE)],
    well: [() => buildWell(realSource, registry), Object.values(WELL_NODE)],
    belfry: [() => buildBelfry(realSource, registry), Object.values(BELFRY_BELL_NODE)],
  };

  for (const id of MACHINES) {
    it(`${id}: draws the combined meshes, shows the split ones with the casing see-through and the mechanism solid, and swaps back when X-ray is off and settled`, async () => {
      // What the batching drew before it told the casing apart (no casing prefixes: everything merged per material): the normal-play draw count to hold.
      // (The Well's and the Belfry's casing was kept as loose meshes before that, two more draws each, so this is at most what the main branch draws.)
      const [build, keep] = LOOSE[id];
      const loose = await build();
      bakeRig({ ...loose, machineId: 'none' } as unknown as MachineRig, keep);
      const baseline = drawnMeshes(loose.root).length;

      const rig = await buildMachine(id, realSource, registry, BLUEPRINT_SOCKET_IDS);
      if (!rig) throw new Error(`no ${id}`);
      const prefixes = XRAY_SHELL[id];
      const all: Mesh[] = [];
      rig.root.traverse((n) => {
        if ((n as Mesh).isMesh) all.push(n as Mesh);
      });
      const combined = all.filter((m) => m.userData.xrayCombined === true);
      const split = all.filter((m) => m.userData.xraySplit === true);
      expect(combined.length, `${id} combined meshes`).toBeGreaterThan(0);
      expect(split.length, `${id}: a casing and a mechanism mesh for each combined one`).toBe(2 * combined.length);
      const before = new Map(all.map((m) => [m, m.material]));
      const nodes = nodesOf(rig.root);

      // Normal play: only the combined meshes draw, and there are no more draw calls than the plain bake has.
      expect(drawnMeshes(rig.root).length, `${id} meshes drawn in normal play`).toBe(baseline);
      for (const m of combined) expect(m.visible, m.name).toBe(true);
      for (const m of split) expect(m.visible, m.name).toBe(false);

      const view = new XRayView();
      const remove = view.add({ root: rig.root, prefixes, lens: () => false, moving: () => xrayMovers(rig) });
      view.update(FRAME);
      expect(view.busy, 'idle without the flag').toBe(false);
      for (const m of combined) expect(m.visible, m.name).toBe(true);

      // X-ray starts: the first frame of the fade already draws the split meshes.
      flag(true, rig.root);
      view.update(FRAME);
      expect(view.busy).toBe(true);
      for (const m of combined) expect(m.visible, `${m.name} is hidden as soon as X-ray fades`).toBe(false);
      for (const m of split) expect(m.visible, `${m.name} draws as soon as X-ray fades`).toBe(true);
      run(view, XRAY_FADE_S + 0.1);
      expect(view.busy).toBe(false);
      const shown = drawnMeshes(rig.root);
      expect(shown.length, `${id} meshes drawn while X-ray shows: one more for each combined mesh`).toBe(baseline + combined.length);
      let faded = 0;
      let solid = 0;
      for (const m of shown) {
        const material = m.material as MeshStandardMaterial;
        if (isXRayShell(m, prefixes)) {
          faded++;
          expect(material.opacity, m.name).toBeCloseTo(XRAY_OPACITY, 6);
          expect(material.transparent, m.name).toBe(true);
          expect(material.depthWrite, m.name).toBe(false);
        } else {
          solid++;
          expect(material.opacity, m.name).toBe((before.get(m) as MeshStandardMaterial).opacity);
          expect(material.transparent, m.name).toBe((before.get(m) as MeshStandardMaterial).transparent);
        }
      }
      expect(faded, `${id}: drawn casing meshes`).toBeGreaterThan(0);
      expect(solid, `${id}: drawn mechanism meshes`).toBeGreaterThan(0);

      // X-ray stops: the split meshes stay while the casing is still fading in, and the combined ones come back when it is fully opaque again.
      flag(false);
      run(view, 0.1);
      expect(view.busy).toBe(true);
      for (const m of split) expect(m.visible, `${m.name} still draws while the casing is not opaque`).toBe(true);
      run(view, XRAY_FADE_S + 0.1);
      expect(view.busy).toBe(false);
      for (const m of combined) expect(m.visible, m.name).toBe(true);
      for (const m of split) expect(m.visible, m.name).toBe(false);
      expect(drawnMeshes(rig.root).length, `${id} meshes drawn once X-ray is off`).toBe(baseline);
      for (const m of all) expect(m.material, `${m.name} has the shared material it was built with`).toBe(before.get(m));
      expect(nodesOf(rig.root), 'the swap adds and removes no node').toBe(nodes);

      remove();
      for (const m of combined) expect(m.visible, m.name).toBe(true);
    });
  }
});
