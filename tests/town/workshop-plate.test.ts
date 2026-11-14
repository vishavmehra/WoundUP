import { Box3, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngravingPlate, drawPlate, PLATE_CANVAS, plateText } from '../../src/town/engraving-plate';
import type { ModelSource } from '../../src/town/scene';
import { addWorkshopLantern, LANTERN_AT, LANTERN_HEIGHT_M, LANTERN_MODEL_PATH } from '../../src/town/workshop';
import { fs, libraryRegistry } from './helpers';

/** The workshop lantern and the gift plate built from the real GLBs (WU_MODELS_DIR as in dressing-scene.test.ts; skipped when the files are absent). */
const override = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.WU_MODELS_DIR;
const dir = override ? new URL(`file:///${override.replace(/\\/g, '/').replace(/\/?$/, '/')}`) : new URL('../../public/assets/models/', import.meta.url);

const source: ModelSource = async (path) => {
  const bytes = fs.readFileSync(new URL(path, dir));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
};
const boxOf = (o: Object3D): Box3 => new Box3().setFromObject(o);

afterEach(() => vi.restoreAllMocks());

describe('the workshop lantern', () => {
  it.skipIf(!fs.existsSync(new URL(LANTERN_MODEL_PATH, dir)))('stands in the blueprint zone corner of the bench at the approved 6 cm height', async () => {
    const bench = new Group();
    const lantern = await addWorkshopLantern(bench, source, libraryRegistry());
    expect(lantern).not.toBeNull();
    expect(lantern?.parent).toBe(bench);
    bench.updateMatrixWorld(true);
    const box = boxOf(lantern as Object3D);
    expect(box.getSize(new Vector3()).y).toBeCloseTo(LANTERN_HEIGHT_M, 3);
    expect(box.min.y).toBeCloseTo(LANTERN_AT.y, 4); // on the bench top
    // blueprint zone: x 9.75 to 21.75 cm, z -10.5 to +10.5 cm, the front 6 cm (z > 4.5) holding only non-essential detail
    expect(box.min.x).toBeGreaterThan(0.0975);
    expect(box.max.x).toBeLessThan(0.2175);
    expect(box.min.z).toBeGreaterThan(0.045);
    expect(box.max.z).toBeLessThan(0.105);
  });

  it('plays without it: a missing file warns and returns null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bench = new Group();
    expect(await addWorkshopLantern(bench, () => Promise.reject(new Error('no file')), libraryRegistry())).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(bench.children).toHaveLength(0);
  });
});

describe('the gift engraving plate', () => {
  it('takes both lines from the closed tables and nothing from the payload', () => {
    expect(plateText({ engraving: 'thinking_of_you', blueprintId: 'music_box' })).toEqual({ line1: 'Thinking of you', line2: 'Music Box' });
    const crafted = { engraving: 'for_you', blueprintId: 'windmill', sender: 'Mallory <b>', note: 'click here' } as never;
    expect(JSON.stringify(plateText(crafted))).toBe(JSON.stringify({ line1: 'For you', line2: 'Windmill' }));
    expect(plateText({ engraving: 'free text', blueprintId: 'music_box' } as never)).toBeNull();
    expect(plateText({ engraving: 'for_you', blueprintId: '<script>' })).toBeNull();
  });

  it('paints each of the eight presets on one line that fits the canvas', () => {
    const drawn: Array<{ text: string; font: string }> = [];
    let font = '';
    const ctx = {
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
      set font(v: string) {
        font = v;
      },
      get font() {
        return font;
      },
      fillRect: () => undefined,
      fillText: (text: string) => void drawn.push({ text, font }),
      measureText: (text: string) => ({ width: text.length * Number(/(\d+)px/.exec(font)?.[1] ?? 0) * 0.5 }),
    };
    for (const id of ['For you', 'Happy birthday', 'Thinking of you', 'Thank you', 'With love', 'Congratulations', 'Made this for you', 'Wind me up']) {
      drawn.length = 0;
      drawPlate(ctx as never, { line1: id, line2: 'Clock Tower' });
      const first = drawn.filter((d) => d.text === id);
      expect(first.length).toBe(2); // the engraving and its lighter edge: one line, not wrapped
      const px = Number(/(\d+)px/.exec(first[0].font)?.[1]);
      expect(px * 0.5 * id.length).toBeLessThanOrEqual(PLATE_CANVAS.w * 0.9 + 1);
      expect(px).toBeLessThanOrEqual(Math.round(PLATE_CANVAS.h * 0.45));
    }
  });

  it.skipIf(!fs.existsSync(new URL('tockton/gifts/gift_engraving_plate.glb', dir)))('paints the field on its own material copy, redraws in place and disposes the copy', async () => {
    const registry = libraryRegistry();
    const painted: string[] = [];
    const surface = {
      width: PLATE_CANVAS.w,
      height: PLATE_CANVAS.h,
      getContext: () => ({ fillStyle: '', font: '', textAlign: '', textBaseline: '', fillRect: () => undefined, fillText: (t: string) => void painted.push(t), measureText: () => ({ width: 100 }) }),
    };
    const plate = await createEngravingPlate(source, registry, { line1: 'For you', line2: 'Music Box' }, () => surface as never);
    expect(plate).not.toBeNull();
    const field = plate!.root.getObjectByName('GiftPlate_Field') as Mesh;
    const own = field.material as unknown as { map: { flipY: boolean; dispose(): void } | null; name: string };
    expect(own).not.toBe(registry.get('Mat_AgedBrass', false)); // the shared library material is never edited
    expect(own.name).toBe('Mat_AgedBrass');
    expect(own.map).not.toBeNull();
    expect(own.map?.flipY).toBe(false); // glTF uvs: the image's top is v = 0
    expect(registry.get('Mat_AgedBrass', false).map).not.toBe(own.map);
    expect(painted).toEqual(['For you', 'For you', 'Music Box', 'Music Box']);
    plate!.redraw({ line1: 'Thank you', line2: 'Carousel' });
    expect(painted.slice(4)).toEqual(['Thank you', 'Thank you', 'Carousel', 'Carousel']);
    const dispose = vi.spyOn(own.map!, 'dispose');
    plate!.dispose();
    expect(dispose).toHaveBeenCalled();
  });
});
