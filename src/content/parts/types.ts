// Part definition contract (DATA_AND_BLUEPRINT_SPEC §4). Plain data: no Three.js, no IWSDK, nothing from a loaded model.
import type { PartMechanics } from '../../sim';

/**
 * DATA §4 families, plus `governor` and `winding_key`: the Music Box blueprint (MUSIC_BOX_BLUEPRINT §7.1, gap A-01) gives
 * both parts a family of their own and the case GLB already writes them (`partFamily`).
 */
export type PartFamily =
  | 'spur_gear'
  | 'bevel_gear'
  | 'belt'
  | 'pulley'
  | 'shaft'
  | 'spring'
  | 'crank'
  | 'cam'
  | 'follower'
  | 'escapement'
  | 'pendulum'
  | 'comb'
  | 'cylinder'
  | 'structural'
  | 'figure'
  | 'governor'
  | 'winding_key';

/**
 * A finish is a runtime material, never a file (ADR-030 item 2): `visual.finish` names a shared library material
 * (ADR-032, `public/assets/materials/library.json`). The word each one adds to a part id (DATA §4.1: `gear_spur_12_m1_brass`).
 */
export const FINISH_SUFFIX = {
  Mat_AgedBrass: 'brass',
  Mat_PolishedBrass: 'polished_brass',
  Mat_Walnut: 'walnut',
  Mat_PaintedWood: 'painted_wood',
  Mat_Stone: 'stone',
} as const;
export type FinishName = keyof typeof FINISH_SUFFIX;

export interface PartDefinition {
  /** Stable, persisted in saves and gift links: `<asset id>_<finish word>`. Never renamed (DATA §4.1). */
  readonly id: string;
  readonly name: string;
  readonly family: PartFamily;
  /** Values the solver reads (SOLVER §5). Absent for a part that carries no speed, ratio or energy. */
  readonly mechanical?: PartMechanics;
  readonly visual: {
    /** The GLB (manifest id, file name and `src/content/parts/models.ts` key). */
    readonly assetId: string;
    /** Library material name (ADR-030 item 2, ADR-032). The dominant material of the GLB; the GLB itself carries the `Mat_*` proxies. */
    readonly finish: FinishName;
    /** Uniform scale of the placed model. 1: the GLBs are authored at final size (ADR-020, metres). */
    readonly scale: number;
  };
  readonly grab: {
    /** False when the GLB has no `COL_Grab`, so nothing can be pinched: such a part is placed by the game, not by hand. */
    readonly enabled: boolean;
    /**
     * Radius of the part's `COL_Grab` in metres (what the interaction layer lifts to at least 1.2 cm). For a box collider the
     * smallest half-extent, which is the radius of the capsule INTERACTION_SPEC §7.2 and the Music Box blueprint ask for. 0 when disabled.
     */
    readonly colliderRadius: number;
  };
}
