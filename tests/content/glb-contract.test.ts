import { describe, expect, it } from 'vitest';
import { BLUEPRINTS, MUSIC_BOX } from '../../src/content/blueprints';
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

  it('music box case: the 12 slot empties are the 12 blueprint sockets, with the same slot ids', () => {
    const empties = socketsOf('music_box_case');
    const slotEmpties = [...empties].filter(([name]) => name !== 'BaseHandle');
    expect(slotEmpties).toHaveLength(12);
    for (const [name, wu] of slotEmpties) {
      const s = MUSIC_BOX.sockets.find((x) => x.node === name);
      expect(s, `SOCKET_${name} is not a blueprint socket`).toBeDefined();
      expect(wu.slot, name).toBe(s?.id);
      expect(wu.dependsOn, name).toEqual(s?.dependencies ?? []);
    }
  });

  it('music box case: the X-ray zone is the case collider', () => {
    const col = readGlb('tockton/music_box/music_box_case.glb').nodes?.find((n) => n.name === 'COL_Case');
    const half = col?.extras?.wu?.halfExtents as number[];
    expect(MUSIC_BOX.housing.xray.radius).toBeCloseTo(Math.max(half[0], half[2]), 9);
    expect(MUSIC_BOX.housing.xray.top).toBeCloseTo(2 * half[1], 9);
  });
});
