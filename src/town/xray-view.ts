/**
 * What X-ray looks like (PRODUCT_SPEC F11 and section 12, INTERACTION_SPEC section 11, GAMEPLAY_SYSTEMS section 15): the casing of
 * the machine fades to about 15% opacity, cream-tinted with a faint cool rim, so the moving mechanism inside shows. The flag itself
 * (palm gesture or lens button) is the interaction layer's (`xrayFlag`); this is only what the flag does to the picture. Inspection
 * only: no assembly, solver or machine state is read or written.
 *
 * Generic on purpose. A machine lists the name prefixes of its casing meshes in `XRAY_SHELL` and nothing else; a new machine adds
 * one line. A mesh is casing when its own name starts with one of them (the seated parts are meshes of other GLBs with other
 * prefixes, so a gear inside a Music Box case that is its child is never touched) or when it carries `userData.xrayShell`: the static
 * batching (town/bake.ts) merges a finished machine's casing meshes into meshes flagged so, so a baked machine fades by the flag where its
 * meshes no longer have their names (`isXRayShell`).
 *
 * Two bakes of a baked machine. Where its casing and its mechanism wear the same material the batching drew them as ONE combined mesh
 * (`userData.xrayCombined`, which keeps the draw calls down in normal play) and kept, hidden, a casing mesh and a mechanism mesh of the same
 * geometry (`userData.xraySplit`). While X-ray shows (any amount above 0) the split meshes are drawn and the combined ones hidden, so the casing
 * can fade without the mechanism; once it is fully back (amount 0) the combined ones are drawn again. Flipping `visible` allocates nothing.
 *
 * The mechanism that shows through gets a gentle warm glow (PRODUCT_SPEC section 12: the moving parts are highlighted, INTERACTION_SPEC
 * section 11: the internals glow) so the player sees what moves. What moves is read from the machine, not listed: every node of the rig's
 * rotors and bobbers (`xrayMovers`), or, on the bench, the parts seated in the housing (`XRaySubject.moving`). A new machine needs no line.
 *
 * Materials. The casing and the moving parts use the shared library materials, so a mesh gets its own copy (see-through, or glowing)
 * while X-ray shows and the shared original again afterwards: the copies are made once per machine (the first time X-ray shows),
 * reused for every later toggle and disposed with the machine. The shared materials are never changed. Nothing allocates per frame.
 */
import { Box3, Color, Vector3 } from 'three';
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { isXRayLensOn, xrayFlag } from '../interaction/xray-state';
import type { MachineRig } from './motion';

/** Name prefixes of each machine's casing meshes, by machine id: the housing on the workbench and the walls of the finished machine. */
export const XRAY_SHELL: Readonly<Record<string, readonly string[]>> = {
  music_box: ['MusicBoxCase_'], // the body and the lid
  carousel: ['CarouselBase_', 'CarouselCanopy_'], // the base ring and panels, and the roof over the poles
  windmill: ['WindmillBase_', 'WindmillTower_'], // the base and the tower walls round the millstone
  clock_tower: ['ClockTowerBase_', 'ClockTowerBaseWalls_', 'ClockTowerShell_', 'ClockTower_'], // the base, its walls and the shell round the escapement (the walls and the shell are merged by src/machines/clock-tower/bake.ts, under these names)
  well: ['Well_Plate_'], // the basin, its walnut rim and the teal paint; the pump, the pulleys and the chain stay solid
  belfry: ['Belfry_Plinth_'], // the stone and painted plinth bands; the train, the shaft, the flywheel, the vane and the bell stay solid
};

/** Whether `mesh` is casing: it carries the flag the static batching gives a merged casing mesh, or its name starts with one of `prefixes`. */
export function isXRayShell(mesh: Object3D, prefixes: readonly string[]): boolean {
  return mesh.userData.xrayShell === true || prefixes.some((prefix) => mesh.name.startsWith(prefix));
}

/** Opacity of the casing while X-ray shows ("approximately 15% opaque"). */
export const XRAY_OPACITY = 0.15;
/** Seconds to fade in or out. */
export const XRAY_FADE_S = 0.3;
/** How far the casing colour moves towards cream (#F2E6CF), and the faint cool glow (a teal emissive, a fifth of full strength) it gains. */
const TINT = 0.45;
const CREAM = new Color(0xf2e6cf);
const COOL = new Color(0x4f8f8f).multiplyScalar(0.22);
/** The glow of the moving parts: the palette's warm lamp light (#FFC66D) at a fifth of full strength, added to whatever a part already glows. */
export const XRAY_GLOW = 0.2;
const WARM = new Color(0xffc66d);
const _glow = new Color();

/** Machines whose mechanism is not a rig rotor: node names whose whole subtree is the moving mechanism (the Clock Tower's movement, escapement and pendulum). */
export const XRAY_MECHANISM: Readonly<Record<string, readonly string[]>> = {
  clock_tower: ['ClockTowerMovement'],
};

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

/** One copy of a library material (see-through, or glowing), with the look it fades from. */
interface Ghost {
  readonly material: MeshStandardMaterial;
  readonly opacity: number;
  readonly color: Color;
  readonly emissive: Color;
}

const isStandard = (m: Material): m is MeshStandardMaterial => (m as MeshStandardMaterial).isMeshStandardMaterial === true;

/**
 * The glow a material already shows is its colour times its intensity: GrabFeedbackSystem gives a carried machine's materials a warm
 * colour at intensity 0, which a plain copy of the colour alone would turn into a glow the moment a tint is mixed in. The copy shows
 * that product at intensity 1, so the tint (cool on the casing, warm on the mechanism) is what it adds to, on every machine.
 */
function copyOf(original: MeshStandardMaterial): Ghost {
  const material = original.clone();
  const emissive = original.emissive.clone().multiplyScalar(original.emissiveIntensity);
  material.emissiveIntensity = 1;
  return { material, opacity: original.opacity, color: original.color.clone(), emissive };
}

/** The casing's copy: see-through, without depth writes. */
function ghostOf(original: MeshStandardMaterial): Ghost {
  const ghost = copyOf(original);
  ghost.material.transparent = true;
  ghost.material.depthWrite = false;
  return ghost;
}

/**
 * The moving part's copy: opaque as it was. The shared materials carry the wake shading (`onBeforeCompile`, wake-shader.ts) and a clone does
 * not inherit it, so the copy takes it over: it then draws with the original's shader program instead of compiling a new one when X-ray first shows.
 */
function glowOf(original: MeshStandardMaterial): Ghost {
  const ghost = copyOf(original);
  ghost.material.onBeforeCompile = original.onBeforeCompile;
  ghost.material.customProgramCacheKey = () => original.customProgramCacheKey();
  return ghost;
}

/** A set of meshes that wear a copy of their material while X-ray shows. The copies are made once per original material and kept. */
class Swap {
  /** The copies, so a fade walks them without allocating. */
  readonly list: Ghost[] = [];
  private readonly copies = new Map<Material, Ghost>();
  private meshes: readonly Mesh[] = [];
  private originals: Array<Material | undefined> = [];
  private on = false;

  constructor(private readonly make: (original: MeshStandardMaterial) => Ghost) {}

  get swapped(): boolean {
    return this.on;
  }

  swapIn(meshes: readonly Mesh[]): void {
    this.meshes = meshes;
    this.originals = new Array<Material | undefined>(meshes.length);
    for (let i = 0; i < meshes.length; i++) {
      const original = meshes[i].material;
      if (Array.isArray(original) || !isStandard(original)) continue; // one standard material per mesh; anything else stays as it is
      this.originals[i] = original;
      meshes[i].material = this.copyOf(original).material;
    }
    this.on = true;
  }

  /** Gives the shared materials back (the copies are kept for the next time). */
  restore(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const original = this.originals[i];
      if (original) this.meshes[i].material = original;
    }
    this.meshes = [];
    this.originals = [];
    this.on = false;
  }

  dispose(): void {
    if (this.on) this.restore();
    for (const g of this.list) g.material.dispose();
    this.copies.clear();
    this.list.length = 0;
  }

  private copyOf(original: MeshStandardMaterial): Ghost {
    let ghost = this.copies.get(original);
    if (!ghost) {
      ghost = this.make(original);
      this.copies.set(original, ghost);
      this.list.push(ghost);
    }
    return ghost;
  }
}

/**
 * The nodes whose meshes are the moving mechanism of a finished machine: every rotor, every bobbing horse and every node its own updaters move (`rig.moving`) of its rig (whatever the
 * machine, so a new one gets its glow from the rig it already has), and the named nodes of `XRAY_MECHANISM` for a machine that is moved
 * by its own runtime instead of by rotors. Allocates: call it when X-ray turns on, not every frame.
 */
export function xrayMovers(rig: MachineRig): Object3D[] {
  const nodes: Object3D[] = [];
  for (const rotor of rig.rotors) nodes.push(rotor.node);
  for (const bobber of rig.bobbers) nodes.push(bobber.node);
  for (const node of rig.moving) nodes.push(node); // what a machine's own updaters move: the Well's pump rod, pawl and water, the Belfry's bell and clapper
  for (const name of XRAY_MECHANISM[rig.machineId] ?? []) {
    const node = rig.root.getObjectByName(name);
    if (node) nodes.push(node);
  }
  return nodes;
}

/**
 * The casing meshes of one machine and the meshes of its moving mechanism, each with its own copy of the material.
 * `setAmount(0..1)` fades the casing out and the glow in. `moving` is asked each time X-ray turns on (parts come and go on the bench).
 */
export class XRayShell {
  private meshes: Mesh[] | null = null;
  /** The combined meshes the batching drew in normal play, and the split ones it kept hidden (see the header). Collected with the casing. */
  private readonly combined: Mesh[] = [];
  private readonly split: Mesh[] = [];
  private splitShown = false;
  private readonly casing = new Swap(ghostOf);
  private readonly glow = new Swap(glowOf);

  constructor(
    private readonly root: Object3D,
    private readonly prefixes: readonly string[],
    private readonly moving: () => readonly Object3D[] = () => [],
  ) {}

  /** How many casing meshes the machine has (collected on first use). */
  get size(): number {
    return this.collect().length;
  }

  /** 0 is the machine as built (the shared materials, untouched), 1 is X-ray. */
  setAmount(amount: number): void {
    if (amount <= 0) {
      if (this.casing.swapped) this.casing.restore();
      if (this.glow.swapped) this.glow.restore();
      this.showSplit(false); // fully opaque again with the shared materials: the combined bake draws
      return;
    }
    this.showSplit(true); // before the glow is collected: it reads what is drawn
    if (!this.casing.swapped) this.casing.swapIn(this.collect());
    if (!this.glow.swapped) this.glow.swapIn(this.collectGlow());
    for (let i = 0; i < this.casing.list.length; i++) {
      const g = this.casing.list[i];
      const m = g.material;
      m.opacity = g.opacity + (XRAY_OPACITY - g.opacity) * amount;
      m.color.copy(g.color).lerp(CREAM, TINT * amount);
      m.emissive.copy(g.emissive).lerp(COOL, amount);
    }
    _glow.copy(WARM).multiplyScalar(XRAY_GLOW * amount);
    for (let i = 0; i < this.glow.list.length; i++) {
      const g = this.glow.list[i];
      g.material.emissive.copy(g.emissive).add(_glow);
    }
  }

  /** Gives the shared materials back and disposes the copies. */
  dispose(): void {
    this.casing.dispose();
    this.glow.dispose();
    this.showSplit(false);
    this.meshes = null;
    this.combined.length = 0;
    this.split.length = 0;
  }

  /** Draws the split meshes and hides the combined ones, or the other way round. Does nothing for a machine that has none (the bench housing). */
  private showSplit(on: boolean): void {
    if (this.splitShown === on) return;
    this.collect();
    for (let i = 0; i < this.combined.length; i++) this.combined[i].visible = !on;
    for (let i = 0; i < this.split.length; i++) this.split[i].visible = on;
    this.splitShown = on;
  }

  private collect(): Mesh[] {
    if (this.meshes) return this.meshes;
    const found: Mesh[] = [];
    this.root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      if (isXRayShell(mesh, this.prefixes)) found.push(mesh);
      if (mesh.userData.xrayCombined === true) this.combined.push(mesh);
      else if (mesh.userData.xraySplit === true) this.split.push(mesh);
    });
    this.meshes = found;
    return found;
  }

  /** The drawn meshes under the moving nodes that are not casing (a rotor can carry a canopy; a node can be under another), each once. */
  private collectGlow(): Mesh[] {
    const casing = new Set<Mesh>(this.collect());
    const found = new Set<Mesh>();
    for (const node of this.moving()) {
      node.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh && mesh.visible && !casing.has(mesh) && !Array.isArray(mesh.material) && mesh.material.visible) found.add(mesh); // not the hidden collider proxies
      });
    }
    return [...found];
  }
}

/** A machine X-ray can open: the root of its meshes, the prefixes of its casing, and whether the lens button means this one. */
export interface XRaySubject {
  readonly root: Object3D;
  readonly prefixes: readonly string[];
  /** True while the lens button opens this machine: the one being built on the bench, or carried. */
  lens(): boolean;
  /** The nodes of its moving mechanism, which glow while X-ray shows (`xrayMovers(rig)` for a finished machine). Left out: nothing glows. */
  moving?(): readonly Object3D[];
}

interface Entry {
  readonly subject: XRaySubject;
  readonly shell: XRayShell;
  amount: number;
}

/**
 * Fades the casing of every registered machine out and the glow of its mechanism in, from the X-ray flag, once a frame (`update`). A machine fades while X-ray
 * is on and either the palm is over it (`xrayFlag.target` owns its root) or the lens is on and `subject.lens()` says it is the
 * lens's machine. The flag's target is read through `object3D`, so any entity that owns the machine's root counts.
 */
export class XRayView {
  private readonly entries: Entry[] = [];

  /** Registers a machine. Returns the call that unregisters it and disposes its copies. */
  add(subject: XRaySubject): () => void {
    const entry: Entry = { subject, shell: new XRayShell(subject.root, subject.prefixes, subject.moving?.bind(subject)), amount: 0 };
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
