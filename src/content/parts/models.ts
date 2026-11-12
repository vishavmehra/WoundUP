// Where each GLB lives, by asset id (ADR-033 folders, manifest `glbPath` without the `public/assets/models/` prefix).
// Kept here, not in src/assets.ts: that file is the critical-start manifest of the app entry (Agent 0); these are loaded on
// demand by `src/parts/loader.ts`. Only files that exist on disk are listed; a test checks them against the manifest.

export const MODEL_PATHS: Readonly<Record<string, string>> = {
  // shared mechanical library (Family A) and Music Box parts (Family C)
  gear_spur_10_m1: 'shared/spur_gear/gear_spur_10_m1.glb',
  gear_spur_12_m1: 'shared/spur_gear/gear_spur_12_m1.glb',
  gear_spur_16_m1: 'shared/spur_gear/gear_spur_16_m1.glb',
  gear_spur_20_m1: 'shared/spur_gear/gear_spur_20_m1.glb',
  gear_spur_24_m1: 'shared/spur_gear/gear_spur_24_m1.glb',
  gear_bevel_12: 'shared/bevel_gear/gear_bevel_12.glb',
  shaft_short: 'shared/shaft/shaft_short.glb',
  shaft_long: 'shared/shaft/shaft_long.glb',
  spring_standard: 'shared/spring/spring_standard.glb',
  spring_worn: 'shared/spring/spring_worn.glb',
  governor_standard: 'shared/governor/governor_standard.glb',
  winding_key: 'shared/winding_key/winding_key.glb',
  bearing_pillow_block: 'shared/structural/bearing_pillow_block.glb',
  bracket_support: 'shared/structural/bracket_support.glb',
  cylinder_music_box: 'shared/cylinder/cylinder_music_box.glb',
  comb_music_box: 'shared/comb/comb_music_box.glb',
  // Tockton machines (Families C to E): housings and their own pieces
  music_box_case: 'tockton/music_box/music_box_case.glb',
  carousel_base: 'tockton/carousel/carousel_base.glb',
  carousel_platform: 'tockton/carousel/carousel_platform.glb',
  carousel_horse: 'tockton/carousel/carousel_horse.glb',
  carousel_canopy: 'tockton/carousel/carousel_canopy.glb',
  carousel_lamp: 'tockton/carousel/carousel_lamp.glb',
  carousel_column: 'tockton/carousel/carousel_column.glb',
  windmill_base: 'tockton/windmill/windmill_base.glb',
  windmill_tower: 'tockton/windmill/windmill_tower.glb',
  windmill_sails: 'tockton/windmill/windmill_sails.glb',
  windmill_millstone: 'tockton/windmill/windmill_millstone.glb',
};

/** URL of an asset's GLB under the app's base path, or undefined for an unknown asset id. */
export function modelUrl(assetId: string): string | undefined {
  const path = Object.prototype.hasOwnProperty.call(MODEL_PATHS, assetId) ? MODEL_PATHS[assetId] : undefined;
  return path === undefined ? undefined : `${import.meta.env.BASE_URL}assets/models/${path}`;
}
