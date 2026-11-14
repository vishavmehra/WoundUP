/**
 * The gift engraving plate (TOCKTON_EXTRA_ASSET_SPECS §5): a small brass nameplate whose recessed face carries two authored lines
 * painted on a canvas texture: the sender's preset engraving (largest) and the gifted machine's name from the authored catalogue.
 * The text is never read from a gift payload: `plateText` looks both lines up in closed tables by validated ids, and nothing else
 * (no sender, no date, no free text) has a place to be drawn. One canvas per plate, redrawn only when a line changes, disposed
 * with the plate (ADR-034 texture rows). Real size: the plate never scales with the box or the town.
 */
import { CanvasTexture, SRGBColorSpace } from '@iwsdk/core';
import type { Material, Mesh, MeshStandardMaterial, Object3D, World } from '@iwsdk/core';
import { ENGRAVINGS, isOneOf, MACHINE_IDS } from '../game/content';
import type { MachineId } from '../game/content';
import type { Gift } from '../game/gift';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import { STAGE_NODE_ID } from '../stage';
import { MACHINE_NAMES } from '../ui/copy';
import type { ModelSource } from './scene';

export const PLATE_MODEL_PATH = 'tockton/gifts/gift_engraving_plate.glb';
export const PLATE_FIELD_NODE = 'GiftPlate_Field';
/** The field's canvas: its 2.65 : 1 face at 1024 px wide (TOCKTON_EXTRA_ASSET_SPECS §5.2). */
export const PLATE_CANVAS = { w: 1024, h: 386 } as const;
const BRASS = '#B8952E';
const LIT_EDGE = '#E4C770';
const UMBER = '#3A2614';
const FACE = '"Elsie", Georgia, "Times New Roman", serif';

export interface PlateText {
  readonly line1: string;
  readonly line2: string;
}

/** The two lines of a gift's plate, from the closed tables only. Null when the gift names an unknown engraving or machine. */
export function plateText(gift: Pick<Gift, 'engraving' | 'blueprintId'>): PlateText | null {
  const engraving = ENGRAVINGS.find((e) => e.id === gift.engraving);
  if (!engraving || !isOneOf(MACHINE_IDS, gift.blueprintId)) return null;
  return { line1: engraving.text, line2: MACHINE_NAMES[gift.blueprintId as MachineId] };
}

type Ctx = Pick<CanvasRenderingContext2D, 'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText' | 'measureText'>;

/** Paints the engraved face: umber text with a one pixel lighter offset to read as cut metal. Line 1 shrinks to fit, never wraps. */
export function drawPlate(ctx: Ctx, text: PlateText, w: number = PLATE_CANVAS.w, h: number = PLATE_CANVAS.h): void {
  ctx.fillStyle = BRASS;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = (s: string, size: number, y: number): void => {
    let px = Math.round(h * size);
    ctx.font = `400 ${px}px ${FACE}`;
    const room = w * 0.9;
    const width = ctx.measureText(s).width;
    if (width > room) {
      px = Math.max(8, Math.floor((px * room) / width));
      ctx.font = `400 ${px}px ${FACE}`;
    }
    ctx.fillStyle = LIT_EDGE;
    ctx.fillText(s, w / 2 + 1, y * h + 1);
    ctx.fillStyle = UMBER;
    ctx.fillText(s, w / 2, y * h);
  };
  line(text.line1, 0.45, 0.4);
  line(text.line2, 0.22, 0.78);
}

export interface EngravingPlate {
  readonly root: Object3D;
  redraw(text: PlateText): void;
  /** Frees the canvas texture and the field's material copy (the shared library material stays). */
  dispose(): void;
}

const browserCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_CANVAS.w;
  canvas.height = PLATE_CANVAS.h;
  return canvas;
};

/** Loads the plate and paints `text`. `canvas` is the browser's unless a test supplies one. Null when the file lacks its field node. */
export async function createEngravingPlate(
  source: ModelSource,
  registry: MaterialRegistry,
  text: PlateText,
  canvas: () => HTMLCanvasElement = browserCanvas,
): Promise<EngravingPlate | null> {
  const model = await source(PLATE_MODEL_PATH);
  applyLibraryMaterials(model.scene, registry);
  const field = model.scene.getObjectByName(PLATE_FIELD_NODE) as Mesh | undefined;
  if (!field || field.isMesh !== true) {
    console.warn(`[wound-up] ${PLATE_MODEL_PATH} has no ${PLATE_FIELD_NODE}; the gift has no plate.`);
    return null;
  }
  // The font is the UI's serif face; a page that has not loaded it draws in the fallback.
  try {
    await document.fonts?.load(`400 64px ${FACE}`);
  } catch {
    /* fall back */
  }
  const surface = canvas();
  const ctx = surface.getContext('2d');
  if (!ctx) return null;
  const texture = new CanvasTexture(surface);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false; // glTF uvs put the image's top at v = 0 (the plate's back edge), as GLTFLoader's own textures do
  const own = (field.material as MeshStandardMaterial).clone(); // the shared library material is never edited
  own.map = texture;
  // Satin, not mirror: the library's aged brass is mostly metal and would reflect the dim room instead of showing the painted lines.
  own.metalnessMap = null;
  own.roughnessMap = null;
  own.metalness = 0.25;
  own.roughness = 0.55;
  own.needsUpdate = true;
  field.material = own;
  const paint = (t: PlateText): void => {
    drawPlate(ctx, t, surface.width, surface.height);
    texture.needsUpdate = true;
  };
  paint(text);
  return {
    root: model.scene,
    redraw: paint,
    dispose() {
      texture.dispose();
      (own as Material).dispose();
      model.scene.removeFromParent();
    },
  };
}

/** Where the plate stands on the gift stand, stage-local metres: on the velvet, in front of the machine (which stands at z -0.07, 1.5 times its size), facing the viewer. */
export const GIFT_PLATE_AT = { y: 0.002, z: 0.06 } as const;
const shown = new WeakMap<World, EngravingPlate>();

/**
 * The gift viewer's plate: the sender's engraving and the machine's name in front of the gifted machine. Shown again (the viewer's
 * "Show it again") it is repainted, not rebuilt. Nothing happens when the gift names an unknown engraving or machine.
 */
export async function showGiftPlate(world: World, source: ModelSource, registry: MaterialRegistry, gift: Pick<Gift, 'engraving' | 'blueprintId'>): Promise<void> {
  const text = plateText(gift);
  const stage = world.getSceneObject(STAGE_NODE_ID);
  if (!text || !stage) return;
  const existing = shown.get(world);
  if (existing) {
    existing.redraw(text);
    return;
  }
  const plate = await createEngravingPlate(source, registry, text);
  if (!plate) return;
  plate.root.position.set(0, GIFT_PLATE_AT.y, GIFT_PLATE_AT.z);
  stage.add(plate.root);
  shown.set(world, plate);
}
