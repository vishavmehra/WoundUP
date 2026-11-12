import { AssetType, defineAssets } from '@iwsdk/core';

// Shared by the app runtime and the IWSDK editor (two JS realms): keep this file pure and deterministic.
// Models are authored in Blender (blender/scripts/*.py -> blender/source/*.blend) and exported to public/assets/models.
const model = (path: string): string => `${import.meta.env.BASE_URL}assets/models/${path}`;

export default defineAssets({
  'tockton-base-round': {
    url: model('environment/tockton_base_round.glb'),
    type: AssetType.GLTF,
    name: 'Tockton velvet stand',
    priority: 'critical',
  },
  // Library profile (ADR-032): constants-only proxy material, swapped for the shared Mat_AgedBrass at startup.
  gear_spur_16_m1: {
    url: model('shared/spur_gear/gear_spur_16_m1.glb'),
    type: AssetType.GLTF,
    name: 'Brass spur gear, 16 teeth, module m1',
    priority: 'critical',
  },
});
