import { describe, expect, it } from 'vitest';
import { MODEL_PATHS, modelPath, modelUrl, PENDING_MODEL_PATHS } from '../../src/content/parts';

// The Belfry's GLBs (ADR-048) are listed as pending until the asset agents deliver them into public/assets/models/. A file that
// is there but still listed would be skipped by every suite that reads the real files, so this fails until its line moves into MODEL_PATHS.
interface NodeFs {
  existsSync(path: string | URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const fileOf = (relative: string): string | URL => (env.WU_MODELS_DIR ? `${env.WU_MODELS_DIR}/${relative}` : new URL(`../../public/assets/models/${relative}`, import.meta.url));

describe('pending model paths (ADR-048)', () => {
  it('names the Belfry files that are not delivered yet, none of them in MODEL_PATHS', () => {
    expect(Object.keys(PENDING_MODEL_PATHS).sort()).toEqual(['belfry_base', 'belfry_vane']);
    for (const id of Object.keys(PENDING_MODEL_PATHS)) expect(MODEL_PATHS, id).not.toHaveProperty(id);
  });

  it('answers modelPath and modelUrl for a pending asset exactly as for a delivered one, and only for ids it knows', () => {
    expect(modelPath('well_base')).toBe('tockton/well/well_base.glb'); // delivered
    expect(modelPath('belfry_base')).toBe('tockton/belfry/belfry_base.glb'); // pending
    expect(modelPath('gear_spur_20_m1')).toBe('shared/spur_gear/gear_spur_20_m1.glb');
    expect(modelUrl('belfry_vane')).toMatch(/assets\/models\/tockton\/belfry\/belfry_vane\.glb$/);
    for (const unknown of ['nope', 'constructor', '__proto__', 'toString']) {
      expect(modelPath(unknown), unknown).toBeUndefined();
      expect(modelUrl(unknown), unknown).toBeUndefined();
    }
  });

  it('lists no file that exists: a delivered GLB moves into MODEL_PATHS', () => {
    const arrived = Object.entries(PENDING_MODEL_PATHS).filter(([, path]) => fs.existsSync(fileOf(path)));
    expect(arrived, 'these GLBs are in public/assets/models now: move their lines from PENDING_MODEL_PATHS into MODEL_PATHS').toEqual([]);
  });
});
