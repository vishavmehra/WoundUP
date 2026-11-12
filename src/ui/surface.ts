import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { PX_PER_M, paintPlaque, type Ctx, type PlaqueState } from './paint.js';

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export const domCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * A flat plane whose texture is a canvas we paint: paper, a label, a plaque. No DOM in the scene (the page is not drawn in
 * XR), no per-frame work: `paint` runs when the content changes and uploads the texture once.
 * Unlit and not tone mapped, so cream stays cream under the warm scene lights and text stays readable.
 */
export class Surface {
  readonly mesh: Mesh;
  readonly width: number;
  readonly height: number;
  private readonly ctx: Ctx;
  private readonly texture: CanvasTexture;
  /** What was last painted, so an unchanged state is never repainted. */
  key = '';

  constructor(factory: CanvasFactory, widthM: number, heightM: number, pxPerM = PX_PER_M) {
    this.width = Math.max(8, Math.round(widthM * pxPerM));
    this.height = Math.max(8, Math.round(heightM * pxPerM));
    const canvas = factory(this.width, this.height);
    this.ctx = canvas.getContext('2d') as Ctx;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), material);
  }

  /** Paints when `key` differs from the last paint. Returns whether it painted. */
  paint(key: string, draw: (ctx: Ctx, width: number, height: number) => void): boolean {
    if (key === this.key) return false;
    this.key = key;
    draw(this.ctx, this.width, this.height);
    this.texture.needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.texture.dispose();
  }
}

/** A brass plaque surface that repaints only when its label or state changes. */
export class Plaque extends Surface {
  set(label: string, state: PlaqueState = 'idle'): void {
    this.paint(`${state}|${label}`, (ctx, w, h) => paintPlaque(ctx, w, h, label, state));
  }
}
