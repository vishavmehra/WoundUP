/**
 * Builds Tockton's scenery under one `town` group: the ground with its four plot sockets, the Bakery with Otto at its baker
 * socket, the theatre facade and Mira (TOCKTON_DIMENSIONS §3.3, §7). Pure scene-graph work on loaded models, so Node tests can
 * run it on real GLBs; the app's loader is `loadModel`.
 */
import { AnimationMixer, AssetManager, Group } from '@iwsdk/core';
import type { AnimationAction, AnimationClip, Object3D } from '@iwsdk/core';
import type { MaterialRegistry } from '../materials';
import { applyLibraryMaterials } from '../materials';
import { TOWN_NODE_ID } from '../stage';
import { BAKER_SOCKET, BAKERY_AT, MIRA_AT, THEATRE_AT } from './layout';

/** A loaded GLB: its scene graph and animation clips. */
export interface TownModel {
  scene: Object3D;
  animations: readonly AnimationClip[];
}

/** Returns a fresh instance of the GLB at `path` (relative to `assets/models/`) each time it is called. */
export type ModelSource = (path: string) => Promise<TownModel>;

export const KNEAD_CLIP = 'Otto_Knead';

export const TOWN_MODEL_PATHS = {
  ground: 'tockton/environment/town_ground.glb',
  bakery: 'tockton/bakery/bakery_building.glb',
  theatre: 'tockton/theatre/theatre_facade.glb',
  otto: 'tockton/characters/figure_otto.glb',
  mira: 'tockton/characters/figure_mira.glb',
} as const;

export interface Town {
  /** The `town` group (scene node id `TOWN_NODE_ID`); StageSystem scales it with the table placement. */
  readonly group: Group;
  readonly ground: Object3D;
  readonly bakery: Object3D;
  readonly theatre: Object3D;
  readonly otto: Object3D;
  readonly mira: Object3D;
  /** Otto's kneading on its own mixer, paused on its first frame while the Bakery is frozen. Null when the clip is missing. */
  readonly knead: { readonly mixer: AnimationMixer; readonly action: AnimationAction } | null;
}

/** The app's loader: IWSDK's AssetManager caches the file and hands out a clone (shared geometry and materials) per call. */
export const loadModel: ModelSource = async (path) => {
  const url = `${import.meta.env.BASE_URL}assets/models/${path}`;
  const key = `wu-model-${path}`;
  await AssetManager.loadGLTF(url, key);
  const gltf = AssetManager.getGLTF(key);
  if (!gltf) throw new Error(`model ${path} did not load`);
  return { scene: gltf.scene, animations: gltf.animations };
};

/** Loads and assembles the town. `source` is `loadModel` in the app. */
export async function loadTown(source: ModelSource, registry: MaterialRegistry): Promise<Town> {
  const [ground, bakery, theatre, otto, mira] = await Promise.all(
    Object.values(TOWN_MODEL_PATHS).map((path) => source(path)),
  );
  return buildTown({ ground, bakery, theatre, otto, mira }, registry);
}

export function buildTown(
  models: { ground: TownModel; bakery: TownModel; theatre: TownModel; otto: TownModel; mira: TownModel },
  registry: MaterialRegistry,
): Town {
  for (const model of Object.values(models)) applyLibraryMaterials(model.scene, registry);

  const group = new Group();
  group.name = 'Tockton';
  group.userData.iwsdkSceneNodeId = TOWN_NODE_ID;

  const ground = models.ground.scene;
  const bakery = models.bakery.scene;
  const theatre = models.theatre.scene;
  const otto = models.otto.scene;
  const mira = models.mira.scene;

  bakery.position.set(BAKERY_AT.x, 0, BAKERY_AT.z);
  theatre.position.set(THEATRE_AT.x, 0, THEATRE_AT.z);
  mira.position.set(MIRA_AT.x, MIRA_AT.y, MIRA_AT.z);

  // Otto's feet are at the Bakery's baker socket, in the Bakery's own frame, facing +Z.
  const socket = bakery.getObjectByName(BAKER_SOCKET);
  if (socket) {
    otto.position.copy(socket.position);
    otto.quaternion.copy(socket.quaternion);
    bakery.add(otto);
  } else {
    console.warn(`[wound-up] ${BAKER_SOCKET} is missing from the Bakery; Otto stands at the Bakery's origin.`);
    otto.position.set(-0.045, 0.004, 0.0275); // where bakery_building.glb puts it (TOCKTON_DIMENSIONS §11)
    bakery.add(otto);
  }

  group.add(ground, bakery, theatre, mira);

  const clip = models.otto.animations.find((c) => c.name === KNEAD_CLIP);
  let knead: Town['knead'] = null;
  if (clip) {
    const mixer = new AnimationMixer(otto);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true; // frozen on the first frame until the Windmill wakes the Bakery
    knead = { mixer, action };
  }
  return { group, ground, bakery, theatre, otto, mira, knead };
}
