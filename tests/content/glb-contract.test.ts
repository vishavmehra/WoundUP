import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, MUSIC_BOX, WINDMILL } from '../../src/content/blueprints';
import { MODEL_PATHS, PART_DEFINITIONS, requirePart } from '../../src/content/parts';

// The data in src/content against the GLB files it describes: collider radii, socket empties, material names.
// The GLBs of the mechanical library and the machines are built by the asset agents and may be missing from a checkout (they
// are not all committed yet), so this suite runs only when every file named in MODEL_PATHS is present. Point it at another
// folder with WU_MODELS_DIR=<absolute path of a public/assets/models folder>.

interface NodeFs {
  readFileSync(path: string | URL): Uint8Array;
  existsSync(path: string | URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));

interface GltfNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  extras?: { wu?: Record<string, unknown> };
}
interface Gltf {
  nodes?: GltfNode[];
  materials?: { name?: string }[];
}
function readGlb(relative: string): Gltf {
  const bytes = fs.readFileSync(fileOf(relative));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true)))) as Gltf;
}

const missing = Object.entries(MODEL_PATHS).filter(([, path]) => !fs.existsSync(fileOf(path))).map(([id]) => id);
if (missing.length > 0) console.warn(`[glb-contract] skipped, ${missing.length} GLBs missing here: ${missing.join(', ')}`);

const library = JSON.parse(new TextDecoder().decode(fs.readFileSync(new URL('../../public/assets/materials/library.json', import.meta.url)))) as {
  materials: Record<string, unknown>;
};

/** The `SOCKET_` empties of a GLB: name without the prefix, and its `wu` data. */
function socketsOf(assetId: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const n of readGlb(MODEL_PATHS[assetId]).nodes ?? []) if (n.name?.startsWith('SOCKET_')) out.set(n.name.slice(7), n.extras?.wu ?? {});
  return out;
}

describe.skipIf(missing.length > 0)('the GLBs the catalogue and blueprints describe', () => {
  it('give every grabbable part a COL_Grab whose radius is the part definition colliderRadius, and no collider otherwise', () => {
    for (const p of PART_DEFINITIONS) {
      const node = readGlb(MODEL_PATHS[p.visual.assetId]).nodes?.find((n) => n.name === 'COL_Grab');
      if (!p.grab.enabled) {
        expect(node, `${p.id} has a COL_Grab but its definition says it cannot be grabbed`).toBeUndefined();
        continue;
      }
      expect(node, `${p.id} has no COL_Grab`).toBeDefined();
      const wu = node?.extras?.wu ?? {};
      const half = (wu.halfExtents as number[] | undefined) ?? node?.scale ?? [];
      const radius = wu.shape === 'box' ? Math.min(...half) : ((wu.radius as number | undefined) ?? (node?.scale?.[0] as number));
      expect(radius, p.id).toBeCloseTo(p.grab.colliderRadius, 9);
    }
  });

  it('only use materials of the shared library, so applyLibraryMaterials leaves none behind', () => {
    for (const [assetId, path] of Object.entries(MODEL_PATHS)) {
      for (const m of readGlb(path).materials ?? []) expect(Object.keys(library.materials), `${assetId}: ${m.name}`).toContain(m.name);
    }
  });

  it.each(BLUEPRINTS.map((b) => [b.id, b] as const))('%s: every socket node exists in the housing or an intended part, and takes what the blueprint accepts', (_id, bp) => {
    const hosts = [bp.housing.assetId, ...new Set(Object.values(bp.intended).map((id) => requirePart(id).visual.assetId))];
    const empties = new Map<string, Record<string, unknown>>();
    for (const host of hosts) for (const [name, wu] of socketsOf(host)) empties.set(name, wu);
    for (const s of bp.sockets) {
      if (s.node === undefined) continue;
      const wu = empties.get(s.node);
      expect(wu, `${bp.id}.${s.id}: no SOCKET_${s.node}`).toBeDefined();
      const accepts = (wu?.accepts as string[] | undefined) ?? [];
      for (const partId of s.acceptedPartIds ?? []) {
        const part = requirePart(partId);
        expect(accepts.includes(part.visual.assetId) || accepts.includes(part.family), `${bp.id}.${s.id} does not accept ${partId} in the GLB (${accepts.join(', ')})`).toBe(true);
      }
    }
  });

  it('music box case: its slot empties are blueprint sockets with the same slot ids: the 12 big parts, and the spring anchor once the hardware is in (ADR-050)', () => {
    const empties = socketsOf('music_box_case');
    const slotEmpties = [...empties].filter(([name]) => name !== 'BaseHandle');
    expect(slotEmpties.length).toBeGreaterThanOrEqual(12);
    expect(slotEmpties.length).toBeLessThanOrEqual(13); // + SpringAnchor (INTRICATE_ASSEMBLY_DESIGN §11.2)
    for (const [name, wu] of slotEmpties) {
      const s = MUSIC_BOX.sockets.find((x) => x.node === name && (x.family !== 'fastener' || x.carrier === undefined));
      expect(s, `SOCKET_${name} is not a blueprint socket of the case`).toBeDefined();
      expect(wu.slot, name).toBe(s?.id);
      // `dependsOn` is what the case was authored with; the blueprint adds the hardware under it (the bushes under the arbor, the anchor under the spring)
      expect(s?.dependencies ?? [], name).toEqual(expect.arrayContaining((wu.dependsOn as string[] | undefined) ?? []));
    }
  });

  it('windmill base: the blueprint poses of its four housing sockets are the empties in the GLB, and the two gears are 46.0 mm apart', () => {
    const nodes = readGlb(MODEL_PATHS.windmill_base).nodes ?? [];
    const posed = WINDMILL.sockets.filter((s) => s.position !== undefined);
    expect(posed.map((s) => s.id).sort()).toEqual(['gear_24', 'millstone', 'pinion', 'tower']);
    for (const s of posed) {
      const node = nodes.find((n) => n.name === `SOCKET_${s.node}`);
      expect(node, `SOCKET_${s.node}`).toBeDefined();
      s.position!.forEach((v, k) => expect(node!.translation![k], `${s.id} position ${k}`).toBeCloseTo(v, 6)); // 1 um: the GLB stores float32
      const q = node!.rotation ?? [0, 0, 0, 1];
      expect(Math.abs(q.reduce((sum, v, k) => sum + v * s.rotation![k], 0)), `${s.id} rotation`).toBeGreaterThan(1 - 1e-8);
    }
    const at = (id: string): number[] => posed.find((s) => s.id === id)!.position as unknown as number[];
    expect(Math.hypot(at('gear_24')[0] - at('pinion')[0], at('gear_24')[2] - at('pinion')[2])).toBeCloseTo(0.046, 9); // 2.5 mm x (12 + 24) / 2 + 1.0 mm
    expect(at('gear_24')[1]).toBe(at('pinion')[1]); // one plane, so the pair meshes
    expect(at('gear_24')[2]).toBe(at('millstone')[2]); // the 24T and the millstone share a spindle
  });

  it('music box case: the X-ray zone is the case collider', () => {
    const col = readGlb('tockton/music_box/music_box_case.glb').nodes?.find((n) => n.name === 'COL_Case');
    const half = col?.extras?.wu?.halfExtents as number[];
    expect(MUSIC_BOX.housing.xray.radius).toBeCloseTo(Math.max(half[0], half[2]), 9);
    expect(MUSIC_BOX.housing.xray.top).toBeCloseTo(2 * half[1], 9);
  });
});
