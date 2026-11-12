// Runtime side of the shared material library (ADR-032).
//
// GLBs carry constants-only proxy materials named Mat_<Name>. This registry owns ONE shared material per library
// name (plus a vertexColors variant for meshes that carry COLOR_0), loads each material's textures once, and
// swaps the proxies of a loaded GLB scene for the shared materials. It does no per-frame work. Unloading a world
// must never call dispose(): the library is persistent.
import {
  Color,
  FrontSide,
  ImageBitmapLoader,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from '@iwsdk/core';
import type { Material, Mesh, Object3D } from '@iwsdk/core';
import { parseLibrary, TEXTURE_SLOTS } from './library.js';
import type { LibraryDef, LibraryMaterialDef, TextureSlot } from './library.js';

export type TextureLoadFn = (url: string) => Promise<Texture>;

export interface RegistryOptions {
  /** Absolute URL of the folder that holds library.json; texture files resolve against it. */
  baseUrl: string;
  /** Injected in tests. The default mirrors GLTFLoader: ImageBitmapLoader when available, else TextureLoader. */
  loadTexture?: TextureLoadFn;
  /** Cap for texture.anisotropy (default 4); three.js clamps it again to the GPU limit. */
  maxAnisotropy?: number;
}

export interface ApplyReport {
  /** Material slots swapped for a shared material. */
  replaced: number;
  /** Swapped slots per library name. */
  byName: Record<string, number>;
  /** Slots that already held a library material (a second apply is a no-op). */
  alreadyLibrary: number;
  /** Distinct material names that are not in the library; those materials were left untouched. */
  unknown: string[];
  /** GLB proxy materials disposed. */
  disposedProxies: number;
}

interface Entry {
  def: LibraryMaterialDef;
  plain: MeshStandardMaterial;
  vertexColor: MeshStandardMaterial | null;
  textures: Partial<Record<TextureSlot, Texture>> | null;
  loading: Promise<void> | null;
}

/** Same loader choice as GLTFLoader: decode off the main thread where the browser can. flipY stays false (glTF UVs). */
export function defaultTextureLoader(): TextureLoadFn {
  const useBitmap = typeof createImageBitmap !== 'undefined';
  const bitmapLoader = useBitmap ? new ImageBitmapLoader() : null;
  const imageLoader = useBitmap ? null : new TextureLoader();
  return (url) =>
    new Promise<Texture>((resolve, reject) => {
      if (bitmapLoader) {
        bitmapLoader.load(
          url,
          (bitmap) => {
            const t = new Texture(bitmap);
            t.needsUpdate = true;
            resolve(t);
          },
          undefined,
          reject,
        );
      } else {
        imageLoader!.load(url, resolve, undefined, reject);
      }
    });
}

export class MaterialRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly owned = new Set<Material>();
  private readonly loadTexture: TextureLoadFn;
  private readonly baseUrl: string;
  private readonly maxAnisotropy: number;
  private disposed = false;

  constructor(
    readonly definition: LibraryDef,
    opts: RegistryOptions,
  ) {
    this.baseUrl = opts.baseUrl;
    this.loadTexture = opts.loadTexture ?? defaultTextureLoader();
    this.maxAnisotropy = opts.maxAnisotropy ?? 4;
    for (const [name, def] of Object.entries(definition.materials)) {
      const entry: Entry = { def, plain: null as unknown as MeshStandardMaterial, vertexColor: null, textures: null, loading: null };
      entry.plain = this.make(name, entry, false);
      this.entries.set(name, entry);
    }
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** True for a material this registry created (either variant). */
  owns(material: Material): boolean {
    return this.owned.has(material);
  }

  /** True once the material's textures are on it (always true for materials without textures). */
  texturesLoaded(name: string): boolean {
    const e = this.entry(name);
    return !e.def.textures || e.textures !== null;
  }

  /** The shared material. vertexColors true returns the variant for meshes that carry COLOR_0. */
  get(name: string, vertexColors = false): MeshStandardMaterial {
    const e = this.entry(name);
    if (!vertexColors) return e.plain;
    e.vertexColor ??= this.make(name, e, true);
    return e.vertexColor;
  }

  /**
   * Loads the textures of the named materials (default: all), once. Concurrent and repeated calls share the
   * same requests. Until a material's textures arrive it shows its proxy constants; await this before applying
   * to avoid a visible pop and a shader recompile.
   */
  async loadTextures(names?: Iterable<string>): Promise<void> {
    const list = names ? [...names] : this.names();
    await Promise.all(list.map((n) => this.ensure(n)));
  }

  /** Disposes every shared material and texture. Only for tearing the whole app down. */
  dispose(): void {
    this.disposed = true;
    for (const e of this.entries.values()) {
      for (const t of Object.values(e.textures ?? {})) t.dispose();
      e.plain.dispose();
      e.vertexColor?.dispose();
    }
    this.owned.clear();
  }

  private entry(name: string): Entry {
    const e = this.entries.get(name);
    if (!e) throw new Error(`material library: unknown material "${name}"`);
    return e;
  }

  private make(name: string, entry: Entry, vertexColors: boolean): MeshStandardMaterial {
    const m = entry.def.type === 'physical' ? new MeshPhysicalMaterial() : new MeshStandardMaterial();
    m.name = name;
    m.side = FrontSide; // closed solids are single-sided (ADR-032 item 1)
    m.vertexColors = vertexColors;
    m.userData.wuLibrary = { name, vertexColors };
    this.configure(m, entry);
    this.owned.add(m);
    return m;
  }

  /** Puts the library definition (and, once loaded, its textures) onto one material. */
  private configure(m: MeshStandardMaterial, entry: Entry): void {
    const d = entry.def;
    const t = entry.textures;
    const interim = d.textures !== undefined && t === null; // textures still loading: show the proxy constants
    if (interim && d.proxy) {
      m.color.set(d.proxy.baseColor);
      m.roughness = d.proxy.roughness;
      m.metalness = d.proxy.metallic;
    } else {
      m.color.set(d.color);
      m.roughness = d.roughness;
      m.metalness = d.metalness;
    }
    m.map = t?.baseColor ?? null;
    m.normalMap = t?.normal ?? null;
    m.aoMap = m.roughnessMap = m.metalnessMap = t?.orm ?? null; // one ORM image feeds three slots
    const s = d.normalScale ?? 1;
    m.normalScale.set(s, s);
    if (d.sheen && m instanceof MeshPhysicalMaterial) {
      m.sheen = 1;
      m.sheenColor = new Color(d.sheen.color);
      m.sheenRoughness = d.sheen.roughness;
    }
    if (d.emissive) {
      m.emissive = new Color(d.emissive.color);
      m.emissiveIntensity = d.emissive.strength;
    }
    if (d.alpha) {
      m.transparent = true;
      m.opacity = d.alpha.opacity;
      m.depthWrite = false;
    }
    m.needsUpdate = true;
  }

  private ensure(name: string): Promise<void> {
    const e = this.entry(name);
    if (!e.def.textures) return Promise.resolve();
    e.loading ??= this.fetchTextures(e).catch((err: unknown) => {
      e.loading = null; // allow a retry
      throw err;
    });
    return e.loading;
  }

  private async fetchTextures(e: Entry): Promise<void> {
    const loaded: Partial<Record<TextureSlot, Texture>> = {};
    await Promise.all(
      TEXTURE_SLOTS.filter((slot) => e.def.textures?.[slot]).map(async (slot) => {
        const ref = e.def.textures![slot]!;
        const t = await this.loadTexture(new URL(ref.file, this.baseUrl).href);
        t.colorSpace = slot === 'baseColor' ? SRGBColorSpace : NoColorSpace;
        t.wrapS = t.wrapT = RepeatWrapping;
        t.flipY = false; // glTF UV convention, as GLTFLoader
        t.anisotropy = this.maxAnisotropy;
        t.name = ref.file;
        t.needsUpdate = true;
        loaded[slot] = t;
      }),
    );
    if (this.disposed) {
      for (const t of Object.values(loaded)) t.dispose();
      return;
    }
    e.textures = loaded;
    this.configure(e.plain, e);
    if (e.vertexColor) this.configure(e.vertexColor, e);
  }
}

/**
 * Walks a loaded GLB scene and replaces every Mat_* proxy by name with the shared material (the vertexColors
 * variant when the mesh geometry has COLOR_0), then disposes the GLB's own proxy materials. Materials whose name
 * is not in the library stay as they are and are listed in the report. Call it once per loaded GLB, before the
 * first clone (clones share materials). Not per frame.
 */
export function applyLibraryMaterials(root: Object3D, registry: MaterialRegistry): ApplyReport {
  const report: ApplyReport = { replaced: 0, byName: {}, alreadyLibrary: 0, unknown: [], disposedProxies: 0 };
  const unknown = new Set<string>();
  const proxies = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh !== true) return;
    const vc = mesh.geometry.hasAttribute('color');
    const swap = (m: Material): Material => {
      if (registry.owns(m)) {
        report.alreadyLibrary++;
        return m;
      }
      if (!registry.has(m.name)) {
        unknown.add(m.name);
        return m;
      }
      proxies.add(m);
      report.replaced++;
      report.byName[m.name] = (report.byName[m.name] ?? 0) + 1;
      return registry.get(m.name, vc);
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  for (const p of proxies) p.dispose();
  report.disposedProxies = proxies.size;
  report.unknown = [...unknown].sort();
  return report;
}

/** Fetches and validates library.json and builds the registry. The default URL is the one the build ships. */
export async function createMaterialRegistry(
  libraryUrl: string = `${import.meta.env.BASE_URL}assets/materials/library.json`,
  opts: Partial<RegistryOptions> = {},
): Promise<MaterialRegistry> {
  const res = await fetch(libraryUrl);
  if (!res.ok) throw new Error(`material library: ${libraryUrl} returned HTTP ${res.status}`);
  const def = parseLibrary(await res.json());
  const baseUrl = opts.baseUrl ?? new URL('.', new URL(libraryUrl, globalThis.location.href)).href;
  return new MaterialRegistry(def, { ...opts, baseUrl });
}
