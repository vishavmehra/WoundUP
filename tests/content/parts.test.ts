import { describe, expect, it } from 'vitest';
import {
  FINISH_SUFFIX,
  getPart,
  hasPart,
  MODEL_PATHS,
  modelUrl,
  PART_DEFINITIONS,
  partIdsForAsset,
  partIdsOfFamily,
  requirePart,
  SOLVER_CATALOGUE,
  SPRING_ANGULAR_VELOCITY,
  STANDARD_DRAIN_RATE,
  STANDARD_ENERGY_PER_UNIT,
  WORN_DRAIN_RATE,
  WORN_ENERGY_PER_UNIT,
} from '../../src/content/parts';
import { MIN_GRAB_RADIUS_M } from '../../src/interaction/glb-reader';
import { MAX_WIND_UNITS, springRunSeconds, WORN_SPRING_ENERGY_FRACTION } from '../../src/sim';
import { REPAIRS } from '../../src/game/content';

// No @types/node (tsconfig lists only the IWSDK client types) but Vitest runs in Node: reach fs through a typed shim.
interface NodeFs {
  readFileSync(path: URL): Uint8Array;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const readJson = (p: string): unknown => JSON.parse(new TextDecoder().decode(fs.readFileSync(new URL(`../../${p}`, import.meta.url))));

interface ManifestAsset {
  id: string;
  glbPath: string;
  materials: string[];
}
const manifest = readJson('assets/manifest/glb-manifest.json') as { assets: ManifestAsset[] };
const library = readJson('public/assets/materials/library.json') as { materials: Record<string, unknown> };

describe('part catalogue', () => {
  it('has unique ids of the form <asset id>_<finish word> that the gift codec accepts', () => {
    const ids = PART_DEFINITIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PART_DEFINITIONS) {
      expect(p.id).toBe(`${p.visual.assetId}_${FINISH_SUFFIX[p.visual.finish]}`);
      expect(p.id).toMatch(/^[a-z0-9_]{1,64}$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.visual.scale).toBe(1);
    }
  });

  it('keeps the ids the game core already persists', () => {
    for (const repair of Object.values(REPAIRS)) {
      expect(hasPart(repair.faultyPartId)).toBe(true);
      expect(hasPart(repair.correctPartId)).toBe(true);
    }
  });

  it('answers only for its own ids', () => {
    expect(getPart('spring_worn_brass')?.family).toBe('spring');
    expect(getPart('constructor')).toBeUndefined();
    expect(getPart('__proto__')).toBeUndefined();
    expect(() => requirePart('nope')).toThrow('unknown part id "nope"');
    expect(partIdsForAsset('spring_worn')).toEqual(['spring_worn_brass']);
    expect(partIdsForAsset('nope')).toEqual([]);
    expect(partIdsOfFamily('spur_gear')).toHaveLength(5);
  });

  it('names a GLB file for every part and for each machine housing, and the manifest agrees where the file is', () => {
    const byId = new Map(manifest.assets.map((a) => [a.id, a] as const));
    for (const p of PART_DEFINITIONS) expect(MODEL_PATHS[p.visual.assetId], p.id).toBeDefined();
    for (const [assetId, path] of Object.entries(MODEL_PATHS)) {
      const entry = byId.get(assetId);
      expect(entry, assetId).toBeDefined();
      expect(entry?.glbPath).toBe(`public/assets/models/${path}`);
    }
    expect(modelUrl('gear_spur_20_m1')).toBe('/assets/models/shared/spur_gear/gear_spur_20_m1.glb');
    expect(modelUrl('constructor')).toBeUndefined();
    expect(modelUrl('nope')).toBeUndefined();
  });

  it('uses finishes that are library materials, the dominant material of the GLB per the manifest', () => {
    const byId = new Map(manifest.assets.map((a) => [a.id, a] as const));
    for (const p of PART_DEFINITIONS) {
      expect(Object.keys(library.materials), p.id).toContain(p.visual.finish);
      expect(byId.get(p.visual.assetId)?.materials[0], p.id).toBe(p.visual.finish);
    }
  });

  it('gives every gear its tooth count and one module token, so meshes agree unless a different token is authored', () => {
    for (const p of PART_DEFINITIONS.filter((x) => x.family === 'spur_gear')) {
      expect(p.mechanical?.toothCount).toBe(Number(/gear_spur_(\d+)_m1/.exec(p.id)?.[1]));
      expect(p.mechanical?.module).toBe(1);
    }
    expect(requirePart('gear_bevel_12_brass').mechanical).toEqual({ toothCount: 12, module: 1 });
  });

  it('carries mechanical data only on the parts that turn the train: gears and springs', () => {
    for (const p of PART_DEFINITIONS) {
      expect(p.mechanical !== undefined, p.id).toBe(p.family === 'spur_gear' || p.family === 'bevel_gear' || p.family === 'spring');
    }
  });

  it('grabs with a collider of at least the 1.2 cm minimum, or not at all', () => {
    for (const p of PART_DEFINITIONS) {
      if (p.grab.enabled) expect(p.grab.colliderRadius, p.id).toBeGreaterThanOrEqual(MIN_GRAB_RADIUS_M);
      else expect(p.grab.colliderRadius, p.id).toBe(0);
    }
  });

  it('hands the solver the definitions themselves', () => {
    expect(Object.keys(SOLVER_CATALOGUE).sort()).toEqual(PART_DEFINITIONS.map((p) => p.id).sort());
    expect(SOLVER_CATALOGUE.spring_standard_brass).toBe(requirePart('spring_standard_brass'));
  });
});

describe('springs (MUSIC_BOX_BLUEPRINT §4.2)', () => {
  const standard = requirePart('spring_standard_brass').mechanical!;
  const worn = requirePart('spring_worn_brass').mechanical!;

  it('turn the arbor at 0.8 rad/s', () => {
    expect(standard.angularVelocity).toBe(SPRING_ANGULAR_VELOCITY);
    expect(worn.angularVelocity).toBe(SPRING_ANGULAR_VELOCITY);
    expect(SPRING_ANGULAR_VELOCITY).toBe(0.8);
  });

  it('store 15 percent of the energy per unit when worn', () => {
    expect(standard.energyPerUnit).toBe(STANDARD_ENERGY_PER_UNIT);
    expect(worn.energyPerUnit).toBe(WORN_ENERGY_PER_UNIT);
    expect(worn.energyPerUnit! / standard.energyPerUnit!).toBeCloseTo(WORN_SPRING_ENERGY_FRACTION, 12);
  });

  it('run 15.708 s (one cylinder turn at 0.4 rad/s) when standard and 1.5 s when worn, at eight units', () => {
    expect(springRunSeconds(MAX_WIND_UNITS, standard.energyPerUnit!, standard.drainRate!)).toBeCloseTo((2 * Math.PI) / 0.4, 9);
    expect(springRunSeconds(MAX_WIND_UNITS, worn.energyPerUnit!, worn.drainRate!)).toBeCloseTo(1.5, 12);
    expect(standard.drainRate).toBe(STANDARD_DRAIN_RATE);
    expect(worn.drainRate).toBe(WORN_DRAIN_RATE);
    expect(WORN_DRAIN_RATE).toBeGreaterThan(STANDARD_DRAIN_RATE);
  });
});
