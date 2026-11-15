import { describe, expect, it } from 'vitest';
import { STARTUP_MODELS } from '../src/preload';
import { DRESSING_MODEL_PATHS } from '../src/town/dressing-table';
import { TOWN_MODEL_PATHS } from '../src/town/scene';
import { LANTERN_MODEL_PATH } from '../src/town/workshop';

// @types/node is not installed (tsconfig lists no node types) but Vitest runs in Node: reach fs through a typed shim.
interface NodeFs {
  readFileSync(path: URL): Uint8Array<ArrayBuffer>;
  existsSync(path: URL): boolean;
}
const fs = (await import('node:fs' as string)) as NodeFs;
const repo = (p: string): URL => new URL(`../${p}`, import.meta.url);

/** The GLBs the flow UI loads when it installs (its `GLB` table), read from the source so a new entry fails this test. */
const flowUiGlbs = (): string[] => {
  const source = new TextDecoder().decode(fs.readFileSync(repo('src/ui/flow-ui.ts')));
  const table = /const GLB = \{([^}]*)\} as const;/.exec(source)?.[1] ?? '';
  return [...table.matchAll(/'([^']+\.glb)'/g)].map((m) => m[1]);
};

describe('STARTUP_MODELS (src/preload.ts)', () => {
  it('names files that exist, once each', () => {
    for (const path of STARTUP_MODELS) expect(fs.existsSync(repo(`public/assets/models/${path}`)), path).toBe(true);
    expect(new Set(STARTUP_MODELS).size).toBe(STARTUP_MODELS.length);
  });

  it('is every GLB the game page loads before it is usable, so none is fetched late and none is fetched for nothing', () => {
    const stand = 'tockton/environment/tockton_base_round.glb'; // IWSDK's critical asset (src/assets.ts), loaded inside World.create
    const wanted = [
      ...Object.values(TOWN_MODEL_PATHS),
      ...Object.values(DRESSING_MODEL_PATHS),
      ...flowUiGlbs(),
      LANTERN_MODEL_PATH,
    ].filter((p) => p !== stand);
    expect(flowUiGlbs().length).toBeGreaterThan(0);
    expect([...STARTUP_MODELS].sort()).toEqual([...new Set(wanted)].sort());
  });
});
