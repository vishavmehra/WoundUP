/**
 * The workshop lantern (TOCKTON_DIMENSIONS §5.2): `lantern_workbench.glb` on the workbench, in the blueprint zone's front outer
 * corner, in the strip that holds only non-essential detail (the front 6 cm). The glass is `Mat_WarmGlass` and the core
 * `Mat_WarmEmissive`, so it glows warm without a light. It is a child of the bench root, so it slides in, hides and never scales
 * with the bench.
 */
import { Box3, Vector3 } from '@iwsdk/core';
import type { Object3D } from '@iwsdk/core';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import type { ModelSource } from './scene';

export const LANTERN_MODEL_PATH = 'tockton/workshop/lantern_workbench.glb';
/** Bench-local metres (origin at the bench's floor-contact centre, bench top 3 cm): blueprint zone x 9.75 to 21.75, z -10.5 to +10.5 cm, 0.75 cm in from the front outer corner. */
export const LANTERN_AT = { x: 0.196, y: 0.03, z: 0.085 } as const;
/** The approved size of the lantern is 3 x 6 x 3 cm (TOCKTON_DIMENSIONS §11); the file is scaled to that height. */
export const LANTERN_HEIGHT_M = 0.06;

/** Loads the lantern onto `bench`. Returns it, or null (with a warning) when it cannot load: the workshop plays without it. */
export async function addWorkshopLantern(bench: Object3D, source: ModelSource, registry: MaterialRegistry): Promise<Object3D | null> {
  try {
    const model = await source(LANTERN_MODEL_PATH);
    applyLibraryMaterials(model.scene, registry);
    const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
    if (size.y > 0) model.scene.scale.setScalar(LANTERN_HEIGHT_M / size.y);
    model.scene.position.set(LANTERN_AT.x, LANTERN_AT.y, LANTERN_AT.z);
    model.scene.name = 'WorkshopLantern';
    bench.add(model.scene);
    return model.scene;
  } catch (error) {
    console.warn('[wound-up] The workshop lantern did not load.', error);
    return null;
  }
}
