import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from '@iwsdk/core';
import { applyLibraryMaterials, libraryGpuMiB, MaterialRegistry, parseLibrary, textureGpuMiB } from '../src/materials';

// @types/node is not installed (tsconfig lists no node types) but Vitest runs in Node: reach fs through a typed shim.
interface NodeFs {
  readFileSync(path: URL): Uint8Array<ArrayBuffer>;
  existsSync(path: URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const repoUrl = (p: string): URL => new URL(`../${p}`, import.meta.url);
const readJson = (p: string): unknown => JSON.parse(new TextDecoder().decode(fs.readFileSync(repoUrl(p))));
const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const MATERIALS_DIR = 'public/assets/materials';
const raw = readJson(`${MATERIALS_DIR}/library.json`);
const def = parseLibrary(raw);

/** Dotted-path edit of a parsed JSON value; value undefined deletes the key. */
function edit(json: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop() as string;
  let o = json as Record<string, unknown>;
  for (const k of keys) o = o[k] as Record<string, unknown>;
  if (value === undefined) delete o[last];
  else o[last] = value;
}
function read(json: unknown, path: string): unknown {
  return path.split('.').reduce((o, k) => (o as Record<string, unknown>)[k], json);
}
const BASE = 'http://test/assets/materials/';

function fakeLoader(fail = false) {
  const urls: string[] = [];
  const loadTexture = async (url: string): Promise<Texture> => {
    urls.push(url);
    if (fail) throw new Error(`404 ${url}`);
    return new Texture();
  };
  return { urls, loadTexture };
}
function makeRegistry(opts: { maxAnisotropy?: number; fail?: boolean } = {}) {
  const l = fakeLoader(opts.fail);
  const registry = new MaterialRegistry(def, { baseUrl: BASE, loadTexture: l.loadTexture, maxAnisotropy: opts.maxAnisotropy });
  return { registry, ...l };
}
function proxyMesh(name: string, withColor = false): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  if (withColor) g.setAttribute('color', new BufferAttribute(new Float32Array(12), 4));
  return new Mesh(g, new MeshStandardMaterial({ name }));
}
function disposals(target: { addEventListener: (t: 'dispose', f: () => void) => void }): { count: number } {
  const c = { count: 0 };
  target.addEventListener('dispose', () => c.count++);
  return c;
}

describe('library.json', () => {
  const names = Object.keys(def.materials);

  it('lists exactly the manifest material library, in order', () => {
    const manifest = readJson('assets/manifest/glb-manifest.json') as { meta: { materialLibrary: { name: string }[] } };
    expect(names).toEqual(manifest.meta.materialLibrary.map((m) => m.name));
  });

  it('keeps every texture a real file, at most 1024 px and a power of two, with matching bytes and sha256', async () => {
    for (const [name, m] of Object.entries(def.materials)) {
      for (const [slot, t] of Object.entries(m.textures ?? {})) {
        const where = `${name}.${slot}`;
        expect(t.size, where).toBeLessThanOrEqual(1024);
        expect(Math.log2(t.size) % 1, `${where} power of two`).toBe(0);
        const file = repoUrl(`${MATERIALS_DIR}/${t.file}`);
        expect(fs.existsSync(file), `${where} file ${t.file}`).toBe(true);
        const bytes = fs.readFileSync(file);
        expect(bytes.byteLength, `${where} bytes`).toBe(t.bytes);
        expect(await sha256(bytes), `${where} sha256`).toBe(t.sha256);
      }
    }
  });

  it('stays inside the 48 MiB library budget and reports it consistently', () => {
    const total = libraryGpuMiB(def);
    expect(total).toBeLessThanOrEqual(48);
    expect(def.budget?.totalMiB).toBeCloseTo(total, 2);
    for (const [name, m] of Object.entries(def.materials)) {
      const sum = Object.values(m.textures ?? {}).reduce((a, t) => a + textureGpuMiB(t.size), 0);
      expect(m.gpuMiB ?? 0, name).toBeCloseTo(sum, 2);
    }
    expect(textureGpuMiB(1024)).toBeCloseTo(5.333, 3);
  });

  it('allows physical, alpha and emissive only where ADR-032 does', () => {
    const physical = names.filter((n) => def.materials[n].type === 'physical');
    expect(physical).toEqual(['Mat_VelvetTeal']);
    expect(names.filter((n) => def.materials[n].sheen)).toEqual(['Mat_VelvetTeal']);
    expect(names.filter((n) => def.materials[n].alpha)).toEqual(['Mat_WarmGlass']);
    expect(names.filter((n) => def.materials[n].emissive)).toEqual(['Mat_WarmEmissive']);
    for (const n of ['Mat_WarmGlass', 'Mat_WarmEmissive']) expect(def.materials[n].textures, n).toBeUndefined();
  });

  it('uses the 0.1 m texel convention everywhere and a packed ORM on every textured material', () => {
    expect(def.uvUnitMetres).toBe(0.1);
    for (const [name, m] of Object.entries(def.materials)) {
      expect(m.tiling?.uvUnitMetres, name).toBe(0.1);
      if (m.textures) expect(Object.keys(m.textures).sort(), name).toEqual(['baseColor', 'normal', 'orm']);
    }
  });

  it('rejects malformed libraries with a path in the message', () => {
    const bad = (change: (j: unknown) => void): string => {
      const j = structuredClone(raw);
      change(j);
      try {
        parseLibrary(j);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    };
    const brass = 'materials.Mat_AgedBrass';
    expect(bad((j) => edit(j, 'schemaVersion', 2))).toContain('schemaVersion');
    expect(bad((j) => edit(j, `${brass}.color`, 'brass'))).toContain('materials.Mat_AgedBrass.color');
    expect(bad((j) => edit(j, `${brass}.roughness`, 2))).toContain('roughness');
    expect(bad((j) => edit(j, `${brass}.textures.height`, { file: 'x.png', size: 64 }))).toContain('unknown slot');
    expect(bad((j) => edit(j, `${brass}.textures.orm.file`, '../../secret.png'))).toContain('relative path');
    expect(bad((j) => edit(j, `${brass}.sheen`, { color: '#1F5C5C', roughness: 0.5 }))).toContain('physical');
    expect(bad((j) => edit(j, 'materials.Brass', read(j, brass)))).toContain('Mat_Name');
    expect(bad((j) => edit(j, `${brass}.type`, undefined))).toContain('type');
    expect(bad(() => undefined)).toBe(''); // the unmodified file is valid
  });
});

describe('MaterialRegistry names and variants', () => {
  it('resolves every library name to one shared material and throws on unknown names', () => {
    const { registry } = makeRegistry();
    for (const name of Object.keys(def.materials)) {
      expect(registry.has(name)).toBe(true);
      const m = registry.get(name);
      expect(m.name).toBe(name);
      expect(registry.get(name)).toBe(m);
      expect(registry.owns(m)).toBe(true);
    }
    expect(registry.has('Mat_Nope')).toBe(false);
    expect(registry.has('Mat_AgedBrass.001')).toBe(false);
    expect(() => registry.get('Mat_Nope')).toThrow(/unknown material "Mat_Nope"/);
  });

  it('builds sheen only as MeshPhysicalMaterial, emissive and alpha from the definition', () => {
    const { registry } = makeRegistry();
    const velvet = registry.get('Mat_VelvetTeal');
    expect(velvet).toBeInstanceOf(MeshPhysicalMaterial);
    expect((velvet as MeshPhysicalMaterial).sheen).toBe(1);
    expect(registry.get('Mat_AgedBrass')).not.toBeInstanceOf(MeshPhysicalMaterial);
    const lamp = registry.get('Mat_WarmEmissive');
    expect(lamp.emissiveIntensity).toBe(def.materials.Mat_WarmEmissive.emissive?.strength);
    expect(lamp.emissive.getHexString()).toBe('ffc66d');
    const glass = registry.get('Mat_WarmGlass');
    expect([glass.transparent, glass.depthWrite, glass.opacity]).toEqual([true, false, def.materials.Mat_WarmGlass.alpha?.opacity]);
    for (const name of Object.keys(def.materials)) expect(registry.get(name).side, name).toBe(0); // FrontSide
  });

  it('gives a vertexColors variant that keeps the name and shares the textures', async () => {
    const { registry } = makeRegistry();
    const plain = registry.get('Mat_Walnut');
    const vc = registry.get('Mat_Walnut', true);
    expect(vc).not.toBe(plain);
    expect(registry.get('Mat_Walnut', true)).toBe(vc);
    expect([plain.vertexColors, vc.vertexColors]).toEqual([false, true]);
    expect(vc.name).toBe('Mat_Walnut');
    expect(registry.owns(vc)).toBe(true);
    await registry.loadTextures(['Mat_Walnut']);
    expect(vc.map).not.toBeNull();
    expect(vc.map).toBe(plain.map);
    expect(vc.roughnessMap).toBe(plain.roughnessMap);
    const late = registry.get('Mat_AgedBrass', true); // variant created after the textures arrived
    await registry.loadTextures(['Mat_AgedBrass']);
    expect(late.map).toBe(registry.get('Mat_AgedBrass').map);
    const after = registry.get('Mat_Walnut', true);
    expect(after.normalMap).toBe(registry.get('Mat_Walnut').normalMap);
  });
});

describe('MaterialRegistry textures', () => {
  it('shows the proxy constants until the textures arrive, then the library factors and maps', async () => {
    const { registry } = makeRegistry();
    const brass = registry.get('Mat_AgedBrass');
    const proxy = def.materials.Mat_AgedBrass.proxy!;
    expect(registry.texturesLoaded('Mat_AgedBrass')).toBe(false);
    expect(brass.map).toBeNull();
    expect(`#${brass.color.getHexString().toUpperCase()}`).toBe(proxy.baseColor);
    expect([brass.roughness, brass.metalness]).toEqual([proxy.roughness, proxy.metallic]);
    await registry.loadTextures(['Mat_AgedBrass']);
    expect(registry.texturesLoaded('Mat_AgedBrass')).toBe(true);
    expect(brass.color.getHexString()).toBe('ffffff');
    expect([brass.roughness, brass.metalness]).toEqual([1, 1]);
    expect(brass.map).not.toBeNull();
    expect(brass.normalMap).not.toBeNull();
    expect(brass.aoMap).toBe(brass.roughnessMap);
    expect(brass.aoMap).toBe(brass.metalnessMap);
    expect(registry.texturesLoaded('Mat_WarmGlass')).toBe(true); // constants only
  });

  it('sets colour space, repeat wrapping, flipY and a capped anisotropy', async () => {
    const { registry } = makeRegistry({ maxAnisotropy: 2 });
    await registry.loadTextures(['Mat_Stone']);
    const m = registry.get('Mat_Stone');
    expect(m.map!.colorSpace).toBe(SRGBColorSpace);
    expect(m.aoMap!.colorSpace).toBe(NoColorSpace);
    expect(m.normalMap!.colorSpace).toBe(NoColorSpace);
    for (const t of [m.map!, m.aoMap!, m.normalMap!]) {
      expect([t.wrapS, t.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
      expect(t.flipY).toBe(false);
      expect(t.anisotropy).toBe(2);
    }
    const d = makeRegistry(); // default cap
    await d.registry.loadTextures(['Mat_Stone']);
    expect(d.registry.get('Mat_Stone').map!.anisotropy).toBe(4);
  });

  it('loads each file once, only for the requested names, relative to the library folder', async () => {
    const { registry, urls } = makeRegistry();
    await Promise.all([registry.loadTextures(['Mat_Walnut']), registry.loadTextures(['Mat_Walnut', 'Mat_WarmGlass'])]);
    await registry.loadTextures(['Mat_Walnut']);
    expect(urls.sort()).toEqual(
      Object.values(def.materials.Mat_Walnut.textures!)
        .map((t) => `${BASE}${t.file}`)
        .sort(),
    );
    await registry.loadTextures();
    const files = Object.values(def.materials).flatMap((m) => Object.values(m.textures ?? {}).map((t) => `${BASE}${t.file}`));
    expect(urls.length).toBe(files.length);
    expect(new Set(urls).size).toBe(files.length);
  });

  it('reports a failed load and allows a retry', async () => {
    const failing = makeRegistry({ fail: true });
    await expect(failing.registry.loadTextures(['Mat_Fabric'])).rejects.toThrow(/404/);
    expect(failing.registry.texturesLoaded('Mat_Fabric')).toBe(false);
    expect(failing.registry.get('Mat_Fabric').map).toBeNull();
    await expect(failing.registry.loadTextures(['Mat_Fabric'])).rejects.toThrow(/404/);
    expect(failing.urls.length).toBeGreaterThan(3); // retried, not cached as success
    await expect(failing.registry.loadTextures(['Mat_Nope'])).rejects.toThrow(/unknown material/);
  });

  it('disposes its materials and textures on dispose()', async () => {
    const { registry } = makeRegistry();
    await registry.loadTextures(['Mat_Ceramic']);
    const m = registry.get('Mat_Ceramic');
    const vc = registry.get('Mat_Ceramic', true);
    const counts = [disposals(m), disposals(vc), disposals(m.map!), disposals(m.aoMap!), disposals(m.normalMap!)];
    registry.dispose();
    expect(counts.map((c) => c.count)).toEqual([1, 1, 1, 1, 1]);
    expect(registry.owns(m)).toBe(false);
  });
});

describe('applyLibraryMaterials', () => {
  it('replaces proxies by name, picks the vertexColors variant by COLOR_0, and disposes the proxies', () => {
    const { registry } = makeRegistry();
    const root = new Group();
    const a = proxyMesh('Mat_AgedBrass', true);
    const b = proxyMesh('Mat_AgedBrass', false);
    const c = proxyMesh('Mat_Walnut', true);
    const nested = new Group();
    nested.add(c);
    root.add(a, b, nested);
    const shared = new MeshStandardMaterial({ name: 'Mat_Stone' });
    const d = proxyMesh('x');
    const e = proxyMesh('x', true);
    d.material = e.material = shared; // one proxy used by two meshes
    root.add(d, e);
    const brassProxy = a.material as MeshStandardMaterial;
    const counts = [disposals(brassProxy), disposals(shared)];

    const report = applyLibraryMaterials(root, registry);

    expect(a.material).toBe(registry.get('Mat_AgedBrass', true));
    expect(b.material).toBe(registry.get('Mat_AgedBrass'));
    expect(c.material).toBe(registry.get('Mat_Walnut', true));
    expect(d.material).toBe(registry.get('Mat_Stone'));
    expect(e.material).toBe(registry.get('Mat_Stone', true));
    expect(report).toEqual({
      replaced: 5,
      byName: { Mat_AgedBrass: 2, Mat_Walnut: 1, Mat_Stone: 2 },
      alreadyLibrary: 0,
      unknown: [],
      disposedProxies: 4,
    });
    expect(counts.map((x) => x.count)).toEqual([1, 1]); // the shared proxy is disposed once
  });

  it('reports unknown and unnamed materials and leaves them alone', () => {
    const { registry } = makeRegistry();
    const root = new Group();
    const odd = proxyMesh('Material.001');
    const dup = proxyMesh('Mat_AgedBrass.001');
    const unnamed = proxyMesh('');
    const known = proxyMesh('Mat_Fabric');
    root.add(odd, dup, unnamed, known);
    const before = [odd.material, dup.material, unnamed.material];
    const report = applyLibraryMaterials(root, registry);
    expect([odd.material, dup.material, unnamed.material]).toEqual(before);
    expect(report.unknown).toEqual(['', 'Mat_AgedBrass.001', 'Material.001']);
    expect(report.replaced).toBe(1);
    expect(report.disposedProxies).toBe(1);
  });

  it('handles material arrays and ignores non-mesh objects', () => {
    const { registry } = makeRegistry();
    const mesh = proxyMesh('Mat_Walnut');
    const keep = new MeshStandardMaterial({ name: 'Other' });
    mesh.material = [new MeshStandardMaterial({ name: 'Mat_Walnut' }), keep, new MeshStandardMaterial({ name: 'Mat_VelvetTeal' })];
    const root = new Group();
    root.add(mesh, new Group());
    const report = applyLibraryMaterials(root, registry);
    const mats = mesh.material as MeshStandardMaterial[];
    expect(mats[0]).toBe(registry.get('Mat_Walnut'));
    expect(mats[1]).toBe(keep);
    expect(mats[2]).toBe(registry.get('Mat_VelvetTeal'));
    expect(report.replaced).toBe(2);
    expect(report.unknown).toEqual(['Other']);
  });

  it('is idempotent: a second apply changes and disposes nothing, and clones keep the shared material', () => {
    const { registry } = makeRegistry();
    const root = new Group();
    root.add(proxyMesh('Mat_CreamPaper'), proxyMesh('Mat_Ceramic', true));
    applyLibraryMaterials(root, registry);
    const second = applyLibraryMaterials(root, registry);
    expect(second).toEqual({ replaced: 0, byName: {}, alreadyLibrary: 2, unknown: [], disposedProxies: 0 });
    const copy = root.clone();
    expect((copy.children[0] as Mesh).material).toBe(registry.get('Mat_CreamPaper'));
  });
});
