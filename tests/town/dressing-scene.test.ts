import { Box3, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLOT_IDS } from '../../src/game/content';
import { buildDressing, LAMP_LIGHT_CD, loadDressingModels } from '../../src/town/dressing';
import { DRESSING, DRESSING_NODES, DRESSING_MODEL_PATHS } from '../../src/town/dressing-table';
import type { DressingItem } from '../../src/town/dressing-table';
import { DRESS_Y_M } from '../../src/town/layout';
import type { ModelSource } from '../../src/town/scene';
import { WakeField } from '../../src/town/wake';
import { dressingModels, fs, libraryRegistry, syntheticTown } from './helpers';

/**
 * The dressing, the workshop lantern and the gift plate built from the real GLBs (set WU_MODELS_DIR to test another checkout;
 * skipped when the files are not in the working tree) and from small stand-ins for the parts that need no file.
 */
const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : new URL('../../public/assets/models/', import.meta.url);
const present = fs.existsSync(new URL(DRESSING_MODEL_PATHS.houses, dir)) && fs.existsSync(new URL(DRESSING_MODEL_PATHS.props, dir)) && fs.existsSync(new URL(DRESSING_MODEL_PATHS.lamp, dir));

const source: ModelSource = async (path) => {
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};

const triangles = (m: Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
const boxOf = (o: Object3D): Box3 => new Box3().setFromObject(o);

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!present)('the dressing from the real GLBs', () => {
  it('builds the whole table in at most seven draw calls (one merged mesh per library material), with the budgeted triangles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dressing = buildDressing(await loadDressingModels(source), libraryRegistry());
    expect(warn).not.toHaveBeenCalled();
    expect(dressing.meshes.length).toBeGreaterThan(0);
    expect(dressing.meshes.length).toBeLessThanOrEqual(7);
    expect(new Set(dressing.meshes.map((m) => m.material)).size).toBe(dressing.meshes.length);
    for (const m of dressing.meshes) expect((m.material as { name: string }).name).toMatch(/^Mat_/);
    // 4 houses at 19,740 triangles in all, the props, the lamps: well inside the town's triangle budget.
    const total = dressing.meshes.reduce((n, m) => n + triangles(m), 0);
    expect(total).toBeGreaterThan(19_740);
    expect(total).toBeLessThan(60_000);
  });

  it('puts every piece where its row says, at the size of its table entry (EX-H2, EX-P2)', async () => {
    const models = await loadDressingModels(source);
    for (const [name, n] of Object.entries(DRESSING_NODES)) {
      const item: DressingItem = { id: 't', node: name as keyof typeof DRESSING_NODES, x: 5, z: -3, yawDeg: 0, wakes: 'plot_music_box' };
      const dressing = buildDressing(structuredCloneModels(models), libraryRegistry(), [item]);
      const box = boxOf(dressing.group);
      const size = box.getSize(new Vector3());
      const tol = (v: number): number => Math.max(0.0015, v * 0.05);
      // lamp_post.glb's footprint is its housing's base plate, 22.2 x 18 mm, but its arm can reach further: only its height is tested
      if (n.kind !== 'lamp') {
        expect(size.x * 100, `${name} width`).toBeGreaterThan(n.widthCm - tol(n.widthCm) * 100);
        expect(size.x * 100, `${name} width`).toBeLessThan(n.widthCm + tol(n.widthCm) * 100);
        expect(size.z * 100, `${name} depth`).toBeGreaterThan(n.depthCm - tol(n.depthCm) * 100);
        expect(size.z * 100, `${name} depth`).toBeLessThan(n.depthCm + tol(n.depthCm) * 100);
      }
      expect(size.y * 100, `${name} height`).toBeGreaterThan(n.heightCm - tol(n.heightCm) * 100);
      expect(size.y * 100, `${name} height`).toBeLessThan(n.heightCm + tol(n.heightCm) * 100);
      // the floor-contact centre of the piece lands on the row: inside its footprint box, standing on the paving
      expect(box.min.x).toBeLessThan(0.05);
      expect(box.max.x).toBeGreaterThan(0.05);
      expect(box.min.z).toBeLessThan(-0.03);
      expect(box.max.z).toBeGreaterThan(-0.03);
      expect(box.min.y, name).toBeCloseTo(DRESS_Y_M, 4);
    }
  });

  it('turns a piece about its own floor centre (the fence run along x becomes a run along z)', async () => {
    const models = await loadDressingModels(source);
    const at = (yawDeg: number) => boxOf(buildDressing(structuredCloneModels(models), libraryRegistry(), [{ id: 'f', node: 'TownProp_Fence', x: 10, z: -3, yawDeg, wakes: 'plot_music_box' }]).group);
    const flat = at(0);
    const turned = at(90);
    expect(flat.getSize(new Vector3()).x).toBeGreaterThan(0.06);
    expect(turned.getSize(new Vector3()).z).toBeGreaterThan(0.06);
    expect(turned.getSize(new Vector3()).x).toBeLessThan(0.01);
    expect((turned.min.x + turned.max.x) / 2).toBeCloseTo(0.1, 2); // still centred on the row
  });

  it('uses only the library materials the dressing files promise, with the lit panes the only emissive surfaces', async () => {
    const dressing = buildDressing(await loadDressingModels(source), libraryRegistry());
    const names = dressing.meshes.map((m) => (m.material as { name: string }).name).sort();
    expect(names).toEqual(expect.arrayContaining(['Mat_PaintedWood', 'Mat_Walnut', 'Mat_TealPaint', 'Mat_WarmEmissive', 'Mat_AgedBrass', 'Mat_Stone']));
    for (const n of names) expect(['Mat_PaintedWood', 'Mat_Walnut', 'Mat_TealPaint', 'Mat_WarmEmissive', 'Mat_AgedBrass', 'Mat_Stone', 'Mat_WarmGlass']).toContain(n);
  });

  it('keeps the whole dressing inside the ground and its grid', async () => {
    const box = boxOf(buildDressing(await loadDressingModels(source), libraryRegistry()).group);
    expect(box.min.x).toBeGreaterThanOrEqual(-0.3 - 1e-3);
    expect(box.max.x).toBeLessThanOrEqual(0.3 + 1e-3);
    expect(box.min.z).toBeGreaterThanOrEqual(-0.15 - 1e-3);
    expect(box.max.z).toBeLessThanOrEqual(0.15);
    expect(box.max.y).toBeLessThan(0.2); // under the shader's 21 cm scenery ceiling, the Tall house's chimney the highest
  });
});

/** The loaded scenes are consumed by `buildDressing` (materials swapped in place): give each build its own clone of them. */
function structuredCloneModels(models: Awaited<ReturnType<typeof loadDressingModels>>): Awaited<ReturnType<typeof loadDressingModels>> {
  return Object.fromEntries(Object.entries(models).map(([k, m]) => [k, { scene: m.scene.clone(true), animations: m.animations }])) as never;
}

describe('the night lights of the dressing', () => {
  const build = () => buildDressing(dressingModels(), libraryRegistry());

  it('has one warm point light per plot at most, four in all, off until the night', () => {
    const { lamps } = build();
    expect(lamps.length).toBeGreaterThan(0);
    expect(lamps.length).toBeLessThanOrEqual(4);
    expect(new Set(lamps.map((l) => l.plot)).size).toBe(lamps.length);
    for (const lamp of lamps) {
      expect(lamp.light.visible).toBe(false);
      expect(lamp.light.intensity).toBe(0);
      expect(lamp.light.castShadow).toBe(false);
    }
    const lampRows = DRESSING.filter((d) => DRESSING_NODES[d.node].kind === 'lamp');
    expect(lamps.map((l) => l.light.position.x)).toEqual(PLOT_IDS.filter((p) => lampRows.some((r) => r.wakes === p)).map((p) => lampRows.find((r) => r.wakes === p)!.x / 100));
  });

  it('lights a lamp only while its plot is awake and the night is on, and never recompiles when a plot wakes', () => {
    const dressing = build();
    const wake = new WakeField();
    dressing.update(0.1, 0, wake);
    expect(dressing.lamps.every((l) => !l.light.visible)).toBe(true);

    dressing.update(0.1, 1, wake); // night, nothing awake: the lights are in the scene (no shader change later) but dark
    expect(dressing.lamps.every((l) => l.light.visible && l.light.intensity === 0)).toBe(true);

    const lamp = dressing.lamps[0];
    wake.wake(lamp.plot, true);
    for (let i = 0; i < 60; i++) dressing.update(1 / 72, 1, wake);
    expect(lamp.light.intensity).toBeGreaterThan(LAMP_LIGHT_CD * 0.5);
    expect(lamp.light.intensity).toBeLessThanOrEqual(LAMP_LIGHT_CD);
    expect(dressing.lamps.filter((l) => l !== lamp).every((l) => l.light.intensity === 0)).toBe(true);
    expect(dressing.lamps.every((l) => l.light.visible)).toBe(true); // visibility did not change with the wake

    for (let i = 0; i < 72 * 6; i++) dressing.update(1 / 72, 1, wake);
    expect(lamp.light.intensity).toBe(LAMP_LIGHT_CD);
    expect(dressing.update(1 / 72, 1, wake)).toBe(false); // settled: nothing changes, nothing to draw

    for (let i = 0; i < 72 * 6; i++) dressing.update(1 / 72, 0, wake); // day again
    expect(dressing.lamps.every((l) => !l.light.visible && l.light.intensity === 0)).toBe(true);
  });

  it('refuses a table with more prop instances than the budget', () => {
    const many: DressingItem[] = Array.from({ length: 25 }, (_, i) => ({ id: `b${i}`, node: 'TownProp_Bench', x: i, z: -3, yawDeg: 0, wakes: 'plot_music_box' }));
    expect(() => buildDressing(dressingModels(), libraryRegistry(), many)).toThrow(/24/);
  });

  it('skips a node a file lacks, with a warning, and builds the rest', () => {
    const models = dressingModels();
    models.houses.scene.getObjectByName('TownHouse_Jetty')?.removeFromParent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dressing = buildDressing(models, libraryRegistry());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TownHouse_Jetty'));
    expect(dressing.meshes.length).toBeGreaterThan(0);
  });
});

describe('the town with its dressing', () => {
  it('adds the dressing group under the town group, and nothing when the files are missing', () => {
    const { town } = syntheticTown(true, true);
    expect(town.dressing).not.toBeNull();
    expect(town.dressing?.group.parent).toBe(town.group);
    expect(syntheticTown(true, false).town.dressing).toBeNull();
  });
});
