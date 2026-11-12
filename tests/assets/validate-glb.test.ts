import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crossChecks, validateGlb, type GlbResult, type ManifestEntry } from '../../tools/lib/glb-validate.mjs';

// The GLB validator (tools/validate-glb.mjs, ADR-037): a clean synthetic GLB passes; defects seeded into copies of it, written to a
// temp folder, are each caught. The synthetic part is a 40 x 40 x 10 mm box shaped like a library gear part: one mesh, a COL_Grab
// sphere, Mat_AgedBrass as constants only, COLOR_0, metric UVs (1 UV unit = 0.1 m), the wu root metadata.
// No @types/node here (tsconfig lists only the IWSDK client types), so Node modules come through a typed dynamic import.

interface Fs {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, data: Uint8Array | string): void;
  rmSync(path: string, opts: { recursive: boolean; force: boolean }): void;
}
interface Spawned { status: number | null; stdout: string; stderr: string }
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;
const proc = (globalThis as unknown as { process: { execPath: string; cwd(): string } }).process;

interface Gltf {
  extensionsUsed?: string[];
  images?: object[];
  textures?: object[];
  buffers: { byteLength: number }[];
  bufferViews: { buffer: number; byteOffset: number; byteLength: number }[];
  scenes: { nodes: number[] }[];
  materials: { name: string; alphaMode?: string; doubleSided?: boolean; pbrMetallicRoughness: Record<string, unknown> }[];
  nodes: { name: string; translation?: number[]; scale?: number[]; extras?: { wu: Record<string, unknown> } }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  accessors: { min?: number[]; max?: number[]; count: number }[];
  [key: string]: unknown;
}

// ---- a tiny GLB writer and reader ---------------------------------------------------------------------------------
const pad4 = (n: number) => (4 - (n % 4)) % 4;
function writeGlb(json: object, bin: Uint8Array): Uint8Array {
  const j = new TextEncoder().encode(JSON.stringify(json));
  const jChunk = new Uint8Array(j.length + pad4(j.length)).fill(0x20);
  jChunk.set(j);
  const bChunk = new Uint8Array(bin.length + pad4(bin.length));
  bChunk.set(bin);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jChunk.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jChunk, 20);
  const o = 20 + jChunk.length;
  dv.setUint32(o, bChunk.length, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bChunk, o + 8);
  return out;
}
function readGlb(glb: Uint8Array): { json: Gltf; bin: Uint8Array } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jLen))) as Gltf;
  const bLen = dv.getUint32(20 + jLen, true);
  return { json, bin: glb.slice(28 + jLen, 28 + jLen + bLen) };
}

/** 40 x 40 x 10 mm box, origin at its centre, 24 vertices, 12 triangles. */
function cleanGlb(): Uint8Array {
  const half = [0.02, 0.02, 0.005];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const t1 = s > 0 ? (a + 1) % 3 : (a + 2) % 3, t2 = s > 0 ? (a + 2) % 3 : (a + 1) % 3; // t1 x t2 = outward normal
    const base = pos.length / 3;
    for (const [c1, c2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[a] = s * half[a]; p[t1] = c1 * half[t1]; p[t2] = c2 * half[t2];
      pos.push(...p);
      const n = [0, 0, 0]; n[a] = s; nor.push(...n);
      uv.push(p[t1] / 0.1, p[t2] / 0.1); // metric UVs: 10 UV per metre
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const f32 = (v: number[]) => new Uint8Array(new Float32Array(v).buffer);
  const parts = [f32(pos), f32(nor), f32(uv), f32(Array.from({ length: 24 * 4 }, () => 1)), new Uint8Array(new Uint16Array(idx).buffer)];
  const bin = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  const views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  let off = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: off, byteLength: p.length }); bin.set(p, off); off += p.length; }
  const json = {
    asset: { version: '2.0', generator: 'Khronos glTF Blender I/O v-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'SynthPart', mesh: 0, children: [1], extras: { wu: { id: 'synth_part', family: 'spur_gear' } } },
      { name: 'COL_Grab', scale: [0.02, 0.02, 0.02], extras: { wu: { type: 'collider', shape: 'sphere', purpose: 'grab' } } },
    ],
    meshes: [{ name: 'SynthPart', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }] }],
    materials: [{ name: 'Mat_AgedBrass', pbrMetallicRoughness: { baseColorFactor: [0.423, 0.223, 0.033, 1], metallicFactor: 0.85, roughnessFactor: 0.45 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.02, -0.02, -0.005], max: [0.02, 0.02, 0.005] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' },
      { bufferView: 3, componentType: 5126, count: 24, type: 'VEC4' },
      { bufferView: 4, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };
  return writeGlb(json, bin);
}

/** The clean part with one embedded PNG (header only: the validator reads size and format from it) on its material. */
function withImage(glb: Uint8Array, w: number, h: number): Uint8Array {
  const { json, bin } = readGlb(glb);
  const png = new Uint8Array(33), dv = new DataView(png.buffer);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  dv.setUint32(8, 13); png.set([0x49, 0x48, 0x44, 0x52], 12); dv.setUint32(16, w); dv.setUint32(20, h); png[24] = 8; png[25] = 6;
  const out = new Uint8Array(bin.length + png.length);
  out.set(bin); out.set(png, bin.length);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: png.length });
  json.buffers[0].byteLength = out.length;
  json.images = [{ bufferView: json.bufferViews.length - 1, mimeType: 'image/png' }];
  json.textures = [{ source: 0 }];
  json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  return writeGlb(json, out);
}

const LIBRARY = ['Mat_AgedBrass', 'Mat_Walnut', 'Mat_VelvetTeal', 'Mat_PolishedBrass'];
const entryFor = (id: string, over: Record<string, unknown> = {}): ManifestEntry => ({
  id, filename: `${id}.glb`, category: 'gear', classification: 'G0-required', status: 'EXPORTED',
  glbPath: `public/assets/models/shared/spur_gear/${id}.glb`,
  meshes: ['SynthPart'], materials: ['Mat_AgedBrass'], animations: [],
  runtimeMotion: 'Rotates about local +Z', colliders: ['COL_Grab (sphere, radius >= 0.012 m)'],
  approxDimensionsM: [0.04, 0.04, 0.01], dimensionsBasis: 'measured',
  budgets: { triangles: 4000, primitives: 2, materials: 2, textureMiB: 0, glbKB: 250, basis: 'test' },
  usedBy: ['test'], dependencies: [], ...over,
});
const ENTRY = entryFor('synth_part');
const ctx = { materialLibrary: LIBRARY };

/** Defects seeded one at a time into a copy of the clean GLB. `entry` overrides the manifest side when the defect lives there. */
const DEFECTS: { name: string; expect: string; mutate?: (j: Gltf) => void; entry?: Record<string, unknown> }[] = [
  { name: 'draco', expect: 'V06', mutate: (j) => { j.extensionsUsed = ['KHR_draco_mesh_compression']; } },
  { name: 'meshopt', expect: 'V06', mutate: (j) => { j.extensionsUsed = ['EXT_meshopt_compression']; } },
  { name: 'external-image', expect: 'V05', mutate: (j) => { j.images = [{ uri: 'brass.png' }]; } },
  { name: 'wrong-material-name', expect: 'V30', mutate: (j) => { j.materials[0].name = 'Brass_Final2'; } },
  { name: 'unapplied-transform', expect: 'V23', mutate: (j) => { j.nodes[0].translation = [0.01, 0, 0]; } },
  { name: 'missing-color0', expect: 'V29', mutate: (j) => { delete j.meshes[0].primitives[0].attributes.COLOR_0; } },
  { name: 'collider-too-small', expect: 'V61', mutate: (j) => { j.nodes[1].scale = [0.005, 0.005, 0.005]; } },
  { name: 'missing-uv', expect: 'V35', mutate: (j) => { delete j.meshes[0].primitives[0].attributes.TEXCOORD_0; } },
  { name: 'lying-position-max', expect: 'V04', mutate: (j) => { j.accessors[0].max = [0.03, 0.02, 0.005]; } },
  { name: 'alpha-blend', expect: 'V31', mutate: (j) => { j.materials[0].alphaMode = 'BLEND'; } },
  { name: 'double-sided', expect: 'V31', mutate: (j) => { j.materials[0].doubleSided = true; } },
  { name: 'root-id-mismatch', expect: 'V27', mutate: (j) => { j.nodes[0].extras = { wu: { id: 'other_part', family: 'spur_gear' } }; } },
  { name: 'collider-wrong-type', expect: 'V28', mutate: (j) => { j.nodes[1].extras = { wu: { type: 'socket', accepts: ['x'] } }; } },
  { name: 'declared-size-wrong', expect: 'V21', entry: { approxDimensionsM: [0.05, 0.04, 0.01] } },
  { name: 'over-triangle-budget', expect: 'V50', entry: { budgets: { triangles: 10, primitives: 2, materials: 2, textureMiB: 0, glbKB: 250, basis: 'test' } } },
];

let fs: Fs, tmp: string, join: (...p: string[]) => string, run: (cmd: string, args: string[]) => Spawned;
let clean: Uint8Array;
const sep = '/';

beforeAll(async () => {
  fs = await nodeModule<Fs>('node:fs');
  const os = await nodeModule<{ tmpdir(): string }>('node:os');
  const path = await nodeModule<{ join(...p: string[]): string }>('node:path');
  const cp = await nodeModule<{ spawnSync(cmd: string, args: string[], o: { encoding: 'utf8' }): Spawned }>('node:child_process');
  join = (...p) => path.join(...p).split('\\').join(sep);
  run = (cmd, args) => cp.spawnSync(cmd, args, { encoding: 'utf8' });
  tmp = fs.mkdtempSync(join(os.tmpdir(), 'wu-glb-'));
  clean = cleanGlb();
  fs.writeFileSync(join(tmp, 'clean.glb'), clean);
  for (const d of DEFECTS) {
    if (!d.mutate) { fs.writeFileSync(join(tmp, `${d.name}.glb`), clean); continue; }
    const { json, bin } = readGlb(fs.readFileSync(join(tmp, 'clean.glb')));
    d.mutate(json);
    fs.writeFileSync(join(tmp, `${d.name}.glb`), writeGlb(json, bin));
  }
});
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const failIds = (r: GlbResult) => r.findings.filter((f) => f.level === 'FAIL').map((f) => f.id);
const validateFile = (name: string, entry: ManifestEntry = ENTRY) => validateGlb(fs.readFileSync(join(tmp, `${name}.glb`)), entry, { ...ctx, file: `${name}.glb` });

describe('clean synthetic GLB', () => {
  it('passes every check with no FAIL and no WARN', async () => {
    const r = await validateFile('clean');
    expect(r.findings, JSON.stringify(r.findings)).toEqual([]);
    expect(r.verdict).toBe('PASS');
    // the loader round trip, the budget and the box checks really ran
    expect(r.passed).toEqual(expect.arrayContaining(['V01', 'V21', 'V22', 'V23', 'V27', 'V28', 'V29', 'V30', 'V34', 'V50', 'V61', 'V70']));
    expect(r.metrics.triangles).toBe(12);
  });

  it('reports the SHA-256 and byte size of the file', async () => {
    const r = await validateFile('clean');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(clean)));
    expect(r.sha256).toBe([...digest].map((b) => b.toString(16).padStart(2, '0')).join(''));
    expect(r.bytes).toBe(clean.length);
  });

  it('reports the real box and the metric UV density', async () => {
    const r = await validateFile('clean');
    expect(r.metrics.bboxM).toMatchObject({ size: [0.04, 0.04, 0.01] });
    expect(r.metrics.uvPerMetre).toBeCloseTo(10, 1);
  });
});

describe('seeded defects are caught', () => {
  for (const d of DEFECTS) {
    it(`${d.name} -> FAIL ${d.expect}`, async () => {
      const r = await validateFile(d.name, d.entry ? entryFor('synth_part', d.entry) : ENTRY);
      expect(r.verdict).toBe('FAIL');
      expect(failIds(r)).toContain(d.expect);
    });
  }

  it('a GLB that is not a GLB fails V01 instead of throwing', async () => {
    const r = await validateGlb(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]), ENTRY, ctx);
    expect(r.verdict).toBe('FAIL');
    expect(failIds(r)).toContain('V01');
  });

  it('a missing COLOR_0 is a WARN when the caller asks for it (V29 staging)', async () => {
    const r = await validateGlb(fs.readFileSync(join(tmp, 'missing-color0.glb')), ENTRY, { ...ctx, color0Severity: 'WARN' });
    expect(failIds(r)).not.toContain('V29');
    expect(r.findings.some((f) => f.id === 'V29' && f.level === 'WARN')).toBe(true);
  });
});

describe('embedded images (hero textures)', () => {
  const hero = (over: Record<string, unknown> = {}) => entryFor('synth_part', { tiledMaterials: ['Mat_AgedBrass'], budgets: { triangles: 4000, primitives: 2, materials: 2, textureMiB: 1, glbKB: 250, basis: 'test' }, ...over });
  const run1 = (glb: Uint8Array, entry: ManifestEntry) => validateGlb(glb, entry, ctx);

  it('rejects any image on a library part whose texture budget is 0 (V32)', async () => {
    const r = await run1(withImage(clean, 4, 4), ENTRY);
    expect(failIds(r)).toContain('V32');
  });

  it('accepts a power-of-two image inside a hero texture budget and counts its memory (V33)', async () => {
    const r = await run1(withImage(clean, 4, 4), hero());
    expect(r.findings, JSON.stringify(r.findings)).toEqual([]);
    expect(r.metrics.imageHashes).toHaveLength(1);
    expect(r.metrics.textureMiB).toBeCloseTo((4 * 4 * 4 * 4) / 3 / 1048576, 6);
  });

  it('rejects a non-power-of-two image, an oversize image and a hero over its texture budget', async () => {
    expect(failIds(await run1(withImage(clean, 5, 5), hero()))).toContain('V32');
    expect(failIds(await run1(withImage(clean, 2048, 2048), hero()))).toContain('V32');
    expect(failIds(await run1(withImage(clean, 1024, 1024), hero()))).toContain('V50'); // 5.33 MiB with mips against 1 MiB
  });

  it('warns when the same embedded image is in two GLBs (X03)', async () => {
    const glb = withImage(clean, 4, 4), a = hero(), b = hero({ id: 'synth_twin' });
    const x = crossChecks([await run1(glb, a), await run1(glb, b)], { assets: [a, b] });
    expect(x.findings.some((f) => f.id === 'X03' && f.level === 'WARN')).toBe(true);
  });
});

describe('cross-manifest checks', () => {
  it('flags identical geometry under two ids (X01) and honours variantOf for near duplicates (X02)', async () => {
    const a = entryFor('synth_part'), b = entryFor('synth_twin');
    const ra = await validateFile('clean', a), rb = await validateFile('clean', b);
    const x = crossChecks([ra, rb], { assets: [a, b] });
    expect(x.findings.filter((f) => f.level === 'FAIL').map((f) => f.id)).toEqual(['X01']);
    expect(x.uniqueGeometryByLabel).toEqual({ 'G0-required': 1 });
  });

  it('flags a GLB under public/assets/models that no entry owns (X04) and duplicate ids (X07)', () => {
    const a = entryFor('synth_part');
    fs.mkdirSync(join(tmp, 'public/assets/models/shared/spur_gear'), { recursive: true });
    fs.writeFileSync(join(tmp, 'public/assets/models/shared/spur_gear/synth_part.glb'), clean);
    fs.writeFileSync(join(tmp, 'public/assets/models/shared/spur_gear/orphan.glb'), clean);
    const x = crossChecks([], { assets: [a, { ...a }] }, { root: tmp, manifestWide: true });
    const msgs = x.findings.filter((f) => f.level === 'FAIL').map((f) => `${f.id} ${f.msg}`);
    expect(msgs.some((m) => m.startsWith('X04') && m.includes('orphan.glb'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('X07') && m.includes('synth_part'))).toBe(true);
    expect(msgs.some((m) => m.includes('shared/spur_gear/synth_part.glb is on disk'))).toBe(false);
  });
});

describe('command line', () => {
  const manifest = (over: Record<string, unknown> = {}) => JSON.stringify({ meta: { materialLibrary: LIBRARY.map((name) => ({ name })) }, assets: [entryFor('synth_part', over)] });
  const cli = (root: string, ...extra: string[]) => run(proc.execPath, [join(proc.cwd(), 'tools/validate-glb.mjs'), '--root', root, '--manifest', join(root, 'manifest.json'), ...extra]);
  const place = (root: string, glb: string, over: Record<string, unknown> = {}) => {
    fs.mkdirSync(join(root, 'public/assets/models/shared/spur_gear'), { recursive: true });
    fs.writeFileSync(join(root, 'public/assets/models/shared/spur_gear/synth_part.glb'), fs.readFileSync(join(tmp, `${glb}.glb`)));
    fs.writeFileSync(join(root, 'manifest.json'), manifest(over));
  };

  it('exits 0 on the clean GLB and prints the hash, the size and the PASS lines', () => {
    const root = join(tmp, 'cli-clean');
    place(root, 'clean');
    const r = cli(root);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('RESULT: PASS');
    expect(r.stdout).toMatch(/sha256 [0-9a-f]{64}/);
    expect(r.stdout).toMatch(/PASS V01 /);
  });

  it('exits 1 on a seeded GLB and names the check', () => {
    const root = join(tmp, 'cli-draco');
    place(root, 'draco');
    const r = cli(root);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FAIL V06 /);
    expect(r.stdout).toContain('RESULT: FAIL');
  });

  it('--report-only exits 0 and --json is parseable; --only and --file select', () => {
    const root = join(tmp, 'cli-json');
    place(root, 'collider-too-small');
    expect(cli(root, '--report-only').status).toBe(0);
    const j = cli(root, '--json', '--only', 'synth_part');
    expect(j.status).toBe(1);
    const parsed = JSON.parse(j.stdout) as { results: GlbResult[]; counts: { FAIL: number } };
    expect(parsed.counts.FAIL).toBe(1);
    expect(parsed.results[0].findings.some((f) => f.id === 'V61')).toBe(true);
    const f = cli(root, '--file', join(tmp, 'clean.glb'), '--id', 'synth_part', '--summary');
    expect(f.status).toBe(0);
    expect(f.stdout).toMatch(/PASS\s+synth_part/);
  });

  it('exits 2 on a bad argument', () => {
    expect(run(proc.execPath, [join(proc.cwd(), 'tools/validate-glb.mjs'), '--nope']).status).toBe(2);
  });
});
