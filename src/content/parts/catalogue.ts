// The part catalogue (DATA_AND_BLUEPRINT_SPEC §4): one definition per part the three G0 machines use and whose GLB exists.
// Part ids are `<asset id>_<finish word>` (DATA §4.1; the game core already persists `spring_worn_brass` and
// `gear_spur_12_m1_brass`). Mechanical values are the solver's input (SOLVER §5); everything else is presentation data.

import { WORN_SPRING_ENERGY_FRACTION } from '../../sim';
import type { PartCatalogue, PartMechanics } from '../../sim';
import { FINISH_SUFFIX } from './types';
import type { FinishName, PartDefinition, PartFamily } from './types';

// ---- Mechanical constants ----------------------------------------------------------------------------------------------

/**
 * Gear module as a token, not millimetres: every `m1` gear has module 1, so two gears mesh when their tokens match and a
 * different token jams (SOLVER §8.2). The real module (2.5 mm, owner decision 5 still pending) is only the Blender generator's
 * business, so settling that decision changes no number here. Bevel gears take the same token: they only mesh with each other.
 */
export const GEAR_MODULE_TOKEN = 1;

/** Spring output speed, rad/s: one shared value for the Music Box (10T to 20T) and the Carousel (10T to 16T). MUSIC_BOX_BLUEPRINT §3.2. */
export const SPRING_ANGULAR_VELOCITY = 0.8;
/** Energy per wind unit of the standard spring, arbitrary units (only ratios matter, MUSIC_BOX_BLUEPRINT §4.2). */
export const STANDARD_ENERGY_PER_UNIT = 0.1;
/** The worn spring stores about 15 percent per unit (SOLVER §12.1). */
export const WORN_ENERGY_PER_UNIT = STANDARD_ENERGY_PER_UNIT * WORN_SPRING_ENERGY_FRACTION;
/**
 * Drain rate of the standard spring: one wind unit is a quarter turn of the arbor (pi/2 rad), released at the spring speed, so
 * eight units run exactly one cylinder turn, 15.708 s (MUSIC_BOX_BLUEPRINT §4.2, option B).
 */
export const STANDARD_DRAIN_RATE = (STANDARD_ENERGY_PER_UNIT * SPRING_ANGULAR_VELOCITY) / (Math.PI / 2);
/** The worn spring drains pi/2 times faster (MUSIC_BOX_BLUEPRINT §4.2): 8 * 0.015 / 0.08 = 1.5 s at full wind (PRODUCT_SPEC §8). */
export const WORN_DRAIN_RATE = STANDARD_ENERGY_PER_UNIT * SPRING_ANGULAR_VELOCITY;

// ---- Definitions -------------------------------------------------------------------------------------------------------

/** `grab`: the GLB's COL_Grab radius in metres, or null when the GLB has none (checked against the files by tests/content/glb-contract.test.ts). */
function part(
  assetId: string,
  finish: FinishName,
  family: PartFamily,
  name: string,
  grab: number | null,
  mechanical?: PartMechanics,
): PartDefinition {
  return {
    id: `${assetId}_${FINISH_SUFFIX[finish]}`,
    name,
    family,
    ...(mechanical === undefined ? {} : { mechanical }),
    visual: { assetId, finish, scale: 1 },
    grab: grab === null ? { enabled: false, colliderRadius: 0 } : { enabled: true, colliderRadius: grab },
  };
}

const spurGear = (teeth: number, grab: number): PartDefinition =>
  part(`gear_spur_${teeth}_m1`, 'Mat_AgedBrass', 'spur_gear', `Brass spur gear, ${teeth} teeth`, grab, {
    toothCount: teeth,
    module: GEAR_MODULE_TOKEN,
  });

const spring = (kind: 'standard' | 'worn', energyPerUnit: number, drainRate: number): PartDefinition =>
  part(`spring_${kind}`, 'Mat_AgedBrass', 'spring', `${kind === 'worn' ? 'Worn' : 'Standard'} mainspring`, 0.0225, {
    angularVelocity: SPRING_ANGULAR_VELOCITY,
    energyPerUnit,
    drainRate,
  });

export const PART_DEFINITIONS: readonly PartDefinition[] = Object.freeze([
  spurGear(10, 0.0212),
  spurGear(12, 0.0248),
  spurGear(16, 0.032),
  spurGear(20, 0.0392),
  spurGear(24, 0.0465),
  part('gear_bevel_12', 'Mat_AgedBrass', 'bevel_gear', 'Brass bevel gear, 12 teeth', 0.0239, { toothCount: 12, module: GEAR_MODULE_TOKEN }),
  part('shaft_short', 'Mat_AgedBrass', 'shaft', 'Short brass shaft', 0.012),
  part('shaft_long', 'Mat_AgedBrass', 'shaft', 'Long brass shaft', 0.012),
  spring('standard', STANDARD_ENERGY_PER_UNIT, STANDARD_DRAIN_RATE),
  spring('worn', WORN_ENERGY_PER_UNIT, WORN_DRAIN_RATE),
  part('governor_standard', 'Mat_AgedBrass', 'governor', 'Governor', 0.012),
  part('winding_key', 'Mat_PolishedBrass', 'winding_key', 'Winding key', 0.018),
  part('bearing_pillow_block', 'Mat_AgedBrass', 'structural', 'Bearing block', 0.012),
  part('bracket_support', 'Mat_AgedBrass', 'structural', 'Support bracket', 0.012),
  part('cylinder_music_box', 'Mat_AgedBrass', 'cylinder', 'Music box cylinder', 0.02),
  part('comb_music_box', 'Mat_PolishedBrass', 'comb', 'Music box comb', 0.012),
  // Carousel pieces. Platform, canopy, column and lamp have no COL_Grab in their GLBs yet (asset gap): placed by the game.
  part('carousel_platform', 'Mat_Walnut', 'structural', 'Carousel platform', null),
  part('carousel_horse', 'Mat_PaintedWood', 'follower', 'Carousel horse', 0.015),
  part('carousel_canopy', 'Mat_PaintedWood', 'structural', 'Carousel canopy', null),
  part('carousel_lamp', 'Mat_PolishedBrass', 'structural', 'Carousel lamp', null),
  part('carousel_column', 'Mat_Walnut', 'structural', 'Carousel column', null),
  // Windmill pieces. The tower has no COL_Grab yet.
  part('windmill_sails', 'Mat_Walnut', 'structural', 'Windmill sails', 0.025),
  part('windmill_millstone', 'Mat_Stone', 'structural', 'Millstone', 0.025),
  part('windmill_tower', 'Mat_PaintedWood', 'structural', 'Windmill tower', null),
]);

const byId: ReadonlyMap<string, PartDefinition> = new Map(PART_DEFINITIONS.map((p) => [p.id, p] as const));

/** Always a Map lookup: ids come from saves and URLs, and a plain-object lookup would answer for `constructor`. */
export const getPart = (partId: string): PartDefinition | undefined => byId.get(partId);

export function requirePart(partId: string): PartDefinition {
  const found = byId.get(partId);
  if (!found) throw new Error(`unknown part id "${partId}"`);
  return found;
}

export const hasPart = (partId: string): boolean => byId.has(partId);

/** Part ids that use this GLB (one today: a finish is a runtime material, ADR-030). Empty for an unknown asset id. */
export function partIdsForAsset(assetId: string): readonly string[] {
  return PART_DEFINITIONS.filter((p) => p.visual.assetId === assetId).map((p) => p.id);
}

export const partIdsOfFamily = (family: PartFamily): readonly string[] => PART_DEFINITIONS.filter((p) => p.family === family).map((p) => p.id);

/** The solver's part catalogue (SOLVER §5): the definitions themselves, whose `mechanical` field is what it reads. */
export const SOLVER_CATALOGUE: PartCatalogue = Object.fromEntries(PART_DEFINITIONS.map((p) => [p.id, p] as const));
