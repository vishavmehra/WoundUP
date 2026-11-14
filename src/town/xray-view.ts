/**
 * What X-ray looks like (PRODUCT_SPEC F11 and section 12, INTERACTION_SPEC section 11, GAMEPLAY_SYSTEMS section 15): the casing of
 * the machine fades to about 15% opacity, cream-tinted with a faint cool rim, so the moving mechanism inside shows. The flag itself
 * (palm gesture or lens button) is the interaction layer's (`xrayFlag`); this is only what the flag does to the picture. Inspection
 * only: no assembly, solver or machine state is read or written.
 *
 * Generic on purpose. A machine lists the name prefixes of its casing meshes in `XRAY_SHELL` and nothing else; a new machine adds
 * one line. A mesh is casing when its own name starts with one of them (the seated parts are meshes of other GLBs with other
 * prefixes, so a gear inside a Music Box case that is its child is never touched).
 *
 * Materials. The casing uses the shared library materials, so a mesh gets its own see-through copy while X-ray shows and the shared
 * original again afterwards: the copies are made once per machine (the first time X-ray shows), reused for every later toggle and
 * disposed with the machine. The shared materials are never changed. Nothing allocates per frame.
 */
import { Box3, Color, Vector3 } from 'three';
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { isXRayLensOn, xrayFlag } from '../interaction/xray-state';

/** Name prefixes of each machine's casing meshes, by machine id: the housing on the workbench and the walls of the finished machine. */
export const XRAY_SHELL: Readonly<Record<string, readonly string[]>> = {
  music_box: ['MusicBoxCase_'], // the body and the lid
  carousel: ['CarouselBase_', 'CarouselCanopy_'], // the base ring and panels, and the roof over the poles
  windmill: ['WindmillBase_', 'WindmillTower_'], // the base and the tower walls round the millstone
  clock_tower: ['ClockTowerBase_', 'ClockTower_'], // the base and the shell round the escapement
};

/** Opacity of the casing while X-ray shows ("approximately 15% opaque"). */
export const XRAY_OPACITY = 0.15;
/** Seconds to fade in or out. */
export const XRAY_FADE_S = 0.3;
/** How far the casing colour moves towards cream (#F2E6CF), and the faint cool glow (a teal emissive, a fifth of full strength) it gains. */
const TINT = 0.45;
const CREAM = new Color(0xf2e6cf);
const COOL = new Color(0x4f8f8f).multiplyScalar(0.22);

const _box = new Box3();
const _origin = new Vector3();
const _scale = new Vector3();

/**
 * The `XRayTarget` zone of a finished machine (the palm must be 5-20 cm above `top`, within `radius` of its origin; both in the
 * machine's own units): measured from its meshes, because a finished machine is taller than its housing (the Clock Tower's shell,
 * the Windmill's tower). Call it where the machine has its own scale, before it is eased to the town's.
 */
export function xrayZoneOf(root: Object3D): { radius: number; top: number } {
  root.updateWorldMatrix(true, true);
  _box.setFromObject(root);
  root.getWorldPosition(_origin);
  const scale = root.getWorldScale(_scale).x || 1;
  const reach = (min: number, max: number, at: number): number => Math.max(Math.abs(min - at), Math.abs(max - at));
  return {
    radius: Math.hypot(reach(_box.min.x, _box.max.x, _origin.x), reach(_box.min.z, _box.max.z, _origin.z)) / scale,
    top: (_box.max.y - _origin.y) / scale,
  };
}

/** One see-through copy of a library material, with the look it fades from. */
interface Ghost {
  readonly material: MeshStandardMaterial;
  readonly opacity: number;
  readonly color: Color;
  readonly emissive: Color;
}

const isStandard = (m: Material): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial === true;

/** The casing meshes of one machine and their see-through copies. `setAmount(0..1)` fades them. */
export class XRayShell {
  private meshes: Mesh[] | null = null;
  private originals: Array<Material | undefined> = [];
  private readonly ghosts = new Map<Material, Ghost>();
  /** The same copies as an array, so a fade walks them without allocating. */
  private readonly ghostList: Ghost[] = [];
  private swapped = false;

  constructor(
    private readonly root: Object3D,
    private readonly prefixes: readonly string[],
  ) {}

  /** How many casing meshes the machine has (collected on first use). */
  get size(): number {
    return this.collect().length;
  }

  /** 0 is the machine as built (the shared materials, untouched), 1 is X-ray. */
  setAmount(amount: number): void {
    if (amount <= 0) {
      if (this.swapped) this.restore();
      return;
    }
    if (!this.swapped) this.swapIn();
    for (let i = 0; i < this.ghostList.length; i++) {
      const g = this.ghostList[i];
      const m = g.material;
      m.opacity = g.opacity + (XRAY_OPACITY - g.opacity) * amount;
      m.color.copy(g.color).lerp(CREAM, TINT * amount);
      m.emissive.copy(g.emissive).lerp(COOL, amount);
    }
  }

  /** Gives the shared materials back and disposes the copies. */
  dispose(): void {
    if (this.swapped) this.restore();
    for (const g of this.ghostList) g.material.dispose();
    this.ghosts.clear();
    this.ghostList.length = 0;
    this.meshes = null;
    this.originals = [];
  }

  private collect(): Mesh[] {
    if (this.meshes) return this.meshes;
    const found: Mesh[] = [];
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && this.prefixes.some((prefix) => mesh.name.startsWith(prefix))) found.push(mesh);
    });
    this.meshes = found;
    this.originals = new Array<Material | undefined>(found.length);
    return found;
  }

  private swapIn(): void {
    const meshes = this.collect();
    for (let i = 0; i < meshes.length; i++) {
      const original = meshes[i].material;
      if (Array.isArray(original) || !isStandard(original)) continue; // one standard material per casing mesh; anything else stays as it is
      this.originals[i] = original;
      meshes[i].material = this.ghostOf(original).material;
    }
    this.swapped = true;
  }

  private restore(): void {
    const meshes = this.meshes ?? [];
    for (let i = 0; i < meshes.length; i++) {
      const original = this.originals[i];
      if (original) meshes[i].material = original;
      this.originals[i] = undefined;
    }
    this.swapped = false;
  }

  private ghostOf(original: MeshStandardMaterial): Ghost {
    let ghost = this.ghosts.get(original);
    if (!ghost) {
      const material = original.clone();
      material.transparent = true;
      material.depthWrite = false;
      ghost = { material, opacity: original.opacity, color: original.color.clone(), emissive: original.emissive.clone() };
      this.ghosts.set(original, ghost);
      this.ghostList.push(ghost);
    }
    return ghost;
  }
}

/** A machine X-ray can open: the root of its meshes, the prefixes of its casing, and whether the lens button means this one. */
export interface XRaySubject {
  readonly root: Object3D;
  readonly prefixes: readonly string[];
  /** True while the lens button opens this machine: the one being built on the bench, or carried. */
  lens(): boolean;
}

interface Entry {
  readonly subject: XRaySubject;
  readonly shell: XRayShell;
  amount: number;
}

/**
 * Fades the casing of every registered machine in and out from the X-ray flag, once a frame (`update`). A machine fades while X-ray
 * is on and either the palm is over it (`xrayFlag.target` owns its root) or the lens is on and `subject.lens()` says it is the
 * lens's machine. The flag's target is read through `object3D`, so any entity that owns the machine's root counts.
 */
export class XRayView {
  private readonly entries: Entry[] = [];

  /** Registers a machine. Returns the call that unregisters it and disposes its copies. */
  add(subject: XRaySubject): () => void {
    const entry: Entry = { subject, shell: new XRayShell(subject.root, subject.prefixes), amount: 0 };
    this.entries.push(entry);
    return () => {
      const i = this.entries.indexOf(entry);
      if (i < 0) return;
      this.entries.splice(i, 1);
      entry.shell.dispose();
    };
  }

  /** True while any casing is still fading, so the frame keeps being drawn. */
  get busy(): boolean {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.amount !== this.wanted(e)) return true;
    }
    return false;
  }

  update(dt: number): void {
    const step = dt / XRAY_FADE_S;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const wanted = this.wanted(entry);
      if (entry.amount === wanted) continue;
      entry.amount = entry.amount < wanted ? Math.min(wanted, entry.amount + step) : Math.max(wanted, entry.amount - step);
      entry.shell.setAmount(entry.amount);
    }
  }

  dispose(): void {
    for (let i = 0; i < this.entries.length; i++) this.entries[i].shell.dispose();
    this.entries.length = 0;
  }

  private wanted(entry: Entry): number {
    if (!xrayFlag.active) return 0;
    if (xrayFlag.target?.object3D === entry.subject.root) return 1;
    return isXRayLensOn() && entry.subject.lens() ? 1 : 0;
  }
}
