// Shape and validation of public/assets/materials/library.json (written by blender/scripts/make_library_textures.py).
// Pure data and checks: no three.js, no browser APIs, so it runs in Node tests.
// Conventions: hex strings are sRGB; one texture tile covers uvUnitMetres (0.1 m); ADR-032 / ADR-034.

export const TEXTURE_SLOTS = ['baseColor', 'orm', 'normal'] as const;
export type TextureSlot = (typeof TEXTURE_SLOTS)[number];

export interface TextureRef {
  /** Path relative to library.json. */
  file: string;
  /** Width and height in px (square). */
  size: number;
  bytes?: number;
  sha256?: string;
}

export interface LibraryMaterialDef {
  /** 'physical' exists for the velvet sheen only (ADR-032 item 6). */
  type: 'standard' | 'physical';
  /** Factor multiplied into the base colour map. White when a map carries the colour. */
  color: string;
  /** Factors multiplied into the ORM channels; 1 when the ORM map carries the values. */
  roughness: number;
  metalness: number;
  normalScale?: number;
  /** ORM = occlusion R, roughness G, metallic B. Normal maps are OpenGL (+Y up). */
  textures?: Partial<Record<TextureSlot, TextureRef>>;
  tiling?: { uvUnitMetres: number; repeat: [number, number] };
  sheen?: { color: string; roughness: number };
  /** strength is KHR_materials_emissive_strength, three.js emissiveIntensity. */
  emissive?: { color: string; strength: number };
  /** Plain alpha blending. Transmission and volume are forbidden (extra render pass). */
  alpha?: { opacity: number };
  /** Constants for the Blender proxy material of the same name; also the look until the textures have loaded. */
  proxy?: { baseColor: string; metallic: number; roughness: number };
  gpuMiB?: number;
}

export interface LibraryDef {
  schemaVersion: 1;
  uvUnitMetres: number;
  budget?: { limitMiB: number; totalMiB: number; maxPx: number };
  materials: Record<string, LibraryMaterialDef>;
}

/** GPU memory of one square image after decode, with its mip chain (validator V33): w * h * 4 * 4/3. */
export function textureGpuMiB(size: number): number {
  return (size * size * 4 * (4 / 3)) / (1024 * 1024);
}

/** GPU memory of every texture of the library, each image once. */
export function libraryGpuMiB(def: LibraryDef): number {
  let total = 0;
  for (const m of Object.values(def.materials)) {
    for (const t of Object.values(m.textures ?? {})) total += textureGpuMiB(t.size);
  }
  return total;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;
const NAME = /^Mat_[A-Za-z0-9]+$/;

function fail(path: string, msg: string): never {
  throw new Error(`material library: ${path}: ${msg}`);
}
function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Record<string, unknown>;
}
function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `expected a number in [${min}, ${max}], got ${String(v)}`);
  return v;
}
function hex(v: unknown, path: string): string {
  if (typeof v !== 'string' || !HEX.test(v)) fail(path, `expected #RRGGBB, got ${JSON.stringify(v)}`);
  return v;
}

function parseTexture(v: unknown, path: string): TextureRef {
  const o = obj(v, path);
  const file = o.file;
  if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.includes('..') || file.includes('\\')) {
    fail(`${path}.file`, `expected a relative path inside the library folder, got ${JSON.stringify(file)}`);
  }
  const size = num(o.size, `${path}.size`, 1);
  if (!Number.isInteger(size)) fail(`${path}.size`, 'expected an integer');
  const ref: TextureRef = { file, size };
  if (o.bytes !== undefined) ref.bytes = num(o.bytes, `${path}.bytes`, 0);
  if (o.sha256 !== undefined) {
    if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.sha256)) fail(`${path}.sha256`, 'expected 64 hex characters');
    ref.sha256 = o.sha256;
  }
  return ref;
}

function parseMaterial(v: unknown, path: string): LibraryMaterialDef {
  const o = obj(v, path);
  if (o.type !== 'standard' && o.type !== 'physical') fail(`${path}.type`, `expected "standard" or "physical", got ${JSON.stringify(o.type)}`);
  const def: LibraryMaterialDef = {
    type: o.type,
    color: hex(o.color, `${path}.color`),
    roughness: num(o.roughness, `${path}.roughness`, 0, 1),
    metalness: num(o.metalness, `${path}.metalness`, 0, 1),
  };
  if (o.normalScale !== undefined) def.normalScale = num(o.normalScale, `${path}.normalScale`, 0);
  if (o.textures !== undefined) {
    const t = obj(o.textures, `${path}.textures`);
    const out: Partial<Record<TextureSlot, TextureRef>> = {};
    for (const key of Object.keys(t)) {
      if (!(TEXTURE_SLOTS as readonly string[]).includes(key)) fail(`${path}.textures.${key}`, `unknown slot, expected one of ${TEXTURE_SLOTS.join(', ')}`);
      out[key as TextureSlot] = parseTexture(t[key], `${path}.textures.${key}`);
    }
    if (Object.keys(out).length === 0) fail(`${path}.textures`, 'present but empty');
    def.textures = out;
  }
  if (o.tiling !== undefined) {
    const t = obj(o.tiling, `${path}.tiling`);
    const r = t.repeat;
    if (!Array.isArray(r) || r.length !== 2) fail(`${path}.tiling.repeat`, 'expected [x, y]');
    def.tiling = {
      uvUnitMetres: num(t.uvUnitMetres, `${path}.tiling.uvUnitMetres`, 1e-6),
      repeat: [num(r[0], `${path}.tiling.repeat[0]`, 1e-6), num(r[1], `${path}.tiling.repeat[1]`, 1e-6)],
    };
  }
  if (o.sheen !== undefined) {
    if (o.type !== 'physical') fail(`${path}.sheen`, 'sheen needs type "physical"');
    const s = obj(o.sheen, `${path}.sheen`);
    def.sheen = { color: hex(s.color, `${path}.sheen.color`), roughness: num(s.roughness, `${path}.sheen.roughness`, 0, 1) };
  }
  if (o.emissive !== undefined) {
    const e = obj(o.emissive, `${path}.emissive`);
    def.emissive = { color: hex(e.color, `${path}.emissive.color`), strength: num(e.strength, `${path}.emissive.strength`, 0) };
  }
  if (o.alpha !== undefined) {
    const a = obj(o.alpha, `${path}.alpha`);
    def.alpha = { opacity: num(a.opacity, `${path}.alpha.opacity`, 0, 1) };
  }
  if (o.proxy !== undefined) {
    const p = obj(o.proxy, `${path}.proxy`);
    def.proxy = {
      baseColor: hex(p.baseColor, `${path}.proxy.baseColor`),
      metallic: num(p.metallic, `${path}.proxy.metallic`, 0, 1),
      roughness: num(p.roughness, `${path}.proxy.roughness`, 0, 1),
    };
  }
  if (o.gpuMiB !== undefined) def.gpuMiB = num(o.gpuMiB, `${path}.gpuMiB`, 0);
  return def;
}

/** Validates parsed library.json and returns it typed. Throws an Error that names the offending path. */
export function parseLibrary(json: unknown): LibraryDef {
  const o = obj(json, '$');
  if (o.schemaVersion !== 1) fail('schemaVersion', `expected 1, got ${String(o.schemaVersion)}`);
  const mats = obj(o.materials, 'materials');
  const names = Object.keys(mats);
  if (names.length === 0) fail('materials', 'empty');
  const materials: Record<string, LibraryMaterialDef> = {};
  for (const name of names) {
    if (!NAME.test(name)) fail(`materials.${name}`, 'name must look like Mat_Name');
    materials[name] = parseMaterial(mats[name], `materials.${name}`);
  }
  const def: LibraryDef = { schemaVersion: 1, uvUnitMetres: num(o.uvUnitMetres, 'uvUnitMetres', 1e-6), materials };
  if (o.budget !== undefined) {
    const b = obj(o.budget, 'budget');
    def.budget = {
      limitMiB: num(b.limitMiB, 'budget.limitMiB', 0),
      totalMiB: num(b.totalMiB, 'budget.totalMiB', 0),
      maxPx: num(b.maxPx, 'budget.maxPx', 1),
    };
  }
  return def;
}
